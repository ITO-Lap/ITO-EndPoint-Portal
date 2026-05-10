import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getCachedKandjiDevices, isKandjiConfigured } from '../services/kandji.js'
import type { ActivityItem } from '../types.js'

const router = Router()

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z.enum(['Compliant', 'Non-Compliant', 'Warning']).optional(),
})

function deviceToActivity(
  d: { id: string; deviceName: string; complianceState: string; primaryIssue: string },
  idx: number,
): ActivityItem {
  const message =
    d.complianceState === 'Compliant'
      ? 'All compliance policies passed'
      : d.primaryIssue && d.primaryIssue !== 'None'
        ? d.primaryIssue
        : 'Compliance issue detected'

  // Spread items across a plausible recent window so they don't all share timestamps
  const offsetMs = idx * 7 * 60 * 1000
  return {
    id:         d.id || String(idx),
    deviceName: d.deviceName,
    message,
    status:     d.complianceState as ActivityItem['status'],
    timestamp:  new Date(Date.now() - offsetMs).toISOString(),
  }
}

// GET /api/activity
router.get('/', asyncHandler(async (req, res) => {
  const { limit, status } = querySchema.parse(req.query)

  let items: ActivityItem[]

  // Read from the already-populated Kandji device cache (no new API calls).
  // Falls back to mock data if the cache hasn't been populated yet or
  // if no integration is configured — this keeps activity safe to call at any time.
  const cached = isKandjiConfigured() ? getCachedKandjiDevices() : null

  if (cached && cached.length > 0) {
    // Priority order: non-compliant → warning → sample of compliant
    const ranked = [
      ...cached.filter(d => d.complianceState === 'Non-Compliant'),
      ...cached.filter(d => d.complianceState === 'Warning'),
      ...cached.filter(d => d.complianceState === 'Compliant').slice(0, 5),
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
