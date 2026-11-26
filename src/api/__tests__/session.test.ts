import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { installAuthFetch, saveSession, getSession, clearSession, signIn, fetchCurrentUser } from '../session'

const user = { email: 'avinash.verma@zinnia.com', displayName: 'Avinash Verma', role: 'Global Admin', permissions: {} }
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
let base: ReturnType<typeof vi.fn>
let uninstall: () => void

beforeEach(() => {
  localStorage.clear()
  base = vi.fn(async () => ok({ success: true }))
  window.fetch = base as unknown as typeof window.fetch
})
afterEach(() => uninstall?.())

const authHeader = (call: number) => new Headers((base.mock.calls[call]![1] as RequestInit).headers).get('Authorization')

describe('installAuthFetch', () => {
  it('adds the Bearer token to /api requests only', async () => {
    saveSession({ token: 'tok', user })
    uninstall = installAuthFetch(() => {})
    await fetch('/api/devices')
    await fetch('https://example.com/other')
    expect(authHeader(0)).toBe('Bearer tok')
    expect(base.mock.calls[1]![1]).toBeUndefined()
  })

  it('does nothing when signed out', async () => {
    uninstall = installAuthFetch(() => {})
    await fetch('/api/devices')
    expect(base.mock.calls[0]![1]).toBeUndefined()
  })

  it('drops the session and reports expiry on a 401 from a signed-in request', async () => {
    saveSession({ token: 'tok', user })
    base.mockResolvedValue(ok({ success: false }, 401))
    const onExpired = vi.fn()
    uninstall = installAuthFetch(onExpired)
    await fetch('/api/devices')
    expect(onExpired).toHaveBeenCalledOnce()
    expect(getSession()).toBeNull()
  })

  it('does not treat a failed sign-in as an expired session', async () => {
    saveSession({ token: 'tok', user })
    base.mockResolvedValue(ok({ success: false }, 401))
    const onExpired = vi.fn()
    uninstall = installAuthFetch(onExpired)
    await fetch('/api/auth/session', { method: 'POST' })
    expect(onExpired).not.toHaveBeenCalled()
  })
})

describe('signIn and fetchCurrentUser', () => {
  beforeEach(() => { uninstall = () => {} })

  it('stores the session and remembers the email on success', async () => {
    base.mockResolvedValue(ok({ success: true, data: { token: 't', user } }))
    expect(await signIn('avinash.verma@zinnia.com')).toEqual(user)
    expect(getSession()).toEqual({ token: 't', user })
    expect(JSON.parse((base.mock.calls[0]![1] as RequestInit).body as string)).toEqual({ email: 'avinash.verma@zinnia.com' })
  })

  it('throws the server message on refusal and stores nothing', async () => {
    base.mockResolvedValue(ok({ success: false, error: 'This email is not authorised to use EndPoint+.' }, 403))
    await expect(signIn('x@zinnia.com')).rejects.toThrow('not authorised')
    expect(getSession()).toBeNull()
  })

  it('fetchCurrentUser returns null without a token and clears an invalid one', async () => {
    expect(await fetchCurrentUser()).toBeNull()
    expect(base).not.toHaveBeenCalled()
    saveSession({ token: 'old', user })
    base.mockResolvedValue(ok({ success: false }, 401))
    expect(await fetchCurrentUser()).toBeNull()
    expect(getSession()).toBeNull()
  })

  it('fetchCurrentUser keeps the session when the server is unreachable', async () => {
    saveSession({ token: 't', user })
    base.mockRejectedValue(new TypeError('network'))
    expect(await fetchCurrentUser()).toEqual(user)
    clearSession()
  })
})
