// Live, request-scoped fetcher for Intune RBAC (role-assignment) activity
// from Microsoft Graph's Intune administrative audit log, reusing the
// chunking/pagination/retry machinery in intuneAuditGraph.ts as-is (no
// modifications to that file) — it already implements everything this
// puller needs: UTC chunk splitting, @odata.nextLink pagination, and
// 429/5xx retry with backoff.
//
// Filters the generic auditEvents stream down to role-assignment-related
// activity: Graph's `category` enum for /deviceManagement/auditEvents
// includes a dedicated 'Role' value (see the old Intune Audit Logs module's
// FILTER_OPTIONS, superseded by this module) for RBAC role-definition/
// assignment changes, which is the primary signal used here.
// `activityOperationType`/`activity`/`displayName` containing "role"
// (case-insensitive) is checked as a secondary net in case a role-adjacent
// event is filed under a different category.
//
// This module was previously a background, watermark-based poller writing
// into Postgres. The database dependency for this feature has been removed:
// this function is now called once per live browse request with an explicit
// [startUtc, endUtc) range and simply returns the matched events — no
// sync-state read/write, no persistence.

import { splitIntoUtcChunks, fetchAuditEventsForChunk, type GraphAuditEvent } from './intuneAuditGraph.js'
import type { RoleActivityEvent, RoleActivityRange } from './roleActivityTypes.js'

export interface PullResult {
  source: 'intune_rbac'
  events: RoleActivityEvent[]
  fetched: number
  matched: number
  error?: string
}

function isRoleRelated(event: GraphAuditEvent): boolean {
  if (event.category === 'Role') return true
  const haystack = [event.activityOperationType, event.activity, event.displayName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes('role')
}

function mapEvent(event: GraphAuditEvent): RoleActivityEvent {
  const firstResource = event.resources?.[0]
  return {
    source: 'intune_rbac',
    sourceRecordId: event.id,
    occurredAt: event.activityDateTime,
    actor: event.actor?.userPrincipalName ?? event.actor?.applicationDisplayName ?? null,
    operation: event.activityOperationType ?? event.activity ?? event.displayName ?? null,
    target: firstResource?.displayName ?? firstResource?.resourceId ?? null,
    rawJson: event,
  }
}

/** Pulls every Intune audit event in the given [startUtc, endUtc) range,
 *  filters to role-related ones, and returns the mapped events directly —
 *  no persistence, no watermark. Never throws: failures are surfaced via
 *  `error` on the result so a single source outage doesn't fail the whole
 *  merged browse request. */
export async function pullIntuneRoleActivity(range: RoleActivityRange): Promise<PullResult> {
  try {
    const rangeStart = new Date(range.startUtc)
    const rangeEnd = new Date(range.endUtc)

    if (rangeEnd <= rangeStart) {
      return { source: 'intune_rbac', events: [], fetched: 0, matched: 0 }
    }

    const chunks = splitIntoUtcChunks(rangeStart, rangeEnd, Number(process.env.INTUNE_AUDIT_CHUNK_DAYS ?? 7))
    let fetched = 0
    const matchedEvents: RoleActivityEvent[] = []

    for (const chunk of chunks) {
      await fetchAuditEventsForChunk(chunk, page => {
        for (const event of page.events) {
          fetched += 1
          if (isRoleRelated(event)) matchedEvents.push(mapEvent(event))
        }
      })
    }

    return { source: 'intune_rbac', events: matchedEvents, fetched, matched: matchedEvents.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[intuneRoleAuditPuller] Pull failed:', message)
    return { source: 'intune_rbac', events: [], fetched: 0, matched: 0, error: message }
  }
}
