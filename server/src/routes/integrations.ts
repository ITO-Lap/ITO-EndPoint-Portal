import { Router } from 'express'
import { z } from 'zod'
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
import { getKandjiDevices, invalidateKandjiCache, getKandjiLibraryApps } from '../services/kandji.js'
import { getManageEngineDevices } from '../services/manageEngine.js'

const router = Router()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const credentialSchemas: Record<string, z.ZodObject<any>> = {
  intune: z.object({
    tenantId:     z.string().min(1, 'tenantId required'),
    clientId:     z.string().min(1, 'clientId required'),
    clientSecret: z.string().min(1, 'clientSecret required'),
    endpoint:     z.string().url().optional(),
  }),
  kandji: z.object({
    apiToken:  z.string().min(1, 'apiToken required'),
    subdomain: z.string().min(1, 'subdomain required'),
  }),
  manageengine: z.object({
    apiKey:    z.string().min(1, 'apiKey required'),
    serverUrl: z.string().url('serverUrl must be a valid URL'),
    port:      z.string().regex(/^\d+$/).optional(),
  }),
  openai: z.object({
    apiKey: z.string().min(1, 'apiKey required'),
    orgId:  z.string().optional(),
    model:  z.string().optional(),
  }),
}

// POST /api/integrations/:id/credentials — push credentials from UI to backend
router.post('/:id/credentials', asyncHandler(async (req, res) => {
  const { id } = req.params
  const { fields } = req.body as { fields: unknown }

  const schema = typeof id === 'string' ? credentialSchemas[id] : undefined
  if (!schema) {
    res.status(400).json({ success: false, error: `Unknown integration: ${id ?? 'unknown'}` })
    return
  }

  const parsed = schema.safeParse(fields)
  if (!parsed.success) {
    const message = parsed.error.issues.map((e: { message: string }) => e.message).join(', ')
    res.status(400).json({ success: false, error: message })
    return
  }

  const f = parsed.data
  switch (id) {
    case 'intune':
      setIntuneConfig({
        tenantId:     f['tenantId']     as string,
        clientId:     f['clientId']     as string,
        clientSecret: f['clientSecret'] as string,
        ...(f['endpoint'] ? { endpoint: f['endpoint'] as string } : {}),
      })
      break
    case 'kandji':
      setKandjiConfig({
        apiToken:  f['apiToken']  as string,
        subdomain: f['subdomain'] as string,
      })
      break
    case 'manageengine':
      setManageEngineConfig({
        apiKey:    f['apiKey']    as string,
        serverUrl: f['serverUrl'] as string,
        ...(f['port'] ? { port: f['port'] as string } : {}),
      })
      break
    case 'openai':
      setOpenAIConfig({
        apiKey: f['apiKey'] as string,
        ...(f['orgId'] ? { orgId: f['orgId'] as string } : {}),
        ...(f['model'] ? { model: f['model'] as string } : {}),
      })
      break
  }

  res.json({ success: true, data: { id, configured: true } })
}))

// GET /api/integrations/kandji/apps — Kandji Library items (single API call)
router.get('/kandji/apps', asyncHandler(async (_req, res) => {
  const apps = await getKandjiLibraryApps()
  res.json({ success: true, data: apps })
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
        invalidateKandjiCache()
        const devices = await getKandjiDevices(cfg, true)
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
