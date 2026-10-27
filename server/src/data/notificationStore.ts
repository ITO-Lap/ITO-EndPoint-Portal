import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { Notification } from '../types.js'

// Notifications survive restarts (server/.notifications.json, git-ignored), so a
// delivery that happened overnight is still on the bell in the morning. Tests
// (NODE_ENV=test) keep them in memory only.
const STORE_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../../.notifications.json')
const PERSIST = process.env['NODE_ENV'] !== 'test'
const MAX_NOTIFICATIONS = 200

function load(): Notification[] {
  if (!PERSIST) return []
  try { return (JSON.parse(readFileSync(STORE_FILE, 'utf-8')) as { notifications?: Notification[] }).notifications ?? [] }
  catch { return [] }
}

function persist(): void {
  if (!PERSIST) return
  try { writeFileSync(STORE_FILE, JSON.stringify({ notifications: _notifications }, null, 2), 'utf-8') }
  catch (e) { console.error('[notificationStore] Failed to persist notifications:', e) }
}

let _notifications: Notification[] = load()

export function getNotifications(): Notification[] {
  return _notifications
}

export function markAllRead(): Notification[] {
  _notifications = _notifications.map(n => ({ ...n, read: true }))
  persist()
  return _notifications
}

export function markRead(id: string): Notification | undefined {
  const n = _notifications.find(n => n.id === id)
  if (n) { n.read = true; persist() }
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
  _notifications = [n, ..._notifications].slice(0, MAX_NOTIFICATIONS)
  persist()
  return n
}
