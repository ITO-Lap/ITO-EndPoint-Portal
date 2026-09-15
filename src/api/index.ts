const BASE_URL = import.meta.env.VITE_API_URL ?? ''

export interface AuthUser { role: string; displayName: string; email: string }

/** Ask backend for the Microsoft OAuth login URL, then redirect the browser to it. */
export async function startEntraLogin(): Promise<void> {
  const res  = await fetch(`${BASE_URL}/api/auth/login`)
  const body = await res.json() as { success: boolean; data?: { url: string }; error?: string }
  if (!res.ok || !body.success || !body.data?.url) throw new Error(body.error ?? 'Failed to start login')
  window.location.href = body.data.url
}

/** Verify a JWT session token issued by the backend after OAuth callback. */
export async function verifySessionToken(token: string): Promise<AuthUser> {
  const res  = await fetch(`${BASE_URL}/api/auth/verify`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ token }),
  })
  const body = await res.json() as { success: boolean; data?: AuthUser; error?: string }
  if (!res.ok || !body.success || !body.data) throw new Error(body.error ?? `Auth failed (${res.status})`)
  return body.data
}

// Mirror of server/src/types.ts — kept in sync manually
export interface ApiStats {
  total: number
  compliant: number
  nonCompliant: number
  warning: number
  windows: number
  mac: number
  sources: { intune: number; manageEngine: number }
  issueCategories: Array<{ label: string; value: number }>
  mock: boolean
}

export interface EntraGroupSuggestion { id: string; displayName: string }

// Mirror of server/src/services/entraIntelligence.ts EntraGroupReportRow/Result
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

// Kept for type-compat with RunbookCard — no longer populated at runtime
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
  managementSource: 'Microsoft Intune' | 'ManageEngine'
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
  azureAdDeviceId?: string
  deviceCategory?: string

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

export interface ManageEngineAppLogEntry {
  deviceId: string
  deviceName: string
  version: string
  status: 'Installed' | 'Update Available' | 'Unknown'
  lastSeen: string
  errorDetails: string | null
}

export interface ManageEngineAppEntry {
  appId: string
  name: string
  platform: 'Windows' | 'macOS'
  installedVersions: string[]
  latestVersion: string
  deviceCount: number
  updateStatus: 'Up to date' | 'Update Available' | 'Unknown'
  logs: ManageEngineAppLogEntry[]
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

// Mirror of server/src/security-agents/types.ts — kept in sync manually.
// Endpoint Protection Coverage: physical Windows/macOS Falcon + Zscaler
// coverage for the Security Posture page card (no full device inventory —
// that page was removed in favor of this compact executive summary).
export type CoverageHealth = 'Healthy' | 'Warning' | 'Critical'

export interface PlatformCoverage {
  platform: 'Windows' | 'macOS'
  totalDevices: number
  falconInstalled: number
  zscalerInstalled: number
  falconMissing: number
  zscalerMissing: number
  falconCoveragePct: number
  zscalerCoveragePct: number
  health: CoverageHealth
}

export interface EndpointProtectionCoverageResult {
  windows: PlatformCoverage
  macos: PlatformCoverage
  scanTime: string
  scanDurationMs: number
}

export interface MissingAgentDevice {
  deviceId: string
  deviceName: string
  primaryUser: string
  connector: 'Microsoft Intune' | 'ManageEngine'
  lastSync: string
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

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PUT',
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

// ── Automation Engine ─────────────────────────────────────────────────────────

export type AutomationCategory = 'compliance' | 'security' | 'patching' | 'reporting' | 'drift'

export type AutomationTriggerType =
  | 'device_non_compliant' | 'compliance_threshold' | 'device_offline'
  | 'new_enrollment' | 'scheduled' | 'risky_signin' | 'drift_detected'
  | 'encryption_off' | 'script_failure'
  | 'enrollment_failed' | 'sync_failure' | 'app_deploy_failed' | 'cert_expiring' | 'stale_device'

export type AutomationActionType =
  | 'slack_notify' | 'create_jira' | 'execute_runbook'
  | 'execute_script' | 'generate_report' | 'send_notification' | 'teams_notify'

export interface AutomationRule {
  id: string
  name: string
  description: string
  category: AutomationCategory
  enabled: boolean
  trigger: {
    type: AutomationTriggerType
    config: Record<string, string | number | boolean>
  }
  conditions: {
    platform: 'Windows' | 'macOS' | 'Linux' | 'all'
    source: 'intune' | 'manageengine' | 'all'
    severity: 'Low' | 'Medium' | 'High' | 'Critical' | 'all'
    complianceState: 'Non-Compliant' | 'Warning' | 'all'
  }
  actions: Array<{
    type: AutomationActionType
    label: string
    config: Record<string, string>
  }>
  lastTriggered?: string
  triggerCount: number
  createdAt: string
  createdBy: string
}

export interface AutomationExecution {
  id: string
  ruleId: string
  ruleName: string
  category: AutomationCategory
  triggeredAt: string
  deviceId?: string
  deviceName?: string
  triggerReason: string
  status: 'success' | 'failed' | 'partial'
  actionsExecuted: Array<{
    type: AutomationActionType
    label: string
    status: 'success' | 'failed'
    result: string
    detail?: {
      runbookSteps?:   string[]
      script?:         string
      jiraKey?:        string
      jiraUrl?:        string
      slackTs?:        string
      slackChannel?:   string
      reportMarkdown?: string
      reportSummary?:  string
    }
  }>
  durationMs: number
  matchedDeviceCount?: number
}

export interface AutomationScanResult {
  rulesEvaluated: number
  rulesFired:     number
  totalMatches:   number
  executions:     AutomationExecution[]
}

export interface AiBuiltRule {
  name:        string
  description: string
  category:    AutomationCategory
  enabled:     boolean
  trigger:     AutomationRule['trigger']
  conditions:  AutomationRule['conditions']
  actions:     AutomationRule['actions']
  createdBy:   string
  _meta?: {
    aiGenerated: boolean
    reasoning:   string
    usedOpenAI:  boolean
  }
}

export interface AutomationStats {
  total: number
  active: number
  inactive: number
  triggersToday: number
  successRate: number
}

export interface CreateAutomationRuleInput {
  name: string
  description: string
  category: AutomationCategory
  enabled: boolean
  trigger: AutomationRule['trigger']
  conditions: AutomationRule['conditions']
  actions: AutomationRule['actions']
  createdBy: string
}

export type { UserSignIn, UserDetails, UserDeviceDetail, UserHealthScore, UserIntelligenceTab } from '../types'
import type { UserDetails } from '../types'

export const api = {
  fetchStats:    () => get<ApiStats>('/api/devices/stats'),
  fetchDevices:  (q?: string) =>
    get<{ devices: ApiDevice[]; total: number; mock: boolean }>(`/api/devices${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(r => r.devices),
  fetchAllDevicesRaw: (params?: {
    q?: string
    source?: 'intune' | 'manageengine' | 'all'
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
  fetchNotifications: () => get<ApiNotification[]>('/api/notifications'),
  markAllRead: () => patch<ApiNotification[]>('/api/notifications/read-all'),
  markRead: (id: string) => patch<ApiNotification>(`/api/notifications/${id}/read`),

  fetchDeviceById: (id: string) =>
    get<ApiDevice>(`/api/devices/${encodeURIComponent(id)}`),

  fetchDeviceApps: (id: string) =>
    get<AppStatus[]>(`/api/devices/${id}/apps`),

  fetchDevicePolicies: (id: string) =>
    get<string[]>(`/api/devices/${id}/policies`),

  fetchManageEngineAppsInventory: () =>
    get<{ windows: ManageEngineAppEntry[]; macos: ManageEngineAppEntry[] }>('/api/integrations/manageengine/apps'),

  fetchEndpointProtectionCoverage: () =>
    get<EndpointProtectionCoverageResult>('/api/security-inventory/coverage'),
  refreshEndpointProtectionCoverage: () =>
    post<EndpointProtectionCoverageResult>('/api/security-inventory/scan', {}),
  fetchDevicesMissingAgent: (platform: 'Windows' | 'macOS', agent: 'zscaler' | 'crowdstrike') =>
    get<MissingAgentDevice[]>(`/api/security-inventory/missing?platform=${platform}&agent=${agent}`),

  // Reports
  listReports: () =>
    get<ReportMeta[]>('/api/reports'),
  runReport: (id: string, params: ReportRunParams = {}) =>
    post<ReportResult>(`/api/reports/${encodeURIComponent(id)}/run`, params),
  exportReportCsvUrl: (id: string) =>
    `${BASE_URL}/api/reports/${encodeURIComponent(id)}/export/csv`,
  invalidateReport: (id: string) =>
    post<{ invalidated: string }>(`/api/reports/${encodeURIComponent(id)}/invalidate`, {}),

  // Integration management
  fetchIntegrationStatus: () =>
    get<IntegrationStatusItem[]>('/api/integrations/status'),
  pushCredentials: (id: string, fields: Record<string, string>) =>
    post<{ id: string; configured: boolean }>(`/api/integrations/${id}/credentials`, { fields }),
  syncIntegration: (id: string) =>
    post<IntegrationSyncResult>(`/api/integrations/${id}/sync`, {}),

  // Users (Microsoft Entra ID)
  fetchUsers: () =>
    get<import('../types').AppUser[]>('/api/users'),
  fetchUserDetails: (id: string, email?: string) =>
    get<UserDetails>(`/api/users/${encodeURIComponent(id)}${email ? `?email=${encodeURIComponent(email)}` : ''}`),

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

  // Slack
  slackStatus: () =>
    get<{ configured: boolean; connected?: boolean | null; workspace?: { teamName: string } | null; error?: string | null; lastCheckedAt?: number | null; consecutiveFails?: number }>('/api/slack/status'),
  slackHealth: () =>
    get<{ configured: boolean; healthy: boolean | null; lastCheckedAt: number | null; lastSuccessAt: number | null; consecutiveFails: number; error: string | null; workspace: string | null; autoRetryCount: number; nextCheckInMs: number | null }>('/api/slack/health'),
  testSlackConnection: () =>
    post<{ workspace: { teamId: string; teamName: string; url: string } }>('/api/slack/test', {}),
  reconnectSlack: () =>
    post<{ reconnected: boolean; workspace: string | null; consecutiveFails: number; error: string | null }>('/api/slack/reconnect', {}),
  fetchSlackAuditLogs: (limit?: number) =>
    get<{ entries: Record<string, unknown>[]; configured: boolean }>(`/api/slack/audit-logs${limit ? `?limit=${limit}` : ''}`),

  // Automation Engine
  fetchAutomationStats: () =>
    get<AutomationStats>('/api/automations/stats'),
  fetchAutomationRules: (category?: string) => {
    const qs = category && category !== 'all' ? `?category=${encodeURIComponent(category)}` : ''
    return get<AutomationRule[]>(`/api/automations${qs}`)
  },
  fetchAutomationRule: (id: string) =>
    get<AutomationRule>(`/api/automations/${encodeURIComponent(id)}`),
  createAutomationRule: (input: CreateAutomationRuleInput) =>
    post<AutomationRule>('/api/automations', input),
  updateAutomationRule: (id: string, input: Partial<CreateAutomationRuleInput>) =>
    put<AutomationRule>(`/api/automations/${encodeURIComponent(id)}`, input),
  toggleAutomationRule: (id: string) =>
    patch<AutomationRule>(`/api/automations/${encodeURIComponent(id)}/toggle`),
  deleteAutomationRule: (id: string) =>
    del<{ id: string }>(`/api/automations/${encodeURIComponent(id)}`),
  testAutomationRule: (id: string) =>
    post<AutomationExecution>(`/api/automations/${encodeURIComponent(id)}/test`, {}),
  fetchAutomationExecutions: (params?: { ruleId?: string; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.ruleId) qs.set('ruleId', params.ruleId)
    if (params?.limit) qs.set('limit', String(params.limit))
    const query = qs.toString()
    return get<AutomationExecution[]>(`/api/automations/executions${query ? `?${query}` : ''}`)
  },
  scanAutomations: () =>
    post<AutomationScanResult>('/api/automations/scan', {}),
  aiBuildAutomationRule: (prompt: string) =>
    post<AiBuiltRule>('/api/automations/ai-build', { prompt }),

  // ── Entra Intelligence ──────────────────────────────────────────────────────

  fetchEntraOverview: () =>
    get<Record<string, number>>('/api/entra/overview'),

  fetchEntraDevices: (params?: { compliance?: string; os?: string; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.compliance) qs.set('compliance', params.compliance)
    if (params?.os)         qs.set('os', params.os)
    if (params?.limit)      qs.set('limit', String(params.limit))
    const query = qs.toString()
    return get<unknown[]>(`/api/entra/devices${query ? `?${query}` : ''}`)
  },

  fetchEntraUsers: (params?: { riskLevel?: string }) => {
    const qs = new URLSearchParams()
    if (params?.riskLevel) qs.set('riskLevel', params.riskLevel)
    const query = qs.toString()
    return get<unknown[]>(`/api/entra/users${query ? `?${query}` : ''}`)
  },

  fetchEntraGroups: () =>
    get<unknown[]>('/api/entra/groups'),

  searchEntraGroups: (q: string) =>
    get<EntraGroupSuggestion[]>(`/api/entra/groups/search?q=${encodeURIComponent(q)}`),

  fetchEntraGroupReport: (params: { name: string; os?: string }) => {
    const qs = new URLSearchParams({ name: params.name })
    if (params.os && params.os !== 'all') qs.set('os', params.os)
    return get<EntraGroupReportResult>(`/api/entra/groups/report?${qs.toString()}`)
  },

  async exportEntraGroupReport(params: { name: string; os?: string; format?: 'csv' | 'excel' }): Promise<void> {
    const qs = new URLSearchParams({ name: params.name, format: params.format ?? 'csv' })
    if (params.os && params.os !== 'all') qs.set('os', params.os)
    const res = await fetch(`${BASE_URL}/api/entra/groups/report/export?${qs.toString()}`)
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: string } | null
      throw new Error(body?.error ?? 'Export failed')
    }
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const ext  = params.format === 'excel' ? 'xlsx' : 'csv'
    const a    = document.createElement('a')
    a.href     = url
    a.download = `entra-group-report-${Date.now()}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  },

  fetchEntraSecurity: () =>
    get<Record<string, number>>('/api/entra/security'),

  syncEntraDevice: (deviceId: string) =>
    post<{ success: boolean; message: string }>(`/api/entra/devices/${encodeURIComponent(deviceId)}/sync`, {}),

  diagnoseEntraDevice: (deviceId: string) =>
    post<{ summary: string; issues: string[] }>(`/api/entra/devices/${encodeURIComponent(deviceId)}/diagnose`, {}),
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
