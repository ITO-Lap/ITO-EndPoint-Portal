import { getEntraConfig } from '../store/integrationStore.js'
import type { RuntimeEntraConfig } from '../store/integrationStore.js'

// ── Public data types ──────────────────────────────────────────────────────────

export interface EntraSignIn {
  id:                     string
  userDisplayName:        string
  userPrincipalName:      string
  createdDateTime:        string
  appDisplayName:         string
  ipAddress:              string | null
  location:               { city: string; countryOrRegion: string } | null
  status:                 { errorCode: number; failureReason: string | null }
  conditionalAccessStatus:'success' | 'failure' | 'notApplied' | 'unknownFutureValue'
  riskLevelDuringSignIn:  string
  mfaDetail:              { authMethod: string } | null
  clientAppUsed:          string
}

export interface EntraDirectoryAudit {
  id:                  string
  activityDateTime:    string
  activityDisplayName: string
  category:            string
  result:              string
  initiatedBy: {
    user: { displayName: string; userPrincipalName: string; ipAddress: string | null } | null
  }
  targetResources: Array<{ displayName: string | null; type: string }>
}

export interface EntraRiskySignIn {
  id:                    string
  userDisplayName:       string
  userPrincipalName:     string
  createdDateTime:       string
  riskLevelDuringSignIn: string
  riskDetail:            string
  ipAddress:             string | null
  location:              { city: string; countryOrRegion: string } | null
  status:                { errorCode: number; failureReason: string | null }
}

export interface EntraUser {
  id:                 string
  displayName:        string
  userPrincipalName:  string
  department:         string | null
  accountEnabled:     boolean
  createdDateTime:    string
  signInActivity:     { lastSignInDateTime: string | null } | null
}

export interface EntraMfaRegistration {
  id:                   string
  userDisplayName:      string
  userPrincipalName:    string
  isMfaRegistered:      boolean
  isMfaCapable:         boolean
  isPasswordlessCapable:boolean
  isSsprRegistered:     boolean
  defaultMfaMethod:     string
  methodsRegistered:    string[]
}

export interface EntraData {
  signIns:         EntraSignIn[]
  directoryAudits: EntraDirectoryAudit[]
  riskySignIns:    EntraRiskySignIn[]
  users:           EntraUser[]
  mfaRegistrations:EntraMfaRegistration[]
  fetchedAt:       number
}

// ── Token cache ────────────────────────────────────────────────────────────────

interface TokenCache { token: string; expiresAt: number; tenantId: string }
let tokenCache: TokenCache | null = null

async function getAccessToken(cfg: RuntimeEntraConfig): Promise<string> {
  if (tokenCache && tokenCache.tenantId === cfg.tenantId && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token
  }
  const url = `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    client_id:     cfg.clientId,
    client_secret: cfg.clientSecret,
    scope:         'https://graph.microsoft.com/.default',
    grant_type:    'client_credentials',
  })
  const res = await fetch(url, { method: 'POST', body })
  if (!res.ok) throw new Error(`Entra auth failed: ${res.status} ${res.statusText}`)
  const data = await res.json() as { access_token: string; expires_in: number }
  tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000, tenantId: cfg.tenantId }
  return tokenCache.token
}

async function graphGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Graph ${path}: ${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

// Follows @odata.nextLink to retrieve all pages of a collection
async function graphGetAll<T>(token: string, initialPath: string): Promise<T[]> {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const results: T[] = []
  let url: string | null = `https://graph.microsoft.com/v1.0${initialPath}`
  while (url) {
    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`Graph ${url}: ${res.status} ${res.statusText}`)
    const data = await res.json() as { value: T[]; '@odata.nextLink'?: string }
    results.push(...(data.value ?? []))
    url = data['@odata.nextLink'] ?? null
  }
  return results
}

// ── Graph API fetchers (each silently returns [] on permission error) ──────────

async function fetchSignIns(token: string): Promise<EntraSignIn[]> {
  try {
    const data = await graphGet<{ value: EntraSignIn[] }>(
      token,
      '/auditLogs/signIns?$top=200&$orderby=createdDateTime desc&$select=id,userDisplayName,userPrincipalName,createdDateTime,appDisplayName,ipAddress,location,status,conditionalAccessStatus,riskLevelDuringSignIn,mfaDetail,clientAppUsed',
    )
    return data.value ?? []
  } catch { return [] }
}

async function fetchDirectoryAudits(token: string): Promise<EntraDirectoryAudit[]> {
  try {
    const data = await graphGet<{ value: EntraDirectoryAudit[] }>(
      token,
      '/auditLogs/directoryAudits?$top=200&$orderby=activityDateTime desc',
    )
    return data.value ?? []
  } catch { return [] }
}

async function fetchRiskySignIns(token: string): Promise<EntraRiskySignIn[]> {
  try {
    const data = await graphGet<{ value: EntraRiskySignIn[] }>(
      token,
      '/identityProtection/riskySignIns?$top=100&$orderby=createdDateTime desc',
    )
    return data.value ?? []
  } catch { return [] }
}

async function fetchUsers(token: string): Promise<EntraUser[]> {
  try {
    return await graphGetAll<EntraUser>(
      token,
      '/users?$top=999&$select=id,displayName,userPrincipalName,department,accountEnabled,createdDateTime,signInActivity&$orderby=displayName',
    )
  } catch { return [] }
}

async function fetchMfaRegistrations(token: string): Promise<EntraMfaRegistration[]> {
  try {
    return await graphGetAll<EntraMfaRegistration>(
      token,
      '/reports/authenticationMethods/userRegistrationDetails?$top=999',
    )
  } catch { return [] }
}

// ── Per-user detail types ──────────────────────────────────────────────────────

interface MemberOfItem {
  id: string
  displayName: string
  '@odata.type': string
  groupTypes?: string[]
  mailEnabled?: boolean
  securityEnabled?: boolean
}

interface AppRoleAssignment {
  id: string
  appDisplayName: string
  resourceDisplayName: string
  createdDateTime: string
}

interface LicenseDetail {
  id: string
  skuPartNumber: string
  servicePlans: Array<{ servicePlanName: string; provisioningStatus: string }>
}

export interface EntraUserDetails {
  signIns:  EntraSignIn[]
  roles:    Array<{ id: string; displayName: string }>
  groups:   Array<{ id: string; displayName: string; groupTypes: string[]; mailEnabled: boolean; securityEnabled: boolean }>
  apps:     Array<{ id: string; appDisplayName: string; resourceDisplayName: string; createdDateTime: string }>
  licenses: Array<{ id: string; skuPartNumber: string; servicePlans: Array<{ servicePlanName: string; provisioningStatus: string }> }>
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function getEntraData(cfg?: RuntimeEntraConfig): Promise<EntraData> {
  const config = cfg ?? getEntraConfig()
  if (!config) throw new Error('Entra ID credentials not configured')

  const token = await getAccessToken(config)

  // Fetch all endpoints concurrently; each silently returns [] if a permission is missing
  const [signIns, directoryAudits, riskySignIns, users, mfaRegistrations] = await Promise.all([
    fetchSignIns(token),
    fetchDirectoryAudits(token),
    fetchRiskySignIns(token),
    fetchUsers(token),
    fetchMfaRegistrations(token),
  ])

  return { signIns, directoryAudits, riskySignIns, users, mfaRegistrations, fetchedAt: Date.now() }
}

export async function getEntraUserDetails(userId: string): Promise<EntraUserDetails> {
  const config = getEntraConfig()
  if (!config) throw new Error('Entra ID credentials not configured')

  const token = await getAccessToken(config)

  const [signInsRes, memberOfRes, appsRes, licensesRes] = await Promise.allSettled([
    graphGet<{ value: EntraSignIn[] }>(
      token,
      `/auditLogs/signIns?$filter=userId eq '${userId}'&$top=20&$orderby=createdDateTime desc`,
    ),
    graphGetAll<MemberOfItem>(token, `/users/${userId}/memberOf?$top=200&$select=id,displayName,groupTypes,mailEnabled,securityEnabled`),
    graphGet<{ value: AppRoleAssignment[] }>(token, `/users/${userId}/appRoleAssignments?$select=id,appDisplayName,resourceDisplayName,createdDateTime`),
    graphGetAll<LicenseDetail>(token, `/users/${userId}/licenseDetails?$select=id,skuPartNumber,servicePlans`),
  ])

  const memberOf = memberOfRes.status === 'fulfilled' ? memberOfRes.value : []

  return {
    signIns:  signInsRes.status  === 'fulfilled' ? (signInsRes.value.value  ?? []) : [],
    roles:    memberOf.filter(m => m['@odata.type'] === '#microsoft.graph.directoryRole')
                      .map(m => ({ id: m.id, displayName: m.displayName })),
    groups:   memberOf.filter(m => m['@odata.type'] === '#microsoft.graph.group')
                      .map(m => ({ id: m.id, displayName: m.displayName, groupTypes: m.groupTypes ?? [], mailEnabled: m.mailEnabled ?? false, securityEnabled: m.securityEnabled ?? false })),
    apps:     appsRes.status     === 'fulfilled' ? (appsRes.value.value     ?? []) : [],
    licenses: licensesRes.status === 'fulfilled' ? licensesRes.value : [],
  }
}

export function isEntraConfigured(): boolean {
  return !!getEntraConfig()
}

export function invalidateEntraTokenCache(): void {
  tokenCache = null
}
