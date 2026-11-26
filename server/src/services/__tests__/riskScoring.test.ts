import { describe, it, expect } from 'vitest'
import { batchComputeRiskScores, fleetRiskSummary } from '../riskScoring.js'
import type { GraphManagedDevice } from '../graphApi.js'

const dev = (id: string, o: Partial<GraphManagedDevice> = {}): GraphManagedDevice => ({
  id, deviceName: `PC-${id}`, userPrincipalName: `${id}@x.com`, operatingSystem: 'Windows', osVersion: '11.0',
  complianceState: 'compliant', lastSyncDateTime: new Date().toISOString(), enrolledDateTime: new Date().toISOString(), isEncrypted: true,
  manufacturer: '', model: '', serialNumber: id, managedDeviceOwnerType: 'company', managementAgent: 'mdm', deviceEnrollmentType: '',
  azureADRegistered: true, azureADDeviceId: id, totalStorageSpaceInBytes: 100, freeStorageSpaceInBytes: 90, physicalMemoryInBytes: 0, ...o,
})
const risky = (id: string) => dev(id, { isEncrypted: false, complianceState: 'noncompliant' })

describe('Top-N risk scoring covers the whole fleet', () => {
  it('finds the riskiest devices even when Graph returns them last', async () => {
    // 50 healthy devices first, then 3 risky ones: the old code scored only the first N=5 and missed all three.
    const fleet = [...Array.from({ length: 50 }, (_, i) => dev(`ok${i}`)), risky('r1'), risky('r2'), risky('r3')]
    const top = await batchComputeRiskScores(fleet, null, { limit: 5, useAi: false })
    expect(top).toHaveLength(5)
    expect(top.slice(0, 3).map(s => s.deviceId).sort()).toEqual(['r1', 'r2', 'r3'])
    expect(top[0]!.overallScore).toBeGreaterThanOrEqual(top[4]!.overallScore)
  })

  it('returns everything when the limit is larger than the fleet', async () => {
    expect(await batchComputeRiskScores([dev('a'), risky('b')], null, { limit: 10, useAi: false })).toHaveLength(2)
  })

  it('fleet summary counts every device, not just the list shown', () => {
    const fleet = [...Array.from({ length: 50 }, (_, i) => dev(`ok${i}`)), risky('r1'), risky('r2')]
    const s = fleetRiskSummary(fleet)
    expect(s.totalDevices).toBe(52)
    expect(s.critical + s.high + s.medium + s.low).toBe(52)
    expect(s.low).toBe(50)
    expect(s.critical + s.high + s.medium).toBe(2)
    expect(fleetRiskSummary([])).toMatchObject({ totalDevices: 0, avgScore: 0 })
  })
})
