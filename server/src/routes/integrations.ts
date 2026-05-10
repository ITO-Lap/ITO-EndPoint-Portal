import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import {
  setIntuneConfig,
  setKandjiConfig,
  setManageEngineConfig,
  setOpenAIConfig,
  getFetchResult,
  recordFetchResult,
  isConfigured,
  getIntuneConfig,
  getKandjiConfig,
  getManageEngineConfig,
} from '../store/integrationStore.js'
import { getIntuneDevices } from '../services/intune.js'
import { getKandjiDevices } from '../services/kandji.js'
import { getManageEngineDevices } from '../services/manageEngine.js'

const router = Router()

// POST /api/integrations/:id/credentials — push credentials from UI to backend
router.post('/:id/credentials', asyncHandler(async (req, res) => {
  const { id } = req.params
  const { fields } = req.body as { fields: Record<string, string> }

  if (!fields || typeof fields !== 'object') {
    res.status(400).json({ success: false, error: 'fields object required' })
    return
  }

  switch (id) {
    case 'intune':
      setIntuneConfig({
        tenantId:     fields['tenantId']     ?? '',
        clientId:     fields['clientId']     ?? '',
        clientSecret: fields['clientSecret'] ?? '',
        ...(fields['endpoint'] ? { endpoint: fields['endpoint'] } : {}),
      })
      break
    case 'kandji':
      setKandjiConfig({
        apiToken:  fields['apiToken']  ?? '',
        subdomain: fields['subdomain'] ?? '',
      })
      break
    case 'manageengine':
      setManageEngineConfig({
        apiKey:    fields['apiKey']    ?? '',
        serverUrl: fields['serverUrl'] ?? '',
        ...(fields['port'] ? { port: fields['port'] } : {}),
      })
      break
    case 'openai':
      setOpenAIConfig({
        apiKey: fields['apiKey'] ?? '',
        ...(fields['orgId'] ? { orgId: fields['orgId'] } : {}),
        ...(fields['model'] ? { model: fields['model'] } : {}),
      })
      break
    default:
      res.status(400).json({ success: false, error: `Unknown integration: ${id}` })
      return
  }

  res.json({ success: true, data: { id, configured: true } })
}))

// GET /api/integrations/status — per-integration health snapshot
router.get('/status', asyncHandler(async (_req, res) => {
  const sources = ['intune', 'kandji', 'manageengine'] as const
  const data = [
    ...sources.map(src => {
      const result = getFetchResult(src)
      return {
        id: src,
        name: src === 'intune' ? 'Microsoft Intune' : src === 'kandji' ? 'Kandji' : 'ManageEngine',
        configured: isConfigured(src),
        deviceCount: result?.deviceCount ?? null,
        lastSyncAt:  result ? new Date(result.lastFetchAt).toISOString() : null,
        latencyMs:   result?.latencyMs ?? null,
        error:       result?.error ?? null,
        healthy:     result ? result.error === null : null,
      }
    }),
    {
      id: 'openai',
      name: 'OpenAI',
      configured: isConfigured('openai'),
      deviceCount: null,
      lastSyncAt: null,
      latencyMs: null,
      error: null,
      healthy: isConfigured('openai') ? true : null,
    },
  ]

  res.json({ success: true, data })
}))

// POST /api/integrations/:id/sync — force a fresh fetch from a single source
router.post('/:id/sync', asyncHandler(async (req, res) => {
  const { id } = req.params
  const t0 = Date.now()
  let deviceCount = 0
  let error: string | null = null

  try {
    switch (id) {
      case 'intune': {
        const cfg = getIntuneConfig()
        if (!cfg) throw new Error('Microsoft Intune is not configured — push credentials first')
        const devices = await getIntuneDevices(cfg)
        deviceCount = devices.length
        break
      }
      case 'kandji': {
        const cfg = getKandjiConfig()
        if (!cfg) throw new Error('Kandji is not configured — push credentials first')
        const devices = await getKandjiDevices(cfg)
        deviceCount = devices.length
        break
      }
      case 'manageengine': {
        const cfg = getManageEngineConfig()
        if (!cfg) throw new Error('ManageEngine is not configured — push credentials first')
        const devices = await getManageEngineDevices(cfg)
        deviceCount = devices.length
        break
      }
      default:
        res.status(400).json({ success: false, error: `Cannot sync: ${id}` })
        return
    }
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unknown error'
  }

  const latencyMs = Date.now() - t0
  recordFetchResult(id as 'intune' | 'kandji' | 'manageengine', {
    deviceCount,
    lastFetchAt: Date.now(),
    latencyMs,
    error,
  })

  res.json({ success: true, data: { id, deviceCount, latencyMs, error } })
}))

export default router
