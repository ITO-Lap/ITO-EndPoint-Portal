import { describe, it, expect } from 'vitest'
import { COPILOT_TOOLS, toolsAllowedForRole, scrubSecrets } from '../copilotTools.js'

// Live data stays behind the existing role gate; Ocean's documentation features add nothing to it.
describe('live-data tools by role', () => {
  const names = (role: string) => toolsAllowedForRole(role).map(t => t.name)
  it('gives roles without Copilot tool access no live tools', () => {
    expect(names('End User')).toEqual([])
    expect(names('Some Custom Role')).toEqual([])
  })
  it('gives Helpdesk read tools only, and admins read + write', () => {
    expect(toolsAllowedForRole('Helpdesk').every(t => t.rbac === 'read')).toBe(true)
    expect(toolsAllowedForRole('Helpdesk').length).toBeGreaterThan(0)
    expect(toolsAllowedForRole('IT Admin').some(t => t.rbac === 'write')).toBe(true)
    expect(toolsAllowedForRole('Global Admin').length).toBe(COPILOT_TOOLS.length)
  })
  it('masks credentials in tool output before it reaches the model or the user', () => {
    const out = scrubSecrets({ note: 'token sk-abcdefghijklmnopqrstuv and postgres://u:Secret99@host/db' })
    expect(JSON.stringify(out)).not.toMatch(/sk-abcdef|Secret99/)
  })
})
