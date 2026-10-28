import { dataFile, legacyServerFile, readJsonFile, writeJsonAtomic } from './dataDir.js'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

export interface RuntimeIntuneConfig {
  tenantId: string
  clientId: string
  clientSecret: string
  endpoint?: string
}

export interface RuntimeManageEngineConfig {
  clientId: string
  clientSecret: string
  refreshToken: string
  apiDomain: string
}

export interface RuntimeOpenAIConfig {
  apiKey: string
  orgId?: string
  model?: string
}

/** Gemini is deliberately separate from OpenAI: only the Endpoint Operations
 * Copilot uses it, so existing OpenAI-powered workflows remain unaffected. */
export interface RuntimeGeminiConfig {
  apiKey: string
  model?: string
  /** Enables Gemini's managed Google Search grounding for public-web facts. */
  enableGoogleSearch?: boolean
}

export interface RuntimeEntraConfig {
  tenantId:     string
  clientId:     string
  clientSecret: string
}

export interface RuntimeSlackConfig {
  botToken?:     string
  /** Incoming-webhook URL used for outbound automation alerts. */
  webhookUrl?:   string
  signingSecret?: string
  workspaceId?:  string
}

export interface IntegrationFetchResult {
  deviceCount: number
  lastFetchAt: number
  latencyMs: number
  error: string | null
}

interface PersistedCredentials {
  intune?:       RuntimeIntuneConfig
  manageengine?: RuntimeManageEngineConfig
  openai?:       RuntimeOpenAIConfig
  gemini?:       RuntimeGeminiConfig
  entra?:        RuntimeEntraConfig
  slack?:        RuntimeSlackConfig
}

interface Store extends PersistedCredentials {
  fetchResults: {
    intune: IntegrationFetchResult | null
    manageengine: IntegrationFetchResult | null
    entra: IntegrationFetchResult | null
    slack: IntegrationFetchResult | null
  }
}

// ─ Persistence ───────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))
const CREDS_FILE = dataFile('integration-credentials.json', [resolve(__dirname, '../../../../server/.integration-credentials.json'), legacyServerFile('.integration-credentials.json')])

function loadPersistedCredentials(): PersistedCredentials {
  try {
    return readJsonFile<PersistedCredentials>(CREDS_FILE) ?? {}
  } catch {
    return {}
  }
}

function persistCredentials(): void {
  const snapshot: PersistedCredentials = {}
  if (store.intune)       snapshot.intune       = store.intune
  if (store.manageengine) snapshot.manageengine = store.manageengine
  if (store.openai)       snapshot.openai       = store.openai
  if (store.gemini)       snapshot.gemini       = store.gemini
  if (store.entra)        snapshot.entra        = store.entra
  if (store.slack)        snapshot.slack        = store.slack
  try {
    writeJsonAtomic(CREDS_FILE, snapshot)
  } catch (e) {
    console.error('[integrationStore] Failed to persist credentials:', e)
  }
}

// ─ Store init — load from disk first ─────────────────────────────────────────

const persisted = loadPersistedCredentials()

const store: Store = {
  ...persisted,
  fetchResults: { intune: null, manageengine: null, entra: null, slack: null },
}

// ─ Credential setters ────────────────────────────────────────────────────────

export function setIntuneConfig(c: RuntimeIntuneConfig) { store.intune = c; persistCredentials() }
export function setManageEngineConfig(c: RuntimeManageEngineConfig) { store.manageengine = c; persistCredentials() }
export function setOpenAIConfig(c: RuntimeOpenAIConfig) { store.openai = c; persistCredentials() }
export function setGeminiConfig(c: RuntimeGeminiConfig) { store.gemini = c; persistCredentials() }
export function setEntraConfig(c: RuntimeEntraConfig) { store.entra = c; persistCredentials() }
export function setSlackConfig(c: RuntimeSlackConfig) { store.slack = c; persistCredentials() }

// ─ Credential getters — store first, then env vars ───────────────────────────

export function getIntuneConfig(): RuntimeIntuneConfig | undefined {
  if (store.intune) return store.intune
  const { INTUNE_TENANT_ID: tenantId, INTUNE_CLIENT_ID: clientId, INTUNE_CLIENT_SECRET: clientSecret } = process.env
  if (tenantId && clientId && clientSecret) {
    return {
      tenantId,
      clientId,
      clientSecret,
      ...(process.env.INTUNE_ENDPOINT ? { endpoint: process.env.INTUNE_ENDPOINT } : {}),
    }
  }
  return undefined
}

export function getManageEngineConfig(): RuntimeManageEngineConfig | undefined {
  if (store.manageengine) return store.manageengine
  const {
    MANAGEENGINE_CLIENT_ID: clientId,
    MANAGEENGINE_CLIENT_SECRET: clientSecret,
    MANAGEENGINE_REFRESH_TOKEN: refreshToken,
    MANAGEENGINE_API_DOMAIN: apiDomain,
  } = process.env
  if (clientId && clientSecret && refreshToken && apiDomain) {
    return { clientId, clientSecret, refreshToken, apiDomain }
  }
  return undefined
}

export function getOpenAIConfig(): RuntimeOpenAIConfig | undefined {
  if (store.openai) return store.openai
  const { OPENAI_API_KEY: apiKey } = process.env
  if (apiKey) return { apiKey, model: 'gpt-4o' }
  return undefined
}

export function getGeminiConfig(): RuntimeGeminiConfig | undefined {
  if (store.gemini) return store.gemini
  const { GEMINI_API_KEY: apiKey, GEMINI_MODEL: model, GEMINI_ENABLE_GOOGLE_SEARCH } = process.env
  if (apiKey) {
    return {
      apiKey,
      model: model || 'gemini-2.5-flash',
      enableGoogleSearch: GEMINI_ENABLE_GOOGLE_SEARCH !== 'false',
    }
  }
  return undefined
}

// Entra ID: try ENTRA_ vars first, auto-fall-back to INTUNE_ credentials
// (same Microsoft tenant — existing Intune registrations often work)
export function getEntraConfig(): RuntimeEntraConfig | undefined {
  if (store.entra) return store.entra
  const { ENTRA_TENANT_ID, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET } = process.env
  if (ENTRA_TENANT_ID && ENTRA_CLIENT_ID && ENTRA_CLIENT_SECRET) {
    return { tenantId: ENTRA_TENANT_ID, clientId: ENTRA_CLIENT_ID, clientSecret: ENTRA_CLIENT_SECRET }
  }
  // Fall back to Intune credentials — same Azure AD app registration often has Entra permissions
  const { INTUNE_TENANT_ID, INTUNE_CLIENT_ID, INTUNE_CLIENT_SECRET } = process.env
  if (INTUNE_TENANT_ID && INTUNE_CLIENT_ID && INTUNE_CLIENT_SECRET) {
    return { tenantId: INTUNE_TENANT_ID, clientId: INTUNE_CLIENT_ID, clientSecret: INTUNE_CLIENT_SECRET }
  }
  return undefined
}

export function getSlackConfig(): RuntimeSlackConfig | undefined {
  if (store.slack) return store.slack
  const { SLACK_BOT_TOKEN: botToken, SLACK_WEBHOOK_URL: webhookUrl, SLACK_SIGNING_SECRET: signingSecret, SLACK_WORKSPACE_ID: workspaceId } = process.env
  if (botToken || webhookUrl) return { ...(botToken ? { botToken } : {}), ...(webhookUrl ? { webhookUrl } : {}), ...(signingSecret ? { signingSecret } : {}), ...(workspaceId ? { workspaceId } : {}) }
  return undefined
}

// ─ Fetch result cache ────────────────────────────────────────────────────────

export function recordFetchResult(
  source: 'intune' | 'manageengine' | 'entra' | 'slack',
  result: IntegrationFetchResult,
) {
  store.fetchResults[source] = result
}

export function getFetchResult(
  source: 'intune' | 'manageengine' | 'entra' | 'slack',
): IntegrationFetchResult | null {
  return store.fetchResults[source]
}

// ─ Configured check ──────────────────────────────────────────────────────────

export function isConfigured(source: 'intune' | 'manageengine' | 'openai' | 'gemini' | 'entra' | 'slack'): boolean {
  switch (source) {
    case 'intune':       return !!getIntuneConfig()
    case 'manageengine': return !!getManageEngineConfig()
    case 'openai':       return !!getOpenAIConfig()
    case 'gemini':       return !!getGeminiConfig()
    case 'entra':        return !!getEntraConfig()
    case 'slack':        return !!getSlackConfig()
  }
}
