import { dataFile, readJsonFile, writeJsonAtomic } from './dataDir.js'

// Last successfully read ManageEngine MDM detail per device. Details (encryption, passcode, compliance) change
// rarely, so a sync only needs to re-read devices whose details are older than the TTL — oldest first, so every device
// is refreshed in rotation. This cuts the per-sync call volume from "every device" to a fraction, which is what keeps
// the shared API rate limit from being hit and devices from going unread.

export interface DetailCacheEntry { readAt: number; detail: unknown }
export type DetailCache = Record<string, DetailCacheEntry>

const PERSIST = process.env['NODE_ENV'] !== 'test' && !process.env['VITEST']
const file = (): string => dataFile('cache/me-device-details.v1.json')
const MAX_AGE_MS = 30 * 86_400_000

export const detailCacheEnabled = (): boolean => PERSIST

export function loadDetailCache(path?: string): DetailCache {
  if (!path && !PERSIST) return {}
  const raw = readJsonFile<DetailCache>(path ?? file())
  return raw && typeof raw === 'object' ? raw : {}
}

/** Saves the cache, dropping entries for devices no longer present and anything older than 30 days. */
export function saveDetailCache(cache: DetailCache, keepIds: Set<string>, now = Date.now(), path?: string): void {
  if (!path && !PERSIST) return
  const kept: DetailCache = {}
  for (const [id, e] of Object.entries(cache)) if (keepIds.has(id) && now - e.readAt <= MAX_AGE_MS) kept[id] = e
  try { writeJsonAtomic(path ?? file(), kept, false) } catch (e) { console.warn('[mdmDetailCache] could not save:', e instanceof Error ? e.message : e) }
}

export interface ReadPlan {
  /** Devices whose cached details are still fresh — no call needed. */
  fresh: Map<string, unknown>
  /** Devices to read now: never-read first, then oldest. */
  toRead: string[]
}

export function planDetailReads(ids: string[], cache: DetailCache, now: number, ttlMs: number): ReadPlan {
  const fresh = new Map<string, unknown>()
  const stale: Array<{ id: string; readAt: number }> = []
  for (const id of ids) {
    const e = cache[id]
    if (e && now - e.readAt < ttlMs) fresh.set(id, e.detail)
    else stale.push({ id, readAt: e?.readAt ?? 0 })
  }
  stale.sort((a, b) => a.readAt - b.readAt)
  return { fresh, toRead: stale.map(s => s.id) }
}
