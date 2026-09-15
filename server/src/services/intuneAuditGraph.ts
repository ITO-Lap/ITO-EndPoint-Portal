// Microsoft Graph v1.0 client for Intune administrative audit events.
//
//   GET https://graph.microsoft.com/v1.0/deviceManagement/auditEvents
//
// This is the Intune *administrative audit* log — who changed what
// configuration/policy/app/enrollment setting, when, and from what value to
// what value. It is NOT:
//   - Intune reports (deviceManagement/reports/* — pre-aggregated usage data)
//   - Azure Monitor / Log Analytics operational logs (platform-level, not Intune-specific)
//   - Device diagnostic files (deviceManagement/managedDevices/{id}/... logs collected from the device)
//   - Intune Management Extension client logs (local Win32 app-deployment logs on the endpoint)
// Callers must not conflate these.
//
// Required Graph application permission: DeviceManagementConfiguration.Read.All
// (see server/.env.example for why DeviceManagementApps.Read.All alone is
// insufficient — it only covers app-management category events).
//
// Design constraints this module exists to satisfy:
//   - date range split into fixed-size UTC chunks (default 7 days)
//   - every @odata.nextLink followed within a chunk
//   - HTTP 429 honors Retry-After; transient network/5xx retried with
//     exponential backoff + jitter
//   - timeouts via AbortController
//   - never buffers an unbounded number of events — callers consume pages
//     one at a time via the async generator and are expected to stream them
//     to disk/blob rather than collecting them all in an array

import { getAuditGraphToken } from './intuneAuditAuth.js'

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const AUDIT_EVENTS_PATH = '/deviceManagement/auditEvents'

export interface GraphAuditModifiedProperty {
  displayName: string | null
  oldValue: string | null
  newValue: string | null
}

export interface GraphAuditResource {
  displayName: string | null
  type: string | null
  resourceId: string | null
  modifiedProperties: GraphAuditModifiedProperty[]
}

export interface GraphAuditActor {
  type: string | null
  auditActorType?: string | null
  userPermissions: string[] | null
  applicationId: string | null
  applicationDisplayName: string | null
  userPrincipalName: string | null
  servicePrincipalName: string | null
  ipAddress: string | null
  userId: string | null
  remoteTenantId?: string | null
  remoteUserId?: string | null
}

export interface GraphAuditEvent {
  id: string
  displayName: string | null
  componentName: string | null
  actor: GraphAuditActor
  category: string | null
  activity: string | null
  activityDateTime: string
  activityType: string | null
  activityOperationType: string | null
  activityResult: string | null
  correlationId: string | null
  resources: GraphAuditResource[]
}

export interface ChunkRange {
  index: number
  startUtc: Date
  endUtc: Date
}

/** Splits [rangeStart, rangeEnd) into fixed-size, non-overlapping UTC chunks.
 *  Inclusive start / exclusive end on every chunk boundary — this is what
 *  guarantees no duplicated or skipped events at chunk edges (an event whose
 *  activityDateTime falls exactly on a boundary belongs to exactly one chunk). */
export function splitIntoUtcChunks(rangeStartUtc: Date, rangeEndUtc: Date, chunkDays: number): ChunkRange[] {
  if (chunkDays <= 0) throw new Error('chunkDays must be positive')
  if (rangeEndUtc <= rangeStartUtc) throw new Error('rangeEndUtc must be after rangeStartUtc')

  const chunks: ChunkRange[] = []
  const chunkMs = chunkDays * 24 * 60 * 60 * 1000
  let cursor = rangeStartUtc.getTime()
  let index = 0
  const endMs = rangeEndUtc.getTime()

  while (cursor < endMs) {
    const chunkEnd = Math.min(cursor + chunkMs, endMs)
    chunks.push({ index, startUtc: new Date(cursor), endUtc: new Date(chunkEnd) })
    cursor = chunkEnd
    index += 1
  }
  return chunks
}

function isoNoMillis(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** Builds the safe, URL-encoded OData $filter for one chunk. Inclusive start,
 *  exclusive end — callers must not change these operators independently. */
export function buildAuditEventsUrl(startUtc: Date, endUtc: Date, top = 100): string {
  const filter = `activityDateTime ge ${isoNoMillis(startUtc)} and activityDateTime lt ${isoNoMillis(endUtc)}`
  const url = new URL(`${GRAPH_BASE}${AUDIT_EVENTS_PATH}`)
  url.searchParams.set('$filter', filter)
  url.searchParams.set('$orderby', 'activityDateTime asc')
  url.searchParams.set('$top', String(top))
  return url.toString()
}

export interface GraphPageResult {
  events: GraphAuditEvent[]
  nextLink: string | null
}

export interface FetchOptions {
  /** Overall per-request timeout in ms. */
  timeoutMs?: number
  /** Max retry attempts for a single page before giving up. */
  maxRetries?: number
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch
  /** Injectable sleep for tests, avoids real waits. */
  sleepImpl?: (ms: number) => Promise<void>
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function backoffWithJitter(attempt: number): number {
  const base = Math.min(30_000, 500 * 2 ** attempt)
  return base / 2 + Math.random() * (base / 2)
}

export class TransientGraphError extends Error {}
export class FatalGraphError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

/** Fetches a single audit-events page (following one URL, which may already
 *  be a nextLink). Retries transient network errors and 5xx with exponential
 *  backoff + jitter; honors Retry-After on 429. Throws FatalGraphError on
 *  4xx (other than 429) since retrying those cannot succeed. */
export async function fetchAuditEventsPage(url: string, opts: FetchOptions = {}): Promise<GraphPageResult> {
  const timeoutMs = opts.timeoutMs ?? 30_000
  const maxRetries = opts.maxRetries ?? 5
  const doFetch = opts.fetchImpl ?? fetch
  const sleep = opts.sleepImpl ?? defaultSleep

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const token = await getAuditGraphToken()
      const res = await doFetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      })
      clearTimeout(timer)

      if (res.status === 429) {
        const retryAfterHeader = res.headers.get('Retry-After')
        const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : backoffWithJitter(attempt)
        if (attempt >= maxRetries) {
          throw new TransientGraphError('Graph API rate-limited (429) and retries exhausted')
        }
        await sleep(Number.isFinite(retryAfterMs) ? retryAfterMs : backoffWithJitter(attempt))
        continue
      }

      if (res.status >= 500) {
        if (attempt >= maxRetries) {
          throw new TransientGraphError(`Graph API ${res.status} and retries exhausted`)
        }
        await sleep(backoffWithJitter(attempt))
        continue
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new FatalGraphError(sanitizeGraphError(body, res.status), res.status)
      }

      const data = (await res.json()) as { value: GraphAuditEvent[]; '@odata.nextLink'?: string }
      return { events: data.value ?? [], nextLink: data['@odata.nextLink'] ?? null }
    } catch (err) {
      clearTimeout(timer)
      if (err instanceof FatalGraphError) throw err
      lastError = err instanceof Error ? err : new Error(String(err))
      const isAbort = lastError.name === 'AbortError'
      if (attempt >= maxRetries) {
        throw new TransientGraphError(`Graph request failed after ${maxRetries} retries: ${isAbort ? 'timeout' : lastError.message}`)
      }
      await sleep(backoffWithJitter(attempt))
    }
  }

  throw lastError ?? new TransientGraphError('Graph request failed for an unknown reason')
}

// Strips anything that could contain a token/secret from an upstream error
// body before it is ever logged or returned to the UI.
function sanitizeGraphError(body: string, status: number): string {
  const trimmed = body.slice(0, 500)
  const withoutBearer = trimmed.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
  return `Microsoft Graph returned ${status}: ${withoutBearer || 'no error body'}`
}

export interface ChunkFetchResult {
  events: GraphAuditEvent[]
  pagesFetched: number
}

/** Fetches every page for one chunk, following @odata.nextLink until
 *  exhausted. `onPage` is invoked per page so callers can stream events to
 *  disk/blob instead of holding an entire chunk (let alone a whole year) in
 *  memory. `resumeFromLink`, when provided, resumes a chunk that was
 *  interrupted mid-pagination rather than restarting it from page 1. */
export async function fetchAuditEventsForChunk(
  chunk: ChunkRange,
  onPage: (page: GraphPageResult) => Promise<void> | void,
  opts: FetchOptions & { resumeFromLink?: string | null; pageSize?: number } = {}
): Promise<{ pagesFetched: number; eventCount: number }> {
  let url = opts.resumeFromLink ?? buildAuditEventsUrl(chunk.startUtc, chunk.endUtc, opts.pageSize ?? 100)
  let pagesFetched = 0
  let eventCount = 0

  while (url) {
    const page = await fetchAuditEventsPage(url, opts)
    pagesFetched += 1
    eventCount += page.events.length
    await onPage(page)
    url = page.nextLink ?? ''
    if (!url) break
  }

  return { pagesFetched, eventCount }
}
