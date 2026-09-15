// Role Activity Audit module — frontend HTTP client.
//
// This module talks to /api/role-activity/* on the Express server. The
// backend has no database dependency for this feature: every GET /events
// call fans out live, in parallel, to Microsoft Entra ID, Intune, and
// SharePoint for a bounded date range and returns the merged result
// directly — there is no persistence, no export-job queue, no email
// delivery, and no recurring schedules. All of the DB-backed export-job,
// email-delivery, and recurring-schedule client functions and types that
// used to live here have been removed to match. "Saving" a report
// is now a pure client-side concern — see RoleActivityAuditPage's Save
// button, which builds CSV/JSON from already-fetched events and triggers a
// browser download directly, with no server round-trip for the file.
//
// See server/src/routes/roleActivity.ts for the authoritative contract.
//
// The backend enforces roles via x-user-role/x-user-email headers (see
// server/src/middleware/requireRole.ts for what that does and does not
// guarantee — it is not a substitute for real per-user authentication).
// setRoleActivityActor() below is called once from RoleActivityAuditPage
// with the same viewerRole/userEmail every other page already receives.

const SERVER = import.meta.env.VITE_API_URL ?? ''
const BASE = `${SERVER}/api/role-activity`

let currentRole = 'Global Admin'
let currentEmail = 'admin@zinnia.com'

export function setRoleActivityActor(role: string, email: string): void {
  currentRole = role
  currentEmail = email
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-user-role': currentRole,
      'x-user-email': currentEmail,
      ...(init?.headers ?? {}),
    },
  })
  const body = await res.json() as T & { success: boolean; error?: string }
  if (!res.ok || !body.success) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body
}

function get<T>(path: string): Promise<T> {
  return request<T>(path)
}

// ─── Shared types (mirrors server/src/services/roleActivityTypes.ts) ───────

export type RoleActivitySource = 'entra_role_mgmt' | 'intune_rbac' | 'sharepoint_admin'

export const ROLE_ACTIVITY_SOURCES: RoleActivitySource[] = ['entra_role_mgmt', 'intune_rbac', 'sharepoint_admin']

export const SOURCE_LABELS: Record<RoleActivitySource, string> = {
  entra_role_mgmt: 'Entra ID',
  intune_rbac: 'Intune',
  sharepoint_admin: 'SharePoint',
}

// Row shape returned by GET /events — camelCase, matching
// RoleActivityEventOut in server/src/routes/roleActivity.ts exactly. `id` is
// a synthetic, stable `${source}:${sourceRecordId}` string, not a DB id —
// there is no database backing this anymore.
export interface RoleActivityEvent {
  id: string
  source: RoleActivitySource
  sourceRecordId: string
  occurredAt: string
  actor: string | null
  operation: string | null
  target: string | null
  rawJson: unknown
}

export interface RoleActivityFilters {
  actor?: string
  operation?: string
  target?: string
  search?: string
}

export interface RoleActivityEventsSummary {
  totalEvents: number
  uniqueActors: number
  bySource: Partial<Record<RoleActivitySource, number>>
}

export interface RoleActivityEventsResponse {
  success: boolean
  data: RoleActivityEvent[]
  pagination: { page: number; pageSize: number; total: number }
  summary: RoleActivityEventsSummary
  // The resolved (post-default/clamp) UTC range actually queried.
  range: { startUtc: string; endUtc: string }
  // Present only for sources that failed (e.g. SharePoint not configured, or
  // a Graph call rate-limited/errored) — omitted keys mean that source
  // succeeded. The other sources' events are still returned in `data`; a
  // partial-source failure never fails the whole request.
  sourceErrors?: Partial<Record<RoleActivitySource, string>>
  // Present only when a source auto-adjusted the request rather than failing
  // outright (e.g. Entra narrowing startUtc to the tenant's actual audit-log
  // retention floor) — informational, not an error.
  sourceNotes?: Partial<Record<RoleActivitySource, string>>
  correlationId: string
}

export interface FilterOptions {
  sources: RoleActivitySource[]
  operationsBySource: Record<RoleActivitySource, string[]>
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') usp.set(k, String(v)) })
  return usp.toString()
}

export const roleActivityApi = {
  filterOptions: (): Promise<{ success: boolean; data: FilterOptions }> =>
    get(`/filter-options`),

  // startUtc/endUtc are optional on the server (defaults to trailing 24h
  // ending now) but RoleActivityAuditPage always passes them explicitly so
  // the date-range picker's displayed value stays in sync with what was
  // actually queried.
  listEvents: (params: {
    startUtc?: string; endUtc?: string; timezone: string; source?: RoleActivitySource
    page: number; pageSize: number; sortField: string; sortDirection: 'asc' | 'desc'
  } & RoleActivityFilters): Promise<RoleActivityEventsResponse> =>
    get(`/events?${toQuery(params as unknown as Record<string, string>)}`),
}
