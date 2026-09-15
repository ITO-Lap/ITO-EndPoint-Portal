import { describe, it, expect } from 'vitest'
import {
  classifyAppPlatform,
  dedupeDevicesBySerial,
  compareVersions,
  pickLatestVersion,
  buildAppInventory,
  type MEAppRaw,
} from '../manageEngine.js'
import type { Device } from '../../types.js'

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
