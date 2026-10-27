import { useEffect, useState } from 'react'
import { LogIn, Mail, Lock, AlertCircle } from 'lucide-react'
import { ZinniaIcon } from '../components/ui/ZinniaLogo'
import { fetchAuthConfig, getLastEmail, signIn, type SessionUser } from '../api/session'

export function LoginPage({ onSignedIn }: { onSignedIn: (user: SessionUser) => void }) {
  const [email, setEmail] = useState(getLastEmail())
  const [password, setPassword] = useState('')
  const [passwordRequired, setPasswordRequired] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { void fetchAuthConfig().then(c => setPasswordRequired(c.passwordRequired)) }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      onSignedIn(await signIn(email.trim(), passwordRequired ? password : undefined))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.')
      setSubmitting(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 glass-bg">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl p-7 shadow-xl glass-strong" aria-label="Sign in">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <ZinniaIcon className="h-10 w-auto" />
          <div>
            <h1 className="text-lg font-black text-slate-800">ITO Endpoint</h1>
            <p className="text-xs text-slate-500">Sign in to continue</p>
          </div>
        </div>

        <label className="mb-1 block text-[0.7rem] font-bold uppercase tracking-wide text-slate-500" htmlFor="login-email">Work email</label>
        <div className="relative mb-4">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            id="login-email" type="email" autoComplete="username" autoFocus required
            value={email} onChange={e => setEmail(e.target.value)} placeholder="you@zinnia.com"
            className="h-10 w-full rounded-xl pl-9 pr-3 text-sm font-medium text-slate-700 water-input"
          />
        </div>

        {passwordRequired && (
          <>
            <label className="mb-1 block text-[0.7rem] font-bold uppercase tracking-wide text-slate-500" htmlFor="login-password">Password</label>
            <div className="relative mb-4">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                id="login-password" type="password" autoComplete="current-password" required
                value={password} onChange={e => setPassword(e.target.value)}
                className="h-10 w-full rounded-xl pl-9 pr-3 text-sm font-medium text-slate-700 water-input"
              />
            </div>
          </>
        )}

        {error && (
          <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button type="submit" disabled={submitting || !email.trim()} className="btn-water inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white disabled:opacity-50">
          <LogIn className="h-4 w-4" />
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>

        {!passwordRequired && (
          <p className="mt-4 text-center text-[0.68rem] leading-relaxed text-slate-400">
            Passwordless sign-in is enabled for now. Only authorised emails can enter.
          </p>
        )}
      </form>
    </main>
  )
}
