// Filtering, sorting, paging, summary counts and CSV for evaluated stale-device rows. Pure and read-only.
import type { ManagedBy, StaleDevice, StalePlatform, StaleStatus } from './types.js'

export type StaleView = 'stale' | 'windows' | 'macos' | 'drift' | 'review'
export type InactivityBucket = '21-30' | '31-60' | '61-90' | '90+'
export type StaleSortKey = 'deviceName' | 'username' | 'email' | 'lastCheckIn' | 'inactiveDays' | 'platform' | 'osVersion' | 'managedBy' | 'serialNumber' | 'status'

export const STALE_VIEWS: readonly StaleView[] = ['stale', 'windows', 'macos', 'drift', 'review']
export const BUCKETS: readonly InactivityBucket[] = ['21-30', '31-60', '61-90', '90+']
export const STATUSES: readonly StaleStatus[] = ['stale', 'active', 'source_drift', 'no_checkin_data', 'needs_review']
export const MANAGED_BY: readonly ManagedBy[] = ['Intune', 'Endpoint Central', 'Intune + Endpoint Central']
export const SORT_KEYS: readonly StaleSortKey[] = ['deviceName', 'username', 'email', 'lastCheckIn', 'inactiveDays', 'platform', 'osVersion', 'managedBy', 'serialNumber', 'status']

export interface StaleFilters {
  view?: StaleView | undefined
  platform?: StalePlatform | undefined
  managedBy?: ManagedBy | undefined
  bucket?: InactivityBucket | undefined
  status?: StaleStatus | undefined
  q?: string | undefined
  sortKey?: StaleSortKey | undefined
  sortDir?: 'asc' | 'desc' | undefined
}

const VIEW_STATUSES: Record<StaleView, StaleStatus[]> = {
  stale: ['stale'], windows: ['stale'], macos: ['stale'], drift: ['source_drift'], review: ['needs_review', 'no_checkin_data'],
}

export function inBucket(days: number | null, bucket: InactivityBucket): boolean {
  if (days === null) return false
  switch (bucket) {
    case '21-30': return days >= 21 && days <= 30
    case '31-60': return days >= 31 && days <= 60
    case '61-90': return days >= 61 && days <= 90
    case '90+':   return days > 90
  }
}

export function filterDevices(devices: StaleDevice[], f: StaleFilters): StaleDevice[] {
  const view = f.view ?? 'stale'
  const q = f.q?.trim().toLowerCase()
  return devices.filter(d => {
    if (!VIEW_STATUSES[view].includes(d.staleStatus)) return false
    if (view === 'windows' && d.platform !== 'Windows') return false
    if (view === 'macos' && d.platform !== 'macOS') return false
    if (f.platform && d.platform !== f.platform) return false
    if (f.managedBy && d.managedBy !== f.managedBy) return false
    if (f.status && d.staleStatus !== f.status) return false
    if (f.bucket && !inBucket(d.inactiveDays, f.bucket)) return false
    if (q && ![d.deviceName, d.serialNumber ?? '', d.username, d.email].some(v => v.toLowerCase().includes(q))) return false
    return true
  })
}

function sortValue(d: StaleDevice, key: StaleSortKey): string | number | null {
  switch (key) {
    case 'deviceName': return d.deviceName.toLowerCase()
    case 'username': return d.username.toLowerCase()
    case 'email': return d.email.toLowerCase()
    case 'lastCheckIn': return d.effectiveLastCheckInAt ? Date.parse(d.effectiveLastCheckInAt) : null
    case 'inactiveDays': return d.inactiveDays
    case 'platform': return d.platform
    case 'osVersion': return d.osVersion
    case 'managedBy': return d.managedBy
    case 'serialNumber': return (d.serialNumber ?? '').toLowerCase()
    case 'status': return d.staleStatus
  }
}

export function sortDevices(devices: StaleDevice[], key: StaleSortKey = 'inactiveDays', dir: 'asc' | 'desc' = 'desc'): StaleDevice[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...devices].sort((a, b) => {
    const av = sortValue(a, key), bv = sortValue(b, key)
    if (av === null && bv === null) return a.deviceName.localeCompare(b.deviceName)
    if (av === null) return 1 // unknown values always sort last
    if (bv === null) return -1
    const c = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true })
    return c !== 0 ? c * sign : a.canonicalDeviceId.localeCompare(b.canonicalDeviceId)
  })
}

export function paginate<T>(rows: T[], page: number, pageSize: number): { rows: T[]; page: number; pageSize: number; total: number; totalPages: number } {
  const size = Math.min(Math.max(1, Math.floor(pageSize) || 25), 200)
  const totalPages = Math.max(1, Math.ceil(rows.length / size))
  const p = Math.min(Math.max(1, Math.floor(page) || 1), totalPages)
  return { rows: rows.slice((p - 1) * size, p * size), page: p, pageSize: size, total: rows.length, totalPages }
}

export interface StaleSummary {
  staleWindows: number
  staleMacOS: number
  sourceDrift: number
  noCheckinData: number
  needsReview: number
  activeDevices: number
  totalInScope: number
}

export function summarize(devices: StaleDevice[]): StaleSummary {
  const s: StaleSummary = { staleWindows: 0, staleMacOS: 0, sourceDrift: 0, noCheckinData: 0, needsReview: 0, activeDevices: 0, totalInScope: 0 }
  for (const d of devices) {
    // needs_review devices (uncertain scope, unresolved duplicates) stay out of the in-scope total.
    if (d.staleStatus !== 'needs_review') s.totalInScope++
    switch (d.staleStatus) {
      case 'stale': if (d.platform === 'Windows') s.staleWindows++; else s.staleMacOS++; break
      case 'source_drift': s.sourceDrift++; break
      case 'no_checkin_data': s.noCheckinData++; break
      case 'needs_review': s.needsReview++; break
      case 'active': s.activeDevices++; break
    }
  }
  return s
}

// ── CSV ───────────────────────────────────────────────────────────────────────────────────────────────

export const DEFAULT_TIMEZONE = 'Asia/Kolkata'

export function safeTimezone(tz: string | undefined): string {
  if (!tz) return DEFAULT_TIMEZONE
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz } catch { return DEFAULT_TIMEZONE }
}

export function formatInZone(iso: string | null, tz: string): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}

/** Quotes a field and neutralises spreadsheet formula injection (values starting with = + - @ tab CR). */
export function csvCell(value: string | number | null): string {
  let v = value === null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

const STATUS_LABEL: Record<StaleStatus, string> = {
  stale: 'Stale', active: 'Active', source_drift: 'Source drift', no_checkin_data: 'No check-in data', needs_review: 'Needs review',
}
export const statusLabel = (s: StaleStatus): string => STATUS_LABEL[s]

export function toCsv(devices: StaleDevice[], timezone: string): string {
  const tz = safeTimezone(timezone)
  const header = ['Device name', 'Username', 'Email ID', `Last check-in (${tz})`, 'Last check-in (UTC)', 'Inactive days', 'OS platform', 'OS version', 'Managed by', 'Serial number', 'Status', 'Source evidence']
  const lines = [header.map(csvCell).join(',')]
  for (const d of devices) {
    lines.push([
      d.deviceName, d.username, d.email, formatInZone(d.effectiveLastCheckInAt, tz), d.effectiveLastCheckInAt ?? '', d.inactiveDays,
      d.platform, d.osVersion, d.managedBy, d.serialNumber ?? '', STATUS_LABEL[d.staleStatus], d.explanation,
    ].map(csvCell).join(','))
  }
  return lines.join('\r\n') + '\r\n'
}
