import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getIntuneDevices, isIntuneConfigured, getIntuneDeviceApps, getIntuneDevicePolicies, requestIntuneDiagnostics, getIntuneDiagnosticsStatus } from '../services/intune.js'
import { requireCapability } from '../middleware/requireRole.js'
import { collectDeviceLog, logToCsv, logToExcel, logFilename } from '../services/deviceLogs.js'
import { getManageEngineDevices, isManageEngineConfigured, getManageEngineDeviceApps, getManageEngineDevicePolicies, getManageEngineDeviceProfileResults, getManageEngineDeviceProfileResultsForDevices } from '../services/manageEngine.js'
import { recordFetchResult } from '../store/integrationStore.js'
import { loadSourceDevices, saveSourceDevices, type DeviceSource } from '../store/deviceSnapshotStore.js'
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
const SOURCE_FETCH_TIMEOUT_MS = 60_000
export interface FetchedDevices {
  devices: Device[]
  mock: boolean
  /** Sources that were configured but failed this fetch; their devices are missing from `devices`. */
  failedSources?: Array<{ source: 'intune' | 'manageengine'; error: string }>
  /** Sources that failed this fetch but whose last good list (saved at `savedAt`) is included in `devices`. */
  staleSources?: Array<{ source: 'intune' | 'manageengine'; savedAt: string }>
}
const pick = (f: FetchedDevices): FetchedDevices => ({ devices: f.devices, mock: f.mock, ...(f.failedSources ? { failedSources: f.failedSources } : {}), ...(f.staleSources ? { staleSources: f.staleSources } : {}) })
let devicesCache: (FetchedDevices & { expiresAt: number }) | null = null
let devicesFetchInFlight: Promise<FetchedDevices> | null = null
let warmStartTried = false

async function fetchWithDeadline<T>(source: string, fetcher: () => Promise<T>): Promise<T> {
  let timeout: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      fetcher(),
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`${source} device request timed out after ${SOURCE_FETCH_TIMEOUT_MS / 1000}s`)), SOURCE_FETCH_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export async function fetchAllDevices(): Promise<FetchedDevices> {
  if (devicesCache && Date.now() < devicesCache.expiresAt) {
    return pick(devicesCache)
  }
  // While the post-restart background sync runs, keep answering from the saved lists rather than queueing behind it.
  if (devicesFetchInFlight) return devicesCache?.expiresAt === 0 ? pick(devicesCache) : devicesFetchInFlight

  const anyConfigured = isIntuneConfigured() || isManageEngineConfigured()
  if (!anyConfigured) return { devices: [], mock: false }

  // First call after a restart/deploy: answer at once from the last saved lists and sync in the background,
  // instead of making the first page wait (up to 30s) on Intune and ManageEngine.
  if (!devicesCache && !warmStartTried) {
    warmStartTried = true
    const warm = loadWarmStart()
    if (warm) {
      devicesCache = { ...warm, expiresAt: 0 }
      void refreshDevices().catch(error => console.error('[fetchAllDevices] background refresh failed:', error))
      return warm
    }
  }
  return refreshDevices()
}

function loadWarmStart(): FetchedDevices | null {
  const devices: Device[] = []
  const staleSources: NonNullable<FetchedDevices['staleSources']> = []
  for (const [source, configured] of [['intune', isIntuneConfigured()], ['manageengine', isManageEngineConfigured()]] as const) {
    if (!configured) continue
    const snap = loadSourceDevices(source)
    if (snap) { devices.push(...snap.devices); staleSources.push({ source, savedAt: snap.savedAt }) }
  }
  return devices.length ? { devices, mock: false, staleSources } : null
}

async function refreshDevices(): Promise<FetchedDevices> {
  if (devicesFetchInFlight) return devicesFetchInFlight

  const fetchPromise = (async () => {
    const [intuneResult, meResult] = await Promise.allSettled([
      isIntuneConfigured()       ? (async () => { const t0 = Date.now(); const d = await fetchWithDeadline('Intune', getIntuneDevices);       recordFetchResult('intune',       { deviceCount: d.length, lastFetchAt: Date.now(), latencyMs: Date.now() - t0, error: null }); return d })()       : Promise.resolve([]),
      isManageEngineConfigured() ? (async () => { const t0 = Date.now(); const d = await fetchWithDeadline('ManageEngine', getManageEngineDevices); recordFetchResult('manageengine', { deviceCount: d.length, lastFetchAt: Date.now(), latencyMs: Date.now() - t0, error: null }); return d })() : Promise.resolve([]),
    ])

    const devices: Device[] = []
    const failedSources: NonNullable<FetchedDevices['failedSources']> = []
    const staleSources: NonNullable<FetchedDevices['staleSources']> = []
    const sources = [
      { result: intuneResult,  key: 'intune'        },
      { result: meResult,      key: 'manageengine'  },
    ] as const

    for (const { result, key } of sources) {
      if (result.status === 'fulfilled') {
        devices.push(...result.value)
        saveSourceDevices(key as DeviceSource, result.value)
      } else {
        console.error(`[fetchAllDevices] ${key} error:`, result.reason)
        // Keep showing the last good list for a source that is down, and say so, rather than dropping its devices.
        const lastGood = loadSourceDevices(key as DeviceSource)
        if (lastGood) { devices.push(...lastGood.devices); staleSources.push({ source: key, savedAt: lastGood.savedAt }) }
        else failedSources.push({ source: key, error: result.reason instanceof Error ? result.reason.message : 'Unknown error' })
        recordFetchResult(key, {
          deviceCount: 0,
          lastFetchAt: Date.now(),
          latencyMs:   0,
          error:       result.reason instanceof Error ? result.reason.message : 'Unknown error',
        })
      }
    }

    const fetched: FetchedDevices = { devices, mock: false, ...(failedSources.length ? { failedSources } : {}), ...(staleSources.length ? { staleSources } : {}) }
    devicesCache = { ...fetched, expiresAt: Date.now() + CACHE_TTL_MS }
    return fetched
  })()

  devicesFetchInFlight = fetchPromise
  try {
    return await fetchPromise
  } finally {
    if (devicesFetchInFlight === fetchPromise) devicesFetchInFlight = null
  }
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

// GET /api/devices/manageengine/profile-results — bounded fleet profile-status fetch.
router.get('/manageengine/profile-results', asyncHandler(async (_req, res) => {
  if (!isManageEngineConfigured()) {
    res.json({ success: true, data: { results: [], deviceCount: 0, unavailableCount: 0 } })
    return
  }

  const { devices } = await fetchAllDevices()
  const macDeviceIds = devices
    .filter(device => device.managementSource === 'ManageEngine' && device.platform === 'macOS')
    .map(device => device.id)
  const results = await getManageEngineDeviceProfileResultsForDevices(macDeviceIds)

  res.json({
    success: true,
    data: {
      results,
      deviceCount: results.length,
      unavailableCount: results.filter(result => result.unavailable).length,
    },
  })
}))

// GET /api/devices/:id/profile-results — raw ManageEngine profile association results.
router.get('/:id/profile-results', asyncHandler(async (req, res) => {
  const deviceId = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id']
  if (!deviceId) { res.json({ success: true, data: [] }); return }

  const { devices } = await fetchAllDevices()
  const device = devices.find(d => d.id === deviceId)
  if (!device || device.managementSource !== 'ManageEngine' || !isManageEngineConfigured()) {
    res.json({ success: true, data: [] })
    return
  }

  const profiles = await getManageEngineDeviceProfileResults(deviceId)
  res.json({ success: true, data: profiles })
}))

// ── Device logs (activity history + export + Windows diagnostics) ─────────────
const paramId = (req: { params: Record<string, string | string[] | undefined> }, name = 'id'): string => { const v = req.params[name]; return (Array.isArray(v) ? v[0] : v) ?? '' }
async function findDevice(id: string): Promise<Device | undefined> { return (await fetchAllDevices()).devices.find(d => d.id === id) }

// GET /api/devices/:id/logs — activity timeline for one device (JSON).
router.get('/:id/logs', requireCapability('devices.logs'), asyncHandler(async (req, res) => {
  const device = await findDevice(paramId(req))
  if (!device) { res.status(404).json({ success: false, error: 'Device not found' }); return }
  res.json({ success: true, data: await collectDeviceLog(device) })
}))

// GET /api/devices/:id/logs/export?format=csv|excel — downloadable log file.
router.get('/:id/logs/export', requireCapability('devices.logs'), asyncHandler(async (req, res) => {
  const device = await findDevice(paramId(req))
  if (!device) { res.status(404).json({ success: false, error: 'Device not found' }); return }
  const format = req.query['format'] === 'csv' ? 'csv' : 'excel'
  const log = await collectDeviceLog(device)
  console.info(`[device-logs] ${req.header('x-user-email') ?? 'unknown'} exported ${format} log for device ${device.id}`)
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${logFilename(log, 'csv')}"`)
    res.send(logToCsv(log))
    return
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${logFilename(log, 'xlsx')}"`)
  res.send(await logToExcel(log, req.header('x-user-email') ?? 'ITO Endpoint'))
}))

// POST /api/devices/:id/diagnostics — ask Intune to collect diagnostics from a Windows device.
router.post('/:id/diagnostics', requireCapability('devices.logs'), asyncHandler(async (req, res) => {
  const device = await findDevice(paramId(req))
  if (!device) { res.status(404).json({ success: false, error: 'Device not found' }); return }
  if (device.platform !== 'Windows' || device.managementSource !== 'Microsoft Intune' || !isIntuneConfigured()) {
    res.status(400).json({ success: false, error: 'Diagnostics collection is available for Windows devices managed by Intune only.' }); return
  }
  console.info(`[device-logs] ${req.header('x-user-email') ?? 'unknown'} requested Intune diagnostics for device ${device.id}`)
  try { res.json({ success: true, data: await requestIntuneDiagnostics(device.id) }) }
  catch (e) { res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'Diagnostics request failed' }) }
}))

// GET /api/devices/:id/diagnostics/:requestId — status; includes a download link once Intune has finished.
router.get('/:id/diagnostics/:requestId', requireCapability('devices.logs'), asyncHandler(async (req, res) => {
  const device = await findDevice(paramId(req))
  if (!device || device.managementSource !== 'Microsoft Intune') { res.status(404).json({ success: false, error: 'Device not found' }); return }
  try { res.json({ success: true, data: await getIntuneDiagnosticsStatus(device.id, paramId(req, 'requestId')) }) }
  catch (e) { res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'Diagnostics status failed' }) }
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
