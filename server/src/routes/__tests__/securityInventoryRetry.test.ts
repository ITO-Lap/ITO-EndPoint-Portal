import { describe, it, expect, vi } from 'vitest'

const intune = vi.fn()
vi.mock('../../services/intune.js', () => ({ getIntuneDeviceApps: (...a: unknown[]) => intune(...a), isIntuneConfigured: () => true }))
vi.mock('../../services/manageEngine.js', () => ({ getManageEngineDeviceApps: vi.fn(), isManageEngineConfigured: () => false }))
vi.mock('../devices.js', () => ({ fetchAllDevices: vi.fn() }))
const { getAppsWithRetry } = await import('../securityInventory.js')

const dev = { id: 'd1', managementSource: 'Microsoft Intune' } as never
const err = (status: number) => Object.assign(new Error(`API ${status}`), { status })

describe('getAppsWithRetry', () => {
  it('retries throttled reads and returns the apps', async () => {
    intune.mockReset().mockRejectedValueOnce(err(429)).mockResolvedValueOnce([{ name: 'Falcon' }])
    expect(await getAppsWithRetry(dev, 3, async () => {})).toEqual([{ name: 'Falcon' }])
    expect(intune).toHaveBeenCalledTimes(2)
  })
  it('does not retry permanent errors and gives up after the last attempt', async () => {
    intune.mockReset().mockRejectedValue(err(404))
    await expect(getAppsWithRetry(dev, 3, async () => {})).rejects.toThrow()
    expect(intune).toHaveBeenCalledTimes(1)
    intune.mockReset().mockRejectedValue(err(429))
    await expect(getAppsWithRetry(dev, 3, async () => {})).rejects.toThrow()
    expect(intune).toHaveBeenCalledTimes(3)
  })
})
