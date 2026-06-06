import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import {
  getEntraOverview, getEntraDevices, getEntraUsers, getEntraGroups,
  getEntraRelationships, getEntraSecurity, syncDevice, diagnoseDevice,
} from '../services/entraIntelligence.js'

const router = Router()

// GET /api/entra/overview
router.get('/overview', asyncHandler(async (_req, res) => {
  const data = await getEntraOverview()
  res.json({ success: true, data })
}))

// GET /api/entra/devices?compliance=&os=&limit=
router.get('/devices', asyncHandler(async (req, res) => {
  const schema = z.object({
    compliance: z.string().optional(),
    os:         z.string().optional(),
    limit:      z.coerce.number().int().min(1).max(500).optional().default(50),
  })
  const params  = schema.parse(req.query)
  const devOpts: Parameters<typeof getEntraDevices>[0] = { limit: params.limit }
  if (params.compliance) devOpts.compliance = params.compliance
  if (params.os)         devOpts.os         = params.os
  const data = await getEntraDevices(devOpts)
  res.json({ success: true, data, meta: { total: data.length } })
}))

// GET /api/entra/users?riskLevel=
router.get('/users', asyncHandler(async (req, res) => {
  const rawRisk = req.query['riskLevel']
  const userOpts: Parameters<typeof getEntraUsers>[0] = {}
  if (typeof rawRisk === 'string') userOpts.riskLevel = rawRisk
  const data = await getEntraUsers(userOpts)
  res.json({ success: true, data })
}))

// GET /api/entra/groups
router.get('/groups', asyncHandler(async (_req, res) => {
  const data = await getEntraGroups()
  res.json({ success: true, data })
}))

// GET /api/entra/relationships?userId=
router.get('/relationships', asyncHandler(async (req, res) => {
  const rawId = req.query['userId']
  const userId = typeof rawId === 'string' ? rawId : undefined
  const data   = await getEntraRelationships(userId)
  res.json({ success: true, data })
}))

// GET /api/entra/security
router.get('/security', asyncHandler(async (_req, res) => {
  const data = await getEntraSecurity()
  res.json({ success: true, data })
}))

// POST /api/entra/devices/:id/sync
router.post('/devices/:id/sync', asyncHandler(async (req, res) => {
  const id = String(req.params['id'] ?? '')
  const result = await syncDevice(id)
  res.json({ success: true, data: result })
}))

// POST /api/entra/devices/:id/diagnose
router.post('/devices/:id/diagnose', asyncHandler(async (req, res) => {
  const id = String(req.params['id'] ?? '')
  const result = await diagnoseDevice(id)
  res.json({ success: true, data: result })
}))

export default router
