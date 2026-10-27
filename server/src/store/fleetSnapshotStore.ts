// Daily fleet-health snapshots — the history that lets reports say what
// changed (week-over-week deltas) instead of only what is true right now.
//
// Persisted to a JSON file (server/.fleet-snapshots.json), one entry per
// calendar day (a second snapshot on the same day replaces the first). Single-
// process-safe only, like the JSON backend of scheduledReportsStore.ts.

import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

export interface FleetSnapshot {
  /** Calendar day the snapshot represents, YYYY-MM-DD (UTC). */
  date: string
  takenAt: string
  total: number
  compliant: number
  warning: number
  nonCompliant: number
  stale: number
  /** null when Patch Manager was unavailable — never recorded as 0. */
  criticalPatchDevices: number | null
  byPlatform: Record<string, number>
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const STORE_FILE = resolve(__dirname, '../../.fleet-snapshots.json')
const MAX_SNAPSHOTS = 120

function load(): FleetSnapshot[] {
  try {
    const parsed = JSON.parse(readFileSync(STORE_FILE, 'utf-8')) as { snapshots?: FleetSnapshot[] }
    return parsed.snapshots ?? []
  } catch {
    return []
  }
}

let snapshots: FleetSnapshot[] = load()

export function listSnapshots(): FleetSnapshot[] {
  return [...snapshots].sort((a, b) => a.date.localeCompare(b.date))
}

export function saveSnapshot(snapshot: FleetSnapshot): void {
  snapshots = [...snapshots.filter(s => s.date !== snapshot.date), snapshot]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_SNAPSHOTS)
  try {
    writeFileSync(STORE_FILE, JSON.stringify({ snapshots }, null, 2), 'utf-8')
  } catch (e) {
    console.error('[fleetSnapshotStore] Failed to persist snapshots:', e)
  }
}

/** Test-only: reset in-memory state without touching the on-disk file. */
export function __resetSnapshotsForTests(initial: FleetSnapshot[] = []): void {
  snapshots = initial
}
