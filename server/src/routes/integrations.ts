import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import OpenAI from 'openai'
import {
  setIntuneConfig,
  setKandjiConfig,
  setManageEngineConfig,
  setOpenAIConfig,
  setEntraConfig,
  setSlackConfig,
  getFetchResult,
  recordFetchResult,
  isConfigured,
  getIntuneConfig,
  getKandjiConfig,
  getManageEngineConfig,
  getOpenAIConfig,
  getSlackConfig,
} from '../store/integrationStore.js'
import { getIntuneDevices, diagnoseIntune } from '../services/intune.js'
import { getKandjiDevices, invalidateKandjiCache, getKandjiLibraryApps } from '../services/kandji.js'
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
  kandji: z.object({
    apiToken:  z.string().min(1, 'apiToken required'),
    subdomain: z.string().min(1, 'subdomain required'),
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
    case 'kandji':
      setKandjiConfig({
        apiToken:  f['apiToken']  as string,
        subdomain: f['subdomain'] as string,
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

// GET /api/integrations/kandji/apps — Kandji Library items with blueprint associations
router.get('/kandji/apps', asyncHandler(async (_req, res) => {
  const apps = await getKandjiLibraryApps()
  res.json({ success: true, data: apps })
}))

// GET /api/integrations/kandji/self-service/categories — IRU Self Service category list
router.get('/kandji/self-service/categories', asyncHandler(async (_req, res) => {
  const { getKandjiSelfServiceCategories } = await import('../services/kandji.js')
  const data = await getKandjiSelfServiceCategories()
  res.json({ success: true, data })
}))

// GET /api/integrations/kandji/library-items/:id/status
router.get('/kandji/library-items/:id/status', asyncHandler(async (req, res) => {
  const { getLibraryItemStatuses } = await import('../services/kandji.js')
  const id = String(req.params['id'] ?? '')
  const data = await getLibraryItemStatuses(id)
  res.json({ success: true, data })
}))

// GET /api/integrations/kandji/library-items/:id/activity
router.get('/kandji/library-items/:id/activity', asyncHandler(async (req, res) => {
  const { getLibraryItemActivity } = await import('../services/kandji.js')
  const id = String(req.params['id'] ?? '')
  const data = await getLibraryItemActivity(id)
  res.json({ success: true, data })
}))

// GET /api/integrations/kandji/debug-library-paths — try ALL known path variants
router.get('/kandji/debug-library-paths', asyncHandler(async (_req, res) => {
  const cfg = getKandjiConfig()
  if (!cfg) { res.status(400).json({ error: 'Kandji not configured' }); return }
  const base    = `https://${cfg.subdomain}.api.kandji.io`
  const headers = { Authorization: `Bearer ${cfg.apiToken}`, 'Content-Type': 'application/json' }

  // Every path variant we can think of
  const paths = [
    '/api/v1/library/auto-apps',
    '/api/v1/library/vpp-apps',
    '/api/v1/library/profiles',
    '/api/v1/library/custom-profiles',
    '/api/v1/library/web-apps',
    '/api/v1/library/custom-printers',
    '/api/v1/library/in-house-apps',
    '/api/v1/library/ipa-apps',
    '/api/v1/library/library-items',
    '/api/v1/library/items',
    '/api/v1/library',
    '/api/v1/library/app-store-apps',
    '/api/v1/library/managed-library-items',
    '/api/v1/self-service/library-items',
  ]

  const results = await Promise.all(paths.map(async p => {
    try {
      const r = await fetch(`${base}${p}?limit=1`, { headers })
      const txt = await r.text()
      let count = 0
      try {
        const j = JSON.parse(txt)
        count = Array.isArray(j) ? j.length : (j.results?.length ?? j.count ?? 0)
      } catch { /* html/non-json */ }
      return { path: p, status: r.status, count, isJson: txt.trim().startsWith('{') || txt.trim().startsWith('[') }
    } catch (e) { return { path: p, status: 0, count: 0, isJson: false } }
  }))

  const working = results.filter(r => r.status === 200)
  res.json({ base, results, working })
}))

// GET /api/integrations/kandji/debug-blueprints — diagnose blueprint API access (dev only)
router.get('/kandji/debug-blueprints', asyncHandler(async (_req, res) => {
  const cfg = getKandjiConfig()
  if (!cfg) { res.status(400).json({ error: 'Kandji not configured' }); return }

  // Use env KANDJI_API_URL as base if available; otherwise reconstruct from subdomain
  const envUrl = process.env.KANDJI_API_URL
  const base   = envUrl
    ? envUrl.replace(/\/+$/, '')   // strip trailing slashes
    : `https://${cfg.subdomain}.api.kandji.io`

  const headers = { Authorization: `Bearer ${cfg.apiToken}`, 'Content-Type': 'application/json' }

  async function safeGet(url: string) {
    try {
      const r = await fetch(url, { headers })
      const text = await r.text()
      let body: unknown = text
      try { body = JSON.parse(text) } catch { /* keep as text */ }
      return { status: r.status, body }
    } catch (e) {
      return { status: 0, error: String(e) }
    }
  }

  const [bpResult, appsResult] = await Promise.all([
    safeGet(`${base}/api/v1/blueprints`),
    safeGet(`${base}/api/v1/library/auto-apps`),
  ])

  // If we got apps, try detail of first one
  const appsBody  = appsResult.body as unknown
  const items     = Array.isArray(appsBody)
    ? (appsBody as Record<string,unknown>[])
    : ((appsBody as { results?: Record<string,unknown>[] }).results ?? [])
  const firstId   = (items[0] as { id?: string } | undefined)?.id
  const firstKeys = items[0] ? Object.keys(items[0]) : []

  const detailResult = firstId
    ? await safeGet(`${base}/api/v1/library/auto-apps/${firstId}`)
    : null

  // Test all library type paths to find which work
  const libraryPaths = [
    '/api/v1/library/auto-apps', '/api/v1/library/custom-apps',
    '/api/v1/library/vpp-apps',  '/api/v1/library/custom-scripts',
    '/api/v1/library/profiles',  '/api/v1/library/web-apps',
    '/api/v1/library/custom-printers',
  ]
  const libResults = await Promise.all(
    libraryPaths.map(async p => {
      const r = await safeGet(`${base}${p}`)
      const b = r.body as unknown
      const items = Array.isArray(b) ? b as unknown[] : ((b as { results?: unknown[] }).results ?? [])
      return { path: p, status: r.status, count: items.length, firstId: (items[0] as { id?: string } | undefined)?.id, firstKeys: items[0] ? Object.keys(items[0] as Record<string,unknown>) : [] }
    })
  )

  // Test detail on the first item from the first working path
  const working = libResults.find(r => r.status === 200 && r.count > 0 && r.firstId)
  const sampleDetail = working
    ? await safeGet(`${base}${working.path}/${working.firstId}`)
    : null
  const sampleBody = sampleDetail?.body as Record<string,unknown> | undefined

  // Try blueprint DETAIL endpoint — might include library item assignments
  const bpList  = (bpResult.body as { results?: { id: string; name: string }[] })?.results ?? []
  const firstBpId = bpList[0]?.id
  const bpDetail  = firstBpId ? await safeGet(`${base}/api/v1/blueprints/${firstBpId}`) : null
  const bpDetailBody = bpDetail?.body as Record<string,unknown> | undefined

  // Try blueprint library-items sub-endpoint
  const bpLibItems = firstBpId ? await safeGet(`${base}/api/v1/blueprints/${firstBpId}/library-items`) : null

  res.json({
    base,
    blueprints:    { status: bpResult.status, count: bpList.length, firstId: firstBpId, firstName: bpList[0]?.name },
    libraryPaths:  libResults.map(r => ({ path: r.path.split('/').pop(), status: r.status, count: r.count })),
    workingPath:   working?.path ?? null,
    sampleDetail:  sampleDetail ? { status: sampleDetail.status, keys: sampleBody ? Object.keys(sampleBody) : [], blueprintsField: sampleBody?.blueprints } : null,
    bpDetail:      bpDetail ? { status: bpDetail.status, keys: bpDetailBody ? Object.keys(bpDetailBody) : [], libraryItemsField: bpDetailBody?.library_items ?? bpDetailBody?.items } : null,
    bpLibItems:    bpLibItems ? { status: bpLibItems.status, body: (bpLibItems.body as unknown as string).slice?.(0,300) ?? bpLibItems.body } : null,
    itemDetail:    detailResult ? { status: detailResult.status, blueprintsField: (detailResult.body as Record<string,unknown>)?.blueprints } : null,
  })
}))

// GET /api/integrations/status — per-integration health snapshot
router.get('/status', asyncHandler(async (_req, res) => {
  const mdmSources = ['intune', 'kandji', 'manageengine'] as const
  const entraResult = getFetchResult('entra')
  const data = [
    ...mdmSources.map(src => {
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
  const recordableSources = ['intune', 'kandji', 'manageengine', 'entra', 'slack'] as const
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
