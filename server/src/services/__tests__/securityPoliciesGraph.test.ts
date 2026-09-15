import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchAllSecurityPolicies, collectAssignmentGroupIds } from '../securityPoliciesGraph.js'
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

function single(obj: Record<string, unknown>) {
  return new Response(JSON.stringify(obj), { status: 200 })
}

describe('fetchAllSecurityPolicies — normalization', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('normalizes a configurationPolicy with settings and assignments', async () => {
    const creds = freshCreds()
    const fetchImpl = vi.fn().mockResolvedValueOnce(tokenResponse())
    vi.stubGlobal('fetch', fetchImpl)

    fetchImpl.mockImplementation((url: string) => {
      if (url.includes('/deviceManagement/configurationPolicies') && url.includes('/settings')) {
        return Promise.resolve(single({ value: [{ id: 's1', settingInstance: {} }] }))
      }
      if (url.includes('/deviceManagement/configurationPolicies') && url.includes('/assignments')) {
        return Promise.resolve(page([{ id: 'a1', target: { '@odata.type': '#microsoft.graph.groupAssignmentTarget', groupId: 'g1' } }]))
      }
      if (url.includes('/deviceManagement/configurationPolicies')) {
        return Promise.resolve(page([{ id: 'cp-1', name: 'Disk Encryption', platforms: ['windows10'], templateReference: { templateDisplayName: 'Endpoint protection' } }]))
      }
      return Promise.resolve(page([]))
    })

    const { policies } = await fetchAllSecurityPolicies(creds)
    const cp = policies.find(p => p.policyId === 'cp-1')
    expect(cp?.source).toBe('intune')
    expect(cp?.category).toBe('configurationPolicy')
    expect(cp?.platform).toBe('windows10')
    expect(cp?.settings).toEqual([{ id: 's1', settingInstance: {} }])
    expect(cp?.assignments).toEqual([{
      kind: 'include', targetType: '#microsoft.graph.groupAssignmentTarget',
      groupId: 'g1', groupDisplayName: null, filterId: null, filterType: null,
    }])
  })

  it('marks an assignment as exclude when the target odata.type contains Exclusion', async () => {
    const creds = freshCreds()
    const fetchImpl = vi.fn().mockResolvedValueOnce(tokenResponse())
    vi.stubGlobal('fetch', fetchImpl)

    fetchImpl.mockImplementation((url: string) => {
      if (url.includes('/deviceCompliancePolicies') && url.includes('/assignments')) {
        return Promise.resolve(page([{ id: 'a1', target: { '@odata.type': '#microsoft.graph.groupAssignmentTarget', groupId: 'g1' } }, { id: 'a2', target: { '@odata.type': '#microsoft.graph.exclusionGroupAssignmentTarget', groupId: 'g2' } }]))
      }
      if (url.includes('/deviceCompliancePolicies')) {
        return Promise.resolve(page([{ id: 'cc-1', displayName: 'Compliant windows', platformType: 'windows10' }]))
      }
      return Promise.resolve(page([]))
    })

    const { policies } = await fetchAllSecurityPolicies(creds)
    const cc = policies.find(p => p.policyId === 'cc-1')
    expect(cc?.assignments.find(a => a.groupId === 'g1')?.kind).toBe('include')
    expect(cc?.assignments.find(a => a.groupId === 'g2')?.kind).toBe('exclude')
  })

  it('normalizes conditional access policy state and group conditions', async () => {
    const creds = freshCreds()
    const fetchImpl = vi.fn().mockResolvedValueOnce(tokenResponse())
    vi.stubGlobal('fetch', fetchImpl)

    fetchImpl.mockImplementation((url: string) => {
      if (url.includes('/identity/conditionalAccess/policies')) {
        return Promise.resolve(page([{
          id: 'ca-1', displayName: 'Require MFA', state: 'enabled',
          conditions: { users: { includeGroups: ['g1'], excludeUsers: ['u1'] } },
          grantControls: { builtInControls: ['mfa'] },
        }]))
      }
      return Promise.resolve(page([]))
    })

    const { policies } = await fetchAllSecurityPolicies(creds)
    const ca = policies.find(p => p.policyId === 'ca-1')
    expect(ca?.source).toBe('entra')
    expect(ca?.enabled).toBe(true)
    expect(ca?.assignments).toEqual(expect.arrayContaining([
      { kind: 'include', targetType: 'group', groupId: 'g1', groupDisplayName: null, filterId: null, filterType: null },
      { kind: 'exclude', targetType: 'user', groupId: null, groupDisplayName: null, filterId: null, filterType: null },
    ]))
  })

  it('normalizes singleton policies (authorizationPolicy) from a plain object response', async () => {
    const creds = freshCreds()
    const fetchImpl = vi.fn().mockResolvedValueOnce(tokenResponse())
    vi.stubGlobal('fetch', fetchImpl)

    fetchImpl.mockImplementation((url: string) => {
      if (url.includes('/policies/authorizationPolicy')) {
        return Promise.resolve(single({ id: 'authorizationPolicy', displayName: 'Authorization Policy', allowedToSignUpEmailBasedSubscriptions: false }))
      }
      if (url.includes('/policies/identitySecurityDefaultsEnforcementPolicy')) {
        return Promise.resolve(single({ id: 'default', isEnabled: true }))
      }
      if (url.includes('/policies/authenticationMethodsPolicy')) {
        return Promise.resolve(single({ id: 'authenticationMethodsPolicy', policyVersion: '1' }))
      }
      return Promise.resolve(page([]))
    })

    const { policies } = await fetchAllSecurityPolicies(creds)
    const authZ = policies.find(p => p.category === 'authorizationPolicy')
    const secDefaults = policies.find(p => p.category === 'securityDefaults')
    expect(authZ?.policyId).toBe('authorizationPolicy')
    expect(secDefaults?.enabled).toBe(true)
  })

  it('reports a per-category error without failing the whole sync when one category rejects', async () => {
    const creds = freshCreds()
    const fetchImpl = vi.fn().mockResolvedValueOnce(tokenResponse())
    vi.stubGlobal('fetch', fetchImpl)

    fetchImpl.mockImplementation((url: string) => {
      if (url.includes('/deviceManagement/intents')) {
        return Promise.resolve(new Response('forbidden', { status: 403 }))
      }
      if (url.includes('/deviceManagement/deviceConfigurations')) {
        return Promise.resolve(page([{ id: 'dc-1', displayName: 'Config', platformType: 'windows10' }]))
      }
      return Promise.resolve(page([]))
    })

    const { policies, sourceErrors } = await fetchAllSecurityPolicies(creds)
    expect(sourceErrors.securityBaseline).toBeTruthy()
    expect(policies.find(p => p.policyId === 'dc-1')?.category).toBe('deviceConfiguration')
  })
})

describe('collectAssignmentGroupIds', () => {
  it('dedupes group ids across multiple policies and ignores null groupIds', () => {
    const ids = collectAssignmentGroupIds([
      { assignments: [{ kind: 'include', targetType: 'group', groupId: 'g1', groupDisplayName: null, filterId: null, filterType: null }] } as never,
      { assignments: [
        { kind: 'include', targetType: 'group', groupId: 'g1', groupDisplayName: null, filterId: null, filterType: null },
        { kind: 'exclude', targetType: 'user', groupId: null, groupDisplayName: null, filterId: null, filterType: null },
      ] } as never,
    ])
    expect(ids).toEqual(['g1'])
  })
})
