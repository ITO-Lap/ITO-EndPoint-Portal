import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import type { IntegrationStatusItem } from '../api'

const POLL_INTERVAL = 10_000 // ms (real-time)

export function useIntegrationStatus() {
  const [status, setStatus] = useState<IntegrationStatusItem[]>([])
  const [loading, setLoading] = useState(true)

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.fetchIntegrationStatus()
      setStatus(data)
    } catch {
      // server offline — keep stale
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    api.fetchIntegrationStatus()
      .then(data => { if (!cancelled) setStatus(data) })
      .catch(() => { /* server offline — keep stale */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    const id = setInterval(fetchStatus, POLL_INTERVAL)
    return () => { cancelled = true; clearInterval(id) }
  }, [fetchStatus])

  return { status, loading, refresh: fetchStatus }
}
