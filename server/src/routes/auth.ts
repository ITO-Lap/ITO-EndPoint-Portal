/**
 * Entra ID authentication via OAuth 2.0 Authorization Code flow.
 *
 * Azure AD app registration needs ONE redirect URI added (Web type):
 *   http://localhost:4000/api/auth/callback
 *
 * Role mapping:
 *   avinash.verma@zinnia.com        → Global Admin
 *   member of "ITO EndPoint Portal" → IT Admin
 *   member of "Desktop Support"     → Helpdesk
 *   anyone else                     → 403
 */
import { Router } from 'express'
import { createHmac, randomBytes } from 'crypto'
import jwt from 'jsonwebtoken'
import rateLimit from 'express-rate-limit'
import { getEntraConfig } from '../store/integrationStore.js'
import { SESSION_SECRET, authEnforced, authenticate, passwordRequired, signSession, verifySession } from '../services/session.js'
import { bearerToken } from '../middleware/requireSession.js'

const router = Router()

// ─── Constants ────────────────────────────────────────────────────────────────
const GLOBAL_ADMIN_EMAIL = 'avinash.verma@zinnia.com'
const IT_ADMIN_GROUP     = 'ITO EndPoint Portal'
const HELPDESK_GROUP     = 'Desktop Support'
const REDIRECT_URI       = 'http://localhost:4000/api/auth/callback'
const FRONTEND_ORIGIN    = process.env.FRONTEND_URL ?? 'http://localhost:5173'
const JWT_SECRET         = SESSION_SECRET
const TOKEN_TTL_SECS     = 8 * 60 * 60 // 8 hours

// ─── In-memory CSRF state store (state → expiry) ──────────────────────────────
const stateStore = new Map<string, number>()
function pruneStates() {
  const now = Date.now()
  stateStore.forEach((exp, k) => { if (exp < now) stateStore.delete(k) })
}

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
    }
  )
  if (!res.ok) return null
  const data = await res.json() as { access_token: string; expires_in: number }
  appTokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1_000 }
  return appTokenCache.token
}

async function graphGet<T>(token: string, path: string): Promise<T | null> {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  return res.json() as Promise<T>
}

// ─── GET /api/auth/login ──────────────────────────────────────────────────────
// Returns the Microsoft OAuth URL for the frontend to redirect to.
router.get('/login', (req, res) => {
  const cfg = getEntraConfig()
  if (!cfg) {
    res.status(503).json({ success: false, error: 'Entra ID is not configured on this server.' })
    return
  }
  pruneStates()
  const state = randomBytes(16).toString('hex')
  stateStore.set(state, Date.now() + 10 * 60 * 1_000) // 10 min expiry

  const params = new URLSearchParams({
    client_id:     cfg.clientId,
    response_type: 'code',
    redirect_uri:  REDIRECT_URI,
    response_mode: 'query',
    scope:         'openid profile email User.Read',
    state,
  })

  const url = `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/authorize?${params}`
  res.json({ success: true, data: { url } })
})

// ─── GET /api/auth/callback ───────────────────────────────────────────────────
// Microsoft redirects here after authentication.
router.get('/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query as Record<string, string>

  if (error) {
    const msg = encodeURIComponent(error_description ?? error ?? 'Authentication failed')
    res.redirect(`${FRONTEND_ORIGIN}/?auth_error=${msg}`)
    return
  }

  // Validate CSRF state
  const stateExpiry = stateStore.get(state ?? '')
  if (!stateExpiry || Date.now() > stateExpiry) {
    res.redirect(`${FRONTEND_ORIGIN}/?auth_error=${encodeURIComponent('Invalid or expired auth state. Please try again.')}`)
    return
  }
  stateStore.delete(state ?? '')

  const cfg = getEntraConfig()
  if (!cfg) {
    res.redirect(`${FRONTEND_ORIGIN}/?auth_error=${encodeURIComponent('Server configuration error.')}`)
    return
  }

  if (!code) {
    res.redirect(`${FRONTEND_ORIGIN}/?auth_error=${encodeURIComponent('Authorization code missing.')}`)
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
          redirect_uri:  REDIRECT_URI,
          scope:         'openid profile email User.Read',
        }),
      }
    )
    if (!tokenRes.ok) {
      const err = await tokenRes.json() as { error_description?: string }
      throw new Error(err.error_description ?? 'Token exchange failed')
    }
    const tokens = await tokenRes.json() as { access_token: string; id_token: string }

    // 2. Get user profile
    const me = await graphGet<{ displayName: string; userPrincipalName: string; id: string }>(
      tokens.access_token,
      '/me?$select=displayName,userPrincipalName,id'
    )
    if (!me) throw new Error('Failed to retrieve user profile from Microsoft Graph')

    const email       = me.userPrincipalName?.toLowerCase() ?? ''
    const displayName = me.displayName ?? email
    const userId      = me.id

    // 3. Determine role
    let role: string | null = null

    if (email === GLOBAL_ADMIN_EMAIL) {
      role = 'Global Admin'
    } else {
      const appToken = await getAppToken()
      if (appToken) {
        const memberOf = await graphGet<{ value: Array<{ displayName: string }> }>(
          appToken,
          `/users/${encodeURIComponent(userId)}/memberOf?$select=displayName&$top=100`
        )
        const groups = (memberOf?.value ?? []).map(g => g.displayName)
        if (groups.includes(IT_ADMIN_GROUP))   role = 'IT Admin'
        else if (groups.includes(HELPDESK_GROUP)) role = 'Helpdesk'
      }
    }

    if (!role) {
      const msg = encodeURIComponent(
        `Access denied. ${email} is not a member of '${IT_ADMIN_GROUP}' or '${HELPDESK_GROUP}'.`
      )
      res.redirect(`${FRONTEND_ORIGIN}/?auth_error=${msg}`)
      return
    }

    // 4. Issue a short-lived JWT and send to frontend via URL param
    const sessionToken = jwt.sign(
      { role, displayName, email },
      JWT_SECRET,
      { expiresIn: TOKEN_TTL_SECS }
    )

    res.redirect(`${FRONTEND_ORIGIN}/?session_token=${sessionToken}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Authentication error'
    res.redirect(`${FRONTEND_ORIGIN}/?auth_error=${encodeURIComponent(msg)}`)
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
  res.json({ success: true, data: { passwordRequired: passwordRequired(), enforced: authEnforced() } })
})

// POST /api/auth/session { email, password? } — signs in an allow-listed email
router.post('/session', signInLimiter, (req, res) => {
  const body = (req.body ?? {}) as { email?: unknown; password?: unknown }
  const result = authenticate(body.email, body.password)
  if (!result.ok) { res.status(result.status).json({ success: false, error: result.error }); return }
  res.json({ success: true, data: { token: signSession(result.claims), user: result.claims } })
})

// GET /api/auth/me — the signed-in user for a Bearer token (used on page load)
router.get('/me', (req, res) => {
  const token = bearerToken(req)
  const claims = token ? verifySession(token) : null
  if (!claims) { res.status(401).json({ success: false, error: 'Not signed in.' }); return }
  res.json({ success: true, data: claims })
})

export default router
