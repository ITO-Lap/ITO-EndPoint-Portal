// Intune Scripts & Configurations — Graph fetch layer.
//
// Read-only inventory of Intune scripts and configuration/compliance
// policies, for browsing/exporting (NOT the Intune administrative audit log
// of who-changed-what — that's server/src/services/intuneAuditGraph.ts).
//
// Endpoint/version matrix (verified against Microsoft Learn — Graph beta
// status changes over time, recheck before relying on this elsewhere):
//   deviceManagementScripts          beta only  — DeviceManagementScripts.Read.All
//   deviceHealthScripts              beta only  — DeviceManagementScripts.Read.All
//   configurationPolicies            beta only  — DeviceManagementConfiguration.Read.All
//   deviceConfigurations             v1.0       — DeviceManagementConfiguration.Read.All
//   deviceCompliancePolicies         v1.0       — DeviceManagementConfiguration.Read.All
//   groupPolicyConfigurations        beta only  — DeviceManagementConfiguration.Read.All
//   windowsAutopilotDeploymentProfiles beta only — DeviceManagementServiceConfig.Read.All
//     (a DIFFERENT permission from every other resource here — must be added
//     to the app registration separately; if not granted, this category
//     surfaces a categoryError rather than failing the whole page)
//
// Endpoint Security is not a separate Graph collection today — Microsoft
// folded it into configurationPolicies, distinguished by
// templateReference.templateFamily starting with "endpointSecurity".
// Windows Update Configuration is similarly folded into deviceConfigurations,
// distinguished by @odata.type === '#microsoft.graph.windowsUpdateForBusinessConfiguration'.
// See docs/04-integrations/INTUNE-SCRIPTS-CONFIGURATIONS.md for the full
// permission/version table and known limitations.

import type { TenantCredentials, GraphBase } from './graphApi.js'
import { GRAPH, GRAPH_BETA, graphGetAllV, graphGetV, getGroupDisplayNames } from './graphApi.js'

export type ResourceType =
  | 'powershell_script'
  | 'remediation'
  | 'settings_catalog'
  | 'device_configuration'
  | 'compliance_policy'
  | 'endpoint_security'
  | 'administrative_template'
  | 'windows_update_configuration'
  | 'autopilot_deployment_profile'

export type ResourceCategory =
  | 'scripts/powershell'
  | 'scripts/remediations'
  | 'configurations/settings-catalog'
  | 'configurations/device-configuration'
  | 'configurations/compliance'
  | 'configurations/endpoint-security'
  | 'configurations/administrative-templates'
  | 'configurations/windows-update'
  | 'configurations/autopilot'

export interface ResourceTypeDef {
  type: ResourceType
  category: ResourceCategory
  label: string
  path: string
  base: GraphBase
  hasSettings: boolean
  contentFields: string[]
}

export const RESOURCE_TYPES: ResourceTypeDef[] = [
  { type: 'powershell_script',       category: 'scripts/powershell',                  label: 'PowerShell Script',        path: '/deviceManagement/deviceManagementScripts', base: GRAPH_BETA, hasSettings: false, contentFields: ['scriptContent'] },
  { type: 'remediation',             category: 'scripts/remediations',                label: 'Remediation',               path: '/deviceManagement/deviceHealthScripts',     base: GRAPH_BETA, hasSettings: false, contentFields: ['detectionScriptContent', 'remediationScriptContent'] },
  { type: 'settings_catalog',        category: 'configurations/settings-catalog',     label: 'Settings Catalog Profile',  path: '/deviceManagement/configurationPolicies',   base: GRAPH_BETA, hasSettings: true,  contentFields: [] },
  { type: 'device_configuration',    category: 'configurations/device-configuration', label: 'Device Configuration',      path: '/deviceManagement/deviceConfigurations',    base: GRAPH,      hasSettings: false, contentFields: [] },
  { type: 'compliance_policy',       category: 'configurations/compliance',           label: 'Compliance Policy',         path: '/deviceManagement/deviceCompliancePolicies',base: GRAPH,      hasSettings: false, contentFields: [] },
  { type: 'endpoint_security',       category: 'configurations/endpoint-security',    label: 'Endpoint Security Policy',  path: '/deviceManagement/configurationPolicies',   base: GRAPH_BETA, hasSettings: true,  contentFields: [] },
  { type: 'administrative_template', category: 'configurations/administrative-templates', label: 'Administrative Template', path: '/deviceManagement/groupPolicyConfigurations', base: GRAPH_BETA, hasSettings: false, contentFields: [] },
  { type: 'windows_update_configuration', category: 'configurations/windows-update', label: 'Windows Update Configuration', path: '/deviceManagement/deviceConfigurations', base: GRAPH, hasSettings: false, contentFields: [] },
  { type: 'autopilot_deployment_profile', category: 'configurations/autopilot',      label: 'Autopilot Deployment Profile', path: '/deviceManagement/windowsAutopilotDeploymentProfiles', base: GRAPH_BETA, hasSettings: false, contentFields: [] },
]

export function resourceTypeDef(type: ResourceType): ResourceTypeDef {
  const def = RESOURCE_TYPES.find(r => r.type === type)
  if (!def) throw new Error(`Unknown Intune Scripts & Configurations resource type: ${type}`)
  return def
}

// Raw shape is intentionally loose (unknown Graph object) — every resource
// type has a different schema, and callers only rely on the common fields
// below plus preserving the rest verbatim for JSON export.
export interface InventoryItem {
  compositeId: string
  type: ResourceType
  category: ResourceCategory
  label: string
  id: string
  displayName: string
  lastModifiedDateTime: string | null
  raw: Record<string, unknown>
}

function toInventoryItem(def: ResourceTypeDef, raw: Record<string, unknown>): InventoryItem {
  const id = String(raw.id ?? '')
  const displayName = String(raw.displayName ?? raw.name ?? id)
  return {
    compositeId: `${def.type}:${id}`,
    type: def.type,
    category: def.category,
    label: def.label,
    id,
    displayName,
    lastModifiedDateTime: (raw.lastModifiedDateTime as string | undefined) ?? null,
    raw,
  }
}

/** Fetches one resource type's full collection. Some collections are shared
 *  by more than one resource type (see COLLECTION_CLASSIFIERS below) — this
 *  always fetches the raw Graph collection; splitting into the right
 *  ResourceType happens in listAllItems. */
async function fetchCollection(creds: TenantCredentials, def: ResourceTypeDef): Promise<Record<string, unknown>[]> {
  return graphGetAllV<Record<string, unknown>>(creds, def.base, def.path)
}

function isEndpointSecurity(raw: Record<string, unknown>): boolean {
  const templateFamily = (raw.templateReference as { templateFamily?: string } | undefined)?.templateFamily
  return typeof templateFamily === 'string' && templateFamily.startsWith('endpointSecurity')
}

function isWindowsUpdateConfiguration(raw: Record<string, unknown>): boolean {
  return raw['@odata.type'] === '#microsoft.graph.windowsUpdateForBusinessConfiguration'
}

function collectionKey(def: ResourceTypeDef): string {
  return `${def.base}::${def.path}`
}

// Two Graph collections are each shared by two resource types — Endpoint
// Security is a filtered view of Settings Catalog's configurationPolicies,
// and Windows Update Configuration is a filtered view of deviceConfigurations
// (both classified by a field on the raw object, not a separate endpoint).
// Keyed by collectionKey() so this works regardless of RESOURCE_TYPES order.
const COLLECTION_CLASSIFIERS: Record<string, (raw: Record<string, unknown>) => ResourceType> = {
  [`${GRAPH_BETA}::/deviceManagement/configurationPolicies`]: raw => isEndpointSecurity(raw) ? 'endpoint_security' : 'settings_catalog',
  [`${GRAPH}::/deviceManagement/deviceConfigurations`]: raw => isWindowsUpdateConfiguration(raw) ? 'windows_update_configuration' : 'device_configuration',
}

export interface ListResult {
  items: InventoryItem[]
  categoryErrors: Partial<Record<ResourceCategory, string>>
}

/** Fetches every distinct Graph collection in parallel (Promise.allSettled)
 *  — one failing collection doesn't blank the whole page; failures are
 *  reported per-category, same pattern as roleActivity.ts's sourceErrors.
 *  Resource types that share a collection (see COLLECTION_CLASSIFIERS) are
 *  fetched exactly once and split by classifier, not fetched twice. */
export async function listAllItems(creds: TenantCredentials): Promise<ListResult> {
  const items: InventoryItem[] = []
  const categoryErrors: Partial<Record<ResourceCategory, string>> = {}

  const groups = new Map<string, ResourceTypeDef[]>()
  for (const def of RESOURCE_TYPES) {
    const key = collectionKey(def)
    const list = groups.get(key) ?? []
    list.push(def)
    groups.set(key, list)
  }
  const groupEntries = [...groups.entries()]

  const results = await Promise.allSettled(groupEntries.map(([, defs]) => fetchCollection(creds, defs[0]!)))

  groupEntries.forEach(([key, defs], i) => {
    const result = results[i]
    if (!result) return

    if (result.status === 'rejected') {
      const msg = result.reason instanceof Error ? result.reason.message : String(result.reason)
      for (const def of defs) categoryErrors[def.category] = msg
      return
    }

    const classify = COLLECTION_CLASSIFIERS[key]
    for (const raw of result.value) {
      const targetType = defs.length === 1 ? defs[0]!.type : (classify?.(raw) ?? defs[0]!.type)
      const def = defs.find(d => d.type === targetType) ?? defs[0]!
      items.push(toInventoryItem(def, raw))
    }
  })

  return { items, categoryErrors }
}

export interface AssignmentTarget {
  '@odata.type'?: string
  groupId?: string
  deviceAndAppManagementAssignmentFilterId?: string | null
  deviceAndAppManagementAssignmentFilterType?: string
}

export interface Assignment {
  id: string
  target: AssignmentTarget
}

async function fetchAssignments(creds: TenantCredentials, def: ResourceTypeDef, id: string): Promise<Assignment[]> {
  return graphGetAllV<Assignment>(creds, def.base, `${def.path}/${id}/assignments`)
}

/** Whether an item has at least one assignment. Graph does not reliably
 *  return an `isAssigned` field on any of these 8 resource types' list
 *  responses (confirmed against a live tenant — even configurationPolicy,
 *  whose beta schema documents `isAssigned`, omits it in practice), so
 *  callers that need real assignment status must fetch it per item. Kept
 *  cheap and separate from getItemDetail (which also fetches settings and
 *  resolves group names) so a list page can enrich just its current page of
 *  items with bounded concurrency instead of paying for a full detail fetch. */
export async function isItemAssigned(creds: TenantCredentials, type: ResourceType, id: string): Promise<boolean> {
  const def = resourceTypeDef(type)
  const assignments = await fetchAssignments(creds, def, id)
  return assignments.length > 0
}

async function fetchSettings(creds: TenantCredentials, def: ResourceTypeDef, id: string): Promise<unknown[]> {
  const data = await graphGetV<{ value: unknown[] }>(creds, def.base, `${def.path}('${id}')/settings`)
  return data.value ?? []
}

export interface ItemDetail {
  item: InventoryItem
  assignments: Assignment[]
  settings: unknown[] | null
  groupNames: Record<string, string>
}

/** Fetches one item's full detail: the object itself, its assignments, its
 *  settings (Settings Catalog / Endpoint Security only), and resolves any
 *  group-targeted assignment's group id to a display name. */
export async function getItemDetail(creds: TenantCredentials, type: ResourceType, id: string): Promise<ItemDetail> {
  const def = resourceTypeDef(type)
  const raw = await graphGetV<Record<string, unknown>>(creds, def.base, `${def.path}/${id}`)
  const item = toInventoryItem(def, raw)

  const [assignments, settings] = await Promise.all([
    fetchAssignments(creds, def, id).catch(() => [] as Assignment[]),
    def.hasSettings ? fetchSettings(creds, def, id).catch(() => [] as unknown[]) : Promise.resolve(null),
  ])

  const groupIds = assignments
    .map(a => a.target?.groupId)
    .filter((g): g is string => typeof g === 'string')
  const groupNameMap = groupIds.length ? await getGroupDisplayNames(creds, groupIds).catch(() => new Map<string, string>()) : new Map<string, string>()
  const groupNames = Object.fromEntries(groupNameMap)

  return { item, assignments, settings, groupNames }
}
