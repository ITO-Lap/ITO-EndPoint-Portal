import { getManageEngineConfig } from '../store/integrationStore.js'
import { zohoFetch } from './manageEngine.js'
import type { Device } from '../types.js'

// Agent-managed Windows endpoints live in Endpoint Central (GET /api/1.4/patch/allsystems), not in the MDM
// On-Demand API that backs getManageEngineDevices (which only returns MDM-enrolled iOS/macOS devices).
// This module lists them as light Device rows: one paged list call, no per-device detail calls, so ~3,300
// devices cost a handful of requests. Macs are skipped on purpose — they already come from MDM.

const DEFAULT_HOST = 'https://endpointcentral.manageengine.com'
const PAGE_LIMIT = 1000
const MAX_PAGES = 20
const CACHE_TTL_MS = 5 * 60 * 1000

/** Id prefix that keeps Endpoint Central rows from colliding with MDM ids and lets routes tell them apart. */
export const EC_ID_PREFIX = 'ec-'
export const isEndpointCentralDeviceId = (id: string): boolean => id.startsWith(EC_ID_PREFIX)

interface RawEcSystem {
  resource_id?: number | string
  /** Exact id. `resource_id` is a >2^53 JSON number, so JSON.parse rounds it and distinct devices collide. */
  resource_id_string?: string
  resource_name?: string
  fqdn_name?: string
  'managedcomputer.friendly_name'?: string
  os_platform_name?: string
  os_name?: string
  service_pack?: string
  owner_email_id?: string
  agent_logged_on_users?: string
  owner?: string
  ip_address?: string
  mac_address?: string
  location?: string
  branch_office_name?: string
  computer_live_status?: number
  agent_last_contact_time?: number
  last_scan_time?: number
  critical_patch_count?: number | string
  important_patch_count?: number | string
  missing_ms_patches?: number | string
  resourcetorebootdetails_reboot_req_status?: boolean
}

const blank = (v: string | undefined): string | undefined => (v && v !== '--' && v.trim() ? v.trim() : undefined)
const num = (v: number | string | undefined): number => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0 }

export function mapEcSystem(s: RawEcSystem): Device | null {
  if (s.os_platform_name !== 'Windows') return null
  const resourceId = s.resource_id_string && s.resource_id_string !== '--' ? s.resource_id_string : String(s.resource_id ?? '')
  if (!resourceId) return null

  const name = blank(s['managedcomputer.friendly_name']) ?? blank(s.resource_name) ?? blank(s.fqdn_name) ?? 'Unknown Device'
  const user = blank(s.owner_email_id) ?? blank(s.agent_logged_on_users) ?? blank(s.owner) ?? 'Unknown'
  const checkInMs = s.agent_last_contact_time && s.agent_last_contact_time > 0 ? s.agent_last_contact_time : s.last_scan_time
  const lastCheckIn = checkInMs && checkInMs > 0 ? new Date(checkInMs).toLocaleString('en-US') : 'Unknown'

  const critical = num(s.critical_patch_count)
  const important = num(s.important_patch_count)
  const missing = num(s.missing_ms_patches)
  const primaryIssue =
    critical > 0 ? `${critical} critical OS patch${critical > 1 ? 'es' : ''} missing`
    : important > 0 ? `${important} important OS patch${important > 1 ? 'es' : ''} missing`
    : 'None'
  const complianceState: Device['complianceState'] = critical > 0 ? 'Non-Compliant' : important > 0 || missing > 0 ? 'Warning' : 'Compliant'

  const osName = blank(s.os_name)
  const build = blank(s.service_pack)
  const location = blank(s.location) ?? blank(s.branch_office_name)

  return {
    id: `${EC_ID_PREFIX}${resourceId}`,
    deviceName: name,
    user,
    // allsystems carries no serial number; matching to other sources is done by device name instead.
    serialNumber: 'Unknown',
    platform: 'Windows',
    osVersion: osName ?? 'Windows',
    managementSource: 'ManageEngine',
    lastCheckIn,
    complianceState,
    encryptionStatus: 'Unknown',
    primaryIssue,
    policyFailed: primaryIssue === 'None' ? 'None' : 'Patch compliance',
    severity: critical > 0 ? 'High' : primaryIssue === 'None' ? 'Low' : 'Medium',
    confidence: '70%',
    firstDetected: 'N/A',
    lastDetected: lastCheckIn,
    issueSource: 'Endpoint Central',
    ownership: 'Corporate',
    ...(blank(s.ip_address) ? { ipAddress: blank(s.ip_address)! } : {}),
    ...(blank(s.mac_address) ? { macAddress: blank(s.mac_address)! } : {}),
    ...(build ? { osBuildNumber: build } : {}),
    ...(location ? { department: location } : {}),
  }
}

let cache: { devices: Device[]; expiresAt: number } | null = null
let inFlight: Promise<Device[]> | null = null

async function fetchPage(url: string): Promise<{ batch: RawEcSystem[]; total: number }> {
  const cfg = getManageEngineConfig()
  if (!cfg) throw new Error('ManageEngine is not configured')
  let lastErr: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await zohoFetch(cfg, url)
      if (!res.ok) throw new Error(`Endpoint Central API ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
      const json = await res.json() as { message_response?: { allsystems?: RawEcSystem[]; total?: number } }
      return { batch: json.message_response?.allsystems ?? [], total: Number(json.message_response?.total ?? 0) }
    } catch (e) {
      lastErr = e
      await new Promise(r => setTimeout(r, 750 * (attempt + 1)))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Endpoint Central request failed')
}

async function loadAll(): Promise<Device[]> {
  const host = (process.env['ENDPOINT_CENTRAL_BASE_URL'] ?? process.env['ENDPOINT_CENTRAL_PATCH_URL'] ?? DEFAULT_HOST).replace(/\/$/, '')
  const raw: RawEcSystem[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { batch, total } = await fetchPage(`${host}/api/1.4/patch/allsystems?pagelimit=${PAGE_LIMIT}&page=${page}`)
    raw.push(...batch)
    if (batch.length < PAGE_LIMIT || (total > 0 && raw.length >= total)) break
  }
  const seen = new Set<string>()
  const devices: Device[] = []
  for (const s of raw) {
    const d = mapEcSystem(s)
    if (d && !seen.has(d.id)) { seen.add(d.id); devices.push(d) }
  }
  return devices
}

/**
 * Windows devices from Endpoint Central. Never throws once a good list exists: a failed refresh serves the
 * last good in-memory list instead (a partial/failed paging run is discarded rather than cached, so an outage
 * can't shrink the fleet). Concurrent callers share one in-flight request.
 */
export async function getEndpointCentralDevices(force = false): Promise<Device[]> {
  if (!force && cache && Date.now() < cache.expiresAt) return cache.devices
  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      const devices = await loadAll()
      cache = { devices, expiresAt: Date.now() + CACHE_TTL_MS }
      return devices
    } catch (e) {
      if (cache) {
        console.warn('[endpointCentralDevices] refresh failed, serving last good list:', e instanceof Error ? e.message : e)
        cache = { ...cache, expiresAt: Date.now() + 60_000 }
        return cache.devices
      }
      throw e
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}
