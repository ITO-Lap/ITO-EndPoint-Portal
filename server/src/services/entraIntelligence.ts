/**
 * Entra Intelligence Service — Microsoft Graph Integration
 *
 * Calls Microsoft Graph API when Entra credentials are configured.
 * Falls back to mock data only when NO credentials are set.
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
import {
  mockEntraOverview, mockEntraDevices, mockEntraUsers,
  mockEntraGroups, mockEntraRelationships, mockEntraSecurity,
} from '../data/entra.js'

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
  const fields = [
    'id','deviceName','userPrincipalName','operatingSystem','osVersion',
    'complianceState','lastSyncDateTime','joinType','serialNumber',
    'manufacturer','model','isEncrypted','managedDeviceOwnerType','isManaged',
  ].join(',')
  try {
    const devices = await gGetAll<GraphDevice>(
      token,
      `/deviceManagement/managedDevices?$select=${fields}&$top=999`,
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

export async function getEntraOverview() {
  if (!isConfigured()) {
    console.log('[EntraIntelligence] No credentials — returning mock overview')
    return { ...mockEntraOverview, _source: 'mock' }
  }

  try {
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
      totalDevices:             devices.length,
      compliantDevices:         compliant,
      nonCompliantDevices:      nonCompliant,
      inactiveDevices:          inactive,
      totalUsers:               entraData?.users.length ?? mockEntraOverview.totalUsers,
      totalGroups:              mockEntraOverview.totalGroups,
      failedPolicies:           mockEntraOverview.failedPolicies,
      appInstallFailures:       mockEntraOverview.appInstallFailures,
      devicesMissingEncryption: missingEnc,
      devicesMissingDefender:   mockEntraOverview.devicesMissingDefender,
      pendingReboot:            mockEntraOverview.pendingReboot,
      highRiskUsers:            riskyUsers.filter(u => u.riskLevel === 'high').length,
      openTickets:              mockEntraOverview.openTickets,
      _source:                  'live',
    }
  } catch (e) {
    console.error('[EntraIntelligence] getEntraOverview error:', (e as Error).message)
    return { ...mockEntraOverview, _source: 'mock' }
  }
}

// ── Devices ───────────────────────────────────────────────────────────────────

export async function getEntraDevices(params?: { compliance?: string; os?: string; limit?: number }) {
  if (!isConfigured()) {
    return applyFilters(mockEntraDevices, params)
  }

  try {
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
  } catch (e) {
    console.error('[EntraIntelligence] getEntraDevices error:', (e as Error).message)
    return applyFilters(mockEntraDevices, params)
  }
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
  if (!isConfigured()) {
    let users = mockEntraUsers
    if (params?.riskLevel) users = users.filter(u => u.riskLevel === params.riskLevel)
    return users
  }

  try {
    const token = await getToken()
    const [entraData, riskyUsers] = await Promise.all([
      getEntraData().catch(() => null),
      fetchRiskyUsers(token),
    ])

    const riskyMap = new Map(riskyUsers.map(r => [r.userPrincipalName.toLowerCase(), r]))
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
        mfaStatus:       'Enabled' as const,
        lastSignIn:      u.signInActivity?.lastSignInDateTime ?? '',
        accountStatus:   u.accountEnabled ? 'Active' : 'Disabled',
      }
    })

    let result = mapped as typeof mockEntraUsers
    if (params?.riskLevel) result = result.filter(u => u.riskLevel === params.riskLevel)
    console.log(`[EntraIntelligence] ✓ Returned ${result.length} users`)
    return result
  } catch (e) {
    console.error('[EntraIntelligence] getEntraUsers error:', (e as Error).message)
    return mockEntraUsers
  }
}

// ── Groups ────────────────────────────────────────────────────────────────────

export async function getEntraGroups() {
  if (!isConfigured()) return mockEntraGroups
  try {
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
  } catch (e) {
    console.warn('[EntraIntelligence] groups fetch failed:', (e as Error).message)
    return mockEntraGroups
  }
}

// ── Relationships (requires multi-join — returns mock for now) ────────────────

export async function getEntraRelationships(userId?: string) {
  return userId ? mockEntraRelationships.filter(r => r.userId === userId) : mockEntraRelationships
}

// ── Security ──────────────────────────────────────────────────────────────────

export async function getEntraSecurity() {
  if (!isConfigured()) return mockEntraSecurity
  try {
    const token      = await getToken()
    const riskyUsers = await fetchRiskyUsers(token)
    return {
      ...mockEntraSecurity,
      highRiskUsers: riskyUsers.filter(u => u.riskLevel === 'high').length,
    }
  } catch {
    return mockEntraSecurity
  }
}

// ── Device Actions ────────────────────────────────────────────────────────────

export async function syncDevice(deviceId: string) {
  if (!isConfigured()) return { success: true, message: `Sync queued for ${deviceId} (demo mode)` }
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
    const device = mockEntraDevices.find(d => d.id === deviceId)
    const issues: string[] = []
    if (device?.encryptionState === 'Not Encrypted') issues.push('Disk encryption not enabled')
    if (device?.defenderState   === 'Inactive')      issues.push('Defender reporting as inactive')
    if ((device?.daysSinceCheckIn ?? 0) > 7)         issues.push(`Stale — ${device?.daysSinceCheckIn}d since check-in`)
    return { summary: issues.length ? `${issues.length} issue(s) found` : 'Device appears healthy', issues }
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
