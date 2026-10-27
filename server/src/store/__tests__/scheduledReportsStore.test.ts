import { describe, it, expect, vi, beforeEach } from 'vitest'

// Keep this store test hermetic — no real disk writes to server/.scheduled-reports.json.
vi.mock('fs', async importOriginal => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, readFileSync: vi.fn(() => { throw new Error('no file in tests') }), writeFileSync: vi.fn() }
})

import * as store from '../scheduledReportsStore.js'

beforeEach(() => {
  store.__resetStateForTests()
})

describe('scheduledReportsStore — reports', () => {
  it('creates, lists, updates, and deletes a report', async () => {
    const created = await store.createReport({
      name: 'Weekly Compliance', report_type: 'compliance', schedule_cron: '0 8 * * 1',
      format: 'excel', recipients: ['ITO_Endpoint@zinnia.com'], filters: {}, created_by: 'admin@zinnia.com',
    })
    expect(created.id).toBeTruthy()
    expect(await store.listReports()).toHaveLength(1)
    expect((await store.getReport(created.id))?.name).toBe('Weekly Compliance')

    const updated = await store.updateReport(created.id, { name: 'Renamed', is_active: false })
    expect(updated?.name).toBe('Renamed')
    expect(updated?.is_active).toBe(false)

    await store.deleteReport(created.id)
    expect(await store.getReport(created.id)).toBeUndefined()
    expect(await store.listReports()).toHaveLength(0)
  })

  it('deleting a report also deletes its notification schedule', async () => {
    const report = await store.createReport({ name: 'R', report_type: 'critical-patching', schedule_cron: '0 8 * * 1', format: 'excel', recipients: [], filters: { slackChannelId: 'C1' }, created_by: null })
    await store.createNotificationSchedule({ module: 'scheduled_report', source_id: report.id, is_enabled: true, frequency: 'weekly', weekdays: [1], execution_time: '09:00', timezone: 'Asia/Kolkata', next_run_at: null, created_by: 'a@b.com', updated_by: null })
    expect(await store.getNotificationSchedule('scheduled_report', report.id)).toBeDefined()

    await store.deleteReport(report.id)
    expect(await store.getNotificationSchedule('scheduled_report', report.id)).toBeUndefined()
  })

  it('records runs, caps run history, and tracks last_run_at on the report', async () => {
    const report = await store.createReport({ name: 'R', report_type: 'inventory', schedule_cron: '0 8 * * *', format: 'csv', recipients: ['a@b.com'], filters: {}, created_by: null })
    for (let i = 0; i < 55; i++) {
      await store.recordReportRun(report.id, { status: 'completed', format: 'csv', record_count: i, file_size_bytes: 100, error_message: null, triggered_by: 'scheduler', started_at: new Date().toISOString(), completed_at: new Date().toISOString() })
    }
    expect(await store.listReportRuns(report.id)).toHaveLength(50)
    expect((await store.getReport(report.id))?.last_run_at).toBeTruthy()
  })
})

describe('scheduledReportsStore — notification schedules', () => {
  it('claims a due, enabled schedule and not a disabled or not-yet-due one', async () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    const future = new Date(Date.now() + 60_000).toISOString()
    const due = await store.createNotificationSchedule({ module: 'scheduled_report', source_id: 'r1', is_enabled: true, frequency: 'daily', weekdays: [], execution_time: '09:00', timezone: 'UTC', next_run_at: past, created_by: 'a@b.com', updated_by: null })
    await store.createNotificationSchedule({ module: 'scheduled_report', source_id: 'r2', is_enabled: false, frequency: 'daily', weekdays: [], execution_time: '09:00', timezone: 'UTC', next_run_at: past, created_by: 'a@b.com', updated_by: null })
    await store.createNotificationSchedule({ module: 'scheduled_report', source_id: 'r3', is_enabled: true, frequency: 'daily', weekdays: [], execution_time: '09:00', timezone: 'UTC', next_run_at: future, created_by: 'a@b.com', updated_by: null })

    const claimed = await store.claimDueNotificationSchedules(new Date())
    expect(claimed.map(s => s.id)).toEqual([due.id])
    expect((await store.getNotificationSchedule('scheduled_report', 'r1'))?.is_running).toBe(true)
  })

  it('does not re-claim a schedule already running, but reclaims a stale (>2h) claim', async () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    const schedule = await store.createNotificationSchedule({ module: 'scheduled_report', source_id: 'r1', is_enabled: true, frequency: 'daily', weekdays: [], execution_time: '09:00', timezone: 'UTC', next_run_at: past, created_by: 'a@b.com', updated_by: null })
    await store.claimDueNotificationSchedules(new Date())
    expect(await store.claimDueNotificationSchedules(new Date())).toHaveLength(0) // fresh claim — not reclaimed

    // Simulate a crashed run: force updated_at older than 2 hours.
    const record = (await store.getNotificationSchedule('scheduled_report', 'r1'))!
    record.updated_at = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    const reclaimed = await store.claimDueNotificationSchedules(new Date())
    expect(reclaimed.map(s => s.id)).toEqual([schedule.id])
  })

  it('completeNotificationSchedule clears is_running and records the result', async () => {
    const schedule = await store.createNotificationSchedule({ module: 'scheduled_report', source_id: 'r1', is_enabled: true, frequency: 'daily', weekdays: [], execution_time: '09:00', timezone: 'UTC', next_run_at: new Date(Date.now() - 1000).toISOString(), created_by: 'a@b.com', updated_by: null })
    await store.claimDueNotificationSchedules(new Date())
    const nextRunAt = new Date(Date.now() + 86_400_000).toISOString()
    await store.completeNotificationSchedule(schedule.id, { status: 'failed', error: 'boom', nextRunAt })

    const after = (await store.getNotificationSchedule('scheduled_report', 'r1'))!
    expect(after.is_running).toBe(false)
    expect(after.last_run_status).toBe('failed')
    expect(after.last_run_error).toBe('boom')
    expect(after.next_run_at).toBe(nextRunAt)
  })
})

describe('scheduledReportsStore — schedule audit log', () => {
  it('records and caps audit entries, newest first', async () => {
    for (let i = 0; i < 205; i++) {
      await store.recordScheduleAuditEntry({ userEmail: 'a@b.com', action: 'NOTIFICATION_SCHEDULE_UPDATED', resourceId: `r${i}`, oldValue: {}, newValue: { i } })
    }
    const entries = await store.listScheduleAuditEntries(500)
    expect(entries).toHaveLength(200)
    expect((entries[0]!.newValue as { i: number }).i).toBe(204)
  })
})
