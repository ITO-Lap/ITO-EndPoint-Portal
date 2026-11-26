import { getFleetMissingOsPatches, getPatchSystems, type MissingPatch, type PatchSystemStatus } from './endpointCentralPatch.js'
import { exportToExcel, type ReportColumn } from './reportExporter.js'
import { getSlackConfig } from '../store/integrationStore.js'
import { uploadSlackFile } from './slack.js'
import { buildOverviewMessage, countBy, formatCount, topBreakdown, type ReportOverview } from './reportOverview.js'
import { ok, warn, type DataCheck } from './dataQuality.js'
import { credentialsFromEnv, getManagedDevices, type GraphManagedDevice } from './graphApi.js'
import { dataFile, readJsonFile, writeJsonAtomic } from '../store/dataDir.js'
import { isRebootRequired, isSupportedCriticalPatchClient } from './criticalPatchReport.js'

// Windows Update report: Windows client devices (not servers) that are missing a Feature update or a
// Security update, per Endpoint Central Patch Manager. One workbook row per device + missing update.

export type WindowsUpdateKind = 'Feature update' | 'Security update'

export type WindowsUpdatePriority = 'P1 Urgent' | 'P2 High' | 'P3 Normal'

export interface WindowsUpdateReportRow {
  priority: WindowsUpdatePriority
  action: string
  device: string
  operatingSystem: string
  kind: WindowsUpdateKind
  update: string
  kb: string
  severity: string
  cves: string
  releasedAt: string
  daysMissing: number | ''
  rebootRequired: string
  lastScan: string
}

const columns: ReportColumn[] = [
  { key: 'priority', label: 'Priority', width: 12 }, { key: 'action', label: 'Recommended Action', width: 44 },
  { key: 'device', label: 'Device', width: 28 }, { key: 'operatingSystem', label: 'Operating System', width: 32 },
  { key: 'kind', label: 'Update Type', width: 16 }, { key: 'update', label: 'Missing Update', width: 52 },
  { key: 'kb', label: 'KB', width: 14 }, { key: 'severity', label: 'Severity', width: 12 },
  { key: 'cves', label: 'CVEs', width: 30 }, { key: 'releasedAt', label: 'Released', width: 14 },
  { key: 'daysMissing', label: 'Days Missing', width: 14 }, { key: 'rebootRequired', label: 'Reboot Required', width: 16 },
  { key: 'lastScan', label: 'Last Successful Scan', width: 22 },
]

const nameOf = (system: PatchSystemStatus) => system.names[0] ?? system.resourceId

/** Windows client only: Windows Server and unknown-OS devices stay out, as in the critical patching report. */
export const isWindowsClient = (system: PatchSystemStatus): boolean => system.platform === 'Windows' && isSupportedCriticalPatchClient(system)

/**
 * Classifies an OS patch from Endpoint Central's `update_type` and name. Feature = feature updates / OS upgrades
 * (e.g. "Windows 11, version 24H2"); Security = security updates, rollups and anything with a CVE/bulletin.
 * Anything else (non-security, drivers, service packs) is outside this report and returns null.
 */
/** Windows itself plus its bundled components (.NET Framework, Defender, servicing stack); not Microsoft apps such as Visual Studio, SSMS or Microsoft 365 Apps. */
export function isWindowsComponent(patch: MissingPatch): boolean {
  const text = `${patch.name} ${patch.description}`
  if (/visual studio|sql server|microsoft 365|office/i.test(text) && !/for windows (10|11)/i.test(text)) return false
  return /windows\s*(10|11)|windows(10|11)\.0|\.net framework|defender|malicious software removal|servicing stack/i.test(text)
}

export function classifyWindowsUpdate(patch: MissingPatch): WindowsUpdateKind | null {
  const type = patch.updateType ?? ''
  if (/bios|driver|firmware/i.test(type)) return null // vendor BIOS/driver packages carry bulletin IDs but are not Windows updates
  if (/feature|upgrade/i.test(type) || /feature update|\bversion\s*\d{2}h\d\b|\bupgrade\b/i.test(patch.name)) return 'Feature update'
  if (/non.?security/i.test(type)) return null
  if (!isWindowsComponent(patch)) return null // Endpoint Central files Visual Studio, SSMS, Microsoft 365 Apps etc. under 'OS update' too
  if (/security|rollup|critical/i.test(type) || patch.cves.length > 0 || !!patch.bulletinId) return 'Security update'
  return null
}

/** P1: security update that is critical or has been missing 30+ days. P2: important or 14+ days. P3: everything else, incl. feature updates. */
export function prioritize(kind: WindowsUpdateKind, severity: string, daysMissing: number | ''): WindowsUpdatePriority {
  if (kind !== 'Security update') return 'P3 Normal'
  const days = daysMissing === '' ? 0 : daysMissing
  if (severity === 'Critical' || days >= 30) return 'P1 Urgent'
  if (severity === 'Important' || days >= 14) return 'P2 High'
  return 'P3 Normal'
}

function recommendAction(kind: WindowsUpdateKind, priority: WindowsUpdatePriority, reboot: boolean): string {
  if (kind === 'Feature update') return 'Schedule in a feature-update ring (pilot first, then broad); confirm disk space and app compatibility.'
  const base = priority === 'P1 Urgent' ? 'Deploy now outside the normal window' : priority === 'P2 High' ? 'Deploy in the next patch cycle' : 'Include in the regular patch cycle'
  return reboot ? `${base}; reboot needed to complete.` : `${base}.`
}

const PRIORITY_ORDER: Record<WindowsUpdatePriority, number> = { 'P1 Urgent': 0, 'P2 High': 1, 'P3 Normal': 2 }
// ── Feature updates ─────────────────────────────────────────────────────────────
// Endpoint Central's patch data has no feature-update type (verified: only Security, Non-Security, Service Packs and
// BIOS), so a missing feature update is detected from the device's Windows build in Intune: build < target build.
const BUILD_LABELS: Record<number, string> = { 19045: 'Windows 10 22H2', 22621: 'Windows 11 22H2', 22631: 'Windows 11 23H2', 26100: 'Windows 11 24H2', 26200: 'Windows 11 25H2' }
const DEFAULT_TARGET_BUILD = 26200 // Windows 11 25H2; set WINDOWS_FEATURE_TARGET_BUILD (e.g. 26300) when a newer release becomes the target.

export function featureTargetBuild(): number {
  const configured = Number(process.env.WINDOWS_FEATURE_TARGET_BUILD)
  return Number.isInteger(configured) && configured >= 22000 ? configured : DEFAULT_TARGET_BUILD
}
export const windowsBuildOf = (osVersion: string): number | null => {
  const build = Number(osVersion.split('.')[2])
  return Number.isInteger(build) && build > 0 ? build : null
}
export const buildLabel = (build: number): string => BUILD_LABELS[build] ?? `Windows build ${build}`
/** Win10 22H2 / Win11 builds only; Windows Server builds (e.g. 20348) are not feature-update targets here. */
export const isClientBuild = (build: number): boolean => (build >= 19041 && build <= 19045) || build >= 22000

export function buildFeatureUpdateRows(devices: GraphManagedDevice[], serverNames: ReadonlySet<string>, targetBuild = featureTargetBuild()): WindowsUpdateReportRow[] {
  return devices.flatMap(d => {
    if (!/windows/i.test(d.operatingSystem) || serverNames.has(d.deviceName.toLowerCase())) return []
    const build = windowsBuildOf(d.osVersion)
    if (build === null || !isClientBuild(build) || build >= targetBuild) return []
    const priority: WindowsUpdatePriority = build < 22000 ? 'P1 Urgent' : BUILD_LABELS[build] === undefined || targetBuild - build > 200 ? 'P2 High' : 'P3 Normal'
    return [{
      priority, action: build < 22000 ? 'Windows 10 is out of support: upgrade to Windows 11 (check hardware readiness first).' : recommendAction('Feature update', priority, false),
      device: d.deviceName, operatingSystem: `${buildLabel(build)} (${d.osVersion})`, kind: 'Feature update' as const,
      update: `Feature update to ${buildLabel(targetBuild)}`, kb: '', severity: '', cves: '', releasedAt: '', daysMissing: '', rebootRequired: 'Yes',
      lastScan: d.lastSyncDateTime ? new Date(d.lastSyncDateTime).toLocaleString('en-IN') : '',
    }]
  })
}

const KIND_ORDER: Record<WindowsUpdateKind, number> = { 'Feature update': 0, 'Security update': 1 }

export function buildWindowsUpdateRows(systems: PatchSystemStatus[], patchesBySystem: Map<string, MissingPatch[]>, now = new Date()): WindowsUpdateReportRow[] {
  return systems
    .filter(s => s.scanSucceeded && isWindowsClient(s))
    .flatMap(system => (patchesBySystem.get(system.detailResourceId) ?? []).flatMap(patch => {
      const kind = classifyWindowsUpdate(patch)
      if (!kind) return []
      const released = patch.releasedAt ? Date.parse(patch.releasedAt) : NaN
      const daysMissing = Number.isFinite(released) ? Math.max(0, Math.floor((now.getTime() - released) / 86_400_000)) : ''
      const priority = prioritize(kind, patch.severity, daysMissing)
      return [{
        priority, action: recommendAction(kind, priority, isRebootRequired(patch.rebootRequirement)),
        device: nameOf(system), operatingSystem: system.osName ?? 'Not reported', kind,
        update: patch.description || patch.name, kb: patch.kb ?? '', severity: patch.severity, cves: patch.cves.join(', '),
        releasedAt: Number.isFinite(released) ? new Date(released).toLocaleDateString('en-IN') : '',
        daysMissing,
        rebootRequired: patch.rebootRequirement ?? '',
        lastScan: system.lastSuccessfulScanTime ? new Date(system.lastSuccessfulScanTime).toLocaleString('en-IN') : '',
      } satisfies WindowsUpdateReportRow]
    }))
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.device.localeCompare(b.device) || a.update.localeCompare(b.update))
}

/** The updates that fix the most devices — deploy these first. */
export function topUpdatesToDeploy(rows: WindowsUpdateReportRow[], limit = 3): Array<{ label: string; devices: number; kind: WindowsUpdateKind }> {
  const byUpdate = new Map<string, { label: string; kind: WindowsUpdateKind; devices: Set<string> }>()
  for (const r of rows) {
    const key = r.kb || r.update
    const entry = byUpdate.get(key) ?? { label: r.kb || r.update.slice(0, 60), kind: r.kind, devices: new Set<string>() }
    entry.devices.add(r.device); byUpdate.set(key, entry)
  }
  return [...byUpdate.values()].map(e => ({ label: e.label, kind: e.kind, devices: e.devices.size }))
    .sort((a, b) => b.devices - a.devices || a.label.localeCompare(b.label)).slice(0, limit)
}

export interface WindowsUpdateTrend { newDevices: number; resolvedDevices: number; stillMissing: number; previousTotal: number; previousAt: string }

export function compareSnapshots(previous: { at: string; devices: string[] }, current: string[]): WindowsUpdateTrend {
  const before = new Set(previous.devices), now = new Set(current)
  return {
    newDevices: current.filter(d => !before.has(d)).length, resolvedDevices: previous.devices.filter(d => !now.has(d)).length,
    stillMissing: current.filter(d => before.has(d)).length, previousTotal: before.size, previousAt: previous.at,
  }
}

type Snapshot = { at: string; devices: string[] }
interface TrendState { current?: Snapshot | undefined; previous?: Snapshot | undefined }
const MIN_BASELINE_AGE_MS = 6 * 60 * 60 * 1000
const trendFile = (): string => dataFile('windows-update-report-state.json')

/** Compares against the last run that is at least 6h old (so manual re-runs don't wipe the trend), then records this one. */
function trackTrend(devices: string[], now: Date): WindowsUpdateTrend | null {
  let state: TrendState = {}
  try { state = readJsonFile<TrendState>(trendFile()) ?? {} } catch { /* first run */ }
  const baseline = state.current && now.getTime() - Date.parse(state.current.at) >= MIN_BASELINE_AGE_MS ? state.current : state.previous ?? state.current
  const trend = baseline ? compareSnapshots(baseline, devices) : null
  const next: TrendState = state.current && now.getTime() - Date.parse(state.current.at) < MIN_BASELINE_AGE_MS
    ? { ...state, current: { at: now.toISOString(), devices } }
    : { previous: state.current, current: { at: now.toISOString(), devices } }
  try { writeJsonAtomic(trendFile(), next) } catch (error) { console.error('[windows-update-report] Could not persist trend state:', error) }
  return trend
}

export function buildWindowsUpdateOverview(systems: PatchSystemStatus[], rows: WindowsUpdateReportRow[], excludedOther: number, now = new Date(), trend: WindowsUpdateTrend | null = null, extraChecks: DataCheck[] = []): ReportOverview {
  const clients = systems.filter(isWindowsClient)
  const devices = (kind?: WindowsUpdateKind) => new Set(rows.filter(r => !kind || r.kind === kind).map(r => r.device)).size
  const failedScans = clients.filter(s => !s.scanSucceeded).length
  const oldest = rows.filter(r => typeof r.daysMissing === 'number').sort((a, b) => (b.daysMissing as number) - (a.daysMissing as number))[0]
  const over30 = new Set(rows.filter(r => typeof r.daysMissing === 'number' && r.daysMissing >= 30).map(r => r.device)).size
  const reboot = new Set(rows.filter(r => isRebootRequired(r.rebootRequired)).map(r => r.device)).size
  const p1 = new Set(rows.filter(r => r.priority === 'P1 Urgent').map(r => r.device)).size
  const top = topUpdatesToDeploy(rows)
  const dataChecks: DataCheck[] = [
    failedScans > 0
      ? warn('Patch scan health', `${formatCount(failedScans)} of ${formatCount(clients.length)} Windows client devices failed their last scan and are excluded, so these counts are a minimum.`)
      : ok('Patch scan health', `All ${formatCount(clients.length)} Windows client devices scanned successfully.`),
    excludedOther > 0
      ? ok('Scope', `${formatCount(excludedOther)} other missing OS update(s) (non-security, service packs) are outside this report.`)
      : ok('Scope', 'Only Feature and Security updates are reported.'),
    ...extraChecks,
  ]
  return {
    title: 'Windows Updates (Feature & Security)',
    fields: [
      { label: 'Devices missing updates', value: devices() },
      { label: 'P1 urgent devices', value: p1 },
      { label: 'Missing Security updates', value: `${formatCount(devices('Security update'))} device${devices('Security update') === 1 ? '' : 's'}` },
      { label: 'Missing Feature updates', value: `${formatCount(devices('Feature update'))} device${devices('Feature update') === 1 ? '' : 's'}` },
      { label: 'Oldest missing update', value: oldest ? `${formatCount(oldest.daysMissing as number)} days (${oldest.device})` : 'Unknown' },
      { label: 'Reboot required', value: `${formatCount(reboot)} device${reboot === 1 ? '' : 's'}` },
      { label: 'Most affected OS', value: topBreakdown(countBy([...new Set(rows.map(r => r.device))].map(d => rows.find(r => r.device === d)!), r => r.operatingSystem), 2) },
      ...(trend ? [{ label: `Since ${trend.previousAt.slice(0, 10)}`, value: `${formatCount(trend.newDevices)} new · ${formatCount(trend.resolvedDevices)} fixed · ${formatCount(trend.stillMissing)} still missing` }] : []),
    ],
    action: devices()
      ? `${p1 ? `Deploy now to the ${formatCount(p1)} P1 urgent device${p1 === 1 ? '' : 's'}. ` : ''}Biggest wins: ${top.map(t => `${t.label} (${formatCount(t.devices)} device${t.devices === 1 ? '' : 's'})`).join(', ')}.${over30 ? ` ${formatCount(over30)} device${over30 === 1 ? ' has' : 's have'} been missing an update for 30+ days.` : ''}`
      : 'No Feature or Security updates are missing on scanned Windows client devices.',
    footnote: `Source: Endpoint Central Patch Manager, Windows client only · ${now.toISOString().slice(0, 10)}`,
    dataChecks,
  }
}

async function loadIntuneWindowsDevices(): Promise<{ devices: GraphManagedDevice[]; error?: string }> {
  try { return { devices: await getManagedDevices(credentialsFromEnv()) } }
  catch (error) { return { devices: [], error: error instanceof Error ? error.message : 'unknown error' } }
}

/** Gathers the per-device missing Feature/Security updates (Endpoint Central + Intune builds). Shared by the report and the Windows Updates page. */
export async function collectWindowsUpdateRows(force = false) {
  const [systems, patchesBySystem, intune] = await Promise.all([getPatchSystems(force), getFleetMissingOsPatches(force), loadIntuneWindowsDevices()])
  const now = new Date()
  const serverNames = new Set(systems.filter(s => s.platform === 'Windows' && !isSupportedCriticalPatchClient(s)).flatMap(s => s.names.map(n => n.toLowerCase())))
  const featureRows = buildFeatureUpdateRows(intune.devices, serverNames)
  const rows = [...buildWindowsUpdateRows(systems, patchesBySystem, now), ...featureRows]
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.device.localeCompare(b.device) || a.update.localeCompare(b.update))
  return { systems, patchesBySystem, intune, serverNames, rows, now }
}

export async function createWindowsUpdateReport(force = false): Promise<{ content: Buffer; filename: string; devices: number; rows: number; overview: ReportOverview }> {
  const { systems, patchesBySystem, intune, rows, now } = await collectWindowsUpdateRows(force)
  const featureCheck: DataCheck = intune.error
    ? warn('Feature updates', `Windows builds could not be read from Intune (${intune.error}), so Feature updates are not included in this report.`)
    : ok('Feature updates', `Detected from Intune Windows builds: ${formatCount(intune.devices.length)} Windows devices checked against the ${buildLabel(featureTargetBuild())} target (build ${featureTargetBuild()}).`)
  const clientIds = new Set(systems.filter(s => s.scanSucceeded && isWindowsClient(s)).map(s => s.detailResourceId))
  const excludedOther = [...patchesBySystem].filter(([id]) => clientIds.has(id)).reduce((n, [, list]) => n + list.filter(p => !classifyWindowsUpdate(p)).length, 0)
  const trend = trackTrend([...new Set(rows.map(r => r.device))], now)
  const overview = buildWindowsUpdateOverview(systems, rows, excludedOther, now, trend, [featureCheck])
  const content = await exportToExcel(rows.map(r => ({ ...r })), columns, {
    title: 'Windows Update Report', subtitle: 'Windows client devices missing Feature or Security updates, reported by Endpoint Central Patch Manager',
    generatedAt: now.toISOString(), generatedBy: 'EndPoint+', recordCount: rows.length, ...(overview.dataChecks ? { dataChecks: overview.dataChecks } : {}),
  })
  return { content, filename: `windows-updates-${now.toISOString().slice(0, 10)}.xlsx`, devices: new Set(rows.map(r => r.device)).size, rows: rows.length, overview }
}

export async function sendWindowsUpdateReportToSlack(channelId: string, force = false): Promise<{ ok: boolean; error?: string; devices: number; rows: number; filename?: string }> {
  const cfg = getSlackConfig()
  if (!cfg?.botToken) return { ok: false, error: 'Slack Bot OAuth token is not configured.', devices: 0, rows: 0 }
  const report = await createWindowsUpdateReport(force)
  const result = await uploadSlackFile(cfg, {
    channelId, filename: report.filename, title: 'Windows Update Report', content: report.content,
    blocks: buildOverviewMessage(report.overview, new Date().toISOString().slice(0, 10)).blocks,
  })
  return { ...result, devices: report.devices, rows: report.rows, ...(result.ok ? { filename: report.filename } : {}) }
}
