// Remote Action Center orchestration: script lifecycle, approvals, job creation, dispatch, polling, cancel, retry.
// Every sensitive rule is enforced HERE (server-side), never only in the UI. Routes just authenticate, check the
// coarse permission key, and call into this module.

import { createHash, randomUUID } from 'node:crypto'
import { analyzeScript, type ScriptAnalysis, type RiskLevel } from './scriptAnalysis.js'
import {
  advanceDevice, approvalRequirement, assertCanApprove, countDevices, idempotencyFingerprint, initialVersionApproval,
  isTerminalJob, parseProgress, runPreflight, settledStatus, transitionJob,
} from './jobLogic.js'
import { redactSecrets, sanitizeLog } from './redaction.js'
import * as store from './store.js'
import { getProvider } from './providers/registry.js'
import {
  TERMINAL_DEVICE_STATES,
  type Actor, type DeviceExecution, type PreflightResult, type ProviderId, type RemoteJob, type RemoteScript,
  type RunAs, type ScriptVersion, type TargetDevice, type TargetSpec, type DeviceFilter,
} from './types.js'
import type { Device } from '../types.js'

export class ServiceError extends Error {
  constructor(message: string, public status = 400, public details?: unknown) { super(message) }
}

/** Actor plus resolved permission map, so approval rules can be evaluated without another lookup. */
export interface AuthedActor extends Actor { perms: Record<string, boolean> }
const can = (a: AuthedActor, key: string): boolean => a.role === 'Global Admin' || a.perms[key] === true

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex')
const nowIso = (): string => new Date().toISOString()

/** Source of inventory. Injectable for tests; defaults to the app's live device list. */
export type DeviceSource = () => Promise<Device[]>
let deviceSource: DeviceSource = async () => (await (await import('../routes/devices.js')).fetchAllDevices()).devices
export function setDeviceSource(fn: DeviceSource): void { deviceSource = fn }

// ── Scripts ────────────────────────────────────────────────────────────────────

export interface ScriptInput {
  name: string
  description?: string
  content: string
  fileName?: string
  language?: 'powershell' | 'shell'
  owner?: string
  tags?: string[]
  timeoutSec?: number
  runAs?: RunAs
  justification?: string
  rollbackContent?: string
  source?: ScriptVersion['source']
}

export function validateScriptInput(input: ScriptInput): { analysis: ScriptAnalysis; rollback?: ScriptAnalysis } {
  const analysis = analyzeScript({ content: input.content, ...(input.fileName ? { fileName: input.fileName } : {}), ...(input.language ? { declaredLanguage: input.language } : {}) })
  const rollback = input.rollbackContent?.trim()
    ? analyzeScript({ content: input.rollbackContent, declaredLanguage: analysis.language })
    : undefined
  return { analysis, ...(rollback ? { rollback } : {}) }
}

function checkCreatable(input: ScriptInput, analysis: ScriptAnalysis): void {
  if (!input.name?.trim()) throw new ServiceError('Script name is required.')
  // Validation and the safety review are informational at save time: any script may be saved. Only content that
  // cannot be stored as text is rejected. Blocked scripts and syntax/language errors are enforced at run time
  // (preflight), so saving never makes an unsafe script runnable.
  const hard = analysis.errors.filter(e => /empty|larger than|binary \(NUL\)/.test(e))
  if (hard.length) throw new ServiceError(`The script cannot be saved: ${hard.join(' ')}`, 422, analysis)
  if (analysis.requiresJustification && (input.justification ?? '').trim().length < 10) {
    throw new ServiceError(`A ${analysis.risk}-risk script needs a business justification (at least 10 characters).`, 422)
  }
  const timeout = input.timeoutSec ?? 300
  if (!Number.isInteger(timeout) || timeout < 10 || timeout > 3600) throw new ServiceError('Execution timeout must be between 10 and 3600 seconds.')
}

function buildVersion(version: number, input: ScriptInput, analysis: ScriptAnalysis, rollback: ScriptAnalysis | undefined, actor: string): ScriptVersion {
  const approvalStatus = initialVersionApproval(analysis.risk)
  return {
    version, content: input.content, contentHash: sha256(input.content), risk: analysis.risk,
    findings: analysis.findings, requiresAdmin: analysis.requiresAdmin,
    ...(input.justification?.trim() ? { justification: input.justification.trim() } : {}),
    ...(rollback ? { rollbackContent: input.rollbackContent!, rollbackRisk: rollback.risk } : {}),
    approvalStatus,
    ...(approvalStatus === 'approved' ? { approvedBy: 'system (low risk)', approvedAt: nowIso() } : {}),
    createdBy: actor, createdAt: nowIso(), source: input.source ?? 'manual',
  }
}

export function createScript(input: ScriptInput, actor: AuthedActor): RemoteScript {
  const { analysis, rollback } = validateScriptInput(input)
  checkCreatable(input, analysis)
  const at = nowIso()
  const script: RemoteScript = {
    id: randomUUID(), name: input.name.trim().slice(0, 120), description: (input.description ?? analysis.description).slice(0, 1000),
    language: analysis.language, platform: analysis.platform, owner: (input.owner ?? actor.email).trim(), tags: [...new Set((input.tags ?? []).map(t => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20),
    timeoutSec: input.timeoutSec ?? 300, runAs: input.runAs ?? 'system', version: 1,
    versions: [buildVersion(1, input, analysis, rollback, actor.email)],
    archived: false, usageCount: 0, createdBy: actor.email, createdAt: at, updatedAt: at,
  }
  store.saveScript(script)
  store.audit({ actor: actor.email, action: 'script.created', resourceType: 'script', resourceId: script.id, detail: { name: script.name, version: 1, risk: analysis.risk, hash: script.versions[0]!.contentHash } })
  return script
}

export function updateScript(id: string, input: ScriptInput, actor: AuthedActor): RemoteScript {
  const script = store.getScript(id)
  if (!script) throw new ServiceError('Script not found.', 404)
  if (script.archived) throw new ServiceError('Archived scripts cannot be edited. Restore it first.', 409)
  const { analysis, rollback } = validateScriptInput(input.language || script.language === 'unknown' ? input : { ...input, language: script.language })
  checkCreatable(input, analysis)
  if (analysis.language !== script.language) throw new ServiceError('A script cannot change language. Create a new script instead.', 422)
  const current = script.versions[script.versions.length - 1]!
  const contentChanged = sha256(input.content) !== current.contentHash || (input.rollbackContent ?? '') !== (current.rollbackContent ?? '')
  Object.assign(script, {
    name: input.name.trim().slice(0, 120), description: (input.description ?? script.description).slice(0, 1000),
    platform: analysis.platform, owner: (input.owner ?? script.owner).trim(),
    tags: [...new Set((input.tags ?? script.tags).map(t => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20),
    timeoutSec: input.timeoutSec ?? script.timeoutSec, runAs: input.runAs ?? script.runAs, updatedAt: nowIso(),
  })
  // Approved versions are immutable: any change to the code creates a new version that must be approved again.
  if (contentChanged) {
    script.version += 1
    script.versions.push(buildVersion(script.version, input, analysis, rollback, actor.email))
  }
  store.saveScript(script)
  store.audit({ actor: actor.email, action: contentChanged ? 'script.version_created' : 'script.edited', resourceType: 'script', resourceId: id, detail: { version: script.version, risk: analysis.risk } })
  return script
}

export function decideScriptVersion(id: string, version: number, decision: 'approve' | 'reject', note: string | undefined, actor: AuthedActor): RemoteScript {
  const script = store.getScript(id)
  const v = script?.versions.find(x => x.version === version)
  if (!script || !v) throw new ServiceError('Script version not found.', 404)
  if (v.approvalStatus === 'blocked') throw new ServiceError('A blocked script cannot be approved.', 409)
  if (v.approvalStatus !== 'pending_approval') throw new ServiceError(`This version is already ${v.approvalStatus.replace('_', ' ')}.`, 409)
  assertCanApprove(v.createdBy, actor, can(actor, 'remoteActions.approve'))
  v.approvalStatus = decision === 'approve' ? 'approved' : 'rejected'
  v.approvedBy = actor.email; v.approvedAt = nowIso()
  if (note?.trim()) v.approvalNote = note.trim().slice(0, 500)
  script.updatedAt = nowIso()
  store.saveScript(script)
  store.audit({ actor: actor.email, action: `script.${decision}d`, resourceType: 'script', resourceId: id, detail: { version, note: v.approvalNote } })
  return script
}

export function archiveScript(id: string, archived: boolean, actor: AuthedActor): RemoteScript {
  const script = store.getScript(id)
  if (!script) throw new ServiceError('Script not found.', 404)
  script.archived = archived; script.updatedAt = nowIso()
  store.saveScript(script)
  store.audit({ actor: actor.email, action: archived ? 'script.archived' : 'script.restored', resourceType: 'script', resourceId: id })
  return script
}

// ── Targeting ──────────────────────────────────────────────────────────────────

const toTarget = (d: Device): TargetDevice | null => (d.platform === 'Windows' || d.platform === 'macOS') ? {
  id: d.id, name: d.deviceName, platform: d.platform, source: d.managementSource,
  ...(d.serialNumber && d.serialNumber !== 'Unknown' ? { serialNumber: d.serialNumber } : {}),
  ...(d.lastCheckIn ? { lastCheckIn: d.lastCheckIn } : {}),
  ...(d.azureAdDeviceId ? { azureAdDeviceId: d.azureAdDeviceId } : {}),
} : null

export function matchesFilter(d: Device, f: DeviceFilter, now = Date.now()): boolean {
  if (f.platform && d.platform !== f.platform) return false
  if (f.source && d.managementSource !== f.source) return false
  if (f.nameContains && !d.deviceName.toLowerCase().includes(f.nameContains.toLowerCase())) return false
  if (f.serialNumber && d.serialNumber?.toLowerCase() !== f.serialNumber.toLowerCase()) return false
  if (f.complianceState && d.complianceState !== f.complianceState) return false
  if (f.department && (d.department ?? '').toLowerCase() !== f.department.toLowerCase()) return false
  if (f.owner && !(d.user ?? '').toLowerCase().includes(f.owner.toLowerCase())) return false
  if (f.osVersionContains && !(d.osVersion ?? '').toLowerCase().includes(f.osVersionContains.toLowerCase())) return false
  if (f.checkedInWithinHours !== undefined) {
    const t = Date.parse(d.lastCheckIn)
    if (!Number.isFinite(t) || now - t > f.checkedInWithinHours * 3_600_000) return false
  }
  return true
}

export async function resolveTargets(spec: TargetSpec): Promise<{ devices: TargetDevice[]; missingIds: string[] }> {
  const inventory = await deviceSource()
  const byId = new Map(inventory.map(d => [d.id, d]))
  const picked = new Map<string, Device>()
  const missingIds: string[] = []
  for (const id of spec.deviceIds ?? []) { const d = byId.get(id); if (d) picked.set(d.id, d); else missingIds.push(id) }
  if (spec.filter) for (const d of inventory) if (matchesFilter(d, spec.filter)) picked.set(d.id, d)
  const devices: TargetDevice[] = []
  for (const d of picked.values()) { const t = toTarget(d); if (t) devices.push(t); else missingIds.push(d.id) }
  return { devices, missingIds }
}

export interface PreflightRequest { scriptId: string; version?: number; target: TargetSpec; provider: ProviderId; mode: RemoteJob['mode']; runAs?: RunAs }

export async function preflight(req: PreflightRequest): Promise<{ result: PreflightResult; script: RemoteScript; version: ScriptVersion }> {
  const script = store.getScript(req.scriptId)
  if (!script) throw new ServiceError('Script not found.', 404)
  const version = script.versions.find(v => v.version === (req.version ?? script.version))
  if (!version) throw new ServiceError('Script version not found.', 404)
  const provider = getProvider(req.provider)
  if (!provider) throw new ServiceError('Unknown execution provider.', 400)
  const { devices, missingIds } = await resolveTargets(req.target)
  const result = runPreflight({
    script, devices, missingIds, provider: await provider.capabilities(), policy: store.getPolicy(), mode: req.mode, requestedRunAs: req.runAs ?? script.runAs,
  })
  if (script.archived) result.blockers.unshift('This script is archived.')
  if (version.risk === 'blocked') result.blockers.unshift('This script is blocked by the safety review and cannot be run.')
  const recheck = analyzeScript({ content: version.content, declaredLanguage: script.language })
  if (recheck.errors.length) result.blockers.unshift(`The script has validation errors and cannot be run: ${recheck.errors.join(' ')}`)
  return { result, script, version }
}

// ── Jobs ───────────────────────────────────────────────────────────────────────

export interface CreateJobInput extends PreflightRequest {
  justification?: string
  scheduledFor?: string
  /** Must equal the number of eligible devices when more than one device is targeted: the explicit "I confirm N devices" step. */
  confirmDeviceCount?: number
  retryOf?: string
}

const DUPLICATE_WINDOW_MS = 10 * 60_000

export async function createJob(input: CreateJobInput, actor: AuthedActor): Promise<{ job: RemoteJob; duplicate: boolean }> {
  if (!can(actor, 'remoteActions.execute')) throw new ServiceError('You do not have permission to run scripts.', 403)
  const policy = store.getPolicy()
  if (policy.executionPaused) throw new ServiceError('Remote execution is paused by an administrator.', 423)

  const { result, script, version } = await preflight(input)
  if (result.blockers.length) throw new ServiceError(result.blockers.join(' '), 422, result)
  if (result.eligible.length === 0) throw new ServiceError('No eligible devices remain after pre-flight checks.', 422, result)

  const req = approvalRequirement(version.risk as RiskLevel, result.eligible.length, policy)
  if (!req.allowed) throw new ServiceError('Blocked scripts cannot be run.', 422)
  if (req.versionApproval && version.approvalStatus !== 'approved') {
    throw new ServiceError(`This ${version.risk}-risk script version is ${version.approvalStatus.replace('_', ' ')}. An approver must approve it before it can run.`, 409)
  }
  if ((version.risk === 'medium' || version.risk === 'high') && (input.justification ?? '').trim().length < 10) {
    throw new ServiceError(`A ${version.risk}-risk job needs a business justification (at least 10 characters).`, 422)
  }
  if (result.eligible.length > 1 && input.confirmDeviceCount !== result.eligible.length) {
    throw new ServiceError(`Confirm the number of devices (${result.eligible.length}) to run on more than one device.`, 422, { eligible: result.eligible.length })
  }
  let scheduledFor: string | undefined
  if (input.mode === 'scheduled') {
    const t = Date.parse(input.scheduledFor ?? '')
    if (!Number.isFinite(t) || t < Date.now() + 30_000) throw new ServiceError('Choose a schedule time at least a minute in the future.')
    if (t > Date.now() + 90 * 86_400_000) throw new ServiceError('Jobs can be scheduled at most 90 days ahead.')
    scheduledFor = new Date(t).toISOString()
  }

  const fingerprint = idempotencyFingerprint({ actor: actor.email, scriptId: script.id, version: version.version, deviceIds: result.eligible.map(d => d.id), mode: input.mode, ...(scheduledFor ? { scheduledFor } : {}) }) + (input.retryOf ? `|retry:${input.retryOf}` : '')
  const dup = store.listJobs().find(j => j.idempotencyKey === fingerprint && Date.now() - Date.parse(j.createdAt) < DUPLICATE_WINDOW_MS && j.status !== 'cancelled' && j.status !== 'rejected')
  if (dup) return { job: dup, duplicate: true }

  const jobs = store.listJobs()
  const hourAgo = Date.now() - 3_600_000
  if (jobs.filter(j => j.requestedBy.toLowerCase() === actor.email.toLowerCase() && Date.parse(j.createdAt) > hourAgo).length >= policy.maxJobsPerUserPerHour) {
    throw new ServiceError(`Job limit reached: at most ${policy.maxJobsPerUserPerHour} jobs per user per hour.`, 429)
  }
  if (jobs.filter(j => ['queued', 'running'].includes(j.status)).length >= policy.maxConcurrentJobs) {
    throw new ServiceError(`Too many jobs are running (limit ${policy.maxConcurrentJobs}). Try again when one finishes.`, 429)
  }

  const at = nowIso()
  const job: RemoteJob = {
    id: randomUUID(), idempotencyKey: fingerprint, scriptId: script.id, scriptName: script.name, scriptVersion: version.version, contentHash: version.contentHash,
    language: script.language as 'powershell' | 'shell', risk: version.risk, provider: input.provider, runAs: input.runAs ?? script.runAs, timeoutSec: script.timeoutSec,
    mode: input.mode, ...(scheduledFor ? { scheduledFor } : {}), justification: (input.justification ?? '').trim(),
    status: 'draft', requestedBy: actor.email, approvalRequired: req.jobApproval, createdAt: at, updatedAt: at,
    targetSpec: input.target,
    devices: result.eligible.map((d): DeviceExecution => ({ deviceId: d.id, deviceName: d.name, platform: d.platform, state: 'queued', attempts: 0, updatedAt: at })),
    excluded: result.excluded, ...(input.retryOf ? { retryOf: input.retryOf } : {}),
    events: [{ at, actor: actor.email, action: 'created', detail: `${result.eligible.length} devices via ${input.provider}` }],
  }
  transitionJob(job, req.jobApproval ? 'pending_approval' : 'approved', actor.email, req.jobApproval ? 'Approver sign-off required' : 'No job approval required')
  store.saveJob(job)
  store.audit({ actor: actor.email, action: 'job.created', resourceType: 'job', resourceId: job.id, provider: job.provider,
    detail: { script: script.name, version: version.version, hash: version.contentHash, risk: version.risk, mode: input.mode, devices: job.devices.map(d => d.deviceName), excluded: result.excluded.length, justification: job.justification, approvalRequired: req.jobApproval } })
  return { job, duplicate: false }
}

export function decideJob(id: string, decision: 'approve' | 'reject', note: string | undefined, actor: AuthedActor): RemoteJob {
  const job = store.getJob(id)
  if (!job) throw new ServiceError('Job not found.', 404)
  if (job.status !== 'pending_approval') throw new ServiceError(`This job is ${job.status.replace(/_/g, ' ')}, not awaiting approval.`, 409)
  assertCanApprove(job.requestedBy, actor, can(actor, 'remoteActions.approve'))
  job.approver = actor.email
  if (note?.trim()) job.approvalNote = note.trim().slice(0, 500)
  transitionJob(job, decision === 'approve' ? 'approved' : 'rejected', actor.email, note)
  store.saveJob(job)
  store.audit({ actor: actor.email, action: `job.${decision}d`, resourceType: 'job', resourceId: id, provider: job.provider, detail: { note: job.approvalNote } })
  return job
}

const scriptContent = (job: RemoteJob): { script: RemoteScript; version: ScriptVersion } => {
  const script = store.getScript(job.scriptId)
  const version = script?.versions.find(v => v.version === job.scriptVersion)
  if (!script || !version) throw new ServiceError('The script version for this job no longer exists.', 410)
  // Integrity: what runs must be byte-identical to what was reviewed and approved.
  if (sha256(version.content) !== job.contentHash) throw new ServiceError('The script content no longer matches the approved version. The job was not sent.', 409)
  return { script, version }
}

/** Sends an approved/scheduled job to its provider. Safe to call repeatedly: only approved/scheduled jobs are dispatched. */
export async function dispatchJob(id: string, actor = 'system'): Promise<RemoteJob> {
  const job = store.getJob(id)
  if (!job) throw new ServiceError('Job not found.', 404)
  if (job.status !== 'approved' && job.status !== 'scheduled') return job
  if (job.mode === 'scheduled' && job.status === 'approved') {
    transitionJob(job, 'scheduled', actor, `Scheduled for ${job.scheduledFor}`)
    store.saveJob(job)
  }
  if (job.mode === 'scheduled' && Date.parse(job.scheduledFor ?? '') > Date.now()) return job
  const policy = store.getPolicy()
  if (policy.executionPaused) { job.events.push({ at: nowIso(), actor, action: 'held', detail: 'Execution is paused (emergency stop).' }); store.saveJob(job); return job }

  const provider = getProvider(job.provider)
  try {
    if (!provider) throw new Error('Unknown execution provider.')
    const caps = await provider.capabilities()
    if (!caps.enabled) throw new Error(`Provider "${caps.label}" is not available: ${caps.reasons.join('; ')}`)
    const { script, version } = scriptContent(job)
    transitionJob(job, 'queued', actor)
    const { devices } = await resolveTargets({ deviceIds: job.devices.map(d => d.deviceId) })
    const outcome = await provider.dispatch({ job, script: { name: script.name, language: job.language as 'powershell' | 'shell', content: version.content }, version, devices })
    job.providerContext = outcome.providerContext
    for (const o of outcome.devices) {
      const d = job.devices.find(x => x.deviceId === o.deviceId)
      if (!d) continue
      d.attempts += 1
      if (o.accepted) advanceDevice(d, o.state ?? 'sent', { ...(o.providerRef ? { providerRef: o.providerRef } : {}) })
      else advanceDevice(d, 'failed', { error: sanitizeLog(o.error ?? 'Provider rejected the device') })
    }
    // Any device the provider did not mention was not sent: say so rather than leaving it "queued" forever.
    for (const d of job.devices) if (d.state === 'queued') advanceDevice(d, 'failed', { error: 'The provider did not accept this device.' })
    transitionJob(job, 'running', actor, `Dispatched to ${caps.label}`)
    script.usageCount += 1
    script.lastResult = { jobId: job.id, status: 'running', at: nowIso() }
    store.saveScript(script)
    store.audit({ actor, action: 'job.dispatched', resourceType: 'job', resourceId: job.id, provider: job.provider, detail: { accepted: outcome.devices.filter(o => o.accepted).length, rejected: outcome.devices.filter(o => !o.accepted).length } })
    settleIfDone(job)
  } catch (e) {
    const msg = sanitizeLog(e instanceof Error ? e.message : 'Dispatch failed', 500)
    for (const d of job.devices) advanceDevice(d, 'failed', { error: msg })
    if (job.status === 'approved' || job.status === 'scheduled') transitionJob(job, 'queued', actor)
    transitionJob(job, 'failed', actor, msg)
    store.audit({ actor, action: 'job.dispatch_failed', resourceType: 'job', resourceId: job.id, provider: job.provider, detail: { error: msg } })
  }
  store.saveJob(job)
  return job
}

function settleIfDone(job: RemoteJob): void {
  const next = settledStatus(job.devices)
  if (!next || isTerminalJob(job.status)) return
  if (job.status === 'queued') transitionJob(job, 'running', 'system')
  transitionJob(job, next, 'system', `${countDevices(job.devices).succeeded}/${job.devices.length} succeeded`)
  const script = store.getScript(job.scriptId)
  if (script) { script.lastResult = { jobId: job.id, status: job.status, at: nowIso() }; store.saveScript(script) }
  store.audit({ actor: 'system', action: 'job.finished', resourceType: 'job', resourceId: job.id, provider: job.provider, detail: { status: job.status, counts: countDevices(job.devices) } })
  void getProvider(job.provider)?.cleanup?.(job).catch(() => undefined)
}

const WAIT_CEILING_MS = 24 * 3_600_000
const WHEN_ONLINE_CEILING_MS = 7 * 86_400_000

/** Pulls the provider's reported state for a running job and applies it. Never invents progress. */
export async function pollJob(id: string, now = Date.now()): Promise<RemoteJob> {
  const job = store.getJob(id)
  if (!job) throw new ServiceError('Job not found.', 404)
  if (job.status !== 'running') return job
  const provider = getProvider(job.provider)
  if (!provider) return job
  const caps = await provider.capabilities()
  try {
    const updates = await provider.poll(job)
    for (const u of updates) {
      const d = job.devices.find(x => x.deviceId === u.deviceId)
      if (!d) continue
      const output = u.output !== undefined ? sanitizeLog(u.output) : undefined
      // Progress is parsed ONLY from output the provider actually returned.
      const progress = caps.supports.scriptOutput ? parseProgress(output) : undefined
      advanceDevice(d, u.state, {
        ...(u.providerState ? { providerState: u.providerState } : {}),
        ...(output !== undefined ? { output } : {}),
        ...(u.error ? { error: sanitizeLog(u.error, 4000) } : {}),
        ...(u.exitCode !== undefined ? { exitCode: u.exitCode } : {}),
        ...(progress ? { progress } : {}),
      }, new Date(now))
    }
  } catch (e) {
    job.events.push({ at: new Date(now).toISOString(), actor: 'system', action: 'poll_error', detail: sanitizeLog(e instanceof Error ? e.message : 'poll failed', 300) })
  }
  const ceiling = job.mode === 'when_online' ? WHEN_ONLINE_CEILING_MS : WAIT_CEILING_MS
  for (const d of job.devices) {
    if (TERMINAL_DEVICE_STATES.includes(d.state)) continue
    const runningTooLong = d.state === 'running' && d.startedAt && now - Date.parse(d.startedAt) > job.timeoutSec * 2000
    const waitingTooLong = d.state !== 'running' && job.startedAt && now - Date.parse(job.startedAt) > ceiling
    if (runningTooLong || waitingTooLong) advanceDevice(d, 'timed_out', { error: runningTooLong ? `No result within ${job.timeoutSec * 2}s of starting.` : 'The device did not report a result within the allowed window.' }, new Date(now))
  }
  settleIfDone(job)
  store.saveJob(job)
  return job
}

export async function cancelJob(id: string, actor: AuthedActor): Promise<RemoteJob> {
  const job = store.getJob(id)
  if (!job) throw new ServiceError('Job not found.', 404)
  if (!can(actor, 'remoteActions.execute') && !can(actor, 'remoteActions.admin')) throw new ServiceError('You do not have permission to cancel jobs.', 403)
  if (job.requestedBy.toLowerCase() !== actor.email.toLowerCase() && !can(actor, 'remoteActions.admin') && !can(actor, 'remoteActions.approve')) throw new ServiceError('Only the requester, an approver or an administrator can cancel this job.', 403)
  if (isTerminalJob(job.status)) throw new ServiceError(`The job is already ${job.status.replace(/_/g, ' ')}.`, 409)

  if (job.status === 'queued' || job.status === 'running') {
    const provider = getProvider(job.provider)
    if (!(await provider?.capabilities())?.supports.cancel || !provider?.cancel) throw new ServiceError(`${provider ? (await provider.capabilities()).label : 'The provider'} cannot cancel a job that has already been sent.`, 409)
    await provider.cancel(job)
    // Only devices that have not started executing can be stopped.
    for (const d of job.devices) if (['queued', 'waiting_online', 'sent', 'provider_accepted'].includes(d.state)) advanceDevice(d, 'cancelled')
    job.events.push({ at: nowIso(), actor: actor.email, action: 'cancel_requested', detail: 'Devices already running the script cannot be stopped.' })
    if (job.devices.every(d => TERMINAL_DEVICE_STATES.includes(d.state))) settleIfDone(job)
  } else {
    transitionJob(job, 'cancelled', actor.email)
    for (const d of job.devices) advanceDevice(d, 'cancelled')
  }
  store.saveJob(job)
  store.audit({ actor: actor.email, action: 'job.cancelled', resourceType: 'job', resourceId: id, provider: job.provider })
  return job
}

export async function retryFailed(id: string, actor: AuthedActor, confirmDeviceCount?: number): Promise<{ job: RemoteJob; duplicate: boolean }> {
  const original = store.getJob(id)
  if (!original) throw new ServiceError('Job not found.', 404)
  if (!isTerminalJob(original.status)) throw new ServiceError('Retry is available once the job has finished.', 409)
  const failed = original.devices.filter(d => d.state === 'failed' || d.state === 'timed_out')
  if (failed.length === 0) throw new ServiceError('There are no failed devices to retry.', 409)
  return createJob({
    scriptId: original.scriptId, version: original.scriptVersion, provider: original.provider, mode: original.mode === 'scheduled' ? 'now' : original.mode, runAs: original.runAs,
    target: { deviceIds: failed.map(d => d.deviceId) }, justification: original.justification || 'Retry of failed devices', retryOf: original.id,
    ...(confirmDeviceCount !== undefined ? { confirmDeviceCount } : {}),
  }, actor)
}

/** Scheduler tick: dispatch due jobs and refresh running ones. Called on an interval from index.ts. */
export async function tick(): Promise<void> {
  for (const job of [...store.listJobs()]) {
    try {
      if (job.status === 'scheduled' || (job.status === 'approved' && job.mode === 'scheduled')) { if (Date.parse(job.scheduledFor ?? '') <= Date.now()) await dispatchJob(job.id) }
      else if (job.status === 'running') await pollJob(job.id)
    } catch (e) { console.error('[remoteActions] tick failed for job', job.id, e instanceof Error ? e.message : e) }
  }
}

let timer: NodeJS.Timeout | null = null
export function startRemoteActionsScheduler(everyMs = 30_000): void {
  if (timer || process.env['NODE_ENV'] === 'test') return
  timer = setInterval(() => { void tick() }, everyMs)
  timer.unref()
}
export function stopRemoteActionsScheduler(): void { if (timer) { clearInterval(timer); timer = null } }

// ── Views (never include script bodies in list responses) ──────────────────────

export function scriptSummary(s: RemoteScript): Record<string, unknown> {
  const latest = s.versions[s.versions.length - 1]!
  return {
    id: s.id, name: s.name, description: s.description, language: s.language, platform: s.platform, owner: s.owner, tags: s.tags,
    timeoutSec: s.timeoutSec, runAs: s.runAs, version: s.version, archived: s.archived, usageCount: s.usageCount, lastResult: s.lastResult ?? null,
    risk: latest.risk, approvalStatus: latest.approvalStatus, approvedBy: latest.approvedBy ?? null, requiresAdmin: latest.requiresAdmin,
    hasRollback: Boolean(latest.rollbackContent), createdBy: s.createdBy, createdAt: s.createdAt, updatedAt: s.updatedAt,
  }
}

export function jobView(j: RemoteJob): Record<string, unknown> {
  const { idempotencyKey: _k, providerContext: _p, ...rest } = j
  void _k; void _p
  return { ...rest, counts: countDevices(j.devices), redactedJustification: redactSecrets(j.justification) }
}
