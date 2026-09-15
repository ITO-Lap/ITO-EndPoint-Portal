// Live, request-scoped fetcher for Entra ID role-management activity from
// Microsoft Graph's directory audit log:
//
//   GET https://graph.microsoft.com/v1.0/auditLogs/directoryAudits
//     ?$filter=category eq 'RoleManagement' and activityDateTime ge {start} and activityDateTime le {end}
//     &$orderby=activityDateTime
//
// Reuses getAuditGraphToken() from intuneAuditAuth.ts (same Graph app
// registration, same auth-mode support) and TransientGraphError/
// FatalGraphError from intuneAuditGraph.ts (generic Graph error taxonomy,
// not specific to the auditEvents endpoint) — neither module is modified.
//
// This module was previously a background, watermark-based poller writing
// into Postgres. The database dependency for this feature has been removed:
// this function is now called once per live browse request with an explicit
// [startUtc, endUtc) range and simply returns the matched events — no
// sync-state read/write, no persistence. The bounding of that range (max
// days, default window) is enforced by the caller (routes/roleActivity.ts).
//
// Required Graph application permission: AuditLog.Read.All

import { getAuditGraphToken } from './intuneAuditAuth.js'
import { TransientGraphError, FatalGraphError } from './intuneAuditGraph.js'
import type { RoleActivityEvent, RoleActivityRange } from './roleActivityTypes.js'

interface DirectoryAuditActor {
  userPrincipalName?: string | null
  displayName?: string | null
}

interface DirectoryAuditInitiatedBy {
  user?: DirectoryAuditActor | null
  app?: { displayName?: string | null } | null
}

interface DirectoryAuditTargetResource {
  id?: string | null
  displayName?: string | null
  userPrincipalName?: string | null
  type?: string | null
}

export interface GraphDirectoryAuditRecord {
  id: string
  category: string
  activityDisplayName: string
  activityDateTime: string
  initiatedBy?: DirectoryAuditInitiatedBy
  targetResources?: DirectoryAuditTargetResource[]
  [key: string]: unknown
}

export interface PullResult {
  source: 'entra_role_mgmt'
  events: RoleActivityEvent[]
  fetched: number
  error?: string
  /** Set when the requested range was auto-narrowed to fit the tenant's
   *  actual directory-audit retention window (see MIN_ALLOWED_TIME_RE below) —
   *  informational, not a failure. */
  note?: string
}

// Microsoft Graph enforces a per-tenant retention floor on directoryAudits
// (commonly 30 days, but license-dependent and not discoverable in advance)
// and returns a 400 naming the earliest allowed activityDateTime when a
// request's startUtc falls before it. Rather than fail the whole request —
// the old ROLE_ACTIVITY_LIVE_BROWSE_MAX_DAYS cap (31 days) can legitimately
// exceed a tenant's real retention window — this parses that floor out of
// the error and retries once with startUtc clamped to it.
const MIN_ALLOWED_TIME_RE = /Minimum allowed time for activityDateTime is ([^)]+)\)/i

function parseMinAllowedTime(message: string): Date | null {
  const match = MIN_ALLOWED_TIME_RE.exec(message)
  if (!match) return null
  const parsed = new Date(match[1]!)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function isoNoMillis(iso: string): string {
  return new Date(iso).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function buildUrl(range: RoleActivityRange): string {
  const filter = `category eq 'RoleManagement' and activityDateTime ge ${isoNoMillis(range.startUtc)} and activityDateTime le ${isoNoMillis(range.endUtc)}`
  const url = new URL('https://graph.microsoft.com/v1.0/auditLogs/directoryAudits')
  url.searchParams.set('$filter', filter)
  url.searchParams.set('$orderby', 'activityDateTime asc')
  url.searchParams.set('$top', '200')
  return url.toString()
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function backoffWithJitter(attempt: number): number {
  const base = Math.min(30_000, 500 * 2 ** attempt)
  return base / 2 + Math.random() * (base / 2)
}

/** Fetches one page (URL may already be an @odata.nextLink). Mirrors the
 *  retry-on-429/5xx-with-backoff approach used in intuneAuditGraph.ts's
 *  fetchAuditEventsPage(), reimplemented here since this hits a different
 *  Graph endpoint with a different response shape. */
async function fetchDirectoryAuditsPage(
  url: string,
  maxRetries = 5
): Promise<{ value: GraphDirectoryAuditRecord[]; nextLink: string | null }> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const token = await getAuditGraphToken()
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })

      if (res.status === 429) {
        const retryAfterHeader = res.headers.get('Retry-After')
        const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : backoffWithJitter(attempt)
        if (attempt >= maxRetries) throw new TransientGraphError('Graph API rate-limited (429) and retries exhausted')
        await defaultSleep(Number.isFinite(retryAfterMs) ? retryAfterMs : backoffWithJitter(attempt))
        continue
      }
      if (res.status >= 500) {
        if (attempt >= maxRetries) throw new TransientGraphError(`Graph API ${res.status} and retries exhausted`)
        await defaultSleep(backoffWithJitter(attempt))
        continue
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new FatalGraphError(`Microsoft Graph returned ${res.status}: ${body.slice(0, 500)}`, res.status)
      }

      const data = (await res.json()) as { value: GraphDirectoryAuditRecord[]; '@odata.nextLink'?: string }
      return { value: data.value ?? [], nextLink: data['@odata.nextLink'] ?? null }
    } catch (err) {
      if (err instanceof FatalGraphError) throw err
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt >= maxRetries) {
        throw new TransientGraphError(`Directory audits request failed after ${maxRetries} retries: ${lastError.message}`)
      }
      await defaultSleep(backoffWithJitter(attempt))
    }
  }
  throw lastError ?? new TransientGraphError('Directory audits request failed for an unknown reason')
}

function mapRecord(record: GraphDirectoryAuditRecord): RoleActivityEvent {
  const actor = record.initiatedBy?.user?.userPrincipalName
    ?? record.initiatedBy?.app?.displayName
    ?? null
  const firstTarget = record.targetResources?.[0]
  const target = firstTarget?.userPrincipalName ?? firstTarget?.displayName ?? null

  return {
    source: 'entra_role_mgmt',
    sourceRecordId: record.id,
    occurredAt: record.activityDateTime,
    actor,
    operation: record.activityDisplayName ?? null,
    target,
    rawJson: record,
  }
}

/** Pulls every Entra RoleManagement directory-audit record in the given
 *  [startUtc, endUtc] range and returns the mapped events directly — no
 *  persistence, no watermark. Never throws: failures are surfaced via
 *  `error` on the result so a single source outage doesn't fail the whole
 *  merged browse request. */
async function fetchAll(range: RoleActivityRange): Promise<{ events: RoleActivityEvent[]; fetched: number }> {
  let url: string | null = buildUrl(range)
  let fetched = 0
  const events: RoleActivityEvent[] = []

  while (url) {
    const page = await fetchDirectoryAuditsPage(url)
    for (const record of page.value) {
      fetched += 1
      events.push(mapRecord(record))
    }
    url = page.nextLink
  }
  return { events, fetched }
}

export async function pullEntraRoleActivity(range: RoleActivityRange): Promise<PullResult> {
  try {
    const { events, fetched } = await fetchAll(range)
    return { source: 'entra_role_mgmt', events, fetched }
  } catch (err) {
    if (err instanceof FatalGraphError && err.status === 400) {
      const minAllowed = parseMinAllowedTime(err.message)
      if (minAllowed && minAllowed.getTime() > new Date(range.startUtc).getTime()) {
        try {
          const clampedRange = { startUtc: minAllowed.toISOString(), endUtc: range.endUtc }
          const { events, fetched } = await fetchAll(clampedRange)
          return {
            source: 'entra_role_mgmt', events, fetched,
            note: `Requested range exceeded this tenant's directory-audit retention window — narrowed to start at ${minAllowed.toISOString()}.`,
          }
        } catch (retryErr) {
          const message = retryErr instanceof Error ? retryErr.message : String(retryErr)
          console.error('[entraRoleAuditPuller] Retry after retention-floor clamp failed:', message)
          return { source: 'entra_role_mgmt', events: [], fetched: 0, error: message }
        }
      }
    }
    const message = err instanceof Error ? err.message : String(err)
    console.error('[entraRoleAuditPuller] Pull failed:', message)
    return { source: 'entra_role_mgmt', events: [], fetched: 0, error: message }
  }
}
