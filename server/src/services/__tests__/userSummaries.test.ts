import { describe, it, expect } from 'vitest'
import { deriveUserSummaries, nameFromUpn } from '../userSummaries.js'
import type { Device } from '../../types.js'

const dev = (o: Partial<Device>): Device => ({
  id: 'd', deviceName: 'PC', user: 'a.b@x.com', serialNumber: 's', platform: 'Windows', osVersion: '11', managementSource: 'Microsoft Intune',
  lastCheckIn: '11/20/2026, 9:00:00 AM', complianceState: 'Compliant', encryptionStatus: 'BitLocker On', primaryIssue: 'None', policyFailed: 'None',
  severity: 'Low', confidence: '85%', firstDetected: '', lastDetected: '', issueSource: '', ...o,
})

describe('deriveUserSummaries', () => {
  it('groups Intune devices by user, case-insensitively, with the worst compliance and the latest check-in', () => {
    const out = deriveUserSummaries([
      dev({ id: '1', user: 'Ann.Lee@x.com', deviceName: 'A1', lastCheckIn: '11/18/2026, 8:00:00 AM' }),
      dev({ id: '2', user: 'ann.lee@x.com', deviceName: 'A2', complianceState: 'Non-Compliant', lastCheckIn: '11/20/2026, 8:00:00 AM', platform: 'macOS', encryptionStatus: 'FileVault Off' }),
      dev({ id: '3', user: 'bo@x.com', deviceName: 'B1', complianceState: 'Warning' }),
    ])
    expect(out).toHaveLength(2)
    const ann = out.find(u => u.upn === 'ann.lee@x.com')!
    expect(ann.devices.map(d => d.deviceName).sort()).toEqual(['A1', 'A2'])
    expect(ann.complianceState).toBe('Non-Compliant')
    expect(ann.lastSyncDateTime.startsWith('2026-11-20')).toBe(true)
    expect(ann.devices.find(d => d.deviceName === 'A2')).toMatchObject({ platform: 'macOS', encryptionStatus: 'FileVault Off' })
    expect(out.find(u => u.upn === 'bo@x.com')!.complianceState).toBe('Warning')
  })

  it('ignores devices with no signed-in user or from another source, and never invents a user', () => {
    expect(deriveUserSummaries([
      dev({ user: '' }), dev({ user: 'Unknown' }), dev({ user: 'no-at-sign' }),
      dev({ user: 'x@x.com', managementSource: 'ManageEngine' }),
    ])).toEqual([])
  })

  it('prefers the directory display name and falls back to a readable name from the address', () => {
    const names = new Map([['ann.lee@x.com', 'Ann M. Lee']])
    expect(deriveUserSummaries([dev({ user: 'ann.lee@x.com' })], names)[0]!.displayName).toBe('Ann M. Lee')
    expect(deriveUserSummaries([dev({ user: 'ann.lee@x.com' })])[0]!.displayName).toBe('Ann Lee')
    expect(nameFromUpn('first_middle-last@x.com')).toBe('First Middle Last')
    expect(nameFromUpn('single@x.com')).toBe('Single')
  })

  it('copes with an unparseable check-in time', () => {
    const [u] = deriveUserSummaries([dev({ lastCheckIn: 'never' })])
    expect(u!.lastSyncDateTime).toBe(new Date(0).toISOString())
  })
})
