import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { LoginPage } from '../../pages/LoginPage'
import { clearSession, fetchCurrentUser, getSession, installAuthFetch, takeRedirect, verifyToken, type SessionUser } from '../../api/session'

type GateState = { status: 'checking' } | { status: 'signedOut' } | { status: 'signedIn'; user: SessionUser }

/** Shows the login page until there is a valid session, then renders the app. */
export function AuthGate({ children }: { children: (session: { user: SessionUser; signOut: () => void }) => ReactNode }) {
  const redirect = takeRedirect()
  const [loginError, setLoginError] = useState<string | null>(redirect.error ?? null)
  const [state, setState] = useState<GateState>(() => (redirect.token || getSession() ? { status: 'checking' } : { status: 'signedOut' }))

  const signOut = useCallback(() => { clearSession(); setState({ status: 'signedOut' }) }, [])

  // Any 401 on a signed-in request (expired or revoked session) drops back to the login page.
  useEffect(() => installAuthFetch(() => setState({ status: 'signedOut' })), [])

  useEffect(() => {
    if (state.status !== 'checking') return
    let cancelled = false
    const token = redirect.token
    void (token ? verifyToken(token) : fetchCurrentUser()).then(user => {
      if (cancelled) return
      delete redirect.token
      if (!user && token) setLoginError('Microsoft sign-in could not be completed. Please try again.')
      setState(user ? { status: 'signedIn', user } : { status: 'signedOut' })
    })
    return () => { cancelled = true }
  }, [state.status, redirect])

  if (state.status === 'checking') return <div className="grid min-h-screen place-items-center text-sm text-slate-400 glass-bg">Checking your session…</div>
  if (state.status === 'signedOut') return <LoginPage initialError={loginError} onSignedIn={user => setState({ status: 'signedIn', user })} />
  return <>{children({ user: state.user, signOut })}</>
}
