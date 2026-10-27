import { maxVersion, parseVersion, compareVersions } from './version.js'
import type { LatestUnavailable, LatestVerified, ReleaseNotes } from './types.js'

// Latest-version adapters. Each returns a result WITH provenance, or an explicit "unavailable"
// reason. Inventory (Intune / Endpoint Central) is never used to infer the latest version.
//  - macOS: Homebrew cask API (https://formulae.brew.sh/api/cask/<token>.json)
//  - Windows: Microsoft winget-pkgs manifests (directory listing via the GitHub API, then the raw
//    version manifest is read to confirm PackageVersion). Unauthenticated GitHub allows 60 req/h,
//    so results are cached; set GITHUB_TOKEN to raise the limit.

export type LatestResult = { ok: true; value: LatestVerified } | { ok: false; value: LatestUnavailable }

type FetchLike = typeof fetch
interface AdapterOptions { fetchImpl?: FetchLike; now?: () => number; githubToken?: string | undefined }

const POSITIVE_TTL_MS = 12 * 60 * 60 * 1000
const NEGATIVE_TTL_MS = 15 * 60 * 1000
const cache = new Map<string, { result: LatestResult; expiresAt: number }>()

export function clearLatestVersionCache(): void { cache.clear() }

const iso = (now: () => number) => new Date(now()).toISOString()
const unavailable = (reason: string, now: () => number): LatestResult => ({ ok: false, value: { reason, lastCheckedAt: iso(now) } })

async function cached(key: string, now: () => number, load: () => Promise<LatestResult>): Promise<LatestResult> {
  const hit = cache.get(key)
  if (hit && now() < hit.expiresAt) return hit.result
  const result = await load()
  cache.set(key, { result, expiresAt: now() + (result.ok ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS) })
  return result
}

async function getJson(url: string, f: FetchLike, headers: Record<string, string> = {}): Promise<{ status: number; json: unknown }> {
  const res = await f(url, { headers: { Accept: 'application/json', 'User-Agent': 'ito-endpoint-app-intelligence', ...headers }, signal: AbortSignal.timeout(20_000) })
  const text = await res.text().catch(() => '')
  let json: unknown = null
  try { json = JSON.parse(text) } catch { /* non-JSON body */ }
  return { status: res.status, json }
}

// ── Release notes ───────────────────────────────────────────────────────────

const MAX_NOTES_CHARS = 1500
const httpUrl = (v: string | null | undefined): string | null => {
  if (!v) return null
  try { const u = new URL(v.trim()); return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null } catch { return null }
}

/** Reads ReleaseNotes / ReleaseNotesUrl from a winget locale manifest (scalar or block-scalar values). */
export function parseWingetReleaseNotes(yaml: string): { summary: string | null; url: string | null } {
  const lines = yaml.split(/\r?\n/)
  let summary: string | null = null
  let url: string | null = null
  for (let i = 0; i < lines.length; i++) {
    const m = /^(ReleaseNotes|ReleaseNotesUrl):\s*(.*)$/.exec(lines[i]!)
    if (!m) continue
    const rest = m[2]!.trim()
    if (m[1] === 'ReleaseNotesUrl') { url = httpUrl(rest.replace(/^["']|["']$/g, '')); continue }
    if (/^[|>][+-]?$/.test(rest)) {
      const body: string[] = []
      for (let j = i + 1; j < lines.length && (/^\s/.test(lines[j]!) || lines[j] === ''); j++) body.push(lines[j]!.replace(/^ {2}/, ''))
      summary = body.join('\n').trim()
    } else summary = rest.replace(/^["']|["']$/g, '')
  }
  // Keep tab / newline / carriage return; drop every other control character.
  if (summary) summary = Array.from(summary).filter(ch => { const c = ch.charCodeAt(0); return c === 9 || c === 10 || c === 13 || (c >= 32 && c !== 127) }).join('').slice(0, MAX_NOTES_CHARS)
  return { summary: summary || null, url }
}

async function wingetReleaseNotes(base: string, id: string, versionManifest: string, f: FetchLike): Promise<ReleaseNotes> {
  const source = 'winget-pkgs locale manifest'
  try {
    const locale = /^DefaultLocale:\s*["']?([A-Za-z0-9-]+)["']?\s*$/m.exec(versionManifest)?.[1] ?? 'en-US'
    const res = await f(`${base}/${encodeURIComponent(id)}.locale.${encodeURIComponent(locale)}.yaml`, { headers: { 'User-Agent': 'ito-endpoint-app-intelligence' }, signal: AbortSignal.timeout(20_000) })
    if (res.status !== 200) return { summary: null, url: null, source, unavailableReason: `Locale manifest not readable (${res.status})` }
    const parsed = parseWingetReleaseNotes(await res.text())
    return parsed.summary || parsed.url ? { ...parsed, source, unavailableReason: null } : { summary: null, url: null, source, unavailableReason: 'The manifest publishes no release notes for this version' }
  } catch (e) {
    return { summary: null, url: null, source, unavailableReason: `Locale manifest unreachable: ${e instanceof Error ? e.message : 'unknown error'}` }
  }
}

// ── Homebrew cask ───────────────────────────────────────────────────────────

export async function fetchBrewCaskLatest(token: string, opts: AdapterOptions = {}): Promise<LatestResult> {
  const now = opts.now ?? Date.now
  const f = opts.fetchImpl ?? fetch
  if (!/^[a-z0-9][a-z0-9@+._-]*$/.test(token)) return unavailable('Invalid Homebrew cask token', now)
  return cached(`brew:${token}`, now, async () => {
    const url = `https://formulae.brew.sh/api/cask/${encodeURIComponent(token)}.json`
    try {
      const { status, json } = await getJson(url, f)
      if (status === 404) return unavailable(`Homebrew has no cask named "${token}"`, now)
      if (status !== 200 || !json || typeof json !== 'object') return unavailable(`Homebrew cask API returned ${status}`, now)
      const c = json as { version?: unknown; auto_updates?: unknown; deprecated?: unknown; disabled?: unknown; homepage?: unknown }
      if (c.disabled === true) return unavailable(`Homebrew cask "${token}" is disabled`, now)
      if (typeof c.version !== 'string' || !parseVersion(c.version)) return unavailable(`Homebrew cask "${token}" reports no parsable version`, now)
      if (!isStableVersion(c.version.split(',')[0]!.trim())) return unavailable(`Homebrew cask "${token}" reports a pre-release version (${c.version})`, now)
      // Homebrew appends build ids / hashes after a comma ("155.0.4283.45,6b10bfa6-…"); the app version is the part before it.
      const version = c.version.split(',')[0]!.trim()
      return { ok: true, value: {
        version, versionSource: `Homebrew cask API (${token})`, sourceUrl: url,
        lastCheckedAt: iso(now), selfUpdating: c.auto_updates === true,
        releaseNotes: { summary: null, url: null, vendorUrl: httpUrl(typeof c.homepage === 'string' ? c.homepage : null), source: 'Homebrew cask API', unavailableReason: 'Homebrew does not publish release notes' },
      } }
    } catch (e) {
      return unavailable(`Homebrew cask API unreachable: ${e instanceof Error ? e.message : 'unknown error'}`, now)
    }
  })
}

// ── winget-pkgs manifests ───────────────────────────────────────────────────

/** winget-pkgs path: manifests/<first letter lowercased>/<Id segments...> */
/** Pre-release manifests (beta / rc / preview …) are never the "latest" a fleet should be patched to. */
export function isStableVersion(v: string): boolean {
  const p = parseVersion(v)
  return !!p && !p.pre
}

export function wingetManifestPath(id: string): string | null {
  if (!/^[A-Za-z0-9][A-Za-z0-9+._-]*(\.[A-Za-z0-9][A-Za-z0-9+_-]*)+$/.test(id)) return null
  const segments = id.split('.')
  return ['manifests', segments[0]![0]!.toLowerCase(), ...segments].map(encodeURIComponent).join('/')
}

export async function fetchWingetLatest(id: string, opts: AdapterOptions = {}): Promise<LatestResult> {
  const now = opts.now ?? Date.now
  const f = opts.fetchImpl ?? fetch
  const path = wingetManifestPath(id)
  if (!path) return unavailable('Invalid winget package identifier', now)
  return cached(`winget:${id.toLowerCase()}`, now, async () => {
    const api = `https://api.github.com/repos/microsoft/winget-pkgs/contents/${path}`
    const auth: Record<string, string> = opts.githubToken ? { Authorization: `Bearer ${opts.githubToken}` } : {}
    try {
      const { status, json } = await getJson(api, f, { Accept: 'application/vnd.github+json', ...auth })
      if (status === 403 || status === 429) return unavailable('GitHub API rate limit reached while reading winget manifests (set GITHUB_TOKEN to raise it)', now)
      if (status === 404) return unavailable(`No winget-pkgs manifest directory for "${id}"`, now)
      if (status !== 200 || !Array.isArray(json)) return unavailable(`winget-pkgs listing returned ${status}`, now)

      const versions = (json as Array<{ name?: string; type?: string }>)
        .filter(e => e.type === 'dir' && typeof e.name === 'string' && /^\d/.test(e.name) && isStableVersion(e.name))
        .map(e => e.name!)
      const best = versions.reduce<string | null>((acc, v) => (acc === null || compareVersions(v, acc) === 1 ? v : acc), null)
      if (!best) return unavailable(`winget-pkgs has no versioned manifests for "${id}"`, now)

      // Confirm against the manifest itself rather than trusting a directory name.
      const rawUrl = `https://raw.githubusercontent.com/microsoft/winget-pkgs/master/${path}/${encodeURIComponent(best)}/${encodeURIComponent(id)}.yaml`
      const res = await f(rawUrl, { headers: { 'User-Agent': 'ito-endpoint-app-intelligence' }, signal: AbortSignal.timeout(20_000) })
      if (res.status !== 200) return unavailable(`winget manifest for ${id} ${best} could not be verified (${res.status})`, now)
      const manifestText = await res.text()
      const declared = /^PackageVersion:\s*["']?([^"'\r\n]+?)["']?\s*$/m.exec(manifestText)?.[1]
      if (!declared || compareVersions(declared, best) !== 0) return unavailable(`winget manifest PackageVersion does not match its directory (${declared ?? 'missing'} vs ${best})`, now)

      return { ok: true, value: {
        version: declared, versionSource: `Microsoft winget-pkgs manifest (${id})`, sourceUrl: rawUrl,
        lastCheckedAt: iso(now), selfUpdating: false,
        releaseNotes: await wingetReleaseNotes(`https://raw.githubusercontent.com/microsoft/winget-pkgs/master/${path}/${encodeURIComponent(best)}`, id, manifestText, f),
      } }
    } catch (e) {
      return unavailable(`winget-pkgs unreachable: ${e instanceof Error ? e.message : 'unknown error'}`, now)
    }
  })
}

export { maxVersion }
