// External Windows security intelligence for the Windows Updates page. Three public sources, no credentials:
//   • Microsoft MSRC Security Update Guide (CVRF API)  — monthly Windows CVEs, severity, impact, exploitability, fix KBs/builds
//   • CISA Known Exploited Vulnerabilities catalog      — which of those CVEs are being exploited in the wild
//   • endoflife.date Windows lifecycle                  — feature-release dates and end-of-servicing dates
// Each source fails independently and is reported as such; nothing is invented when a source is unreachable.
// Microsoft does not publish upcoming CVE details before Patch Tuesday, so "upcoming" here means the scheduled
// release dates (computed), CVEs already published in an early release, and upcoming end-of-servicing dates.

import { dataFile, readJsonFile, writeJsonAtomic } from '../store/dataDir.js'

const MSRC_BASE = 'https://api.msrc.microsoft.com/cvrf/v3.0'
const KEV_URL = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json'
const LIFECYCLE_URL = 'https://endoflife.date/api/windows.json'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const DAY = 86_400_000

export type Severity = 'Critical' | 'Important' | 'Moderate' | 'Low' | 'Unrated'
const SEVERITY_RANK: Record<Severity, number> = { Critical: 4, Important: 3, Moderate: 2, Low: 1, Unrated: 0 }

export interface CveCore { cve: string; title: string; impact: string; severity: Severity; cvss: number | null; exploited: boolean; disclosed: boolean; exploitability: string; kbs: string[] }
export interface BuildFix { product: string; kb: string; fixedBuild: string }
export interface MonthCore { id: string; title: string; releasedAt: string; currentRelease: string; cves: CveCore[]; builds: BuildFix[] }
export interface KevEntry { cve: string; name: string; product: string; dateAdded: string; dueDate: string; ransomware: boolean; action: string }
export interface MsrcCveView extends CveCore { kev: boolean; kevDueDate: string | null; ransomware: boolean; risk: number }
export interface MsrcMonthView {
  id: string; title: string; releasedAt: string
  totals: { cves: number; critical: number; important: number; exploited: number; publiclyDisclosed: number; exploitationMoreLikely: number; inKev: number }
  byImpact: Array<{ impact: string; count: number }>
  topCves: MsrcCveView[]
  builds: BuildFix[]
  kbIndex: Record<string, { cves: number; critical: number; exploited: number }>
}
export interface LifecycleRow { version: string; build: number; releaseDate: string; endOfServicing: Array<{ edition: string; date: string }>; latestBuild: string; status: 'supported' | 'ending-soon' | 'ended'; daysToEnd: number }
export interface SourceStatus { name: string; url: string; ok: boolean; error?: string; fetchedAt: string; stale?: boolean }
export interface WindowsIntel {
  generatedAt: string
  upcoming: { nextPatchTuesday: { date: string; daysAway: number }; nextOptionalPreview: { date: string; daysAway: number }; note: string }
  latestRelease: MsrcMonthView | null
  previousRelease: MsrcMonthView | null
  earlyRelease: { id: string; title: string; releasedAt: string; advisories: number; windowsAdvisories: number } | null
  kevRecent: KevEntry[]
  lifecycle: LifecycleRow[]
  upcomingEndOfServicing: LifecycleRow[]
  newestFeatureRelease: { version: string; build: number; releaseDate: string } | null
  sources: SourceStatus[]
}

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────────

const idOf = (productId: string): string => productId.split('-').pop() ?? productId
const sevOf = (value: unknown): Severity => (typeof value === 'string' && value in SEVERITY_RANK ? (value as Severity) : 'Unrated')
const EXPLOIT_RANK = ['Exploitation Detected', 'Exploitation More Likely', 'Exploitation Less Likely', 'Exploitation Unlikely']

interface CvrfDoc {
  DocumentTitle?: { Value?: string }
  DocumentTracking?: { InitialReleaseDate?: string; CurrentReleaseDate?: string }
  ProductTree?: { FullProductName?: Array<{ ProductID: string; Value: string }> }
  Vulnerability?: Array<{
    CVE?: string; Title?: { Value?: string }
    Threats?: Array<{ Type: number; ProductID?: string[]; Description?: { Value?: string } }>
    ProductStatuses?: Array<{ Type: number; ProductID?: string[] }>
    CVSSScoreSets?: Array<{ BaseScore?: number }>
    Remediations?: Array<{ Type: number; SubType?: string; FixedBuild?: string; ProductID?: string[]; Description?: { Value?: string } }>
  }>
}

/** Reduces one MSRC monthly CVRF document (≈30 MB) to the Windows 10/11 client CVEs it covers. */
export function extractMonthCore(id: string, doc: CvrfDoc): MonthCore {
  const windows = new Map<string, string>()
  for (const p of doc.ProductTree?.FullProductName ?? []) if (/^Windows (10|11)\b/.test(p.Value)) windows.set(p.ProductID, p.Value)
  const cves: CveCore[] = []
  const builds = new Map<string, BuildFix>()
  for (const v of doc.Vulnerability ?? []) {
    if (!v.CVE?.startsWith('CVE-')) continue
    const affected = new Set((v.ProductStatuses ?? []).filter(s => s.Type === 3).flatMap(s => s.ProductID ?? []).map(idOf))
    if (![...affected].some(p => windows.has(p))) continue
    let severity: Severity = 'Unrated'
    let impact = ''
    let exploited = false, disclosed = false
    let exploitability = ''
    for (const t of v.Threats ?? []) {
      const text = t.Description?.Value ?? ''
      if (t.Type === 3 && SEVERITY_RANK[sevOf(text)] > SEVERITY_RANK[severity]) severity = sevOf(text)
      if (t.Type === 0 && !impact && text && text !== 'Not a Vulnerability') impact = text
      if (t.Type === 1) {
        if (/Exploited:Yes/i.test(text)) exploited = true
        if (/Publicly Disclosed:Yes/i.test(text)) disclosed = true
        const latest = /Latest Software Release:([^;]+)/i.exec(text)?.[1]?.trim() ?? ''
        const rank = (s: string) => { const i = EXPLOIT_RANK.indexOf(s); return i === -1 ? 99 : i }
        if (latest && rank(latest) < rank(exploitability)) exploitability = latest
      }
    }
    const kbs = new Set<string>()
    for (const r of v.Remediations ?? []) {
      if (r.Type !== 2 || !(r.ProductID ?? []).some(p => windows.has(idOf(p)))) continue
      const digits = (r.Description?.Value ?? '').replace(/\D/g, '')
      if (digits.length < 6) continue
      kbs.add(`KB${digits}`)
      for (const p of r.ProductID ?? []) {
        const product = windows.get(idOf(p))
        if (product && r.FixedBuild) builds.set(`${digits}|${product}`, { product, kb: `KB${digits}`, fixedBuild: r.FixedBuild })
      }
    }
    const scores = (v.CVSSScoreSets ?? []).map(s => s.BaseScore ?? 0)
    cves.push({ cve: v.CVE, title: v.Title?.Value ?? v.CVE, impact: impact || 'Unspecified', severity, cvss: scores.length ? Math.max(...scores) : null, exploited, disclosed, exploitability, kbs: [...kbs] })
  }
  return { id, title: doc.DocumentTitle?.Value ?? id, releasedAt: doc.DocumentTracking?.InitialReleaseDate ?? '', currentRelease: doc.DocumentTracking?.CurrentReleaseDate ?? '', cves, builds: [...builds.values()] }
}

/** Turns a cached month into the page view, flagging CVEs that are in CISA's KEV catalog. */
export function buildMonthView(core: MonthCore, kev: ReadonlyMap<string, KevEntry>, topN = 100): MsrcMonthView {
  const withKev: MsrcCveView[] = core.cves.map(c => {
    const k = kev.get(c.cve)
    const risk = (c.exploited ? 1000 : 0) + (k ? 800 : 0) + (c.disclosed ? 300 : 0) + SEVERITY_RANK[c.severity] * 100 + (c.exploitability === 'Exploitation More Likely' ? 150 : 0) + (c.cvss ?? 0) * 10
    return { ...c, kev: !!k, kevDueDate: k?.dueDate ?? null, ransomware: k?.ransomware ?? false, risk }
  })
  const impacts = new Map<string, number>()
  const kbIndex: MsrcMonthView['kbIndex'] = {}
  for (const c of withKev) {
    impacts.set(c.impact, (impacts.get(c.impact) ?? 0) + 1)
    for (const kb of c.kbs) {
      const e = (kbIndex[kb] ??= { cves: 0, critical: 0, exploited: 0 })
      e.cves++; if (c.severity === 'Critical') e.critical++; if (c.exploited || c.kev) e.exploited++
    }
  }
  return {
    id: core.id, title: core.title, releasedAt: core.releasedAt,
    totals: {
      cves: withKev.length, critical: withKev.filter(c => c.severity === 'Critical').length, important: withKev.filter(c => c.severity === 'Important').length,
      exploited: withKev.filter(c => c.exploited).length, publiclyDisclosed: withKev.filter(c => c.disclosed).length,
      exploitationMoreLikely: withKev.filter(c => c.exploitability === 'Exploitation More Likely').length, inKev: withKev.filter(c => c.kev).length,
    },
    byImpact: [...impacts].map(([impact, count]) => ({ impact, count })).sort((a, b) => b.count - a.count),
    topCves: withKev.sort((a, b) => b.risk - a.risk).slice(0, topN),
    builds: core.builds, kbIndex,
  }
}

const iso = (d: Date): string => d.toISOString().slice(0, 10)
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(Date.UTC(year, month, 1))
  return new Date(Date.UTC(year, month, 1 + ((weekday - first.getUTCDay() + 7) % 7) + (n - 1) * 7))
}
/** Patch Tuesday = second Tuesday; the optional non-security preview ("D release") is normally the fourth Tuesday. */
export function nextRelease(now: Date, n: 2 | 4): { date: string; daysAway: number } {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  for (let m = 0; m < 3; m++) {
    const d = nthWeekday(now.getUTCFullYear(), now.getUTCMonth() + m, 2, n)
    if (d.getTime() >= today) return { date: iso(d), daysAway: Math.round((d.getTime() - today) / DAY) }
  }
  throw new Error('unreachable')
}

export function buildLifecycle(raw: unknown, now: Date): LifecycleRow[] {
  if (!Array.isArray(raw)) return []
  const byVersion = new Map<string, LifecycleRow>()
  for (const e of raw as Array<Record<string, unknown>>) {
    const cycle = String(e.cycle ?? '')
    if (!/^(10|11)-/.test(cycle) || /lts|iot/.test(cycle)) continue
    const eol = typeof e.eol === 'string' ? e.eol : ''
    const latest = String(e.latest ?? '')
    const build = Number(latest.split('.')[2])
    if (!eol || !Number.isInteger(build)) continue
    const m = /^(10|11)-(.+?)(?:-(e|w))?$/.exec(cycle)
    if (!m) continue
    const version = `Windows ${m[1]} ${String(m[2]).toUpperCase()}`
    const edition = m[3] === 'e' ? 'Enterprise/Education' : m[3] === 'w' ? 'Home/Pro' : 'All editions'
    const row = byVersion.get(version) ?? { version, build, releaseDate: String(e.releaseDate ?? ''), endOfServicing: [], latestBuild: latest, status: 'supported' as const, daysToEnd: 0 }
    row.endOfServicing.push({ edition, date: eol })
    byVersion.set(version, row)
  }
  const nowMs = now.getTime()
  return [...byVersion.values()].map(r => {
    // Status follows the next end date still ahead (an edition that already ended doesn't hide one that hasn't).
    const dates = r.endOfServicing.map(x => Date.parse(x.date))
    const future = dates.filter(d => d >= nowMs)
    const daysToEnd = Math.round(((future.length ? Math.min(...future) : Math.max(...dates)) - nowMs) / DAY)
    const status: LifecycleRow['status'] = future.length === 0 ? 'ended' : daysToEnd <= 180 ? 'ending-soon' : 'supported'
    return { ...r, endOfServicing: r.endOfServicing.sort((a, b) => a.date.localeCompare(b.date)), daysToEnd, status }
  }).sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))
}

// ── Fetch + cache ────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'ITO-Endpoint-Dashboard' }, signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.json() as T
}
const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

interface CacheFile {
  intel?: { at: number; kev: KevEntry[]; lifecycle: LifecycleRow[]; sources: SourceStatus[]; early: WindowsIntel['earlyRelease'] }
  months: Record<string, MonthCore>
}
const CACHE_FILE = dataFile('windows-intel-cache.json')
let cache: CacheFile = readJsonFile<CacheFile>(CACHE_FILE) ?? { months: {} }
cache.months ??= {}
let inflight: Promise<WindowsIntel> | null = null

const toKev = (v: Record<string, unknown>): KevEntry => ({
  cve: String(v.cveID), name: String(v.vulnerabilityName ?? ''), product: String(v.product ?? ''), dateAdded: String(v.dateAdded ?? ''),
  dueDate: String(v.dueDate ?? ''), ransomware: String(v.knownRansomwareCampaignUse ?? '').toLowerCase() === 'known', action: String(v.requiredAction ?? ''),
})

function assemble(now: Date, months: MonthCore[], kevAll: KevEntry[], lifecycle: LifecycleRow[], early: WindowsIntel['earlyRelease'], sources: SourceStatus[]): WindowsIntel {
  const stamp = now.toISOString()
  const kevMap = new Map(kevAll.map(k => [k.cve, k]))
  const kevRecent = kevAll.filter(k => /microsoft/i.test(k.name + k.product) && /windows/i.test(k.product + k.name)).sort((a, b) => b.dateAdded.localeCompare(a.dateAdded)).slice(0, 12)
  const featureRows = lifecycle.filter(r => r.releaseDate && Date.parse(r.releaseDate) <= now.getTime())
  const newest = featureRows[0]
  return {
    generatedAt: stamp,
    upcoming: {
      nextPatchTuesday: nextRelease(now, 2), nextOptionalPreview: nextRelease(now, 4),
      note: 'Dates are the standard Microsoft cadence (2nd Tuesday security release, 4th Tuesday optional preview). Microsoft publishes CVE details only on release day.',
    },
    latestRelease: months[0] ? buildMonthView(months[0], kevMap) : null,
    previousRelease: months[1] ? buildMonthView(months[1], kevMap, 0) : null,
    earlyRelease: early, kevRecent, lifecycle: lifecycle.filter(r => r.status !== 'ended' || r.daysToEnd > -730),
    upcomingEndOfServicing: lifecycle.filter(r => r.status === 'ending-soon').sort((a, b) => a.daysToEnd - b.daysToEnd),
    newestFeatureRelease: newest ? { version: newest.version, build: newest.build, releaseDate: newest.releaseDate } : null,
    sources,
  }
}

/** Rebuilds the view from the on-disk cache (no network), e.g. right after a server restart. */
function fromDiskCache(now: Date): WindowsIntel | null {
  const c = cache.intel
  const months = Object.values(cache.months).sort((a, b) => b.releasedAt.localeCompare(a.releasedAt)).slice(0, 2)
  if (!c || now.getTime() - c.at > CACHE_TTL_MS || months.length === 0) return null
  return assemble(new Date(c.at), months, c.kev, c.lifecycle, c.early, c.sources)
}

async function build(now: Date): Promise<WindowsIntel> {
  const sources: SourceStatus[] = []
  const stamp = now.toISOString()
  const track = <T,>(name: string, url: string, p: Promise<T>) => p.then(
    v => { sources.push({ name, url, ok: true, fetchedAt: stamp }); return v },
    e => { sources.push({ name, url, ok: false, error: msg(e), fetchedAt: stamp }); return null },
  )
  const [kevDoc, lifeRaw, updates] = await Promise.all([
    track('CISA Known Exploited Vulnerabilities', KEV_URL, fetchJson<{ vulnerabilities?: Array<Record<string, unknown>> }>(KEV_URL, 30_000)),
    track('Windows lifecycle (endoflife.date)', LIFECYCLE_URL, fetchJson<unknown>(LIFECYCLE_URL, 20_000)),
    track('Microsoft MSRC update index', `${MSRC_BASE}/updates`, fetchJson<{ value?: Array<{ ID: string; DocumentTitle: string; InitialReleaseDate: string; CurrentReleaseDate: string }> }>(`${MSRC_BASE}/updates`, 30_000)),
  ])
  const prior = cache.intel
  const kevAll = kevDoc?.vulnerabilities?.map(toKev) ?? prior?.kev ?? []
  const kevStale = !kevDoc && !!prior
  const lifecycle = lifeRaw ? buildLifecycle(lifeRaw, now) : prior?.lifecycle ?? []

  // Monthly Patch Tuesday documents, newest first (already-published only).
  const docs = (updates?.value ?? []).filter(u => Date.parse(u.InitialReleaseDate) <= now.getTime())
  const monthly = docs.filter(u => /^[A-Za-z]+ \d{4} Security Updates$/.test(u.DocumentTitle)).sort((a, b) => b.InitialReleaseDate.localeCompare(a.InitialReleaseDate)).slice(0, 2)
  const months: MonthCore[] = []
  for (const u of monthly) {
    const have = cache.months[u.ID]
    if (have && have.currentRelease === u.CurrentReleaseDate) { months.push(have); continue }
    const doc = await track(`Microsoft MSRC ${u.ID} security updates`, `${MSRC_BASE}/cvrf/${u.ID}`, fetchJson<CvrfDoc>(`${MSRC_BASE}/cvrf/${u.ID}`, 120_000))
    if (doc) { const core = extractMonthCore(u.ID, doc); cache.months[u.ID] = core; months.push(core) }
    else if (have) { months.push(have); const s = sources[sources.length - 1]; if (s) s.stale = true }
  }
  if (!updates) for (const id of Object.keys(cache.months).sort().reverse().slice(0, 2)) { const c = cache.months[id]; if (c) months.push(c) }
  months.sort((a, b) => b.releasedAt.localeCompare(a.releasedAt))

  let early: WindowsIntel['earlyRelease'] = prior?.early ?? null
  const latestDate = months[0]?.releasedAt ?? ''
  const earlyDoc = docs.filter(u => /Early Security Updates/i.test(u.DocumentTitle) && u.InitialReleaseDate > latestDate).sort((a, b) => b.InitialReleaseDate.localeCompare(a.InitialReleaseDate))[0]
  if (updates) {
    early = null
    if (earlyDoc) {
      const doc = await track(`Microsoft MSRC ${earlyDoc.ID} early release`, `${MSRC_BASE}/cvrf/${earlyDoc.ID}`, fetchJson<CvrfDoc>(`${MSRC_BASE}/cvrf/${earlyDoc.ID}`, 60_000))
      if (doc) {
        const core = extractMonthCore(earlyDoc.ID, doc)
        early = { id: earlyDoc.ID, title: earlyDoc.DocumentTitle, releasedAt: earlyDoc.InitialReleaseDate, advisories: (doc.Vulnerability ?? []).filter(v => v.CVE).length, windowsAdvisories: core.cves.length }
      }
    }
  }

  const nowSources = kevStale ? sources.map(s => (s.name.startsWith('CISA') ? { ...s, stale: true } : s)) : sources
  const result = assemble(now, months, kevAll, lifecycle, early, nowSources)
  // When every source failed (e.g. no internet), keep the previous good cache timestamp so it is retried soon.
  if (nowSources.some(x => x.ok)) {
    cache.intel = { at: now.getTime(), kev: kevAll, lifecycle, sources: nowSources, early }
    try { writeJsonAtomic(CACHE_FILE, cache) } catch { /* cache is best-effort */ }
  }
  return result
}

let lastResult: { at: number; value: WindowsIntel } | null = null

export async function getWindowsIntel(force = false, now = new Date()): Promise<WindowsIntel> {
  if (!force && lastResult && now.getTime() - lastResult.at < CACHE_TTL_MS) return lastResult.value
  if (!force && !lastResult) { const disk = fromDiskCache(now); if (disk) { lastResult = { at: Date.parse(disk.generatedAt), value: disk }; return disk } }
  inflight ??= build(now).then(v => {
    // A fully failed refresh is only remembered for 2 minutes so the page retries instead of showing errors for 6 hours.
    const anyOk = v.sources.some(x => x.ok)
    lastResult = { at: anyOk ? now.getTime() : now.getTime() - CACHE_TTL_MS + 2 * 60_000, value: v }
    return v
  }).finally(() => { inflight = null })
  return inflight
}

/** Cached-only view (never triggers a network fetch): used to enrich the fleet view when intel is already loaded. */
export const peekWindowsIntel = (): WindowsIntel | null => lastResult?.value ?? fromDiskCache(new Date())
/** Fire-and-forget refresh so a later request finds data; never throws. */
export const warmWindowsIntel = (): void => { void getWindowsIntel().catch(() => undefined) }
export const clearWindowsIntelCache = (): void => { lastResult = null; inflight = null; cache = { months: {} } }
