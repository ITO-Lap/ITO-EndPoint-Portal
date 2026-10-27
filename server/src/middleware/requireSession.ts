// Gate for every /api route except sign-in itself. Verifies the signed session
// token and then OVERWRITES x-user-email / x-user-role with the verified values,
// so downstream role checks (requireRole.ts) can no longer be spoofed by a
// client-supplied header.

import type { Request, Response, NextFunction } from 'express'
import { authEnforced, verifySession, type SessionClaims } from '../services/session.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { authUser?: SessionClaims }
  }
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.authorization
  return header?.startsWith('Bearer ') ? header.slice(7).trim() || null : null
}

export function requireSession(req: Request, res: Response, next: NextFunction): void {
  if (!authEnforced()) { next(); return }
  const token = bearerToken(req)
  const claims = token ? verifySession(token) : null
  if (!claims) {
    res.status(401).json({ success: false, error: 'Authentication required. Please sign in.' })
    return
  }
  req.authUser = claims
  req.headers['x-user-email'] = claims.email
  req.headers['x-user-role'] = claims.role
  next()
}

/** Mounted on /api: sign-in endpoints stay open, everything else needs a session. */
export const requireSessionExceptAuth = (req: Request, res: Response, next: NextFunction): void =>
  req.path.startsWith('/auth/') ? next() : requireSession(req, res, next)
