import type { Device } from '../types.js'
import type { PatchSystemStatus, MissingPatch } from './endpointCentralPatch.js'
import { reconcileDevices, buildPatchIndex, type Reconciliation } from './deviceReconciler.js'
export { buildPatchIndex }

// Live Security Posture pillars. Every number is computed from the connected device inventory (and
// Patch Manager where available). A device whose source did not report a signal is counted as
// "not reported" — never as passing or failing — so a pillar's score only covers assessed devices.

export type PostureSource = 'all' | 'intune' | 'manageengine'
export type PillarId = 'encryption' | 'patching' | 'compliance' | 'checkin'

export interface PillarDevice {
  id: string
  deviceName: string
  user: string
  platform: Device['platform']
  source: Device['managementSource']
  serialNumber: string
  /** Outcome of this pillar's check for the device. */
  status: 'pass' | 'fail' | 'unknown'
  /** One-line finding. */
  detail: string
  /** Itemised findings (e.g. the missing critical patches), when the source provides them. */
  items?: string[]
  /** Labelled device facts shown in the detail view (OS, last contact, patch severity counts, …). */
  facts?: Array<{ label: string; value: string }>
  /** Patch Manager resource id of the device's Endpoint Central system, so the UI can load its patch list on demand. */
  patchResourceId?: string
}

export interface PillarBreakdownRow { key: string; assessed: number; passing: number; failing: number; notReported: number }

export interface PillarResult {
  id: PillarId
  label: string
  description: string
  /** Platforms/sources this pillar applies to. */
  scope: string
  weight: number
  inScope: number
  assessed: number
  passing: number
  failing: number
  notReported: number
  /** passing / assessed, 0..100, or null when nothing could be assessed. */
  scorePct: number | null
  unavailableReason?: string
  byPlatform: PillarBreakdownRow[]
  bySource: PillarBreakdownRow[]
  /** Most common itemised findings among failing devices (e.g. the critical patches missing on most devices). */
  topFindings: Array<{ label: string; devices: number }>
  /** Patch Manager systems that match no device in the inventory (e.g. agent-only machines) — not counted in any score. */
  unmatchedAgents?: { windows: number; macos: number }
}

export interface PostureResult {
  generatedAt: string
  source: PostureSource
  deviceCount: number
  sourceCounts: { intune: number; manageengine: number }
  pillars: PillarResult[]
  overall: { score: number | null; assessedPillars: number; totalPillars: number }
  /** Whether the second-source data behind the scores was available — drives the "partial data" banner. */
  /** Share of Windows / macOS devices that have an Endpoint Central agent record — rollout progress. null until Patch Manager data loads. */
  coverage: { windows: { devices: number; withAgent: number }; macos: { devices: number; withAgent: number }; history?: Array<{ date: string; windows: { devices: number; withAgent: number }; macos: { devices: number; withAgent: number } }> } | null
  enrichment: { patchLoaded: boolean; agentRowsLoaded: number; mdmDetailsStale: number; mdmDetailsUnread: number }
}

export const MAX_PAGE_SIZE = 5000
const TOP_FINDINGS = 5
/** Days since last contact that still counts as checked in. Setting POSTURE_CHECKIN_DAYS changes it without a code change. */
export function checkInDays(): number {
  const n = Number(process.env['POSTURE_CHECKIN_DAYS'])
  return Number.isFinite(n) && n >= 1 && n <= 365 ? Math.floor(n) : 7
}

/** How a device with two contact signals (MDM/Intune + Endpoint Central agent) is judged.
 *  either (default): fresh if EITHER has been in touch · both: BOTH must be fresh · mdm-only: ignore the agent. */
export type CheckInRule = 'either' | 'both' | 'mdm-only'
export function checkInRule(): CheckInRule {
  const v = (process.env['POSTURE_CHECKIN_RULE'] ?? '').trim().toLowerCase()
  return v === 'both' || v === 'mdm-only' ? v : 'either'
}

type Verdict = { status: 'pass' | 'fail' | 'unknown'; detail: string; items?: string[] }

interface PillarDef {
  id: PillarId
  label: string
  description: string
  scope: string
  weight: number
  applies: (d: Device) => boolean
  assess: (d: Device, ctx: Ctx) => Verdict
  unavailableReason?: (ctx: Ctx) => string | undefined
}

interface Ctx {
  /** Cross-source identity resolution (Intune ↔ Endpoint Central MDM/agent ↔ Patch Manager), built once per request. */
  rec: Reconciliation
  /** Whether Patch Manager data was loaded at all. */
  patchLoaded: boolean
  /** Missing critical patches per Patch Manager system (detailResourceId), when loaded. */
  criticalPatches: Map<string, MissingPatch[]> | null
  now: number
}

export function classifyEncryption(status: string | undefined): Verdict {
  const v = (status ?? '').trim().toLowerCase()
  if (!v || /^(unknown|—|n\/a|not reported)$/.test(v)) return { status: 'unknown', detail: 'Not reported' }
  if (/\b(not encrypted|off|disabled|false)\b/.test(v)) return { status: 'fail', detail: status!.trim() }
  if (/\b(encrypted|on|enabled|true)\b/.test(v)) return { status: 'pass', detail: status!.trim() }
  return { status: 'unknown', detail: `Unrecognised value: ${status}` }
}

export function parseCheckInMs(lastCheckIn: string | undefined): number | null {
  if (!lastCheckIn) return null
  const t = Date.parse(lastCheckIn)
  return Number.isNaN(t) ? null : t
}

function classifyCheckIn(d: Device, ctx: Ctx): Verdict {
  const days = (ms: number | null): number | null => (ms === null ? null : Math.max(0, Math.floor((ctx.now - ms) / 86_400_000)))
  const rule = checkInRule()
  const primary = days(parseCheckInMs(d.lastCheckIn))
  // Second signal: the Endpoint Central agent. Covers hybrid Windows (Intune + EC) and Macs (MDM + EC agent).
  const ec = hybridEc(d, ctx)
  const sys = findPatchSystem(d, ctx)
  const agent = rule === 'mdm-only' ? null : ec ? days(parseCheckInMs(ec.lastCheckIn)) : days(parseCheckInMs(sys?.lastContactTime ?? undefined))
  const signals = [primary, agent].filter((n): n is number => n !== null)
  if (!signals.length) return { status: 'unknown', detail: 'No check-in reported' }
  const mdmLabel = d.managementSource === 'Microsoft Intune' ? 'Intune' : 'MDM'
  const both = agent !== null ? ` (${mdmLabel} ${primary === null ? 'n/a' : `${primary}d`} · Endpoint Central ${agent}d)` : ''
  // "either" and the single-signal case use the freshest signal; "both" requires every available signal to be fresh.
  const judged = rule === 'both' ? Math.max(...signals) : Math.min(...signals)
  return judged <= checkInDays()
    ? { status: 'pass', detail: `Checked in ${judged}d ago${both}` }
    : { status: 'fail', detail: `Last check-in ${judged}d ago${both}` }
}

function classifyCompliance(d: Device): Verdict {
  if (d.managementSource === 'Microsoft Intune') {
    if (d.complianceState === 'Compliant') return { status: 'pass', detail: 'Compliant' }
    return { status: 'fail', detail: d.primaryIssue && d.primaryIssue !== 'None' ? `${d.complianceState}: ${d.primaryIssue}` : d.complianceState }
  }
  // Endpoint Central agent rows: the state is derived purely from patch counts, so it would double-count the Critical
  // Patching pillar. No MDM compliance verdict exists for them.
  if (d.id.startsWith('ec-')) return { status: 'unknown', detail: 'No MDM compliance verdict (agent-only device; see Critical Patching)' }
  // Endpoint Central MDM (macOS): the per-device detail call can fail (throttling / token churn) and the mapper then
  // defaults to "Warning". That is a missing signal, not a finding.
  if (d.primaryIssue === 'Compliance details unavailable') return { status: 'unknown', detail: 'MDM compliance details could not be read' }
  const suffix = ' (Endpoint Central MDM)'
  if (d.complianceState === 'Compliant') return { status: 'pass', detail: `Compliant${suffix}` }
  const issue = d.primaryIssue && d.primaryIssue !== 'None' ? `${d.complianceState}: ${d.primaryIssue}` : d.complianceState
  return { status: 'fail', detail: `${issue}${suffix}` }
}

export function patchLabel(p: MissingPatch): string {
  const text = (p.description || p.name).trim()
  const short = text.length > 140 ? `${text.slice(0, 137)}…` : text
  return p.kb && !short.includes(p.kb) ? `${p.kb} — ${short}` : short
}

export function findPatchSystem(d: Device, ctx: Pick<Ctx, 'rec'>): PatchSystemStatus | undefined {
  return ctx.rec.byDeviceId.get(d.id)?.patch
}

/** The Endpoint Central agent row for an Intune-enrolled Windows device (hybrid), if there is one. */
function hybridEc(d: Device, ctx: Pick<Ctx, 'rec'>): Device | undefined {
  return ctx.rec.byDeviceId.get(d.id)?.ec
}

function makeCtx(devices: Device[], systems: PatchSystemStatus[] | null, criticalPatches: Map<string, MissingPatch[]> | null, now: number, ecDevices: Device[] = []): Ctx {
  return { rec: reconcileDevices(devices, systems, ecDevices), patchLoaded: systems !== null, criticalPatches, now }
}

function classifyPatching(d: Device, ctx: Ctx): Verdict {
  const sys = findPatchSystem(d, ctx)
  if (!sys) {
    // Windows in Intune with no Endpoint Central agent row at all: a coverage gap worth naming, not a data glitch.
    if (ctx.patchLoaded && d.managementSource === 'Microsoft Intune' && d.platform === 'Windows' && !hybridEc(d, ctx)) {
      return { status: 'unknown', detail: 'No Endpoint Central agent found for this device (not patch-assessed)' }
    }
    return { status: 'unknown', detail: 'No Patch Manager scan for this device' }
  }
  if (!sys.scanSucceeded) return { status: 'unknown', detail: 'No Patch Manager scan for this device' }
  if (sys.criticalPatchCount > 0) {
    const items = ctx.criticalPatches?.get(sys.detailResourceId)?.map(patchLabel)
    return {
      status: 'fail',
      detail: `${sys.criticalPatchCount} critical, ${sys.importantPatchCount} important patch${sys.importantPatchCount === 1 ? '' : 'es'} missing`,
      ...(items?.length ? { items } : {}),
    }
  }
  return { status: 'pass', detail: 'No critical patches missing' }
}

const isLaptopOs = (d: Device): boolean => d.platform === 'Windows' || d.platform === 'macOS'

const PILLARS: PillarDef[] = [
  { id: 'encryption', label: 'Disk Encryption', description: 'BitLocker / FileVault reported as on', scope: 'Windows & macOS', weight: 0.35, applies: isLaptopOs, assess: d => classifyEncryption(d.encryptionStatus) },
  {
    id: 'patching', label: 'Critical Patching', description: 'No critical patches missing (Patch Manager)', scope: 'Windows & macOS with a Patch Manager scan', weight: 0.30, applies: isLaptopOs, assess: classifyPatching,
    unavailableReason: ctx => (ctx.patchLoaded ? undefined : 'Patch Manager data could not be loaded. Check the Endpoint Central API client and its PatchMgmt.READ scope.'),
  },
  { id: 'compliance', label: 'MDM Compliance', description: 'Intune compliance policy result; macOS uses the Endpoint Central MDM verdict', scope: 'Intune Windows & Endpoint Central macOS', weight: 0.20, applies: () => true, assess: d => classifyCompliance(d) },
  { id: 'checkin', label: 'MDM Check-in', get description() { return `Checked in within ${checkInDays()} days` }, scope: 'All managed devices', weight: 0.15, applies: () => true, assess: classifyCheckIn },
]

function bump(map: Map<string, PillarBreakdownRow>, key: string, status: Verdict['status']): void {
  const row = map.get(key) ?? { key, assessed: 0, passing: 0, failing: 0, notReported: 0 }
  if (status === 'pass') { row.assessed++; row.passing++ } else if (status === 'fail') { row.assessed++; row.failing++ } else row.notReported++
  map.set(key, row)
}

function agentCoverage(devices: Device[], ctx: Ctx, platform: Device['platform']): { devices: number; withAgent: number } {
  const of = devices.filter(d => d.platform === platform)
  return { devices: of.length, withAgent: of.filter(d => findPatchSystem(d, ctx) !== undefined).length }
}

export function gradeFor(score: number | null): string | null {
  if (score === null) return null
  return score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : 'D'
}

export function buildPosture(
  allDevices: Device[], systems: PatchSystemStatus[] | null, source: PostureSource = 'all', now = Date.now(),
  criticalPatches: Map<string, MissingPatch[]> | null = null, ecDevices: Device[] = [],
): PostureResult {
  const devices = source === 'all' ? allDevices
    : allDevices.filter(d => d.managementSource === (source === 'intune' ? 'Microsoft Intune' : 'ManageEngine'))
  const ctx = makeCtx(devices, systems, criticalPatches, now, ecDevices)

  const pillars: PillarResult[] = PILLARS.map(def => {
    const byPlatform = new Map<string, PillarBreakdownRow>()
    const bySource = new Map<string, PillarBreakdownRow>()
    const findingCounts = new Map<string, number>()
    let passing = 0, failingCount = 0, notReported = 0, inScope = 0

    for (const d of devices) {
      if (!def.applies(d)) continue
      inScope++
      const v = def.assess(d, ctx)
      bump(byPlatform, d.platform, v.status)
      bump(bySource, d.managementSource, v.status)
      if (v.status === 'pass') passing++
      else if (v.status === 'fail') {
        failingCount++
        for (const item of v.items ?? []) findingCounts.set(item, (findingCounts.get(item) ?? 0) + 1)
      } else notReported++
    }

    const assessed = passing + failingCount
    const unmatchedAgents: PillarResult['unmatchedAgents'] | undefined = def.id === 'patching' && systems && source === 'all'
      ? { windows: ctx.rec.unmatchedPatch.filter(x => x.platform === 'Windows').length, macos: ctx.rec.unmatchedPatch.filter(x => x.platform === 'Mac').length }
      : undefined
    return {
      id: def.id, label: def.label, description: def.description, scope: def.scope, weight: def.weight,
      inScope, assessed, passing, failing: failingCount, notReported,
      scorePct: assessed ? Math.round((passing / assessed) * 100) : null,
      ...(def.unavailableReason?.(ctx) ? { unavailableReason: def.unavailableReason(ctx)! } : {}),
      byPlatform: [...byPlatform.values()].sort((a, b) => b.assessed + b.notReported - (a.assessed + a.notReported)),
      bySource: [...bySource.values()],
      topFindings: [...findingCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_FINDINGS).map(([label, devices]) => ({ label, devices })),
      ...(unmatchedAgents ? { unmatchedAgents } : {}),
    }
  })

  // Weighted average over pillars that could actually be assessed, so a missing data source can't drag the score to zero.
  const scored = pillars.filter(p => p.scorePct !== null)
  const weightSum = scored.reduce((n, p) => n + p.weight, 0)
  const score = weightSum ? Math.round(scored.reduce((n, p) => n + (p.scorePct as number) * p.weight, 0) / weightSum) : null

  return {
    generatedAt: new Date(now).toISOString(),
    source,
    deviceCount: devices.length,
    sourceCounts: {
      intune: allDevices.filter(d => d.managementSource === 'Microsoft Intune').length,
      manageengine: allDevices.filter(d => d.managementSource === 'ManageEngine').length,
    },
    pillars,
    overall: { score, assessedPillars: scored.length, totalPillars: pillars.length },
    coverage: systems === null ? null : {
      windows: agentCoverage(devices, ctx, 'Windows'),
      macos: agentCoverage(devices, ctx, 'macOS'),
    },
    enrichment: {
      patchLoaded: systems !== null,
      agentRowsLoaded: ecDevices.length,
      mdmDetailsStale: devices.filter(d => d.detailsStaleSince).length,
      mdmDetailsUnread: devices.filter(d => d.primaryIssue === 'Compliance details unavailable').length,
    },
  }
}

// ── Per-pillar device listing (server-side filter / sort / page) ─────────────

export type DeviceStatusFilter = 'pass' | 'fail' | 'unknown'
export type DeviceSortKey = 'deviceName' | 'user' | 'platform' | 'source' | 'detail'

export interface ListOptions {
  pillarId: PillarId
  source?: PostureSource | undefined
  platform?: string | undefined
  /** managementSource label, e.g. "Microsoft Intune". */
  sourceKey?: string | undefined
  status?: DeviceStatusFilter | undefined
  q?: string | undefined
  sortKey?: DeviceSortKey | undefined
  sortDir?: 'asc' | 'desc' | undefined
  page?: number
  pageSize?: number
}

export interface PillarDeviceList {
  total: number
  page: number
  pageSize: number
  totalPages: number
  rows: PillarDevice[]
}

function verdictBasis(pillar: PillarId, d: Device, ec: Device | undefined, sys: PatchSystemStatus | undefined): string {
  const intune = d.managementSource === 'Microsoft Intune'
  switch (pillar) {
    case 'encryption': return intune ? 'Intune' : d.id.startsWith('ec-') ? 'Endpoint Central (not reported by the agent)' : 'Endpoint Central MDM'
    case 'patching': return 'Endpoint Central Patch Manager'
    case 'compliance': return intune ? 'Intune compliance policy' : d.id.startsWith('ec-') ? 'None (agent-only device)' : 'Endpoint Central MDM'
    case 'checkin': {
      const rule = checkInRule()
      if (!(ec || sys?.lastContactTime) || rule === 'mdm-only') return intune ? 'Intune' : 'Endpoint Central MDM'
      return rule === 'both' ? `Both ${intune ? 'Intune' : 'MDM'} and Endpoint Central must be recent` : `Freshest of ${intune ? 'Intune' : 'MDM'} and Endpoint Central`
    }
  }
}

function deviceFacts(pillar: PillarId, d: Device, sys: PatchSystemStatus | undefined, ec: Device | undefined): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = []
  const add = (label: string, value: string | undefined | null) => { if (value && value !== 'Unknown' && value !== '—') out.push({ label, value }) }
  add('Verdict based on', verdictBasis(pillar, d, ec, sys))
  if (d.detailsStaleSince) add('MDM details', `Last read ${d.detailsStaleSince} — the latest sync could not read them, last known values shown`)
  const macAgent = d.platform === 'macOS' && d.managementSource === 'ManageEngine' && !d.id.startsWith('ec-')
  add('Managed by', ec ? 'Microsoft Intune + Endpoint Central (hybrid)' : macAgent ? (sys ? 'Endpoint Central (MDM + agent)' : 'Endpoint Central (MDM)') : d.id.startsWith('ec-') ? 'Endpoint Central (agent)' : d.managementSource === 'ManageEngine' ? 'ManageEngine MDM' : d.managementSource)
  add('Operating system', [d.osVersion, d.osBuildNumber].filter(Boolean).join(' · '))
  add(ec ? 'Last check-in (Intune)' : 'Last check-in', d.lastCheckIn)
  if (ec) {
    add('Last contact (Endpoint Central)', ec.lastCheckIn)
    add('Endpoint Central state', ec.complianceState === 'Compliant' ? 'Compliant' : `${ec.complianceState}: ${ec.primaryIssue}`)
  }
  add('Encryption', d.encryptionStatus)
  add('IP address', d.ipAddress)
  add('Location / department', d.department)
  if (sys) {
    add('Missing patches', `${sys.criticalPatchCount} critical · ${sys.importantPatchCount} important · ${sys.moderatePatchCount} moderate · ${sys.lowPatchCount} low`)
    add('Missing by type', `OS ${sys.missingOsPatches} · third-party ${sys.missingThirdPartyPatches} · driver ${sys.missingDriverPatches} · BIOS ${sys.missingBiosPatches}`)
    add('Last patch scan', sys.lastSuccessfulScanTime ?? sys.lastScanTime)
    add('Last contact (Endpoint Central agent)', sys.lastContactTime)
  }
  return out
}

export function listPillarDevices(
  allDevices: Device[], systems: PatchSystemStatus[] | null, criticalPatches: Map<string, MissingPatch[]> | null,
  opts: ListOptions, now = Date.now(), ecDevices: Device[] = [],
): PillarDeviceList {
  const def = PILLARS.find(p => p.id === opts.pillarId)
  if (!def) return { total: 0, page: 1, pageSize: 0, totalPages: 1, rows: [] }
  const source = opts.source ?? 'all'
  const devices = source === 'all' ? allDevices
    : allDevices.filter(d => d.managementSource === (source === 'intune' ? 'Microsoft Intune' : 'ManageEngine'))
  const ctx = makeCtx(devices, systems, criticalPatches, now, ecDevices)
  const q = (opts.q ?? '').trim().toLowerCase()

  let rows: PillarDevice[] = []
  for (const d of devices) {
    if (!def.applies(d)) continue
    if (opts.platform && d.platform !== opts.platform) continue
    if (opts.sourceKey && d.managementSource !== opts.sourceKey) continue
    const v = def.assess(d, ctx)
    if (opts.status && v.status !== opts.status) continue
    const patchSys = def.id === 'patching' || def.id === 'checkin' ? findPatchSystem(d, ctx) : undefined
    const row: PillarDevice = {
      id: d.id, deviceName: d.deviceName, user: d.user, platform: d.platform, source: d.managementSource,
      serialNumber: d.serialNumber, status: v.status, detail: v.detail, ...(v.items ? { items: v.items } : {}),
      facts: deviceFacts(def.id, d, patchSys, hybridEc(d, ctx)),
      ...(patchSys?.detailResourceId ? { patchResourceId: patchSys.detailResourceId } : {}),
    }
    if (q && ![row.deviceName, row.user, row.serialNumber, row.detail, ...(row.items ?? [])].some(t => t.toLowerCase().includes(q))) continue
    rows.push(row)
  }

  const key = opts.sortKey
  if (key) {
    const dir = opts.sortDir === 'desc' ? -1 : 1
    rows = rows.sort((a, b) => dir * String(a[key]).localeCompare(String(b[key]), undefined, { numeric: true, sensitivity: 'base' }))
  }

  const pageSize = Math.min(Math.max(1, Math.floor(opts.pageSize ?? 25)), MAX_PAGE_SIZE)
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const page = Math.min(Math.max(1, Math.floor(opts.page ?? 1)), totalPages)
  return { total: rows.length, page, pageSize, totalPages, rows: rows.slice((page - 1) * pageSize, page * pageSize) }
}
