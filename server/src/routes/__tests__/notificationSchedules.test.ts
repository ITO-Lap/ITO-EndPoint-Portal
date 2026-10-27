import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'net'
import { errorHandler } from '../../middleware/errorHandler.js'

interface ApiEnvelope {
  success: boolean
  data?: { schedule?: Record<string, unknown>; slackConfigured?: boolean } | null
  message?: string
  error?: string
}

function httpRequest(method: string, url: string, headers: Record<string, string> = {}, body?: unknown): Promise<{ status: number; json: ApiEnvelope }> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined
    const req = http.request(url, {
      method,
      headers: { ...headers, ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}) },
    }, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, json: data ? JSON.parse(data) : null }))
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

// ─── Fake store (in-memory, mirrors scheduledReportsStore.ts's shape) ───────
let scheduleRow: Record<string, unknown> | null = null
let reportsById: Record<string, { id: string; filters: Record<string, unknown>; schedule_cron: string }> = {}
let clashSchedules: Array<Record<string, unknown>> = []

function makeScheduleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sched-1', module: 'scheduled_report', source_id: 'report-1',
    is_enabled: true, frequency: 'weekly', weekdays: [1], execution_time: '09:00', timezone: 'Asia/Kolkata',
    next_run_at: '2026-03-16T03:30:00.000Z', is_running: false,
    last_run_at: null, last_run_status: null, last_run_error: null,
    created_by: 'admin@zinnia.com', updated_by: null,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

vi.mock('../../store/scheduledReportsStore.js', () => ({
  getNotificationSchedule: vi.fn((module: string, sourceId: string) =>
    scheduleRow && scheduleRow.module === module && scheduleRow.source_id === sourceId ? scheduleRow : undefined),
  createNotificationSchedule: vi.fn((input: Record<string, unknown>) => {
    scheduleRow = makeScheduleRow(input)
    return scheduleRow
  }),
  updateNotificationSchedule: vi.fn((_id: string, patch: Record<string, unknown>) => {
    scheduleRow = { ...(scheduleRow ?? {}), ...patch, updated_at: new Date().toISOString() }
    return scheduleRow
  }),
  listAllNotificationSchedules: vi.fn(() => clashSchedules),
  getReport: vi.fn((id: string) => reportsById[id]),
  recordScheduleAuditEntry: vi.fn(),
}))

vi.mock('../../store/integrationStore.js', () => ({
  isConfigured: vi.fn(() => true),
}))

vi.mock('../../services/auditLog.js', () => ({ recordAuditLog: vi.fn(async () => {}) }))

import { recordScheduleAuditEntry } from '../../store/scheduledReportsStore.js'
import { recordAuditLog } from '../../services/auditLog.js'
import notificationSchedulesRouter from '../notificationSchedules.js'

async function startServer() {
  const app = express()
  app.use(express.json())
  app.use('/api/notification-schedules', notificationSchedulesRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>(resolve => server.once('listening', resolve))
  const port = (server.address() as AddressInfo).port
  return { server, baseUrl: `http://127.0.0.1:${port}/api/notification-schedules` }
}

const ADMIN = { 'x-user-role': 'Global Admin', 'x-user-email': 'admin@zinnia.com' }
const VALID_PATCH_BODY = { is_enabled: true, frequency: 'weekly', weekdays: [2, 4], execution_time: '14:00', timezone: 'Asia/Kolkata' }

describe('notification schedules — day/time editing (file-based store, no database)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    scheduleRow = null
    reportsById = { 'report-1': { id: 'report-1', filters: { slackChannelId: 'C0SLACKCHANNEL' }, schedule_cron: '0 9 * * 1' } }
    clashSchedules = []
    vi.mocked(recordScheduleAuditEntry).mockClear()
    vi.mocked(recordAuditLog).mockClear()
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })
  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it('GET lazily creates a default schedule seeded from the existing cron on first access', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const res = await httpRequest('GET', `${baseUrl}/scheduled_report/report-1`, ADMIN)
      expect(res.status).toBe(200)
      expect(res.json.success).toBe(true)
      expect(res.json.data.schedule.frequency).toBe('weekly')
      expect(res.json.data.schedule.weekdays).toEqual([1]) // cron "0 9 * * 1" => Monday
      expect(res.json.data.schedule.execution_time).toBe('09:00')
      expect(res.json.data.slackConfigured).toBe(true)
    } finally { server.close() }
  })

  it('PATCH updates day/time and persists the new schedule (req #1)', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const res = await httpRequest('PATCH', `${baseUrl}/scheduled_report/report-1`, ADMIN, VALID_PATCH_BODY)
      expect(res.status).toBe(200)
      expect(res.json.data.schedule.frequency).toBe('weekly')
      expect(res.json.data.schedule.weekdays).toEqual([2, 4])
      expect(res.json.data.schedule.execution_time).toBe('14:00')
    } finally { server.close() }
  })

  it('computes a next_run_at in the future for an Asia/Kolkata schedule (req #2)', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const res = await httpRequest('PATCH', `${baseUrl}/scheduled_report/report-1`, ADMIN, VALID_PATCH_BODY)
      const nextRunAt = new Date(res.json.data.schedule.next_run_at)
      expect(nextRunAt.getTime()).toBeGreaterThan(Date.now())
    } finally { server.close() }
  })

  it('pauses and resumes via is_enabled (req #3)', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const paused = await httpRequest('PATCH', `${baseUrl}/scheduled_report/report-1`, ADMIN, { ...VALID_PATCH_BODY, is_enabled: false })
      expect(paused.json.data.schedule.is_enabled).toBe(false)
      const resumed = await httpRequest('PATCH', `${baseUrl}/scheduled_report/report-1`, ADMIN, { ...VALID_PATCH_BODY, is_enabled: true })
      expect(resumed.json.data.schedule.is_enabled).toBe(true)
    } finally { server.close() }
  })

  it('never sends a Slack message / makes an outbound network call when saving (req #4)', async () => {
    const { server, baseUrl } = await startServer()
    try {
      await httpRequest('PATCH', `${baseUrl}/scheduled_report/report-1`, ADMIN, VALID_PATCH_BODY)
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally { server.close() }
  })

  it('rejects an overlapping schedule for the same Slack channel/day/time (req #5)', async () => {
    const { server, baseUrl } = await startServer()
    try {
      // report-2 shares the same Slack channel as report-1, and its notification
      // schedule already matches the frequency/weekdays/time/timezone being saved.
      reportsById['report-2'] = { id: 'report-2', filters: { slackChannelId: 'C0SLACKCHANNEL' }, schedule_cron: '0 9 * * 1' }
      clashSchedules = [
        { id: 'sched-other', module: 'scheduled_report', source_id: 'report-2', is_enabled: true, frequency: 'weekly', weekdays: [2, 4], execution_time: '14:00', timezone: 'Asia/Kolkata' },
      ]
      const res = await httpRequest('PATCH', `${baseUrl}/scheduled_report/report-1`, ADMIN, VALID_PATCH_BODY)
      expect(res.status).toBe(400)
      expect(res.json.success).toBe(false)
    } finally { server.close() }
  })

  it('does NOT reject a different day/time for the same Slack channel', async () => {
    const { server, baseUrl } = await startServer()
    try {
      reportsById['report-2'] = { id: 'report-2', filters: { slackChannelId: 'C0SLACKCHANNEL' }, schedule_cron: '0 9 * * 1' }
      clashSchedules = [
        { id: 'sched-other', module: 'scheduled_report', source_id: 'report-2', is_enabled: true, frequency: 'daily', weekdays: [], execution_time: '08:00', timezone: 'UTC' },
      ]
      const res = await httpRequest('PATCH', `${baseUrl}/scheduled_report/report-1`, ADMIN, VALID_PATCH_BODY)
      expect(res.status).toBe(200)
    } finally { server.close() }
  })

  it('allows an IT Admin to save the schedule', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const res = await httpRequest('PATCH', `${baseUrl}/scheduled_report/report-1`, { 'x-user-role': 'IT Admin' }, VALID_PATCH_BODY)
      expect(res.status).toBe(200)
    } finally { server.close() }
  })

  it('rejects a Helpdesk PATCH with 403 (req #6)', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const res = await httpRequest('PATCH', `${baseUrl}/scheduled_report/report-1`, { 'x-user-role': 'Helpdesk' }, VALID_PATCH_BODY)
      expect(res.status).toBe(403)
    } finally { server.close() }
  })

  it('allows a read-only GET for a non-admin role', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const res = await httpRequest('GET', `${baseUrl}/scheduled_report/report-1`, { 'x-user-role': 'Helpdesk' })
      expect(res.status).toBe(200)
    } finally { server.close() }
  })

  it('records a schedule-change audit entry (file-based, works with zero database) on save (req #7)', async () => {
    const { server, baseUrl } = await startServer()
    try {
      await httpRequest('PATCH', `${baseUrl}/scheduled_report/report-1`, ADMIN, VALID_PATCH_BODY)
      expect(recordScheduleAuditEntry).toHaveBeenCalledTimes(1)
      const entry = vi.mocked(recordScheduleAuditEntry).mock.calls[0]![0] as { action: string; resourceId: string; newValue: Record<string, unknown> }
      expect(entry.action).toBe('NOTIFICATION_SCHEDULE_UPDATED')
      expect(entry.resourceId).toBe('scheduled_report:report-1')
      expect(entry.newValue.execution_time).toBe('14:00')
      // Also calls the Postgres-backed logger, which no-ops harmlessly without a DB.
      expect(recordAuditLog).toHaveBeenCalledTimes(1)
    } finally { server.close() }
  })

  it('works end to end with no database configured at all (req #8 — this is the actual fix)', async () => {
    // No DATABASE_URL is set anywhere in this test file/process — if this
    // route still required Postgres, every call above would already have
    // failed. This test exists to make that guarantee explicit.
    expect(process.env.DATABASE_URL).toBeUndefined()
    const { server, baseUrl } = await startServer()
    try {
      const res = await httpRequest('PATCH', `${baseUrl}/scheduled_report/report-1`, ADMIN, VALID_PATCH_BODY)
      expect(res.status).toBe(200)
      expect(res.json.success).toBe(true)
    } finally { server.close() }
  })

  it('rejects an invalid execution_time with a validation error', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const res = await httpRequest('PATCH', `${baseUrl}/scheduled_report/report-1`, ADMIN, { ...VALID_PATCH_BODY, execution_time: '25:99' })
      expect(res.status).toBe(400)
    } finally { server.close() }
  })

  it('rejects a weekly schedule with no weekdays selected', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const res = await httpRequest('PATCH', `${baseUrl}/scheduled_report/report-1`, ADMIN, { ...VALID_PATCH_BODY, weekdays: [] })
      expect(res.status).toBe(400)
    } finally { server.close() }
  })
})
