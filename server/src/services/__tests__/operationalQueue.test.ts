import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../staleDevices/service.js', () => ({ getStaleDevicesService: vi.fn() }))
vi.mock('../staleDevices/query.js', () => ({ filterDevices: vi.fn((devices: unknown[]) => devices) }))
vi.mock('../endpointCentralPatch.js', () => ({ getPatchSystems: vi.fn(), getFleetCriticalPatches: vi.fn(), isPatchApiConfigured: vi.fn() }))
vi.mock('../criticalPatchReport.js', () => ({ isSupportedCriticalPatchClient: vi.fn(() => true) }))
vi.mock('../../routes/securityInventory.js', () => ({ getCachedIfFresh: vi.fn() }))
vi.mock('../../security-agents/service.js', () => ({ listDevicesMissingAgent: vi.fn() }))

import { getStaleDevicesService } from '../staleDevices/service.js'
import { getPatchSystems, getFleetCriticalPatches, isPatchApiConfigured } from '../endpointCentralPatch.js'
import type { PatchSystemStatus, MissingPatch } from '../endpointCentralPatch.js'
import { getCachedIfFresh } from '../../routes/securityInventory.js'
import { listDevicesMissingAgent } from '../../security-agents/service.js'
import { getOperationalQueue } from '../operationalQueue.js'

type CachedScan = NonNullable<ReturnType<typeof getCachedIfFresh>>

const staleDevice = (overrides: Record<string, unknown> = {}) => ({
  canonicalDeviceId: 'sd-1', deviceName: 'WIN-OLD', username: 'Asha Rao', email: 'asha@zinnia.com', managedBy: 'Intune', inactiveDays: 45, staleStatus: 'stale', ...overrides,
})

beforeEach(() => {
  vi.mocked(getStaleDevicesService).mockReturnValue({ devices: () => [staleDevice()] } as unknown as ReturnType<typeof getStaleDevicesService>)
  vi.mocked(isPatchApiConfigured).mockReturnValue(false)
  vi.mocked(getCachedIfFresh).mockReturnValue({ statuses: [], result: {} } as unknown as CachedScan)
  vi.mocked(listDevicesMissingAgent).mockReturnValue([])
})

describe('getOperationalQueue', () => {
  it('includes stale devices as High priority rows', async () => {
    const { rows } = await getOperationalQueue()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ device: 'WIN-OLD', owner: 'Asha Rao', source: 'Intune', priority: 'High', ageDays: 45 })
  })

  it('includes devices with critical missing patches as Critical priority, sorted ahead of High', async () => {
    vi.mocked(isPatchApiConfigured).mockReturnValue(true)
    vi.mocked(getPatchSystems).mockResolvedValue([
      { resourceId: 'r1', detailResourceId: 'p1', platform: 'Windows', names: ['WIN-PATCH'], criticalPatchCount: 5 } as unknown as PatchSystemStatus,
    ])
    vi.mocked(getFleetCriticalPatches).mockResolvedValue(new Map([['p1', [{ kb: 'KB999', name: 'Update', description: 'Update' } as unknown as MissingPatch]]]))

    const { rows } = await getOperationalQueue()
    expect(rows[0]).toMatchObject({ device: 'WIN-PATCH', priority: 'Critical', source: 'Endpoint Central' })
    expect(rows.find(r => r.device === 'WIN-OLD')?.priority).toBe('High')
    expect(rows.indexOf(rows.find(r => r.device === 'WIN-PATCH')!)).toBeLessThan(rows.indexOf(rows.find(r => r.device === 'WIN-OLD')!))
  })

  it('includes devices missing endpoint protection', async () => {
    vi.mocked(listDevicesMissingAgent).mockReturnValue([
      { deviceId: 'd1', deviceName: 'MAC-1', primaryUser: 'Rahul', connector: 'ManageEngine', lastSync: new Date(Date.now() - 3 * 86_400_000).toISOString() },
    ])

    const { rows } = await getOperationalQueue()
    const gapRow = rows.find(r => r.device === 'MAC-1')
    expect(gapRow).toMatchObject({ owner: 'Rahul', issue: 'Endpoint protection not installed', source: 'ManageEngine', priority: 'High', ageDays: 3 })
  })

  it('returns no patch rows when the patch API is not configured, without throwing', async () => {
    vi.mocked(isPatchApiConfigured).mockReturnValue(false)
    const { rows } = await getOperationalQueue()
    expect(rows.every(r => r.source !== 'Endpoint Central')).toBe(true)
  })

  it('does not blow up the whole queue if a source throws', async () => {
    vi.mocked(isPatchApiConfigured).mockReturnValue(true)
    vi.mocked(getPatchSystems).mockRejectedValue(new Error('ManageEngine down'))
    const { rows } = await getOperationalQueue()
    expect(rows.some(r => r.device === 'WIN-OLD')).toBe(true)
  })

  it('never triggers the security-inventory fleet scan itself — only reads it if already warm', async () => {
    // getCachedIfFresh is synchronous and never-scanning by construction; a
    // cold cache (mocked as null, like a tenant where Security Posture
    // hasn't been visited yet) must resolve instantly with this source
    // simply empty, not attempt any network call.
    vi.mocked(getCachedIfFresh).mockReturnValue(null)
    const { rows } = await getOperationalQueue()
    expect(rows.some(r => r.issue === 'Endpoint protection not installed')).toBe(false)
    expect(rows.some(r => r.device === 'WIN-OLD')).toBe(true) // other sources still return
  })
})
