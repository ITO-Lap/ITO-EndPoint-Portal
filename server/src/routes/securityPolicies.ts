// Security Policies — routes.
//
// Read-only browsing + manual sync of Intune device-management policies and
// Entra ID identity/security policies. See server/src/services/
// securityPoliciesGraph.ts (Graph fetch/normalize) and securityPoliciesStore.ts
// (snapshot storage + diff). No write/update/delete action against Graph
// exists anywhere in this module.
//
// Mock/live: when Intune/Entra isn't configured, list/status endpoints
// return success with empty data and `configured: false` — no Graph call is
// made. There is no fabricated mock dataset for this feature (same
// no-mock convention as Intune Scripts & Configurations). A live Graph
// failure on /sync is surfaced as a real error (or a partial-success sync
// run with per-category sourceErrors), never silently replaced with fake
// items.
//
// Requires PostgreSQL (DATABASE_URL) for snapshot storage, diffing, and
// history — without it, /sync, /changes, and list/detail endpoints return a
// configuration-required state (503 for actions, empty+configured:false for
// reads), same degrade-gracefully convention as every other DB-backed
// feature in this app.

import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import { identifyAuditActor, requireAppRole } from '../middleware/requireRole.js'
import { isDbAvailable } from '../db/index.js'
import { getIntuneConfig, getEntraConfig } from '../store/integrationStore.js'
import type { TenantCredentials } from '../services/graphApi.js'
import {
  runSecurityPolicySync, getLatestSyncRun, listPolicies, getPolicyDetail,
  getChangeHistory, listAllPoliciesForExport,
} from '../services/securityPoliciesStore.js'
import type { SecurityPolicyCategory, SecurityPolicySource } from '../services/securityPoliciesGraph.js'
import { INTUNE_CATEGORIES, ENTRA_CATEGORIES } from '../services/securityPoliciesGraph.js'

const router = Router()
router.use(identifyAuditActor)

const READ_ROLES = ['Global Admin', 'IT Admin', 'Helpdesk']
const SYNC_ROLES = ['Global Admin', 'IT Admin']

const ALL_CATEGORY_VALUES = [...INTUNE_CATEGORIES, ...ENTRA_CATEGORIES] as [SecurityPolicyCategory, ...SecurityPolicyCategory[]]

/** This module needs both Intune and Entra Graph credentials (they're
 *  independent categories, each may be configured without the other) — a
 *  sync proceeds with whichever is available; if neither is configured, the
 *  caller gets a configuration-required response instead of a Graph call. */
function tenantCreds(): TenantCredentials | null {
  const intune = getIntuneConfig()
  const entra = getEntraConfig()
  const cfg = intune ?? entra
  if (!cfg) return null
  return { tenantId: cfg.tenantId, clientId: cfg.clientId, clientSecret: cfg.clientSecret }
}

function configured(): boolean {
  return !!getIntuneConfig() || !!getEntraConfig()
}

// ─── GET /policies ────────────────────────────────────────────────────────────
const listQuerySchema = z.object({
  source:   z.enum(['intune', 'entra']).optional(),
  category: z.enum(ALL_CATEGORY_VALUES).optional(),
  platform: z.string().max(40).optional(),
  status:   z.enum(['enabled', 'disabled', 'unknown']).optional(),
  search:   z.string().max(200).optional(),
  page:     z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
})

router.get('/policies', requireAppRole(READ_ROLES), asyncHandler(async (req, res) => {
  const q = listQuerySchema.parse(req.query)
  if (!isDbAvailable() || !configured()) {
    res.json({ success: true, data: [], pagination: { page: q.page, pageSize: q.pageSize, total: 0 }, configured: configured(), latestSyncRunId: null })
    return
  }
  const result = await listPolicies(q)
  res.json({
    success: true, data: result.items,
    pagination: { page: q.page, pageSize: q.pageSize, total: result.total },
    configured: true, latestSyncRunId: result.latestSyncRunId,
  })
}))

// ─── GET /policies/:source/:category/:policyId ──────────────────────────────
router.get('/policies/:source/:category/:policyId', requireAppRole(READ_ROLES), asyncHandler(async (req, res) => {
  const source = req.params.source as SecurityPolicySource
  const category = req.params.category as SecurityPolicyCategory
  if (!['intune', 'entra'].includes(source) || !ALL_CATEGORY_VALUES.includes(category)) {
    throw Object.assign(new Error('Unknown source or category'), { status: 400 })
  }
  if (!isDbAvailable()) throw Object.assign(new Error('Security Policies is not configured'), { status: 503 })

  const detail = await getPolicyDetail(source, category, String(req.params.policyId))
  if (!detail) throw Object.assign(new Error('Policy not found in the latest snapshot'), { status: 404 })
  res.json({ success: true, data: detail })
}))

// ─── GET /sync/status ─────────────────────────────────────────────────────────
router.get('/sync/status', requireAppRole(READ_ROLES), asyncHandler(async (_req, res) => {
  const latest = await getLatestSyncRun()
  res.json({ success: true, data: latest, configured: configured(), dbAvailable: isDbAvailable() })
}))

// ─── POST /sync — manual sync ────────────────────────────────────────────────
router.post('/sync', requireAppRole(SYNC_ROLES), asyncHandler(async (req, res) => {
  const creds = tenantCreds()
  if (!creds) throw Object.assign(new Error('Neither Intune nor Entra ID is configured'), { status: 503 })
  if (!isDbAvailable()) throw Object.assign(new Error('Security Policies requires a PostgreSQL database (DATABASE_URL) for snapshot storage.'), { status: 503 })

  const actor = req.auditActor ?? { email: 'unknown@zinnia.com', appRole: 'End User' }
  const summary = await runSecurityPolicySync(creds, { email: actor.email, role: actor.appRole }, 'manual')
  res.json({ success: true, data: summary })
}))

// ─── GET /changes ─────────────────────────────────────────────────────────────
const changesQuerySchema = z.object({
  syncRunId: z.string().uuid().optional(),
  limit:     z.coerce.number().int().min(1).max(500).default(100),
})

router.get('/changes', requireAppRole(READ_ROLES), asyncHandler(async (req, res) => {
  const q = changesQuerySchema.parse(req.query)
  if (!isDbAvailable()) {
    res.json({ success: true, data: [], configured: configured() })
    return
  }
  const history = await getChangeHistory(q)
  res.json({ success: true, data: history, configured: configured() })
}))

// ─── GET /export?format=json|csv ─────────────────────────────────────────────
const FORMULA_TRIGGER_CHARS = new Set(['=', '+', '-', '@', '\t', '\r'])
function escapeCsvCell(value: string): string {
  let v = value
  if (v.length > 0 && FORMULA_TRIGGER_CHARS.has(v.charAt(0))) v = `'${v}`
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

const exportQuerySchema = listQuerySchema.omit({ page: true, pageSize: true }).extend({
  format: z.enum(['json', 'csv']).default('json'),
})

router.get('/export', requireAppRole(READ_ROLES), asyncHandler(async (req, res) => {
  const q = exportQuerySchema.parse(req.query)
  if (!isDbAvailable() || !configured()) throw Object.assign(new Error('Security Policies is not configured'), { status: 503 })

  const items = await listAllPoliciesForExport(q)
  const timestamp = new Date().toISOString().slice(0, 10)

  if (q.format === 'json') {
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="security-policies-${timestamp}.json"`)
    res.send(JSON.stringify(items, null, 2))
    return
  }

  const columns = ['source', 'category', 'policyId', 'name', 'description', 'platform', 'technology', 'enabled', 'assignmentCount', 'scopeTags', 'modifiedDateTime', 'capturedAt']
  const lines = [columns.map(escapeCsvCell).join(',') + '\r\n']
  for (const item of items) {
    const row = [
      item.source, item.categoryLabel, item.policyId, item.name, item.description ?? '',
      item.platform ?? '', item.technology ?? '', item.enabled === null ? '' : String(item.enabled),
      String(item.assignmentCount), item.scopeTags.join(';'), item.modifiedDateTime ?? '', item.capturedAt,
    ]
    lines.push(row.map(v => escapeCsvCell(String(v))).join(',') + '\r\n')
  }
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="security-policies-${timestamp}.csv"`)
  res.send(lines.join(''))
}))

export default router
