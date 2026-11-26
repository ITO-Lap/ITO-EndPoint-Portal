// Server-side role enforcement.
//
// Microsoft/AAD sign-in (server/src/routes/auth.ts) is live, and
// requireSession.ts verifies the session JWT on every /api request and
// overwrites x-user-role / x-user-email with the verified claims before any
// check below runs — so, whenever AUTH_ENFORCED is on, these are no longer a
// spoofable client-supplied header, they're backed by a real verified
// credential. (The header-trust caveat below only still applies when
// AUTH_ENFORCED=false, a deliberately open local-dev mode.)

import type { Request, Response, NextFunction } from 'express'
import { permissionsForRole } from '../services/roleResolution.js'

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

/** Custom-RBAC gate: checks the caller's role against a dynamic permission
 *  key (see rolePermissions.ts) instead of a hardcoded role-name array, so a
 *  Global Admin can grant/revoke this capability to a custom role without a
 *  code change. Supersedes requireAppRole() for every caller that has been
 *  migrated to a permission key. */
/** Allows the request when the role has ANY of the listed permissions (used where several pages share one endpoint). */
export function requireAnyCapability(...keys: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const appRole = req.header('x-user-role') ?? 'End User'
    permissionsForRole(appRole)
      .then(perms => {
        if (!keys.some(k => perms[k] === true)) {
          res.status(403).json({ success: false, error: `This action requires one of these permissions: ${keys.join(', ')}.` })
          return
        }
        next()
      })
      .catch(next)
  }
}

export function requireCapability(key: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const appRole = req.header('x-user-role') ?? 'End User'
    permissionsForRole(appRole)
      .then(perms => {
        if (perms[key] !== true) {
          res.status(403).json({ success: false, error: `This action requires the "${key}" permission.` })
          return
        }
        next()
      })
      .catch(next)
  }
}
