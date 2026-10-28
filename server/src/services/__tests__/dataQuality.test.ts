import { describe, it, expect, vi } from 'vitest'

vi.mock('../../store/integrationStore.js', () => ({ getIntuneConfig: vi.fn(() => undefined), getSlackConfig: vi.fn() }))
vi.mock('../graphApi.js', () => ({ credentialsFromEnv: vi.fn(() => { throw new Error('no creds') }), getGraphCount: vi.fn(), getManagedDevices: vi.fn() }))
vi.mock('../criticalPatchReport.js', () => ({ isSupportedCriticalPatchClient: (s: { osName?: string }) => !/server/i.test(s.osName ?? '') }))
vi.mock('../../routes/devices.js', () => ({ fetchAllDevices: vi.fn() }))
vi.mock('../reportExporter.js', async () => await vi.importActual('../reportExporter.js'))
vi.mock('../slack.js', () => ({ uploadSlackFile: vi.fn(), sendSlackMessage: vi.fn() }))
vi.mock('../appIntel/service.js', () => ({ getAppIntelService: vi.fn() }))

import ExcelJS from 'exceljs'
import { ok, warn, info, reconcileCount, dataNotesText } from '../dataQuality.js'
import { buildFleetDataChecks, buildPatchDataChecks, collectFleetDataChecks } from '../fleetDataQuality.js'
import { buildOverviewMessage, overviewToText } from '../reportOverview.js'
import { exportToExcel } from '../reportExporter.js'
import { buildDeviceReportChecks } from '../complianceInventoryReport.js'
import { buildUpdatesChecks } from '../appIntel/updateReport.js'
import { getGraphCount, type GraphManagedDevice } from '../graphApi.js'
import type { Device } from '../../types.js'
import type { PatchSystemStatus } from '../endpointCentralPatch.js'

const find = (checks: Array<{ label: string }>, label: string) => checks.find(c => c.label === label) as { status: string; detail: string } | undefined
const dev = (o: Partial<Device>): Device => ({ deviceName: 'd', serialNumber: 'S', platform: 'Windows', managementSource: 'Microsoft Intune', lastCheckIn: new Date().toISOString(), ...o } as Device)

describe('reconcileCount', () => {
  it('passes within 1% (min 1) of the Graph count', () => {
    expect(reconcileCount('x', 1000, 1008).status).toBe('ok')
    expect(reconcileCount('x', 5, 6).status).toBe('ok')
  })
  it('warns with the difference when counts diverge', () => {
    const c = reconcileCount('x', 900, 1000)
    expect(c.status).toBe('warn')
    expect(c.detail).toBe('Report counted 900 but Microsoft Graph reports 1,000 (−100). Figures may be incomplete or stale.')
  })
  it('warns that the figure is unverified when Graph cannot answer', () => {
    expect(reconcileCount('x', 10, null)).toMatchObject({ status: 'warn', detail: expect.stringContaining('Could not verify') })
  })
})

describe('dataNotesText', () => {
  it('is null with no checks and a green line when all pass', () => {
    expect(dataNotesText(undefined)).toBeNull()
    expect(dataNotesText([ok('a', ''), ok('b', ''), info('c', '')])).toBe('✅ All 2 data checks passed.')
  })
  it('lists up to three warnings, then counts the rest', () => {
    const text = dataNotesText([warn('A', 'a'), warn('B', 'b'), warn('C', 'c'), warn('D', 'd'), ok('E', '')])!
    expect(text).toContain('⚠️ *A:* a')
    expect(text).not.toContain('*D:*')
    expect(text).toContain('+1 more data warning; see the Data Quality sheet.')
  })
})

describe('overview rendering', () => {
  const overview = { title: 'T', fields: [{ label: 'A', value: 1 }], action: 'Act', dataChecks: [warn('Source completeness', 'ManageEngine did not return data'), ok('Fine', '')] }
  it('adds a Data quality section to the Slack blocks and the email text', () => {
    const { blocks } = buildOverviewMessage(overview, '2026-10-27') as { blocks: Array<Record<string, any>> }
    expect(blocks.map(b => b.type)).toEqual(['header', 'section', 'section', 'section', 'context'])
    expect(blocks[3]!.text.text).toContain('*Data quality*')
    expect(blocks[3]!.text.text).toContain('ManageEngine did not return data')
    expect(overviewToText(overview)).toContain('⚠️ Source completeness: ManageEngine did not return data')
  })
  it('omits the section when there are no checks', () => {
    const { blocks } = buildOverviewMessage({ ...overview, dataChecks: [] }, '2026-10-27') as { blocks: unknown[] }
    expect(blocks).toHaveLength(4)
  })
})

describe('exportToExcel data quality sheet', () => {
  it('adds a Data Quality sheet with warnings first', async () => {
    const buf = await exportToExcel([{ a: 1 }], [{ key: 'a', label: 'A' }], { title: 'T', generatedAt: new Date().toISOString(), recordCount: 1, dataChecks: [ok('Good', 'fine'), warn('Bad', 'broken')] })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const sheet = wb.getWorksheet('Data Quality')!
    expect([sheet.getRow(2).getCell(1).value, sheet.getRow(2).getCell(2).value, sheet.getRow(3).getCell(1).value]).toEqual(['Warning', 'Bad', 'Passed'])
  })
})

describe('buildFleetDataChecks', () => {
  it('warns when a configured source failed, naming the error', () => {
    const checks = buildFleetDataChecks({ devices: [dev({})], failedSources: [{ source: 'manageengine', error: 'timed out' }], graphIntuneCount: 1 })
    expect(find(checks, 'Source completeness')).toMatchObject({ status: 'warn', detail: expect.stringContaining('ManageEngine did not return data (timed out)') })
  })
  it('reconciles the Intune rows with Graph and skips the check when Intune failed', () => {
    const intune = Array.from({ length: 10 }, (_, i) => dev({ serialNumber: `S${i}` }))
    expect(find(buildFleetDataChecks({ devices: intune, graphIntuneCount: 50 }), 'Intune count vs Microsoft Graph')?.status).toBe('warn')
    expect(find(buildFleetDataChecks({ devices: intune, graphIntuneCount: 10 }), 'Intune count vs Microsoft Graph')?.status).toBe('ok')
    expect(find(buildFleetDataChecks({ devices: intune, failedSources: [{ source: 'intune', error: 'x' }], graphIntuneCount: 50 }), 'Intune count vs Microsoft Graph')).toBeUndefined()
  })
  it('counts devices present in both sources by serial number, ignoring placeholder serials', () => {
    const devices = [
      dev({ serialNumber: 'abc1' }), dev({ serialNumber: 'ABC1', managementSource: 'ManageEngine' }),
      dev({ serialNumber: 'Unknown' }), dev({ serialNumber: 'unknown', managementSource: 'ManageEngine' }),
    ]
    const c = find(buildFleetDataChecks({ devices, graphIntuneCount: 2 }), 'Devices in both sources')!
    expect(c.status).toBe('warn')
    expect(c.detail).toContain('1 device appears in both')
  })
  it('flags unreadable check-in dates and notes devices without a usable serial', () => {
    const checks = buildFleetDataChecks({ devices: [dev({ lastCheckIn: 'never' }), dev({ serialNumber: '' })], graphIntuneCount: 2 })
    expect(find(checks, 'Unreadable check-in dates')).toMatchObject({ status: 'warn', detail: expect.stringContaining('1 device has no readable last check-in') })
    expect(find(checks, 'Missing serial numbers')?.status).toBe('info')
  })
})

describe('collectFleetDataChecks', () => {
  it('asks Graph for the count only when there are Intune devices', async () => {
    vi.mocked(getGraphCount).mockClear()
    await collectFleetDataChecks({ devices: [dev({ managementSource: 'ManageEngine' })] })
    expect(getGraphCount).not.toHaveBeenCalled()
  })
})

describe('buildPatchDataChecks', () => {
  const sys = (o: Partial<PatchSystemStatus>): PatchSystemStatus => ({ platform: 'Windows', osName: 'Windows 11', scanSucceeded: true, ...o } as PatchSystemStatus)
  it('reports Patch Manager as unavailable rather than zero', () => {
    expect(buildPatchDataChecks([], null)[0]).toMatchObject({ status: 'warn', detail: expect.stringContaining('missing, not zero') })
  })
  it('warns about failed scans and coverage gaps', () => {
    const devices = Array.from({ length: 10 }, () => dev({ platform: 'Windows' }))
    const checks = buildPatchDataChecks(devices, [sys({}), sys({}), sys({ scanSucceeded: false }), sys({ osName: 'Windows Server 2022' })])
    expect(find(checks, 'Patch scan health')).toMatchObject({ status: 'warn', detail: expect.stringContaining('1 of 3') })
    expect(find(checks, 'Patch Manager coverage')).toMatchObject({ status: 'warn', detail: expect.stringContaining('3 Windows/macOS endpoints but MDM has 10') })
  })
  it('passes when coverage is within 10%', () => {
    const checks = buildPatchDataChecks(Array.from({ length: 10 }, () => dev({})), Array.from({ length: 10 }, () => sys({})))
    expect(find(checks, 'Patch Manager coverage')?.status).toBe('ok')
    expect(find(checks, 'Patch scan health')?.status).toBe('ok')
  })
})

describe('buildDeviceReportChecks', () => {
  const m = (o: Partial<GraphManagedDevice>) => ({ operatingSystem: 'Windows', complianceState: 'compliant', isEncrypted: true, lastSyncDateTime: new Date().toISOString(), ...o }) as GraphManagedDevice
  it('flags a large unclassified share, unreadable sync dates and unencrypted devices by OS', () => {
    const devices = [m({}), m({ complianceState: 'inGracePeriod' }), m({ complianceState: 'unknown', isEncrypted: false, operatingSystem: 'iOS', lastSyncDateTime: '' })]
    const checks = buildDeviceReportChecks(devices, 3)
    expect(find(checks, 'Intune count vs Microsoft Graph')?.status).toBe('ok')
    expect(find(checks, 'Unclassified compliance state')?.status).toBe('warn')
    expect(find(checks, 'Unreadable sync dates')?.status).toBe('warn')
    expect(find(checks, 'Encryption state')?.detail).toContain('iOS 1')
  })
  it('passes a clean fleet', () => {
    const checks = buildDeviceReportChecks([m({}), m({})], 2)
    expect(checks.every(c => c.status === 'ok')).toBe(true)
  })
})

describe('buildUpdatesChecks', () => {
  const app = (o: Record<string, unknown>) => ({ latest: { version: '2' }, status: 'Package required', ...o }) as never
  const now = new Date('2026-10-27T12:00:00Z')
  it('warns on sync errors, stale inventory, unverified apps and review items', () => {
    const checks = buildUpdatesChecks([app({}), app({ latest: undefined }), app({ status: 'Review required' })], { syncedAt: '2026-10-25T12:00:00Z', errors: { manageengine: 'could not read devices' } }, now)
    expect(find(checks, 'Inventory sync')?.detail).toBe('manageengine: could not read devices')
    expect(find(checks, 'Inventory freshness')?.detail).toContain('48 hours old')
    expect(find(checks, 'Unverified apps')?.status).toBe('warn')
    expect(find(checks, 'Manual review')?.status).toBe('warn')
  })
  it('passes a fresh, fully verified inventory', () => {
    const checks = buildUpdatesChecks([app({})], { syncedAt: '2026-10-27T10:00:00Z', errors: {} }, now)
    expect(checks.every(c => c.status === 'ok')).toBe(true)
  })
})

describe('stale sources', () => {
  it('warns that a source is showing its last good sync, instead of reporting it missing', async () => {
    const { buildFleetDataChecks } = await import('../fleetDataQuality.js')
    const checks = buildFleetDataChecks({ devices: [], staleSources: [{ source: 'intune', savedAt: '2026-10-28T08:15:00.000Z' }], graphIntuneCount: null })
    expect(checks.find(c => c.label === 'Source freshness')?.detail).toContain('2026-10-28 08:15 UTC')
    expect(checks.some(c => c.label === 'Source completeness')).toBe(false)
  })
})
