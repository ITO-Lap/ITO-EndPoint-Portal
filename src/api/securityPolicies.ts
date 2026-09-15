// Security Policies — frontend HTTP client.
//
// Read-only inventory (list/filter/search/detail) plus manual sync and
// change history for Intune device-management policies and Entra ID
// identity/security policies. See server/src/routes/securityPolicies.ts for
// the authoritative contract. The backend enforces roles via the same
// x-user-role header every other page already sends (see
// server/src/middleware/requireRole.ts — a header, not a verified
// credential, same caveat as every other page using this pattern).

const SERVER = import.meta.env.VITE_API_URL ?? ''
const BASE = `${SERVER}/api/security-policies`

let currentRole = 'Global Admin'
let currentEmail = 'admin@zinnia.com'

export function setSecurityPoliciesActor(role: string, email: string): void {
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

async function requestBlob(path: string): Promise<Blob> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'x-user-role': currentRole, 'x-user-email': currentEmail },
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

// ─── Shared types (mirrors server/src/services/securityPoliciesGraph.ts) ─────

export type PolicySource = 'intune' | 'entra'

export type PolicyCategory =
  | 'configurationPolicy' | 'deviceConfiguration' | 'compliancePolicy' | 'securityBaseline'
  | 'conditionalAccessPolicy' | 'namedLocation' | 'authenticationMethodsPolicy'
  | 'authenticationStrengthPolicy' | 'authorizationPolicy' | 'securityDefaults'

export const CATEGORY_LABELS: Record<PolicyCategory, string> = {
  configurationPolicy: 'Settings Catalog / Configuration Policy',
  deviceConfiguration: 'Device Configuration',
  compliancePolicy: 'Compliance Policy',
  securityBaseline: 'Security Baseline (legacy)',
  conditionalAccessPolicy: 'Conditional Access Policy',
  namedLocation: 'Named Location',
  authenticationMethodsPolicy: 'Authentication Methods Policy',
  authenticationStrengthPolicy: 'Authentication Strength Policy',
  authorizationPolicy: 'Authorization Policy',
  securityDefaults: 'Security Defaults',
}

export const INTUNE_CATEGORIES: PolicyCategory[] = ['configurationPolicy', 'deviceConfiguration', 'compliancePolicy', 'securityBaseline']
export const ENTRA_CATEGORIES: PolicyCategory[] = ['conditionalAccessPolicy', 'namedLocation', 'authenticationMethodsPolicy', 'authenticationStrengthPolicy', 'authorizationPolicy', 'securityDefaults']

export interface Assignment {
  kind: 'include' | 'exclude'
  targetType: string | null
  groupId: string | null
  groupDisplayName: string | null
  filterId: string | null
  filterType: string | null
}

export interface PolicyListItem {
  id: string
  source: PolicySource
  category: PolicyCategory
  categoryLabel: string
  policyId: string
  name: string
  description: string | null
  platform: string | null
  technology: string | null
  enabled: boolean | null
  assignmentCount: number
  scopeTags: string[]
  modifiedDateTime: string | null
  capturedAt: string
}

export interface ListResponse {
  success: boolean
  data: PolicyListItem[]
  pagination: { page: number; pageSize: number; total: number }
  configured: boolean
  latestSyncRunId: string | null
}

export interface PolicyDetail {
  source: PolicySource
  category: PolicyCategory
  policyId: string
  name: string
  description: string | null
  platform: string | null
  technology: string | null
  enabled: boolean | null
  settings: unknown
  assignments: Assignment[]
  scopeTags: string[]
  createdDateTime: string | null
  modifiedDateTime: string | null
  raw: Record<string, unknown>
  capturedAt: string
}

export interface SyncRunSummary {
  id: string
  status: 'running' | 'success' | 'partial' | 'failed'
  triggeredBy: string
  actorEmail: string | null
  startedAt: string
  completedAt: string | null
  policyCount: number
  sourceErrors: Partial<Record<PolicyCategory, string>>
  errorMessage: string | null
  added: number
  modified: number
  removed: number
}

export interface ChangeHistoryItem {
  id: string
  syncRunId: string
  source: PolicySource
  category: PolicyCategory
  categoryLabel: string
  policyId: string
  name: string
  changeType: 'added' | 'modified' | 'removed'
  diff: Array<{ field: string; oldValue: unknown; newValue: unknown }>
  detectedAt: string
}

export interface ListParams {
  source?: PolicySource
  category?: PolicyCategory
  platform?: string
  status?: 'enabled' | 'disabled' | 'unknown'
  search?: string
  page: number
  pageSize: number
}

export const securityPoliciesApi = {
  listPolicies: (params: ListParams): Promise<ListResponse> =>
    request(`/policies?${toQuery(params as unknown as Record<string, string | number | undefined>)}`),

  getPolicyDetail: (source: PolicySource, category: PolicyCategory, policyId: string): Promise<{ success: boolean; data: PolicyDetail }> =>
    request(`/policies/${source}/${category}/${encodeURIComponent(policyId)}`),

  getSyncStatus: (): Promise<{ success: boolean; data: SyncRunSummary | null; configured: boolean; dbAvailable: boolean }> =>
    request('/sync/status'),

  triggerSync: (): Promise<{ success: boolean; data: SyncRunSummary }> =>
    request('/sync', { method: 'POST' }),

  getChangeHistory: (limit = 100): Promise<{ success: boolean; data: ChangeHistoryItem[]; configured: boolean }> =>
    request(`/changes?limit=${limit}`),

  exportPolicies: async (params: Omit<ListParams, 'page' | 'pageSize'>, format: 'json' | 'csv'): Promise<void> => {
    const blob = await requestBlob(`/export?${toQuery({ ...params, format } as unknown as Record<string, string | number | undefined>)}`)
    const ts = new Date().toISOString().slice(0, 10)
    downloadBlob(blob, `security-policies-${ts}.${format}`)
  },
}
