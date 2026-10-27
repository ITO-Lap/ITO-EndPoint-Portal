import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'net'

vi.mock('../../store/integrationStore.js', () => ({ getEntraConfig: () => ({ tenantId: 'tenant-1', clientId: 'client-1', clientSecret: 'secret-1' }) }))

import authRouter from '../auth.js'
import { verifySession } from '../../services/session.js'

let server: http.Server
let base = ''
const realFetch = globalThis.fetch
let profile: Record<string, unknown>
let memberOf: { status: number; body: unknown }

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
  memberOf = { status: 200, body: { value: [{ displayName: 'ITO EndPoint Portal' }] } }
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.startsWith(base)) return realFetch(input, init)
    if (url.includes('/oauth2/v2.0/token')) return new Response(JSON.stringify({ access_token: 'graph-token', id_token: 'id', expires_in: 3600 }))
    if (url.includes('/me?')) return new Response(JSON.stringify(profile))
    if (url.includes('/memberOf')) return new Response(JSON.stringify(memberOf.body), { status: memberOf.status })
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

  it('denies a Zinnia user who is in neither group, without issuing a token', async () => {
    memberOf = { status: 200, body: { value: [{ displayName: 'Marketing' }] } }
    const { location } = await callback()
    expect(location.searchParams.get('auth_error')).toContain('Access denied. pat@zinnia.com is not a member')
    expect(tokenFrom(location)).toBeNull()
  })

  it('says membership could not be checked, rather than "access denied", when the group lookup fails', async () => {
    memberOf = { status: 403, body: { error: 'Forbidden' } }
    const { location } = await callback()
    expect(location.searchParams.get('auth_error')).toContain('group membership could not be checked')
    expect(location.searchParams.get('auth_error')).toContain('GroupMember.Read.All')
    expect(tokenFrom(location)).toBeNull()
  })

  it('rejects an unknown or reused state', async () => {
    expect((await callback('abc', 'not-a-real-state')).location.searchParams.get('auth_error')).toContain('Invalid or expired auth state')
  })
})
