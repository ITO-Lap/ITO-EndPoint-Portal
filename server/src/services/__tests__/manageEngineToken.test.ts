import { describe, it, expect, vi, afterEach } from 'vitest'

const cfg = { clientId: 'cid-token-test', clientSecret: 's', refreshToken: 'r', apiDomain: 'https://mdm.example' }
const tokenResponse = () => new Response(JSON.stringify({ access_token: 'TOKEN-1', expires_in: 3600, scope: 'a b' }), { status: 200 })

afterEach(() => vi.unstubAllGlobals())

describe('ManageEngine token persistence', () => {
  it('reuses a saved token after a restart instead of asking Zoho again', async () => {
    const f = vi.fn().mockImplementation(async () => tokenResponse()); vi.stubGlobal('fetch', f)
    vi.resetModules()
    const first = await import('../manageEngine.js')
    expect(await first.getAccessToken(cfg)).toBe('TOKEN-1')
    expect(f).toHaveBeenCalledTimes(1)

    vi.resetModules()                                   // simulates a server restart: memory cache is gone
    const second = await import('../manageEngine.js')
    expect(await second.getAccessToken(cfg)).toBe('TOKEN-1')
    expect(f).toHaveBeenCalledTimes(1)
    expect(await second.getGrantedScopes(cfg)).toEqual(['a', 'b'])
  })

  it('explains Zoho throttling instead of a bare 400', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Access Denied', error_description: 'You have made too many requests continuously.' }), { status: 400 })))
    vi.resetModules()
    const me = await import('../manageEngine.js')
    await expect(me.getAccessToken({ ...cfg, clientId: 'other-client' })).rejects.toThrow(/rate-limited by Zoho/)
  })
})

describe('ManageEngine 401 handling under concurrency', () => {
  it('mints one replacement token for a burst of simultaneous 401s instead of one per request', async () => {
    let mints = 0
    const f = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes('accounts.zoho.com')) { mints++; await new Promise(r => setTimeout(r, 20)); return new Response(JSON.stringify({ access_token: `T${mints}`, expires_in: 3600, scope: 'a' }), { status: 200 }) }
      const auth = (init?.headers as Record<string, string>)['Authorization']
      // only the newest token is accepted, like Zoho revoking older ones
      return new Response('{}', { status: auth === `Zoho-oauthtoken T${mints}` && mints > 1 ? 200 : 401 })
    })
    vi.stubGlobal('fetch', f)
    vi.resetModules()
    const me = await import('../manageEngine.js')
    const c = { ...cfg, clientId: 'cid-concurrency' }
    await me.getAccessToken(c) // T1 — treated as revoked by the fake API
    const results = await Promise.all(Array.from({ length: 8 }, () => me.zohoFetch(c, 'https://mdm.example/api/v1/mdm/devices')))
    expect(results.map(r => r.status)).toEqual(Array(8).fill(200))
    expect(mints).toBe(2) // 1 initial + exactly 1 replacement
  })
})

describe('ManageEngine revoked saved token', () => {
  it('does not bring a revoked token back from the backup file after a 401', async () => {
    let mints = 0
    const f = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes('accounts.zoho.com')) { mints++; return new Response(JSON.stringify({ access_token: `R${mints}`, expires_in: 3600, scope: 'a' }), { status: 200 }) }
      return new Response('{}', { status: (init?.headers as Record<string, string>)['Authorization'] === 'Zoho-oauthtoken R1' ? 401 : 200 })
    })
    vi.stubGlobal('fetch', f)
    const c = { ...cfg, clientId: 'cid-revoked' }
    vi.resetModules()
    const first = await import('../manageEngine.js')
    await first.getAccessToken(c)                       // R1 is saved to disk
    const { dataFile } = await import('../../store/dataDir.js')
    const { copyFileSync } = await import('node:fs')
    const file = dataFile('manageengine-token.json')
    copyFileSync(file, `${file}.bak`)                   // writeFileAtomic keeps the previous copy as <file>.bak
    vi.resetModules()                                   // "restart": the revoked R1 is only on disk now
    const me = await import('../manageEngine.js')
    const res = await me.zohoFetch(c, 'https://mdm.example/api/v1/mdm/devices')
    expect(res.status).toBe(200)
    expect(mints).toBe(2)
  })
})
