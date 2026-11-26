import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api'
import type { ApiStats } from '../api'

const REFRESH_INTERVAL = 10 // seconds

export function useStats() {
  const [stats, setStats] = useState<ApiStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const applyStats = useCallback((data: ApiStats) => {
    setStats(data)
    setOffline(false)
    setLastUpdated(new Date())
    setCountdown(REFRESH_INTERVAL)
  }, [])

  const fetchStats = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      applyStats(await api.fetchStats())
    } catch {
      setOffline(true)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [applyStats])

  // Initial load (loading is already true on first render)
  useEffect(() => {
    let cancelled = false
    api.fetchStats()
      .then(data => { if (!cancelled) applyStats(data) })
      .catch(() => { if (!cancelled) setOffline(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [applyStats])

  // Auto-refresh every 10 s (real-time)
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
