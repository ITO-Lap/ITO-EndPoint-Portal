// Server-side role enforcement for the Intune Audit Logs module.
//
// The rest of this application has NO server-side authorization today — the
// frontend hardcodes viewerRole="Global Admin" (see src/App.tsx) and every
// other route trusts the client entirely. That's a known, accepted gap for a
// single-fixed-identity internal tool, but this module handles export/email
// creation (data-exfiltration-relevant) and schedule administration, so it
// enforces role checks for real: every request must carry the role via the
// `x-user-role` header (sent by the frontend, which already knows the
// caller's role from the same viewerRole prop every other page reads).
//
// This is a meaningful improvement over the rest of the app (nothing here
// silently trusts the client for authorization decisions in isolation from
// the same identity model already in place), but it is NOT the same as real
// per-user authentication — a header is not a verified credential. True
// tenant/user-level enforcement requires re-enabling the existing (currently
// unused) OAuth session flow in server/src/routes/auth.ts and switching this
// middleware to read the verified JWT instead of a client-supplied header.
// That is called out explicitly in docs as a known limitation, not silently
// papered over.

import type { Request, Response, NextFunction } from 'express'

export type AuditRole = 'Audit Reader' | 'Audit Exporter' | 'Audit Administrator'

const ROLE_HIERARCHY: Record<string, AuditRole[]> = {
  'Global Admin': ['Audit Reader', 'Audit Exporter', 'Audit Administrator'],
  'IT Admin':     ['Audit Reader', 'Audit Exporter', 'Audit Administrator'],
  'Helpdesk':     ['Audit Reader'],
  'End User':     [],
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auditActor?: { email: string; appRole: string; auditRoles: AuditRole[] }
    }
  }
}

function resolveAuditRoles(appRole: string | undefined): AuditRole[] {
  if (!appRole) return []
  return ROLE_HIERARCHY[appRole] ?? []
}

/** Populates req.auditActor from request headers. Does not itself reject —
 *  requireAuditRole() below is what enforces a specific permission level.
 *  Kept separate so every route can also record req.auditActor.email in the
 *  application audit trail even on read-only GETs. */
export function identifyAuditActor(req: Request, _res: Response, next: NextFunction): void {
  const appRole = req.header('x-user-role') ?? 'End User'
  const email = req.header('x-user-email') ?? 'unknown@zinnia.com'
  req.auditActor = { email, appRole, auditRoles: resolveAuditRoles(appRole) }
  next()
}

export function requireAuditRole(minRole: AuditRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const actor = req.auditActor
    if (!actor || !actor.auditRoles.includes(minRole)) {
      res.status(403).json({
        success: false,
        error: `This action requires the "${minRole}" role.`,
      })
      return
    }
    next()
  }
}

/** Generic app-role gate for features that aren't part of the audit domain
 *  (so they don't need to be shoehorned into AuditRole/ROLE_HIERARCHY above).
 *  Same header-trust caveat as identifyAuditActor: this reads the
 *  client-supplied x-user-role header, not a verified credential. */
export function requireAppRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const appRole = req.header('x-user-role') ?? 'End User'
    if (!allowedRoles.includes(appRole)) {
      res.status(403).json({
        success: false,
        error: `This action requires one of the following roles: ${allowedRoles.join(', ')}.`,
      })
      return
    }
    next()
  }
}
