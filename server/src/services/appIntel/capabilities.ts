import { getGrantedScopes } from '../manageEngine.js'
import type { RuntimeManageEngineConfig } from '../../store/integrationStore.js'

// Capability detection. Reports what each provider can and cannot do — and why — so the UI never
// has to guess. Nothing here calls an unverified provider endpoint.

export const EC_INVENTORY_SCOPE = 'DesktopCentralCloud.Inventory.READ'
/** Zoho "ALL" scopes include read access, so either grants what this read-only module needs. */
export const EC_INVENTORY_SCOPES = [EC_INVENTORY_SCOPE, 'DesktopCentralCloud.Inventory.ALL']

export type CapabilityState = 'ok' | 'not_configured' | 'missing_permission' | 'scope_missing' | 'host_missing' | 'adapter_unverified' | 'error'

export interface ProviderCapability { state: CapabilityState; message: string; detail?: string[] }

export interface AppIntelCapabilities {
  intune: { detectedApps: ProviderCapability; appCatalog: ProviderCapability }
  manageEngineMdm: ProviderCapability
  endpointCentralInventory: ProviderCapability
  /** Which self-service portals can be recognised when classifying install source. */
  selfService: { intuneCompanyPortal: ProviderCapability; endpointCentralPortal: ProviderCapability }
  latestVersionSources: { winget: ProviderCapability; homebrew: ProviderCapability }
  /** Packaging hand-off targets that are registered in this deployment. */
  packagers: { windows: boolean; macOS: boolean }
}

/** Endpoint Central agent inventory is only usable with the right scope AND an explicitly configured host. */
export async function detectEndpointCentralInventory(
  cfg: RuntimeManageEngineConfig | undefined,
  env: { ENDPOINT_CENTRAL_BASE_URL?: string | undefined } = process.env,
  scopesFor: (c: RuntimeManageEngineConfig) => Promise<string[]> = getGrantedScopes,
): Promise<ProviderCapability> {
  if (!cfg) return { state: 'not_configured', message: 'ManageEngine is not configured.' }
  let scopes: string[]
  try { scopes = await scopesFor(cfg) } catch (e) {
    return { state: 'error', message: `Could not read the ManageEngine token scopes: ${e instanceof Error ? e.message : 'unknown error'}` }
  }
  const granted = EC_INVENTORY_SCOPES.some(sc => scopes.includes(sc))
  const hostSet = !!env.ENDPOINT_CENTRAL_BASE_URL?.trim()
  const mdmOnly = scopes.length > 0 && scopes.every(s => s.startsWith('MDMOnDemand.'))
  if (!granted) {
    return { state: 'scope_missing', detail: scopes,
      message: `${mdmOnly ? 'This ManageEngine connection is MDM-only. ' : ''}Endpoint Central software inventory needs the ${EC_INVENTORY_SCOPE} scope on the OAuth client; it is not granted, so agent inventory is disabled.` }
  }
  if (!hostSet) {
    return { state: 'host_missing', detail: scopes, message: 'The inventory scope is granted, but ENDPOINT_CENTRAL_BASE_URL is not set, so the Endpoint Central host cannot be confirmed.' }
  }
  return { state: 'adapter_unverified', detail: scopes,
    message: 'Scope and host are configured, but no Endpoint Central software-inventory endpoint has been verified against this tenant yet, so no inventory calls are made.' }
}
