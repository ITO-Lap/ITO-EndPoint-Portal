// Security Policies — persistence, group-name resolution/caching, and
// snapshot-diff logic. All Graph I/O lives in securityPoliciesGraph.ts; this
// file only touches PostgreSQL and turns two snapshots into a change list.
//
// Every exported function here guards with isDbAvailable() and throws a
// 503-shaped error when DATABASE_URL is unset, same convention as
// intuneAuditTrail.ts / roleActivity.ts's DB-touching helpers.

import { query, isDbAvailable } from '../db/index.js'
import type { TenantCredentials } from './graphApi.js'
import { getGroupDisplayNames } from './graphApi.js'
import {
  fetchAllSecurityPolicies, collectAssignmentGroupIds,
  CATEGORY_LABELS,
} from './securityPoliciesGraph.js'
import type {
  NormalizedPolicy, SecurityPolicyCategory, SecurityPolicySource,
} from './securityPoliciesGraph.js'

const GROUP_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h — group renames are rare; avoids re-resolving on every sync

function requireDb(): void {
  if (!isDbAvailable()) {
    throw Object.assign(new Error('Security Policies requires a PostgreSQL database (DATABASE_URL) for snapshot storage and change history.'), { status: 503 })
  }
}

// ─── Group name resolution + cache ───────────────────────────────────────────

interface GroupCacheRow { group_id: string; display_name: string; cached_at: Date }

async function resolveGroupNames(creds: TenantCredentials, groupIds: string[]): Promise<Map<string, string>> {
  const resolved = new Map<string, string>()
  if (groupIds.length === 0) return resolved

  if (isDbAvailable()) {
    const cached = await query<GroupCacheRow>(
      `SELECT group_id, display_name, cached_at FROM security_policy_group_cache WHERE group_id = ANY($1)`,
      [groupIds],
    )
    const now = Date.now()
    const stale = new Set(groupIds)
    for (const row of cached.rows) {
      if (now - new Date(row.cached_at).getTime() < GROUP_CACHE_TTL_MS) {
        resolved.set(row.group_id, row.display_name)
        stale.delete(row.group_id)
      }
    }
    if (stale.size > 0) {
      const fresh = await getGroupDisplayNames(creds, [...stale]).catch(() => new Map<string, string>())
      for (const [id, name] of fresh) {
        resolved.set(id, name)
        await query(
          `INSERT INTO security_policy_group_cache (group_id, display_name, cached_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (group_id) DO UPDATE SET display_name = EXCLUDED.display_name, cached_at = NOW()`,
          [id, name],
        ).catch(() => undefined) // cache write failure must not fail the sync
      }
    }
    return resolved
  }

  return getGroupDisplayNames(creds, groupIds).catch(() => new Map<string, string>())
}

function applyGroupNames(policies: NormalizedPolicy[], names: Map<string, string>): NormalizedPolicy[] {
  return policies.map(p => ({
    ...p,
    assignments: p.assignments.map(a => ({
      ...a,
      groupDisplayName: a.groupId ? (names.get(a.groupId) ?? null) : null,
    })),
  }))
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

export interface SyncRunSummary {
  id: string
  status: 'running' | 'success' | 'partial' | 'failed'
  triggeredBy: string
  actorEmail: string | null
  startedAt: string
  completedAt: string | null
  policyCount: number
  sourceErrors: Partial<Record<SecurityPolicyCategory, string>>
  errorMessage: string | null
  added: number
  modified: number
  removed: number
}

interface SyncRunRow {
  id: string
  status: string
  triggered_by: string
  actor_email: string | null
  started_at: Date
  completed_at: Date | null
  policy_count: number
  source_errors: Partial<Record<SecurityPolicyCategory, string>>
  error_message: string | null
}

function rowToSummary(row: SyncRunRow, counts: { added: number; modified: number; removed: number }): SyncRunSummary {
  return {
    id: row.id,
    status: row.status as SyncRunSummary['status'],
    triggeredBy: row.triggered_by,
    actorEmail: row.actor_email,
    startedAt: new Date(row.started_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    policyCount: row.policy_count,
    sourceErrors: row.source_errors ?? {},
    errorMessage: row.error_message,
    ...counts,
  }
}

async function countChanges(syncRunId: string): Promise<{ added: number; modified: number; removed: number }> {
  const res = await query<{ change_type: string; count: string }>(
    `SELECT change_type, COUNT(*) as count FROM security_policy_changes WHERE sync_run_id = $1 GROUP BY change_type`,
    [syncRunId],
  )
  const counts = { added: 0, modified: 0, removed: 0 }
  for (const row of res.rows) {
    if (row.change_type === 'added') counts.added = Number(row.count)
    if (row.change_type === 'modified') counts.modified = Number(row.count)
    if (row.change_type === 'removed') counts.removed = Number(row.count)
  }
  return counts
}

/** A policy's identity across snapshots — the compound key a diff is keyed on. */
function policyKey(p: Pick<NormalizedPolicy, 'source' | 'category' | 'policyId'>): string {
  return `${p.source}::${p.category}::${p.policyId}`
}

const DIFF_FIELDS = ['name', 'description', 'platform', 'technology', 'enabled', 'settings', 'assignments', 'scopeTags'] as const

interface FieldDiff { field: string; oldValue: unknown; newValue: unknown }

function diffPolicy(prev: NormalizedPolicy, curr: NormalizedPolicy): FieldDiff[] {
  const diffs: FieldDiff[] = []
  for (const field of DIFF_FIELDS) {
    const oldValue = prev[field]
    const newValue = curr[field]
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      diffs.push({ field, oldValue, newValue })
    }
  }
  return diffs
}

/** Runs a full Graph pull, snapshots it, diffs against the previous run, and
 *  persists everything. Never throws on a partial Graph failure — a category
 *  that failed just contributes 0 policies and an entry in sourceErrors; the
 *  run is marked 'partial' rather than 'failed' unless every category fails. */
export async function runSecurityPolicySync(
  creds: TenantCredentials,
  actor: { email: string; role: string },
  triggeredBy: 'manual' | 'scheduled' = 'manual',
): Promise<SyncRunSummary> {
  requireDb()

  const runRes = await query<{ id: string; started_at: Date }>(
    `INSERT INTO security_policy_sync_runs (status, triggered_by, actor_email) VALUES ('running', $1, $2) RETURNING id, started_at`,
    [triggeredBy, actor.email],
  )
  const runId = runRes.rows[0]!.id

  try {
    const { policies, sourceErrors } = await fetchAllSecurityPolicies(creds)
    const groupIds = collectAssignmentGroupIds(policies)
    const groupNames = await resolveGroupNames(creds, groupIds)
    const enriched = applyGroupNames(policies, groupNames)

    for (const p of enriched) {
      await query(
        `INSERT INTO security_policy_snapshots
           (sync_run_id, source, category, policy_id, name, description, platform, technology,
            is_enabled, settings, assignments, scope_tags, created_at_source, modified_at_source, raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (sync_run_id, source, category, policy_id) DO NOTHING`,
        [
          runId, p.source, p.category, p.policyId, p.name, p.description, p.platform, p.technology,
          p.enabled, JSON.stringify(p.settings), JSON.stringify(p.assignments), JSON.stringify(p.scopeTags),
          p.createdDateTime, p.modifiedDateTime, JSON.stringify(p.raw),
        ],
      )
    }

    const prevRunRes = await query<{ id: string }>(
      `SELECT id FROM security_policy_sync_runs WHERE id != $1 AND status IN ('success','partial') ORDER BY started_at DESC LIMIT 1`,
      [runId],
    )
    const prevRunId = prevRunRes.rows[0]?.id ?? null

    if (prevRunId) {
      const prevPolicies = await getSnapshotPolicies(prevRunId)
      const prevMap = new Map(prevPolicies.map(p => [policyKey(p), p]))
      const currMap = new Map(enriched.map(p => [policyKey(p), p]))

      for (const [key, curr] of currMap) {
        const prev = prevMap.get(key)
        if (!prev) {
          await insertChange(runId, prevRunId, curr, 'added', [])
        } else {
          const diffs = diffPolicy(prev, curr)
          if (diffs.length > 0) await insertChange(runId, prevRunId, curr, 'modified', diffs)
        }
      }
      for (const [key, prev] of prevMap) {
        if (!currMap.has(key)) await insertChange(runId, prevRunId, prev, 'removed', [])
      }
    }

    const categoryErrorCount = Object.keys(sourceErrors).length
    const status = categoryErrorCount === 0 ? 'success' : (enriched.length > 0 ? 'partial' : 'failed')

    await query(
      `UPDATE security_policy_sync_runs
       SET status = $1, completed_at = NOW(), policy_count = $2, source_errors = $3
       WHERE id = $4`,
      [status, enriched.length, JSON.stringify(sourceErrors), runId],
    )

    const counts = await countChanges(runId)
    const updated = await query<SyncRunRow>(`SELECT * FROM security_policy_sync_runs WHERE id = $1`, [runId])
    return rowToSummary(updated.rows[0]!, counts)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await query(
      `UPDATE security_policy_sync_runs SET status = 'failed', completed_at = NOW(), error_message = $1 WHERE id = $2`,
      [message, runId],
    )
    throw err
  }
}

async function insertChange(
  runId: string, prevRunId: string | null, p: NormalizedPolicy, changeType: 'added' | 'modified' | 'removed', diffs: FieldDiff[],
): Promise<void> {
  await query(
    `INSERT INTO security_policy_changes
       (sync_run_id, previous_sync_run_id, source, category, policy_id, name, change_type, diff)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [runId, prevRunId, p.source, p.category, p.policyId, p.name, changeType, JSON.stringify(diffs)],
  )
}

// ─── Snapshot reads ───────────────────────────────────────────────────────────

interface SnapshotRow {
  id: string
  source: SecurityPolicySource
  category: SecurityPolicyCategory
  policy_id: string
  name: string
  description: string | null
  platform: string | null
  technology: string | null
  is_enabled: boolean | null
  settings: unknown
  assignments: NormalizedPolicy['assignments']
  scope_tags: string[]
  created_at_source: Date | null
  modified_at_source: Date | null
  captured_at: Date
  raw: Record<string, unknown>
}

function rowToNormalized(row: SnapshotRow): NormalizedPolicy {
  return {
    source: row.source, category: row.category, policyId: row.policy_id, name: row.name,
    description: row.description, platform: row.platform, technology: row.technology,
    enabled: row.is_enabled, settings: row.settings, assignments: row.assignments,
    scopeTags: row.scope_tags, createdDateTime: row.created_at_source ? new Date(row.created_at_source).toISOString() : null,
    modifiedDateTime: row.modified_at_source ? new Date(row.modified_at_source).toISOString() : null,
    raw: row.raw,
  }
}

async function getSnapshotPolicies(syncRunId: string): Promise<NormalizedPolicy[]> {
  const res = await query<SnapshotRow>(`SELECT * FROM security_policy_snapshots WHERE sync_run_id = $1`, [syncRunId])
  return res.rows.map(rowToNormalized)
}

export async function getLatestSyncRun(): Promise<SyncRunSummary | null> {
  if (!isDbAvailable()) return null
  const res = await query<SyncRunRow>(
    `SELECT * FROM security_policy_sync_runs ORDER BY started_at DESC LIMIT 1`,
  )
  const row = res.rows[0]
  if (!row) return null
  const counts = await countChanges(row.id)
  return rowToSummary(row, counts)
}

export interface PolicyListItem {
  id: string
  source: SecurityPolicySource
  category: SecurityPolicyCategory
  categoryLabel: string
  policyId: string
  name: string
  description: string | null
  platform: string | null
  technology: string | null
  enabled: boolean | null
  assignmentCount: number
  scopeTags: string[]
  modifiedDateTime: string | null
  capturedAt: string
}

export interface ListFilters {
  source?: SecurityPolicySource | undefined
  category?: SecurityPolicyCategory | undefined
  platform?: string | undefined
  status?: 'enabled' | 'disabled' | 'unknown' | undefined
  search?: string | undefined
  sortBy?: 'name' | 'category' | 'platform' | 'enabled' | 'assignments' | 'modified' | undefined
  sortDirection?: 'asc' | 'desc' | undefined
  page: number
  pageSize: number
}

export interface PolicyListResult {
  items: PolicyListItem[]
  total: number
  latestSyncRunId: string | null
}

async function latestSuccessfulRunId(): Promise<string | null> {
  const res = await query<{ id: string }>(
    `SELECT id FROM security_policy_sync_runs WHERE status IN ('success','partial') ORDER BY started_at DESC LIMIT 1`,
  )
  return res.rows[0]?.id ?? null
}

export async function listPolicies(filters: ListFilters): Promise<PolicyListResult> {
  if (!isDbAvailable()) return { items: [], total: 0, latestSyncRunId: null }
  const runId = await latestSuccessfulRunId()
  if (!runId) return { items: [], total: 0, latestSyncRunId: null }

  const clauses = ['sync_run_id = $1']
  const params: unknown[] = [runId]

  if (filters.source) { params.push(filters.source); clauses.push(`source = $${params.length}`) }
  if (filters.category) { params.push(filters.category); clauses.push(`category = $${params.length}`) }
  if (filters.platform) { params.push(filters.platform); clauses.push(`platform = $${params.length}`) }
  if (filters.status === 'enabled') clauses.push(`is_enabled = true`)
  if (filters.status === 'disabled') clauses.push(`is_enabled = false`)
  if (filters.status === 'unknown') clauses.push(`is_enabled IS NULL`)
  if (filters.search) { params.push(`%${filters.search.toLowerCase()}%`); clauses.push(`LOWER(name) LIKE $${params.length}`) }

  const where = clauses.join(' AND ')
  const countRes = await query<{ count: string }>(`SELECT COUNT(*) as count FROM security_policy_snapshots WHERE ${where}`, params)
  const total = Number(countRes.rows[0]?.count ?? 0)

  const offset = (filters.page - 1) * filters.pageSize
  params.push(filters.pageSize, offset)
  const sortExpression = {
    name: 'name',
    category: 'category',
    platform: 'platform',
    enabled: 'is_enabled',
    assignments: 'jsonb_array_length(assignments)',
    modified: 'modified_at_source',
  }[filters.sortBy ?? 'name']
  const sortDirection = filters.sortDirection === 'desc' ? 'DESC' : 'ASC'
  const res = await query<SnapshotRow>(
    `SELECT * FROM security_policy_snapshots WHERE ${where} ORDER BY ${sortExpression} ${sortDirection} NULLS LAST, name ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )

  const items: PolicyListItem[] = res.rows.map(row => ({
    id: row.id, source: row.source, category: row.category, categoryLabel: CATEGORY_LABELS[row.category],
    policyId: row.policy_id, name: row.name, description: row.description, platform: row.platform,
    technology: row.technology, enabled: row.is_enabled,
    assignmentCount: Array.isArray(row.assignments) ? row.assignments.length : 0,
    scopeTags: row.scope_tags ?? [],
    modifiedDateTime: row.modified_at_source ? new Date(row.modified_at_source).toISOString() : null,
    capturedAt: new Date(row.captured_at).toISOString(),
  }))

  return { items, total, latestSyncRunId: runId }
}

export async function getPolicyDetail(source: SecurityPolicySource, category: SecurityPolicyCategory, policyId: string): Promise<NormalizedPolicy & { capturedAt: string } | null> {
  if (!isDbAvailable()) return null
  const runId = await latestSuccessfulRunId()
  if (!runId) return null
  const res = await query<SnapshotRow>(
    `SELECT * FROM security_policy_snapshots WHERE sync_run_id = $1 AND source = $2 AND category = $3 AND policy_id = $4`,
    [runId, source, category, policyId],
  )
  const row = res.rows[0]
  if (!row) return null
  return { ...rowToNormalized(row), capturedAt: new Date(row.captured_at).toISOString() }
}

export interface ChangeHistoryItem {
  id: string
  syncRunId: string
  source: SecurityPolicySource
  category: SecurityPolicyCategory
  categoryLabel: string
  policyId: string
  name: string
  changeType: 'added' | 'modified' | 'removed'
  diff: FieldDiff[]
  detectedAt: string
}

interface ChangeRow {
  id: string; sync_run_id: string; source: SecurityPolicySource; category: SecurityPolicyCategory
  policy_id: string; name: string; change_type: string; diff: FieldDiff[]; detected_at: Date
}

export async function getChangeHistory(params: { syncRunId?: string | undefined; limit: number }): Promise<ChangeHistoryItem[]> {
  if (!isDbAvailable()) return []
  const clauses: string[] = []
  const args: unknown[] = []
  if (params.syncRunId) { args.push(params.syncRunId); clauses.push(`sync_run_id = $${args.length}`) }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  args.push(params.limit)
  const res = await query<ChangeRow>(
    `SELECT * FROM security_policy_changes ${where} ORDER BY detected_at DESC LIMIT $${args.length}`,
    args,
  )
  return res.rows.map(row => ({
    id: row.id, syncRunId: row.sync_run_id, source: row.source, category: row.category,
    categoryLabel: CATEGORY_LABELS[row.category], policyId: row.policy_id, name: row.name,
    changeType: row.change_type as ChangeHistoryItem['changeType'], diff: row.diff,
    detectedAt: new Date(row.detected_at).toISOString(),
  }))
}

export async function listAllPoliciesForExport(filters: Omit<ListFilters, 'page' | 'pageSize'>): Promise<PolicyListItem[]> {
  const { items } = await listPolicies({ ...filters, page: 1, pageSize: 100_000 })
  return items
}
