import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { fetchAllDevices } from './devices.js'
import { getIntuneDeviceApps, isIntuneConfigured } from '../services/intune.js'
import { getManageEngineDeviceApps, isManageEngineConfigured } from '../services/manageEngine.js'
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

interface CoverageResult {
  windows: PlatformCoverage
  macos: PlatformCoverage
  scanTime: string
  scanDurationMs: number
}

const CONCURRENCY = 8
const CACHE_TTL_MS = 5 * 60 * 1000
let cache: { statuses: DeviceSecurityStatus[]; result: CoverageResult; expiresAt: number } | null = null

async function runScan(): Promise<{ statuses: DeviceSecurityStatus[]; result: CoverageResult }> {
  const t0 = Date.now()
  const { devices } = await fetchAllDevices()
  const devicesWithApps: Array<{ device: Device; apps: AppStatus[]; inventoryAvailable: boolean }> = []

  for (let i = 0; i < devices.length; i += CONCURRENCY) {
    const batch = devices.slice(i, i + CONCURRENCY)
    const settled = await Promise.allSettled(batch.map(d => getAppsFor(d)))
    settled.forEach((s, idx) => {
      const device = batch[idx]!
      devicesWithApps.push({ device, apps: s.status === 'fulfilled' ? s.value : [], inventoryAvailable: s.status === 'fulfilled' })
      if (s.status === 'rejected') console.error(`[securityInventory] apps fetch failed for ${device.id}:`, s.reason)
    })
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

// GET /api/security-inventory/coverage — physical Windows/macOS Falcon +
// Zscaler coverage for the "Endpoint Protection Coverage" card on the
// Security Posture page. This is the primary endpoint this module exists for.
router.get('/coverage', asyncHandler(async (_req, res) => {
  const { result } = await getCached()
  res.json({ success: true, data: result })
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

  const { statuses } = await getCached()
  res.json({ success: true, data: listDevicesMissingAgent(statuses, platform, agent) })
}))

export default router
