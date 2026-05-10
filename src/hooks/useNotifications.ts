import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import type { NotificationItem } from '../types'

function toItem({ id, message, read }: { id: string; message: string; read: boolean }): NotificationItem {
  return { id, message, read }
}

export function useNotifications(seed: NotificationItem[]) {
  const [notifications, setNotifications] = useState<NotificationItem[]>(seed)

  useEffect(() => {
    api.fetchNotifications()
      .then(items => setNotifications(items.map(toItem)))
      .catch(() => {})
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
