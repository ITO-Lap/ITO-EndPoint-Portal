import { describe, it, expect, vi, beforeEach } from 'vitest'

// The application-inventory scan against a mocked Endpoint Central. It must use the current Zoho token for every
// device (via zohoFetch) and say why devices could not be read.

const cfg = { clientId: 'c', clientSecret: 's', refreshToken: 'r', apiDomain: 'https://x.example' }
const zohoFetch = vi.fn()
vi.mock('../manageEngine.js', async orig => ({ ...(await orig<typeof import('../manageEngine.js')>()), zohoFetch: (...a: unknown[]) => zohoFetch(...a) }))
vi.mock('../../store/integrationStore.js', async orig => ({ ...(await orig<typeof import('../../store/integrationStore.js')>()), getManageEngineConfig: () => cfg }))
const systems = vi.fn()
vi.mock('../endpointCentralPatch.js', async orig => ({ ...(await orig<typeof import('../endpointCentralPatch.js')>()), getPatchSystems: () => systems() }))

const sys = (id: string, platform: 'Windows' | 'Mac' = 'Windows') => ({ resourceId: id, detailResourceId: id, platform, osName: platform === 'Mac' ? 'macOS 14' : 'Windows 11', names: [`PC-${id}`], lastSuccessfulScanTime: '2026-11-20T00:00:00Z', lastScanTime: null })
const ok = (rows = 1) => ({ ok: true, status: 200, json: async () => ({ status: 'success', message_response: { total: rows, installedsoftware: Array.from({ length: rows }, (_, i) => ({ software_name: `App ${i}`, software_version: '1.0', manufacturer_name: 'Acme', location: 'C:\\Program Files\\App' })) } }) })
const http = (status: number) => ({ ok: false, status, json: async () => ({}) })
const idOf = (url: string) => new URL(url).searchParams.get('resid') ?? ''

beforeEach(() => { zohoFetch.mockReset(); systems.mockReset() })

describe('refreshEndpointCentralAppInventory', () => {
  it('requests every device through zohoFetch with the connection settings, never a token fixed at the start', async () => {
    const { refreshEndpointCentralAppInventory } = await import('../endpointCentralSoftware.js')
    systems.mockResolvedValue([sys('ok1'), sys('ok2'), sys('ok3')])
    zohoFetch.mockResolvedValue(ok())
    const r = await refreshEndpointCentralAppInventory(undefined, 1)
    expect(zohoFetch).toHaveBeenCalledTimes(3)
    for (const call of zohoFetch.mock.calls) {
      expect(call[0]).toEqual(cfg) // the settings, so each call gets the current (refreshed) token
      expect(String(call[1])).toContain('/api/1.4/inventory/installedsoftware?resid=')
    }
    expect(r).toMatchObject({ devices: 3, failed: 0, failureReasons: [] })
  })

  it('keeps reading after a device fails and reports why, most common cause first', async () => {
    const { refreshEndpointCentralAppInventory } = await import('../endpointCentralSoftware.js')
    systems.mockResolvedValue([sys('g1'), sys('b404a'), sys('b404b'), sys('b500'), sys('g2')])
    zohoFetch.mockImplementation(async (_c: unknown, url: string) => {
      const id = idOf(url)
      return id.startsWith('b404') ? http(404) : id === 'b500' ? http(500) : ok()
    })
    const r = await refreshEndpointCentralAppInventory(undefined, 1)
    expect(zohoFetch).toHaveBeenCalledTimes(5) // the two good devices were still read after the failures
    expect(r.failed).toBe(3)
    expect(r.failureReasons).toEqual([
      { reason: 'Endpoint Central inventory API 404', devices: 2 },
      { reason: 'Endpoint Central inventory API 500', devices: 1 },
    ])
  })

  it('throws when the scan itself cannot start, so the sync records a failure', async () => {
    const { refreshEndpointCentralAppInventory } = await import('../endpointCentralSoftware.js')
    systems.mockRejectedValue(new Error('Patch API down'))
    await expect(refreshEndpointCentralAppInventory(undefined, 1)).rejects.toThrow('Patch API down')
  })
})
