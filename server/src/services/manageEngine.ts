import type { MacAppClassification, MacAppSource } from './macAppClassification.js'
import type { Device, AppStatus } from '../types.js'
import type { RuntimeManageEngineConfig } from '../store/integrationStore.js'
import { getManageEngineConfig } from '../store/integrationStore.js'

// ManageEngine MDM On-Demand (Endpoint Central Cloud) — Zoho OAuth2 client-credentials-style
// refresh-token flow. Distinct from on-prem Endpoint Central's static-API-key scheme; the two
// products have completely different auth and endpoint shapes.

interface TokenCache {
  token: string
  expiresAt: number
  clientId: string
  /** Space-separated scopes Zoho granted to this token. */
  scope: string
}

let tokenCache: TokenCache | null = null

// Zoho enforces a per-minute rate limit on token exchanges for a given
// refresh token; back-to-back requests (e.g. two processes refreshing close
// together) get a transient 429. Retry only that case — a 400 means the
// refresh token/scope itself is invalid and retrying won't help.
const TOKEN_RETRY_DELAYS_MS = [1_000, 3_000]

async function requestAccessToken(cfg: RuntimeManageEngineConfig): Promise<{ access_token?: string; error?: string; expires_in?: number; scope?: string }> {
  const body = new URLSearchParams({
    refresh_token: cfg.refreshToken,
    client_id:     cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type:    'refresh_token',
  })
  for (let attempt = 0; ; attempt++) {
    const res = await fetch('https://accounts.zoho.com/oauth/v2/token', { method: 'POST', body })
    if (res.status === 429 && attempt < TOKEN_RETRY_DELAYS_MS.length) {
      await new Promise(r => setTimeout(r, TOKEN_RETRY_DELAYS_MS[attempt]))
      continue
    }
    if (!res.ok) throw new Error(`ManageEngine auth failed: ${res.status} ${res.statusText}`)
    return res.json() as Promise<{ access_token?: string; error?: string; expires_in?: number; scope?: string }>
  }
}

export async function getAccessToken(cfg: RuntimeManageEngineConfig): Promise<string> {
  if (tokenCache && tokenCache.clientId === cfg.clientId && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token
  }

  const data = await requestAccessToken(cfg)
  if (!data.access_token) throw new Error(`ManageEngine auth failed: ${data.error ?? 'no access_token returned'}`)

  tokenCache = {
    token:     data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    clientId:  cfg.clientId,
    scope:     data.scope ?? '',
  }
  return tokenCache.token
}

/** Scopes granted to the current ManageEngine OAuth token (empty if none reported). */
export async function getGrantedScopes(cfg: RuntimeManageEngineConfig): Promise<string[]> {
  await getAccessToken(cfg)
  return (tokenCache?.scope ?? '').split(/[\s,]+/).filter(Boolean)
}

async function meGet<T>(cfg: RuntimeManageEngineConfig, path: string): Promise<T> {
  const token = await getAccessToken(cfg)
  const base = cfg.apiDomain.replace(/\/$/, '')
  const res = await fetch(`${base}/api/v1/${path}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`ManageEngine API ${res.status} on ${path}: ${body.slice(0, 300)}`)
  }
  return res.json() as Promise<T>
}

// ── Device list ────────────────────────────────────────────────────────────

export interface MEUser {
  user_email?: string
  user_name?: string
}

export interface MEDevice {
  device_id: string
  device_name?: string
  serial_number?: string
  platform_type?: string
  model?: string
  product_name?: string
  os_version?: string
  managed_status?: string
  is_removed?: string | boolean
  last_contact_time?: string | number
  device_capacity?: string
  available_device_capacity?: string
  user?: MEUser
}

interface MEDeviceListResponse {
  metadata: { total_record_count: string | number }
  devices: MEDevice[]
  paging?: { next?: string; previous?: string }
}

export interface MEDeviceDetail extends MEDevice {
  security?: {
    storage_encryption?: boolean
    passcode_present?: boolean
    device_rooted?: boolean
    passcode_complaint?: boolean
  }
  os?: { build_version?: string }
  network?: { wifi_mac?: string; ethernet_macs?: string }
  is_supervised?: boolean
}

interface MEProfile {
  profile_id?: string | number
  profile_name?: string
  status?: string
  remarks?: string
  localized_remarks?: string
  applied_time?: string
}

export interface ManageEngineDeviceProfileResult {
  profileId: string | null
  profileName: string
  status: string | null
  remarks: string | null
  localizedRemarks: string | null
  appliedTime: string | null
}

export interface ManageEngineDeviceProfileSnapshot {
  profiles: ManageEngineDeviceProfileResult[]
  lastSuccessfulSyncAt: string
  stale: boolean
}

export interface ManageEngineFleetProfileResult {
  deviceId: string
  snapshot: ManageEngineDeviceProfileSnapshot | null
  unavailable: boolean
}

const profileResultsCache = new Map<string, ManageEngineDeviceProfileSnapshot>()
const profileResultsInFlight = new Map<string, Promise<ManageEngineDeviceProfileSnapshot>>()
const PROFILE_RESULTS_CACHE_TTL_MS = 5 * 60 * 1000
const PROFILE_RESULTS_CONCURRENCY = 8

interface MEApp {
  app_name: string
  identifier?: string
  app_version?: string
  app_id?: string | number
}

function mapPlatform(d: MEDevice): Device['platform'] {
  const hint = `${d.model ?? ''} ${d.product_name ?? ''}`.toLowerCase()
  if (hint.includes('mac')) return 'macOS'
  const p = d.platform_type?.toLowerCase()
  if (p === 'android') return 'Android'
  if (p === 'ios')      return hint.includes('mac') ? 'macOS' : 'iOS'
  if (p === 'windows')  return 'Windows'
  return 'Windows'
}

// ManageEngine's device payloads don't include a vendor/make field, so manufacturer is inferred
// from platform — only Apple platforms can be asserted with confidence; Windows/Android devices
// span many OEMs, so we leave it unset rather than guess.
function mapManufacturer(platform: Device['platform']): string | undefined {
  return platform === 'macOS' || platform === 'iOS' ? 'Apple' : undefined
}

// managed_status "2" = actively managed/enrolled; other values (e.g. "10","11") correspond to
// unenrolled/removed devices that only carry an id + status in the list payload — not real
// active inventory, so they're filtered out rather than shown as broken rows.
function isActiveDevice(d: MEDevice): boolean {
  return d.managed_status === '2' && d.is_removed !== 'true' && d.is_removed !== true
}

function mapComplianceState(detail: MEDeviceDetail | null): Device['complianceState'] {
  if (!detail) return 'Warning'
  if (detail.security?.device_rooted) return 'Non-Compliant'
  if (detail.security?.storage_encryption === false) return 'Non-Compliant'
  if (detail.security?.passcode_present === false) return 'Warning'
  return 'Compliant'
}

function mapMEDevice(d: MEDevice, detail: MEDeviceDetail | null): Device {
  const lastContactRaw = d.last_contact_time
  const lastCheckIn = lastContactRaw
    ? new Date(typeof lastContactRaw === 'number' ? lastContactRaw : Number(lastContactRaw)).toLocaleString()
    : 'Unknown'

  const encrypted = detail?.security?.storage_encryption
  const compliance = mapComplianceState(detail)
  const primaryIssue =
    !detail ? 'Compliance details unavailable'
    : detail.security?.device_rooted ? 'Device rooted/jailbroken'
    : encrypted === false ? 'Storage encryption disabled'
    : detail?.security?.passcode_present === false ? 'No passcode set'
    : 'None'

  const model = d.model ?? d.product_name
  const platform = mapPlatform(d)
  const manufacturer = mapManufacturer(platform)

  return {
    id:               String(d.device_id),
    deviceName:       (d.device_name ?? '').trim() || 'Unknown Device',
    user:             d.user?.user_email ?? d.user?.user_name ?? 'Unknown',
    serialNumber:     d.serial_number ?? 'Unknown',
    platform,
    osVersion:        d.os_version ?? 'Unknown',
    managementSource: 'ManageEngine',
    lastCheckIn,
    complianceState:  compliance,
    encryptionStatus: encrypted === undefined ? 'Unknown' : encrypted ? 'Encrypted' : 'Not Encrypted',
    passcodeStatus:   detail?.security?.passcode_present === undefined ? 'Unknown' : detail.security.passcode_present ? 'Present' : 'Missing',
    primaryIssue,
    policyFailed:     !detail ? 'Compliance data not returned' : primaryIssue === 'None' ? 'None' : 'Security Policy',
    severity:         primaryIssue === 'None' ? 'Low' : detail?.security?.device_rooted ? 'Critical' : 'Medium',
    confidence:       detail ? '95%' : '60%',
    firstDetected:    'N/A',
    lastDetected:     lastCheckIn,
    issueSource:      'ManageEngine',
    ownership:        'Corporate',
    firewallStatus:   'Not Applicable',
    antivirusStatus:  'Not Applicable',
    secureBoot:       'Not Applicable',
    tpmVersion:       'Not Applicable',
    ...(manufacturer ? { manufacturer } : {}),
    ...(model ? { model } : {}),
    ...(d.device_capacity ? { totalStorage: `${d.device_capacity} GB` } : {}),
    ...(d.available_device_capacity ? { freeStorage: `${d.available_device_capacity} GB` } : {}),
    ...(detail?.os?.build_version ? { osBuildNumber: detail.os.build_version } : {}),
    ...(detail?.network?.wifi_mac ? { wifiMacAddress: detail.network.wifi_mac } : {}),
    ...(detail?.network?.ethernet_macs ? { macAddress: detail.network.ethernet_macs } : {}),
  }
}

// Per-device detail fetch (fetchDetailsBatched) is N+1 under the hood —
// whether Zoho's MDM On-Demand API has a bulk/export endpoint to avoid this
// hasn't been checked against their API docs. Until then, this concurrency
// knob is the only lever available, tunable without a code change if the
// fleet grows past ~800-1000 devices and 30s isn't enough headroom — raise
// cautiously, Zoho may rate-limit a too-aggressive burst.
const CONCURRENCY = Number(process.env.MANAGEENGINE_FETCH_CONCURRENCY) || 16

// mdm/devices defaults to 50 records per page (limit unset) and never returns more than one page
// on its own — callers must follow `paging.next`/increment `offset` until metadata.total_record_count
// is reached, or silently only see the first page. Cap at a generous page count as a backstop against
// a runaway loop (e.g. a broken total_record_count), logging loudly rather than truncating silently.
const DEVICE_LIST_PAGE_LIMIT = 200
const DEVICE_LIST_MAX_PAGES = 100

async function fetchAllMEDevices(cfg: RuntimeManageEngineConfig): Promise<MEDevice[]> {
  const all: MEDevice[] = []
  let offset = 0
  for (let page = 0; page < DEVICE_LIST_MAX_PAGES; page++) {
    const res = await meGet<MEDeviceListResponse>(cfg, `mdm/devices?limit=${DEVICE_LIST_PAGE_LIMIT}&offset=${offset}`)
    const batch = res.devices ?? []
    all.push(...batch)
    const total = Number(res.metadata?.total_record_count ?? all.length)
    if (!res.paging?.next || batch.length === 0 || all.length >= total) return all
    offset += DEVICE_LIST_PAGE_LIMIT
  }
  console.warn(`[manageEngine] Device list pagination stopped after ${DEVICE_LIST_MAX_PAGES} pages (${all.length} devices fetched) — total_record_count may be larger.`)
  return all
}

async function fetchDetailsBatched(cfg: RuntimeManageEngineConfig, ids: string[]): Promise<Map<string, MEDeviceDetail | null>> {
  const result = new Map<string, MEDeviceDetail | null>()
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY)
    const settled = await Promise.allSettled(batch.map(id => meGet<MEDeviceDetail>(cfg, `mdm/devices/${id}`)))
    settled.forEach((s, idx) => result.set(batch[idx]!, s.status === 'fulfilled' ? s.value : null))
  }
  return result
}

export async function getManageEngineDevices(cfg?: RuntimeManageEngineConfig): Promise<Device[]> {
  const config = cfg ?? getManageEngineConfig()
  if (!config) throw new Error('ManageEngine credentials not configured')

  const allDevices = await fetchAllMEDevices(config)
  const active = allDevices.filter(isActiveDevice)

  const details = await fetchDetailsBatched(config, active.map(d => String(d.device_id)))
  return active.map(d => mapMEDevice(d, details.get(String(d.device_id)) ?? null))
}

/** Raw (unmapped) active-device records for modules that need fields the
 *  normalized Device drops (e.g. epoch check-in time, storage as numbers).
 *  Read-only; same endpoints and filtering as getManageEngineDevices. */
export interface ManageEngineRawDevice {
  device: MEDevice
  detail: MEDeviceDetail | null
}

export async function getManageEngineRawDevices(cfg?: RuntimeManageEngineConfig): Promise<ManageEngineRawDevice[]> {
  const config = cfg ?? getManageEngineConfig()
  if (!config) throw new Error('ManageEngine credentials not configured')
  const active = (await fetchAllMEDevices(config)).filter(isActiveDevice)
  const details = await fetchDetailsBatched(config, active.map(d => String(d.device_id)))
  return active.map(d => ({ device: d, detail: details.get(String(d.device_id)) ?? null }))
}

/** Read-only device list (no per-device detail calls) for modules that only need list-level fields such as
 *  `last_contact_time`. Same active-device filtering as getManageEngineDevices. */
export async function getManageEngineActiveDeviceList(cfg?: RuntimeManageEngineConfig): Promise<MEDevice[]> {
  const config = cfg ?? getManageEngineConfig()
  if (!config) throw new Error('ManageEngine credentials not configured')
  return (await fetchAllMEDevices(config)).filter(isActiveDevice)
}

export function isManageEngineConfigured(): boolean {
  return !!getManageEngineConfig()
}

// ── Per-device installed apps (application inventory) ──────────────────────

export async function getManageEngineDeviceApps(deviceId: string, cfg?: RuntimeManageEngineConfig): Promise<AppStatus[]> {
  const config = cfg ?? getManageEngineConfig()
  if (!config) throw new Error('ManageEngine credentials not configured')

  const data = await meGet<{ installed_apps: MEApp[] }>(config, `mdm/devices/${deviceId}/apps`)
  return (data.installed_apps ?? []).map(a => ({
    name:      a.app_name,
    version:   a.app_version ?? 'Unknown',
    publisher: 'ManageEngine',
    status:    'Installed' as const,
    appType:   'MDM Managed',
  }))
}

// ── Fleet-wide application inventory (aggregated across all devices) ───────
//
// Root-cause fix (previous version of this feature): apps were grouped only by
// their display-name string, with no device-OS separation, no stable app
// identifier, and no dedup guard for duplicate device records — so two
// distinct apps sharing a name (or a device appearing twice) could silently
// merge into one incorrect row. This version:
//  - groups by a stable app id (Graph-style bundle `identifier`, falling back
//    to the numeric `app_id`) instead of the display name
//  - separates entries into Windows / macOS buckets using ONLY the device's
//    own platform field (never the app name)
//  - dedupes devices by serial number before aggregating, so a duplicate
//    enrollment record can't double-count a device
//  - derives "latest version" and per-device update status from the actual
//    versions observed in the fleet (no external version catalog exists for
//    this API/scope, so nothing here is fabricated — it's the newest real
//    install seen anywhere in the tenant)

// Optional macOS classification fields (see macAppClassification.ts); absent for Windows rows.
export interface MEAppClassificationFields {
  classification?: MacAppClassification
  classificationReason?: string
  installSource?: MacAppSource
  confidence?: 'high' | 'medium' | 'low'
}

export interface MEAppRaw extends MEAppClassificationFields {
  appId: string
  name: string
  version: string
  bundleId?: string
  reportedBy?: string[]
}

export interface MEAppLogEntry {
  deviceId: string
  deviceName: string
  version: string
  status: 'Installed' | 'Update Available' | 'Unknown'
  lastSeen: string
  // This API/OAuth scope exposes only a point-in-time installed-app snapshot —
  // there is no install-attempt/failure history endpoint available (confirmed
  // via direct probing: /appstatus, /appinstallstatus, /history all 404 for
  // this scope). Always null; kept as a field rather than omitted so the UI
  // can show an honest "not reported" state instead of hiding the column.
  errorDetails: string | null
  classification?: MacAppClassification
  classificationReason?: string
}

export interface MEAppEntry extends MEAppClassificationFields {
  bundleId?: string
  reportedBy?: string[]
  appId: string
  name: string
  platform: 'Windows' | 'macOS'
  installedVersions: string[]
  /** Device totals per installed version. Intune can provide these before its
   * per-device records are loaded, so version details remain useful in the
   * inventory table. */
  versionCounts?: Array<{ version: string; deviceCount: number }>
  latestVersion: string
  deviceCount: number
  updateStatus: 'Up to date' | 'Update Available' | 'Unknown'
  logs: MEAppLogEntry[]
}

// Only Windows and macOS are in scope per the current product requirement —
// Linux/Android/iOS devices (none exist in this tenant today) are excluded
// from these two tables rather than shoehorned into a third bucket.
export function classifyAppPlatform(devicePlatform: Device['platform']): 'Windows' | 'macOS' | null {
  if (devicePlatform === 'Windows') return 'Windows'
  if (devicePlatform === 'macOS') return 'macOS'
  return null
}

// Guards against duplicate device records (e.g. re-enrollment creating a new
// device_id for hardware already present) inflating device counts — keeps
// whichever record has the more recent check-in.
export function dedupeDevicesBySerial(devices: Device[]): Device[] {
  const bySerial = new Map<string, Device>()
  for (const d of devices) {
    const key = d.serialNumber && d.serialNumber !== 'Unknown' ? d.serialNumber : d.id
    const existing = bySerial.get(key)
    if (!existing) { bySerial.set(key, d); continue }
    const existingTime = Date.parse(existing.lastCheckIn)
    const candidateTime = Date.parse(d.lastCheckIn)
    if (!Number.isNaN(candidateTime) && (Number.isNaN(existingTime) || candidateTime > existingTime)) {
      bySerial.set(key, d)
    }
  }
  return Array.from(bySerial.values())
}

// Higher = more visible; mirrors macAppClassification's priority (managed > manual > unknown > system).
const CLASSIFICATION_RANK: Record<MacAppClassification, number> = {
  managed_self_service: 3, manual_or_user_installed: 2, unknown_review_required: 1, system_preinstalled: 0,
}
const classificationRank = (c: MacAppClassification): number => CLASSIFICATION_RANK[c]

function parseVersionParts(v: string): number[] | null {
  const nums = v.match(/\d+/g)
  if (!nums) return null
  return nums.map(n => parseInt(n, 10))
}

// Numeric-aware version comparison (e.g. "24.10.2" > "24.9.0") with a
// string-compare fallback for non-numeric version schemes. Treats 'Unknown'
// as lower than any known version.
export function compareVersions(a: string, b: string): number {
  const aKnown = !!a && a !== 'Unknown'
  const bKnown = !!b && b !== 'Unknown'
  if (!aKnown && !bKnown) return 0
  if (!aKnown) return -1
  if (!bKnown) return 1

  const pa = parseVersionParts(a)
  const pb = parseVersionParts(b)
  if (!pa || !pb) return a.localeCompare(b)

  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x - y
  }
  return 0
}

export function pickLatestVersion(versions: string[]): string {
  const known = versions.filter(v => v && v !== 'Unknown')
  if (known.length === 0) return 'Unknown'
  return known.reduce((best, v) => compareVersions(v, best) > 0 ? v : best, known[0]!)
}

// Pure aggregation — takes already-fetched devices + per-device app lists and
// produces the grouped, platform-separated table data. Kept free of any I/O
// so it can be unit tested without a live API.
export function buildAppInventory(
  devices: Device[],
  appsByDeviceId: Map<string, MEAppRaw[]>,
): { windows: MEAppEntry[]; macos: MEAppEntry[] } {
  const buckets: Record<'Windows' | 'macOS', Map<string, MEAppEntry>> = {
    Windows: new Map(),
    macOS:   new Map(),
  }

  for (const device of devices) {
    const platform = classifyAppPlatform(device.platform)
    if (!platform) continue

    const apps = appsByDeviceId.get(device.id) ?? []
    const seenAppIdsForDevice = new Set<string>()

    for (const app of apps) {
      if (seenAppIdsForDevice.has(app.appId)) continue
      seenAppIdsForDevice.add(app.appId)

      const bucket = buckets[platform]
      let entry = bucket.get(app.appId)
      if (!entry) {
        entry = {
          appId: app.appId,
          name: app.name,
          platform,
          installedVersions: [],
          latestVersion: 'Unknown',
          deviceCount: 0,
          updateStatus: 'Unknown',
          logs: [],
          ...(app.bundleId ? { bundleId: app.bundleId } : {}),
          ...(app.classification ? {
            classification: app.classification, classificationReason: app.classificationReason ?? '',
            installSource: app.installSource ?? 'unknown', confidence: app.confidence ?? 'low',
          } : {}),
          ...(app.reportedBy ? { reportedBy: [...app.reportedBy] } : {}),
        }
        bucket.set(app.appId, entry)
      } else {
        // Same app on another device: keep the most visible classification and the union of reporters.
        if (app.classification && (!entry.classification || classificationRank(app.classification) > classificationRank(entry.classification))) {
          entry.classification = app.classification
          entry.classificationReason = app.classificationReason ?? ''
          entry.installSource = app.installSource ?? 'unknown'
          entry.confidence = app.confidence ?? 'low'
        }
        if (app.reportedBy) entry.reportedBy = [...new Set([...(entry.reportedBy ?? []), ...app.reportedBy])]
      }

      const version = app.version || 'Unknown'
      if (!entry.installedVersions.includes(version)) entry.installedVersions.push(version)
      entry.deviceCount += 1
      entry.logs.push({
        deviceId: device.id,
        deviceName: device.deviceName,
        version,
        status: 'Installed', // corrected to reflect update status once latestVersion is known, below
        lastSeen: device.lastCheckIn,
        errorDetails: null,
        ...(app.classification ? { classification: app.classification, classificationReason: app.classificationReason ?? '' } : {}),
      })
    }
  }

  for (const bucket of Object.values(buckets)) {
    for (const entry of bucket.values()) {
      entry.latestVersion = pickLatestVersion(entry.installedVersions)
      const hasUnknown = entry.installedVersions.includes('Unknown')
      entry.updateStatus = hasUnknown
        ? 'Unknown'
        : entry.installedVersions.every(v => v === entry.latestVersion) ? 'Up to date' : 'Update Available'
      entry.logs = entry.logs.map(l => ({
        ...l,
        status: l.version === 'Unknown' ? 'Unknown' : l.version === entry.latestVersion ? 'Installed' : 'Update Available',
      }))
      entry.versionCounts = entry.installedVersions.map(version => ({
        version,
        deviceCount: entry.logs.filter(log => log.version === version).length,
      }))
    }
  }

  return {
    windows: Array.from(buckets.Windows.values()).sort((a, b) => b.deviceCount - a.deviceCount),
    macos:   Array.from(buckets.macOS.values()).sort((a, b) => b.deviceCount - a.deviceCount),
  }
}

async function getManageEngineDeviceAppsRaw(deviceId: string, cfg: RuntimeManageEngineConfig): Promise<MEAppRaw[]> {
  const data = await meGet<{ installed_apps: MEApp[] }>(cfg, `mdm/devices/${deviceId}/apps`)
  return (data.installed_apps ?? []).map(a => ({
    appId:   a.identifier || String(a.app_id ?? a.app_name),
    name:    a.app_name,
    version: a.app_version || 'Unknown',
  }))
}

const APPS_CACHE_TTL_MS = 5 * 60 * 1000
// A partial read must not be served as complete for the full TTL.
const APPS_PARTIAL_CACHE_TTL_MS = 60 * 1000

/** How many enrolled devices had their installed-app list read; unread devices are missing from every count. */
export interface ManageEngineAppCoverage { devicesTotal: number; devicesRead: number; devicesUnread: number; unreadSample: string[] }

let appsCache: { entries: { windows: MEAppEntry[]; macos: MEAppEntry[] }; coverage: ManageEngineAppCoverage; expiresAt: number } | null = null

export async function getManageEngineAppInventoryWithCoverage(
  cfg?: RuntimeManageEngineConfig,
): Promise<{ entries: { windows: MEAppEntry[]; macos: MEAppEntry[] }; coverage: ManageEngineAppCoverage }> {
  if (appsCache && Date.now() < appsCache.expiresAt) return { entries: appsCache.entries, coverage: appsCache.coverage }

  const config = cfg ?? getManageEngineConfig()
  if (!config) throw new Error('ManageEngine credentials not configured')

  const rawDevices = await getManageEngineDevices(config) // already excludes removed/unenrolled devices
  const devices = dedupeDevicesBySerial(rawDevices)

  const appsByDeviceId = new Map<string, MEAppRaw[]>()
  const readOnce = async (id: string) => {
    try { return await getManageEngineDeviceAppsRaw(id, config) }
    catch { return await getManageEngineDeviceAppsRaw(id, config) } // one retry for transient 429/5xx
  }
  for (let i = 0; i < devices.length; i += CONCURRENCY) {
    const batch = devices.slice(i, i + CONCURRENCY)
    const settled = await Promise.allSettled(batch.map(d => readOnce(d.id)))
    settled.forEach((s, idx) => {
      if (s.status === 'fulfilled') appsByDeviceId.set(batch[idx]!.id, s.value)
    })
  }

  const unread = devices.filter(d => !appsByDeviceId.has(d.id))
  const coverage: ManageEngineAppCoverage = {
    devicesTotal: devices.length, devicesRead: devices.length - unread.length, devicesUnread: unread.length,
    unreadSample: unread.slice(0, 5).map(d => d.deviceName),
  }
  const entries = buildAppInventory(devices, appsByDeviceId)
  appsCache = { entries, coverage, expiresAt: Date.now() + (unread.length ? APPS_PARTIAL_CACHE_TTL_MS : APPS_CACHE_TTL_MS) }
  return { entries, coverage }
}

export async function getManageEngineAppInventory(
  cfg?: RuntimeManageEngineConfig,
): Promise<{ windows: MEAppEntry[]; macos: MEAppEntry[] }> {
  return (await getManageEngineAppInventoryWithCoverage(cfg)).entries
}

// ── Per-device applied profiles (policy / configuration) ───────────────────

export async function getManageEngineDevicePolicies(deviceId: string, cfg?: RuntimeManageEngineConfig): Promise<string[]> {
  const config = cfg ?? getManageEngineConfig()
  if (!config) throw new Error('ManageEngine credentials not configured')

  const data = await meGet<{ profiles: MEProfile[] }>(config, `mdm/devices/${deviceId}/profiles`)
  return (data.profiles ?? []).map(p => `${p.profile_name} — ${p.remarks || (p.status === '6' ? 'Applied' : 'Status ' + p.status)}`)
}

/**
 * Return Endpoint Central's documented per-device profile association results.
 * The API does not provide an overall device compliance verdict through this
 * resource, so status values are passed through without interpreting them.
 */
export async function getManageEngineDeviceProfileResults(
  deviceId: string,
  cfg?: RuntimeManageEngineConfig,
): Promise<ManageEngineDeviceProfileSnapshot> {
  const config = cfg ?? getManageEngineConfig()
  if (!config) throw new Error('ManageEngine credentials not configured')

  const cacheKey = `${config.apiDomain.replace(/\/$/, '')}:${config.clientId}:${deviceId}`
  const cachedSnapshot = profileResultsCache.get(cacheKey)
  if (cachedSnapshot && Date.now() - Date.parse(cachedSnapshot.lastSuccessfulSyncAt) < PROFILE_RESULTS_CACHE_TTL_MS) {
    return cachedSnapshot
  }
  const inFlight = profileResultsInFlight.get(cacheKey)
  if (inFlight) return inFlight

  const request = (async (): Promise<ManageEngineDeviceProfileSnapshot> => {
    try {
      const data = await meGet<{ profiles?: unknown }>(
        config,
        `mdm/devices/${encodeURIComponent(deviceId)}/profiles`,
      )
      if (!Array.isArray(data.profiles)) throw new Error('ManageEngine profile response did not contain a profiles array')

      const snapshot: ManageEngineDeviceProfileSnapshot = {
        profiles: data.profiles.map((entry: unknown) => {
          const profile = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {}
          const profileId = profile.profile_id
          const appliedTime = profile.applied_time
          return {
            profileId: typeof profileId === 'string' || typeof profileId === 'number' ? String(profileId) : null,
            profileName: typeof profile.profile_name === 'string' ? profile.profile_name : 'Unknown profile',
            status: typeof profile.status === 'string' ? profile.status : null,
            remarks: typeof profile.remarks === 'string' ? profile.remarks : null,
            localizedRemarks: typeof profile.localized_remarks === 'string' ? profile.localized_remarks : null,
            appliedTime: typeof appliedTime === 'string' || typeof appliedTime === 'number' ? String(appliedTime) : null,
          }
        }),
        lastSuccessfulSyncAt: new Date().toISOString(),
        stale: false,
      }
      profileResultsCache.set(cacheKey, snapshot)
      return snapshot
    } catch (error) {
      const cached = profileResultsCache.get(cacheKey)
      if (cached) return { ...cached, stale: true }
      throw error
    }
  })()

  profileResultsInFlight.set(cacheKey, request)
  try {
    return await request
  } finally {
    if (profileResultsInFlight.get(cacheKey) === request) profileResultsInFlight.delete(cacheKey)
  }
}

export async function getManageEngineDeviceProfileResultsForDevices(
  deviceIds: string[],
  cfg?: RuntimeManageEngineConfig,
): Promise<ManageEngineFleetProfileResult[]> {
  const config = cfg ?? getManageEngineConfig()
  if (!config) throw new Error('ManageEngine credentials not configured')
  await getAccessToken(config)

  const uniqueIds = [...new Set(deviceIds)]
  const results: ManageEngineFleetProfileResult[] = []

  for (let i = 0; i < uniqueIds.length; i += PROFILE_RESULTS_CONCURRENCY) {
    const batch = uniqueIds.slice(i, i + PROFILE_RESULTS_CONCURRENCY)
    const settled = await Promise.allSettled(batch.map(deviceId => getManageEngineDeviceProfileResults(deviceId, config)))
    settled.forEach((result, index) => {
      results.push({
        deviceId: batch[index]!,
        snapshot: result.status === 'fulfilled' ? result.value : null,
        unavailable: result.status === 'rejected',
      })
    })
  }

  return results
}
