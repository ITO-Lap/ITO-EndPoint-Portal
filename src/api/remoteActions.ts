// Remote Action Center + Microsoft Graph API Runner — frontend client for /api/remote-actions/*.
// The browser never sees a provider or Graph token: every call here goes to our own server, which holds the credentials.
const SERVER = import.meta.env.VITE_API_URL ?? ''
const BASE = `${SERVER}/api/remote-actions`

export type Risk = 'low' | 'medium' | 'high' | 'blocked'
export type ProviderId = 'intune' | 'endpoint_central' | 'mock'
export type JobStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'scheduled' | 'queued' | 'running' | 'completed' | 'completed_with_failures' | 'failed' | 'cancelled'
export type DeviceState = 'queued' | 'waiting_online' | 'sent' | 'provider_accepted' | 'running' | 'succeeded' | 'failed' | 'timed_out' | 'skipped' | 'cancelled'

export interface Finding { ruleId: string; severity: Risk; category: string; message: string; line?: number; match?: string }
export interface ScriptAnalysis {
  language: 'powershell' | 'shell' | 'unknown'; platform: 'Windows' | 'macOS' | 'both' | 'unknown'; name: string; description: string
  requiresAdmin: boolean; adminEvidence: string[]; risk: Risk; findings: Finding[]; errors: string[]
  requiresJustification: boolean; requiresApproval: boolean; rollbackRecommended: boolean; lineCount: number
}
export interface ScriptSummary {
  id: string; name: string; description: string; language: 'powershell' | 'shell'; platform: string; owner: string; tags: string[]; timeoutSec: number; runAs: 'system' | 'user'
  version: number; archived: boolean; usageCount: number; lastResult: { jobId: string; status: JobStatus; at: string } | null
  risk: Risk; approvalStatus: 'approved' | 'pending_approval' | 'rejected' | 'blocked'; approvedBy: string | null; requiresAdmin: boolean; hasRollback: boolean
  createdBy: string; createdAt: string; updatedAt: string
}
export interface ScriptVersion { version: number; content?: string; rollbackContent?: string; bodyHidden?: boolean; risk: Risk; findings: Finding[]; approvalStatus: string; approvedBy?: string; justification?: string; createdBy: string; createdAt: string }
export interface ScriptDetail extends ScriptSummary { versions: ScriptVersion[]; audit: AuditEvent[] }
export interface AuditEvent { at: string; actor: string; action: string; resourceType: string; resourceId: string; provider?: string; detail?: unknown }

export interface ProviderCaps {
  id: ProviderId; label: string; enabled: boolean; reasons: string[]; notes: string[]
  supports: { powershell: boolean; shell: boolean; runAsSystem: boolean; runAsUser: boolean; perDeviceStatus: boolean; scriptOutput: boolean; liveStreaming: boolean; cancel: boolean; runWhenOnline: boolean; scheduling: boolean }
}
export interface Policy { maxDevicesPerJob: number; mediumRiskApprovalAbove: number; maxConcurrentJobs: number; maxJobsPerUserPerHour: number; maxCheckInAgeHours: number; pilotMaxDevices: number; executionPaused: boolean }
export interface RaStatus {
  providers: ProviderCaps[]; policy: Policy; encryptionAtRest: boolean; me: string
  permissions: { read: boolean; author: boolean; execute: boolean; approve: boolean; admin: boolean; graphRead: boolean; graphRun: boolean; graphChange: boolean; graphApprove: boolean }
}

export interface TargetDevice { id: string; name: string; platform: 'Windows' | 'macOS'; source: string; lastCheckIn?: string; serialNumber?: string }
export interface Preflight {
  eligible: Array<TargetDevice & { checkInAgeHours: number | null }>
  excluded: Array<{ device: { id: string; name: string; platform: string }; reasons: string[] }>
  blockers: string[]; warnings: string[]; risk: Risk; versionApproval: string
  approval: { versionApproval: boolean; jobApproval: boolean; allowed: boolean }
}
export interface DeviceExecution { deviceId: string; deviceName: string; platform: string; state: DeviceState; providerState?: string; exitCode?: number | null; output?: string; error?: string; progress?: { percent: number; message: string }; attempts: number; updatedAt: string; startedAt?: string; finishedAt?: string }
export interface JobCounts { total: number; queued: number; running: number; succeeded: number; failed: number; skipped: number; cancelled: number; waitingOnline: number }
export interface Job {
  id: string; scriptId: string; scriptName: string; scriptVersion: number; risk: Risk; provider: ProviderId; mode: string; scheduledFor?: string; justification: string; status: JobStatus
  requestedBy: string; approver?: string; approvalNote?: string; approvalRequired: boolean; createdAt: string; updatedAt: string; startedAt?: string; finishedAt?: string
  devices: DeviceExecution[]; excluded: Preflight['excluded']; counts: JobCounts; events: Array<{ at: string; actor: string; action: string; detail?: string }>; retryOf?: string; audit?: AuditEvent[]
}
export interface Dashboard {
  scripts: { total: number; pendingApproval: number }
  pendingApprovals: { scripts: ScriptSummary[]; jobs: Job[] }
  activeJobs: Job[]; recentFailures: Job[]; waitingForOnline: number; successRate30d: number | null; attemptedDevices30d: number
}
export interface AssistantResult { task: string; text: string; ai: boolean; notice: string; draft?: { language: string; content: string; analysis: ScriptAnalysis } }
export interface ScriptInput {
  name: string; description?: string; content: string; fileName?: string; language?: 'powershell' | 'shell'; owner?: string; tags?: string[]; timeoutSec?: number; runAs?: 'system' | 'user'
  justification?: string; rollbackContent?: string; source?: 'manual' | 'upload' | 'ai_draft'
}
export interface TargetSpec { deviceIds?: string[]; filter?: { platform?: 'Windows' | 'macOS'; source?: string; nameContains?: string; serialNumber?: string; checkedInWithinHours?: number; complianceState?: string; department?: string; owner?: string; osVersionContains?: string } }
export interface CreateJobInput { scriptId: string; version?: number; target: TargetSpec; provider: ProviderId; mode: 'now' | 'when_online' | 'scheduled' | 'pilot'; runAs?: 'system' | 'user'; justification?: string; scheduledFor?: string; confirmDeviceCount?: number }

// ── Graph runner ───────────────────────────────────────────────────────────────
export type GraphClass = 'read_only' | 'change' | 'destructive' | 'blocked'
export interface GraphRequestInput { name: string; description?: string; justification?: string; version: 'v1.0' | 'beta'; method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; endpoint: string; query: Record<string, string>; body?: unknown; confirmed?: boolean; allPages?: boolean }
export interface GraphValidation {
  ok: boolean; errors: string[]; warnings: string[]; classification: GraphClass; reasons: string[]; family?: string; requiredPermissions: string[][]; minimumPermissions: string[]
  bulk: boolean; expectedImpact: string; requiresJustification: boolean; requiresApproval: boolean; requiresConfirmation: boolean
  request?: { url: string; method: string; path: string; version: string; query: Record<string, string>; body?: unknown }
  permissions: { checked: boolean; ok: boolean; missing: string[][]; note?: string }
  tenant: { tenantId: string } | null
}
export interface GraphRecord {
  id: string; name: string; description: string; justification: string; version: string; method: string; endpoint: string; query: Record<string, string>; body?: unknown
  classification: GraphClass; approvalStatus: 'not_required' | 'pending' | 'approved' | 'rejected'; requestedBy: string; approver?: string; requestedAt: string; executedAt?: string
  status: 'pending_approval' | 'rejected' | 'executed' | 'failed' | 'cancelled'; httpStatus?: number; durationMs?: number; correlationId?: string; tenantId?: string
  resultSummary?: string; output?: unknown; outputTruncated?: boolean; nextLink?: string; pagesFetched?: number; retryAfterSeconds?: number; retryOf?: string
  downloads: Array<{ at: string; by: string; format: string }>; audit?: AuditEvent[]
}
export interface GraphTemplate { id: string; name: string; description: string; version: 'v1.0' | 'beta'; method: GraphRequestInput['method']; endpoint: string; query: Record<string, string>; body?: unknown; placeholders?: string[]; createdBy?: string }

interface Envelope<T> { success?: boolean; data?: T; error?: string; details?: unknown; duplicate?: boolean; approvalRequired?: boolean }
export class ApiError extends Error {
  status: number
  details?: unknown
  constructor(message: string, status: number, details?: unknown) { super(message); this.status = status; this.details = details }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<Envelope<T> & { data: T }> {
  const res = await fetch(`${BASE}${path}`, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  const json = await res.json().catch(() => null) as Envelope<T> | null
  if (!res.ok || !json?.success) throw new ApiError(json?.error ?? (res.status === 403 ? 'You do not have permission to do this.' : res.status === 429 ? 'Too many requests. Try again shortly.' : `Request failed (${res.status})`), res.status, json?.details)
  return json as Envelope<T> & { data: T }
}

async function download(path: string, fallbackName: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) { const j = await res.json().catch(() => null) as Envelope<unknown> | null; throw new ApiError(j?.error ?? `Download failed (${res.status})`, res.status) }
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName
  const url = URL.createObjectURL(await res.blob())
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}

const qs = (o: Record<string, string | number | undefined>): string => {
  const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') p.set(k, String(v))
  const s = p.toString(); return s ? `?${s}` : ''
}

export const remoteActionsApi = {
  status: async () => (await req<RaStatus>('GET', '/status')).data,
  dashboard: async () => (await req<Dashboard>('GET', '/dashboard')).data,
  scripts: async () => (await req<ScriptSummary[]>('GET', '/scripts')).data,
  script: async (id: string) => (await req<ScriptDetail>('GET', `/scripts/${id}`)).data,
  analyze: async (b: { content: string; fileName?: string; language?: 'powershell' | 'shell'; rollbackContent?: string }) => (await req<{ analysis: ScriptAnalysis; rollback?: ScriptAnalysis }>('POST', '/scripts/analyze', b)).data,
  createScript: async (b: ScriptInput) => (await req<ScriptSummary>('POST', '/scripts', b)).data,
  updateScript: async (id: string, b: ScriptInput) => (await req<ScriptSummary>('PUT', `/scripts/${id}`, b)).data,
  decideScript: async (id: string, version: number, decision: 'approve' | 'reject', note?: string) => (await req<ScriptSummary>('POST', `/scripts/${id}/versions/${version}/decision`, { decision, ...(note ? { note } : {}) })).data,
  archiveScript: async (id: string, archived: boolean) => (await req<ScriptSummary>('POST', `/scripts/${id}/archive`, { archived })).data,
  devices: async (f: { platform?: string; q?: string; source?: string; checkedInWithinHours?: number; compliance?: string; department?: string; limit?: number }) => (await req<{ total: number; devices: TargetDevice[] }>('GET', `/devices${qs(f)}`)).data,
  preflight: async (b: { scriptId: string; version?: number; target: TargetSpec; provider: ProviderId; mode: string; runAs?: string }) => (await req<Preflight>('POST', '/preflight', b)).data,
  createJob: async (b: CreateJobInput) => { const r = await req<Job>('POST', '/jobs', b); return { job: r.data, duplicate: r.duplicate === true } },
  jobs: async (status?: string) => (await req<Job[]>('GET', `/jobs${qs({ status })}`)).data,
  job: async (id: string) => (await req<Job>('GET', `/jobs/${id}`)).data,
  refreshJob: async (id: string) => (await req<Job>('POST', `/jobs/${id}/refresh`)).data,
  decideJob: async (id: string, decision: 'approve' | 'reject', note?: string) => (await req<Job>('POST', `/jobs/${id}/decision`, { decision, ...(note ? { note } : {}) })).data,
  cancelJob: async (id: string) => (await req<Job>('POST', `/jobs/${id}/cancel`)).data,
  retryFailed: async (id: string, confirmDeviceCount?: number) => (await req<Job>('POST', `/jobs/${id}/retry-failed`, confirmDeviceCount !== undefined ? { confirmDeviceCount } : {})).data,
  exportJob: (id: string) => download(`/jobs/${id}/export`, `remote-action-${id.slice(0, 8)}.csv`),
  assistant: async (b: { task: string; content?: string; language?: string; request?: string; logs?: string }) => (await req<AssistantResult>('POST', '/assistant', b)).data,
  setPolicy: async (p: Omit<Policy, 'executionPaused'>) => (await req<Policy>('PUT', '/policy', p)).data,
  emergencyStop: async (paused: boolean) => (await req<Policy>('POST', '/emergency-stop', { paused })).data,
  audit: async () => (await req<AuditEvent[]>('GET', '/audit?limit=200')).data,

  graph: {
    templates: async () => (await req<{ builtin: GraphTemplate[]; saved: GraphTemplate[] }>('GET', '/graph/templates')).data,
    saveTemplate: async (t: Omit<GraphTemplate, 'id' | 'placeholders' | 'createdBy'>) => (await req<GraphTemplate>('POST', '/graph/templates', t)).data,
    deleteTemplate: async (id: string) => { await req<unknown>('DELETE', `/graph/templates/${id}`) },
    validate: async (b: { version: string; method: string; endpoint: string; query: Record<string, string>; body?: unknown }) => (await req<GraphValidation>('POST', '/graph/validate', b)).data,
    submit: async (b: GraphRequestInput) => { const r = await req<GraphRecord>('POST', '/graph/requests', b); return { record: r.data, approvalRequired: r.approvalRequired === true } },
    history: async (f: { classification?: string; status?: string; mine?: boolean } = {}) => (await req<GraphRecord[]>('GET', `/graph/history${qs({ classification: f.classification, status: f.status, mine: f.mine ? 1 : undefined })}`)).data,
    record: async (id: string) => (await req<GraphRecord>('GET', `/graph/history/${id}`)).data,
    decide: async (id: string, decision: 'approve' | 'reject', note?: string) => (await req<GraphRecord>('POST', `/graph/history/${id}/decision`, { decision, ...(note ? { note } : {}) })).data,
    rerun: async (id: string, b: { confirmed?: boolean; justification?: string; allPages?: boolean } = {}) => (await req<GraphRecord>('POST', `/graph/history/${id}/rerun`, b)).data,
    nextPage: async (id: string) => (await req<GraphRecord>('POST', `/graph/history/${id}/next`)).data,
    download: (id: string, format: 'json' | 'csv' | 'txt') => download(`/graph/history/${id}/download?format=${format}`, `graph-${id.slice(0, 8)}.${format}`),
    assistant: async (b: { task: string; text?: string; method?: string; endpoint?: string; version?: string; status?: number; recordId?: string }) =>
      (await req<{ task: string; text: string; ai: boolean; notice: string; draft?: { name: string; version: 'v1.0' | 'beta'; method: string; endpoint: string; query: Record<string, string>; validation: { ok: boolean; classification: GraphClass; errors: string[]; reasons: string[]; minimumPermissions: string[] } } }>('POST', '/graph/assistant', b)).data,
  },
}
