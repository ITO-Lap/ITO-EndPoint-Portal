import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRule, updateRule, deleteRule, getRules, addExecution, getExecutions, loadAutomations, saveAutomations } from '../mockAutomations.js'
import type { AutomationRule, AutomationExecution } from '../../types.js'

const rule = (id: string): AutomationRule => ({ id, name: `Rule ${id}`, enabled: true, category: 'compliance', triggerCount: 0 } as unknown as AutomationRule)

describe('automations persistence', () => {
  beforeEach(() => { for (const r of [...getRules()]) deleteRule(r.id) })

  it('writes rules and run history to a file and reads them back', () => {
    const dir = mkdtempSync(join(tmpdir(), 'auto-'))
    const file = join(dir, 'automations.json')
    try {
      createRule(rule('a')); createRule(rule('b'))
      updateRule('a', { enabled: false })
      addExecution({ id: 'e1', ruleId: 'a', triggeredAt: new Date().toISOString(), status: 'success' } as unknown as AutomationExecution)
      saveAutomations(file)
      deleteRule('a'); deleteRule('b')
      expect(getRules()).toHaveLength(0)
      loadAutomations(file)
      expect(getRules().map(r => r.id).sort()).toEqual(['a', 'b'])
      expect(getRules().find(r => r.id === 'a')?.enabled).toBe(false)
      expect(getExecutions('a')).toHaveLength(1)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('keeps the current data when the file is missing', () => {
    createRule(rule('x'))
    loadAutomations(join(tmpdir(), 'does-not-exist-automations.json'))
    expect(getRules().map(r => r.id)).toEqual(['x'])
  })
})
