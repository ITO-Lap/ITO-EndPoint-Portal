// Stale Devices service: background sync of Intune (Windows) and Endpoint Central MDM (Windows + macOS) into a
// normalised in-scope snapshot, cached in memory and on disk. Read-only; page loads never call the sources.
import fs from 'node:fs'
import path from 'node:path'
import { isIntuneConfigured, getIntuneStaleDeviceRecords } from '../intune.js'
import { isManageEngineConfigured, getManageEngineActiveDeviceList } from '../manageEngine.js'
import { classifyEcDevice, classifyIntuneDevice, evaluateDevices } from './normalize.js'
import type { RawEcDevice, RawIntuneDevice } from './normalize.js'
import type { SourceMeta, SourceRecord, StaleDevice, StaleSnapshot, StaleSourceId } from './types.js'

export interface StaleProviders {
  intuneConfigured(): boolean
  ecConfigured(): boolean
  fetchIntune(): Promise<RawIntuneDevice[]>
  fetchEc(): Promise<RawEcDevice[]>
}

export const liveProviders: StaleProviders = {
  intuneConfigured: isIntuneConfigured,
  ecConfigured: isManageEngineConfigured,
  fetchIntune: getIntuneStaleDeviceRecords,
  fetchEc: getManageEngineActiveDeviceList as () => Promise<RawEcDevice[]>,
}

export interface StaleSyncState {
  state: 'idle' | 'syncing' | 'ready' | 'error'
  syncedAt: string | null
  sources: Record<StaleSourceId, SourceMeta>
}

const emptyMeta = (): SourceMeta => ({ state: 'not_configured', lastAttemptAt: null, lastSuccessAt: null, error: null, inScope: 0 })
const emptySnapshot = (): StaleSnapshot => ({ intune: [], endpointCentral: [], meta: { intune: emptyMeta(), 'endpoint-central': emptyMeta() }, syncedAt: null })

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e)).slice(0, 400)

function classifyAll<R>(rows: R[], classify: (r: R) => ReturnType<typeof classifyIntuneDevice>): SourceRecord[] {
  const out: SourceRecord[] = []
  for (const r of rows) { const c = classify(r); if (c.include) out.push(c.record) } // out-of-scope records are discarded here
  return out
}

export interface StaleDevicesServiceOptions {
  providers?: StaleProviders
  now?: () => number
  /** Disk cache path; pass null to disable (tests). */
  cacheFile?: string | null
}

export function createStaleDevicesService(opts: StaleDevicesServiceOptions = {}) {
  const providers = opts.providers ?? liveProviders
  const now = opts.now ?? Date.now
  const cacheFile = opts.cacheFile === undefined ? path.resolve(process.cwd(), '.cache', 'stale-devices.v1.json') : opts.cacheFile

  let snapshot: StaleSnapshot = emptySnapshot()
  let syncing: Promise<void> | null = null
  let lastFailed = false

  if (cacheFile) {
    try {
      const parsed = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as StaleSnapshot
      if (Array.isArray(parsed.intune) && Array.isArray(parsed.endpointCentral) && parsed.meta?.intune && parsed.meta['endpoint-central']) snapshot = parsed
    } catch { /* no usable cache */ }
  }

  let memo: { key: string; devices: StaleDevice[] } | null = null

  function persist(): void {
    if (!cacheFile) return
    try {
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
      fs.writeFileSync(cacheFile, JSON.stringify(snapshot))
    } catch (e) { console.warn('[staleDevices] could not write cache:', errMsg(e)) }
  }

  async function syncSource(id: StaleSourceId): Promise<void> {
    const configured = id === 'intune' ? providers.intuneConfigured() : providers.ecConfigured()
    const meta = snapshot.meta[id]
    const attemptAt = new Date(now()).toISOString()
    if (!configured) {
      if (id === 'intune') snapshot.intune = []; else snapshot.endpointCentral = []
      snapshot.meta[id] = { ...emptyMeta(), lastAttemptAt: attemptAt }
      return
    }
    try {
      const records = id === 'intune'
        ? classifyAll(await providers.fetchIntune(), classifyIntuneDevice)
        : classifyAll(await providers.fetchEc(), classifyEcDevice)
      if (id === 'intune') snapshot.intune = records; else snapshot.endpointCentral = records
      snapshot.meta[id] = { state: 'ok', lastAttemptAt: attemptAt, lastSuccessAt: attemptAt, error: null, inScope: records.length }
    } catch (e) {
      // Keep the previous records for display, but mark the source as failed so stale verdicts that depend on it
      // are sent to review rather than reported as stale.
      snapshot.meta[id] = { ...meta, state: 'error', lastAttemptAt: attemptAt, error: errMsg(e) }
    }
  }

  async function runSync(): Promise<void> {
    await Promise.all([syncSource('intune'), syncSource('endpoint-central')])
    const configured = (['intune', 'endpoint-central'] as const).filter(s => snapshot.meta[s].state !== 'not_configured')
    lastFailed = configured.length > 0 && configured.every(s => snapshot.meta[s].state === 'error')
    snapshot.syncedAt = new Date(now()).toISOString()
    memo = null
    persist()
  }

  return {
    startSync(): Promise<void> {
      if (!syncing) syncing = runSync().finally(() => { syncing = null })
      return syncing
    },
    getState(): StaleSyncState {
      return {
        state: syncing ? 'syncing' : lastFailed ? 'error' : snapshot.syncedAt ? 'ready' : 'idle',
        syncedAt: snapshot.syncedAt, sources: snapshot.meta,
      }
    },
    getSnapshot: (): StaleSnapshot => snapshot,
    /** Evaluates the stale rule against the cached snapshot (no source calls). Memoised per snapshot + minute. */
    devices(): StaleDevice[] {
      const t = now()
      const key = `${snapshot.syncedAt}|${Math.floor(t / 60_000)}`
      if (!memo || memo.key !== key) memo = { key, devices: evaluateDevices({ snapshot, now: t }) }
      return memo.devices
    },
    isStaleSnapshot(maxAgeMs: number): boolean {
      return !snapshot.syncedAt || now() - Date.parse(snapshot.syncedAt) > maxAgeMs
    },
  }
}

export type StaleDevicesService = ReturnType<typeof createStaleDevicesService>

let singleton: StaleDevicesService | null = null
export function getStaleDevicesService(): StaleDevicesService { return (singleton ??= createStaleDevicesService()) }
