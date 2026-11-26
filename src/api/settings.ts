// Client for the saved Settings sections (server: routes/settings.ts).

const BASE_URL = import.meta.env.VITE_API_URL ?? ''

export type SettingsSectionName = 'general' | 'compliance' | 'automation' | 'security' | 'notifications' | 'data'
export interface SavedSection { values: Record<string, unknown>; updatedBy: string | null; updatedAt: string }

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
  const json = await res.json().catch(() => ({})) as { success?: boolean; data?: T; error?: string }
  if (!res.ok || json.success === false) throw new Error(json.error ?? `${path}: ${res.status}`)
  return json.data as T
}

export const settingsApi = {
  load: () => call<Record<string, SavedSection>>('GET', '/api/settings'),
  save: (section: SettingsSectionName, values: Record<string, unknown>) => call<SavedSection>('PUT', `/api/settings/${section}`, { values }),
}
