import { afterEach, describe, expect, it } from 'vitest'
import { getMacAdminAccess, parseReport, reportKeyValid, reportingEnabled, saveReport } from '../macAdminAccess.js'

const good = { serial: 'c02abc123xyz', user: 'jdoe', hostname: 'JDOE-MBP', status: 'admin' }

describe('parseReport', () => {
  it('accepts a valid admin or standard report and upper-cases the serial', () => {
    expect(parseReport(good)).toEqual({ serialNumber: 'C02ABC123XYZ', hostname: 'JDOE-MBP', loggedOnUser: 'jdoe', isAdmin: true })
    expect(parseReport({ ...good, status: 'Standard' })?.isAdmin).toBe(false)
  })
  it('rejects malformed input, unknown status and non-user console accounts', () => {
    for (const bad of [null, 'x', {}, { ...good, serial: 'x' }, { ...good, serial: 'ABC; rm -rf' }, { ...good, user: '' }, { ...good, user: 'a|b' },
      { ...good, status: 'unknown' }, { ...good, user: 'root' }, { ...good, user: 'loginwindow' }, { ...good, hostname: '<script>' }]) {
      expect(parseReport(bad)).toBeNull()
    }
  })
})

describe('report key', () => {
  afterEach(() => { delete process.env['MAC_ADMIN_REPORT_KEY'] })
  it('is disabled until a 16+ character key is configured, then compares exactly', () => {
    expect(reportingEnabled()).toBe(false)
    expect(reportKeyValid('anything-at-all-1234')).toBe(false)
    process.env['MAC_ADMIN_REPORT_KEY'] = 'short'
    expect(reportingEnabled()).toBe(false)
    process.env['MAC_ADMIN_REPORT_KEY'] = 'correct-horse-battery'
    expect(reportKeyValid('correct-horse-battery')).toBe(true)
    expect(reportKeyValid('correct-horse-batterz')).toBe(false)
    expect(reportKeyValid('correct-horse')).toBe(false)
    expect(reportKeyValid(undefined)).toBe(false)
  })
})

describe('store', () => {
  it('keeps the latest report per serial, lists fresh admins only, and counts old reports as stale', () => {
    const now = new Date('2026-11-10T00:00:00Z')
    saveReport({ serialNumber: 'AAAA111111', hostname: 'B-MAC', loggedOnUser: 'bob', isAdmin: true }, new Date('2026-11-09T00:00:00Z'))
    saveReport({ serialNumber: 'BBBB222222', hostname: 'A-MAC', loggedOnUser: 'amy', isAdmin: false }, new Date('2026-11-09T00:00:00Z'))
    saveReport({ serialNumber: 'CCCC333333', hostname: 'C-MAC', loggedOnUser: 'cat', isAdmin: true }, new Date('2026-09-01T00:00:00Z'))
    saveReport({ serialNumber: 'AAAA111111', hostname: 'B-MAC', loggedOnUser: 'bob2', isAdmin: true }, new Date('2026-11-09T12:00:00Z'))
    const r = getMacAdminAccess(now.getTime())
    expect(r.admins.map(a => a.loggedOnUser)).toEqual(['bob2'])
    expect(r).toMatchObject({ reporting: 2, stale: 1 })
  })
})
