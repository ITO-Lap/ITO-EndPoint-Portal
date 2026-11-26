import type { Device } from '../types.js'
import type { PatchSystemStatus } from './endpointCentralPatch.js'

// One place that decides "which Intune / Endpoint Central MDM / Endpoint Central agent / Patch Manager rows are the
// same physical device". Everything that needs a second view of a device (Security Posture today) reads the result
// instead of re-matching on its own, so matching rules and their diagnostics can never drift apart.
//
// Key strength, strongest first: Endpoint Central resource id → serial → MAC address → host name. Host name is only
// used when exactly one row in the whole picture carries it — a shared name is left unmatched rather than guessed.

export const hostKey = (n: string): string => n.trim().toLowerCase().split('.')[0] ?? ''
export const macKey = (m: string | undefined): string => (m ?? '').toLowerCase().replace(/[^0-9a-f]/g, '')

export function buildPatchIndex(devices: Device[], systems: PatchSystemStatus[] | null): Map<string, PatchSystemStatus> | null {
  if (!systems) return null
  const haystacks = systems.map(s => ({ s, text: s.names.join(' ').toUpperCase() }))
  const index = new Map<string, PatchSystemStatus>()
  for (const d of devices) {
    const serial = (d.serialNumber ?? '').trim().toUpperCase()
    if (serial.length < 6 || serial === 'UNKNOWN' || index.has(serial)) continue
    const hit = haystacks.find(h => h.text.includes(serial))
    if (hit) index.set(serial, hit.s)
  }
  return index
}

export type MatchKey = 'resource-id' | 'serial' | 'mac' | 'hostname'

export interface ReconciledDevice {
  /** Endpoint Central agent row for an Intune-enrolled Windows device (hybrid). */
  ec?: Device
  ecMatchedBy?: MatchKey
  /** Patch Manager system for this device. */
  patch?: PatchSystemStatus
  patchMatchedBy?: MatchKey
  /** The device's host name is shared by other rows, so name matching was refused for it. */
  ambiguousName: boolean
}

export interface Reconciliation {
  byDeviceId: Map<string, ReconciledDevice>
  /** Endpoint Central agent rows that are neither inventory devices nor the second view of one. */
  unmatchedEc: Device[]
  /** Patch Manager systems that no inventory device resolved to. */
  unmatchedPatch: PatchSystemStatus[]
  ambiguousNames: Set<string>
}

export function reconcileDevices(devices: Device[], systems: PatchSystemStatus[] | null, ecDevices: Device[] = []): Reconciliation {
  const ambiguousNames = new Set<string>()
  // A name is ambiguous when it repeats WITHIN one source (two Intune devices, two agent rows, two patch systems).
  // The same name appearing once in each source is exactly what a hybrid device looks like, not a collision.
  const inventoryIds = new Set(devices.map(d => d.id))
  const extraEc = ecDevices.filter(e => !inventoryIds.has(e.id))
  const markRepeats = (names: string[]) => {
    const seen = new Set<string>()
    for (const k of names) { if (!k) continue; if (seen.has(k)) ambiguousNames.add(k); seen.add(k) }
  }
  markRepeats(devices.filter(d => d.platform === 'Windows' || d.platform === 'macOS').map(d => hostKey(d.deviceName)))
  markRepeats(ecDevices.map(e => hostKey(e.deviceName)))
  const sysByName = new Map<string, PatchSystemStatus>()
  const sysById = new Map<string, PatchSystemStatus>()
  for (const sys of systems ?? []) {
    if (sys.detailResourceId) sysById.set(sys.detailResourceId, sys)
    for (const k of new Set(sys.names.map(hostKey).filter(Boolean))) {
      const prev = sysByName.get(k)
      if (prev && prev !== sys) ambiguousNames.add(k); else sysByName.set(k, sys)
    }
  }

  const ecByName = new Map<string, Device>()
  const ecByMac = new Map<string, Device>()
  for (const e of ecDevices) {
    const k = hostKey(e.deviceName); if (k && !ecByName.has(k)) ecByName.set(k, e)
    const m = macKey(e.macAddress); if (m) ecByMac.set(m, e)
  }
  const serialIndex = buildPatchIndex(devices, systems)

  const byDeviceId = new Map<string, ReconciledDevice>()
  const matchedPatch = new Set<PatchSystemStatus>()
  const matchedEc = new Set<Device>()

  for (const d of devices) {
    const k = hostKey(d.deviceName)
    const ambiguous = ambiguousNames.has(k)
    const rec: ReconciledDevice = { ambiguousName: ambiguous }

    if (d.managementSource === 'Microsoft Intune' && d.platform === 'Windows') {
      const viaMac = [d.macAddress, d.wifiMacAddress].map(macKey).filter(Boolean).map(m => ecByMac.get(m)).find(Boolean)
      if (viaMac) { rec.ec = viaMac; rec.ecMatchedBy = 'mac' }
      else if (!ambiguous && ecByName.has(k)) { rec.ec = ecByName.get(k)!; rec.ecMatchedBy = 'hostname' }
      if (rec.ec) matchedEc.add(rec.ec)
    }

    if (d.id.startsWith('ec-') && sysById.has(d.id.slice(3))) { rec.patch = sysById.get(d.id.slice(3))!; rec.patchMatchedBy = 'resource-id' }
    else if (serialIndex?.has((d.serialNumber ?? '').toUpperCase())) { rec.patch = serialIndex.get((d.serialNumber ?? '').toUpperCase())!; rec.patchMatchedBy = 'serial' }
    else if (rec.ec && sysById.has(rec.ec.id.slice(3))) { rec.patch = sysById.get(rec.ec.id.slice(3))!; rec.patchMatchedBy = 'resource-id' }
    else if (!ambiguous && sysByName.has(k)) { rec.patch = sysByName.get(k)!; rec.patchMatchedBy = 'hostname' }
    if (rec.patch) matchedPatch.add(rec.patch)
    byDeviceId.set(d.id, rec)
  }

  return {
    byDeviceId,
    unmatchedEc: extraEc.filter(e => !matchedEc.has(e)),
    unmatchedPatch: (systems ?? []).filter(s => !matchedPatch.has(s)),
    ambiguousNames,
  }
}

export interface ReconcileDiagnostics {
  generatedAt: string
  devices: { total: number; byPlatform: Record<string, number> }
  hybrid: { windowsIntune: number; withAgentRow: number; matchedBy: Record<string, number> }
  patch: { loaded: boolean; systems: number; matchedBy: Record<string, number>; devicesWithoutPatchRow: Record<string, number> }
  ambiguousNames: number
  unmatched: { agentRows: number; patchSystems: { windows: number; mac: number; other: number } }
  samples: {
    ambiguous: Array<{ name: string; platform: string; source: string }>
    unmatchedPatchSystems: Array<{ name: string; platform: string }>
    unmatchedAgentRows: Array<{ name: string; platform: string }>
  }
}

const tally = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1 }
const SAMPLE = 200

export function buildDiagnostics(devices: Device[], systems: PatchSystemStatus[] | null, ecDevices: Device[], now = Date.now()): ReconcileDiagnostics {
  const r = reconcileDevices(devices, systems, ecDevices)
  const byPlatform: Record<string, number> = {}
  const ecBy: Record<string, number> = {}
  const patchBy: Record<string, number> = {}
  const noPatch: Record<string, number> = {}
  let windowsIntune = 0, withAgentRow = 0
  const ambiguous: ReconcileDiagnostics['samples']['ambiguous'] = []
  for (const d of devices) {
    tally(byPlatform, d.platform)
    const rec = r.byDeviceId.get(d.id)!
    if (d.managementSource === 'Microsoft Intune' && d.platform === 'Windows') {
      windowsIntune++
      if (rec.ec) { withAgentRow++; tally(ecBy, rec.ecMatchedBy!) }
    }
    if (d.platform === 'Windows' || d.platform === 'macOS') {
      if (rec.patch) tally(patchBy, rec.patchMatchedBy!); else tally(noPatch, d.platform)
    }
    if (rec.ambiguousName && ambiguous.length < SAMPLE) ambiguous.push({ name: d.deviceName, platform: d.platform, source: d.managementSource })
  }
  const up = r.unmatchedPatch
  return {
    generatedAt: new Date(now).toISOString(),
    devices: { total: devices.length, byPlatform },
    hybrid: { windowsIntune, withAgentRow, matchedBy: ecBy },
    patch: { loaded: systems !== null, systems: systems?.length ?? 0, matchedBy: patchBy, devicesWithoutPatchRow: noPatch },
    ambiguousNames: r.ambiguousNames.size,
    unmatched: {
      agentRows: r.unmatchedEc.length,
      patchSystems: { windows: up.filter(s => s.platform === 'Windows').length, mac: up.filter(s => s.platform === 'Mac').length, other: up.filter(s => s.platform !== 'Windows' && s.platform !== 'Mac').length },
    },
    samples: {
      ambiguous,
      unmatchedPatchSystems: up.slice(0, SAMPLE).map(s => ({ name: s.names[0] ?? s.resourceId, platform: s.platform })),
      unmatchedAgentRows: r.unmatchedEc.slice(0, SAMPLE).map(e => ({ name: e.deviceName, platform: e.platform })),
    },
  }
}
