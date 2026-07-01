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
    conflicts.push({
      id: id(),
      type: 'duplicate_name',
      severity: 'medium',
      title: `Duplicate compliance policy: "${group[0]?.displayName ?? ''}"`,
      description: `${group.length} compliance policies share the same effective name, which causes ambiguity during assignment and troubleshooting.`,
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
    conflicts.push({
      id: id(),
      type: 'duplicate_name',
      severity: 'medium',
      title: `Duplicate configuration profile: "${group[0]?.displayName ?? ''}"`,
      description: `${group.length} configuration profiles share the same effective name. Duplicate profiles may apply conflicting settings to the same device groups.`,
      affectedPolicies: group.map(p => ({ id: p.id, name: p.displayName, type: 'config' as const })),
      recommendation: 'Merge duplicate profiles or assign distinct names and scoped assignments.',
    })
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
