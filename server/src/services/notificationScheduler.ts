// Generic poll-based scheduler for automatic Slack notification schedules
// (notification_schedules — see scheduledReportsStore.ts, a JSON file, no
// database). All state lives there (is_enabled, next_run_at, is_running,
// last_run_*), so a restart never loses a schedule — it just re-evaluates
// "is anything due?" on the next tick. Overlap/duplicate execution is
// prevented by scheduledReportsStore.claimDueNotificationSchedules()'s
// synchronous check-and-set (safe because Node is single-threaded — see that
// function's comment for the single-process caveat); a claim older than 2
// hours is treated as a crashed run and reclaimed.
//
// This file knows nothing about Slack or any specific feature — modules
// register a handler for their `module` name via registerNotificationHandler,
// and the scheduler dispatches to it when a row comes due. This keeps the
// scheduling engine reusable for any future Slack-sending module.

import * as store from '../store/scheduledReportsStore.js'
import type { NotificationScheduleRecord, NotificationFrequency } from '../store/scheduledReportsStore.js'
import { getZonedParts, zonedWallTimeToUtc } from './zonedTime.js'

export type { NotificationFrequency }
export type NotificationScheduleRow = NotificationScheduleRecord

/** Computes the next UTC run instant after `fromUtc`. For `weekly`, matches
 *  ANY weekday in `schedule.weekdays` (unlike a single anchor weekday) —
 *  this is what lets an admin pick e.g. Mon+Wed+Fri. Bounded to ~2 years of
 *  day-stepping so a misconfigured schedule can't loop forever. */
export function computeNextRunAtUtc(
  schedule: Pick<NotificationScheduleRow, 'frequency' | 'weekdays' | 'execution_time' | 'timezone'>,
  fromUtc: Date
): Date {
  const [execHourRaw, execMinuteRaw] = schedule.execution_time.split(':').map(Number)
  const execHour = execHourRaw ?? 0
  const execMinute = execMinuteRaw ?? 0

  const candidateZoned = getZonedParts(fromUtc, schedule.timezone)
  let candidateY = candidateZoned.y, candidateM = candidateZoned.m, candidateD = candidateZoned.d

  for (let step = 0; step < 366 * 2; step++) {
    const zonedWeekday = getZonedParts(zonedWallTimeToUtc(candidateY, candidateM, candidateD, 12, 0, schedule.timezone), schedule.timezone).weekday
    const matchesFrequency = schedule.frequency === 'daily' ? true : schedule.weekdays.includes(zonedWeekday)

    if (matchesFrequency) {
      const candidateUtc = zonedWallTimeToUtc(candidateY, candidateM, candidateD, execHour, execMinute, schedule.timezone)
      if (candidateUtc.getTime() > fromUtc.getTime()) return candidateUtc
    }

    const next = new Date(Date.UTC(candidateY, candidateM - 1, candidateD + 1))
    candidateY = next.getUTCFullYear(); candidateM = next.getUTCMonth() + 1; candidateD = next.getUTCDate()
  }

  throw new Error(`Could not compute next run time for notification schedule (frequency=${schedule.frequency})`)
}

export type NotificationHandlerResult = { ok: boolean; error?: string }
export type NotificationHandler = (sourceId: string) => Promise<NotificationHandlerResult>

const handlers = new Map<string, NotificationHandler>()

/** Registers the function that actually sends the notification for a given
 *  module when its schedule comes due. Called once at server startup. */
export function registerNotificationHandler(module: string, handler: NotificationHandler): void {
  handlers.set(module, handler)
}

async function runSchedule(schedule: NotificationScheduleRow): Promise<void> {
  const handler = handlers.get(schedule.module)
  if (!handler) {
    console.error(`[notificationScheduler] No handler registered for module "${schedule.module}" — skipping schedule ${schedule.id}`)
    await store.completeNotificationSchedule(schedule.id, { status: 'failed', error: `No handler registered for module "${schedule.module}"`, nextRunAt: computeNextRunAtUtc(schedule, new Date()).toISOString() })
    return
  }

  let result: NotificationHandlerResult
  try {
    result = await handler(schedule.source_id)
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  // Re-read the current schedule fields rather than trusting the in-memory
  // object captured at claim time — a concurrent edit that lands mid-run is
  // honored for the next cycle instead of being silently overwritten.
  const current = (await store.getNotificationSchedule(schedule.module, schedule.source_id)) ?? schedule
  const nextRunAt = computeNextRunAtUtc(current, new Date())

  await store.completeNotificationSchedule(schedule.id, { status: result.ok ? 'completed' : 'failed', error: result.error ?? null, nextRunAt: nextRunAt.toISOString() })
}

function pollSeconds(): number {
  return Math.max(15, Number(process.env.NOTIFICATION_SCHEDULER_POLL_SECONDS ?? 60))
}

let pollTimer: ReturnType<typeof setInterval> | null = null

async function tick(): Promise<void> {
  try {
    const due = await store.claimDueNotificationSchedules(new Date())
    for (const schedule of due) {
      await runSchedule(schedule)
    }
  } catch (err) {
    console.error('[notificationScheduler] Poll tick failed:', err instanceof Error ? err.message : err)
  }
}

export function startNotificationScheduler(): void {
  if (pollTimer) return
  pollTimer = setInterval(() => { void tick() }, pollSeconds() * 1000)
  console.log(`[notificationScheduler] Polling for due Slack notification schedules every ${pollSeconds()}s`)
}

export function stopNotificationScheduler(): void {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}
