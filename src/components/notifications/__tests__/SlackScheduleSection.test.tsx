import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { NotificationScheduleState } from '../../../api/notificationSchedule'

vi.mock('../../../api/notificationSchedule', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../api/notificationSchedule')>()
  return { ...actual, notificationScheduleApi: { get: vi.fn(), update: vi.fn() } }
})

import { notificationScheduleApi } from '../../../api/notificationSchedule'
import { SlackScheduleSection } from '../SlackScheduleSection'

const api = vi.mocked(notificationScheduleApi)

const scheduleState = (over: Partial<NotificationScheduleState['schedule']> = {}): NotificationScheduleState => ({
  schedule: {
    id: 'sched-1', module: 'scheduled_report', source_id: 'report-1',
    is_enabled: true, frequency: 'weekly', weekdays: [1, 3], execution_time: '09:00', timezone: 'Asia/Kolkata',
    next_run_at: '2026-10-26T03:30:00.000Z', last_run_at: '2026-10-19T03:30:00.000Z', last_run_status: 'completed', last_run_error: null,
    updated_by: 'admin@zinnia.com', updated_at: '2026-10-12T00:00:00.000Z',
    ...over,
  },
  slackConfigured: true,
})

beforeEach(() => {
  api.get.mockReset()
  api.update.mockReset()
})

describe('SlackScheduleSection', () => {
  it('renders the readable schedule, status, and next/last run for an admin', async () => {
    api.get.mockResolvedValue({ success: true, data: scheduleState() })
    render(<SlackScheduleSection module="scheduled_report" sourceId="report-1" canEdit />)

    await screen.findByText(/Weekly on Mon, Wed at 9:00 AM/)
    expect(screen.getByText('Enabled')).toBeInTheDocument()
    expect(screen.getByText(/Asia\/Kolkata/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Edit schedule/ })).toBeInTheDocument()
  })

  it('hides the Edit action and shows a read-only note for a non-admin', async () => {
    api.get.mockResolvedValue({ success: true, data: scheduleState() })
    render(<SlackScheduleSection module="scheduled_report" sourceId="report-1" canEdit={false} />)

    await screen.findByText(/Weekly on Mon, Wed at 9:00 AM/)
    expect(screen.queryByRole('button', { name: /Edit schedule/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Global Admin required to edit/)).toBeInTheDocument()
  })

  it('shows a scheduler-unavailable banner instead of a fabricated schedule when the DB is down', async () => {
    api.get.mockResolvedValue({ success: true, data: null, message: 'Database not configured.' })
    render(<SlackScheduleSection module="scheduled_report" sourceId="report-1" canEdit />)

    await screen.findByText(/Scheduler unavailable/)
    expect(screen.queryByText(/Weekly on/)).not.toBeInTheDocument()
  })

  it('shows a Slack-not-configured badge without hiding the schedule itself', async () => {
    api.get.mockResolvedValue({ success: true, data: { ...scheduleState(), slackConfigured: false } })
    render(<SlackScheduleSection module="scheduled_report" sourceId="report-1" canEdit />)

    await screen.findByText(/Weekly on Mon, Wed at 9:00 AM/)
    expect(screen.getByText('Slack not configured')).toBeInTheDocument()
  })
})
