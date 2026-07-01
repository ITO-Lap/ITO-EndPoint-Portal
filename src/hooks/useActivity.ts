import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import type { ActivityItem } from '../types'

const REFRESH_INTERVAL = 10_000 // ms (real-time)

function formatTime(ts: string): string {
  const d = new Date(ts)
  const diffHrs = (Date.now() - d.getTime()) / 3_600_000
  return diffHrs < 24
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : 'Yesterday'
}

function toColor(status: ActivityItem['status']): ActivityItem['color'] {
  return status === 'Compliant' ? 'green' : status === 'Warning' ? 'yellow' : 'red'
}

export function useActivity(limit = 20) {
  const [items, setItems] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)

  const fetchActivity = useCallback(async () => {
    try {
      const raw = await api.fetchActivity(limit)
      setItems(
        raw.map(a => ({
          device: a.deviceName,
          message: a.message,
          status: a.status,
          time: formatTime(a.timestamp),
          color: toColor(a.status),
        }))
      )
      setOffline(false)
    } catch {
      setOffline(true)
    } finally {
      setLoading(false)
    }
  }, [limit])

  useEffect(() => {
    fetchActivity()
    const id = setInterval(fetchActivity, REFRESH_INTERVAL)
    return () => clearInterval(id)
  }, [fetchActivity])

  return { items, loading, offline }
}
