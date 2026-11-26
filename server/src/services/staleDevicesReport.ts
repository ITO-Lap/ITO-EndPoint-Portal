import { fetchAllDevices } from '../routes/devices.js'
import { exportToExcel, type ReportColumn } from './reportExporter.js'
import { getSlackConfig } from '../store/integrationStore.js'
import { uploadSlackFile } from './slack.js'
import { collectFleetDataChecks } from './fleetDataQuality.js'
import type { DataCheck } from './dataQuality.js'
import { buildOverviewMessage, countBy, formatCount, formatPercent, topBreakdown, type ReportOverview } from './reportOverview.js'

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

interface StaleRow { deviceName: string; platform: string; source: string; daysSilent: number }

export function buildStaleOverview(rows: StaleRow[], totalDevices: number, dataChecks: DataCheck[] = []): ReportOverview {
  const band = (min: number, max = Infinity) => rows.filter(r => r.daysSilent >= min && r.daysSilent < max).length
  const longest = rows[0] // rows are sorted longest-silent first
  const over90 = band(90)
  return {
    title: 'Stale Devices',
    fields: [
      { label: `Stale devices (${STALE_DAYS}+ days)`, value: rows.length },
      { label: 'Share of managed devices', value: `${formatPercent(rows.length, totalDevices)} of ${formatCount(totalDevices)}` },
      { label: `Silent ${STALE_DAYS}–59 days`, value: band(STALE_DAYS, 60) },
      { label: 'Silent 60–89 days', value: band(60, 90) },
      { label: 'Silent 90+ days', value: over90 },
      { label: 'Longest silent', value: longest ? `${formatCount(longest.daysSilent)} days (${longest.deviceName})` : 'None' },
      { label: 'By platform', value: topBreakdown(countBy(rows, r => r.platform)) },
      { label: 'By source', value: topBreakdown(countBy(rows, r => r.source)) },
    ],
    action: !rows.length ? 'No stale devices. Nothing to do.'
      : over90 ? `Retire or re-enrol the ${formatCount(over90)} device${over90 === 1 ? '' : 's'} silent for 90+ days, then confirm owners for the rest.`
      : `Confirm owners and last use for the ${formatCount(rows.length)} device${rows.length === 1 ? '' : 's'} silent for ${STALE_DAYS}+ days.`,
    footnote: `Last check-in across all connected MDM sources`,
    dataChecks,
  }
}

export async function createStaleDevicesReport() {
  const fetched = await fetchAllDevices()
  const { devices } = fetched
  const dataChecks = await collectFleetDataChecks(fetched)
  const rows = devices.map(device => ({ device, daysSilent: daysSince(device.lastCheckIn) }))
    .filter((row): row is { device: typeof devices[number]; daysSilent: number } => row.daysSilent !== null && row.daysSilent >= STALE_DAYS)
    .sort((a, b) => b.daysSilent - a.daysSilent)
    .map(({ device, daysSilent }) => ({
      deviceName: device.deviceName, user: device.user, platform: device.platform, source: device.managementSource,
      lastCheckIn: device.lastCheckIn, daysSilent, complianceState: device.complianceState, serialNumber: device.serialNumber,
    }))
  const now = new Date()
  const content = await exportToExcel(rows, columns, {
    title: 'Stale Devices Report', subtitle: `Devices without a check-in for ${STALE_DAYS}+ days`, generatedAt: now.toISOString(), generatedBy: 'EndPoint+', recordCount: rows.length, dataChecks,
  })
  return { content, rows, filename: `stale-devices-${now.toISOString().slice(0, 10)}.xlsx`, overview: buildStaleOverview(rows, devices.length, dataChecks) }
}

export async function sendStaleDevicesReportToSlack(channelId: string): Promise<{ ok: boolean; error?: string; rows: number; filename?: string }> {
  const cfg = getSlackConfig()
  if (!cfg?.botToken) return { ok: false, error: 'Slack Bot OAuth token is not configured.', rows: 0 }
  const report = await createStaleDevicesReport()
  const result = await uploadSlackFile(cfg, {
    channelId, filename: report.filename, title: 'Stale Devices Report', content: report.content,
    blocks: buildOverviewMessage(report.overview, new Date().toISOString().slice(0, 10)).blocks,
  })
  return { ...result, rows: report.rows.length, ...(result.ok ? { filename: report.filename } : {}) }
}
