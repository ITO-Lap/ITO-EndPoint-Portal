import { Router } from 'express'
import { requireAnyCapability, requireCapability } from '../middleware/requireRole.js'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import OpenAI from 'openai'
import {
  setIntuneConfig,
  setManageEngineConfig,
  setOpenAIConfig,
  setGeminiConfig,
  setEntraConfig,
  setSlackConfig,
  getFetchResult,
  recordFetchResult,
  isConfigured,
  getIntuneConfig,
  getManageEngineConfig,
  getOpenAIConfig,
  getGeminiConfig,
  getSlackConfig,
} from '../store/integrationStore.js'
import { getIntuneDevices, diagnoseIntune, getIntuneSelfServiceWindowsApps, getIntuneSelfServiceAppDevices } from '../services/intune.js'
import { getManageEngineDevices } from '../services/manageEngine.js'
import { getEndpointCentralAppInventory } from '../services/endpointCentralSoftware.js'
import { getEntraData, invalidateEntraTokenCache } from '../services/entra.js'
import { testSlackConnection } from '../services/slack.js'
import { activeConnectionString, configuredConnectionString, testConnection } from '../db/index.js'
import { clearPostgresConfig, getPostgresConfig, savePostgresConfig } from '../store/postgresConfig.js'
import { storageKind } from '../services/sync/syncEngine.js'
import { saveConfluenceConfig, saveJiraConfig, getJiraConfig, getConfluenceConfig } from '../store/atlassianConfig.js'
import { isConfluenceConfigured } from '../services/confluence.js'
import { isJiraConfigured } from '../services/jira.js'

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
    botToken:      z.string().optional(),
    webhookUrl:     z.string().url().optional(),
    signingSecret: z.string().optional(),
    workspaceId:   z.string().optional(),
  }).refine(value => !!value.botToken || !!value.webhookUrl, 'botToken or webhookUrl required'),
  openai: z.object({
    apiKey: z.string().min(1, 'apiKey required').startsWith('sk-', 'apiKey must start with sk-'),
    orgId:  z.string().optional(),
    model:  z.string().optional(),
  }),
  jira: z.object({
    baseUrl:    z.string().trim().url('baseUrl must be a valid URL, for example https://yourorg.atlassian.net'),
    email:      z.string().trim().email('email must be a valid address'),
    apiToken:   z.string().trim().min(1, 'apiToken required'),
    projectKey: z.string().trim().optional(),
  }),
  confluence: z.object({
    baseUrl:  z.string().trim().url('baseUrl must be a valid URL').optional().or(z.literal('')),
    spaceKey: z.string().trim().optional(),
    apiToken: z.string().trim().optional(),
  }),
  postgres: z.object({
    connectionString: z.string().trim().regex(/^postgres(ql)?:\/\/.+/i, 'connectionString must start with postgresql://'),
    ssl: z.enum(['auto', 'require', 'disable']).optional(),
  }),
  gemini: z.object({
    apiKey: z.string().min(1, 'apiKey required').startsWith('AIza', 'apiKey must start with AIza'),
    model: z.string().optional(),
    enableGoogleSearch: z.preprocess(value => value === 'true' ? true : value === 'false' ? false : value, z.boolean().optional()),
  }),
}

// POST /api/integrations/:id/credentials — push credentials from UI to backend
router.post('/:id/credentials', requireCapability('pages.Settings'), asyncHandler(async (req, res) => {
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

  if (id === 'jira') {
    saveJiraConfig({ baseUrl: f['baseUrl'] as string, email: f['email'] as string, apiToken: f['apiToken'] as string, ...(f['projectKey'] ? { projectKey: f['projectKey'] as string } : {}) })
    res.json({ success: true, data: { id, configured: isJiraConfigured() } })
    return
  }
  if (id === 'confluence') {
    saveConfluenceConfig({ ...(f['baseUrl'] ? { baseUrl: f['baseUrl'] as string } : {}), ...(f['spaceKey'] ? { spaceKey: f['spaceKey'] as string } : {}), ...(f['apiToken'] ? { apiToken: f['apiToken'] as string } : {}) })
    res.json({ success: true, data: { id, configured: isConfluenceConfigured() } })
    return
  }

  if (id === 'postgres') {
    // Only a connection that works is saved: a saved-but-unreachable database would break every module at the next start.
    const cfg = { connectionString: f['connectionString'] as string, ...(f['ssl'] && f['ssl'] !== 'auto' ? { ssl: f['ssl'] as 'require' | 'disable' } : {}) }
    const probe = await testConnection(cfg)
    if (!probe.ok) { res.status(400).json({ success: false, error: `Could not connect to PostgreSQL: ${probe.error}` }); return }
    savePostgresConfig(cfg)
    res.json({ success: true, data: { id, configured: true, restartRequired: configuredConnectionString() !== activeConnectionString(), serverVersion: probe.serverVersion } })
    return
  }

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
        ...(f['botToken']      ? { botToken: f['botToken'] as string } : {}),
        ...(f['webhookUrl']    ? { webhookUrl: f['webhookUrl'] as string } : {}),
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
    case 'gemini':
      setGeminiConfig({
        apiKey: f['apiKey'] as string,
        ...(f['model'] ? { model: f['model'] as string } : {}),
        ...(typeof f['enableGoogleSearch'] === 'boolean' ? { enableGoogleSearch: f['enableGoogleSearch'] as boolean } : {}),
      })
      break
  }

  res.json({ success: true, data: { id, configured: true } })
}))

// DELETE /api/integrations/postgres/credentials — forget the saved PostgreSQL connection (the app returns to local files at the next start)
router.delete('/postgres/credentials', requireCapability('pages.Settings'), asyncHandler(async (_req, res) => {
  clearPostgresConfig()
  res.json({ success: true, data: { id: 'postgres', configured: !!getPostgresConfig(), restartRequired: configuredConnectionString() !== activeConnectionString() } })
}))

// GET /api/integrations/intune/debug — connectivity and permission diagnostic
router.get('/intune/debug', requireCapability('pages.Settings'), asyncHandler(async (_req, res) => {
  const result = await diagnoseIntune()
  res.json({ success: true, data: result })
}))

// GET /api/integrations/manageengine/apps — fleet-wide installed-app inventory,
// separated into Windows/macOS buckets by device platform
router.get('/manageengine/apps', requireAnyCapability('pages.App Guardian', 'pages.ManageEngine App Inventory'), asyncHandler(async (req, res) => {
  const apps = getEndpointCentralAppInventory(req.query.refresh === '1', req.query.includeSystem === '1')
  res.json({ success: true, data: apps })
}))

// GET /api/integrations/intune/self-service-apps/devices?appId= — devices holding one Self Service app (loaded on demand)
router.get('/intune/self-service-apps/devices', requireCapability('pages.ManageEngine App Inventory'), asyncHandler(async (req, res) => {
  const appId = typeof req.query.appId === 'string' ? req.query.appId : ''
  res.json({ success: true, data: await getIntuneSelfServiceAppDevices(appId) })
}))

// GET /api/integrations/intune/self-service-apps — Windows apps assigned as `available` (Company Portal)
router.get('/intune/self-service-apps', requireCapability('pages.ManageEngine App Inventory'), asyncHandler(async (req, res) => {
  res.json({ success: true, data: getIntuneSelfServiceWindowsApps(undefined, req.query.refresh === '1') })
}))

// GET /api/integrations/status — per-integration health snapshot
router.get('/status', asyncHandler(async (_req, res) => {
  const mdmSources = ['intune', 'manageengine'] as const
  const entraResult = getFetchResult('entra')
  const slackConfig = getSlackConfig()
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
      connectionType: slackConfig?.webhookUrl ? 'incoming_webhook' : slackConfig?.botToken ? 'bot_api' : null,
    },
    ...(['jira', 'confluence'] as const).map(src => ({
      id: src,
      name: src === 'jira' ? 'Jira' : 'Confluence',
      configured: src === 'jira' ? isJiraConfigured() : isConfluenceConfigured(),
      deviceCount: null, lastSyncAt: null, latencyMs: null, error: null,
      healthy: (src === 'jira' ? isJiraConfigured() : isConfluenceConfigured()) ? true : null,
    })),
    {
      id: 'postgres',
      name: 'PostgreSQL',
      configured: !!configuredConnectionString(),
      deviceCount: null,
      lastSyncAt:  null,
      latencyMs:   null,
      error:       null,
      healthy:     storageKind() === 'postgres' ? true : null,
      storage:     storageKind(),
      restartRequired: configuredConnectionString() !== activeConnectionString(),
      note: storageKind() === 'postgres'
        ? 'In use: synced data is stored in PostgreSQL.'
        : configuredConnectionString() ? 'Saved. Restart the server to start using PostgreSQL.' : 'Optional. Without it the tool stores synced data in local files and works the same.',
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
    {
      id: 'gemini',
      name: 'Google Gemini',
      configured: isConfigured('gemini'),
      model: getGeminiConfig()?.model ?? 'gemini-2.5-flash',
      deviceCount: null,
      lastSyncAt: null,
      latencyMs: null,
      error: null,
      healthy: isConfigured('gemini') ? true : null,
    },
  ]

  res.json({ success: true, data })
}))

// POST /api/integrations/:id/sync — force a fresh fetch from a single source
router.post('/:id/sync', requireCapability('pages.Settings'), asyncHandler(async (req, res) => {
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
      case 'jira':
      case 'confluence': {
        // A read-only call that proves the URL, email and token work together.
        const isJira = id === 'jira'
        const cfg = isJira ? getJiraConfig() : getConfluenceConfig()
        if (!cfg.baseUrl || !cfg.email || !cfg.apiToken) throw new Error(`${isJira ? 'Jira' : 'Confluence'} is not configured. Push the URL, email and token first.`)
        const auth = Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString('base64')
        const url = isJira ? `${cfg.baseUrl}/rest/api/3/myself` : `${cfg.baseUrl}/wiki/rest/api/space?limit=1`
        const response = await fetch(url, { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
        if (!response.ok) throw new Error(`${isJira ? 'Jira' : 'Confluence'} answered ${response.status}. Check the URL, email and API token.`)
        deviceCount = 0
        break
      }
      case 'postgres': {
        const cfg = getPostgresConfig()
        if (!cfg) throw new Error('PostgreSQL is not configured. Save a connection string first.')
        const probe = await testConnection(cfg)
        if (!probe.ok) throw new Error(probe.error)
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
      case 'gemini': {
        const cfg = getGeminiConfig()
        if (!cfg?.apiKey) throw new Error('Google Gemini is not configured — push credentials first')
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model || 'gemini-2.5-flash')}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with OK.' }] }], generationConfig: { maxOutputTokens: 8 } }),
        })
        if (!response.ok) throw new Error(`Gemini connection failed: ${await response.text()}`)
        deviceCount = 1
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
