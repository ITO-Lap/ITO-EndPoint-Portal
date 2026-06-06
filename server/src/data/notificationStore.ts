import type { Notification } from '../types.js'

let _notifications: Notification[] = []

export function getNotifications(): Notification[] {
  return _notifications
}

export function markAllRead(): Notification[] {
  _notifications = _notifications.map(n => ({ ...n, read: true }))
  return _notifications
}

export function markRead(id: string): Notification | undefined {
  const n = _notifications.find(n => n.id === id)
  if (n) n.read = true
  return n
}

export function addNotification(
  message: string,
  type: Notification['type'] = 'info',
): Notification {
  const n: Notification = {
    id:        `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    message,
    type,
    read:      false,
    createdAt: new Date().toISOString(),
  }
  _notifications = [n, ..._notifications].slice(0, 200)
  return n
}
