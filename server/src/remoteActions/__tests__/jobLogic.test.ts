import { describe, it, expect } from 'vitest'
import {
  advanceDevice, approvalRequirement, assertCanApprove, canAdvanceDevice, canTransition, countDevices, DEFAULT_POLICY, idempotencyFingerprint,
  InvalidTransitionError, parseProgress, runPreflight, settledStatus, transitionJob,
} from '../jobLogic.js'
import type { DeviceExecution, ProviderCapabilities, RemoteJob, TargetDevice } from '../types.js'

const dev = (state: DeviceExecution['state'] = 'queued'): DeviceExecution => ({ deviceId: 'd', deviceName: 'D', platform: 'Windows', state, attempts: 0, updatedAt: '' })
const job = (status: RemoteJob['status']): RemoteJob => ({ status, events: [], updatedAt: '' } as unknown as RemoteJob)

describe('job state transitions', () => {
  it('allows the intended path and rejects shortcuts', () => {
    expect(canTransition('draft', 'pending_approval')).toBe(true)
    expect(canTransition('pending_approval', 'approved')).toBe(true)
    expect(canTransition('approved', 'queued')).toBe(true)
    expect(canTransition('queued', 'running')).toBe(true)
    expect(canTransition('running', 'completed')).toBe(true)
    expect(canTransition('pending_approval', 'running')).toBe(false)  // cannot skip approval
    expect(canTransition('draft', 'running')).toBe(false)
    expect(canTransition('rejected', 'approved')).toBe(false)
    expect(canTransition('completed', 'running')).toBe(false)         // terminal
    expect(canTransition('cancelled', 'queued')).toBe(false)
  })
  it('throws on an invalid move and stamps events/timestamps on a valid one', () => {
    expect(() => transitionJob(job('pending_approval'), 'running', 'a')).toThrow(InvalidTransitionError)
    const j = transitionJob(job('queued'), 'running', 'a', 'go')
    expect(j.status).toBe('running'); expect(j.startedAt).toBeTruthy(); expect(j.events[0]).toMatchObject({ actor: 'a', action: 'status:running', detail: 'go' })
    expect(transitionJob(job('running'), 'completed', 'a').finishedAt).toBeTruthy()
  })
})

describe('device state transitions', () => {
  it('only moves forward and terminal states are final', () => {
    expect(canAdvanceDevice('queued', 'sent')).toBe(true)
    expect(canAdvanceDevice('sent', 'provider_accepted')).toBe(true)
    expect(canAdvanceDevice('running', 'sent')).toBe(false)
    expect(canAdvanceDevice('waiting_online', 'sent')).toBe(true)
    expect(canAdvanceDevice('running', 'succeeded')).toBe(true)
    expect(canAdvanceDevice('succeeded', 'failed')).toBe(false)
    expect(canAdvanceDevice('failed', 'running')).toBe(false)
    const d = dev('succeeded'); expect(advanceDevice(d, 'running')).toBe(false); expect(d.state).toBe('succeeded')
  })
  it('aggregates counts and settles only when every device is terminal', () => {
    const ds = [dev('succeeded'), dev('failed'), dev('waiting_online'), dev('running'), dev('skipped')]
    expect(countDevices(ds)).toMatchObject({ total: 5, succeeded: 1, failed: 1, waitingOnline: 1, running: 1, skipped: 1 })
    expect(settledStatus(ds)).toBeNull()
    expect(settledStatus([dev('succeeded'), dev('succeeded')])).toBe('completed')
    expect(settledStatus([dev('succeeded'), dev('timed_out')])).toBe('completed_with_failures')
    expect(settledStatus([dev('failed'), dev('timed_out')])).toBe('failed')
    expect(settledStatus([dev('cancelled'), dev('cancelled')])).toBe('cancelled')
  })
})

describe('progress markers', () => {
  it('parses the last valid marker and ignores malformed/out-of-range ones', () => {
    expect(parseProgress('x\n__ITO_PROGRESS__:25|Downloading required files\n__ITO_PROGRESS__:60|Installing')).toEqual({ percent: 60, message: 'Installing' })
    expect(parseProgress('__ITO_PROGRESS__:140|bad\n__ITO_PROGRESS__:abc|bad')).toBeUndefined()
    expect(parseProgress(undefined)).toBeUndefined()
    expect(parseProgress('no markers here')).toBeUndefined()
  })
})

describe('approval policy and permission checks', () => {
  const p = DEFAULT_POLICY
  it('maps risk to approval requirements', () => {
    expect(approvalRequirement('low', 100, p)).toEqual({ versionApproval: false, jobApproval: false, allowed: true })
    expect(approvalRequirement('medium', 5, p)).toEqual({ versionApproval: true, jobApproval: false, allowed: true })
    expect(approvalRequirement('medium', 50, p).jobApproval).toBe(true)
    expect(approvalRequirement('high', 1, p)).toEqual({ versionApproval: true, jobApproval: true, allowed: true })
    expect(approvalRequirement('blocked', 1, p).allowed).toBe(false)
  })
  it('enforces the Approver permission and separation of duties', () => {
    expect(() => assertCanApprove('a@x.com', { email: 'b@x.com', role: 'IT Admin' }, false)).toThrow(/Approver permission/)
    expect(() => assertCanApprove('a@x.com', { email: 'A@x.com', role: 'Global Admin' }, true)).toThrow(/own request/)
    expect(() => assertCanApprove('a@x.com', { email: 'b@x.com', role: 'IT Admin' }, true)).not.toThrow()
  })
  it('builds a stable idempotency fingerprint independent of device order', () => {
    const a = idempotencyFingerprint({ actor: 'A@x.com', scriptId: 's', version: 1, deviceIds: ['2', '1'], mode: 'now' })
    expect(a).toBe(idempotencyFingerprint({ actor: 'a@x.com', scriptId: 's', version: 1, deviceIds: ['1', '2'], mode: 'now' }))
    expect(a).not.toBe(idempotencyFingerprint({ actor: 'a@x.com', scriptId: 's', version: 2, deviceIds: ['1', '2'], mode: 'now' }))
  })
})

describe('target validation / pre-flight', () => {
  const caps = (over: Partial<ProviderCapabilities> = {}, sup: Partial<ProviderCapabilities['supports']> = {}): ProviderCapabilities => ({
    id: 'intune', label: 'Intune', enabled: true, reasons: [], notes: [],
    supports: { powershell: true, shell: true, runAsSystem: true, runAsUser: true, perDeviceStatus: true, scriptOutput: true, liveStreaming: false, cancel: true, runWhenOnline: true, scheduling: true, ...sup }, ...over,
  })
  const now = Date.parse('2026-11-24T12:00:00Z')
  const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString()
  const d = (over: Partial<TargetDevice>): TargetDevice => ({ id: 'x', name: 'X', platform: 'Windows', source: 'Microsoft Intune', lastCheckIn: hoursAgo(1), azureAdDeviceId: 'aad', ...over })
  const run = (devices: TargetDevice[], over: Partial<Parameters<typeof runPreflight>[0]> = {}) =>
    runPreflight({ script: { language: 'powershell', platform: 'Windows', runAs: 'system' }, devices, provider: caps(), policy: DEFAULT_POLICY, mode: 'now', requestedRunAs: 'system', now, ...over })

  it('accepts a healthy compatible device', () => {
    const r = run([d({ id: '1' })]); expect(r.eligible).toHaveLength(1); expect(r.excluded).toHaveLength(0); expect(r.blockers).toEqual([])
  })
  it('excludes with reasons: wrong OS, stale/unknown check-in, wrong source, no Entra id, missing', () => {
    const r = run([d({ id: 'mac', platform: 'macOS' }), d({ id: 'stale', lastCheckIn: hoursAgo(200) }), d({ id: 'unk', lastCheckIn: 'Unknown' }), d({ id: 'ec', source: 'ManageEngine' }), d({ id: 'noaad' } as Partial<TargetDevice>)].map((x, i) => i === 4 ? { ...x, azureAdDeviceId: undefined as never } : x), { missingIds: ['ghost'] })
    const why = Object.fromEntries(r.excluded.map(e => [e.device.id, e.reasons.join(' ')]))
    expect(why['mac']).toMatch(/targets Windows/); expect(why['stale']).toMatch(/check-in 200h/); expect(why['unk']).toMatch(/No check-in time/)
    expect(why['ec']).toMatch(/Endpoint Central, not Intune/); expect(why['noaad']).toMatch(/Entra device id/); expect(why['ghost']).toMatch(/Not found/)
    expect(r.eligible).toHaveLength(0)
  })
  it('lets a stale device through only for run-when-online', () => {
    expect(run([d({ id: 'stale', lastCheckIn: hoursAgo(200) })], { mode: 'when_online' }).eligible).toHaveLength(1)
  })
  it('blocks the job when the provider is down, lacks a capability, is paused, or too many devices', () => {
    expect(run([d({})], { provider: caps({ enabled: false, reasons: ['missing perm'] }) }).blockers.join()).toMatch(/not available: missing perm/)
    expect(run([d({})], { provider: caps({}, { runAsUser: false }), requestedRunAs: 'user' }).blockers.join()).toMatch(/logged-in user/)
    expect(run([d({})], { policy: { ...DEFAULT_POLICY, executionPaused: true } }).blockers.join()).toMatch(/emergency stop/)
    expect(run([d({ id: '1' }), d({ id: '2' })], { policy: { ...DEFAULT_POLICY, maxDevicesPerJob: 1 } }).blockers.join()).toMatch(/at most 1/)
    expect(run([d({ id: '1' }), d({ id: '2' })], { mode: 'pilot', policy: { ...DEFAULT_POLICY, pilotMaxDevices: 1 } }).blockers.join()).toMatch(/pilot/)
    expect(run([]).blockers.join()).toMatch(/No target devices/)
  })
  it('warns honestly when the provider returns no script output', () => {
    expect(run([d({})], { provider: caps({}, { scriptOutput: false }) }).warnings.join()).toMatch(/device state only/)
  })
})
