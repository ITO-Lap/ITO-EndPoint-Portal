// Where sync state and device records live. Two implementations behave identically:
//   pgBackend   PostgreSQL (when a connection is configured and migrated at start-up)
//   fileBackend JSON files under DATA_DIR (default; works with no database at all)
// The engine, routes and screens only talk to this interface, so adding PostgreSQL later changes
// where data is kept, not how the tool behaves.

import { isDbAvailable } from '../../db/index.js'
import type { Device } from '../../types.js'
import type { DeviceSource } from '../../store/deviceSnapshotStore.js'
import type { UpsertResult } from '../../store/deviceStore.js'
import { fileBackend } from './fileBackend.js'
import { pgBackend } from './pgBackend.js'

export type SyncModule = 'devices' | 'applications' | 'patches' | 'findings'
/** Where a sync gets its data: a provider, or 'portal' for results the portal derives itself (security findings). */
export type SyncSourceId = DeviceSource | 'portal'
export type SyncTrigger = 'schedule' | 'manual' | 'startup' | 'dashboard' | 'import'
export type SyncOutcome = 'succeeded' | 'partial' | 'failed'
export type { UpsertResult }

export interface SourceRow {
  source: string; module: string; displayName: string; enabled: boolean; intervalMinutes: number
  lastAttemptAt: string | null; lastSuccessAt: string | null
  status: 'never' | 'succeeded' | 'partial' | 'failed'
  lastError: string | null; recordCount: number | null; running: boolean
}

export interface LogRow { id: number; jobId: number | null; source: string; module: string; level: string; message: string; createdAt: string }

export interface FindingInput { pillar: string; deviceId: string; deviceName: string; platform: string; source: string; detail: string }
export interface FindingRow extends FindingInput { status: 'open' | 'resolved'; firstSeenAt: string; lastSeenAt: string; resolvedAt: string | null; reopenedCount: number }
export interface FindingsUpdate { opened: number; reopened: number; updated: number; unchanged: number; resolved: number }

export interface StoredRecord { active: boolean; retiredAt: string | null; updatedAt: string; device: Device }

export interface FinishArgs {
  jobId: number; source: string; module: string; outcome: SyncOutcome
  counts: UpsertResult | null; error: string | null; recordCount: number | null
  /** Data copied from an on-disk snapshot: shown at once, but not a live sync. */
  imported: boolean
}

export interface SyncBackend {
  readonly kind: 'postgres' | 'file'
  /** Takes the one-running-job-per-source/module lock; null when another job holds it. Reclaims jobs that died. */
  acquire(source: string, module: string, trigger: SyncTrigger, actor: string | null, staleMinutes: number): Promise<number | null>
  heartbeat(jobId: number): Promise<void>
  finish(a: FinishArgs): Promise<void>
  log(jobId: number | null, source: string, module: string, level: 'info' | 'warn' | 'error', message: string, detail?: unknown): Promise<void>
  countActive(source: DeviceSource): Promise<number>
  loadActive(source?: DeviceSource): Promise<Device[]>
  upsert(source: DeviceSource, jobId: number, devices: Device[], complete: boolean): Promise<UpsertResult>
  /**
   * Records the checks that are failing now. Findings of `assessedPillars` that are no longer failing are resolved;
   * findings of any other pillar are left alone (that check could not be assessed this time).
   */
  recordFindings(jobId: number, current: FindingInput[], assessedPillars: string[]): Promise<FindingsUpdate>
  listFindings(opts: { status?: 'open' | 'resolved'; pillar?: string; limit?: number }): Promise<FindingRow[]>
  countFindings(status: 'open' | 'resolved', pillar?: string): Promise<number>
  /** One stored record with its sync bookkeeping (diagnostics and tests). */
  getRecord(source: DeviceSource, externalId: string): Promise<StoredRecord | null>
  statusRows(): Promise<SourceRow[]>
  updateSchedule(source: string, module: string, patch: { enabled?: boolean; intervalMinutes?: number }, actor: string): Promise<void>
  recentLogs(source: string | undefined, module: string | undefined, limit: number): Promise<LogRow[]>
}

// Set once PostgreSQL migrations have been applied at start-up; until then (or with no PostgreSQL) files are used.
let pgReady = false
export const markDbReady = (): void => { pgReady = true }
export const isDbReady = (): boolean => pgReady && isDbAvailable()
export const __setDbReadyForTests = (v: boolean): void => { pgReady = v }

let override: SyncBackend | null = null
export const __setBackendForTests = (b: SyncBackend | null): void => { override = b }

export function getBackend(): SyncBackend {
  return override ?? (isDbReady() ? pgBackend : fileBackend)
}

const isTest = (): boolean => process.env['NODE_ENV'] === 'test' || !!process.env['VITEST']
/** Whether screens read devices from the sync store first. Always, except under tests (which use the live-fetch path). */
export const storeFirstEnabled = (): boolean => override !== null || isDbReady() || !isTest()
