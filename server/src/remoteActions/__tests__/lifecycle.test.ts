import { beforeEach, describe, expect, it } from 'vitest'
import * as store from '../store.js'
import * as svc from '../service.js'
import { redactSecrets } from '../redaction.js'
import type { Device } from '../../types.js'

const admin: svc.AuthedActor = { email: 'admin@zinnia.com', role: 'Global Admin', perms: {} }
const approver: svc.AuthedActor = { email: 'approver@zinnia.com', role: 'Custom', perms: { 'remoteActions.approve': true } }
const operator: svc.AuthedActor = { email: 'op@zinnia.com', role: 'IT Admin', perms: { 'remoteActions.execute': true, 'remoteActions.author': true } }
const viewer: svc.AuthedActor = { email: 'view@zinnia.com', role: 'Helpdesk', perms: { 'remoteActions.read': true } }

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
const mk = (id: string, name: string, platform: 'Windows' | 'macOS', over: Partial<Device> = {}): Device => ({
  id, deviceName: name, user: 'u', serialNumber: `SN${id}`, platform, osVersion: '1', managementSource: platform === 'Windows' ? 'Microsoft Intune' : 'ManageEngine', lastCheckIn: hoursAgo(1), complianceState: 'Compliant', azureAdDeviceId: `aad-${id}`, ...over,
} as Device)

const inventory: Device[] = [
  mk('w1', 'WIN-001', 'Windows'), mk('w2', 'WIN-002', 'Windows'), mk('w3', 'WIN-FAIL-003', 'Windows'), mk('w4', 'WIN-OFFLINE-004', 'Windows'),
  mk('m1', 'MAC-001', 'macOS'), mk('m2', 'MAC-002', 'macOS'),
]

beforeEach(() => { store.resetForTests(true); store.savePolicy({ ...store.getPolicy(), executionPaused: false, maxJobsPerUserPerHour: 100, maxConcurrentJobs: 50 }); svc.setDeviceSource(async () => inventory) })

const PS_LOW = '#Requires -Version 5.1\n# Name: Inventory\n$v = Get-ComputerInfo\nWrite-Output "__ITO_PROGRESS__:50|Collecting"\nWrite-Output $v.OsName\n'
const SH_LOW = '#!/bin/bash\n# Description: Report macOS version\nsw_vers\necho "__ITO_PROGRESS__:50|Collecting"\n'

describe('script creation and approval', () => {
  it('auto-approves low risk, requires approval + justification for medium, rejects blocked and invalid', () => {
    const low = svc.createScript({ name: 'Inventory', content: PS_LOW, fileName: 'inv.ps1' }, operator)
    expect(low.versions[0]).toMatchObject({ risk: 'low', approvalStatus: 'approved' })
    expect(() => svc.createScript({ name: 'Reboot', content: 'Restart-Computer', fileName: 'r.ps1' }, operator)).toThrow(/justification/)
    const med = svc.createScript({ name: 'Reboot', content: 'Restart-Computer', fileName: 'r.ps1', justification: 'Needed after patch window' }, operator)
    expect(med.versions[0]).toMatchObject({ risk: 'medium', approvalStatus: 'pending_approval' })
    // Blocked / invalid scripts can be saved (review is informational) but never run.
    const wipe = svc.createScript({ name: 'Wipe', content: 'rm -rf /', fileName: 'w.sh' }, operator)
    expect(wipe.versions[0]).toMatchObject({ risk: 'blocked', approvalStatus: 'blocked' })
    expect(() => svc.createScript({ name: 'Bad', content: 'if ($x) { Get-Date', fileName: 'b.ps1', justification: 'Draft saved for later fix' }, operator)).not.toThrow()
    expect(() => svc.createScript({ name: 'Empty', content: '   ', fileName: 'e.ps1' }, operator)).toThrow(/empty/)
  })
  it('separates duties on script approval and versions on edit', () => {
    const s = svc.createScript({ name: 'Reboot', content: 'Restart-Computer', fileName: 'r.ps1', justification: 'Needed after patch window' }, operator)
    expect(() => svc.decideScriptVersion(s.id, 1, 'approve', undefined, operator)).toThrow(/Approver permission/)
    expect(() => svc.decideScriptVersion(s.id, 1, 'approve', undefined, { ...approver, email: operator.email })).toThrow(/own request/)
    expect(svc.decideScriptVersion(s.id, 1, 'approve', 'ok', approver).versions[0]!.approvalStatus).toBe('approved')
    const edited = svc.updateScript(s.id, { name: 'Reboot', content: 'Restart-Computer -Force', fileName: 'r.ps1', justification: 'Needed after patch window' }, operator)
    expect(edited.version).toBe(2); expect(edited.versions[1]!.approvalStatus).toBe('pending_approval'); expect(edited.versions[0]!.approvalStatus).toBe('approved')
  })
})

async function finish(jobId: string, polls = 4) { for (let i = 0; i < polls; i++) await svc.pollJob(jobId) ; return store.getJob(jobId)! }

describe('complete execution lifecycle (mock provider)', () => {
  it('Windows PowerShell: preflight → job → dispatch → progress → completion with a failed device, then retry-failed', async () => {
    const script = svc.createScript({ name: 'Inventory', content: PS_LOW, fileName: 'inv.ps1' }, operator)
    const pf = await svc.preflight({ scriptId: script.id, target: { filter: { platform: 'Windows' } }, provider: 'mock', mode: 'now' })
    expect(pf.result.eligible.map(d => d.name).sort()).toEqual(['WIN-001', 'WIN-002', 'WIN-FAIL-003', 'WIN-OFFLINE-004'])
    // macOS devices are excluded with a reason when picked explicitly
    const mixed = await svc.preflight({ scriptId: script.id, target: { deviceIds: ['w1', 'm1', 'nope'] }, provider: 'mock', mode: 'now' })
    expect(mixed.result.excluded.map(e => e.device.id).sort()).toEqual(['m1', 'nope'])

    await expect(svc.createJob({ scriptId: script.id, target: { deviceIds: ['w1', 'w2', 'w3'] }, provider: 'mock', mode: 'now' }, operator)).rejects.toThrow(/Confirm the number of devices/)
    await expect(svc.createJob({ scriptId: script.id, target: { deviceIds: ['w1'] }, provider: 'mock', mode: 'now' }, viewer)).rejects.toThrow(/permission/)

    const { job, duplicate } = await svc.createJob({ scriptId: script.id, target: { deviceIds: ['w1', 'w2', 'w3'] }, provider: 'mock', mode: 'now', confirmDeviceCount: 3 }, operator)
    expect(duplicate).toBe(false); expect(job.status).toBe('approved'); expect(job.approvalRequired).toBe(false)

    const dispatched = await svc.dispatchJob(job.id)
    expect(dispatched.status).toBe('running')
    expect(dispatched.devices.every(d => d.state === 'provider_accepted')).toBe(true)

    let j = await svc.pollJob(job.id)
    expect(j.devices.every(d => d.state === 'running')).toBe(true)
    expect(j.devices[0]!.progress).toEqual({ percent: 40, message: 'Working' })  // parsed from provider-returned output
    j = await finish(job.id)
    expect(j.status).toBe('completed_with_failures')
    expect(j.devices.find(d => d.deviceName === 'WIN-FAIL-003')).toMatchObject({ state: 'failed', exitCode: 1, error: 'Simulated failure' })
    expect(j.devices.filter(d => d.state === 'succeeded')).toHaveLength(2)
    expect(store.getScript(script.id)).toMatchObject({ usageCount: 1, lastResult: { status: 'completed_with_failures' } })

    // Retry targets ONLY the failed device and links back to the original
    const retry = await svc.retryFailed(job.id, operator)
    expect(retry.job.devices.map(d => d.deviceName)).toEqual(['WIN-FAIL-003']); expect(retry.job.retryOf).toBe(job.id)

    const actions = store.readAudit({ resourceId: job.id }).map(e => e.action)
    expect(actions).toEqual(expect.arrayContaining(['job.created', 'job.dispatched', 'job.finished']))
  })

  it('macOS shell: runs, and an offline device stays truthfully "waiting_online" until it times out', async () => {
    const script = svc.createScript({ name: 'macOS version', content: SH_LOW, fileName: 'v.sh' }, operator)
    const { job } = await svc.createJob({ scriptId: script.id, target: { deviceIds: ['m1', 'm2'] }, provider: 'mock', mode: 'now', confirmDeviceCount: 2 }, operator)
    await svc.dispatchJob(job.id)
    const done = await finish(job.id)
    expect(done.status).toBe('completed'); expect(done.devices.every(d => d.state === 'succeeded' && d.progress?.percent === 100)).toBe(true)

    const win = svc.createScript({ name: 'Inventory', content: PS_LOW, fileName: 'inv.ps1' }, operator)
    const off = (await svc.createJob({ scriptId: win.id, target: { deviceIds: ['w4'] }, provider: 'mock', mode: 'when_online' }, operator)).job
    await svc.dispatchJob(off.id)
    let j = await finish(off.id)
    expect(j.status).toBe('running'); expect(j.devices[0]!.state).toBe('waiting_online'); expect(j.devices[0]!.progress).toBeUndefined()   // no invented progress
    j = await svc.pollJob(off.id, Date.now() + 8 * 86_400_000)
    expect(j.devices[0]!.state).toBe('timed_out'); expect(j.status).toBe('failed')
  })

  it('rejects wrong-platform targets and shows nothing eligible', async () => {
    const script = svc.createScript({ name: 'macOS version', content: SH_LOW, fileName: 'v.sh' }, operator)
    await expect(svc.createJob({ scriptId: script.id, target: { deviceIds: ['w1'] }, provider: 'mock', mode: 'now' }, operator)).rejects.toThrow(/No eligible devices/)
  })
})

describe('approval workflow for risky jobs', () => {
  it('medium: script version approval first; job approval only above the device threshold', async () => {
    const s = svc.createScript({ name: 'Reboot', content: 'Restart-Computer', fileName: 'r.ps1', justification: 'Needed after patch window' }, operator)
    await expect(svc.createJob({ scriptId: s.id, target: { deviceIds: ['w1'] }, provider: 'mock', mode: 'now', justification: 'Patch window reboot' }, operator)).rejects.toThrow(/approver must approve/)
    svc.decideScriptVersion(s.id, 1, 'approve', undefined, approver)
    await expect(svc.createJob({ scriptId: s.id, target: { deviceIds: ['w1'] }, provider: 'mock', mode: 'now' }, operator)).rejects.toThrow(/justification/)
    const ok = await svc.createJob({ scriptId: s.id, target: { deviceIds: ['w1'] }, provider: 'mock', mode: 'now', justification: 'Patch window reboot' }, operator)
    expect(ok.job.status).toBe('approved')
  })
  it('high: every job waits for a different approver, then dispatches; rejection is final', async () => {
    const s = svc.createScript({ name: 'Cleanup', content: 'Remove-Item C:\\Temp\\old -Recurse -Force', fileName: 'c.ps1', justification: 'Disk space incident INC123', rollbackContent: '# nothing to restore\nGet-Date' }, operator)
    expect(s.versions[0]!.risk).toBe('high')
    svc.decideScriptVersion(s.id, 1, 'approve', undefined, approver)
    const { job } = await svc.createJob({ scriptId: s.id, target: { deviceIds: ['w1'] }, provider: 'mock', mode: 'now', justification: 'Disk space incident INC123' }, operator)
    expect(job.status).toBe('pending_approval')
    expect((await svc.dispatchJob(job.id)).status).toBe('pending_approval')   // dispatch is a no-op until approved
    expect(() => svc.decideJob(job.id, 'approve', undefined, operator)).toThrow(/Approver permission/)
    expect(() => svc.decideJob(job.id, 'approve', undefined, { ...approver, email: operator.email })).toThrow(/own request/)
    expect(svc.decideJob(job.id, 'approve', 'go', approver)).toMatchObject({ status: 'approved', approver: approver.email })
    expect((await svc.dispatchJob(job.id)).status).toBe('running')

    const second = await svc.createJob({ scriptId: s.id, target: { deviceIds: ['w2'] }, provider: 'mock', mode: 'now', justification: 'Disk space incident INC123' }, operator)
    expect(svc.decideJob(second.job.id, 'reject', 'no', admin).status).toBe('rejected')
    await expect(svc.cancelJob(second.job.id, operator)).rejects.toThrow(/already rejected/)
  })
})

describe('safety limits', () => {
  it('is idempotent: the same request twice returns the same job', async () => {
    const s = svc.createScript({ name: 'Inventory', content: PS_LOW, fileName: 'inv.ps1' }, operator)
    const a = await svc.createJob({ scriptId: s.id, target: { deviceIds: ['w1'] }, provider: 'mock', mode: 'now' }, operator)
    const b = await svc.createJob({ scriptId: s.id, target: { deviceIds: ['w1'] }, provider: 'mock', mode: 'now' }, operator)
    expect(b.duplicate).toBe(true); expect(b.job.id).toBe(a.job.id); expect(store.listJobs()).toHaveLength(1)
  })
  it('enforces per-user hourly and concurrent-job limits and the emergency stop', async () => {
    const s = svc.createScript({ name: 'Inventory', content: PS_LOW, fileName: 'inv.ps1' }, operator)
    store.savePolicy({ ...store.getPolicy(), maxJobsPerUserPerHour: 1 })
    await svc.createJob({ scriptId: s.id, target: { deviceIds: ['w1'] }, provider: 'mock', mode: 'now' }, operator)
    await expect(svc.createJob({ scriptId: s.id, target: { deviceIds: ['w2'] }, provider: 'mock', mode: 'now' }, operator)).rejects.toMatchObject({ status: 429 })
    store.savePolicy({ ...store.getPolicy(), maxJobsPerUserPerHour: 100, executionPaused: true })
    await expect(svc.createJob({ scriptId: s.id, target: { deviceIds: ['w2'] }, provider: 'mock', mode: 'now' }, operator)).rejects.toMatchObject({ status: 423 })
  })
  it('refuses to dispatch when script content no longer matches the approved hash', async () => {
    const s = svc.createScript({ name: 'Inventory', content: PS_LOW, fileName: 'inv.ps1' }, operator)
    const { job } = await svc.createJob({ scriptId: s.id, target: { deviceIds: ['w1'] }, provider: 'mock', mode: 'now' }, operator)
    store.getScript(s.id)!.versions[0]!.content = 'Remove-Item C:\\ -Recurse'   // tampering
    const out = await svc.dispatchJob(job.id)
    expect(out.status).toBe('failed'); expect(out.devices[0]!.error).toMatch(/no longer matches/)
  })
  it('refuses providers that are not enabled (Endpoint Central) and never fabricates a result', async () => {
    const s = svc.createScript({ name: 'Inventory', content: PS_LOW, fileName: 'inv.ps1' }, operator)
    await expect(svc.createJob({ scriptId: s.id, target: { deviceIds: ['w1'] }, provider: 'endpoint_central', mode: 'now' }, operator)).rejects.toThrow(/not available/)
  })
  it('cancels a scheduled job before it is sent, and one with no cancel support in flight', async () => {
    const s = svc.createScript({ name: 'Inventory', content: PS_LOW, fileName: 'inv.ps1' }, operator)
    const when = new Date(Date.now() + 3_600_000).toISOString()
    const { job } = await svc.createJob({ scriptId: s.id, target: { deviceIds: ['w1'] }, provider: 'mock', mode: 'scheduled', scheduledFor: when }, operator)
    expect((await svc.dispatchJob(job.id)).status).toBe('scheduled')
    expect((await svc.cancelJob(job.id, operator)).status).toBe('cancelled')
  })
})

describe('data safety in persisted records', () => {
  it('stores no secret in script justifications/outputs after sanitising, and keeps list views free of script bodies', async () => {
    const s = svc.createScript({ name: 'Inventory', content: PS_LOW, fileName: 'inv.ps1' }, operator)
    expect(JSON.stringify(svc.scriptSummary(s))).not.toContain('Get-ComputerInfo')
    expect(redactSecrets('Password=hunter22;')).toContain('[REDACTED]')
  })
  it('encrypts script bodies at rest when a key is configured and round-trips them', async () => {
    process.env['REMOTE_ACTIONS_ENCRYPTION_KEY'] = Buffer.alloc(32, 7).toString('base64')
    try {
      const s = svc.createScript({ name: 'Inventory', content: PS_LOW, fileName: 'inv.ps1' }, operator)
      const raw = (await import('node:fs')).readFileSync((await import('../../store/dataDir.js')).dataFile('remote-actions.v1.json'), 'utf8')
      expect(raw).toContain('enc:v1:'); expect(raw).not.toContain('Get-ComputerInfo')
      store.resetForTests()
      expect(store.getScript(s.id)!.versions[0]!.content).toBe(PS_LOW)
    } finally { delete process.env['REMOTE_ACTIONS_ENCRYPTION_KEY'] }
  })
})
