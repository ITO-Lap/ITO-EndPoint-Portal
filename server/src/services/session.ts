// Sign-in sessions for the ITO Endpoint portal: a signed token issued after
// sign-in and verified on every /api request (middleware/requireSession.ts).
//
// Sign-in is passwordless for now: an email on the allow-list gets a session.
// That is a gate, not strong authentication: anyone who types an allowed address
// can sign in. Set AUTH_PASSWORD to require a shared password, or switch to the
// Entra sign-in in routes/auth.ts, before exposing this beyond a trusted network.
//
//   AUTH_ALLOWED_EMAILS  comma-separated, default avinash.verma@zinnia.com
//   AUTH_PASSWORD        when set, the password is required as well
//   AUTH_ENFORCED        "false" turns the API gate off (local debugging only)
//   SESSION_SECRET       signing key; if unset a random one is used and every
//                        restart signs everyone out

import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import jwt from 'jsonwebtoken'

export const SESSION_SECRET = process.env['SESSION_SECRET'] ?? randomBytes(32).toString('hex')
export const SESSION_TTL_SECS = 8 * 60 * 60 // 8 hours
const DEFAULT_ALLOWED = 'avinash.verma@zinnia.com'

export interface SessionClaims { email: string; displayName: string; role: string }

export const allowedEmails = (): string[] =>
  (process.env['AUTH_ALLOWED_EMAILS'] ?? DEFAULT_ALLOWED).split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
export const authEnforced = (): boolean => process.env['AUTH_ENFORCED'] !== 'false'
export const passwordRequired = (): boolean => !!process.env['AUTH_PASSWORD']

/** "avinash.verma@zinnia.com" → "Avinash Verma" */
export function displayNameFor(email: string): string {
  return (email.split('@')[0] ?? email).split(/[._-]+/).filter(Boolean).map(p => p[0]!.toUpperCase() + p.slice(1)).join(' ')
}

const digest = (v: string) => createHash('sha256').update(v).digest()

export type AuthResult = { ok: true; claims: SessionClaims } | { ok: false; status: 401 | 403; error: string }

export function authenticate(emailInput: unknown, passwordInput?: unknown): AuthResult {
  const email = typeof emailInput === 'string' ? emailInput.trim().toLowerCase() : ''
  const allowed = email.length > 0 && allowedEmails().includes(email)
  if (passwordRequired()) {
    // One message for "unknown email" and "wrong password", so the allow-list cannot be probed.
    const passwordOk = typeof passwordInput === 'string' && timingSafeEqual(digest(passwordInput), digest(process.env['AUTH_PASSWORD']!))
    if (!allowed || !passwordOk) return { ok: false, status: 401, error: 'Incorrect email or password.' }
  } else if (!allowed) {
    return { ok: false, status: 403, error: 'This email is not authorised to use ITO Endpoint.' }
  }
  return { ok: true, claims: { email, displayName: displayNameFor(email), role: 'Global Admin' } }
}

export const signSession = (claims: SessionClaims): string => jwt.sign(claims, SESSION_SECRET, { expiresIn: SESSION_TTL_SECS })

export function verifySession(token: string): SessionClaims | null {
  try {
    const p = jwt.verify(token, SESSION_SECRET) as Partial<SessionClaims>
    return p.email && p.displayName && p.role ? { email: p.email, displayName: p.displayName, role: p.role } : null
  } catch {
    return null
  }
}
