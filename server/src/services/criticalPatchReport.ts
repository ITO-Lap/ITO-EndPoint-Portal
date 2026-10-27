import { getFleetCriticalPatches, getPatchSystems, type MissingPatch, type PatchSystemStatus } from './endpointCentralPatch.js'
import { exportToExcel, type ReportColumn } from './reportExporter.js'
import { getSlackConfig } from '../store/integrationStore.js'
import { uploadSlackFile } from './slack.js'

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

export async function createCriticalPatchReport(force = false): Promise<{ content: Buffer; filename: string; criticalDevices: number; rows: number }> {
  const [systems, patchesBySystem] = await Promise.all([getPatchSystems(force), getFleetCriticalPatches(force)])
  const rows = buildCriticalPatchReportRows(systems, patchesBySystem)
  const now = new Date()
  const date = now.toISOString().slice(0, 10)
  const content = await exportToExcel(rows.map(row => ({ ...row })), columns, {
    title: 'Critical Patching Report', subtitle: 'Missing critical patches on Windows client and macOS endpoints, reported by Endpoint Central Patch Manager',
    generatedAt: now.toISOString(), generatedBy: 'ITO Endpoint', recordCount: rows.length,
  })
  return { content, filename: `critical-patching-${date}.xlsx`, criticalDevices: new Set(rows.map(row => row.device)).size, rows: rows.length }
}

export async function sendCriticalPatchReportToSlack(channelId: string, force = false): Promise<{ ok: boolean; error?: string; criticalDevices: number; rows: number; filename?: string }> {
  const cfg = getSlackConfig()
  if (!cfg?.botToken) return { ok: false, error: 'Slack Bot OAuth token is not configured.', criticalDevices: 0, rows: 0 }
  const report = await createCriticalPatchReport(force)
  const result = await uploadSlackFile(cfg, {
    channelId, filename: report.filename, title: 'Critical Patching Report', content: report.content,
    initialComment: `Critical Patching report: ${report.criticalDevices} device${report.criticalDevices === 1 ? '' : 's'} with missing critical patches (${report.rows} report rows).`,
  })
  return { ...result, criticalDevices: report.criticalDevices, rows: report.rows, ...(result.ok ? { filename: report.filename } : {}) }
}
