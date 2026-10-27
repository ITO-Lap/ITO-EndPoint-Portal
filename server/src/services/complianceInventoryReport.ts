// Compliance / Device Inventory report generation — extracted from
// server/src/routes/intelligence.ts's POST /export (which now calls these
// functions too, removing the duplication) so scheduled reports can generate
// the exact same content as the on-demand export, without going through
// Express req/res. Mirrors the shape of createCriticalPatchReport() /
// createStaleDevicesReport() (criticalPatchReport.ts / staleDevicesReport.ts).

import { credentialsFromEnv, getManagedDevices } from './graphApi.js'
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

const EXTENSIONS: Record<ExportFormat, string> = { csv: 'csv', excel: 'xlsx', pdf: 'pdf', pptx: 'pptx' }

async function createDeviceReport(reportType: 'compliance' | 'inventory', format: ExportFormat): Promise<{ content: Buffer; filename: string; rows: number }> {
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

  return { content, filename, rows: devices.length }
}

export const createComplianceReport = (format: ExportFormat) => createDeviceReport('compliance', format)
export const createInventoryReport  = (format: ExportFormat) => createDeviceReport('inventory', format)
