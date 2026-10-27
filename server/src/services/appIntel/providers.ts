import { getGroupDisplayNames, graphGetAllV, graphGetV, GRAPH, type TenantCredentials } from '../graphApi.js'
import { getIntuneConfig, getManageEngineConfig } from '../../store/integrationStore.js'
import { getManageEngineAppInventoryWithCoverage, type ManageEngineAppCoverage } from '../manageEngine.js'
import type { IntuneDetectedRow, MdmAppEntry, MobileAppRaw } from './normalize.js'

// Read-only provider access. Microsoft Graph v1.0 only — every field used here (detectedApps,
// mobileApps incl. macOS bundle versions and win32 msiInformation, assignments, managedDevices) is
// available in v1.0, so no beta adapter is needed. Required application permissions (least privilege):
//   DeviceManagementManagedDevices.Read.All  — detectedApps + their managedDevices
//   DeviceManagementApps.Read.All            — mobileApps + assignments
// Pagination, 429/5xx retry and Retry-After handling come from graphApi.graphGetAllV.

export interface AppIntelProviders {
  intuneConfigured(): boolean
  manageEngineConfigured(): boolean
  fetchIntuneDetected(): Promise<IntuneDetectedRow[]>
  fetchIntuneMobileApps(): Promise<MobileAppRaw[]>
  fetchManageEngineApps(): Promise<MdmAppEntry[]>
  /** Device coverage of the most recent fetchManageEngineApps call (null before the first one). */
  manageEngineCoverage?(): ManageEngineAppCoverage | null
  fetchIntuneDevicesForDetectedApp(detectedAppId: string): Promise<IntuneDeviceRef[]>
  fetchIntuneAssignments(packageId: string): Promise<IntuneAssignmentSummary[]>
  /** Entra group display names by id (needs Group.Read.All / Directory.Read.All). Missing ids are simply absent. */
  resolveGroupNames?(ids: string[]): Promise<Record<string, string>>
  probeIntune(): Promise<{ detectedApps: ProbeResult; appCatalog: ProbeResult }>
}

export interface IntuneDeviceRef { id: string; deviceName: string; user: string | null; osVersion: string | null }
export interface IntuneAssignmentSummary { intent: string; target: string; groupId?: string | null; groupName?: string | null }
export type ProbeResult = { ok: true } | { ok: false; status: number | null; message: string }

function creds(): TenantCredentials {
  const c = getIntuneConfig()
  if (!c) throw new Error('Intune is not configured')
  return { tenantId: c.tenantId, clientId: c.clientId, clientSecret: c.clientSecret }
}

async function probe(path: string): Promise<ProbeResult> {
  try {
    // A single page only — graphGetAllV would follow every @odata.nextLink (23k+ detected apps).
    await graphGetV(creds(), GRAPH, path, { '$top': '1' }, { maxRetries: 1 })
    return { ok: true }
  } catch (e) {
    const status = typeof (e as { status?: unknown }).status === 'number' ? (e as { status: number }).status : null
    return { ok: false, status, message: e instanceof Error ? e.message.slice(0, 200) : 'Request failed' }
  }
}

let lastMeCoverage: ManageEngineAppCoverage | null = null

export const liveProviders: AppIntelProviders = {
  intuneConfigured: () => !!getIntuneConfig(),
  manageEngineConfigured: () => !!getManageEngineConfig(),

  async fetchIntuneDetected() {
    return graphGetAllV<IntuneDetectedRow>(creds(), GRAPH, '/deviceManagement/detectedApps', {
      '$top': '1000', '$select': 'id,displayName,version,publisher,deviceCount,platform',
    })
  },

  async fetchIntuneMobileApps() {
    return graphGetAllV<MobileAppRaw>(creds(), GRAPH, '/deviceAppManagement/mobileApps', { '$top': '200' })
  },

  async fetchManageEngineApps() {
    const { entries: inv, coverage } = await getManageEngineAppInventoryWithCoverage()
    lastMeCoverage = coverage
    return [...inv.macos, ...inv.windows].map(e => ({
      appId: e.appId, name: e.name, platform: e.platform,
      logs: e.logs.map(l => ({ deviceId: l.deviceId, deviceName: l.deviceName, version: l.version })),
    }))
  },

  manageEngineCoverage: () => lastMeCoverage,

  async fetchIntuneDevicesForDetectedApp(detectedAppId) {
    const rows = await graphGetAllV<{ id: string; deviceName?: string; userPrincipalName?: string; osVersion?: string }>(
      creds(), GRAPH, `/deviceManagement/detectedApps/${encodeURIComponent(detectedAppId)}/managedDevices`,
      { '$top': '200', '$select': 'id,deviceName,userPrincipalName,osVersion' },
    )
    return rows.map(r => ({ id: r.id, deviceName: r.deviceName ?? 'Unknown', user: r.userPrincipalName ?? null, osVersion: r.osVersion ?? null }))
  },

  async fetchIntuneAssignments(packageId) {
    const rows = await graphGetAllV<{ intent?: string; target?: { '@odata.type'?: string; groupId?: string } }>(
      creds(), GRAPH, `/deviceAppManagement/mobileApps/${encodeURIComponent(packageId)}/assignments`,
    )
    return rows.map(r => ({
      intent: r.intent ?? 'unknown',
      target: (r.target?.['@odata.type'] ?? '').replace('#microsoft.graph.', '').replace('AssignmentTarget', '') || 'unknown',
      groupId: r.target?.groupId ?? null,
    }))
  },

  async resolveGroupNames(ids) {
    // Reuses the shared Graph helper (Group.Read.All); ids Graph does not return are simply absent.
    return Object.fromEntries(await getGroupDisplayNames(creds(), ids))
  },

  async probeIntune() {
    const [detectedApps, appCatalog] = await Promise.all([probe('/deviceManagement/detectedApps'), probe('/deviceAppManagement/mobileApps')])
    return { detectedApps, appCatalog }
  },
}
