import type { NotificationSchedule } from '../../api/notificationSchedule'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function formatTime12(hhmm: string): string {
  const [hRaw, mRaw] = hhmm.split(':').map(Number)
  const h = hRaw ?? 0, m = mRaw ?? 0
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

export function describeSchedule(schedule: Pick<NotificationSchedule, 'frequency' | 'weekdays' | 'execution_time'>): string {
  const time = formatTime12(schedule.execution_time)
  if (schedule.frequency === 'daily') return `Daily at ${time}`
  const days = [...schedule.weekdays].sort().map(d => WEEKDAY_LABELS[d]).join(', ')
  return `Weekly on ${days || '—'} at ${time}`
}
