import { describe, it, expect, vi } from 'vitest'

vi.mock('../intune.js', () => ({
  isIntuneConfigured: () => true,
  getIntuneDeviceActivity: vi.fn(async () => [{ time: '2026-11-01T10:00:00Z', category: 'Action', event: 'syncDevice', status: 'done', detail: '' }]),
  getIntuneDevicePolicies: vi.fn(async () => ['Win Baseline — Non-Compliant', 'BitLocker — Compliant']),
  getIntuneDeviceApps: vi.fn(async () => { throw new Error('Microsoft Graph 403 on detectedApps') }),
}))
vi.mock('../manageEngine.js', () => ({
  isManageEngineConfigured: () => true,
  getManageEngineDeviceProfileResults: vi.fn(async () => ({ profiles: [{ profileName: 'FileVault', status: 'Installed', remarks: null, localizedRemarks: 'ok', appliedTime: '1790666616000' }] })),
  getManageEngineDevicePolicies: vi.fn(async () => ['FileVault', 'Passcode']),
  getManageEngineDeviceApps: vi.fn(async () => [{ name: '=cmd|calc', version: '1', publisher: 'X', status: 'Installed' }]),
}))
vi.mock('../reportExporter.js', () => ({ exportToExcel: vi.fn(async () => Buffer.from('xlsx')) }))

import { toIso, parsePolicy, deviceFactEntries, collectDeviceLog, logToCsv, safeCell, logFilename } from '../deviceLogs.js'
import type { Device } from '../../types.js'

const dev = (o: Partial<Device> = {}): Device => ({
  id: 'd1', deviceName: 'PC-1', user: 'a@b.c', serialNumber: 'S1', platform: 'Windows', osVersion: '10.0.26100.1', managementSource: 'Microsoft Intune',
  lastCheckIn: '2026-11-05T09:00:00Z', complianceState: 'Non-Compliant', encryptionStatus: 'Encrypted', primaryIssue: 'OS out of date', policyFailed: 'Win Baseline',
  severity: 'High', confidence: 'High', firstDetected: '2026-10-01T00:00:00Z', lastDetected: '2026-11-05T00:00:00Z', issueSource: 'Intune', ...o,
} as Device)

describe('helpers', () => {
  it('normalises timestamps', () => {
    expect(toIso('1790666616000')).toBe(new Date(1790666616000).toISOString())
    expect(toIso(1790666616)).toBe(new Date(1790666616000).toISOString())
    expect(toIso('2026-11-05T09:00:00Z')).toBe('2026-11-05T09:00:00.000Z')
    expect(toIso('—')).toBe(''); expect(toIso('garbage')).toBe('')
  })
  it('splits policy state', () => { expect(parsePolicy('A — B — Compliant')).toEqual({ name: 'A — B', state: 'Compliant' }); expect(parsePolicy('Plain')).toEqual({ name: 'Plain', state: '' }) })
  it('neutralises spreadsheet formulas', () => { expect(safeCell('=1+1')).toBe("'=1+1"); expect(safeCell('@x')).toBe("'@x"); expect(safeCell('ok')).toBe('ok') })
  it('emits issue events only when non-compliant', () => {
    expect(deviceFactEntries(dev()).some(e => e.event === 'Issue first detected')).toBe(true)
    expect(deviceFactEntries(dev({ complianceState: 'Compliant' })).some(e => e.event === 'Issue first detected')).toBe(false)
  })
})

describe('collectDeviceLog', () => {
  it('keeps going when one Intune section fails and reports it', async () => {
    const log = await collectDeviceLog(dev())
    expect(log.entries.some(e => e.category === 'Action' && e.event === 'syncDevice')).toBe(true)
    expect(log.entries.filter(e => e.category === 'Policy')).toHaveLength(2)
    const apps = log.sections.find(s => s.name === 'Intune detected apps')!
    expect(apps.ok).toBe(false); expect(apps.error).toMatch(/403/)
    expect(log.entries[0]!.time >= log.entries[log.entries.length - 1]!.time).toBe(true)
  })
  it('collects ManageEngine profiles for a Mac without duplicating them as policies', async () => {
    const log = await collectDeviceLog(dev({ platform: 'macOS', managementSource: 'ManageEngine' }))
    expect(log.entries.filter(e => e.category === 'Profile')).toHaveLength(1)
    expect(log.entries.filter(e => e.category === 'Policy').map(e => e.event)).toEqual(['Passcode'])
    expect(log.entries.find(e => e.category === 'Profile')!.time).toBe(new Date(1790666616000).toISOString())
  })
  it('exports CSV with formula-safe cells and a safe filename', async () => {
    const log = await collectDeviceLog(dev({ platform: 'macOS', managementSource: 'ManageEngine', deviceName: 'a/b c' }))
    const csv = logToCsv(log)
    expect(csv.split('\r\n')[0]).toContain('"Time (UTC)"')
    expect(csv).toContain(`"'=cmd|calc"`)
    expect(logFilename(log, 'csv')).toMatch(/^device-log-a_b_c-\d{4}-\d{2}-\d{2}\.csv$/)
  })
})
