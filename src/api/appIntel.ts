// App Intelligence — frontend HTTP client. Read-only; every provider call happens on the server.
// Contract: server/src/routes/appIntel.ts (mounted at /api/app-intel). Role goes in x-user-role, the
// same convention the other role-gated modules use.

const SERVER = import.meta.env.VITE_API_URL ?? ''
const BASE = `${SERVER}/api/app-intel`

let currentRole = 'IT Admin'
let currentEmail = 'unknown@zinnia.com'
export function setAppIntelActor(role: string, email?: string): void { currentRole = role; if (email) currentEmail = email }

export type AppPlatform = 'windows' | 'macOS'
export type ProviderId = 'intune' | 'manageengine-mdm' | 'endpoint-central'
export type Confidence = 'high' | 'medium' | 'low'
export type SyncFilter = 'checked' | 'stale' | 'never'
export type InstallSource = 'custom' | 'self-service' | 'manual'

export const INSTALL_SOURCE_LABEL: Record<InstallSource, string> = { custom: 'Custom', 'self-service': 'Self-service', manual: 'Manual' }

export const APP_STATUSES = [
  'Up to date', 'Update available — existing package', 'Package required', 'Repackage required',
  'Native update', 'Review required', 'Data unavailable',
] as const
export type AppStatus = typeof APP_STATUSES[number]

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  intune: 'Intune',
  'manageengine-mdm': 'ManageEngine MDM',
  'endpoint-central': 'Endpoint Central',
}

export interface AppRow {
  key: string
  app: string
  publisher: string | null
  platform: AppPlatform
  installedVersions: Array<{ version: string; deviceCount: number; provider: ProviderId }>
  affectedDevices: number
  totalDevices: number
  deployedPackageVersion: string | null
  latestVerifiedVersion: string | null
  status: AppStatus
  action: string
  providers: ProviderId[]
  latestSource: string | null
  lastChecked: string | null
  confidence: Confidence
  installSource: InstallSource
  installSourceBasis: 'bundleId' | 'wingetId' | 'name' | 'none'
  installSourceReason: string
  /** Intune package owner; null = not recorded. */
  owner: string | null
  /** Deployment ring read from assignments; null = not identified. */
  ring: string | null
  ringBasis: 'assignment-target' | 'group-name' | 'none'
  packagingState: PackagingState | null
  /** Estimated % of detected installs behind the latest verified version. */
  impactPercent: number | null
  cve: { state: CveState; total: number; highestSeverity: CveSeverity | null; knownExploited: number; exposedDevices: number } | null
  request: { jiraKey: string | null; jiraUrl: string | null; jiraAt: string | null; slackAt: string | null } | null
}

export type PackagingState = 'current' | 'behind' | 'no-package' | 'unknown' | 'not-applicable'
export type CveState = 'ok' | 'partial' | 'pending' | 'unmapped' | 'unavailable'
export type CveSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' | 'UNKNOWN'
export type RequestKind = 'jira' | 'slack'

export interface AppLifecycle {
  owner: { name: string | null; source: string | null; all: string[]; note: string | null }
  ring: { ring: string | null; basis: 'assignment-target' | 'group-name' | 'none'; note: string | null; targets: Array<{ intent: string; target: string; groupName: string | null; packageName: string }> }
  packaging: { state: PackagingState; packageName: string | null; packageCount: number; deployedVersion: string | null; latestVersion: string | null; lastModifiedAt: string | null; summary: string }
  impact: { devicesBehind: number; totalDevices: number; percentBehind: number | null; byVersion: Array<{ version: string; deviceCount: number; provider: ProviderId }>; basis: string }
}

export interface CveEntry { id: string; severity: CveSeverity; score: number | null; published: string | null; summary: string; knownExploited: boolean; url: string; versions: string[] }
export interface AppCve {
  state: CveState
  reason: string | null
  cpe: string | null
  versions: Array<{ version: string; queriedAs: string | null; state: 'ok' | 'unavailable'; reason: string | null; total: number; truncated: boolean; deviceCount: number; checkedAt: string }>
  cves: CveEntry[]
  counts: { total: number; critical: number; high: number; medium: number; low: number; knownExploited: number }
  exposedDevices: number
  highestSeverity: CveSeverity | null
  checkedAt: string | null
  note: string
}

export interface AppRequestRecord {
  id: string
  appKey: string
  app: string
  platform: AppPlatform
  targetVersion: string
  kind: RequestKind
  externalKey: string | null
  externalUrl: string | null
  createdAt: string
  createdBy: string
  createdByRole: string
}

export interface RequestPreview {
  kind: RequestKind
  eligible: boolean
  reason: string | null
  configured: boolean
  configuredNote: string | null
  destination: string
  content: { title: string; priority: 'Critical' | 'High' | 'Medium'; priorityBasis: string; body: string; slackText: string } | null
  duplicate: AppRequestRecord | null
}

/** Thrown by createRequest so callers can tell a duplicate (409) from a delivery failure (502). */
export class RequestFailure extends Error {
  code: string | null
  existing: AppRequestRecord | null
  constructor(message: string, code: string | null, existing: AppRequestRecord | null) { super(message); this.code = code; this.existing = existing }
}

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'ready' | 'error'
  lastError: string | null
  syncedAt: string | null
  errors: Record<string, string>
  packagesReadable: boolean | null
  /** OS-native apps (built-in / Store / Apple system) left out of the scan. */
  excludedNative: { windows: number; macOS: number } | null
}

export interface ProviderCapability { state: string; message: string; detail?: string[] }
export interface Capabilities {
  intune: { detectedApps: ProviderCapability; appCatalog: ProviderCapability }
  manageEngineMdm: ProviderCapability
  endpointCentralInventory: ProviderCapability
  selfService: { intuneCompanyPortal: ProviderCapability; endpointCentralPortal: ProviderCapability }
  latestVersionSources: { winget: ProviderCapability; homebrew: ProviderCapability }
  packagers: { windows: boolean; macOS: boolean }
}

export interface AppListFilters {
  platform: AppPlatform
  status?: AppStatus | ''
  provider?: ProviderId | ''
  publisher?: string
  syncState?: SyncFilter | ''
  confidence?: Confidence | ''
  installSource?: InstallSource | ''
  /** '1' = only apps with a confirmed newer verified version. */
  updateAvailable?: '1' | ''
  q?: string
  sortKey?: 'app' | 'publisher' | 'affected' | 'devices' | 'status' | 'lastChecked'
  sortDir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface AppListResult {
  state: SyncStatus
  total: number
  page: number
  pageSize: number
  totalPages: number
  rows: AppRow[]
}

export interface AppSummary {
  platform: AppPlatform
  appsDiscovered: number
  byInstallSource: { custom: number; selfService: number; manual: number }
  /** Apps with a confirmed newer verified version, whatever the next step. */
  updateAvailable: number
  updateBreakdown: { existingPackage: number; needsPackaging: number; vendorUpdate: number; review: number; devicesBehind: number }
  packageRequired: number
  packageRequiredBreakdown: { newPackage: number; repackage: number }
  reviewRequired: number
  nativeUpdate: number
  upToDate: number
  dataUnavailable: number
  publishers: string[]
}

export interface EvidenceItem { label: string; value: string; source: string; asOf: string | null }

export interface AppDetail {
  app: {
    key: string
    platform: AppPlatform
    identity: { publisher: string | null; displayName: string; bundleId: string | null; productCode: string | null; wingetId: string | null; brewToken: string | null }
    installed: Array<{ version: string; deviceCount: number; provider: ProviderId }>
    packages: Array<{ packageId: string; displayName: string; owner?: string | null; version: string | null; versionSource: string | null; matchBasis: string; odataType: string; lastModifiedAt: string | null }>
    confidence: Confidence
    confidenceReason: string
    installSource: InstallSource
    installSourceBasis: 'bundleId' | 'wingetId' | 'name' | 'none'
    installSourceReason: string
    providers: ProviderId[]
    status: AppStatus
    reason: string
    action: string
    deployedPackageVersion: string | null
    latest: { version: string; versionSource: string; sourceUrl: string; lastCheckedAt: string; selfUpdating: boolean; releaseNotes?: { summary: string | null; url: string | null; vendorUrl?: string | null; source: string; unavailableReason: string | null } } | null
    latestUnavailable: { reason: string; lastCheckedAt: string } | null
    affectedDevices: number
    totalDevices: number
    evidence: EvidenceItem[]
    dataGaps: string[]
  }
  row: AppRow
  syncState: SyncFilter
  providerAsOf: Partial<Record<ProviderId, string | null>>
  syncedAt: string
  devices: Array<{ name: string; user: string | null; version: string; provider: ProviderId }>
  devicesNote: string | null
  assignments: Record<string, Array<{ intent: string; target: string }> | 'unavailable'>
  packagingIntent: PackagingIntent | null
  lifecycle: AppLifecycle | null
  cve: AppCve
  requests: AppRequestRecord[]
}

export interface PackagingIntent {
  platform: AppPlatform
  sourceId: string | null
  sourceKind: 'winget' | 'homebrew'
  displayName: string
  publisher: string | null
  bundleId: string | null
  targetVersion: string
  reason: string
  kind: 'new-package' | 'repackage'
  allowedActions: ['build-package']
}

async function request<T>(path: string, method: 'GET' | 'POST' = 'GET', payload?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'x-user-role': currentRole, 'x-user-email': currentEmail, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  })
  const body = await res.json().catch(() => null) as { success?: boolean; data?: T; error?: string; code?: string; existing?: AppRequestRecord } | null
  if (!res.ok || !body?.success) throw new RequestFailure(body?.error ?? `${path}: ${res.status}`, body?.code ?? null, body?.existing ?? null)
  return body.data as T
}

/** Downloads the CSV/Excel export of the filtered inventory, or of one app's devices when `key` is given. */
async function downloadExport(f: Pick<AppListFilters, 'platform'> & Partial<AppListFilters>, format: 'csv' | 'xlsx', key?: string): Promise<void> {
  const rest: Record<string, unknown> = { ...f }
  delete rest.page
  delete rest.pageSize
  const qs = new URLSearchParams({ format })
  for (const [k, v] of Object.entries(rest)) if (v !== undefined && v !== '') qs.set(k, String(v))
  if (key) qs.set('key', key)
  const res = await fetch(`${BASE}/export?${qs}`, { headers: { 'x-user-role': currentRole, 'x-user-email': currentEmail } })
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error ?? `Export failed (${res.status})`)
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? `application-export.${format}`
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a'); a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}

export const appIntelApi = {
  exportReport: downloadExport,
  status: () => request<SyncStatus & { capabilities: Capabilities }>('/status'),
  sync: () => request<SyncStatus>('/sync', 'POST'),
  summary: (platform: AppPlatform) => request<{ state: SyncStatus; summary: AppSummary | null }>(`/summary?platform=${platform}`),
  list: (f: AppListFilters) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '') qs.set(k, String(v))
    return request<AppListResult>(`/apps?${qs}`)
  },
  detail: (key: string) => request<AppDetail>(`/apps/detail?key=${encodeURIComponent(key)}`),
  /** Shows exactly what would be sent and where; sends nothing. */
  previewRequest: (key: string, kind: RequestKind) => request<RequestPreview>(`/requests/preview?key=${encodeURIComponent(key)}&kind=${kind}`),
  /** Creates a Jira packaging request or posts the Slack notification. Content is built on the server. */
  /** Posts the full verified-updates report to Slack (same report as the weekly job). */
  sendUpdateReport: () => request<{ updatesAvailable: number; devicesBehind: number }>('/report/slack', 'POST'),
  createRequest: (key: string, kind: RequestKind) => request<AppRequestRecord>('/requests', 'POST', { key, kind }),
}
