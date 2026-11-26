import { afterEach, describe, expect, it, vi } from 'vitest'
import { getIntuneDevices, getIntuneDeviceApps } from '../intune.js'

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

describe('getIntuneDeviceApps throttling', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('backs off and retries a Graph 429 on detectedApps instead of failing the device', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: [{ displayName: 'Slack', version: '4.0', publisher: 'Slack' }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchImpl)

    const apps = await getIntuneDeviceApps('device-1', { tenantId: `apps-retry-${Date.now()}`, clientId: 'c', clientSecret: 's' })

    expect(apps).toHaveLength(1)
    expect(apps[0]?.name).toBe('Slack')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })
})
