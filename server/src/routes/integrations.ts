import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import OpenAI from 'openai'
import {
  setIntuneConfig,
  setManageEngineConfig,
  setOpenAIConfig,
  setEntraConfig,
  setSlackConfig,
  getFetchResult,
  recordFetchResult,
  isConfigured,
  getIntuneConfig,
  getManageEngineConfig,
  getOpenAIConfig,
  getSlackConfig,
} from '../store/integrationStore.js'
import { getIntuneDevices, diagnoseIntune } from '../services/intune.js'
import { getManageEngineDevices, getManageEngineAppInventory } from '../services/manageEngine.js'
import { getEntraData, invalidateEntraTokenCache } from '../services/entra.js'
import { testSlackConnection } from '../services/slack.js'

const router = Router()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const credentialSchemas: Record<string, z.ZodObject<any>> = {
  intune: z.object({
    tenantId:     z.string().min(1, 'tenantId required'),
    clientId:     z.string().min(1, 'clientId required'),
    clientSecret: z.string().min(1, 'clientSecret required'),
    endpoint:     z.string().url().optional(),
  }),
  manageengine: z.object({
    clientId:     z.string().min(1, 'clientId required'),
    clientSecret: z.string().min(1, 'clientSecret required'),
    refreshToken: z.string().min(1, 'refreshToken required'),
    apiDomain:    z.string().url('apiDomain must be a valid URL'),
  }),
  entra: z.object({
    tenantId:     z.string().min(1, 'tenantId required'),
    clientId:     z.string().min(1, 'clientId required'),
    clientSecret: z.string().min(1, 'clientSecret required'),
  }),
  slack: z.object({
    botToken:      z.string().min(1, 'botToken required'),
    signingSecret: z.string().optional(),
    workspaceId:   z.string().optional(),
  }),
  openai: z.object({
    apiKey: z.string().min(1, 'apiKey required').startsWith('sk-', 'apiKey must start with sk-'),
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
    case 'manageengine':
      setManageEngineConfig({
        clientId:     f['clientId']     as string,
        clientSecret: f['clientSecret'] as string,
        refreshToken: f['refreshToken'] as string,
        apiDomain:    f['apiDomain']    as string,
      })
      break
    case 'entra':
      invalidateEntraTokenCache()
      setEntraConfig({
        tenantId:     f['tenantId']     as string,
        clientId:     f['clientId']     as string,
        clientSecret: f['clientSecret'] as string,
      })
      break
    case 'slack':
      setSlackConfig({
        botToken:      f['botToken']      as string,
        ...(f['signingSecret'] ? { signingSecret: f['signingSecret'] as string } : {}),
        ...(f['workspaceId']   ? { workspaceId:   f['workspaceId']   as string } : {}),
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

// GET /api/integrations/intune/debug — connectivity and permission diagnostic
router.get('/intune/debug', asyncHandler(async (_req, res) => {
  const result = await diagnoseIntune()
  res.json({ success: true, data: result })
}))

// GET /api/integrations/manageengine/apps — fleet-wide installed-app inventory,
// separated into Windows/macOS buckets by device platform
router.get('/manageengine/apps', asyncHandler(async (_req, res) => {
  const apps = await getManageEngineAppInventory()
  res.json({ success: true, data: apps })
}))

// GET /api/integrations/status — per-integration health snapshot
router.get('/status', asyncHandler(async (_req, res) => {
  const mdmSources = ['intune', 'manageengine'] as const
  const entraResult = getFetchResult('entra')
  const data = [
    ...mdmSources.map(src => {
      const result = getFetchResult(src)
      return {
        id: src,
        name: src === 'intune' ? 'Microsoft Intune' : 'ManageEngine',
        configured: isConfigured(src),
        deviceCount: result?.deviceCount ?? null,
        lastSyncAt:  result ? new Date(result.lastFetchAt).toISOString() : null,
        latencyMs:   result?.latencyMs ?? null,
        error:       result?.error ?? null,
        healthy:     result ? result.error === null : null,
      }
    }),
    {
      id: 'entra',
      name: 'Microsoft Entra ID',
      configured: isConfigured('entra'),
      deviceCount: entraResult?.deviceCount ?? null,
      lastSyncAt:  entraResult ? new Date(entraResult.lastFetchAt).toISOString() : null,
      latencyMs:   entraResult?.latencyMs ?? null,
      error:       entraResult?.error ?? null,
      healthy:     entraResult ? entraResult.error === null : (isConfigured('entra') ? true : null),
    },
    {
      id: 'slack',
      name: 'Slack',
      configured: isConfigured('slack'),
      deviceCount: getFetchResult('slack')?.deviceCount ?? null,
      lastSyncAt:  getFetchResult('slack') ? new Date(getFetchResult('slack')!.lastFetchAt).toISOString() : null,
      latencyMs:   getFetchResult('slack')?.latencyMs ?? null,
      error:       getFetchResult('slack')?.error ?? null,
      healthy:     isConfigured('slack') ? (getFetchResult('slack')?.error === null ? true : null) : null,
    },
    {
      id: 'openai',
      name: 'OpenAI',
      configured: isConfigured('openai'),
      model:       getOpenAIConfig()?.model ?? 'gpt-4o-mini',
      deviceCount: null,
      lastSyncAt:  null,
      latencyMs:   null,
      error:       null,
      healthy:     isConfigured('openai') ? true : null,
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
      case 'manageengine': {
        const cfg = getManageEngineConfig()
        if (!cfg) throw new Error('ManageEngine is not configured — push credentials first')
        const devices = await getManageEngineDevices(cfg)
        deviceCount = devices.length
        break
      }
      case 'entra': {
        const data = await getEntraData()
        deviceCount = data.users.length + data.signIns.length + data.directoryAudits.length
        break
      }
      case 'slack': {
        const cfg = getSlackConfig()
        if (!cfg) throw new Error('Slack is not configured — push credentials first')
        const result = await testSlackConnection(cfg)
        if (!result.ok) throw new Error(result.error ?? 'Slack connection test failed')
        deviceCount = 0
        break
      }
      case 'openai': {
        const cfg = getOpenAIConfig()
        if (!cfg?.apiKey) throw new Error('OpenAI is not configured — push credentials first')
        const openai = new OpenAI({ apiKey: cfg.apiKey, ...(cfg.orgId ? { organization: cfg.orgId } : {}) })
        const models = await openai.models.list()
        deviceCount = models.data.length
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
  const recordableSources = ['intune', 'manageengine', 'entra', 'slack'] as const
  if (recordableSources.includes(id as typeof recordableSources[number])) {
    recordFetchResult(id as typeof recordableSources[number], {
      deviceCount,
      lastFetchAt: Date.now(),
      latencyMs,
      error,
    })
  }

  res.json({ success: true, data: { id, deviceCount, latencyMs, error } })
}))

export default router
