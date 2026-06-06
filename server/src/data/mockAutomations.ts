import type { AutomationRule, AutomationExecution } from '../types.js'

export const automationRules: AutomationRule[] = []

export const automationExecutions: AutomationExecution[] = []

let _rules: AutomationRule[]         = [...automationRules]
let _executions: AutomationExecution[] = [...automationExecutions]

export function getRules(category?: string): AutomationRule[] {
  if (category && category !== 'all') return _rules.filter(r => r.category === category)
  return _rules
}

export function getRuleById(id: string): AutomationRule | undefined {
  return _rules.find(r => r.id === id)
}

export function createRule(rule: AutomationRule): AutomationRule {
  _rules = [rule, ..._rules]
  return rule
}

export function updateRule(id: string, patch: Partial<AutomationRule>): AutomationRule | undefined {
  const idx = _rules.findIndex(r => r.id === id)
  if (idx === -1) return undefined
  _rules[idx] = { ..._rules[idx], ...patch } as AutomationRule
  return _rules[idx]
}

export function deleteRule(id: string): boolean {
  const before = _rules.length
  _rules = _rules.filter(r => r.id !== id)
  return _rules.length < before
}

export function toggleRule(id: string): AutomationRule | undefined {
  const rule = _rules.find(r => r.id === id)
  if (!rule) return undefined
  return updateRule(id, { enabled: !rule.enabled })
}

export function getExecutions(ruleId?: string, limit = 50): AutomationExecution[] {
  const list = ruleId ? _executions.filter(e => e.ruleId === ruleId) : _executions
  return list.slice(0, limit)
}

export function addExecution(exec: AutomationExecution): AutomationExecution {
  _executions = [exec, ..._executions]
  updateRule(exec.ruleId, {
    lastTriggered: exec.triggeredAt,
    triggerCount: (getRuleById(exec.ruleId)?.triggerCount ?? 0) + 1,
  })
  return exec
}

export function getStats() {
  const total   = _rules.length
  const active  = _rules.filter(r => r.enabled).length
  const today   = new Date(); today.setHours(0, 0, 0, 0)
  const triggersToday = _executions.filter(e => new Date(e.triggeredAt) >= today).length
  const successCount  = _executions.filter(e => e.status === 'success').length
  const successRate   = _executions.length ? Math.round((successCount / _executions.length) * 100) : 100
  return { total, active, inactive: total - active, triggersToday, successRate }
}
