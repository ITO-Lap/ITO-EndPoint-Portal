import { useState } from 'react'
import { Download, ChevronDown, FileText, Sheet, Archive } from 'lucide-react'
import type { DiagnosticDevice, DeviceHealthReport, ApplicationFailureReport, EventLogEntry, AIRecommendation } from '../../types'

interface Props {
  device: DiagnosticDevice
  report?: DeviceHealthReport | null
  failures?: ApplicationFailureReport[]
  logs?: EventLogEntry[]
  aiRec?: AIRecommendation | null
}

function toCSV(headers: string[], rows: string[][]): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  return [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n')
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function ExportReportButton({ device, report, failures = [], logs = [], aiRec }: Props) {
  const [open, setOpen] = useState(false)

  const exportHealthCSV = () => {
    const rows: string[][] = [
      ['Device Name', device.deviceName],
      ['User', device.user],
      ['Platform', device.platform],
      ['OS Version', device.osVersion],
      ['Management Source', device.managementSource],
      ['Uptime', device.uptime],
      ['CPU %', String(device.cpu)],
      ['Memory Used (GB)', String(device.memory.usedGb)],
      ['Memory Total (GB)', String(device.memory.totalGb)],
      ['Disk Used (GB)', String(device.disk.usedGb)],
      ['Disk Total (GB)', String(device.disk.totalGb)],
      ['Network Status', device.network.status],
      ['WiFi SSID', device.network.ssid ?? ''],
      ['IP Address', device.network.ip ?? ''],
      ['Last Sync', device.lastSync],
      ['Compliance State', device.complianceState],
      ['Risk Score', String(device.riskScore)],
      ...(report ? [['Overall Health Score', String(report.overallScore)]] : []),
    ]
    if (report) {
      rows.push(['', ''], ['Category', 'Score', 'Status', 'Top Finding'] as unknown as string[])
      report.categories.forEach(c => rows.push([c.name, String(c.score), c.status, c.findings[0] ?? '']))
    }
    downloadBlob(toCSV(['Field', 'Value'], rows), `health-report-${device.deviceName}.csv`, 'text/csv')
    setOpen(false)
  }

  const exportFailuresCSV = () => {
    const headers = ['App Name','Crash Time','Faulting Module','Error Code','Event ID','Affected User','Severity','Possible Reason','Recommended Fix']
    const rows = failures.map(f => [f.appName, f.crashTime, f.faultingModule, f.errorCode, f.eventId, f.affectedUser, f.severity, f.possibleReason, f.recommendedFix])
    downloadBlob(toCSV(headers, rows), `app-failures-${device.deviceName}.csv`, 'text/csv')
    setOpen(false)
  }

  const exportLogsCSV = () => {
    const headers = ['Timestamp','Level','Source','Event ID','Category','Description']
    const rows = logs.map(l => [l.timestamp, l.level, l.source, l.eventId, l.category, l.description])
    downloadBlob(toCSV(headers, rows), `event-logs-${device.deviceName}.csv`, 'text/csv')
    setOpen(false)
  }

  const exportFullBundle = () => {
    const lines: string[] = [
      '═══════════════════════════════════════════════',
      `SMART DIAGNOSTICS FULL REPORT`,
      `Device: ${device.deviceName}  |  User: ${device.user}`,
      `Generated: ${new Date().toLocaleString()}`,
      '═══════════════════════════════════════════════',
      '',
      '── DEVICE OVERVIEW ──',
      `Platform:     ${device.platform}`,
      `OS Version:   ${device.osVersion}`,
      `Source:       ${device.managementSource}`,
      `Uptime:       ${device.uptime}`,
      `CPU:          ${device.cpu}%`,
      `Memory:       ${device.memory.usedGb}/${device.memory.totalGb} GB`,
      `Disk:         ${device.disk.usedGb}/${device.disk.totalGb} GB`,
      `Network:      ${device.network.status}${device.network.ssid ? ` (${device.network.ssid})` : ''}`,
      `Compliance:   ${device.complianceState}`,
      `Risk Score:   ${device.riskScore}/100`,
      '',
    ]

    if (report) {
      lines.push('── DIAGNOSTIC SCORES ──')
      report.categories.forEach(c => {
        lines.push(`${c.name.padEnd(28)} ${c.score}/100  [${c.status}]`)
        c.findings.forEach(f => lines.push(`  → ${f}`))
      })
      lines.push('')
    }

    if (aiRec) {
      lines.push('── AI ANALYSIS ──')
      lines.push(`Severity: ${aiRec.severity}`)
      lines.push(`Summary: ${aiRec.summary}`)
      lines.push('')
      lines.push('Root Cause:')
      lines.push(aiRec.rootCause)
      lines.push('')
      lines.push('Remediation Steps:')
      aiRec.steps.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`))
      lines.push('')
      lines.push('Helpdesk Explanation:')
      lines.push(aiRec.helpdeskExplanation)
      lines.push('')
    }

    if (failures.length > 0) {
      lines.push('── APPLICATION FAILURES ──')
      failures.forEach(f => {
        lines.push(`[${f.severity}] ${f.appName} — ${f.crashTime}`)
        lines.push(`  Module: ${f.faultingModule}  Error: ${f.errorCode}  Event: ${f.eventId}`)
        lines.push(`  Reason: ${f.possibleReason}`)
        lines.push(`  Fix: ${f.recommendedFix}`)
        lines.push('')
      })
    }

    if (logs.length > 0) {
      lines.push('── EVENT LOGS ──')
      logs.forEach(l => lines.push(`[${l.level.padEnd(12)}] ${l.timestamp}  Evt ${l.eventId}  ${l.source}: ${l.description}`))
    }

    downloadBlob(lines.join('\n'), `diagnostic-bundle-${device.deviceName}.txt`, 'text/plain')
    setOpen(false)
  }

  const exportHealthPDF = () => {
    const html = `<!DOCTYPE html><html><head><title>Health Report — ${device.deviceName}</title>
<style>body{font-family:system-ui,sans-serif;font-size:12px;padding:32px;color:#1e293b}h1{font-size:18px;margin-bottom:4px}h2{font-size:13px;margin:20px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:4px}table{width:100%;border-collapse:collapse}td,th{padding:6px 10px;border:1px solid #e2e8f0;text-align:left}th{background:#f8fafc;font-weight:600}</style></head>
<body>
<h1>Smart Diagnostics Report — ${device.deviceName}</h1>
<p style="color:#64748b">${device.user} · ${device.platform} · Generated ${new Date().toLocaleString()}</p>
<h2>Device Overview</h2>
<table><tr><th>Field</th><th>Value</th></tr>
${[['OS Version',device.osVersion],['Source',device.managementSource],['Uptime',device.uptime],['CPU',`${device.cpu}%`],['Memory',`${device.memory.usedGb}/${device.memory.totalGb} GB`],['Disk',`${device.disk.usedGb}/${device.disk.totalGb} GB`],['Compliance',device.complianceState],['Risk Score',`${device.riskScore}/100`]].map(([k,v])=>`<tr><td>${k}</td><td>${v}</td></tr>`).join('')}
</table>
${report ? `<h2>Diagnostic Scores (Overall: ${report.overallScore}/100)</h2><table><tr><th>Category</th><th>Score</th><th>Status</th><th>Key Finding</th></tr>${report.categories.map(c=>`<tr><td>${c.name}</td><td>${c.score}/100</td><td>${c.status}</td><td>${c.findings[0]??''}</td></tr>`).join('')}</table>` : ''}
${aiRec ? `<h2>AI Analysis</h2><p><strong>Severity:</strong> ${aiRec.severity}</p><p>${aiRec.summary}</p>` : ''}
</body></html>`
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close(); w.print() }
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition"
      >
        <Download className="h-3.5 w-3.5" />
        Export
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <button type="button" className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-20 mt-1 w-52 rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 overflow-hidden">
            {[
              { label: 'Health Report (PDF)',      icon: FileText, action: exportHealthPDF   },
              { label: 'Health Report (CSV)',       icon: Sheet,    action: exportHealthCSV   },
              { label: 'App Failures (CSV)',        icon: Sheet,    action: exportFailuresCSV },
              { label: 'Event Logs (CSV)',          icon: Sheet,    action: exportLogsCSV     },
              { label: 'Full Diagnostic Bundle',   icon: Archive,  action: exportFullBundle  },
            ].map(item => (
              <button
                key={item.label}
                type="button"
                onClick={item.action}
                className="flex w-full items-center gap-3 px-4 py-3 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                <item.icon className="h-3.5 w-3.5 text-slate-400" />
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
