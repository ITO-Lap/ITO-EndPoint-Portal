import { describe, it, expect, vi, beforeEach } from 'vitest'
import { zohoFetch } from '../manageEngine.js'

const cfg = { clientId: 'cid-zf', clientSecret: 's', refreshToken: 'r', apiDomain: 'https://x.example' }
const tokenRes = (t: string) => new Response(JSON.stringify({ access_token: t, expires_in: 3600 }), { status: 200 })

describe('zohoFetch', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('refreshes the token and retries once on 401 INVALID_OAUTHTOKEN', async () => {
    const seen: string[] = []
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url)
      if (u.includes('/oauth/v2/token')) return tokenRes(`tok-${seen.length + 1}`)
      const auth = (init?.headers as Record<string, string>).Authorization as string
      seen.push(auth)
      return auth.endsWith('tok-1')
        ? new Response('{"errorMsg":"INVALID_OAUTHTOKEN"}', { status: 401 })
        : new Response('{}', { status: 200 })
    }) as typeof fetch
    const res = await zohoFetch(cfg, 'https://x.example/api')
    expect(res.status).toBe(200)
    expect(seen).toHaveLength(2)
    expect(seen[0]).not.toBe(seen[1])
  })
})
