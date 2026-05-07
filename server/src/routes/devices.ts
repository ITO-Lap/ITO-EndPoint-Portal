import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import { mockDevices } from '../data/mockDevices.js'
import { getIntuneDevices, isIntuneConfigured } from '../services/intune.js'
import { getKandjiDevices, isKandjiConfigured } from '../services/kandji.js'
import { getManageEngineDevices, isManageEngineConfigured } from '../services/manageEngine.js'
import type { Device, DashboardStats } from '../types.js'

const router = Router()

const listSchema = z.object({
  q: z.string().optional(),
  source: z.enum(['intune', 'kandji', 'manageengine', 'all']).optional().default('all'),
  compliance: z.enum(['Compliant', 'Non-Compliant', 'Warning']).optional(),
  platform: z.enum(['Windows', 'macOS', 'Linux']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
})

const sourceLabel: Record<string, Device['managementSource']> = {
  intune: 'Microsoft Intune',
  kandji: 'Kandji',
  manageengine: 'ManageEngine',
}

async function fetchAllDevices(): Promise<{ devices: Device[]; mock: boolean }> {
  const anyConfigured = isIntuneConfigured() || isKandjiConfigured() || isManageEngineConfigured()
  if (!anyConfigured) return { devices: mockDevices, mock: true }

  const [intuneResult, kandjiResult, meResult] = await Promise.allSettled([
    isIntuneConfigured() ? getIntuneDevices() : Promise.resolve([]),
    isKandjiConfigured() ? getKandjiDevices() : Promise.resolve([]),
    isManageEngineConfigured() ? getManageEngineDevices() : Promise.resolve([]),
  ])

  const devices: Device[] = []
  for (const result of [intuneResult, kandjiResult, meResult]) {
    if (result.status === 'fulfilled') {
      devices.push(...result.value)
    } else {
      console.error('[fetchAllDevices] source error:', result.reason)
    }
  }

  // Fall back to mock if every configured source failed
  return devices.length > 0 ? { devices, mock: false } : { devices: mockDevices, mock: true }
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

  const stats: DashboardStats = {
    total: devices.length,
    compliant: devices.filter(d => d.complianceState === 'Compliant').length,
    nonCompliant: devices.filter(d => d.complianceState === 'Non-Compliant').length,
    warning: devices.filter(d => d.complianceState === 'Warning').length,
    windows: devices.filter(d => d.platform === 'Windows').length,
    mac: devices.filter(d => d.platform === 'macOS').length,
    sources: {
      intune: devices.filter(d => d.managementSource === 'Microsoft Intune').length,
      kandji: devices.filter(d => d.managementSource === 'Kandji').length,
      manageEngine: devices.filter(d => d.managementSource === 'ManageEngine').length,
    },
    mock,
  }
  res.json({ success: true, data: stats })
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
