// Background synchronisation of provider data into the sync store (docs/17-database-sync-architecture.md).
// The store is PostgreSQL when one is configured and migrated, otherwise local files: the behaviour is the same.
//
//  - One job per (source, module) at a time (database lock, or in-memory lock for files). A crashed job is
//    reclaimed after STALE_JOB_MINUTES without a heartbeat.
//  - A failed, empty or implausibly small API answer never changes stored data. Only a complete, plausible
//    answer can retire records that stopped appearing.
//  - Errors are stored and shown only after secrets have been removed.
//  - Secrets and tokens are never written to the sync store; credentials stay in the integration settings / environment.

import { fetchSourceDevices } from '../deviceSources.js'
import { loadSourceDevices, type DeviceSource } from '../../store/deviceSnapshotStore.js'
import { isIntuneConfigured } from '../intune.js'
import { isManageEngineConfigured } from '../manageEngine.js'
import { refreshEndpointCentralAppInventory } from '../endpointCentralSoftware.js'
import { refreshPatchData } from '../endpointCentralPatch.js'
import { fileBackend } from './fileBackend.js'
import { getBackend, isDbReady, markDbReady, __setDbReadyForTests, type SourceRow, type SyncModule, type SyncOutcome, type SyncSourceId, type SyncTrigger, type UpsertResult } from './backend.js'
import type { Device } from '../../types.js'
import type { FindingInput } from './backend.js'

export { isDbReady, markDbReady, __setDbReadyForTests }
export type { SyncModule, SyncTrigger, SyncOutcome }

export const STALE_JOB_MINUTES = 10
/** A scan that could not read more than this share of devices is reported as partial. */
export const PARTIAL_FAILURE_RATIO = 0.1
/** If a pull returns fewer than this share of the records already stored, it is treated as partial. */
export const PLAUSIBLE_RATIO = 0.5
const PLAUSIBLE_MIN_STORED = 20

export interface SyncRunResult {
  status: 'started' | 'already_running' | 'not_configured' | 'storage_unavailable'
  outcome?: SyncOutcome
  jobId?: number
  counts?: UpsertResult
  error?: string
}

// ── helpers ────────────────────────────────────────────────────────────────

/** Removes anything that looks like a credential before text is stored or shown. */
export function sanitizeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? 'Unknown error')
  return raw
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, '[redacted-token]')
    .replace(/((?:client_?secret|access_?token|refresh_?token|api_?key|authorization|authtoken|password|secret|token)["']?\s*[:=]\s*["']?)[^\s&"',}]+/gi, '$1[redacted]')
    .replace(/\/\/[^@\s/]+@/g, '//[redacted]@') // user:password@host in a connection string
    .replace(/\b[A-Za-z0-9+/_-]{40,}={0,2}/g, '[redacted]')
    .slice(0, 500)
}

// 'portal' results (security findings) are derived from the connected sources, so they need at least one.
const isConfigured = (source: string): boolean => source === 'intune' ? isIntuneConfigured() : source === 'manageengine' ? isManageEngineConfigured() : isIntuneConfigured() || isManageEngineConfigured()
const key = (source: string, module: string): string => `${source}:${module}`

// In-process joiners: callers that start the same sync while it runs share its result.
const inFlight = new Map<string, Promise<SyncRunResult>>()
const readCacheInvalidators = new Set<() => void>()
export const onDataChanged = (fn: () => void): void => { readCacheInvalidators.add(fn) }

// ── the device module ──────────────────────────────────────────────────────

async function runDeviceSync(source: DeviceSource, jobId: number, devicesOverride?: Device[]): Promise<{ outcome: SyncOutcome; counts: UpsertResult | null; error: string | null }> {
  const store = getBackend()
  const storedBefore = await store.countActive(source)
  let devices: Device[]
  if (devicesOverride) devices = devicesOverride
  else {
    // The previous good list lets ManageEngine keep MDM details it could not re-read this time; prefer the stored copy.
    const prev = storedBefore ? { savedAt: new Date().toISOString(), devices: await store.loadActive(source) } : (() => { const s = loadSourceDevices(source); return s ? { savedAt: s.savedAt, devices: s.devices } : null })()
    devices = await fetchSourceDevices(source, prev)
  }
  await store.heartbeat(jobId)

  if (devices.length === 0 && storedBefore > 0) {
    // An empty answer is never trusted over real stored data.
    return { outcome: 'failed', counts: null, error: `${source} returned no devices; the ${storedBefore} stored records were kept unchanged.` }
  }
  const plausible = !(storedBefore >= PLAUSIBLE_MIN_STORED && devices.length < storedBefore * PLAUSIBLE_RATIO)
  const counts = await store.upsert(source, jobId, devices, plausible)
  if (!plausible) return { outcome: 'partial', counts, error: `${source} returned only ${devices.length} of ${storedBefore} stored devices; records were updated but none were retired.` }
  return { outcome: 'succeeded', counts, error: null }
}

interface ModuleResult { outcome: SyncOutcome; counts: UpsertResult | null; recordCount: number | null; error: string | null }

/** " Main causes: HTTP 404 for 120 devices; rate limited for 12." (the three most common). */
function describeReasons(reasons: Array<{ reason: string; devices: number }> = []): string {
  return reasons.length ? ` Main causes: ${reasons.slice(0, 3).map(x => `${x.reason} for ${x.devices}`).join('; ')}.` : ''
}

/** Application inventory: runs (or joins) the Endpoint Central scan and waits for it. The inventory itself stays in its own cache. */
async function runApplicationsSync(jobId: number): Promise<ModuleResult> {
  const store = getBackend()
  const r = await refreshEndpointCentralAppInventory(() => store.heartbeat(jobId))
  if (r.devices === 0) return { outcome: 'failed', counts: null, recordCount: null, error: 'Endpoint Central listed no client devices to inventory; the last known inventory was kept.' }
  if (r.failed >= r.devices) return { outcome: 'failed', counts: null, recordCount: null, error: `Inventory could not be read for any of the ${r.devices} devices; the last known inventory was kept.${describeReasons(r.failureReasons)}` }
  const partial = r.failed > r.devices * PARTIAL_FAILURE_RATIO
  return {
    outcome: partial ? 'partial' : 'succeeded', counts: null, recordCount: r.apps,
    error: partial ? `Inventory could not be read for ${r.failed} of ${r.devices} devices; their last known inventory is kept.${describeReasons(r.failureReasons)}` : null,
  }
}

/** Patch data: re-reads the patch-system list and the fleet's missing critical patches. */
async function runPatchesSync(): Promise<ModuleResult> {
  const r = await refreshPatchData()
  if (r.systems === 0) return { outcome: 'failed', counts: null, recordCount: null, error: 'Endpoint Central returned no patch systems; the last known patch data was kept.' }
  if (!r.criticalAvailable) {
    // Say what is missing instead of showing numbers that are not real.
    return { outcome: 'partial', counts: null, recordCount: r.systems, error: 'Missing-patch detail is not available through the current API connection (the token lacks the Patch Management scope). Patch system counts were refreshed.' }
  }
  return { outcome: 'succeeded', counts: null, recordCount: r.systems, error: null }
}

/** Share of an open pillar's findings that may vanish in one run before it is treated as a partial read instead of real fixes. */
const FINDINGS_DROP_RATIO = 0.5
const FINDINGS_DROP_MIN_OPEN = 20

/**
 * Security findings history: reads which Security Posture checks are failing for which devices and records when each
 * finding opened, changed, resolved or came back. A pillar that could not be assessed this time (for example Patch
 * Manager data unavailable) is skipped, and one whose findings suddenly almost all vanish is treated as a partial
 * read, so a data outage never shows up as a wave of "resolved" findings.
 */
async function runFindingsSync(jobId: number): Promise<ModuleResult> {
  // Imported on demand: the posture route imports the device route, which imports this engine.
  const { getPostureResult, getPillarDeviceList } = await import('../../routes/securityPosture.js')
  const store = getBackend()
  const posture = await getPostureResult('all', false)
  await store.heartbeat(jobId)

  const current: FindingInput[] = []
  const assessed: string[] = []
  const skipped: string[] = []
  for (const p of posture.pillars) {
    if (p.unavailableReason || p.assessed === 0) { skipped.push(`${p.label} (not assessable)`); continue }
    const rows: FindingInput[] = []
    for (let page = 1; ; page++) {
      const list = await getPillarDeviceList({ pillarId: p.id, source: 'all', status: 'fail', page, pageSize: 500 })
      rows.push(...list.rows.map(r => ({ pillar: p.id, deviceId: r.id, deviceName: r.deviceName, platform: r.platform, source: r.source, detail: r.detail })))
      if (page >= list.totalPages) break
    }
    const openBefore = await store.countFindings('open', p.id)
    if (openBefore >= FINDINGS_DROP_MIN_OPEN && rows.length < openBefore * FINDINGS_DROP_RATIO) {
      skipped.push(`${p.label} (only ${rows.length} of ${openBefore} open findings still seen)`)
      current.push(...rows) // still record what is failing, but resolve nothing for this pillar
      continue
    }
    current.push(...rows)
    assessed.push(p.id)
  }
  if (assessed.length === 0 && current.length === 0) {
    return { outcome: 'failed', counts: null, recordCount: null, error: 'Security posture could not be assessed; the findings history was kept unchanged.' }
  }
  await store.recordFindings(jobId, current, assessed)
  const open = await store.countFindings('open')
  return skipped.length
    ? { outcome: 'partial', counts: null, recordCount: open, error: `Some checks were not fully read, so their findings were not resolved: ${skipped.join('; ')}.` }
    : { outcome: 'succeeded', counts: null, recordCount: open, error: null }
}

export interface RunOptions { trigger: SyncTrigger; actor?: string | null; /** import path: skip the API and write these devices. */ devices?: Device[] }

/** Runs one sync to completion. Never throws: a failure is recorded and returned. */
export function runSync(source: SyncSourceId, module: SyncModule, opts: RunOptions): Promise<SyncRunResult> {
  const k = key(source, module)
  const running = inFlight.get(k)
  if (running) return running
  const p = (async (): Promise<SyncRunResult> => {
    if (!opts.devices && !isConfigured(source)) return { status: 'not_configured' }
    const store = getBackend()
    let jobId: number | null
    try { jobId = await store.acquire(source, module, opts.trigger, opts.actor ?? null, STALE_JOB_MINUTES) }
    catch (e) { return { status: 'storage_unavailable', error: sanitizeError(e) } }
    if (jobId === null) return { status: 'already_running' }

    try {
      await store.log(jobId, source, module, 'info', `Sync started (${opts.trigger}${opts.actor ? ` by ${opts.actor}` : ''}).`)
      let result: ModuleResult
      if (module === 'findings') result = await runFindingsSync(jobId)
      else if (module === 'applications') result = await runApplicationsSync(jobId)
      else if (module === 'patches') result = await runPatchesSync()
      else {
        const d = await runDeviceSync(source as DeviceSource, jobId, opts.devices)
        result = { ...d, recordCount: d.outcome === 'failed' ? null : await store.countActive(source as DeviceSource) }
      }
      const { outcome, counts, error, recordCount: total } = result
      await store.finish({ jobId, source, module, outcome, counts, error, recordCount: total, imported: opts.trigger === 'import' })
      await store.log(jobId, source, module, outcome === 'succeeded' ? 'info' : outcome === 'partial' ? 'warn' : 'error', error ?? 'Sync finished.', counts ?? undefined)
      if (outcome !== 'failed' && module === 'devices') readCacheInvalidators.forEach(fn => fn())
      return { status: 'started', outcome, jobId, ...(counts ? { counts } : {}), ...(error ? { error } : {}) }
    } catch (e) {
      const message = sanitizeError(e)
      await store.finish({ jobId, source, module, outcome: 'failed', counts: null, error: message, recordCount: null, imported: false }).catch(() => undefined)
      await store.log(jobId, source, module, 'error', message)
      console.error(`[sync] ${source}/${module} failed: ${message}`)
      return { status: 'started', outcome: 'failed', jobId, error: message }
    }
  })().finally(() => { inFlight.delete(k) })
  inFlight.set(k, p)
  return p
}

/** Empty store on first start: show the last on-disk snapshot immediately, then let the live sync refresh it. */
export async function importSnapshotsIfEmpty(): Promise<void> {
  for (const source of ['intune', 'manageengine'] as const) {
    if (!isConfigured(source)) continue
    try {
      if (await getBackend().countActive(source) > 0) continue
      // Switching from local files to PostgreSQL: carry over what the file store already holds, else the older on-disk snapshot.
      const fromFiles = getBackend().kind === 'postgres' ? await fileBackend.loadActive(source) : []
      const devices = fromFiles.length ? fromFiles : loadSourceDevices(source)?.devices
      if (devices?.length) await runSync(source, 'devices', { trigger: 'import', actor: fromFiles.length ? 'file-store-import' : 'snapshot-import', devices })
    } catch (e) { console.warn(`[sync] snapshot import for ${source} skipped:`, sanitizeError(e)) }
  }
}

// ── status & configuration ─────────────────────────────────────────────────

export interface SyncSourceStatus extends SourceRow {
  configured: boolean
  /** True when the latest attempt did not fully succeed, so the data shown is from `lastSuccessAt`. */
  stale: boolean
}

export const storageKind = (): 'postgres' | 'file' => getBackend().kind

export async function getSyncStatus(): Promise<SyncSourceStatus[]> {
  return (await getBackend().statusRows()).map(x => ({
    ...x,
    configured: isConfigured(x.source),
    stale: x.status === 'failed' || x.status === 'partial',
  }))
}

export const INTERVAL_LIMITS: Record<SyncModule, { min: number; max: number }> = {
  devices: { min: 15, max: 1440 },
  applications: { min: 60, max: 1440 },  // the scan is rate-limited and takes a long time
  patches: { min: 60, max: 1440 },
  findings: { min: 15, max: 1440 },
}

export async function updateSchedule(source: SyncSourceId, module: SyncModule, patch: { enabled?: boolean; intervalMinutes?: number }, actor: string): Promise<SyncSourceStatus | null> {
  const lim = INTERVAL_LIMITS[module]
  if (patch.intervalMinutes !== undefined && (!Number.isInteger(patch.intervalMinutes) || patch.intervalMinutes < lim.min || patch.intervalMinutes > lim.max)) {
    throw new RangeError(`Interval must be a whole number of minutes between ${lim.min} and ${lim.max}.`)
  }
  await getBackend().updateSchedule(source, module, patch, actor)
  return (await getSyncStatus()).find(s => s.source === source && s.module === module) ?? null
}

export async function recentLogs(source?: string, module?: string, limit = 50) {
  return getBackend().recentLogs(source, module, Math.min(Math.max(limit, 1), 200))
}

// ── scheduling ─────────────────────────────────────────────────────────────

const FAILED_RETRY_MINUTES = 10

/** True when a source is enabled, configured, not running, and its interval (or the failure retry delay) has elapsed. */
export function isDue(s: SyncSourceStatus, now = Date.now()): boolean {
  if (!s.enabled || !s.configured || s.running) return false
  if (!s.lastAttemptAt) return true
  const wait = (s.status === 'failed' ? Math.min(s.intervalMinutes, FAILED_RETRY_MINUTES) : s.intervalMinutes) * 60_000
  return now - Date.parse(s.lastAttemptAt) >= wait
}

let lastTick = 0
/** Starts every due sync in the background and returns at once. Safe to call often (rate-limited, locked). */
export async function startDueSyncs(trigger: SyncTrigger): Promise<number> {
  const now = Date.now()
  if (now - lastTick < 20_000) return 0
  lastTick = now
  try {
    const due = (await getSyncStatus()).filter(s => isDue(s, now) && s.module in INTERVAL_LIMITS)
    // One source's jobs run one after another (they share an API rate limit), the slow inventory scan last.
    const order: Record<string, number> = { devices: 0, patches: 1, applications: 2, findings: 3 }
    const bySource = new Map<string, SyncSourceStatus[]>()
    for (const s of due) bySource.set(s.source, [...(bySource.get(s.source) ?? []), s])
    for (const [source, list] of bySource) {
      const queue = list.sort((a, b) => (order[a.module] ?? 9) - (order[b.module] ?? 9))
      void (async () => { for (const s of queue) await runSync(source as SyncSourceId, s.module as SyncModule, { trigger }) })()
    }
    return due.length
  } catch (e) {
    console.warn('[sync] could not check schedules:', sanitizeError(e))
    return 0
  }
}
export const __resetTickForTests = (): void => { lastTick = 0 }

/** First start on PostgreSQL: keep the schedule choices made while running on files (only where PostgreSQL still has the defaults). */
async function carryOverSchedules(): Promise<void> {
  if (getBackend().kind !== 'postgres') return
  const mine = await getBackend().statusRows()
  for (const f of await fileBackend.statusRows()) {
    const p = mine.find(m => m.source === f.source && m.module === f.module)
    if (p && p.intervalMinutes === 45 && p.enabled && (f.intervalMinutes !== 45 || !f.enabled)) {
      await getBackend().updateSchedule(f.source, f.module, { enabled: f.enabled, intervalMinutes: f.intervalMinutes }, 'file-store-import')
    }
  }
}

let timer: NodeJS.Timeout | undefined
export function startSyncScheduler(): void {
  if (timer) return
  setTimeout(() => { void carryOverSchedules().catch(() => undefined).then(() => importSnapshotsIfEmpty()).finally(() => { void startDueSyncs('startup') }) }, 5_000).unref()
  timer = setInterval(() => { void startDueSyncs('schedule') }, 60_000)
  timer.unref()
}
export function stopSyncScheduler(): void { if (timer) { clearInterval(timer); timer = undefined } }
