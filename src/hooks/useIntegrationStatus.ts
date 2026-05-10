import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import type { IntegrationStatusItem } from '../api'

const POLL_INTERVAL = 30_000 // ms

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
    fetchStatus()
    const id = setInterval(fetchStatus, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [fetchStatus])

  return { status, loading, refresh: fetchStatus }
}
