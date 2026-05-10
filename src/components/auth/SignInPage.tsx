import { useState, useEffect } from 'react'
import {
  BookOpen, Eye, EyeOff, Mail, Lock, ArrowRight,
  ShieldCheck, Laptop2, Zap, CheckCircle2, AlertCircle,
  Layers, LifeBuoy, Users,
} from 'lucide-react'

// ─── Demo accounts ────────────────────────────────────────────────────────────

const DEMO_ACCOUNTS = [
  {
    role: 'Global Admin',
    email: 'admin@zinnia.com',
    password: 'demo1234',
    badge: 'bg-sky-100 text-sky-700 border-sky-200',
    icon: Layers,
    desc: 'Full access',
  },
  {
    role: 'IT Admin',
    email: 'itadmin@zinnia.com',
    password: 'demo1234',
    badge: 'bg-violet-100 text-violet-700 border-violet-200',
    icon: ShieldCheck,
    desc: 'Operational access',
  },
  {
    role: 'Helpdesk',
    email: 'helpdesk@zinnia.com',
    password: 'demo1234',
    badge: 'bg-slate-100 text-slate-600 border-slate-200',
    icon: Users,
    desc: 'Read-only + sync',
  },
]

// ─── Left panel — brand + feature showcase ────────────────────────────────────

function BrandPanel() {
  const features = [
    { icon: Laptop2,     label: 'Unified device visibility',    desc: 'All endpoints across Intune, Kandji & ManageEngine in one view.' },
    { icon: ShieldCheck, label: 'Real-time compliance',         desc: 'Policy failures detected and surfaced the moment they occur.' },
    { icon: Zap,         label: 'AI-powered remediation',       desc: 'Intelligent runbooks that auto-resolve issues before they escalate.' },
  ]

  return (
    <div className="relative flex flex-col justify-between h-full px-10 py-10 overflow-hidden select-none">
      {/* Background decoration */}
      <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-sky-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-blue-600/10 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full border border-white/5" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[340px] w-[340px] rounded-full border border-white/5" />

      {/* Logo */}
      <div className="relative flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 shadow-lg shadow-sky-900/40 flex-shrink-0">
          <BookOpen className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-white leading-tight tracking-tight">ITO Endpoint</p>
          <p className="text-[0.62rem] text-sky-300/80 mt-0.5">Smart. Fast. Reliable.</p>
        </div>
      </div>

      {/* Hero text */}
      <div className="relative space-y-4">
        <h1 className="text-[1.65rem] font-bold text-white leading-snug tracking-tight">
          Your AI-powered<br />
          <span className="text-sky-300">endpoint control</span><br />
          center.
        </h1>
        <p className="text-sm text-slate-400 leading-relaxed max-w-xs">
          Manage compliance, trigger remediation, and stay ahead of every device issue — all from a single dashboard.
        </p>

        {/* Feature list */}
        <div className="mt-6 space-y-3">
          {features.map(f => (
            <div key={f.label} className="flex items-start gap-3">
              <div className="mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-white/10">
                <f.icon className="h-3.5 w-3.5 text-sky-300" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white leading-tight">{f.label}</p>
                <p className="text-[0.65rem] text-slate-400 mt-0.5 leading-snug">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats strip */}
      <div className="relative">
        <div className="grid grid-cols-3 gap-2 mb-6">
          {[
            { value: '12,842', label: 'Devices managed' },
            { value: '99.7%',  label: 'Platform uptime' },
            { value: '3',      label: 'Sources connected' },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-center">
              <p className="text-base font-bold text-white leading-tight">{s.value}</p>
              <p className="text-[0.58rem] text-slate-400 mt-0.5 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Integration logos row */}
        <div className="flex items-center gap-2">
          <p className="text-[0.6rem] text-slate-500 mr-1 flex-shrink-0">Integrated with</p>
          {['Microsoft Intune', 'Kandji', 'ManageEngine', 'OpenAI'].map(name => (
            <span key={name} className="rounded-md bg-white/8 border border-white/10 px-2 py-0.5 text-[0.58rem] font-medium text-slate-400">
              {name}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Forgot password mini-form ────────────────────────────────────────────────

function ForgotPassword({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    await new Promise(r => setTimeout(r, 1000))
    setLoading(false)
    setSent(true)
  }

  if (sent) {
    return (
      <div className="space-y-5">
        <div className="flex flex-col items-center text-center gap-3 py-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-100">
            <CheckCircle2 className="h-7 w-7 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">Check your inbox</p>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              We sent a password reset link to<br />
              <span className="font-semibold text-slate-700">{email}</span>
            </p>
          </div>
        </div>
        <p className="text-center text-[0.68rem] text-slate-500">
          Didn't receive it? Check your spam folder or{' '}
          <button type="button" onClick={() => setSent(false)} className="text-sky-600 font-semibold hover:underline">
            try again
          </button>
        </p>
        <button
          type="button"
          onClick={onBack}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition focus-visible:ring-2 focus-visible:ring-sky-300"
        >
          ← Back to sign in
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <p className="text-sm font-bold text-slate-900">Reset your password</p>
        <p className="text-xs text-slate-500 mt-1">Enter your work email and we'll send a reset link.</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1.5">Work email</label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoFocus
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/40 transition"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || !email}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 active:bg-sky-800 focus-visible:ring-2 focus-visible:ring-sky-300 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading && <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
        {loading ? 'Sending…' : 'Send reset link'}
      </button>

      <button
        type="button"
        onClick={onBack}
        className="w-full text-center text-xs text-slate-500 hover:text-slate-700 transition"
      >
        ← Back to sign in
      </button>
    </form>
  )
}

// ─── Main SignInPage ──────────────────────────────────────────────────────────

interface SignInPageProps {
  onSignIn: (role: string) => void
  justSignedOut?: boolean
}

export function SignInPage({ onSignIn, justSignedOut = false }: SignInPageProps) {
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe]   = useState(false)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [showForgot, setShowForgot]   = useState(false)
  const [signedOutBanner, setSignedOutBanner] = useState(justSignedOut)

  // Auto-dismiss the "signed out" banner after 4 seconds
  useEffect(() => {
    if (!signedOutBanner) return
    const t = setTimeout(() => setSignedOutBanner(false), 4000)
    return () => clearTimeout(t)
  }, [signedOutBanner])

  const doSignIn = async (overrideEmail?: string, overridePassword?: string) => {
    const e = overrideEmail   ?? email
    const p = overridePassword ?? password

    if (!e.trim()) { setError('Please enter your email address'); return }
    if (!p)        { setError('Please enter your password');       return }
    if (!e.includes('@')) { setError('Please enter a valid email address'); return }

    setError('')
    setLoading(true)
    await new Promise(r => setTimeout(r, 1100))
    setLoading(false)

    const demo = DEMO_ACCOUNTS.find(d => d.email === e)
    onSignIn(demo?.role ?? 'Global Admin')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    doSignIn()
  }

  const handleDemoLogin = async (acct: typeof DEMO_ACCOUNTS[0]) => {
    setEmail(acct.email)
    setPassword(acct.password)
    setError('')
    setLoading(true)
    await new Promise(r => setTimeout(r, 900))
    setLoading(false)
    onSignIn(acct.role)
  }

  const handleSSO = async () => {
    setError('')
    setLoading(true)
    await new Promise(r => setTimeout(r, 1400))
    setLoading(false)
    onSignIn('Global Admin')
  }

  return (
    <div className="min-h-screen w-full flex">

      {/* ── Left: brand panel ── */}
      <div className="hidden lg:flex lg:w-[48%] xl:w-[45%] flex-shrink-0 bg-gradient-to-br from-[#041a3c] via-[#071f49] to-[#0a2860] border-r border-white/5">
        <BrandPanel />
      </div>

      {/* ── Right: form panel ── */}
      <div className="flex flex-1 flex-col items-center justify-center bg-[#f6f8fb] px-6 py-10 min-h-screen">

        {/* Mobile logo (visible only when left panel is hidden) */}
        <div className="lg:hidden flex items-center gap-2.5 mb-8">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-sky-400 to-blue-600">
            <BookOpen className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">ITO Endpoint</p>
            <p className="text-[0.62rem] text-slate-500">Smart. Fast. Reliable.</p>
          </div>
        </div>

        <div className="w-full max-w-[420px]">

          {/* Signed-out banner */}
          {signedOutBanner && (
            <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" />
              <p className="text-xs font-medium text-emerald-800">You've been signed out successfully.</p>
            </div>
          )}

          {/* Card */}
          <div className="rounded-[22px] border border-slate-200 bg-white shadow-xl shadow-slate-900/8 overflow-hidden">

            {/* Card header band */}
            <div className="h-1 bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500" />

            <div className="px-7 py-7">
              {showForgot ? (
                <ForgotPassword onBack={() => setShowForgot(false)} />
              ) : (
                <form onSubmit={handleSubmit} noValidate className="space-y-5">
                  {/* Heading */}
                  <div className="mb-1">
                    <h2 className="text-xl font-bold text-slate-900 leading-tight">Welcome back</h2>
                    <p className="text-xs text-slate-500 mt-1">Sign in to your ITO Endpoint account</p>
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5">
                      <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-500" />
                      <p className="text-xs text-red-700 font-medium">{error}</p>
                    </div>
                  )}

                  {/* Email */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Work email
                    </label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={e => { setEmail(e.target.value); setError('') }}
                        placeholder="you@company.com"
                        autoComplete="email"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/40 transition"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-700">Password</label>
                      <button
                        type="button"
                        onClick={() => setShowForgot(true)}
                        className="text-[0.68rem] text-sky-600 font-medium hover:text-sky-700 hover:underline focus-visible:ring-1 focus-visible:ring-sky-300 rounded transition"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => { setPassword(e.target.value); setError('') }}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/40 transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600 transition focus-visible:ring-1 focus-visible:ring-sky-300"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Remember me */}
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <div
                      onClick={() => setRememberMe(v => !v)}
                      className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition ${
                        rememberMe
                          ? 'border-sky-500 bg-sky-500'
                          : 'border-slate-300 bg-white hover:border-sky-400'
                      }`}
                    >
                      {rememberMe && <CheckCircle2 className="h-3 w-3 text-white" strokeWidth={3} />}
                    </div>
                    <span className="text-xs text-slate-600 select-none">Keep me signed in for 30 days</span>
                  </label>

                  {/* Sign in button */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 py-2.5 text-sm font-bold text-white shadow-md shadow-sky-700/25 transition hover:bg-sky-700 active:bg-sky-800 focus-visible:ring-2 focus-visible:ring-sky-300 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}
                    {loading ? 'Signing in…' : 'Sign In'}
                  </button>

                  {/* Divider */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-slate-200" />
                    <span className="text-[0.65rem] text-slate-400 font-medium">or continue with</span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>

                  {/* SSO button */}
                  <button
                    type="button"
                    onClick={handleSSO}
                    disabled={loading}
                    className="w-full inline-flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-sky-300 disabled:opacity-50"
                  >
                    {/* Microsoft logo mark */}
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                      <rect x="1"  y="1"  width="7.5" height="7.5" fill="#F25022" rx="0.5" />
                      <rect x="9.5" y="1"  width="7.5" height="7.5" fill="#7FBA00" rx="0.5" />
                      <rect x="1"  y="9.5" width="7.5" height="7.5" fill="#00A4EF" rx="0.5" />
                      <rect x="9.5" y="9.5" width="7.5" height="7.5" fill="#FFB900" rx="0.5" />
                    </svg>
                    Sign in with Microsoft
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Demo accounts */}
          {!showForgot && (
            <div className="mt-5">
              <p className="text-center text-[0.68rem] font-semibold uppercase tracking-wider text-slate-400 mb-3">
                Try a demo account
              </p>
              <div className="grid grid-cols-3 gap-2">
                {DEMO_ACCOUNTS.map(acct => {
                  const Icon = acct.icon
                  return (
                    <button
                      key={acct.role}
                      type="button"
                      onClick={() => handleDemoLogin(acct)}
                      disabled={loading}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-center transition focus-visible:ring-2 focus-visible:ring-sky-300 hover:shadow-sm disabled:opacity-50 ${acct.badge} hover:brightness-95`}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <p className="text-[0.68rem] font-bold leading-tight">{acct.role}</p>
                      <p className="text-[0.58rem] opacity-75 leading-tight">{acct.desc}</p>
                    </button>
                  )
                })}
              </div>
              <p className="text-center text-[0.62rem] text-slate-400 mt-2.5">
                Demo accounts use password{' '}
                <code className="font-mono bg-slate-100 rounded px-1 py-0.5 text-slate-600">demo1234</code>
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="mt-6 flex flex-col items-center gap-2 text-[0.65rem] text-slate-400">
            <div className="flex items-center gap-3">
              <a href="#" className="hover:text-slate-600 transition" onClick={e => e.preventDefault()}>Privacy Policy</a>
              <span>·</span>
              <a href="#" className="hover:text-slate-600 transition" onClick={e => e.preventDefault()}>Terms of Use</a>
              <span>·</span>
              <a href="#" className="hover:text-slate-600 transition" onClick={e => e.preventDefault()}>Support</a>
            </div>
            <p>© 2026 ITO Endpoint · Zinnia Technologies</p>
          </div>

        </div>
      </div>
    </div>
  )
}
