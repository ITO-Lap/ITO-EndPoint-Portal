export interface RuntimeIntuneConfig {
  tenantId: string
  clientId: string
  clientSecret: string
  endpoint?: string
}

export interface RuntimeKandjiConfig {
  apiToken: string
  subdomain: string
}

export interface RuntimeManageEngineConfig {
  apiKey: string
  serverUrl: string
  port?: string
}

export interface RuntimeOpenAIConfig {
  apiKey: string
  orgId?: string
  model?: string
}

export interface IntegrationFetchResult {
  deviceCount: number
  lastFetchAt: number
  latencyMs: number
  error: string | null
}

interface Store {
  intune?: RuntimeIntuneConfig
  kandji?: RuntimeKandjiConfig
  manageengine?: RuntimeManageEngineConfig
  openai?: RuntimeOpenAIConfig
  fetchResults: {
    intune: IntegrationFetchResult | null
    kandji: IntegrationFetchResult | null
    manageengine: IntegrationFetchResult | null
  }
}

const store: Store = {
  fetchResults: { intune: null, kandji: null, manageengine: null },
}

// ─ Credential setters ────────────────────────────────────────────────────────

export function setIntuneConfig(c: RuntimeIntuneConfig) { store.intune = c }
export function setKandjiConfig(c: RuntimeKandjiConfig) { store.kandji = c }
export function setManageEngineConfig(c: RuntimeManageEngineConfig) { store.manageengine = c }
export function setOpenAIConfig(c: RuntimeOpenAIConfig) { store.openai = c }

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

export function getKandjiConfig(): RuntimeKandjiConfig | undefined {
  if (store.kandji) return store.kandji
  const { KANDJI_API_TOKEN: apiToken, KANDJI_API_URL } = process.env
  if (apiToken && KANDJI_API_URL) {
    try {
      const subdomain = new URL(KANDJI_API_URL).hostname.split('.').at(0)
      if (!subdomain) return undefined
      return { apiToken, subdomain }
    } catch {
      return undefined
    }
  }
  return undefined
}

export function getManageEngineConfig(): RuntimeManageEngineConfig | undefined {
  if (store.manageengine) return store.manageengine
  const { MANAGEENGINE_URL: serverUrl, MANAGEENGINE_API_KEY: apiKey } = process.env
  if (serverUrl && apiKey) return { serverUrl, apiKey }
  return undefined
}

export function getOpenAIConfig(): RuntimeOpenAIConfig | undefined {
  if (store.openai) return store.openai
  const { OPENAI_API_KEY: apiKey } = process.env
  if (apiKey) return { apiKey, model: 'gpt-4o' }
  return undefined
}

// ─ Fetch result cache ────────────────────────────────────────────────────────

export function recordFetchResult(
  source: 'intune' | 'kandji' | 'manageengine',
  result: IntegrationFetchResult,
) {
  store.fetchResults[source] = result
}

export function getFetchResult(
  source: 'intune' | 'kandji' | 'manageengine',
): IntegrationFetchResult | null {
  return store.fetchResults[source]
}

// ─ Configured check ──────────────────────────────────────────────────────────

export function isConfigured(source: 'intune' | 'kandji' | 'manageengine' | 'openai'): boolean {
  switch (source) {
    case 'intune':       return !!getIntuneConfig()
    case 'kandji':       return !!getKandjiConfig()
    case 'manageengine': return !!getManageEngineConfig()
    case 'openai':       return !!getOpenAIConfig()
  }
}
