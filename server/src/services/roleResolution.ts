// Centralizes "what role (and permissions) does this signed-in user get" —
// used by routes/auth.ts at sign-in and by requireCapability() /
// GET /api/auth/me on every subsequent request.
//
// Resolution order (additive — nothing that works today stops working):
//   1. Email allowlist           → Global Admin, unconditionally. The
//      original bootstrap mechanism; cannot be overridden by an assignment,
//      so nobody can configure themselves out of admin access.
//   2. Per-user role assignment  → whatever role (built-in or custom) an
//      admin assigned this email to via Settings → Roles & Permissions.
//      This is the new per-user mapping mechanism.
//   3. Legacy AAD group lookup   → today's IT Admin / Helpdesk
//      group-membership mechanism (server/src/routes/auth.ts), unchanged,
//      so nobody currently relying on group membership loses access.
//   4. Denied.

import * as rolesStore from '../store/rolesStore.js'
import { isGlobalAdmin, allTruePermissions, type PermissionMap } from './rolePermissions.js'

export interface LegacyGroupResolution { role: 'IT Admin' | 'Helpdesk' | null; lookupFailed: boolean }
export type RoleResolution = { role: string } | { denied: true; groupLookupFailed: boolean }

export async function resolveUserRole(email: string, isAllowlisted: boolean, legacy: LegacyGroupResolution): Promise<RoleResolution> {
  if (isAllowlisted) return { role: 'Global Admin' }

  const assignment = await rolesStore.getAssignment(email)
  if (assignment) {
    const role = await rolesStore.getRole(assignment.role_id)
    if (role) return { role: role.name }
    console.warn(`[roleResolution] ${email} is assigned to role ${assignment.role_id}, which no longer exists — falling back to group lookup.`)
  }

  if (legacy.role) return { role: legacy.role }
  return { denied: true, groupLookupFailed: legacy.lookupFailed }
}

// ─── Role name → permission set, cached briefly so a signed-in user's every
//     request doesn't round-trip the store, while still picking up an admin's
//     edit within seconds rather than requiring re-login. ────────────────────
const CACHE_TTL_MS = 15_000
const cache = new Map<string, { perms: PermissionMap; expiresAt: number }>()

/** Call after any role/assignment mutation so an edit is visible immediately
 *  instead of waiting out the cache TTL. */
export function invalidatePermissionsCache(roleName?: string): void {
  if (roleName) cache.delete(roleName)
  else cache.clear()
}

export async function permissionsForRole(roleName: string): Promise<PermissionMap> {
  if (isGlobalAdmin(roleName)) return allTruePermissions()

  const cached = cache.get(roleName)
  if (cached && Date.now() < cached.expiresAt) return cached.perms

  const role = await rolesStore.getRoleByName(roleName)
  const perms: PermissionMap = role?.permissions ?? {}
  cache.set(roleName, { perms, expiresAt: Date.now() + CACHE_TTL_MS })
  return perms
}
