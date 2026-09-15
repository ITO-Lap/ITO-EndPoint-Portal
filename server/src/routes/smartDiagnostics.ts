import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import {
  MOCK_DIAGNOSTIC_DEVICES,
  getDiagnosticDevice,
  getDeviceHealthReport,
  getAppFailures,
  getEventLogs,
  getAIRecommendation,
  deviceToDiagnosticDevice,
  generateHealthReport,
  generateAppFailures,
  generateEventLogs,
  generateAIRecommendation,
  type DiagnosticDevice,
} from '../data/mockDiagnostics.js'
import { getIntuneDevices, isIntuneConfigured } from '../services/intune.js'
import { getManageEngineDevices, isManageEngineConfigured } from '../services/manageEngine.js'
import type { Device } from '../types.js'

const router = Router()
const idSchema = z.object({ id: z.string().min(1) })

// ─── In-memory device cache (rebuilt per /devices call, shared for sub-routes) ─
let cachedDiagDevices: DiagnosticDevice[] = []
let cachedRealDevices: Map<string, Device> = new Map()

async function fetchAllDevices(): Promise<{ devices: DiagnosticDevice[]; real: Map<string, Device>; mock: boolean }> {
  const anyConfigured = isIntuneConfigured() || isManageEngineConfigured()

  if (!anyConfigured) {
    return { devices: MOCK_DIAGNOSTIC_DEVICES, real: new Map(), mock: true }
  }

  const [intuneRes, meRes] = await Promise.allSettled([
    isIntuneConfigured()       ? getIntuneDevices()       : Promise.resolve([] as Device[]),
    isManageEngineConfigured() ? getManageEngineDevices() : Promise.resolve([] as Device[]),
  ])

  const allReal: Device[] = []
  for (const r of [intuneRes, meRes]) {
    if (r.status === 'fulfilled') allReal.push(...r.value)
  }

  if (allReal.length === 0) {
    return { devices: MOCK_DIAGNOSTIC_DEVICES, real: new Map(), mock: true }
  }

  const realMap = new Map(allReal.map(d => [d.id, d]))
  const diagDevices = allReal.map(deviceToDiagnosticDevice)
  return { devices: diagDevices, real: realMap, mock: false }
}

async function resolveDevice(id: string): Promise<DiagnosticDevice | null> {
  // 1. Check precomputed mock (diag-XXX ids)
  const precomp = getDiagnosticDevice(id)
  if (precomp) return precomp

  // 2. Check in-memory cache from last /devices call
  const cached = cachedDiagDevices.find(d => d.id === id)
  if (cached) return cached

  // 3. Re-fetch all devices and rebuild cache
  const { devices, real } = await fetchAllDevices()
  cachedDiagDevices = devices
  cachedRealDevices = real
  return devices.find(d => d.id === id) ?? null
}

const searchSchema = z.object({ q: z.string().optional(), limit: z.coerce.number().min(1).max(200).default(50) })

// GET /api/smart-diagnostics/devices?q=<search>&limit=<n>
router.get('/devices', asyncHandler(async (req, res) => {
  const { q, limit } = searchSchema.parse(req.query)
  const { devices, real, mock } = await fetchAllDevices()
  cachedDiagDevices = devices
  cachedRealDevices = real

  const filtered = q
    ? devices.filter(d =>
        d.deviceName.toLowerCase().includes(q.toLowerCase()) ||
        d.user.toLowerCase().includes(q.toLowerCase()) ||
        d.platform.toLowerCase().includes(q.toLowerCase()) ||
        d.managementSource.toLowerCase().includes(q.toLowerCase())
      )
    : devices

  res.json({ success: true, data: filtered.slice(0, limit), total: filtered.length, mock })
}))

// GET /api/smart-diagnostics/devices/:id/health
router.get('/devices/:id/health', asyncHandler(async (req, res) => {
  const { id } = idSchema.parse(req.params)
  const device = await resolveDevice(id)
  if (!device) { res.status(404).json({ success: false, error: 'Device not found' }); return }

  const report = getDeviceHealthReport(id) ?? generateHealthReport(device)
  res.json({ success: true, data: { device, report }, mock: !cachedRealDevices.has(id) })
}))

// GET /api/smart-diagnostics/devices/:id/logs
router.get('/devices/:id/logs', asyncHandler(async (req, res) => {
  const { id } = idSchema.parse(req.params)
  const device = await resolveDevice(id)
  if (!device) { res.status(404).json({ success: false, error: 'Device not found' }); return }

  const logs = getEventLogs(id).length ? getEventLogs(id) : generateEventLogs(device)
  res.json({ success: true, data: logs, total: logs.length, mock: !cachedRealDevices.has(id) })
}))

// GET /api/smart-diagnostics/devices/:id/app-failures
router.get('/devices/:id/app-failures', asyncHandler(async (req, res) => {
  const { id } = idSchema.parse(req.params)
  const device = await resolveDevice(id)
  if (!device) { res.status(404).json({ success: false, error: 'Device not found' }); return }

  const failures = getAppFailures(id).length ? getAppFailures(id) : generateAppFailures(device)
  res.json({ success: true, data: failures, total: failures.length, mock: !cachedRealDevices.has(id) })
}))

// POST /api/smart-diagnostics/devices/:id/analyze
router.post('/devices/:id/analyze', asyncHandler(async (req, res) => {
  const { id } = idSchema.parse(req.params)
  const device = await resolveDevice(id)
  if (!device) { res.status(404).json({ success: false, error: 'Device not found' }); return }

  const recommendation = getAIRecommendation(id) ?? generateAIRecommendation(device)
  res.json({ success: true, data: recommendation, mock: !cachedRealDevices.has(id) })
}))

// GET /api/smart-diagnostics/devices/:id/export
router.get('/devices/:id/export', asyncHandler(async (req, res) => {
  const { id } = idSchema.parse(req.params)
  const device = await resolveDevice(id)
  if (!device) { res.status(404).json({ success: false, error: 'Device not found' }); return }

  const report     = getDeviceHealthReport(id)  ?? generateHealthReport(device)
  const failures   = getAppFailures(id).length   ? getAppFailures(id)   : generateAppFailures(device)
  const logs       = getEventLogs(id).length      ? getEventLogs(id)     : generateEventLogs(device)
  const aiAnalysis = getAIRecommendation(id)     ?? generateAIRecommendation(device)

  res.json({
    success: true,
    data: { device, report, failures, logs, aiAnalysis },
    exportedAt: new Date().toISOString(),
    mock: !cachedRealDevices.has(id),
  })
}))

export default router
