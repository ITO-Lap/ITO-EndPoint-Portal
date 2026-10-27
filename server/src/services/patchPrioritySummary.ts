// Fleet-wide patch priority aggregation for the Dashboard's "Patch priority"
// panel — Windows/macOS severity counts, and the top missing Critical
// patches by how many devices are missing them. Built on the same data
// criticalPatchReport.ts already fetches (getPatchSystems, getFleetCriticalPatches);
// no new upstream calls.
//
// Scope note: "top patches" only covers Critical severity, because
// getFleetCriticalPatches() only fetches Critical-severity missing patches
// fleet-wide (Important/Moderate/Low aren't fetched in bulk anywhere in this
// codebase today) — the severity *counts* below are real per-device totals
// across all four severities, just the per-patch breakdown list is
// Critical-only.

import { getPatchSystems, getFleetCriticalPatches, type PatchSystemStatus, type MissingPatch } from './endpointCentralPatch.js'
import { isSupportedCriticalPatchClient } from './criticalPatchReport.js'

export interface PatchSeverityCounts {
  critical: number
  high: number
  other: number
}

export interface TopMissingPatch {
  name: string
  kb: string | null
  severity: string
  deviceCount: number
}

export interface PatchPrioritySummary {
  windows: PatchSeverityCounts
  macos: PatchSeverityCounts
  topPatches: { windows: TopMissingPatch[]; macos: TopMissingPatch[] }
  generatedAt: string
}

function severityCounts(systems: PatchSystemStatus[]): PatchSeverityCounts {
  return systems.reduce<PatchSeverityCounts>((acc, s) => {
    acc.critical += s.criticalPatchCount
    acc.high += s.importantPatchCount
    acc.other += s.moderatePatchCount + s.lowPatchCount
    return acc
  }, { critical: 0, high: 0, other: 0 })
}

function topPatchesFor(systems: PatchSystemStatus[], patchesBySystem: Map<string, MissingPatch[]>, limit: number): TopMissingPatch[] {
  const byPatch = new Map<string, { name: string; kb: string | null; severity: string; deviceIds: Set<string> }>()
  for (const system of systems) {
    const patches = patchesBySystem.get(system.detailResourceId) ?? []
    for (const patch of patches) {
      const key = patch.kb ?? patch.patchId
      const existing = byPatch.get(key)
      if (existing) {
        existing.deviceIds.add(system.detailResourceId)
      } else {
        byPatch.set(key, { name: patch.description || patch.name, kb: patch.kb, severity: patch.severity, deviceIds: new Set([system.detailResourceId]) })
      }
    }
  }
  return [...byPatch.values()]
    .map(e => ({ name: e.name, kb: e.kb, severity: e.severity, deviceCount: e.deviceIds.size }))
    .sort((a, b) => b.deviceCount - a.deviceCount)
    .slice(0, limit)
}

export async function getPatchPrioritySummary(force = false): Promise<PatchPrioritySummary> {
  const [systems, criticalBySystem] = await Promise.all([getPatchSystems(force), getFleetCriticalPatches(force)])
  const clients = systems.filter(isSupportedCriticalPatchClient)
  const windowsClients = clients.filter(s => s.platform === 'Windows')
  const macClients = clients.filter(s => s.platform === 'Mac')

  return {
    windows: severityCounts(windowsClients),
    macos: severityCounts(macClients),
    topPatches: {
      windows: topPatchesFor(windowsClients, criticalBySystem, 3),
      macos: topPatchesFor(macClients, criticalBySystem, 3),
    },
    generatedAt: new Date().toISOString(),
  }
}
