// Intelligence Platform — frontend HTTP client.
// All functions call the /api/intelligence/* routes on the Express server.

const SERVER = import.meta.env.VITE_API_URL ?? ''
const BASE = `${SERVER}/api/intelligence`
const SCHEDULES = `${SERVER}/api/scheduled-reports`

async function post<T>(url: string, body: object): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json() as Promise<T>
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url)
  return res.json() as Promise<T>
}

// ─── Devices ──────────────────────────────────────────────────────────────────

export interface IntelDevice {
  id: string
  deviceName: string
  userPrincipalName: string
  operatingSystem: string
  osVersion: string
  complianceState: string
  lastSyncDateTime: string
  isEncrypted: boolean
  manufacturer: string
  model: string
  serialNumber: string
  managementAgent: string
}

export const intelApi = {
  devices: (): Promise<{ success: boolean; data: IntelDevice[]; count: number }> =>
    get(`${BASE}/devices`),

  // ─── Policies ───────────────────────────────────────────────────────────────
  policies: (): Promise<{
    success: boolean
    compliance: CompliancePolicy[]
    config: ConfigProfile[]
    conflicts: PolicyConflict[]
    summary: ConflictSummary
  }> => get(`${BASE}/policies`),

  // ─── Risk Scores ─────────────────────────────────────────────────────────────
  riskScores: (limit = 50, ai = true): Promise<{
    success: boolean
    data: RiskScore[]
    summary: { critical: number; high: number; medium: number; low: number; avgScore: number }
    count: number
  }> => get(`${BASE}/risk-scores?limit=${limit}&ai=${ai}`),

  // ─── AI Features ────────────────────────────────────────────────────────────
  summary: (context?: string): Promise<{ success: boolean; summary: string; error?: string }> =>
    post(`${BASE}/summary`, { context }),

  explain: (deviceName: string, issue: string, context?: string): Promise<{ success: boolean; explanation: string; error?: string }> =>
    post(`${BASE}/explain`, { deviceName, issue, context }),

  // ─── Export ─────────────────────────────────────────────────────────────────
  async export(format: 'csv' | 'excel' | 'pdf' | 'pptx', reportType: string): Promise<void> {
    const res = await fetch(`${BASE}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format, reportType }),
    })
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const ext  = format === 'excel' ? 'xlsx' : format
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${reportType}-${Date.now()}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  },

  // ─── Device Report ───────────────────────────────────────────────────────────
  deviceReport: (): Promise<DeviceReportData> =>
    get(`${BASE}/device-report`),

  async deviceReportExport(): Promise<void> {
    const res = await fetch(`${BASE}/device-report/export`, { method: 'POST' })
    if (!res.ok) throw new Error('Export failed')
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const today = new Date().toISOString().slice(0, 10)
    const a     = document.createElement('a')
    a.href     = url
    a.download = `intune-device-report-${today}.xlsx`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  },

  async deviceInventoryExport(filters?: { ownerType?: string; search?: string }): Promise<void> {
    const res = await fetch(`${BASE}/device-report/inventory-export`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(filters ?? {}),
    })
    if (!res.ok) throw new Error('Export failed')
    const blob  = await res.blob()
    const url   = URL.createObjectURL(blob)
    const today = new Date().toISOString().slice(0, 10)
    const a     = document.createElement('a')
    a.href      = url
    a.download  = `device-inventory-${today}.xlsx`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  },

  // ─── Scheduled Reports ───────────────────────────────────────────────────────
  schedules: {
    list: (): Promise<{ success: boolean; data: ScheduledReport[] }> =>
      get(SCHEDULES),
    create: (s: CreateScheduleInput): Promise<{ success: boolean; data: ScheduledReport; error?: string }> =>
      post(SCHEDULES, s),
    update: (id: string, s: Partial<ScheduledReport>): Promise<{ success: boolean }> =>
      fetch(`${SCHEDULES}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) }).then(r => r.json()) as Promise<{ success: boolean }>,
    delete: (id: string): Promise<{ success: boolean }> =>
      fetch(`${SCHEDULES}/${id}`, { method: 'DELETE' }).then(r => r.json()) as Promise<{ success: boolean }>,
    runNow: (id: string): Promise<{ success: boolean; runId?: string; message?: string }> =>
      post(`${SCHEDULES}/${id}/run`, {}),
    runs: (id: string): Promise<{ success: boolean; data: ReportRun[] }> =>
      get(`${SCHEDULES}/${id}/runs`),
  },
}

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface CompliancePolicy {
  id: string
  displayName: string
  description: string
  platformType: string
  createdDateTime: string
  lastModifiedDateTime: string
}

export interface ConfigProfile {
  id: string
  displayName: string
  description: string
  platformType: string
  createdDateTime: string
  lastModifiedDateTime: string
  version: number
}

export interface PolicyConflict {
  id: string
  type: string
  severity: 'low' | 'medium' | 'high'
  title: string
  description: string
  affectedPolicies: { id: string; name: string; type: string }[]
  recommendation: string
}

export interface ConflictSummary {
  total: number; high: number; medium: number; low: number
  byType: Record<string, number>
}

export interface RiskFactor {
  category: string
  severity: string
  description: string
  points: number
}

export interface RiskScore {
  deviceId: string
  deviceName: string
  userEmail: string
  overallScore: number
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  factors: RiskFactor[]
  aiSummary: string
  actionItems: string[]
  computedAt: string
}

export interface ScheduledReport {
  id: string
  name: string
  report_type: string
  schedule_cron: string
  format: string
  recipients: string[]
  filters?: { slackChannelId?: string; timezone?: string }
  is_active: boolean
  last_run_at: string | null
  next_run_at: string | null
  created_by: string | null
  created_at: string
}

export interface CreateScheduleInput {
  name: string
  report_type: string
  schedule_cron: string
  format?: string
  recipients?: string[]
  filters?: { slackChannelId?: string; timezone?: string }
  created_by?: string
}

export interface ReportRun {
  id: string
  status: string
  format: string
  record_count: number | null
  file_size_bytes: number | null
  error_message: string | null
  triggered_by: string
  started_at: string
  completed_at: string | null
}

// ─── Device Report ────────────────────────────────────────────────────────────

export interface DeviceReportMonth {
  key: string
  label: string
  year: number
  month: number
  count: number
}

export interface DeviceReportAppsMonth {
  key: string
  label: string
  year: number
  month: number
  added: number
  updated: number
  total: number
}

export interface DeviceReportDevice {
  id: string
  deviceName: string
  userPrincipalName: string
  ownerType: string
  operatingSystem: string
  osVersion: string
  complianceState: string
  enrolledDateTime: string
  lastSyncDateTime: string
  isEncrypted: boolean
  manufacturer: string
  model: string
  serialNumber: string
  managementAgent: string
}

export interface DeviceReportData {
  success: boolean
  totalDevices: number
  newDevicesByMonth: DeviceReportMonth[]
  appsByMonth: DeviceReportAppsMonth[]
  devices: DeviceReportDevice[]
  cached?: boolean
}
