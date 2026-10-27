import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { LoginPage } from '../../pages/LoginPage'
import { clearSession, fetchCurrentUser, getSession, installAuthFetch, type SessionUser } from '../../api/session'

type GateState = { status: 'checking' } | { status: 'signedOut' } | { status: 'signedIn'; user: SessionUser }

/** Shows the login page until there is a valid session, then renders the app. */
export function AuthGate({ children }: { children: (session: { user: SessionUser; signOut: () => void }) => ReactNode }) {
  const [state, setState] = useState<GateState>(() => (getSession() ? { status: 'checking' } : { status: 'signedOut' }))

  const signOut = useCallback(() => { clearSession(); setState({ status: 'signedOut' }) }, [])

  // Any 401 on a signed-in request (expired or revoked session) drops back to the login page.
  useEffect(() => installAuthFetch(() => setState({ status: 'signedOut' })), [])

  useEffect(() => {
    if (state.status !== 'checking') return
    let cancelled = false
    void fetchCurrentUser().then(user => { if (!cancelled) setState(user ? { status: 'signedIn', user } : { status: 'signedOut' }) })
    return () => { cancelled = true }
  }, [state.status])

  if (state.status === 'checking') return <div className="grid min-h-screen place-items-center text-sm text-slate-400 glass-bg">Checking your session…</div>
  if (state.status === 'signedOut') return <LoginPage onSignedIn={user => setState({ status: 'signedIn', user })} />
  return <>{children({ user: state.user, signOut })}</>
}
