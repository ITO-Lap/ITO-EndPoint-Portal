import type { DeviceState, ProviderCapabilities, RemoteJob } from '../types.js'
import type { DispatchContext, DispatchOutcome, PollUpdate, RemoteExecutionProvider } from './types.js'

/** Development/test simulation. NOTHING runs on any device. Enabled outside production, or with REMOTE_ACTIONS_MOCK=1. */
export const mockEnabled = (): boolean => process.env['REMOTE_ACTIONS_MOCK'] === '1' || (process.env['NODE_ENV'] !== 'production')

export class MockExecutionProvider implements RemoteExecutionProvider {
  readonly id = 'mock' as const
  private polls = new Map<string, number>()
  private cancelled = new Set<string>()

  async capabilities(): Promise<ProviderCapabilities> {
    return {
      id: this.id, label: 'Mock (simulation only)', enabled: mockEnabled(),
      reasons: mockEnabled() ? [] : ['The mock provider is disabled in production.'],
      supports: { powershell: true, shell: true, runAsSystem: true, runAsUser: true, perDeviceStatus: true, scriptOutput: true, liveStreaming: true, cancel: true, runWhenOnline: true, scheduling: true },
      notes: ['Simulation for development and testing. No script is executed and no device is contacted.'],
    }
  }

  async dispatch(ctx: DispatchContext): Promise<DispatchOutcome> {
    return {
      providerContext: { mockRun: ctx.job.id },
      devices: ctx.devices.map(d => ({ deviceId: d.id, accepted: true, providerRef: `mock-${d.id}`, state: (/offline/i.test(d.name) ? 'waiting_online' : 'provider_accepted') as DeviceState })),
    }
  }

  /** Poll 1: running with progress. Poll 2+: finished. Names containing "fail" fail; "offline" never answers. */
  async poll(job: RemoteJob): Promise<PollUpdate[]> {
    const n = (this.polls.get(job.id) ?? 0) + 1
    this.polls.set(job.id, n)
    return job.devices.filter(d => !['succeeded', 'failed', 'timed_out', 'skipped', 'cancelled'].includes(d.state)).map((d): PollUpdate => {
      if (this.cancelled.has(job.id)) return { deviceId: d.deviceId, state: 'cancelled', providerState: 'cancelled' }
      if (/offline/i.test(d.deviceName)) return { deviceId: d.deviceId, state: 'waiting_online', providerState: 'pending' }
      if (n === 1) return { deviceId: d.deviceId, state: 'running', providerState: 'running', output: 'Starting\n__ITO_PROGRESS__:40|Working' }
      return /fail/i.test(d.deviceName)
        ? { deviceId: d.deviceId, state: 'failed', providerState: 'scriptError', exitCode: 1, output: '__ITO_PROGRESS__:60|Working', error: 'Simulated failure' }
        : { deviceId: d.deviceId, state: 'succeeded', providerState: 'success', exitCode: 0, output: '__ITO_PROGRESS__:100|Done\nOK' }
    })
  }

  async cancel(job: RemoteJob): Promise<void> { this.cancelled.add(job.id) }
}
