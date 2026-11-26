// Optional public-web fallback for Ocean. OFF by default (an administrator switches it on in Settings → Ocean Knowledge).
// It is only used when the project documentation has no answer, only sends a minimal keyword query (never the user's
// sentence, names, e-mail addresses, ids or anything credential-like), and everything it returns is labelled external:
// it is never presented as verified project documentation.
//
// Default provider needs no key: Microsoft Learn's public search (Intune, Entra, Graph, Defender, Windows docs).
// Optional keyed providers: Brave Search, Google Programmable Search.

import { contentWords } from './search.js'
import { redactSecrets } from './knowledgeRules.js'
import { scrubSecrets } from '../copilotTools.js'

export type WebProvider = 'microsoft-learn' | 'brave' | 'google-cse' | 'off'
export interface WebResult { title: string; url: string; snippet: string }
export interface WebOutcome { provider: WebProvider; label: string; results: WebResult[]; error?: string; query: string }

const TIMEOUT_MS = 5000
const MAX_RESULTS = 3

export function webProvider(env: NodeJS.ProcessEnv = process.env): { provider: WebProvider; ready: boolean; label: string; reason?: string } {
  const wanted = (env['OCEAN_WEB_SEARCH_PROVIDER'] ?? 'microsoft-learn').trim().toLowerCase()
  if (wanted === 'off' || wanted === 'none') return { provider: 'off', ready: false, label: 'Off' }
  if (wanted === 'brave') return env['BRAVE_SEARCH_API_KEY'] ? { provider: 'brave', ready: true, label: 'Brave Search' } : { provider: 'brave', ready: false, label: 'Brave Search', reason: 'BRAVE_SEARCH_API_KEY is not set' }
  if (wanted === 'google-cse') return env['GOOGLE_CSE_KEY'] && env['GOOGLE_CSE_ID'] ? { provider: 'google-cse', ready: true, label: 'Google Programmable Search' } : { provider: 'google-cse', ready: false, label: 'Google Programmable Search', reason: 'GOOGLE_CSE_KEY and GOOGLE_CSE_ID are not set' }
  return { provider: 'microsoft-learn', ready: true, label: 'Microsoft Learn' }
}

/** Looks like something that must not leave the network: e-mail, GUID, IP, long id, hostname with digits, token-like string. */
const SENSITIVE_WORD = /@|^[0-9a-f]{8}-[0-9a-f]{4}-|^\d{1,3}(?:\.\d{1,3}){3}$|^\d{6,}$|^(?=.*\d)(?=.*[a-z])[a-z0-9_-]{9,}$|^[a-z0-9._-]+\.(?:com|net|org|io|local|corp|internal)$/i

/** A short keyword query from the question — never the sentence itself. Empty when nothing safe remains. */
export function buildWebQuery(question: string): string {
  // Remove e-mail addresses (and anything address-shaped) before words are split, so no fragment of one survives.
  const stripped = redactSecrets(scrubSecrets(question)).replace(/\S+@\S+/g, ' ').replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, ' ')
  // Dotted tokens are user names, hosts or file names; they identify people and machines, so they are dropped.
  const words = contentWords(stripped).filter(w => !w.includes('.') && !SENSITIVE_WORD.test(w))
  return [...new Set(words)].slice(0, 8).join(' ')
}

const clean = (text: unknown, max: number): string => redactSecrets(scrubSecrets(String(text ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())).slice(0, max)
const safeUrl = (u: unknown): string | null => { try { const url = new URL(String(u)); return url.protocol === 'https:' ? url.toString() : null } catch { return null } }

function toResults(rows: Array<{ title?: unknown; url?: unknown; snippet?: unknown }>): WebResult[] {
  return rows.flatMap(r => { const url = safeUrl(r.url); const title = clean(r.title, 140); return url && title ? [{ title, url, snippet: clean(r.snippet, 240) }] : [] }).slice(0, MAX_RESULTS)
}

export async function webSearch(question: string, env: NodeJS.ProcessEnv = process.env): Promise<WebOutcome> {
  const info = webProvider(env)
  const query = buildWebQuery(question)
  const base = { provider: info.provider, label: info.label, query }
  if (!info.ready) return { ...base, results: [], error: info.reason ?? 'web search is switched off' }
  if (!query) return { ...base, results: [], error: 'no safe search terms in the question' }
  const opts: RequestInit = { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'application/json' } }
  try {
    let res: Response
    if (info.provider === 'microsoft-learn') {
      res = await fetch(`https://learn.microsoft.com/api/search?search=${encodeURIComponent(query)}&locale=en-us&$top=${MAX_RESULTS}`, opts)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json() as { results?: Array<{ title?: string; url?: string; description?: string }> }
      return { ...base, results: toResults((body.results ?? []).map(r => ({ title: r.title, url: r.url, snippet: r.description }))) }
    }
    if (info.provider === 'brave') {
      res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${MAX_RESULTS}`, { ...opts, headers: { Accept: 'application/json', 'X-Subscription-Token': env['BRAVE_SEARCH_API_KEY'] ?? '' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } }
      return { ...base, results: toResults((body.web?.results ?? []).map(r => ({ title: r.title, url: r.url, snippet: r.description }))) }
    }
    res = await fetch(`https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(env['GOOGLE_CSE_KEY'] ?? '')}&cx=${encodeURIComponent(env['GOOGLE_CSE_ID'] ?? '')}&q=${encodeURIComponent(query)}&num=${MAX_RESULTS}`, opts)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json() as { items?: Array<{ title?: string; link?: string; snippet?: string }> }
    return { ...base, results: toResults((body.items ?? []).map(r => ({ title: r.title, url: r.link, snippet: r.snippet }))) }
  } catch (e) {
    // Never echo the provider URL (it can contain a key): report only what failed.
    return { ...base, results: [], error: e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'the search timed out' : 'the search service was unavailable' }
  }
}
