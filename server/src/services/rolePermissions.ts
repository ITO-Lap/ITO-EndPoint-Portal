// Canonical permission-key taxonomy for custom RBAC. Single source of truth,
// consumed by: requireCapability() middleware, routes/roles.ts (exposes this
// list to the frontend so client and server can never drift), and the
// built-in role seeds below. Every key here maps 1:1 onto a permission check
// that already exists somewhere in the app today (see docs/ROLES.md and the
// per-file role arrays this replaces) — this migration is behavior-preserving,
// not a new, finer-grained policy invented from scratch.
//
// Global Admin is intentionally NOT stored as a row of all-true keys: it is
// hardcoded to always have every permission (see isGlobalAdmin() callers),
// so an edit to its stored row — or a page/capability added after this file
// was last touched — can never accidentally lock every admin out.

export interface PermissionGroup {
  key:   string
  label: string
  keys:  { key: string; label: string }[]
}

// Page-access keys — one per nav page, replacing src/lib/permissions.ts's
// PAGE_ROLES map 1:1 (same page titles, same default built-in assignments).
const PAGE_TITLES = [
  'Dashboard',
  'Managed Devices', 'ManageEngine App Inventory', 'Stale Devices', 'App Guardian',
  'Mac Fleet Reports', 'Entra Intelligence',
  'Security Posture', 'Policy Conflicts', 'Risk Scoring', 'Role Activity Audit', 'Patch Operations', 'Windows Updates', 'Windows Package Builder', 'Mac Package Builder',
  'Remote Action Center',
  'Automation',
  'Reports & Analytics', 'Scheduled Reports',
  'Settings', 'Documentation',
] as const

export const pageKey = (title: string): string => `pages.${title}`

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: 'pages', label: 'Page access',
    keys: PAGE_TITLES.map(title => ({ key: pageKey(title), label: title })),
  },
  {
    key: 'capabilities', label: 'Capabilities',
    keys: [
      { key: 'appIntel.read',                         label: 'View App Guardian data' },
      { key: 'appIntel.write',                         label: 'Send App Guardian reports / submit requests' },
      { key: 'securityPolicies.read',                  label: 'Security Policies snapshots: view (separate from the Policy Conflicts page)' },
      { key: 'securityPolicies.sync',                  label: 'Security Policies snapshots: trigger a sync' },
      { key: 'staleDevices.read',                      label: 'View Stale Devices data' },
      { key: 'staleDevices.export',                    label: 'Export Stale Devices data' },
      { key: 'devices.logs',                          label: 'Pull and export device logs (Managed Devices)' },
      { key: 'patchOps.scanRemediate',                 label: 'Patch Operations: scan & remediate actions' },
      { key: 'copilot.access',                         label: 'Use the Copilot panel' },
      { key: 'copilot.read',                           label: 'Copilot: chat, view conversations' },
      { key: 'copilot.write',                          label: 'Copilot: confirm write actions' },
      { key: 'ocean.docs.manage',                      label: 'Ocean: manage the knowledge base & read administrator-only documentation' },
      { key: 'intuneScriptsConfig.access',             label: 'View Scripts & Configurations tab' },
      { key: 'notificationSchedules.edit',             label: 'Edit a notification schedule (day/time)' },
      { key: 'scheduledReports.editSlackSchedule',     label: 'Edit Slack notification schedule time' },
      { key: 'roleActivity.export',                    label: 'Export Role Activity Audit data' },
      { key: 'settings.navigationEdit',                label: 'Edit sidebar navigation visibility' },
      { key: 'winPackager.read',                       label: 'Windows Package Builder: view jobs' },
      { key: 'winPackager.write',                      label: 'Windows Package Builder: upload sources & edit configuration' },
      { key: 'winPackager.validate',                   label: 'Windows Package Builder: run Windows validation & create packages' },
      { key: 'macPackager.read',                       label: 'Mac Package Builder: view and download published builds' },
      { key: 'remoteActions.read',                     label: 'Remote Action Center: view scripts, jobs and results (Viewer)' },
      { key: 'remoteActions.author',                   label: 'Remote Action Center: create and edit scripts (Script Admin)' },
      { key: 'remoteActions.execute',                  label: 'Remote Action Center: create and run jobs from approved scripts (Operator)' },
      { key: 'remoteActions.approve',                  label: 'Remote Action Center: approve medium/high-risk scripts and jobs (Approver)' },
      { key: 'remoteActions.admin',                    label: 'Remote Action Center: provider settings, security policy and emergency stop (Super Admin)' },
      { key: 'graphRunner.read',                       label: 'Graph API Runner: view history and saved templates' },
      { key: 'graphRunner.run',                        label: 'Graph API Runner: run read-only requests' },
      { key: 'graphRunner.change',                     label: 'Graph API Runner: submit change (POST/PATCH/PUT) requests' },
      { key: 'graphRunner.approve',                    label: 'Graph API Runner: approve destructive (DELETE) and high-impact requests' },
      { key: 'sync.manage',                            label: 'Data sync: run a sync now & change sync schedules' },
      { key: 'roles.manage',                           label: 'Manage custom roles & user assignments' },
    ],
  },
]

export const PERMISSION_KEYS: string[] = PERMISSION_GROUPS.flatMap(g => g.keys.map(k => k.key))

export type PermissionMap = Record<string, boolean>

function permsFor(trueKeys: string[]): PermissionMap {
  const map: PermissionMap = {}
  for (const key of PERMISSION_KEYS) map[key] = trueKeys.includes(key)
  return map
}

// Mirrors today's PAGE_ROLES in src/lib/permissions.ts exactly.
const IT_ADMIN_PAGES = PAGE_TITLES // IT Admin is listed on every page today
const HELPDESK_EXCLUDED_PAGES = ['Policy Conflicts', 'Risk Scoring', 'Automation', 'Reports & Analytics', 'Scheduled Reports', 'Settings', 'Windows Package Builder', 'Mac Package Builder', 'Remote Action Center']
const HELPDESK_PAGES = PAGE_TITLES.filter(t => !HELPDESK_EXCLUDED_PAGES.includes(t))

export const BUILTIN_ROLE_DEFAULTS: Record<'IT Admin' | 'Helpdesk', PermissionMap> = {
  'IT Admin': permsFor([
    ...IT_ADMIN_PAGES.map(pageKey),
    'appIntel.read', 'appIntel.write',
    'securityPolicies.read', 'securityPolicies.sync',
    'staleDevices.read', 'staleDevices.export',
    'devices.logs',
    'patchOps.scanRemediate',
    'copilot.access', 'copilot.read', 'copilot.write',
    'ocean.docs.manage',
    'intuneScriptsConfig.access',
    'notificationSchedules.edit', 'scheduledReports.editSlackSchedule',
    'roleActivity.export', 'settings.navigationEdit',
    'winPackager.read', 'winPackager.write', 'winPackager.validate',
    'macPackager.read',
    'remoteActions.read', 'remoteActions.author', 'remoteActions.execute',
    'graphRunner.read', 'graphRunner.run',
    'sync.manage',
  ]),
  'Helpdesk': permsFor([
    ...HELPDESK_PAGES.map(pageKey),
    'appIntel.read',
    'securityPolicies.read',
    'staleDevices.read',
    'devices.logs',
    'patchOps.scanRemediate',
    'copilot.access', 'copilot.read',
  ]),
}

export const BUILTIN_ROLE_NAMES = ['Global Admin', 'IT Admin', 'Helpdesk'] as const
export type BuiltinRoleName = (typeof BUILTIN_ROLE_NAMES)[number]
export const isBuiltinRoleName = (name: string): name is BuiltinRoleName => (BUILTIN_ROLE_NAMES as readonly string[]).includes(name)

/** Global Admin always has every permission — never read from a stored row,
 *  so neither a bad edit nor a stale taxonomy can lock administrators out. */
export const isGlobalAdmin = (roleName: string): boolean => roleName === 'Global Admin'

export function allTruePermissions(): PermissionMap {
  return permsFor(PERMISSION_KEYS)
}
