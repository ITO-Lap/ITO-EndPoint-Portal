import { afterEach, describe, it, expect, vi } from 'vitest'
import {
  getManageEngineDeviceProfileResults,
  getManageEngineDeviceProfileResultsForDevices,
  classifyAppPlatform,
  dedupeDevicesBySerial,
  compareVersions,
  pickLatestVersion,
  buildAppInventory,
  type MEAppRaw,
} from '../manageEngine.js'
import type { Device } from '../../types.js'

const testConfig = {
  clientId: 'profile-results-test-client',
  clientSecret: 'test-secret',
  refreshToken: 'test-refresh-token',
  apiDomain: 'https://mdm.example.test',
}

function mockManageEngineFetch(apiResponse: Response | Error, tokenResponse = new Response(JSON.stringify({ access_token: 'test-access-token' }), { status: 200 })) {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(tokenResponse)
    .mockImplementationOnce(() => apiResponse instanceof Error ? Promise.reject(apiResponse) : Promise.resolve(apiResponse))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe('getManageEngineDeviceProfileResults', () => {
  it('preserves the API profile status and documented result fields', async () => {
    const fetchMock = mockManageEngineFetch(new Response(JSON.stringify({ profiles: [{
      profile_id: 123,
      profile_name: 'FileVault Baseline',
      status: 'SCHEDULED',
      remarks: 'Executed Successfully',
      localized_remarks: 'Applied',
      applied_time: 1780000000000,
    }] }), { status: 200 }))

    await expect(getManageEngineDeviceProfileResults('mac-device-123', testConfig)).resolves.toMatchObject({
      profiles: [{
        profileId: '123',
        profileName: 'FileVault Baseline',
        status: 'SCHEDULED',
        remarks: 'Executed Successfully',
        localizedRemarks: 'Applied',
        appliedTime: '1780000000000',
      }],
      stale: false,
    })
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://mdm.example.test/api/v1/mdm/devices/mac-device-123/profiles')
  })

  it('keeps missing result attributes unknown instead of inferring a verdict', async () => {
    mockManageEngineFetch(new Response(JSON.stringify({ profiles: [{}] }), { status: 200 }))
    await expect(getManageEngineDeviceProfileResults('mac-device-unknown', { ...testConfig, clientId: 'unknown-client' })).resolves.toMatchObject({
      profiles: [{
        profileId: null,
        profileName: 'Unknown profile',
        status: null,
        remarks: null,
        localizedRemarks: null,
        appliedTime: null,
      }],
      stale: false,
    })
  })

  it('rejects authentication failures and API rate limits', async () => {
    mockManageEngineFetch(new Response('', { status: 200 }), new Response('', { status: 401, statusText: 'Unauthorized' }))
    await expect(getManageEngineDeviceProfileResults('mac-auth-failure', { ...testConfig, clientId: 'auth-failure-client' })).rejects.toThrow('ManageEngine auth failed: 401')

    mockManageEngineFetch(new Response('rate limited', { status: 429, statusText: 'Too Many Requests' }))
    await expect(getManageEngineDeviceProfileResults('mac-rate-limited', { ...testConfig, clientId: 'rate-limit-client' })).rejects.toThrow('ManageEngine API 429')
  })

  it('rejects timeouts and incomplete response shapes without returning a false empty result', async () => {
    mockManageEngineFetch(new Error('request timed out'))
    await expect(getManageEngineDeviceProfileResults('mac-timeout', { ...testConfig, clientId: 'timeout-client' })).rejects.toThrow('request timed out')

    mockManageEngineFetch(new Response(JSON.stringify({}), { status: 200 }))
    await expect(getManageEngineDeviceProfileResults('mac-incomplete', { ...testConfig, clientId: 'incomplete-client' })).rejects.toThrow('profiles array')
  })

  it('returns the last successful response as stale after refresh failure, then refreshes successfully', async () => {
    const clientConfig = { ...testConfig, clientId: 'refresh-recovery-client' }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'recovery-token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ profiles: [{ profile_id: 7, profile_name: 'Baseline', status: 'SCHEDULED' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response('server error', { status: 503, statusText: 'Service Unavailable' }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ profiles: [{ profile_id: 7, profile_name: 'Baseline', status: 'APPLIED' }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    vi.useFakeTimers()
    const initial = await getManageEngineDeviceProfileResults('mac-refresh-recovery', clientConfig)
    vi.setSystemTime(Date.now() + 5 * 60 * 1000 + 1)
    const failedRefresh = await getManageEngineDeviceProfileResults('mac-refresh-recovery', clientConfig)
    expect(failedRefresh).toMatchObject({ profiles: [{ status: 'SCHEDULED' }], stale: true })
    expect(failedRefresh.lastSuccessfulSyncAt).toBe(initial.lastSuccessfulSyncAt)

    const recovered = await getManageEngineDeviceProfileResults('mac-refresh-recovery', clientConfig)
    expect(recovered).toMatchObject({ profiles: [{ status: 'APPLIED' }], stale: false })
    expect(Number.isNaN(Date.parse(recovered.lastSuccessfulSyncAt))).toBe(false)
    vi.useRealTimers()
  })

  it('returns partial fleet results when one device request is rate limited', async () => {
    const clientConfig = { ...testConfig, clientId: 'fleet-partial-client' }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'fleet-token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ profiles: [{ profile_id: 10, profile_name: 'Baseline', status: 'SCHEDULED' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response('rate limited', { status: 429, statusText: 'Too Many Requests' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getManageEngineDeviceProfileResultsForDevices(['mac-good', 'mac-limited', 'mac-good'], clientConfig)).resolves.toMatchObject([
      { deviceId: 'mac-good', snapshot: { profiles: [{ status: 'SCHEDULED' }], stale: false }, unavailable: false },
      { deviceId: 'mac-limited', snapshot: null, unavailable: true },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})

function makeDevice(overrides: Partial<Device> & Pick<Device, 'id'>): Device {
  return {
    deviceName: overrides.deviceName ?? `Device-${overrides.id}`,
    user: 'user@zinnia.com',
    serialNumber: overrides.serialNumber ?? `SER-${overrides.id}`,
    platform: 'macOS',
    osVersion: '15.0',
    managementSource: 'ManageEngine',
    lastCheckIn: '2026-01-01T00:00:00.000Z',
    complianceState: 'Compliant',
    encryptionStatus: 'Encrypted',
    primaryIssue: 'None',
    policyFailed: 'None',
    severity: 'Low',
    confidence: '95%',
    firstDetected: 'N/A',
    lastDetected: '2026-01-01T00:00:00.000Z',
    issueSource: 'ManageEngine',
    ...overrides,
  }
}

describe('classifyAppPlatform', () => {
  it('maps Windows devices to the Windows bucket', () => {
    expect(classifyAppPlatform('Windows')).toBe('Windows')
  })

  it('maps macOS devices to the macOS bucket', () => {
    expect(classifyAppPlatform('macOS')).toBe('macOS')
  })

  it('excludes platforms outside the Windows/macOS scope', () => {
    expect(classifyAppPlatform('Linux')).toBeNull()
    expect(classifyAppPlatform('Android')).toBeNull()
    expect(classifyAppPlatform('iOS')).toBeNull()
  })
})

describe('dedupeDevicesBySerial', () => {
  it('keeps only one record per serial number', () => {
    const devices = [
      makeDevice({ id: '1', serialNumber: 'ABC123', lastCheckIn: '2026-01-01T00:00:00.000Z' }),
      makeDevice({ id: '2', serialNumber: 'ABC123', lastCheckIn: '2026-02-01T00:00:00.000Z' }),
    ]
    const result = dedupeDevicesBySerial(devices)
    expect(result).toHaveLength(1)
  })

  it('keeps the record with the most recent check-in when duplicated', () => {
    const devices = [
      makeDevice({ id: '1', serialNumber: 'ABC123', lastCheckIn: '2026-01-01T00:00:00.000Z' }),
      makeDevice({ id: '2', serialNumber: 'ABC123', lastCheckIn: '2026-02-01T00:00:00.000Z' }),
    ]
    const result = dedupeDevicesBySerial(devices)
    expect(result[0]!.id).toBe('2')
  })

  it('does not merge devices with distinct serial numbers', () => {
    const devices = [
      makeDevice({ id: '1', serialNumber: 'ABC123' }),
      makeDevice({ id: '2', serialNumber: 'XYZ789' }),
    ]
    expect(dedupeDevicesBySerial(devices)).toHaveLength(2)
  })
})

describe('compareVersions', () => {
  it('treats a higher numeric version as greater', () => {
    expect(compareVersions('24.10.2', '24.9.0')).toBeGreaterThan(0)
  })

  it('treats equal versions as equal', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
  })

  it('treats Unknown as lower than any known version', () => {
    expect(compareVersions('Unknown', '1.0.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0', 'Unknown')).toBeGreaterThan(0)
  })

  it('falls back to string comparison for non-numeric schemes', () => {
    expect(compareVersions('beta', 'alpha')).toBeGreaterThan(0)
  })
})

describe('pickLatestVersion', () => {
  it('picks the highest version among known versions', () => {
    expect(pickLatestVersion(['1.0.0', '2.5.0', '2.4.9'])).toBe('2.5.0')
  })

  it('ignores Unknown entries when a known version exists', () => {
    expect(pickLatestVersion(['Unknown', '3.0.0'])).toBe('3.0.0')
  })

  it('returns Unknown when no known version exists', () => {
    expect(pickLatestVersion(['Unknown'])).toBe('Unknown')
    expect(pickLatestVersion([])).toBe('Unknown')
  })
})

describe('buildAppInventory', () => {
  it('separates apps into Windows and macOS buckets by device platform, not app name', () => {
    const winDevice = makeDevice({ id: 'w1', platform: 'Windows' })
    const macDevice = makeDevice({ id: 'm1', platform: 'macOS' })
    const appsByDeviceId = new Map<string, MEAppRaw[]>([
      ['w1', [{ appId: 'com.vendor.tool', name: 'Tool', version: '1.0' }]],
      ['m1', [{ appId: 'com.vendor.tool', name: 'Tool', version: '2.0' }]],
    ])

    const { windows, macos } = buildAppInventory([winDevice, macDevice], appsByDeviceId)

    expect(windows).toHaveLength(1)
    expect(windows[0]!.installedVersions).toEqual(['1.0'])
    expect(macos).toHaveLength(1)
    expect(macos[0]!.installedVersions).toEqual(['2.0'])
  })

  it('excludes devices outside the Windows/macOS scope', () => {
    const linuxDevice = makeDevice({ id: 'l1', platform: 'Linux' })
    const appsByDeviceId = new Map<string, MEAppRaw[]>([
      ['l1', [{ appId: 'com.vendor.tool', name: 'Tool', version: '1.0' }]],
    ])
    const { windows, macos } = buildAppInventory([linuxDevice], appsByDeviceId)
    expect(windows).toHaveLength(0)
    expect(macos).toHaveLength(0)
  })

  it('counts unique devices per app, not per app-name string collision', () => {
    const d1 = makeDevice({ id: 'd1', platform: 'macOS' })
    const d2 = makeDevice({ id: 'd2', platform: 'macOS' })
    const appsByDeviceId = new Map<string, MEAppRaw[]>([
      ['d1', [{ appId: 'app-a', name: 'Same Name', version: '1.0' }]],
      ['d2', [{ appId: 'app-b', name: 'Same Name', version: '1.0' }]],
    ])
    const { macos } = buildAppInventory([d1, d2], appsByDeviceId)
    // Two distinct app IDs sharing a display name must stay two separate entries
    expect(macos).toHaveLength(2)
    expect(macos.every(a => a.deviceCount === 1)).toBe(true)
  })

  it('ignores a duplicate app entry reported twice for the same device', () => {
    const d1 = makeDevice({ id: 'd1', platform: 'macOS' })
    const appsByDeviceId = new Map<string, MEAppRaw[]>([
      ['d1', [
        { appId: 'app-a', name: 'App', version: '1.0' },
        { appId: 'app-a', name: 'App', version: '1.0' },
      ]],
    ])
    const { macos } = buildAppInventory([d1], appsByDeviceId)
    expect(macos[0]!.deviceCount).toBe(1)
  })

  it('reports Up to date when every device is on the latest observed version', () => {
    const d1 = makeDevice({ id: 'd1', platform: 'macOS' })
    const d2 = makeDevice({ id: 'd2', platform: 'macOS' })
    const appsByDeviceId = new Map<string, MEAppRaw[]>([
      ['d1', [{ appId: 'app-a', name: 'App', version: '2.0' }]],
      ['d2', [{ appId: 'app-a', name: 'App', version: '2.0' }]],
    ])
    const { macos } = buildAppInventory([d1, d2], appsByDeviceId)
    expect(macos[0]!.updateStatus).toBe('Up to date')
    expect(macos[0]!.latestVersion).toBe('2.0')
  })

  it('reports Update Available when devices are behind the latest observed version', () => {
    const d1 = makeDevice({ id: 'd1', platform: 'macOS' })
    const d2 = makeDevice({ id: 'd2', platform: 'macOS' })
    const appsByDeviceId = new Map<string, MEAppRaw[]>([
      ['d1', [{ appId: 'app-a', name: 'App', version: '1.0' }]],
      ['d2', [{ appId: 'app-a', name: 'App', version: '2.0' }]],
    ])
    const { macos } = buildAppInventory([d1, d2], appsByDeviceId)
    expect(macos[0]!.updateStatus).toBe('Update Available')
    const behindLog = macos[0]!.logs.find(l => l.deviceId === 'd1')
    const currentLog = macos[0]!.logs.find(l => l.deviceId === 'd2')
    expect(behindLog?.status).toBe('Update Available')
    expect(currentLog?.status).toBe('Installed')
  })

  it('reports Unknown when version data is unavailable for any device', () => {
    const d1 = makeDevice({ id: 'd1', platform: 'macOS' })
    const appsByDeviceId = new Map<string, MEAppRaw[]>([
      ['d1', [{ appId: 'app-a', name: 'App', version: '' }]],
    ])
    const { macos } = buildAppInventory([d1], appsByDeviceId)
    expect(macos[0]!.installedVersions).toEqual(['Unknown'])
    expect(macos[0]!.updateStatus).toBe('Unknown')
  })

  it('filters logs so each app entry only contains its own installation records', () => {
    const d1 = makeDevice({ id: 'd1', platform: 'macOS' })
    const d2 = makeDevice({ id: 'd2', platform: 'macOS' })
    const appsByDeviceId = new Map<string, MEAppRaw[]>([
      ['d1', [
        { appId: 'app-a', name: 'App A', version: '1.0' },
        { appId: 'app-b', name: 'App B', version: '3.0' },
      ]],
      ['d2', [{ appId: 'app-a', name: 'App A', version: '1.0' }]],
    ])
    const { macos } = buildAppInventory([d1, d2], appsByDeviceId)
    const appA = macos.find(a => a.appId === 'app-a')!
    const appB = macos.find(a => a.appId === 'app-b')!

    expect(appA.logs.map(l => l.deviceId).sort()).toEqual(['d1', 'd2'])
    expect(appB.logs.map(l => l.deviceId)).toEqual(['d1'])
    // No cross-contamination between apps' log sets
    expect(appA.logs.some(l => l.deviceId === 'd2' && appB.logs.includes(l))).toBe(false)
  })

  it('never fabricates error details — always null, reflecting no install-failure API exists', () => {
    const d1 = makeDevice({ id: 'd1', platform: 'macOS' })
    const appsByDeviceId = new Map<string, MEAppRaw[]>([
      ['d1', [{ appId: 'app-a', name: 'App', version: '1.0' }]],
    ])
    const { macos } = buildAppInventory([d1], appsByDeviceId)
    expect(macos[0]!.logs[0]!.errorDetails).toBeNull()
  })
})
