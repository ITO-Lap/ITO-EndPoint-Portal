// Intune Scripts & Configurations — frontend HTTP client.
//
// Read-only: list/search/filter Intune scripts + configuration/compliance
// policies, view detail+assignments, download one item, or export a
// selection (or everything matching the current filters) as a ZIP. There is
// no upload/import/assign/update/delete anywhere in this module.
//
// See server/src/routes/intuneScriptsConfig.ts for the authoritative
// contract. The backend enforces roles via the same x-user-role header
// every other page already sends (see server/src/middleware/requireRole.ts
// — a header, not a verified credential, same caveat as Role Activity Audit).

const SERVER = import.meta.env.VITE_API_URL ?? ''
const BASE = `${SERVER}/api/intune-scripts-config`

let currentRole = 'Global Admin'
let currentEmail = 'admin@zinnia.com'

export function setIntuneScriptsConfigActor(role: string, email: string): void {
  currentRole = role
  currentEmail = email
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-user-role': currentRole,
      'x-user-email': currentEmail,
      ...(init?.headers ?? {}),
    },
  })
  const body = await res.json() as T & { success: boolean; error?: string }
  if (!res.ok || !body.success) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body
}

async function requestBlob(path: string, init?: RequestInit): Promise<Blob> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-user-role': currentRole,
      'x-user-email': currentEmail,
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }
  return res.blob()
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') usp.set(k, String(v)) })
  return usp.toString()
}

// ─── Shared types (mirrors server/src/services/intuneScriptsConfigGraph.ts) ──

export type ResourceType =
  | 'powershell_script' | 'remediation'
  | 'settings_catalog' | 'device_configuration' | 'compliance_policy'
  | 'endpoint_security' | 'administrative_template'
  | 'windows_update_configuration' | 'autopilot_deployment_profile'

export type ResourceCategory =
  | 'scripts/powershell' | 'scripts/remediations'
  | 'configurations/settings-catalog' | 'configurations/device-configuration'
  | 'configurations/compliance' | 'configurations/endpoint-security'
  | 'configurations/administrative-templates'
  | 'configurations/windows-update' | 'configurations/autopilot'

export const CATEGORY_LABELS: Record<ResourceCategory, string> = {
  'scripts/powershell': 'PowerShell Script',
  'scripts/remediations': 'Remediation',
  'configurations/settings-catalog': 'Settings Catalog',
  'configurations/device-configuration': 'Device Configuration',
  'configurations/compliance': 'Compliance Policy',
  'configurations/endpoint-security': 'Endpoint Security',
  'configurations/administrative-templates': 'Administrative Template',
  'configurations/windows-update': 'Windows Update Configuration',
  'configurations/autopilot': 'Autopilot Deployment Profile',
}

export const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as ResourceCategory[]

export interface InventoryListItem {
  compositeId: string
  type: ResourceType
  category: ResourceCategory
  label: string
  displayName: string
  lastModifiedDateTime: string | null
  platforms: string | string[] | null
  isAssigned: boolean | null
}

export interface ListResponse {
  success: boolean
  data: InventoryListItem[]
  pagination: { page: number; pageSize: number; total: number }
  categoryErrors: Partial<Record<ResourceCategory, string>>
  configured: boolean
}

export interface AssignmentOut {
  id: string
  targetType: string | null
  groupId: string | null
  groupDisplayName: string | null
  assignmentFilterId: string | null
  assignmentFilterType: string | null
}

export interface ItemDetailResponse {
  success: boolean
  data: {
    compositeId: string
    type: ResourceType
    category: ResourceCategory
    label: string
    displayName: string
    lastModifiedDateTime: string | null
    raw: Record<string, unknown>
    assignments: AssignmentOut[]
    settings: unknown[] | null
    groupNames: Record<string, string>
  }
}

export interface ListParams {
  search?: string
  category?: ResourceCategory
  platform?: string
  sortBy?: 'name' | 'category' | 'platform' | 'modified'
  sortDirection?: 'asc' | 'desc'
  page: number
  pageSize: number
}

export const intuneScriptsConfigApi = {
  listItems: (params: ListParams): Promise<ListResponse> =>
    request(`/items?${toQuery(params as unknown as Record<string, string | number | undefined>)}`),

  getItemDetail: (compositeId: string): Promise<ItemDetailResponse> =>
    request(`/items/${encodeURIComponent(compositeId)}`),

  downloadItem: async (compositeId: string, displayName: string, type: ResourceType): Promise<void> => {
    const blob = await requestBlob(`/items/${encodeURIComponent(compositeId)}/download`)
    const ext = (type === 'powershell_script' || type === 'remediation') ? 'ps1' : 'json'
    downloadBlob(blob, `${displayName}.${ext}`)
  },

  exportSelected: async (ids: string[]): Promise<void> => {
    const blob = await requestBlob('/export', { method: 'POST', body: JSON.stringify({ ids }) })
    downloadBlob(blob, `intune-export-${new Date().toISOString().slice(0, 10)}.zip`)
  },

  exportAll: async (filters: { category?: ResourceCategory; platform?: string; search?: string }): Promise<void> => {
    const blob = await requestBlob('/export', { method: 'POST', body: JSON.stringify({ all: true, ...filters }) })
    downloadBlob(blob, `intune-export-${new Date().toISOString().slice(0, 10)}.zip`)
  },
}
