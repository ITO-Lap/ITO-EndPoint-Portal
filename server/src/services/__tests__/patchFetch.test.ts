import { describe, it, expect, vi } from 'vitest'

const zohoFetch = vi.fn()
vi.mock('../manageEngine.js', () => ({ zohoFetch: (...a: unknown[]) => zohoFetch(...a), getManageEngineConfig: () => null }))
const { patchFetch } = await import('../endpointCentralPatch.js')

const res = (status: number, ra?: string) => new Response('', { status, headers: ra ? { 'retry-after': ra } : {} })

describe('patchFetch', () => {
  it('retries 429 honouring Retry-After, then returns the success', async () => {
    zohoFetch.mockReset().mockResolvedValueOnce(res(429, '2')).mockResolvedValueOnce(res(200))
    const waits: number[] = []
    const r = await patchFetch({} as never, 'u', 4, async ms => { waits.push(ms) })
    expect(r.status).toBe(200)
    expect(waits).toEqual([2000])
  })
  it('returns the last response when every attempt is throttled, and does not retry 4xx', async () => {
    zohoFetch.mockReset().mockResolvedValue(res(429))
    expect((await patchFetch({} as never, 'u', 3, async () => {})).status).toBe(429)
    expect(zohoFetch).toHaveBeenCalledTimes(3)
    zohoFetch.mockReset().mockResolvedValue(res(404))
    await patchFetch({} as never, 'u', 3, async () => {})
    expect(zohoFetch).toHaveBeenCalledTimes(1)
  })
})
