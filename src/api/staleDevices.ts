// Stale Devices — frontend HTTP client. Read-only; every Intune / Endpoint Central call happens on the server.
// Contract: server/src/routes/staleDevices.ts (mounted at /api/stale-devices).

const SERVER = import.meta.env.VITE_API_URL ?? ''
const BASE = `${SERVER}/api/stale-devices`

let currentRole = 'IT Admin'
let currentEmail = 'unknown@zinnia.com'
export function setStaleDevicesActor(role: string, email?: string): void {
  currentRole = role
  if (email) currentEmail = email
}

export type StalePlatform = 'Windows' | 'macOS'
export type StaleStatus = 'stale' | 'active' | 'source_drift' | 'no_checkin_data' | 'needs_review'
export type StaleView = 'stale' | 'windows' | 'macos' | 'drift' | 'review'
export type InactivityBucket = '21-30' | '31-60' | '61-90' | '90+'
export type ManagedBy = 'Intune' | 'Endpoint Central' | 'Intune + Endpoint Central'
export type StaleSourceId = 'intune' | 'endpoint-central'
export type SourceState = 'ok' | 'not_configured' | 'error'
export type StaleSortKey = 'deviceName' | 'username' | 'email' | 'lastCheckIn' | 'inactiveDays' | 'platform' | 'osVersion' | 'managedBy' | 'serialNumber' | 'status'

export const MANAGED_BY_OPTIONS: ManagedBy[] = ['Intune', 'Endpoint Central', 'Intune + Endpoint Central']
export const BUCKET_OPTIONS: Array<[InactivityBucket, string]> = [['21-30', '21–30 days'], ['31-60', '31–60 days'], ['61-90', '61–90 days'], ['90+', 'Over 90 days']]
export const SOURCE_LABEL: Record<StaleSourceId, string> = { intune: 'Intune', 'endpoint-central': 'Endpoint Central' }

export interface SourceMeta { state: SourceState; lastAttemptAt: string | null; lastSuccessAt: string | null; error: string | null; inScope: number }
export interface SyncState { staleDays: number; state: 'idle' | 'syncing' | 'ready' | 'error'; syncedAt: string | null; sources: Record<StaleSourceId, SourceMeta> }
export interface SourceEvidence { source: StaleSourceId; sourceId: string; lastCheckInAt: string | null; state: 'recent' | 'stale' | 'no_data'; note: string | null }

export interface StaleDevice {
  canonicalDeviceId: string
  deviceName: string
  username: string
  email: string
  platform: StalePlatform
  osVersion: string
  serialNumber: string | null
  managedBy: ManagedBy
  intuneDeviceId: string | null
  endpointCentralDeviceId: string | null
  intuneLastSyncAt: string | null
  endpointCentralLastCheckInAt: string | null
  effectiveLastCheckInAt: string | null
  effectiveSource: StaleSourceId | null
  inactiveDays: number | null
  staleStatus: StaleStatus
  correlationConfidence: 'high' | 'manual' | 'unresolved'
  explanation: string
  reviewReasons: string[]
  sourceEvidence: SourceEvidence[]
  possibleDuplicateOf: string[]
  sourceDataStatus: Record<StaleSourceId, SourceState>
  lastDataRefreshAt: string | null
}

export interface StaleSummary { staleWindows: number; staleMacOS: number; sourceDrift: number; noCheckinData: number; needsReview: number; activeDevices: number; totalInScope: number }
export interface StaleListResult extends SyncState { summary: StaleSummary; rows: StaleDevice[]; page: number; pageSize: number; total: number; totalPages: number }

export interface StaleQuery {
  view: StaleView
  platform?: StalePlatform | ''
  managedBy?: ManagedBy | ''
  bucket?: InactivityBucket | ''
  status?: StaleStatus | ''
  q?: string
  sortKey?: StaleSortKey | null
  sortDir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

function qs(q: StaleQuery, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams({ view: q.view, ...extra })
  for (const [k, v] of Object.entries({ platform: q.platform, managedBy: q.managedBy, bucket: q.bucket, status: q.status, q: q.q, sortKey: q.sortKey, sortDir: q.sortDir, page: q.page, pageSize: q.pageSize })) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  }
  return p.toString()
}

const headers = (): Record<string, string> => ({ 'x-user-role': currentRole, 'x-user-email': currentEmail })

async function request<T>(path: string, method: 'GET' | 'POST' = 'GET'): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method, headers: headers() })
  const body = await res.json().catch(() => null) as { success?: boolean; data?: T; error?: string } | null
  if (!res.ok || !body?.success) throw new Error(body?.error ?? `${path}: ${res.status}`)
  return body.data as T
}

export const staleDevicesApi = {
  status: () => request<SyncState>('/status'),
  sync: () => request<SyncState>('/sync', 'POST'),
  list: (q: StaleQuery) => request<StaleListResult>(`/devices?${qs(q)}`),
  /** Downloads exactly the rows the current filters select, with timestamps in `timezone`. */
  async exportCsv(q: StaleQuery, timezone: string): Promise<void> {
    const res = await fetch(`${BASE}/export?${qs(q, { tz: timezone })}`, { headers: headers() })
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: string } | null
      throw new Error(body?.error ?? `Export failed (${res.status})`)
    }
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = `stale-devices-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  },
}
