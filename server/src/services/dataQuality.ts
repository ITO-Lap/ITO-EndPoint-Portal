// Data-quality checks shown with every report: what was verified, and what the
// reader should be careful about. Slack shows only the warnings (a green line
// when everything passed); the workbook's "Data Quality" sheet lists every check.

export type CheckStatus = 'ok' | 'warn' | 'info'

export interface DataCheck {
  status: CheckStatus
  /** Short name, e.g. "Source completeness". */
  label: string
  detail: string
}

export const ok   = (label: string, detail: string): DataCheck => ({ status: 'ok', label, detail })
export const warn = (label: string, detail: string): DataCheck => ({ status: 'warn', label, detail })
export const info = (label: string, detail: string): DataCheck => ({ status: 'info', label, detail })

const n = (v: number) => v.toLocaleString('en-US')

/**
 * Compares what the report counted with the count Microsoft Graph reports for
 * the same collection (`/$count`). `graphCount` null means Graph could not be
 * asked, which is itself a warning: the figure is then unverified.
 */
export function reconcileCount(label: string, reported: number, graphCount: number | null, tolerancePct = 1): DataCheck {
  if (graphCount === null) return warn(label, `Could not verify against Microsoft Graph; the report counted ${n(reported)}.`)
  const diff = reported - graphCount
  const allowed = Math.max(1, Math.round((graphCount * tolerancePct) / 100))
  if (Math.abs(diff) <= allowed) return ok(label, `Report counted ${n(reported)}; Microsoft Graph reports ${n(graphCount)}.`)
  return warn(label, `Report counted ${n(reported)} but Microsoft Graph reports ${n(graphCount)} (${diff > 0 ? '+' : '−'}${n(Math.abs(diff))}). Figures may be incomplete or stale.`)
}

export const warnings = (checks: DataCheck[] | undefined): DataCheck[] => (checks ?? []).filter(c => c.status === 'warn')

const ICON: Record<CheckStatus, string> = { ok: '✅', warn: '⚠️', info: 'ℹ️' }
export const checkIcon = (s: CheckStatus): string => ICON[s]

/** Slack mrkdwn for the data-quality section: warnings (max 3, then "+N more"), or one green line. */
export function dataNotesText(checks: DataCheck[] | undefined): string | null {
  if (!checks?.length) return null
  const bad = warnings(checks)
  if (!bad.length) return `✅ All ${checks.filter(c => c.status === 'ok').length} data checks passed.`
  const shown = bad.slice(0, 3).map(c => `⚠️ *${c.label}:* ${c.detail}`)
  if (bad.length > 3) shown.push(`_+${bad.length - 3} more data warning${bad.length - 3 === 1 ? '' : 's'}; see the Data Quality sheet._`)
  else shown.push('_Details are in the Data Quality sheet._')
  return shown.join('\n')
}

/** Adds the "Data Quality" sheet to an ExcelJS workbook. */
export function addDataQualitySheet(wb: import('exceljs').Workbook, checks: DataCheck[] | undefined): void {
  if (!checks?.length) return
  const ws = wb.addWorksheet('Data Quality', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = [{ header: 'Status', key: 'status', width: 10 }, { header: 'Check', key: 'label', width: 34 }, { header: 'Detail', key: 'detail', width: 110 }]
  ws.getRow(1).eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } } })
  const fills: Record<CheckStatus, string> = { ok: 'FFDCFCE7', warn: 'FFFEF3C7', info: 'FFE0F2FE' }
  const words: Record<CheckStatus, string> = { ok: 'Passed', warn: 'Warning', info: 'Note' }
  for (const c of [...checks].sort((a, b) => Number(b.status === 'warn') - Number(a.status === 'warn'))) {
    const row = ws.addRow({ status: words[c.status], label: c.label, detail: c.detail })
    row.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills[c.status] } }
    row.getCell('detail').alignment = { wrapText: true, vertical: 'top' }
  }
}
