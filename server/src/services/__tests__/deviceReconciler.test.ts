import { describe, it, expect } from 'vitest'
import type { Device } from '../../types.js'
import type { PatchSystemStatus } from '../endpointCentralPatch.js'
import { reconcileDevices, buildDiagnostics } from '../deviceReconciler.js'

const dev = (o: Record<string, unknown> = {}): Device => ({
  id: 'd', deviceName: 'N', user: 'u', serialNumber: 'Unknown', platform: 'Windows', osVersion: '11', managementSource: 'Microsoft Intune',
  lastCheckIn: '', complianceState: 'Compliant', encryptionStatus: '', primaryIssue: 'None', policyFailed: '', severity: 'Low', confidence: '',
  firstDetected: '', lastDetected: '', issueSource: '', ...o,
}) as unknown as Device
const sys = (o: Partial<PatchSystemStatus> = {}): PatchSystemStatus => ({
  resourceId: '1', detailResourceId: 'R', platform: 'Windows', names: [], missingOsPatches: 0, missingThirdPartyPatches: 0, missingDriverPatches: 0,
  missingBiosPatches: 0, criticalPatchCount: 0, importantPatchCount: 0, moderatePatchCount: 0, lowPatchCount: 0, lastScanTime: null,
  lastSuccessfulScanTime: null, lastContactTime: null, scanSucceeded: true, ...o,
})

describe('reconcileDevices', () => {
  it('resolves by strongest key: resource id, serial, then unique host name', () => {
    const devices = [
      dev({ id: 'ec-R1', deviceName: 'ecbox', managementSource: 'ManageEngine' }),
      dev({ id: 'i2', deviceName: 'laptop', serialNumber: 'SER123456' }),
      dev({ id: 'i3', deviceName: 'byname.corp.local' }),
    ]
    const systems = [sys({ detailResourceId: 'R1' }), sys({ detailResourceId: 'R2', names: ['X-SER123456'] }), sys({ detailResourceId: 'R3', names: ['BYNAME'] })]
    const r = reconcileDevices(devices, systems)
    expect(r.byDeviceId.get('ec-R1')).toMatchObject({ patchMatchedBy: 'resource-id' })
    expect(r.byDeviceId.get('i2')).toMatchObject({ patchMatchedBy: 'serial' })
    expect(r.byDeviceId.get('i3')).toMatchObject({ patchMatchedBy: 'hostname' })
    expect(r.unmatchedPatch).toHaveLength(0)
  })

  it('a hybrid device\'s own agent row is not a name collision', () => {
    const intune = dev({ id: 'i', deviceName: 'HYB-1' })
    const ec = dev({ id: 'ec-9', deviceName: 'hyb-1', managementSource: 'ManageEngine' })
    const r = reconcileDevices([intune], [sys({ detailResourceId: '9', names: ['HYB-1'] })], [ec])
    expect(r.byDeviceId.get('i')).toMatchObject({ ec, ecMatchedBy: 'hostname', ambiguousName: false })
    expect(r.byDeviceId.get('i')!.patch).toBeDefined()
    expect(r.unmatchedEc).toHaveLength(0)
  })

  it('refuses names shared within one source, but MAC still matches', () => {
    const a = dev({ id: 'a', deviceName: 'DUP', macAddress: 'AA:00:00:00:00:01' })
    const b = dev({ id: 'b', deviceName: 'DUP', macAddress: 'AA:00:00:00:00:02' })
    const ec = dev({ id: 'ec-1', deviceName: 'dup', managementSource: 'ManageEngine', macAddress: 'aa0000000002' })
    const r = reconcileDevices([a, b], [sys({ names: ['DUP'] })], [ec])
    expect(r.byDeviceId.get('a')).toMatchObject({ ambiguousName: true })
    expect(r.byDeviceId.get('a')!.ec).toBeUndefined()
    expect(r.byDeviceId.get('a')!.patch).toBeUndefined()
    expect(r.byDeviceId.get('b')).toMatchObject({ ecMatchedBy: 'mac' })
  })

  it('reports agent rows and patch systems that match nothing', () => {
    const r = reconcileDevices([dev({ id: 'i', deviceName: 'one' })], [sys({ names: ['ghost'], platform: 'Mac' })], [dev({ id: 'ec-5', deviceName: 'orphan', managementSource: 'ManageEngine' })])
    expect(r.unmatchedPatch.map(s => s.names[0])).toEqual(['ghost'])
    expect(r.unmatchedEc.map(e => e.deviceName)).toEqual(['orphan'])
  })
})

describe('buildDiagnostics', () => {
  it('summarises match keys and gaps without throwing when Patch Manager is not loaded', () => {
    const d = buildDiagnostics([dev({ id: 'i', deviceName: 'one' }), dev({ id: 'm', platform: 'macOS', managementSource: 'ManageEngine', serialNumber: 'C02ABC1234' })], null, [])
    expect(d.patch.loaded).toBe(false)
    expect(d.devices.byPlatform).toEqual({ Windows: 1, macOS: 1 })
    expect(d.patch.devicesWithoutPatchRow).toEqual({ Windows: 1, macOS: 1 })
  })
})
