import { describe, it, expect } from 'vitest'
import { isUserInstalledSoftware, toRawApp } from '../endpointCentralSoftware.js'

const app = (over: Record<string, unknown>) => ({ software_name: 'Zoom', sw_family: 1, location: '/Applications/zoom.us.app', ...over })

describe('isUserInstalledSoftware', () => {
  it('keeps every macOS app row so classification (not a pre-filter) decides visibility', () => {
    expect(isUserInstalledSoftware(app({}), 'macOS')).toBe(true)
    expect(isUserInstalledSoftware(app({ location: '/System/Applications/Safari.app' }), 'macOS')).toBe(true)
    expect(isUserInstalledSoftware(app({ location: '/Library/Application Support/X/Y.app' }), 'macOS')).toBe(true)
  })
  it('still drops macOS OS entries and updates, which are not apps', () => {
    expect(isUserInstalledSoftware(app({ sw_family: 2 }), 'macOS')).toBe(false)
    expect(isUserInstalledSoftware(app({ software_name: 'Update for Something (KB5034441)' }), 'macOS')).toBe(false)
  })
  it('drops Windows updates, Windows-folder items and runtime/agent noise but keeps normal apps', () => {
    const win = { sw_family: 1, location: 'C:\\Program Files\\App' }
    expect(isUserInstalledSoftware({ ...win, software_name: 'Google Chrome' }, 'Windows')).toBe(true)
    expect(isUserInstalledSoftware({ ...win, software_name: 'Update for Windows (KB5034441)' }, 'Windows')).toBe(false)
    expect(isUserInstalledSoftware({ ...win, software_name: 'Microsoft Visual C++ 2015-2022 Redistributable (x64)' }, 'Windows')).toBe(false)
    expect(isUserInstalledSoftware({ software_name: 'Thing', sw_family: 1, location: 'C:\\Windows\\System32' }, 'Windows')).toBe(false)
  })
})

describe('toRawApp', () => {
  it('prefers the bundle id and maps placeholder versions to Unknown', () => {
    expect(toRawApp({ software_name: 'Zoom', software_version: '-', 'invswtoosrel.app_identifier': 'us.zoom.xos' })).toEqual({ appId: 'us.zoom.xos', name: 'Zoom', version: 'Unknown' })
  })
})

describe('isServerOs', () => {
  it('flags Windows Server editions only', async () => {
    const { isServerOs } = await import('../endpointCentralSoftware.js')
    expect(isServerOs('Windows Server 2022 Standard Edition (x64)')).toBe(true)
    expect(isServerOs('Windows 11 Enterprise Edition (x64)')).toBe(false)
    expect(isServerOs(undefined)).toBe(false)
  })
})
