// Persistence for Scheduled Reports and their Slack notification schedules —
// dual-backend, chosen once at process start via isDbAvailable():
//
//   DATABASE_URL set      → PostgreSQL (scheduled_reports, report_runs,
//                            notification_schedules, schedule_audit_log —
//                            see server/src/db/schema.sql). Durable, backed
//                            up with the rest of the DB, safe across multiple
//                            app instances, and queryable for history/trends.
//   DATABASE_URL unset    → a JSON file (server/.scheduled-reports.json),
//                            so this feature still works with zero database
//                            dependency. Single-process-safe only (see the
//                            note on claimDueNotificationSchedules below).
//
// Every exported function is async so both backends share one call-site
// contract — callers never need to know which backend is live.

import { dataFile, legacyServerFile, readJsonFile, writeJsonAtomic } from './dataDir.js'
import { randomUUID } from 'crypto'
import { isDbAvailable, query } from '../db/index.js'

export type ReportType = 'critical-patching' | 'stale-devices' | 'compliance' | 'inventory' | 'app-updates' | 'fleet-digest' | 'entra-duplicate-devices'
export type ReportFormat = 'pdf' | 'excel' | 'csv' | 'pptx'
export type NotificationFrequency = 'daily' | 'weekly'

export interface ReportRunRecord {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  format: string
  record_count: number | null
  file_size_bytes: number | null
  error_message: string | null
  triggered_by: 'scheduler' | 'manual' | 'api'
  started_at: string
  completed_at: string | null
}

export interface ScheduledReportRecord {
  id: string
  name: string
  report_type: ReportType
  schedule_cron: string
  format: ReportFormat
  recipients: string[]
  filters: Record<string, unknown>
  is_active: boolean
  last_run_at: string | null
  next_run_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  runs: ReportRunRecord[]
}

export interface NotificationScheduleRecord {
  id: string
  module: string
  source_id: string
  is_enabled: boolean
  frequency: NotificationFrequency
  weekdays: number[]
  execution_time: string
  timezone: string
  next_run_at: string | null
  is_running: boolean
  last_run_at: string | null
  last_run_status: 'completed' | 'failed' | null
  last_run_error: string | null
  created_by: string
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface ScheduleAuditEntry {
  id: string
  userEmail: string
  action: string
  resourceId: string
  oldValue: unknown
  newValue: unknown
  createdAt: string
}

const USE_DB = isDbAvailable()

// ─── DB row → record mappers ────────────────────────────────────────────────

interface ReportRow {
  id: string; name: string; report_type: ReportType; schedule_cron: string; format: ReportFormat
  recipients: string[]; filters: Record<string, unknown>; is_active: boolean
  last_run_at: Date | null; next_run_at: Date | null; created_by: string | null
  created_at: Date; updated_at: Date
}
function reportFromRow(r: ReportRow): ScheduledReportRecord {
  return {
    id: r.id, name: r.name, report_type: r.report_type, schedule_cron: r.schedule_cron, format: r.format,
    recipients: r.recipients, filters: r.filters, is_active: r.is_active,
    last_run_at: r.last_run_at?.toISOString() ?? null, next_run_at: r.next_run_at?.toISOString() ?? null,
    created_by: r.created_by, created_at: r.created_at.toISOString(), updated_at: r.updated_at.toISOString(), runs: [],
  }
}

interface RunRow {
  id: string; status: ReportRunRecord['status']; format: string; record_count: number | null
  file_size_bytes: number | null; error_message: string | null; triggered_by: ReportRunRecord['triggered_by']
  started_at: Date; completed_at: Date | null
}
function runFromRow(r: RunRow): ReportRunRecord {
  return {
    id: r.id, status: r.status, format: r.format, record_count: r.record_count, file_size_bytes: r.file_size_bytes,
    error_message: r.error_message, triggered_by: r.triggered_by,
    started_at: r.started_at.toISOString(), completed_at: r.completed_at?.toISOString() ?? null,
  }
}

interface ScheduleRow {
  id: string; module: string; source_id: string; is_enabled: boolean; frequency: NotificationFrequency
  weekdays: number[]; execution_time: string; timezone: string; next_run_at: Date | null; is_running: boolean
  last_run_at: Date | null; last_run_status: NotificationScheduleRecord['last_run_status']; last_run_error: string | null
  created_by: string; updated_by: string | null; created_at: Date; updated_at: Date
}
function scheduleFromRow(r: ScheduleRow): NotificationScheduleRecord {
  return {
    id: r.id, module: r.module, source_id: r.source_id, is_enabled: r.is_enabled, frequency: r.frequency,
    weekdays: r.weekdays, execution_time: r.execution_time, timezone: r.timezone,
    next_run_at: r.next_run_at?.toISOString() ?? null, is_running: r.is_running,
    last_run_at: r.last_run_at?.toISOString() ?? null, last_run_status: r.last_run_status, last_run_error: r.last_run_error,
    created_by: r.created_by, updated_by: r.updated_by, created_at: r.created_at.toISOString(), updated_at: r.updated_at.toISOString(),
  }
}

interface AuditRow { id: string; user_email: string; action: string; resource_id: string; old_value: unknown; new_value: unknown; created_at: Date }
function auditFromRow(r: AuditRow): ScheduleAuditEntry {
  return { id: r.id, userEmail: r.user_email, action: r.action, resourceId: r.resource_id, oldValue: r.old_value, newValue: r.new_value, createdAt: r.created_at.toISOString() }
}

// ─── JSON-file backend (used only when DATABASE_URL is unset) ──────────────

interface StoreFile {
  reports: ScheduledReportRecord[]
  notificationSchedules: NotificationScheduleRecord[]
  auditLog: ScheduleAuditEntry[]
}

// Resolves to <repo>/server/.scheduled-reports.json whether running from
// compiled server/dist/store/ or (in tests) directly from server/src/store/
// — both sit exactly two levels below server/.
const STORE_FILE = dataFile('scheduled-reports.json', [legacyServerFile('.scheduled-reports.json')])
const MAX_RUNS_PER_REPORT = 50
const MAX_AUDIT_ENTRIES = 200

function emptyFile(): StoreFile {
  return { reports: [], notificationSchedules: [], auditLog: [] }
}

function load(): StoreFile {
  try {
    const parsed = readJsonFile<Partial<StoreFile>>(STORE_FILE) ?? {}
    return { reports: parsed.reports ?? [], notificationSchedules: parsed.notificationSchedules ?? [], auditLog: parsed.auditLog ?? [] }
  } catch {
    return emptyFile()
  }
}

function persist(): void {
  try {
    writeJsonAtomic(STORE_FILE, state)
  } catch (e) {
    console.error('[scheduledReportsStore] Failed to persist store:', e)
  }
}

let state: StoreFile = USE_DB ? emptyFile() : load()

/** Test-only: reset in-memory state without touching the on-disk file. */
export function __resetStateForTests(initial: Partial<StoreFile> = {}): void {
  state = { ...emptyFile(), ...initial }
}

// ─── Scheduled reports ──────────────────────────────────────────────────────

export async function listReports(): Promise<ScheduledReportRecord[]> {
  if (USE_DB) {
    const { rows } = await query<ReportRow>('SELECT * FROM scheduled_reports ORDER BY created_at DESC')
    return rows.map(reportFromRow)
  }
  return [...state.reports].sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export async function getReport(id: string): Promise<ScheduledReportRecord | undefined> {
  if (USE_DB) {
    const { rows } = await query<ReportRow>('SELECT * FROM scheduled_reports WHERE id = $1', [id])
    return rows[0] ? reportFromRow(rows[0]) : undefined
  }
  return state.reports.find(r => r.id === id)
}

export async function createReport(input: {
  name: string; report_type: ReportType; schedule_cron: string; format: ReportFormat
  recipients: string[]; filters: Record<string, unknown>; created_by: string | null
}): Promise<ScheduledReportRecord> {
  if (USE_DB) {
    const { rows } = await query<ReportRow>(
      `INSERT INTO scheduled_reports (name, report_type, schedule_cron, format, recipients, filters, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [input.name, input.report_type, input.schedule_cron, input.format, JSON.stringify(input.recipients), JSON.stringify(input.filters), input.created_by],
    )
    return reportFromRow(rows[0]!)
  }
  const now = new Date().toISOString()
  const record: ScheduledReportRecord = {
    id: randomUUID(), name: input.name, report_type: input.report_type, schedule_cron: input.schedule_cron,
    format: input.format, recipients: input.recipients, filters: input.filters, is_active: true,
    last_run_at: null, next_run_at: null, created_by: input.created_by, created_at: now, updated_at: now, runs: [],
  }
  state.reports.push(record)
  persist()
  return record
}

export async function updateReport(id: string, patch: Partial<Pick<ScheduledReportRecord, 'name' | 'schedule_cron' | 'format' | 'recipients' | 'is_active'>>): Promise<ScheduledReportRecord | undefined> {
  if (USE_DB) {
    const fields = Object.keys(patch) as Array<keyof typeof patch>
    if (fields.length === 0) return getReport(id)
    const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ')
    const values = fields.map(f => (f === 'recipients' ? JSON.stringify(patch[f]) : patch[f]))
    const { rows } = await query<ReportRow>(
      `UPDATE scheduled_reports SET ${sets}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...values],
    )
    return rows[0] ? reportFromRow(rows[0]) : undefined
  }
  const record = state.reports.find(r => r.id === id)
  if (!record) return undefined
  Object.assign(record, patch, { updated_at: new Date().toISOString() })
  persist()
  return record
}

export async function deleteReport(id: string): Promise<void> {
  if (USE_DB) {
    await query('DELETE FROM notification_schedules WHERE module = $1 AND source_id = $2', ['scheduled_report', id])
    await query('DELETE FROM scheduled_reports WHERE id = $1', [id])
    return
  }
  state.reports = state.reports.filter(r => r.id !== id)
  state.notificationSchedules = state.notificationSchedules.filter(s => !(s.module === 'scheduled_report' && s.source_id === id))
  persist()
}

export async function recordReportRun(reportId: string, run: Omit<ReportRunRecord, 'id'>): Promise<ReportRunRecord | undefined> {
  if (USE_DB) {
    const { rows } = await query<RunRow>(
      `INSERT INTO report_runs (scheduled_report_id, status, format, record_count, file_size_bytes, error_message, triggered_by, started_at, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [reportId, run.status, run.format, run.record_count, run.file_size_bytes, run.error_message, run.triggered_by, run.started_at, run.completed_at],
    )
    await query('UPDATE scheduled_reports SET last_run_at = $2, updated_at = NOW() WHERE id = $1', [reportId, run.started_at])
    return rows[0] ? runFromRow(rows[0]) : undefined
  }
  const record = state.reports.find(r => r.id === reportId)
  if (!record) return undefined
  const runRecord: ReportRunRecord = { id: randomUUID(), ...run }
  record.runs.unshift(runRecord)
  record.runs = record.runs.slice(0, MAX_RUNS_PER_REPORT)
  record.last_run_at = run.started_at
  record.updated_at = new Date().toISOString()
  persist()
  return runRecord
}

export async function listReportRuns(reportId: string, limit = 50): Promise<ReportRunRecord[]> {
  if (USE_DB) {
    const { rows } = await query<RunRow>(
      'SELECT * FROM report_runs WHERE scheduled_report_id = $1 ORDER BY started_at DESC LIMIT $2',
      [reportId, limit],
    )
    return rows.map(runFromRow)
  }
  return state.reports.find(r => r.id === reportId)?.runs.slice(0, limit) ?? []
}

// ─── Notification schedules (Slack day/time editor) ────────────────────────

export async function getNotificationSchedule(module: string, sourceId: string): Promise<NotificationScheduleRecord | undefined> {
  if (USE_DB) {
    const { rows } = await query<ScheduleRow>('SELECT * FROM notification_schedules WHERE module = $1 AND source_id = $2', [module, sourceId])
    return rows[0] ? scheduleFromRow(rows[0]) : undefined
  }
  return state.notificationSchedules.find(s => s.module === module && s.source_id === sourceId)
}

export async function createNotificationSchedule(input: Omit<NotificationScheduleRecord, 'id' | 'is_running' | 'last_run_at' | 'last_run_status' | 'last_run_error' | 'created_at' | 'updated_at'>): Promise<NotificationScheduleRecord> {
  if (USE_DB) {
    const { rows } = await query<ScheduleRow>(
      `INSERT INTO notification_schedules (module, source_id, is_enabled, frequency, weekdays, execution_time, timezone, next_run_at, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [input.module, input.source_id, input.is_enabled, input.frequency, JSON.stringify(input.weekdays), input.execution_time, input.timezone, input.next_run_at, input.created_by, input.updated_by],
    )
    return scheduleFromRow(rows[0]!)
  }
  const now = new Date().toISOString()
  const record: NotificationScheduleRecord = {
    ...input, id: randomUUID(), is_running: false, last_run_at: null, last_run_status: null, last_run_error: null,
    created_at: now, updated_at: now,
  }
  state.notificationSchedules.push(record)
  persist()
  return record
}

export async function updateNotificationSchedule(id: string, patch: Partial<Pick<NotificationScheduleRecord, 'is_enabled' | 'frequency' | 'weekdays' | 'execution_time' | 'timezone' | 'next_run_at' | 'updated_by'>>): Promise<NotificationScheduleRecord | undefined> {
  if (USE_DB) {
    const fields = Object.keys(patch) as Array<keyof typeof patch>
    if (fields.length === 0) {
      const { rows } = await query<ScheduleRow>('SELECT * FROM notification_schedules WHERE id = $1', [id])
      return rows[0] ? scheduleFromRow(rows[0]) : undefined
    }
    const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ')
    const values = fields.map(f => (f === 'weekdays' ? JSON.stringify(patch[f]) : patch[f]))
    const { rows } = await query<ScheduleRow>(
      `UPDATE notification_schedules SET ${sets}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...values],
    )
    return rows[0] ? scheduleFromRow(rows[0]) : undefined
  }
  const record = state.notificationSchedules.find(s => s.id === id)
  if (!record) return undefined
  Object.assign(record, patch, { updated_at: new Date().toISOString() })
  persist()
  return record
}

export async function deleteNotificationSchedule(module: string, sourceId: string): Promise<void> {
  if (USE_DB) {
    await query('DELETE FROM notification_schedules WHERE module = $1 AND source_id = $2', [module, sourceId])
    return
  }
  state.notificationSchedules = state.notificationSchedules.filter(s => !(s.module === module && s.source_id === sourceId))
  persist()
}

export async function listAllNotificationSchedules(): Promise<NotificationScheduleRecord[]> {
  if (USE_DB) {
    const { rows } = await query<ScheduleRow>('SELECT * FROM notification_schedules ORDER BY created_at DESC')
    return rows.map(scheduleFromRow)
  }
  return [...state.notificationSchedules]
}

/** Atomically claims every enabled, due schedule not already running (or
 *  whose claim is stale — crashed-run safety valve, 2h window).
 *  DB backend: a single UPDATE...RETURNING is atomic per-row in Postgres,
 *  so this is safe across multiple app instances polling concurrently.
 *  File backend: safe only because this whole check-and-set runs
 *  synchronously on Node's single thread within one process — it does not
 *  protect against a multi-instance deployment. */
export async function claimDueNotificationSchedules(now: Date): Promise<NotificationScheduleRecord[]> {
  if (USE_DB) {
    const staleThreshold = new Date(now.getTime() - 2 * 60 * 60 * 1000)
    const { rows } = await query<ScheduleRow>(
      `UPDATE notification_schedules
       SET is_running = true, updated_at = NOW()
       WHERE is_enabled = true
         AND next_run_at IS NOT NULL AND next_run_at <= $1
         AND (is_running = false OR updated_at < $2)
       RETURNING *`,
      [now.toISOString(), staleThreshold.toISOString()],
    )
    return rows.map(scheduleFromRow)
  }
  const claimed: NotificationScheduleRecord[] = []
  const staleThreshold = now.getTime() - 2 * 60 * 60 * 1000
  for (const schedule of state.notificationSchedules) {
    if (!schedule.is_enabled) continue
    if (!schedule.next_run_at || new Date(schedule.next_run_at).getTime() > now.getTime()) continue
    if (schedule.is_running && new Date(schedule.updated_at).getTime() >= staleThreshold) continue
    schedule.is_running = true
    schedule.updated_at = new Date().toISOString()
    claimed.push(schedule)
  }
  if (claimed.length > 0) persist()
  return claimed
}

export async function completeNotificationSchedule(id: string, result: { status: 'completed' | 'failed'; error: string | null; nextRunAt: string }): Promise<void> {
  if (USE_DB) {
    await query(
      `UPDATE notification_schedules
       SET is_running = false, last_run_at = NOW(), last_run_status = $2, last_run_error = $3, next_run_at = $4, updated_at = NOW()
       WHERE id = $1`,
      [id, result.status, result.error, result.nextRunAt],
    )
    return
  }
  const record = state.notificationSchedules.find(s => s.id === id)
  if (!record) return
  record.is_running = false
  record.last_run_at = new Date().toISOString()
  record.last_run_status = result.status
  record.last_run_error = result.error
  record.next_run_at = result.nextRunAt
  record.updated_at = new Date().toISOString()
  persist()
}

// ─── Schedule-change audit log ──────────────────────────────────────────────

export async function recordScheduleAuditEntry(entry: Omit<ScheduleAuditEntry, 'id' | 'createdAt'>): Promise<void> {
  if (USE_DB) {
    await query(
      'INSERT INTO schedule_audit_log (user_email, action, resource_id, old_value, new_value) VALUES ($1, $2, $3, $4, $5)',
      [entry.userEmail, entry.action, entry.resourceId, JSON.stringify(entry.oldValue), JSON.stringify(entry.newValue)],
    )
    return
  }
  state.auditLog.unshift({ id: randomUUID(), ...entry, createdAt: new Date().toISOString() })
  state.auditLog = state.auditLog.slice(0, MAX_AUDIT_ENTRIES)
  persist()
}

export async function listScheduleAuditEntries(limit = 50): Promise<ScheduleAuditEntry[]> {
  if (USE_DB) {
    const { rows } = await query<AuditRow>('SELECT * FROM schedule_audit_log ORDER BY created_at DESC LIMIT $1', [limit])
    return rows.map(auditFromRow)
  }
  return state.auditLog.slice(0, limit)
}
