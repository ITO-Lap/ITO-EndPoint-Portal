import type { UserToolRole } from '../types'

export type PermissionMap = Record<string, boolean>

// Every nav page must appear here — kept in sync with the matching page list
// in server/src/services/rolePermissions.ts (the source of truth for which
// permission keys exist; this file only asserts nothing was left out, see
// permissions.test.ts). Which role can see which page is no longer a static
// map here — it comes from the signed-in user's live permissions, resolved
// server-side from their custom-RBAC role (see PermissionsContext).
export const KNOWN_PAGES = [
  'Dashboard',
  'Managed Devices', 'ManageEngine App Inventory', 'Stale Devices', 'App Guardian',
  'Mac Fleet Reports', 'Entra Intelligence',
  'Security Posture', 'Policy Conflicts', 'Risk Scoring', 'Role Activity Audit', 'Patch Operations', 'Windows Updates', 'Windows Package Builder', 'Mac Package Builder',
  'Remote Action Center',
  'Automation',
  'Reports & Analytics', 'Scheduled Reports',
  'Settings', 'Documentation',
]

export const pageKey = (title: string): string => `pages.${title}`
export const isPageListed = (page: string): boolean => KNOWN_PAGES.includes(page)

/** Global Admin always has every permission, mirroring the server's
 *  isGlobalAdmin() bypass (server/src/services/rolePermissions.ts) — so a
 *  page or capability added to the frontend before its key exists on the
 *  server still defaults to Global-Admin-only, same as the old static map. */
export function hasPermission(role: UserToolRole | string, permissions: PermissionMap, key: string): boolean {
  if (role === 'Global Admin') return true
  return permissions[key] === true
}

export function canAccess(role: UserToolRole, permissions: PermissionMap, page: string): boolean {
  return hasPermission(role, permissions, pageKey(page))
}

/** Who may change the day/time of automatic Slack report deliveries (the server enforces the same permission). */
export const canEditSlackSchedules = (role: UserToolRole | string, permissions: PermissionMap): boolean =>
  hasPermission(role, permissions, 'scheduledReports.editSlackSchedule')
