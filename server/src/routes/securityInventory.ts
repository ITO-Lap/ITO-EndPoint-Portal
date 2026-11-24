import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { fetchAllDevices } from './devices.js'
import { getIntuneDeviceApps, isIntuneConfigured } from '../services/intune.js'
import { getManageEngineDeviceApps, isManageEngineConfigured } from '../services/manageEngine.js'
import { statusOf, retryAfterOf } from '../services/mdmDetailReader.js'
import { isEndpointCentralDeviceId, getEndpointCentralDevices } from '../services/endpointCentralDevices.js'
import { getScannedAppsByResourceId } from '../services/endpointCentralSoftware.js'
import { getPatchSystems, isPatchApiConfigured } from '../services/endpointCentralPatch.js'
import { reconcileDevices } from '../services/deviceReconciler.js'
import { scanFleet, buildPlatformCoverage, listDevicesMissingAgent } from '../security-agents/service.js'
import type { AppStatus, Device } from '../types.js'
import type { DeviceSecurityStatus, PlatformCoverage } from '../security-agents/types.js'

const router = Router()

// Per-device app-inventory fetch is the only network cost of a scan — devices
// already carry `apps` when bundled (mock data); otherwise lazy-fetch from
// the device's own connector, same dispatch used by GET /api/devices/:id/apps.
export async function getAppsFor(device: Device): Promise<AppStatus[]> {
  if (device.apps && device.apps.length > 0) return device.apps
  if (isIntuneConfigured() && device.managementSource === 'Microsoft Intune') return getIntuneDeviceApps(device.id)
  if (isManageEngineConfigured() && device.managementSource === 'ManageEngine') return getManageEngineDeviceApps(device.id)
  return []
}

const SECURITY_AGENT_APP = /crowdstrike|falcon|zscaler/i
/** The only apps coverage depends on, kept per device so one failed read can fall back to the last good one without holding whole inventories in memory. */
const securityRelevant = (apps: AppStatus[]): AppStatus[] => apps.filter(a => SECURITY_AGENT_APP.test(a.name) || SECURITY_AGENT_APP.test(a.bundleId ?? ''))
const lastGoodAgents = new Map<string, AppStatus[]>()

function mergeApps(primary: AppStatus[], extra: AppStatus[]): AppStatus[] {
  const seen = new Set(primary.map(a => a.name.toLowerCase()))
  return [...primary, ...extra.filter(a => !seen.has(a.name.toLowerCase()))]
}

/**
 * Maps a device to its Endpoint Central scanned app list: `ec-` ids directly, everything else (Intune Windows, MDM Macs)
 * through the shared device reconciler (resource id → serial → MAC → unique host name; shared names never guessed).
 */
async function buildEcAppsResolver(devices: Device[]): Promise<(d: Device) => AppStatus[] | undefined> {
  if (!isManageEngineConfigured()) return () => undefined
  const scanned = getScannedAppsByResourceId()
  if (scanned.size === 0) return () => undefined
  const [systems, ecDevices] = await Promise.all([
    isPatchApiConfigured() ? getPatchSystems().catch(() => null) : Promise.resolve(null),
    getEndpointCentralDevices().catch(() => [] as Device[]),
  ])
  const rec = reconcileDevices(devices, systems, ecDevices).byDeviceId
  return d => {
    if (isEndpointCentralDeviceId(d.id)) return scanned.get(d.id.slice(3))
    const r = rec.get(d.id)
    const key = r?.ec ? r.ec.id.slice(3) : r?.patch?.detailResourceId
    return key ? scanned.get(key) : undefined
  }
}

interface CoverageResult {
  windows: PlatformCoverage
  macos: PlatformCoverage
  scanTime: string
  scanDurationMs: number
}

const CONCURRENCY = 8
const CACHE_TTL_MS = 5 * 60 * 1000
let cache: { statuses: DeviceSecurityStatus[]; result: CoverageResult; expiresAt: number } | null = null

export interface ScanProgress { done: number; total: number; startedAt: string }
let progress: ScanProgress | null = null
let inFlight: Promise<{ statuses: DeviceSecurityStatus[]; result: CoverageResult }> | null = null

const pause = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms))

/** One device's app inventory, retried when the API throttles (429) or hiccups (5xx) so a busy moment doesn't drop the device. */
export async function getAppsWithRetry(device: Device, attempts = 3, sleep = pause): Promise<AppStatus[]> {
  for (let attempt = 1; ; attempt++) {
    try { return await getAppsFor(device) } catch (e) {
      const status = statusOf(e)
      const transient = status === 429 || (status !== null && status >= 500)
      if (!transient || attempt >= attempts) throw e
      await sleep(Math.min(retryAfterOf(e) ?? 1000 * 2 ** (attempt - 1), 15_000))
    }
  }
}

/** One scan at a time: concurrent callers (page load, warm-up timer, Refresh) share the running scan instead of each starting a fleet-wide one. */
function runScan(): Promise<{ statuses: DeviceSecurityStatus[]; result: CoverageResult }> {
  inFlight ??= doScan().finally(() => { inFlight = null; progress = null })
  return inFlight
}

async function doScan(): Promise<{ statuses: DeviceSecurityStatus[]; result: CoverageResult }> {
  const t0 = Date.now()
  const { devices } = await fetchAllDevices()
  progress = { done: 0, total: devices.length, startedAt: new Date(t0).toISOString() }
  const devicesWithApps: Array<{ device: Device; apps: AppStatus[]; inventoryAvailable: boolean }> = []
  let failedFetches = 0
  let firstFailure: unknown
  let servedStale = 0
  const ecAppsFor = await buildEcAppsResolver(devices)

  for (let i = 0; i < devices.length; i += CONCURRENCY) {
    const batch = devices.slice(i, i + CONCURRENCY)
    const resolved = await Promise.all(batch.map(async device => {
      const ecApps = ecAppsFor(device)
      // The Endpoint Central scan is the full agent inventory. The MDM per-device API cannot serve `ec-` devices and
      // returns only a handful of Apple apps for a Mac, so when the scan has the device it is used directly.
      if (ecApps && (device.platform === 'macOS' || isEndpointCentralDeviceId(device.id))) return { device, apps: ecApps, ok: true as const }
      if (isEndpointCentralDeviceId(device.id)) return { device, apps: [] as AppStatus[], ok: false as const, error: new Error('Endpoint Central inventory not scanned yet for this device') }
      try {
        const apps = await getAppsWithRetry(device)
        return { device, apps: ecApps ? mergeApps(apps, ecApps) : apps, ok: true as const }
      } catch (error) {
        // Source hiccup (e.g. Intune throttling): Endpoint Central's copy of the same device still counts.
        return ecApps ? { device, apps: ecApps, ok: true as const } : { device, apps: [] as AppStatus[], ok: false as const, error }
      }
    }))
    for (const r of resolved) {
      if (r.ok) {
        lastGoodAgents.set(r.device.id, securityRelevant(r.apps))
        devicesWithApps.push({ device: r.device, apps: r.apps, inventoryAvailable: true })
        continue
      }
      // Never silently lose a device: reuse its last successful reading rather than dropping it from coverage.
      const previous = lastGoodAgents.get(r.device.id)
      if (previous) { servedStale++; devicesWithApps.push({ device: r.device, apps: previous, inventoryAvailable: true }); continue }
      failedFetches++; firstFailure ??= r.error
      devicesWithApps.push({ device: r.device, apps: [], inventoryAvailable: false })
    }
    if (progress) progress.done = Math.min(devices.length, i + batch.length)
  }
  if (servedStale > 0) console.warn(`[securityInventory] ${servedStale} devices reused their last successful app inventory this scan.`)
  // One summary line instead of one error per device (a throttled fleet scan used to log thousands).
  if (failedFetches > 0) {
    const why = firstFailure instanceof Error ? firstFailure.message.slice(0, 200) : String(firstFailure).slice(0, 200)
    console.error(`[securityInventory] app inventory unavailable for ${failedFetches} of ${devices.length} devices. First error: ${why}`)
  }

  const scanTime = new Date().toISOString()
  const statuses = scanFleet(devicesWithApps, scanTime)
  const result: CoverageResult = {
    windows: buildPlatformCoverage(statuses, 'Windows'),
    macos: buildPlatformCoverage(statuses, 'macOS'),
    scanTime,
    scanDurationMs: Date.now() - t0,
  }
  cache = { statuses, result, expiresAt: Date.now() + CACHE_TTL_MS }
  return { statuses, result }
}

// Exported so other features (e.g. operationalQueue.ts, for the Dashboard's
// Operational Queue widget) can reuse this same cached fleet scan instead of
// re-scanning the whole fleet a second time.
export async function getCached() {
  return cache && Date.now() < cache.expiresAt ? cache : await runScan()
}

/** Synchronous, zero-network peek at the cache — returns it only if already
 *  warm and fresh, otherwise null. Never triggers a scan. For passive
 *  callers (e.g. a Dashboard widget that reloads on every page view) that
 *  must not themselves kick off a full per-device app-inventory fleet scan
 *  (minutes-long on a large real tenant) — they show "no data yet" until
 *  this page (or another /coverage caller) has warmed the cache. */
export function getCachedIfFresh() {
  return cache && Date.now() < cache.expiresAt ? cache : null
}

// Background warm-up: re-runs the scan shortly before the cache would
// otherwise expire, so the Dashboard's Operational Queue and the Security
// Posture page always see a warm cache instead of whichever visitor happens
// to arrive first paying for a multi-minute cold scan. Started once at
// server startup (see index.ts); errors are logged, never thrown, so one
// failed scan doesn't kill the interval.
const WARMUP_INTERVAL_MS = CACHE_TTL_MS - 30_000
let warmupTimer: NodeJS.Timeout | null = null

export function startSecurityInventoryWarmup(): void {
  if (warmupTimer) return
  const tick = () => { runScan().catch(e => console.error('[securityInventory] Background warm-up scan failed:', e instanceof Error ? e.message : e)) }
  tick()
  warmupTimer = setInterval(tick, WARMUP_INTERVAL_MS)
}

export function stopSecurityInventoryWarmup(): void {
  if (warmupTimer) { clearInterval(warmupTimer); warmupTimer = null }
}

export type CoverageSnapshot =
  | { state: 'fresh' | 'stale'; result: CoverageResult & { stale?: boolean } }
  | { state: 'scanning'; progress: ScanProgress | null }

/** Fresh cache as-is; an expired one immediately (refreshing in the background); nothing yet → the running scan's progress.
 *  Never waits on a scan. Shared by the HTTP route and the Ocean assistant. */
export function getCoverageSnapshot(): CoverageSnapshot {
  if (cache && Date.now() < cache.expiresAt) return { state: 'fresh', result: cache.result }
  runScan().catch(e => console.error('[securityInventory] scan failed:', e instanceof Error ? e.message : e))
  if (cache) return { state: 'stale', result: { ...cache.result, stale: true } }
  return { state: 'scanning', progress }
}

// GET /api/security-inventory/coverage — physical Windows/macOS Falcon +
// Zscaler coverage for the "Endpoint Protection Coverage" card on the
// Security Posture page. This is the primary endpoint this module exists for.
//
// Never makes the browser wait on a multi-minute scan: a fresh cache is returned as-is; an expired one is returned
// immediately (stale: true) while a refresh runs in the background; with nothing cached yet the scan is started and
// the live progress is returned so the card can show "Scanning N of M devices".
router.get('/coverage', asyncHandler(async (_req, res) => {
  const snap = getCoverageSnapshot()
  res.json({ success: true, data: snap.state === 'scanning' ? { scanning: true, progress: snap.progress } : snap.result })
}))

// POST /api/security-inventory/scan — force a fresh scan (bypasses cache)
router.post('/scan', asyncHandler(async (_req, res) => {
  const { result } = await runScan()
  res.json({ success: true, data: result })
}))

// GET /api/security-inventory/missing?platform=Windows&agent=zscaler — the
// drill-down list for "which devices are missing this agent" (small list,
// not a full inventory table).
router.get('/missing', asyncHandler(async (req, res) => {
  const platform = req.query['platform'] === 'macOS' ? 'macOS' : 'Windows'
  const agent = String(req.query['agent'] ?? '')
  if (agent !== 'zscaler' && agent !== 'crowdstrike') { res.status(400).json({ success: false, error: 'agent must be zscaler or crowdstrike' }); return }

  // The last scan is good enough for a drill-down even when it has expired; only a cold start has nothing to show.
  if (!cache) { runScan().catch(() => {}); res.status(503).json({ success: false, error: 'The first fleet scan is still running — try again in a minute.' }); return }
  res.json({ success: true, data: listDevicesMissingAgent(cache.statuses, platform, agent) })
}))

export default router
