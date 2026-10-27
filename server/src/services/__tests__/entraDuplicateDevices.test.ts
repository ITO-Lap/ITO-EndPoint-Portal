import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../graphApi.js', () => ({ credentialsFromEnv: vi.fn(() => ({ tenantId: 't', clientId: 'c', clientSecret: 's' })), getEntraDirectoryDevices: vi.fn(), getManagedDevices: vi.fn(), getGraphCount: vi.fn() }))
vi.mock('../../store/integrationStore.js', () => ({ getEntraConfig: vi.fn(() => undefined), getSlackConfig: vi.fn() }))
vi.mock('../slack.js', () => ({ sendSlackBlocks: vi.fn(), uploadSlackFile: vi.fn() }))

import ExcelJS from 'exceljs'
import { detectDuplicateDevices, collectDuplicateDeviceReport, buildDuplicateChecks, osFamily } from '../entraDuplicateDevices.js'
import { buildDuplicateDevicesWorkbook, buildDuplicateMessage, sendDuplicateDevicesReport } from '../entraDuplicateDevicesReport.js'
import { getEntraDirectoryDevices, getManagedDevices, getGraphCount, type GraphEntraDevice, type GraphManagedDevice } from '../graphApi.js'
import { getSlackConfig } from '../../store/integrationStore.js'
import { sendSlackBlocks, uploadSlackFile } from '../slack.js'

const now = new Date('2026-10-27T08:00:00Z')
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString()

const entra = (id: string, o: Partial<GraphEntraDevice> = {}): GraphEntraDevice => ({
  id, deviceId: `dev-${id}`, displayName: `PC-${id}`, operatingSystem: 'Windows', operatingSystemVersion: '10.0.26100', trustType: 'AzureAd',
  isManaged: true, isCompliant: true, accountEnabled: true, registrationDateTime: daysAgo(400), approximateLastSignInDateTime: daysAgo(1), ...o,
})
const intune = (deviceId: string, serial: string, o: Partial<GraphManagedDevice> = {}): GraphManagedDevice =>
  ({ id: `m-${deviceId}`, azureADDeviceId: deviceId, serialNumber: serial, userPrincipalName: 'a@corp.test', ...o } as GraphManagedDevice)

describe('detectDuplicateDevices', () => {
  it('finds nothing when every object is distinct', () => {
    const r = detectDuplicateDevices([entra('1'), entra('2'), entra('3')], [], now)
    expect(r.groups).toEqual([])
    expect(r.totalEntraDevices).toBe(3)
  })

  it('groups objects with the same name + OS as Medium confidence and keeps the most recently active', () => {
    const r = detectDuplicateDevices([
      entra('old', { displayName: 'LAPTOP-7', approximateLastSignInDateTime: daysAgo(120) }),
      entra('new', { displayName: 'laptop-7 ', approximateLastSignInDateTime: daysAgo(2) }),
    ], null, now)
    expect(r.groups).toHaveLength(1)
    const [g] = r.groups
    expect(g).toMatchObject({ id: 'DUP-001', confidence: 'Medium', matchedOn: ['Device name'] })
    expect(g!.rows.map(x => [x.objectId, x.recommendation])).toEqual([['new', 'Keep'], ['old', 'Cleanup candidate']])
    expect(r.intuneJoined).toBe(false)
  })

  it('does not group the same name across different OS families', () => {
    const r = detectDuplicateDevices([entra('w', { displayName: 'DAVE', operatingSystem: 'Windows' }), entra('i', { displayName: 'DAVE', operatingSystem: 'iOS' })], [], now)
    expect(r.groups).toEqual([])
  })

  it('links different-named objects through a shared Intune serial number (High confidence)', () => {
    const r = detectDuplicateDevices([entra('a', { displayName: 'OLD-NAME' }), entra('b', { displayName: 'NEW-NAME' })], [intune('dev-a', 'sn123'), intune('dev-b', 'SN123')], now)
    expect(r.groups).toHaveLength(1)
    expect(r.groups[0]).toMatchObject({ confidence: 'High', matchedOn: ['Serial number'] })
    expect(r.groups[0]!.rows[0]!.serialNumber).toBe('SN123')
  })

  it('ignores placeholder serial numbers', () => {
    const r = detectDuplicateDevices([entra('a'), entra('b')], [intune('dev-a', 'Unknown'), intune('dev-b', 'unknown')], now)
    expect(r.groups).toEqual([])
  })

  it('treats a repeated Device ID as High confidence', () => {
    const r = detectDuplicateDevices([entra('a', { deviceId: 'same' }), entra('b', { deviceId: 'SAME' })], [], now)
    expect(r.groups[0]).toMatchObject({ confidence: 'High', matchedOn: ['Device ID'] })
  })

  it('merges transitively linked objects into one group', () => {
    const r = detectDuplicateDevices([
      entra('a', { displayName: 'SHARED' }), entra('b', { displayName: 'SHARED' }), entra('c', { displayName: 'OTHER' }),
    ], [intune('dev-b', 'S1'), intune('dev-c', 'S1')], now)
    expect(r.groups).toHaveLength(1)
    expect(r.groups[0]!.rows).toHaveLength(3)
    expect(r.groups[0]!.matchedOn).toEqual(['Serial number', 'Device name'])
  })

  it('marks a recently active non-newest object Review, and flags hybrid-joined cleanup in the note', () => {
    const r = detectDuplicateDevices([
      entra('keep', { displayName: 'X', approximateLastSignInDateTime: daysAgo(1) }),
      entra('recent', { displayName: 'X', approximateLastSignInDateTime: daysAgo(5) }),
      entra('hybrid', { displayName: 'X', approximateLastSignInDateTime: daysAgo(200), trustType: 'ServerAd' }),
      entra('never', { displayName: 'X', approximateLastSignInDateTime: null }),
    ], null, now)
    const byId = Object.fromEntries(r.groups[0]!.rows.map(x => [x.objectId, x]))
    expect(byId['keep']!.recommendation).toBe('Keep')
    expect(byId['recent']!.recommendation).toBe('Review')
    expect(byId['hybrid']).toMatchObject({ recommendation: 'Cleanup candidate', joinType: 'Hybrid joined' })
    expect(byId['hybrid']!.note).toContain('on-premises AD')
    expect(byId['never']).toMatchObject({ recommendation: 'Cleanup candidate', daysInactive: null })
  })

  it('orders High-confidence and larger groups first and numbers them', () => {
    const r = detectDuplicateDevices([
      entra('m1', { displayName: 'MED' }), entra('m2', { displayName: 'MED' }), entra('m3', { displayName: 'MED' }),
      entra('h1', { deviceId: 'd' }), entra('h2', { deviceId: 'd' }),
    ], [], now)
    expect(r.groups.map(g => [g.id, g.confidence])).toEqual([['DUP-001', 'High'], ['DUP-002', 'Medium']])
    expect(r.groups[1]!.rows.every(x => x.groupId === 'DUP-002')).toBe(true)
  })
})

describe('osFamily', () => {
  it('normalises Entra OS names', () => {
    expect([osFamily('Windows'), osFamily('MacMDM'), osFamily('macOS'), osFamily('iPhone'), osFamily('Android'), osFamily(null)]).toEqual(['windows', 'macos', 'macos', 'ios', 'android', 'unknown'])
  })
})

describe('collectDuplicateDeviceReport', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(getGraphCount).mockResolvedValue(null) })
  it('explains the missing permission on a 403', async () => {
    vi.mocked(getEntraDirectoryDevices).mockRejectedValue(new Error('Graph API 403 on /devices: Authorization_RequestDenied'))
    await expect(collectDuplicateDeviceReport(now)).rejects.toThrow('Device.Read.All')
  })
  it('still reports (name/Device ID matching) when the Intune join fails', async () => {
    vi.mocked(getEntraDirectoryDevices).mockResolvedValue([entra('a', { displayName: 'Z' }), entra('b', { displayName: 'Z' })])
    vi.mocked(getManagedDevices).mockRejectedValue(new Error('intune down'))
    const r = await collectDuplicateDeviceReport(now)
    expect(r.intuneJoined).toBe(false)
    expect(r.groups).toHaveLength(1)
  })
})

describe('report output', () => {
  const report = detectDuplicateDevices([
    entra('new', { displayName: 'LT-1', approximateLastSignInDateTime: daysAgo(1) }),
    entra('old', { displayName: 'LT-1', approximateLastSignInDateTime: daysAgo(100) }),
  ], [intune('dev-new', 'SER1', { userPrincipalName: 'pat@corp.test' })], now)

  it('builds Summary, Duplicate Groups and Cleanup Candidates sheets', async () => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load((await buildDuplicateDevicesWorkbook(report, now)) as unknown as ArrayBuffer)
    expect(wb.worksheets.map(w => w.name)).toEqual(['Summary', 'Duplicate Groups', 'Cleanup Candidates'])
    const groups = wb.getWorksheet('Duplicate Groups')!
    expect(groups.getRow(2).getCell(7).value).toBe('new')
    expect(groups.getRow(2).getCell(5).value).toBe('Keep')
    const cleanup = wb.getWorksheet('Cleanup Candidates')!
    expect(cleanup.rowCount).toBe(2)
    expect(cleanup.getRow(2).getCell(7).value).toBe('old')
  })

  it('summarises counts in the Slack message', () => {
    const { text, blocks } = buildDuplicateMessage(report, '2026-10-27')
    expect(text).toContain('1 groups, 1 cleanup candidates')
    expect(JSON.stringify(blocks)).toContain('Review 1 cleanup candidate')
  })
})

describe('sendDuplicateDevicesReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getSlackConfig).mockReturnValue({ botToken: 'xoxb-test' } as never)
    vi.mocked(getManagedDevices).mockResolvedValue([])
    vi.mocked(getGraphCount).mockResolvedValue(null)
    vi.mocked(sendSlackBlocks).mockResolvedValue({ ok: true })
    vi.mocked(uploadSlackFile).mockResolvedValue({ ok: true })
  })

  it('sends one message with the workbook attached when duplicates exist', async () => {
    vi.mocked(getEntraDirectoryDevices).mockResolvedValue([entra('a', { displayName: 'Q' }), entra('b', { displayName: 'Q' })])
    expect(await sendDuplicateDevicesReport('C1')).toMatchObject({ ok: true, groups: 1 })
    expect(sendSlackBlocks).not.toHaveBeenCalled()
    const upload = vi.mocked(uploadSlackFile).mock.calls[0]![1]
    expect(upload).toMatchObject({ channelId: 'C1', filename: expect.stringMatching(/^duplicate-entra-devices-\d{4}-\d{2}-\d{2}\.xlsx$/) })
    expect(upload.blocks?.length).toBeGreaterThan(0)
  })

  it('posts a message without a file when there are no duplicates', async () => {
    vi.mocked(getEntraDirectoryDevices).mockResolvedValue([entra('a'), entra('b')])
    expect(await sendDuplicateDevicesReport('C1')).toMatchObject({ ok: true, groups: 0 })
    expect(uploadSlackFile).not.toHaveBeenCalled()
    expect(sendSlackBlocks).toHaveBeenCalledOnce()
  })

  it('surfaces upload failures', async () => {
    vi.mocked(getEntraDirectoryDevices).mockResolvedValue([entra('a', { displayName: 'Q' }), entra('b', { displayName: 'Q' })])
    vi.mocked(uploadSlackFile).mockResolvedValue({ ok: false, error: 'missing_scope' })
    expect(await sendDuplicateDevicesReport('C1')).toMatchObject({ ok: false, error: 'missing_scope' })
  })
})

describe('buildDuplicateChecks', () => {
  const med = detectDuplicateDevices([entra('a', { displayName: 'N' }), entra('b', { displayName: 'N' }), entra('c', { deviceId: 'x', trustType: 'ServerAd', approximateLastSignInDateTime: daysAgo(1) }), entra('d', { deviceId: 'x', trustType: 'ServerAd', approximateLastSignInDateTime: daysAgo(90) })], [intune('dev-a', 'S1')], now)
  const byLabel = (checks: ReturnType<typeof buildDuplicateChecks>, label: string) => checks.find(c => c.label === label)

  it('reconciles the Entra count with Graph', () => {
    expect(byLabel(buildDuplicateChecks(med, 4), 'Entra device count vs Microsoft Graph')?.status).toBe('ok')
    expect(byLabel(buildDuplicateChecks(med, 400), 'Entra device count vs Microsoft Graph')).toMatchObject({ status: 'warn', detail: expect.stringContaining('Graph reports 400') })
    expect(byLabel(buildDuplicateChecks(med, null), 'Entra device count vs Microsoft Graph')?.detail).toContain('Could not verify')
  })
  it('warns that name-only groups are not confirmed duplicates, with counts', () => {
    expect(byLabel(buildDuplicateChecks(med, 4), 'Name-only matches')).toMatchObject({ status: 'warn', detail: expect.stringContaining('1 of 2 groups (2 objects) matched on device name alone') })
  })
  it('warns when few Entra objects have an Intune record, and when Intune was unavailable', () => {
    expect(byLabel(buildDuplicateChecks(med, 4), 'Intune join coverage')).toMatchObject({ status: 'warn', detail: expect.stringContaining('Only 1 of 4') })
    expect(byLabel(buildDuplicateChecks({ ...med, intuneJoined: false }, 4), 'Intune join')?.status).toBe('warn')
  })
  it('notes hybrid-joined cleanup candidates and the sign-in lag', () => {
    const checks = buildDuplicateChecks(med, 4)
    expect(byLabel(checks, 'Hybrid-joined cleanup')).toMatchObject({ status: 'info', detail: expect.stringContaining('1 cleanup candidate is hybrid joined') })
    expect(byLabel(checks, 'Sign-in recency')?.detail).toContain('14 days')
  })
  it('flows into the Slack message and the workbook', async () => {
    const withChecks = { ...med, dataChecks: buildDuplicateChecks(med, 4) }
    expect(JSON.stringify(buildDuplicateMessage(withChecks, '2026-10-27').blocks)).toContain('matched on device name alone')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load((await buildDuplicateDevicesWorkbook(withChecks, now)) as unknown as ArrayBuffer)
    expect(wb.worksheets.map(w => w.name)).toContain('Data Quality')
  })
})
