// Compliance / Device Inventory report generation — extracted from
// server/src/routes/intelligence.ts's POST /export (which now calls these
// functions too, removing the duplication) so scheduled reports can generate
// the exact same content as the on-demand export, without going through
// Express req/res. Mirrors the shape of createCriticalPatchReport() /
// createStaleDevicesReport() (criticalPatchReport.ts / staleDevicesReport.ts).

import { credentialsFromEnv, getManagedDevices, type GraphManagedDevice } from './graphApi.js'
import { countBy, formatCount, formatPercent, topBreakdown, type ReportOverview } from './reportOverview.js'
import { exportToCSV, exportToExcel, exportToPDF, exportToPPTX, type ExportFormat, type ReportColumn } from './reportExporter.js'

const COLUMNS: ReportColumn[] = [
  { key: 'deviceName',        label: 'Device Name',  width: 25 },
  { key: 'userPrincipalName', label: 'User',         width: 30 },
  { key: 'operatingSystem',   label: 'OS',           width: 12 },
  { key: 'osVersion',         label: 'OS Version',   width: 15 },
  { key: 'complianceState',   label: 'Compliance',   width: 15 },
  { key: 'isEncrypted',       label: 'Encrypted',    width: 10 },
  { key: 'lastSyncDateTime',  label: 'Last Sync',    width: 22 },
  { key: 'manufacturer',      label: 'Manufacturer', width: 18 },
  { key: 'model',             label: 'Model',        width: 20 },
  { key: 'managementAgent',   label: 'Mgmt Agent',   width: 18 },
  { key: 'enrolledDateTime',  label: 'Enrolled',     width: 22 },
]

const OS_LABELS: Record<string, string> = { windows: 'Windows', macos: 'macOS', ios: 'iOS', ipados: 'iPadOS', android: 'Android', linux: 'Linux' }
const osLabel = (os: string | null | undefined) => OS_LABELS[(os ?? '').toLowerCase()] ?? (os || 'Unknown')
const OWNER_LABELS: Record<string, string> = { company: 'Corporate', personal: 'Personal' }
const daysAgoOf = (iso: string | null | undefined): number | null => { const t = Date.parse(iso ?? ''); return Number.isFinite(t) ? Math.floor((Date.now() - t) / 86_400_000) : null }

export function buildInventoryOverview(devices: GraphManagedDevice[]): ReportOverview {
  const total = devices.length
  const notSynced = devices.filter(d => (daysAgoOf(d.lastSyncDateTime) ?? 0) >= 30).length
  const unencrypted = devices.filter(d => !d.isEncrypted).length
  return {
    title: 'Device Inventory',
    fields: [
      { label: 'Total devices', value: total },
      { label: 'By OS', value: topBreakdown(countBy(devices, d => osLabel(d.operatingSystem)), 4) },
      { label: 'Ownership', value: topBreakdown(countBy(devices, d => OWNER_LABELS[(d.managedDeviceOwnerType ?? '').toLowerCase()] ?? 'Unknown')) },
      { label: 'Encrypted', value: `${formatPercent(total - unencrypted, total)} (${formatCount(unencrypted)} not encrypted)` },
      { label: 'Top manufacturers', value: topBreakdown(countBy(devices, d => d.manufacturer || 'Unknown')) },
      { label: 'Enrolled in last 30 days', value: devices.filter(d => (daysAgoOf(d.enrolledDateTime) ?? Infinity) < 30).length },
      { label: 'Not synced in 30+ days', value: notSynced },
    ],
    action: notSynced || unencrypted
      ? [notSynced ? `Check the ${formatCount(notSynced)} device${notSynced === 1 ? '' : 's'} that ${notSynced === 1 ? 'has' : 'have'} not synced in 30+ days` : '', unencrypted ? `${notSynced ? 'and enforce' : 'Enforce'} encryption on ${formatCount(unencrypted)} device${unencrypted === 1 ? '' : 's'}` : ''].filter(Boolean).join(' ') + '.'
      : 'Inventory looks healthy. No action needed.',
    footnote: 'Source: Microsoft Intune',
  }
}

export function buildComplianceOverview(devices: GraphManagedDevice[]): ReportOverview {
  const total = devices.length
  const compliant = devices.filter(d => d.complianceState === 'compliant').length
  const nonCompliant = devices.filter(d => d.complianceState === 'noncompliant')
  const other = total - compliant - nonCompliant.length
  const unencrypted = devices.filter(d => !d.isEncrypted).length
  return {
    title: 'Device Compliance',
    fields: [
      { label: 'Total devices', value: total },
      { label: 'Compliance rate', value: formatPercent(compliant, total) },
      { label: 'Compliant', value: compliant },
      { label: 'Non-compliant', value: nonCompliant.length },
      { label: 'Grace period / unknown / other', value: other },
      { label: 'Not encrypted', value: unencrypted },
      { label: 'Non-compliant by OS', value: topBreakdown(countBy(nonCompliant, d => osLabel(d.operatingSystem))) },
    ],
    action: nonCompliant.length
      ? `Review the ${formatCount(nonCompliant.length)} non-compliant device${nonCompliant.length === 1 ? '' : 's'}${unencrypted ? ` and enforce encryption on ${formatCount(unencrypted)}` : ''}.`
      : 'All reported devices are compliant. No action needed.',
    footnote: 'Source: Microsoft Intune',
  }
}

const EXTENSIONS: Record<ExportFormat, string> = { csv: 'csv', excel: 'xlsx', pdf: 'pdf', pptx: 'pptx' }

async function createDeviceReport(reportType: 'compliance' | 'inventory', format: ExportFormat): Promise<{ content: Buffer; filename: string; rows: number; overview: ReportOverview }> {
  const creds = credentialsFromEnv()
  const devices = await getManagedDevices(creds)

  const data = devices.map(d => ({ ...d, isEncrypted: d.isEncrypted ? 'Yes' : 'No' })) as Record<string, unknown>[]

  const meta = {
    title:       reportType === 'compliance' ? 'Compliance Report' : 'Device Inventory Report',
    subtitle:    `Microsoft Intune · ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}`,
    generatedAt: new Date().toISOString(),
    generatedBy: 'Endpoint Intelligence Platform',
    recordCount: devices.length,
  }

  const summary = [
    { label: 'Total Devices', value: String(devices.length) },
    { label: 'Compliant',     value: String(devices.filter(d => d.complianceState === 'compliant').length),    color: '22C55E' },
    { label: 'Non-Compliant', value: String(devices.filter(d => d.complianceState === 'noncompliant').length), color: 'EF4444' },
    { label: 'Encrypted',     value: String(devices.filter(d => d.isEncrypted).length),                        color: '3B82F6' },
    { label: 'Not Encrypted', value: String(devices.filter(d => !d.isEncrypted).length),                       color: 'F97316' },
  ]

  const filename = `${reportType}-report-${Date.now()}.${EXTENSIONS[format]}`

  const content =
    format === 'csv'   ? Buffer.from(exportToCSV(data, COLUMNS)) :
    format === 'excel' ? await exportToExcel(data, COLUMNS, meta) :
    format === 'pdf'   ? await exportToPDF(data, COLUMNS, meta) :
    await exportToPPTX(data, meta, summary)

  return { content, filename, rows: devices.length, overview: reportType === 'compliance' ? buildComplianceOverview(devices) : buildInventoryOverview(devices) }
}

export const createComplianceReport = (format: ExportFormat) => createDeviceReport('compliance', format)
export const createInventoryReport  = (format: ExportFormat) => createDeviceReport('inventory', format)
