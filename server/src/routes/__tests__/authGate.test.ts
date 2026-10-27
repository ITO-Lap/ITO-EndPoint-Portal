import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'net'
import authRouter from '../auth.js'
import { requireSessionExceptAuth } from '../../middleware/requireSession.js'

let server: http.Server
let base = ''

beforeAll(async () => {
  const app = express()
  app.use(express.json())
  app.use('/api', requireSessionExceptAuth)
  app.get('/api/whoami', (req, res) => res.json({ role: req.headers['x-user-role'], email: req.headers['x-user-email'] }))
  app.use('/api/auth', authRouter)
  server = http.createServer(app)
  await new Promise<void>(r => server.listen(0, r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>(r => server.close(() => r())))
beforeEach(() => vi.stubEnv('AUTH_PASSWORDLESS', 'true')) // the tests below use email sign-in, which is off by default
afterEach(() => vi.unstubAllEnvs())

const call = async (method: string, path: string, opts: { headers?: Record<string, string>; body?: unknown } = {}) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...opts.headers }, ...(opts.body ? { body: JSON.stringify(opts.body) } : {}) })
  return { status: res.status, json: await res.json() as Record<string, any> }
}
const signIn = async () => (await call('POST', '/api/auth/session', { body: { email: 'avinash.verma@zinnia.com' } })).json['data'].token as string

describe('API gate', () => {
  it('rejects API calls with no token, a bad token, and header-only role claims', async () => {
    expect((await call('GET', '/api/whoami')).status).toBe(401)
    expect((await call('GET', '/api/whoami', { headers: { Authorization: 'Bearer junk' } })).status).toBe(401)
    expect((await call('GET', '/api/whoami', { headers: { 'x-user-role': 'Global Admin', 'x-user-email': 'avinash.verma@zinnia.com' } })).status).toBe(401)
  })

  it('lets a signed-in user through and overwrites spoofed identity headers with the verified ones', async () => {
    const r = await call('GET', '/api/whoami', { headers: { Authorization: `Bearer ${await signIn()}`, 'x-user-role': 'End User', 'x-user-email': 'attacker@evil.test' } })
    expect(r).toMatchObject({ status: 200, json: { role: 'Global Admin', email: 'avinash.verma@zinnia.com' } })
  })

  it('can be switched off for local debugging', async () => {
    vi.stubEnv('AUTH_ENFORCED', 'false')
    expect((await call('GET', '/api/whoami')).status).toBe(200)
  })
})

describe('sign-in endpoints', () => {
  it('refuses email sign-in by default, even for the allow-listed email', async () => {
    vi.stubEnv('AUTH_PASSWORDLESS', '')
    const r = await call('POST', '/api/auth/session', { body: { email: 'avinash.verma@zinnia.com' } })
    expect(r.status).toBe(403)
    expect(r.json['data']).toBeUndefined()
    expect((await call('GET', '/api/auth/config')).json['data']).toMatchObject({ emailSignIn: false })
  })
  it('signs in the allow-listed email and returns the user', async () => {
    const r = await call('POST', '/api/auth/session', { body: { email: 'avinash.verma@zinnia.com' } })
    expect(r.status).toBe(200)
    expect(r.json['data'].user).toEqual({ email: 'avinash.verma@zinnia.com', displayName: 'Avinash Verma', role: 'Global Admin' })
  })
  it('refuses other emails without issuing a token', async () => {
    const r = await call('POST', '/api/auth/session', { body: { email: 'someone.else@zinnia.com' } })
    expect(r.status).toBe(403)
    expect(r.json['data']).toBeUndefined()
  })
  it('requires the password when AUTH_PASSWORD is set, and /config says so', async () => {
    vi.stubEnv('AUTH_PASSWORD', 'pw')
    expect((await call('GET', '/api/auth/config')).json['data']).toMatchObject({ passwordRequired: true, enforced: true, emailSignIn: true })
    expect((await call('POST', '/api/auth/session', { body: { email: 'avinash.verma@zinnia.com' } })).status).toBe(401)
    expect((await call('POST', '/api/auth/session', { body: { email: 'avinash.verma@zinnia.com', password: 'pw' } })).status).toBe(200)
  })
  it('/me returns the user for a valid token and 401 otherwise', async () => {
    expect((await call('GET', '/api/auth/me', { headers: { Authorization: `Bearer ${await signIn()}` } })).json['data'].email).toBe('avinash.verma@zinnia.com')
    expect((await call('GET', '/api/auth/me')).status).toBe(401)
  })
})
