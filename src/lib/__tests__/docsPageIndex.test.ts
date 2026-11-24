import { describe, it, expect } from 'vitest'
import { navItems } from '../../data/dashboardData'
import { PAGES } from '../docsPageIndex'

// Vite lists the doc files at build time, so this test needs no Node file-system types.
const docFiles = Object.keys(import.meta.glob('../../../docs/**/*.md', { query: '?raw', import: 'default' }))
const docExists = (name: string): boolean =>
  docFiles.some(f => f.endsWith(name.startsWith('docs/') ? `/${name}` : `/docs/07-features/${name}`))

describe('page documentation index', () => {
  it('documents every page in the sidebar', () => {
    const documented = PAGES.flatMap(p => p[0]!.split(' / '))
    const missing = navItems.map(n => n.title).filter(t => !documented.includes(t))
    expect(missing).toEqual([])
  })
  it('points every page at documents that exist', () => {
    const missing = PAGES.flatMap(p => p[3]!.split(',').map(s => s.trim()).filter(f => !docExists(f)).map(f => `${p[0]} → ${f}`))
    expect(missing).toEqual([])
  })
})
