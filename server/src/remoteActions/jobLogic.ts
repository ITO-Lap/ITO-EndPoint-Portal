// Pure job logic: state transitions, approval policy, status aggregation, progress-marker parsing, target validation.
// No I/O so every rule can be unit-tested.

import type { RiskLevel } from './scriptAnalysis.js'
import {
  TERMINAL_DEVICE_STATES,
  type Actor, type DeviceExecution, type DeviceState, type JobStatus, type PreflightResult, type ProviderCapabilities,
  type RemoteJob, type RemoteScript, type ScriptVersion, type TargetDevice,
} from './types.js'

// ── Job state machine ──────────────────────────────────────────────────────────

const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  draft:                   ['pending_approval', 'approved', 'cancelled'],
  pending_approval:        ['approved', 'rejected', 'cancelled'],
  approved:                ['scheduled', 'queued', 'cancelled'],
  rejected:                [],
  scheduled:               ['queued', 'cancelled'],
  queued:                  ['running', 'cancelled', 'failed', 'completed', 'completed_with_failures'],
  running:                 ['completed', 'completed_with_failures', 'failed', 'cancelled'],
  completed:               [],
  completed_with_failures: [],
  failed:                  [],
  cancelled:               [],
}

export const isTerminalJob = (s: JobStatus): boolean => JOB_TRANSITIONS[s].length === 0

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return JOB_TRANSITIONS[from].includes(to)
}

export class InvalidTransitionError extends Error {
  status = 409
  constructor(from: string, to: string) { super(`A job cannot move from "${from}" to "${to}".`) }
}

export function transitionJob(job: RemoteJob, to: JobStatus, actor: string, detail?: string, now = new Date()): RemoteJob {
  if (!canTransition(job.status, to)) throw new InvalidTransitionError(job.status, to)
  const at = now.toISOString()
  job.status = to
  job.updatedAt = at
  if (to === 'running' && !job.startedAt) job.startedAt = at
  if (isTerminalJob(to)) job.finishedAt = at
  job.events.push({ at, actor, action: `status:${to}`, ...(detail ? { detail } : {}) })
  return job
}

// ── Per-device transitions (a device never moves backwards, and terminal states are final) ──

const DEVICE_ORDER: DeviceState[] = ['queued', 'waiting_online', 'sent', 'provider_accepted', 'running']

export function canAdvanceDevice(from: DeviceState, to: DeviceState): boolean {
  if (TERMINAL_DEVICE_STATES.includes(from)) return false
  if (TERMINAL_DEVICE_STATES.includes(to)) return true
  // 'waiting_online' <-> 'sent' may alternate while a device flaps; otherwise only forward.
  if (from === 'waiting_online' && to === 'sent') return true
  if (from === 'sent' && to === 'waiting_online') return true
  return DEVICE_ORDER.indexOf(to) >= DEVICE_ORDER.indexOf(from)
}

export function advanceDevice(d: DeviceExecution, to: DeviceState, patch: Partial<DeviceExecution> = {}, now = new Date()): boolean {
  if (!canAdvanceDevice(d.state, to)) return false
  const at = now.toISOString()
  d.state = to
  d.updatedAt = at
  if (to === 'running' && !d.startedAt) d.startedAt = at
  if (TERMINAL_DEVICE_STATES.includes(to)) d.finishedAt = at
  Object.assign(d, patch)
  return true
}

// ── Aggregation ────────────────────────────────────────────────────────────────

export interface JobCounts { total: number; queued: number; running: number; succeeded: number; failed: number; skipped: number; cancelled: number; waitingOnline: number }

export function countDevices(devices: DeviceExecution[]): JobCounts {
  const c: JobCounts = { total: devices.length, queued: 0, running: 0, succeeded: 0, failed: 0, skipped: 0, cancelled: 0, waitingOnline: 0 }
  for (const d of devices) {
    if (d.state === 'succeeded') c.succeeded++
    else if (d.state === 'failed' || d.state === 'timed_out') c.failed++
    else if (d.state === 'skipped') c.skipped++
    else if (d.state === 'cancelled') c.cancelled++
    else if (d.state === 'waiting_online') c.waitingOnline++
    else if (d.state === 'queued') c.queued++
    else c.running++ // sent / provider_accepted / running: in flight
  }
  return c
}

/** Status a running job should settle into once every device is terminal, or null while work remains. */
export function settledStatus(devices: DeviceExecution[]): JobStatus | null {
  if (devices.length === 0 || devices.some(d => !TERMINAL_DEVICE_STATES.includes(d.state))) return null
  const c = countDevices(devices)
  if (c.cancelled === c.total) return 'cancelled'
  if (c.succeeded === 0 && c.failed > 0) return 'failed'
  return c.failed > 0 ? 'completed_with_failures' : 'completed'
}

// ── Progress markers ───────────────────────────────────────────────────────────

const MARKER = /__ITO_PROGRESS__:(\d{1,3})\|([^\r\n]{0,200})/g

/**
 * Last valid progress marker in script output. Call this ONLY with output a provider actually returned: with no output
 * there is no progress, and the UI must show the provider's state instead of an invented percentage.
 */
export function parseProgress(output: string | undefined): { percent: number; message: string } | undefined {
  if (!output) return undefined
  let last: { percent: number; message: string } | undefined
  for (const m of output.matchAll(MARKER)) {
    const percent = Number(m[1])
    if (percent >= 0 && percent <= 100) last = { percent, message: m[2]!.trim() }
  }
  return last
}

// ── Approval policy ────────────────────────────────────────────────────────────

export interface ExecutionPolicy {
  /** Hard cap on devices in one job. */
  maxDevicesPerJob: number
  /** Medium-risk jobs above this many devices also need job-level approval. */
  mediumRiskApprovalAbove: number
  /** Jobs running at the same time across the whole service. */
  maxConcurrentJobs: number
  /** Job creations per user per hour. */
  maxJobsPerUserPerHour: number
  /** A device must have checked in within this window to be eligible. */
  maxCheckInAgeHours: number
  /** Pilot jobs may not exceed this many devices. */
  pilotMaxDevices: number
  /** Emergency stop: no new job can be dispatched while true. */
  executionPaused: boolean
}

export const DEFAULT_POLICY: ExecutionPolicy = {
  maxDevicesPerJob: 500, mediumRiskApprovalAbove: 10, maxConcurrentJobs: 5, maxJobsPerUserPerHour: 20,
  maxCheckInAgeHours: 72, pilotMaxDevices: 5, executionPaused: false,
}

/**
 * Whether a script VERSION must be approved before ANY job may use it, and whether the JOB needs its own approval.
 *   low    → neither
 *   medium → version approved once by an approver; job approval only above `mediumRiskApprovalAbove` devices
 *   high   → version approved AND every job needs approver sign-off
 *   blocked→ never
 */
export function approvalRequirement(risk: RiskLevel, deviceCount: number, policy: ExecutionPolicy): { versionApproval: boolean; jobApproval: boolean; allowed: boolean } {
  switch (risk) {
    case 'blocked': return { versionApproval: false, jobApproval: false, allowed: false }
    case 'high':    return { versionApproval: true, jobApproval: true, allowed: true }
    case 'medium':  return { versionApproval: true, jobApproval: deviceCount > policy.mediumRiskApprovalAbove, allowed: true }
    default:        return { versionApproval: false, jobApproval: false, allowed: true }
  }
}

export function initialVersionApproval(risk: RiskLevel): ScriptVersion['approvalStatus'] {
  if (risk === 'blocked') return 'blocked'
  return risk === 'low' ? 'approved' : 'pending_approval'
}

/** Separation of duties: nobody approves their own script version or job. */
export function assertCanApprove(requestedBy: string, approver: Actor, canApprove: boolean): void {
  if (!canApprove) throw Object.assign(new Error('You do not have the Approver permission.'), { status: 403 })
  if (requestedBy.toLowerCase() === approver.email.toLowerCase()) {
    throw Object.assign(new Error('You cannot approve your own request. Ask another approver.'), { status: 403 })
  }
}

// ── Target validation / pre-flight ─────────────────────────────────────────────

export interface PreflightInput {
  script: Pick<RemoteScript, 'language' | 'platform' | 'runAs'>
  devices: TargetDevice[]
  /** Devices requested by id that the inventory could not find. */
  missingIds?: string[]
  provider: ProviderCapabilities
  policy: ExecutionPolicy
  mode: RemoteJob['mode']
  requestedRunAs: RemoteScript['runAs']
  now?: number
}

export function parseCheckIn(lastCheckIn: string | undefined): number | null {
  if (!lastCheckIn || /^(unknown|n\/a|never|—|-)$/i.test(lastCheckIn.trim())) return null
  const t = Date.parse(lastCheckIn)
  return Number.isFinite(t) ? t : null
}

export function runPreflight(input: PreflightInput): PreflightResult {
  const { script, provider, policy, mode } = input
  const now = input.now ?? Date.now()
  const blockers: string[] = []
  const warnings: string[] = []
  const eligible: PreflightResult['eligible'] = []
  const excluded: PreflightResult['excluded'] = []

  if (policy.executionPaused) blockers.push('Remote execution is paused by an administrator (emergency stop).')
  if (!provider.enabled) blockers.push(`Execution provider "${provider.label}" is not available: ${provider.reasons.join('; ') || 'not confirmed'}.`)
  else {
    if (script.language === 'powershell' && !provider.supports.powershell) blockers.push(`${provider.label} cannot run PowerShell scripts.`)
    if (script.language === 'shell' && !provider.supports.shell) blockers.push(`${provider.label} cannot run shell scripts.`)
    if (input.requestedRunAs === 'system' && !provider.supports.runAsSystem) blockers.push(`${provider.label} does not support running as system/root.`)
    if (input.requestedRunAs === 'user' && !provider.supports.runAsUser) blockers.push(`${provider.label} does not support running as the logged-in user.`)
    if (mode === 'when_online' && !provider.supports.runWhenOnline) blockers.push(`${provider.label} does not support "run when online".`)
    if (mode === 'scheduled' && !provider.supports.scheduling) blockers.push(`${provider.label} does not support scheduled runs.`)
  }
  if (input.devices.length + (input.missingIds?.length ?? 0) === 0) blockers.push('No target devices were selected.')

  for (const id of input.missingIds ?? []) excluded.push({ device: { id, name: id, platform: 'Windows' }, reasons: ['Not found in the managed-device inventory (not enrolled or not synced yet).'] })

  const seen = new Set<string>()
  for (const d of input.devices) {
    const reasons: string[] = []
    if (seen.has(d.id)) continue
    seen.add(d.id)
    if (script.platform !== 'both' && script.platform !== 'unknown' && d.platform !== script.platform) reasons.push(`Script targets ${script.platform} but this device is ${d.platform}.`)
    if (script.platform === 'unknown') reasons.push('Script platform could not be determined.')
    if (provider.id !== 'mock') {
      if (d.source === 'ManageEngine' && provider.id === 'intune') reasons.push('Device is managed by Endpoint Central, not Intune.')
      if (d.source === 'Microsoft Intune' && provider.id === 'endpoint_central') reasons.push('Device is managed by Intune, not Endpoint Central.')
      if (provider.id === 'intune' && d.platform === 'Windows' && !d.azureAdDeviceId) reasons.push('Device has no Entra device id, so Intune cannot target it.')
    }
    const ts = parseCheckIn(d.lastCheckIn)
    const ageH = ts === null ? null : Math.max(0, (now - ts) / 3_600_000)
    if (ts === null) reasons.push('No check-in time is recorded for this device, so it cannot be confirmed as actively managed.')
    else if (ageH! > policy.maxCheckInAgeHours && mode !== 'when_online') reasons.push(`Last check-in ${Math.round(ageH!)}h ago (limit ${policy.maxCheckInAgeHours}h). Use "Run when device is online" to wait for it.`)
    if (reasons.length) excluded.push({ device: { id: d.id, name: d.name, platform: d.platform }, reasons })
    else eligible.push({ ...d, checkInAgeHours: ageH })
  }

  if (eligible.length > policy.maxDevicesPerJob) blockers.push(`A job may target at most ${policy.maxDevicesPerJob} devices (${eligible.length} selected).`)
  if (mode === 'pilot' && eligible.length > policy.pilotMaxDevices) blockers.push(`A pilot run may target at most ${policy.pilotMaxDevices} devices.`)
  if (!provider.supports.scriptOutput && provider.enabled) warnings.push(`${provider.label} does not return script output with this integration: you will see device state only, not logs or progress.`)
  return { eligible, excluded, blockers, warnings }
}

// ── Idempotency ────────────────────────────────────────────────────────────────

/** Stable key for "the same request": same user, script version, devices, mode and schedule. */
export function idempotencyFingerprint(parts: { actor: string; scriptId: string; version: number; deviceIds: string[]; mode: string; scheduledFor?: string }): string {
  return [parts.actor.toLowerCase(), parts.scriptId, parts.version, [...parts.deviceIds].sort().join(','), parts.mode, parts.scheduledFor ?? ''].join('|')
}
