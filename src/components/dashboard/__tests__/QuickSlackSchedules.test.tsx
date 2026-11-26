import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QuickSlackSchedules } from '../QuickSlackSchedules'
import { notificationScheduleApi, type NotificationScheduleListItem } from '../../../api/notificationSchedule'

vi.mock('../../../api/notificationSchedule', () => ({ notificationScheduleApi: { list: vi.fn(), update: vi.fn() } }))
vi.mock('../../notifications/EditSlackScheduleModal', () => ({ EditSlackScheduleModal: () => null }))
vi.mock('../../notifications/scheduleFormat', () => ({ describeSchedule: () => 'Weekly on Monday' }))

const row = (o: Partial<NotificationScheduleListItem> = {}) => ({ id: 's1', module: 'scheduled_report', source_id: 'r1', is_enabled: true, next_run_at: null, reportName: 'Weekly compliance', reportType: 'compliance', frequency: 'weekly', weekdays: [1], execution_time: '09:00', timezone: 'UTC', ...o }) as unknown as NotificationScheduleListItem
const api = vi.mocked(notificationScheduleApi)

beforeEach(() => vi.clearAllMocks())

describe('QuickSlackSchedules', () => {
  it('shows a spinner first, then the schedules', async () => {
    api.list.mockResolvedValue({ success: true, data: [row()] } as never)
    render(<QuickSlackSchedules canEdit />)
    expect(await screen.findByText('Weekly compliance')).toBeInTheDocument()
    expect(api.list).toHaveBeenCalledTimes(1)
  })
  it('says so when there are none, and when loading fails', async () => {
    api.list.mockResolvedValueOnce({ success: true, data: [] } as never)
    const { unmount } = render(<QuickSlackSchedules canEdit />)
    expect(await screen.findByText('No Slack schedules yet')).toBeInTheDocument()
    unmount()
    api.list.mockResolvedValueOnce({ success: false } as never)
    render(<QuickSlackSchedules canEdit />)
    expect(await screen.findByText("Couldn't load Slack schedules.")).toBeInTheDocument()
  })
  it('does not set state after it is removed mid-load', async () => {
    let finish!: (v: unknown) => void
    api.list.mockReturnValue(new Promise(r => { finish = r }) as never)
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { unmount } = render(<QuickSlackSchedules canEdit />)
    unmount(); finish({ success: true, data: [row()] })
    await Promise.resolve()
    expect(err).not.toHaveBeenCalled()
    err.mockRestore()
  })
})
