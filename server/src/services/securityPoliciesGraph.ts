// Security Policies — Graph fetch + normalization layer.
//
// Read-only inventory of Intune device-management policies and Entra ID
// identity/security policies, normalized into one common shape so the
// frontend can browse/filter/diff them uniformly regardless of source. No
// write/update/delete action exists anywhere in this module.
//
// Required Azure AD App Registration permissions (Application):
//   DeviceManagementConfiguration.Read.All    — configurationPolicies, deviceConfigurations,
//                                                deviceCompliancePolicies, intents (legacy baselines)
//   DeviceManagementEndpointSecurity.Read.All — endpoint security intents (some intents live
//                                                under this permission rather than Configuration.Read.All)
//   Policy.Read.All                           — conditionalAccess policies/namedLocations,
//                                                authorizationPolicy, authenticationStrengthPolicies,
//                                                identitySecurityDefaultsEnforcementPolicy
//   Policy.Read.AuthenticationMethod           — authenticationMethodsPolicy
//   Group.Read.All                             — resolve assignment target group ids to names
//
// Endpoint/version matrix (verified against Microsoft Learn — Graph beta
// status changes over time, recheck before relying on this elsewhere):
//   deviceManagement/configurationPolicies                    beta only
//   deviceManagement/deviceConfigurations                     v1.0
//   deviceManagement/deviceCompliancePolicies                 v1.0
//   deviceManagement/intents (legacy security baselines)      beta only
//   identity/conditionalAccess/policies                       v1.0
//   identity/conditionalAccess/namedLocations                 v1.0
//   policies/authenticationMethodsPolicy (singleton)           v1.0
//   policies/authenticationStrengthPolicies                    v1.0
//   policies/authorizationPolicy (singleton)                   v1.0
//   policies/identitySecurityDefaultsEnforcementPolicy (singleton) v1.0

import type { TenantCredentials } from './graphApi.js'
import { GRAPH, GRAPH_BETA, graphGetV, graphGetAllV } from './graphApi.js'

export type SecurityPolicySource = 'intune' | 'entra'

export type SecurityPolicyCategory =
  | 'configurationPolicy'
  | 'deviceConfiguration'
  | 'compliancePolicy'
  | 'securityBaseline'
  | 'conditionalAccessPolicy'
  | 'namedLocation'
  | 'authenticationMethodsPolicy'
  | 'authenticationStrengthPolicy'
  | 'authorizationPolicy'
  | 'securityDefaults'

export const INTUNE_CATEGORIES: SecurityPolicyCategory[] = [
  'configurationPolicy', 'deviceConfiguration', 'compliancePolicy', 'securityBaseline',
]
export const ENTRA_CATEGORIES: SecurityPolicyCategory[] = [
  'conditionalAccessPolicy', 'namedLocation', 'authenticationMethodsPolicy',
  'authenticationStrengthPolicy', 'authorizationPolicy', 'securityDefaults',
]

export const CATEGORY_LABELS: Record<SecurityPolicyCategory, string> = {
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

export function sourceForCategory(category: SecurityPolicyCategory): SecurityPolicySource {
  return INTUNE_CATEGORIES.includes(category) ? 'intune' : 'entra'
}

export interface NormalizedAssignment {
  kind: 'include' | 'exclude'
  targetType: string | null
  groupId: string | null
  /** Filled in by securityPoliciesStore after group-id -> display-name resolution. */
  groupDisplayName: string | null
  filterId: string | null
  filterType: string | null
}

export interface NormalizedPolicy {
  source: SecurityPolicySource
  category: SecurityPolicyCategory
  policyId: string
  name: string
  description: string | null
  platform: string | null
  technology: string | null
  enabled: boolean | null
  settings: unknown
  assignments: NormalizedAssignment[]
  scopeTags: string[]
  createdDateTime: string | null
  modifiedDateTime: string | null
  raw: Record<string, unknown>
}

export interface FetchResult {
  policies: NormalizedPolicy[]
  sourceErrors: Partial<Record<SecurityPolicyCategory, string>>
}

// Bounded-concurrency helper — copied rather than imported, matching this
// repo's convention of small per-file utilities over a shared lib (see
// graphApi.ts's comment on fetchWithRetry for the same rationale).
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

const DETAIL_FETCH_CONCURRENCY = 8

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

function firstPlatform(v: unknown): string | null {
  if (Array.isArray(v) && v.length > 0) return String(v[0])
  if (typeof v === 'string' && v.length > 0) return v
  return null
}

interface IntuneAssignmentTarget {
  '@odata.type'?: string
  groupId?: string
  deviceAndAppManagementAssignmentFilterId?: string | null
  deviceAndAppManagementAssignmentFilterType?: string
}
interface IntuneAssignment {
  id: string
  target: IntuneAssignmentTarget
}

function normalizeIntuneAssignments(assignments: IntuneAssignment[]): NormalizedAssignment[] {
  return assignments.map(a => {
    const odataType = a.target?.['@odata.type'] ?? ''
    return {
      kind: odataType.toLowerCase().includes('exclusion') ? 'exclude' : 'include',
      targetType: odataType || null,
      groupId: a.target?.groupId ?? null,
      groupDisplayName: null,
      filterId: a.target?.deviceAndAppManagementAssignmentFilterId ?? null,
      filterType: a.target?.deviceAndAppManagementAssignmentFilterType ?? null,
    }
  })
}

async function fetchIntuneAssignments(
  creds: TenantCredentials, base: typeof GRAPH | typeof GRAPH_BETA, path: string, id: string,
): Promise<NormalizedAssignment[]> {
  try {
    const assignments = await graphGetAllV<IntuneAssignment>(creds, base, `${path}/${id}/assignments`)
    return normalizeIntuneAssignments(assignments)
  } catch {
    return []
  }
}

// ─── Intune: configurationPolicy (Settings Catalog / Endpoint Security) ──────
async function fetchConfigurationPolicies(creds: TenantCredentials): Promise<NormalizedPolicy[]> {
  const path = '/deviceManagement/configurationPolicies'
  const list = await graphGetAllV<Record<string, unknown>>(creds, GRAPH_BETA, path)

  const tasks = list.map(raw => async (): Promise<NormalizedPolicy> => {
    const id = String(raw.id ?? '')
    const [assignments, settingsResp] = await Promise.all([
      fetchIntuneAssignments(creds, GRAPH_BETA, path, id),
      graphGetV<{ value: unknown[] }>(creds, GRAPH_BETA, `${path}('${id}')/settings`).catch(() => ({ value: [] })),
    ])
    const templateRef = raw.templateReference as { templateFamily?: string; templateDisplayName?: string } | undefined
    return {
      source: 'intune', category: 'configurationPolicy', policyId: id,
      name: str(raw.name) ?? str(raw.displayName) ?? id,
      description: str(raw.description),
      platform: firstPlatform(raw.platforms),
      technology: templateRef?.templateDisplayName ?? str(raw.technologies) ?? templateRef?.templateFamily ?? null,
      enabled: null,
      settings: settingsResp.value ?? [],
      assignments,
      scopeTags: Array.isArray(raw.roleScopeTagIds) ? (raw.roleScopeTagIds as string[]) : [],
      createdDateTime: str(raw.createdDateTime),
      modifiedDateTime: str(raw.lastModifiedDateTime),
      raw,
    }
  })
  return pLimit(tasks, DETAIL_FETCH_CONCURRENCY)
}

// ─── Intune: deviceConfiguration ─────────────────────────────────────────────
async function fetchDeviceConfigurations(creds: TenantCredentials): Promise<NormalizedPolicy[]> {
  const path = '/deviceManagement/deviceConfigurations'
  const list = await graphGetAllV<Record<string, unknown>>(creds, GRAPH, path)

  const tasks = list.map(raw => async (): Promise<NormalizedPolicy> => {
    const id = String(raw.id ?? '')
    const assignments = await fetchIntuneAssignments(creds, GRAPH, path, id)
    return {
      source: 'intune', category: 'deviceConfiguration', policyId: id,
      name: str(raw.displayName) ?? id,
      description: str(raw.description),
      platform: str(raw.platformType) ?? (str(raw['@odata.type'])?.replace('#microsoft.graph.', '') ?? null),
      technology: str(raw['@odata.type']),
      enabled: null,
      settings: raw,
      assignments,
      scopeTags: Array.isArray(raw.roleScopeTagIds) ? (raw.roleScopeTagIds as string[]) : [],
      createdDateTime: str(raw.createdDateTime),
      modifiedDateTime: str(raw.lastModifiedDateTime),
      raw,
    }
  })
  return pLimit(tasks, DETAIL_FETCH_CONCURRENCY)
}

// ─── Intune: compliancePolicy ────────────────────────────────────────────────
async function fetchCompliancePolicies(creds: TenantCredentials): Promise<NormalizedPolicy[]> {
  const path = '/deviceManagement/deviceCompliancePolicies'
  const list = await graphGetAllV<Record<string, unknown>>(creds, GRAPH, path)

  const tasks = list.map(raw => async (): Promise<NormalizedPolicy> => {
    const id = String(raw.id ?? '')
    const assignments = await fetchIntuneAssignments(creds, GRAPH, path, id)
    return {
      source: 'intune', category: 'compliancePolicy', policyId: id,
      name: str(raw.displayName) ?? id,
      description: str(raw.description),
      platform: str(raw.platformType) ?? (str(raw['@odata.type'])?.replace('#microsoft.graph.', '') ?? null),
      technology: str(raw['@odata.type']),
      enabled: null,
      settings: raw,
      assignments,
      scopeTags: Array.isArray(raw.roleScopeTagIds) ? (raw.roleScopeTagIds as string[]) : [],
      createdDateTime: str(raw.createdDateTime),
      modifiedDateTime: str(raw.lastModifiedDateTime),
      raw,
    }
  })
  return pLimit(tasks, DETAIL_FETCH_CONCURRENCY)
}

// ─── Intune: intents (legacy security baselines) ─────────────────────────────
async function fetchSecurityBaselines(creds: TenantCredentials): Promise<NormalizedPolicy[]> {
  const path = '/deviceManagement/intents'
  const list = await graphGetAllV<Record<string, unknown>>(creds, GRAPH_BETA, path)

  const tasks = list.map(raw => async (): Promise<NormalizedPolicy> => {
    const id = String(raw.id ?? '')
    const [assignments, settingsResp] = await Promise.all([
      fetchIntuneAssignments(creds, GRAPH_BETA, path, id),
      graphGetAllV<unknown>(creds, GRAPH_BETA, `${path}/${id}/settings`).catch(() => []),
    ])
    return {
      source: 'intune', category: 'securityBaseline', policyId: id,
      name: str(raw.displayName) ?? id,
      description: str(raw.description),
      platform: 'windows', // legacy security baselines are Windows-only
      technology: str(raw.templateId),
      enabled: null,
      settings: settingsResp,
      assignments,
      scopeTags: Array.isArray(raw.roleScopeTagIds) ? (raw.roleScopeTagIds as string[]) : [],
      createdDateTime: null,
      modifiedDateTime: str(raw.lastModifiedDateTime),
      raw,
    }
  })
  return pLimit(tasks, DETAIL_FETCH_CONCURRENCY)
}

// ─── Entra: conditionalAccess/policies ───────────────────────────────────────
interface CaUserCondition {
  includeUsers?: string[]; excludeUsers?: string[]
  includeGroups?: string[]; excludeGroups?: string[]
  includeRoles?: string[]; excludeRoles?: string[]
}

function normalizeCaAssignments(users: CaUserCondition | undefined): NormalizedAssignment[] {
  if (!users) return []
  const out: NormalizedAssignment[] = []
  const push = (ids: string[] | undefined, kind: 'include' | 'exclude', targetType: string) => {
    for (const id of ids ?? []) {
      out.push({
        kind, targetType,
        groupId: targetType === 'group' ? id : null,
        groupDisplayName: null,
        filterId: null, filterType: null,
      })
    }
  }
  push(users.includeUsers, 'include', 'user')
  push(users.excludeUsers, 'exclude', 'user')
  push(users.includeGroups, 'include', 'group')
  push(users.excludeGroups, 'exclude', 'group')
  push(users.includeRoles, 'include', 'directoryRole')
  push(users.excludeRoles, 'exclude', 'directoryRole')
  return out
}

async function fetchConditionalAccessPolicies(creds: TenantCredentials): Promise<NormalizedPolicy[]> {
  const list = await graphGetAllV<Record<string, unknown>>(creds, GRAPH, '/identity/conditionalAccess/policies')
  return list.map(raw => {
    const conditions = raw.conditions as { users?: CaUserCondition } | undefined
    const state = str(raw.state)
    return {
      source: 'entra', category: 'conditionalAccessPolicy', policyId: String(raw.id ?? ''),
      name: str(raw.displayName) ?? String(raw.id ?? ''),
      description: null,
      platform: null,
      technology: 'conditionalAccess',
      enabled: state === 'enabled' ? true : state === 'disabled' ? false : null,
      settings: { conditions: raw.conditions, grantControls: raw.grantControls, sessionControls: raw.sessionControls, state: raw.state },
      assignments: normalizeCaAssignments(conditions?.users),
      scopeTags: [],
      createdDateTime: str(raw.createdDateTime),
      modifiedDateTime: str(raw.modifiedDateTime),
      raw,
    }
  })
}

// ─── Entra: conditionalAccess/namedLocations ─────────────────────────────────
async function fetchNamedLocations(creds: TenantCredentials): Promise<NormalizedPolicy[]> {
  const list = await graphGetAllV<Record<string, unknown>>(creds, GRAPH, '/identity/conditionalAccess/namedLocations')
  return list.map(raw => ({
    source: 'entra', category: 'namedLocation', policyId: String(raw.id ?? ''),
    name: str(raw.displayName) ?? String(raw.id ?? ''),
    description: null,
    platform: null,
    technology: str(raw['@odata.type']),
    enabled: typeof raw.isTrusted === 'boolean' ? (raw.isTrusted as boolean) : null,
    settings: raw,
    assignments: [],
    scopeTags: [],
    createdDateTime: str(raw.createdDateTime),
    modifiedDateTime: str(raw.modifiedDateTime),
    raw,
  }))
}

// ─── Entra: policies/authenticationMethodsPolicy (singleton) ────────────────
async function fetchAuthenticationMethodsPolicy(creds: TenantCredentials): Promise<NormalizedPolicy[]> {
  const raw = await graphGetV<Record<string, unknown>>(creds, GRAPH, '/policies/authenticationMethodsPolicy')
  return [{
    source: 'entra', category: 'authenticationMethodsPolicy', policyId: String(raw.id ?? 'authenticationMethodsPolicy'),
    name: 'Authentication Methods Policy',
    description: str(raw.description),
    platform: null,
    technology: 'authenticationMethods',
    enabled: null,
    settings: { authenticationMethodConfigurations: raw.authenticationMethodConfigurations, policyVersion: raw.policyVersion },
    assignments: [],
    scopeTags: [],
    createdDateTime: null,
    modifiedDateTime: str(raw.lastModifiedDateTime),
    raw,
  }]
}

// ─── Entra: policies/authenticationStrengthPolicies ──────────────────────────
async function fetchAuthenticationStrengthPolicies(creds: TenantCredentials): Promise<NormalizedPolicy[]> {
  const list = await graphGetAllV<Record<string, unknown>>(creds, GRAPH, '/policies/authenticationStrengthPolicies')
  return list.map(raw => ({
    source: 'entra', category: 'authenticationStrengthPolicy', policyId: String(raw.id ?? ''),
    name: str(raw.displayName) ?? String(raw.id ?? ''),
    description: str(raw.description),
    platform: null,
    technology: str(raw.policyType),
    enabled: null,
    settings: { allowedCombinations: raw.allowedCombinations, requirementsSatisfied: raw.requirementsSatisfied },
    assignments: [],
    scopeTags: [],
    createdDateTime: str(raw.createdDateTime),
    modifiedDateTime: str(raw.modifiedDateTime),
    raw,
  }))
}

// ─── Entra: policies/authorizationPolicy (singleton) ─────────────────────────
async function fetchAuthorizationPolicy(creds: TenantCredentials): Promise<NormalizedPolicy[]> {
  const raw = await graphGetV<Record<string, unknown>>(creds, GRAPH, '/policies/authorizationPolicy')
  return [{
    source: 'entra', category: 'authorizationPolicy', policyId: String(raw.id ?? 'authorizationPolicy'),
    name: str(raw.displayName) ?? 'Authorization Policy',
    description: str(raw.description),
    platform: null,
    technology: 'authorizationPolicy',
    enabled: null,
    settings: raw,
    assignments: [],
    scopeTags: [],
    createdDateTime: null,
    modifiedDateTime: null,
    raw,
  }]
}

// ─── Entra: policies/identitySecurityDefaultsEnforcementPolicy (singleton) ──
async function fetchSecurityDefaults(creds: TenantCredentials): Promise<NormalizedPolicy[]> {
  const raw = await graphGetV<Record<string, unknown>>(creds, GRAPH, '/policies/identitySecurityDefaultsEnforcementPolicy')
  return [{
    source: 'entra', category: 'securityDefaults', policyId: String(raw.id ?? 'identitySecurityDefaultsEnforcementPolicy'),
    name: str(raw.displayName) ?? 'Security Defaults',
    description: str(raw.description),
    platform: null,
    technology: 'securityDefaults',
    enabled: typeof raw.isEnabled === 'boolean' ? (raw.isEnabled as boolean) : null,
    settings: raw,
    assignments: [],
    scopeTags: [],
    createdDateTime: null,
    modifiedDateTime: null,
    raw,
  }]
}

const CATEGORY_FETCHERS: Record<SecurityPolicyCategory, (creds: TenantCredentials) => Promise<NormalizedPolicy[]>> = {
  configurationPolicy: fetchConfigurationPolicies,
  deviceConfiguration: fetchDeviceConfigurations,
  compliancePolicy: fetchCompliancePolicies,
  securityBaseline: fetchSecurityBaselines,
  conditionalAccessPolicy: fetchConditionalAccessPolicies,
  namedLocation: fetchNamedLocations,
  authenticationMethodsPolicy: fetchAuthenticationMethodsPolicy,
  authenticationStrengthPolicy: fetchAuthenticationStrengthPolicies,
  authorizationPolicy: fetchAuthorizationPolicy,
  securityDefaults: fetchSecurityDefaults,
}

const ALL_CATEGORIES: SecurityPolicyCategory[] = [...INTUNE_CATEGORIES, ...ENTRA_CATEGORIES]

/** Fetches every category in parallel (Promise.allSettled) — one failing
 *  category doesn't blank the whole sync; failures are reported per-category,
 *  same pattern as intuneScriptsConfigGraph.ts's listAllItems. */
export async function fetchAllSecurityPolicies(creds: TenantCredentials): Promise<FetchResult> {
  const results = await Promise.allSettled(ALL_CATEGORIES.map(cat => CATEGORY_FETCHERS[cat](creds)))
  const policies: NormalizedPolicy[] = []
  const sourceErrors: Partial<Record<SecurityPolicyCategory, string>> = {}

  results.forEach((result, i) => {
    const category = ALL_CATEGORIES[i]!
    if (result.status === 'rejected') {
      sourceErrors[category] = result.reason instanceof Error ? result.reason.message : String(result.reason)
      return
    }
    policies.push(...result.value)
  })

  return { policies, sourceErrors }
}

/** All distinct group ids referenced by any assignment across a policy set —
 *  used by the store layer to batch-resolve + cache display names. */
export function collectAssignmentGroupIds(policies: NormalizedPolicy[]): string[] {
  const ids = new Set<string>()
  for (const p of policies) {
    for (const a of p.assignments) if (a.groupId) ids.add(a.groupId)
  }
  return [...ids]
}
