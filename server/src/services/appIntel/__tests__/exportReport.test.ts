import { describe, it, expect } from 'vitest'
import { sanitizeCell, toCsv, deviceStatus, inventoryRows } from '../exportReport.js'
import type { AssessedApp } from '../types.js'

describe('sanitizeCell', () => {
  it('prefixes formula starters and leaves normal text alone', () => {
    for (const v of ['=1+1', '+SUM(A1)', '-2', '@cmd', '\tx']) expect(sanitizeCell(v).startsWith("'")).toBe(true)
    expect(sanitizeCell('Zoom 5.0')).toBe('Zoom 5.0')
    expect(sanitizeCell(null)).toBe('')
  })
})

describe('toCsv', () => {
  it('quotes, escapes quotes, keeps Unicode and is formula-safe', () => {
    const csv = toCsv([{ a: 'He said "hi", ok', b: '=HYPERLINK("x")', c: 'Müller 日本' }], [{ key: 'a', label: 'A', width: 1 }, { key: 'b', label: 'B', width: 1 }, { key: 'c', label: 'C', width: 1 }])
    expect(csv).toContain('"He said ""hi"", ok"')
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
    expect(csv).toContain('Müller 日本')
  })
})

describe('deviceStatus', () => {
  it('never treats missing or unparseable data as up to date', () => {
    expect(deviceStatus('5.0.0', '6.1.0')).toBe('Update required')
    expect(deviceStatus('6.1.0', '6.1.0')).toBe('Up to date')
    expect(deviceStatus('5.0.0', null)).toContain('Unknown')
    expect(deviceStatus('banana', '6.1.0')).toContain('Unknown')
  })
})

describe('inventoryRows', () => {
  it('lists versions with device counts and only https links', () => {
    const app = { identity: { displayName: 'Zoom', publisher: 'Zoom' }, platform: 'windows', providers: ['intune'], installed: [{ version: '5.1', deviceCount: 8, provider: 'intune' }, { version: '5.2', deviceCount: 42, provider: 'intune' }], latest: { version: '6.0', versionSource: 's', sourceUrl: 'javascript:alert(1)' }, totalDevices: 50, affectedDevices: 50, status: 'Package required', lastCheckedAt: null } as unknown as AssessedApp
    const [row] = inventoryRows([app])
    expect(row!['installed']).toBe('5.2 (42 devices); 5.1 (8 devices)')
    expect(row!['sourceUrl']).toBe('Unavailable')
    expect(row!['devices']).toBe(50)
  })
})
