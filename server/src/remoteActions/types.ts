// Shared types for the Remote Action Center (script execution on managed devices).

import type { RiskLevel, ScriptLanguage, ScriptPlatform, Finding } from './scriptAnalysis.js'

export type ProviderId = 'intune' | 'endpoint_central' | 'mock'
export type RunAs = 'system' | 'user'
export type ApprovalStatus = 'approved' | 'pending_approval' | 'rejected' | 'blocked'

export interface ScriptVersion {
  version: number
  /** Script text. Stored encrypted when REMOTE_ACTIONS_ENCRYPTION_KEY is set (see store.ts); always plain in memory. */
  content: string
  contentHash: string
  risk: RiskLevel
  findings: Finding[]
  requiresAdmin: boolean
  justification?: string
  /** Optional undo script for this version, analysed with the same rules. */
  rollbackContent?: string
  rollbackRisk?: RiskLevel
  approvalStatus: ApprovalStatus
  approvedBy?: string
  approvedAt?: string
  approvalNote?: string
  createdBy: string
  createdAt: string
  source: 'manual' | 'upload' | 'ai_draft'
}

export interface RemoteScript {
  id: string
  name: string
  description: string
  language: ScriptLanguage
  platform: ScriptPlatform
  owner: string
  tags: string[]
  timeoutSec: number
  runAs: RunAs
  version: number
  versions: ScriptVersion[]
  archived: boolean
  usageCount: number
  lastResult?: { jobId: string; status: JobStatus; at: string }
  createdBy: string
  createdAt: string
  updatedAt: string
}

// ── Jobs ───────────────────────────────────────────────────────────────────────

export type JobStatus =
  | 'draft' | 'pending_approval' | 'approved' | 'rejected'
  | 'scheduled' | 'queued' | 'running'
  | 'completed' | 'completed_with_failures' | 'failed' | 'cancelled'

/** Truthful per-device states: only what we or the provider actually know. */
export type DeviceState =
  | 'queued' | 'waiting_online' | 'sent' | 'provider_accepted' | 'running'
  | 'succeeded' | 'failed' | 'timed_out' | 'skipped' | 'cancelled'

export const TERMINAL_DEVICE_STATES: readonly DeviceState[] = ['succeeded', 'failed', 'timed_out', 'skipped', 'cancelled']

export interface TargetDevice {
  id: string
  name: string
  platform: 'Windows' | 'macOS'
  serialNumber?: string
  source: 'Microsoft Intune' | 'ManageEngine'
  lastCheckIn?: string
  /** Entra device id (Intune only) — what the provider needs to resolve a directory object. */
  azureAdDeviceId?: string
}

export interface TargetSpec {
  deviceIds?: string[]
  /** Dynamic filter evaluated against the live inventory when the job is created (the resolved list is then frozen). */
  filter?: DeviceFilter
}

export interface DeviceFilter {
  platform?: 'Windows' | 'macOS'
  source?: 'Microsoft Intune' | 'ManageEngine'
  nameContains?: string
  serialNumber?: string
  checkedInWithinHours?: number
  complianceState?: 'Compliant' | 'Warning' | 'Non-Compliant'
  department?: string
  owner?: string
  osVersionContains?: string
}

export interface PreflightResult {
  eligible: Array<TargetDevice & { checkInAgeHours: number | null }>
  excluded: Array<{ device: Pick<TargetDevice, 'id' | 'name' | 'platform'>; reasons: string[] }>
  /** Job-level blockers (provider unavailable, permission, etc.). Any entry means the job cannot start. */
  blockers: string[]
  warnings: string[]
}

export interface DeviceExecution {
  deviceId: string
  deviceName: string
  platform: 'Windows' | 'macOS'
  state: DeviceState
  /** Provider's own state string, verbatim, so the UI never claims more than the provider said. */
  providerState?: string
  providerRef?: string
  exitCode?: number | null
  output?: string
  error?: string
  /** Only set when the script emitted __ITO_PROGRESS__ markers AND the provider returned output. */
  progress?: { percent: number; message: string }
  attempts: number
  updatedAt: string
  startedAt?: string
  finishedAt?: string
}

export interface JobEvent { at: string; actor: string; action: string; detail?: string }

export interface RemoteJob {
  id: string
  idempotencyKey: string
  scriptId: string
  scriptName: string
  scriptVersion: number
  contentHash: string
  language: ScriptLanguage
  risk: RiskLevel
  provider: ProviderId
  runAs: RunAs
  timeoutSec: number
  mode: 'now' | 'when_online' | 'scheduled' | 'pilot'
  scheduledFor?: string
  justification: string
  status: JobStatus
  requestedBy: string
  approver?: string
  approvalNote?: string
  approvalRequired: boolean
  createdAt: string
  updatedAt: string
  startedAt?: string
  finishedAt?: string
  targetSpec: TargetSpec
  devices: DeviceExecution[]
  excluded: PreflightResult['excluded']
  /** Provider-side objects created for this job (script id, group id) — needed to poll and clean up. */
  providerContext?: Record<string, string>
  retryOf?: string
  events: JobEvent[]
}

export interface Actor { email: string; role: string }

export interface ProviderCapabilities {
  id: ProviderId
  label: string
  /** True only when integration, permissions and API capability are all confirmed. */
  enabled: boolean
  reasons: string[]
  supports: {
    powershell: boolean; shell: boolean
    runAsSystem: boolean; runAsUser: boolean
    /** Device-by-device state reported by the provider. */
    perDeviceStatus: boolean
    /** Script stdout/stderr is returned (possibly truncated), so progress markers can be parsed. */
    scriptOutput: boolean
    liveStreaming: boolean
    cancel: boolean
    runWhenOnline: boolean
    scheduling: boolean
  }
  notes: string[]
}
