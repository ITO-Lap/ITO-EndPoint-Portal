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

  // Users & Identity
  'Users':               ['Global Admin', 'IT Admin', 'Helpdesk'],

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
