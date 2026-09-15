import type { Device, AppStatus } from '../types.js'
import type { RuntimeIntuneConfig } from '../store/integrationStore.js'
import { getIntuneConfig } from '../store/integrationStore.js'

interface TokenCache {
  token: string
  expiresAt: number
  tenantId: string
}

let tokenCache: TokenCache | null = null

async function getAccessToken(cfg: RuntimeIntuneConfig): Promise<string> {
  if (
    tokenCache &&
    tokenCache.tenantId === cfg.tenantId &&
    Date.now() < tokenCache.expiresAt - 60_000
  ) {
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
  if (!res.ok) throw new Error(`Intune auth failed: ${res.status} ${res.statusText}`)

  const data = await res.json() as { access_token: string; expires_in: number }
  tokenCache = {
    token:     data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    tenantId:  cfg.tenantId,
  }
  return tokenCache.token
}

interface GraphDevice {
  id: string
  deviceName: string
  userPrincipalName: string
  serialNumber: string | null
  operatingSystem: string
  osVersion: string
  osBuildNumber: string | null
  complianceState: string
  lastSyncDateTime: string
  enrolledDateTime: string | null
  isEncrypted: boolean
  manufacturer: string | null
  model: string | null
  totalStorageSpaceInBytes: number | null
  freeStorageSpaceInBytes: number | null
  physicalMemoryInBytes: number | null
  processorArchitecture: string | null
  wiFiMacAddress: string | null
  ethernetMacAddress: string | null
  ipAddressV4: string | null
  joinType: string | null
  azureADRegistered: boolean | null
  managedDeviceOwnerType: string | null
  userDisplayName: string | null
  notes: string | null
  azureADDeviceId: string | null
  deviceCategoryDisplayName: string | null
}

function fmtBytes(bytes: number | null | undefined, suffix: string): string | undefined {
  if (!bytes) return undefined
  const gb = bytes / 1_073_741_824
  return gb >= 1 ? `${gb.toFixed(0)} GB` : `${(bytes / 1_048_576).toFixed(0)} MB`
}

function mapJoinType(joinType: string | null): string {
  if (!joinType) return 'Azure AD Joined'
  if (joinType === 'hybridAzureADJoined') return 'Hybrid Azure AD Joined'
  if (joinType === 'azureADRegistered')   return 'Azure AD Registered'
  return 'Azure AD Joined'
}

function mapArch(arch: string | null): string | undefined {
  if (!arch) return undefined
  if (arch === 'x64' || arch === 'amd64') return 'x64'
  if (arch === 'arm64' || arch === 'arm') return 'ARM64'
  if (arch === 'x86')                     return 'x86'
  return arch
}

function mapGraphDevice(d: GraphDevice): Device {
  const complianceMap: Record<string, Device['complianceState']> = {
    compliant:     'Compliant',
    noncompliant:  'Non-Compliant',
    unknown:       'Warning',
    inGracePeriod: 'Warning',
    error:         'Warning',
  }
  const compliance = complianceMap[d.complianceState] ?? 'Warning'
  const platform: Device['platform'] =
    d.operatingSystem === 'macOS'   ? 'macOS'   :
    d.operatingSystem === 'Linux'   ? 'Linux'   :
    d.operatingSystem === 'Android' ? 'Android' :
    d.operatingSystem === 'iOS'     ? 'iOS'     : 'Windows'

  const totalStorage = fmtBytes(d.totalStorageSpaceInBytes, 'GB')
  const freeStorage  = fmtBytes(d.freeStorageSpaceInBytes,  'GB')
  const totalMemory  = fmtBytes(d.physicalMemoryInBytes,    'GB')
  const architecture = mapArch(d.processorArchitecture)

  return {
    id:               d.id,
    deviceName:       d.deviceName,
    user:             d.userPrincipalName,
    serialNumber:     d.serialNumber ?? 'Unknown',
    platform,
    osVersion:        d.osVersion,
    managementSource: 'Microsoft Intune',
    lastCheckIn:      new Date(d.lastSyncDateTime).toLocaleString(),
    complianceState:  compliance,
    encryptionStatus: d.isEncrypted
      ? (platform === 'macOS' ? 'FileVault On' : 'BitLocker On')
      : (platform === 'macOS' ? 'FileVault Off' : 'BitLocker Off'),
    primaryIssue:  d.isEncrypted && compliance === 'Compliant' ? 'None' : (d.isEncrypted ? '' : (platform === 'macOS' ? 'FileVault encryption not enabled' : 'BitLocker encryption not enabled')),
    policyFailed:  d.isEncrypted ? 'None' : (platform === 'macOS' ? 'Security – FileVault Policy' : 'Encryption – BitLocker Policy'),
    severity:      compliance === 'Non-Compliant' ? 'High' : compliance === 'Warning' ? 'Medium' : 'Low',
    confidence:    '85%',
    firstDetected: 'N/A',
    lastDetected:  new Date(d.lastSyncDateTime).toLocaleString(),
    issueSource:   'Microsoft Intune',

    // Hardware
    ...(d.manufacturer  ? { manufacturer: d.manufacturer } : {}),
    ...(d.model         ? { model:        d.model }        : {}),
    ...(totalStorage    ? { totalStorage }                 : {}),
    ...(freeStorage     ? { freeStorage }                  : {}),
    ...(totalMemory     ? { totalMemory }                  : {}),
    ...(architecture    ? { architecture }                 : {}),

    // Network
    ...(d.ipAddressV4      ? { ipAddress:      d.ipAddressV4 }      : {}),
    ...(d.ethernetMacAddress ? { macAddress:   d.ethernetMacAddress } : {}),
    ...(d.wiFiMacAddress   ? { wifiMacAddress: d.wiFiMacAddress }   : {}),

    // Enrollment & Identity
    ...(d.enrolledDateTime ? { enrollmentDate: new Date(d.enrolledDateTime).toLocaleDateString() } : {}),
    enrollmentType:  mapJoinType(d.joinType),
    ownership:       d.managedDeviceOwnerType === 'personal' ? 'Personal' : 'Corporate',
    isAadRegistered: d.azureADRegistered ?? true,
    ...(d.azureADDeviceId          ? { azureAdDeviceId: d.azureADDeviceId }          : {}),
    ...(d.deviceCategoryDisplayName ? { deviceCategory: d.deviceCategoryDisplayName } : {}),

    // OS
    ...(d.osBuildNumber ? { osBuildNumber: d.osBuildNumber } : {}),

    // Compliance
    lastComplianceCheck: new Date(d.lastSyncDateTime).toLocaleString(),
    appliedPolicies: [],
  }
}

// No $select — let Graph return all available fields for this tenant;
// avoids 400 errors when optional properties aren't supported by a tenant's license tier.
const GRAPH_SELECT = ''

// Follows @odata.nextLink to page through all managed devices
async function graphGetAll(token: string, initialUrl: string): Promise<GraphDevice[]> {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const results: GraphDevice[] = []
  let url: string | null = initialUrl
  while (url) {
    const res = await fetch(url, { headers })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      const hint =
        res.status === 401 ? ' — check client ID / secret are correct and not expired' :
        res.status === 403 ? ' — ensure the app registration has DeviceManagementManagedDevices.Read.All (Application) permission in Azure' :
        res.status === 400 ? ' — one or more $select fields may be unsupported by this tenant' : ''
      throw new Error(`Microsoft Graph ${res.status}${hint}: ${body.slice(0, 400)}`)
    }
    const data = await res.json() as { value?: GraphDevice[]; '@odata.nextLink'?: string }
    results.push(...(data.value ?? []))
    url = data['@odata.nextLink'] ?? null
  }
  return results
}

export async function getIntuneDevices(cfg?: RuntimeIntuneConfig): Promise<Device[]> {
  const config = cfg ?? getIntuneConfig()
  if (!config) throw new Error('Intune credentials not configured')

  const token = await getAccessToken(config)
  const selectParam = GRAPH_SELECT ? `&$select=${GRAPH_SELECT}` : ''
  const initialUrl = `https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?$top=999${selectParam}`
  const raw = await graphGetAll(token, initialUrl)
  console.log(`[Intune] ✓ Fetched ${raw.length} managed device(s)`)
  return raw.map(mapGraphDevice)
}

// Lightweight health-check: token + one Graph call, returns diagnostic info (never throws)
export async function diagnoseIntune(): Promise<{
  configured: boolean
  tokenOk: boolean
  tokenError: string | null
  graphStatus: number | null
  graphOk: boolean
  graphError: string | null
  deviceCount: number
}> {
  const config = getIntuneConfig()
  if (!config) return { configured: false, tokenOk: false, tokenError: 'Not configured', graphStatus: null, graphOk: false, graphError: null, deviceCount: 0 }

  let token: string | null = null
  let tokenError: string | null = null
  try {
    token = await getAccessToken(config)
  } catch (e) {
    tokenError = (e as Error).message
    return { configured: true, tokenOk: false, tokenError, graphStatus: null, graphOk: false, graphError: null, deviceCount: 0 }
  }

  try {
    const res = await fetch(
      'https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?$top=1&$select=id,deviceName,complianceState',
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const body = await res.text().catch(() => '')
    let count = 0
    let graphError: string | null = null
    if (res.ok) {
      try { count = (JSON.parse(body) as { value?: unknown[] }).value?.length ?? 0 } catch { /* ignore */ }
    } else {
      graphError = body.slice(0, 400)
    }
    return { configured: true, tokenOk: true, tokenError: null, graphStatus: res.status, graphOk: res.ok, graphError, deviceCount: count }
  } catch (e) {
    return { configured: true, tokenOk: true, tokenError: null, graphStatus: null, graphOk: false, graphError: (e as Error).message, deviceCount: 0 }
  }
}

export function isIntuneConfigured(): boolean {
  return !!getIntuneConfig()
}

// ── Per-device detail (lazy-fetched, only when a device is opened) ────────────

interface GraphDetectedApp {
  displayName: string
  version: string | null
  publisher: string | null
}

// Live device-inventory scan results (registry/Add-Remove-Programs equivalent) —
// beta-only endpoint; v1.0 doesn't expose this navigation property for this tenant.
export async function getIntuneDeviceApps(deviceId: string, cfg?: RuntimeIntuneConfig): Promise<AppStatus[]> {
  const config = cfg ?? getIntuneConfig()
  if (!config) throw new Error('Intune credentials not configured')
  const token = await getAccessToken(config)

  const res = await fetch(
    `https://graph.microsoft.com/beta/deviceManagement/managedDevices/${deviceId}/detectedApps`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) {
    if (res.status === 404) return []
    const body = await res.text().catch(() => '')
    throw new Error(`Microsoft Graph ${res.status} on detectedApps: ${body.slice(0, 300)}`)
  }
  const data = await res.json() as { value: GraphDetectedApp[] }
  return data.value.map(a => ({
    name:      a.displayName,
    version:   a.version ?? '—',
    publisher: a.publisher ?? '',
    status:    'Installed' as const,
    appType:   'Detected on device',
  }))
}

interface GraphPolicyState {
  id: string
  displayName: string
  state: string
}

function formatPolicyState(state: string): string {
  if (state === 'compliant' || state === 'remediated') return 'Compliant'
  if (state === 'nonCompliant') return 'Non-Compliant'
  if (state === 'error') return 'Error'
  if (state === 'conflict') return 'Conflict'
  if (state === 'notApplicable') return 'Not Applicable'
  if (state === 'unknown') return 'Unknown'
  return state
}

// Real per-policy compliance + configuration-profile evaluation state for one device.
// Encodes state as a "— Compliant"/"— Non-Compliant" suffix on each name so the
// existing appliedPolicies: string[] shape (shared with ManageEngine's plain
// profile names) doesn't need a breaking type change — DeviceDetailPanel parses the suffix.
export async function getIntuneDevicePolicies(deviceId: string, cfg?: RuntimeIntuneConfig): Promise<string[]> {
  const config = cfg ?? getIntuneConfig()
  if (!config) throw new Error('Intune credentials not configured')
  const token = await getAccessToken(config)
  const headers = { Authorization: `Bearer ${token}` }

  const [complianceRes, configRes] = await Promise.allSettled([
    fetch(`https://graph.microsoft.com/v1.0/deviceManagement/managedDevices/${deviceId}/deviceCompliancePolicyStates`, { headers }),
    fetch(`https://graph.microsoft.com/v1.0/deviceManagement/managedDevices/${deviceId}/deviceConfigurationStates`, { headers }),
  ])

  const policies: string[] = []
  const seenIds = new Set<string>()

  for (const settled of [complianceRes, configRes]) {
    if (settled.status !== 'fulfilled' || !settled.value.ok) continue
    const data = await settled.value.json() as { value: GraphPolicyState[] }
    for (const p of data.value) {
      if (seenIds.has(p.id)) continue   // Graph returns duplicate entries for this tenant
      seenIds.add(p.id)
      policies.push(`${p.displayName} — ${formatPolicyState(p.state)}`)
    }
  }
  return policies
}

// ── User summaries derived from managed devices ────────────────────────────────

export interface IntuneUserSummary {
  upn: string
  displayName: string
  lastSyncDateTime: string
  complianceState: 'Compliant' | 'Warning' | 'Non-Compliant'
  devices: Array<{
    deviceName: string
    platform: string
    complianceState: 'Compliant' | 'Warning' | 'Non-Compliant'
    lastCheckIn: string
    encryptionStatus: string
    managementSource: 'Microsoft Intune'
  }>
}

const COMPLIANCE_MAP: Record<string, 'Compliant' | 'Warning' | 'Non-Compliant'> = {
  compliant:     'Compliant',
  noncompliant:  'Non-Compliant',
  unknown:       'Warning',
  inGracePeriod: 'Warning',
  error:         'Warning',
}

export async function getIntuneUserSummaries(cfg?: RuntimeIntuneConfig): Promise<IntuneUserSummary[]> {
  const config = cfg ?? getIntuneConfig()
  if (!config) throw new Error('Intune credentials not configured')

  const token = await getAccessToken(config)

  // Page through all devices
  const allDevices: GraphDevice[] = []
  const selectParam = GRAPH_SELECT ? `&$select=${GRAPH_SELECT}` : ''
  let nextUrl: string | null =
    `https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?$top=999${selectParam}`
  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`Microsoft Graph error: ${res.status} ${res.statusText}`)
    const data = await res.json() as { value: GraphDevice[]; '@odata.nextLink'?: string }
    allDevices.push(...data.value)
    nextUrl = data['@odata.nextLink'] ?? null
  }

  // Group by userPrincipalName
  const byUpn = new Map<string, { displayName: string; devices: GraphDevice[]; latestSync: Date }>()
  for (const d of allDevices) {
    const upn = (d.userPrincipalName ?? '').toLowerCase()
    if (!upn) continue
    const entry = byUpn.get(upn)
    const syncDate = new Date(d.lastSyncDateTime)
    if (!entry) {
      byUpn.set(upn, { displayName: d.userDisplayName ?? d.userPrincipalName, devices: [d], latestSync: syncDate })
    } else {
      entry.devices.push(d)
      if (syncDate > entry.latestSync) entry.latestSync = syncDate
    }
  }

  return Array.from(byUpn.entries()).map(([upn, { displayName, devices, latestSync }]) => {
    const mappedDevices = devices.map(d => {
      const platform = d.operatingSystem === 'macOS' ? 'macOS' : d.operatingSystem === 'Linux' ? 'Linux' : 'Windows'
      return {
        deviceName:       d.deviceName,
        platform,
        complianceState:  COMPLIANCE_MAP[d.complianceState] ?? 'Warning' as 'Compliant' | 'Warning' | 'Non-Compliant',
        lastCheckIn:      new Date(d.lastSyncDateTime).toLocaleString(),
        encryptionStatus: d.isEncrypted
          ? (platform === 'macOS' ? 'FileVault On' : 'BitLocker On')
          : (platform === 'macOS' ? 'FileVault Off' : 'BitLocker Off'),
        managementSource: 'Microsoft Intune' as const,
      }
    })

    const overall: 'Compliant' | 'Warning' | 'Non-Compliant' =
      mappedDevices.some(d => d.complianceState === 'Non-Compliant') ? 'Non-Compliant' :
      mappedDevices.some(d => d.complianceState === 'Warning')       ? 'Warning'       : 'Compliant'

    return { upn, displayName, lastSyncDateTime: latestSync.toISOString(), complianceState: overall, devices: mappedDevices }
  })
}
