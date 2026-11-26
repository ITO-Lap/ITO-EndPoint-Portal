// Policy conflict detection service.
// Analyses compliance policies and configuration profiles to surface
// duplicates, stale policies, and scope conflicts without requiring Graph write permissions.

import type { GraphCompliancePolicy, GraphConfigProfile } from './graphApi.js'

export type ConflictType = 'duplicate_name' | 'stale_policy' | 'scope_conflict' | 'version_drift'
export type ConflictSeverity = 'low' | 'medium' | 'high'

export interface PolicyRef {
  id: string
  name: string
  type: 'compliance' | 'config'
}

export interface PolicyConflict {
  id: string
  type: ConflictType
  severity: ConflictSeverity
  title: string
  description: string
  affectedPolicies: PolicyRef[]
  recommendation: string
}

const STALE_THRESHOLD_DAYS = 180

function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86_400_000
}

function normalise(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').trim()
}

/** True when two or more policies in the group target the same platform. */
function hasSamePlatformPair(group: Array<{ platformType: string }>): boolean {
  const seen = new Set<string>()
  for (const p of group) {
    const key = (p.platformType ?? '').toLowerCase()
    if (seen.has(key)) return true
    seen.add(key)
  }
  return false
}

/** The distinct versions (ascending) when same-platform copies disagree, else null. */
function driftingVersions(group: GraphConfigProfile[]): number[] | null {
  const byPlatform = new Map<string, Set<number>>()
  for (const p of group) {
    if (typeof p.version !== 'number') continue
    const key = (p.platformType ?? '').toLowerCase()
    byPlatform.set(key, (byPlatform.get(key) ?? new Set()).add(p.version))
  }
  for (const versions of byPlatform.values()) if (versions.size > 1) return [...versions].sort((a, b) => a - b)
  return null
}

export function detectConflicts(
  compliancePolicies: GraphCompliancePolicy[],
  configProfiles: GraphConfigProfile[]
): PolicyConflict[] {
  const conflicts: PolicyConflict[] = []
  let idx = 0
  const id = () => `conflict-${++idx}`

  // ── 1. Duplicate display names within compliance policies ─────────────────
  const compByName = new Map<string, GraphCompliancePolicy[]>()
  for (const p of compliancePolicies) {
    const key = normalise(p.displayName)
    if (!compByName.has(key)) compByName.set(key, [])
    compByName.get(key)!.push(p)
  }
  for (const [, group] of compByName) {
    if (group.length < 2) continue
    const samePlatform = hasSamePlatformPair(group)
    conflicts.push({
      id: id(),
      type: 'duplicate_name',
      // Same name AND same platform is the real collision (both can be assigned to the same devices); across platforms it is mainly confusing.
      severity: samePlatform ? 'high' : 'medium',
      title: `Duplicate compliance policy: "${group[0]?.displayName ?? ''}"`,
      description: `${group.length} compliance policies share the same effective name, which causes ambiguity during assignment and troubleshooting.${samePlatform ? ' At least two target the same platform, so they can be assigned to the same devices.' : ''}`,
      affectedPolicies: group.map(p => ({ id: p.id, name: p.displayName, type: 'compliance' as const })),
      recommendation: 'Consolidate into a single policy or rename each to reflect its distinct scope (e.g., by platform or department).',
    })
  }

  // ── 2. Duplicate display names within config profiles ─────────────────────
  const configByName = new Map<string, GraphConfigProfile[]>()
  for (const p of configProfiles) {
    const key = normalise(p.displayName)
    if (!configByName.has(key)) configByName.set(key, [])
    configByName.get(key)!.push(p)
  }
  for (const [, group] of configByName) {
    if (group.length < 2) continue
    const samePlatform = hasSamePlatformPair(group)
    conflicts.push({
      id: id(),
      type: 'duplicate_name',
      severity: samePlatform ? 'high' : 'medium',
      title: `Duplicate configuration profile: "${group[0]?.displayName ?? ''}"`,
      description: `${group.length} configuration profiles share the same effective name. Duplicate profiles may apply conflicting settings to the same device groups.${samePlatform ? ' At least two target the same platform.' : ''}`,
      affectedPolicies: group.map(p => ({ id: p.id, name: p.displayName, type: 'config' as const })),
      recommendation: 'Merge duplicate profiles or assign distinct names and scoped assignments.',
    })
    // Copies of one profile at different versions: devices get different settings depending on which copy they are assigned.
    const drift = driftingVersions(group)
    if (drift) {
      conflicts.push({
        id: id(),
        type: 'version_drift',
        severity: 'medium',
        title: `Version drift: "${group[0]?.displayName ?? ''}"`,
        description: `Copies of this profile on the same platform are at different versions (${drift.join(', ')}), so the settings a device receives depend on which copy is assigned to it.`,
        affectedPolicies: group.map(p => ({ id: p.id, name: p.displayName, type: 'config' as const })),
        recommendation: 'Keep one authoritative copy at the intended version and retire or re-point the others.',
      })
    }
  }

  // ── 3. Stale policies (not modified in > 180 days) ────────────────────────
  for (const p of compliancePolicies) {
    const age = daysSince(p.lastModifiedDateTime)
    if (age > STALE_THRESHOLD_DAYS) {
      conflicts.push({
        id: id(),
        type: 'stale_policy',
        severity: 'low',
        title: `Stale compliance policy: "${p.displayName}"`,
        description: `This policy has not been reviewed in ${Math.floor(age)} days and may not reflect current security requirements.`,
        affectedPolicies: [{ id: p.id, name: p.displayName, type: 'compliance' }],
        recommendation: 'Review and update or archive this policy. Confirm it still reflects current CIS/NIST baselines.',
      })
    }
  }

  for (const p of configProfiles) {
    const age = daysSince(p.lastModifiedDateTime)
    if (age > STALE_THRESHOLD_DAYS) {
      conflicts.push({
        id: id(),
        type: 'stale_policy',
        severity: 'low',
        title: `Stale configuration profile: "${p.displayName}"`,
        description: `This profile has not been reviewed in ${Math.floor(age)} days.`,
        affectedPolicies: [{ id: p.id, name: p.displayName, type: 'config' }],
        recommendation: 'Review for relevance or archive if no longer needed.',
      })
    }
  }

  // ── 4. Cross-type name overlap (compliance & config share similar name) ────
  for (const comp of compliancePolicies) {
    const compKey = normalise(comp.displayName)
    for (const cfg of configProfiles) {
      const cfgKey = normalise(cfg.displayName)
      if (compKey === cfgKey) {
        conflicts.push({
          id: id(),
          type: 'scope_conflict',
          severity: 'medium',
          title: `Name collision: "${comp.displayName}"`,
          description: `A compliance policy and a configuration profile share the same name. This often indicates accidental duplication or scope confusion.`,
          affectedPolicies: [
            { id: comp.id, name: comp.displayName, type: 'compliance' },
            { id: cfg.id, name: cfg.displayName, type: 'config' },
          ],
          recommendation: 'Rename one of the policies to disambiguate. Ensure assignments are intentionally distinct.',
        })
      }
    }
  }

  return conflicts
}

export function conflictSummary(conflicts: PolicyConflict[]): {
  total: number
  high: number
  medium: number
  low: number
  byType: Record<ConflictType, number>
} {
  return {
    total:  conflicts.length,
    high:   conflicts.filter(c => c.severity === 'high').length,
    medium: conflicts.filter(c => c.severity === 'medium').length,
    low:    conflicts.filter(c => c.severity === 'low').length,
    byType: {
      duplicate_name: conflicts.filter(c => c.type === 'duplicate_name').length,
      stale_policy:   conflicts.filter(c => c.type === 'stale_policy').length,
      scope_conflict: conflicts.filter(c => c.type === 'scope_conflict').length,
      version_drift:  conflicts.filter(c => c.type === 'version_drift').length,
    },
  }
}
