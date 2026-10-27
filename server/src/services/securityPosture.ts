import type { Device } from '../types.js'
import type { PatchSystemStatus, MissingPatch } from './endpointCentralPatch.js'

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
}

export interface PostureResult {
  generatedAt: string
  source: PostureSource
  deviceCount: number
  sourceCounts: { intune: number; manageengine: number }
  pillars: PillarResult[]
  overall: { score: number | null; assessedPillars: number; totalPillars: number }
}

export const MAX_PAGE_SIZE = 5000
const TOP_FINDINGS = 5
const CHECKIN_PASS_DAYS = 7

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
  patchBySerial: Map<string, PatchSystemStatus> | null
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

function classifyCheckIn(d: Device, now: number): Verdict {
  const t = parseCheckInMs(d.lastCheckIn)
  if (t === null) return { status: 'unknown', detail: 'No check-in reported' }
  const days = Math.max(0, Math.floor((now - t) / 86_400_000))
  return days <= CHECKIN_PASS_DAYS
    ? { status: 'pass', detail: `Checked in ${days}d ago` }
    : { status: 'fail', detail: `Last check-in ${days}d ago` }
}

function classifyCompliance(d: Device): Verdict {
  // Only Intune returns a native compliance verdict; ManageEngine's state is derived from a few flags.
  if (d.managementSource !== 'Microsoft Intune') return { status: 'unknown', detail: 'No native compliance verdict from this source' }
  if (d.complianceState === 'Compliant') return { status: 'pass', detail: 'Compliant' }
  return { status: 'fail', detail: d.primaryIssue && d.primaryIssue !== 'None' ? `${d.complianceState}: ${d.primaryIssue}` : d.complianceState }
}

export function patchLabel(p: MissingPatch): string {
  const text = (p.description || p.name).trim()
  const short = text.length > 140 ? `${text.slice(0, 137)}…` : text
  return p.kb && !short.includes(p.kb) ? `${p.kb} — ${short}` : short
}

function classifyPatching(d: Device, ctx: Ctx): Verdict {
  const sys = ctx.patchBySerial?.get((d.serialNumber ?? '').toUpperCase())
  if (!sys || !sys.scanSucceeded) return { status: 'unknown', detail: 'No Patch Manager scan for this device' }
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
    unavailableReason: ctx => (ctx.patchBySerial ? undefined : 'Patch Manager data could not be loaded. Check the Endpoint Central API client and its PatchMgmt.READ scope.'),
  },
  { id: 'compliance', label: 'MDM Compliance', description: 'Intune native compliance policy result', scope: 'Intune-managed devices', weight: 0.20, applies: () => true, assess: d => classifyCompliance(d) },
  { id: 'checkin', label: 'MDM Check-in', description: `Checked in within ${CHECKIN_PASS_DAYS} days`, scope: 'All managed devices', weight: 0.15, applies: () => true, assess: (d, ctx) => classifyCheckIn(d, ctx.now) },
]

function bump(map: Map<string, PillarBreakdownRow>, key: string, status: Verdict['status']): void {
  const row = map.get(key) ?? { key, assessed: 0, passing: 0, failing: 0, notReported: 0 }
  if (status === 'pass') { row.assessed++; row.passing++ } else if (status === 'fail') { row.assessed++; row.failing++ } else row.notReported++
  map.set(key, row)
}

export function buildPatchIndex(devices: Device[], systems: PatchSystemStatus[] | null): Map<string, PatchSystemStatus> | null {
  if (!systems) return null
  const haystacks = systems.map(s => ({ s, text: s.names.join(' ').toUpperCase() }))
  const index = new Map<string, PatchSystemStatus>()
  for (const d of devices) {
    const serial = (d.serialNumber ?? '').trim().toUpperCase()
    if (serial.length < 6 || serial === 'UNKNOWN' || index.has(serial)) continue
    const hit = haystacks.find(h => h.text.includes(serial))
    if (hit) index.set(serial, hit.s)
  }
  return index
}

export function gradeFor(score: number | null): string | null {
  if (score === null) return null
  return score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : 'D'
}

export function buildPosture(
  allDevices: Device[], systems: PatchSystemStatus[] | null, source: PostureSource = 'all', now = Date.now(),
  criticalPatches: Map<string, MissingPatch[]> | null = null,
): PostureResult {
  const devices = source === 'all' ? allDevices
    : allDevices.filter(d => d.managementSource === (source === 'intune' ? 'Microsoft Intune' : 'ManageEngine'))
  const ctx: Ctx = { patchBySerial: buildPatchIndex(devices, systems), criticalPatches, now }

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
    return {
      id: def.id, label: def.label, description: def.description, scope: def.scope, weight: def.weight,
      inScope, assessed, passing, failing: failingCount, notReported,
      scorePct: assessed ? Math.round((passing / assessed) * 100) : null,
      ...(def.unavailableReason?.(ctx) ? { unavailableReason: def.unavailableReason(ctx)! } : {}),
      byPlatform: [...byPlatform.values()].sort((a, b) => b.assessed + b.notReported - (a.assessed + a.notReported)),
      bySource: [...bySource.values()],
      topFindings: [...findingCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_FINDINGS).map(([label, devices]) => ({ label, devices })),
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

export function listPillarDevices(
  allDevices: Device[], systems: PatchSystemStatus[] | null, criticalPatches: Map<string, MissingPatch[]> | null,
  opts: ListOptions, now = Date.now(),
): PillarDeviceList {
  const def = PILLARS.find(p => p.id === opts.pillarId)
  if (!def) return { total: 0, page: 1, pageSize: 0, totalPages: 1, rows: [] }
  const source = opts.source ?? 'all'
  const devices = source === 'all' ? allDevices
    : allDevices.filter(d => d.managementSource === (source === 'intune' ? 'Microsoft Intune' : 'ManageEngine'))
  const ctx: Ctx = { patchBySerial: buildPatchIndex(devices, systems), criticalPatches, now }
  const q = (opts.q ?? '').trim().toLowerCase()

  let rows: PillarDevice[] = []
  for (const d of devices) {
    if (!def.applies(d)) continue
    if (opts.platform && d.platform !== opts.platform) continue
    if (opts.sourceKey && d.managementSource !== opts.sourceKey) continue
    const v = def.assess(d, ctx)
    if (opts.status && v.status !== opts.status) continue
    const row: PillarDevice = {
      id: d.id, deviceName: d.deviceName, user: d.user, platform: d.platform, source: d.managementSource,
      serialNumber: d.serialNumber, status: v.status, detail: v.detail, ...(v.items ? { items: v.items } : {}),
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
