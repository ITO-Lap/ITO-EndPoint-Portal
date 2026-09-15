import type { UserToolRole } from '../types'

// Which roles can access each page (nav guard + router guard)
const PAGE_ROLES: Record<string, UserToolRole[]> = {
  // Overview
  'Dashboard':           ['Global Admin', 'IT Admin', 'Helpdesk'],

  // Endpoint Management
  'Device Lookup':           ['Global Admin', 'IT Admin', 'Helpdesk'],
  'Mac Devices':             ['Global Admin', 'IT Admin', 'Helpdesk'],
  'Intune Devices':          ['Global Admin', 'IT Admin', 'Helpdesk'],
  'Windows Devices':         ['Global Admin', 'IT Admin', 'Helpdesk'],
  'ManageEngine Devices':    ['Global Admin', 'IT Admin', 'Helpdesk'],
  'Open Issues':             ['Global Admin', 'IT Admin', 'Helpdesk'],
  'Smart Diagnostics':       ['Global Admin', 'IT Admin', 'Helpdesk'],
  'Mac Fleet Reports':       ['Global Admin', 'IT Admin', 'Helpdesk'],
  'Entra Intelligence':      ['Global Admin', 'IT Admin', 'Helpdesk'],

  // Security & Compliance
  'Security Posture':    ['Global Admin', 'IT Admin', 'Helpdesk'],
  'Vulnerabilities':     ['Global Admin', 'IT Admin', 'Helpdesk'],
  'Role Activity Audit': ['Global Admin', 'IT Admin', 'Helpdesk'],
  'Security Policies':   ['Global Admin', 'IT Admin', 'Helpdesk'],

  // Users & Identity
  'Users':               ['Global Admin', 'IT Admin', 'Helpdesk'],
  'User Intelligence':   ['Global Admin', 'IT Admin', 'Helpdesk'],

  // Automation — IT Admin+ only
  'Automation':          ['Global Admin', 'IT Admin'],
  'Runbooks':            ['Global Admin', 'IT Admin', 'Helpdesk'],
  'Remote Scripts':      ['Global Admin', 'IT Admin'],

  // Analytics & Reports
  'Reports & Analytics': ['Global Admin', 'IT Admin'],
  'Activity Log':        ['Global Admin', 'IT Admin', 'Helpdesk'],
  'Diagnostics':         ['Global Admin', 'IT Admin', 'Helpdesk'],

  // Platform
  'Settings':            ['Global Admin', 'IT Admin'],
  'Documentation':       ['Global Admin', 'IT Admin', 'Helpdesk'],

  // Always accessible
  'Profile':             ['Global Admin', 'IT Admin', 'Helpdesk'],
}

export function canAccess(role: UserToolRole, page: string): boolean {
  const allowed = PAGE_ROLES[page]
  if (!allowed) return role === 'Global Admin'
  return allowed.includes(role)
}

/** Pages restricted to this role's tier or above (i.e. NOT available to every
 * tier below it) — used to show a role's real elevated access on the Profile
 * page instead of a generic hardcoded permissions list. */
export function getElevatedPages(role: UserToolRole): string[] {
  return Object.entries(PAGE_ROLES)
    .filter(([, roles]) => roles.includes(role) && roles.length < 3)
    .map(([page]) => page)
}
