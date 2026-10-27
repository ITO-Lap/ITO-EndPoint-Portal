import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'

const { getIntuneDevices, getManageEngineDevices, getManageEngineDeviceProfileResults, getManageEngineDeviceProfileResultsForDevices, isIntuneConfigured, isManageEngineConfigured } = vi.hoisted(() => ({
  getIntuneDevices: vi.fn(),
  getManageEngineDevices: vi.fn(),
  getManageEngineDeviceProfileResults: vi.fn(),
  getManageEngineDeviceProfileResultsForDevices: vi.fn(),
  isIntuneConfigured: () => true,
  isManageEngineConfigured: () => true,
}))

vi.mock('../../services/intune.js', () => ({ getIntuneDevices, isIntuneConfigured }))
vi.mock('../../services/manageEngine.js', () => ({ getManageEngineDevices, getManageEngineDeviceProfileResults, getManageEngineDeviceProfileResultsForDevices, isManageEngineConfigured }))
vi.mock('../../store/integrationStore.js', () => ({
  recordFetchResult: vi.fn(),
}))

describe('fetchAllDevices', () => {
  afterEach(() => vi.resetModules())

  it('shares one fleet fetch across concurrent cache misses', async () => {
    let releaseIntuneFetch!: (devices: never[]) => void
    getIntuneDevices.mockImplementationOnce(() => new Promise(resolve => { releaseIntuneFetch = resolve }))
    getManageEngineDevices.mockResolvedValueOnce([])

    const { fetchAllDevices } = await import('../devices.js')
    const requests = [fetchAllDevices(), fetchAllDevices(), fetchAllDevices()]

    expect(getIntuneDevices).toHaveBeenCalledTimes(1)
    expect(getManageEngineDevices).toHaveBeenCalledTimes(1)

    releaseIntuneFetch([])
    const results = await Promise.all(requests)
    expect(results).toEqual([{ devices: [], mock: false }, { devices: [], mock: false }, { devices: [], mock: false }])
  })

  it('only requests profile results for a matching ManageEngine device identifier', async () => {
    getIntuneDevices.mockResolvedValue([])
    getManageEngineDevices.mockResolvedValue([{
      id: 'me-mac-123',
      deviceName: 'Mac 123',
      user: 'user@example.test',
      serialNumber: 'SERIAL-123',
      platform: 'macOS',
      osVersion: '15.0',
      managementSource: 'ManageEngine',
      lastCheckIn: '2026-08-01T00:00:00.000Z',
      complianceState: 'Warning',
      encryptionStatus: 'Unknown',
      primaryIssue: 'None',
      policyFailed: 'None',
      severity: 'Low',
      confidence: '60%',
      firstDetected: 'N/A',
      lastDetected: 'N/A',
      issueSource: 'ManageEngine',
    }])
    getManageEngineDeviceProfileResults.mockResolvedValue({
      profiles: [{ profileId: '42', profileName: 'Baseline', status: 'SCHEDULED' }],
      lastSuccessfulSyncAt: '2026-09-01T00:00:00.000Z',
      stale: false,
    })

    const express = (await import('express')).default
    const router = (await import('../devices.js')).default
    const app = express()
    app.use('/api/devices', router)
    const server = createServer(app)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))

    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port')
      const baseUrl = `http://127.0.0.1:${address.port}/api/devices`

      const matchingResponse = await fetch(`${baseUrl}/me-mac-123/profile-results`)
      expect(matchingResponse.status).toBe(200)
      await expect(matchingResponse.json()).resolves.toMatchObject({ data: { profiles: [{ profileId: '42', status: 'SCHEDULED' }], stale: false } })
      expect(getManageEngineDeviceProfileResults).toHaveBeenCalledWith('me-mac-123')

      getManageEngineDeviceProfileResults.mockClear()
      const mismatchedResponse = await fetch(`${baseUrl}/different-device/profile-results`)
      expect(mismatchedResponse.status).toBe(200)
      await expect(mismatchedResponse.json()).resolves.toMatchObject({ data: [] })
      expect(getManageEngineDeviceProfileResults).not.toHaveBeenCalled()
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })

  it('fetches fleet profile results only for ManageEngine Macs and includes partial failures', async () => {
    const makeDevice = (id: string, managementSource: 'ManageEngine' | 'Microsoft Intune', platform: 'macOS' | 'Windows') => ({
      id,
      deviceName: id,
      user: 'user@example.test',
      serialNumber: `SERIAL-${id}`,
      platform,
      osVersion: '15.0',
      managementSource,
      lastCheckIn: '2026-08-01T00:00:00.000Z',
      complianceState: 'Warning' as const,
      encryptionStatus: 'Unknown',
      primaryIssue: 'None',
      policyFailed: 'None',
      severity: 'Low' as const,
      confidence: '60%',
      firstDetected: 'N/A',
      lastDetected: 'N/A',
      issueSource: managementSource,
    })
    getIntuneDevices.mockResolvedValue([makeDevice('intune-mac', 'Microsoft Intune', 'macOS')])
    getManageEngineDevices.mockResolvedValue([
      makeDevice('me-mac-1', 'ManageEngine', 'macOS'),
      makeDevice('me-windows', 'ManageEngine', 'Windows'),
    ])
    getManageEngineDeviceProfileResultsForDevices.mockResolvedValue([
      { deviceId: 'me-mac-1', snapshot: { profiles: [{ profileName: 'Baseline', status: 'SCHEDULED' }], lastSuccessfulSyncAt: '2026-09-01T00:00:00.000Z', stale: false }, unavailable: false },
    ])

    const express = (await import('express')).default
    const router = (await import('../devices.js')).default
    const app = express()
    app.use('/api/devices', router)
    const server = createServer(app)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))

    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port')
      const response = await fetch(`http://127.0.0.1:${address.port}/api/devices/manageengine/profile-results`)
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({
        data: { deviceCount: 1, unavailableCount: 0, results: [{ deviceId: 'me-mac-1', snapshot: { profiles: [{ status: 'SCHEDULED' }] }, unavailable: false }] },
      })
      expect(getManageEngineDeviceProfileResultsForDevices).toHaveBeenCalledWith(['me-mac-1'])
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })
})