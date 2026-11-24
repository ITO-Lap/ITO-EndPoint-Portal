import type { ProviderCapabilities } from '../types.js'
import { isManageEngineConfigured } from '../../services/manageEngine.js'
import type { RemoteExecutionProvider } from './types.js'

/**
 * Endpoint Central is registered so the UI can explain why it is unavailable, but it is NOT enabled: the tenant's OAuth
 * scopes in use are patch + inventory only, and no custom-script execution API or scope has been verified against it
 * (docs/13-api-permission-matrix.md lists even the patch scan/install scope as unverified). Enabling it requires
 * confirming the endpoint, the scope and the result API first — see docs/07-features/REMOTE-ACTION-CENTER.md.
 */
export class EndpointCentralExecutionProvider implements RemoteExecutionProvider {
  readonly id = 'endpoint_central' as const

  async capabilities(): Promise<ProviderCapabilities> {
    return {
      id: this.id, label: 'Endpoint Central', enabled: false,
      reasons: [
        isManageEngineConfigured() ? 'Connected, but no verified script-execution API or OAuth scope is available to this integration.' : 'Endpoint Central is not configured.',
      ],
      supports: { powershell: false, shell: false, runAsSystem: false, runAsUser: false, perDeviceStatus: false, scriptOutput: false, liveStreaming: false, cancel: false, runWhenOnline: false, scheduling: false },
      notes: ['Current scopes cover patch and software inventory only. Script execution will be enabled once the API and scope are verified.'],
    }
  }
  async dispatch(): Promise<never> { throw Object.assign(new Error('Endpoint Central script execution is not available.'), { status: 501 }) }
  async poll(): Promise<never> { throw Object.assign(new Error('Endpoint Central script execution is not available.'), { status: 501 }) }
}
