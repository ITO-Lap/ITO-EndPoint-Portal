// Editable day/time schedules for automatic Slack notifications.
//
// Module-agnostic: identified by (module, source_id), not tied to any one
// feature's table — see server/src/store/scheduledReportsStore.ts (a JSON
// file, no database) and server/src/services/notificationScheduler.ts.
// Today the only registered module is 'scheduled_report' (the Slack-delivered
// reports configured on the Scheduled Reports page); any future Slack-sending
// module reuses this same route, store, and scheduler by registering its own
// handler.
//
// RBAC: editing is Global Admin and IT Admin; reads are open to any role
// (read-only for Helpdesk). Same client-supplied x-user-role header trust model as
// every other recent feature in this app — see middleware/requireRole.ts's
// top-of-file note on that known limitation.
//
// Saving never sends a Slack message — it only changes next_run_at for the
// background scheduler to pick up later.

import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import { identifyAuditActor, requireAppRole } from '../middleware/requireRole.js'
import { isConfigured } from '../store/integrationStore.js'
import * as store from '../store/scheduledReportsStore.js'
import type { NotificationScheduleRecord, NotificationFrequency } from '../store/scheduledReportsStore.js'
import { computeNextRunAtUtc } from '../services/notificationScheduler.js'
import { isValidTimeZone } from '../services/zonedTime.js'
import { recordAuditLog } from '../services/auditLog.js'

const router = Router()
router.use(identifyAuditActor)

const EDIT_ROLES = ['Global Admin', 'IT Admin']

interface SeedSchedule { frequency: NotificationFrequency; weekdays: number[]; execution_time: string; timezone: string }

const DEFAULT_SCHEDULE: SeedSchedule = { frequency: 'weekly', weekdays: [1], execution_time: '09:00', timezone: 'Asia/Kolkata' }

/** Best-effort seed of a default schedule from a module's existing raw
 *  5-field cron string, for the one-time lazy migration of a pre-existing
 *  scheduled report the first time its schedule section is opened. Crons
 *  that don't fit a simple daily/weekly shape (e.g. monthly presets) fall
 *  back to DEFAULT_SCHEDULE — a known, documented limitation. */
function seedFromCron(cron: string | null | undefined): SeedSchedule {
  if (!cron) return DEFAULT_SCHEDULE
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return DEFAULT_SCHEDULE
  const [minute, hour, day, month, weekday] = parts as [string, string, string, string, string]
  if (day !== '*' || month !== '*') return DEFAULT_SCHEDULE
  if (!/^\d+$/.test(minute) || !/^\d+$/.test(hour)) return DEFAULT_SCHEDULE
  const execution_time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
  if (weekday === '*') return { frequency: 'daily', weekdays: [], execution_time, timezone: 'Asia/Kolkata' }
  const weekdays = weekday.split(',').flatMap(part => {
    if (/^\d-\d$/.test(part)) {
      const [from = 0, to = 0] = part.split('-').map(Number)
      return Array.from({ length: to - from + 1 }, (_, i) => from + i)
    }
    return /^\d$/.test(part) ? [Number(part)] : []
  }).filter(d => d >= 0 && d <= 6)
  if (weekdays.length === 0) return DEFAULT_SCHEDULE
  return { frequency: 'weekly', weekdays: [...new Set(weekdays)].sort(), execution_time, timezone: 'Asia/Kolkata' }
}

/** Looks up the Slack channel a (module, source) schedule delivers to, used
 *  only for the overlapping-schedule guard below. Returns null for modules
 *  this route doesn't yet know how to introspect (a future module can extend
 *  this, or simply won't get the overlap check). */
async function getSlackChannelForSource(module: string, sourceId: string): Promise<string | null> {
  if (module !== 'scheduled_report') return null
  const channel = (await store.getReport(sourceId))?.filters.slackChannelId
  return typeof channel === 'string' && channel.trim() ? channel.trim() : null
}

async function getOrCreateSchedule(module: string, sourceId: string, actorEmail: string): Promise<NotificationScheduleRecord> {
  const existing = await store.getNotificationSchedule(module, sourceId)
  if (existing) return existing

  let seed: SeedSchedule = DEFAULT_SCHEDULE
  if (module === 'scheduled_report') {
    seed = seedFromCron((await store.getReport(sourceId))?.schedule_cron)
  }
  const nextRunAt = computeNextRunAtUtc(seed, new Date())
  return store.createNotificationSchedule({
    module, source_id: sourceId, is_enabled: true, frequency: seed.frequency, weekdays: seed.weekdays,
    execution_time: seed.execution_time, timezone: seed.timezone, next_run_at: nextRunAt.toISOString(),
    created_by: actorEmail, updated_by: null,
  })
}

// GET /api/notification-schedules — list all (any role), with the owning
// report's name/report_type joined in for 'scheduled_report' entries, used
// by the Dashboard's "Quick Slack schedules" widget.
router.get('/', asyncHandler(async (_req, res) => {
  const all = await store.listAllNotificationSchedules()
  const schedules = await Promise.all(all.map(async schedule => {
    const report = schedule.module === 'scheduled_report' ? await store.getReport(schedule.source_id) : undefined
    return { ...schedule, reportName: report?.name ?? null, reportType: report?.report_type ?? null }
  }))
  res.json({ success: true, data: schedules })
}))

// GET /api/notification-schedules/:module/:sourceId — any role (read-only for non-admins)
router.get('/:module/:sourceId', asyncHandler(async (req, res) => {
  const { module, sourceId } = req.params as { module: string; sourceId: string }
  const schedule = await getOrCreateSchedule(module, sourceId, req.auditActor?.email ?? 'unknown@zinnia.com')
  res.json({ success: true, data: { schedule, slackConfigured: isConfigured('slack') } })
}))

const updateScheduleSchema = z.object({
  is_enabled: z.boolean(),
  frequency: z.enum(['daily', 'weekly']),
  weekdays: z.array(z.number().int().min(0).max(6)).default([]),
  execution_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'execution_time must be HH:MM (24-hour)'),
  timezone: z.string().min(1),
}).refine(data => data.frequency !== 'weekly' || (new Set(data.weekdays).size === data.weekdays.length && data.weekdays.length > 0), {
  message: 'Weekly frequency requires at least one weekday, with no duplicates',
  path: ['weekdays'],
}).refine(data => isValidTimeZone(data.timezone), {
  message: 'timezone must be a valid IANA time zone (e.g. Asia/Kolkata)',
  path: ['timezone'],
})

// PATCH /api/notification-schedules/:module/:sourceId — Global Admin and IT Admin
router.patch('/:module/:sourceId', requireAppRole(EDIT_ROLES), asyncHandler(async (req, res) => {
  const { module, sourceId } = req.params as { module: string; sourceId: string }
  const input = updateScheduleSchema.parse(req.body)
  const actorEmail = req.auditActor?.email ?? 'unknown@zinnia.com'

  const before = await getOrCreateSchedule(module, sourceId, actorEmail)

  // Prevent overlapping schedules: block if another *enabled* schedule for
  // the same module, delivering to the same Slack channel, has an identical
  // frequency/weekdays/time/timezone.
  const channelId = await getSlackChannelForSource(module, sourceId)
  if (channelId && input.is_enabled) {
    const weekdaysKey = JSON.stringify(input.frequency === 'weekly' ? [...input.weekdays].sort() : [])
    const candidates = (await store.listAllNotificationSchedules()).filter(other =>
      other.id !== before.id && other.module === module && other.is_enabled
      && other.frequency === input.frequency && other.execution_time === input.execution_time && other.timezone === input.timezone
      && JSON.stringify([...other.weekdays].sort()) === weekdaysKey
    )
    let clash = false
    for (const other of candidates) {
      if ((await getSlackChannelForSource(other.module, other.source_id)) === channelId) { clash = true; break }
    }
    if (clash) {
      res.status(400).json({ success: false, error: 'Another enabled schedule already sends to this Slack channel at this exact day and time.' })
      return
    }
  }

  const nextRunAt = computeNextRunAtUtc(input, new Date())
  const after = (await store.updateNotificationSchedule(before.id, {
    is_enabled: input.is_enabled, frequency: input.frequency, weekdays: input.frequency === 'weekly' ? input.weekdays : [],
    execution_time: input.execution_time, timezone: input.timezone, next_run_at: nextRunAt.toISOString(), updated_by: actorEmail,
  }))!

  const oldValue = { is_enabled: before.is_enabled, frequency: before.frequency, weekdays: before.weekdays, execution_time: before.execution_time, timezone: before.timezone }
  const newValue = { is_enabled: after.is_enabled, frequency: after.frequency, weekdays: after.weekdays, execution_time: after.execution_time, timezone: after.timezone }

  // Primary audit trail: file-based, works with zero database. Also calls
  // the Postgres-backed recordAuditLog, which no-ops harmlessly without a
  // DB and keeps this consistent with the rest of the app if one is ever
  // configured.
  await store.recordScheduleAuditEntry({ userEmail: actorEmail, action: 'NOTIFICATION_SCHEDULE_UPDATED', resourceId: `${module}:${sourceId}`, oldValue, newValue })
  await recordAuditLog({ userEmail: actorEmail, action: 'NOTIFICATION_SCHEDULE_UPDATED', resourceType: 'notification_schedule', resourceId: `${module}:${sourceId}`, oldValue, newValue })

  res.json({ success: true, data: { schedule: after, slackConfigured: isConfigured('slack') } })
}))

export default router
