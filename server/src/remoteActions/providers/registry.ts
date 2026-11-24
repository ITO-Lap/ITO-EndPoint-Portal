import type { ProviderId } from '../types.js'
import type { RemoteExecutionProvider } from './types.js'
import { EndpointCentralExecutionProvider } from './endpointCentral.js'
import { IntuneExecutionProvider } from './intune.js'
import { MockExecutionProvider } from './mock.js'

const providers = new Map<ProviderId, RemoteExecutionProvider>([
  ['intune', new IntuneExecutionProvider()],
  ['endpoint_central', new EndpointCentralExecutionProvider()],
  ['mock', new MockExecutionProvider()],
])

export const getProvider = (id: ProviderId): RemoteExecutionProvider | undefined => providers.get(id)
export const allProviders = (): RemoteExecutionProvider[] => [...providers.values()]
/** Tests and future providers can register or replace an implementation. */
export const registerProvider = (p: RemoteExecutionProvider): void => { providers.set(p.id, p) }
