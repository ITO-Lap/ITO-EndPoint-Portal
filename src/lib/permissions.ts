import type { UserToolRole } from '../types'

// Which roles can access each page (nav guard + router guard)
export const PAGE_ROLES: Record<string, UserToolRole[]> = {
  // Overview
  'Dashboard':           ['Global Admin', 'IT Admin', 'Helpdesk'],

  // Endpoint Management
  'Managed Devices':         ['Global Admin', 'IT Admin', 'Helpdesk'],
  'ManageEngine App Inventory': ['Global Admin', 'IT Admin', 'Helpdesk'],
  'Stale Devices':          ['Global Admin', 'IT Admin', 'Helpdesk'],
  'App Guardian':           ['Global Admin', 'IT Admin', 'Helpdesk'],
  'Mac Fleet Reports':       ['Global Admin', 'IT Admin', 'Helpdesk'],
  'Entra Intelligence':      ['Global Admin', 'IT Admin', 'Helpdesk'],

  // Security & Compliance
  'Security Posture':    ['Global Admin', 'IT Admin', 'Helpdesk'],
  'Role Activity Audit': ['Global Admin', 'IT Admin', 'Helpdesk'],
  'Patch Operations':   ['Global Admin', 'IT Admin', 'Helpdesk'],

  // Automation — IT Admin+ only
  'Automation':          ['Global Admin', 'IT Admin'],

  // Analytics & Reports
  'Reports & Analytics': ['Global Admin', 'IT Admin'],
  // Creates and runs schedules that deliver to Slack/email. Editing the Slack send time stays Global Admin only
  // (see notificationSchedules.ts); IT Admin sees that part read-only.
  'Scheduled Reports':   ['Global Admin', 'IT Admin'],

  // Platform
  'Settings':            ['Global Admin', 'IT Admin'],
  'Documentation':       ['Global Admin', 'IT Admin', 'Helpdesk'],
}

// A page that is not listed above is Global Admin only (see canAccess). Listing here is deliberate and
// explicit, so a new page cannot silently become invisible to IT Admins.
export const isPageListed = (page: string): boolean => page in PAGE_ROLES

export function canAccess(role: UserToolRole, page: string): boolean {
  const allowed = PAGE_ROLES[page]
  if (!allowed) return role === 'Global Admin'
  return allowed.includes(role)
}
