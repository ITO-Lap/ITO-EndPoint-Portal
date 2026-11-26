// Users, derived from the stored Intune device list instead of downloading every device from Graph a second time.
// (The Users page used to page the whole fleet again just to group devices by user, about 90 seconds on a
// 5,000-device tenant. The stored devices already carry everything it needs.)

import type { Device } from '../types.js'
import type { IntuneUserSummary } from './intune.js'

/** "avinash.verma@zinnia.com" -> "Avinash Verma": the fallback when no directory name is known. */
export function nameFromUpn(upn: string): string {
  const local = upn.split('@')[0] ?? upn
  const words = local.split(/[._-]+/).filter(Boolean)
  return words.length ? words.map(w => w[0]!.toUpperCase() + w.slice(1)).join(' ') : upn
}

const COMPLIANCE_RANK = { 'Non-Compliant': 2, Warning: 1, Compliant: 0 } as const

/**
 * One summary per user (by lower-cased UPN) over the Intune devices in `devices`.
 * `displayNames` (UPN -> name, for example from Entra) is preferred over the name derived from the address.
 */
export function deriveUserSummaries(devices: Device[], displayNames: ReadonlyMap<string, string> = new Map()): IntuneUserSummary[] {
  const byUpn = new Map<string, Device[]>()
  for (const d of devices) {
    if (d.managementSource !== 'Microsoft Intune') continue
    const upn = (d.user ?? '').trim().toLowerCase()
    if (!upn || !upn.includes('@')) continue // no signed-in user, or a placeholder such as "Unknown"
    byUpn.set(upn, [...(byUpn.get(upn) ?? []), d])
  }

  return [...byUpn.entries()].map(([upn, list]) => {
    const times = list.map(d => Date.parse(d.lastCheckIn)).filter(Number.isFinite)
    const worst = list.reduce<Device['complianceState']>((w, d) => (COMPLIANCE_RANK[d.complianceState] > COMPLIANCE_RANK[w] ? d.complianceState : w), 'Compliant')
    return {
      upn,
      displayName: displayNames.get(upn) || nameFromUpn(upn),
      lastSyncDateTime: new Date(times.length ? Math.max(...times) : 0).toISOString(),
      complianceState: worst,
      devices: list.map(d => ({
        deviceName: d.deviceName,
        platform: d.platform,
        complianceState: d.complianceState,
        lastCheckIn: d.lastCheckIn,
        encryptionStatus: d.encryptionStatus,
        managementSource: 'Microsoft Intune' as const,
      })),
    }
  })
}
