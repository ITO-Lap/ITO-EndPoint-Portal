// File-backed counterpart of store/deviceStore.ts: the same incremental rules, applied to an in-memory
// map that the file backend saves under DATA_DIR. Kept pure (no I/O) so it can be tested directly.
//  - Records are keyed by the provider's external ID; a sync never deletes and recreates them.
//  - A record is rewritten only when it is new or its content hash changed.
//  - A record missing from a COMPLETE sync is retired after RETIRE_AFTER_MISSES consecutive misses, never deleted.
//  - Stale / not-stale transitions are recorded as history events.

import type { Device } from '../types.js'
import type { UpsertResult } from './deviceStore.js'
import { hashDevice, RETIRE_AFTER_MISSES } from './deviceHash.js'

export interface DeviceRecord {
  device: Device; hash: string; active: boolean
  firstSeenAt: string; lastSeenAt: string; retiredAt: string | null; updatedAt: string
  missed: number; lastSeenJob: number; lastChangedJob: number
}
export interface StaleEvent { deviceId: string; isStale: boolean; daysSinceCheckIn: number | null; thresholdDays: number; observedAt: string; jobId: number }

const parseTime = (v: unknown): number | null => {
  if (typeof v !== 'string' || !v.trim()) return null
  const t = Date.parse(v)
  return Number.isFinite(t) ? t : null
}

export function applyUpsert(
  records: Map<string, DeviceRecord>,
  incoming: Device[],
  jobId: number,
  complete: boolean,
  now = new Date(),
  retireAfter = RETIRE_AFTER_MISSES,
): UpsertResult {
  const iso = now.toISOString()
  const byId = new Map<string, Device>()
  for (const d of incoming) if (d.id) byId.set(d.id, d) // duplicate prevention: last occurrence wins
  const result: UpsertResult = { fetched: incoming.length, duplicatesInResponse: incoming.length - byId.size, created: 0, updated: 0, unchanged: 0, retired: 0, reactivated: 0 }

  for (const [id, device] of byId) {
    const hash = hashDevice(device)
    const prev = records.get(id)
    if (!prev) {
      records.set(id, { device, hash, active: true, firstSeenAt: iso, lastSeenAt: iso, retiredAt: null, updatedAt: iso, missed: 0, lastSeenJob: jobId, lastChangedJob: jobId })
      result.created++
    } else if (prev.hash !== hash || !prev.active) {
      if (!prev.active) result.reactivated++
      Object.assign(prev, { device, hash, active: true, retiredAt: null, lastSeenAt: iso, updatedAt: iso, missed: 0, lastSeenJob: jobId, lastChangedJob: jobId })
      result.updated++
    } else {
      prev.lastSeenAt = iso; prev.missed = 0; prev.lastSeenJob = jobId // seen, not rewritten
      result.unchanged++
    }
  }

  if (complete) {
    for (const rec of records.values()) {
      if (!rec.active || rec.lastSeenJob === jobId) continue
      rec.missed++
      if (rec.missed >= retireAfter) { rec.active = false; rec.retiredAt = iso; rec.updatedAt = iso; result.retired++ }
    }
  }

  return result
}

/** One event per device whose stale state differs from its last recorded state (first sighting counts only when stale). */
export function staleTransitions(records: Map<string, DeviceRecord>, latest: Map<string, boolean>, jobId: number, staleDays: number, now = new Date()): StaleEvent[] {
  const events: StaleEvent[] = []
  for (const [id, rec] of records) {
    if (!rec.active) continue
    const t = parseTime(rec.device.lastCheckIn)
    const isStale = t !== null && now.getTime() - t > staleDays * 86_400_000
    const before = latest.get(id)
    if ((before === undefined && isStale) || (before !== undefined && before !== isStale)) {
      events.push({ deviceId: id, isStale, daysSinceCheckIn: t === null ? null : Math.floor((now.getTime() - t) / 86_400_000), thresholdDays: staleDays, observedAt: now.toISOString(), jobId })
      latest.set(id, isStale)
    }
  }
  return events
}
