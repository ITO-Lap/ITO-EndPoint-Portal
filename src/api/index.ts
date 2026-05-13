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
  issueCategories: Array<{ label: string; value: number }>
  mock: boolean
}

export interface DeviceAnalysis {
  summary: string
  rootCause: string
  recommendation: string
  suggestedRunbook: string
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical'
  steps: string[]
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
  appType?: string      // e.g. "App Store", "System", "MDM Managed"
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

export interface LibraryApp {
  id: string
  name: string
  category: string
  active: boolean
  enforcement: string
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

// ── Reporting ─────────────────────────────────────────────────────────────────

export type ReportCategory =
  | 'inventory' | 'compliance' | 'security' | 'software' | 'health' | 'users'
  | 'endpoint' | 'threat' | 'identity' | 'audit'
  | 'slack-access' | 'slack-channel' | 'slack-users' | 'slack-files' | 'slack-compliance'

export interface ReportColumn {
  key:    string
  label:  string
  type:   'string' | 'number' | 'date' | 'badge' | 'percent'
  align?: 'left' | 'right'
  width?: 'sm' | 'md' | 'lg' | 'xl'
}

export interface ReportSummaryCard {
  label: string
  value: string | number
  color: 'green' | 'red' | 'amber' | 'sky' | 'slate' | 'violet'
}

export interface ReportMeta {
  id:           string
  name:         string
  category:     ReportCategory
  description:  string
  sources:      string[]
  apiEndpoint?: string
  graphSource?: string
}

export interface ReportResult {
  reportId:    string
  reportName:  string
  category:    ReportCategory
  description: string
  generatedAt: string
  totalRows:   number
  rows:        Record<string, unknown>[]
  columns:     ReportColumn[]
  summary?:    ReportSummaryCard[]
  cached:      boolean
}

export interface ReportRunParams {
  limit?:   number
  offset?:  number
  sortBy?:  string
  sortDir?: 'asc' | 'desc'
}

export interface IntegrationSyncResult {
  id: string
  deviceCount: number
  latencyMs: number
  error: string | null
}

export interface JiraIssue {
  id:        string
  key:       string
  summary:   string
  status:    string
  priority:  string
  issueType: string
  url:       string
  created:   string
}

export interface JiraIssueInput {
  summary:    string
  description: string
  issueType:  'Incident' | 'Task' | 'Bug' | 'Story'
  priority:   'Critical' | 'High' | 'Medium' | 'Low'
  projectKey?: string
  labels?:    string[]
}

export interface ConfluencePage {
  id:           string
  title:        string
  space:        string
  url:          string
  excerpt:      string
  lastModified: string
}

// ── Remote Scripts ─────────────────────────────────────────────────────────────

export interface ScriptParameter {
  name: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'select'
  required: boolean
  defaultValue?: string
  options?: string[]
  placeholder?: string
}

export interface Script {
  id: string
  name: string
  description: string
  os: 'Windows' | 'macOS' | 'Linux' | 'Cross-platform'
  type: 'PowerShell' | 'Bash' | 'Batch' | 'Python'
  content: string
  version: number
  tags: string[]
  createdBy: string
  createdAt: string
  updatedAt: string
  isDestructive: boolean
  requiresApproval: boolean
  minRole: 'Helpdesk' | 'IT Admin' | 'Global Admin'
  parameters: ScriptParameter[]
  timeoutSeconds: number
  useCount: number
}

export interface ScriptExecution {
  id: string
  scriptId: string
  scriptName: string
  scriptVersion: number
  deviceId: string
  deviceName: string
  platform: string
  managementSource: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled' | 'pending_approval'
  exitCode?: number
  stdout?: string
  stderr?: string
  runtimeMs?: number
  startedAt: string
  completedAt?: string
  executedBy: string
  approvedBy?: string
  parameters?: Record<string, string>
}

export interface ExecuteScriptInput {
  deviceId: string
  deviceName: string
  platform: string
  managementSource: string
  executedBy: string
  parameters?: Record<string, string>
}

export interface CreateScriptInput {
  name: string
  description: string
  os: 'Windows' | 'macOS' | 'Linux' | 'Cross-platform'
  type: 'PowerShell' | 'Bash' | 'Batch' | 'Python'
  content: string
  tags: string[]
  createdBy: string
  isDestructive: boolean
  requiresApproval: boolean
  minRole: 'Helpdesk' | 'IT Admin' | 'Global Admin'
  parameters: ScriptParameter[]
  timeoutSeconds: number
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

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { method: 'DELETE' })
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

  fetchDeviceApps: (id: string) =>
    get<AppStatus[]>(`/api/devices/${id}/apps`),

  fetchKandjiApps: () =>
    get<LibraryApp[]>('/api/integrations/kandji/apps'),

  // AI analysis — pass live device fields directly (no device-ID lookup needed)
  analyzeDeviceFields: (fields: {
    deviceName: string; user: string; platform: string; osVersion: string
    managementSource: string; complianceState: string; encryptionStatus: string
    primaryIssue: string; policyFailed: string; severity: string
  }) => post<DeviceAnalysis>('/api/ai/analyze', fields),

  // Reports
  listReports: () =>
    get<ReportMeta[]>('/api/reports'),
  runReport: (id: string, params: ReportRunParams = {}) =>
    post<ReportResult>(`/api/reports/${encodeURIComponent(id)}/run`, params),
  exportReportCsvUrl: (id: string) =>
    `${BASE_URL}/api/reports/${encodeURIComponent(id)}/export/csv`,

  // Integration management
  fetchIntegrationStatus: () =>
    get<IntegrationStatusItem[]>('/api/integrations/status'),
  pushCredentials: (id: string, fields: Record<string, string>) =>
    post<{ id: string; configured: boolean }>(`/api/integrations/${id}/credentials`, { fields }),
  syncIntegration: (id: string) =>
    post<IntegrationSyncResult>(`/api/integrations/${id}/sync`, {}),

  // Jira
  jiraStatus: () =>
    get<{ jira: boolean; confluence: boolean }>('/api/jira/status'),
  createJiraIssue: (input: JiraIssueInput) =>
    post<JiraIssue>('/api/jira/issues', input),
  searchJiraIssues: (q: string) =>
    get<JiraIssue[]>(`/api/jira/issues/search?q=${encodeURIComponent(q)}`),

  // Confluence
  searchConfluence: (q: string) =>
    get<ConfluencePage[]>(`/api/jira/confluence/search?q=${encodeURIComponent(q)}`),

  // Remote Scripts
  fetchScripts: (params?: { q?: string; os?: string; type?: string }) => {
    const qs = new URLSearchParams()
    if (params?.q) qs.set('q', params.q)
    if (params?.os) qs.set('os', params.os)
    if (params?.type) qs.set('type', params.type)
    const query = qs.toString()
    return get<Script[]>(`/api/scripts${query ? `?${query}` : ''}`)
  },
  fetchScript: (id: string) =>
    get<Script>(`/api/scripts/${encodeURIComponent(id)}`),
  createScript: (input: CreateScriptInput) =>
    post<Script>('/api/scripts', input),
  deleteScript: (id: string) =>
    del<{ id: string }>(`/api/scripts/${encodeURIComponent(id)}`),
  executeScript: (id: string, input: ExecuteScriptInput) =>
    post<ScriptExecution>(`/api/scripts/${encodeURIComponent(id)}/execute`, input),
  fetchExecutions: (params?: { deviceId?: string; scriptId?: string; status?: string; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.deviceId) qs.set('deviceId', params.deviceId)
    if (params?.scriptId) qs.set('scriptId', params.scriptId)
    if (params?.status) qs.set('status', params.status)
    if (params?.limit) qs.set('limit', String(params.limit))
    const query = qs.toString()
    return get<ScriptExecution[]>(`/api/scripts/executions${query ? `?${query}` : ''}`)
  },
  fetchExecution: (id: string) =>
    get<ScriptExecution>(`/api/scripts/executions/${encodeURIComponent(id)}`),
}

/** Map a server Device to the frontend DeviceData shape. */
export function apiDeviceToDeviceData(d: ApiDevice) {
  return {
    id:               d.id,
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
