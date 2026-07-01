/**
 * KPI Export Utility
 *
 * Generates a professionally formatted multi-sheet Excel-compatible workbook
 * for any KPI. Uses SpreadsheetML (HTML→XLS) format which Excel reads natively,
 * preserving bold headers, conditional colors, and frozen rows.
 *
 * Architecture: all 18 KPIs reuse the same generateKpiExcel() function.
 * Only the dataset and column config differ.
 */

import type { ApiDevice } from '../api'
import type { KpiConfig, KpiId, KpiFilterOpts } from './kpiConfig'
import { KPI_CONFIGS, fmtDaysAgo, fmtOsStatus, fmtLifecycleStatus, daysSinceCheckIn, versionsBehind } from './kpiConfig'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExportOptions {
  kpiId: KpiId
  allDevices: ApiDevice[]         // full fleet — will be filtered internally
  appliedFilters: string          // human-readable filter summary
  generatedBy: string             // current user's name/email
  opts?: KpiFilterOpts
}

// ── Cell value extractor ──────────────────────────────────────────────────────

function getCellValue(device: ApiDevice, key: string, config: KpiConfig): string {
  // Check if column has a custom render function
  const col = config.columns.find(c => c.key === key)
  if (col?.render) return col.render(device)

  switch (key) {
    case 'deviceName':       return device.deviceName || '—'
    case 'serialNumber':     return device.serialNumber || '—'
    case 'user':             return device.user || '—'
    case 'model':            return device.model || '—'
    case 'managementSource': return device.managementSource || '—'
    case 'osVersion':        return device.osVersion || '—'
    case 'complianceState':  return device.complianceState || '—'
    case 'severity':         return device.severity || '—'
    case 'primaryIssue':     return device.primaryIssue || '—'
    case 'policyFailed':     return device.policyFailed || '—'
    case 'lastCheckIn':      return fmtDaysAgo(device.lastCheckIn)
    case 'riskLevel':        return config.getRiskLevel(device)
    case 'action':           return config.getRecommendedAction(device)
    case 'daysStale':        return String(daysSinceCheckIn(device.lastCheckIn))
    case 'lifecycleStatus':  return fmtLifecycleStatus(device)
    case 'osStatus':         return fmtOsStatus(device.osVersion)
    case 'versionsBehind':   return String(versionsBehind(device.osVersion))
    case 'upgradeEligible':  return versionsBehind(device.osVersion) < 0 ? 'Hardware Limit' : 'Eligible'
    case 'latestVersion':    return '15.5'
    case 'eolStatus':        return device.osVersion?.match(/^1[01]\./) ? '● EOL' : device.osVersion?.match(/^12\./) ? '⚠ Near EOL' : '—'
    case 'patchStatus':      return device.complianceState === 'Compliant' && !device.primaryIssue ? 'Fully Patched' : 'Has Issues'
    default:                 return (device as unknown as Record<string, string>)[key] ?? '—'
  }
}

// ── Risk color for conditional formatting ─────────────────────────────────────

function riskColor(level: string): string {
  switch (level) {
    case 'Critical': return '#FEE2E2'  // light red
    case 'High':     return '#FEF3C7'  // light amber
    case 'Medium':   return '#FFF7ED'  // light orange
    case 'Low':      return '#F0FDF4'  // light green
    default:         return '#FFFFFF'
  }
}

function complianceColor(state: string): string {
  switch (state) {
    case 'Non-Compliant': return '#FEE2E2'
    case 'Warning':       return '#FEF3C7'
    case 'Compliant':     return '#F0FDF4'
    default:              return '#FFFFFF'
  }
}

// ── SpreadsheetML HTML generator ─────────────────────────────────────────────

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function th(text: string): string {
  return `<td style="background:#1E293B;color:#FFFFFF;font-weight:bold;font-size:11px;padding:6px 10px;border:1px solid #334155;">${escapeXml(text)}</td>`
}

function td(text: string, bgColor = '#FFFFFF'): string {
  return `<td style="background:${bgColor};font-size:11px;padding:5px 10px;border:1px solid #E2E8F0;">${escapeXml(text)}</td>`
}

function sectionHeader(text: string): string {
  return `<tr><td colspan="20" style="background:#7C5CFC;color:#FFFFFF;font-weight:bold;font-size:13px;padding:8px 12px;">${escapeXml(text)}</td></tr>`
}

// ── Sheet 1: Executive Summary ────────────────────────────────────────────────

function buildSummarySheet(
  config: KpiConfig,
  kpiValue: string | number,
  devices: ApiDevice[],
  appliedFilters: string,
  generatedBy: string,
  now: Date,
): string {
  const dateStr  = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr  = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })

  return `
    <table style="font-family:Arial,sans-serif;border-collapse:collapse;width:600px;">
      ${sectionHeader('KPI Report — Executive Summary')}
      <tr><td style="height:12px;"></td></tr>

      <tr>${th('Field')}${th('Value')}</tr>
      <tr>${td('KPI Name')}${td(config.title)}</tr>
      <tr>${td('KPI Value')}${td(String(kpiValue), '#EFF6FF')}</tr>
      <tr>${td('Total Records')}${td(String(devices.length))}</tr>
      <tr>${td('Group')}${td(config.group)}</tr>
      <tr>${td('Description')}${td(config.description)}</tr>
      <tr>${td('Applied Filters')}${td(appliedFilters || 'None')}</tr>
      <tr>${td('Generated Date')}${td(dateStr)}</tr>
      <tr>${td('Generated Time')}${td(timeStr)}</tr>
      <tr>${td('Generated By')}${td(generatedBy)}</tr>
      <tr>${td('Platform')}${td('ITO Endpoint — Mac Fleet Reports')}</tr>
      <tr><td style="height:12px;"></td></tr>

      ${sectionHeader('Report Scope')}
      <tr>${th('Metric')}${th('Count')}</tr>
      <tr>${td('Total devices in KPI')}${td(String(devices.length))}</tr>
      <tr>${td('Critical risk')}${td(String(devices.filter(d => config.getRiskLevel(d) === 'Critical').length), '#FEE2E2')}</tr>
      <tr>${td('High risk')}${td(String(devices.filter(d => config.getRiskLevel(d) === 'High').length), '#FEF3C7')}</tr>
      <tr>${td('Medium risk')}${td(String(devices.filter(d => config.getRiskLevel(d) === 'Medium').length), '#FFF7ED')}</tr>
      <tr>${td('Low risk')}${td(String(devices.filter(d => config.getRiskLevel(d) === 'Low').length), '#F0FDF4')}</tr>
    </table>
  `
}

// ── Sheet 2: Device Details ───────────────────────────────────────────────────

function buildDeviceDetailsSheet(config: KpiConfig, devices: ApiDevice[]): string {
  if (devices.length === 0) {
    return `<table style="font-family:Arial,sans-serif;">
      <tr><td style="padding:20px;color:#6B7280;font-style:italic;">No devices match this KPI with the current filters applied.</td></tr>
    </table>`
  }

  const visibleCols = config.columns.filter(c => c.visible)
  const headerRow   = `<tr>${visibleCols.map(c => th(c.label)).join('')}</tr>`

  const dataRows = devices.map(device => {
    const risk = config.getRiskLevel(device)
    const bg   = riskColor(risk)
    return `<tr>${visibleCols.map(col => {
      const val = getCellValue(device, col.key, config)
      // Apply conditional coloring per column
      let cellBg = '#FFFFFF'
      if (col.key === 'riskLevel' || col.key === 'severity') cellBg = riskColor(val)
      else if (col.key === 'complianceState')                 cellBg = complianceColor(val)
      else if (col.key === 'eolStatus' && val.includes('EOL')) cellBg = '#FEE2E2'
      else if (col.key === 'lifecycleStatus' && (val === 'Inactive' || val === 'EOL')) cellBg = '#FEE2E2'
      else if (col.key === 'patchStatus' && val !== 'Fully Patched') cellBg = '#FEF3C7'
      void bg
      return td(val, cellBg)
    }).join('')}</tr>`
  }).join('')

  return `
    <table style="font-family:Arial,sans-serif;border-collapse:collapse;">
      ${sectionHeader(`${config.title} — Device Details (${devices.length} records)`)}
      ${headerRow}
      ${dataRows}
    </table>
  `
}

// ── Sheet 3: Recommendations ──────────────────────────────────────────────────

function buildRecommendationsSheet(config: KpiConfig, devices: ApiDevice[]): string {
  // Deduplicate by recommended action to give management a clean action list
  const actionMap = new Map<string, { devices: string[]; risk: string; count: number }>()

  devices.forEach(device => {
    const action = config.getRecommendedAction(device)
    const risk   = config.getRiskLevel(device)
    if (!actionMap.has(action)) actionMap.set(action, { devices: [], risk, count: 0 })
    const entry = actionMap.get(action)!
    entry.devices.push(device.deviceName)
    entry.count++
  })

  const sortOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 }
  const sorted    = [...actionMap.entries()].sort((a, b) =>
    (sortOrder[a[1].risk as keyof typeof sortOrder] ?? 4) -
    (sortOrder[b[1].risk as keyof typeof sortOrder] ?? 4)
  )

  const summaryRows = sorted.map(([action, data]) =>
    `<tr>
      ${td(String(data.count))}
      ${td(action)}
      ${td(data.risk, riskColor(data.risk))}
      ${td(data.risk === 'Critical' ? 'Immediate (24h)' : data.risk === 'High' ? 'This week' : data.risk === 'Medium' ? 'This month' : 'Next quarter')}
    </tr>`
  ).join('')

  // Per-device detail rows
  const detailRows = devices
    .sort((a, b) => {
      const ra = config.getRiskLevel(a), rb = config.getRiskLevel(b)
      return (sortOrder[ra] ?? 4) - (sortOrder[rb] ?? 4)
    })
    .map(d => {
      const action = config.getRecommendedAction(d)
      const risk   = config.getRiskLevel(d)
      return `<tr>
        ${td(d.deviceName)}
        ${td(d.user || '—')}
        ${td(config.columns.find(c => c.key === 'primaryIssue') ? (d.primaryIssue || 'See KPI details') : 'See KPI details')}
        ${td(risk, riskColor(risk))}
        ${td(action)}
        ${td(risk === 'Critical' ? 'P1 — Immediate' : risk === 'High' ? 'P2 — This week' : risk === 'Medium' ? 'P3 — This month' : 'P4 — Planned')}
      </tr>`
    }).join('')

  return `
    <table style="font-family:Arial,sans-serif;border-collapse:collapse;margin-bottom:20px;">
      ${sectionHeader('Recommended Actions Summary')}
      <tr>${th('Device Count')}${th('Recommended Action')}${th('Risk Level')}${th('Priority Timeframe')}</tr>
      ${summaryRows}
    </table>
    <table style="font-family:Arial,sans-serif;border-collapse:collapse;">
      ${sectionHeader('Per-Device Recommendations')}
      <tr>${th('Device Name')}${th('Assigned User')}${th('Issue')}${th('Risk')}${th('Recommended Action')}${th('Priority')}</tr>
      ${detailRows}
    </table>
  `
}

// ── Main export function ───────────────────────────────────────────────────────

export function generateKpiExcel(options: ExportOptions): void {
  const { kpiId, allDevices, appliedFilters, generatedBy, opts } = options
  const config  = KPI_CONFIGS[kpiId]
  const devices = config.filterFn(allDevices, opts)
  const kpiValue = config.getValue(allDevices, opts)
  const now      = new Date()

  // File name: KPI_Name_Report_YYYY-MM-DD.xls
  const fileDate = now.toISOString().slice(0, 10)
  const safeName = config.title.replace(/[^a-zA-Z0-9]+/g, '_')
  const fileName = `${safeName}_Report_${fileDate}.xls`

  // Build the multi-sheet SpreadsheetML document
  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="UTF-8">
      <meta name="ProgId" content="Excel.Sheet">
      <meta name="Generator" content="ITO Endpoint Mac Fleet Reports">
      <!--[if gte mso 9]>
      <xml>
        <x:ExcelWorkbook>
          <x:ExcelWorksheets>
            <x:ExcelWorksheet>
              <x:Name>Summary</x:Name>
              <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
            </x:ExcelWorksheet>
            <x:ExcelWorksheet>
              <x:Name>Device Details</x:Name>
              <x:WorksheetOptions><x:DisplayGridlines/><x:FreezePanes/><x:FrozenNoSplit/><x:SplitHorizontal>1</x:SplitHorizontal><x:TopRowBottomPane>1</x:TopRowBottomPane></x:WorksheetOptions>
            </x:ExcelWorksheet>
            <x:ExcelWorksheet>
              <x:Name>Recommendations</x:Name>
              <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
            </x:ExcelWorksheet>
          </x:ExcelWorksheets>
        </x:ExcelWorkbook>
      </xml>
      <![endif]-->
      <style>
        body { font-family: Arial, sans-serif; }
        table { border-collapse: collapse; margin-bottom: 30px; }
        td, th { padding: 5px 10px; border: 1px solid #E2E8F0; font-size: 11px; }
        .page-break { page-break-after: always; }
      </style>
    </head>
    <body>
      <!-- Sheet 1: Summary -->
      <div class="page-break">
        ${buildSummarySheet(config, kpiValue, devices, appliedFilters, generatedBy, now)}
      </div>

      <!-- Sheet 2: Device Details -->
      <div class="page-break">
        ${buildDeviceDetailsSheet(config, devices)}
      </div>

      <!-- Sheet 3: Recommendations -->
      <div>
        ${buildRecommendationsSheet(config, devices)}
      </div>
    </body>
    </html>
  `

  // Trigger download
  const blob = new Blob(['﻿' + html], {
    type: 'application/vnd.ms-excel;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── CSV export fallback ───────────────────────────────────────────────────────

export function generateKpiCsv(options: ExportOptions): void {
  const { kpiId, allDevices, opts } = options
  const config  = KPI_CONFIGS[kpiId]
  const devices = config.filterFn(allDevices, opts)
  const now     = new Date()
  const fileDate = now.toISOString().slice(0, 10)
  const safeName = config.title.replace(/[^a-zA-Z0-9]+/g, '_')

  const cols    = config.columns.filter(c => c.visible)
  const header  = cols.map(c => `"${c.label}"`).join(',')
  const rows    = devices.map(d =>
    cols.map(col => {
      const v = getCellValue(d, col.key, config)
      return `"${v.replace(/"/g, '""')}"`
    }).join(',')
  )

  const csv = [header, ...rows].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${safeName}_${fileDate}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
