// Microsoft Graph API connector — expanded for Intelligence Platform.
//
// Required Azure AD App Registration permissions (Application, not Delegated):
//   DeviceManagementManagedDevices.Read.All  — managed devices
//   DeviceManagementApps.Read.All            — mobile apps + install statuses
//   DeviceManagementConfiguration.Read.All  — config profiles, compliance policies, baselines
//   DeviceManagementScripts.Read.All         — PowerShell/shell scripts, remediations (see
//                                              Intune Scripts & Configurations feature —
//                                              Microsoft moved scripts off
//                                              DeviceManagementConfiguration.Read.All onto
//                                              this dedicated permission in 2025)
//   DeviceManagementRBAC.Read.All            — role assignments
//   DeviceManagementServiceConfig.Read.All   — Windows Autopilot deployment profiles (see
//                                              Intune Scripts & Configurations feature —
//                                              a DIFFERENT permission from every other
//                                              scope above; Autopilot is not covered by
//                                              DeviceManagementConfiguration.Read.All)
//   Directory.Read.All                       — tenant directory info
//   Group.Read.All                           — resolve assignment target group ids to names
//   User.Read.All                            — users + sign-in activity
//   Reports.Read.All                         — usage / sign-in reports

export interface TenantCredentials {
  tenantId: string
  clientId: string
  clientSecret: string
}

interface TokenCacheEntry {
  token: string
  expiresAt: number
}

// Per-tenant token cache (client_credentials flow)
const tokenCache = new Map<string, TokenCacheEntry>()
// De-dupes concurrent token acquisitions for the same tenant — without
// this, N parallel graphGetAll* calls (e.g. Intune Scripts & Configurations'
// listAllItems fanning out to 7+ collections via Promise.allSettled) would
// each see a cache miss before any of them finishes writing the cache, and
// each fire its own OAuth request instead of sharing one.
const inflightTokenRequests = new Map<string, Promise<string>>()
export const GRAPH = 'https://graph.microsoft.com/v1.0'
export const GRAPH_BETA = 'https://graph.microsoft.com/beta'
export type GraphBase = typeof GRAPH | typeof GRAPH_BETA

async function requestNewToken(creds: TenantCredentials): Promise<string> {
  const url = `https://login.microsoftonline.com/${creds.tenantId}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    client_id:     creds.clientId,
    client_secret: creds.clientSecret,
    scope:         'https://graph.microsoft.com/.default',
    grant_type:    'client_credentials',
  })

  const res = await fetch(url, { method: 'POST', body })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Graph OAuth failed (${res.status}): ${text}`)
  }

  const data = await res.json() as { access_token: string; expires_in: number }
  const entry: TokenCacheEntry = {
    token:     data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  tokenCache.set(creds.tenantId, entry)
  return entry.token
}

async function getToken(creds: TenantCredentials): Promise<string> {
  const cached = tokenCache.get(creds.tenantId)
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token

  const inflight = inflightTokenRequests.get(creds.tenantId)
  if (inflight) return inflight

  const request = requestNewToken(creds).finally(() => {
    inflightTokenRequests.delete(creds.tenantId)
  })
  inflightTokenRequests.set(creds.tenantId, request)
  return request
}

async function graphGet<T>(
  creds: TenantCredentials,
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const token = await getToken(creds)
  const url = new URL(`${GRAPH}${path}`)
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Graph API ${res.status} on ${path}: ${body}`)
  }
  return res.json() as Promise<T>
}

// Follows @odata.nextLink to page through large collections
async function graphGetAll<T>(
  creds: TenantCredentials,
  path: string,
  params?: Record<string, string>
): Promise<T[]> {
  const token = await getToken(creds)
  const results: T[] = []
  let nextUrl: string | null = (() => {
    const u = new URL(`${GRAPH}${path}`)
    if (params) Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v))
    return u.toString()
  })()

  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Graph API ${res.status} on ${path}: ${body}`)
    }
    const data = await res.json() as { value: T[]; '@odata.nextLink'?: string }
    results.push(...data.value)
    nextUrl = data['@odata.nextLink'] ?? null
  }

  return results
}

// ─── Retry-capable, version-selectable requests ──────────────────────────────
// Used by callers that need /beta support and resilience against throttling
// (e.g. Intune Scripts & Configurations) without changing graphGet/graphGetAll
// above, which existing callers (intelligence.ts) already depend on as-is.
// Retry/backoff logic mirrors intuneAuditGraph.ts's fetchAuditEventsPage —
// copied rather than imported, matching this repo's convention of small
// per-file utilities over a shared lib.

export class FatalGraphError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}
export class TransientGraphError extends Error {}

function defaultSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function backoffWithJitter(attempt: number): number {
  const base = Math.min(30_000, 500 * 2 ** attempt)
  return base / 2 + Math.random() * (base / 2)
}

// Strips anything that could contain a token/secret before logging/returning.
function sanitizeGraphError(body: string, status: number): string {
  const trimmed = body.slice(0, 500)
  const withoutBearer = trimmed.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
  return `Microsoft Graph returned ${status}: ${withoutBearer || 'no error body'}`
}

interface RetryOptions {
  timeoutMs?: number
  maxRetries?: number
  fetchImpl?: typeof fetch
  sleepImpl?: (ms: number) => Promise<void>
}

async function fetchWithRetry(url: string, token: string, opts: RetryOptions = {}): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? 30_000
  const maxRetries = opts.maxRetries ?? 5
  const doFetch = opts.fetchImpl ?? fetch
  const sleep = opts.sleepImpl ?? defaultSleep

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await doFetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      clearTimeout(timer)

      if (res.status === 429) {
        const retryAfterHeader = res.headers.get('Retry-After')
        const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : backoffWithJitter(attempt)
        if (attempt >= maxRetries) throw new TransientGraphError('Graph API rate-limited (429) and retries exhausted')
        await sleep(Number.isFinite(retryAfterMs) ? retryAfterMs : backoffWithJitter(attempt))
        continue
      }

      if (res.status >= 500) {
        if (attempt >= maxRetries) throw new TransientGraphError(`Graph API ${res.status} and retries exhausted`)
        await sleep(backoffWithJitter(attempt))
        continue
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new FatalGraphError(sanitizeGraphError(body, res.status), res.status)
      }

      return res
    } catch (err) {
      clearTimeout(timer)
      if (err instanceof FatalGraphError) throw err
      if (err instanceof TransientGraphError) throw err
      const isAbort = err instanceof Error && err.name === 'AbortError'
      if (attempt >= maxRetries) {
        const msg = err instanceof Error ? err.message : String(err)
        throw new TransientGraphError(`Graph request failed after ${maxRetries} retries: ${isAbort ? 'timeout' : msg}`)
      }
      await sleep(backoffWithJitter(attempt))
    }
  }

  throw new TransientGraphError('Graph request failed for an unknown reason')
}

/** Single-item GET against a chosen API version (v1.0 or beta), with 429/5xx
 *  retry and Retry-After honoring. */
export async function graphGetV<T>(
  creds: TenantCredentials,
  base: GraphBase,
  path: string,
  params?: Record<string, string>,
  opts?: RetryOptions
): Promise<T> {
  const token = await getToken(creds)
  const url = new URL(`${base}${path}`)
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetchWithRetry(url.toString(), token, opts)
  return res.json() as Promise<T>
}

/** Follows @odata.nextLink against a chosen API version, with 429/5xx retry
 *  and Retry-After honoring on every page. */
export async function graphGetAllV<T>(
  creds: TenantCredentials,
  base: GraphBase,
  path: string,
  params?: Record<string, string>,
  opts?: RetryOptions
): Promise<T[]> {
  const token = await getToken(creds)
  const results: T[] = []
  let nextUrl: string | null = (() => {
    const u = new URL(`${base}${path}`)
    if (params) Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v))
    return u.toString()
  })()

  while (nextUrl) {
    const res = await fetchWithRetry(nextUrl, token, opts)
    const data = await res.json() as { value: T[]; '@odata.nextLink'?: string }
    results.push(...data.value)
    nextUrl = data['@odata.nextLink'] ?? null
  }

  return results
}

// ─── Groups (resolve assignment target group ids to display names) ──────────
// Permission: Group.Read.All
export interface GraphGroupSummary {
  id: string
  displayName: string
}

/** Resolves a list of group ids to display names, chunked to keep each
 *  $filter "id in (...)" clause reasonably sized. Returns a Map so callers
 *  can look up by id; ids Graph doesn't return (e.g. deleted groups) are
 *  simply absent from the map rather than causing a failure. */
export async function getGroupDisplayNames(
  creds: TenantCredentials,
  groupIds: string[]
): Promise<Map<string, string>> {
  // Only well-formed GUIDs are interpolated into the $filter clause below —
  // guards against OData filter injection from an unexpected upstream value.
  const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const unique = Array.from(new Set(groupIds)).filter(id => GUID_RE.test(id))
  const map = new Map<string, string>()
  const CHUNK_SIZE = 15

  for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
    const chunk = unique.slice(i, i + CHUNK_SIZE)
    const filter = `id in (${chunk.map(id => `'${id}'`).join(',')})`
    const groups = await graphGetAllV<GraphGroupSummary>(creds, GRAPH, '/groups', {
      '$filter': filter,
      '$select': 'id,displayName',
    })
    for (const g of groups) map.set(g.id, g.displayName)
  }

  return map
}

// ─── Managed Devices ─────────────────────────────────────────────────────────
// Permission: DeviceManagementManagedDevices.Read.All
export interface GraphManagedDevice {
  id: string
  deviceName: string
  userPrincipalName: string
  operatingSystem: string
  osVersion: string
  complianceState: 'compliant' | 'noncompliant' | 'conflict' | 'error' | 'inGracePeriod' | 'configManager' | 'unknown'
  lastSyncDateTime: string
  enrolledDateTime: string
  isEncrypted: boolean
  manufacturer: string
  model: string
  serialNumber: string
  managedDeviceOwnerType: string
  managementAgent: string
  deviceEnrollmentType: string
  azureADRegistered: boolean
  azureADDeviceId: string
  totalStorageSpaceInBytes: number
  freeStorageSpaceInBytes: number
  physicalMemoryInBytes: number
}

// Only fields confirmed valid in Graph v1.0 managedDevice $select
const DEVICE_SELECT = [
  'id', 'deviceName', 'userPrincipalName', 'operatingSystem', 'osVersion',
  'complianceState', 'lastSyncDateTime', 'enrolledDateTime', 'isEncrypted',
  'manufacturer', 'model', 'serialNumber', 'managedDeviceOwnerType', 'managementAgent',
  'deviceEnrollmentType', 'azureADRegistered', 'azureADDeviceId',
  'totalStorageSpaceInBytes', 'freeStorageSpaceInBytes', 'physicalMemoryInBytes',
].join(',')

export async function getManagedDevices(creds: TenantCredentials): Promise<GraphManagedDevice[]> {
  return graphGetAll<GraphManagedDevice>(creds, '/deviceManagement/managedDevices', {
    '$select': DEVICE_SELECT,
  })
}

// ─── Compliance Policies ──────────────────────────────────────────────────────
// Permission: DeviceManagementConfiguration.Read.All
export interface GraphCompliancePolicy {
  id: string
  displayName: string
  description: string
  platformType: string
  createdDateTime: string
  lastModifiedDateTime: string
}

export async function getCompliancePolicies(creds: TenantCredentials): Promise<GraphCompliancePolicy[]> {
  return graphGetAll<GraphCompliancePolicy>(creds, '/deviceManagement/deviceCompliancePolicies')
}

export interface GraphPolicyDeviceStatus {
  deviceDisplayName: string
  userPrincipalName: string
  status: string
  lastReportedDateTime: string
}

export async function getCompliancePolicyDeviceStatuses(
  creds: TenantCredentials,
  policyId: string
): Promise<GraphPolicyDeviceStatus[]> {
  return graphGetAll(creds, `/deviceManagement/deviceCompliancePolicies/${policyId}/deviceStatuses`)
}

// ─── Configuration Profiles ───────────────────────────────────────────────────
// Permission: DeviceManagementConfiguration.Read.All
export interface GraphConfigProfile {
  id: string
  displayName: string
  description: string
  platformType: string
  createdDateTime: string
  lastModifiedDateTime: string
  version: number
}

export async function getConfigurationProfiles(creds: TenantCredentials): Promise<GraphConfigProfile[]> {
  return graphGetAll<GraphConfigProfile>(creds, '/deviceManagement/deviceConfigurations')
}

// ─── Mobile Apps ──────────────────────────────────────────────────────────────
// Permission: DeviceManagementApps.Read.All
export interface GraphMobileApp {
  id: string
  displayName: string
  publisher: string
  '@odata.type': string
  createdDateTime: string
  lastModifiedDateTime: string
  isFeatured: boolean
}

export async function getMobileApps(creds: TenantCredentials): Promise<GraphMobileApp[]> {
  try {
    // mobileApps is a navigation property of deviceAppManagement, not deviceManagement
    return await graphGetAll<GraphMobileApp>(creds, '/deviceAppManagement/mobileApps', {
      '$select': 'id,displayName,publisher,createdDateTime,lastModifiedDateTime,isFeatured',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('403') || msg.includes('Forbidden')) {
      console.warn('[graphApi] getMobileApps: permission denied — DeviceManagementApps.Read.All may be missing')
      return []
    }
    throw err
  }
}

export interface GraphAppInstallStatus {
  deviceName: string
  userPrincipalName: string
  deviceId: string
  installState: 'installed' | 'failed' | 'notInstalled' | 'uninstallFailed' | 'pendingInstall' | 'unknown' | 'notApplicable'
  lastSyncDateTime: string
  errorCode: number
}

export async function getAppInstallStatuses(
  creds: TenantCredentials,
  appId: string
): Promise<GraphAppInstallStatus[]> {
  // Permission: DeviceManagementApps.Read.All
  return graphGetAll(creds, `/deviceAppManagement/mobileApps/${appId}/deviceStatuses`)
}

// ─── Security Baselines ───────────────────────────────────────────────────────
// Permission: DeviceManagementConfiguration.Read.All
export interface GraphSecurityBaseline {
  id: string
  displayName: string
  description: string
  versionInfo: string
  isSuperseded: boolean
  isSuperseding: boolean
}

export async function getSecurityBaselines(creds: TenantCredentials): Promise<GraphSecurityBaseline[]> {
  const data = await graphGet<{ value: GraphSecurityBaseline[] }>(
    creds,
    '/deviceManagement/templates',
    { '$filter': "templateType eq 'securityBaseline'" }
  )
  return data.value
}

// ─── Users ────────────────────────────────────────────────────────────────────
// Permission: User.Read.All
export interface GraphUser {
  id: string
  displayName: string
  userPrincipalName: string
  mail: string
  department: string
  jobTitle: string
  accountEnabled: boolean
  createdDateTime: string
}

export async function getUsers(creds: TenantCredentials): Promise<GraphUser[]> {
  return graphGetAll<GraphUser>(creds, '/users', {
    '$select': 'id,displayName,userPrincipalName,mail,department,jobTitle,accountEnabled,createdDateTime',
    '$top':    '999',
  })
}

/**
 * Number of items Graph reports for a collection, via `<path>/$count` — an
 * independent check on how many rows a paged fetch should have returned.
 * `/devices` needs `ConsistencyLevel: eventual`. Returns null when Graph cannot
 * answer (permissions, throttling, network); callers treat that as "unverified".
 */
export async function getGraphCount(creds: TenantCredentials, path: string, opts: { eventual?: boolean } = {}): Promise<number | null> {
  try {
    const token = await getToken(creds)
    const res = await fetch(`${GRAPH}${path}/$count`, { headers: { Authorization: `Bearer ${token}`, ...(opts.eventual ? { ConsistencyLevel: 'eventual' } : {}) } })
    if (!res.ok) return null
    const value = Number((await res.text()).trim())
    return Number.isInteger(value) && value >= 0 ? value : null
  } catch {
    return null
  }
}

// ─── Entra ID directory device objects (Graph /devices) ──────────────────────
// Needs the Device.Read.All application permission. `id` is the directory
// object ID; `deviceId` is the device identity that Intune reports as azureADDeviceId.
export interface GraphEntraDevice {
  id: string
  deviceId: string | null
  displayName: string | null
  operatingSystem: string | null
  operatingSystemVersion: string | null
  trustType: string | null
  isManaged: boolean | null
  isCompliant: boolean | null
  accountEnabled: boolean | null
  registrationDateTime: string | null
  approximateLastSignInDateTime: string | null
}

const ENTRA_DEVICE_SELECT = [
  'id', 'deviceId', 'displayName', 'operatingSystem', 'operatingSystemVersion', 'trustType',
  'isManaged', 'isCompliant', 'accountEnabled', 'registrationDateTime', 'approximateLastSignInDateTime',
].join(',')

export async function getEntraDirectoryDevices(creds: TenantCredentials): Promise<GraphEntraDevice[]> {
  return graphGetAll<GraphEntraDevice>(creds, '/devices', { '$select': ENTRA_DEVICE_SELECT, '$top': '999' })
}

// ─── Helper: build creds from environment (single-tenant default) ─────────────
export function credentialsFromEnv(): TenantCredentials {
  const tenantId     = process.env.INTUNE_TENANT_ID     ?? process.env.ENTRA_TENANT_ID ?? ''
  const clientId     = process.env.INTUNE_CLIENT_ID     ?? process.env.ENTRA_CLIENT_ID ?? ''
  const clientSecret = process.env.INTUNE_CLIENT_SECRET ?? process.env.ENTRA_CLIENT_SECRET ?? ''
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Intune/Entra credentials not configured. Set INTUNE_TENANT_ID, INTUNE_CLIENT_ID, INTUNE_CLIENT_SECRET in server/.env')
  }
  return { tenantId, clientId, clientSecret }
}
