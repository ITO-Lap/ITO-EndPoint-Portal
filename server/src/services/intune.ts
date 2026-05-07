import type { Device } from '../types.js'

interface TokenCache {
  token: string
  expiresAt: number
}

let tokenCache: TokenCache | null = null

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token
  }

  const tenantId = process.env.INTUNE_TENANT_ID
  const clientId = process.env.INTUNE_CLIENT_ID
  const clientSecret = process.env.INTUNE_CLIENT_SECRET

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Intune credentials not configured')
  }

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  })

  const res = await fetch(url, { method: 'POST', body })
  if (!res.ok) throw new Error(`Intune auth failed: ${res.status} ${res.statusText}`)

  const data = await res.json() as { access_token: string; expires_in: number }
  tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  return tokenCache.token
}

interface GraphDevice {
  id: string
  deviceName: string
  userPrincipalName: string
  serialNumber: string | null
  operatingSystem: string
  osVersion: string
  complianceState: string
  lastSyncDateTime: string
  isEncrypted: boolean
}

function mapGraphDevice(d: GraphDevice): Device {
  const complianceMap: Record<string, Device['complianceState']> = {
    compliant: 'Compliant',
    noncompliant: 'Non-Compliant',
    unknown: 'Warning',
    inGracePeriod: 'Warning',
    error: 'Warning',
  }
  const isEncrypted = d.isEncrypted
  const compliance = complianceMap[d.complianceState] ?? 'Warning'

  return {
    id: d.id,
    deviceName: d.deviceName,
    user: d.userPrincipalName,
    serialNumber: d.serialNumber ?? 'Unknown',
    platform: d.operatingSystem === 'macOS' ? 'macOS' : d.operatingSystem === 'Linux' ? 'Linux' : 'Windows',
    osVersion: d.osVersion,
    managementSource: 'Microsoft Intune',
    lastCheckIn: new Date(d.lastSyncDateTime).toLocaleString(),
    complianceState: compliance,
    encryptionStatus: isEncrypted ? 'BitLocker On' : 'BitLocker Off',
    primaryIssue: isEncrypted ? 'None' : 'BitLocker encryption not enabled',
    policyFailed: isEncrypted ? 'None' : 'Encryption - BitLocker Policy',
    severity: compliance === 'Non-Compliant' ? 'Medium' : 'Low',
    confidence: '85%',
    firstDetected: 'N/A',
    lastDetected: new Date(d.lastSyncDateTime).toLocaleString(),
    issueSource: 'Microsoft Intune',
  }
}

const GRAPH_SELECT =
  'id,deviceName,userPrincipalName,serialNumber,operatingSystem,osVersion,complianceState,lastSyncDateTime,isEncrypted'

export async function getIntuneDevices(): Promise<Device[]> {
  const token = await getAccessToken()
  const url = `https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?$select=${GRAPH_SELECT}&$top=100`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Microsoft Graph error: ${res.status} ${res.statusText}`)
  const data = await res.json() as { value: GraphDevice[] }
  return data.value.map(mapGraphDevice)
}

export function isIntuneConfigured(): boolean {
  return !!(process.env.INTUNE_TENANT_ID && process.env.INTUNE_CLIENT_ID && process.env.INTUNE_CLIENT_SECRET)
}
