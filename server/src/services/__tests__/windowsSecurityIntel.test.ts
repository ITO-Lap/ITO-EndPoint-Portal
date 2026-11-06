import { describe, it, expect } from 'vitest'
import { buildLifecycle, buildMonthView, extractMonthCore, nextRelease, type KevEntry } from '../windowsSecurityIntel.js'
import { summarizeTopUpdates } from '../windowsUpdateFleet.js'
import type { WindowsUpdateReportRow } from '../windowsUpdateReport.js'

const doc = {
  DocumentTitle: { Value: 'October 2026 Security Updates' },
  DocumentTracking: { InitialReleaseDate: '2026-10-13T07:00:00', CurrentReleaseDate: '2026-10-20T00:00:00' },
  ProductTree: { FullProductName: [
    { ProductID: '100', Value: 'Windows 11 Version 25H2 for x64-based Systems' },
    { ProductID: '200', Value: 'Microsoft Edge (Chromium-based)' },
  ] },
  Vulnerability: [
    { CVE: 'CVE-2026-0001', Title: { Value: 'Win Shell Bypass' },
      Threats: [{ Type: 3, Description: { Value: 'Important' } }, { Type: 0, Description: { Value: 'Security Feature Bypass' } }, { Type: 1, Description: { Value: 'Publicly Disclosed:No;Exploited:Yes;Latest Software Release:Exploitation Detected' } }],
      ProductStatuses: [{ Type: 3, ProductID: ['5-100'] }], CVSSScoreSets: [{ BaseScore: 8.8 }],
      Remediations: [{ Type: 2, SubType: 'Security Update', FixedBuild: '10.0.26200.1', ProductID: ['100'], Description: { Value: '5126868' } }] },
    { CVE: 'CVE-2026-0002', Title: { Value: 'Edge only' }, Threats: [{ Type: 3, Description: { Value: 'Critical' } }], ProductStatuses: [{ Type: 3, ProductID: ['5-200'] }] },
    { CVE: 'ADV260001', Title: { Value: 'Advisory' }, ProductStatuses: [{ Type: 3, ProductID: ['5-100'] }] },
  ],
}
const kev = new Map<string, KevEntry>([['CVE-2026-0001', { cve: 'CVE-2026-0001', name: '', product: 'Windows', dateAdded: '2026-10-13', dueDate: '2026-11-03', ransomware: true, action: '' }]])

describe('extractMonthCore / buildMonthView', () => {
  const core = extractMonthCore('2026-Oct', doc)
  it('keeps only Windows client CVEs (no Edge-only CVEs or advisories)', () => {
    expect(core.cves.map(c => c.cve)).toEqual(['CVE-2026-0001'])
  })
  it('reads severity, impact, exploitation, CVSS, KB and fixed build', () => {
    expect(core.cves[0]).toMatchObject({ severity: 'Important', impact: 'Security Feature Bypass', exploited: true, disclosed: false, exploitability: 'Exploitation Detected', cvss: 8.8, kbs: ['KB5126868'] })
    expect(core.builds).toEqual([{ product: 'Windows 11 Version 25H2 for x64-based Systems', kb: 'KB5126868', fixedBuild: '10.0.26200.1' }])
  })
  it('flags CISA KEV matches and ranks them first', () => {
    const view = buildMonthView(core, kev)
    expect(view.totals).toMatchObject({ cves: 1, exploited: 1, inKev: 1 })
    expect(view.topCves[0]).toMatchObject({ kev: true, ransomware: true, kevDueDate: '2026-11-03' })
    expect(view.kbIndex['KB5126868']).toEqual({ cves: 1, critical: 0, exploited: 1 })
  })
})

describe('nextRelease', () => {
  it('finds the next 2nd Tuesday (Patch Tuesday), including today', () => {
    expect(nextRelease(new Date('2026-11-06T10:00:00Z'), 2)).toEqual({ date: '2026-11-10', daysAway: 4 })
    expect(nextRelease(new Date('2026-11-10T23:00:00Z'), 2)).toEqual({ date: '2026-11-10', daysAway: 0 })
    expect(nextRelease(new Date('2026-11-11T00:00:00Z'), 2)).toEqual({ date: '2026-12-08', daysAway: 27 })
  })
  it('finds the 4th Tuesday optional preview', () => {
    expect(nextRelease(new Date('2026-11-06T00:00:00Z'), 4)).toEqual({ date: '2026-11-24', daysAway: 18 })
  })
})

describe('buildLifecycle', () => {
  const raw = [
    { cycle: '11-25h2-e', releaseDate: '2025-09-30', eol: '2028-10-10', latest: '10.0.26200' },
    { cycle: '11-25h2-w', releaseDate: '2025-09-30', eol: '2027-10-12', latest: '10.0.26200' },
    { cycle: '11-23h2-w', releaseDate: '2023-10-31', eol: '2025-11-11', latest: '10.0.22631' },
    { cycle: '11-23h2-e', releaseDate: '2023-10-31', eol: '2026-11-10', latest: '10.0.22631' },
    { cycle: '11-24h2-iot-lts', releaseDate: '2024-10-01', eol: '2034-10-10', latest: '10.0.26100' },
  ]
  const rows = buildLifecycle(raw, new Date('2026-11-06T00:00:00Z'))
  it('merges editions, skips LTS/IoT and orders newest first', () => {
    expect(rows.map(r => r.version)).toEqual(['Windows 11 25H2', 'Windows 11 23H2'])
    expect(rows[0]!.endOfServicing.map(e => e.edition)).toEqual(['Home/Pro', 'Enterprise/Education'])
  })
  it('status follows the next end date still ahead', () => {
    expect(rows[0]).toMatchObject({ status: 'supported' })
    expect(rows[1]).toMatchObject({ status: 'ending-soon', daysToEnd: 4 })
  })
  it('returns [] for unexpected payloads', () => expect(buildLifecycle({ nope: 1 }, new Date())).toEqual([]))
})

describe('summarizeTopUpdates', () => {
  const row = (device: string, priority: WindowsUpdateReportRow['priority']): WindowsUpdateReportRow => ({
    priority, action: '', device, operatingSystem: '', kind: 'Security update', update: '2026-10 Cumulative Update', kb: 'KB5126868', severity: 'Critical',
    cves: 'CVE-2026-0001, CVE-2026-0002', releasedAt: '2026-10-13', daysMissing: 20, rebootRequired: 'Yes', lastScan: '',
  })
  it('groups by update, counts distinct devices and attaches MSRC counts', () => {
    const month = buildMonthView(extractMonthCore('2026-Oct', doc), kev)
    const out = summarizeTopUpdates([row('A', 'P1 Urgent'), row('B', 'P3 Normal'), row('A', 'P1 Urgent')], month)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ devices: 2, urgentDevices: 1, maxDaysMissing: 20, cves: ['CVE-2026-0001', 'CVE-2026-0002'], msrc: { cves: 1, critical: 0, exploited: 1 } })
  })
})
