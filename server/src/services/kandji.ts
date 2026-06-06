import type { Device, AppStatus } from '../types.js'
import type { RuntimeKandjiConfig } from '../store/integrationStore.js'
import { getKandjiConfig } from '../store/integrationStore.js'

// ─ In-memory cache (avoids re-fetching 300 detail calls on every page load) ──

interface DeviceCache { devices: Device[]; fetchedAt: number }
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
let deviceCache: DeviceCache | null = null
// Shared in-flight promise — prevents duplicate full fetches on cold-start race
let fetchInFlight: Promise<Device[]> | null = null

export function invalidateKandjiCache(): void { deviceCache = null }

// Per-device apps cache (lazy — fetched on demand, not during bulk sync)
const APPS_TTL_MS = 10 * 60 * 1000 // 10 minutes
const appsCache = new Map<string, { apps: AppStatus[]; fetchedAt: number }>()

// ─ API shape: device list ────────────────────────────────────────────────────

interface KandjiDevice {
  device_id: string
  device_name: string
  serial_number: string
  platform: string
  os_version: string
  last_check_in: string
  filevault_enabled?: boolean   // not present in list response; set by details
  mdm_enabled: boolean
  agent_installed?: boolean
  is_missing?: boolean
  model?: string
  chip?: string
  blueprint_name?: string
  blueprints?: Array<{ id: string; name: string }>
  // list response returns "user"; details returns "assigned_user"
  user?: { id?: string; email?: string; name?: string; is_archived?: boolean; active?: boolean }
  assigned_user?: { id?: string; email?: string; name?: string; is_archived?: boolean }
  asset_tag?: string
  notes?: string
  first_enrollment?: string
  supplemental_build_version?: string
}

interface KandjiListResponse {
  count?: number
  next?: string | null
  previous?: string | null
  results?: KandjiDevice[]
}

// ─ API shape: device details ─────────────────────────────────────────────────

interface KandjiDetails {
  general?: {
    device_id?: string
    device_name?: string
    model?: string          // full model name e.g. "MacBook Pro (16-inch, 2019)"
    platform?: string
    serial_number?: string
    asset_tag?: string
    first_enrollment?: string
    last_enrollment?: string
    blueprint_name?: string
    department?: string
    supplemental_build_version?: string   // OS build number e.g. "24G90"
    os_version?: string
    system_version?: string
    assigned_user?: { email?: string; name?: string; id?: string; is_archived?: boolean }
    assigned_user_email?: string
  }
  hardware_overview?: {
    model_name?: string       // short name e.g. "MacBook Pro"
    model_identifier?: string
    processor_name?: string
    processor_speed?: string
    memory?: string           // e.g. "64 GB 2667MHz DDR4"
    serial_number?: string
  }
  // disk info lives under volumes[], not hardware_overview.storage
  volumes?: Array<{
    name?: string
    format?: string
    capacity?: string     // e.g. "931.55 GB"
    available?: string    // e.g. "625.08 GB"
    percent_used?: string
    encrypted?: string
  }>
  network?: {
    ip_address?: string
    mac_address?: string
    local_hostname?: string
    public_ip?: string
  }
  filevault?: {
    filevault_enabled?: boolean
    filevault_recoverykey_type?: string
    filevault_prk_escrowed?: boolean
  }
  mdm?: {
    mdm_enabled?: string    // "True" | "False" string
    supervised?: string
    install_date?: string
    enrollment_type?: string
  }
  installed_profiles?: Array<{
    name?: string
    uuid?: string
    identifier?: string
    verified?: string
  }>
  users?: {
    regular_users?: Array<{
      username?: string
      uid?: string
      path?: string
      admin?: string    // "Yes" | "No"
      name?: string
    }>
  }
}


// ─ Helpers ───────────────────────────────────────────────────────────────────

function baseUrl(cfg: RuntimeKandjiConfig): string {
  return `https://${cfg.subdomain}.api.kandji.io`
}

function authHeaders(cfg: RuntimeKandjiConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${cfg.apiToken}`,
    'Content-Type': 'application/json',
  }
}

// Concurrency-limited parallel runner
async function pLimit<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let idx = 0
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++
      const task = tasks[i]
      if (task) results[i] = await task()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  return results
}

// Shared rate-limit gate: when any worker hits 429, all workers wait together
let rateLimitUntil = 0

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 6,
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Honour shared cooldown before issuing any request
    const gateWait = rateLimitUntil - Date.now()
    if (gateWait > 0) await new Promise(r => setTimeout(r, gateWait))

    const res = await fetch(url, options)
    if (res.status !== 429) return res

    // 429 → update shared gate so all concurrent workers back off together
    const retryAfter = res.headers.get('Retry-After')
    const backoffMs = retryAfter
      ? parseInt(retryAfter, 10) * 1000
      : Math.min(2_000 * 2 ** attempt, 60_000)   // 2s, 4s, 8s … cap 60s

    rateLimitUntil = Math.max(rateLimitUntil, Date.now() + backoffMs)
    console.warn(`[kandji] 429 rate-limited — backing off ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`)

    if (attempt === maxRetries) throw new Error('Kandji API: rate limit persists after max retries')
  }
  throw new Error('Kandji API: max retries exceeded')
}

// ─ Fetch all devices (handles both paginated and plain-array responses) ───────

async function fetchDeviceList(cfg: RuntimeKandjiConfig): Promise<KandjiDevice[]> {
  const headers = authHeaders(cfg)
  const all: KandjiDevice[] = []
  const PAGE = 300
  let url: string | null = `${baseUrl(cfg)}/api/v1/devices?limit=${PAGE}`

  while (url) {
    const res = await fetchWithRetry(url, { headers })
    if (!res.ok) throw new Error(`Kandji API error: ${res.status} ${res.statusText}`)
    const body = await res.json() as KandjiListResponse | KandjiDevice[]

    if (Array.isArray(body)) {
      all.push(...body)
      // Plain-array response: if we got a full page there may be more (offset pagination)
      url = body.length === PAGE
        ? `${baseUrl(cfg)}/api/v1/devices?limit=${PAGE}&offset=${all.length}`
        : null
    } else {
      all.push(...(body.results ?? []))
      url = body.next ?? null
    }
  }

  return all
}

// ─ Fetch single device details (graceful fail) ────────────────────────────────

async function fetchDetails(cfg: RuntimeKandjiConfig, deviceId: string): Promise<KandjiDetails | null> {
  try {
    const res = await fetchWithRetry(
      `${baseUrl(cfg)}/api/v1/devices/${deviceId}/details`,
      { headers: authHeaders(cfg) },
    )
    if (!res.ok) return null
    return await res.json() as KandjiDetails
  } catch {
    return null
  }
}


// ─ Map to Device type ────────────────────────────────────────────────────────

function mapDevice(d: KandjiDevice, details: KandjiDetails | null): Device {
  const g   = details?.general
  const hw  = details?.hardware_overview
  const net = details?.network
  const fv  = details?.filevault

  const filevaultOn = fv?.filevault_enabled ?? d.filevault_enabled ?? false
  const compliance: Device['complianceState'] = filevaultOn ? 'Compliant' : 'Warning'

  // Hardware — g.model has the full name ("MacBook Pro (16-inch, 2019)"); hw.model_name is short
  const model      = g?.model ?? d.model ?? hw?.model_name
  const processor  = hw?.processor_name ?? d.chip
  const totalMemory = hw?.memory

  // Storage lives under top-level volumes[], not hardware_overview.storage
  let totalStorage: string | undefined
  let freeStorage: string | undefined
  const volumes = details?.volumes
  if (volumes && volumes.length > 0) {
    totalStorage = volumes[0]?.capacity
    freeStorage  = volumes[0]?.available
  }

  // Network — actual fields are ip_address and mac_address
  const ipAddress  = net?.ip_address
  const macAddress = net?.mac_address

  // Security — no direct firewall/SIP/gatekeeper sections; derive from installed_profiles
  const profiles = details?.installed_profiles ?? []
  const hasFirewall   = profiles.some(p => p.name?.toLowerCase().includes('firewall'))
  const hasCrowdStrike = profiles.some(p => p.name?.toLowerCase().includes('crowdstrike'))
  const firewallStatus  = hasFirewall    ? 'Enabled' : undefined
  const antivirusStatus = hasCrowdStrike ? 'CrowdStrike' : undefined

  // Enrollment
  const firstEnrollment = g?.first_enrollment ?? d.first_enrollment ?? undefined
  const enrollmentDate  = firstEnrollment
    ? new Date(firstEnrollment).toLocaleDateString()
    : undefined
  const enrollmentType = details?.mdm?.enrollment_type ?? 'MDM Enrolled'

  // Blueprints → applied policies
  const blueprints: string[] = d.blueprints?.map(b => b.name)
    ?? (d.blueprint_name ? [d.blueprint_name] : (g?.blueprint_name ? [g.blueprint_name] : []))

  // User — list response has "user"; details general has "assigned_user" (object)
  const detailsUser = g?.assigned_user
  const detailsEmail = detailsUser?.email ?? detailsUser?.name ?? g?.assigned_user_email
  const user = d.user?.email
    ?? d.user?.name
    ?? d.assigned_user?.email
    ?? d.assigned_user?.name
    ?? detailsEmail
    ?? 'Unassigned'

  // OS build number is at general.supplemental_build_version
  const osBuildNumber = g?.supplemental_build_version ?? d.supplemental_build_version

  const department = g?.department

  return {
    id:               d.device_id,
    deviceName:       d.device_name,
    user,
    serialNumber:     d.serial_number,
    platform:         'macOS',
    osVersion:        g?.os_version ?? d.os_version,
    managementSource: 'Kandji',
    lastCheckIn:      new Date(d.last_check_in).toLocaleString(),
    complianceState:  compliance,
    encryptionStatus: filevaultOn ? 'FileVault On' : 'FileVault Off',
    primaryIssue:     filevaultOn ? 'None' : 'FileVault encryption not enabled',
    policyFailed:     filevaultOn ? 'None' : 'Security — FileVault Policy',
    severity:         compliance === 'Warning' ? 'Medium' : 'Low',
    confidence:       '80%',
    firstDetected:    'N/A',
    lastDetected:     new Date(d.last_check_in).toLocaleString(),
    issueSource:      'Kandji',

    // Hardware
    manufacturer: 'Apple',
    ...(model        ? { model }        : {}),
    ...(processor    ? { processor }    : {}),
    ...(totalMemory  ? { totalMemory }  : {}),
    ...(totalStorage ? { totalStorage } : {}),
    ...(freeStorage  ? { freeStorage }  : {}),

    // Network
    ...(ipAddress  ? { ipAddress }  : {}),
    ...(macAddress ? { macAddress } : {}),

    // Enrollment & Identity
    ...(enrollmentDate ? { enrollmentDate } : {}),
    enrollmentType,
    ownership: 'Corporate',
    isAadRegistered: false,
    ...(department ? { department } : {}),

    // OS
    ...(osBuildNumber ? { osBuildNumber } : {}),

    // Security (derived from installed profiles)
    ...(firewallStatus   ? { firewallStatus }   : {}),
    ...(antivirusStatus  ? { antivirusStatus }  : {}),

    // Compliance
    lastComplianceCheck: new Date(d.last_check_in).toLocaleString(),
    appliedPolicies: blueprints,

    laps: {
      enabled: false,
      source:  'Not Configured',
    },
  }
}

// ─ Public API ────────────────────────────────────────────────────────────────

export async function getKandjiDevices(
  cfg?: RuntimeKandjiConfig,
  forceRefresh = false,
): Promise<Device[]> {
  const config = cfg ?? getKandjiConfig()
  if (!config) throw new Error('Kandji credentials not configured')

  // Return fresh cache immediately (avoids 300 detail calls per page load)
  if (!forceRefresh && deviceCache && Date.now() - deviceCache.fetchedAt < CACHE_TTL_MS) {
    return deviceCache.devices
  }

  // If a full fetch is already in progress (e.g. stats + activity both fired on cold start),
  // join the existing promise instead of starting a second parallel sync.
  if (!forceRefresh && fetchInFlight) {
    return fetchInFlight
  }

  // If the API is currently rate-limited, serve stale cache rather than blocking.
  // Only a forceRefresh (sync endpoint) should wait through the backoff.
  if (!forceRefresh && rateLimitUntil > Date.now()) {
    if (deviceCache) {
      console.warn('[kandji] Rate limited — serving stale cache to page load')
      return deviceCache.devices
    }
    throw new Error('Kandji API is temporarily rate limited — sync in progress')
  }

  fetchInFlight = (async () => {
    try {
      const devices = await fetchDeviceList(config)
      if (devices.length === 0) return []

      // Fetch details with concurrency limit (gate backoff shared across workers)
      const detailTasks = devices.map(d => () => fetchDetails(config, d.device_id))
      const details = await pLimit(detailTasks, 3)

      const result = devices.map((d, i) => mapDevice(d, details[i] ?? null))
      deviceCache = { devices: result, fetchedAt: Date.now() }
      return result
    } finally {
      fetchInFlight = null
    }
  })()

  return fetchInFlight
}

export function isKandjiConfigured(): boolean {
  return !!getKandjiConfig()
}

/** Read cached devices without triggering a fetch. Returns null if no cache. */
export function getCachedKandjiDevices(): Device[] | null {
  return deviceCache?.devices ?? null
}

// ─ Kandji Library Items ───────────────────────────────────────────────────────

export interface LibraryApp {
  id: string
  name: string
  category: string
  active: boolean
  enforcement: string
  blueprint?: string   // first blueprint name this item is assigned to
  groupId?: string     // blueprint ID (Kandji uses blueprints as assignment groups)
}

// IRU / Kandji Library Item endpoints — all known path variants tested against
// the actual tenant API. Paths that return 404 are silently skipped.
//
// CONFIRMED WORKING  (tested against zinnia.api.kandji.io):
//   /api/v1/library/custom-apps      ← Custom Apps (pkg, dmg, etc.)
//   /api/v1/library/custom-scripts   ← Custom Scripts (bash, zsh, python)
//   /api/v1/library/custom-profiles  ← MDM Config Profiles (mobileconfig)
//   /api/v1/library/ipa-apps         ← In-House IPA apps
//
// REQUIRE ADDITIONAL API TOKEN PERMISSIONS (return 404 if not scoped):
//   /api/v1/library/auto-apps        ← Managed auto-updating apps (VPP)
//   /api/v1/library/vpp-apps         ← Apple Business Manager VPP apps
//   /api/v1/library/web-apps         ← Web clips / web apps
//   /api/v1/library/custom-printers  ← Printer configurations
//
// To access the locked types, update the API token in Kandji/IRU Settings
// → Access → API Token → enable read access for Auto Apps and VPP Apps.

const LIBRARY_TYPES = [
  { path: '/api/v1/library/auto-apps',       category: 'Auto App',   requiredScope: 'auto-apps'    },
  { path: '/api/v1/library/custom-apps',     category: 'Custom App', requiredScope: 'custom-apps'  },
  { path: '/api/v1/library/vpp-apps',        category: 'VPP App',    requiredScope: 'vpp-apps'     },
  { path: '/api/v1/library/custom-scripts',  category: 'Script',     requiredScope: 'scripts'      },
  { path: '/api/v1/library/custom-profiles', category: 'Profile',    requiredScope: 'profiles'     },
  { path: '/api/v1/library/web-apps',        category: 'Web App',    requiredScope: 'web-apps'     },
  { path: '/api/v1/library/custom-printers', category: 'Printer',    requiredScope: 'printers'     },
  { path: '/api/v1/library/ipa-apps',        category: 'IPA App',    requiredScope: 'ipa-apps'     },
] as const

interface KandjiLibraryItem {
  id?: string
  name?: string
  app_name?: string            // fallback name field used by some types
  active?: boolean
  install_enforcement?: string // custom-apps / vpp-apps
  execution_frequency?: string // custom-scripts
  blueprints?: string[]        // array of blueprint IDs this item is assigned to
}

interface KandjiBlueprint {
  id: string
  name: string
}

interface KandjiBlueprintResponse {
  count?: number
  next?: string | null
  results?: KandjiBlueprint[]
}

// Kandji library endpoints return either a plain array OR paginated
// { count, next, previous, results: [...] } — handle both.
interface KandjiPagedResponse {
  count?: number
  next?: string | null
  results?: KandjiLibraryItem[]
}

function enforcementLabel(e: string): string {
  switch (e) {
    case 'continuously_enforce': return 'Continuous'
    case 'install_once':         return 'Install Once'
    case 'no_enforcement':       return 'No Enforcement'
    case 'once':                 return 'Run Once'
    default:                     return e || 'No Enforcement'
  }
}

// Dedicated fetch for library calls — does NOT share the device-sync rate-limit
// gate so it responds immediately even while a device sync is in progress.
// Follows pagination (next links) to return all items across all pages.
async function fetchLibraryType(
  url: string,
  headers: Record<string, string>,
): Promise<KandjiLibraryItem[]> {
  const all: KandjiLibraryItem[] = []
  let nextUrl: string | null = url

  while (nextUrl) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    try {
      const res = await fetch(nextUrl, { headers, signal: controller.signal })
      if (!res.ok) break
      const body = await res.json() as KandjiLibraryItem[] | KandjiPagedResponse
      if (Array.isArray(body)) {
        all.push(...body)
        break // plain array — no pagination
      }
      const paged = body as KandjiPagedResponse
      if (Array.isArray(paged.results)) all.push(...paged.results)
      nextUrl = paged.next ?? null
    } catch {
      break
    } finally {
      clearTimeout(timeout)
    }
  }

  return all
}

// ── IRU / Kandji Blueprint → Library Items reverse map ───────────────────────
// Uses GET /api/v1/blueprints/{id}/list-library-items (correct endpoint per IRU API docs)
// to build a map of libraryItemId → { blueprintName, blueprintId }.

interface BlueprintItemEntry { id?: string; library_item_id?: string; name?: string }

async function fetchBlueprintItemMap(
  config: RuntimeKandjiConfig,
): Promise<Map<string, { name: string; id: string }>> {
  const base    = baseUrl(config)
  const headers = authHeaders(config)
  // itemId → { blueprintName, blueprintId }
  const itemToBp = new Map<string, { name: string; id: string }>()

  try {
    // Step 1: get all blueprints
    const bpRes = await fetch(`${base}/api/v1/blueprints`, { headers })
    if (!bpRes.ok) return itemToBp
    const bpBody = await bpRes.json() as KandjiBlueprintResponse | KandjiBlueprint[]
    const blueprints: KandjiBlueprint[] = Array.isArray(bpBody)
      ? bpBody
      : (bpBody.results ?? [])

    console.log(`[Kandji] Found ${blueprints.length} blueprints — fetching library item associations`)

    // Step 2: for each blueprint, GET /api/v1/blueprints/{id}/list-library-items
    await Promise.all(blueprints.map(async bp => {
      try {
        const controller = new AbortController()
        const timeout    = setTimeout(() => controller.abort(), 10_000)
        const res = await fetch(`${base}/api/v1/blueprints/${bp.id}/list-library-items`, { headers, signal: controller.signal })
        clearTimeout(timeout)
        if (!res.ok) return
        const body = await res.json() as BlueprintItemEntry[] | { results?: BlueprintItemEntry[] }
        const items: BlueprintItemEntry[] = Array.isArray(body) ? body : (body.results ?? [])
        items.forEach(item => {
          const itemId = item.library_item_id ?? item.id
          if (itemId && !itemToBp.has(itemId)) {
            itemToBp.set(itemId, { name: bp.name, id: bp.id })
          }
        })
      } catch { /* non-critical per blueprint */ }
    }))

    console.log(`[Kandji] Blueprint item map built: ${itemToBp.size} library item associations`)
  } catch (e) {
    console.warn('[Kandji] fetchBlueprintItemMap failed:', (e as Error).message)
  }

  return itemToBp
}

export async function getKandjiLibraryApps(cfg?: RuntimeKandjiConfig): Promise<LibraryApp[]> {
  const config = cfg ?? getKandjiConfig()
  if (!config) throw new Error('Kandji credentials not configured')

  const headers = authHeaders(config)
  const base    = baseUrl(config)

  // Probe every known path. fetchLibraryType returns [] silently on 404/403,
  // so inaccessible endpoints are skipped without failing the whole request.
  const [bpItemMap, ...typeResults] = await Promise.all([
    fetchBlueprintItemMap(config),
    ...LIBRARY_TYPES.map(async ({ path, category }) => {
      const items   = await fetchLibraryType(`${base}${path}`, headers)
      const reached = items.length > 0  // true = endpoint was accessible
      return { path, category, items, reached }
    }),
  ])

  // Log which paths are accessible (helps diagnose token scope issues)
  const accessible = typeResults.filter(r => r.reached)
  const blocked    = typeResults.filter(r => !r.reached)
  console.log(`[Kandji Library] Accessible: [${accessible.map(r => r.category).join(', ')}]`)
  if (blocked.length) {
    console.warn(`[Kandji Library] No data from: [${blocked.map(r => r.category).join(', ')}] — token may lack scope. In Kandji/IRU Settings → API Tokens, ensure read access for all Library types.`)
  }

  const all: LibraryApp[] = []
  for (const { category, items } of typeResults) {
    for (let i = 0; i < items.length; i++) {
      const item    = items[i]!
      const bpEntry = item.id ? bpItemMap.get(item.id) : undefined
      const entry: LibraryApp = {
        id:          item.id ?? `${category}-${i}`,
        name:        item.name ?? item.app_name ?? 'Unknown',
        category,
        active:      item.active ?? false,
        enforcement: enforcementLabel(item.install_enforcement ?? item.execution_frequency ?? ''),
      }
      if (bpEntry) {
        entry.blueprint = bpEntry.name
        entry.groupId   = bpEntry.id
      }
      all.push(entry)
    }
  }

  console.log(`[Kandji Library] Total items returned: ${all.length}`)
  return all.sort((a, b) => a.name.localeCompare(b.name))
}

// ── Library Item detail endpoints (per IRU API docs) ─────────────────────────

export interface LibraryItemStatus {
  device_id: string
  device_name: string
  status: 'pass' | 'fail' | 'pending' | 'error' | 'incompatible' | 'remediated' | string
  status_message?: string
  last_audit_date?: string
}

export interface LibraryItemActivity {
  id: string
  action: string
  actor_type: string
  actor_id?: string
  occurred_at: string
  target_component?: string
  new_state?: Record<string, unknown>
}

export async function getLibraryItemStatuses(
  libraryItemId: string,
  cfg?: RuntimeKandjiConfig,
): Promise<LibraryItemStatus[]> {
  const config = cfg ?? getKandjiConfig()
  if (!config) return []
  try {
    const res = await fetch(
      `${baseUrl(config)}/api/v1/library/library-items/${libraryItemId}/status`,
      { headers: authHeaders(config) },
    )
    if (!res.ok) return []
    const body = await res.json() as { results?: LibraryItemStatus[] } | LibraryItemStatus[]
    return Array.isArray(body) ? body : (body.results ?? [])
  } catch { return [] }
}

// ── Self Service categories ───────────────────────────────────────────────────
// GET /api/v1/self-service/categories
// Returns the flat list of category IDs + names configured in the IRU tenant.
// These IDs are used when assigning library items to the self-service catalogue.

export interface SelfServiceCategory {
  id:   string
  name: string
}

export async function getKandjiSelfServiceCategories(
  cfg?: RuntimeKandjiConfig,
): Promise<SelfServiceCategory[]> {
  const config = cfg ?? getKandjiConfig()
  if (!config) return []
  try {
    const controller = new AbortController()
    const timeout    = setTimeout(() => controller.abort(), 10_000)
    const res = await fetch(
      `${baseUrl(config)}/api/v1/self-service/categories`,
      { headers: authHeaders(config), signal: controller.signal },
    )
    clearTimeout(timeout)
    if (!res.ok) {
      console.warn(`[Kandji] self-service/categories: HTTP ${res.status}`)
      return []
    }
    const body = await res.json() as SelfServiceCategory[] | { results?: SelfServiceCategory[] }
    const list = Array.isArray(body) ? body : (body.results ?? [])
    console.log(`[Kandji] ✓ Self Service categories: ${list.length} categories`)
    return list
  } catch (e) {
    console.warn('[Kandji] self-service/categories failed:', (e as Error).message)
    return []
  }
}

export async function getLibraryItemActivity(
  libraryItemId: string,
  cfg?: RuntimeKandjiConfig,
): Promise<LibraryItemActivity[]> {
  const config = cfg ?? getKandjiConfig()
  if (!config) return []
  try {
    const res = await fetch(
      `${baseUrl(config)}/api/v1/library/library-items/${libraryItemId}/activity?limit=50`,
      { headers: authHeaders(config) },
    )
    if (!res.ok) return []
    const body = await res.json() as { results?: LibraryItemActivity[] } | LibraryItemActivity[]
    return Array.isArray(body) ? body : (body.results ?? [])
  } catch { return [] }
}

// ─ Kandji app shape ───────────────────────────────────────────────────────────

interface KandjiApp {
  app_name?: string
  version?: string
  bundle_id?: string
  app_type?: string   // "App Store" | "System" | "User" etc.
  path?: string
  last_seen?: string
}

// ─ Fetch installed apps for a single device (lazy, cached per device) ────────

export async function getKandjiDeviceApps(
  deviceId: string,
  cfg?: RuntimeKandjiConfig,
): Promise<AppStatus[]> {
  const config = cfg ?? getKandjiConfig()
  if (!config) return []

  const cached = appsCache.get(deviceId)
  if (cached && Date.now() - cached.fetchedAt < APPS_TTL_MS) return cached.apps

  try {
    const res = await fetchWithRetry(
      `${baseUrl(config)}/api/v1/devices/${deviceId}/apps`,
      { headers: authHeaders(config) },
    )
    if (!res.ok) return []

    const body = await res.json()
    // Kandji can return a bare array or an object with an `apps` / `data` key
    const raw: KandjiApp[] = Array.isArray(body) ? body
      : Array.isArray(body?.apps) ? body.apps
      : Array.isArray(body?.data) ? body.data
      : []
    const apps: AppStatus[] = raw.map(a => ({
      name:      a.app_name ?? 'Unknown',
      version:   a.version  ?? '—',
      publisher: a.bundle_id ?? '',
      status:    'Installed' as const,
      ...(a.app_type ? { appType: a.app_type } : {}),
    }))

    appsCache.set(deviceId, { apps, fetchedAt: Date.now() })
    return apps
  } catch {
    return []
  }
}
