import type { DeviceState, ProviderCapabilities, ProviderId, RemoteJob, ScriptVersion, TargetDevice } from '../types.js'

export interface DispatchContext {
  job: RemoteJob
  script: { name: string; language: 'powershell' | 'shell'; content: string }
  version: Pick<ScriptVersion, 'version' | 'contentHash'>
  devices: TargetDevice[]
}

export interface DispatchOutcome {
  /** Provider-side object ids (script id, group id…), kept on the job to poll and clean up. */
  providerContext: Record<string, string>
  devices: Array<{ deviceId: string; accepted: boolean; state?: DeviceState; providerRef?: string; error?: string }>
}

export interface PollUpdate {
  deviceId: string
  state: DeviceState
  /** The provider's own wording, shown verbatim. */
  providerState?: string
  exitCode?: number | null
  output?: string
  error?: string
}

/** Everything the Remote Action Center needs from an execution backend. Implementations must be honest in `capabilities()`. */
export interface RemoteExecutionProvider {
  readonly id: ProviderId
  capabilities(): Promise<ProviderCapabilities>
  dispatch(ctx: DispatchContext): Promise<DispatchOutcome>
  poll(job: RemoteJob): Promise<PollUpdate[]>
  /** Stops work that has not reached a device yet. Only present when `capabilities().supports.cancel`. */
  cancel?(job: RemoteJob): Promise<void>
  /** Removes provider-side objects created for the job (groups etc). Best effort. */
  cleanup?(job: RemoteJob): Promise<void>
}
