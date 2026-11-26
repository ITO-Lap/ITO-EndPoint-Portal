import type { Device } from '../types.js'

// ManageEngine's per-device detail call (FileVault, passcode, compliance) can fail wholesale during throttling or
// token churn. The mapper then emits "Compliance details unavailable", and because every sync is saved as the last
// good list, one bad sync used to erase good data fleet-wide. This keeps the last successfully-read values for such
// devices — clearly marked stale, and only up to a maximum age — instead of replacing them with "unknown".

export const UNREAD_MARKER = 'Compliance details unavailable'
export const DEFAULT_CARRY_DAYS = 7
/** How long last-known MDM details may stand in for an unreadable sync. MDM_DETAIL_MAX_STALE_DAYS overrides it. */
export function maxCarryAgeMs(): number {
  const n = Number(process.env['MDM_DETAIL_MAX_STALE_DAYS'])
  return (Number.isFinite(n) && n >= 1 && n <= 90 ? Math.floor(n) : DEFAULT_CARRY_DAYS) * 86_400_000
}
export const DEGRADED_RATIO = 0.2

const DETAIL_FIELDS = ['encryptionStatus', 'passcodeStatus', 'complianceState', 'primaryIssue', 'policyFailed', 'severity', 'confidence'] as const

const isMdm = (d: Device): boolean => d.managementSource === 'ManageEngine' && !d.id.startsWith('ec-') && d.platform !== 'Windows'
const isUnread = (d: Device): boolean => d.primaryIssue === UNREAD_MARKER

export interface CarryOverResult {
  devices: Device[]
  /** MDM devices whose detail read failed this sync. */
  unread: number
  /** …of which last-known values were kept. */
  carried: number
  mdmTotal: number
  /** More than DEGRADED_RATIO of MDM devices could not be read this sync. */
  degraded: boolean
}

export function carryOverMdmDetails(fresh: Device[], previous: Device[] | null, previousSavedAt: string | null, now = Date.now()): CarryOverResult {
  const prev = new Map((previous ?? []).filter(isMdm).map(d => [d.id, d]))
  let unread = 0, carried = 0, mdmTotal = 0
  const devices = fresh.map(d => {
    if (!isMdm(d)) return d
    mdmTotal++
    if (!isUnread(d)) return d
    unread++
    const old = prev.get(d.id)
    if (!old || isUnread(old)) return d
    const since = old.detailsStaleSince ?? previousSavedAt ?? undefined
    const sinceMs = since ? Date.parse(since) : NaN
    if (!since || Number.isNaN(sinceMs) || now - sinceMs > maxCarryAgeMs()) return d
    carried++
    const kept = Object.fromEntries(DETAIL_FIELDS.filter(f => old[f] !== undefined).map(f => [f, old[f]]))
    return { ...d, ...kept, detailsStaleSince: since }
  })
  return { devices, unread, carried, mdmTotal, degraded: mdmTotal > 0 && unread / mdmTotal > DEGRADED_RATIO }
}
