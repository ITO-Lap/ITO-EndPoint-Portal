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
async function getAppsFor(device: Device): Promise<AppStatus[]> {
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
  const devicesWithApps: Array<{ device: Device; apps: AppStatus[] }> = []

  for (let i = 0; i < devices.length; i += CONCURRENCY) {
    const batch = devices.slice(i, i + CONCURRENCY)
    const settled = await Promise.allSettled(batch.map(d => getAppsFor(d)))
    settled.forEach((s, idx) => {
      const device = batch[idx]!
      devicesWithApps.push({ device, apps: s.status === 'fulfilled' ? s.value : [] })
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

async function getCached() {
  return cache && Date.now() < cache.expiresAt ? cache : await runScan()
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
