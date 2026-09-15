// Focused tests for the snapshot-diff and group-name-caching logic in
// securityPoliciesStore.ts. PostgreSQL is faked in-memory (keyed by table)
// rather than mocking every individual query call, so the diff algorithm
// itself — the part with real behavior worth verifying — runs against real
// insert/select semantics instead of canned responses.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'

interface FakeRun {
  id: string; status: string; triggered_by: string; actor_email: string | null
  started_at: Date; completed_at: Date | null; policy_count: number
  source_errors: Record<string, string>; error_message: string | null
}
interface FakeSnapshot {
  id: string; sync_run_id: string; source: string; category: string; policy_id: string
  name: string; description: string | null; platform: string | null; technology: string | null
  is_enabled: boolean | null; settings: unknown; assignments: unknown; scope_tags: unknown
  created_at_source: string | null; modified_at_source: string | null; captured_at: Date; raw: unknown
}
interface FakeChange {
  id: string; sync_run_id: string; previous_sync_run_id: string | null; source: string
  category: string; policy_id: string; name: string; change_type: string; diff: unknown; detected_at: Date
}
interface FakeGroupCacheRow { group_id: string; display_name: string; cached_at: Date }

const db = {
  runs: [] as FakeRun[],
  snapshots: [] as FakeSnapshot[],
  changes: [] as FakeChange[],
  groupCache: [] as FakeGroupCacheRow[],
}

function reset() {
  db.runs = []; db.snapshots = []; db.changes = []; db.groupCache = []
}

vi.mock('../../db/index.js', () => ({
  isDbAvailable: () => true,
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    const s = sql.trim().replace(/\s+/g, ' ')

    if (s.startsWith('INSERT INTO security_policy_sync_runs')) {
      const row: FakeRun = {
        id: randomUUID(), status: 'running', triggered_by: params[0] as string, actor_email: params[1] as string,
        started_at: new Date(), completed_at: null, policy_count: 0, source_errors: {}, error_message: null,
      }
      db.runs.push(row)
      return { rows: [{ id: row.id, started_at: row.started_at }] }
    }

    if (s.startsWith('SELECT group_id, display_name, cached_at')) {
      const ids = params[0] as string[]
      return { rows: db.groupCache.filter(r => ids.includes(r.group_id)) }
    }

    if (s.startsWith('INSERT INTO security_policy_group_cache')) {
      const [groupId, displayName] = params as [string, string]
      const existing = db.groupCache.find(r => r.group_id === groupId)
      if (existing) { existing.display_name = displayName; existing.cached_at = new Date() }
      else db.groupCache.push({ group_id: groupId, display_name: displayName, cached_at: new Date() })
      return { rows: [] }
    }

    if (s.startsWith('INSERT INTO security_policy_snapshots')) {
      const [syncRunId, source, category, policyId, name, description, platform, technology,
        isEnabled, settings, assignments, scopeTags, createdAt, modifiedAt, raw] = params as never[]
      db.snapshots.push({
        id: randomUUID(), sync_run_id: syncRunId, source, category, policy_id: policyId, name, description,
        platform, technology, is_enabled: isEnabled, settings: JSON.parse(settings), assignments: JSON.parse(assignments),
        scope_tags: JSON.parse(scopeTags), created_at_source: createdAt, modified_at_source: modifiedAt,
        captured_at: new Date(), raw: JSON.parse(raw),
      })
      return { rows: [] }
    }

    if (s.startsWith("SELECT id FROM security_policy_sync_runs WHERE id != $1")) {
      const [excludeId] = params as [string]
      const prior = db.runs
        .filter(r => r.id !== excludeId && (r.status === 'success' || r.status === 'partial'))
        .sort((a, b) => b.started_at.getTime() - a.started_at.getTime())[0]
      return { rows: prior ? [{ id: prior.id }] : [] }
    }

    if (s.startsWith('SELECT * FROM security_policy_snapshots WHERE sync_run_id = $1')) {
      const [runId] = params as [string]
      return { rows: db.snapshots.filter(r => r.sync_run_id === runId) }
    }

    if (s.startsWith('INSERT INTO security_policy_changes')) {
      const [syncRunId, prevRunId, source, category, policyId, name, changeType, diff] = params as never[]
      db.changes.push({
        id: randomUUID(), sync_run_id: syncRunId, previous_sync_run_id: prevRunId, source, category,
        policy_id: policyId, name, change_type: changeType, diff: JSON.parse(diff), detected_at: new Date(),
      })
      return { rows: [] }
    }

    if (s.startsWith('UPDATE security_policy_sync_runs SET status = $1')) {
      const [status, policyCount, sourceErrors, runId] = params as [string, number, string, string]
      const run = db.runs.find(r => r.id === runId)
      if (run) { run.status = status; run.completed_at = new Date(); run.policy_count = policyCount; run.source_errors = JSON.parse(sourceErrors) }
      return { rows: [] }
    }

    if (s.startsWith("UPDATE security_policy_sync_runs SET status = 'failed'")) {
      const [message, runId] = params as [string, string]
      const run = db.runs.find(r => r.id === runId)
      if (run) { run.status = 'failed'; run.completed_at = new Date(); run.error_message = message }
      return { rows: [] }
    }

    if (s.startsWith('SELECT change_type, COUNT(*)')) {
      const [runId] = params as [string]
      const counts: Record<string, number> = {}
      for (const c of db.changes.filter(c => c.sync_run_id === runId)) counts[c.change_type] = (counts[c.change_type] ?? 0) + 1
      return { rows: Object.entries(counts).map(([change_type, count]) => ({ change_type, count: String(count) })) }
    }

    if (s.startsWith('SELECT * FROM security_policy_sync_runs WHERE id = $1')) {
      const [runId] = params as [string]
      const run = db.runs.find(r => r.id === runId)
      return { rows: run ? [run] : [] }
    }

    throw new Error(`Unhandled fake query: ${s}`)
  }),
}))

vi.mock('../graphApi.js', () => ({
  getGroupDisplayNames: vi.fn(async (_creds: unknown, ids: string[]) => new Map(ids.map(id => [id, `Group ${id}`]))),
}))

const { fetchAllSecurityPolicies } = vi.hoisted(() => ({ fetchAllSecurityPolicies: vi.fn() }))
vi.mock('../securityPoliciesGraph.js', async () => {
  const actual = await vi.importActual<typeof import('../securityPoliciesGraph.js')>('../securityPoliciesGraph.js')
  return { ...actual, fetchAllSecurityPolicies }
})

import { runSecurityPolicySync } from '../securityPoliciesStore.js'
import type { NormalizedPolicy } from '../securityPoliciesGraph.js'

function policy(overrides: Partial<NormalizedPolicy> = {}): NormalizedPolicy {
  return {
    source: 'intune', category: 'deviceConfiguration', policyId: 'p1', name: 'Policy One',
    description: null, platform: 'windows10', technology: null, enabled: null,
    settings: { a: 1 }, assignments: [], scopeTags: [], createdDateTime: null, modifiedDateTime: null,
    raw: { id: 'p1' }, ...overrides,
  }
}

const creds = { tenantId: 't1', clientId: 'c1', clientSecret: 's1' }
const actor = { email: 'admin@zinnia.com', role: 'Global Admin' }

describe('runSecurityPolicySync — snapshot diffing', () => {
  beforeEach(() => { reset(); fetchAllSecurityPolicies.mockReset() })

  it('first sync run produces no changes (nothing to diff against)', async () => {
    fetchAllSecurityPolicies.mockResolvedValue({ policies: [policy()], sourceErrors: {} })
    const summary = await runSecurityPolicySync(creds, actor)
    expect(summary.status).toBe('success')
    expect(summary.policyCount).toBe(1)
    expect(summary.added).toBe(0)
    expect(summary.modified).toBe(0)
    expect(summary.removed).toBe(0)
  })

  it('detects an added policy present in run 2 but not run 1', async () => {
    fetchAllSecurityPolicies.mockResolvedValueOnce({ policies: [policy({ policyId: 'p1' })], sourceErrors: {} })
    await runSecurityPolicySync(creds, actor)

    fetchAllSecurityPolicies.mockResolvedValueOnce({
      policies: [policy({ policyId: 'p1' }), policy({ policyId: 'p2', name: 'Policy Two' })], sourceErrors: {},
    })
    const summary2 = await runSecurityPolicySync(creds, actor)
    expect(summary2.added).toBe(1)
    expect(summary2.removed).toBe(0)
    expect(db.changes.find(c => c.policy_id === 'p2')?.change_type).toBe('added')
  })

  it('detects a removed policy present in run 1 but not run 2', async () => {
    fetchAllSecurityPolicies.mockResolvedValueOnce({ policies: [policy({ policyId: 'p1' }), policy({ policyId: 'p2' })], sourceErrors: {} })
    await runSecurityPolicySync(creds, actor)

    fetchAllSecurityPolicies.mockResolvedValueOnce({ policies: [policy({ policyId: 'p1' })], sourceErrors: {} })
    const summary2 = await runSecurityPolicySync(creds, actor)
    expect(summary2.removed).toBe(1)
    expect(db.changes.find(c => c.policy_id === 'p2')?.change_type).toBe('removed')
  })

  it('detects a modified policy when a diffed field changes and records the field-level diff', async () => {
    fetchAllSecurityPolicies.mockResolvedValueOnce({ policies: [policy({ policyId: 'p1', settings: { a: 1 } })], sourceErrors: {} })
    await runSecurityPolicySync(creds, actor)

    fetchAllSecurityPolicies.mockResolvedValueOnce({ policies: [policy({ policyId: 'p1', settings: { a: 2 } })], sourceErrors: {} })
    const summary2 = await runSecurityPolicySync(creds, actor)
    expect(summary2.modified).toBe(1)
    const change = db.changes.find(c => c.policy_id === 'p1' && c.change_type === 'modified')
    expect(change?.diff).toEqual([{ field: 'settings', oldValue: { a: 1 }, newValue: { a: 2 } }])
  })

  it('does not record a change when nothing differs between two runs', async () => {
    fetchAllSecurityPolicies.mockResolvedValue({ policies: [policy({ policyId: 'p1' })], sourceErrors: {} })
    await runSecurityPolicySync(creds, actor)
    const summary2 = await runSecurityPolicySync(creds, actor)
    expect(summary2.added).toBe(0)
    expect(summary2.modified).toBe(0)
    expect(summary2.removed).toBe(0)
  })

  it('marks the run partial (not failed) when some categories error but policies were still captured', async () => {
    fetchAllSecurityPolicies.mockResolvedValue({ policies: [policy()], sourceErrors: { securityBaseline: 'Graph 403' } })
    const summary = await runSecurityPolicySync(creds, actor)
    expect(summary.status).toBe('partial')
    expect(summary.sourceErrors.securityBaseline).toBe('Graph 403')
  })

  it('resolves and caches assignment group display names', async () => {
    fetchAllSecurityPolicies.mockResolvedValue({
      policies: [policy({ assignments: [{ kind: 'include', targetType: 'group', groupId: 'g1', groupDisplayName: null, filterId: null, filterType: null }] })],
      sourceErrors: {},
    })
    await runSecurityPolicySync(creds, actor)
    expect(db.snapshots[0]?.assignments).toEqual([
      { kind: 'include', targetType: 'group', groupId: 'g1', groupDisplayName: 'Group g1', filterId: null, filterType: null },
    ])
    expect(db.groupCache.find(r => r.group_id === 'g1')?.display_name).toBe('Group g1')
  })
})
