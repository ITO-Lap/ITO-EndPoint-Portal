import { useEffect, useState } from 'react'
import { LogIn, Mail, Lock, AlertCircle, Sparkles, ShieldCheck, BellRing, Activity } from 'lucide-react'
import { ZinniaIcon } from '../components/ui/ZinniaLogo'
import { fetchAuthConfig, signIn, startMicrosoftSignIn, type AuthConfig, type SessionUser } from '../api/session'
import './login.css'

// A fixed constellation (0-100 viewBox); nearby nodes are joined, so the graph is stable between renders.
const NODES: Array<[number, number]> = [
  [8, 18], [20, 8], [31, 24], [14, 38], [27, 47], [42, 14], [48, 34], [38, 58], [56, 52], [66, 22],
  [74, 40], [84, 14], [90, 34], [80, 62], [62, 74], [46, 82], [28, 76], [12, 66], [93, 78], [70, 90],
]
const EDGES = NODES.flatMap(([x1, y1], i) => NODES.slice(i + 1).map(([x2, y2], j) => ({ i, j: i + 1 + j, d: Math.hypot(x1 - x2, y1 - y2) })))
  .filter(e => e.d < 24)

function NeuralGraph() {
  return (
    <svg className="lg-neural" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="lg-edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F46C00" stopOpacity=".55" /><stop offset="1" stopColor="#0EA5E9" stopOpacity=".5" /></linearGradient>
        <radialGradient id="lg-glow"><stop offset="0" stopColor="#FFB020" /><stop offset="1" stopColor="#F46C00" stopOpacity="0" /></radialGradient>
      </defs>
      {EDGES.map(({ i, j }) => (
        <g key={`${i}-${j}`}>
          <line className="lg-edge" x1={NODES[i]![0]} y1={NODES[i]![1]} x2={NODES[j]![0]} y2={NODES[j]![1]} stroke="url(#lg-edge)" strokeWidth=".16" />
          {(i + j) % 3 === 0 && (
            <line className="lg-packet" x1={NODES[i]![0]} y1={NODES[i]![1]} x2={NODES[j]![0]} y2={NODES[j]![1]} stroke="#F46C00" strokeWidth=".42"
              style={{ animationDelay: `${(i * 0.53) % 5}s` }} />
          )}
        </g>
      ))}
      {NODES.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="1.9" fill="url(#lg-glow)" opacity=".35" />
          <circle className="lg-node" cx={x} cy={y} r=".6" fill="#F46C00" style={{ animationDelay: `${(i * 0.45) % 3.6}s` }} />
        </g>
      ))}
    </svg>
  )
}

const FEATURES = [
  { icon: ShieldCheck, text: 'Compliance, encryption and patch posture across every endpoint' },
  { icon: Sparkles, text: 'AI Copilot that explains issues and guides remediation' },
  { icon: Activity, text: 'Intune and ManageEngine, reconciled against Microsoft Graph' },
  { icon: BellRing, text: 'Scheduled reports delivered to Slack, with data-quality checks' },
]

export function LoginPage({ onSignedIn, initialError = null }: { onSignedIn: (user: SessionUser) => void; initialError?: string | null }) {
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(initialError)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { void fetchAuthConfig().then(setConfig) }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      onSignedIn(await signIn(email.trim(), config?.passwordRequired ? password : undefined))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.')
      setSubmitting(false)
    }
  }

  const microsoft = async () => {
    setError(null)
    setSubmitting(true)
    try { await startMicrosoftSignIn() }
    catch (err) { setError(err instanceof Error ? err.message : 'Microsoft sign-in failed.'); setSubmitting(false) }
  }

  const showMicrosoft = !!config?.microsoft
  const showEmail = !!config?.emailSignIn

  return (
    <main className="lg-root">
      <div className="lg-grid" aria-hidden="true" />
      <div className="lg-blob lg-blob-1" aria-hidden="true" /><div className="lg-blob lg-blob-2" aria-hidden="true" />
      <div className="lg-blob lg-blob-3" aria-hidden="true" /><div className="lg-blob lg-blob-4" aria-hidden="true" />
      <NeuralGraph />

      <div className="lg-shell">
        <section className="lg-rise" aria-label="About ITO Endpoint">
          <div className="lg-brand">
            <ZinniaIcon className="h-9 w-auto" />
            <span className="lg-brand-sep" aria-hidden="true" />
            <span className="lg-brand-name">ITO Endpoint</span>
          </div>
          <span className="lg-pill" style={{ marginTop: '2.2rem' }}><Sparkles size={13} aria-hidden="true" /> AI-powered endpoint operations</span>
          <h1 className="lg-title">Endpoint intelligence,<br /><span className="lg-gradient-text">made effortless.</span></h1>
          <p className="lg-lede">One place for device health, patching and compliance, with an AI Copilot that turns signals into the next action.</p>
          <ul className="lg-features">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="lg-feature"><span className="lg-feature-icon"><Icon size={16} aria-hidden="true" /></span>{text}</li>
            ))}
          </ul>
        </section>

        <section className="lg-rise lg-rise-2">
          <div className="lg-card">
            <h2>Welcome back</h2>
            <p className="lg-sub">Sign in with your Zinnia account to continue.</p>

            {error && (
              <div role="alert" className="lg-error">
                <AlertCircle aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            {showMicrosoft && (
              <button type="button" className="lg-btn lg-btn-ms" onClick={() => void microsoft()} disabled={submitting}>
                <ZinniaIcon className="h-5 w-auto" />
                Sign in with Zinnia
              </button>
            )}

            {showMicrosoft && showEmail && <div className="lg-divider">or</div>}

            {showEmail && (
              <form onSubmit={submit} aria-label="Sign in with email">
                <label className="lg-label" htmlFor="login-email">Work email</label>
                <div className="lg-field">
                  <Mail aria-hidden="true" />
                  <input id="login-email" className="lg-input" type="email" autoComplete="username" autoFocus={!showMicrosoft} required
                    value={email} onChange={e => setEmail(e.target.value)} placeholder="you@zinnia.com" />
                </div>

                {config?.passwordRequired && (
                  <>
                    <label className="lg-label" htmlFor="login-password">Password</label>
                    <div className="lg-field">
                      <Lock aria-hidden="true" />
                      <input id="login-password" className="lg-input" type="password" autoComplete="current-password" required
                        value={password} onChange={e => setPassword(e.target.value)} />
                    </div>
                  </>
                )}

                <button type="submit" className="lg-btn lg-btn-primary" disabled={submitting || !email.trim()}>
                  <LogIn size={16} aria-hidden="true" />
                  {submitting ? 'Signing in…' : 'Sign in'}
                </button>

                {!config?.passwordRequired && (
                  <p className="lg-note">Passwordless sign-in is enabled for now. Only authorised emails can enter.</p>
                )}
              </form>
            )}

            {config && !showMicrosoft && !showEmail && (
              <p className="lg-note">No sign-in method is available. Ask an administrator to configure Microsoft sign-in.</p>
            )}
          </div>
          {showMicrosoft && <p className="lg-foot"><ShieldCheck aria-hidden="true" />Protected by Microsoft Entra ID</p>}
        </section>
      </div>
    </main>
  )
}
