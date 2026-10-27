import { describe, it, expect } from 'vitest'
import { canAccess, isPageListed } from '../permissions'
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

  // Pages in the sidebar that are not in the permission table are invisible to IT Admin and Helpdesk. These two are
  // known and need a decision on who should see them; any other page added without an entry fails this test.
  const AWAITING_DECISION = ['Policy Conflicts', 'Risk Scoring']
  it('are limited to the pages still awaiting a role decision', () => {
    const unlisted = navItems.map(i => i.title).filter(t => !isPageListed(t))
    expect(unlisted.sort()).toEqual([...AWAITING_DECISION].sort())
  })
})
