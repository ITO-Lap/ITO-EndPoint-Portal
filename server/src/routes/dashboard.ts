// Dashboard-specific aggregation endpoints — data that doesn't belong to any
// one existing feature's own routes (e.g. the Operational Queue widget,
// which unions rows across several existing features).

import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getOperationalQueue } from '../services/operationalQueue.js'

const router = Router()

// GET /api/dashboard/operational-queue
router.get('/operational-queue', asyncHandler(async (_req, res) => {
  const result = await getOperationalQueue()
  res.json({ success: true, data: result })
}))

export default router
