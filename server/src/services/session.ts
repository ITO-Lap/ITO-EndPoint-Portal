// Sign-in sessions for the EndPoint+ portal: a signed token issued after
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

import { dataFile, legacyServerFile } from '../store/dataDir.js'
import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { chmodSync, readFileSync, writeFileSync } from 'fs'
import jwt from 'jsonwebtoken'
import { getIdleTimeoutMin } from '../store/sessionSettings.js'

// SESSION_SECRET if set; otherwise a key generated once and kept in DATA_DIR/session-secret (git-ignored,
// owner-only), so restarts do not sign everyone out or break a Microsoft sign-in that is in flight.
// Tests (NODE_ENV=test) use a throwaway in-memory key.
function loadSecret(): string {
  const fromEnv = process.env['SESSION_SECRET']
  if (fromEnv) return fromEnv
  const generated = randomBytes(32).toString('hex')
  if (process.env['NODE_ENV'] === 'test') return generated
  const file = dataFile('session-secret', [legacyServerFile('.session-secret')])
  try { const saved = readFileSync(file, 'utf-8').trim(); if (saved.length >= 32) return saved } catch { /* not created yet */ }
  try { writeFileSync(file, generated, { mode: 0o600 }); chmodSync(file, 0o600) }
  catch (e) { console.warn('[auth] Could not persist a session key; sessions will end when the server restarts:', e) }
  return generated
}

export const SESSION_SECRET = loadSecret()
// Hard limit: a session ends 9 hours after sign-in however active the person is, so everyone signs in again at least that often.
export const SESSION_TTL_SECS = 9 * 60 * 60
// Changes on every server start. It is stamped into each token, so a restart signs everyone out.
export const BOOT_ID = randomBytes(12).toString('hex')
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
    return { ok: false, status: 403, error: 'This email is not authorised to use EndPoint+.' }
  }
  return { ok: true, claims: { email, displayName: displayNameFor(email), role: 'Global Admin' } }
}

export const signSession = (claims: SessionClaims): string =>
  jwt.sign({ ...claims, bid: BOOT_ID }, SESSION_SECRET, { expiresIn: SESSION_TTL_SECS })

// Last time the person did something (not background polling), per token. Memory only: a restart
// ends every session anyway, so nothing needs to survive one.
const lastActive = new Map<string, number>()
const tokenKey = (token: string): string => createHash('sha256').update(token).digest('hex')

/** Records real user activity for this session. */
export function touchSession(token: string, now = Date.now()): void { lastActive.set(tokenKey(token), now) }
export function forgetSession(token: string): void { lastActive.delete(tokenKey(token)) }

/** True when the person has been inactive for longer than the configured auto sign-out time. */
export function isIdleExpired(token: string, now = Date.now()): boolean {
  const key = tokenKey(token)
  const seen = lastActive.get(key)
  if (seen === undefined) { lastActive.set(key, now); return false } // first sight of a valid token counts as activity
  return now - seen > getIdleTimeoutMin() * 60_000
}

/** Drops idle records of sessions that can no longer be valid (older than the hard limit). */
export function pruneIdleRecords(now = Date.now()): void {
  for (const [k, t] of lastActive) if (now - t > SESSION_TTL_SECS * 1000) lastActive.delete(k)
}

export function verifySession(token: string): SessionClaims | null {
  try {
    const p = jwt.verify(token, SESSION_SECRET) as Partial<SessionClaims> & { bid?: string }
    if (p.bid !== BOOT_ID) return null // issued before the last server start
    return p.email && p.displayName && p.role ? { email: p.email, displayName: p.displayName, role: p.role } : null
  } catch {
    return null
  }
}

setInterval(() => pruneIdleRecords(), 60 * 60 * 1000).unref()
