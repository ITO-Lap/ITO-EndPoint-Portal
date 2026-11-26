import { useCallback, useEffect, useState } from 'react'
import { syncApi, type SyncStatus } from '../api/sync'

const FAST_MS = 4_000   // while a sync is running
const SLOW_MS = 60_000

/** Polls the sync status: quickly while a sync runs, slowly otherwise. Never blocks the page it is used on. */
export function useSyncStatus() {
  const [data, setData] = useState<SyncStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    const load = async () => {
      let next = SLOW_MS
      try {
        const d = await syncApi.status()
        if (cancelled) return
        setData(d); setError(null)
        if (d.sources.some(s => s.running)) next = FAST_MS
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Could not load the sync status.')
      } finally {
        if (!cancelled) { setLoading(false); timer = window.setTimeout(() => void load(), next) }
      }
    }
    void load()
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [tick])

  return { data, error, loading, refresh }
}
