import { describe, it, expect, vi } from 'vitest'
import { executeGraph, type FetchLike } from '../graphExecutor.js'
import { validateGraphRequest } from '../graphRunnerLib.js'

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', 'request-id': 'req-1' }, ...init })
const req = (over: Record<string, unknown> = {}) => validateGraphRequest({ method: 'GET', endpoint: '/deviceManagement/managedDevices', ...over }).request!
const TOKEN = 'eyJSECRETTOKEN.eyJabcdefgh.abcdefghijkl'
const deps = (f: FetchLike) => ({ fetchImpl: f, getToken: async () => TOKEN, sleep: async () => {} })

describe('executeGraph', () => {
  it('sends the bearer token server-side only and returns status, duration and correlation id without leaking the token', async () => {
    const f = vi.fn<FetchLike>(async () => json({ value: [{ id: '1' }] }))
    const r = await executeGraph(req(), {}, deps(f))
    expect(f.mock.calls[0]![1]!.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` })
    expect(r).toMatchObject({ ok: true, httpStatus: 200, correlationId: 'req-1', pagesFetched: 1 }); expect(r.durationMs).toBeGreaterThanOrEqual(0)
    expect(JSON.stringify(r)).not.toContain('SECRETTOKEN')
  })
  it('follows next links up to the page cap and only to Graph', async () => {
    let n = 0
    const f = vi.fn<FetchLike>(async () => { n++; return json({ value: [{ id: n }], ...(n < 20 ? { '@odata.nextLink': `https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?$skiptoken=${n}` } : {}) }) })
    const r = await executeGraph(req(), { allPages: true }, deps(f))
    expect(r.pagesFetched).toBe(10); expect((r.json as { value: unknown[] }).value).toHaveLength(10)
    expect(f.mock.calls.every(c => String(c[0]).startsWith('https://graph.microsoft.com/v1.0/'))).toBe(true)
    // a hostile next link is not followed
    const evil = vi.fn<FetchLike>(async () => json({ value: [{ id: 1 }], '@odata.nextLink': 'https://evil.example/steal' }))
    const e = await executeGraph(req(), { allPages: true }, deps(evil)); expect(evil).toHaveBeenCalledTimes(1); expect(e.nextLink).toBeNull()
    // and a hostile start url is rejected outright
    expect((await executeGraph(req(), { startUrl: 'https://evil.example/x' }, deps(evil))).ok).toBe(false)
  })
  it('single-page mode surfaces the next link for pagination controls', async () => {
    const r = await executeGraph(req(), {}, deps(async () => json({ value: [{ id: 1 }], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?$skiptoken=a' })))
    expect(r.nextLink).toContain('skiptoken')
  })
  it('retries once on a short 429, then reports longer throttling with retry-after guidance', async () => {
    let calls = 0
    const short = vi.fn<FetchLike>(async () => ++calls === 1 ? new Response('{}', { status: 429, headers: { 'retry-after': '2' } }) : json({ value: [] }))
    expect((await executeGraph(req(), {}, deps(short))).ok).toBe(true); expect(short).toHaveBeenCalledTimes(2)
    const long = vi.fn<FetchLike>(async () => new Response(JSON.stringify({ error: { code: 'TooManyRequests', message: 'slow down' } }), { status: 429, headers: { 'retry-after': '90' } }))
    const r = await executeGraph(req(), {}, deps(long))
    expect(long).toHaveBeenCalledTimes(1); expect(r).toMatchObject({ ok: false, httpStatus: 429, retryAfterSeconds: 90 }); expect(r.error).toMatch(/Wait 90 seconds/)
  })
  it('explains 403/404/400 errors and never echoes a token that Graph repeats back', async () => {
    const r403 = await executeGraph(req(), {}, deps(async () => json({ error: { code: 'Forbidden', message: 'denied' } }, { status: 403 })))
    expect(r403.error).toMatch(/permission/)
    const r400 = await executeGraph(req(), {}, deps(async () => json({ error: { code: 'Request_BadRequest', message: `bad filter Authorization: Bearer ${TOKEN}` } }, { status: 400 })))
    expect(JSON.stringify(r400)).not.toContain('SECRETTOKEN')
  })
  it('handles network failures and oversized responses', async () => {
    const r = await executeGraph(req(), {}, deps(async () => { throw new Error('ECONNRESET') })); expect(r).toMatchObject({ ok: false, httpStatus: 0 })
    const big = await executeGraph(req(), {}, deps(async () => new Response('x', { status: 200, headers: { 'content-length': String(6 * 1024 * 1024) } })))
    expect(big.ok).toBe(false); expect(big.error).toMatch(/5 MB/)
  })
  it('sends a JSON body only for write methods', async () => {
    const f = vi.fn<FetchLike>(async () => json({ ok: 1 }))
    await executeGraph(req({ method: 'PATCH', endpoint: '/devices/abc', body: { displayName: 'x' } }), {}, deps(f))
    expect(f.mock.calls[0]![1]).toMatchObject({ method: 'PATCH', body: '{"displayName":"x"}' })
  })
})
