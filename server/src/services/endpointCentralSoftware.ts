import fs from 'node:fs'
import path from 'node:path'
import { getManageEngineConfig } from '../store/integrationStore.js'
import { getAccessToken, buildAppInventory } from './manageEngine.js'
import type { MEAppRaw, MEAppEntry } from './manageEngine.js'
import { getPatchSystems } from './endpointCentralPatch.js'
import type { Device } from '../types.js'
import { macosMajorFromName } from '../data/macosSystemApps.js'
import { classifyMacApp, dedupeInventoryRecords } from './macAppClassification.js'
import type { InventoryRecord } from './macAppClassification.js'
import { getMacDeploymentIndex } from './intune.js'

// Endpoint Central software inventory (GET /api/1.4/inventory/installedsoftware?resid=<resource_id_string>).
// Unlike the MDM `mdm/devices/{id}/apps` endpoint (only ~6 MDM-distributed Apple apps per Mac), this is the
// agent's full scan. It has NO install-source field (`invswinstalled.app_installed_by` is always 0 and there is
// no Self Service package list in the API), so "manual or Self Service" is derived by *excluding* what is
// provably not user-installed: OS entries, hotfixes/updates, OS-bundled and management-agent components.

const DEFAULT_HOST = 'https://endpointcentral.manageengine.com'
const PAGE_LIMIT = 1000
const MAX_PAGES = 5
const CONCURRENCY = 8
const CACHE_TTL_MS = 30 * 60 * 1000

export interface EcInstalledSoftware {
  software_name?: string
  software_version?: string
  manufacturer_name?: string
  location?: string
  sw_family?: number
  'invswtoosrel.app_identifier'?: string
}

const blank = (v: string | undefined): string => (v && !/^-+$/.test(v.trim()) ? v.trim() : '')

const UPDATE_NAME = /^(update for|security update|hotfix|service pack|cumulative update)\b|\bKB\d{6,}\b/i
// Runtimes, drivers and management/monitoring agents that arrive with the image or IT tooling rather than from a user.
const WINDOWS_NOISE = /redistributable|\bruntime\b|\.net (core|framework|runtime|sdk)|c\+\+ \d{4}|odbc driver|ole db driver|native client|language service|help viewer|internet explorer|pv drivers|^manageengine|uems|opmanager|local administrator password/i

/**
 * Decides which rows are *apps* at all. Windows is narrowed to likely user installs. macOS rows are all kept
 * (except OS entries and updates): which of them to show is decided by macAppClassification, so nothing a person
 * might need to review is silently dropped.
 */
export function isUserInstalledSoftware(app: EcInstalledSoftware, platform: 'Windows' | 'macOS'): boolean {
  const name = blank(app.software_name)
  if (!name) return false
  if (app.sw_family !== 1) return false // 2 = operating system, 3 = hotfix/security update
  if (UPDATE_NAME.test(name)) return false
  if (platform === 'macOS') return true
  const location = blank(app.location).toLowerCase()
  return !location.startsWith('c:\\windows') && !WINDOWS_NOISE.test(name)
}

/** Raw macOS row kept in the cache so classification can be re-run when rules or the baseline change. */
export interface MacRawApp { n: string; b: string; v: string; p: string; vd: string }

export function toMacRaw(app: EcInstalledSoftware): MacRawApp {
  return {
    n: blank(app.software_name), b: blank(app['invswtoosrel.app_identifier']), v: blank(app.software_version),
    p: blank(app.location), vd: blank(app.manufacturer_name),
  }
}

export function toRawApp(app: EcInstalledSoftware): MEAppRaw {
  const name = blank(app.software_name)
  const bundleId = blank(app['invswtoosrel.app_identifier'])
  return { appId: bundleId || name.toLowerCase(), name, version: blank(app.software_version) || 'Unknown' }
}

class RateLimitError extends Error { constructor() { super('Endpoint Central rate limit (429)') } }

async function fetchInstalledSoftware(token: string, detailResourceId: string): Promise<EcInstalledSoftware[]> {
  const host = (process.env.ENDPOINT_CENTRAL_BASE_URL ?? process.env.ENDPOINT_CENTRAL_PATCH_URL ?? DEFAULT_HOST).replace(/\/$/, '')
  const rows: EcInstalledSoftware[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(`${host}/api/1.4/inventory/installedsoftware?resid=${detailResourceId}&pagelimit=${PAGE_LIMIT}&page=${page}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    })
    if (res.status === 429) throw new RateLimitError()
    if (!res.ok) throw new Error(`Endpoint Central inventory API ${res.status}`)
    const json = await res.json() as { status?: string; error_description?: string; message_response?: { total?: number; installedsoftware?: EcInstalledSoftware[] } }
    if (json.status === 'error') throw new Error(json.error_description ?? 'Endpoint Central inventory error')
    const batch = json.message_response?.installedsoftware ?? []
    rows.push(...batch)
    if (batch.length < PAGE_LIMIT || rows.length >= (json.message_response?.total ?? Infinity)) break
  }
  return rows
}

export interface ScanProgress {
  status: 'idle' | 'running'
  scanned: number
  total: number
  startedAt: string | null
  finishedAt: string | null
}

export interface PlatformCoverage { devices: number; scanned: number }

export interface EndpointCentralAppInventory {
  windows: MEAppEntry[]
  macos: MEAppEntry[]
  coverage: { devices: number; withInventory: number; failed: number; windows: PlatformCoverage; macos: PlatformCoverage }
  /** Distinct Apple system apps left out of `macos` (0 when system apps are included). */
  hiddenSystemApps: number
  progress: ScanProgress
}

// Endpoint Central rate-limits this API (HTTP 429 beyond roughly 20 calls/minute; ~2.5 s spacing was verified clean),
// so scanning is a background job. Macs are scanned first (they matter most and are the smaller set), results are
// saved to disk after every batch so a server restart resumes instead of starting over, and the endpoint returns
// whatever has been scanned so far plus progress.
const BASE_DELAY_MS = 2_500
const MAX_RETRIES = 8
const RESCAN_AFTER_MS = 6 * 60 * 60 * 1000
const PUBLISH_EVERY = 25
const CACHE_FILE = path.resolve(process.cwd(), '.cache', 'endpoint-central-app-inventory.v2.json')

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/** Servers are out of scope: the inventory is for client (end-user) devices. */
export function isServerOs(osName: string | undefined): boolean {
  return /\bserver\b/i.test(osName ?? '')
}

interface ScannedDevice {
  name: string; platform: 'Windows' | 'macOS'; lastCheckIn: string; scannedAt: number
  /** Windows: already narrowed to likely user installs. */
  apps: MEAppRaw[]
  /** macOS: every app row, unclassified — classification runs at read time so rule/baseline changes apply instantly. */
  macApps?: MacRawApp[]
  macosMajor?: number | null
}

function loadScanned(): Map<string, ScannedDevice> {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) as { devices?: Record<string, ScannedDevice> }
    return new Map(Object.entries(raw.devices ?? {}))
  } catch { return new Map() }
}

function saveScanned(scanned: Map<string, ScannedDevice>): void {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true })
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ savedAt: new Date().toISOString(), devices: Object.fromEntries(scanned) }))
  } catch (e) { console.warn('[EndpointCentralSoftware] could not persist scan cache:', e instanceof Error ? e.message : e) }
}

const scannedDevices = loadScanned()
let targetIds = new Set<string>()
let total = 0
let failed = 0
let progress: ScanProgress = { status: 'idle', scanned: 0, total: 0, startedAt: null, finishedAt: null }
let scanning = false

function newestScan(): number { return Math.max(0, ...[...scannedDevices.values()].map(d => d.scannedAt)) }

let dataVersion = 0 // bumped whenever scanned data changes; keys the snapshot memo
const memo = new Map<string, Omit<EndpointCentralAppInventory, 'progress'>>()

// Endpoint Central's own agent/portal apps are, by definition, deployed by Endpoint Central.
const EC_AGENT_DEPLOYMENT = { source: 'endpoint_central', kind: 'Endpoint Central agent' } as const

function macRawAppsFor(id: string, d: ScannedDevice, deployments: ReturnType<typeof getMacDeploymentIndex>): MEAppRaw[] {
  const records: Array<InventoryRecord & { reportedByAll?: string[] }> = (d.macApps ?? []).map(r => ({
    deviceId: id, name: r.n, bundleId: r.b, path: r.p, version: r.v, vendor: r.vd,
    macosMajor: d.macosMajor ?? null, reportedBy: 'endpoint_central',
  }))
  return dedupeInventoryRecords(records).map(r => {
    const c = classifyMacApp(r, deployments)
    return {
      appId: r.bundleId || r.name.toLowerCase(), name: r.name, version: r.version || 'Unknown',
      ...(r.bundleId ? { bundleId: r.bundleId } : {}),
      classification: c.classification, classificationReason: c.reason, installSource: c.installSource, confidence: c.confidence,
      reportedBy: r.reportedByAll ?? [r.reportedBy],
    }
  })
}

function snapshot(includeSystem: boolean): Omit<EndpointCentralAppInventory, 'progress'> {
  const deployments = getMacDeploymentIndex()
  deployments.addBundlePrefix('com.manageengine.', EC_AGENT_DEPLOYMENT)
  const key = `${dataVersion}|${targetIds.size}|${deployments.size}|${includeSystem}`
  const hit = memo.get(key)
  if (hit) return hit

  const devices: Device[] = []
  const appsByDeviceId = new Map<string, MEAppRaw[]>()
  const hiddenSystem = new Set<string>()
  for (const [id, d] of scannedDevices) {
    if (targetIds.size > 0 && !targetIds.has(id)) continue // device no longer an in-scope client
    devices.push({ id, deviceName: d.name, platform: d.platform, lastCheckIn: d.lastCheckIn } as Device)
    if (d.platform !== 'macOS') { appsByDeviceId.set(id, d.apps); continue }
    const classified = macRawAppsFor(id, d, deployments)
    if (!includeSystem) classified.filter(a => a.classification === 'system_preinstalled').forEach(a => hiddenSystem.add(a.appId))
    appsByDeviceId.set(id, includeSystem ? classified : classified.filter(a => a.classification !== 'system_preinstalled'))
  }
  const { windows, macos } = buildAppInventory(devices, appsByDeviceId)
  const scannedOf = (p: 'Windows' | 'macOS') => devices.filter(d => d.platform === p).length
  const result = {
    windows, macos,
    coverage: {
      devices: total, withInventory: devices.length, failed,
      windows: { devices: platformTotals.Windows, scanned: scannedOf('Windows') },
      macos:   { devices: platformTotals.macOS,   scanned: scannedOf('macOS') },
    },
    hiddenSystemApps: hiddenSystem.size,
  }
  memo.clear()
  memo.set(key, result)
  return result
}

const platformTotals = { Windows: 0, macOS: 0 }

async function runScan(): Promise<void> {
  const cfg = getManageEngineConfig()
  if (!cfg) throw new Error('ManageEngine credentials not configured')

  const [token, systems] = await Promise.all([getAccessToken(cfg), getPatchSystems(true)])
  const seen = new Set<string>()
  const targets: Array<{ id: string; name: string; platform: 'Windows' | 'macOS'; lastCheckIn: string; macosMajor: number | null }> = []
  for (const sys of systems) {
    const platform = sys.platform === 'Mac' ? 'macOS' : sys.platform === 'Windows' ? 'Windows' : null
    if (!platform || !sys.detailResourceId || seen.has(sys.detailResourceId)) continue
    if (platform === 'Windows' && isServerOs(sys.osName)) continue
    seen.add(sys.detailResourceId)
    targets.push({
      id: sys.detailResourceId, name: sys.names[0] ?? sys.detailResourceId, platform,
      lastCheckIn: sys.lastSuccessfulScanTime ?? sys.lastScanTime ?? 'Unknown',
      macosMajor: platform === 'macOS' ? macosMajorFromName(sys.osName) : null,
    })
  }
  targets.sort((a, b) => (a.platform === b.platform ? 0 : a.platform === 'macOS' ? -1 : 1)) // Macs first

  targetIds = seen
  total = targets.length
  platformTotals.Windows = targets.filter(t => t.platform === 'Windows').length
  platformTotals.macOS = targets.filter(t => t.platform === 'macOS').length
  failed = 0

  // Devices scanned recently are kept; only missing or stale ones are fetched again.
  const pending = targets.filter(t => Date.now() - (scannedDevices.get(t.id)?.scannedAt ?? 0) > RESCAN_AFTER_MS)
  progress = { status: 'running', scanned: targets.length - pending.length, total: targets.length, startedAt: new Date().toISOString(), finishedAt: null }

  let delay = BASE_DELAY_MS
  let sinceSave = 0
  for (const t of pending) {
    const started = Date.now()
    let done = false
    for (let attempt = 0; attempt <= MAX_RETRIES && !done; attempt++) {
      try {
        const rows = await fetchInstalledSoftware(token, t.id)
        const apps = rows.filter(a => isUserInstalledSoftware(a, t.platform))
        scannedDevices.set(t.id, {
          name: t.name, platform: t.platform, lastCheckIn: t.lastCheckIn, scannedAt: Date.now(),
          apps: t.platform === 'Windows' ? apps.map(toRawApp) : [],
          ...(t.platform === 'macOS' ? { macApps: apps.map(toMacRaw), macosMajor: t.macosMajor } : {}),
        })
        dataVersion++
        done = true
      } catch (e) {
        if (e instanceof RateLimitError && attempt < MAX_RETRIES) {
          delay = Math.min(delay + 500, 6_000) // adapt: slow down after each 429
          await sleep(30_000 * Math.min(attempt + 1, 4))
        } else { failed++; done = true }
      }
    }
    progress.scanned++
    if (++sinceSave >= PUBLISH_EVERY) { saveScanned(scannedDevices); sinceSave = 0 }
    await sleep(Math.max(0, delay - (Date.now() - started)))
  }
  saveScanned(scannedDevices)
  progress = { ...progress, status: 'idle', finishedAt: new Date().toISOString() }
  console.log(`[EndpointCentralSoftware] ✓ ${total - failed}/${total} client systems have inventory (${failed} failed)`)
}

function startScan(): void {
  if (scanning) return
  scanning = true
  runScan()
    .catch(e => {
      console.error('[EndpointCentralSoftware] scan failed:', e instanceof Error ? e.message : e)
      progress = { ...progress, status: 'idle', finishedAt: new Date().toISOString() }
    })
    .finally(() => { scanning = false })
}

/** Returns the latest snapshot immediately; starts a background scan if data is missing, stale, or `force` is set. */
export function getEndpointCentralAppInventory(force = false, includeSystem = false): EndpointCentralAppInventory {
  const stale = Date.now() - newestScan() > RESCAN_AFTER_MS || (progress.finishedAt === null && progress.status === 'idle' && targetIds.size === 0)
  if (!scanning && (force || stale)) startScan()
  return { ...snapshot(includeSystem), progress }
}
