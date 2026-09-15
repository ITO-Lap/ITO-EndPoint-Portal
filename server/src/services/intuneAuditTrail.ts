// Immutable application-level audit trail for the Intune Audit Logs module.
// Insert-only — no function here updates or deletes a row, and no route
// exposes such an operation. See schema.sql's comment on
// intune_audit_app_trail for the DB-level note on enforcing this further.

import { query, isDbAvailable } from '../db/index.js'

export interface AppTrailEntry {
  tenantId: string
  actorEmail: string
  actorRole: string
  action:
    | 'VIEW_EVENTS' | 'CREATE_EXPORT' | 'DOWNLOAD_EXPORT' | 'SEND_EMAIL'
    | 'CREATE_SCHEDULE' | 'UPDATE_SCHEDULE' | 'DELETE_SCHEDULE' | 'RUN_SCHEDULE'
  jobId?: string
  scheduleId?: string
  rangeStartUtc?: string
  rangeEndUtc?: string
  timezone?: string
  filters?: object
  recipients?: string[]
  blobPath?: string
  checksum?: string
  eventCount?: number
  chunkCount?: number
  pageCount?: number
  success: boolean
  errorMessage?: string
  correlationId: string
}

export async function recordAppTrail(entry: AppTrailEntry): Promise<void> {
  if (!isDbAvailable()) return
  try {
    await query(
      `INSERT INTO intune_audit_app_trail
         (tenant_id, actor_email, actor_role, action, job_id, schedule_id,
          range_start_utc, range_end_utc, timezone, filters, recipients,
          blob_path, checksum, event_count, chunk_count, page_count,
          success, error_message, correlation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [
        entry.tenantId, entry.actorEmail, entry.actorRole, entry.action,
        entry.jobId ?? null, entry.scheduleId ?? null,
        entry.rangeStartUtc ?? null, entry.rangeEndUtc ?? null, entry.timezone ?? null,
        entry.filters ? JSON.stringify(entry.filters) : null,
        entry.recipients ? JSON.stringify(entry.recipients) : null,
        entry.blobPath ?? null, entry.checksum ?? null,
        entry.eventCount ?? null, entry.chunkCount ?? null, entry.pageCount ?? null,
        entry.success, entry.errorMessage ?? null, entry.correlationId,
      ]
    )
  } catch (err) {
    // The app trail must never block or fail the primary request — but a
    // failure to record it is itself worth knowing about.
    console.error('[intuneAuditTrail] Failed to record app trail entry:', err instanceof Error ? err.message : err)
  }
}
