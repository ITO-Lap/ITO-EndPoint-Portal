import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'net'

vi.mock('../../store/integrationStore.js', () => ({ getEntraConfig: () => ({ tenantId: 'tenant-1', clientId: 'client-1', clientSecret: 'secret-1' }) }))

import authRouter from '../auth.js'
import jwt from 'jsonwebtoken'
import { SESSION_SECRET, verifySession } from '../../services/session.js'

let server: http.Server
let base = ''
const realFetch = globalThis.fetch
let profile: Record<string, unknown>
let memberOf: { status: number; body: unknown }
let memberOfPage2: unknown = { value: [] }

beforeAll(async () => {
  const app = express()
  app.use(express.json())
  app.use('/api/auth', authRouter)
  server = http.createServer(app)
  await new Promise<void>(r => server.listen(0, r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>(r => server.close(() => r())))

beforeEach(() => {
  profile = { displayName: 'Pat Example', userPrincipalName: 'pat@zinnia.com', mail: 'pat@zinnia.com', id: 'user-1' }
  memberOf = { status: 200, body: { value: [{ id: 'g-itadmin', displayName: 'ITO EndPoint Portal' }] } }
  memberOfPage2 = { value: [] }
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.startsWith(base)) return realFetch(input, init)
    if (url.includes('/oauth2/v2.0/token')) return new Response(JSON.stringify({ access_token: 'graph-token', id_token: 'id', expires_in: 3600 }))
    if (url.includes('/me?')) return new Response(JSON.stringify(profile))
    if (url.includes('skiptoken=page2')) return new Response(JSON.stringify(memberOfPage2))
    if (url.includes('/transitiveMemberOf/microsoft.graph.group')) return new Response(JSON.stringify(memberOf.body), { status: memberOf.status })
    return new Response('{}', { status: 404 })
  })
})

async function callback(code = 'abc', stateOverride?: string): Promise<{ status: number; location: URL }> {
  const login = await realFetch(`${base}/api/auth/login`).then(r => r.json()) as { data: { url: string } }
  const state = stateOverride ?? new URL(login.data.url).searchParams.get('state')!
  const res = await realFetch(`${base}/api/auth/callback?code=${code}&state=${state}`, { redirect: 'manual' })
  return { status: res.status, location: new URL(res.headers.get('location')!) }
}
const tokenFrom = (location: URL) => new URLSearchParams(location.hash.slice(1)).get('session_token')

describe('Microsoft sign-in', () => {
  it('builds a single-tenant authorize URL with the configured redirect URI and /config advertises it', async () => {
    const login = await realFetch(`${base}/api/auth/login`).then(r => r.json()) as { data: { url: string } }
    const url = new URL(login.data.url)
    expect(url.pathname).toBe('/tenant-1/oauth2/v2.0/authorize')
    expect(url.searchParams.get('client_id')).toBe('client-1')
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:4000/api/auth/callback')
    expect(url.searchParams.get('state')).toBeTruthy()
    const config = await realFetch(`${base}/api/auth/config`).then(r => r.json()) as { data: Record<string, unknown> }
    expect(config.data).toMatchObject({ microsoft: true, emailSignIn: false })
  })

  it('signs a member of the IT Admin group in, returning the token in the URL fragment (not the query)', async () => {
    const { status, location } = await callback()
    expect(status).toBe(302)
    expect(location.search).toBe('')
    expect(verifySession(tokenFrom(location)!)).toEqual({ email: 'pat@zinnia.com', displayName: 'Pat Example', role: 'IT Admin' })
  })

  it('maps the Desktop Support group to Helpdesk', async () => {
    memberOf = { status: 200, body: { value: [{ displayName: 'Desktop Support' }] } }
    expect(verifySession(tokenFrom((await callback()).location)!)?.role).toBe('Helpdesk')
  })

  it('gives an allow-listed email Global Admin without needing a group', async () => {
    profile = { displayName: 'Avinash Verma', userPrincipalName: 'avinash.verma@zinnia.com', mail: 'avinash.verma@zinnia.com', id: 'user-2' }
    memberOf = { status: 500, body: {} }
    expect(verifySession(tokenFrom((await callback()).location)!)).toMatchObject({ email: 'avinash.verma@zinnia.com', role: 'Global Admin' })
  })

  it('matches the group name ignoring case and spaces ("ITO Endpoint Portal" is the same group)', async () => {
    memberOf = { status: 200, body: { value: [{ displayName: '  ITO Endpoint Portal ' }] } }
    expect(verifySession(tokenFrom((await callback()).location)!)?.role).toBe('IT Admin')
  })

  it('finds the group on a later page of results, not just the first', async () => {
    memberOf = { status: 200, body: { value: [{ displayName: 'Marketing' }], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/users/user-1/transitiveMemberOf/microsoft.graph.group?$skiptoken=page2' } }
    memberOfPage2 = { value: [{ displayName: 'Desktop Support' }] }
    expect(verifySession(tokenFrom((await callback()).location)!)?.role).toBe('Helpdesk')
  })

  it('asks Graph for transitive membership, so nested group members are included', async () => {
    vi.mocked(globalThis.fetch).mockClear()
    await callback()
    const groupCalls = vi.mocked(globalThis.fetch).mock.calls.map(([u]) => String(u)).filter(u => u.includes('MemberOf'))
    expect(groupCalls.length).toBeGreaterThan(0)
    expect(groupCalls.every(u => u.includes('/transitiveMemberOf/microsoft.graph.group'))).toBe(true)
  })

  it('uses AUTH_IT_ADMIN_GROUP when set, and says in the log what it did find when refusing', async () => {
    vi.stubEnv('AUTH_IT_ADMIN_GROUP', 'Zinnia Endpoint Admins')
    memberOf = { status: 200, body: { value: [{ displayName: 'ITO EndPoint Portal' }, { displayName: 'Marketing' }] } }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { location } = await callback()
    expect(location.searchParams.get('auth_error')).toContain("'Zinnia Endpoint Admins'")
    expect(warn.mock.calls.flat().join(' ')).toContain('belongs to 2 group(s)')
    expect(warn.mock.calls.flat().join(' ')).toContain('Similar names: ITO EndPoint Portal')
    warn.mockRestore()
    vi.unstubAllEnvs()
  })

  it('denies a Zinnia user who is in neither group, without issuing a token', async () => {
    memberOf = { status: 200, body: { value: [{ displayName: 'Marketing' }] } }
    const { location } = await callback()
    expect(location.searchParams.get('auth_error')).toContain('Access denied. pat@zinnia.com is not assigned a role and is not a member')
    expect(tokenFrom(location)).toBeNull()
  })

  it('says membership could not be checked, rather than "access denied", when the group lookup fails', async () => {
    memberOf = { status: 403, body: { error: 'Forbidden' } }
    const { location } = await callback()
    expect(location.searchParams.get('auth_error')).toContain('group membership could not be checked')
    expect(location.searchParams.get('auth_error')).toContain('GroupMember.Read.All')
    expect(tokenFrom(location)).toBeNull()
  })

  it('rejects an unknown, tampered or expired state', async () => {
    expect((await callback('abc', 'not-a-real-state')).location.searchParams.get('auth_error')).toContain('Invalid or expired auth state')
    const expired = jwt.sign({ purpose: 'oauth-state' }, SESSION_SECRET, { expiresIn: -5 })
    expect((await callback('abc', expired)).location.searchParams.get('auth_error')).toContain('Invalid or expired auth state')
    const wrongPurpose = jwt.sign({ purpose: 'something-else' }, SESSION_SECRET, { expiresIn: 60 })
    expect((await callback('abc', wrongPurpose)).location.searchParams.get('auth_error')).toContain('Invalid or expired auth state')
  })

  it('accepts a state issued before a restart, since it is signed rather than remembered in memory', async () => {
    // A valid signed state that was never issued by this process instance (as after a server restart).
    const issuedEarlier = jwt.sign({ purpose: 'oauth-state', nonce: 'earlier-run' }, SESSION_SECRET, { expiresIn: 600 })
    expect(verifySession(tokenFrom((await callback('abc', issuedEarlier)).location)!)?.role).toBe('IT Admin')
  })

  it('logs why a sign-in failed, without logging the code', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    memberOf = { status: 200, body: { value: [] } }
    await callback('secret-code-123')
    const logged = warn.mock.calls.flat().join(' ')
    expect(logged).toContain('[auth] Microsoft sign-in failed: Access denied. pat@zinnia.com')
    expect(logged).not.toContain('secret-code-123')
    warn.mockRestore()
  })

  describe('deployed host', () => {
    const deployed = { 'x-forwarded-host': 'ito-endpoint.deployhub.zinnia.io', 'x-forwarded-proto': 'https' }
    const loginUrl = async (headers: Record<string, string>) => new URL(((await realFetch(`${base}/api/auth/login`, { headers }).then(r => r.json())) as { data: { url: string } }).data.url)

    it('tells Microsoft to return to the deployed site, not localhost', async () => {
      expect((await loginUrl(deployed)).searchParams.get('redirect_uri')).toBe('https://ito-endpoint.deployhub.zinnia.io/api/auth/callback')
    })

    it('sends the browser back to the deployed site after sign-in, and redeems the code with the same redirect URI', async () => {
      const state = (await loginUrl(deployed)).searchParams.get('state')!
      vi.mocked(globalThis.fetch).mockClear()
      const res = await realFetch(`${base}/api/auth/callback?code=abc&state=${state}`, { redirect: 'manual', headers: deployed })
      const location = new URL(res.headers.get('location')!)
      expect(location.origin).toBe('https://ito-endpoint.deployhub.zinnia.io')
      expect(verifySession(tokenFrom(location)!)?.role).toBe('IT Admin')
      const exchange = vi.mocked(globalThis.fetch).mock.calls.find(([u, init]) => String(u).includes('/oauth2/v2.0/token') && String(init?.body).includes('authorization_code'))
      expect(new URLSearchParams(String(exchange![1]!.body)).get('redirect_uri')).toBe('https://ito-endpoint.deployhub.zinnia.io/api/auth/callback')
    })

    it('keeps the localhost defaults on localhost, and lets AUTH_REDIRECT_URI / FRONTEND_URL override', async () => {
      expect((await loginUrl({})).searchParams.get('redirect_uri')).toBe('http://localhost:4000/api/auth/callback')
      vi.stubEnv('AUTH_REDIRECT_URI', 'https://custom.example/api/auth/callback')
      vi.stubEnv('FRONTEND_URL', 'https://custom.example')
      expect((await loginUrl(deployed)).searchParams.get('redirect_uri')).toBe('https://custom.example/api/auth/callback')
      const state = (await loginUrl(deployed)).searchParams.get('state')!
      const res = await realFetch(`${base}/api/auth/callback?code=abc&state=${state}`, { redirect: 'manual', headers: deployed })
      expect(new URL(res.headers.get('location')!).origin).toBe('https://custom.example')
      vi.unstubAllEnvs()
    })
  })

  describe('production behind a proxy that hides the host', () => {
    afterEach(() => vi.unstubAllEnvs())
    it('refuses Microsoft sign-in with a clear message rather than sending users to localhost', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      const res = await realFetch(`${base}/api/auth/login`)
      expect(res.status).toBe(503)
      expect(((await res.json()) as { error: string }).error).toContain('AUTH_REDIRECT_URI and FRONTEND_URL')
      expect((await realFetch(`${base}/api/auth/callback?code=a&state=b`, { redirect: 'manual' })).status).toBe(503)
    })
    it('works once both settings are provided, or once the proxy forwards the real host', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('AUTH_REDIRECT_URI', 'https://ito-endpoint.deployhub.zinnia.io/api/auth/callback')
      vi.stubEnv('FRONTEND_URL', 'https://ito-endpoint.deployhub.zinnia.io')
      expect((await realFetch(`${base}/api/auth/login`)).status).toBe(200)
      vi.unstubAllEnvs()
      vi.stubEnv('NODE_ENV', 'production')
      const forwarded = await realFetch(`${base}/api/auth/login`, { headers: { 'x-forwarded-host': 'ito-endpoint.deployhub.zinnia.io', 'x-forwarded-proto': 'https' } })
      expect(forwarded.status).toBe(200)
    })
  })

  describe('matching groups by Object ID', () => {
    afterEach(() => vi.unstubAllEnvs())
    it('does not accept a same-named group with a different ID once an ID is configured', async () => {
      vi.stubEnv('AUTH_IT_ADMIN_GROUP_ID', 'f8824510-8aad-4735-b458-bdb6bf32ece3')
      memberOf = { status: 200, body: { value: [{ id: 'some-other-id', displayName: 'ITO EndPoint Portal' }] } }
      const { location } = await callback()
      expect(location.searchParams.get('auth_error')).toContain('Access denied')
      expect(tokenFrom(location)).toBeNull()
    })
    it('grants the role by ID even when the group has a different display name', async () => {
      vi.stubEnv('AUTH_IT_ADMIN_GROUP_ID', 'F8824510-8AAD-4735-B458-BDB6BF32ECE3')
      memberOf = { status: 200, body: { value: [{ id: 'f8824510-8aad-4735-b458-bdb6bf32ece3', displayName: 'Renamed Group' }] } }
      expect(verifySession(tokenFrom((await callback()).location)!)?.role).toBe('IT Admin')
    })
    it('maps the helpdesk group by ID', async () => {
      vi.stubEnv('AUTH_HELPDESK_GROUP', 'ITOps desktops')
      vi.stubEnv('AUTH_HELPDESK_GROUP_ID', '51a27c4a-6a12-4db0-9546-aa2364cc5b5e')
      memberOf = { status: 200, body: { value: [{ id: '51a27c4a-6a12-4db0-9546-aa2364cc5b5e', displayName: 'ITOps desktops' }] } }
      expect(verifySession(tokenFrom((await callback()).location)!)?.role).toBe('Helpdesk')
    })
  })
})
