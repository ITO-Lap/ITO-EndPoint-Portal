import type { AutomationRule, AutomationExecution } from '../types.js'
import { dataFile, readJsonFile, writeJsonAtomic } from '../store/dataDir.js'

// Rules and run history are saved to DATA_DIR (automations.json) after every change and read back at
// start-up, so a restart or deploy keeps them. Tests never touch the disk unless a file is passed.
const MAX_EXECUTIONS = 500
const defaultFile = () => (process.env.NODE_ENV === 'test' ? null : dataFile('automations.json'))

export const automationRules: AutomationRule[] = []

export const automationExecutions: AutomationExecution[] = []

let _rules: AutomationRule[]         = [...automationRules]
let _executions: AutomationExecution[] = [...automationExecutions]

export function loadAutomations(file: string | null = defaultFile()): void {
  if (!file) return
  const saved = readJsonFile<{ rules?: AutomationRule[]; executions?: AutomationExecution[] }>(file)
  if (!saved) return
  if (Array.isArray(saved.rules)) _rules = saved.rules
  if (Array.isArray(saved.executions)) _executions = saved.executions
}

export function saveAutomations(file: string | null = defaultFile()): void {
  if (!file) return
  try { writeJsonAtomic(file, { savedAt: new Date().toISOString(), rules: _rules, executions: _executions.slice(0, MAX_EXECUTIONS) }) }
  catch (e) { console.warn('[automations] could not save automations:', e instanceof Error ? e.message : e) }
}

loadAutomations()

export function getRules(category?: string): AutomationRule[] {
  if (category && category !== 'all') return _rules.filter(r => r.category === category)
  return _rules
}

export function getRuleById(id: string): AutomationRule | undefined {
  return _rules.find(r => r.id === id)
}

export function createRule(rule: AutomationRule): AutomationRule {
  _rules = [rule, ..._rules]
  saveAutomations()
  return rule
}

export function updateRule(id: string, patch: Partial<AutomationRule>): AutomationRule | undefined {
  const idx = _rules.findIndex(r => r.id === id)
  if (idx === -1) return undefined
  _rules[idx] = { ..._rules[idx], ...patch } as AutomationRule
  saveAutomations()
  return _rules[idx]
}

export function deleteRule(id: string): boolean {
  const before = _rules.length
  _rules = _rules.filter(r => r.id !== id)
  const removed = _rules.length < before
  if (removed) saveAutomations()
  return removed
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
  _executions = [exec, ..._executions].slice(0, MAX_EXECUTIONS)
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
