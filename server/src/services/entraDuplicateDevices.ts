// Detects duplicate Entra ID device objects. An Entra Object ID is unique by
// definition, so "duplicate" means several directory objects that represent the
// same physical device — typically left behind by re-imaging, re-enrolment or
// Autopilot / hybrid-join re-registration. Objects are linked when they share:
//   • the same Device ID                     (High confidence)
//   • the same serial number, via Intune     (High confidence; Entra holds no serial)
//   • the same display name + OS family      (Medium: could be two real devices)
// and linked objects are merged into one group (so A~B by name and B~C by
// serial gives a single group of three).

import { credentialsFromEnv, getEntraDirectoryDevices, getManagedDevices, type GraphEntraDevice, type GraphManagedDevice, type TenantCredentials } from './graphApi.js'
import { getEntraConfig } from '../store/integrationStore.js'

const DAY_MS = 86_400_000
export const INACTIVE_DAYS = 30

export type MatchReason = 'Device ID' | 'Serial number' | 'Device name'
export type Recommendation = 'Keep' | 'Cleanup candidate' | 'Review'

export interface DuplicateObjectRow {
  groupId: string
  groupSize: number
  confidence: 'High' | 'Medium'
  matchedOn: string
  objectId: string
  deviceId: string
  displayName: string
  operatingSystem: string
  osVersion: string
  joinType: string
  intuneManaged: string
  compliant: string
  enabled: string
  registered: string
  lastSignIn: string
  daysInactive: number | null
  serialNumber: string
  primaryUser: string
  recommendation: Recommendation
  note: string
}

export interface DuplicateGroup { id: string; confidence: 'High' | 'Medium'; matchedOn: MatchReason[]; rows: DuplicateObjectRow[] }

export interface DuplicateDeviceReport {
  totalEntraDevices: number
  groups: DuplicateGroup[]
  /** false when the Intune join (serial numbers) was unavailable; serial matching is then skipped. */
  intuneJoined: boolean
  generatedAt: string
}

const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase()

export function osFamily(os: string | null | undefined): string {
  const v = norm(os)
  if (v.startsWith('windows')) return 'windows'
  if (v === 'macmdm' || v.startsWith('mac')) return 'macos'
  if (v === 'ios' || v === 'ipados' || v.startsWith('iphone') || v.startsWith('ipad')) return 'ios'
  if (v.startsWith('android')) return 'android'
  return v || 'unknown'
}

export function joinTypeLabel(trustType: string | null | undefined): string {
  switch (trustType) {
    case 'AzureAd':  return 'Entra joined'
    case 'ServerAd': return 'Hybrid joined'
    case 'Workplace': return 'Entra registered'
    default:         return trustType ?? 'Unknown'
  }
}

const daysSince = (iso: string | null | undefined, now: Date): number | null => {
  const ts = Date.parse(iso ?? '')
  return Number.isFinite(ts) ? Math.max(0, Math.floor((now.getTime() - ts) / DAY_MS)) : null
}

const ts = (iso: string | null | undefined): number => { const t = Date.parse(iso ?? ''); return Number.isFinite(t) ? t : 0 }
/** Most recently active first: last sign-in, then registration date. */
const byActivity = (a: GraphEntraDevice, b: GraphEntraDevice): number =>
  ts(b.approximateLastSignInDateTime) - ts(a.approximateLastSignInDateTime) || ts(b.registrationDateTime) - ts(a.registrationDateTime)

export function detectDuplicateDevices(entra: GraphEntraDevice[], intune: GraphManagedDevice[] | null, now = new Date()): DuplicateDeviceReport {
  const intuneByDeviceId = new Map<string, GraphManagedDevice>()
  for (const m of intune ?? []) if (m.azureADDeviceId) intuneByDeviceId.set(norm(m.azureADDeviceId), m)
  const serialOf = (d: GraphEntraDevice) => {
    const serial = intuneByDeviceId.get(norm(d.deviceId))?.serialNumber?.trim().toUpperCase()
    return serial && serial !== 'UNKNOWN' && serial !== 'SYSTEM SERIAL NUMBER' ? serial : null
  }

  // Union-find over directory object IDs.
  const parent = new Map<string, string>(entra.map(d => [d.id, d.id]))
  const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(x, r); return r }
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb) }
  const reasonsByObject = new Map<string, Set<MatchReason>>()
  const link = (keyFn: (d: GraphEntraDevice) => string | null, reason: MatchReason) => {
    const buckets = new Map<string, GraphEntraDevice[]>()
    for (const d of entra) { const k = keyFn(d); if (k) buckets.set(k, [...(buckets.get(k) ?? []), d]) }
    for (const members of buckets.values()) {
      if (members.length < 2) continue
      for (const m of members) { union(members[0]!.id, m.id); (reasonsByObject.get(m.id) ?? reasonsByObject.set(m.id, new Set()).get(m.id)!).add(reason) }
    }
  }
  link(d => norm(d.deviceId) || null, 'Device ID')
  link(d => serialOf(d), 'Serial number')
  link(d => (norm(d.displayName) ? `${osFamily(d.operatingSystem)}|${norm(d.displayName)}` : null), 'Device name')

  const clusters = new Map<string, GraphEntraDevice[]>()
  for (const d of entra) clusters.set(find(d.id), [...(clusters.get(find(d.id)) ?? []), d])

  const groups: DuplicateGroup[] = []
  for (const members of clusters.values()) {
    if (members.length < 2) continue
    const ordered = [...members].sort((a, b) => byActivity(a, b) || a.id.localeCompare(b.id))
    const matchedOn = (['Device ID', 'Serial number', 'Device name'] as MatchReason[])
      .filter(r => members.some(m => reasonsByObject.get(m.id)?.has(r)))
    const confidence = matchedOn.some(r => r !== 'Device name') ? 'High' : 'Medium'
    const rows: DuplicateObjectRow[] = ordered.map((d, i) => {
      const inactive = daysSince(d.approximateLastSignInDateTime, now)
      const stale = inactive === null || inactive >= INACTIVE_DAYS
      const recommendation: Recommendation = i === 0 ? 'Keep' : stale ? 'Cleanup candidate' : 'Review'
      const note = i === 0 ? 'Most recently active object in the group.'
        : d.trustType === 'ServerAd' ? 'Hybrid joined: remove it from on-premises AD / sync scope; deleting it in Entra alone may be recreated.'
        : recommendation === 'Review' ? 'Recent sign-in activity: confirm this is not a second real device before removing.'
        : 'Older than the newest object and inactive; safe to disable first, then delete after a hold period.'
      const intuneRec = intuneByDeviceId.get(norm(d.deviceId))
      return {
        groupId: '', groupSize: members.length, confidence, matchedOn: matchedOn.join(' + '),
        objectId: d.id, deviceId: d.deviceId ?? '', displayName: d.displayName ?? '', operatingSystem: d.operatingSystem ?? '', osVersion: d.operatingSystemVersion ?? '',
        joinType: joinTypeLabel(d.trustType), intuneManaged: intuneRec || d.isManaged ? 'Yes' : 'No',
        compliant: d.isCompliant === null ? 'Unknown' : d.isCompliant ? 'Yes' : 'No', enabled: d.accountEnabled === null ? 'Unknown' : d.accountEnabled ? 'Yes' : 'No',
        registered: d.registrationDateTime?.slice(0, 10) ?? '', lastSignIn: d.approximateLastSignInDateTime?.slice(0, 10) ?? '', daysInactive: inactive,
        serialNumber: serialOf(d) ?? '', primaryUser: intuneRec?.userPrincipalName ?? '', recommendation, note,
      }
    })
    groups.push({ id: '', confidence, matchedOn, rows })
  }

  // High confidence first, then bigger groups, then by name; assign stable IDs after sorting.
  groups.sort((a, b) => Number(b.confidence === 'High') - Number(a.confidence === 'High') || b.rows.length - a.rows.length
    || a.rows[0]!.displayName.localeCompare(b.rows[0]!.displayName))
  groups.forEach((g, i) => { g.id = `DUP-${String(i + 1).padStart(3, '0')}`; g.rows.forEach(r => { r.groupId = g.id }) })

  return { totalEntraDevices: entra.length, groups, intuneJoined: intune !== null, generatedAt: now.toISOString() }
}

function entraCredentials(): TenantCredentials {
  const cfg = getEntraConfig()
  return cfg ? { tenantId: cfg.tenantId, clientId: cfg.clientId, clientSecret: cfg.clientSecret } : credentialsFromEnv()
}

export async function collectDuplicateDeviceReport(now = new Date()): Promise<DuplicateDeviceReport> {
  const creds = entraCredentials()
  let entra: GraphEntraDevice[]
  try {
    entra = await getEntraDirectoryDevices(creds)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(/\b(401|403)\b/.test(message)
      ? 'Could not read Entra devices: the app registration needs the Device.Read.All application permission (with admin consent).'
      : `Could not read Entra devices: ${message}`)
  }
  let intune: GraphManagedDevice[] | null = null
  try { intune = await getManagedDevices(creds) }
  catch (error) { console.error('[entra-duplicates] Intune join unavailable, skipping serial matching:', error) }
  return detectDuplicateDevices(entra, intune, now)
}
