import { dataFile } from '../../store/dataDir.js'
import fs from 'node:fs'
import path from 'node:path'
import { catalogForBundleId, catalogForWingetId } from './catalog.js'
import { compareVersions } from './version.js'
import type { AssessedApp } from './types.js'

// Known-CVE exposure per installed version, from the NVD CVE API 2.0 (cpeName query). NVD evaluates the CPE's
// version ranges server-side, so a version that falls inside a vulnerable range returns the CVE and a fixed
// version does not. Only apps with a verified CPE mapping in the catalog are looked up: an unknown CPE returns
// zero results, which would read as a false "clean". Everything is cached, rate limited and run in the
// background so it never blocks the inventory sync. `cisaExploitAdd` on a CVE means it is in CISA's Known
// Exploited Vulnerabilities catalog.

export type CveSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' | 'UNKNOWN'

export interface CveEntry {
  id: string
  severity: CveSeverity
  score: number | null
  published: string | null
  summary: string
  knownExploited: boolean
  url: string
}

export interface CveVersionResult {
  version: string
  /** Version actually sent to NVD (leading numeric part), when it differs from the installed string. */
  queriedAs: string | null
  state: 'ok' | 'unavailable'
  reason: string | null
  total: number
  truncated: boolean
  cves: CveEntry[]
  checkedAt: string
}

export interface CveCounts { total: number; critical: number; high: number; medium: number; low: number; knownExploited: number }

export interface AppCve {
  state: 'ok' | 'partial' | 'pending' | 'unmapped' | 'unavailable'
  reason: string | null
  /** cpe:2.3:a:vendor:product — shown for transparency. */
  cpe: string | null
  versions: Array<CveVersionResult & { deviceCount: number }>
  /** Unique CVEs across the checked versions. */
  cves: Array<CveEntry & { versions: string[] }>
  counts: CveCounts
  /** Devices running a checked version that has at least one known CVE (same per-version estimate as the impact figure). */
  exposedDevices: number
  highestSeverity: CveSeverity | null
  checkedAt: string | null
  note: string
}

const SOURCE_NOTE = 'Source: NVD CVE API 2.0, matched by CPE applicability for each installed version. NVD analysis can lag disclosure, and only catalog-mapped apps are checked.'
const MAX_VERSIONS = 3
const MAX_PER_VERSION = 200
const POSITIVE_TTL_MS = 24 * 60 * 60 * 1000
const NEGATIVE_TTL_MS = 30 * 60 * 1000
const SEVERITY_RANK: Record<CveSeverity, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0, UNKNOWN: 0 }

const emptyCounts = (): CveCounts => ({ total: 0, critical: 0, high: 0, medium: 0, low: 0, knownExploited: 0 })

export function cpeFor(app: AssessedApp): { vendor: string; product: string } | null {
  const entry = catalogForWingetId(app.identity.wingetId) ?? catalogForBundleId(app.identity.bundleId)
  return entry?.cpe ?? null
}

/** NVD matches on the numeric release; vendor build suffixes ("2.43.0.windows.1") are dropped. */
export function cpeVersion(v: string): string | null {
  const m = /^\d+(\.\d+){0,3}/.exec(v.trim())
  return m ? m[0] : null
}

/** The installed versions worth checking: older than the latest verified one (all, if latest is unknown), most-installed first. */
export function versionsToCheck(app: AssessedApp): { versions: Array<{ version: string; deviceCount: number }>; skipped: number } {
  const latest = app.latest?.version
  const merged = new Map<string, number>()
  for (const i of app.installed) merged.set(i.version, (merged.get(i.version) ?? 0) + i.deviceCount)
  const list = [...merged].map(([version, deviceCount]) => ({ version, deviceCount }))
    .filter(i => !latest || compareVersions(i.version, latest) === -1)
    .sort((a, b) => b.deviceCount - a.deviceCount)
  return { versions: list.slice(0, MAX_VERSIONS), skipped: Math.max(0, list.length - MAX_VERSIONS) }
}

// ── NVD ───────────────────────────────────────────────────────────────────────────────────────────

interface NvdMetric { type?: string; baseSeverity?: string; cvssData?: { baseScore?: number; baseSeverity?: string } }
interface NvdCve { id?: string; published?: string; descriptions?: Array<{ lang?: string; value?: string }>; metrics?: Record<string, NvdMetric[]>; cisaExploitAdd?: string }

function pickMetric(metrics: NvdCve['metrics']): { severity: CveSeverity; score: number | null } {
  for (const key of ['cvssMetricV40', 'cvssMetricV31', 'cvssMetricV30', 'cvssMetricV2']) {
    const list = metrics?.[key]
    if (!list?.length) continue
    const m = list.find(x => x.type === 'Primary') ?? list[0]!
    const sev = String(m.cvssData?.baseSeverity ?? m.baseSeverity ?? '').toUpperCase()
    const severity = (sev in SEVERITY_RANK ? sev : 'UNKNOWN') as CveSeverity
    return { severity, score: typeof m.cvssData?.baseScore === 'number' ? m.cvssData.baseScore : null }
  }
  return { severity: 'UNKNOWN', score: null }
}

export function parseNvdCve(c: NvdCve): CveEntry | null {
  if (!c.id || !/^CVE-\d{4}-\d{4,}$/.test(c.id)) return null
  const { severity, score } = pickMetric(c.metrics)
  const desc = c.descriptions?.find(d => d.lang === 'en')?.value ?? c.descriptions?.[0]?.value ?? ''
  return {
    id: c.id, severity, score, published: c.published ?? null,
    summary: desc.replace(/\s+/g, ' ').trim().slice(0, 400), knownExploited: !!c.cisaExploitAdd,
    url: `https://nvd.nist.gov/vuln/detail/${c.id}`,
  }
}

type FetchLike = typeof fetch
type FetchResult = { ok: true; total: number; cves: CveEntry[] } | { ok: false; reason: string }

export async function fetchNvdCves(cpe: { vendor: string; product: string }, version: string, opts: { fetchImpl?: FetchLike | undefined; apiKey?: string | undefined } = {}): Promise<FetchResult> {
  const f = opts.fetchImpl ?? fetch
  const params = new URLSearchParams({ cpeName: `cpe:2.3:a:${cpe.vendor}:${cpe.product}:${version}:*:*:*:*:*:*:*`, resultsPerPage: String(MAX_PER_VERSION) })
  try {
    const res = await f(`https://services.nvd.nist.gov/rest/json/cves/2.0?${params}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'ito-endpoint-app-intelligence', ...(opts.apiKey ? { apiKey: opts.apiKey } : {}) },
      signal: AbortSignal.timeout(30_000),
    })
    if (res.status === 403 || res.status === 429) return { ok: false, reason: 'NVD rate limit reached (set NVD_API_KEY to raise it)' }
    if (res.status !== 200) return { ok: false, reason: `NVD returned HTTP ${res.status}` }
    const body = await res.json() as { totalResults?: number; vulnerabilities?: Array<{ cve?: NvdCve }> }
    if (!Array.isArray(body.vulnerabilities)) return { ok: false, reason: 'NVD returned an unexpected response' }
    const cves = body.vulnerabilities.map(v => (v.cve ? parseNvdCve(v.cve) : null)).filter((c): c is CveEntry => c !== null)
    return { ok: true, total: typeof body.totalResults === 'number' ? body.totalResults : cves.length, cves }
  } catch (e) {
    return { ok: false, reason: `NVD unreachable: ${e instanceof Error ? e.message : 'unknown error'}` }
  }
}

// ── Store + background queue ──────────────────────────────────────────────────────────────────────

interface CacheEntry { result: CveVersionResult; expiresAt: number }
export interface CveStoreOptions {
  fetchImpl?: FetchLike | undefined
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  apiKey?: string | undefined
  /** Pause between NVD calls. Defaults to 6.5 s without a key (5 requests / 30 s) and 0.7 s with one (50 / 30 s). */
  delayMs?: number
  /** Disk cache path; null disables persistence (tests). */
  cacheFile?: string | null
}

export function createCveStore(opts: CveStoreOptions = {}) {
  const now = opts.now ?? Date.now
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)))
  const delayMs = opts.delayMs ?? (opts.apiKey ? 700 : 6500)
  const cacheFile = opts.cacheFile === undefined ? dataFile('cache/app-cve.v1.json', [path.resolve(process.cwd(), '.cache', 'app-cve.v1.json')]) : opts.cacheFile
  const cache = new Map<string, CacheEntry>()
  if (cacheFile) {
    try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as Record<string, CacheEntry>)) cache.set(k, v) } catch { /* no usable cache */ }
  }
  const persist = (): void => {
    if (!cacheFile) return
    try { fs.mkdirSync(path.dirname(cacheFile), { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify(Object.fromEntries(cache))) } catch (e) { console.warn('[app-cve] could not write cache:', e instanceof Error ? e.message : e) }
  }

  const keyOf = (cpe: { vendor: string; product: string }, v: string) => `${cpe.vendor}:${cpe.product}:${v}`
  const fresh = (k: string): CacheEntry | undefined => { const e = cache.get(k); return e && now() < e.expiresAt ? e : undefined }

  const queue: Array<{ cpe: { vendor: string; product: string }; queriedAs: string; installed: string }> = []
  let worker: Promise<void> | null = null

  async function drain(): Promise<void> {
    let first = true
    while (queue.length) {
      const job = queue.shift()!
      const k = keyOf(job.cpe, job.queriedAs)
      if (fresh(k)) continue
      if (!first) await sleep(delayMs)
      first = false
      const r = await fetchNvdCves(job.cpe, job.queriedAs, { fetchImpl: opts.fetchImpl, apiKey: opts.apiKey })
      const checkedAt = new Date(now()).toISOString()
      const result: CveVersionResult = r.ok
        ? { version: job.installed, queriedAs: job.queriedAs !== job.installed ? job.queriedAs : null, state: 'ok', reason: null, total: r.total, truncated: r.total > r.cves.length, cves: r.cves, checkedAt }
        : { version: job.installed, queriedAs: job.queriedAs !== job.installed ? job.queriedAs : null, state: 'unavailable', reason: r.reason, total: 0, truncated: false, cves: [], checkedAt }
      cache.set(k, { result, expiresAt: now() + (r.ok ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS) })
      persist()
    }
  }

  return {
    /** Queues lookups for every mapped app/version that is not freshly cached, then returns immediately. */
    scheduleFor(apps: AssessedApp[]): void {
      const queued = new Set<string>(queue.map(j => keyOf(j.cpe, j.queriedAs)))
      for (const app of apps) {
        const cpe = cpeFor(app)
        if (!cpe) continue
        for (const { version } of versionsToCheck(app).versions) {
          const q = cpeVersion(version)
          if (!q) continue
          const k = keyOf(cpe, q)
          if (fresh(k) || queued.has(k)) continue
          queued.add(k); queue.push({ cpe, queriedAs: q, installed: version })
        }
      }
      if (queue.length && !worker) worker = drain().catch(e => console.error('[app-cve] background lookup failed:', e)).finally(() => { worker = null })
    },
    /** Resolves when the queue is empty (used by tests and graceful shutdown). */
    idle: async (): Promise<void> => { while (worker) await worker },
    pending: (): number => queue.length,

    forApp(app: AssessedApp): AppCve {
      const cpe = cpeFor(app)
      const base: AppCve = { state: 'unmapped', reason: null, cpe: null, versions: [], cves: [], counts: emptyCounts(), exposedDevices: 0, highestSeverity: null, checkedAt: null, note: SOURCE_NOTE }
      if (!cpe) return { ...base, reason: 'No verified NVD product mapping for this app in the catalog, so CVEs are not checked (an unmapped app is not "clean").' }
      const cpeText = `cpe:2.3:a:${cpe.vendor}:${cpe.product}`
      const { versions, skipped } = versionsToCheck(app)
      if (!versions.length) {
        return { ...base, state: 'ok', cpe: cpeText, reason: app.latest ? 'No installed version is older than the latest verified version.' : 'No installed versions to check.' }
      }
      const rows: AppCve['versions'] = []
      let pending = 0, unavailable = 0, notComparable = 0
      for (const { version, deviceCount } of versions) {
        const q = cpeVersion(version)
        if (!q) { notComparable++; continue }
        const hit = cache.get(keyOf(cpe, q))
        if (!hit || now() >= hit.expiresAt) { pending++; continue }
        if (hit.result.state === 'unavailable') unavailable++
        rows.push({ ...hit.result, version, deviceCount })
      }
      const unique = new Map<string, CveEntry & { versions: string[] }>()
      for (const r of rows) for (const c of r.cves) {
        const u = unique.get(c.id)
        if (u) u.versions.push(r.version); else unique.set(c.id, { ...c, versions: [r.version] })
      }
      const cves = [...unique.values()].sort((a, b) => Number(b.knownExploited) - Number(a.knownExploited) || SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || (b.score ?? 0) - (a.score ?? 0))
      const counts = emptyCounts()
      for (const c of cves) {
        counts.total++
        if (c.knownExploited) counts.knownExploited++
        if (c.severity === 'CRITICAL') counts.critical++; else if (c.severity === 'HIGH') counts.high++; else if (c.severity === 'MEDIUM') counts.medium++; else if (c.severity === 'LOW') counts.low++
      }
      const okRows = rows.filter(r => r.state === 'ok')
      const state: AppCve['state'] = pending ? 'pending' : unavailable && !okRows.length ? 'unavailable' : unavailable || notComparable ? 'partial' : 'ok'
      const notes: string[] = []
      if (pending) notes.push(`${pending} version(s) still being checked`)
      if (unavailable) notes.push(`${rows.filter(r => r.state === 'unavailable').map(r => `${r.version}: ${r.reason}`).join('; ')}`)
      if (notComparable) notes.push(`${notComparable} version(s) have no numeric release NVD can match`)
      if (skipped) notes.push(`checked the ${MAX_VERSIONS} most-installed outdated versions; ${skipped} other version(s) not checked`)
      if (rows.some(r => r.truncated)) notes.push('a version has more CVEs than are listed')
      return {
        ...base, state, cpe: cpeText, reason: notes.length ? notes.join(' · ') : null, versions: rows, cves, counts,
        exposedDevices: okRows.filter(r => r.total > 0).reduce((n, r) => n + r.deviceCount, 0),
        highestSeverity: cves.length ? cves.reduce((best, c) => (SEVERITY_RANK[c.severity] > SEVERITY_RANK[best] ? c.severity : best), cves[0]!.severity) : null,
        checkedAt: okRows.map(r => r.checkedAt).sort().at(-1) ?? null,
      }
    },
  }
}

export type CveStore = ReturnType<typeof createCveStore>
let singleton: CveStore | null = null
export function getCveStore(): CveStore { return (singleton ??= createCveStore({ apiKey: process.env.NVD_API_KEY })) }
