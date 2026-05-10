import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import { mockActivity } from '../data/mockActivity.js'

const router = Router()

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z.enum(['Compliant', 'Non-Compliant', 'Warning']).optional(),
})

// GET /api/activity
router.get('/', asyncHandler(async (req, res) => {
  const { limit, status } = querySchema.parse(req.query)

  let items = mockActivity
  if (status) items = items.filter(a => a.status === status)

  res.json({
    success: true,
    data: items.slice(0, limit),
    meta: { total: items.length },
  })
}))

export default router
