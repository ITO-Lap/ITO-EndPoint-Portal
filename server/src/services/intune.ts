import type { Device, AppStatus } from '../types.js'
import type { RuntimeIntuneConfig } from '../store/integrationStore.js'
import { getIntuneConfig } from '../store/integrationStore.js'
import type { MEAppEntry, MEAppLogEntry } from './manageEngine.js'
import { compareVersions, pickLatestVersion } from './manageEngine.js'
import { DeploymentIndex } from './macAppClassification.js'
import type { RawIntuneDevice } from './staleDevices/normalize.js'

interface TokenCache {
  token: string
  expiresAt: number
  tenantId: string
}

let tokenCache: TokenCache | null = null

async function getAccessToken(cfg: RuntimeIntuneConfig): Promise<string> {
  if (
    tokenCache &&
    tokenCache.tenantId === cfg.tenantId &&
    Date.now() < tokenCache.expiresAt - 60_000
  ) {
    return tokenCache.token
  }

  const url = `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    client_id:     cfg.clientId,
    client_secret: cfg.clientSecret,
    scope:         'https://graph.microsoft.com/.default',
    grant_type:    'client_credentials',
  })

  const res = await fetch(url, { method: 'POST', body })
  if (!res.ok) throw new Error(`Intune auth failed: ${res.status} ${res.statusText}`)

  const data = await res.json() as { access_token: string; expires_in: number }
  tokenCache = {
    token:     data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    tenantId:  cfg.tenantId,
  }
  return tokenCache.token
}

interface GraphDevice {
  id: string
  deviceName: string
  userPrincipalName: string
  serialNumber: string | null
  operatingSystem: string
  osVersion: string
  osBuildNumber: string | null
  complianceState: string
  lastSyncDateTime: string
  enrolledDateTime: string | null
  isEncrypted: boolean
  manufacturer: string | null
  model: string | null
  totalStorageSpaceInBytes: number | null
  freeStorageSpaceInBytes: number | null
  physicalMemoryInBytes: number | null
  processorArchitecture: string | null
  wiFiMacAddress: string | null
  ethernetMacAddress: string | null
  ipAddressV4: string | null
  joinType: string | null
  azureADRegistered: boolean | null
  managedDeviceOwnerType: string | null
  userDisplayName: string | null
  notes: string | null
  azureADDeviceId: string | null
  deviceCategoryDisplayName: string | null
}

function fmtBytes(bytes: number | null | undefined, suffix: string): string | undefined {
  if (!bytes) return undefined
  const gb = bytes / 1_073_741_824
  return gb >= 1 ? `${gb.toFixed(0)} GB` : `${(bytes / 1_048_576).toFixed(0)} MB`
}

function mapJoinType(joinType: string | null): string {
  if (!joinType) return 'Azure AD Joined'
  if (joinType === 'hybridAzureADJoined') return 'Hybrid Azure AD Joined'
  if (joinType === 'azureADRegistered')   return 'Azure AD Registered'
  return 'Azure AD Joined'
}

function mapArch(arch: string | null): string | undefined {
  if (!arch) return undefined
  if (arch === 'x64' || arch === 'amd64') return 'x64'
  if (arch === 'arm64' || arch === 'arm') return 'ARM64'
  if (arch === 'x86')                     return 'x86'
  return arch
}

function mapGraphDevice(d: GraphDevice): Device {
  const complianceMap: Record<string, Device['complianceState']> = {
    compliant:     'Compliant',
    noncompliant:  'Non-Compliant',
    unknown:       'Warning',
    inGracePeriod: 'Warning',
    error:         'Warning',
  }
  const compliance = complianceMap[d.complianceState] ?? 'Warning'
  const platform: Device['platform'] =
    d.operatingSystem === 'macOS'   ? 'macOS'   :
    d.operatingSystem === 'Linux'   ? 'Linux'   :
    d.operatingSystem === 'Android' ? 'Android' :
    d.operatingSystem === 'iOS'     ? 'iOS'     : 'Windows'

  const totalStorage = fmtBytes(d.totalStorageSpaceInBytes, 'GB')
  const freeStorage  = fmtBytes(d.freeStorageSpaceInBytes,  'GB')
  const totalMemory  = fmtBytes(d.physicalMemoryInBytes,    'GB')
  const architecture = mapArch(d.processorArchitecture)

  return {
    id:               d.id,
    deviceName:       d.deviceName,
    user:             d.userPrincipalName,
    serialNumber:     d.serialNumber ?? 'Unknown',
    platform,
    osVersion:        d.osVersion,
    managementSource: 'Microsoft Intune',
    lastCheckIn:      new Date(d.lastSyncDateTime).toLocaleString('en-US'),
    complianceState:  compliance,
    encryptionStatus: d.isEncrypted
      ? (platform === 'macOS' ? 'FileVault On' : 'BitLocker On')
      : (platform === 'macOS' ? 'FileVault Off' : 'BitLocker Off'),
    primaryIssue:  d.isEncrypted && compliance === 'Compliant' ? 'None' : (d.isEncrypted ? '' : (platform === 'macOS' ? 'FileVault encryption not enabled' : 'BitLocker encryption not enabled')),
    policyFailed:  d.isEncrypted ? 'None' : (platform === 'macOS' ? 'Security – FileVault Policy' : 'Encryption – BitLocker Policy'),
    severity:      compliance === 'Non-Compliant' ? 'High' : compliance === 'Warning' ? 'Medium' : 'Low',
    confidence:    '85%',
    firstDetected: 'N/A',
    lastDetected:  new Date(d.lastSyncDateTime).toLocaleString('en-US'),
    issueSource:   'Microsoft Intune',

    // Hardware
    ...(d.manufacturer  ? { manufacturer: d.manufacturer } : {}),
    ...(d.model         ? { model:        d.model }        : {}),
    ...(totalStorage    ? { totalStorage }                 : {}),
    ...(freeStorage     ? { freeStorage }                  : {}),
    ...(totalMemory     ? { totalMemory }                  : {}),
    ...(architecture    ? { architecture }                 : {}),

    // Network
    ...(d.ipAddressV4      ? { ipAddress:      d.ipAddressV4 }      : {}),
    ...(d.ethernetMacAddress ? { macAddress:   d.ethernetMacAddress } : {}),
    ...(d.wiFiMacAddress   ? { wifiMacAddress: d.wiFiMacAddress }   : {}),

    // Enrollment & Identity
    ...(d.enrolledDateTime ? { enrollmentDate: new Date(d.enrolledDateTime).toLocaleDateString() } : {}),
    enrollmentType:  mapJoinType(d.joinType),
    ownership:       d.managedDeviceOwnerType === 'personal' ? 'Personal' : 'Corporate',
    isAadRegistered: d.azureADRegistered ?? true,
    ...(d.azureADDeviceId          ? { azureAdDeviceId: d.azureADDeviceId }          : {}),
    ...(d.deviceCategoryDisplayName ? { deviceCategory: d.deviceCategoryDisplayName } : {}),

    // OS
    ...(d.osBuildNumber ? { osBuildNumber: d.osBuildNumber } : {}),

    // Compliance
    lastComplianceCheck: new Date(d.lastSyncDateTime).toLocaleString('en-US'),
    appliedPolicies: [],
  }
}

// No $select — let Graph return all available fields for this tenant;
// avoids 400 errors when optional properties aren't supported by a tenant's license tier.
const GRAPH_SELECT = ''

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get('Retry-After')
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
    const retryAt = Date.parse(retryAfter)
    if (Number.isFinite(retryAt)) return Math.max(0, retryAt - Date.now())
  }
  return Math.min(30_000, 1_000 * 2 ** attempt)
}

async function waitForRetry(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

// Follows @odata.nextLink to page through all managed devices
async function graphGetAll<T = GraphDevice>(token: string, initialUrl: string): Promise<T[]> {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const results: T[] = []
  let url: string | null = initialUrl
  while (url) {
    let res: Response | undefined
    for (let attempt = 0; attempt <= 4; attempt++) {
      res = await fetch(url, { headers })
      const transient = res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504
      if (!transient) break
      if (attempt === 4) {
        if (res.status !== 429) break // surface the real 5xx body below
        throw new Error('Microsoft Graph rate-limited this request (429) after 5 attempts. Wait briefly, then retry.')
      }
      await waitForRetry(retryDelayMs(res, attempt))
    }
    if (!res) throw new Error('Microsoft Graph request failed without a response')
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      const hint =
        res.status === 401 ? ' — check client ID / secret are correct and not expired' :
        res.status === 403 ? ' — ensure the app registration has DeviceManagementManagedDevices.Read.All (Application) permission in Azure' :
        res.status === 400 ? ' — one or more $select fields may be unsupported by this tenant' : ''
      throw new Error(`Microsoft Graph ${res.status}${hint}: ${body.slice(0, 400)}`)
    }
    const data = await res.json() as { value?: T[]; '@odata.nextLink'?: string }
    results.push(...(data.value ?? []))
    url = data['@odata.nextLink'] ?? null
  }
  return results
}

export async function getIntuneDevices(cfg?: RuntimeIntuneConfig): Promise<Device[]> {
  const config = cfg ?? getIntuneConfig()
  if (!config) throw new Error('Intune credentials not configured')

  const token = await getAccessToken(config)
  const selectParam = GRAPH_SELECT ? `&$select=${GRAPH_SELECT}` : ''
  const initialUrl = `https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?$top=999${selectParam}`
  const raw = await graphGetAll(token, initialUrl)
  console.log(`[Intune] ✓ Fetched ${raw.length} managed device(s)`)
  return raw.map(mapGraphDevice)
}

/** Fields the Stale Devices module reads — nothing else is requested. */
const STALE_DEVICE_SELECT = 'id,deviceName,operatingSystem,osVersion,serialNumber,userDisplayName,userPrincipalName,emailAddress,lastSyncDateTime,azureADDeviceId,managementAgent,managementState,enrolledDateTime'

/** Read-only: every managed device with only the Stale Devices fields, following @odata.nextLink. The caller
 *  drops out-of-scope platforms (no server-side filter is relied on). */
export async function getIntuneStaleDeviceRecords(cfg?: RuntimeIntuneConfig): Promise<RawIntuneDevice[]> {
  const config = cfg ?? getIntuneConfig()
  if (!config) throw new Error('Intune credentials not configured')
  const token = await getAccessToken(config)
  return graphGetAll<RawIntuneDevice>(token, `https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?$top=999&$select=${STALE_DEVICE_SELECT}`)
}

// Lightweight health-check: token + one Graph call, returns diagnostic info (never throws)
export async function diagnoseIntune(): Promise<{
  configured: boolean
  tokenOk: boolean
  tokenError: string | null
  graphStatus: number | null
  graphOk: boolean
  graphError: string | null
  deviceCount: number
}> {
  const config = getIntuneConfig()
  if (!config) return { configured: false, tokenOk: false, tokenError: 'Not configured', graphStatus: null, graphOk: false, graphError: null, deviceCount: 0 }

  let token: string | null = null
  let tokenError: string | null = null
  try {
    token = await getAccessToken(config)
  } catch (e) {
    tokenError = (e as Error).message
    return { configured: true, tokenOk: false, tokenError, graphStatus: null, graphOk: false, graphError: null, deviceCount: 0 }
  }

  try {
    const res = await fetch(
      'https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?$top=1&$select=id,deviceName,complianceState',
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const body = await res.text().catch(() => '')
    let count = 0
    let graphError: string | null = null
    if (res.ok) {
      try { count = (JSON.parse(body) as { value?: unknown[] }).value?.length ?? 0 } catch { /* ignore */ }
    } else {
      graphError = body.slice(0, 400)
    }
    return { configured: true, tokenOk: true, tokenError: null, graphStatus: res.status, graphOk: res.ok, graphError, deviceCount: count }
  } catch (e) {
    return { configured: true, tokenOk: true, tokenError: null, graphStatus: null, graphOk: false, graphError: (e as Error).message, deviceCount: 0 }
  }
}

export function isIntuneConfigured(): boolean {
  return !!getIntuneConfig()
}

// ── Per-device detail (lazy-fetched, only when a device is opened) ────────────

interface GraphDetectedApp {
  displayName: string
  version: string | null
  publisher: string | null
}

// Live device-inventory scan results (registry/Add-Remove-Programs equivalent) —
// beta-only endpoint; v1.0 doesn't expose this navigation property for this tenant.
export async function getIntuneDeviceApps(deviceId: string, cfg?: RuntimeIntuneConfig): Promise<AppStatus[]> {
  const config = cfg ?? getIntuneConfig()
  if (!config) throw new Error('Intune credentials not configured')
  const token = await getAccessToken(config)

  const res = await fetch(
    `https://graph.microsoft.com/beta/deviceManagement/managedDevices/${deviceId}/detectedApps`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) {
    if (res.status === 404) return []
    const body = await res.text().catch(() => '')
    throw new Error(`Microsoft Graph ${res.status} on detectedApps: ${body.slice(0, 300)}`)
  }
  const data = await res.json() as { value: GraphDetectedApp[] }
  return data.value.map(a => ({
    name:      a.displayName,
    version:   a.version ?? '—',
    publisher: a.publisher ?? '',
    status:    'Installed' as const,
    appType:   'Detected on device',
  }))
}

interface GraphPolicyState {
  id: string
  displayName: string
  state: string
}

function formatPolicyState(state: string): string {
  if (state === 'compliant' || state === 'remediated') return 'Compliant'
  if (state === 'nonCompliant') return 'Non-Compliant'
  if (state === 'error') return 'Error'
  if (state === 'conflict') return 'Conflict'
  if (state === 'notApplicable') return 'Not Applicable'
  if (state === 'unknown') return 'Unknown'
  return state
}

// Real per-policy compliance + configuration-profile evaluation state for one device.
// Encodes state as a "— Compliant"/"— Non-Compliant" suffix on each name so the
// existing appliedPolicies: string[] shape (shared with ManageEngine's plain
// profile names) doesn't need a breaking type change — DeviceDetailPanel parses the suffix.
export async function getIntuneDevicePolicies(deviceId: string, cfg?: RuntimeIntuneConfig): Promise<string[]> {
  const config = cfg ?? getIntuneConfig()
  if (!config) throw new Error('Intune credentials not configured')
  const token = await getAccessToken(config)
  const headers = { Authorization: `Bearer ${token}` }

  const [complianceRes, configRes] = await Promise.allSettled([
    fetch(`https://graph.microsoft.com/v1.0/deviceManagement/managedDevices/${deviceId}/deviceCompliancePolicyStates`, { headers }),
    fetch(`https://graph.microsoft.com/v1.0/deviceManagement/managedDevices/${deviceId}/deviceConfigurationStates`, { headers }),
  ])

  const policies: string[] = []
  const seenIds = new Set<string>()

  for (const settled of [complianceRes, configRes]) {
    if (settled.status !== 'fulfilled' || !settled.value.ok) continue
    const data = await settled.value.json() as { value: GraphPolicyState[] }
    for (const p of data.value) {
      if (seenIds.has(p.id)) continue   // Graph returns duplicate entries for this tenant
      seenIds.add(p.id)
      policies.push(`${p.displayName} — ${formatPolicyState(p.state)}`)
    }
  }
  return policies
}

// ── User summaries derived from managed devices ────────────────────────────────

export interface IntuneUserSummary {
  upn: string
  displayName: string
  lastSyncDateTime: string
  complianceState: 'Compliant' | 'Warning' | 'Non-Compliant'
  devices: Array<{
    deviceName: string
    platform: string
    complianceState: 'Compliant' | 'Warning' | 'Non-Compliant'
    lastCheckIn: string
    encryptionStatus: string
    managementSource: 'Microsoft Intune'
  }>
}

const COMPLIANCE_MAP: Record<string, 'Compliant' | 'Warning' | 'Non-Compliant'> = {
  compliant:     'Compliant',
  noncompliant:  'Non-Compliant',
  unknown:       'Warning',
  inGracePeriod: 'Warning',
  error:         'Warning',
}

export async function getIntuneUserSummaries(cfg?: RuntimeIntuneConfig): Promise<IntuneUserSummary[]> {
  const config = cfg ?? getIntuneConfig()
  if (!config) throw new Error('Intune credentials not configured')

  const token = await getAccessToken(config)

  // Page through all devices
  const allDevices: GraphDevice[] = []
  const selectParam = GRAPH_SELECT ? `&$select=${GRAPH_SELECT}` : ''
  let nextUrl: string | null =
    `https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?$top=999${selectParam}`
  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`Microsoft Graph error: ${res.status} ${res.statusText}`)
    const data = await res.json() as { value: GraphDevice[]; '@odata.nextLink'?: string }
    allDevices.push(...data.value)
    nextUrl = data['@odata.nextLink'] ?? null
  }

  // Group by userPrincipalName
  const byUpn = new Map<string, { displayName: string; devices: GraphDevice[]; latestSync: Date }>()
  for (const d of allDevices) {
    const upn = (d.userPrincipalName ?? '').toLowerCase()
    if (!upn) continue
    const entry = byUpn.get(upn)
    const syncDate = new Date(d.lastSyncDateTime)
    if (!entry) {
      byUpn.set(upn, { displayName: d.userDisplayName ?? d.userPrincipalName, devices: [d], latestSync: syncDate })
    } else {
      entry.devices.push(d)
      if (syncDate > entry.latestSync) entry.latestSync = syncDate
    }
  }

  return Array.from(byUpn.entries()).map(([upn, { displayName, devices, latestSync }]) => {
    const mappedDevices = devices.map(d => {
      const platform = d.operatingSystem === 'macOS' ? 'macOS' : d.operatingSystem === 'Linux' ? 'Linux' : 'Windows'
      return {
        deviceName:       d.deviceName,
        platform,
        complianceState:  COMPLIANCE_MAP[d.complianceState] ?? 'Warning' as 'Compliant' | 'Warning' | 'Non-Compliant',
        lastCheckIn:      new Date(d.lastSyncDateTime).toLocaleString('en-US'),
        encryptionStatus: d.isEncrypted
          ? (platform === 'macOS' ? 'FileVault On' : 'BitLocker On')
          : (platform === 'macOS' ? 'FileVault Off' : 'BitLocker Off'),
        managementSource: 'Microsoft Intune' as const,
      }
    })

    const overall: 'Compliant' | 'Warning' | 'Non-Compliant' =
      mappedDevices.some(d => d.complianceState === 'Non-Compliant') ? 'Non-Compliant' :
      mappedDevices.some(d => d.complianceState === 'Warning')       ? 'Warning'       : 'Compliant'

    return { upn, displayName, lastSyncDateTime: latestSync.toISOString(), complianceState: overall, devices: mappedDevices }
  })
}

// ── Windows Self Service apps (Company Portal) ───────────────────────────────
// Self Service = a Windows app with an assignment of intent `available`. Per-app install status
// (mobileApps/{id}/deviceStatuses) is not exposed in this tenant, so installs come from Intune's discovered-apps
// inventory (deviceManagement/detectedApps — real installed versions and device counts), matched to the Self
// Service catalog by display name. Names that match no discovered install are omitted rather than shown with 0.
// Windows only — Intune currently has no enrolled Macs. Built in the background because the catalog read alone
// takes a couple of minutes.

interface GraphAppAssignment { intent: string }
interface GraphMobileApp {
  id: string; displayName: string; displayVersion?: string; '@odata.type': string; assignments?: GraphAppAssignment[]
  primaryBundleId?: string; bundleId?: string
}
interface GraphFleetDetectedApp { id: string; displayName: string; version?: string; deviceCount?: number; platform?: string }
interface GraphDetectedAppHost { id: string; deviceName?: string; lastSyncDateTime?: string }

const MAC_APP_TYPE = /^#microsoft\.graph\.macOS/i
const WINDOWS_APP_TYPE = /^#microsoft\.graph\.(win32|windows|officeSuiteApp|microsoftStoreForBusinessApp|winGet)/i
const SELF_SERVICE_INTENTS = new Set(['available', 'availableWithoutEnrollment'])
const GRAPH_CONCURRENCY = 6
const SELF_SERVICE_TTL_MS = 6 * 60 * 60 * 1000

export interface IntuneSelfServiceResult {
  windows: MEAppEntry[]
  /** Distinct Windows app names published with an available Company Portal assignment. */
  catalogWindowsApps: number
  progress: { status: 'idle' | 'running'; startedAt: string | null; finishedAt: string | null; error: string | null }
}

const normalizeName = (n: string) => n.trim().toLowerCase().replace(/\s+/g, ' ')

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]!) }
  }))
  return out
}

// Managed macOS deployments seen in the Intune catalog. Filled by the Self Service build below.
let macDeployments = new DeploymentIndex()

/**
 * Index of Intune-managed macOS app deployments for Mac classification. Starts the (background) catalog read once if it
 * has never run, so Mac inventory picks the data up as soon as it lands; returns an empty index until then.
 */
export function getMacDeploymentIndex(): DeploymentIndex {
  if (getIntuneConfig() && !selfService.progress.finishedAt && !selfServiceRunning) getIntuneSelfServiceWindowsApps()
  return macDeployments
}

let selfService: IntuneSelfServiceResult = { windows: [], catalogWindowsApps: 0, progress: { status: 'idle', startedAt: null, finishedAt: null, error: null } }
let selfServiceRunning = false

async function buildSelfServiceApps(config: RuntimeIntuneConfig): Promise<Pick<IntuneSelfServiceResult, 'windows' | 'catalogWindowsApps'>> {
  const token = await getAccessToken(config)
  const graph = 'https://graph.microsoft.com/v1.0'

  const catalog = await graphGetAll<GraphMobileApp>(token, `${graph}/deviceAppManagement/mobileApps?$expand=assignments&$top=50`)
  const published = new Map<string, string>() // normalized name -> highest published version
  const macIndex = new DeploymentIndex()
  for (const app of catalog) {
    // Every macOS app with an assignment is a managed deployment; used to classify Mac inventory (never hide a managed app).
    if (MAC_APP_TYPE.test(app['@odata.type']) && app.assignments?.length) {
      const intents = app.assignments.map(a => a.intent)
      const kind = intents.some(i => SELF_SERVICE_INTENTS.has(i)) ? 'Company Portal (available)' : 'Required/uninstall deployment'
      const bundleId = app.primaryBundleId || app.bundleId
      macIndex.add({ source: 'intune', kind }, { ...(bundleId ? { bundleId } : {}), name: app.displayName })
    }
    if (!WINDOWS_APP_TYPE.test(app['@odata.type'])) continue
    if (!app.assignments?.some(a => SELF_SERVICE_INTENTS.has(a.intent))) continue
    const key = normalizeName(app.displayName)
    const version = app.displayVersion?.trim() || ''
    const prev = published.get(key)
    if (prev === undefined || (version && compareVersions(version, prev) > 0)) published.set(key, version)
  }

  macDeployments = macIndex

  const detected = (await graphGetAll<GraphFleetDetectedApp>(token, `${graph}/deviceManagement/detectedApps?$top=999`))
    .filter(d => d.platform?.toLowerCase() === 'windows' && (d.deviceCount ?? 0) > 0 && published.has(normalizeName(d.displayName)))

  const rowsByName = new Map<string, GraphFleetDetectedApp[]>()
  for (const d of detected) {
    const key = normalizeName(d.displayName)
    rowsByName.set(key, [...(rowsByName.get(key) ?? []), d])
  }

  const entries: MEAppEntry[] = []
  detectedRowIds.clear()
  for (const [key, rows] of rowsByName) {
    const installedVersions = [...new Set(rows.map(r => r.version?.trim() || 'Unknown'))]
    const versionCounts = new Map<string, number>()
    for (const row of rows) {
      const version = row.version?.trim() || 'Unknown'
      versionCounts.set(version, (versionCounts.get(version) ?? 0) + (row.deviceCount ?? 0))
    }
    const publishedVersion = published.get(key) ?? ''
    const newestInstalled = pickLatestVersion(installedVersions)
    const latestVersion = publishedVersion && compareVersions(publishedVersion, newestInstalled) > 0 ? publishedVersion : newestInstalled
    const behind = (v: string) => v !== 'Unknown' && compareVersions(v, latestVersion) < 0
    detectedRowIds.set(key, { latestVersion, rows: rows.map(r => ({ id: r.id, version: r.version?.trim() || 'Unknown' })) })
    entries.push({
      appId: key, name: rows[0]!.displayName, platform: 'Windows', installedVersions, latestVersion,
      deviceCount: rows.reduce((n, r) => n + (r.deviceCount ?? 0), 0),
      versionCounts: Array.from(versionCounts, ([version, deviceCount]) => ({ version, deviceCount })),
      updateStatus: installedVersions.includes('Unknown') ? 'Unknown' : installedVersions.some(behind) ? 'Update Available' : 'Up to date',
      logs: [], // per-device list is loaded on demand — see getIntuneSelfServiceAppDevices
    })
  }
  return { windows: entries.sort((a, b) => b.deviceCount - a.deviceCount), catalogWindowsApps: published.size }
}

// Discovered-app ids behind each Self Service entry, kept so the per-device list can be fetched when a row is opened.
const detectedRowIds = new Map<string, { latestVersion: string; rows: Array<{ id: string; version: string }> }>()

export async function getIntuneSelfServiceAppDevices(appId: string, cfg?: RuntimeIntuneConfig): Promise<MEAppLogEntry[]> {
  const config = cfg ?? getIntuneConfig()
  if (!config) throw new Error('Intune credentials not configured')
  const known = detectedRowIds.get(appId)
  if (!known) return []
  const token = await getAccessToken(config)
  const perVersion = await mapLimit(known.rows, 2, async row => {
    const devices = await graphGetAll<GraphDetectedAppHost>(token, `https://graph.microsoft.com/v1.0/deviceManagement/detectedApps/${row.id}/managedDevices?$top=999`)
    return devices.map(dev => ({ version: row.version, dev }))
  })
  return perVersion.flat().map(({ version, dev }) => ({
    deviceId: dev.id, deviceName: dev.deviceName ?? 'Unknown', version,
    status: version === 'Unknown' ? 'Unknown' : compareVersions(version, known.latestVersion) < 0 ? 'Update Available' : 'Installed',
    lastSeen: dev.lastSyncDateTime ? new Date(dev.lastSyncDateTime).toLocaleString('en-US') : 'Unknown',
    errorDetails: null,
  }))
}

/** Returns the latest snapshot immediately; (re)builds in the background when missing, stale, or `force` is set. */
export function getIntuneSelfServiceWindowsApps(cfg?: RuntimeIntuneConfig, force = false): IntuneSelfServiceResult {
  const config = cfg ?? getIntuneConfig()
  if (!config) throw new Error('Intune credentials not configured')
  const { finishedAt } = selfService.progress
  const stale = !finishedAt || Date.now() - Date.parse(finishedAt) > SELF_SERVICE_TTL_MS
  if (!selfServiceRunning && (force || stale)) {
    selfServiceRunning = true
    selfService = { ...selfService, progress: { status: 'running', startedAt: new Date().toISOString(), finishedAt: selfService.progress.finishedAt, error: null } }
    buildSelfServiceApps(config)
      .then(({ windows, catalogWindowsApps }) => {
        selfService = { windows, catalogWindowsApps, progress: { status: 'idle', startedAt: selfService.progress.startedAt, finishedAt: new Date().toISOString(), error: null } }
        console.log(`[Intune] ✓ ${windows.length} of ${catalogWindowsApps} Windows Self Service app(s) have discovered installs`)
      })
      .catch(e => {
        const error = e instanceof Error ? e.message.slice(0, 300) : 'Self Service app build failed'
        console.error('[Intune] Self Service app build failed:', error)
        selfService = { ...selfService, progress: { status: 'idle', startedAt: selfService.progress.startedAt, finishedAt: new Date().toISOString(), error } }
      })
      .finally(() => { selfServiceRunning = false })
  }
  return selfService
}

// ── Device activity log + diagnostics collection ──────────────────────────────

export interface IntuneActivityEntry { time: string; category: 'Action' | 'Remote action'; event: string; status: string; detail: string }

/** Actions performed on a device (sync, restart, wipe, …) from the managed device record and Intune's remote-action audit. */
export async function getIntuneDeviceActivity(deviceId: string, deviceName: string, cfg?: RuntimeIntuneConfig): Promise<IntuneActivityEntry[]> {
  const config = cfg ?? getIntuneConfig()
  if (!config) throw new Error('Intune credentials not configured')
  const headers = { Authorization: `Bearer ${await getAccessToken(config)}` }
  const out: IntuneActivityEntry[] = []
  const errors: string[] = []

  const detail = await fetch(`https://graph.microsoft.com/v1.0/deviceManagement/managedDevices/${encodeURIComponent(deviceId)}?$select=deviceActionResults,lastSyncDateTime`, { headers })
  if (detail.ok) {
    const j = await detail.json() as { deviceActionResults?: Array<{ actionName?: string; actionState?: string; startDateTime?: string; lastUpdatedDateTime?: string }> }
    for (const a of j.deviceActionResults ?? []) out.push({ time: a.startDateTime ?? a.lastUpdatedDateTime ?? '', category: 'Action', event: a.actionName ?? 'Device action', status: a.actionState ?? '', detail: a.lastUpdatedDateTime ? `Last updated ${a.lastUpdatedDateTime}` : '' })
  } else errors.push(`device record ${detail.status}`)

  // remoteActionAudits is a beta-only collection. Filter server-side by device id; if Graph refuses the filter,
  // read the most recent audits and match locally by id or display name.
  const base = 'https://graph.microsoft.com/beta/deviceManagement/remoteActionAudits'
  type AuditRow = { action?: string; actionState?: string; requestDateTime?: string; initiatedByUserPrincipalName?: string; deviceDisplayName?: string; managedDeviceId?: string }
  let audit = await fetch(`${base}?$filter=${encodeURIComponent(`managedDeviceId eq '${deviceId.replace(/'/g, "''")}'`)}&$top=100`, { headers })
  let local = false
  if (audit.status === 400) { audit = await fetch(`${base}?$top=500`, { headers }); local = true }
  if (audit.ok) {
    const j = await audit.json() as { value?: AuditRow[] }
    const rows = (j.value ?? []).filter(a => !local || a.managedDeviceId === deviceId || a.deviceDisplayName === deviceName)
    for (const a of rows) out.push({ time: a.requestDateTime ?? '', category: 'Remote action', event: a.action ?? 'Remote action', status: a.actionState ?? '', detail: a.initiatedByUserPrincipalName ? `Requested by ${a.initiatedByUserPrincipalName}` : '' })
  } else errors.push(`remote action audit ${audit.status}`)

  if (!out.length && errors.length === 2) throw new Error(`Microsoft Graph refused both action-history requests (${errors.join(', ')}); the app registration may lack DeviceManagementManagedDevices.Read.All.`)
  return out
}

export interface IntuneDiagnosticsStatus { requestId: string; status: string; requestedAt: string; expiresAt: string; downloadUrl?: string }

const diagFromGraph = (j: { id?: string; status?: string; requestedDateTime?: string; expirationDateTime?: string }): IntuneDiagnosticsStatus => ({
  requestId: j.id ?? '', status: j.status ?? 'unknown', requestedAt: j.requestedDateTime ?? '', expiresAt: j.expirationDateTime ?? '',
})

const diagError = async (res: Response, what: string): Promise<Error> => {
  const body = await res.text().catch(() => '')
  const hint = res.status === 403 ? ' The app registration needs the DeviceManagementManagedDevices.PrivilegedOperations.All Graph application permission (admin consent).' : ''
  return new Error(`${what} failed (${res.status}).${hint} ${body.slice(0, 160)}`.trim())
}

/** Asks Intune to collect diagnostics from a Windows device (beta API; the device must be online). */
export async function requestIntuneDiagnostics(deviceId: string, cfg?: RuntimeIntuneConfig): Promise<IntuneDiagnosticsStatus> {
  const config = cfg ?? getIntuneConfig()
  if (!config) throw new Error('Intune credentials not configured')
  const res = await fetch(`https://graph.microsoft.com/beta/deviceManagement/managedDevices/${encodeURIComponent(deviceId)}/createDeviceLogCollectionRequest`, {
    method: 'POST', headers: { Authorization: `Bearer ${await getAccessToken(config)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ templateType: { '@odata.type': '#microsoft.graph.deviceLogCollectionRequest', templateType: 'predefined' } }),
  })
  if (!res.ok) throw await diagError(res, 'Diagnostics request')
  return diagFromGraph(await res.json() as Parameters<typeof diagFromGraph>[0])
}

export async function getIntuneDiagnosticsStatus(deviceId: string, requestId: string, cfg?: RuntimeIntuneConfig): Promise<IntuneDiagnosticsStatus> {
  const config = cfg ?? getIntuneConfig()
  if (!config) throw new Error('Intune credentials not configured')
  const headers = { Authorization: `Bearer ${await getAccessToken(config)}` }
  const base = `https://graph.microsoft.com/beta/deviceManagement/managedDevices/${encodeURIComponent(deviceId)}/logCollectionRequests/${encodeURIComponent(requestId)}`
  const res = await fetch(base, { headers })
  if (!res.ok) throw await diagError(res, 'Diagnostics status')
  const status = diagFromGraph(await res.json() as Parameters<typeof diagFromGraph>[0])
  if (status.status.toLowerCase() === 'completed') {
    const dl = await fetch(`${base}/createDownloadUrl`, { method: 'POST', headers })
    if (dl.ok) { const j = await dl.json() as { value?: string }; if (j.value) status.downloadUrl = j.value }
  }
  return status
}
