// Microsoft Graph API connector — expanded for Intelligence Platform.
//
// Required Azure AD App Registration permissions (Application, not Delegated):
//   DeviceManagementManagedDevices.Read.All  — managed devices
//   DeviceManagementApps.Read.All            — mobile apps + install statuses
//   DeviceManagementConfiguration.Read.All  — config profiles, compliance policies, baselines
//   DeviceManagementRBAC.Read.All            — role assignments
//   Directory.Read.All                       — tenant directory info
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
const GRAPH = 'https://graph.microsoft.com/v1.0'

async function getToken(creds: TenantCredentials): Promise<string> {
  const cached = tokenCache.get(creds.tenantId)
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token

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

// ─── Managed Devices ─────────────────────────────────────────────────────────
// Permission: DeviceManagementManagedDevices.Read.All
export interface GraphManagedDevice {
  id: string
  deviceName: string
  userPrincipalName: string
  operatingSystem: string
  osVersion: string
  osBuildNumber: string | null
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
  processorArchitecture: string
}

const DEVICE_SELECT = [
  'id', 'deviceName', 'userPrincipalName', 'operatingSystem', 'osVersion', 'osBuildNumber',
  'complianceState', 'lastSyncDateTime', 'enrolledDateTime', 'isEncrypted',
  'manufacturer', 'model', 'serialNumber', 'managedDeviceOwnerType', 'managementAgent',
  'deviceEnrollmentType', 'azureADRegistered', 'azureADDeviceId',
  'totalStorageSpaceInBytes', 'freeStorageSpaceInBytes', 'physicalMemoryInBytes', 'processorArchitecture',
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
  return graphGetAll<GraphMobileApp>(creds, '/deviceManagement/mobileApps', {
    '$filter': 'isAssigned eq true',
    '$select': 'id,displayName,publisher,createdDateTime,lastModifiedDateTime,isFeatured,@odata.type',
  })
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
  return graphGetAll(creds, `/deviceManagement/mobileApps/${appId}/deviceStatuses`)
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
