import { describe, it, expect } from 'vitest'
import { computeExposure, daysUntil, band } from '../windowsExposure.js'
import type { MsrcMonthView, MsrcCveView } from '../windowsSecurityIntel.js'

const now = new Date('2026-11-06T10:00:00Z')
const cve = (o: Partial<MsrcCveView>): MsrcCveView => ({ cve: 'CVE-2026-0001', title: 't', impact: 'RCE', severity: 'Important', cvss: 7, exploited: false, disclosed: false, exploitability: '', kbs: ['KB111111'], kev: false, kevDueDate: null, ransomware: false, risk: 0, ...o })
const month = (cves: MsrcCveView[]): MsrcMonthView => ({
  id: '2026-Oct', title: 'Oct', releasedAt: '', totals: { cves: cves.length, critical: 0, important: 0, exploited: 0, publiclyDisclosed: 0, exploitationMoreLikely: 0, inKev: 0 },
  byImpact: [], topCves: cves, builds: [], kbIndex: { KB111111: { cves: 1, critical: 0, exploited: 0 }, KB222222: { cves: 3, critical: 1, exploited: 1 } },
})
const row = (device: string, kb: string, o: Record<string, unknown> = {}) => ({ device, kind: 'Security update' as const, kb, cves: '', daysMissing: 10 as number | '', ...o })
const base = { kev: [], lifecycle: [], deviceBuilds: new Map<string, number>(), targetBuild: 26200, now }

describe('daysUntil / band', () => {
  it('counts calendar days and goes negative once passed', () => {
    expect(daysUntil('2026-11-09', now)).toBe(3)
    expect(daysUntil('2026-11-05', now)).toBe(-1)
    expect(daysUntil('bad', now)).toBeNaN()
  })
  it('bands scores', () => { expect([band(80), band(50), band(25), band(5)]).toEqual(['Critical', 'High', 'Medium', 'Low']) })
})

describe('computeExposure', () => {
  it('ranks a device missing a KEV-exploited fix above one missing only routine fixes', () => {
    const m = month([cve({ cve: 'CVE-2026-0001' }), cve({ cve: 'CVE-2026-0002', kbs: ['KB222222'], exploited: true, kev: true, kevDueDate: '2026-11-20', severity: 'Critical' })])
    const r = computeExposure({ ...base, months: [m], rows: [row('A', 'KB111111'), row('B', 'KB222222')] })
    expect(r.devices.map(d => d.device)).toEqual(['B', 'A'])
    expect(r.devices[0]!.exploitedCves).toEqual(['CVE-2026-0002'])
    expect(r.devices[0]!.score).toBeGreaterThan(r.devices[1]!.score)
    expect(r.devices[0]!.reasons[0]!.label).toMatch(/exploited/)
  })
  it('builds a KEV clock only for CVEs that touch the fleet, with overdue first', () => {
    const m = month([cve({ cve: 'CVE-2026-0002', kbs: ['KB222222'], kev: true, exploited: true, kevDueDate: '2026-11-01' }), cve({ cve: 'CVE-2026-0003', kbs: ['KB999999'], kev: true, kevDueDate: '2026-11-02' })])
    const r = computeExposure({ ...base, months: [m], rows: [row('A', 'KB222222'), row('B', 'KB222222')] })
    expect(r.kevClock).toHaveLength(1)
    expect(r.kevClock[0]).toMatchObject({ cve: 'CVE-2026-0002', status: 'overdue', devices: 2, daysLeft: -5 })
    expect(r.devices[0]!.reasons.some(x => /overdue/.test(x.label))).toBe(true)
  })
  it('classifies due-soon vs on-track', () => {
    const m = month([cve({ cve: 'CVE-2026-0002', kbs: ['KB222222'], kev: true, kevDueDate: '2026-11-10' }), cve({ cve: 'CVE-2026-0004', kbs: ['KB222222'], kev: true, kevDueDate: '2026-12-30' })])
    const r = computeExposure({ ...base, months: [m], rows: [row('A', 'KB222222')] })
    expect(r.kevClock.map(k => k.status)).toEqual(['due-soon', 'on-track'])
  })
  it('penalises unsupported builds and uses EPSS only when provided', () => {
    const life = [{ version: '22H2', build: 19045, releaseDate: '', endOfServicing: [], latestBuild: '', status: 'ended' as const, daysToEnd: -100 }]
    const m = month([cve({})])
    const rows = [row('A', 'KB111111', { cves: 'CVE-2026-0001' })]
    const without = computeExposure({ ...base, months: [m], rows, lifecycle: life, deviceBuilds: new Map([['a', 19045]]) })
    const withEpss = computeExposure({ ...base, months: [m], rows, lifecycle: life, deviceBuilds: new Map([['a', 19045]]), epss: { 'CVE-2026-0001': { score: 0.9 } } })
    expect(without.devices[0]!.reasons.some(r => /out of support/.test(r.label))).toBe(true)
    expect(without.epssUsed).toBe(false)
    expect(withEpss.epssUsed).toBe(true)
    expect(withEpss.devices[0]!.score).toBeGreaterThan(without.devices[0]!.score)
  })
  it('works with no MSRC data and caps the score at 100', () => {
    const r = computeExposure({ ...base, months: [null, undefined], rows: [row('A', 'KB1', { daysMissing: 400 })] })
    expect(r.devices[0]!.score).toBeLessThanOrEqual(100)
    expect(r.kevClock).toEqual([])
    expect(r.coverage.cvesKnown).toBe(0)
  })
})
