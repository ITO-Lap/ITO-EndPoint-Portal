// PostgreSQL device store: the database-first copy of what Intune and Endpoint Central returned.
//
// Rules this file enforces (see docs/17-database-sync-architecture.md):
//  - Records are keyed by (source, provider external ID); a sync never deletes and recreates them.
//  - A row is written only when it is new or its content hash changed; unchanged rows are not rewritten.
//  - A record missing from a COMPLETE sync is retired (is_active = false) after RETIRE_AFTER_MISSES
//    consecutive misses, never deleted. A partial or failed sync retires nothing.
//  - Stale / not-stale transitions are recorded as history rows.

import { hashDevice, RETIRE_AFTER_MISSES } from './deviceHash.js'
import { query } from '../db/index.js'
import { STALE_DAYS } from '../services/staleDevices/types.js'
import type { Device } from '../types.js'
import type { DeviceSource } from './deviceSnapshotStore.js'

export { hashDevice, RETIRE_AFTER_MISSES }
const BATCH = 400

const asTimestamp = (v: unknown): string | null => {
  if (typeof v !== 'string' || !v.trim()) return null
  const t = Date.parse(v)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

export interface UpsertResult {
  fetched: number
  duplicatesInResponse: number
  created: number
  updated: number
  unchanged: number
  retired: number
  reactivated: number
}

const chunk = <T,>(items: T[], n = BATCH): T[][] => Array.from({ length: Math.ceil(items.length / n) }, (_, i) => items.slice(i * n, i * n + n))

/**
 * Writes one source's devices incrementally. `complete` must be true only when the API read finished and
 * the count looks plausible; only then are missing records counted toward retirement.
 */
export async function upsertDevices(source: DeviceSource, jobId: number, incoming: Device[], complete: boolean): Promise<UpsertResult> {
  // Duplicate prevention inside one response: the last occurrence of an external ID wins.
  const byId = new Map<string, Device>()
  for (const d of incoming) if (d.id) byId.set(d.id, d)
  const devices = [...byId.values()]
  const result: UpsertResult = { fetched: incoming.length, duplicatesInResponse: incoming.length - devices.length, created: 0, updated: 0, unchanged: 0, retired: 0, reactivated: 0 }

  const existing = new Map<string, { hash: string; active: boolean }>()
  const rows = await query<{ external_id: string; payload_hash: string; is_active: boolean }>('SELECT external_id, payload_hash, is_active FROM devices WHERE source = $1', [source])
  for (const r of rows.rows) existing.set(r.external_id, { hash: r.payload_hash, active: r.is_active })

  const changed: Array<{ d: Device; hash: string }> = []
  for (const d of devices) {
    const hash = hashDevice(d)
    const prev = existing.get(d.id)
    if (!prev || prev.hash !== hash || !prev.active) changed.push({ d, hash })
    if (prev && !prev.active) result.reactivated++
  }
  result.unchanged = devices.length - changed.length

  for (const part of chunk(changed)) {
    const res = await query<{ inserted: boolean }>(
      `INSERT INTO devices (source, external_id, device_name, serial_number, platform, os_version, user_name, compliance_state, last_check_in, payload, payload_hash, is_active, last_seen_at, updated_at)
       SELECT $1, t.external_id, t.device_name, t.serial_number, t.platform, t.os_version, t.user_name, t.compliance_state, NULLIF(t.last_check_in, '')::timestamptz, t.payload::jsonb, t.payload_hash, true, NOW(), NOW()
       FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::text[])
            AS t(external_id, device_name, serial_number, platform, os_version, user_name, compliance_state, last_check_in, payload, payload_hash)
       ON CONFLICT (source, external_id) DO UPDATE SET
         device_name = EXCLUDED.device_name, serial_number = EXCLUDED.serial_number, platform = EXCLUDED.platform, os_version = EXCLUDED.os_version,
         user_name = EXCLUDED.user_name, compliance_state = EXCLUDED.compliance_state, last_check_in = EXCLUDED.last_check_in,
         payload = EXCLUDED.payload, payload_hash = EXCLUDED.payload_hash, is_active = true, retired_at = NULL, last_seen_at = NOW(), updated_at = NOW()
       WHERE devices.payload_hash IS DISTINCT FROM EXCLUDED.payload_hash OR devices.is_active = false
       RETURNING (xmax = 0) AS inserted`,
      [
        source,
        part.map(p => p.d.id), part.map(p => p.d.deviceName ?? ''), part.map(p => p.d.serialNumber ?? ''), part.map(p => p.d.platform ?? ''),
        part.map(p => p.d.osVersion ?? ''), part.map(p => p.d.user ?? ''), part.map(p => p.d.complianceState ?? ''),
        part.map(p => asTimestamp(p.d.lastCheckIn) ?? ''), part.map(p => JSON.stringify(p.d)), part.map(p => p.hash),
      ],
    )
    for (const r of res.rows) { if (r.inserted) result.created++; else result.updated++ }
  }

  // Every record the API returned counts as seen in this job; changed ones also record when they changed.
  const seen = devices.map(d => d.id)
  const changedIds = changed.map(c => c.d.id)
  for (const part of chunk(seen, 1000)) {
    await query('UPDATE devices SET last_seen_at = NOW() WHERE source = $1 AND external_id = ANY($2::text[])', [source, part])
    await query(
      `INSERT INTO device_sync_state (device_id, last_seen_job_id, missed_syncs)
       SELECT id, $3, 0 FROM devices WHERE source = $1 AND external_id = ANY($2::text[])
       ON CONFLICT (device_id) DO UPDATE SET last_seen_job_id = $3, missed_syncs = 0`,
      [source, part, jobId],
    )
  }
  for (const part of chunk(changedIds, 1000)) {
    await query('UPDATE device_sync_state SET last_changed_job_id = $3, last_changed_at = NOW() WHERE device_id IN (SELECT id FROM devices WHERE source = $1 AND external_id = ANY($2::text[]))', [source, part, jobId])
  }

  if (complete) result.retired = await retireMissing(source, jobId)
  await recordStaleTransitions(source, jobId)
  return result
}

async function retireMissing(source: DeviceSource, jobId: number): Promise<number> {
  const missed = await query<{ device_id: string; missed_syncs: number }>(
    `WITH missing AS (
       SELECT d.id FROM devices d LEFT JOIN device_sync_state s ON s.device_id = d.id
       WHERE d.source = $1 AND d.is_active AND s.last_seen_job_id IS DISTINCT FROM $2)
     INSERT INTO device_sync_state (device_id, missed_syncs) SELECT id, 1 FROM missing
     ON CONFLICT (device_id) DO UPDATE SET missed_syncs = device_sync_state.missed_syncs + 1
     RETURNING device_id, missed_syncs`,
    [source, jobId],
  )
  const toRetire = missed.rows.filter(r => r.missed_syncs >= RETIRE_AFTER_MISSES).map(r => r.device_id)
  if (!toRetire.length) return 0
  const res = await query('UPDATE devices SET is_active = false, retired_at = NOW(), updated_at = NOW() WHERE id = ANY($1::bigint[]) AND is_active', [toRetire])
  return res.rowCount ?? toRetire.length
}

/** One history row whenever a device crosses the stale threshold in either direction. */
async function recordStaleTransitions(source: DeviceSource, jobId: number): Promise<void> {
  await query(
    `WITH cur AS (
       SELECT id, COALESCE(last_check_in < NOW() - make_interval(days => $2), false) AS is_stale,
              CASE WHEN last_check_in IS NULL THEN NULL ELSE FLOOR(EXTRACT(EPOCH FROM (NOW() - last_check_in)) / 86400)::int END AS days
       FROM devices WHERE source = $1 AND is_active),
     latest AS (SELECT DISTINCT ON (device_id) device_id, is_stale FROM stale_device_status ORDER BY device_id, observed_at DESC, id DESC)
     INSERT INTO stale_device_status (device_id, is_stale, days_since_check_in, threshold_days, job_id)
     SELECT c.id, c.is_stale, c.days, $2, $3 FROM cur c LEFT JOIN latest l ON l.device_id = c.id
     WHERE (l.device_id IS NULL AND c.is_stale) OR (l.device_id IS NOT NULL AND l.is_stale <> c.is_stale)`,
    [source, STALE_DAYS, jobId],
  )
}

export async function countActiveDevices(source: DeviceSource): Promise<number> {
  const r = await query<{ n: string }>('SELECT COUNT(*) AS n FROM devices WHERE source = $1 AND is_active', [source])
  return Number(r.rows[0]?.n ?? 0)
}

/** Active devices as the app's Device objects, optionally for one source. */
export async function loadActiveDevices(source?: DeviceSource): Promise<Device[]> {
  const r = source
    ? await query<{ payload: Device }>('SELECT payload FROM devices WHERE is_active AND source = $1 ORDER BY id', [source])
    : await query<{ payload: Device }>('SELECT payload FROM devices WHERE is_active ORDER BY id')
  return r.rows.map(x => x.payload)
}
