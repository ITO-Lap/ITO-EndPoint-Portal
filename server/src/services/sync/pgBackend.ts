// PostgreSQL implementation of SyncBackend (schema: db/migrations/001_sync_architecture.ts).

import { query } from '../../db/index.js'
import { countActiveDevices, loadActiveDevices, upsertDevices } from '../../store/deviceStore.js'
import type { SyncBackend, SourceRow, LogRow, FindingRow, FindingsUpdate } from './backend.js'

interface Row { source: string; module: string; display_name: string; enabled: boolean; interval_minutes: number; last_attempt_at: Date | null; last_success_at: Date | null; last_status: SourceRow['status']; last_error: string | null; last_record_count: number | null; running: boolean }

export const pgBackend: SyncBackend = {
  kind: 'postgres',

  async acquire(source, module, trigger, actor, staleMinutes) {
    // Reclaim a job that died without finishing (process crash): no heartbeat for staleMinutes.
    await query(
      `UPDATE sync_jobs SET status = 'failed', finished_at = NOW(), error = 'Abandoned: the server stopped before this job finished.'
       WHERE source = $1 AND module = $2 AND status = 'running' AND heartbeat_at < NOW() - make_interval(mins => $3)`,
      [source, module, staleMinutes],
    )
    try {
      const r = await query<{ id: string }>('INSERT INTO sync_jobs (source, module, trigger, triggered_by) VALUES ($1,$2,$3,$4) RETURNING id', [source, module, trigger, actor])
      return Number(r.rows[0]!.id)
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return null // another job holds the lock
      throw e
    }
  },

  async heartbeat(jobId) { await query('UPDATE sync_jobs SET heartbeat_at = NOW() WHERE id = $1', [jobId]).catch(() => undefined) },

  async finish({ jobId, source, module, outcome, counts, error, recordCount, imported }) {
    await query(
      `UPDATE sync_jobs SET status = $2, finished_at = NOW(), fetched_count = $3, created_count = $4, updated_count = $5, unchanged_count = $6, deactivated_count = $7, error = $8 WHERE id = $1`,
      [jobId, outcome, counts?.fetched ?? 0, counts?.created ?? 0, counts?.updated ?? 0, counts?.unchanged ?? 0, counts?.retired ?? 0, error],
    )
    if (imported) {
      // Data copied from an on-disk snapshot is shown immediately but is not a live sync: leave the schedule status alone.
      if (recordCount !== null) await query('UPDATE sync_sources SET last_record_count = $3 WHERE source = $1 AND module = $2', [source, module, recordCount])
      return
    }
    // Only a fully successful sync moves last_success_at; the stored data stays as it was after a failure.
    await query(
      `UPDATE sync_sources SET last_attempt_at = NOW(), last_status = $3, last_error = $4,
         last_success_at = CASE WHEN $3 = 'succeeded' THEN NOW() ELSE last_success_at END,
         last_record_count = COALESCE($5, last_record_count)
       WHERE source = $1 AND module = $2`,
      [source, module, outcome, error, recordCount],
    )
  },

  async log(jobId, source, module, level, message, detail) {
    try {
      await query('INSERT INTO sync_logs (job_id, source, module, level, message, detail) VALUES ($1,$2,$3,$4,$5,$6)', [jobId, source, module, level, message.slice(0, 1000), detail === undefined ? null : JSON.stringify(detail)])
    } catch (e) { console.warn('[sync] could not write sync log:', e instanceof Error ? e.message : e) }
  },

  countActive: countActiveDevices,
  loadActive: loadActiveDevices,
  upsert: upsertDevices,

  async recordFindings(jobId, current, assessedPillars) {
    const out: FindingsUpdate = { opened: 0, reopened: 0, updated: 0, unchanged: 0, resolved: 0 }
    const before = new Map<string, { status: string; detail: string; name: string }>()
    for (const r of (await query<{ pillar: string; device_id: string; status: string; detail: string; device_name: string }>('SELECT pillar, device_id, status, detail, device_name FROM security_findings')).rows) {
      before.set(`${r.pillar}:${r.device_id}`, { status: r.status, detail: r.detail, name: r.device_name })
    }
    for (const f of current) {
      const prev = before.get(`${f.pillar}:${f.deviceId}`)
      if (!prev) out.opened++
      else if (prev.status === 'resolved') out.reopened++
      else if (prev.detail !== f.detail || prev.name !== f.deviceName) out.updated++
      else out.unchanged++
    }
    for (let i = 0; i < current.length; i += 400) {
      const part = current.slice(i, i + 400)
      await query(
        `INSERT INTO security_findings (pillar, device_id, device_name, platform, source, detail, status, first_seen_at, last_seen_at, last_job_id)
         SELECT t.pillar, t.device_id, t.device_name, t.platform, t.source, t.detail, 'open', NOW(), NOW(), $7
         FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[]) AS t(pillar, device_id, device_name, platform, source, detail)
         ON CONFLICT (pillar, device_id) DO UPDATE SET
           device_name = EXCLUDED.device_name, platform = EXCLUDED.platform, source = EXCLUDED.source, detail = EXCLUDED.detail,
           reopened_count = security_findings.reopened_count + CASE WHEN security_findings.status = 'resolved' THEN 1 ELSE 0 END,
           status = 'open', resolved_at = NULL, last_seen_at = NOW(), last_job_id = $7`,
        [part.map(f => f.pillar), part.map(f => f.deviceId), part.map(f => f.deviceName), part.map(f => f.platform), part.map(f => f.source), part.map(f => f.detail), jobId],
      )
    }
    if (assessedPillars.length) {
      const r = await query(
        `UPDATE security_findings SET status = 'resolved', resolved_at = NOW()
         WHERE status = 'open' AND pillar = ANY($1::text[]) AND last_job_id IS DISTINCT FROM $2`,
        [assessedPillars, jobId],
      )
      out.resolved = r.rowCount ?? 0
    }
    return out
  },

  async listFindings({ status, pillar, limit = 200 }) {
    const r = await query<{ pillar: string; device_id: string; device_name: string; platform: string; source: string; detail: string; status: 'open' | 'resolved'; first_seen_at: Date; last_seen_at: Date; resolved_at: Date | null; reopened_count: number }>(
      `SELECT pillar, device_id, device_name, platform, source, detail, status, first_seen_at, last_seen_at, resolved_at, reopened_count
       FROM security_findings WHERE ($1::text IS NULL OR status = $1) AND ($2::text IS NULL OR pillar = $2)
       ORDER BY last_seen_at DESC LIMIT $3`,
      [status ?? null, pillar ?? null, limit],
    )
    return r.rows.map((x): FindingRow => ({
      pillar: x.pillar, deviceId: x.device_id, deviceName: x.device_name, platform: x.platform, source: x.source, detail: x.detail, status: x.status,
      firstSeenAt: x.first_seen_at.toISOString(), lastSeenAt: x.last_seen_at.toISOString(), resolvedAt: x.resolved_at?.toISOString() ?? null, reopenedCount: x.reopened_count,
    }))
  },

  async countFindings(status, pillar) {
    const r = await query<{ n: string }>('SELECT COUNT(*) AS n FROM security_findings WHERE status = $1 AND ($2::text IS NULL OR pillar = $2)', [status, pillar ?? null])
    return Number(r.rows[0]?.n ?? 0)
  },

  async getRecord(source, externalId) {
    const r = await query<{ is_active: boolean; retired_at: Date | null; updated_at: Date; payload: import('../../types.js').Device }>('SELECT is_active, retired_at, updated_at, payload FROM devices WHERE source = $1 AND external_id = $2', [source, externalId])
    const x = r.rows[0]
    return x ? { active: x.is_active, retiredAt: x.retired_at?.toISOString() ?? null, updatedAt: x.updated_at.toISOString(), device: x.payload } : null
  },

  async statusRows() {
    const r = await query<Row>(
      `SELECT s.*, EXISTS (SELECT 1 FROM sync_jobs j WHERE j.source = s.source AND j.module = s.module AND j.status = 'running') AS running
       FROM sync_sources s ORDER BY s.source, s.module`,
    )
    return r.rows.map(x => ({
      source: x.source, module: x.module, displayName: x.display_name, enabled: x.enabled, intervalMinutes: x.interval_minutes,
      lastAttemptAt: x.last_attempt_at?.toISOString() ?? null, lastSuccessAt: x.last_success_at?.toISOString() ?? null,
      status: x.last_status, lastError: x.last_error, recordCount: x.last_record_count, running: x.running,
    }))
  },

  async updateSchedule(source, module, patch, actor) {
    await query(
      `UPDATE sync_sources SET enabled = COALESCE($3, enabled), interval_minutes = COALESCE($4, interval_minutes), updated_by = $5, updated_at = NOW() WHERE source = $1 AND module = $2`,
      [source, module, patch.enabled ?? null, patch.intervalMinutes ?? null, actor],
    )
  },

  async recentLogs(source, module, limit) {
    const r = await query<{ id: string; job_id: string | null; source: string; module: string; level: string; message: string; created_at: Date }>(
      `SELECT id, job_id, source, module, level, message, created_at FROM sync_logs
       WHERE ($1::text IS NULL OR source = $1) AND ($2::text IS NULL OR module = $2) ORDER BY id DESC LIMIT $3`,
      [source ?? null, module ?? null, limit],
    )
    return r.rows.map((x): LogRow => ({ id: Number(x.id), jobId: x.job_id ? Number(x.job_id) : null, source: x.source, module: x.module, level: x.level, message: x.message, createdAt: x.created_at.toISOString() }))
  },
}
