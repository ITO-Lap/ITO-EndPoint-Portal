/**
 * Entra ID authentication via OAuth 2.0 Authorization Code flow.
 *
 * Azure AD app registration needs ONE redirect URI added (Web type):
 *   http://localhost:4000/api/auth/callback
 *
 * Role mapping:
 *   emails in AUTH_ALLOWED_EMAILS   → Global Admin, after Microsoft has verified them
 *   member of "ITO EndPoint Portal" → IT Admin (nested groups count; name matched ignoring case)
 *   member of "Desktop Support"     → Helpdesk
 *   anyone else                     → 403
 */
import { Router } from 'express'
import { createHmac, randomBytes } from 'crypto'
import jwt from 'jsonwebtoken'
import rateLimit from 'express-rate-limit'
import { getEntraConfig } from '../store/integrationStore.js'
import { SESSION_SECRET, allowedEmails, authEnforced, authenticate, emailSignInEnabled, passwordRequired, signSession, verifySession } from '../services/session.js'
import { bearerToken } from '../middleware/requireSession.js'
import { resolveUserRole, permissionsForRole } from '../services/roleResolution.js'

const router = Router()

// ─── Constants ────────────────────────────────────────────────────────────────
// Roles come from group membership. A group matches by Object ID when AUTH_*_GROUP_ID is set (exact, and
// survives a rename; a same-named group does not qualify), otherwise by display name ignoring case and surrounding spaces.
const itAdminGroup       = () => process.env.AUTH_IT_ADMIN_GROUP ?? 'ITO EndPoint Portal'
const helpdeskGroup      = () => process.env.AUTH_HELPDESK_GROUP ?? 'Desktop Support'
interface UserGroup { id: string; name: string }
const normalize          = (v: string | undefined) => (v ?? '').trim().toLowerCase()
const inGroup            = (groups: UserGroup[], name: string, id: string | undefined) =>
  normalize(id) ? groups.some(g => normalize(g.id) === normalize(id)) : groups.some(g => normalize(g.name) === normalize(name))
// Where Microsoft sends the browser back, and where the app lives. On localhost these are the dev
// defaults (API on :4000, Vite on :5173). On any other host they are taken from the request itself
// (the deployed site is served by this same server), so a deployment works without extra settings;
// AUTH_REDIRECT_URI / FRONTEND_URL override both. The redirect URI must match a Web redirect URI
// registered on the Entra app exactly (https://<host>/api/auth/callback when deployed).
const DEV_REDIRECT_URI   = 'http://localhost:4000/api/auth/callback'
const DEV_FRONTEND       = 'http://localhost:5173'
const LOCAL_HOST         = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i

export function resolveOrigins(req: { get(name: string): string | undefined; protocol: string }): { redirectUri: string; frontendOrigin: string; misconfigured: boolean } {
  const first = (v: string | undefined) => v?.split(',')[0]?.trim()
  const host = first(req.get('x-forwarded-host')) ?? req.get('host') ?? ''
  const local = LOCAL_HOST.test(host)
  const proto = first(req.get('x-forwarded-proto')) ?? req.protocol
  const origin = `${proto}://${host}`
  // In production a loopback host means a reverse proxy (e.g. IIS ARR) rewrote the Host header and did not pass the
  // original; sending the browser to localhost would strand the user, so refuse and say what to configure.
  const misconfigured = process.env.NODE_ENV === 'production' && local && !(process.env.AUTH_REDIRECT_URI && process.env.FRONTEND_URL)
  return {
    redirectUri:    process.env.AUTH_REDIRECT_URI ?? (local ? DEV_REDIRECT_URI : `${origin}/api/auth/callback`),
    frontendOrigin: process.env.FRONTEND_URL ?? (local ? DEV_FRONTEND : origin),
    misconfigured,
  }
}
const JWT_SECRET         = SESSION_SECRET
const TOKEN_TTL_SECS     = 8 * 60 * 60 // 8 hours

// ─── CSRF state: a signed, 10-minute token, so it survives a server restart ─────
const STATE_PURPOSE = 'oauth-state'
const signState = (): string => jwt.sign({ purpose: STATE_PURPOSE, nonce: randomBytes(12).toString('hex') }, JWT_SECRET, { expiresIn: 10 * 60 })
function verifyState(state: unknown): boolean {
  if (typeof state !== 'string' || !state) return false
  try { return (jwt.verify(state, JWT_SECRET) as { purpose?: string }).purpose === STATE_PURPOSE } catch { return false }
}

// Never let a slow Microsoft / Graph call leave the browser hanging on the callback URL.
const UPSTREAM_TIMEOUT_MS = 15_000
const upstream = () => AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)

// ─── App-level token cache ────────────────────────────────────────────────────
let appTokenCache: { token: string; expiresAt: number } | null = null

async function getAppToken(): Promise<string | null> {
  if (appTokenCache && Date.now() < appTokenCache.expiresAt - 60_000) return appTokenCache.token
  const cfg = getEntraConfig()
  if (!cfg) return null
  const res = await fetch(
    `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      body: new URLSearchParams({
        client_id:     cfg.clientId,
        client_secret: cfg.clientSecret,
        scope:         'https://graph.microsoft.com/.default',
        grant_type:    'client_credentials',
      }),
      signal: upstream(),
    }
  )
  if (!res.ok) return null
  const data = await res.json() as { access_token: string; expires_in: number }
  appTokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1_000 }
  return appTokenCache.token
}

/** Id and display name of every group the user belongs to, directly or through nested groups, following all pages. null if Graph could not answer. */
async function listUserGroups(token: string, userId: string): Promise<UserGroup[] | null> {
  const groups: UserGroup[] = []
  let url: string | undefined = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}/transitiveMemberOf/microsoft.graph.group?$select=id,displayName&$top=999`
  for (let page = 0; url && page < 20; page++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: upstream() })
    if (!res.ok) return null
    const body = await res.json() as { value?: Array<{ id?: string; displayName?: string | null }>; '@odata.nextLink'?: string }
    for (const g of body.value ?? []) if (g.id || g.displayName) groups.push({ id: g.id ?? '', name: g.displayName ?? '' })
    url = body['@odata.nextLink']
  }
  return groups
}

async function graphGet<T>(token: string, path: string): Promise<T | null> {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: upstream(),
  })
  if (!res.ok) return null
  return res.json() as Promise<T>
}

// ─── GET /api/auth/login ──────────────────────────────────────────────────────
// Returns the Microsoft OAuth URL for the frontend to redirect to.
router.get('/login', (req, res) => {
  const { redirectUri, misconfigured } = resolveOrigins(req)
  if (misconfigured) {
    console.error('[auth] Microsoft sign-in refused: the request host is loopback in production (reverse proxy rewrote Host). Set AUTH_REDIRECT_URI and FRONTEND_URL in server/.env, or forward X-Forwarded-Host / X-Forwarded-Proto.')
    res.status(503).json({ success: false, error: 'Microsoft sign-in is not configured for this server address. An administrator must set AUTH_REDIRECT_URI and FRONTEND_URL.' })
    return
  }
  const cfg = getEntraConfig()
  if (!cfg) {
    res.status(503).json({ success: false, error: 'Entra ID is not configured on this server.' })
    return
  }
  const state = signState()

  const params = new URLSearchParams({
    client_id:     cfg.clientId,
    response_type: 'code',
    redirect_uri:  redirectUri,
    response_mode: 'query',
    scope:         'openid profile email User.Read',
    state,
  })

  const url = `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/authorize?${params}`
  res.json({ success: true, data: { url } })
})

// Every failed sign-in lands on the login page with ?auth_error=...; log the same reason server-side
// (never the code or tokens) so a failure can be diagnosed from the server log.
router.use('/callback', (_req, res, next) => {
  const redirect = res.redirect.bind(res) as (url: string) => void
  res.redirect = ((url: string) => {
    try { const reason = new URL(url).searchParams.get('auth_error'); if (reason) console.warn(`[auth] Microsoft sign-in failed: ${reason}`) } catch { /* not a URL */ }
    redirect(url)
  }) as typeof res.redirect
  next()
})

// ─── GET /api/auth/callback ───────────────────────────────────────────────────
// Microsoft redirects here after authentication.
router.get('/callback', async (req, res) => {
  const { redirectUri, frontendOrigin, misconfigured } = resolveOrigins(req)
  if (misconfigured) { res.status(503).type('text').send('Microsoft sign-in is not configured for this server address. An administrator must set AUTH_REDIRECT_URI and FRONTEND_URL.'); return }
  const { code, state, error, error_description } = req.query as Record<string, string>

  if (error) {
    const msg = encodeURIComponent(error_description ?? error ?? 'Authentication failed')
    res.redirect(`${frontendOrigin}/?auth_error=${msg}`)
    return
  }

  // Validate CSRF state
  if (!verifyState(state)) {
    res.redirect(`${frontendOrigin}/?auth_error=${encodeURIComponent('Invalid or expired auth state. Please try again.')}`)
    return
  }

  const cfg = getEntraConfig()
  if (!cfg) {
    res.redirect(`${frontendOrigin}/?auth_error=${encodeURIComponent('Server configuration error.')}`)
    return
  }

  if (!code) {
    res.redirect(`${frontendOrigin}/?auth_error=${encodeURIComponent('Authorization code missing.')}`)
    return
  }

  try {
    // 1. Exchange code for tokens
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        body: new URLSearchParams({
          client_id:     cfg.clientId,
          client_secret: cfg.clientSecret,
          grant_type:    'authorization_code',
          code:          code,
          redirect_uri:  redirectUri,
          scope:         'openid profile email User.Read',
        }),
        signal: upstream(),
      }
    )
    if (!tokenRes.ok) {
      const err = await tokenRes.json() as { error_description?: string }
      throw new Error(err.error_description ?? 'Token exchange failed')
    }
    const tokens = await tokenRes.json() as { access_token: string; id_token: string }

    // 2. Get user profile
    const me = await graphGet<{ displayName: string; userPrincipalName: string; mail?: string | null; id: string }>(
      tokens.access_token,
      '/me?$select=displayName,userPrincipalName,mail,id'
    )
    if (!me) throw new Error('Failed to retrieve user profile from Microsoft Graph')

    const email       = me.userPrincipalName?.toLowerCase() ?? ''
    const displayName = me.displayName ?? email
    const userId      = me.id

    // 3. Determine role. Order: email allowlist (unconditional bootstrap) →
    // per-user role assignment (Settings → Roles & Permissions, custom RBAC)
    // → legacy AAD group membership (unchanged) → denied. See roleResolution.ts.
    let legacyRole: 'IT Admin' | 'Helpdesk' | null = null
    let groupLookupFailed = false
    const allowed = allowedEmails()
    const isAllowlisted = allowed.includes(email) || allowed.includes((me.mail ?? '').toLowerCase())

    if (!isAllowlisted) {
      const appToken = await getAppToken()
      if (appToken) {
        const groups = await listUserGroups(appToken, userId)
        if (!groups) groupLookupFailed = true
        else if (inGroup(groups, itAdminGroup(), process.env.AUTH_IT_ADMIN_GROUP_ID)) legacyRole = 'IT Admin'
        else if (inGroup(groups, helpdeskGroup(), process.env.AUTH_HELPDESK_GROUP_ID)) legacyRole = 'Helpdesk'
        else {
          // Help diagnose "I am in the group but was refused": log what Graph returned (group names only).
          const close = groups.map(g => g.name).filter(g => /endpoint|portal|desktop|ito/i.test(g)).slice(0, 10)
          console.warn(`[auth] ${email} belongs to ${groups.length} group(s); none is '${itAdminGroup()}' or '${helpdeskGroup()}'. Similar names: ${close.length ? close.join(' | ') : 'none'}`)
        }
      } else {
        groupLookupFailed = true
      }
    }

    const resolution = await resolveUserRole(email, isAllowlisted, { role: legacyRole, lookupFailed: groupLookupFailed })
    if ('denied' in resolution) {
      // A failed lookup is a server/permission problem, not proof the user lacks access: say so.
      const msg = encodeURIComponent(resolution.groupLookupFailed
        ? `Signed in as ${email}, but group membership could not be checked. Ask an administrator to grant the app the GroupMember.Read.All permission.`
        : `Access denied. ${email} is not assigned a role and is not a member of '${itAdminGroup()}' or '${helpdeskGroup()}'.`)
      res.redirect(`${frontendOrigin}/?auth_error=${msg}`)
      return
    }
    const role = resolution.role

    // 4. Issue a short-lived JWT and send to frontend via URL param
    const sessionToken = jwt.sign(
      { role, displayName, email },
      JWT_SECRET,
      { expiresIn: TOKEN_TTL_SECS }
    )

    // Fragment, not query string: it is never sent to a server, logged, or passed in a Referer header.
    res.redirect(`${frontendOrigin}/#session_token=${sessionToken}`)
  } catch (err) {
    const msg = err instanceof Error && err.name === 'TimeoutError' ? 'Microsoft took too long to respond. Please try again.' : err instanceof Error ? err.message : 'Authentication error'
    res.redirect(`${frontendOrigin}/?auth_error=${encodeURIComponent(msg)}`)
  }
})

// ─── POST /api/auth/verify ────────────────────────────────────────────────────
// Frontend calls this on load to validate the JWT it stored.
router.post('/verify', (req, res) => {
  const { token } = req.body as { token?: string }
  if (!token) {
    res.status(401).json({ success: false, error: 'No token provided' })
    return
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { role: string; displayName: string; email: string }
    res.json({ success: true, data: { role: payload.role, displayName: payload.displayName, email: payload.email } })
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired session' })
  }
})

// ─── Portal sign-in (see services/session.ts) ────────────────────────────────
const signInLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { success: false, error: 'Too many sign-in attempts, please try again later.' },
})

// GET /api/auth/config — tells the login page whether to ask for a password
router.get('/config', (_req, res) => {
  res.json({ success: true, data: { passwordRequired: passwordRequired(), enforced: authEnforced(), emailSignIn: emailSignInEnabled(), microsoft: !!getEntraConfig() } })
})

// POST /api/auth/session { email, password? } — signs in an allow-listed email
router.post('/session', signInLimiter, (req, res) => {
  const body = (req.body ?? {}) as { email?: unknown; password?: unknown }
  const result = authenticate(body.email, body.password)
  if (!result.ok) { res.status(result.status).json({ success: false, error: result.error }); return }
  res.json({ success: true, data: { token: signSession(result.claims), user: result.claims } })
})

// GET /api/auth/me — the signed-in user for a Bearer token (used on page load).
// Permissions are resolved fresh from the role's current permission set on
// every call (not baked into the JWT), so an admin's edit in Settings →
// Roles & Permissions takes effect on the next page load, not just next sign-in.
router.get('/me', (req, res, next) => {
  const token = bearerToken(req)
  const claims = token ? verifySession(token) : null
  if (!claims) { res.status(401).json({ success: false, error: 'Not signed in.' }); return }
  permissionsForRole(claims.role)
    .then(permissions => res.json({ success: true, data: { ...claims, permissions } }))
    .catch(next)
})

export default router
