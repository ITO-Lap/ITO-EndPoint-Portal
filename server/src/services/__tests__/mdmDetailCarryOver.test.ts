import { describe, it, expect } from 'vitest'
import type { Device } from '../../types.js'
import { carryOverMdmDetails, UNREAD_MARKER, maxCarryAgeMs } from '../mdmDetailCarryOver.js'

const NOW = Date.parse('2026-11-19T12:00:00Z')
const mac = (id: string, o: Record<string, unknown> = {}): Device => ({
  id, deviceName: id, user: 'u', serialNumber: 'S' + id, platform: 'macOS', osVersion: '15', managementSource: 'ManageEngine', lastCheckIn: '',
  complianceState: 'Compliant', encryptionStatus: 'Encrypted', passcodeStatus: 'Present', primaryIssue: 'None', policyFailed: 'None', severity: 'Low',
  confidence: '95%', firstDetected: '', lastDetected: '', issueSource: 'ManageEngine', ...o,
}) as unknown as Device
const unread = (id: string) => mac(id, { complianceState: 'Warning', encryptionStatus: 'Unknown', passcodeStatus: 'Unknown', primaryIssue: UNREAD_MARKER, confidence: '60%' })
const savedAt = '2026-11-18T12:00:00Z'

describe('carryOverMdmDetails', () => {
  it('keeps last-known values for unread devices and marks them stale', () => {
    const r = carryOverMdmDetails([unread('a'), mac('b')], [mac('a', { encryptionStatus: 'Not Encrypted', complianceState: 'Non-Compliant', primaryIssue: 'Storage encryption disabled' }), mac('b')], savedAt, NOW)
    expect(r.devices[0]).toMatchObject({ encryptionStatus: 'Not Encrypted', complianceState: 'Non-Compliant', detailsStaleSince: savedAt })
    expect(r.devices[1]!.detailsStaleSince).toBeUndefined()
    expect(r).toMatchObject({ unread: 1, carried: 1, mdmTotal: 2, degraded: true })
  })
  it('keeps the ORIGINAL read time across repeated failures', () => {
    const prev = mac('a', { detailsStaleSince: '2026-11-15T00:00:00Z' })
    expect(carryOverMdmDetails([unread('a')], [prev], savedAt, NOW).devices[0]!.detailsStaleSince).toBe('2026-11-15T00:00:00Z')
  })
  it('does not carry values older than the maximum age, or from a previously unread device', () => {
    const old = new Date(NOW - maxCarryAgeMs() - 1000).toISOString()
    expect(carryOverMdmDetails([unread('a')], [mac('a')], old, NOW).devices[0]!.primaryIssue).toBe(UNREAD_MARKER)
    expect(carryOverMdmDetails([unread('a')], [unread('a')], savedAt, NOW).carried).toBe(0)
    expect(carryOverMdmDetails([unread('new')], [mac('a')], savedAt, NOW).carried).toBe(0)
  })
  it('never touches Intune, Endpoint Central agent rows or healthy reads, and is not degraded under the threshold', () => {
    const intune = mac('i', { managementSource: 'Microsoft Intune', primaryIssue: UNREAD_MARKER })
    const ec = mac('ec-1', { platform: 'Windows' })
    const fleet = [intune, ec, ...Array.from({ length: 9 }, (_, i) => mac('m' + i)), unread('x')]
    const r = carryOverMdmDetails(fleet, null, null, NOW)
    expect(r.devices[0]).toBe(intune)
    expect(r.degraded).toBe(false) // 1 of 10 MDM devices
  })
})
