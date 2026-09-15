// Role Activity Backup module — routes.
//
// This module has no database dependency. It used to persist admin
// role-management/RBAC/permission-change activity from Entra ID, Intune, and
// SharePoint into Postgres via a background scheduler, with DB-backed browse,
// export-job, email-delivery, and recurring-schedule routes. All of that has
// been removed:
//   - Recurring export schedules and email delivery are gone entirely — with
//     no DB there is nowhere to durably persist schedule config across
//     restarts.
//   - Browsing is now a LIVE query: every GET /events call fans out to the
//     three pullers (Entra Graph, Intune Graph, SharePoint O365 Management
//     Activity API) for the requested range and returns the merged result
//     directly — no persistence, no dedup, no incremental/watermark logic.
//   - Export/"save" is now a pure client-side concern — the frontend
//     generates CSV/JSON from the already-fetched /events response and
//     triggers a browser download. There is no backend export route; the
//     /events response below is designed to carry everything a client-side
//     exporter needs (including the full raw source record per event).
//
// Because this now fans out to 3 upstream APIs per request instead of
// reading one local table, GET /events enforces a bounded max range
// (ROLE_ACTIVITY_LIVE_BROWSE_MAX_DAYS, default 31) — the same kind of cap
// the old (also-removed) Intune-only live audit-browse page used, for the
// same reason: protecting upstream Graph/Management-API rate limits.
//
// requireAuditRole('Audit Reader') gating stays on both routes below — real
// service credentials are still being used to call Microsoft's APIs on the
// caller's behalf, so it's still worth auditing who viewed what.
//
// ─── GET /api/role-activity/events — response contract ─────────────────────
//
// Query params (all optional unless noted):
//   startUtc       ISO-8601 datetime. Defaults to (endUtc - 24h).
//   endUtc         ISO-8601 datetime. Defaults to now.
//                  Range is validated: endUtc must be after startUtc, and the
//                  span must not exceed ROLE_ACTIVITY_LIVE_BROWSE_MAX_DAYS
//                  (default 31) — a 400 is returned if it does.
//   source         One of 'entra_role_mgmt' | 'intune_rbac' | 'sharepoint_admin'.
//   actor          Substring match (case-insensitive) against actor.
//   operation      Substring match (case-insensitive) against operation.
//   target         Substring match (case-insensitive) against target.
//   search         Substring match (case-insensitive) against actor OR
//                  operation OR target.
//   timezone       Passed through only for audit-trail context; does not
//                  affect filtering (default 'UTC').
//   page           1-based page number (default 1).
//   pageSize       Page size, 1-200 (default 25).
//   sortField      One of 'occurredAt' | 'source' | 'actor' | 'operation' | 'target'
//                  (default 'occurredAt').
//   sortDirection  'asc' | 'desc' (default 'desc').
//
// Response body:
//   {
//     success: true,
//     data: RoleActivityEventOut[],   // current page only, see shape below
//     pagination: { page, pageSize, total },  // total = matched-filter count, not just this page
//     summary: { totalEvents, uniqueActors, bySource: Record<string, number> },
//     range: { startUtc, endUtc },    // the resolved (post-default/clamp) ISO range actually queried
//     sourceErrors: {                 // present only for sources that failed; omitted keys = success
//       entra_role_mgmt?: string,
//       intune_rbac?: string,
//       sharepoint_admin?: string,
//     },
//     sourceNotes: {                  // present only when a source auto-adjusted the request
//       entra_role_mgmt?: string,     // (e.g. narrowed startUtc to the tenant's actual retention
//       intune_rbac?: string,         // floor) rather than failing outright — informational, not
//       sharepoint_admin?: string,    // an error.
//     },
//     correlationId: string,
//   }
//
//   RoleActivityEventOut:
//     {
//       id: string,             // synthetic, stable: `${source}:${sourceRecordId}` — not a DB id
//       source: 'entra_role_mgmt' | 'intune_rbac' | 'sharepoint_admin',
//       sourceRecordId: string,
//       occurredAt: string,     // ISO-8601
//       actor: string | null,
//       operation: string | null,
//       target: string | null,
//       rawJson: unknown,       // full raw source record, for client-side export fidelity
//     }
//
// A partial-source failure (e.g. SharePoint not configured, or Graph
// rate-limited beyond retries) does NOT fail the whole request — the other
// sources' events are still returned, and the failure is reported per-source
// in `sourceErrors`.
//
// The three pullers are called in PARALLEL (Promise.all), not sequentially.
// The old background scheduler ran them sequentially deliberately, because
// tick latency didn't matter for an unattended poll loop. That reasoning
// doesn't hold here: this is now a synchronous HTTP request a human is
// waiting on, and the three pullers hit three independent upstream
// APIs/credentials with no shared rate-limit budget — so running them in
// parallel bounds total request latency to the slowest single source instead
// of the sum of all three, at no added correctness risk.

import { Router } from 'express'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { asyncHandler } from '../middleware/errorHandler.js'
import { identifyAuditActor, requireAuditRole } from '../middleware/requireRole.js'
import { getIntuneConfig } from '../store/integrationStore.js'
import { recordAppTrail } from '../services/intuneAuditTrail.js'
import { pullEntraRoleActivity } from '../services/entraRoleAuditPuller.js'
import { pullIntuneRoleActivity } from '../services/intuneRoleAuditPuller.js'
import { pullSharePointRoleActivity } from '../services/sharepointRoleActivityPuller.js'
import type { RoleActivityEvent, RoleActivitySource } from '../services/roleActivityTypes.js'

const router = Router()
router.use(identifyAuditActor)

function tenantId(): string {
  return getIntuneConfig()?.tenantId ?? process.env.INTUNE_TENANT_ID ?? 'default'
}

/** Max span (days) a single live-browse request may cover. Configurable via
 *  ROLE_ACTIVITY_LIVE_BROWSE_MAX_DAYS (default 31) — chosen to match the old
 *  pre-existing Intune-only live-Graph audit page's cap, which existed for
 *  the same reason (bounding live Graph rate-limit exposure per request) —
 *  kept the same here even though this now fans out to 3 APIs per request,
 *  since each source is independently rate-limited and the per-request cost
 *  of a 31-day window has already proven workable for the Intune-only case. */
function liveBrowseMaxDays(): number {
  return Math.max(1, Number(process.env.ROLE_ACTIVITY_LIVE_BROWSE_MAX_DAYS ?? 31))
}

// Default window when startUtc/endUtc are omitted: the trailing 24 hours.
// Role/RBAC-management changes are infrequent, so a full year of history
// dumped in Postgres previously made sense as a background-backed store —
// but as a live per-request fan-out across 3 APIs, defaulting to a narrow,
// cheap window (rather than e.g. 7 or 31 days) keeps the common "what
// happened recently" case fast; callers who want a longer look-back pass
// startUtc/endUtc explicitly (bounded by liveBrowseMaxDays()).
const DEFAULT_RANGE_MS = 24 * 60 * 60 * 1000

const ROLE_ACTIVITY_SOURCES = ['entra_role_mgmt', 'intune_rbac', 'sharepoint_admin'] as const

// Curated, non-exhaustive list of role/RBAC-relevant operation values seen
// per source — for filter-dropdown UX only; the /events route itself does
// free-text substring matching on `operation`, so this list is not an
// enforced allowlist. No DB dependency.
const FILTER_OPTIONS = {
  sources: ROLE_ACTIVITY_SOURCES,
  operationsBySource: {
    entra_role_mgmt: [
      'Add member to role', 'Remove member from role', 'Add eligible member to role',
      'Remove eligible member from role', 'Update role definition', 'Add role definition',
      'Delete role definition', 'Add scoped member to role',
    ],
    intune_rbac: [
      'Create', 'Update', 'Delete', 'Assign', // generic operationType values on category=Role events
    ],
    sharepoint_admin: [
      'AddSiteCollectionAdmin', 'RemoveSiteCollectionAdmin', 'SiteCollectionAdminAdded',
      'SiteCollectionAdminRemoved', 'SitePermissionsModified', 'SiteCollectionPermissionsModified',
      'PermissionLevelModified', 'PermissionLevelAdded', 'PermissionLevelRemoved',
      'AddedToGroup', 'RemovedFromGroup', 'GroupAdded', 'GroupRemoved', 'SharingPermissionsModified',
    ],
  },
}

// GET /api/role-activity/filter-options
router.get('/filter-options', requireAuditRole('Audit Reader'), (_req, res) => {
  res.json({ success: true, data: FILTER_OPTIONS })
})

// ─── Browse (live) ──────────────────────────────────────────────────────────

const SORT_FIELDS = ['occurredAt', 'source', 'actor', 'operation', 'target'] as const

const listQuerySchema = z.object({
  startUtc: z.string().datetime().optional(),
  endUtc: z.string().datetime().optional(),
  source: z.enum(ROLE_ACTIVITY_SOURCES).optional(),
  actor: z.string().max(320).optional(),
  operation: z.string().max(200).optional(),
  target: z.string().max(200).optional(),
  search: z.string().max(200).optional(),
  timezone: z.string().min(1).max(100).default('UTC'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sortField: z.enum(SORT_FIELDS).default('occurredAt'),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
})

interface RoleActivityEventOut {
  id: string
  source: RoleActivitySource
  sourceRecordId: string
  occurredAt: string
  actor: string | null
  operation: string | null
  target: string | null
  rawJson: unknown
}

function toOut(event: RoleActivityEvent): RoleActivityEventOut {
  return { id: `${event.source}:${event.sourceRecordId}`, ...event }
}

function matchesFilters(event: RoleActivityEvent, parsed: z.infer<typeof listQuerySchema>): boolean {
  if (parsed.source && event.source !== parsed.source) return false
  const contains = (haystack: string | null, needle: string) => (haystack ?? '').toLowerCase().includes(needle.toLowerCase())
  if (parsed.actor && !contains(event.actor, parsed.actor)) return false
  if (parsed.operation && !contains(event.operation, parsed.operation)) return false
  if (parsed.target && !contains(event.target, parsed.target)) return false
  if (parsed.search) {
    const needle = parsed.search
    if (!contains(event.actor, needle) && !contains(event.operation, needle) && !contains(event.target, needle)) return false
  }
  return true
}

function compareEvents(a: RoleActivityEvent, b: RoleActivityEvent, field: (typeof SORT_FIELDS)[number], direction: 'asc' | 'desc'): number {
  const av = (field === 'occurredAt' ? a.occurredAt : a[field]) ?? ''
  const bv = (field === 'occurredAt' ? b.occurredAt : b[field]) ?? ''
  const cmp = String(av).localeCompare(String(bv))
  return direction === 'asc' ? cmp : -cmp
}

// GET /api/role-activity/events
router.get('/events', requireAuditRole('Audit Reader'), asyncHandler(async (req, res) => {
  const parsed = listQuerySchema.parse(req.query)
  const correlationId = randomUUID()

  const endUtc = parsed.endUtc ? new Date(parsed.endUtc) : new Date()
  const startUtc = parsed.startUtc ? new Date(parsed.startUtc) : new Date(endUtc.getTime() - DEFAULT_RANGE_MS)

  if (endUtc <= startUtc) throw Object.assign(new Error('endUtc must be after startUtc'), { status: 400 })

  const maxDays = liveBrowseMaxDays()
  const rangeDays = (endUtc.getTime() - startUtc.getTime()) / 86_400_000
  if (rangeDays > maxDays) {
    throw Object.assign(
      new Error(`Requested range spans ${rangeDays.toFixed(1)} days, exceeding the server-configured maximum of ${maxDays} days.`),
      { status: 400 }
    )
  }

  const range = { startUtc: startUtc.toISOString(), endUtc: endUtc.toISOString() }

  // Entra's directoryAudits and Intune's deviceManagement/auditEvents share the same Graph
  // app registration/token and therefore the same per-tenant Graph throttling bucket — firing
  // both at once doubles the immediate burst against that shared budget and was observed to
  // exhaust Intune's retry budget on ordinary first-load traffic. Run them one after another;
  // SharePoint hits a distinct API (manage.office.com, separate throttling) so it still runs
  // fully concurrently with the Graph pair rather than being serialized behind them too.
  const [[entraResult, intuneResult], sharepointResult] = await Promise.all([
    (async () => {
      const entra = await pullEntraRoleActivity(range)
      const intune = await pullIntuneRoleActivity(range)
      return [entra, intune] as const
    })(),
    pullSharePointRoleActivity(range),
  ])

  const sourceErrors: Partial<Record<RoleActivitySource, string>> = {}
  if (entraResult.error) sourceErrors.entra_role_mgmt = entraResult.error
  if (intuneResult.error) sourceErrors.intune_rbac = intuneResult.error
  if (sharepointResult.error) sourceErrors.sharepoint_admin = sharepointResult.error

  const sourceNotes: Partial<Record<RoleActivitySource, string>> = {}
  if (entraResult.note) sourceNotes.entra_role_mgmt = entraResult.note

  const allEvents: RoleActivityEvent[] = [
    ...entraResult.events,
    ...intuneResult.events,
    ...sharepointResult.events,
  ]

  const filtered = allEvents.filter(event => matchesFilters(event, parsed))

  const totalEvents = filtered.length
  const uniqueActors = new Set(filtered.map(e => e.actor).filter((a): a is string => Boolean(a))).size
  const bySource: Record<string, number> = {}
  for (const event of filtered) bySource[event.source] = (bySource[event.source] ?? 0) + 1

  filtered.sort((a, b) => compareEvents(a, b, parsed.sortField, parsed.sortDirection))

  const offset = (parsed.page - 1) * parsed.pageSize
  const page = filtered.slice(offset, offset + parsed.pageSize).map(toOut)

  const hasSourceErrors = Object.keys(sourceErrors).length > 0
  await recordAppTrail({
    tenantId: tenantId(), actorEmail: req.auditActor!.email, actorRole: req.auditActor!.appRole,
    action: 'VIEW_EVENTS', rangeStartUtc: range.startUtc, rangeEndUtc: range.endUtc,
    timezone: parsed.timezone,
    filters: { source: parsed.source, actor: parsed.actor, operation: parsed.operation, target: parsed.target, search: parsed.search },
    success: !hasSourceErrors,
    ...(hasSourceErrors ? { errorMessage: JSON.stringify(sourceErrors) } : {}),
    correlationId,
  })

  res.json({
    success: true,
    data: page,
    pagination: { page: parsed.page, pageSize: parsed.pageSize, total: totalEvents },
    summary: { totalEvents, uniqueActors, bySource },
    range,
    ...(Object.keys(sourceErrors).length > 0 ? { sourceErrors } : {}),
    ...(Object.keys(sourceNotes).length > 0 ? { sourceNotes } : {}),
    correlationId,
  })
}))

export default router

export const __testables = { SORT_FIELDS }
