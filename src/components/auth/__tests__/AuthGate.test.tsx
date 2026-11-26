import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthGate } from '../AuthGate'
import { saveSession, getSession, __resetRedirectForTests } from '../../../api/session'

const user = { email: 'avinash.verma@zinnia.com', displayName: 'Avinash Verma', role: 'Global Admin', permissions: {} }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
let routes: Record<string, () => Response>

beforeEach(() => {
  localStorage.clear()
  __resetRedirectForTests()
  window.history.replaceState(null, '', '/')
  routes = { '/api/auth/config': () => json({ success: true, data: { passwordRequired: false, emailSignIn: true, microsoft: false } }) }
  window.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost').pathname
    return (routes[path] ?? (() => json({ success: false }, 404)))()
  }) as unknown as typeof window.fetch
})
afterEach(() => vi.restoreAllMocks())

const app = () => render(<AuthGate>{({ user: u, signOut }) => (<div><p>Welcome {u.displayName}</p><button onClick={signOut}>Sign out</button></div>)}</AuthGate>)

describe('AuthGate', () => {
  it('shows the login page, not the app, when signed out', async () => {
    app()
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByText(/Welcome Avinash/)).not.toBeInTheDocument()
    expect(screen.getByText(/Passwordless sign-in is enabled for now/)).toBeInTheDocument()
  })

  it('signs an authorised email in and shows the app', async () => {
    routes['/api/auth/session'] = () => json({ success: true, data: { token: 't', user } })
    app()
    await userEvent.type(await screen.findByLabelText('Work email'), 'avinash.verma@zinnia.com')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Welcome Avinash Verma')).toBeInTheDocument()
    expect(getSession()?.token).toBe('t')
  })

  it('shows the server message and stays on the login page for an unauthorised email', async () => {
    routes['/api/auth/session'] = () => json({ success: false, error: 'This email is not authorised to use EndPoint+.' }, 403)
    app()
    await userEvent.type(await screen.findByLabelText('Work email'), 'someone@zinnia.com')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('not authorised')
    expect(screen.queryByText(/Welcome Avinash/)).not.toBeInTheDocument()
  })

  it('asks for a password when the server requires one', async () => {
    routes['/api/auth/config'] = () => json({ success: true, data: { passwordRequired: true, emailSignIn: true, microsoft: false } })
    app()
    expect(await screen.findByLabelText('Password')).toBeInTheDocument()
    expect(screen.queryByText(/Passwordless sign-in/)).not.toBeInTheDocument()
  })

  it('restores a valid stored session without showing the login page', async () => {
    saveSession({ token: 't', user })
    routes['/api/auth/me'] = () => json({ success: true, data: user })
    app()
    expect(await screen.findByText('Welcome Avinash Verma')).toBeInTheDocument()
  })

  it('falls back to the login page when the stored session is no longer valid', async () => {
    saveSession({ token: 'old', user })
    routes['/api/auth/me'] = () => json({ success: false }, 401)
    app()
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    await waitFor(() => expect(getSession()).toBeNull())
  })

  it('returns to the login page on sign out', async () => {
    saveSession({ token: 't', user })
    routes['/api/auth/me'] = () => json({ success: true, data: user })
    app()
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(getSession()).toBeNull()
  })

  it('offers Microsoft sign-in and starts it', async () => {
    routes['/api/auth/config'] = () => json({ success: true, data: { passwordRequired: false, emailSignIn: true, microsoft: true } })
    routes['/api/auth/login'] = () => json({ success: true, data: { url: 'https://login.microsoftonline.com/t/oauth2/v2.0/authorize?x=1' } })
    const assign = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, set href(v: string) { assign(v) }, get href() { return 'http://localhost/' } } })
    try {
      app()
      await userEvent.click(await screen.findByRole('button', { name: /Sign in with Microsoft/ }))
      await waitFor(() => expect(assign).toHaveBeenCalledWith(expect.stringContaining('login.microsoftonline.com')))
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original })
    }
  })

  it('hides the email form when only Microsoft sign-in is enabled', async () => {
    routes['/api/auth/config'] = () => json({ success: true, data: { passwordRequired: false, emailSignIn: false, microsoft: true } })
    app()
    expect(await screen.findByRole('button', { name: /Sign in with Microsoft/ })).toBeInTheDocument()
    expect(screen.queryByLabelText('Work email')).not.toBeInTheDocument()
  })

  it('completes sign-in from the token Microsoft returns in the URL fragment, then clears it from the address bar', async () => {
    window.history.replaceState(null, '', '/#session_token=from-microsoft')
    routes['/api/auth/me'] = () => json({ success: true, data: user })
    app()
    expect(await screen.findByText('Welcome Avinash Verma')).toBeInTheDocument()
    expect(getSession()?.token).toBe('from-microsoft')
    expect(window.location.hash).toBe('')
  })

  it('shows the error Microsoft sign-in came back with, and clears it from the address bar', async () => {
    window.history.replaceState(null, '', '/?auth_error=Access%20denied.%20pat%40zinnia.com%20is%20not%20a%20member')
    app()
    expect(await screen.findByRole('alert')).toHaveTextContent('Access denied. pat@zinnia.com is not a member')
    expect(window.location.search).toBe('')
  })

  it('shows an error and the login page when the returned token is not valid', async () => {
    window.history.replaceState(null, '', '/#session_token=forged')
    routes['/api/auth/me'] = () => json({ success: false }, 401)
    app()
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be completed')
    expect(getSession()).toBeNull()
  })

  it('shows only Microsoft sign-in by default, with no email box and nothing prefilled', async () => {
    routes['/api/auth/config'] = () => json({ success: true, data: { passwordRequired: false, emailSignIn: false, microsoft: true } })
    localStorage.setItem('ito.lastEmail', 'avinash.verma@zinnia.com')
    app()
    expect(await screen.findByRole('button', { name: /Sign in with Microsoft/ })).toBeInTheDocument()
    expect(screen.queryByLabelText('Work email')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('avinash.verma@zinnia.com')).not.toBeInTheDocument()
  })

  it('leaves the email box empty when email sign-in is on', async () => {
    localStorage.setItem('ito.lastEmail', 'avinash.verma@zinnia.com')
    app()
    expect(await screen.findByLabelText('Work email')).toHaveValue('')
  })
})
