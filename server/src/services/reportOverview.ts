// Shared "overview + attachment" Slack message for scheduled reports: a header,
// up to ten headline figures, a recommended action and a footnote, sent in the
// same message as the Excel file (see uploadSlackFile's `blocks`). Each report
// builds its own ReportOverview from the data it already holds.

import { dataNotesText, checkIcon, type DataCheck } from './dataQuality.js'

export interface ReportOverview {
  title: string
  /** Headline figures, shown two per row. Slack allows at most 10 fields per section. */
  fields: Array<{ label: string; value: string | number }>
  action: string
  footnote?: string
  /** Reconciliation / data-quality checks; warnings are shown in Slack, all of them in the workbook. */
  dataChecks?: DataCheck[]
}

const MAX_FIELDS = 10
const num = (n: number) => n.toLocaleString('en-US')

export const formatCount = num
export const formatPercent = (part: number, whole: number): string => (whole > 0 ? `${Math.round((part / whole) * 1000) / 10}%` : '0%')

/** "Windows 3,034 · iOS 921 · macOS 407", largest first, with an "+N more" tail. */
export function topBreakdown(counts: Map<string, number>, limit = 3): string {
  const sorted = [...counts].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  if (!sorted.length) return 'None'
  const shown = sorted.slice(0, limit).map(([k, n]) => `${k} ${num(n)}`)
  return sorted.length > limit ? `${shown.join(' · ')} · +${sorted.length - limit} more` : shown.join(' · ')
}

export function countBy<T>(items: T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) { const k = key(item) || 'Unknown'; counts.set(k, (counts.get(k) ?? 0) + 1) }
  return counts
}

export function buildOverviewMessage(overview: ReportOverview, date: string): { text: string; blocks: unknown[] } {
  const fields = overview.fields.slice(0, MAX_FIELDS).map(f => ({ type: 'mrkdwn', text: `*${f.label}*\n${typeof f.value === 'number' ? num(f.value) : f.value}` }))
  const notes = dataNotesText(overview.dataChecks)
  const blocks: unknown[] = [
    { type: 'header', text: { type: 'plain_text', text: `${overview.title} · ${date}` } },
    { type: 'section', fields },
    { type: 'section', text: { type: 'mrkdwn', text: `*Recommended action*\n${overview.action}` } },
    ...(notes ? [{ type: 'section', text: { type: 'mrkdwn', text: `*Data quality*\n${notes}` } }] : []),
    { type: 'context', elements: [{ type: 'mrkdwn', text: `${overview.footnote ? `${overview.footnote} · ` : ''}ITO Endpoint` }] },
  ]
  const first = overview.fields[0]
  return { text: `${overview.title} ${date}${first ? `: ${first.label} ${typeof first.value === 'number' ? num(first.value) : first.value}` : ''}`, blocks }
}

/** Plain-text version for email bodies. */
export function overviewToText(overview: ReportOverview): string {
  return [overview.title, '', ...overview.fields.map(f => `${f.label}: ${typeof f.value === 'number' ? num(f.value) : f.value}`), '', `Recommended action: ${overview.action}`, ...(overview.dataChecks?.length ? ['', 'Data quality:', ...overview.dataChecks.filter(c => c.status !== 'ok').map(c => `${checkIcon(c.status)} ${c.label}: ${c.detail}`)] : []), ...(overview.footnote ? ['', overview.footnote] : [])].join('\n')
}
