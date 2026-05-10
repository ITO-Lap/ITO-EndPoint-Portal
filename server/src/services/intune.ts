import type { Device } from '../types.js'
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
    d.operatingSystem === 'macOS' ? 'macOS' :
    d.operatingSystem === 'Linux' ? 'Linux' : 'Windows'

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

    // OS
    ...(d.osBuildNumber ? { osBuildNumber: d.osBuildNumber } : {}),

    // Compliance
    lastComplianceCheck: new Date(d.lastSyncDateTime).toLocaleString(),
    appliedPolicies: [],
  }
}

const GRAPH_SELECT = [
  'id', 'deviceName', 'userPrincipalName', 'serialNumber',
  'operatingSystem', 'osVersion', 'osBuildNumber',
  'complianceState', 'lastSyncDateTime', 'enrolledDateTime',
  'isEncrypted', 'manufacturer', 'model',
  'totalStorageSpaceInBytes', 'freeStorageSpaceInBytes', 'physicalMemoryInBytes',
  'processorArchitecture', 'wiFiMacAddress', 'ethernetMacAddress', 'ipAddressV4',
  'joinType', 'azureADRegistered', 'managedDeviceOwnerType', 'userDisplayName', 'notes',
].join(',')

export async function getIntuneDevices(cfg?: RuntimeIntuneConfig): Promise<Device[]> {
  const config = cfg ?? getIntuneConfig()
  if (!config) throw new Error('Intune credentials not configured')

  const token = await getAccessToken(config)
  const url = `https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?$select=${GRAPH_SELECT}&$top=100`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Microsoft Graph error: ${res.status} ${res.statusText}`)

  const data = await res.json() as { value: GraphDevice[] }
  return data.value.map(mapGraphDevice)
}

export function isIntuneConfigured(): boolean {
  return !!getIntuneConfig()
}
