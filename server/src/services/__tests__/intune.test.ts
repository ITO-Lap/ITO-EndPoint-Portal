import { afterEach, describe, expect, it, vi } from 'vitest'
import { getIntuneDevices } from '../intune.js'

describe('getIntuneDevices throttling', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('retries a Graph 429 using Retry-After and continues fetching devices', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchImpl)

    const devices = await getIntuneDevices({
      tenantId: `retry-test-${Date.now()}`,
      clientId: 'client-id',
      clientSecret: 'client-secret',
    })

    expect(devices).toEqual([])
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })
})