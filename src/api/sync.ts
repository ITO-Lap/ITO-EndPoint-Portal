// Client for the database-first sync (server: routes/sync.ts, docs/17-database-sync-architecture.md).

const BASE_URL = import.meta.env.VITE_API_URL ?? ''

export type SyncModuleName = 'devices' | 'applications' | 'patches' | 'findings'

/** What a module's record count counts. */
export const RECORD_LABEL: Record<string, string> = { devices: 'Records', applications: 'Apps', patches: 'Systems', findings: 'Open findings' }

export type SyncState = 'never' | 'succeeded' | 'partial' | 'failed'

export interface SyncSource {
  source: 'intune' | 'manageengine' | string
  module: string
  displayName: string
  enabled: boolean
  intervalMinutes: number
  configured: boolean
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  status: SyncState
  lastError: string | null
  recordCount: number | null
  running: boolean
  stale: boolean
}

export interface SyncStatus {
  /** Where synced data is kept now: local files (default, no setup) or PostgreSQL. */
  storage: 'file' | 'postgres'
  /** A PostgreSQL connection is saved (or set in the environment). */
  postgresConfigured: boolean
  /** The saved connection differs from the one in use; it applies at the next server start. */
  restartRequired: boolean
  sources: SyncSource[]
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
  const json = await res.json().catch(() => ({})) as { success?: boolean; data?: T; error?: string }
  if (!res.ok || json.success === false) throw new Error(json.error ?? `${path}: ${res.status}`)
  return json.data as T
}

export const syncApi = {
  /** Tests the connection; saves it only if it works. Applies at the next server start. */
  pushPostgres: (connectionString: string, ssl: string) =>
    call<{ configured: boolean; restartRequired: boolean; serverVersion?: string }>('POST', '/api/integrations/postgres/credentials', { fields: { connectionString, ssl: ssl || 'auto' } }),
  disconnectPostgres: () => call<{ configured: boolean; restartRequired: boolean }>('DELETE', '/api/integrations/postgres/credentials'),
  status: () => call<SyncStatus>('GET', '/api/sync/status'),
  /** Starts whatever is due in the background and returns immediately. */
  kick: () => call<{ started: number }>('POST', '/api/sync/kick', {}),
  run: (source: string, module: SyncModuleName = 'devices') => call<{ started: boolean }>('POST', '/api/sync/run', { source, module }),
  setSchedule: (source: string, patch: { enabled?: boolean; intervalMinutes?: number }, module: SyncModuleName = 'devices') =>
    call<SyncSource>('PUT', '/api/sync/schedule', { source, module, ...patch }),
}

export type Freshness = 'fresh' | 'aging' | 'stale' | 'none'

/** Fresh within one interval, aging within two, stale beyond; none when nothing has ever synced. */
export function freshnessOf(s: Pick<SyncSource, 'lastSuccessAt' | 'intervalMinutes'>, now = Date.now()): Freshness {
  if (!s.lastSuccessAt) return 'none'
  const age = now - Date.parse(s.lastSuccessAt)
  const interval = s.intervalMinutes * 60_000
  return age <= interval * 1.25 ? 'fresh' : age <= interval * 2.5 ? 'aging' : 'stale'
}

export function formatAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return 'never'
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000))
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  if (min < 24 * 60) return `${Math.round(min / 60)} h ago`
  return `${Math.round(min / 1440)} d ago`
}
