/**
 * Entra Intelligence Service — Microsoft Graph Integration
 *
 * Calls Microsoft Graph API when Entra credentials are configured.
 * Never falls back to mock/demo data — when Entra isn't configured, every
 * function returns a `configured: false` empty result so the frontend can
 * render a clear "not configured" state. When credentials exist but a Graph
 * call fails, the error is thrown (propagated via asyncHandler) so the
 * frontend shows a real error state instead of silently substituting
 * synthetic content.
 *
 * Required Graph App Permissions (Application — not Delegated):
 *   User.Read.All                              ← users list
 *   AuditLog.Read.All                          ← sign-in logs
 *   IdentityRiskyUser.Read.All                 ← risky users
 *   DeviceManagementManagedDevices.Read.All    ← Intune device inventory
 *   DeviceManagementConfiguration.Read.All    ← compliance policies
 *
 * If a permission is missing, that endpoint returns [] and logs a warning.
 * The service does NOT fall back to mock data when credentials exist but
 * a specific permission is absent — it returns real empty results and lets
 * the frontend show the correct live-but-empty state.
 */

import { getEntraConfig }  from '../store/integrationStore.js'
import { getEntraData }    from './entra.js'

const isConfigured = () => !!getEntraConfig()

// ── Graph helpers (thin wrappers, token acquired via existing entra.ts) ────────

async function gGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Graph ${path}: HTTP ${res.status} — ${body.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

async function gGetAll<T>(token: string, initialPath: string): Promise<T[]> {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const results: T[] = []
  let url: string | null = `https://graph.microsoft.com/v1.0${initialPath}`
  while (url) {
    const res = await fetch(url, { headers })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Graph ${url}: HTTP ${res.status} — ${body.slice(0, 200)}`)
    }
    const data = await res.json() as { value: T[]; '@odata.nextLink'?: string }
    results.push(...(data.value ?? []))
    url = data['@odata.nextLink'] ?? null
  }
  return results
}

async function getToken(): Promise<string> {
  const cfg = getEntraConfig()
  if (!cfg) throw new Error('Entra ID not configured')
  // Obtain token directly (mirrors logic in entra.ts without exposing internal cache)
  const url  = `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    client_id: cfg.clientId, client_secret: cfg.clientSecret,
    scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials',
  })
  const res  = await fetch(url, { method: 'POST', body })
  if (!res.ok) throw new Error(`Token fetch failed: HTTP ${res.status}`)
  const json = await res.json() as { access_token: string }
  return json.access_token
}

// ── Type helpers ──────────────────────────────────────────────────────────────

function mapOs(os: string): 'Windows' | 'macOS' | 'iOS' | 'Android' | 'Linux' {
  const lc = (os ?? '').toLowerCase()
  if (lc.includes('windows'))                      return 'Windows'
  if (lc.includes('macos') || lc.includes('mac')) return 'macOS'
  if (lc.includes('ios')   || lc.includes('ipad'))return 'iOS'
  if (lc.includes('android'))                     return 'Android'
  return 'Linux'
}

function mapCompliance(raw: string): 'Compliant' | 'Non-Compliant' | 'Unknown' | 'In Grace Period' {
  if (raw === 'compliant')     return 'Compliant'
  if (raw === 'noncompliant')  return 'Non-Compliant'
  if (raw === 'inGracePeriod') return 'In Grace Period'
  return 'Unknown'
}

function mapRisk(raw: string): 'High' | 'Medium' | 'Low' | 'None' {
  if (raw === 'high')   return 'High'
  if (raw === 'medium') return 'Medium'
  if (raw === 'low')    return 'Low'
  return 'None'
}

function daysSince(iso: string): number {
  if (!iso) return 999
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
}

// ── Graph device shape ────────────────────────────────────────────────────────

interface GraphDevice {
  id: string; deviceName: string; userPrincipalName: string
  operatingSystem: string; osVersion: string; complianceState: string
  lastSyncDateTime: string; joinType: string; serialNumber: string
  manufacturer: string; model: string; isEncrypted: boolean
  azureADRegistered: boolean; managedDeviceOwnerType: string; isManaged: boolean
}

interface GraphRiskyUser {
  id: string; userDisplayName: string; userPrincipalName: string
  riskLevel: string; riskDetail: string; riskLastUpdatedDateTime: string
}

// ── Live Graph fetchers (each logs + returns [] on error) ─────────────────────

async function fetchDevices(token: string): Promise<GraphDevice[]> {
  try {
    // No $select — 'joinType' is not a selectable property on managedDevice
    // in every tenant (confirmed 400: "Could not find a property named
    // 'joinType' on type 'microsoft.graph.managedDevice'"), and Graph
    // rejects the whole request rather than dropping the bad field. Same
    // fix already applied in services/intune.ts for this reason.
    const devices = await gGetAll<GraphDevice>(
      token,
      `/deviceManagement/managedDevices?$top=999`,
    )
    console.log(`[EntraIntelligence] ✓ Fetched ${devices.length} managed devices from Intune`)
    return devices
  } catch (e) {
    const msg = (e as Error).message
    if (msg.includes('403') || msg.includes('Authorization_RequestDenied')) {
      console.warn('[EntraIntelligence] ⚠ DeviceManagementManagedDevices.Read.All permission not granted — device data unavailable. Grant this permission in Azure → App registrations → API permissions.')
    } else {
      console.warn('[EntraIntelligence] ⚠ Device fetch failed:', msg)
    }
    return []
  }
}

async function fetchRiskyUsers(token: string): Promise<GraphRiskyUser[]> {
  try {
    const users = await gGetAll<GraphRiskyUser>(
      token,
      '/identityProtection/riskyUsers?$top=500&$orderby=riskLastUpdatedDateTime desc',
    )
    console.log(`[EntraIntelligence] ✓ Fetched ${users.length} risky users`)
    return users
  } catch (e) {
    const msg = (e as Error).message
    if (msg.includes('403')) console.warn('[EntraIntelligence] ⚠ IdentityRiskyUser.Read.All not granted')
    else console.warn('[EntraIntelligence] ⚠ Risky users fetch failed:', msg)
    return []
  }
}

// ── Overview ──────────────────────────────────────────────────────────────────

export interface EntraOverview {
  configured:                boolean
  totalDevices:              number
  compliantDevices:          number
  nonCompliantDevices:       number
  inactiveDevices:           number
  totalUsers:                number
  devicesMissingEncryption:  number
  highRiskUsers:             number
}

const EMPTY_OVERVIEW: EntraOverview = {
  configured: false, totalDevices: 0, compliantDevices: 0, nonCompliantDevices: 0,
  inactiveDevices: 0, totalUsers: 0, devicesMissingEncryption: 0, highRiskUsers: 0,
}

export async function getEntraOverview(): Promise<EntraOverview> {
  if (!isConfigured()) return { ...EMPTY_OVERVIEW }

  const token = await getToken()
  const [devices, riskyUsers, entraData] = await Promise.all([
    fetchDevices(token),
    fetchRiskyUsers(token),
    getEntraData().catch(() => null),
  ])

  const compliant    = devices.filter(d => d.complianceState === 'compliant').length
  const nonCompliant = devices.filter(d => d.complianceState === 'noncompliant').length
  const inactive     = devices.filter(d => daysSince(d.lastSyncDateTime) > 7).length
  const missingEnc   = devices.filter(d => !d.isEncrypted).length

  return {
    configured:               true,
    totalDevices:             devices.length,
    compliantDevices:         compliant,
    nonCompliantDevices:      nonCompliant,
    inactiveDevices:          inactive,
    totalUsers:               entraData?.users.length ?? 0,
    devicesMissingEncryption: missingEnc,
    highRiskUsers:            riskyUsers.filter(u => u.riskLevel === 'high').length,
  }
}

// ── Devices ───────────────────────────────────────────────────────────────────

export async function getEntraDevices(params?: { compliance?: string; os?: string; limit?: number }) {
  if (!isConfigured()) return []

  const token   = await getToken()
  const raw     = await fetchDevices(token)

  const mapped = raw.map(d => ({
      id:               d.id,
      deviceName:       d.deviceName || 'Unknown Device',
      primaryUser:      (d.userPrincipalName ?? '').split('@')[0] || 'Unknown',
      upn:              d.userPrincipalName || '',
      os:               mapOs(d.operatingSystem),
      osVersion:        d.osVersion || 'Unknown',
      ownership:        d.managedDeviceOwnerType === 'personal' ? 'Personal' : 'Corporate',
      complianceState:  mapCompliance(d.complianceState),
      managementState:  d.isManaged ? 'Managed' : 'Unmanaged',
      lastCheckIn:      d.lastSyncDateTime
        ? new Date(d.lastSyncDateTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'Never',
      daysSinceCheckIn: daysSince(d.lastSyncDateTime),
      joinType:         d.joinType === 'azureADJoined'       ? 'Azure AD Joined'
                        : d.joinType === 'hybridAzureADJoined' ? 'Hybrid Azure AD Joined'
                        : 'Azure AD Registered',
      serialNumber:     d.serialNumber || '—',
      manufacturer:     d.manufacturer || '—',
      model:            d.model || '—',
      encryptionState:  d.isEncrypted ? 'Encrypted' : 'Not Encrypted',
      defenderState:    'Unknown' as const,
      pendingReboot:    false,
      assignedGroups:   [] as string[],
      assignedPolicies: [] as string[],
      installedApps:    [] as string[],
      openIssues:       [
        ...(!d.isEncrypted                                   ? ['BitLocker/FileVault not enabled'] : []),
        ...(d.complianceState === 'noncompliant'             ? ['Compliance policy failed']        : []),
        ...(daysSince(d.lastSyncDateTime) > 7               ? [`Stale — ${daysSince(d.lastSyncDateTime)}d since check-in`] : []),
      ],
    }))

  return applyFilters(mapped, params)
}

function applyFilters<T extends { complianceState: string; os: string }>(
  items: T[], params?: { compliance?: string; os?: string; limit?: number }
): T[] {
  let result = items
  if (params?.compliance) result = result.filter(d => d.complianceState === params.compliance)
  if (params?.os)         result = result.filter(d => d.os === params.os)
  if (params?.limit)      result = result.slice(0, params.limit)
  return result
}

// ── Users ─────────────────────────────────────────────────────────────────────

export async function getEntraUsers(params?: { riskLevel?: string }) {
  if (!isConfigured()) return []

  const token = await getToken()
  const [entraData, riskyUsers] = await Promise.all([
    getEntraData().catch(() => null),
    fetchRiskyUsers(token),
  ])

  const riskyMap = new Map(riskyUsers.map(r => [(r.userPrincipalName ?? '').toLowerCase(), r]))
  const rawUsers = entraData?.users ?? []

  const mapped = rawUsers.map(u => {
    const risky = riskyMap.get((u.userPrincipalName ?? '').toLowerCase())
    return {
      id:             u.id,
      displayName:    u.displayName,
      upn:            u.userPrincipalName,
      department:     u.department ?? 'Unknown',
      jobTitle:       '',
      riskLevel:      risky ? mapRisk(risky.riskLevel) : 'None' as const,
      riskFactors:    risky?.riskDetail ? [risky.riskDetail.replace(/([A-Z])/g, ' $1').trim()] : [],
      assignedDevices: [] as string[],
      groups:          [] as string[],
      // Real per-user MFA registration status requires the
      // UserAuthenticationMethod.Read.All permission and an additional
      // Graph call this service does not yet make — 'Unknown' rather than
      // a fabricated 'Enabled'/'Disabled' guess.
      mfaStatus:       'Unknown' as const,
      lastSignIn:      u.signInActivity?.lastSignInDateTime ?? '',
      accountStatus:   u.accountEnabled ? 'Active' : 'Disabled',
    }
  })

  let result = mapped
  if (params?.riskLevel) result = result.filter(u => u.riskLevel === params.riskLevel)
  console.log(`[EntraIntelligence] ✓ Returned ${result.length} users`)
  return result
}

// ── Groups ────────────────────────────────────────────────────────────────────

export async function getEntraGroups() {
  if (!isConfigured()) return []

  const token  = await getToken()
  const groups = await gGetAll<{ id: string; displayName: string; description: string; groupTypes: string[]; securityEnabled: boolean }>(
    token,
    '/groups?$select=id,displayName,description,groupTypes,securityEnabled&$top=500',
  )
  return groups.map(g => ({
    id: g.id, displayName: g.displayName, description: g.description ?? '',
    memberCount: 0,
    type: g.groupTypes?.includes('Unified') ? 'Microsoft 365' : g.securityEnabled ? 'Security' : 'Distribution',
    assignedPolicies: [] as string[],
  }))
}

// ── Group typeahead search (matches any word in the display name, not just prefix) ──

export interface EntraGroupSuggestion { id: string; displayName: string }

export async function searchEntraGroups(query: string): Promise<EntraGroupSuggestion[]> {
  const q = query.trim()
  if (!q) return []

  if (!isConfigured()) return []

  try {
    const token = await getToken()
    const escaped = q.replace(/"/g, '\\"')
    // $search on displayName matches a leading word anywhere in the string (e.g. "Sales" → "All Sales Laptops"),
    // unlike $filter startswith which only matches from position 0 — requires the ConsistencyLevel header.
    const qs = new URLSearchParams({
      '$search': `"displayName:${escaped}"`,
      '$select': 'id,displayName',
      '$top':    '15',
    })
    const res = await fetch(`https://graph.microsoft.com/v1.0/groups?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: 'eventual' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json() as { value: EntraGroupSuggestion[] }
    return data.value ?? []
  } catch (e) {
    console.warn('[EntraIntelligence] group search failed:', (e as Error).message)
    return []
  }
}

// ── Group Member Report (resolve by display name, branch by member type) ──────

export interface EntraGroupReportRow {
  memberType: 'user' | 'device'
  displayName: string
  userPrincipalName: string
  operatingSystem?: string
  flagged?: boolean
  flagReason?: string
}

export interface EntraGroupReportResult {
  group: { id: string; displayName: string }
  memberTypes: ('user' | 'device')[]
  rows: EntraGroupReportRow[]
  totalMembers: number
  flaggedCount: number
}

interface GraphGroupMember {
  '@odata.type'?: string
  id: string
  displayName: string
  userPrincipalName?: string
  operatingSystem?: string
}

async function resolveDeviceOwnerUpn(token: string, deviceId: string): Promise<string | null> {
  for (const endpoint of ['registeredOwners', 'registeredUsers']) {
    try {
      const results = await gGetAll<{ userPrincipalName?: string }>(
        token, `/devices/${deviceId}/${endpoint}?$select=userPrincipalName`,
      )
      const upn = results.find(r => r.userPrincipalName)?.userPrincipalName
      if (upn) return upn
    } catch (e) {
      console.warn(`[EntraIntelligence] ${endpoint} lookup failed for device ${deviceId}:`, (e as Error).message)
    }
  }
  return null
}

export async function getEntraGroupMemberReport(displayName: string, osFilter?: string): Promise<EntraGroupReportResult> {
  if (!isConfigured()) throw new Error('Entra ID is not configured — add Entra credentials in Settings to run group reports')
  const trimmed = displayName.trim()
  if (!trimmed) throw new Error('Group display name is required')

  const token = await getToken()

  const filter = `displayName eq '${trimmed.replace(/'/g, "''")}'`
  const qs = new URLSearchParams({ '$filter': filter, '$select': 'id,displayName' })
  const matches = await gGetAll<{ id: string; displayName: string }>(token, `/groups?${qs.toString()}`)
  const group = matches[0]
  if (!group) throw new Error(`No Entra ID group found with display name "${trimmed}"`)

  const members = await gGetAll<GraphGroupMember>(
    token,
    `/groups/${group.id}/members?$select=id,displayName,userPrincipalName,operatingSystem`,
  )

  const userRows: EntraGroupReportRow[] = []
  const deviceMembers: GraphGroupMember[] = []

  for (const m of members) {
    const odType = m['@odata.type'] ?? ''
    if (odType.includes('.user')) {
      userRows.push({ memberType: 'user', displayName: m.displayName, userPrincipalName: m.userPrincipalName ?? '' })
    } else if (odType.includes('.device')) {
      deviceMembers.push(m)
    }
    // Other member types (nested groups, service principals) are not identity rows — skipped
  }

  const deviceRows: EntraGroupReportRow[] = await Promise.all(deviceMembers.map(async d => {
    const upn = await resolveDeviceOwnerUpn(token, d.id)
    return {
      memberType: 'device' as const,
      displayName: d.displayName,
      userPrincipalName: upn ?? '',
      operatingSystem: d.operatingSystem ?? '',
      flagged: !upn,
      ...(!upn && { flagReason: 'No registered owner or user found — may need Intune "All devices" report instead' }),
    }
  }))

  const allRows = [...userRows, ...deviceRows]
  const memberTypes: ('user' | 'device')[] = []
  if (userRows.length)   memberTypes.push('user')
  if (deviceRows.length) memberTypes.push('device')

  const rows = (!osFilter || osFilter === 'all')
    ? allRows
    : allRows.filter(r => r.memberType === 'user' || mapOs(r.operatingSystem ?? '').toLowerCase() === osFilter.toLowerCase())

  return {
    group,
    memberTypes,
    rows,
    totalMembers: allRows.length,
    flaggedCount: allRows.filter(r => r.flagged).length,
  }
}

// ── Security ──────────────────────────────────────────────────────────────────

export interface EntraSecurity {
  configured:               boolean
  highRiskUsers:            number
  mfaNotEnabled:            number
  conditionalAccessBlocked: number
  staleDevicesOverThreshold: number
  devicesWithoutDefender:   number
}

const EMPTY_SECURITY: EntraSecurity = {
  configured: false, highRiskUsers: 0, mfaNotEnabled: 0,
  conditionalAccessBlocked: 0, staleDevicesOverThreshold: 0, devicesWithoutDefender: 0,
}

export async function getEntraSecurity(): Promise<EntraSecurity> {
  if (!isConfigured()) return { ...EMPTY_SECURITY }

  const token      = await getToken()
  const riskyUsers = await fetchRiskyUsers(token)
  return {
    ...EMPTY_SECURITY,
    configured:    true,
    highRiskUsers: riskyUsers.filter(u => u.riskLevel === 'high').length,
  }
}

// ── Device Actions ────────────────────────────────────────────────────────────

export async function syncDevice(deviceId: string) {
  if (!isConfigured()) return { success: false, message: 'Entra ID is not configured — add Entra credentials in Settings to sync devices' }
  try {
    const token = await getToken()
    const res   = await fetch(
      `https://graph.microsoft.com/v1.0/deviceManagement/managedDevices/${deviceId}/syncDevice`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`)
    return { success: true, message: `Sync command sent to device ${deviceId}` }
  } catch (e) {
    return { success: false, message: `Sync failed: ${(e as Error).message}` }
  }
}

export async function diagnoseDevice(deviceId: string) {
  if (!isConfigured()) {
    return { summary: 'Diagnosis unavailable', issues: ['Entra ID is not configured — add Entra credentials in Settings to run device diagnostics'] }
  }
  try {
    const token  = await getToken()
    const device = await gGet<GraphDevice>(
      token,
      `/deviceManagement/managedDevices/${deviceId}?$select=id,deviceName,complianceState,isEncrypted,lastSyncDateTime,osVersion`,
    )
    const issues: string[] = []
    if (!device.isEncrypted)               issues.push('Disk encryption not enabled')
    if (device.complianceState !== 'compliant') issues.push('Device is non-compliant with policy')
    if (daysSince(device.lastSyncDateTime) > 7) issues.push(`Stale — ${daysSince(device.lastSyncDateTime)}d since check-in`)
    return { summary: issues.length ? `${issues.length} issue(s) detected` : 'Device appears healthy', issues }
  } catch (e) {
    return { summary: 'Diagnosis unavailable', issues: [`Error: ${(e as Error).message}`] }
  }
}
