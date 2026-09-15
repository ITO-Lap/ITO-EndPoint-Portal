import { describe, it, expect } from 'vitest'
import type { AppStatus, Device } from '../../types.js'
import { scanDevice, scanFleet, buildPlatformCoverage, listDevicesMissingAgent, isVirtualHostname } from '../service.js'
import { ZscalerCollector } from '../collectors/zscaler.collector.js'
import { CrowdStrikeCollector } from '../collectors/crowdstrike.collector.js'
import { findAgent } from '../types.js'

function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: 'd1',
    deviceName: 'LAPTOP-1',
    user: 'jdoe',
    serialNumber: 'SN123',
    platform: 'Windows',
    osVersion: '11',
    managementSource: 'Microsoft Intune',
    lastCheckIn: '2026-08-01T00:00:00Z',
    complianceState: 'Compliant',
    encryptionStatus: 'Encrypted',
    primaryIssue: 'None',
    policyFailed: 'None',
    severity: 'Low',
    confidence: 'High',
    firstDetected: '2026-01-01T00:00:00Z',
    lastDetected: '2026-08-01T00:00:00Z',
    issueSource: 'None',
    ...overrides,
  }
}

function makeApp(overrides: Partial<AppStatus> = {}): AppStatus {
  return { name: 'Some App', version: '1.0', publisher: 'Vendor', status: 'Installed', ...overrides }
}

const collectors = [new ZscalerCollector(), new CrowdStrikeCollector()]

describe('scanDevice', () => {
  it('reports NotInstalled for both agents when neither is present', () => {
    const status = scanDevice(makeDevice(), [makeApp({ name: 'Slack' })], '2026-08-07T00:00:00Z', collectors)
    expect(findAgent(status, 'zscaler')?.health).toBe('NotInstalled')
    expect(findAgent(status, 'crowdstrike')?.health).toBe('NotInstalled')
  })

  it('reports Healthy when Zscaler is installed with a known version', () => {
    const apps = [makeApp({ name: 'Zscaler Client Connector', version: '4.3.0.123', status: 'Installed' })]
    const status = scanDevice(makeDevice(), apps, '2026-08-07T00:00:00Z', collectors)
    const zscaler = findAgent(status, 'zscaler')
    expect(zscaler?.installed).toBe(true)
    expect(zscaler?.health).toBe('Healthy')
    expect(zscaler?.version).toBe('4.3.0.123')
  })

  it('reports Warning when CrowdStrike version is unknown', () => {
    const apps = [makeApp({ name: 'CrowdStrike Falcon Sensor', version: 'Unknown', status: 'Installed' })]
    const status = scanDevice(makeDevice(), apps, '2026-08-07T00:00:00Z', collectors)
    expect(findAgent(status, 'crowdstrike')?.health).toBe('Warning')
  })

  it('reports Error when an agent install failed', () => {
    const apps = [makeApp({ name: 'Zscaler App', version: '4.0', status: 'Failed' })]
    const status = scanDevice(makeDevice(), apps, '2026-08-07T00:00:00Z', collectors)
    expect(findAgent(status, 'zscaler')?.health).toBe('Error')
  })

  it('treats a ManageEngine antivirusStatus hint as installed-but-unverified', () => {
    const device = makeDevice({ managementSource: 'ManageEngine', antivirusStatus: 'CrowdStrike' })
    const status = scanDevice(device, [], '2026-08-07T00:00:00Z', collectors)
    const falcon = findAgent(status, 'crowdstrike')
    expect(falcon?.installed).toBe(true)
    expect(falcon?.health).toBe('Warning')
  })

  it('computes overallHealth as Unprotected when no agent is installed', () => {
    const status = scanDevice(makeDevice(), [], '2026-08-07T00:00:00Z', collectors)
    expect(status.overallHealth).toBe('Unprotected')
    expect(status.securityScore).toBe(0)
  })

  it('computes overallHealth as Healthy and a 100 score when every agent is healthy', () => {
    const apps = [
      makeApp({ name: 'Zscaler Client Connector', version: '4.3.0' }),
      makeApp({ name: 'CrowdStrike Falcon Sensor', version: '7.1.0' }),
    ]
    const status = scanDevice(makeDevice(), apps, '2026-08-07T00:00:00Z', collectors)
    expect(status.overallHealth).toBe('Healthy')
    expect(status.securityScore).toBe(100)
  })

  it('lets an Error agent dominate overallHealth even if the other agent is healthy', () => {
    const apps = [
      makeApp({ name: 'Zscaler Client Connector', version: '4.3.0', status: 'Failed' }),
      makeApp({ name: 'CrowdStrike Falcon Sensor', version: '7.1.0' }),
    ]
    const status = scanDevice(makeDevice(), apps, '2026-08-07T00:00:00Z', collectors)
    expect(status.overallHealth).toBe('Error')
  })
})

describe('scanFleet — fleet-relative outdated-version check', () => {
  it('downgrades a Healthy device to Warning when a newer version exists elsewhere in the fleet', () => {
    const latest = { device: makeDevice({ id: 'd-latest' }), apps: [makeApp({ name: 'Zscaler Client Connector', version: '5.0.0' })] }
    const older  = { device: makeDevice({ id: 'd-older'  }), apps: [makeApp({ name: 'Zscaler Client Connector', version: '4.0.0' })] }
    const [latestStatus, olderStatus] = scanFleet([latest, older], '2026-08-07T00:00:00Z', collectors)
    expect(findAgent(latestStatus!, 'zscaler')?.health).toBe('Healthy')
    expect(findAgent(olderStatus!, 'zscaler')?.health).toBe('Warning')
  })
})

describe('isVirtualHostname', () => {
  it('flags common VDI/virtual-desktop naming patterns', () => {
    expect(isVirtualHostname('VDI-WIN-042')).toBe(true)
    expect(isVirtualHostname('virtual-machine-7')).toBe(true)
    expect(isVirtualHostname('VirtualMac-3')).toBe(true)
    expect(isVirtualHostname('LAPTOP-1')).toBe(false)
  })
})

describe('buildPlatformCoverage', () => {
  it('computes Falcon/Zscaler coverage for physical devices of one platform only', () => {
    const covered   = { device: makeDevice({ id: 'p1' }), apps: [makeApp({ name: 'Zscaler Client Connector', version: '5.0.0' }), makeApp({ name: 'CrowdStrike Falcon Sensor', version: '7.0.0' })] }
    const uncovered = { device: makeDevice({ id: 'p2' }), apps: [] }
    const mac       = { device: makeDevice({ id: 'p3', platform: 'macOS', managementSource: 'ManageEngine' }), apps: [] }
    const vdi       = { device: makeDevice({ id: 'p4', deviceName: 'VDI-WIN-01' }), apps: [] }

    const statuses = scanFleet([covered, uncovered, mac, vdi], '2026-08-07T00:00:00Z', collectors)
    const windows = buildPlatformCoverage(statuses, 'Windows')

    expect(windows.totalDevices).toBe(2) // VDI excluded
    expect(windows.falconInstalled).toBe(1)
    expect(windows.zscalerInstalled).toBe(1)
    expect(windows.falconMissing).toBe(1)
    expect(windows.falconCoveragePct).toBe(50)
    expect(windows.zscalerCoveragePct).toBe(50)
  })

  it('reports Healthy for an empty platform rather than dividing by zero', () => {
    const coverage = buildPlatformCoverage([], 'macOS')
    expect(coverage.totalDevices).toBe(0)
    expect(coverage.health).toBe('Healthy')
  })

  it('reports Critical when coverage for either agent drops below 70%', () => {
    const devices = Array.from({ length: 10 }, (_, i) => ({
      device: makeDevice({ id: `d${i}` }),
      apps: i < 6 ? [makeApp({ name: 'Zscaler Client Connector', version: '5.0.0' }), makeApp({ name: 'CrowdStrike Falcon Sensor', version: '7.0.0' })] : [],
    }))
    const statuses = scanFleet(devices, '2026-08-07T00:00:00Z', collectors)
    const coverage = buildPlatformCoverage(statuses, 'Windows')
    expect(coverage.falconCoveragePct).toBe(60)
    expect(coverage.health).toBe('Critical')
  })
})

describe('listDevicesMissingAgent', () => {
  it('lists only physical devices of the given platform missing the given agent', () => {
    const missing = { device: makeDevice({ id: 'm1', deviceName: 'LAPTOP-1' }), apps: [] }
    const has     = { device: makeDevice({ id: 'h1' }), apps: [makeApp({ name: 'Zscaler Client Connector', version: '5.0.0' })] }
    const vdi     = { device: makeDevice({ id: 'v1', deviceName: 'VDI-WIN-02' }), apps: [] }
    const statuses = scanFleet([missing, has, vdi], '2026-08-07T00:00:00Z', collectors)

    const result = listDevicesMissingAgent(statuses, 'Windows', 'zscaler')
    expect(result.map(d => d.deviceId)).toEqual(['m1'])
  })
})
