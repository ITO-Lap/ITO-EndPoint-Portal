import { getGroupDisplayNames, graphGetAllV, graphGetAllResumable, graphGetV, GRAPH, TransientGraphError, type PagedProgress, type TenantCredentials } from '../graphApi.js'
import { getIntuneConfig, getManageEngineConfig } from '../../store/integrationStore.js'
import { getManageEngineAppInventoryWithCoverage, type ManageEngineAppCoverage } from '../manageEngine.js'
import { dataFile, readJsonFile, writeJsonAtomic } from '../../store/dataDir.js'
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
  /** The last successful detected-apps read, used when Graph is throttled so the page keeps showing known data. */
  lastGoodDetected?(): { savedAt: string; rows: IntuneDetectedRow[] } | null
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

const detectedCacheFile = () => dataFile('cache/intune-detected-apps.v1.json')

export const liveProviders: AppIntelProviders = {
  intuneConfigured: () => !!getIntuneConfig(),
  manageEngineConfigured: () => !!getManageEngineConfig(),

  async fetchIntuneDetected() {
    // detectedApps is large and Graph throttles it hard. Pages are spaced out, a throttled page is
    // retried with Retry-After, and if retries run out the pages already read are kept: the next round
    // (after a cool-down) continues from the failed page instead of starting the whole read again.
    const progress: PagedProgress<IntuneDetectedRow> = { rows: [], nextUrl: null }
    let rows: IntuneDetectedRow[] = []
    for (let round = 0; ; round++) {
      try {
        rows = await graphGetAllResumable<IntuneDetectedRow>(creds(), GRAPH, '/deviceManagement/detectedApps', {
          '$top': '500', '$select': 'id,displayName,version,publisher,deviceCount,platform',
        }, progress, { maxRetries: 6, pageDelayMs: process.env.NODE_ENV === 'test' ? 0 : 400 })
        break
      } catch (e) {
        if (!(e instanceof TransientGraphError) || round >= 3 || process.env.NODE_ENV === 'test') throw e
        console.warn(`[app-intel] detectedApps throttled after ${progress.rows.length} rows; cooling down before resuming (round ${round + 1}/3)`)
        await new Promise(r => setTimeout(r, 60_000 * (round + 1)))
      }
    }
    if (rows.length && process.env.NODE_ENV !== 'test') {
      try { writeJsonAtomic(detectedCacheFile(), { savedAt: new Date().toISOString(), rows }) }
      catch (e) { console.warn('[app-intel] could not save detected-apps cache:', e instanceof Error ? e.message : e) }
    }
    return rows
  },

  lastGoodDetected() {
    const saved = readJsonFile<{ savedAt: string; rows: IntuneDetectedRow[] }>(detectedCacheFile())
    return saved && Array.isArray(saved.rows) && saved.rows.length ? saved : null
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
