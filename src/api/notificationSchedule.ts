// Editable Slack notification schedules — frontend HTTP client.
// Contract: server/src/routes/notificationSchedules.ts (mounted at /api/notification-schedules).
// Every current or future Slack-sending module (identified by `module` +
// `sourceId`) reuses this one client — see that route file's header comment.

const SERVER = import.meta.env.VITE_API_URL ?? ''
const BASE = `${SERVER}/api/notification-schedules`

let currentRole = 'IT Admin'
let currentEmail = 'unknown@zinnia.com'
export function setNotificationScheduleActor(role: string, email?: string): void {
  currentRole = role
  if (email) currentEmail = email
}

export type NotificationFrequency = 'daily' | 'weekly'

export interface NotificationSchedule {
  id: string
  module: string
  source_id: string
  is_enabled: boolean
  frequency: NotificationFrequency
  weekdays: number[]
  execution_time: string
  timezone: string
  next_run_at: string | null
  last_run_at: string | null
  last_run_status: 'completed' | 'failed' | null
  last_run_error: string | null
  updated_by: string | null
  updated_at: string
}

export interface NotificationScheduleState {
  schedule: NotificationSchedule
  slackConfigured: boolean
}

export interface NotificationScheduleListItem extends NotificationSchedule {
  reportName: string | null
  reportType: string | null
}

export interface UpdateScheduleInput {
  is_enabled: boolean
  frequency: NotificationFrequency
  weekdays: number[]
  execution_time: string
  timezone: string
}

const headers = (): Record<string, string> => ({ 'Content-Type': 'application/json', 'x-user-role': currentRole, 'x-user-email': currentEmail })

async function request<T>(path: string, init?: RequestInit): Promise<{ success: boolean; data: T | null; message?: string; error?: string }> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: headers() })
  const body = await res.json().catch(() => null) as { success?: boolean; data?: T; message?: string; error?: string } | null
  return { success: res.ok && !!body?.success, data: body?.data ?? null, message: body?.message, error: body?.error ?? (!res.ok ? `${path}: ${res.status}` : undefined) }
}

export const notificationScheduleApi = {
  list: () =>
    request<NotificationScheduleListItem[]>(''),
  get: (module: string, sourceId: string) =>
    request<NotificationScheduleState>(`/${module}/${sourceId}`),
  update: (module: string, sourceId: string, input: UpdateScheduleInput) =>
    request<NotificationScheduleState>(`/${module}/${sourceId}`, { method: 'PATCH', body: JSON.stringify(input) }),
}
