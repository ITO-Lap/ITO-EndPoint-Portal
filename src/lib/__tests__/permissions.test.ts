import { describe, it, expect } from 'vitest'
import { canAccess, canEditSlackSchedules, isPageListed, pageKey, type PermissionMap } from '../permissions'
import { navItems } from '../../data/dashboardData'

// These fixtures exercise canAccess's lookup mechanism (page key + Global
// Admin bypass) — the authoritative built-in role permission sets live
// server-side in server/src/services/rolePermissions.ts and are covered
// there (see server/src/store/__tests__/rolesStore.test.ts).
const ALL_PAGES: PermissionMap = Object.fromEntries(navItems.map(i => [pageKey(i.title), true]))
const HELPDESK_EXCLUDED = ['Policy Conflicts', 'Risk Scoring', 'Automation', 'Reports & Analytics', 'Scheduled Reports', 'Settings', 'Windows Package Builder', 'Mac Package Builder']
const HELPDESK_PERMS: PermissionMap = Object.fromEntries(
  navItems.filter(i => !HELPDESK_EXCLUDED.includes(i.title)).map(i => [pageKey(i.title), true]),
)

describe('Scheduled Reports access', () => {
  it('is available to Global Admin and IT Admin, not Helpdesk', () => {
    expect(canAccess('Global Admin', {}, 'Scheduled Reports')).toBe(true) // Global Admin bypasses the map entirely
    expect(canAccess('IT Admin', ALL_PAGES, 'Scheduled Reports')).toBe(true)
    expect(canAccess('Helpdesk', HELPDESK_PERMS, 'Scheduled Reports')).toBe(false)
  })
  it('shows up in the sidebar for an IT Admin', () => {
    expect(navItems.filter(i => canAccess('IT Admin', ALL_PAGES, i.title)).map(i => i.title)).toContain('Scheduled Reports')
  })
})

describe('unlisted pages', () => {
  it('default to Global Admin only', () => {
    expect(canAccess('Global Admin', {}, 'Some New Page')).toBe(true)
    expect(canAccess('IT Admin', ALL_PAGES, 'Some New Page')).toBe(false)
  })

  // Every sidebar page needs an explicit entry in KNOWN_PAGES; a page added without one fails here instead of
  // silently missing its permission key on the server.
  it('do not exist: every sidebar page is a known page', () => {
    expect(navItems.map(i => i.title).filter(t => !isPageListed(t))).toEqual([])
  })
})

describe('IT Admin', () => {
  it('can open every page in the sidebar', () => {
    const blocked = navItems.filter(i => !canAccess('IT Admin', ALL_PAGES, i.title)).map(i => i.title)
    expect(blocked).toEqual([])
  })
  it('can edit Slack schedules; Helpdesk cannot', () => {
    expect(canEditSlackSchedules('Global Admin', {})).toBe(true)
    expect(canEditSlackSchedules('IT Admin', { 'scheduledReports.editSlackSchedule': true })).toBe(true)
    expect(canEditSlackSchedules('Helpdesk', { 'scheduledReports.editSlackSchedule': false })).toBe(false)
  })
})
