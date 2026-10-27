// Unified "actionable exceptions" list for the Dashboard's Operational Queue
// widget — unions the top N rows from sources that already exist elsewhere
// in this app (stale devices, devices with critical missing patches,
// devices missing endpoint protection) into one row shape. This is v1: three
// sources, not an exhaustive cross-app issue aggregator — a documented scope
// boundary, not an oversight.
//
// Reuses each source's own cached data instead of re-scanning: stale devices
// via the already-running staleDevices service snapshot, security coverage
// via securityInventory.ts's existing fleet-scan cache (exported for this
// purpose), patches via the same getPatchSystems/getFleetCriticalPatches
// calls criticalPatchReport.ts already uses.

import { getStaleDevicesService } from './staleDevices/service.js'
import { filterDevices } from './staleDevices/query.js'
import { getPatchSystems, getFleetCriticalPatches, isPatchApiConfigured } from './endpointCentralPatch.js'
import { isSupportedCriticalPatchClient } from './criticalPatchReport.js'
import { getCachedIfFresh as getSecurityInventoryCacheIfFresh } from '../routes/securityInventory.js'
import { listDevicesMissingAgent } from '../security-agents/service.js'

export type QueuePriority = 'Critical' | 'High' | 'Medium'

export interface OperationalQueueRow {
  deviceId: string
  device: string
  owner: string
  issue: string
  source: string
  ageDays: number | null
  priority: QueuePriority
}

const PRIORITY_RANK: Record<QueuePriority, number> = { Critical: 0, High: 1, Medium: 2 }

/** securityInventory.ts's fleet scan fetches every device's app inventory
 *  (real Graph/ManageEngine calls) when its cache is cold — on a real tenant
 *  this can take well over a minute, far too slow for a Dashboard widget
 *  that loads on every page view. Rather than block the whole Operational
 *  Queue on a cold scan, give it a short budget and just omit this source
 *  for this request if it doesn't finish in time — the next request (or the
 *  Security Posture page, which the user would visit for this detail
 *  anyway) picks up the now-warm cache. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
    promise.then(v => { clearTimeout(timer); resolve(v) }, e => { clearTimeout(timer); reject(e) })
  })
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  return ms >= 0 ? Math.floor(ms / 86_400_000) : null
}

function staleDeviceRows(limit: number): OperationalQueueRow[] {
  const devices = filterDevices(getStaleDevicesService().devices(), { view: 'stale' })
  return [...devices]
    .sort((a, b) => (b.inactiveDays ?? 0) - (a.inactiveDays ?? 0))
    .slice(0, limit)
    .map(d => ({
      deviceId: d.canonicalDeviceId, device: d.deviceName, owner: d.username || d.email || '—',
      issue: `Not checked in (${d.inactiveDays ?? '?'} days)`, source: d.managedBy, ageDays: d.inactiveDays, priority: 'High',
    }))
}

async function criticalPatchRows(limit: number): Promise<OperationalQueueRow[]> {
  if (!isPatchApiConfigured()) return []
  try {
    const [systems, patchesBySystem] = await withTimeout(Promise.all([getPatchSystems(), getFleetCriticalPatches()]), 10_000)
    const affected = systems.filter(isSupportedCriticalPatchClient).filter(s => s.criticalPatchCount > 0)
    return affected
      .sort((a, b) => b.criticalPatchCount - a.criticalPatchCount)
      .slice(0, limit)
      .map(s => {
        const topPatch = patchesBySystem.get(s.detailResourceId)?.[0]
        return {
          deviceId: s.detailResourceId, device: s.names[0] ?? s.resourceId, owner: '—',
          issue: topPatch ? `Missing critical patch (${topPatch.kb ?? topPatch.name})` : `${s.criticalPatchCount} missing critical patch(es)`,
          source: 'Endpoint Central', ageDays: null, priority: 'Critical',
        }
      })
  } catch {
    return []
  }
}

/** Deliberately never triggers securityInventory.ts's fleet scan itself — on
 *  a large real tenant that scan fetches every device's app inventory and
 *  can take minutes, which a passively-reloading Dashboard widget must never
 *  kick off (and must never do so *concurrently* with a real visit to the
 *  Security Posture page, since that route has no in-flight de-duplication).
 *  Only reads the cache if the Security Posture page (or a prior scan) has
 *  already warmed it; otherwise this source is simply empty for now. */
function protectionGapRows(limit: number): OperationalQueueRow[] {
  const cached = getSecurityInventoryCacheIfFresh()
  if (!cached) return []
  const missing = [
    ...listDevicesMissingAgent(cached.statuses, 'Windows', 'crowdstrike'),
    ...listDevicesMissingAgent(cached.statuses, 'macOS', 'crowdstrike'),
  ]
  return missing.slice(0, limit).map(d => ({
    deviceId: d.deviceId, device: d.deviceName, owner: d.primaryUser || '—',
    issue: 'Endpoint protection not installed', source: d.connector, ageDays: daysSince(d.lastSync), priority: 'High',
  }))
}

export interface OperationalQueueResult {
  rows: OperationalQueueRow[]
  generatedAt: string
}

export async function getOperationalQueue(limitPerSource = 10): Promise<OperationalQueueResult> {
  const patches = await criticalPatchRows(limitPerSource)
  const gaps = protectionGapRows(limitPerSource)
  const rows = [...patches, ...staleDeviceRows(limitPerSource), ...gaps].sort((a, b) =>
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (b.ageDays ?? 0) - (a.ageDays ?? 0)
  )
  return { rows, generatedAt: new Date().toISOString() }
}
