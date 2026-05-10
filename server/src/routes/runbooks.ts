import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import { mockRunbooks } from '../data/mockRunbooks.js'
import type { AutomationJob } from '../types.js'

const router = Router()

const executeSchema = z.object({
  deviceId: z.string().min(1, 'deviceId is required'),
})

// GET /api/runbooks
router.get('/', asyncHandler(async (_req, res) => {
  res.json({ success: true, data: mockRunbooks })
}))

// GET /api/runbooks/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const runbook = mockRunbooks.find(r => r.id === req.params.id)
  if (!runbook) {
    res.status(404).json({ success: false, error: 'Runbook not found' })
    return
  }
  res.json({ success: true, data: runbook })
}))

// POST /api/runbooks/:id/execute
router.post('/:id/execute', asyncHandler(async (req, res) => {
  const { deviceId } = executeSchema.parse(req.body)

  const runbook = mockRunbooks.find(r => r.id === req.params.id)
  if (!runbook) {
    res.status(404).json({ success: false, error: 'Runbook not found' })
    return
  }

  const job: AutomationJob = {
    id: `job-${Date.now()}`,
    deviceId,
    runbookId: runbook.id,
    status: 'pending',
    startedAt: new Date().toISOString(),
  }

  console.log(`[Runbook] Queued job ${job.id} — runbook "${runbook.name}" for device ${deviceId}`)

  // 202 Accepted: job is queued; poll /api/jobs/:id in a real implementation
  res.status(202).json({ success: true, data: job })
}))

export default router
