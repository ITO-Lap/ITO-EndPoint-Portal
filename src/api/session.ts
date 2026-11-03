// Browser side of portal sign-in (server: services/session.ts). The signed
// session token lives in localStorage and is attached to every /api request by
// a one-time wrapper around window.fetch, so the many API modules need no change.
// A 401 on a signed-in request means the session expired: the token is dropped
// and the app returns to the login page.

const BASE_URL = import.meta.env.VITE_API_URL ?? ''
const SESSION_KEY = 'ito.session'

export interface SessionUser { email: string; displayName: string; role: string; permissions: Record<string, boolean> }
interface StoredSession { token: string; user: SessionUser }

export function getSession(): StoredSession | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as StoredSession | null
    return parsed?.token && parsed.user?.email ? parsed : null
  } catch {
    return null
  }
}
export const saveSession = (session: StoredSession): void => localStorage.setItem(SESSION_KEY, JSON.stringify(session))
export const clearSession = (): void => localStorage.removeItem(SESSION_KEY)

let installed = false
let originalFetch: typeof window.fetch | null = null

/** Wraps window.fetch once: adds the Bearer token to /api requests and reports expired sessions. */
export function installAuthFetch(onExpired: () => void): () => void {
  if (installed) return () => {}
  installed = true
  originalFetch = window.fetch.bind(window)
  const baseFetch = originalFetch
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    let pathname = ''
    try { pathname = new URL(url, window.location.origin).pathname } catch { /* not a URL */ }
    const session = pathname.startsWith('/api/') ? getSession() : null
    if (!session) return baseFetch(input, init)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${session.token}`)
    const res = await baseFetch(input, { ...init, headers })
    if (res.status === 401 && pathname !== '/api/auth/session') { clearSession(); onExpired() }
    return res
  }
  return () => { if (originalFetch) window.fetch = originalFetch; installed = false }
}

async function readEnvelope<T>(res: Response): Promise<{ data?: T; error?: string }> {
  try { return await res.json() as { data?: T; error?: string } } catch { return {} }
}

export interface AuthConfig { passwordRequired: boolean; emailSignIn: boolean; microsoft: boolean }

export async function fetchAuthConfig(): Promise<AuthConfig> {
  try {
    const { data } = await readEnvelope<Partial<AuthConfig>>(await fetch(`${BASE_URL}/api/auth/config`))
    return { passwordRequired: !!data?.passwordRequired, emailSignIn: data?.emailSignIn ?? false, microsoft: !!data?.microsoft }
  } catch {
    return { passwordRequired: false, emailSignIn: false, microsoft: false }
  }
}

/** Sends the browser to Microsoft's sign-in page; Microsoft returns it to the app with a session token. */
export async function startMicrosoftSignIn(): Promise<void> {
  let res: Response
  try { res = await fetch(`${BASE_URL}/api/auth/login`) }
  catch { throw new Error('Could not reach the server. Check your connection and try again.') }
  const { data, error } = await readEnvelope<{ url: string }>(res)
  if (!res.ok || !data?.url) throw new Error(error ?? 'Microsoft sign-in is not available.')
  window.location.href = data.url
}

export interface RedirectResult { token?: string; error?: string }
let redirect: RedirectResult | undefined

/**
 * What Microsoft sign-in left in the URL: a session token in the fragment (never sent to a
 * server or logged) or an auth_error in the query. Read once and removed from the address
 * bar immediately, so a reload or a copied link cannot replay it.
 */
export function takeRedirect(): RedirectResult {
  if (redirect) return redirect
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const search = new URLSearchParams(window.location.search)
  const token = hash.get('session_token')
  const error = search.get('auth_error')
  redirect = { ...(token ? { token } : {}), ...(error ? { error } : {}) }
  if (token || error) {
    hash.delete('session_token'); search.delete('auth_error')
    const query = search.toString(); const frag = hash.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${frag ? `#${frag}` : ''}`)
  }
  return redirect
}
export const __resetRedirectForTests = (): void => { redirect = undefined }

/** Validates a token returned by Microsoft sign-in with the server, and stores the session if valid. */
export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
    const user = res.ok ? (await readEnvelope<SessionUser>(res)).data : undefined
    if (!user) return null
    saveSession({ token, user })
    return user
  } catch {
    return null
  }
}

export async function signIn(email: string, password?: string): Promise<SessionUser> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}/api/auth/session`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, ...(password ? { password } : {}) }),
    })
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.')
  }
  const { data, error } = await readEnvelope<{ token: string; user: SessionUser }>(res)
  if (!res.ok || !data) throw new Error(error ?? 'Sign-in failed.')
  saveSession(data)
  return data.user
}

/** The user for the stored token, or null if there is none or it is no longer valid. */
export async function fetchCurrentUser(): Promise<SessionUser | null> {
  if (!getSession()) return null
  try {
    const res = await fetch(`${BASE_URL}/api/auth/me`)
    if (!res.ok) { clearSession(); return null }
    return (await readEnvelope<SessionUser>(res)).data ?? null
  } catch {
    return getSession()?.user ?? null // server unreachable: keep the session, calls will report errors
  }
}
