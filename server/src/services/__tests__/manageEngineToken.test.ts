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
