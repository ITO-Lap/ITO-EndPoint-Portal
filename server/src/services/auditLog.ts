// Generic application audit trail — writes to the `audit_logs` table (see
// server/src/db/schema.sql). Promoted out of a copilot.ts-local helper of the
// same shape so other features (starting with notification schedule edits)
// can share one writer instead of each rolling its own insert.

import { isDbAvailable, query } from '../db/index.js'

export interface AuditLogEntry {
  userEmail: string
  action: string
  resourceType: string
  resourceId: string
  oldValue?: unknown
  newValue?: unknown
}

/** No-ops silently when DATABASE_URL isn't set and never throws — an audit
 *  write failure must not block the primary request it's recording. */
export async function recordAuditLog(entry: AuditLogEntry): Promise<void> {
  if (!isDbAvailable()) return
  try {
    await query(
      `INSERT INTO audit_logs (user_email, action, resource_type, resource_id, old_value, new_value)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        entry.userEmail,
        entry.action,
        entry.resourceType,
        entry.resourceId,
        entry.oldValue !== undefined ? JSON.stringify(entry.oldValue) : null,
        entry.newValue !== undefined ? JSON.stringify(entry.newValue) : null,
      ]
    )
  } catch (err) {
    console.error('[auditLog] Failed to record audit entry:', err instanceof Error ? err.message : err)
  }
}
