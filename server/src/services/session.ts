// Sign-in sessions for the ITO Endpoint portal: a signed token issued after
// sign-in and verified on every /api request (middleware/requireSession.ts).
//
// People sign in with Microsoft (Entra ID, routes/auth.ts). Email-only sign-in is a
// gate, not authentication (anyone who types an allowed address gets in), so it is OFF
// unless AUTH_PASSWORDLESS=true (local development) or AUTH_PASSWORD adds a password.
//
//   AUTH_ALLOWED_EMAILS  comma-separated, default avinash.verma@zinnia.com
//   AUTH_PASSWORD        when set, the password is required as well
//   AUTH_PASSWORDLESS    "true" turns on email-only sign-in (local development only)
//   AUTH_ENFORCED        "false" turns the API gate off (local debugging only)
//   SESSION_SECRET       signing key; if unset one is generated and saved to server/.session-secret

import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { chmodSync, readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import jwt from 'jsonwebtoken'

// SESSION_SECRET if set; otherwise a key generated once and kept in server/.session-secret (git-ignored,
// owner-only), so restarts do not sign everyone out or break a Microsoft sign-in that is in flight.
// Tests (NODE_ENV=test) use a throwaway in-memory key.
function loadSecret(): string {
  const fromEnv = process.env['SESSION_SECRET']
  if (fromEnv) return fromEnv
  const generated = randomBytes(32).toString('hex')
  if (process.env['NODE_ENV'] === 'test') return generated
  const file = resolve(dirname(fileURLToPath(import.meta.url)), '../../.session-secret')
  try { const saved = readFileSync(file, 'utf-8').trim(); if (saved.length >= 32) return saved } catch { /* not created yet */ }
  try { writeFileSync(file, generated, { mode: 0o600 }); chmodSync(file, 0o600) }
  catch (e) { console.warn('[auth] Could not persist a session key; sessions will end when the server restarts:', e) }
  return generated
}

export const SESSION_SECRET = loadSecret()
export const SESSION_TTL_SECS = 8 * 60 * 60 // 8 hours
// Who is Global Admin once Microsoft has verified them (and who may use email sign-in, when it is on).
const DEFAULT_ALLOWED = 'avinash.verma@zinnia.com'

export interface SessionClaims { email: string; displayName: string; role: string }

export const allowedEmails = (): string[] =>
  (process.env['AUTH_ALLOWED_EMAILS'] ?? DEFAULT_ALLOWED).split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
export const authEnforced = (): boolean => process.env['AUTH_ENFORCED'] !== 'false'
export const passwordRequired = (): boolean => !!process.env['AUTH_PASSWORD']
/** Email sign-in is off by default: it needs AUTH_PASSWORDLESS=true or a configured AUTH_PASSWORD. */
export const emailSignInEnabled = (): boolean => process.env['AUTH_PASSWORDLESS'] === 'true' || passwordRequired()

/** "avinash.verma@zinnia.com" → "Avinash Verma" */
export function displayNameFor(email: string): string {
  return (email.split('@')[0] ?? email).split(/[._-]+/).filter(Boolean).map(p => p[0]!.toUpperCase() + p.slice(1)).join(' ')
}

const digest = (v: string) => createHash('sha256').update(v).digest()

export type AuthResult = { ok: true; claims: SessionClaims } | { ok: false; status: 401 | 403; error: string }

export function authenticate(emailInput: unknown, passwordInput?: unknown): AuthResult {
  if (!emailSignInEnabled()) return { ok: false, status: 403, error: 'Email sign-in is turned off. Sign in with your Microsoft account.' }
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
