import { describe, it, expect, vi, afterEach } from 'vitest'
import { listAllItems, RESOURCE_TYPES } from '../intuneScriptsConfigGraph.js'
import type { TenantCredentials } from '../graphApi.js'

let tenantCounter = 0
function freshCreds(): TenantCredentials {
  tenantCounter += 1
  return { tenantId: `t${tenantCounter}`, clientId: 'c1', clientSecret: 's1' }
}

function tokenResponse() {
  return new Response(JSON.stringify({ access_token: 'fake-token', expires_in: 3600 }), { status: 200 })
}

function page(value: unknown[]) {
  return new Response(JSON.stringify({ value }), { status: 200 })
}

// listAllItems fetches 8 distinct Graph collections (RESOURCE_TYPES has 9
// entries, but settings_catalog/endpoint_security share one collection and
// device_configuration/windows_update_configuration share another — see
// COLLECTION_CLASSIFIERS in intuneScriptsConfigGraph.ts).
const DISTINCT_COLLECTION_COUNT = RESOURCE_TYPES.length - 2

describe('listAllItems — collection grouping and classification', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('fetches each distinct Graph collection exactly once (shared collections not double-fetched)', async () => {
    const creds = freshCreds()
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockImplementation(() => Promise.resolve(page([])))
    vi.stubGlobal('fetch', fetchImpl)

    await listAllItems(creds)
    // 1 token call + 1 call per distinct collection
    expect(fetchImpl).toHaveBeenCalledTimes(1 + DISTINCT_COLLECTION_COUNT)
  })

  it('splits configurationPolicies into settings_catalog vs endpoint_security by templateFamily', async () => {
    const creds = freshCreds()
    const fetchImpl = vi.fn().mockResolvedValueOnce(tokenResponse())
    vi.stubGlobal('fetch', fetchImpl)

    fetchImpl.mockImplementation((url: string) => {
      if (url.includes('/deviceManagement/configurationPolicies')) {
        return Promise.resolve(page([
          { id: 'sc-1', displayName: 'Settings Catalog Item', templateReference: { templateFamily: 'none' } },
          { id: 'es-1', displayName: 'Endpoint Security Item', templateReference: { templateFamily: 'endpointSecurityAntivirus' } },
        ]))
      }
      return Promise.resolve(page([]))
    })

    const { items } = await listAllItems(creds)
    const scItem = items.find(i => i.id === 'sc-1')
    const esItem = items.find(i => i.id === 'es-1')
    expect(scItem?.type).toBe('settings_catalog')
    expect(scItem?.category).toBe('configurations/settings-catalog')
    expect(esItem?.type).toBe('endpoint_security')
    expect(esItem?.category).toBe('configurations/endpoint-security')
  })

  it('splits deviceConfigurations into device_configuration vs windows_update_configuration by @odata.type', async () => {
    const creds = freshCreds()
    const fetchImpl = vi.fn().mockResolvedValueOnce(tokenResponse())
    vi.stubGlobal('fetch', fetchImpl)

    fetchImpl.mockImplementation((url: string) => {
      if (url.includes('/deviceManagement/deviceConfigurations')) {
        return Promise.resolve(page([
          { id: 'dc-1', displayName: 'Plain Device Config', '@odata.type': '#microsoft.graph.windows10GeneralConfiguration' },
          { id: 'wu-1', displayName: 'Update Ring', '@odata.type': '#microsoft.graph.windowsUpdateForBusinessConfiguration' },
        ]))
      }
      return Promise.resolve(page([]))
    })

    const { items } = await listAllItems(creds)
    const dcItem = items.find(i => i.id === 'dc-1')
    const wuItem = items.find(i => i.id === 'wu-1')
    expect(dcItem?.type).toBe('device_configuration')
    expect(wuItem?.type).toBe('windows_update_configuration')
    expect(wuItem?.category).toBe('configurations/windows-update')
  })

  it('fetches Autopilot deployment profiles from their own dedicated collection', async () => {
    const creds = freshCreds()
    const fetchImpl = vi.fn().mockResolvedValueOnce(tokenResponse())
    vi.stubGlobal('fetch', fetchImpl)

    fetchImpl.mockImplementation((url: string) => {
      if (url.includes('/deviceManagement/windowsAutopilotDeploymentProfiles')) {
        return Promise.resolve(page([{ id: 'ap-1', displayName: 'Autopilot Profile' }]))
      }
      return Promise.resolve(page([]))
    })

    const { items } = await listAllItems(creds)
    const apItem = items.find(i => i.id === 'ap-1')
    expect(apItem?.type).toBe('autopilot_deployment_profile')
    expect(apItem?.category).toBe('configurations/autopilot')
  })

  it('reports a categoryError for BOTH categories sharing a collection when that collection fails', async () => {
    const creds = freshCreds()
    const fetchImpl = vi.fn().mockResolvedValueOnce(tokenResponse())
    vi.stubGlobal('fetch', fetchImpl)

    fetchImpl.mockImplementation((url: string) => {
      if (url.includes('/deviceManagement/configurationPolicies')) {
        return Promise.resolve(new Response('forbidden', { status: 403 }))
      }
      return Promise.resolve(page([]))
    })

    const { categoryErrors, items } = await listAllItems(creds)
    expect(categoryErrors['configurations/settings-catalog']).toBeTruthy()
    expect(categoryErrors['configurations/endpoint-security']).toBeTruthy()
    // a failure in one collection doesn't blank out items from the others
    expect(items).toEqual([])
  })

  it('a failure in an unrelated single-collection category does not affect other categories', async () => {
    const creds = freshCreds()
    const fetchImpl = vi.fn().mockResolvedValueOnce(tokenResponse())
    vi.stubGlobal('fetch', fetchImpl)

    fetchImpl.mockImplementation((url: string) => {
      if (url.includes('/deviceManagement/windowsAutopilotDeploymentProfiles')) {
        return Promise.resolve(new Response('forbidden', { status: 403 }))
      }
      if (url.includes('/deviceManagement/deviceCompliancePolicies')) {
        return Promise.resolve(page([{ id: 'cp-1', displayName: 'Compliance Item' }]))
      }
      return Promise.resolve(page([]))
    })

    const { categoryErrors, items } = await listAllItems(creds)
    expect(categoryErrors['configurations/autopilot']).toBeTruthy()
    expect(categoryErrors['configurations/compliance']).toBeUndefined()
    expect(items.find(i => i.id === 'cp-1')?.type).toBe('compliance_policy')
  })

  it('no longer includes a macOS shell script resource type', () => {
    expect(RESOURCE_TYPES.some(r => (r.type as string) === 'macos_shell_script')).toBe(false)
  })
})
