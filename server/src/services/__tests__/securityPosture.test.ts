import { describe, it, expect } from 'vitest'
import type { Device } from '../../types.js'
import type { PatchSystemStatus } from '../endpointCentralPatch.js'
import { buildPosture, classifyEncryption, gradeFor, listPillarDevices, patchLabel, MAX_PAGE_SIZE } from '../securityPosture.js'
import type { MissingPatch } from '../endpointCentralPatch.js'

const NOW = Date.parse('2026-10-12T12:00:00Z')
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString()

function dev(over: Partial<Device> & Record<string, unknown> = {}): Device {
  return {
    id: 'd1', deviceName: 'Dev-1', user: 'u@zinnia.com', serialNumber: 'SERIAL0001', platform: 'Windows',
    osVersion: '11', managementSource: 'Microsoft Intune', lastCheckIn: ago(1), complianceState: 'Compliant',
    encryptionStatus: 'BitLocker On', primaryIssue: 'None', policyFailed: 'None', severity: 'Low', confidence: '',
    firstDetected: '', lastDetected: '', issueSource: '', ...over,
  } as unknown as Device
}

const patchSys = (over: Partial<PatchSystemStatus> = {}): PatchSystemStatus => ({
  resourceId: '1', detailResourceId: '2', platform: 'Windows', names: ['HOST-SERIAL0001'],
  missingOsPatches: 0, missingThirdPartyPatches: 0, missingDriverPatches: 0, missingBiosPatches: 0,
  criticalPatchCount: 0, importantPatchCount: 0, moderatePatchCount: 0, lowPatchCount: 0,
  lastScanTime: null, lastSuccessfulScanTime: null, scanSucceeded: true, ...over,
})

const pillar = (r: ReturnType<typeof buildPosture>, id: string) => r.pillars.find(p => p.id === id)!

describe('classifyEncryption', () => {
  it.each([
    ['BitLocker On', 'pass'], ['Encrypted', 'pass'], ['FileVault On', 'pass'],
    ['BitLocker Off', 'fail'], ['Not Encrypted', 'fail'],
    ['Unknown', 'unknown'], ['', 'unknown'], ['—', 'unknown'],
  ])('%s → %s', (value, status) => expect(classifyEncryption(value).status).toBe(status))
})

describe('buildPosture', () => {
  it('counts pass / fail / not reported separately and scores only assessed devices', () => {
    const devices = [
      dev({ id: 'a' }), dev({ id: 'b', encryptionStatus: 'BitLocker Off' }),
      dev({ id: 'c', encryptionStatus: 'Unknown' }), dev({ id: 'm', platform: 'Android', encryptionStatus: 'On' }),
    ]
    const p = pillar(buildPosture(devices, null, 'all', NOW), 'encryption')
    expect(p).toMatchObject({ inScope: 3, assessed: 2, passing: 1, failing: 1, notReported: 1, scorePct: 50 })
    const list = listPillarDevices(devices, null, null, { pillarId: 'encryption', status: 'fail' }, NOW)
    expect(list.rows.map(d => d.id)).toEqual(['b'])
    expect(list.rows[0]!.detail).toBe('BitLocker Off')
  })

  it('returns a null score when nothing could be assessed (no fabricated 0 or 100)', () => {
    const p = pillar(buildPosture([dev({ encryptionStatus: 'Unknown' })], null, 'all', NOW), 'encryption')
    expect(p.scorePct).toBeNull()
  })

  it('compliance only assesses Intune; ManageEngine is not reported', () => {
    const devices = [dev({ id: 'i1' }), dev({ id: 'i2', complianceState: 'Non-Compliant', primaryIssue: 'Password' }), dev({ id: 'me', managementSource: 'ManageEngine' })]
    const p = pillar(buildPosture(devices, null, 'all', NOW), 'compliance')
    expect(p).toMatchObject({ assessed: 2, passing: 1, failing: 1, notReported: 1 })
    expect(listPillarDevices(devices, null, null, { pillarId: 'compliance', status: 'fail' }, NOW).rows[0]!.detail).toBe('Non-Compliant: Password')
  })

  it('check-in fails after 7 days and treats unparseable values as not reported', () => {
    const devices = [dev({ id: 'a', lastCheckIn: ago(2) }), dev({ id: 'b', lastCheckIn: ago(20) }), dev({ id: 'c', lastCheckIn: 'Unknown' })]
    const p = pillar(buildPosture(devices, null, 'all', NOW), 'checkin')
    expect(p).toMatchObject({ passing: 1, failing: 1, notReported: 1 })
    expect(listPillarDevices(devices, null, null, { pillarId: 'checkin', status: 'fail' }, NOW).rows[0]!.detail).toBe('Last check-in 20d ago')
  })

  it('patching matches Patch Manager rows by serial; critical missing = failing; no scan = not reported', () => {
    const devices = [
      dev({ id: 'ok', serialNumber: 'SERIAL0001' }), dev({ id: 'bad', serialNumber: 'SERIAL0002' }), dev({ id: 'none', serialNumber: 'SERIAL0003' }),
    ]
    const systems = [patchSys({ names: ['A-SERIAL0001'] }), patchSys({ names: ['B-SERIAL0002'], criticalPatchCount: 2, importantPatchCount: 1 })]
    const p = pillar(buildPosture(devices, systems, 'all', NOW), 'patching')
    expect(p).toMatchObject({ assessed: 2, passing: 1, failing: 1, notReported: 1 })
    expect(listPillarDevices(devices, systems, null, { pillarId: 'patching', status: 'fail' }, NOW).rows[0]!.detail).toBe('2 critical, 1 important patch missing')
    expect(p.unavailableReason).toBeUndefined()
  })

  it('flags patching as unavailable when Patch Manager data could not be loaded', () => {
    const p = pillar(buildPosture([dev()], null, 'all', NOW), 'patching')
    expect(p.unavailableReason).toMatch(/Patch Manager/)
    expect(p.scorePct).toBeNull()
  })

  it('filters by source but always reports both source counts', () => {
    const devices = [dev({ id: 'i' }), dev({ id: 'm', managementSource: 'ManageEngine', platform: 'macOS' })]
    const r = buildPosture(devices, null, 'manageengine', NOW)
    expect(r.deviceCount).toBe(1)
    expect(r.sourceCounts).toEqual({ intune: 1, manageengine: 1 })
  })

  it('overall score is the weighted average of assessed pillars only', () => {
    const r = buildPosture([dev()], null, 'all', NOW) // encryption, compliance, checkin all 100; patching unassessed
    expect(r.overall).toEqual({ score: 100, assessedPillars: 3, totalPillars: 4 })
    expect(buildPosture([], null, 'all', NOW).overall.score).toBeNull()
  })

  it('breaks results down by platform and source', () => {
    const r = buildPosture([dev({ id: 'w' }), dev({ id: 'm', platform: 'macOS', managementSource: 'ManageEngine', encryptionStatus: 'Not Encrypted' })], null, 'all', NOW)
    const p = pillar(r, 'encryption')
    expect(p.byPlatform.find(x => x.key === 'macOS')).toMatchObject({ failing: 1, passing: 0 })
    expect(p.bySource.find(x => x.key === 'Microsoft Intune')).toMatchObject({ passing: 1 })
  })
})

const crit = (over: Partial<MissingPatch> = {}): MissingPatch => ({
  patchId: '1', name: 'Windows11-KB5094125.msu', description: '2026-06 Cumulative Update (KB5094125) (CVE-2026-49160)', severity: 'Critical', category: 'OS update',
  vendor: 'Microsoft', updateType: 'Security Updates', kb: 'KB5094125', bulletinId: 'MS26-JUN3', cves: [], releasedAt: null, rebootRequirement: null, approvalStatus: null, deploymentStatus: null, ...over,
})

describe('missing critical patch findings', () => {
  const devices = [dev({ id: 'a', serialNumber: 'SERIAL0001' }), dev({ id: 'b', serialNumber: 'SERIAL0002' }), dev({ id: 'c', serialNumber: 'SERIAL0003' })]
  const systems = [
    patchSys({ names: ['A-SERIAL0001'], detailResourceId: 'R1', criticalPatchCount: 2 }),
    patchSys({ names: ['B-SERIAL0002'], detailResourceId: 'R2', criticalPatchCount: 1 }),
    patchSys({ names: ['C-SERIAL0003'], detailResourceId: 'R3', criticalPatchCount: 1 }),
  ]
  const index = new Map<string, MissingPatch[]>([
    ['R1', [crit(), crit({ patchId: '2', name: 'Edge.msi', description: 'Microsoft Edge 150', kb: null })]],
    ['R2', [crit()]],
  ])

  it('lists the actual missing patches on each failing device', () => {
    const rows = listPillarDevices(devices, systems, index, { pillarId: 'patching', status: 'fail', sortKey: 'deviceName' }, NOW).rows
    const a = rows.find(r => r.id === 'a')!
    expect(a.items).toEqual(['2026-06 Cumulative Update (KB5094125) (CVE-2026-49160)', 'Microsoft Edge 150'])
    expect(a.detail).toBe('2 critical, 0 important patches missing')
    expect(rows.find(r => r.id === 'c')!.items).toBeUndefined() // names not returned for this system: no invented list
  })

  it('computes the most common missing critical patches across failing devices', () => {
    const p = pillar(buildPosture(devices, systems, 'all', NOW, index), 'patching')
    expect(p.topFindings[0]).toEqual({ label: '2026-06 Cumulative Update (KB5094125) (CVE-2026-49160)', devices: 2 })
    expect(p.topFindings[1]).toEqual({ label: 'Microsoft Edge 150', devices: 1 })
  })

  it('has no top findings when patch names could not be loaded', () => {
    expect(pillar(buildPosture(devices, systems, 'all', NOW, null), 'patching').topFindings).toEqual([])
  })

  it('search matches patch names', () => {
    const rows = listPillarDevices(devices, systems, index, { pillarId: 'patching', status: 'fail', q: 'edge 150' }, NOW).rows
    expect(rows.map(r => r.id)).toEqual(['a'])
  })

  it('patchLabel prefixes the KB when the text lacks it and truncates long descriptions', () => {
    expect(patchLabel(crit({ description: 'Cumulative Update' }))).toBe('KB5094125 — Cumulative Update')
    expect(patchLabel(crit({ description: 'x'.repeat(200), kb: null })).length).toBe(138)
  })
})

describe('listPillarDevices', () => {
  const devices = [
    dev({ id: 'w1', deviceName: 'WIN-1', encryptionStatus: 'BitLocker Off' }),
    dev({ id: 'w2', deviceName: 'WIN-2' }),
    dev({ id: 'm1', deviceName: 'MAC-1', platform: 'macOS', managementSource: 'ManageEngine', encryptionStatus: 'Unknown' }),
    dev({ id: 'm2', deviceName: 'MAC-2', platform: 'macOS', managementSource: 'ManageEngine', encryptionStatus: 'Not Encrypted' }),
  ]
  const ids = (o: object) => listPillarDevices(devices, null, null, { pillarId: 'encryption', sortKey: 'deviceName', ...o }, NOW).rows.map(r => r.id)

  it('filters by status, platform and management source — passing and not-reported included', () => {
    expect(ids({ status: 'pass' })).toEqual(['w2'])
    expect(ids({ status: 'fail' })).toEqual(['m2', 'w1'])
    expect(ids({ status: 'unknown' })).toEqual(['m1'])
    expect(ids({ platform: 'macOS' })).toEqual(['m1', 'm2'])
    expect(ids({ sourceKey: 'ManageEngine', status: 'fail' })).toEqual(['m2'])
    expect(ids({ platform: 'macOS', status: 'pass' })).toEqual([])
  })

  it('counts match the pillar summary for every segment', () => {
    const p = pillar(buildPosture(devices, null, 'all', NOW), 'encryption')
    const n = (o: object) => listPillarDevices(devices, null, null, { pillarId: 'encryption', ...o }, NOW).total
    expect([n({ status: 'pass' }), n({ status: 'fail' }), n({ status: 'unknown' })]).toEqual([p.passing, p.failing, p.notReported])
    const mac = p.byPlatform.find(r => r.key === 'macOS')!
    expect([n({ platform: 'macOS', status: 'fail' }), n({ platform: 'macOS', status: 'unknown' })]).toEqual([mac.failing, mac.notReported])
  })

  it('sorts, pages and clamps', () => {
    const r = listPillarDevices(devices, null, null, { pillarId: 'encryption', sortKey: 'deviceName', sortDir: 'desc', pageSize: 2, page: 2 }, NOW)
    expect(r.rows.map(x => x.deviceName)).toEqual(['MAC-2', 'MAC-1'])
    expect(r).toMatchObject({ total: 4, totalPages: 2, page: 2 })
    expect(listPillarDevices(devices, null, null, { pillarId: 'encryption', page: 99, pageSize: 3 }, NOW).page).toBe(2)
    expect(listPillarDevices(devices, null, null, { pillarId: 'encryption', pageSize: 10_000_000 }, NOW).pageSize).toBe(MAX_PAGE_SIZE)
  })

  it('honours the source tab and rejects unknown pillars safely', () => {
    expect(ids({ source: 'manageengine' })).toEqual(['m1', 'm2'])
    expect(listPillarDevices(devices, null, null, { pillarId: 'nope' as never }, NOW).rows).toEqual([])
  })
})

describe('gradeFor', () => {
  it('maps scores to grades and withholds one for null', () => {
    expect([gradeFor(95), gradeFor(85), gradeFor(72), gradeFor(40), gradeFor(null)]).toEqual(['A', 'B', 'C', 'D', null])
  })
})
