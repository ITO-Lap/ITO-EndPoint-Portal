import { describe, it, expect, vi } from 'vitest'

vi.mock('../../routes/devices.js', () => ({ fetchAllDevices: vi.fn() }))
vi.mock('../endpointCentralPatch.js', () => ({ getPatchSystems: vi.fn(), getFleetCriticalPatches: vi.fn() }))
vi.mock('../graphApi.js', () => ({ credentialsFromEnv: vi.fn(), getManagedDevices: vi.fn() }))
vi.mock('../reportExporter.js', () => ({ exportToCSV: vi.fn(), exportToExcel: vi.fn(), exportToPDF: vi.fn(), exportToPPTX: vi.fn() }))
vi.mock('../slack.js', () => ({ uploadSlackFile: vi.fn(), sendSlackMessage: vi.fn() }))
vi.mock('../../store/integrationStore.js', () => ({ getSlackConfig: vi.fn() }))
vi.mock('../appIntel/service.js', () => ({ getAppIntelService: vi.fn() }))

import { buildOverviewMessage, overviewToText, topBreakdown, formatPercent, countBy } from '../reportOverview.js'
import { buildStaleOverview } from '../staleDevicesReport.js'
import { buildCriticalPatchOverview } from '../criticalPatchReport.js'
import { buildInventoryOverview, buildComplianceOverview } from '../complianceInventoryReport.js'
import { buildUpdatesOverview } from '../appIntel/updateReport.js'
import type { GraphManagedDevice } from '../graphApi.js'
import type { Json } from '../../test/json.js'

const field = (o: { fields: Array<{ label: string; value: string | number }> }, label: string) => o.fields.find(f => f.label === label)?.value

describe('reportOverview helpers', () => {
  it('formats percentages and breakdowns', () => {
    expect(formatPercent(1, 3)).toBe('33.3%')
    expect(formatPercent(0, 0)).toBe('0%')
    expect(topBreakdown(countBy(['a', 'b', 'b', 'c', 'c', 'c', 'd'], x => x), 2)).toBe('c 3 · b 2 · +2 more')
    expect(topBreakdown(new Map())).toBe('None')
  })

  it('builds blocks with header, fields, action and footer, capped at 10 fields, with no initial comment shape', () => {
    const fields = Array.from({ length: 12 }, (_, i) => ({ label: `L${i}`, value: i * 1000 }))
    const { text, blocks } = buildOverviewMessage({ title: 'T', fields, action: 'Do it', footnote: 'Src' }, '2026-10-27') as { text: string; blocks: Array<Record<string, Json>> }
    expect(blocks.map(b => b.type)).toEqual(['header', 'section', 'section', 'context'])
    expect(blocks[0]!.text.text).toBe('T · 2026-10-27')
    expect(blocks[1]!.fields).toHaveLength(10)
    expect(blocks[1]!.fields[1].text).toBe('*L1*\n1,000')
    expect(blocks[2]!.text.text).toContain('Do it')
    expect(blocks[3]!.elements[0].text).toBe('Src · EndPoint+')
    expect(text).toBe('T 2026-10-27: L0 0')
  })

  it('renders plain text for email', () => {
    const t = overviewToText({ title: 'T', fields: [{ label: 'A', value: 1234 }], action: 'Act', footnote: 'Note' })
    expect(t).toBe('T\n\nA: 1,234\n\nRecommended action: Act\n\nNote')
  })
})

describe('buildStaleOverview', () => {
  const rows = [
    { deviceName: 'OLD-1', platform: 'Windows', source: 'Microsoft Intune', daysSilent: 140 },
    { deviceName: 'MID', platform: 'macOS', source: 'ManageEngine', daysSilent: 70 },
    { deviceName: 'NEW', platform: 'Windows', source: 'Microsoft Intune', daysSilent: 35 },
  ]
  it('buckets by age and names the longest silent device', () => {
    const o = buildStaleOverview(rows, 300)
    expect(field(o, 'Stale devices (30+ days)')).toBe(3)
    expect(field(o, 'Share of managed devices')).toBe('1% of 300')
    expect([field(o, 'Silent 30–59 days'), field(o, 'Silent 60–89 days'), field(o, 'Silent 90+ days')]).toEqual([1, 1, 1])
    expect(field(o, 'Longest silent')).toBe('140 days (OLD-1)')
    expect(field(o, 'By platform')).toBe('Windows 2 · macOS 1')
    expect(o.action).toContain('Retire or re-enrol the 1 device silent for 90+ days')
  })
  it('reports a clean state', () => {
    const o = buildStaleOverview([], 300)
    expect(o.action).toBe('No stale devices. Nothing to do.')
    expect(field(o, 'Longest silent')).toBe('None')
  })
})

describe('inventory and compliance overviews', () => {
  const ago = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString()
  const dev = (o: Partial<GraphManagedDevice>): GraphManagedDevice => ({
    operatingSystem: 'Windows', complianceState: 'compliant', isEncrypted: true, manufacturer: 'Dell', managedDeviceOwnerType: 'company',
    lastSyncDateTime: ago(1), enrolledDateTime: ago(400), ...o,
  } as GraphManagedDevice)
  const devices = [
    dev({}), dev({ operatingSystem: 'iOS', manufacturer: 'Apple', managedDeviceOwnerType: 'personal', enrolledDateTime: ago(5) }),
    dev({ complianceState: 'noncompliant', isEncrypted: false, lastSyncDateTime: ago(45) }),
    dev({ complianceState: 'inGracePeriod' }),
  ]

  it('summarises inventory', () => {
    const o = buildInventoryOverview(devices)
    expect(field(o, 'Total devices')).toBe(4)
    expect(field(o, 'By OS')).toBe('Windows 3 · iOS 1')
    expect(field(o, 'Ownership')).toBe('Corporate 3 · Personal 1')
    expect(field(o, 'Encrypted')).toBe('75% (1 not encrypted)')
    expect(field(o, 'Enrolled in last 30 days')).toBe(1)
    expect(field(o, 'Not synced in 30+ days')).toBe(1)
    expect(o.action).toBe('Check the 1 device that has not synced in 30+ days and enforce encryption on 1 device.')
  })

  it('summarises compliance, counting grace period as other', () => {
    const o = buildComplianceOverview(devices)
    expect(field(o, 'Compliance rate')).toBe('50%')
    expect([field(o, 'Compliant'), field(o, 'Non-compliant'), field(o, 'Grace period / unknown / other')]).toEqual([2, 1, 1])
    expect(field(o, 'Non-compliant by OS')).toBe('Windows 1')
    expect(o.action).toBe('Review the 1 non-compliant device and enforce encryption on 1.')
  })

  it('says nothing is needed when everything is compliant', () => {
    expect(buildComplianceOverview([dev({})]).action).toBe('All reported devices are compliant. No action needed.')
  })
})

describe('buildUpdatesOverview', () => {
  const app = (name: string, o: Record<string, unknown>) => ({ key: name, identity: { displayName: name }, platform: 'windows', status: 'Package required', affectedDevices: 10, totalDevices: 50, latest: { version: '2' }, installed: [], ...o }) as never
  const apps = [
    app('Chrome', { affectedDevices: 40, totalDevices: 100 }),
    app('Zoom', { platform: 'macOS', status: 'Update available — existing package', affectedDevices: 5 }),
    app('Edge', { affectedDevices: 0 }),
    app('Mystery', { latest: undefined, affectedDevices: 0 }),
  ]
  it('counts updates by status and names the biggest gap', () => {
    const o = buildUpdatesOverview(apps, { syncedAt: '2026-10-27T05:30:00Z', errors: {} })
    expect(field(o, 'Apps behind latest version')).toBe(2)
    expect(field(o, 'Device-installs to update')).toBe(45)
    expect(field(o, 'Windows / macOS apps')).toBe('1 / 1')
    expect(field(o, 'Package required')).toBe(1)
    expect(field(o, 'Existing package ready')).toBe(1)
    expect(field(o, 'No verified source')).toBe(1)
    expect(o.action).toBe('Package 1 app first. Biggest gap: Chrome (40 of 100 devices behind).')
    expect(o.footnote).toBe('Inventory synced 2026-10-27 05:30 UTC')
  })
  it('flags sync warnings and the all-clear state', () => {
    expect(buildUpdatesOverview([], { syncedAt: '2026-10-27T05:30:00Z', errors: { me: 'x' } }).footnote).toContain('1 sync warning')
    expect(buildUpdatesOverview([], { syncedAt: '2026-10-27T05:30:00Z', errors: {} }).action).toBe('No installed app is behind its latest verified version.')
  })
})

describe('buildCriticalPatchOverview', () => {
  const now = new Date('2026-10-27T00:00:00Z')
  const sys = (id: string, o: Record<string, unknown> = {}) => ({ resourceId: id, detailResourceId: `d-${id}`, names: [id], platform: 'Windows', osName: 'Windows 11', criticalPatchCount: 2, scanSucceeded: true, ...o }) as never
  const patch = (daysAgo: number, o: Record<string, unknown> = {}) => ({ releasedAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(), cves: ['CVE-1'], rebootRequirement: 'Required', ...o }) as never

  it('summarises devices, patch age, reboots and flags failed scans', () => {
    const o = buildCriticalPatchOverview([sys('old'), sys('new'), sys('bad', { scanSucceeded: false }), sys('srv', { osName: 'Windows Server 2022' })], new Map([['d-old', [patch(60)]], ['d-new', [patch(5, { rebootRequirement: 'Not Required', cves: ['CVE-2'] })]]]), now)
    expect(field(o, 'Devices missing critical patches')).toBe(2)
    expect(field(o, 'Critical patches missing')).toBe(4)
    expect(field(o, 'Oldest missing patch')).toBe('60 days (old)')
    expect(field(o, 'Missing for 30+ days')).toBe('1 device')
    expect(field(o, 'Distinct CVEs')).toBe(2)
    expect(field(o, 'Reboot required')).toBe('1 device')
    expect(o.action).toBe('Patch the 2 devices, starting with the 1 missing patches for 30+ days.')
    expect(o.dataChecks?.find(c => c.label === 'Patch scan health')).toMatchObject({ status: 'warn', detail: expect.stringContaining('1 of 3') })
  })
  it('warns when patch detail is unavailable and reports the clean state', () => {
    expect(buildCriticalPatchOverview([sys('a')], new Map(), now).dataChecks?.find(c => c.label === 'Patch detail')?.status).toBe('warn')
    expect(buildCriticalPatchOverview([], new Map(), now).action).toBe('No critical patches are missing on scanned endpoints.')
  })
})
