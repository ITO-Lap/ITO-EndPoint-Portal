import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fetchBrewCaskLatest, fetchWingetLatest, wingetManifestPath, clearLatestVersionCache } from '../latestVersion.js'

const NOW = () => Date.parse('2026-10-12T10:00:00Z')
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const text = (body: string, status = 200) => new Response(body, { status })

beforeEach(() => clearLatestVersionCache())

describe('fetchBrewCaskLatest', () => {
  it('returns the cask version with provenance and the auto-update flag', async () => {
    const f = vi.fn().mockResolvedValue(json({ token: 'google-chrome', version: '155.0.8059.40', auto_updates: true }))
    const r = await fetchBrewCaskLatest('google-chrome', { fetchImpl: f as unknown as typeof fetch, now: NOW })
    expect(r).toMatchObject({ ok: true, value: { version: '155.0.8059.40', selfUpdating: true, versionSource: 'Homebrew cask API (google-chrome)', lastCheckedAt: '2026-10-12T10:00:00.000Z' } })
    expect(String(f.mock.calls[0]![0])).toBe('https://formulae.brew.sh/api/cask/google-chrome.json')
  })
  it('drops Homebrew build/hash suffixes after a comma', async () => {
    const f = vi.fn().mockResolvedValue(json({ version: '155.0.4283.45,6b10bfa6-9f61-4b45-8508-31f5cdc70657' }))
    const r = await fetchBrewCaskLatest('microsoft-edge', { fetchImpl: f as unknown as typeof fetch, now: NOW })
    expect(r).toMatchObject({ ok: true, value: { version: '155.0.4283.45' } })
  })
  it('reports unavailable for 404, disabled casks, unparsable versions and network errors', async () => {
    const run = async (resp: () => Promise<Response>, token = 't') => (await fetchBrewCaskLatest(token, { fetchImpl: vi.fn(resp) as unknown as typeof fetch, now: NOW })) as { ok: false; value: { reason: string } }
    expect((await run(async () => json({}, 404), 'a')).value.reason).toMatch(/no cask named/)
    expect((await run(async () => json({ version: '1.0', disabled: true }), 'b')).value.reason).toMatch(/disabled/)
    expect((await run(async () => json({ version: 'latest' }), 'c')).value.reason).toMatch(/no parsable version/)
    expect((await run(async () => { throw new Error('ECONNRESET') }, 'd')).value.reason).toMatch(/unreachable/)
  })
  it('rejects malformed tokens without any network call', async () => {
    const f = vi.fn()
    const r = await fetchBrewCaskLatest('../etc/passwd', { fetchImpl: f as unknown as typeof fetch, now: NOW })
    expect(r.ok).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })
  it('caches successes', async () => {
    const f = vi.fn().mockImplementation(async () => json({ version: '1.2.3' }))
    await fetchBrewCaskLatest('x', { fetchImpl: f as unknown as typeof fetch, now: NOW })
    await fetchBrewCaskLatest('x', { fetchImpl: f as unknown as typeof fetch, now: NOW })
    expect(f).toHaveBeenCalledTimes(1)
  })
})

describe('wingetManifestPath', () => {
  it('builds winget-pkgs paths', () => {
    expect(wingetManifestPath('Google.Chrome')).toBe('manifests/g/Google/Chrome')
    expect(wingetManifestPath('Microsoft.VisualStudioCode')).toBe('manifests/m/Microsoft/VisualStudioCode')
    expect(wingetManifestPath('Notepad++.Notepad++')).toBe('manifests/n/Notepad%2B%2B/Notepad%2B%2B')
    expect(wingetManifestPath('7zip.7zip')).toBe('manifests/7/7zip/7zip')
  })
  it('rejects ids that could escape the path', () => {
    expect(wingetManifestPath('../x.y')).toBeNull()
    expect(wingetManifestPath('nodot')).toBeNull()
    expect(wingetManifestPath('a/b.c')).toBeNull()
  })
})

describe('fetchWingetLatest', () => {
  const listing = [{ name: '154.0.1', type: 'dir' }, { name: '155.0.8059.40', type: 'dir' }, { name: '99.0', type: 'dir' }, { name: 'Beta', type: 'dir' }, { name: 'readme.md', type: 'file' }]
  const ok = (declared = '155.0.8059.40') => vi.fn().mockImplementation(async (url: string) =>
    String(url).startsWith('https://api.github.com') ? json(listing) : text(`PackageIdentifier: Google.Chrome\nPackageVersion: ${declared}\nDefaultLocale: en-US\n`))

  it('picks the highest numeric version directory and confirms it against the manifest', async () => {
    const r = await fetchWingetLatest('Google.Chrome', { fetchImpl: ok() as unknown as typeof fetch, now: NOW })
    expect(r).toMatchObject({ ok: true, value: { version: '155.0.8059.40', versionSource: 'Microsoft winget-pkgs manifest (Google.Chrome)' } })
  })
  it('does not trust a directory whose manifest declares a different version', async () => {
    const r = await fetchWingetLatest('Google.Chrome', { fetchImpl: ok('1.0.0') as unknown as typeof fetch, now: NOW }) as { ok: false; value: { reason: string } }
    expect(r.ok).toBe(false)
    expect(r.value.reason).toMatch(/does not match/)
  })
  it('reports unavailable on a GitHub rate limit, a missing package, or an unreadable manifest', async () => {
    const run = async (id: string, status: number, rawStatus = 200) => (await fetchWingetLatest(id, { now: NOW, fetchImpl: vi.fn().mockImplementation(async (u: string) => String(u).startsWith('https://api.github.com') ? (status === 200 ? json(listing) : json({}, status)) : text('PackageVersion: 155.0.8059.40', rawStatus)) as unknown as typeof fetch })) as { ok: false; value: { reason: string } }
    expect((await run('A.One', 403)).value.reason).toMatch(/rate limit/)
    expect((await run('A.Two', 404)).value.reason).toMatch(/No winget-pkgs manifest/)
    expect((await run('A.Three', 200, 404)).value.reason).toMatch(/could not be verified/)
  })
  it('sends the GitHub token only to api.github.com and never in the result', async () => {
    const f = ok()
    const r = await fetchWingetLatest('Google.Chrome', { fetchImpl: f as unknown as typeof fetch, now: NOW, githubToken: 'ghp_SECRET' })
    const headersFor = (i: number) => (f.mock.calls[i]![1] as { headers: Record<string, string> }).headers
    expect(headersFor(0).Authorization).toBe('Bearer ghp_SECRET')
    expect(headersFor(1).Authorization).toBeUndefined()
    expect(JSON.stringify(r)).not.toContain('ghp_SECRET')
  })
})

describe('isStableVersion', () => {
  it('rejects pre-release versions and accepts normal ones', async () => {
    const { isStableVersion } = await import('../latestVersion.js')
    expect(isStableVersion('2.0.0-beta.1')).toBe(false)
    expect(isStableVersion('1.2.3-rc1')).toBe(false)
    expect(isStableVersion('1.9.4')).toBe(true)
  })
})
