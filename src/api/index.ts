const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

// Mirror of server/src/types.ts — kept in sync manually
export interface ApiStats {
  total: number
  compliant: number
  nonCompliant: number
  warning: number
  windows: number
  mac: number
  sources: { intune: number; kandji: number; manageEngine: number }
  mock: boolean
}

export interface ApiDevice {
  id: string
  deviceName: string
  user: string
  serialNumber: string
  platform: 'Windows' | 'macOS' | 'Linux'
  osVersion: string
  managementSource: 'Microsoft Intune' | 'Kandji' | 'ManageEngine'
  lastCheckIn: string
  complianceState: 'Compliant' | 'Warning' | 'Non-Compliant'
  encryptionStatus: string
  primaryIssue: string
  policyFailed: string
  severity: 'Low' | 'Medium' | 'High' | 'Critical'
  confidence: string
  firstDetected: string
  lastDetected: string
  issueSource: string

  // Hardware
  manufacturer?: string
  model?: string
  totalStorage?: string
  freeStorage?: string
  totalMemory?: string
  processor?: string
  architecture?: string

  // Network
  ipAddress?: string
  macAddress?: string
  wifiMacAddress?: string

  // Enrollment & Identity
  enrollmentDate?: string
  enrollmentType?: string
  ownership?: 'Corporate' | 'Personal'
  isAadRegistered?: boolean
  department?: string

  // OS Details
  osBuildNumber?: string

  // Security
  firewallStatus?: string
  antivirusStatus?: string
  secureBoot?: string
  tpmVersion?: string

  // Compliance
  lastComplianceCheck?: string
  appliedPolicies?: string[]

  // Applications
  apps?: AppStatus[]

  // LAPS
  laps?: LapsInfo
}

export interface ApiActivityItem {
  id: string
  deviceName: string
  message: string
  status: 'Compliant' | 'Warning' | 'Non-Compliant'
  timestamp: string
}

export interface ApiNotification {
  id: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  read: boolean
  createdAt: string
}

export interface AppStatus {
  name: string
  version: string
  publisher: string
  status: 'Installed' | 'Failed' | 'Pending' | 'NotApplicable'
  installDate?: string
  size?: string
  errorCode?: string
  errorDescription?: string
  lastAttempt?: string
}

export interface LapsInfo {
  enabled: boolean
  source?: string
  accountName?: string
  passwordLastRotated?: string
  passwordExpiresAt?: string
}

export interface IntegrationStatusItem {
  id: string
  name: string
  configured: boolean
  deviceCount: number | null
  lastSyncAt: string | null
  latencyMs: number | null
  error: string | null
  healthy: boolean | null
}

export interface IntegrationSyncResult {
  id: string
  deviceCount: number
  latencyMs: number
  error: string | null
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`)
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  const body = await res.json()
  if (!body.success) throw new Error(body.error ?? 'API error')
  return body.data as T
}

async function patch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { method: 'PATCH' })
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  const body = await res.json()
  return body.data as T
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  const data = await res.json()
  if (!data.success) throw new Error(data.error ?? 'API error')
  return data.data as T
}

export const api = {
  fetchStats:    () => get<ApiStats>('/api/devices/stats'),
  fetchDevices:  (q?: string) =>
    get<{ devices: ApiDevice[]; total: number; mock: boolean }>(`/api/devices${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(r => r.devices),
  fetchAllDevicesRaw: (params?: {
    q?: string
    source?: 'intune' | 'kandji' | 'manageengine' | 'all'
    compliance?: 'Compliant' | 'Non-Compliant' | 'Warning'
    platform?: 'Windows' | 'macOS' | 'Linux'
    limit?: number
  }) => {
    const qs = new URLSearchParams()
    if (params?.q) qs.set('q', params.q)
    if (params?.source && params.source !== 'all') qs.set('source', params.source)
    if (params?.compliance) qs.set('compliance', params.compliance)
    if (params?.platform) qs.set('platform', params.platform)
    qs.set('limit', String(params?.limit ?? 200))
    return get<{ devices: ApiDevice[]; total: number; mock: boolean }>(`/api/devices?${qs}`)
  },
  fetchActivity: (limit = 20) =>
    get<ApiActivityItem[]>(`/api/activity?limit=${limit}`),
  fetchNotifications: () => get<ApiNotification[]>('/api/notifications'),
  markAllRead: () => patch<ApiNotification[]>('/api/notifications/read-all'),
  markRead: (id: string) => patch<ApiNotification>(`/api/notifications/${id}/read`),

  // Integration management
  fetchIntegrationStatus: () =>
    get<IntegrationStatusItem[]>('/api/integrations/status'),
  pushCredentials: (id: string, fields: Record<string, string>) =>
    post<{ id: string; configured: boolean }>(`/api/integrations/${id}/credentials`, { fields }),
  syncIntegration: (id: string) =>
    post<IntegrationSyncResult>(`/api/integrations/${id}/sync`, {}),
}

/** Map a server Device to the frontend DeviceData shape. */
export function apiDeviceToDeviceData(d: ApiDevice) {
  return {
    deviceName:       d.deviceName,
    user:             d.user,
    serialNumber:     d.serialNumber,
    platform:         d.platform,
    osVersion:        d.osVersion,
    managementSource: d.managementSource,
    lastCheckIn:      d.lastCheckIn,
    complianceState:  d.complianceState,
    encryptionStatus: d.encryptionStatus,
    primaryIssue:     d.primaryIssue,
    policyFailed:     d.policyFailed,
    // Server may return 'Critical'; frontend union only has Low/Medium/High
    severity: (d.severity === 'Critical' ? 'High' : d.severity) as 'Low' | 'Medium' | 'High',
    confidence:           d.confidence,
    firstDetected:        d.firstDetected,
    lastDetected:         d.lastDetected,
    issueSource:          d.issueSource,
    recommendedRunbook:   '',
    nextSteps:            [] as string[],
    issueCategory:        '',
    hasOpenIssue:         d.complianceState !== 'Compliant',
  }
}
