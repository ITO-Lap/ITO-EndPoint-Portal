import { describe, it, expect, vi } from 'vitest'

vi.mock('../criticalPatchReport.js', () => ({ isSupportedCriticalPatchClient: (s: { osName?: string }) => !/server/i.test(s.osName ?? '') }))
vi.mock('../staleDevicesReport.js', () => ({ STALE_DAYS: 30 }))

import ExcelJS from 'exceljs'
import { buildNonCompliantRows, buildStaleRows, buildPatchRollupRows, buildPatchDetailRows, buildFleetDigestWorkbook } from '../fleetDigestReport.js'
import type { Device } from '../../types.js'
import type { MissingPatch, PatchSystemStatus } from '../endpointCentralPatch.js'
import type { FleetSnapshot } from '../../store/fleetSnapshotStore.js'

const now = new Date('2026-10-26T08:00:00Z')
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString()

const device = (name: string, o: Partial<Device> = {}): Device => ({
  id: name, deviceName: name, user: `${name}@corp.test`, serialNumber: `SN-${name}`, platform: 'Windows', osVersion: '11', managementSource: 'Microsoft Intune',
  lastCheckIn: daysAgo(1), complianceState: 'Compliant', encryptionStatus: 'Encrypted', primaryIssue: '', policyFailed: '', severity: 'Low',
  confidence: '', firstDetected: '', lastDetected: '', issueSource: '', ...o,
} as Device)

const system = (name: string, o: Partial<PatchSystemStatus> = {}): PatchSystemStatus => ({
  resourceId: name, detailResourceId: `d-${name}`, platform: 'Windows', osName: 'Windows 11 Enterprise', names: [name],
  missingOsPatches: 0, missingThirdPartyPatches: 0, missingDriverPatches: 0, missingBiosPatches: 0,
  criticalPatchCount: 1, importantPatchCount: 0, moderatePatchCount: 0, lowPatchCount: 0,
  lastScanTime: null, lastSuccessfulScanTime: daysAgo(1), scanSucceeded: true, ...o,
})

const patch = (id: string, ageDays: number, o: Partial<MissingPatch> = {}): MissingPatch => ({
  patchId: id, name: id, description: `Patch ${id}`, severity: 'Critical', category: 'OS', vendor: 'Microsoft', updateType: null, kb: `KB${id}`,
  bulletinId: null, cves: [`CVE-${id}`], releasedAt: daysAgo(ageDays), rebootRequirement: 'Not Required', approvalStatus: null, deploymentStatus: 'Not Deployed', ...o,
} as MissingPatch)

describe('buildNonCompliantRows', () => {
  it('excludes compliant devices and sorts non-compliant before warning, then by severity', () => {
    const rows = buildNonCompliantRows([
      device('ok'),
      device('warn-high', { complianceState: 'Warning', severity: 'High' }),
      device('nc-low', { complianceState: 'Non-Compliant', severity: 'Low' }),
      device('nc-crit', { complianceState: 'Non-Compliant', severity: 'Critical' }),
    ], now)
    expect(rows.map(r => r.deviceName)).toEqual(['nc-crit', 'nc-low', 'warn-high'])
  })
})

describe('buildStaleRows', () => {
  it('keeps only devices at or past the threshold, longest silent first, skipping unparseable dates', () => {
    const rows = buildStaleRows([device('a', { lastCheckIn: daysAgo(30) }), device('b', { lastCheckIn: daysAgo(90) }), device('c', { lastCheckIn: daysAgo(29) }), device('d', { lastCheckIn: 'never' })], now)
    expect(rows.map(r => [r.deviceName, r.daysSilent])).toEqual([['b', 90], ['a', 30]])
  })
})

describe('patch sheets', () => {
  const systems = [
    system('young', { criticalPatchCount: 1 }),
    system('old', { criticalPatchCount: 2 }),
    system('server', { osName: 'Windows Server 2022' }),
    system('failed-scan', { scanSucceeded: false }),
    system('clean', { criticalPatchCount: 0 }),
  ]
  const patches = new Map<string, MissingPatch[]>([
    ['d-young', [patch('1', 5)]],
    ['d-old', [patch('2', 70), patch('3', 10, { rebootRequirement: 'Required' })]],
  ])

  it('rolls up per device, oldest exposure first, excluding servers, failed scans and clean devices', () => {
    const rows = buildPatchRollupRows(systems, patches, now)
    expect(rows.map(r => r.deviceName)).toEqual(['old', 'young'])
    expect(rows[0]).toMatchObject({ oldestPatchAgeDays: 70, oldestPatch: 'Patch 2', cveCount: 2, rebootRequired: 'Yes' })
  })
  it('still lists devices when per-patch detail is unavailable', () => {
    const rows = buildPatchRollupRows(systems, null, now)
    expect(rows).toHaveLength(2)
    expect(rows[0]!.oldestPatchAgeDays).toBe('')
  })
  it('lists every missing patch, oldest first', () => {
    expect(buildPatchDetailRows(systems, patches, now).map(r => r.ageDays)).toEqual([70, 10, 5])
  })
})

describe('buildFleetDigestWorkbook', () => {
  const snap = (date: string, o: Partial<FleetSnapshot> = {}): FleetSnapshot => ({
    date, takenAt: `${date}T08:00:00Z`, total: 100, compliant: 90, warning: 2, nonCompliant: 8, stale: 12, criticalPatchDevices: 6, byPlatform: { Windows: 70, macOS: 30 }, ...o,
  })

  it('produces the five sheets with KPI values, deltas and trend labels', async () => {
    const buf = await buildFleetDigestWorkbook(
      { devices: [device('nc', { complianceState: 'Non-Compliant', severity: 'High' }), device('old', { lastCheckIn: daysAgo(45) })], patchSystems: [system('old')], patchesBySystem: new Map([['d-old', [patch('9', 40)]]]) },
      snap('2026-10-26', { stale: 9 }), snap('2026-10-19'), ['Patch 6 devices with missing critical patches'], now)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    expect(wb.worksheets.map(w => w.name)).toEqual(['Summary', 'Non-Compliant', 'Stale Devices', 'Critical Patches', 'Patch Detail'])

    const summary = wb.getWorksheet('Summary')!
    const stale = summary.getRow(8).values as unknown[]
    expect(stale.slice(1)).toEqual(['Stale (30+ days)', 9, 12, -3, 'Improved'])
    expect(wb.getWorksheet('Critical Patches')!.getRow(2).getCell(1).value).toBe('old')
    expect(wb.getWorksheet('Patch Detail')!.getRow(2).getCell(4).value).toBe('KB9')
  })

  it('degrades gracefully when Patch Manager is unavailable and there is no baseline', async () => {
    const buf = await buildFleetDigestWorkbook({ devices: [], patchSystems: null, patchesBySystem: null }, snap('2026-10-26', { criticalPatchDevices: null }), null, [], now)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    expect(wb.getWorksheet('Critical Patches')!.getRow(2).getCell(1).value).toBe('Patch Manager was unavailable for this run.')
    expect((wb.getWorksheet('Summary')!.getRow(9).values as unknown[]).slice(1)).toEqual(['Devices missing critical patches', 'Unavailable', '—', '—', '—'])
  })
})
