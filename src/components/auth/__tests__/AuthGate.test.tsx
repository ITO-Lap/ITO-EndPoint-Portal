import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthGate } from '../AuthGate'
import { saveSession, getSession } from '../../../api/session'

const user = { email: 'avinash.verma@zinnia.com', displayName: 'Avinash Verma', role: 'Global Admin' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
let routes: Record<string, () => Response>

beforeEach(() => {
  localStorage.clear()
  routes = { '/api/auth/config': () => json({ success: true, data: { passwordRequired: false } }) }
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
    expect(screen.queryByText(/Welcome/)).not.toBeInTheDocument()
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
    routes['/api/auth/session'] = () => json({ success: false, error: 'This email is not authorised to use ITO Endpoint.' }, 403)
    app()
    await userEvent.type(await screen.findByLabelText('Work email'), 'someone@zinnia.com')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('not authorised')
    expect(screen.queryByText(/Welcome/)).not.toBeInTheDocument()
  })

  it('asks for a password when the server requires one', async () => {
    routes['/api/auth/config'] = () => json({ success: true, data: { passwordRequired: true } })
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
})
