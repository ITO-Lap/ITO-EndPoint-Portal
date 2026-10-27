import { describe, it, expect, vi, beforeEach } from 'vitest'

const reportBuffer = Buffer.from('report-content')

vi.mock('../criticalPatchReport.js', () => ({ createCriticalPatchReport: vi.fn(async () => ({ content: reportBuffer, filename: 'critical-patching.xlsx', rows: 3, criticalDevices: 2 })) }))
vi.mock('../staleDevicesReport.js', () => ({ createStaleDevicesReport: vi.fn(async () => ({ content: reportBuffer, filename: 'stale-devices.xlsx', rows: [{ a: 1 }, { a: 2 }] })) }))
vi.mock('../complianceInventoryReport.js', () => ({
  createComplianceReport: vi.fn(async () => ({ content: reportBuffer, filename: 'compliance.xlsx', rows: 10 })),
  createInventoryReport:  vi.fn(async () => ({ content: reportBuffer, filename: 'inventory.xlsx', rows: 20 })),
}))
vi.mock('../slack.js', () => ({ uploadSlackFile: vi.fn(async () => ({ ok: true })) }))
vi.mock('../../store/integrationStore.js', () => ({ getSlackConfig: vi.fn(() => ({ botToken: 'xoxb-test' })) }))
vi.mock('../reportEmail.js', () => ({ sendReportEmail: vi.fn(async () => ({ ok: true })) }))

let reports: Array<{ id: string; name: string; report_type: string; schedule_cron: string; format: string; recipients: string[]; filters: Record<string, unknown>; is_active: boolean; last_run_at: string | null }> = []
let notificationScheduleExists: Record<string, boolean> = {}
const recordedRuns: Array<{ reportId: string; run: Record<string, unknown> }> = []

vi.mock('../../store/scheduledReportsStore.js', () => ({
  getReport: vi.fn((id: string) => reports.find(r => r.id === id)),
  listReports: vi.fn(() => reports),
  getNotificationSchedule: vi.fn((_module: string, sourceId: string) => (notificationScheduleExists[sourceId] ? {} : undefined)),
  listAllNotificationSchedules: vi.fn(() =>
    Object.keys(notificationScheduleExists).filter(id => notificationScheduleExists[id]).map(id => ({ module: 'scheduled_report', source_id: id }))
  ),
  recordReportRun: vi.fn((reportId: string, run: Record<string, unknown>) => {
    recordedRuns.push({ reportId, run })
    return { id: `run-${recordedRuns.length}`, ...run }
  }),
}))

import { createCriticalPatchReport } from '../criticalPatchReport.js'
import { createStaleDevicesReport } from '../staleDevicesReport.js'
import { createComplianceReport, createInventoryReport } from '../complianceInventoryReport.js'
import { uploadSlackFile } from '../slack.js'
import { sendReportEmail } from '../reportEmail.js'
import { runScheduledReportNow, runDueReports } from '../scheduledReportRunner.js'

function makeReport(overrides: Partial<(typeof reports)[number]> = {}): (typeof reports)[number] {
  return {
    id: 'r1', name: 'Test Report', report_type: 'compliance', schedule_cron: '* * * * *',
    format: 'excel', recipients: [], filters: {}, is_active: true, last_run_at: null,
    ...overrides,
  }
}

beforeEach(() => {
  reports = []
  notificationScheduleExists = {}
  recordedRuns.length = 0
  vi.mocked(uploadSlackFile).mockClear()
  vi.mocked(sendReportEmail).mockClear()
  vi.mocked(createCriticalPatchReport).mockClear()
  vi.mocked(createStaleDevicesReport).mockClear()
  vi.mocked(createComplianceReport).mockClear()
  vi.mocked(createInventoryReport).mockClear()
})

describe('runScheduledReportNow — generation dispatch by report_type', () => {
  it.each([
    ['critical-patching', createCriticalPatchReport],
    ['stale-devices', createStaleDevicesReport],
    ['compliance', createComplianceReport],
    ['inventory', createInventoryReport],
  ] as const)('dispatches %s to its dedicated generator', async (reportType, generatorFn) => {
    reports = [makeReport({ report_type: reportType, filters: { slackChannelId: 'C1' } })]
    await runScheduledReportNow('r1')
    expect(generatorFn).toHaveBeenCalledTimes(1)
  })
})

describe('runScheduledReportNow — delivery dispatch', () => {
  it('sends the overview blocks with the file (and no initial comment) when the report has an overview', async () => {
    vi.mocked(createComplianceReport).mockResolvedValueOnce({ content: reportBuffer, filename: 'compliance.xlsx', rows: 10, overview: { title: 'Device Compliance', fields: [{ label: 'Total devices', value: 10 }], action: 'Act' } } as never)
    reports = [makeReport({ filters: { slackChannelId: 'C123' } })]
    await runScheduledReportNow('r1')
    const upload = vi.mocked(uploadSlackFile).mock.calls[0]![1]
    expect(upload.blocks?.length).toBeGreaterThan(0)
    expect(upload).not.toHaveProperty('initialComment')
  })

  it('falls back to the plain comment for reports without an overview', async () => {
    reports = [makeReport({ report_type: 'critical-patching', filters: { slackChannelId: 'C123' } })]
    await runScheduledReportNow('r1')
    const upload = vi.mocked(uploadSlackFile).mock.calls[0]![1]
    expect(upload.initialComment).toContain('Test Report')
    expect(upload).not.toHaveProperty('blocks')
  })

  it('puts the overview figures in the email body', async () => {
    vi.mocked(createComplianceReport).mockResolvedValueOnce({ content: reportBuffer, filename: 'compliance.xlsx', rows: 10, overview: { title: 'Device Compliance', fields: [{ label: 'Total devices', value: 10 }], action: 'Act' } } as never)
    reports = [makeReport({ recipients: ['a@corp.test'] })]
    await runScheduledReportNow('r1')
    expect(vi.mocked(sendReportEmail).mock.calls[0]![0].message).toContain('Total devices: 10')
  })

  it('delivers via Slack when filters.slackChannelId is set', async () => {
    reports = [makeReport({ filters: { slackChannelId: 'C123' } })]
    await runScheduledReportNow('r1')
    expect(uploadSlackFile).toHaveBeenCalledTimes(1)
    expect(sendReportEmail).not.toHaveBeenCalled()
  })

  it('delivers via email when recipients are set and no Slack channel', async () => {
    reports = [makeReport({ filters: {}, recipients: ['ito_endpoint@zinnia.com'] })]
    await runScheduledReportNow('r1')
    expect(sendReportEmail).toHaveBeenCalledTimes(1)
    expect(uploadSlackFile).not.toHaveBeenCalled()
  })

  it('records a completed run on success', async () => {
    reports = [makeReport({ filters: { slackChannelId: 'C1' } })]
    await runScheduledReportNow('r1')
    expect(recordedRuns).toHaveLength(1)
    expect(recordedRuns[0]!.run.status).toBe('completed')
  })

  it('records a failed run and rejects when delivery fails', async () => {
    vi.mocked(uploadSlackFile).mockResolvedValueOnce({ ok: false, error: 'channel_not_found' })
    reports = [makeReport({ filters: { slackChannelId: 'C1' } })]
    await expect(runScheduledReportNow('r1')).rejects.toThrow('channel_not_found')
    expect(recordedRuns).toHaveLength(1)
    expect(recordedRuns[0]!.run.status).toBe('failed')
    expect(recordedRuns[0]!.run.error_message).toBe('channel_not_found')
  })

  it('fails clearly when neither a Slack channel nor recipients are configured', async () => {
    reports = [makeReport({ filters: {}, recipients: [] })]
    await expect(runScheduledReportNow('r1')).rejects.toThrow(/no slack channel or email recipients/i)
  })
})

describe('runDueReports', () => {
  it('skips a report whose notification schedule has taken over', async () => {
    reports = [makeReport({ filters: { slackChannelId: 'C1' } })]
    notificationScheduleExists['r1'] = true
    await runDueReports()
    expect(uploadSlackFile).not.toHaveBeenCalled()
  })

  it('runs a due, un-migrated, active report matching its cron', async () => {
    reports = [makeReport({ filters: { slackChannelId: 'C1' }, schedule_cron: '* * * * *' })]
    await runDueReports()
    expect(uploadSlackFile).toHaveBeenCalledTimes(1)
  })

  it('does not run an inactive report', async () => {
    reports = [makeReport({ filters: { slackChannelId: 'C1' }, is_active: false })]
    await runDueReports()
    expect(uploadSlackFile).not.toHaveBeenCalled()
  })
})
