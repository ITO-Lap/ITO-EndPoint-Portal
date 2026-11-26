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

describe('session lifetime, restart and inactivity', () => {
  const claims = { email: 'a@zinnia.com', displayName: 'A', role: 'Global Admin' }

  it('lasts 9 hours at most', async () => {
    const { SESSION_TTL_SECS } = await import('../session.js')
    expect(SESSION_TTL_SECS).toBe(9 * 3600)
    const p = jwt.decode(signSession(claims)) as { iat: number; exp: number }
    expect(p.exp - p.iat).toBe(9 * 3600)
  })

  it('rejects a token issued before this server start', () => {
    const old = jwt.sign({ ...claims, bid: 'previous-boot' }, SESSION_SECRET, { expiresIn: 60 })
    expect(verifySession(old)).toBeNull()
    const legacy = jwt.sign(claims, SESSION_SECRET, { expiresIn: 60 }) // no boot id at all
    expect(verifySession(legacy)).toBeNull()
    expect(verifySession(signSession(claims))).toMatchObject({ email: 'a@zinnia.com' })
  })
})

describe('auto sign-out', () => {
  it('defaults to 60 minutes and only accepts 15, 30, 45 or 60', async () => {
    const { getIdleTimeoutMin, setIdleTimeoutMin, isIdleTimeout, DEFAULT_IDLE_TIMEOUT_MIN } = await import('../../store/sessionSettings.js')
    expect(DEFAULT_IDLE_TIMEOUT_MIN).toBe(60)
    expect(getIdleTimeoutMin()).toBe(60)
    expect([15, 30, 45, 60].every(isIdleTimeout)).toBe(true)
    expect([0, 10, 20, 90, '30', null].some(isIdleTimeout)).toBe(false)
    setIdleTimeoutMin(45, 'a@zinnia.com')
    expect(getIdleTimeoutMin()).toBe(45)
    setIdleTimeoutMin(15, 'a@zinnia.com')
  })

  it('expires a session only after the idle time passes without activity', async () => {
    const { touchSession, isIdleExpired } = await import('../session.js')
    const t = signSession({ email: 'b@zinnia.com', displayName: 'B', role: 'IT Admin' })
    const t0 = 1_000_000
    touchSession(t, t0)
    expect(isIdleExpired(t, t0 + 14 * 60_000)).toBe(false)
    expect(isIdleExpired(t, t0 + 16 * 60_000)).toBe(true)
    touchSession(t, t0 + 16 * 60_000) // activity resets the clock
    expect(isIdleExpired(t, t0 + 20 * 60_000)).toBe(false)
  })
})
