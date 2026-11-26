// Live device fetch for one source (Intune or ManageEngine), shared by the database sync and the
// no-database fallback in routes/devices.ts. Pagination, retry and rate-limit handling live in the
// provider services (intune.ts, manageEngine.ts, endpointCentral*.ts); this adds the deadline, the
// ManageEngine MDM + Endpoint Central union, and carry-over of last-known MDM details.

import { getIntuneDevices } from './intune.js'
import { getManageEngineDevices } from './manageEngine.js'
import { getEndpointCentralDevices } from './endpointCentralDevices.js'
import { carryOverMdmDetails } from './mdmDetailCarryOver.js'
import { recordFetchResult } from '../store/integrationStore.js'
import type { DeviceSource } from '../store/deviceSnapshotStore.js'
import type { Device } from '../types.js'

export const SOURCE_FETCH_TIMEOUT_MS = 60_000
// A full Intune fleet pull (~5,000 devices, several Graph pages) takes ~90s, so it needs a longer deadline.
export const INTUNE_FETCH_TIMEOUT_MS = 180_000

/**
 * ManageEngine = MDM devices (iOS/macOS) + Endpoint Central agent devices (Windows). They are fetched
 * independently so one being down never hides the other; only when both fail does the source fail.
 */
export async function getManageEngineFleet(): Promise<Device[]> {
  const [mdm, ec] = await Promise.allSettled([getManageEngineDevices(), getEndpointCentralDevices()])
  if (mdm.status === 'rejected' && ec.status === 'rejected') throw mdm.reason
  if (mdm.status === 'rejected') console.error('[deviceSources] ManageEngine MDM error (showing Endpoint Central only):', mdm.reason)
  if (ec.status === 'rejected') console.error('[deviceSources] Endpoint Central error (showing MDM only):', ec.reason)
  return [...(mdm.status === 'fulfilled' ? mdm.value : []), ...(ec.status === 'fulfilled' ? ec.value : [])]
}

export async function fetchWithDeadline<T>(label: string, fetcher: () => Promise<T>, timeoutMs = SOURCE_FETCH_TIMEOUT_MS): Promise<T> {
  let timeout: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      fetcher(),
      new Promise<T>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error(`${label} device request timed out after ${timeoutMs / 1000}s`)), timeoutMs) }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export interface PreviousDevices { savedAt: string | null; devices: Device[] }

/** One live pull. `previous` (the last good list) lets ManageEngine keep MDM details it could not re-read this time. */
export async function fetchSourceDevices(source: DeviceSource, previous: PreviousDevices | null): Promise<Device[]> {
  const t0 = Date.now()
  const list = await (source === 'intune'
    ? fetchWithDeadline('Intune', getIntuneDevices, INTUNE_FETCH_TIMEOUT_MS)
    : fetchWithDeadline('ManageEngine', getManageEngineFleet))
  recordFetchResult(source, { deviceCount: list.length, lastFetchAt: Date.now(), latencyMs: Date.now() - t0, error: null })
  if (source !== 'manageengine') return list
  const merged = carryOverMdmDetails(list, previous?.devices ?? null, previous?.savedAt ?? null)
  if (merged.unread > 0) console.warn(`[deviceSources] ManageEngine MDM details unread for ${merged.unread}/${merged.mdmTotal} devices (${merged.carried} kept from the last good sync)${merged.degraded ? ' - DEGRADED: check the ManageEngine token / rate limits' : ''}`)
  return merged.devices
}
