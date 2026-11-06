import { describe, it, expect } from 'vitest'
import { buildUpdateReport } from '../updateReport.js'
import type { AssessedApp } from '../types.js'

const NOW = '2026-10-12T10:00:00.000Z'
function app(over: Partial<AssessedApp> = {}): AssessedApp {
  return {
    key: 'k1', platform: 'macOS',
    identity: { publisher: null, displayName: 'Zoom', bundleId: 'us.zoom.xos', productCode: null, wingetId: null, brewToken: 'zoom' },
    installed: [{ version: '6.0.0', deviceCount: 5, provider: 'manageengine-mdm' }, { version: '6.1.0', deviceCount: 3, provider: 'manageengine-mdm' }],
    packages: [], confidence: 'high', confidenceReason: '', providers: ['manageengine-mdm'], nativeHint: null, nativeReason: null,
    installSource: 'manual', installSourceBasis: 'none', installSourceReason: '',
    status: 'Package required', reason: '', action: '', deployedPackageVersion: null,
    latest: { version: '6.1.0', versionSource: 'Homebrew cask API (zoom)', sourceUrl: '', lastCheckedAt: NOW, selfUpdating: false },
    latestUnavailable: null, affectedDevices: 5, evidence: [], dataGaps: [], totalDevices: 8, detectedVersion: ['6.0.0', '6.1.0'], lastCheckedAt: NOW, ...over,
  }
}

describe('buildUpdateReport', () => {
  it('lists only apps behind the verified latest, with versions and device counts', () => {
    const r = buildUpdateReport([app(), app({ key: 'k2', identity: { ...app().identity, displayName: 'Slack' }, affectedDevices: 0 })], { syncedAt: NOW, errors: {} })
    expect(r.updatesAvailable).toBe(1)
    expect(r.devicesBehind).toBe(5)
    const text = r.messages.join('\n')
    expect(text).toContain('*Zoom* 6.0.0 ×5 → *6.1.0* — 5/8 devices behind')
    expect(text).not.toContain('Slack')
  })

  it('states data limits instead of presenting a partial picture as complete', () => {
    const r = buildUpdateReport([app(), app({ key: 'k3', latest: null, affectedDevices: 0, status: 'Data unavailable' })], { syncedAt: NOW, errors: { 'manageengine-coverage': 'ManageEngine app lists could not be read for 3 of 40 devices' } })
    const text = r.messages.join('\n')
    expect(text).toMatch(/could not be read for 3 of 40 devices/)
    expect(text).toMatch(/1 app\(s\) have no verified latest-version source/)
  })

  it('splits long reports into multiple Slack-sized messages and strips mrkdwn injection', () => {
    const many = Array.from({ length: 60 }, (_, i) => app({ key: `k${i}`, platform: i % 2 ? 'windows' : 'macOS', identity: { ...app().identity, displayName: `App ${i} <!channel> *x*` } }))
    const r = buildUpdateReport(many, { syncedAt: NOW, errors: {} })
    expect(r.messages.length).toBeGreaterThan(1)
    expect(r.messages.every(m => m.length < 4000)).toBe(true)
    expect(r.messages.join('')).not.toContain('<!channel>')
  })
})

describe('sendUpdateReportToSlack Excel attachment', () => {
  it('posts the text, attaches the workbook, and still succeeds if the upload fails', async () => {
    const { vi } = await import('vitest')
    vi.resetModules()
    const sendSlackMessage = vi.fn().mockResolvedValue({ ok: true })
    const uploadSlackFile = vi.fn().mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, error: 'boom' })
    vi.doMock('../../slack.js', () => ({ sendSlackMessage, uploadSlackFile }))
    vi.doMock('../../../store/integrationStore.js', () => ({ getSlackConfig: () => ({ botToken: 'xoxb-1' }) }))
    vi.doMock('../../reportExporter.js', () => ({ exportToExcel: vi.fn().mockResolvedValue(Buffer.from('x')) }))
    vi.doMock('../service.js', () => ({ getAppIntelService: vi.fn() }))
    const { sendUpdateReportToSlack } = await import('../updateReport.js')
    const meta = { syncedAt: NOW, errors: {} }
    const first = await sendUpdateReportToSlack([app()], meta, 'C1')
    expect(first).toMatchObject({ ok: true, fileAttached: true })
    expect(sendSlackMessage).toHaveBeenCalled()
    expect(uploadSlackFile.mock.calls[0]![1]).toMatchObject({ channelId: 'C1', filename: 'managed-app-report-2026-10-12.xlsx' })
    const second = await sendUpdateReportToSlack([app()], meta, 'C1')
    expect(second).toMatchObject({ ok: true, fileAttached: false })
    const none = await sendUpdateReportToSlack([app({ affectedDevices: 0, installed: [{ version: '6.1.0', deviceCount: 8, provider: 'manageengine-mdm' }] })], meta, 'C1')
    expect(none.fileAttached).toBe(false)
    expect(uploadSlackFile).toHaveBeenCalledTimes(2)
  })
})
