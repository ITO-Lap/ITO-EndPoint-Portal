import { useState, useEffect, useRef } from 'react'
import { CheckCircle2, AlertCircle, ShieldCheck, Laptop2, Zap, Layers, Eye, EyeOff, LogIn } from 'lucide-react'
import { ZinniaHorizontal } from '../ui/ZinniaLogo'
import { startEntraLogin } from '../../api/index'

// ─── Local test credentials ───────────────────────────────────────────────────
// These are dev/testing credentials only — not production auth.
const LOCAL_USERS: Record<string, { password: string; role: string; displayName: string }> = {
  'avinash.verma@zinnia.com': { password: 'Admin@ITO2026', role: 'Global Admin', displayName: 'Avinash Verma'  },
  'itadmin@zinnia.com':       { password: 'Admin@ITO2026', role: 'IT Admin',     displayName: 'IT Admin'       },
  'helpdesk@zinnia.com':      { password: 'Admin@ITO2026', role: 'Helpdesk',     displayName: 'Helpdesk User'  },
}

// ─── Left brand panel ─────────────────────────────────────────────────────────
function BrandPanel() {
  const features = [
    { icon: Laptop2,     label: 'Unified device visibility',  desc: 'All endpoints across Intune, Kandji & ManageEngine in one view.' },
    { icon: ShieldCheck, label: 'Real-time compliance',       desc: 'Policy failures detected and surfaced the moment they occur.' },
    { icon: Zap,         label: 'AI-powered remediation',     desc: 'Intelligent runbooks that auto-resolve issues before they escalate.' },
  ]
  return (
    <div className="relative flex flex-col justify-between h-full px-10 py-10 overflow-hidden select-none">
      <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full blur-3xl" style={{ background: 'rgba(244,108,0,0.12)' }} />
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full blur-3xl" style={{ background: 'rgba(251,71,31,0.10)' }} />
      <div className="relative">
        <ZinniaHorizontal iconSize="lg" wordmarkSize="xl" subtitle="ITO Endpoint" gap="gap-4" />
      </div>
      <div className="relative space-y-5">
        <h1 className="text-[1.75rem] font-black leading-snug tracking-tight" style={{ color: '#0F172A' }}>
          Your AI-powered<br />
          <span className="bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(90deg, #FFC600 0%, #F46C00 60%, #FB471F 100%)' }}>
            endpoint control
          </span><br />
          center.
        </h1>
        <p className="text-sm text-slate-400 leading-relaxed max-w-xs">
          Manage compliance, trigger remediation, and stay ahead of every device issue — all from a single dashboard.
        </p>
        <div className="mt-2 space-y-3.5">
          {features.map(f => (
            <div key={f.label} className="flex items-start gap-3.5">
              <div className="mt-0.5 grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl"
                style={{ background: 'rgba(244,108,0,0.15)', border: '1px solid rgba(244,108,0,0.25)' }}>
                <f.icon className="h-3.5 w-3.5" style={{ color: '#F46C00' }} />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700 leading-tight">{f.label}</p>
                <p className="text-[0.65rem] text-slate-400 mt-0.5 leading-snug">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="relative">
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          {[
            { value: '12,842', label: 'Devices managed',   color: '#E8172D' },
            { value: '99.7%',  label: 'Platform uptime',   color: '#F46C00' },
            { value: '3',      label: 'Sources connected', color: '#FFB800' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl px-3 py-3 text-center water-glow-sm"
              style={{ background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(255,255,255,0.80)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.90)' }}>
              <p className="text-base font-black leading-tight" style={{ color: s.color }}>{s.value}</p>
              <p className="text-[0.58rem] text-slate-400 mt-0.5 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Test credentials panel */}
        <div className="rounded-2xl p-3.5 space-y-2"
          style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(148,163,184,0.20)' }}>
          <p className="text-[0.58rem] font-bold uppercase tracking-widest text-slate-400">Test credentials (all use same password)</p>
          {[
            { email: 'avinash.verma@zinnia.com', role: 'Global Admin', color: 'text-orange-600' },
            { email: 'itadmin@zinnia.com',        role: 'IT Admin',     color: 'text-lime-600'   },
            { email: 'helpdesk@zinnia.com',        role: 'Helpdesk',     color: 'text-slate-500'  },
          ].map(u => (
            <div key={u.email} className="flex items-center justify-between">
              <span className="text-[0.62rem] font-mono text-slate-600">{u.email}</span>
              <span className={`text-[0.6rem] font-bold ${u.color}`}>{u.role}</span>
            </div>
          ))}
          <div className="pt-1 border-t border-slate-200/60">
            <p className="text-[0.6rem] text-slate-400">Password: <span className="font-mono font-semibold text-slate-600">Admin@ITO2026</span></p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main SignInPage ──────────────────────────────────────────────────────────
interface SignInPageProps {
  onSignIn: (role: string, displayName: string, email: string) => void
  justSignedOut?: boolean
  authError?: string
}

type TabId = 'local' | 'sso'

export function SignInPage({ onSignIn, justSignedOut = false, authError }: SignInPageProps) {
  const [activeTab, setActiveTab]               = useState<TabId>('local')
  const [email, setEmail]                       = useState('')
  const [password, setPassword]                 = useState('')
  const [showPassword, setShowPassword]         = useState(false)
  const [localLoading, setLocalLoading]         = useState(false)
  const [ssoLoading, setSsoLoading]             = useState(false)
  const [error, setError]                       = useState(authError ?? '')
  const [signedOutBanner, setSignedOutBanner]   = useState(justSignedOut)
  const emailRef                                = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!signedOutBanner) return
    const t = setTimeout(() => setSignedOutBanner(false), 4000)
    return () => clearTimeout(t)
  }, [signedOutBanner])

  // Focus email field when tab switches to local
  useEffect(() => {
    if (activeTab === 'local') emailRef.current?.focus()
  }, [activeTab])

  const handleLocalSignIn = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const trimmedEmail = email.trim().toLowerCase()
    const user = LOCAL_USERS[trimmedEmail]
    if (!user || user.password !== password) {
      setError('Invalid email or password.')
      return
    }
    setLocalLoading(true)
    // Small delay for perceived security
    setTimeout(() => {
      onSignIn(user.role, user.displayName, trimmedEmail)
      setLocalLoading(false)
    }, 400)
  }

  const handleSsoSignIn = async () => {
    setError('')
    setSsoLoading(true)
    try {
      await startEntraLogin()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start login. Check your connection.')
      setSsoLoading(false)
    }
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'local', label: 'Credentials' },
    { id: 'sso',   label: 'Microsoft SSO' },
  ]

  return (
    <div className="min-h-screen w-full flex">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-[48%] xl:w-[45%] flex-shrink-0 glass-bg"
        style={{ borderRight: '1px solid rgba(148,163,184,0.15)' }}>
        <BrandPanel />
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 flex-col items-center justify-center glass-bg px-6 py-10 min-h-screen">
        <div className="lg:hidden mb-8">
          <ZinniaHorizontal iconSize="sm" wordmarkSize="sm" subtitle="ITO Endpoint" />
        </div>

        <div className="w-full max-w-[420px]">
          {/* Signed-out banner */}
          {signedOutBanner && (
            <div className="mb-5 flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" />
              <p className="text-xs font-medium text-emerald-800">You've been signed out successfully.</p>
            </div>
          )}

          {/* Sign-in card */}
          <div className="rounded-3xl overflow-hidden glass-strong"
            style={{ boxShadow: '0 24px 80px rgba(14,165,233,0.12), 0 8px 32px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,1)' }}>

            {/* Card header */}
            <div className="px-7 py-5"
              style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.85) 0%, rgba(240,249,255,0.90) 100%)', borderBottom: '1px solid rgba(148,163,184,0.15)' }}>
              <ZinniaHorizontal iconSize="sm" wordmarkSize="sm" subtitle="ITO Endpoint" />
              <div className="mt-4 h-[3px] w-20 rounded-full"
                style={{ background: 'linear-gradient(90deg, #E8172D 0%, #F46C00 50%, #FFB800 100%)' }} />
            </div>

            <div className="px-7 py-6 space-y-5">
              <div>
                <h2 className="text-xl font-black text-slate-900 leading-tight">Welcome back</h2>
                <p className="text-xs text-slate-500 mt-1">Sign in to access your endpoint dashboard.</p>
              </div>

              {/* Tab switcher */}
              <div className="flex rounded-xl p-1 gap-1"
                style={{ background: 'rgba(148,163,184,0.12)', border: '1px solid rgba(148,163,184,0.18)' }}>
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => { setActiveTab(tab.id); setError('') }}
                    className="flex-1 rounded-lg py-2 text-xs font-semibold transition-all"
                    style={activeTab === tab.id
                      ? { background: '#fff', color: '#0F172A', boxShadow: '0 1px 4px rgba(0,0,0,0.10)' }
                      : { color: '#64748B' }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-3">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-500 mt-0.5" />
                  <p className="text-xs text-red-700 font-medium leading-relaxed">{error}</p>
                </div>
              )}

              {/* ── Local credentials tab ── */}
              {activeTab === 'local' && (
                <form onSubmit={handleLocalSignIn} className="space-y-4" noValidate>
                  {/* Email */}
                  <div className="space-y-1.5">
                    <label htmlFor="email" className="block text-xs font-semibold text-slate-600">
                      Email address
                    </label>
                    <input
                      ref={emailRef}
                      id="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@zinnia.com"
                      className="h-10 w-full rounded-xl px-3.5 text-xs font-medium text-slate-700 water-input"
                    />
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <label htmlFor="password" className="block text-xs font-semibold text-slate-600">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="h-10 w-full rounded-xl px-3.5 pr-10 text-xs font-medium text-slate-700 water-input"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Role quick-fill chips */}
                  <div className="space-y-1.5">
                    <p className="text-[0.65rem] font-semibold text-slate-400 uppercase tracking-wide">Quick fill</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: 'Global Admin', email: 'avinash.verma@zinnia.com', color: 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100', icon: Layers },
                        { label: 'IT Admin',     email: 'itadmin@zinnia.com',       color: 'bg-lime-50 border-lime-200 text-lime-700 hover:bg-lime-100',         icon: ShieldCheck },
                        { label: 'Helpdesk',     email: 'helpdesk@zinnia.com',      color: 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200',    icon: Laptop2 },
                      ].map(({ label, email: e, color, icon: Icon }) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => { setEmail(e); setPassword('Admin@ITO2026'); setError('') }}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold transition ${color}`}
                        >
                          <Icon className="h-2.5 w-2.5" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={localLoading || !email || !password}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed btn-water"
                  >
                    {localLoading ? (
                      <>
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Signing in…
                      </>
                    ) : (
                      <>
                        <LogIn className="h-4 w-4" />
                        Sign In
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* ── Microsoft SSO tab ── */}
              {activeTab === 'sso' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Sign in with your Zinnia Microsoft account via Entra ID. Requires the Azure AD web redirect URI to be registered.
                  </p>
                  <button
                    type="button"
                    onClick={handleSsoSignIn}
                    disabled={ssoLoading}
                    className="w-full inline-flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white py-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-slate-300 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {ssoLoading ? (
                      <>
                        <svg className="h-5 w-5 animate-spin text-slate-400" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Redirecting to Microsoft…
                      </>
                    ) : (
                      <>
                        <svg width="20" height="20" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                          <rect x="1"   y="1"   width="7.5" height="7.5" fill="#F25022" rx="0.5" />
                          <rect x="9.5" y="1"   width="7.5" height="7.5" fill="#7FBA00" rx="0.5" />
                          <rect x="1"   y="9.5" width="7.5" height="7.5" fill="#00A4EF" rx="0.5" />
                          <rect x="9.5" y="9.5" width="7.5" height="7.5" fill="#FFB900" rx="0.5" />
                        </svg>
                        Sign in with Microsoft
                      </>
                    )}
                  </button>

                  {/* Who can access */}
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-2.5">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400">Who can access via SSO</p>
                    {[
                      { role: 'Global Admin', desc: 'avinash.verma@zinnia.com',  color: 'bg-orange-100 text-orange-700', icon: Layers },
                      { role: 'IT Admin',     desc: 'ITO EndPoint Portal group', color: 'bg-lime-100 text-lime-700',     icon: ShieldCheck },
                      { role: 'Helpdesk',     desc: 'Desktop Support group',     color: 'bg-slate-200 text-slate-600',   icon: Laptop2 },
                    ].map(({ role, desc, color, icon: Icon }) => (
                      <div key={role} className="flex items-center gap-2.5">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.62rem] font-semibold ${color}`}>
                          <Icon className="h-2.5 w-2.5" />
                          {role}
                        </span>
                        <span className="text-[0.65rem] text-slate-500">{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 flex flex-col items-center gap-2 text-[0.65rem] text-slate-400">
            <p>© 2026 Zinnia Technologies · ITO Endpoint</p>
          </div>
        </div>
      </div>
    </div>
  )
}
