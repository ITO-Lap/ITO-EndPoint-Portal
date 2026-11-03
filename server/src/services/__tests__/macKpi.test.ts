import { describe, expect, it } from 'vitest'
import { KPI_CONFIGS } from '../../../../src/lib/kpiConfig.js'
import type { ApiDevice } from '../../../../src/api/index.js'

function makeDevice(overrides: Partial<ApiDevice> = {}): ApiDevice {
  return {
    id: 'mac-1',
    deviceName: 'MacBook Pro',
    user: 'user@example.test',
    serialNumber: 'SERIAL-1',
    platform: 'macOS',
    osVersion: '15.5',
    managementSource: 'ManageEngine',
    lastCheckIn: new Date().toISOString(),
    complianceState: 'Warning',
    encryptionStatus: 'Encrypted',
    primaryIssue: 'No passcode set',
    policyFailed: 'Security Policy',
    severity: 'Medium',
    confidence: '95%',
    firstDetected: 'N/A',
    lastDetected: 'N/A',
    issueSource: 'ManageEngine',
    ...overrides,
  }
}

describe('Mac Fleet KPI source data', () => {
  it('does not classify a ManageEngine passcode warning as a missing app update', () => {
    const device = makeDevice()
    const kpi = KPI_CONFIGS['missing-app-updates']

    expect(kpi.getValue([device])).toBe('N/A')
    expect(kpi.filterFn([device])).toEqual([])
    expect(kpi.getUnavailableReason?.([device])).toMatch(/Patch Manager/i)
  })

  it('does not treat ManageEngine security-derived state as native overall MDM compliance', () => {
    const device = makeDevice({ complianceState: 'Compliant', severity: 'Low', primaryIssue: 'None' })
    const kpi = KPI_CONFIGS['compliance-score']

    expect(kpi.getValue([device])).toBe('N/A')
    expect(kpi.filterFn([device])).toEqual([])
    expect(kpi.getUnavailableReason?.([device])).toMatch(/does not expose an overall device-compliance verdict/i)
  })

  it('uses native Intune compliance population for compliance numerator and denominator', () => {
    const devices = [
      makeDevice({ id: 'me-1', complianceState: 'Non-Compliant' }),
      makeDevice({ id: 'intune-1', managementSource: 'Microsoft Intune', complianceState: 'Compliant' }),
      makeDevice({ id: 'intune-2', managementSource: 'Microsoft Intune', complianceState: 'Non-Compliant' }),
    ]
    const kpi = KPI_CONFIGS['compliance-score']

    expect(kpi.getValue(devices)).toBe('50.0%')
    expect(kpi.getCountSize?.(devices)).toBe(1)
    expect(kpi.getPopulationSize?.(devices)).toBe(2)
    expect(kpi.filterFn(devices)).toHaveLength(2)
  })

  it('reports actual inventory OS versions without claiming one is latest', () => {
    const devices = [
      makeDevice({ id: 'mac-1', osVersion: '15.5' }),
      makeDevice({ id: 'mac-2', osVersion: '15.5' }),
      makeDevice({ id: 'mac-3', osVersion: '14.7' }),
      makeDevice({ id: 'mac-4', osVersion: 'Unknown' }),
    ]

    expect(KPI_CONFIGS['macos-current'].getValue(devices)).toBe(0)
    expect(KPI_CONFIGS['macos-outdated'].getValue(devices)).toBe(3)
    expect(KPI_CONFIGS['macos-unsupported'].getValue(devices)).toBe(0)
    expect(KPI_CONFIGS['latest-macos-version'].getValue(devices)).toBe('15.5')
    expect(KPI_CONFIGS['latest-macos-version'].filterFn(devices).map(device => device.id)).toEqual(['mac-1', 'mac-2'])
    expect(KPI_CONFIGS['latest-macos-version'].title).toBe('Most Common OS Version')
  })
})