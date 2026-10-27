import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import { authenticate, emailSignInEnabled, displayNameFor, signSession, verifySession, SESSION_SECRET } from '../session.js'

afterEach(() => vi.unstubAllEnvs())

describe('authenticate (AUTH_PASSWORDLESS=true)', () => {
  beforeEach(() => vi.stubEnv('AUTH_PASSWORDLESS', 'true'))
  it('signs in the default allow-listed email as Global Admin, ignoring case and spaces', () => {
    const r = authenticate('  Avinash.Verma@Zinnia.com ')
    expect(r).toEqual({ ok: true, claims: { email: 'avinash.verma@zinnia.com', displayName: 'Avinash Verma', role: 'Global Admin' } })
  })
  it('rejects any other email, and non-string input', () => {
    expect(authenticate('someone@zinnia.com')).toMatchObject({ ok: false, status: 403 })
    expect(authenticate('')).toMatchObject({ ok: false, status: 403 })
    expect(authenticate(undefined)).toMatchObject({ ok: false, status: 403 })
    expect(authenticate({ email: 'avinash.verma@zinnia.com' })).toMatchObject({ ok: false })
  })
  it('honours AUTH_ALLOWED_EMAILS', () => {
    vi.stubEnv('AUTH_ALLOWED_EMAILS', 'a@zinnia.com, b@zinnia.com')
    expect(authenticate('b@zinnia.com').ok).toBe(true)
    expect(authenticate('avinash.verma@zinnia.com').ok).toBe(false)
  })
})

describe('email sign-in is off by default', () => {
  it('refuses even the allow-listed email: Microsoft sign-in is the only way in', () => {
    expect(emailSignInEnabled()).toBe(false)
    expect(authenticate('avinash.verma@zinnia.com')).toMatchObject({ ok: false, status: 403, error: expect.stringContaining('Microsoft account') })
  })
  it('is turned on by AUTH_PASSWORDLESS=true, or by configuring a password', () => {
    vi.stubEnv('AUTH_PASSWORDLESS', 'true')
    expect(emailSignInEnabled()).toBe(true)
    vi.stubEnv('AUTH_PASSWORDLESS', '')
    vi.stubEnv('AUTH_PASSWORD', 'pw')
    expect(emailSignInEnabled()).toBe(true)
    expect(authenticate('avinash.verma@zinnia.com', 'pw').ok).toBe(true)
  })
})

describe('authenticate (AUTH_PASSWORD set)', () => {
  it('requires the password, and gives one message for a wrong password or an unknown email', () => {
    vi.stubEnv('AUTH_PASSWORD', 's3cret')
    expect(authenticate('avinash.verma@zinnia.com', 's3cret').ok).toBe(true)
    const wrongPassword = authenticate('avinash.verma@zinnia.com', 'nope')
    const unknownEmail = authenticate('other@zinnia.com', 's3cret')
    expect(wrongPassword).toEqual({ ok: false, status: 401, error: 'Incorrect email or password.' })
    expect(unknownEmail).toEqual(wrongPassword)
    expect(authenticate('avinash.verma@zinnia.com').ok).toBe(false)
  })
})

describe('session tokens', () => {
  const claims = { email: 'a@zinnia.com', displayName: 'A', role: 'Global Admin' }
  it('round-trips', () => expect(verifySession(signSession(claims))).toEqual(claims))
  it('rejects tampered, wrongly signed, expired and incomplete tokens', () => {
    const token = signSession(claims)
    expect(verifySession(token.slice(0, -2) + 'xx')).toBeNull()
    expect(verifySession(jwt.sign(claims, 'another-secret'))).toBeNull()
    expect(verifySession(jwt.sign(claims, SESSION_SECRET, { expiresIn: -10 }))).toBeNull()
    expect(verifySession(jwt.sign({ email: 'a@zinnia.com' }, SESSION_SECRET))).toBeNull()
    expect(verifySession('not-a-token')).toBeNull()
  })
})

describe('displayNameFor', () => {
  it('turns an email local part into a name', () => {
    expect(displayNameFor('avinash.verma@zinnia.com')).toBe('Avinash Verma')
    expect(displayNameFor('it_admin@zinnia.com')).toBe('It Admin')
  })
})
