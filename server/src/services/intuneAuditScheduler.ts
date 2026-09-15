// Recurring automatic Intune audit exports.
//
// This is a poll loop (setInterval, default every 60s via
// INTUNE_AUDIT_SCHEDULER_POLL_SECONDS), not an in-memory per-schedule timer:
// all state (enabled, next_run_at, is_running, last_run_*) lives in
// intune_audit_export_schedules, so a server restart never loses a schedule
// — it just re-evaluates "is anything due?" on the next tick. Overlap is
// prevented by an atomic UPDATE ... WHERE is_running=false claim; a claim
// older than 2 hours is treated as a crashed run and reclaimed.
//
// Next-run computation is timezone/DST-aware: it walks calendar days in the
// schedule's IANA timezone (via Intl) rather than doing fixed-offset UTC
// arithmetic, which is what breaks across DST transitions.

import { randomUUID } from 'crypto'
import { query, isDbAvailable } from '../db/index.js'
import { createExportJob, runExportJob, type ExportFormat, type AuditEventFilters } from './intuneAuditExport.js'
import { sendExportEmail } from './auditExportEmail.js'

export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'
export type RelativePeriod = 'previous_day' | 'previous_week' | 'previous_month' | 'previous_year' | 'rolling_365'

export interface AuditExportScheduleRow {
  id: string
  tenant_id: string
  name: string
  is_enabled: boolean
  frequency: ScheduleFrequency
  execution_time: string
  timezone: string
  relative_period: RelativePeriod
  filters: AuditEventFilters
  formats: ExportFormat[]
  recipients: string[]
  email_subject: string | null
  email_message: string | null
  retention_days: number
  next_run_at: string | null
  last_run_at: string | null
  last_run_status: string | null
  last_run_job_id: string | null
  is_running: boolean
  created_by: string
  created_at: string
  updated_at: string
}

function getZonedParts(date: Date, timeZone: string): { y: number; m: number; d: number; hh: number; mm: number; weekday: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, weekday: 'short',
  })
  const parts = formatter.formatToParts(date)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '0'
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    y: Number(get('year')), m: Number(get('month')), d: Number(get('day')),
    hh: Number(get('hour')) % 24, mm: Number(get('minute')),
    weekday: weekdayMap[get('weekday')] ?? 0,
  }
}

/** Converts a wall-clock date/time in `timeZone` to a UTC instant, correctly
 *  handling DST offsets without a date-arithmetic library — standard
 *  "guess, measure the offset, correct" technique using Intl as the source
 *  of truth for what a given UTC instant looks like in that zone. */
function zonedWallTimeToUtc(y: number, m: number, d: number, hh: number, mm: number, timeZone: string): Date {
  let guessUtc = Date.UTC(y, m - 1, d, hh, mm, 0)
  for (let i = 0; i < 2; i++) {
    const seenAsZoned = getZonedParts(new Date(guessUtc), timeZone)
    const seenAsUtc = Date.UTC(seenAsZoned.y, seenAsZoned.m - 1, seenAsZoned.d, seenAsZoned.hh, seenAsZoned.mm, 0)
    const diff = Date.UTC(y, m - 1, d, hh, mm, 0) - seenAsUtc
    guessUtc += diff
  }
  return new Date(guessUtc)
}

function daysInMonth(year: number, month1based: number): number {
  return new Date(Date.UTC(year, month1based, 0)).getUTCDate()
}

/** Computes the next UTC run instant after `fromUtc`, anchored to the
 *  schedule's creation date for weekly (weekday), monthly (day-of-month,
 *  clamped to shorter months), and yearly (month+day) cadences. Bounded to
 *  ~2 years of day-stepping so a misconfigured schedule can't loop forever. */
export function computeNextRunAtUtc(
  schedule: Pick<AuditExportScheduleRow, 'frequency' | 'execution_time' | 'timezone' | 'created_at'>,
  fromUtc: Date
): Date {
  const [execHourRaw, execMinuteRaw] = schedule.execution_time.split(':').map(Number)
  const execHour = execHourRaw ?? 0
  const execMinute = execMinuteRaw ?? 0
  const anchor = getZonedParts(new Date(schedule.created_at), schedule.timezone)

  const candidateZoned = getZonedParts(fromUtc, schedule.timezone)
  let candidateY = candidateZoned.y, candidateM = candidateZoned.m, candidateD = candidateZoned.d

  for (let step = 0; step < 366 * 2; step++) {
    const matchesFrequency =
      schedule.frequency === 'daily' ? true :
      schedule.frequency === 'weekly' ? getWeekdayForYmd(candidateY, candidateM, candidateD, schedule.timezone) === anchor.weekday :
      schedule.frequency === 'monthly' ? candidateD === Math.min(anchor.d, daysInMonth(candidateY, candidateM)) :
      /* yearly */ candidateM === anchor.m && candidateD === Math.min(anchor.d, daysInMonth(candidateY, anchor.m))

    if (matchesFrequency) {
      const candidateUtc = zonedWallTimeToUtc(candidateY, candidateM, candidateD, execHour, execMinute, schedule.timezone)
      if (candidateUtc.getTime() > fromUtc.getTime()) return candidateUtc
    }

    const next = new Date(Date.UTC(candidateY, candidateM - 1, candidateD + 1))
    candidateY = next.getUTCFullYear(); candidateM = next.getUTCMonth() + 1; candidateD = next.getUTCDate()
  }

  throw new Error(`Could not compute next run time for schedule (frequency=${schedule.frequency})`)
}

function getWeekdayForYmd(y: number, m: number, d: number, timeZone: string): number {
  return getZonedParts(zonedWallTimeToUtc(y, m, d, 12, 0, timeZone), timeZone).weekday
}

/** Computes the [startUtc, endUtc) export range for a relative period,
 *  evaluated at `nowUtc` in the schedule's timezone. */
export function computeRelativeRangeUtc(period: RelativePeriod, timezone: string, nowUtc: Date): { startUtc: Date; endUtc: Date } {
  const now = getZonedParts(nowUtc, timezone)
  const todayStart = zonedWallTimeToUtc(now.y, now.m, now.d, 0, 0, timezone)

  switch (period) {
    case 'previous_day': {
      const y = new Date(todayStart.getTime() - 1); const p = getZonedParts(y, timezone)
      const start = zonedWallTimeToUtc(p.y, p.m, p.d, 0, 0, timezone)
      return { startUtc: start, endUtc: todayStart }
    }
    case 'previous_week': {
      const weekAgo = new Date(todayStart.getTime() - 7 * 86_400_000)
      return { startUtc: weekAgo, endUtc: todayStart }
    }
    case 'previous_month': {
      const firstOfThisMonth = zonedWallTimeToUtc(now.y, now.m, 1, 0, 0, timezone)
      const prevMonthY = now.m === 1 ? now.y - 1 : now.y
      const prevMonthM = now.m === 1 ? 12 : now.m - 1
      const firstOfPrevMonth = zonedWallTimeToUtc(prevMonthY, prevMonthM, 1, 0, 0, timezone)
      return { startUtc: firstOfPrevMonth, endUtc: firstOfThisMonth }
    }
    case 'previous_year': {
      const firstOfThisYear = zonedWallTimeToUtc(now.y, 1, 1, 0, 0, timezone)
      const firstOfPrevYear = zonedWallTimeToUtc(now.y - 1, 1, 1, 0, 0, timezone)
      return { startUtc: firstOfPrevYear, endUtc: firstOfThisYear }
    }
    case 'rolling_365': {
      const start = new Date(todayStart.getTime() - 365 * 86_400_000)
      return { startUtc: start, endUtc: todayStart }
    }
  }
}

function pollSeconds(): number {
  return Math.max(15, Number(process.env.INTUNE_AUDIT_SCHEDULER_POLL_SECONDS ?? 60))
}

let pollTimer: ReturnType<typeof setInterval> | null = null

async function claimDueSchedules(): Promise<AuditExportScheduleRow[]> {
  const result = await query<AuditExportScheduleRow>(
    `UPDATE intune_audit_export_schedules
       SET is_running = true, updated_at = NOW()
     WHERE is_enabled = true
       AND next_run_at <= NOW()
       AND (is_running = false OR updated_at < NOW() - INTERVAL '2 hours')
     RETURNING *`
  )
  return result.rows
}

async function runSchedule(schedule: AuditExportScheduleRow): Promise<void> {
  const correlationId = randomUUID()
  let jobId: string | null = null
  try {
    const { startUtc, endUtc } = computeRelativeRangeUtc(schedule.relative_period, schedule.timezone, new Date())
    const job = await createExportJob({
      tenantId: schedule.tenant_id,
      rangeStartUtc: startUtc,
      rangeEndUtc: endUtc,
      timezone: schedule.timezone,
      filters: schedule.filters,
      formats: schedule.formats,
      createdBy: `scheduler:${schedule.name}`,
      scheduleId: schedule.id,
      correlationId,
    })
    jobId = job.id
    await runExportJob(job.id)

    if (schedule.recipients.length > 0) {
      const artifactResult = await query<{ format: string; blob_path: string; content_type: string; size_bytes: number; sha256_checksum: string }>(
        'SELECT format, blob_path, content_type, size_bytes, sha256_checksum FROM intune_audit_export_artifacts WHERE job_id=$1', [job.id]
      )
      for (const artifact of artifactResult.rows) {
        try {
          await sendExportEmail({
            recipients: schedule.recipients,
            subject: schedule.email_subject ?? `Intune Audit Export — ${schedule.name}`,
            message: schedule.email_message ?? undefined,
            artifact: {
              blobPath: artifact.blob_path, contentType: artifact.content_type,
              sizeBytes: artifact.size_bytes, sha256: artifact.sha256_checksum, format: artifact.format,
            },
            filename: `audit-export.${artifact.format}`,
          })
        } catch (emailErr) {
          console.error(`[intuneAuditScheduler] Email delivery failed for schedule ${schedule.id}:`, emailErr instanceof Error ? emailErr.message : emailErr)
        }
      }
    }

    await query(
      `UPDATE intune_audit_export_schedules
         SET is_running=false, last_run_at=NOW(), last_run_status='completed', last_run_job_id=$2,
             next_run_at=$3, updated_at=NOW()
       WHERE id=$1`,
      [schedule.id, job.id, computeNextRunAtUtc(schedule, new Date()).toISOString()]
    )
  } catch (err) {
    console.error(`[intuneAuditScheduler] Schedule ${schedule.id} (${schedule.name}) failed:`, err instanceof Error ? err.message : err)
    await query(
      `UPDATE intune_audit_export_schedules
         SET is_running=false, last_run_at=NOW(), last_run_status='failed', last_run_job_id=$2,
             next_run_at=$3, updated_at=NOW()
       WHERE id=$1`,
      [schedule.id, jobId, computeNextRunAtUtc(schedule, new Date()).toISOString()]
    )
  }
}

async function tick(): Promise<void> {
  if (!isDbAvailable()) return
  try {
    const due = await claimDueSchedules()
    for (const schedule of due) {
      await runSchedule(schedule)
    }
  } catch (err) {
    console.error('[intuneAuditScheduler] Poll tick failed:', err instanceof Error ? err.message : err)
  }
}

export function startAuditExportScheduler(): void {
  if (pollTimer) return
  if (!isDbAvailable()) {
    console.log('[intuneAuditScheduler] DATABASE_URL not set — scheduled Intune audit exports are disabled.')
    return
  }
  pollTimer = setInterval(() => { void tick() }, pollSeconds() * 1000)
  console.log(`[intuneAuditScheduler] Polling for due Intune audit export schedules every ${pollSeconds()}s`)
}

export function stopAuditExportScheduler(): void {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}
