// Executes scheduled reports — generates the report for the schedule's
// report_type, then delivers it via whichever channel the schedule has
// configured (a Slack channel in `filters.slackChannelId`, or email
// recipients). Persists via scheduledReportsStore.ts (no database).
//
// Schedules whose "Slack Notification Schedule" section has been opened are
// excluded here — server/src/services/notificationScheduler.ts's generic
// poll loop takes over sending those (it calls runScheduledReportNow() too,
// just on its own day/time-driven schedule instead of raw cron), so both
// engines never fire for the same report.

import * as store from '../store/scheduledReportsStore.js'
import type { ScheduledReportRecord } from '../store/scheduledReportsStore.js'
import { createCriticalPatchReport } from './criticalPatchReport.js'
import { createStaleDevicesReport } from './staleDevicesReport.js'
import { createComplianceReport, createInventoryReport } from './complianceInventoryReport.js'
import type { ExportFormat } from './reportExporter.js'
import { uploadSlackFile } from './slack.js'
import { getSlackConfig } from '../store/integrationStore.js'
import { createAppUpdatesReport } from './appIntel/updateReport.js'
import { sendReportEmail } from './reportEmail.js'
import { sendFleetDigest } from './fleetDigest.js'
import { buildOverviewMessage, overviewToText, type ReportOverview } from './reportOverview.js'
import { sendDuplicateDevicesReport } from './entraDuplicateDevicesReport.js'

function matchesPart(value: number, expression: string): boolean {
  return expression.split(',').some(part => {
    const [base = '', stepRaw] = part.split('/')
    const step = stepRaw ? Number(stepRaw) : 1
    if (!Number.isInteger(step) || step < 1) return false
    const inRange = base === '*' ? true : base.includes('-')
      ? (() => { const [from = NaN, to = NaN] = base.split('-').map(Number); return value >= from && value <= to })()
      : Number(base) === value
    return inRange && (base === '*' || !stepRaw || value % step === 0)
  })
}

function timezoneParts(now: Date, timezone: string): { minute: number; hour: number; day: number; month: number; weekday: number } | null {
  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
    }).formatToParts(now)
    const values = Object.fromEntries(formatted.map(({ type, value }) => [type, value]))
    const weekdayLabel = values.weekday
    if (typeof weekdayLabel !== 'string') return null
    const weekday = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[weekdayLabel as 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat']
    if (weekday === undefined) return null
    return { minute: Number(values.minute), hour: Number(values.hour), day: Number(values.day), month: Number(values.month), weekday }
  } catch { return null }
}

export function cronMatchesNow(expression: string, now = new Date(), timezone = 'UTC'): boolean {
  const [minute = '', hour = '', day = '', month = '', weekday = ''] = expression.trim().split(/\s+/)
  if (!minute || !hour || !day || !month || !weekday) return false
  const parts = timezoneParts(now, timezone)
  if (!parts) return false
  return matchesPart(parts.minute, minute) && matchesPart(parts.hour, hour)
    && matchesPart(parts.day, day) && matchesPart(parts.month, month)
    && matchesPart(parts.weekday, weekday)
}

function slackChannel(filters: Record<string, unknown>): string | null {
  const value = filters.slackChannelId
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function scheduleTimezone(filters: Record<string, unknown>): string {
  const value = filters.timezone
  return typeof value === 'string' && value.trim() ? value.trim() : 'UTC'
}

const CONTENT_TYPES: Record<string, string> = {
  csv:   'text/csv',
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf:   'application/pdf',
  pptx:  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

async function generateReportContent(schedule: ScheduledReportRecord): Promise<{ content: Buffer; filename: string; rows: number; overview?: ReportOverview }> {
  switch (schedule.report_type) {
    case 'fleet-digest':
    case 'entra-duplicate-devices': throw new Error(`${schedule.report_type} is delivered as a Slack message, not a file`)
    case 'critical-patching': { const r = await createCriticalPatchReport(); return { content: r.content, filename: r.filename, rows: r.rows, overview: r.overview } }
    case 'stale-devices':     { const r = await createStaleDevicesReport(); return { content: r.content, filename: r.filename, rows: r.rows.length, overview: r.overview } }
    case 'app-updates':       { const r = await createAppUpdatesReport(); return { content: r.content, filename: r.filename, rows: r.rows, overview: r.overview } }
    case 'compliance':        return createComplianceReport(schedule.format as ExportFormat)
    case 'inventory':         return createInventoryReport(schedule.format as ExportFormat)
  }
}

async function deliver(schedule: ScheduledReportRecord, content: Buffer, filename: string, overview?: ReportOverview): Promise<{ ok: boolean; error?: string }> {
  const channelId = slackChannel(schedule.filters)
  if (channelId) {
    const cfg = getSlackConfig()
    if (!cfg?.botToken) return { ok: false, error: 'Slack Bot OAuth token is not configured.' }
    // With an overview, the headline figures and the file arrive as one message
    // (Slack ignores blocks when an initial comment is present, so send only one).
    const today = new Date().toISOString().slice(0, 10)
    return uploadSlackFile(cfg, {
      channelId, filename, title: schedule.name, content,
      ...(overview ? { blocks: buildOverviewMessage(overview, today).blocks } : { initialComment: `📊 ${schedule.name}` }),
    })
  }
  if (schedule.recipients.length > 0) {
    return sendReportEmail({
      recipients: schedule.recipients, subject: schedule.name,
      message: overview ? `${overviewToText(overview)}\n\nThe full report "${schedule.name}" is attached.` : `Your scheduled report "${schedule.name}" is attached.`,
      filename, content, contentType: CONTENT_TYPES[schedule.format] ?? 'application/octet-stream',
    })
  }
  return { ok: false, error: 'This schedule has no Slack channel or email recipients configured.' }
}

async function run(schedule: ScheduledReportRecord, triggeredBy: 'manual' | 'scheduler') {
  const startedAt = new Date().toISOString()
  try {
    if (schedule.report_type === 'fleet-digest') {
      const channelId = slackChannel(schedule.filters)
      if (!channelId) throw new Error('The fleet digest is delivered to Slack; configure a Slack channel for this schedule.')
      const digest = await sendFleetDigest(channelId)
      if (!digest.ok) throw new Error(digest.error ?? 'Delivery failed')
      const runRecord = await store.recordReportRun(schedule.id, {
        status: 'completed', format: schedule.format, record_count: digest.snapshot?.total ?? null, file_size_bytes: null,
        error_message: null, triggered_by: triggeredBy, started_at: startedAt, completed_at: new Date().toISOString(),
      })
      return { ok: true, runId: runRecord?.id, rows: digest.snapshot?.total ?? 0, filename: undefined }
    }
    if (schedule.report_type === 'entra-duplicate-devices') {
      const channelId = slackChannel(schedule.filters)
      if (!channelId) throw new Error('The duplicate Entra devices report is delivered to Slack; configure a Slack channel for this schedule.')
      const result = await sendDuplicateDevicesReport(channelId)
      if (!result.ok) throw new Error(result.error ?? 'Delivery failed')
      const runRecord = await store.recordReportRun(schedule.id, {
        status: 'completed', format: schedule.format, record_count: result.groups ?? 0, file_size_bytes: null,
        error_message: null, triggered_by: triggeredBy, started_at: startedAt, completed_at: new Date().toISOString(),
      })
      return { ok: true, runId: runRecord?.id, rows: result.groups ?? 0, filename: undefined }
    }
    const report = await generateReportContent(schedule)
    const delivery = await deliver(schedule, report.content, report.filename, report.overview)
    if (!delivery.ok) throw new Error(delivery.error ?? 'Delivery failed')
    const runRecord = await store.recordReportRun(schedule.id, {
      status: 'completed', format: schedule.format, record_count: report.rows, file_size_bytes: report.content.length,
      error_message: null, triggered_by: triggeredBy, started_at: startedAt, completed_at: new Date().toISOString(),
    })
    return { ok: true, runId: runRecord?.id, rows: report.rows, filename: report.filename }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await store.recordReportRun(schedule.id, {
      status: 'failed', format: schedule.format, record_count: null, file_size_bytes: null,
      error_message: message, triggered_by: triggeredBy, started_at: startedAt, completed_at: new Date().toISOString(),
    })
    throw error
  }
}

export async function runScheduledReportNow(id: string) {
  const schedule = await store.getReport(id)
  if (!schedule) throw new Error('Schedule not found')
  return run(schedule, 'manual')
}

export async function runDueReports(): Promise<void> {
  const now = new Date()
  const currentMinute = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())
  const [allReports, allNotificationSchedules] = await Promise.all([store.listReports(), store.listAllNotificationSchedules()])
  const hasNotificationSchedule = new Set(allNotificationSchedules.filter(s => s.module === 'scheduled_report').map(s => s.source_id))
  const due = allReports.filter(schedule =>
    schedule.is_active
    && (!schedule.last_run_at || new Date(schedule.last_run_at) < currentMinute)
    && !hasNotificationSchedule.has(schedule.id)
    && cronMatchesNow(schedule.schedule_cron, now, scheduleTimezone(schedule.filters))
  )
  for (const schedule of due) {
    try { await run(schedule, 'scheduler') }
    catch (error) { console.error(`[scheduled-reports] ${schedule.name} failed:`, error) }
  }
}

let timer: NodeJS.Timeout | undefined
export function startScheduledReportRunner() {
  if (timer) return
  const tick = () => { void runDueReports() }
  tick()
  timer = setInterval(tick, 60_000)
}
export function stopScheduledReportRunner() { if (timer) clearInterval(timer); timer = undefined }
