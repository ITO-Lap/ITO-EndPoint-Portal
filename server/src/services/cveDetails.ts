// On-demand CVE enrichment from public security sources (no credentials):
//   • NIST NVD 2.0       — description, CVSS vector, CWE weaknesses, tagged references (vendor advisories, patches, exploits, third-party)
//   • FIRST EPSS         — probability the CVE is exploited in the next 30 days, with percentile
// Optional NVD_API_KEY raises NVD's rate limit from 5 to 50 requests per 30 seconds. A source that fails is reported
// as such; nothing is guessed. Results are cached for 24 hours (failures for 2 minutes).

import { dataFile, readJsonFile, writeJsonAtomic } from '../store/dataDir.js'

const NVD_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0'
const EPSS_URL = 'https://api.first.org/data/v1/epss'
const TTL_MS = 24 * 60 * 60 * 1000
const FAIL_TTL_MS = 2 * 60 * 1000

export const CVE_ID = /^CVE-\d{4}-\d{4,}$/

export interface NvdDetail {
  description: string; status: string; published: string; lastModified: string
  cvss: { version: string; score: number; severity: string; vector: string; source: string } | null
  cwes: string[]
  references: Array<{ url: string; source: string; tags: string[] }>
}
export interface EpssScore { score: number; percentile: number; date: string }
export interface CveDetail {
  cve: string; fetchedAt: string
  nvd: NvdDetail | null; nvdStatus: 'ok' | 'not_found' | 'error'; nvdError?: string
  epss: EpssScore | null
  links: Array<{ label: string; url: string }>
}

// ── Pure parsers (unit-tested) ───────────────────────────────────────────────────

const REF_PRIORITY = ['Vendor Advisory', 'Patch', 'Exploit', 'Third Party Advisory', 'Mitigation', 'Technical Description']

export function parseNvd(body: unknown): NvdDetail | null {
  const cve = (body as { vulnerabilities?: Array<{ cve?: Record<string, unknown> }> })?.vulnerabilities?.[0]?.cve
  if (!cve) return null
  const descriptions = (cve.descriptions ?? []) as Array<{ lang: string; value: string }>
  const metrics = (cve.metrics ?? {}) as Record<string, Array<{ source?: string; type?: string; cvssData?: { version?: string; baseScore?: number; baseSeverity?: string; vectorString?: string } }>>
  // Prefer v3.1 > v4.0 > v3.0 > v2, and the NVD "Primary" analysis over a vendor "Secondary" score.
  let cvss: NvdDetail['cvss'] = null
  for (const key of ['cvssMetricV31', 'cvssMetricV40', 'cvssMetricV30', 'cvssMetricV2']) {
    const list = metrics[key] ?? []
    const m = list.find(x => x.type === 'Primary') ?? list[0]
    if (m?.cvssData?.baseScore !== undefined) {
      cvss = { version: m.cvssData.version ?? '', score: m.cvssData.baseScore, severity: m.cvssData.baseSeverity ?? '', vector: m.cvssData.vectorString ?? '', source: m.source ?? '' }
      break
    }
  }
  const weaknesses = (cve.weaknesses ?? []) as Array<{ description?: Array<{ value: string }> }>
  const cwes = [...new Set(weaknesses.flatMap(w => (w.description ?? []).map(d => d.value)).filter(v => /^CWE-\d+$/.test(v)))]
  const refs = ((cve.references ?? []) as Array<{ url: string; source?: string; tags?: string[] }>)
    .filter(r => /^https?:\/\//.test(r.url))
    .map(r => ({ url: r.url, source: r.source ?? '', tags: r.tags ?? [] }))
  const rank = (r: { tags: string[] }) => Math.min(...r.tags.map(t => REF_PRIORITY.indexOf(t)).filter(i => i >= 0), 99)
  return {
    description: descriptions.find(d => d.lang === 'en')?.value ?? descriptions[0]?.value ?? '',
    status: String(cve.vulnStatus ?? ''), published: String(cve.published ?? ''), lastModified: String(cve.lastModified ?? ''),
    cvss, cwes, references: refs.sort((a, b) => rank(a) - rank(b)).slice(0, 8),
  }
}

export function parseEpss(body: unknown): Map<string, EpssScore> {
  const out = new Map<string, EpssScore>()
  for (const d of ((body as { data?: Array<{ cve: string; epss: string; percentile: string; date: string }> })?.data ?? [])) {
    const score = Number(d.epss), percentile = Number(d.percentile)
    if (CVE_ID.test(d.cve) && Number.isFinite(score) && Number.isFinite(percentile)) out.set(d.cve, { score, percentile, date: d.date })
  }
  return out
}

export const externalLinks = (cve: string): CveDetail['links'] => [
  { label: 'Microsoft Security Update Guide', url: `https://msrc.microsoft.com/update-guide/vulnerability/${cve}` },
  { label: 'NIST NVD', url: `https://nvd.nist.gov/vuln/detail/${cve}` },
  { label: 'CVE.org record', url: `https://www.cve.org/CVERecord?id=${cve}` },
  { label: 'CISA KEV catalog', url: `https://www.cisa.gov/known-exploited-vulnerabilities-catalog?search_api_fulltext=${cve}` },
  { label: 'FIRST EPSS', url: `https://epss.empiricalsecurity.com/?cve=${cve}` },
  { label: 'Exploit-DB search', url: `https://www.exploit-db.com/search?cve=${cve.replace('CVE-', '')}` },
]

// ── Fetch + cache ────────────────────────────────────────────────────────────────

interface CacheFile { details: Record<string, { at: number; value: CveDetail }>; epss: Record<string, { at: number; value: EpssScore | null }> }
const CACHE_FILE = dataFile('cve-details-cache.json')
let cache: CacheFile = readJsonFile<CacheFile>(CACHE_FILE) ?? { details: {}, epss: {} }
cache.details ??= {}; cache.epss ??= {}
const persist = (): void => { try { writeJsonAtomic(CACHE_FILE, cache) } catch { /* best-effort */ } }

const nvdCalls: number[] = []
const nvdLimit = (): number => (process.env.NVD_API_KEY ? 50 : 5)

async function fetchJson(url: string, headers: Record<string, string> = {}, timeoutMs = 20_000): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'ITO-Endpoint-Dashboard', ...headers }, signal: AbortSignal.timeout(timeoutMs) })
  return { status: res.status, body: res.ok ? await res.json().catch(() => null) : null }
}

/** FIRST EPSS for up to 100 CVEs in one request; cached per CVE. CVEs EPSS does not list are cached as null. */
export async function getEpss(ids: string[], now = Date.now()): Promise<Record<string, EpssScore | null>> {
  const valid = [...new Set(ids.filter(i => CVE_ID.test(i)))].slice(0, 100)
  const missing = valid.filter(id => { const c = cache.epss[id]; return !c || now - c.at > TTL_MS })
  if (missing.length) {
    const { status, body } = await fetchJson(`${EPSS_URL}?cve=${missing.join(',')}`)
    if (status !== 200 || !body) throw new Error(`FIRST EPSS returned HTTP ${status}`)
    const scores = parseEpss(body)
    for (const id of missing) cache.epss[id] = { at: now, value: scores.get(id) ?? null }
    persist()
  }
  return Object.fromEntries(valid.map(id => [id, cache.epss[id]?.value ?? null]))
}

export async function getCveDetail(cve: string, now = Date.now()): Promise<CveDetail> {
  if (!CVE_ID.test(cve)) throw new Error('Invalid CVE id')
  const hit = cache.details[cve]
  if (hit && now - hit.at < (hit.value.nvdStatus === 'error' ? FAIL_TTL_MS : TTL_MS)) return hit.value

  const detail: CveDetail = { cve, fetchedAt: new Date(now).toISOString(), nvd: null, nvdStatus: 'error', epss: null, links: externalLinks(cve) }
  while (nvdCalls.length && now - nvdCalls[0]! > 30_000) nvdCalls.shift()
  if (nvdCalls.length >= nvdLimit()) {
    const wait = Math.ceil((30_000 - (now - nvdCalls[0]!)) / 1000)
    detail.nvdError = `NVD rate limit reached (${nvdLimit()} requests / 30 s without an API key). Try again in about ${wait}s.`
  } else {
    nvdCalls.push(now)
    try {
      const { status, body } = await fetchJson(`${NVD_URL}?cveId=${cve}`, process.env.NVD_API_KEY ? { apiKey: process.env.NVD_API_KEY } : {})
      if (status === 200) {
        detail.nvd = parseNvd(body)
        detail.nvdStatus = detail.nvd ? 'ok' : 'not_found'
      } else detail.nvdError = status === 403 || status === 429 ? 'NVD rate limit reached. Try again in a minute.' : `NVD returned HTTP ${status}.`
    } catch (e) { detail.nvdError = `NVD unreachable: ${e instanceof Error ? e.message : String(e)}` }
  }
  try { detail.epss = (await getEpss([cve], now))[cve] ?? null } catch { /* EPSS is optional; the card shows it as unavailable */ }

  cache.details[cve] = { at: now, value: detail }
  persist()
  return detail
}

export const clearCveDetailCache = (): void => { cache = { details: {}, epss: {} }; nvdCalls.length = 0 }
