// Live, request-scoped fetcher for SharePoint site-collection-admin /
// permission-level changes via the O365 Management Activity API
// (Audit.SharePoint content type).
//
// UNVALIDATED: this integration has never been exercised against a live
// Azure/M365 tenant (matching the same caveat the old Intune Audit Logs
// module carried for its own untested paths). In particular, the Operation
// filter list below is a best-effort list of SharePoint audit operation
// names associated with admin/permission changes, assembled from Microsoft
// documentation rather than observed real tenant data — it may need
// adjustment (missing values, or wrong casing/spelling) once run against a
// real subscription's content.
//
// Flow (per https://learn.microsoft.com/office/office-365-management-api/office-365-management-activity-api-reference):
//   1. POST .../activity/feed/subscriptions/start?contentType=Audit.SharePoint
//      — idempotent; a tenant already subscribed gets back HTTP 400 with
//      error code AF20024 ("already enabled"), which we treat as success.
//      Called on every pull rather than gated behind a one-time check —
//      it's a single cheap POST and this avoids needing separate bootstrap
//      tooling or persisted "have we subscribed" state. This bootstrap step
//      is still required even in the live-browse model below (without it,
//      the tenant has no content to query at all), so it is NOT
//      DB-dependent and stays as-is.
//   2. GET  .../activity/feed/subscriptions/content?contentType=Audit.SharePoint&startTime=&endTime=
//      — returns a list of { contentUri, contentId, contentType } blobs
//      covering the window.
//   3. GET  {contentUri} for each blob — returns the actual JSON array of
//      audit records.
//
// Auth: reuses ENTRA_TENANT_ID/CLIENT_ID/CLIENT_SECRET via
// getManagementActivityToken() (roleActivityAuth.ts) — a different
// resource/audience (manage.office.com) than Graph.
//
// This module was previously a background, watermark-based poller writing
// into Postgres. The database dependency for this feature has been removed:
// this function is now called once per live browse request with an explicit
// [startUtc, endUtc) range and simply returns the matched events — no
// sync-state read/write, no persistence. The Management Activity API still
// caps a single content query window at 24 hours, so the requested range is
// still split into day-sized windows internally.

import { getManagementActivityToken } from './roleActivityAuth.js'
import { getEntraConfig } from '../store/integrationStore.js'
import type { RoleActivityEvent, RoleActivityRange } from './roleActivityTypes.js'

const MANAGEMENT_API_BASE = 'https://manage.office.com/api/v1.0'
const CONTENT_TYPE = 'Audit.SharePoint'

// Best-effort filter list — see UNVALIDATED note above.
const ADMIN_PERMISSION_OPERATIONS = new Set([
  'AddSiteCollectionAdmin',
  'RemoveSiteCollectionAdmin',
  'SiteCollectionAdminAdded',
  'SiteCollectionAdminRemoved',
  'SitePermissionsModified',
  'SiteCollectionPermissionsModified',
  'PermissionLevelModified',
  'PermissionLevelAdded',
  'PermissionLevelRemoved',
  'AddedToGroup',
  'RemovedFromGroup',
  'GroupAdded',
  'GroupRemoved',
  'SharingPermissionsModified',
])

export interface SharePointAuditRecord {
  Id: string
  CreationTime: string
  Operation: string
  UserId?: string
  ObjectId?: string
  Site?: string
  SiteUrl?: string
  [key: string]: unknown
}

interface ContentBlobPointer {
  contentUri: string
  contentId: string
  contentType: string
}

export interface PullResult {
  source: 'sharepoint_admin'
  events: RoleActivityEvent[]
  fetched: number
  matched: number
  error?: string
}

function requireTenantId(): string {
  const cfg = getEntraConfig()
  if (!cfg) throw new Error('Entra ID credentials not configured — required for the SharePoint Management Activity API puller.')
  return cfg.tenantId
}

async function managementApiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getManagementActivityToken()
  return fetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  })
}

/** Idempotent subscription-start call. The Management Activity API returns
 *  HTTP 400 with error code AF20024 when a subscription already exists —
 *  that response is treated as success, not a failure. */
async function ensureSubscribed(tenantId: string): Promise<void> {
  const url = `${MANAGEMENT_API_BASE}/${tenantId}/activity/feed/subscriptions/start?contentType=${CONTENT_TYPE}`
  const res = await managementApiFetch(url, { method: 'POST' })
  if (res.ok) return

  const body = await res.text().catch(() => '')
  if (res.status === 400 && body.includes('AF20024')) return // already subscribed

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `Management Activity API subscription-start failed (${res.status}): ${body.slice(0, 300)} — ` +
      `this app registration is missing (or lacks admin consent for) the "ActivityFeed.Read" application ` +
      `permission under Office 365 Management APIs. Grant it in Azure AD → App registrations → API permissions.`
    )
  }
  throw new Error(`Management Activity API subscription-start failed (${res.status}): ${body.slice(0, 300)}`)
}

async function fetchContentBlobs(tenantId: string, startTimeIso: string, endTimeIso: string): Promise<ContentBlobPointer[]> {
  const url = new URL(`${MANAGEMENT_API_BASE}/${tenantId}/activity/feed/subscriptions/content`)
  url.searchParams.set('contentType', CONTENT_TYPE)
  url.searchParams.set('startTime', startTimeIso)
  url.searchParams.set('endTime', endTimeIso)

  const blobs: ContentBlobPointer[] = []
  let nextUrl: string | null = url.toString()

  while (nextUrl) {
    const res = await managementApiFetch(nextUrl)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Management Activity API content listing failed (${res.status}): ${body.slice(0, 300)}`)
    }
    const page = (await res.json()) as ContentBlobPointer[]
    blobs.push(...page)
    // The API paginates via a NextPageUri response header, not a body field.
    nextUrl = res.headers.get('NextPageUri')
  }
  return blobs
}

async function fetchContentRecords(contentUri: string): Promise<SharePointAuditRecord[]> {
  const res = await managementApiFetch(contentUri)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Management Activity API content fetch failed (${res.status}): ${body.slice(0, 300)}`)
  }
  return (await res.json()) as SharePointAuditRecord[]
}

function mapRecord(record: SharePointAuditRecord): RoleActivityEvent {
  return {
    source: 'sharepoint_admin',
    sourceRecordId: record.Id,
    occurredAt: record.CreationTime,
    actor: record.UserId ?? null,
    operation: record.Operation ?? null,
    target: record.ObjectId ?? record.Site ?? record.SiteUrl ?? null,
    rawJson: record,
  }
}

/** Pulls every SharePoint audit content blob in the given [startUtc, endUtc)
 *  range, filters to admin/permission-change operations, and returns the
 *  mapped events directly — no persistence, no watermark. Never throws:
 *  failures are surfaced via `error` on the result so a single source
 *  outage doesn't fail the whole merged browse request. */
export async function pullSharePointRoleActivity(range: RoleActivityRange): Promise<PullResult> {
  try {
    const tenantId = requireTenantId()
    await ensureSubscribed(tenantId)

    const startTime = new Date(range.startUtc)
    const endTime = new Date(range.endUtc)

    if (endTime <= startTime) {
      return { source: 'sharepoint_admin', events: [], fetched: 0, matched: 0 }
    }

    // The Management Activity API caps a single content query window at 24
    // hours — split the requested range into day-sized windows.
    const windows: Array<{ start: Date; end: Date }> = []
    let cursor = startTime.getTime()
    const endMs = endTime.getTime()
    const dayMs = 24 * 60 * 60 * 1000
    while (cursor < endMs) {
      const windowEnd = Math.min(cursor + dayMs, endMs)
      windows.push({ start: new Date(cursor), end: new Date(windowEnd) })
      cursor = windowEnd
    }

    let fetched = 0
    const matchedEvents: RoleActivityEvent[] = []

    for (const window of windows) {
      const blobs = await fetchContentBlobs(tenantId, window.start.toISOString(), window.end.toISOString())
      for (const blob of blobs) {
        const records = await fetchContentRecords(blob.contentUri)
        for (const record of records) {
          fetched += 1
          if (ADMIN_PERMISSION_OPERATIONS.has(record.Operation)) {
            matchedEvents.push(mapRecord(record))
          }
        }
      }
    }

    return { source: 'sharepoint_admin', events: matchedEvents, fetched, matched: matchedEvents.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[sharepointRoleActivityPuller] Pull failed:', message)
    return { source: 'sharepoint_admin', events: [], fetched: 0, matched: 0, error: message }
  }
}
