// Server-side Graph execution for the Graph API Runner. The bearer token is obtained and used here and never leaves:
// it is not returned, logged, stored, or included in any error message.

import { getIntuneConfig } from '../store/integrationStore.js'
import { getGraphAccessToken, graphRolesFromToken } from '../services/graphApi.js'
import { explainGraphError, isSafeNextLink, LIMITS, retryAfterSeconds, summarizePage, type NormalizedRequest } from './graphRunnerLib.js'
import { sanitizeLog } from './redaction.js'

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export interface GraphDeps {
  fetchImpl?: FetchLike
  /** Returns a bearer token. Defaults to the configured Intune/Graph app registration. */
  getToken?: () => Promise<string>
  sleep?: (ms: number) => Promise<void>
}

export interface GraphExecution {
  httpStatus: number
  ok: boolean
  durationMs: number
  correlationId?: string
  json?: unknown
  nextLink?: string | null
  pagesFetched: number
  retryAfterSeconds?: number | null
  error?: string
  truncatedByRowLimit?: boolean
}

export class GraphNotConfiguredError extends Error { status = 503; constructor() { super('The Microsoft Graph integration (Intune app registration) is not configured.') } }

export function tenantInfo(): { tenantId: string } | null {
  const cfg = getIntuneConfig()
  return cfg ? { tenantId: cfg.tenantId } : null
}

async function defaultToken(): Promise<string> {
  const cfg = getIntuneConfig()
  if (!cfg) throw new GraphNotConfiguredError()
  return getGraphAccessToken({ tenantId: cfg.tenantId, clientId: cfg.clientId, clientSecret: cfg.clientSecret })
}

/** Application permissions actually granted to the app registration (decoded locally from the token). */
export async function grantedRoles(deps: GraphDeps = {}): Promise<string[]> {
  return graphRolesFromToken(await (deps.getToken ?? defaultToken)())
}

async function readCapped(res: Response): Promise<string> {
  const declared = Number(res.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > LIMITS.maxResponseBytes) throw new Error('The Graph response is larger than the 5 MB limit. Add $select, $filter or a smaller $top.')
  const text = await res.text()
  if (text.length > LIMITS.maxResponseBytes) throw new Error('The Graph response is larger than the 5 MB limit. Add $select, $filter or a smaller $top.')
  return text
}

async function once(deps: Required<GraphDeps>, method: string, url: string, body: unknown): Promise<{ res: Response; text: string; ms: number }> {
  const token = await deps.getToken()
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), LIMITS.timeoutMs)
  const started = Date.now()
  try {
    const res = await deps.fetchImpl(url, {
      method, signal: ac.signal,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ConsistencyLevel: 'eventual', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    return { res, text: await readCapped(res), ms: Date.now() - started }
  } finally { clearTimeout(timer) }
}

const parse = (text: string): unknown => { if (!text) return undefined; try { return JSON.parse(text) } catch { return { raw: sanitizeLog(text, 2000) } } }

/**
 * Executes one validated request. Handles throttling (one automatic retry when Graph asks for ≤5s, otherwise it reports
 * the wait), timeouts and size limits. With `allPages` (GET only) follows same-origin next links up to the page/row caps.
 */
export async function executeGraph(req: NormalizedRequest, opts: { allPages?: boolean; startUrl?: string } = {}, deps: GraphDeps = {}): Promise<GraphExecution> {
  const d: Required<GraphDeps> = { fetchImpl: deps.fetchImpl ?? fetch, getToken: deps.getToken ?? defaultToken, sleep: deps.sleep ?? (ms => new Promise(r => setTimeout(r, ms))) }
  const started = Date.now()
  let url = opts.startUrl ?? req.url
  if (opts.startUrl && !isSafeNextLink(opts.startUrl, req.version)) return { httpStatus: 0, ok: false, durationMs: 0, pagesFetched: 0, error: 'The next-page link does not point at Microsoft Graph and was rejected.' }

  let rows: unknown[] = []
  let last: unknown
  let pages = 0
  let correlationId: string | undefined
  let nextLink: string | null
  let truncated = false

  for (;;) {
    let attempt = 0
    let out: Awaited<ReturnType<typeof once>>
    for (;;) {
      try { out = await once(d, req.method, url, pages === 0 ? req.body : undefined) } catch (e) {
        const aborted = e instanceof Error && e.name === 'AbortError'
        return { httpStatus: 0, ok: false, durationMs: Date.now() - started, pagesFetched: pages, ...(correlationId ? { correlationId } : {}), error: aborted ? `Graph did not respond within ${LIMITS.timeoutMs / 1000}s.` : sanitizeLog(e instanceof Error ? e.message : 'Request failed', 300) }
      }
      const ra = out.res.status === 429 ? retryAfterSeconds(out.res.headers.get('retry-after')) : null
      if (out.res.status === 429 && attempt === 0 && ra !== null && ra <= 5) { attempt++; await d.sleep(ra * 1000); continue }
      break
    }
    const { res, text } = out
    correlationId = res.headers.get('request-id') ?? res.headers.get('client-request-id') ?? correlationId
    const json = parse(text)
    if (!res.ok) {
      const g = (json as { error?: { code?: string; message?: string } } | undefined)?.error
      const ra = retryAfterSeconds(res.headers.get('retry-after'))
      return { httpStatus: res.status, ok: false, durationMs: Date.now() - started, pagesFetched: pages, ...(correlationId ? { correlationId } : {}), json: g ? { error: { code: g.code, message: sanitizeLog(g.message, 500) } } : json,
        error: explainGraphError(res.status, g?.code, g?.message ? sanitizeLog(g.message, 300) : undefined, ra), ...(ra !== null ? { retryAfterSeconds: ra } : {}) }
    }
    pages++
    last = json
    const page = summarizePage(json)
    nextLink = page.nextLink && isSafeNextLink(page.nextLink, req.version) ? page.nextLink : null
    if (!opts.allPages || req.method !== 'GET' || !page.rows) break
    rows = rows.concat(page.rows)
    if (rows.length >= LIMITS.maxRows) { rows = rows.slice(0, LIMITS.maxRows); truncated = Boolean(nextLink) || page.rows.length > 0; break }
    if (!nextLink || pages >= LIMITS.maxPages) break
    url = nextLink
  }
  const combined = opts.allPages && req.method === 'GET' && rows.length ? { ...(last as object), value: rows, '@odata.nextLink': nextLink ?? undefined } : last
  return { httpStatus: 200, ok: true, durationMs: Date.now() - started, pagesFetched: pages, ...(correlationId ? { correlationId } : {}), json: combined, nextLink, ...(truncated ? { truncatedByRowLimit: true } : {}) }
}
