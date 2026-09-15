import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getIntuneDevices, isIntuneConfigured, getIntuneDeviceApps, getIntuneDevicePolicies } from '../services/intune.js'
import { getManageEngineDevices, isManageEngineConfigured, getManageEngineDeviceApps, getManageEngineDevicePolicies } from '../services/manageEngine.js'
import { recordFetchResult } from '../store/integrationStore.js'
import type { Device, DashboardStats } from '../types.js'

const router = Router()

const listSchema = z.object({
  q:          z.string().optional(),
  source:     z.enum(['intune', 'manageengine', 'all']).optional().default('all'),
  compliance: z.enum(['Compliant', 'Non-Compliant', 'Warning']).optional(),
  platform:   z.enum(['Windows', 'macOS', 'Linux', 'Android', 'iOS']).optional(),
  limit:      z.coerce.number().int().min(1).max(10000).optional().default(100),
})

const sourceLabel: Record<string, Device['managementSource']> = {
  intune:       'Microsoft Intune',
  manageengine: 'ManageEngine',
}

function categorizeIssue(primaryIssue: string): string | null {
  const i = primaryIssue.toLowerCase()
  if (!i || i === 'none') return null
  if (i.includes('filevault') || i.includes('bitlocker') || i.includes('encrypt')) return 'Encryption / FileVault'
  if (i.includes('firewall') || i.includes('antivirus') || i.includes('crowdstrike') || i.includes('defender')) return 'Security / AV'
  if (i.includes('os update') || i.includes('patch') || i.includes('software update')) return 'OS / Patch'
  if (i.includes('check-in') || i.includes('check in') || i.includes('offline')) return 'Device Check-in'
  if (i.includes('policy') || i.includes('compliance')) return 'Compliance Policies'
  if (i.includes('app') || i.includes('application')) return 'Application Issues'
  return 'Other'
}

// 5-minute in-memory cache — matches the TTL already used for the users list
// (server/src/routes/users.ts). Without it, every single-device lookup
// (apps/policies/detail) re-fetches the entire fleet (5000+ Intune devices)
// from Graph just to find one record, which took ~100s in practice.
const CACHE_TTL_MS = 5 * 60 * 1000
let devicesCache: { devices: Device[]; mock: boolean; expiresAt: number } | null = null

export async function fetchAllDevices(): Promise<{ devices: Device[]; mock: boolean }> {
  if (devicesCache && Date.now() < devicesCache.expiresAt) {
    return { devices: devicesCache.devices, mock: devicesCache.mock }
  }

  const anyConfigured = isIntuneConfigured() || isManageEngineConfigured()
  if (!anyConfigured) return { devices: [], mock: false }

  const [intuneResult, meResult] = await Promise.allSettled([
    isIntuneConfigured()       ? (async () => { const t0 = Date.now(); const d = await getIntuneDevices();       recordFetchResult('intune',       { deviceCount: d.length, lastFetchAt: Date.now(), latencyMs: Date.now() - t0, error: null }); return d })()       : Promise.resolve([]),
    isManageEngineConfigured() ? (async () => { const t0 = Date.now(); const d = await getManageEngineDevices(); recordFetchResult('manageengine', { deviceCount: d.length, lastFetchAt: Date.now(), latencyMs: Date.now() - t0, error: null }); return d })() : Promise.resolve([]),
  ])

  const devices: Device[] = []
  const sources = [
    { result: intuneResult,  key: 'intune'        },
    { result: meResult,      key: 'manageengine'  },
  ] as const

  for (const { result, key } of sources) {
    if (result.status === 'fulfilled') {
      devices.push(...result.value)
    } else {
      console.error(`[fetchAllDevices] ${key} error:`, result.reason)
      recordFetchResult(key, {
        deviceCount: 0,
        lastFetchAt: Date.now(),
        latencyMs:   0,
        error:       result.reason instanceof Error ? result.reason.message : 'Unknown error',
      })
    }
  }

  devicesCache = { devices, mock: false, expiresAt: Date.now() + CACHE_TTL_MS }
  return { devices, mock: false }
}

// GET /api/devices
router.get('/', asyncHandler(async (req, res) => {
  const params = listSchema.parse(req.query)
  const { devices, mock } = await fetchAllDevices()

  let filtered = devices

  if (params.q) {
    const q = params.q.toLowerCase()
    filtered = filtered.filter(
      d =>
        d.deviceName.toLowerCase().includes(q) ||
        d.user.toLowerCase().includes(q) ||
        d.serialNumber.toLowerCase().includes(q)
    )
  }
  if (params.compliance) filtered = filtered.filter(d => d.complianceState === params.compliance)
  if (params.platform)   filtered = filtered.filter(d => d.platform === params.platform)
  if (params.source !== 'all') {
    const label = sourceLabel[params.source]
    if (label) filtered = filtered.filter(d => d.managementSource === label)
  }

  res.json({
    success: true,
    data: { devices: filtered.slice(0, params.limit), total: filtered.length, mock },
  })
}))

// GET /api/devices/stats  — must be before /:id
router.get('/stats', asyncHandler(async (_req, res) => {
  const { devices, mock } = await fetchAllDevices()

  // Aggregate issue categories across all non-compliant/warning devices
  const catMap = new Map<string, number>()
  for (const d of devices) {
    const cat = categorizeIssue(d.primaryIssue)
    if (cat) catMap.set(cat, (catMap.get(cat) ?? 0) + 1)
  }
  const issueCategories = Array.from(catMap.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)

  const stats: DashboardStats = {
    total:        devices.length,
    compliant:    devices.filter(d => d.complianceState === 'Compliant').length,
    nonCompliant: devices.filter(d => d.complianceState === 'Non-Compliant').length,
    warning:      devices.filter(d => d.complianceState === 'Warning').length,
    windows:      devices.filter(d => d.platform === 'Windows').length,
    mac:          devices.filter(d => d.platform === 'macOS').length,
    sources: {
      intune:       devices.filter(d => d.managementSource === 'Microsoft Intune').length,
      manageEngine: devices.filter(d => d.managementSource === 'ManageEngine').length,
    },
    issueCategories,
    mock,
  }
  res.json({ success: true, data: stats })
}))

// GET /api/devices/:id/apps — lazy-fetch installed apps for any source
router.get('/:id/apps', asyncHandler(async (req, res) => {
  const deviceId = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id']
  if (!deviceId) { res.json({ success: true, data: [] }); return }

  // Find the device across all sources (includes mock data when nothing configured)
  const { devices } = await fetchAllDevices()
  const device = devices.find(d => d.id === deviceId)

  // If the device has apps bundled in its payload (mock data or pre-fetched), return immediately
  if (device?.apps && device.apps.length > 0) {
    res.json({ success: true, data: device.apps })
    return
  }

  // For live Intune devices, lazy-fetch the device's detected-app inventory
  if (isIntuneConfigured() && device?.managementSource === 'Microsoft Intune') {
    const apps = await getIntuneDeviceApps(deviceId)
    res.json({ success: true, data: apps })
    return
  }

  // For live ManageEngine devices, lazy-fetch installed-app inventory
  if (isManageEngineConfigured() && device?.managementSource === 'ManageEngine') {
    const apps = await getManageEngineDeviceApps(deviceId)
    res.json({ success: true, data: apps })
    return
  }

  res.json({ success: true, data: [] })
}))

// GET /api/devices/:id/policies — lazy-fetch applied compliance/configuration policies
router.get('/:id/policies', asyncHandler(async (req, res) => {
  const deviceId = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id']
  if (!deviceId) { res.json({ success: true, data: [] }); return }

  const { devices } = await fetchAllDevices()
  const device = devices.find(d => d.id === deviceId)

  if (device?.appliedPolicies && device.appliedPolicies.length > 0) {
    res.json({ success: true, data: device.appliedPolicies })
    return
  }

  if (isIntuneConfigured() && device?.managementSource === 'Microsoft Intune') {
    const policies = await getIntuneDevicePolicies(deviceId)
    res.json({ success: true, data: policies })
    return
  }

  if (isManageEngineConfigured() && device?.managementSource === 'ManageEngine') {
    const policies = await getManageEngineDevicePolicies(deviceId)
    res.json({ success: true, data: policies })
    return
  }

  res.json({ success: true, data: [] })
}))

// GET /api/devices/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const { devices } = await fetchAllDevices()
  const device = devices.find(d => d.id === req.params.id)
  if (!device) {
    res.status(404).json({ success: false, error: 'Device not found' })
    return
  }
  res.json({ success: true, data: device })
}))

export default router
