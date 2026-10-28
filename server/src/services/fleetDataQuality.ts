// Data-quality checks for reports built from the merged MDM device list
// (fetchAllDevices: Microsoft Intune via Graph + ManageEngine). They answer:
// did every source answer, does the Intune count match Graph, are devices
// counted twice, and which devices could not be classified.

import type { Device } from '../types.js'
import type { PatchSystemStatus } from './endpointCentralPatch.js'
import { isSupportedCriticalPatchClient } from './criticalPatchReport.js'
import { credentialsFromEnv, getGraphCount, type TenantCredentials } from './graphApi.js'
import { getIntuneConfig } from '../store/integrationStore.js'
import { ok, warn, info, reconcileCount, type DataCheck } from './dataQuality.js'

const SOURCE_LABEL = { intune: 'Microsoft Intune', manageengine: 'ManageEngine' } as const
const PLACEHOLDER_SERIALS = new Set(['', 'unknown', '0', 'none', 'n/a', 'default string', 'system serial number', 'to be filled by o.e.m.', 'not specified'])
const n = (v: number) => v.toLocaleString('en-US')

export function intuneGraphCredentials(): TenantCredentials | null {
  const cfg = getIntuneConfig()
  if (cfg) return { tenantId: cfg.tenantId, clientId: cfg.clientId, clientSecret: cfg.clientSecret }
  try { return credentialsFromEnv() } catch { return null }
}

/** Intune managed-device count straight from Graph, or null if it could not be read. */
export async function getIntuneGraphCount(): Promise<number | null> {
  const creds = intuneGraphCredentials()
  return creds ? getGraphCount(creds, '/deviceManagement/managedDevices') : null
}

const serialKey = (d: Device): string | null => {
  const s = d.serialNumber?.trim().toUpperCase() ?? ''
  return PLACEHOLDER_SERIALS.has(s.toLowerCase()) ? null : s
}

/** Runs the Graph count (when there are Intune devices) and builds the fleet checks for a fetchAllDevices result. */
export async function collectFleetDataChecks(fetched: Pick<FleetCheckInput, 'devices' | 'failedSources' | 'staleSources'>): Promise<DataCheck[]> {
  const hasIntune = fetched.devices.some(d => d.managementSource === SOURCE_LABEL.intune)
  return buildFleetDataChecks({ ...fetched, graphIntuneCount: hasIntune ? await getIntuneGraphCount() : null })
}

export interface FleetCheckInput {
  devices: Device[]
  failedSources?: Array<{ source: 'intune' | 'manageengine'; error: string }> | undefined
  /** Sources that were unreachable; their last saved list is what `devices` holds. */
  staleSources?: Array<{ source: 'intune' | 'manageengine'; savedAt: string }> | undefined
  graphIntuneCount: number | null
}

export function buildFleetDataChecks({ devices, failedSources = [], staleSources = [], graphIntuneCount }: FleetCheckInput): DataCheck[] {
  const checks: DataCheck[] = []
  const bySource = (label: string) => devices.filter(d => d.managementSource === label)
  const intune = bySource(SOURCE_LABEL.intune)
  const me = bySource(SOURCE_LABEL.manageengine)

  // 1. Did every configured source answer?
  if (failedSources.length) {
    for (const f of failedSources) checks.push(warn('Source completeness', `${SOURCE_LABEL[f.source]} did not return data (${f.error}). Every figure in this report excludes it.`))
  } else if (!staleSources.length) {
    checks.push(ok('Source completeness', `Every configured source answered (Intune ${n(intune.length)}, ManageEngine ${n(me.length)}).`))
  }

  for (const st of staleSources) checks.push(warn('Source freshness', `${SOURCE_LABEL[st.source]} could not be reached, so its figures are from the last good sync at ${st.savedAt.slice(0, 16).replace('T', ' ')} UTC.`))

  // 2. Intune rows vs Microsoft Graph's own count (skipped when Intune itself failed or is absent).
  if (!failedSources.some(f => f.source === 'intune') && !staleSources.some(f => f.source === 'intune') && intune.length > 0) checks.push(reconcileCount('Intune count vs Microsoft Graph', intune.length, graphIntuneCount))

  // 3. The same physical device enrolled in both sources is counted in both.
  const intuneSerials = new Set(intune.map(serialKey).filter((s): s is string => !!s))
  const both = new Set(me.map(serialKey).filter((s): s is string => !!s && intuneSerials.has(s)))
  if (both.size > 0) checks.push(warn('Devices in both sources', `${n(both.size)} device${both.size === 1 ? ' appears' : 's appear'} in both Intune and ManageEngine (same serial number) and ${both.size === 1 ? 'is' : 'are'} counted in both, so "managed devices" overstates unique devices by up to ${n(both.size)}.`))
  else if (intune.length && me.length) checks.push(ok('Devices in both sources', 'No serial number appears in both Intune and ManageEngine.'))

  // 4. Devices whose last check-in cannot be read are invisible to staleness.
  const unreadable = devices.filter(d => !Number.isFinite(Date.parse(d.lastCheckIn))).length
  if (unreadable > 0) checks.push(warn('Unreadable check-in dates', `${n(unreadable)} device${unreadable === 1 ? ' has' : 's have'} no readable last check-in and are not counted as stale or fresh.`))
  else checks.push(ok('Unreadable check-in dates', 'Every device has a readable last check-in.'))

  const noSerial = devices.filter(d => !serialKey(d)).length
  if (noSerial > 0) checks.push(info('Missing serial numbers', `${n(noSerial)} device${noSerial === 1 ? ' has' : 's have'} no usable serial number, so cross-source duplicate matching cannot cover ${noSerial === 1 ? 'it' : 'them'}.`))
  return checks
}

/** Patch Manager coverage and scan health, compared with the Windows/macOS devices in MDM. */
export function buildPatchDataChecks(devices: Device[], patchSystems: PatchSystemStatus[] | null): DataCheck[] {
  if (!patchSystems) return [warn('Patch Manager', 'Patch Manager was unavailable, so critical patch figures are missing, not zero.')]
  const checks: DataCheck[] = []
  const clients = patchSystems.filter(isSupportedCriticalPatchClient)
  const failed = clients.filter(s => !s.scanSucceeded).length
  checks.push(failed > 0
    ? warn('Patch scan health', `${n(failed)} of ${n(clients.length)} Windows/macOS endpoints in Patch Manager have a failed scan and are excluded from the critical patch count, so it is a minimum.`)
    : ok('Patch scan health', `All ${n(clients.length)} Windows/macOS endpoints in Patch Manager scanned successfully.`))
  const eligible = devices.filter(d => d.platform === 'Windows' || d.platform === 'macOS').length
  if (eligible > 0) {
    const ratio = clients.length / eligible
    checks.push(ratio < 0.9 || ratio > 1.1
      ? warn('Patch Manager coverage', `Patch Manager reports ${n(clients.length)} Windows/macOS endpoints but MDM has ${n(eligible)}; devices without the patch agent are invisible to the critical patch figure.`)
      : ok('Patch Manager coverage', `Patch Manager reports ${n(clients.length)} Windows/macOS endpoints against ${n(eligible)} in MDM.`))
  }
  return checks
}
