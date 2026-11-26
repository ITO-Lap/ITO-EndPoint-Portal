import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import type { AutomationRule, AutomationExecution, AutomationStats } from '../api'

export function useAutomations(category?: string) {
  const [rules, setRules]       = useState<AutomationRule[]>([])
  const [stats, setStats]       = useState<AutomationStats | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [rulesData, statsData] = await Promise.all([
        api.fetchAutomationRules(category),
        api.fetchAutomationStats(),
      ])
      setRules(rulesData)
      setStats(statsData)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load automation rules')
    } finally {
      setLoading(false)
    }
  }, [category])

  // Show the loading state during render when the category changes; the fetch runs in the effect.
  const [prevCategory, setPrevCategory] = useState(category)
  if (category !== prevCategory) { setPrevCategory(category); setLoading(true); setError(null) }

  useEffect(() => {
    let cancelled = false
    Promise.all([api.fetchAutomationRules(category), api.fetchAutomationStats()])
      .then(([rulesData, statsData]) => {
        if (cancelled) return
        setRules(rulesData)
        setStats(statsData)
      })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load automation rules') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [category])

  const toggle = useCallback(async (id: string) => {
    const updated = await api.toggleAutomationRule(id)
    setRules(prev => prev.map(r => r.id === id ? updated : r))
    const statsData = await api.fetchAutomationStats()
    setStats(statsData)
    return updated
  }, [])

  const remove = useCallback(async (id: string) => {
    await api.deleteAutomationRule(id)
    setRules(prev => prev.filter(r => r.id !== id))
    const statsData = await api.fetchAutomationStats()
    setStats(statsData)
  }, [])

  const test = useCallback(async (id: string): Promise<AutomationExecution> => {
    const execution = await api.testAutomationRule(id)
    return execution
  }, [])

  return { rules, stats, loading, error, refresh: load, toggle, remove, test }
}

export function useAutomationExecutions(ruleId?: string, limit = 50) {
  const [executions, setExecutions] = useState<AutomationExecution[]>([])
  const [loading, setLoading]       = useState(true)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await api.fetchAutomationExecutions({ ruleId, limit })
      setExecutions(data)
    } catch {
      // silently fail — executions are supplementary
    } finally {
      setLoading(false)
    }
  }, [ruleId, limit])

  const execKey = `${ruleId ?? ''}|${limit}`
  const [prevExecKey, setPrevExecKey] = useState(execKey)
  if (execKey !== prevExecKey) { setPrevExecKey(execKey); setLoading(true) }

  useEffect(() => {
    let cancelled = false
    api.fetchAutomationExecutions({ ruleId, limit })
      .then(data => { if (!cancelled) setExecutions(data) })
      .catch(() => { /* silently fail — executions are supplementary */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ruleId, limit])

  return { executions, loading, refresh: load }
}
