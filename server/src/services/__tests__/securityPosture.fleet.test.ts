import { describe, it, expect, afterEach } from 'vitest'
import type { Device } from '../../types.js'
import type { PatchSystemStatus } from '../endpointCentralPatch.js'
import { buildPosture, listPillarDevices } from '../securityPosture.js'
import { UNREAD_MARKER } from '../mdmDetailCarryOver.js'

// A small synthetic fleet shaped like the real tenant: hybrid Windows (Intune + Endpoint Central), Endpoint Central-only
// Windows, Macs in MDM + agent, duplicate host names, a failed MDM detail read, and an agent with no inventory device.
const NOW = Date.parse('2026-11-19T12:00:00Z')
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString()
const mk = (o: Record<string, unknown>): Device => ({
  user: 'u', serialNumber: 'Unknown', platform: 'Windows', osVersion: '11', managementSource: 'Microsoft Intune', lastCheckIn: ago(1),
  complianceState: 'Compliant', encryptionStatus: 'BitLocker On', primaryIssue: 'None', policyFailed: 'None', severity: 'Low', confidence: '', firstDetected: '',
  lastDetected: '', issueSource: '', ...o,
}) as unknown as Device
const sys = (o: Partial<PatchSystemStatus>): PatchSystemStatus => ({
  resourceId: '1', detailResourceId: 'x', platform: 'Windows', names: [], missingOsPatches: 0, missingThirdPartyPatches: 0, missingDriverPatches: 0, missingBiosPatches: 0,
  criticalPatchCount: 0, importantPatchCount: 0, moderatePatchCount: 0, lowPatchCount: 0, lastScanTime: null, lastSuccessfulScanTime: null, lastContactTime: ago(1), scanSucceeded: true, ...o,
})

const devices = [
  mk({ id: 'w1', deviceName: 'WIN-1', serialNumber: 'SER000001', lastCheckIn: ago(40), macAddress: 'AA:00:00:00:00:01' }),          // hybrid, stale Intune sync
  mk({ id: 'w2', deviceName: 'WIN-2', serialNumber: 'SER000002', encryptionStatus: 'BitLocker Off', complianceState: 'Non-Compliant', primaryIssue: 'Encryption' }),
  mk({ id: 'ec-R3', deviceName: 'ecbox', managementSource: 'ManageEngine', encryptionStatus: 'Unknown', complianceState: 'Non-Compliant', primaryIssue: '2 critical OS patches missing' }),
  mk({ id: 'm1', deviceName: 'Mac-1', platform: 'macOS', managementSource: 'ManageEngine', serialNumber: 'C02AAA1111', encryptionStatus: 'Encrypted', lastCheckIn: ago(30) }),
  mk({ id: 'm2', deviceName: 'Mac-2', platform: 'macOS', managementSource: 'ManageEngine', serialNumber: 'C02BBB2222', encryptionStatus: 'Unknown', complianceState: 'Warning', primaryIssue: UNREAD_MARKER }),
  mk({ id: 'd1', deviceName: 'DUP', serialNumber: 'SER000007' }),
  mk({ id: 'd2', deviceName: 'DUP', serialNumber: 'SER000008' }),
  mk({ id: 'p1', deviceName: 'iPhone', platform: 'iOS' }),
]
const ecRows = [mk({ id: 'ec-R1', deviceName: 'win-1.corp', managementSource: 'ManageEngine', lastCheckIn: ago(1), macAddress: 'aa0000000001' })]
const systems = [
  sys({ detailResourceId: 'R1', names: ['WIN-1'], criticalPatchCount: 2, importantPatchCount: 1 }),
  sys({ detailResourceId: 'R2', names: ['X-SER000002'] }),
  sys({ detailResourceId: 'R3', names: ['ecbox'], criticalPatchCount: 1 }),
  sys({ detailResourceId: 'R4', platform: 'Mac', names: ['Mac-C02AAA1111'], criticalPatchCount: 3 }),
  sys({ detailResourceId: 'R5', names: ['DUP'], criticalPatchCount: 9 }),
  sys({ detailResourceId: 'R9', platform: 'Mac', names: ['agent-only-mac'] }),
]
const r = buildPosture(devices, systems, 'all', NOW, null, ecRows)
const p = (id: string) => r.pillars.find(x => x.id === id)!
const rows = (pillarId: 'encryption' | 'patching' | 'compliance' | 'checkin') => Object.fromEntries(listPillarDevices(devices, systems, null, { pillarId }, NOW, ecRows).rows.map(x => [x.id, x]))

afterEach(() => { delete process.env['POSTURE_CHECKIN_RULE']; delete process.env['POSTURE_CHECKIN_DAYS'] })

describe('synthetic fleet', () => {
  it('encryption: Intune and Mac MDM scored; agent-only and unread Mac not reported', () => {
    expect(p('encryption')).toMatchObject({ passing: 4, failing: 1, notReported: 2 }) // w1,d1,d2,m1 pass · w2 fail · ec-R3,m2 n/r
  })
  it('patching: resource id, serial, hostname; duplicate names refused; Macs via serial', () => {
    const t = rows('patching')
    expect(t['w1']).toMatchObject({ status: 'fail' })      // hybrid, via host name
    expect(t['w2']).toMatchObject({ status: 'pass' })      // via serial
    expect(t['ec-R3']).toMatchObject({ status: 'fail' })   // via resource id
    expect(t['m1']).toMatchObject({ status: 'fail' })      // Mac via serial
    expect(t['m2']).toMatchObject({ status: 'unknown' })
    expect(t['d1']!.detail).toMatch(/No Endpoint Central agent found/)
    expect(t['m2']!.detail).toBe('No Patch Manager scan for this device')
    expect(t['d1']).toMatchObject({ status: 'unknown' })   // ambiguous "DUP" is never guessed
    expect(p('patching').unmatchedAgents).toEqual({ windows: 1, macos: 1 }) // R5 (DUP) and the agent-only Mac
  })
  it('compliance: Intune native; agent-only and unread MDM not reported; never failing on a missing signal', () => {
    const c = rows('compliance')
    expect(c['ec-R3']!.status).toBe('unknown')
    expect(c['m2']!.status).toBe('unknown')
    expect(c['w2']!.status).toBe('fail')
  })
  it('check-in follows the configured rule', () => {
    expect(rows('checkin')['w1']!.status).toBe('pass')               // default "either": agent contact is fresh
    process.env['POSTURE_CHECKIN_RULE'] = 'mdm-only'
    expect(rows('checkin')['w1']!.status).toBe('fail')               // Intune alone is 40d stale
    process.env['POSTURE_CHECKIN_RULE'] = 'both'
    expect(rows('checkin')['w1']!.status).toBe('fail')               // one stale signal is enough to fail
    expect(rows('checkin')['w1']!.facts?.find(f => f.label === 'Verdict based on')?.value).toMatch(/Both/)
  })
  it('agent coverage reflects the data and moves as agents appear (no code change)', () => {
    expect(r.coverage).toMatchObject({ windows: { devices: 5, withAgent: 3 }, macos: { devices: 2, withAgent: 1 } })
    const rolledOut = buildPosture(devices, [...systems, sys({ detailResourceId: 'R6', names: ['Mac-C02BBB2222'], platform: 'Mac' }), sys({ detailResourceId: 'R7', names: ['X-SER000007'] })], 'all', NOW, null, ecRows)
    expect(rolledOut.coverage).toMatchObject({ windows: { withAgent: 4 }, macos: { withAgent: 2 } })
    expect(buildPosture(devices, null, 'all', NOW).coverage).toBeNull()
  })
  it('the check-in window is configurable', () => {
    process.env['POSTURE_CHECKIN_RULE'] = 'mdm-only' // m1: MDM contact is 30d old (its agent is fresh)
    expect(rows('checkin')['m1']!.status).toBe('fail')
    process.env['POSTURE_CHECKIN_DAYS'] = '45'
    expect(rows('checkin')['m1']!.status).toBe('pass')
    expect(buildPosture(devices, systems, 'all', NOW).pillars.find(x => x.id === 'checkin')!.description).toBe('Checked in within 45 days')
  })
  it('every finding says which source produced it, and enrichment reports data health', () => {
    expect(rows('compliance')['w2']!.facts?.find(f => f.label === 'Verdict based on')?.value).toBe('Intune compliance policy')
    expect(rows('patching')['m1']!.facts?.find(f => f.label === 'Verdict based on')?.value).toBe('Endpoint Central Patch Manager')
    expect(r.enrichment).toEqual({ patchLoaded: true, agentRowsLoaded: 1, mdmDetailsStale: 0, mdmDetailsUnread: 1 })
    expect(buildPosture(devices, null, 'all', NOW).enrichment.patchLoaded).toBe(false)
  })
})
