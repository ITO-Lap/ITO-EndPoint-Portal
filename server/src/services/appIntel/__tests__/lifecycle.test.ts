import { describe, it, expect, vi } from 'vitest'
import { assessApp } from '../decision.js'
import { buildLifecycle, ringLabelFromGroupName, ringOf, ownerOf, packagingOf } from '../lifecycle.js'
import type { AssignmentIndexFull } from '../lifecycle.js'
import { cpeFor, cpeVersion, createCveStore, fetchNvdCves, parseNvdCve, versionsToCheck } from '../cve.js'
import { parseWingetReleaseNotes, fetchWingetLatest, fetchBrewCaskLatest, clearLatestVersionCache } from '../latestVersion.js'
import type { LatestResult } from '../latestVersion.js'
import type { AppRecord, AssessedApp, DeployedPackage } from '../types.js'

const NOW = '2026-10-20T06:00:00.000Z'
const ctx = { providerAsOf: { intune: NOW }, packagesReadable: true, nowIso: NOW }
const latest = (version: string): LatestResult => ({ ok: true, value: { version, versionSource: 'Microsoft winget-pkgs manifest (VideoLAN.VLC)', sourceUrl: 'https://example.test/m.yaml', lastCheckedAt: NOW, selfUpdating: false } })

const rec = (over: Partial<AppRecord> = {}): AppRecord => ({
  key: 'k1', platform: 'windows',
  identity: { publisher: 'VideoLAN', displayName: 'VLC media player', bundleId: null, productCode: null, wingetId: 'VideoLAN.VLC', brewToken: null },
  installed: [{ version: '3.0.16', deviceCount: 30, provider: 'intune' }, { version: '3.0.20', deviceCount: 10, provider: 'intune' }, { version: '3.0.21', deviceCount: 60, provider: 'intune' }],
  packages: [], confidence: 'high', confidenceReason: 'winget id', providers: ['intune'], nativeHint: null, nativeReason: null,
  installSource: 'custom', installSourceBasis: 'wingetId', installSourceReason: 't', ...over,
})
const pkg = (over: Partial<DeployedPackage> = {}): DeployedPackage => ({
  provider: 'intune', packageId: 'p1', displayName: 'VLC', publisher: 'VideoLAN', owner: 'Endpoint Team', version: '3.0.18', versionSource: 'Intune',
  matchBasis: 'wingetId', wingetId: 'VideoLAN.VLC', odataType: 'win32LobApp', lastModifiedAt: '2026-09-01T00:00:00Z', ...over,
})
const assess = (r: AppRecord, l = '3.0.21'): AssessedApp => assessApp(r, latest(l), ctx)

describe('owner', () => {
  it('uses the Intune package owner and never falls back to the publisher', () => {
    expect(ownerOf(assess(rec({ packages: [pkg()] })))).toMatchObject({ name: 'Endpoint Team', source: 'Intune package owner field' })
    const none = ownerOf(assess(rec({ packages: [pkg({ owner: null })] })))
    expect(none.name).toBeNull()
    expect(ownerOf(assess(rec())).name).toBeNull()
    expect(JSON.stringify(ownerOf(assess(rec())))).toMatch(/vendor, not an internal owner/)
  })
  it('flags disagreeing owners', () => {
    const o = ownerOf(assess(rec({ packages: [pkg(), pkg({ packageId: 'p2', owner: 'Desktop Team' })] })))
    expect(o.all).toEqual(['Endpoint Team', 'Desktop Team'])
    expect(o.note).toMatch(/different owners/)
  })
})

describe('deployment ring', () => {
  it('reads ring labels from common group-name conventions', () => {
    expect(ringLabelFromGroupName('SG-Pilot-Devices')?.text).toBe('Pilot')
    expect(ringLabelFromGroupName('Win Ring 2 Users')?.text).toBe('Ring 2')
    expect(ringLabelFromGroupName('All Staff Production')?.text).toBe('Broad')
    expect(ringLabelFromGroupName('Finance Team')).toBeNull()
  })
  it('orders stages Pilot → Ring N → Broad and marks group-name rings as inferred', () => {
    const app = assess(rec({ packages: [pkg()] }))
    const idx: AssignmentIndexFull = { p1: [
      { intent: 'required', target: 'group', groupId: 'g1', groupName: 'Broad Production' },
      { intent: 'required', target: 'group', groupId: 'g2', groupName: 'Ring 1' },
      { intent: 'required', target: 'group', groupId: 'g3', groupName: 'IT Pilot' },
      { intent: 'required', target: 'exclusionGroup', groupId: 'g4', groupName: 'Pilot Excluded' },
    ] }
    const r = ringOf(app, idx)
    expect(r).toMatchObject({ ring: 'Pilot → Ring 1 → Broad', basis: 'group-name' })
    expect(r.note).toMatch(/inferred/)
    expect(r.targets).toHaveLength(3) // exclusion groups are not a rollout stage
  })
  it('reads All devices / All users directly, and says so when nothing is identifiable', () => {
    const app = assess(rec({ packages: [pkg()] }))
    expect(ringOf(app, { p1: [{ intent: 'required', target: 'allDevices' }] })).toMatchObject({ ring: 'All devices', basis: 'assignment-target' })
    expect(ringOf(app, { p1: [{ intent: 'required', target: 'group', groupId: 'g', groupName: 'Finance' }] }).ring).toBeNull()
    expect(ringOf(app, { p1: [{ intent: 'required', target: 'group', groupId: 'g' }] }).note).toMatch(/Group.Read.All/)
    expect(ringOf(app, { p1: 'unavailable' }).note).toMatch(/could not be read/)
    expect(ringOf(assess(rec()), {}).ring).toBeNull()
  })
})

describe('packaging state and impact', () => {
  it('compares the deployed package with the verified latest', () => {
    expect(packagingOf(assess(rec({ packages: [pkg({ version: '3.0.18' })] })), true).state).toBe('behind')
    expect(packagingOf(assess(rec({ packages: [pkg({ version: '3.0.21' })] })), true).state).toBe('current')
    expect(packagingOf(assess(rec()), true).state).toBe('no-package')
    expect(packagingOf(assess(rec()), false).state).toBe('unknown')
    expect(packagingOf(assess(rec({ packages: [pkg({ version: null })] })), true).state).toBe('unknown')
  })
  it('estimates impacted devices with a per-version breakdown and an honest basis', () => {
    const lc = buildLifecycle(assess(rec()), {}, true)
    expect(lc.impact).toMatchObject({ devicesBehind: 40, totalDevices: 100, percentBehind: 40 })
    expect(lc.impact.byVersion.map(v => v.version)).toEqual(['3.0.16', '3.0.20'])
    expect(lc.impact.basis).toMatch(/Estimate/)
  })
})

describe('CVE lookups (NVD)', () => {
  const nvd = (cves: unknown[], total = cves.length) => new Response(JSON.stringify({ totalResults: total, vulnerabilities: cves.map(cve => ({ cve })) }), { status: 200 })
  const cve = (id: string, sev: string, extra: object = {}) => ({ id, published: '2023-01-01T00:00:00', descriptions: [{ lang: 'en', value: `${id} issue` }], metrics: { cvssMetricV31: [{ type: 'Primary', cvssData: { baseScore: 9.8, baseSeverity: sev } }] }, ...extra })

  it('maps only catalog apps with a verified CPE and normalises versions for NVD', () => {
    expect(cpeFor(assess(rec()))).toEqual({ vendor: 'videolan', product: 'vlc_media_player' })
    expect(cpeFor(assess(rec({ identity: { publisher: 'Slack', displayName: 'Slack', bundleId: null, productCode: null, wingetId: 'SlackTechnologies.Slack', brewToken: null } })))).toBeNull()
    expect(cpeVersion('2.43.0.windows.1')).toBe('2.43.0')
    expect(cpeVersion('latest')).toBeNull()
  })
  it('checks only the most-installed versions older than the latest verified one', () => {
    expect(versionsToCheck(assess(rec())).versions.map(v => v.version)).toEqual(['3.0.16', '3.0.20'])
  })
  it('parses severity, score, KEV flag and links, and rejects malformed ids', () => {
    expect(parseNvdCve(cve('CVE-2023-47359', 'CRITICAL', { cisaExploitAdd: '2024-01-01' }))).toMatchObject({ severity: 'CRITICAL', score: 9.8, knownExploited: true, url: 'https://nvd.nist.gov/vuln/detail/CVE-2023-47359' })
    expect(parseNvdCve({ id: 'not-a-cve' })).toBeNull()
    expect(parseNvdCve({ id: 'CVE-2020-0001' })).toMatchObject({ severity: 'UNKNOWN', score: null })
  })
  it('queries NVD with a cpeName per installed version and aggregates unique CVEs, exposure and counts', async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      const u = decodeURIComponent(String(url))
      return u.includes(':3.0.16:') ? nvd([cve('CVE-2023-0001', 'CRITICAL', { cisaExploitAdd: 'x' }), cve('CVE-2023-0002', 'HIGH')]) : nvd([cve('CVE-2023-0002', 'HIGH')])
    })
    const store = createCveStore({ fetchImpl: f as unknown as typeof fetch, sleep: async () => {}, now: () => Date.parse(NOW), cacheFile: null })
    const app = assess(rec())
    expect(store.forApp(app).state).toBe('pending')
    store.scheduleFor([app]); await store.idle()
    const r = store.forApp(app)
    expect(f).toHaveBeenCalledTimes(2)
    expect(decodeURIComponent(String(f.mock.calls[0]![0]))).toContain('cpeName=cpe:2.3:a:videolan:vlc_media_player:3.0.16:*:*:*:*:*:*:*')
    expect(r).toMatchObject({ state: 'ok', highestSeverity: 'CRITICAL', exposedDevices: 40, counts: { total: 2, critical: 1, high: 1, knownExploited: 1 } })
    expect(r.cves[0]).toMatchObject({ id: 'CVE-2023-0001', knownExploited: true, versions: ['3.0.16'] })
    expect(r.cves.find(c => c.id === 'CVE-2023-0002')!.versions).toEqual(['3.0.16', '3.0.20'])
    store.scheduleFor([app]); await store.idle()
    expect(f).toHaveBeenCalledTimes(2) // fresh cache: no repeat calls
  })
  it('never reports "clean" for an unmapped app or a failed lookup', async () => {
    const slack = assess(rec({ identity: { publisher: 'Slack', displayName: 'Slack', bundleId: null, productCode: null, wingetId: 'SlackTechnologies.Slack', brewToken: null } }))
    const store = createCveStore({ fetchImpl: (async () => new Response('', { status: 429 })) as unknown as typeof fetch, sleep: async () => {}, cacheFile: null })
    expect(store.forApp(slack)).toMatchObject({ state: 'unmapped', counts: { total: 0 } })
    expect(store.forApp(slack).reason).toMatch(/not "clean"/)
    const vlc = assess(rec())
    store.scheduleFor([vlc]); await store.idle()
    const r = store.forApp(vlc)
    expect(r.state).toBe('unavailable')
    expect(r.reason).toMatch(/rate limit/)
    expect(r.counts.total).toBe(0)
  })
  it('reports an up-to-date app as nothing to check, and surfaces an NVD error status', async () => {
    const ok = createCveStore({ cacheFile: null }).forApp(assess(rec({ installed: [{ version: '3.0.21', deviceCount: 5, provider: 'intune' }] })))
    expect(ok).toMatchObject({ state: 'ok', reason: expect.stringMatching(/No installed version is older/) })
    expect(await fetchNvdCves({ vendor: 'a', product: 'b' }, '1.0', { fetchImpl: (async () => new Response('', { status: 503 })) as unknown as typeof fetch })).toEqual({ ok: false, reason: 'NVD returned HTTP 503' })
  })
})

describe('release notes', () => {
  const locale = `PackageIdentifier: VideoLAN.VLC\nShortDescription: x\nReleaseNotes: |-\n  Decoders:\n   * Fix Opus\n\n  Video:\n   * Fix ASS\nReleaseNotesUrl: https://www.videolan.org/vlc/releases/3.0.21.html\nInstallers:\n- a: b\n`
  it('parses block-scalar notes and a validated URL', () => {
    const r = parseWingetReleaseNotes(locale)
    expect(r.url).toBe('https://www.videolan.org/vlc/releases/3.0.21.html')
    expect(r.summary).toContain('Fix Opus')
    expect(r.summary).not.toContain('Installers')
    expect(parseWingetReleaseNotes('ReleaseNotesUrl: javascript:alert(1)\n').url).toBeNull()
    expect(parseWingetReleaseNotes('PackageName: x\n')).toEqual({ summary: null, url: null })
  })
  it('attaches release notes to the verified winget version and degrades gracefully when absent', async () => {
    clearLatestVersionCache()
    const version = 'PackageIdentifier: VideoLAN.VLC\nPackageVersion: 3.0.21\nDefaultLocale: en-US\n'
    const f = vi.fn(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('api.github.com')) return new Response(JSON.stringify([{ name: '3.0.21', type: 'dir' }]), { status: 200 })
      if (u.endsWith('.locale.en-US.yaml')) return new Response(locale, { status: 200 })
      return new Response(version, { status: 200 })
    })
    const r = await fetchWingetLatest('VideoLAN.VLC', { fetchImpl: f as unknown as typeof fetch, now: () => Date.parse(NOW) })
    expect(r).toMatchObject({ ok: true, value: { version: '3.0.21', releaseNotes: { url: 'https://www.videolan.org/vlc/releases/3.0.21.html', unavailableReason: null } } })
    clearLatestVersionCache()
    const g = vi.fn(async (url: string | URL | Request) => String(url).includes('api.github.com') ? new Response(JSON.stringify([{ name: '3.0.21', type: 'dir' }]), { status: 200 }) : String(url).includes('.locale.') ? new Response('', { status: 404 }) : new Response(version, { status: 200 }))
    const r2 = await fetchWingetLatest('VideoLAN.VLC', { fetchImpl: g as unknown as typeof fetch, now: () => Date.parse(NOW) })
    expect(r2).toMatchObject({ ok: true, value: { version: '3.0.21', releaseNotes: { summary: null, url: null, unavailableReason: expect.stringMatching(/not readable/) } } })
  })
  it('says Homebrew publishes no release notes and offers only the vendor site', async () => {
    clearLatestVersionCache()
    const f = vi.fn(async () => new Response(JSON.stringify({ version: '1.2.3', homepage: 'https://www.videolan.org/' }), { status: 200 }))
    const r = await fetchBrewCaskLatest('vlc', { fetchImpl: f as unknown as typeof fetch, now: () => Date.parse(NOW) })
    expect(r).toMatchObject({ ok: true, value: { releaseNotes: { summary: null, url: null, vendorUrl: 'https://www.videolan.org/', unavailableReason: 'Homebrew does not publish release notes' } } })
  })
})
