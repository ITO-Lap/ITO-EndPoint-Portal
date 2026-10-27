import { getFleetCriticalPatches, getPatchSystems, type MissingPatch, type PatchSystemStatus } from './endpointCentralPatch.js'
import { exportToExcel, type ReportColumn } from './reportExporter.js'
import { getSlackConfig } from '../store/integrationStore.js'
import { uploadSlackFile } from './slack.js'
import { buildOverviewMessage, countBy, formatCount, topBreakdown, type ReportOverview } from './reportOverview.js'
import { ok, warn, type DataCheck } from './dataQuality.js'

export interface CriticalPatchReportRow {
  device: string
  platform: string
  operatingSystem: string
  criticalPatchCount: number
  patch: string
  kb: string
  cves: string
  vendor: string
  releasedAt: string
  rebootRequired: string
}

const columns: ReportColumn[] = [
  { key: 'device', label: 'Device', width: 28 }, { key: 'platform', label: 'Platform', width: 12 },
  { key: 'operatingSystem', label: 'Operating System', width: 32 }, { key: 'criticalPatchCount', label: 'Critical Patches', width: 16 },
  { key: 'patch', label: 'Missing Patch', width: 48 }, { key: 'kb', label: 'KB', width: 14 },
  { key: 'cves', label: 'CVEs', width: 30 }, { key: 'vendor', label: 'Vendor', width: 20 },
  { key: 'releasedAt', label: 'Released', width: 18 }, { key: 'rebootRequired', label: 'Reboot Required', width: 18 },
]

const nameOf = (system: PatchSystemStatus) => system.names[0] ?? system.resourceId

/** This report is intentionally endpoint-only: Windows client and macOS. */
export function isSupportedCriticalPatchClient(system: PatchSystemStatus): boolean {
  if (system.platform === 'Mac') return true
  // Endpoint Central reports Windows Server in os_name. Do not guess when the
  // OS name is absent: an unknown Windows estate must not leak servers into a
  // client patch report.
  return system.platform === 'Windows' && !!system.osName && !/\bwindows\s+server\b/i.test(system.osName)
}

export function buildCriticalPatchReportRows(systems: PatchSystemStatus[], patchesBySystem: Map<string, MissingPatch[]>): CriticalPatchReportRow[] {
  return systems
    .filter(system => system.scanSucceeded && system.criticalPatchCount > 0 && isSupportedCriticalPatchClient(system))
    .flatMap(system => {
      const common = { device: nameOf(system), platform: system.platform, operatingSystem: system.osName ?? 'Not reported', criticalPatchCount: system.criticalPatchCount }
      const patches = patchesBySystem.get(system.detailResourceId) ?? []
      if (!patches.length) return [{ ...common, patch: 'Patch name not returned by Patch Manager', kb: '', cves: '', vendor: '', releasedAt: '', rebootRequired: '' }]
      return patches.map(patch => ({
        ...common, patch: patch.description || patch.name, kb: patch.kb ?? '', cves: patch.cves.join(', '), vendor: patch.vendor ?? '',
        releasedAt: patch.releasedAt ? new Date(patch.releasedAt).toLocaleDateString('en-IN') : '', rebootRequired: patch.rebootRequirement ?? '',
      }))
    })
}

/** True for "Required"/"Yes"; false for "Not Required", "No" and empty values. */
export const isRebootRequired = (value: string | null | undefined): boolean => /\b(required|yes)\b/i.test(value ?? '') && !/\b(not|no)\b/i.test(value ?? '')

/** Headline figures, scan-health and detail-availability checks for the critical patching report. */
export function buildCriticalPatchOverview(systems: PatchSystemStatus[], patchesBySystem: Map<string, MissingPatch[]>, now = new Date()): ReportOverview {
  const clients = systems.filter(isSupportedCriticalPatchClient)
  const critical = clients.filter(s => s.scanSucceeded && s.criticalPatchCount > 0)
  const patchesOf = (s: PatchSystemStatus) => patchesBySystem.get(s.detailResourceId) ?? []
  const ages = critical.flatMap(s => patchesOf(s).map(p => ({ device: nameOf(s), days: Math.floor((now.getTime() - Date.parse(p.releasedAt ?? '')) / 86_400_000) })))
    .filter(a => Number.isFinite(a.days) && a.days >= 0).sort((a, b) => b.days - a.days)
  const over30 = new Set(ages.filter(a => a.days >= 30).map(a => a.device)).size
  const failedScans = clients.filter(s => !s.scanSucceeded).length
  const noDetail = critical.length > 0 && critical.every(s => patchesOf(s).length === 0)
  const dataChecks: DataCheck[] = [
    failedScans > 0
      ? warn('Patch scan health', `${formatCount(failedScans)} of ${formatCount(clients.length)} Windows/macOS endpoints failed their last scan and are excluded, so these counts are a minimum.`)
      : ok('Patch scan health', `All ${formatCount(clients.length)} Windows/macOS endpoints scanned successfully.`),
    noDetail ? warn('Patch detail', 'Per-patch names, ages and CVEs were unavailable; the workbook lists devices without them.') : ok('Patch detail', 'Per-patch detail was available.'),
  ]
  const rebootDevices = critical.filter(s => patchesOf(s).some(p => isRebootRequired(p.rebootRequirement))).length
  return {
    title: 'Critical Patching',
    fields: [
      { label: 'Devices missing critical patches', value: critical.length },
      { label: 'Critical patches missing', value: critical.reduce((sum, s) => sum + s.criticalPatchCount, 0) },
      { label: 'Oldest missing patch', value: ages[0] ? `${formatCount(ages[0].days)} days (${ages[0].device})` : 'Unknown' },
      { label: 'Missing for 30+ days', value: ages.length ? `${formatCount(over30)} device${over30 === 1 ? '' : 's'}` : 'Unknown' },
      { label: 'By platform', value: topBreakdown(countBy(critical, s => s.platform)) },
      { label: 'Most affected OS', value: topBreakdown(countBy(critical, s => s.osName ?? 'Not reported'), 2) },
      { label: 'Distinct CVEs', value: new Set(critical.flatMap(s => patchesOf(s).flatMap(p => p.cves))).size },
      { label: 'Reboot required', value: `${formatCount(rebootDevices)} device${rebootDevices === 1 ? '' : 's'}` },
    ],
    action: critical.length
      ? `Patch the ${formatCount(critical.length)} device${critical.length === 1 ? '' : 's'}${over30 ? `, starting with the ${formatCount(over30)} missing patches for 30+ days` : ''}.`
      : 'No critical patches are missing on scanned endpoints.',
    footnote: 'Source: Endpoint Central Patch Manager, Windows client and macOS only',
    dataChecks,
  }
}

export async function createCriticalPatchReport(force = false): Promise<{ content: Buffer; filename: string; criticalDevices: number; rows: number; overview: ReportOverview }> {
  const [systems, patchesBySystem] = await Promise.all([getPatchSystems(force), getFleetCriticalPatches(force)])
  const rows = buildCriticalPatchReportRows(systems, patchesBySystem)
  const now = new Date()
  const date = now.toISOString().slice(0, 10)
  const overview = buildCriticalPatchOverview(systems, patchesBySystem, now)
  const content = await exportToExcel(rows.map(row => ({ ...row })), columns, {
    title: 'Critical Patching Report', subtitle: 'Missing critical patches on Windows client and macOS endpoints, reported by Endpoint Central Patch Manager',
    generatedAt: now.toISOString(), generatedBy: 'ITO Endpoint', recordCount: rows.length, ...(overview.dataChecks ? { dataChecks: overview.dataChecks } : {}),
  })
  return { content, filename: `critical-patching-${date}.xlsx`, criticalDevices: new Set(rows.map(row => row.device)).size, rows: rows.length, overview }
}

export async function sendCriticalPatchReportToSlack(channelId: string, force = false): Promise<{ ok: boolean; error?: string; criticalDevices: number; rows: number; filename?: string }> {
  const cfg = getSlackConfig()
  if (!cfg?.botToken) return { ok: false, error: 'Slack Bot OAuth token is not configured.', criticalDevices: 0, rows: 0 }
  const report = await createCriticalPatchReport(force)
  const result = await uploadSlackFile(cfg, {
    channelId, filename: report.filename, title: 'Critical Patching Report', content: report.content,
    blocks: buildOverviewMessage(report.overview, new Date().toISOString().slice(0, 10)).blocks,
  })
  return { ...result, criticalDevices: report.criticalDevices, rows: report.rows, ...(result.ok ? { filename: report.filename } : {}) }
}
