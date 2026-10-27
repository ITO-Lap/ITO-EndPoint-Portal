import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import type { NotificationItem } from '../types'

function toItem({ id, message, read }: { id: string; message: string; read: boolean }): NotificationItem {
  return { id, message, read }
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])

  // Poll so deliveries that happen while the page is open light up the bell without a reload.
  useEffect(() => {
    const refresh = () => api.fetchNotifications()
      .then(items => setNotifications(items.map(toItem)))
      .catch(() => {})
    void refresh()
    const timer = setInterval(() => { void refresh() }, 60_000)
    return () => clearInterval(timer)
  }, [])

  const markAllRead = useCallback(async () => {
    try {
      const updated = await api.markAllRead()
      setNotifications(updated.map(toItem))
    } catch {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    }
  }, [])

  return { notifications, markAllRead }
}
