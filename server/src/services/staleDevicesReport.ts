import { fetchAllDevices } from '../routes/devices.js'
import { exportToExcel, type ReportColumn } from './reportExporter.js'
import { getSlackConfig } from '../store/integrationStore.js'
import { uploadSlackFile } from './slack.js'

export const STALE_DAYS = 30
const columns: ReportColumn[] = [
  { key: 'deviceName', label: 'Device Name', width: 28 }, { key: 'user', label: 'User', width: 28 },
  { key: 'platform', label: 'Platform', width: 12 }, { key: 'source', label: 'Source', width: 20 },
  { key: 'lastCheckIn', label: 'Last Check-in', width: 24 }, { key: 'daysSilent', label: 'Days Silent', width: 14 },
  { key: 'complianceState', label: 'Last Compliance State', width: 22 }, { key: 'serialNumber', label: 'Serial Number', width: 22 },
]

function daysSince(value: string): number | null {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? Math.floor((Date.now() - timestamp) / 86_400_000) : null
}

export async function createStaleDevicesReport() {
  const { devices } = await fetchAllDevices()
  const rows = devices.map(device => ({ device, daysSilent: daysSince(device.lastCheckIn) }))
    .filter((row): row is { device: typeof devices[number]; daysSilent: number } => row.daysSilent !== null && row.daysSilent >= STALE_DAYS)
    .sort((a, b) => b.daysSilent - a.daysSilent)
    .map(({ device, daysSilent }) => ({
      deviceName: device.deviceName, user: device.user, platform: device.platform, source: device.managementSource,
      lastCheckIn: device.lastCheckIn, daysSilent, complianceState: device.complianceState, serialNumber: device.serialNumber,
    }))
  const now = new Date()
  const content = await exportToExcel(rows, columns, {
    title: 'Stale Devices Report', subtitle: `Devices without a check-in for ${STALE_DAYS}+ days`, generatedAt: now.toISOString(), generatedBy: 'ITO Endpoint', recordCount: rows.length,
  })
  return { content, rows, filename: `stale-devices-${now.toISOString().slice(0, 10)}.xlsx` }
}

export async function sendStaleDevicesReportToSlack(channelId: string): Promise<{ ok: boolean; error?: string; rows: number; filename?: string }> {
  const cfg = getSlackConfig()
  if (!cfg?.botToken) return { ok: false, error: 'Slack Bot OAuth token is not configured.', rows: 0 }
  const report = await createStaleDevicesReport()
  const result = await uploadSlackFile(cfg, {
    channelId, filename: report.filename, title: 'Stale Devices Report', content: report.content,
    initialComment: `Stale Devices report: ${report.rows.length} device${report.rows.length === 1 ? '' : 's'} without a check-in for ${STALE_DAYS}+ days.`,
  })
  return { ...result, rows: report.rows.length, ...(result.ok ? { filename: report.filename } : {}) }
}
