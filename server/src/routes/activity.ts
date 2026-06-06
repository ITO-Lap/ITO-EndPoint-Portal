import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getCachedKandjiDevices, isKandjiConfigured } from '../services/kandji.js'
import { getIntuneDevices, isIntuneConfigured } from '../services/intune.js'
import { getManageEngineDevices, isManageEngineConfigured } from '../services/manageEngine.js'
import type { ActivityItem } from '../types.js'
import type { Device } from '../types.js'

const router = Router()

const querySchema = z.object({
  limit:  z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z.enum(['Compliant', 'Non-Compliant', 'Warning']).optional(),
})

function deviceToActivity(
  d: Pick<Device, 'id' | 'deviceName' | 'complianceState' | 'primaryIssue'>,
  idx: number,
): ActivityItem {
  const message =
    d.complianceState === 'Compliant'
      ? 'All compliance policies passed'
      : d.primaryIssue && d.primaryIssue !== 'None'
        ? d.primaryIssue
        : 'Compliance issue detected'

  const offsetMs = idx * 7 * 60 * 1000
  return {
    id:         d.id || String(idx),
    deviceName: d.deviceName,
    message,
    status:     d.complianceState as ActivityItem['status'],
    timestamp:  new Date(Date.now() - offsetMs).toISOString(),
  }
}

// Module-level TTL cache for Intune + ManageEngine devices so we don't hammer
// live APIs on every activity poll (frontend polls every 60 s).
interface DeviceCache { devices: Device[]; expiresAt: number }
let fallbackCache: DeviceCache | null = null
const FALLBACK_TTL_MS = 90_000 // 90 s

async function fetchFallbackDevices(): Promise<Device[]> {
  if (fallbackCache && Date.now() < fallbackCache.expiresAt) {
    return fallbackCache.devices
  }

  const results: Device[] = []

  if (isIntuneConfigured()) {
    try {
      const r = await getIntuneDevices()
      results.push(...r)
    } catch { /* non-critical — skip source */ }
  }

  if (isManageEngineConfigured()) {
    try {
      const r = await getManageEngineDevices()
      results.push(...r)
    } catch { /* non-critical — skip source */ }
  }

  fallbackCache = { devices: results, expiresAt: Date.now() + FALLBACK_TTL_MS }
  return results
}

// GET /api/activity
router.get('/', asyncHandler(async (req, res) => {
  const { limit, status } = querySchema.parse(req.query)

  let sourceDevices: Pick<Device, 'id' | 'deviceName' | 'complianceState' | 'primaryIssue'>[]

  if (isKandjiConfigured()) {
    // Prefer the already-populated Kandji cache — no extra API call
    const cached = getCachedKandjiDevices()
    sourceDevices = cached && cached.length > 0 ? cached : []
  } else {
    // Fall back to Intune + ManageEngine (cached with TTL)
    sourceDevices = await fetchFallbackDevices()
  }

  let items: ActivityItem[]

  if (sourceDevices.length > 0) {
    // Surface non-compliant and warnings first, sample compliant at the end
    const ranked = [
      ...sourceDevices.filter(d => d.complianceState === 'Non-Compliant'),
      ...sourceDevices.filter(d => d.complianceState === 'Warning'),
      ...sourceDevices.filter(d => d.complianceState === 'Compliant').slice(0, 5),
    ]
    items = ranked.map((d, i) => deviceToActivity(d, i))
  } else {
    items = []
  }

  if (status) items = items.filter(a => a.status === status)

  res.json({
    success: true,
    data:    items.slice(0, limit),
    meta:    { total: items.length },
  })
}))

export default router
