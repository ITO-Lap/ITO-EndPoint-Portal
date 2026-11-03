// Pure normalisation, scope filtering, correlation and the stale rule. No I/O, no clock reads (callers pass `now`).
import type {
  CorrelationConfidence, ManagedBy, SourceEvidence, SourceRecord, SourceState, StaleDevice, StalePlatform,
  StaleSnapshot, StaleSourceId, StaleStatus,
} from './types.js'
import { STALE_DAYS } from './types.js'

const DAY_MS = 86_400_000
const MIN_PLAUSIBLE_MS = Date.UTC(2000, 0, 1)
/** A timestamp more than a day in the future is clock skew, not evidence of a check-in. */
const FUTURE_TOLERANCE_MS = DAY_MS

// ── Raw source shapes (only the fields this module reads) ─────────────────────────────────────────────

export interface RawIntuneDevice {
  id?: string | null
  deviceName?: string | null
  operatingSystem?: string | null
  osVersion?: string | null
  serialNumber?: string | null
  userDisplayName?: string | null
  userPrincipalName?: string | null
  emailAddress?: string | null
  lastSyncDateTime?: string | null
  azureADDeviceId?: string | null
  managementAgent?: string | null
  managementState?: string | null
  enrolledDateTime?: string | null
}

export interface RawEcDevice {
  device_id?: string | number | null
  device_name?: string | null
  serial_number?: string | null
  platform_type?: string | null
  model?: string | null
  product_name?: string | null
  os_version?: string | null
  last_contact_time?: string | number | null
  user?: { user_email?: string | null; user_name?: string | null } | null
}

export type ExcludeReason = 'unsupported_platform' | 'windows_server'
export type ClassifyResult = { include: true; record: SourceRecord } | { include: false; reason: ExcludeReason }

// ── Helpers ───────────────────────────────────────────────────────────────────────────────────────────

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')

const PLACEHOLDER_SERIALS = new Set([
  'unknown', 'none', 'n/a', 'na', 'null', 'default string', 'to be filled by o.e.m.', 'to be filled by oem', 'system serial number',
  'not available', 'not applicable', 'serial number', '0', '00000000', '123456789', '1234567890', 'chassis serial number',
])

/** Upper-cased serial without whitespace, or null for empty / placeholder / obviously bogus values. */
export function normalizeSerial(value: unknown): string | null {
  const raw = str(value)
  if (!raw) return null
  if (PLACEHOLDER_SERIALS.has(raw.toLowerCase())) return null
  const s = raw.replace(/\s+/g, '').toUpperCase()
  if (s.length < 4 || /^(.)\1+$/.test(s)) return null
  return s
}

/** Epoch-ms number / numeric string / ISO string → ISO UTC, or null for missing and sentinel values. */
export function toIsoUtc(value: unknown): { iso: string | null; issue?: 'missing' | 'invalid' } {
  if (value === null || value === undefined || value === '') return { iso: null, issue: 'missing' }
  let ms: number
  if (typeof value === 'number') ms = value
  else if (typeof value === 'string' && /^\d{10,}$/.test(value.trim())) ms = Number(value.trim())
  else ms = Date.parse(String(value))
  if (!Number.isFinite(ms) || ms < MIN_PLAUSIBLE_MS) return { iso: null, issue: 'invalid' } // includes 0001-01-01 / epoch 0 "never"
  return { iso: new Date(ms).toISOString() }
}

/** Windows build numbers that only ever shipped as Windows Server. */
const SERVER_ONLY_BUILDS = new Set([20348, 25398])
/** Builds shared by a Windows 10 client (LTSB/LTSC) and a Windows Server release — cannot be told apart. */
const AMBIGUOUS_BUILDS = new Set([14393, 17763])

function windowsBuild(osVersion: string): number | null {
  const m = /^\d+\.\d+\.(\d+)/.exec(osVersion)
  return m ? Number(m[1]) : null
}

const SERVER_TEXT = /\bserver\b/i

// ── Per-source classification ─────────────────────────────────────────────────────────────────────────

/** Intune: Windows clients only. Everything else is dropped here. */
export function classifyIntuneDevice(raw: RawIntuneDevice): ClassifyResult {
  const os = str(raw.operatingSystem)
  const lower = os.toLowerCase()
  if (!lower.startsWith('windows') || /phone|mobile/.test(lower)) return { include: false, reason: 'unsupported_platform' }
  if (SERVER_TEXT.test(os)) return { include: false, reason: 'windows_server' }
  const osVersion = str(raw.osVersion)
  const build = windowsBuild(osVersion)
  if (build !== null && SERVER_ONLY_BUILDS.has(build)) return { include: false, reason: 'windows_server' }

  let classification: SourceRecord['classification'] = 'client'
  let classificationReason: string | undefined
  if (build !== null && AMBIGUOUS_BUILDS.has(build)) {
    classification = 'uncertain'
    classificationReason = `OS build ${build} is shared by Windows 10 LTSC and Windows Server; client/server cannot be confirmed.`
  }
  const agent = str(raw.managementAgent)
  if (agent.toLowerCase() === 'eas') {
    classification = 'uncertain'
    classificationReason = 'Exchange ActiveSync-only record (managementAgent = eas); lastSyncDateTime is not an MDM check-in.'
  }

  const ts = toIsoUtc(raw.lastSyncDateTime)
  const upn = str(raw.userPrincipalName)
  const email = str(raw.emailAddress) || (upn.includes('@') ? upn : '')
  return {
    include: true,
    record: {
      source: 'intune', sourceId: str(raw.id), deviceName: str(raw.deviceName) || 'Unknown device', platform: 'Windows',
      osVersion: osVersion || 'Unknown', serialNumber: normalizeSerial(raw.serialNumber),
      username: str(raw.userDisplayName) || upn, email, entraDeviceId: str(raw.azureADDeviceId).toLowerCase() || null,
      lastCheckInAt: ts.iso, ...(ts.issue ? { checkInIssue: ts.issue } : {}),
      classification, ...(classificationReason ? { classificationReason } : {}),
      ...(agent ? { note: `managementAgent: ${agent}` } : {}),
    },
  }
}

/**
 * Endpoint Central MDM: Windows clients and macOS only. The MDM payload has no OS-edition field, so Windows
 * Server can only be recognised from explicit text (os_version / model / product_name); a Windows record with
 * none of those fields cannot be classified and is sent to review instead of being counted.
 */
export function classifyEcDevice(raw: RawEcDevice): ClassifyResult {
  const platformType = str(raw.platform_type).toLowerCase()
  const hint = `${str(raw.model)} ${str(raw.product_name)}`
  const osVersion = str(raw.os_version)
  // Existing convention (manageEngine.ts mapPlatform): a "mac" model/product name wins over platform_type.
  const isMac = /\b(?:i?mac)/i.test(hint) || platformType === 'macos' || platformType === 'mac'
  let platform: StalePlatform
  if (isMac) platform = 'macOS'
  else if (platformType === 'windows') platform = 'Windows'
  else return { include: false, reason: 'unsupported_platform' } // android, ios/ipados, unknown, missing

  let classification: SourceRecord['classification'] = 'client'
  let classificationReason: string | undefined
  if (platform === 'Windows') {
    if (SERVER_TEXT.test(`${hint} ${osVersion}`)) return { include: false, reason: 'windows_server' }
    const build = windowsBuild(osVersion)
    if (build !== null && SERVER_ONLY_BUILDS.has(build)) return { include: false, reason: 'windows_server' }
    if (!osVersion && !hint.trim()) {
      classification = 'uncertain'
      classificationReason = 'No OS version, model or product name reported; Windows client vs server cannot be confirmed.'
    } else if (build !== null && AMBIGUOUS_BUILDS.has(build)) {
      classification = 'uncertain'
      classificationReason = `OS build ${build} is shared by Windows 10 LTSC and Windows Server; client/server cannot be confirmed.`
    }
  }

  const ts = toIsoUtc(raw.last_contact_time)
  const email = str(raw.user?.user_email)
  return {
    include: true,
    record: {
      source: 'endpoint-central', sourceId: str(raw.device_id), deviceName: str(raw.device_name) || 'Unknown device', platform,
      osVersion: osVersion || 'Unknown', serialNumber: normalizeSerial(raw.serial_number),
      username: str(raw.user?.user_name) || email, email, entraDeviceId: null,
      lastCheckInAt: ts.iso, ...(ts.issue ? { checkInIssue: ts.issue } : {}),
      classification, ...(classificationReason ? { classificationReason } : {}),
      note: 'Source field: mdm/devices last_contact_time',
    },
  }
}

// ── Correlation ───────────────────────────────────────────────────────────────────────────────────────

class UnionFind {
  private parent = new Map<number, number>()
  find(x: number): number {
    let r = x
    while ((this.parent.get(r) ?? r) !== r) r = this.parent.get(r)!
    this.parent.set(x, r)
    return r
  }
  union(a: number, b: number): void { this.parent.set(this.find(a), this.find(b)) }
}

interface Group { platform: StalePlatform; records: SourceRecord[]; viaSerial: boolean }

/**
 * Groups records that are provably the same physical device: same normalised serial, or (Intune-to-Intune only)
 * the same Entra device id. Device name alone never merges anything.
 */
function groupRecords(records: SourceRecord[]): Group[] {
  const uf = new UnionFind()
  const bySerial = new Map<string, number>()
  const byEntra = new Map<string, number>()
  records.forEach((r, i) => {
    if (r.serialNumber) {
      const key = `${r.platform}|${r.serialNumber}`
      const seen = bySerial.get(key)
      if (seen === undefined) bySerial.set(key, i); else uf.union(i, seen)
    }
    if (r.entraDeviceId) {
      const seen = byEntra.get(r.entraDeviceId)
      if (seen === undefined) byEntra.set(r.entraDeviceId, i); else uf.union(i, seen)
    }
  })
  const groups = new Map<number, Group>()
  records.forEach((r, i) => {
    const root = uf.find(i)
    const g = groups.get(root) ?? { platform: r.platform, records: [], viaSerial: false }
    g.records.push(r)
    groups.set(root, g)
  })
  for (const g of groups.values()) {
    const sources = new Set(g.records.map(r => r.source))
    g.viaSerial = sources.size > 1 && g.records.some(r => r.serialNumber)
  }
  return [...groups.values()]
}

const nameKey = (n: string): string => n.trim().toLowerCase()

// ── Evaluation ────────────────────────────────────────────────────────────────────────────────────────

export interface EvaluateInput {
  snapshot: StaleSnapshot
  now: number
}

function latest(records: SourceRecord[], source: StaleSourceId, now: number): SourceRecord | null {
  let best: SourceRecord | null = null
  for (const r of records) {
    if (r.source !== source || !validTime(r.lastCheckInAt, now)) continue
    if (!best || Date.parse(r.lastCheckInAt!) > Date.parse(best.lastCheckInAt!)) best = r
  }
  return best
}

function validTime(iso: string | null, now: number): boolean {
  if (!iso) return false
  const ms = Date.parse(iso)
  return Number.isFinite(ms) && ms >= MIN_PLAUSIBLE_MS && ms <= now + FUTURE_TOLERANCE_MS
}

const SOURCE_LABEL: Record<StaleSourceId, string> = { intune: 'Intune', 'endpoint-central': 'Endpoint Central' }

function ageText(days: number): string { return days === 1 ? '1 day' : `${days} days` }

/** Builds the canonical device list and evaluates the stale rule against `now` (UTC). */
export function evaluateDevices({ snapshot, now }: EvaluateInput): StaleDevice[] {
  const cutoff = now - STALE_DAYS * DAY_MS
  const states: Record<StaleSourceId, SourceState> = { intune: snapshot.meta.intune.state, 'endpoint-central': snapshot.meta['endpoint-central'].state }
  const all = [...snapshot.intune, ...snapshot.endpointCentral]
  const groups = groupRecords(all)

  // Name-only candidates across sources (Windows only; macOS exists in Endpoint Central alone).
  const winSingle = groups.filter(g => g.platform === 'Windows' && !g.viaSerial)
  const namesBySource = new Map<string, { intune: Group[]; ec: Group[] }>()
  for (const g of winSingle) {
    const sources = new Set(g.records.map(r => r.source))
    if (sources.size !== 1) continue
    const k = nameKey(g.records[0]!.deviceName)
    if (!k || k === 'unknown device') continue
    const entry = namesBySource.get(k) ?? { intune: [], ec: [] }
    ;(sources.has('intune') ? entry.intune : entry.ec).push(g)
    namesBySource.set(k, entry)
  }
  const duplicateOf = new Map<Group, string[]>()
  for (const { intune, ec } of namesBySource.values()) {
    if (!intune.length || !ec.length) continue
    for (const g of intune) duplicateOf.set(g, ec.map(o => o.records[0]!.deviceName))
    for (const g of ec) duplicateOf.set(g, intune.map(o => o.records[0]!.deviceName))
  }

  const devices: StaleDevice[] = []
  for (const g of groups) {
    const intuneRec = latest(g.records, 'intune', now)
    const ecRec = latest(g.records, 'endpoint-central', now)
    const hasIntune = g.records.some(r => r.source === 'intune')
    const hasEc = g.records.some(r => r.source === 'endpoint-central')
    const primaryIntune = intuneRec ?? g.records.find(r => r.source === 'intune') ?? null
    const primaryEc = ecRec ?? g.records.find(r => r.source === 'endpoint-central') ?? null
    const display = primaryIntune ?? primaryEc!

    const candidates = [intuneRec, ecRec].filter((r): r is SourceRecord => r !== null)
    const effective = candidates.sort((a, b) => Date.parse(b.lastCheckInAt!) - Date.parse(a.lastCheckInAt!))[0] ?? null
    const effMs = effective ? Date.parse(effective.lastCheckInAt!) : null

    const evidence: SourceEvidence[] = []
    for (const [src, rec, valid] of [['intune', primaryIntune, intuneRec], ['endpoint-central', primaryEc, ecRec]] as const) {
      if (!rec) continue
      const msNum = valid ? Date.parse(valid.lastCheckInAt!) : null
      evidence.push({
        source: src, sourceId: rec.sourceId, lastCheckInAt: valid?.lastCheckInAt ?? null,
        state: msNum === null ? 'no_data' : msNum < cutoff ? 'stale' : 'recent',
        note: msNum === null
          ? `${SOURCE_LABEL[src]} returned no trustworthy check-in timestamp${rec.checkInIssue ? ` (${rec.checkInIssue})` : ''}.`
          : rec.note ?? null,
      })
    }

    const reviewReasons: string[] = []
    for (const r of g.records) if (r.classification === 'uncertain' && r.classificationReason) reviewReasons.push(r.classificationReason)
    const dupNames = duplicateOf.get(g) ?? []
    if (dupNames.length) reviewReasons.push(`Possible duplicate of ${dupNames.join(', ')} in the other source — same device name but no matching serial number or verified ID. Not merged.`)

    const managedBy: ManagedBy = hasIntune && hasEc ? 'Intune + Endpoint Central' : hasIntune ? 'Intune' : 'Endpoint Central'
    const correlation: CorrelationConfidence = dupNames.length ? 'unresolved' : 'high'

    // A stale verdict rests on every applicable source having been read; if one failed on the last refresh,
    // a more recent check-in there cannot be ruled out.
    const relevant: StaleSourceId[] = g.platform === 'Windows' ? ['intune', 'endpoint-central'] : ['endpoint-central']
    const unreadable = relevant.filter(s => states[s] === 'error')

    let status: StaleStatus
    let explanation: string
    const inactiveDays = effMs === null ? null : Math.max(0, Math.floor((now - effMs) / DAY_MS))
    const effLabel = effective ? SOURCE_LABEL[effective.source] : null

    if (reviewReasons.length) {
      status = 'needs_review'
      explanation = `Needs review: ${reviewReasons[0]}`
    } else if (effMs === null) {
      status = 'no_checkin_data'
      explanation = 'No trustworthy last-check-in timestamp is available from any applicable source, so this device is not classified as stale.'
    } else if (effMs >= cutoff) {
      const stale = evidence.filter(e => e.state === 'stale')
      if (g.platform === 'Windows' && hasIntune && hasEc && stale.length) {
        status = 'source_drift'
        const s = stale[0]!, other = SOURCE_LABEL[effective!.source]
        explanation = `Source drift: ${SOURCE_LABEL[s.source]} last checked in ${ageText(Math.floor((now - Date.parse(s.lastCheckInAt!)) / DAY_MS))} ago, but ${other} checked in ${ageText(inactiveDays!)} ago. Not counted as stale.`
      } else {
        status = 'active'
        explanation = `Active: the latest verified check-in was ${inactiveDays === 0 ? 'today' : `${ageText(inactiveDays!)} ago`} from ${effLabel}.`
      }
    } else if (unreadable.length) {
      status = 'needs_review'
      explanation = `Needs review: the latest check-in seen was ${ageText(inactiveDays!)} ago from ${effLabel}, but ${unreadable.map(s => SOURCE_LABEL[s]).join(' and ')} could not be read on the last refresh, so a more recent check-in cannot be ruled out.`
    } else {
      status = 'stale'
      explanation = `Stale because the latest verified check-in was ${ageText(inactiveDays!)} ago from ${effLabel}.`
        + (g.platform === 'Windows' && hasIntune && hasEc ? ' Both Intune and Endpoint Central are older than 21 days.' : '')
    }

    const intuneId = primaryIntune?.sourceId ?? null
    const ecId = primaryEc?.sourceId ?? null
    const serial = g.records.find(r => r.serialNumber)?.serialNumber ?? null
    const user = g.records.find(r => r.source === 'intune' && (r.username || r.email)) ?? g.records.find(r => r.username || r.email) ?? display
    const email = (g.records.find(r => r.source === 'intune' && r.email) ?? g.records.find(r => r.email))?.email ?? ''
    devices.push({
      canonicalDeviceId: serial ? `${g.platform === 'Windows' ? 'win' : 'mac'}:serial:${serial}` : `${display.source === 'intune' ? 'intune' : 'ec'}:${display.sourceId}`,
      deviceName: display.deviceName, username: user.username, email,
      platform: g.platform, osVersion: display.osVersion, serialNumber: serial,
      managedBy, intuneDeviceId: intuneId, endpointCentralDeviceId: ecId,
      intuneLastSyncAt: intuneRec?.lastCheckInAt ?? null, endpointCentralLastCheckInAt: ecRec?.lastCheckInAt ?? null,
      effectiveLastCheckInAt: effective?.lastCheckInAt ?? null, effectiveSource: effective?.source ?? null,
      inactiveDays, staleStatus: status, correlationConfidence: correlation, explanation, reviewReasons,
      sourceEvidence: evidence, possibleDuplicateOf: dupNames, sourceDataStatus: states, lastDataRefreshAt: snapshot.syncedAt,
    })
  }
  return devices
}
