# Backend Services

Each external service has its own file in `server/src/services/`. They are pure functions — no side effects beyond HTTP calls. The caller (route handlers) decides when to call them.

---

## `services/intune.ts` — Microsoft Intune

Fetches managed device records from the **Microsoft Graph API** using OAuth2 client credentials.

### Auth flow

```
getAccessToken(cfg)
  → POST https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token
  → scope: 'https://graph.microsoft.com/.default'
  → grant_type: 'client_credentials'
  → returns Bearer token (cached with 60s buffer before expiry)
```

Token is cached in a module-level variable. Re-used across requests until 60 seconds before expiry.

### Device fetch

```
GET https://graph.microsoft.com/v1.0/deviceManagement/managedDevices
  ?$select=id,deviceName,userPrincipalName,serialNumber,...
  &$top=100
```

Returns up to 100 devices per call. For larger tenants, implement `@odata.nextLink` pagination.

### Data mapping

`mapGraphDevice(d: GraphDevice): Device` normalises the Graph response to the shared `Device` type:
- `complianceState` → `'Compliant' | 'Warning' | 'Non-Compliant'`
- `operatingSystem` → `'Windows' | 'macOS' | 'Linux'`
- Storage/memory bytes → human-readable strings
- `joinType` → readable enrollment type strings

### Exports

```ts
getIntuneDevices(cfg?: RuntimeIntuneConfig): Promise<Device[]>
isIntuneConfigured(): boolean
```

---

## `services/manageEngine.ts` — ManageEngine Endpoint Central

Fetches device records from the **ManageEngine REST API** using an API key. This is also the macOS
device source for the Mac Devices module — `mapPlatform()` detects macOS from the device's
model/`product_name`, so there's no separate macOS-only service.

### Endpoints used

```
GET {serverUrl}/api/1.4/desktop/computers/allcomputers
  Authorization: {apiKey}
```

### Data mapping

`mapManageEngineDevice(d)` maps ManageEngine computer records to the shared `Device` type.

### Exports

```ts
getManageEngineDevices(cfg?: RuntimeManageEngineConfig): Promise<Device[]>
isManageEngineConfigured(): boolean
```

---

## `services/openai.ts` — OpenAI

Provides two functions: structured device analysis and freeform chat.

### `analyzeDevice(device: Device): Promise<DeviceAnalysis>`

Sends a structured prompt to `gpt-4o-mini` requesting JSON output:

```ts
{
  summary: string
  rootCause: string
  recommendation: string
  suggestedRunbook: string
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical'
  steps: string[]
}
```

**Model settings:** `temperature: 0.2`, `max_tokens: 600`, `response_format: { type: 'json_object' }`

The low temperature keeps analysis deterministic. The JSON response format prevents hallucinated text outside the schema.

### `chatWithAI(message: string, deviceContext?: Device): Promise<string>`

Freeform chat with an IT assistant system prompt. When `deviceContext` is provided, device details are prepended to the user message.

**Model settings:** `temperature: 0.3`, `max_tokens: 500`

**System prompt:** Specialises the model in Intune and ManageEngine. Instructs it to be concise and action-oriented.

### `isOpenAIConfigured(): boolean`

Returns `true` if `OPENAI_API_KEY` env var is set.

### Client lifecycle

The OpenAI client is created lazily on first use and cached in a module-level variable. It throws `Error('OPENAI_API_KEY is not configured')` if the key is missing.

---

## Adding a new service

1. Create `server/src/services/myservice.ts`
2. Read config from `integrationStore` or env vars
3. Export typed functions that return `Promise<Device[]>` (or whatever shape you need)
4. Add a config interface to `integrationStore.ts` and register getter/setter functions
5. Call the service from a route handler in `server/src/routes/`

---

## `store/integrationStore.ts`

Runtime credential and fetch result cache. Not a database — resets on server restart.

```ts
// Store credentials (called from routes/integrations.ts)
setIntuneConfig({ tenantId, clientId, clientSecret })
setManageEngineConfig({ apiKey, serverUrl })
setOpenAIConfig({ apiKey, orgId, model })

// Read credentials (env vars take precedence over runtime store)
getIntuneConfig()       // → RuntimeIntuneConfig | undefined
getManageEngineConfig() // → RuntimeManageEngineConfig | undefined
getOpenAIConfig()       // → RuntimeOpenAIConfig | undefined

// Check if configured
isConfigured('intune')       // → boolean
isConfigured('openai')       // → boolean

// Cache fetch results
recordFetchResult('intune', { deviceCount, lastFetchAt, latencyMs, error })
getFetchResult('manageEngine') // → IntegrationFetchResult | null
```

Credentials are read from **env vars first**, then runtime store. So `.env` credentials always win.
