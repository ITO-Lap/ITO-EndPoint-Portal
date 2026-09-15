import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  graphGetV, graphGetAllV, getGroupDisplayNames, FatalGraphError, TransientGraphError,
  GRAPH, GRAPH_BETA, type TenantCredentials,
} from '../graphApi.js'

// getToken() caches per tenantId at module scope — give every test its own
// tenantId so each one gets a real cache miss and exercises the token fetch,
// rather than silently reusing a token cached by an earlier test.
let tenantCounter = 0
function freshCreds(): TenantCredentials {
  tenantCounter += 1
  return { tenantId: `t${tenantCounter}`, clientId: 'c1', clientSecret: 's1' }
}

function tokenResponse() {
  return new Response(JSON.stringify({ access_token: 'fake-token', expires_in: 3600 }), { status: 200 })
}

describe('graphGetAllV / graphGetV — pagination and versioning', () => {
  beforeEach(() => vi.useRealTimers())
  afterEach(() => vi.unstubAllGlobals())

  it('follows @odata.nextLink across pages and stops when absent', async () => {
    const creds = freshCreds()
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: [{ id: '1' }], '@odata.nextLink': 'https://graph.microsoft.com/beta/next' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: [{ id: '2' }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchImpl)

    const results = await graphGetAllV<{ id: string }>(creds, GRAPH_BETA, '/deviceManagement/deviceManagementScripts')
    expect(results.map(r => r.id)).toEqual(['1', '2'])
    expect(fetchImpl).toHaveBeenCalledTimes(3) // 1 token + 2 pages
  })

  it('requests against the beta base URL when GRAPH_BETA is passed', async () => {
    const creds = freshCreds()
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchImpl)

    await graphGetAllV(creds, GRAPH_BETA, '/deviceManagement/deviceShellScripts')
    const secondCallUrl = fetchImpl.mock.calls[1]?.[0] as string
    expect(secondCallUrl.startsWith(GRAPH_BETA)).toBe(true)
  })

  it('requests against the v1.0 base URL when GRAPH is passed', async () => {
    const creds = freshCreds()
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchImpl)

    await graphGetAllV(creds, GRAPH, '/deviceManagement/deviceConfigurations')
    const secondCallUrl = fetchImpl.mock.calls[1]?.[0] as string
    expect(secondCallUrl.startsWith(GRAPH)).toBe(true)
    expect(secondCallUrl.startsWith(GRAPH_BETA)).toBe(false)
  })

  it('graphGetV returns a single decoded item', async () => {
    const creds = freshCreds()
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'abc', displayName: 'Test' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchImpl)

    const result = await graphGetV<{ id: string; displayName: string }>(creds, GRAPH_BETA, '/deviceManagement/deviceHealthScripts/abc')
    expect(result).toEqual({ id: 'abc', displayName: 'Test' })
  })
})

describe('retry / throttling behavior', () => {
  const noSleep = () => Promise.resolve()

  it('retries on 429 honoring Retry-After, then succeeds', async () => {
    const creds = freshCreds()
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: [{ id: '1' }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchImpl)

    const results = await graphGetAllV<{ id: string }>(creds, GRAPH_BETA, '/deviceManagement/configurationPolicies', undefined, { sleepImpl: noSleep })
    expect(results).toHaveLength(1)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('retries transient 5xx with backoff, then throws TransientGraphError after exhausting retries', async () => {
    const creds = freshCreds()
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 503 }))
    vi.stubGlobal('fetch', fetchImpl)
    // token call first
    fetchImpl.mockResolvedValueOnce(tokenResponse())

    await expect(
      graphGetAllV(creds, GRAPH_BETA, '/deviceManagement/deviceManagementScripts', undefined, { maxRetries: 1, sleepImpl: noSleep })
    ).rejects.toThrow(TransientGraphError)
  })

  it('throws FatalGraphError immediately on 404 without retrying', async () => {
    const creds = freshCreds()
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
    vi.stubGlobal('fetch', fetchImpl)

    await expect(
      graphGetAllV(creds, GRAPH_BETA, '/deviceManagement/deviceManagementScripts/missing', undefined, { sleepImpl: noSleep })
    ).rejects.toThrow(FatalGraphError)
    expect(fetchImpl).toHaveBeenCalledTimes(2) // token + exactly one attempt, no retry
  })

  it('throws FatalGraphError immediately on 401/403 without retrying', async () => {
    const creds = freshCreds()
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }))
    vi.stubGlobal('fetch', fetchImpl)

    let caught: unknown
    try {
      await graphGetAllV(creds, GRAPH_BETA, '/deviceManagement/configurationPolicies', undefined, { sleepImpl: noSleep })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(FatalGraphError)
    expect((caught as FatalGraphError).status).toBe(403)
  })

  it('redacts a bearer token if one leaks into an error body', async () => {
    const creds = freshCreds()
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response('Unauthorized: Bearer abc123.def456', { status: 401 }))
    vi.stubGlobal('fetch', fetchImpl)

    let caught: unknown
    try {
      await graphGetAllV(creds, GRAPH_BETA, '/deviceManagement/configurationPolicies', undefined, { sleepImpl: noSleep })
    } catch (err) {
      caught = err
    }
    expect((caught as Error).message).not.toContain('abc123.def456')
    expect((caught as Error).message).toContain('[redacted]')
  })
})

describe('getToken — concurrent request de-duplication', () => {
  it('shares one in-flight OAuth request across concurrent graphGetAllV calls for the same tenant', async () => {
    const creds = freshCreds()
    let tokenCallCount = 0
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.includes('login.microsoftonline.com')) {
        tokenCallCount += 1
        return Promise.resolve(tokenResponse())
      }
      return Promise.resolve(new Response(JSON.stringify({ value: [] }), { status: 200 }))
    })
    vi.stubGlobal('fetch', fetchImpl)

    // Simulates listAllItems fanning out to several Graph collections in
    // parallel — without de-duplication, each would race the empty cache
    // and fire its own token request.
    await Promise.all([
      graphGetAllV(creds, GRAPH_BETA, '/deviceManagement/deviceManagementScripts'),
      graphGetAllV(creds, GRAPH_BETA, '/deviceManagement/deviceHealthScripts'),
      graphGetAllV(creds, GRAPH, '/deviceManagement/deviceConfigurations'),
      graphGetAllV(creds, GRAPH, '/deviceManagement/deviceCompliancePolicies'),
    ])

    expect(tokenCallCount).toBe(1)
    vi.unstubAllGlobals()
  })
})

describe('getGroupDisplayNames', () => {
  it('resolves group ids to display names', async () => {
    const creds = freshCreds()
    const guid1 = '11111111-1111-1111-1111-111111111111'
    const guid2 = '22222222-2222-2222-2222-222222222222'
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        value: [{ id: guid1, displayName: 'Group One' }, { id: guid2, displayName: 'Group Two' }],
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetchImpl)

    const map = await getGroupDisplayNames(creds, [guid1, guid2])
    expect(map.get(guid1)).toBe('Group One')
    expect(map.get(guid2)).toBe('Group Two')
    vi.unstubAllGlobals()
  })

  it('ignores non-GUID values (defends against OData filter injection)', async () => {
    const creds = freshCreds()
    const fetchImpl = vi.fn().mockResolvedValueOnce(tokenResponse())
    vi.stubGlobal('fetch', fetchImpl)

    const map = await getGroupDisplayNames(creds, ["'; maliciousFilter or 1 eq 1"])
    expect(map.size).toBe(0)
    // invalid id is filtered out before any Graph/token call is made
    expect(fetchImpl).toHaveBeenCalledTimes(0)
    vi.unstubAllGlobals()
  })

  it('chunks large id lists into batches of 15', async () => {
    const creds = freshCreds()
    const ids = Array.from({ length: 20 }, (_, i) => `${String(i).padStart(8, '0')}-1111-1111-1111-111111111111`)
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ value: [] }), { status: 200 })))
    vi.stubGlobal('fetch', fetchImpl)

    await getGroupDisplayNames(creds, ids)
    // 1 token call + 2 chunk calls (15 + 5)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    vi.unstubAllGlobals()
  })
})
