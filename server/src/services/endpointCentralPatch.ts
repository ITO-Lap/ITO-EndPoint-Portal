import { getManageEngineConfig } from '../store/integrationStore.js'
import { zohoFetch } from './manageEngine.js'

// Endpoint Central Cloud Patch Manager (verified against the tenant: GET
// /api/1.4/patch/allsystems). Lives on a different host than the MDM On-Demand
// API and needs the DesktopCentralCloud.PatchMgmt.READ scope on the same
// Zoho OAuth client. Only agent-managed endpoints appear here — MDM-only Macs
// have no patch data, so callers must treat a missing row as "not reported".

const DEFAULT_HOST = 'https://endpointcentral.manageengine.com'
const DETAIL_PAGE_LIMIT = 100
const DETAIL_MAX_PAGES = 10
const FLEET_MAX_PAGES = 40
const PAGE_LIMIT = 1000
const MAX_PAGES = 10
const CACHE_TTL_MS = 5 * 60 * 1000

export interface PatchSystemStatus {
  /** allsystems `resource_id` — identifies the system in the inventory API. */
  resourceId: string
  /** allsystems `resource_id_string` — the id the per-system patch report (`dcapi/.../systemreport/patches`) filters on. Verified: the two differ for most Macs. */
  detailResourceId: string
  platform: 'Windows' | 'Mac' | 'Linux' | 'Other'
  /** allsystems `os_name`, e.g. "Windows Server 2022 Standard Edition (x64)" or "Windows 11 Enterprise Edition (x64)". */
  osName?: string
  names: string[]
  missingOsPatches: number
  missingThirdPartyPatches: number
  missingDriverPatches: number
  missingBiosPatches: number
  criticalPatchCount: number
  importantPatchCount: number
  moderatePatchCount: number
  lowPatchCount: number
  lastScanTime: string | null
  lastSuccessfulScanTime: string | null
  scanSucceeded: boolean
}

interface RawSystem {
  resource_id?: number | string
  resource_id_string?: string
  os_platform_name?: string
  os_name?: string
  resource_name?: string
  fqdn_name?: string
  'managedcomputer.friendly_name'?: string
  missing_ms_patches?: number | string
  missing_tp_patches?: number | string
  missing_driver_patches?: number | string
  missing_bios_patches?: number | string
  critical_patch_count?: number | string
  important_patch_count?: number | string
  moderate_patch_count?: number | string
  low_patch_count?: number | string
  last_scan_time?: number
  last_successful_scan?: number
}

let cache: { rows: PatchSystemStatus[]; expiresAt: number } | null = null

function getBaseUrl(): string {
  return (process.env.ENDPOINT_CENTRAL_BASE_URL ?? process.env.ENDPOINT_CENTRAL_PATCH_URL ?? DEFAULT_HOST).replace(/\/$/, '')
}

export function isPatchApiConfigured(): boolean {
  return !!getManageEngineConfig()
}

function mapPlatform(name: string | undefined): PatchSystemStatus['platform'] {
  if (name === 'Windows' || name === 'Mac' || name === 'Linux') return name
  return 'Other'
}

function toIso(ms: number | undefined): string | null {
  return typeof ms === 'number' && ms > 0 ? new Date(ms).toISOString() : null
}

/** Endpoint Central represents unavailable count fields as "--" on some
 * systems. Treat those as not reported/zero rather than letting NaN corrupt
 * the fleet health aggregate. */
function count(value: number | string | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

export function mapSystem(s: RawSystem): PatchSystemStatus {
  return {
    resourceId: String(s.resource_id ?? ''),
    detailResourceId: String(s.resource_id_string ?? ''),
    platform: mapPlatform(s.os_platform_name),
    ...(s.os_name && s.os_name !== '--' ? { osName: s.os_name } : {}),
    names: [s['managedcomputer.friendly_name'], s.resource_name, s.fqdn_name]
      .filter((n): n is string => !!n && n !== '--'),
    missingOsPatches: count(s.missing_ms_patches),
    missingThirdPartyPatches: count(s.missing_tp_patches),
    missingDriverPatches: count(s.missing_driver_patches),
    missingBiosPatches: count(s.missing_bios_patches),
    criticalPatchCount: count(s.critical_patch_count),
    importantPatchCount: count(s.important_patch_count),
    moderatePatchCount: count(s.moderate_patch_count),
    lowPatchCount: count(s.low_patch_count),
    lastScanTime: toIso(s.last_scan_time),
    lastSuccessfulScanTime: toIso(s.last_successful_scan),
    scanSucceeded: (s.last_successful_scan ?? 0) > 0,
  }
}

export async function getPatchSystems(force = false): Promise<PatchSystemStatus[]> {
  if (!force && cache && Date.now() < cache.expiresAt) return cache.rows
  const cfg = getManageEngineConfig()
  if (!cfg) throw new Error('ManageEngine is not configured')

  const host = getBaseUrl()
  const rows: PatchSystemStatus[] = []

  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await zohoFetch(cfg, `${host}/api/1.4/patch/allsystems?pagelimit=${PAGE_LIMIT}&page=${page}`)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Endpoint Central Patch API ${res.status}: ${body.slice(0, 200)}`)
    }
    const json = await res.json() as { message_response?: { allsystems?: RawSystem[]; total?: number } }
    const batch = json.message_response?.allsystems ?? []
    rows.push(...batch.map(mapSystem))
    if (batch.length < PAGE_LIMIT || rows.length >= (json.message_response?.total ?? Infinity)) break
  }

  cache = { rows, expiresAt: Date.now() + CACHE_TTL_MS }
  return rows
}

// ── Per-device missing patch detail ─────────────────────────────────────────
// GET {base}/dcapi/threats/systemreport/patches — verified against the tenant.
// Shape: { metadata:{totalPages}, response_code, message_response:{ systemreport:[{ resource_id, patches:[…] }] } }.
// "No data" is HTTP 200 with body response_code 204 (not an error).

export type MissingPatchView = 'critical' | 'all' | 'os' | 'app'
export type PatchCategory = 'OS update' | 'Application update' | 'Other'
export type PatchSeverity = 'Critical' | 'Important' | 'Moderate' | 'Low' | 'Unrated'

export interface MissingPatch {
  patchId: string
  name: string
  description: string
  severity: PatchSeverity
  category: PatchCategory
  vendor: string | null
  updateType: string | null
  kb: string | null
  bulletinId: string | null
  cves: string[]
  releasedAt: string | null
  rebootRequirement: string | null
  approvalStatus: string | null
  deploymentStatus: string | null
}

export interface MissingPatchResult {
  patches: MissingPatch[]
  fetchedAt: string
}

export class PatchApiError extends Error {
  constructor(public kind: 'scope_required' | 'upstream', message: string) { super(message) }
}

interface RawPatch {
  severity?: string
  patchname?: string
  update_type?: string
  patch_id?: string | number
  patch_description?: string
  deployment_status?: string
  vendor_name?: string
  patch_released_time?: string | number
  bulletinid?: string
  reboot_required?: string
  patch_status?: string
  patch_approval_status?: string
}

interface RawDetailResponse {
  metadata?: { totalPages?: number | string }
  response_code?: number
  message_response?: { systemreport?: Array<{ resource_id?: string | number; patches?: RawPatch[] }> }
}

export function buildMissingPatchQuery(detailResourceId: string, view: MissingPatchView, page = 1): URLSearchParams {
  // No platform_name filter: resource_id already scopes this to one specific device (Mac or
  // Windows), and getFleetCriticalPatches() confirms this same endpoint returns both platforms
  // fine without it. A hardcoded 'Mac' here used to silently zero out every Windows device's
  // missing-patch detail (this call's only prior caller, the Mac Fleet Reports drawer, never
  // noticed because it only ever passed Mac devices).
  const q = new URLSearchParams({
    resource_id: detailResourceId,
    patch_status: 'Missing',
    page: String(page),
    pageLimit: String(DETAIL_PAGE_LIMIT),
  })
  // OS / app tabs are split in normalization: the category value is derived from `update_type`, not a verified server-side filter.
  if (view === 'critical') q.set('severity', 'Critical')
  return q
}

const SEVERITY_ORDER: Record<PatchSeverity, number> = { Critical: 0, Important: 1, Moderate: 2, Low: 3, Unrated: 4 }

function toSeverity(raw: string | undefined): PatchSeverity {
  const v = (raw ?? '').trim().toLowerCase()
  if (v === 'critical') return 'Critical'
  if (v === 'important') return 'Important'
  if (v === 'moderate') return 'Moderate'
  if (v === 'low') return 'Low'
  return 'Unrated'
}

function clean(v: string | number | undefined): string | null {
  if (v === undefined || v === null) return null
  const t = String(v).trim()
  return t && t !== '--' ? t : null
}

export function categorize(updateType: string | null): PatchCategory {
  if (!updateType) return 'Other'
  if (/third.?party/i.test(updateType)) return 'Application update'
  if (/security|non.?security|service pack|os|rollup|feature/i.test(updateType)) return 'OS update'
  return 'Other'
}

export function normalizeRawPatches(rows: RawPatch[]): MissingPatch[] {
  return rows
    .filter(p => (p.patch_status ?? 'Missing').toLowerCase() === 'missing')
    .map((p): MissingPatch => {
      const description = clean(p.patch_description) ?? ''
      const updateType = clean(p.update_type)
      const released = Number(p.patch_released_time)
      return {
        patchId: String(p.patch_id ?? ''),
        name: clean(p.patchname) ?? 'Unnamed patch',
        description,
        severity: toSeverity(p.severity),
        category: categorize(updateType),
        vendor: clean(p.vendor_name),
        updateType,
        kb: /\bKB\d{5,8}\b/i.exec(description)?.[0]?.toUpperCase() ?? null,
        bulletinId: clean(p.bulletinid),
        cves: [...new Set(description.match(/CVE-\d{4}-\d{4,7}/gi)?.map(c => c.toUpperCase()) ?? [])],
        releasedAt: Number.isFinite(released) && released > 0 ? new Date(released).toISOString() : null,
        rebootRequirement: clean(p.reboot_required),
        approvalStatus: clean(p.patch_approval_status),
        deploymentStatus: clean(p.deployment_status),
      }
    })
    .sort((a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      (b.releasedAt ?? '').localeCompare(a.releasedAt ?? ''))
}

export function normalizeMissingPatches(json: RawDetailResponse): MissingPatch[] {
  return normalizeRawPatches((json.message_response?.systemreport ?? []).flatMap(r => r.patches ?? []))
}

export function filterByView(patches: MissingPatch[], view: MissingPatchView): MissingPatch[] {
  if (view === 'critical') return patches.filter(p => p.severity === 'Critical')
  if (view === 'os') return patches.filter(p => p.category === 'OS update')
  if (view === 'app') return patches.filter(p => p.category === 'Application update')
  return patches
}

const detailCache = new Map<string, { result: MissingPatchResult; expiresAt: number }>()

export function clearMissingPatchCache(): void { detailCache.clear() }

export async function getMissingPatches(
  detailResourceId: string, view: MissingPatchView, force = false,
): Promise<MissingPatchResult> {
  const key = `${detailResourceId}:${view}`
  const hit = detailCache.get(key)
  if (!force && hit && Date.now() < hit.expiresAt) return hit.result

  const cfg = getManageEngineConfig()
  if (!cfg) throw new PatchApiError('upstream', 'ManageEngine is not configured')

  const base = getBaseUrl()
  const patches: MissingPatch[] = []

  for (let page = 1; page <= DETAIL_MAX_PAGES; page++) {
    const res = await zohoFetch(cfg, `${base}/dcapi/threats/systemreport/patches?${buildMissingPatchQuery(detailResourceId, view, page)}`)
    if (res.status === 401 || res.status === 403) {
      throw new PatchApiError('scope_required', `Patch API rejected the token (${res.status})`)
    }
    const text = await res.text().catch(() => '')
    let json: RawDetailResponse & { errorCode?: string; errorMsg?: string }
    try { json = JSON.parse(text) } catch { throw new PatchApiError('upstream', `Patch API returned a non-JSON response (${res.status})`) }
    if (!res.ok || json.errorCode) {
      throw new PatchApiError('upstream', `Patch API ${res.status} ${json.errorCode ?? ''}: ${(json.errorMsg ?? text).slice(0, 200)}`)
    }
    if (json.response_code === 204) break
    patches.push(...normalizeMissingPatches(json))
    if (page >= Number(json.metadata?.totalPages ?? 1)) break
  }

  const result: MissingPatchResult = {
    patches: filterByView(patches, view).sort((a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (b.releasedAt ?? '').localeCompare(a.releasedAt ?? '')),
    fetchedAt: new Date().toISOString(),
  }
  detailCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS })
  return result
}

// ── Fleet-wide missing CRITICAL patches (names per system) ──────────────────
// One paged call set for the whole fleet (verified: severity=Critical&patch_status=Missing returns only
// matching patches, keyed by `resource_id` = PatchSystemStatus.detailResourceId). Lets the Security
// Posture page show WHICH critical patches each device is missing without a request per device.

let fleetCriticalCache: { map: Map<string, MissingPatch[]>; expiresAt: number } | null = null

export function clearFleetCriticalCache(): void { fleetCriticalCache = null }

export async function getFleetCriticalPatches(force = false): Promise<Map<string, MissingPatch[]>> {
  if (!force && fleetCriticalCache && Date.now() < fleetCriticalCache.expiresAt) return fleetCriticalCache.map
  const cfg = getManageEngineConfig()
  if (!cfg) throw new PatchApiError('upstream', 'ManageEngine is not configured')

  const base = getBaseUrl()
  const map = new Map<string, MissingPatch[]>()

  for (let page = 1; page <= FLEET_MAX_PAGES; page++) {
    const q = new URLSearchParams({ severity: 'Critical', patch_status: 'Missing', pageLimit: String(DETAIL_PAGE_LIMIT), page: String(page) })
    const res = await zohoFetch(cfg, `${base}/dcapi/threats/systemreport/patches?${q}`)
    if (res.status === 401 || res.status === 403) throw new PatchApiError('scope_required', `Patch API rejected the token (${res.status})`)
    const text = await res.text().catch(() => '')
    let json: RawDetailResponse & { errorCode?: string; errorMsg?: string }
    try { json = JSON.parse(text) } catch { throw new PatchApiError('upstream', `Patch API returned a non-JSON response (${res.status})`) }
    if (!res.ok || json.errorCode) throw new PatchApiError('upstream', `Patch API ${res.status} ${json.errorCode ?? ''}: ${(json.errorMsg ?? text).slice(0, 200)}`)
    if (json.response_code === 204) break
    for (const row of json.message_response?.systemreport ?? []) {
      const patches = normalizeRawPatches(row.patches ?? []).filter(p => p.severity === 'Critical')
      if (row.resource_id !== undefined && patches.length) map.set(String(row.resource_id), patches)
    }
    if (page >= Number(json.metadata?.totalPages ?? 1)) break
  }

  fleetCriticalCache = { map, expiresAt: Date.now() + CACHE_TTL_MS }
  return map
}
