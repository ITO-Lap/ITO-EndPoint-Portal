import { describe, it, expect } from 'vitest'
import { canAccess, canEditSlackSchedules, isPageListed } from '../permissions'
import { navItems } from '../../data/dashboardData'

describe('Scheduled Reports access', () => {
  it('is available to Global Admin and IT Admin, not Helpdesk', () => {
    expect(canAccess('Global Admin', 'Scheduled Reports')).toBe(true)
    expect(canAccess('IT Admin', 'Scheduled Reports')).toBe(true)
    expect(canAccess('Helpdesk', 'Scheduled Reports')).toBe(false)
  })
  it('shows up in the sidebar for an IT Admin', () => {
    expect(navItems.filter(i => canAccess('IT Admin', i.title)).map(i => i.title)).toContain('Scheduled Reports')
  })
})

describe('unlisted pages', () => {
  it('default to Global Admin only', () => {
    expect(canAccess('Global Admin', 'Some New Page')).toBe(true)
    expect(canAccess('IT Admin', 'Some New Page')).toBe(false)
  })

  // Every sidebar page needs an explicit role entry; a page added without one fails here instead of silently
  // becoming invisible to IT Admins.
  it('do not exist: every sidebar page has an explicit role entry', () => {
    expect(navItems.map(i => i.title).filter(t => !isPageListed(t))).toEqual([])
  })
})

describe('IT Admin', () => {
  it('can open every page in the sidebar', () => {
    const blocked = navItems.filter(i => !canAccess('IT Admin', i.title)).map(i => i.title)
    expect(blocked).toEqual([])
  })
  it('can edit Slack schedules; Helpdesk cannot', () => {
    expect(canEditSlackSchedules('Global Admin')).toBe(true)
    expect(canEditSlackSchedules('IT Admin')).toBe(true)
    expect(canEditSlackSchedules('Helpdesk')).toBe(false)
  })
})
