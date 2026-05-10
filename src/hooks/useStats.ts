import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api'
import type { ApiStats } from '../api'

const REFRESH_INTERVAL = 30 // seconds

export function useStats() {
  const [stats, setStats] = useState<ApiStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStats = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const data = await api.fetchStats()
      setStats(data)
      setOffline(false)
      setLastUpdated(new Date())
      setCountdown(REFRESH_INTERVAL)
    } catch {
      setOffline(true)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    fetchStats(true)
  }, [fetchStats])

  // Auto-refresh every 30 s
  useEffect(() => {
    const id = setInterval(() => fetchStats(), REFRESH_INTERVAL * 1000)
    return () => clearInterval(id)
  }, [fetchStats])

  // Countdown ticker — resets on each successful fetch
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setCountdown(prev => (prev <= 1 ? REFRESH_INTERVAL : prev - 1))
    }, 1000)
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [])

  const refresh = useCallback(() => fetchStats(true), [fetchStats])

  return { stats, loading, offline, countdown, lastUpdated, refresh }
}
