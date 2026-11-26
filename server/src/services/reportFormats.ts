// Which scheduled report types can honour the Format choice.
// These four build their own multi-sheet Excel workbook, so they are always .xlsx; compliance and inventory
// are generated from rows and can be CSV, PDF, Excel or PowerPoint. The Slack-only digests are messages, not files.

export type ScheduledFormat = 'pdf' | 'excel' | 'csv' | 'pptx'

export const EXCEL_ONLY_TYPES: ReadonlySet<string> = new Set(['critical-patching', 'stale-devices', 'windows-updates', 'app-updates'])

/** The format that is actually produced, whatever was requested. */
export const effectiveFormat = (reportType: string, requested: string): ScheduledFormat =>
  (EXCEL_ONLY_TYPES.has(reportType) ? 'excel' : requested) as ScheduledFormat
