import { describe, it, expect } from 'vitest'
import { mapEcSystem, isEndpointCentralDeviceId } from '../endpointCentralDevices.js'

describe('mapEcSystem', () => {
  const base = { resource_id: 116819000000368080, resource_id_string: '116819000000368085', os_platform_name: 'Windows', resource_name: 'PC1', os_name: 'Windows 11 Enterprise Edition (x64)', owner_email_id: 'a@b.com', critical_patch_count: 2 }
  it('maps a Windows system using the exact string id', () => {
    const d = mapEcSystem(base)!
    expect(d.id).toBe('ec-116819000000368085')
    expect(isEndpointCentralDeviceId(d.id)).toBe(true)
    expect(d.platform).toBe('Windows')
    expect(d.complianceState).toBe('Non-Compliant')
  })
  it('skips Macs and rows without an id', () => {
    expect(mapEcSystem({ ...base, os_platform_name: 'Mac' })).toBeNull()
    expect(mapEcSystem({ os_platform_name: 'Windows' })).toBeNull()
  })
  it('treats "--" and missing counts as compliant', () => {
    expect(mapEcSystem({ ...base, critical_patch_count: '--' })!.complianceState).toBe('Compliant')
  })
})
