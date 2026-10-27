import { compareVersions } from './version.js'
import type { AssessedApp, ProviderId } from './types.js'
import type { IntuneAssignmentSummary } from './providers.js'

// Application-lifecycle facts derived from data the connected systems actually report. Nothing here is
// guessed: an owner is only what Intune records on the matched package, a ring is only read from assignment
// targets / group names, and an absent value stays null so the UI can say "not recorded".

export type AssignmentIndexFull = Record<string, IntuneAssignmentSummary[] | 'unavailable'>

export interface OwnerInfo {
  /** Intune mobileApp.owner of the matched package(s); null when no package records one. */
  name: string | null
  source: string | null
  /** Distinct owners when several matched packages disagree. */
  all: string[]
  note: string | null
}

export interface RingTarget { intent: string; target: string; groupName: string | null; packageName: string }
export interface RingInfo {
  /** e.g. "Pilot → Ring 1 → Broad", "All devices". Null when nothing could be identified. */
  ring: string | null
  /** target = read directly from the assignment (All users / All devices); group-name = inferred from a group's display name. */
  basis: 'assignment-target' | 'group-name' | 'none'
  targets: RingTarget[]
  note: string | null
}

export type PackagingState = 'current' | 'behind' | 'no-package' | 'unknown' | 'not-applicable'
export interface PackagingInfo {
  state: PackagingState
  packageName: string | null
  packageCount: number
  deployedVersion: string | null
  latestVersion: string | null
  lastModifiedAt: string | null
  summary: string
}

export interface ImpactInfo {
  devicesBehind: number
  totalDevices: number
  percentBehind: number | null
  byVersion: Array<{ version: string; deviceCount: number; provider: ProviderId }>
  basis: string
}

export interface AppLifecycle { owner: OwnerInfo; ring: RingInfo; packaging: PackagingInfo; impact: ImpactInfo }

const IMPACT_BASIS = 'Estimate from detected-app counts per version (Intune detectedApps / ManageEngine MDM). A device can appear under more than one version or provider, so this can overstate unique devices.'

// ── Owner ─────────────────────────────────────────────────────────────────────────────────────────

export function ownerOf(app: AssessedApp): OwnerInfo {
  const strong = app.packages.filter(p => p.matchBasis !== 'name')
  const pool = strong.length ? strong : app.packages
  const all = [...new Set(pool.map(p => (p.owner ?? '').trim()).filter(Boolean))]
  if (!all.length) {
    return { name: null, source: null, all: [], note: pool.length ? 'The matched Intune package has no owner recorded.' : 'No Intune package for this app, so no owner is recorded. The publisher is the vendor, not an internal owner.' }
  }
  return {
    name: all[0]!, source: 'Intune package owner field', all,
    note: all.length > 1 ? `Matched packages record different owners: ${all.join(', ')}.` : strong.length ? null : 'From a name-matched package (low confidence).',
  }
}

// ── Deployment ring ───────────────────────────────────────────────────────────────────────────────

const ORDER = { test: 0, pilot: 1, ring: 2, broad: 3 } as const
interface Label { kind: keyof typeof ORDER; text: string; n: number }

/** Reads a ring label from a group display name using common naming conventions. Returns null if none match. */
export function ringLabelFromGroupName(name: string): Label | null {
  const ringN = /\b(ring|wave|phase|stage)[\s_-]*(\d+)\b/i.exec(name)
  if (ringN) return { kind: 'ring', text: `Ring ${ringN[2]}`, n: Number(ringN[2]) }
  if (/\b(pilot|canary|early[\s_-]?adopters?|preview|beta|insiders?)\b/i.test(name)) return { kind: 'pilot', text: 'Pilot', n: 0 }
  if (/\b(uat|qa|test(ing)?)\b/i.test(name)) return { kind: 'test', text: 'Test', n: 0 }
  if (/\b(broad|production|prod|general[\s_-]?availability|ga|all[\s_-]?(users|staff|employees)|everyone)\b/i.test(name)) return { kind: 'broad', text: 'Broad', n: 0 }
  return null
}

export function ringOf(app: AssessedApp, assignments: AssignmentIndexFull): RingInfo {
  const strong = app.packages.filter(p => p.matchBasis !== 'name')
  const pool = strong.length ? strong : app.packages
  if (!pool.length) return { ring: null, basis: 'none', targets: [], note: 'No Intune package, so there are no assignments to read a ring from.' }

  const targets: RingTarget[] = []
  let unreadable = false
  for (const p of pool) {
    const a = assignments[p.packageId]
    if (!Array.isArray(a)) { unreadable = true; continue }
    for (const x of a) {
      if (/exclusion/i.test(x.target)) continue // exclusions are not a rollout stage
      targets.push({ intent: x.intent, target: x.target, groupName: x.groupName ?? null, packageName: p.displayName || p.packageId })
    }
  }
  if (!targets.length) return { ring: null, basis: 'none', targets, note: unreadable ? 'Assignments could not be read.' : 'The package has no assignments.' }

  const labels = new Map<string, Label>()
  let direct = false
  for (const t of targets) {
    if (/allDevices/i.test(t.target)) { labels.set('All devices', { kind: 'broad', text: 'All devices', n: 1 }); direct = true }
    else if (/allLicensedUsers/i.test(t.target)) { labels.set('All users', { kind: 'broad', text: 'All users', n: 1 }); direct = true }
    else if (t.groupName) { const l = ringLabelFromGroupName(t.groupName); if (l) labels.set(l.text, l) }
  }
  if (!labels.size) {
    const unnamed = targets.some(t => /group/i.test(t.target) && !t.groupName)
    return { ring: null, basis: 'none', targets, note: unnamed ? 'Assignment group names could not be read (Group.Read.All needed), so a ring cannot be identified.' : 'No ring naming convention (Pilot, Ring N, Broad…) found in the assignment groups.' }
  }
  const ordered = [...labels.values()].sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.n - b.n || a.text.localeCompare(b.text))
  const inferred = [...labels.values()].some(l => !/^All /.test(l.text))
  return {
    ring: ordered.map(l => l.text).join(' → '), basis: inferred ? 'group-name' : 'assignment-target', targets,
    note: inferred ? 'Ring inferred from assignment group names, not from an explicit Intune ring setting.' : direct ? 'Read directly from the assignment target.' : null,
  }
}

// ── Packaging ─────────────────────────────────────────────────────────────────────────────────────

export function packagingOf(app: AssessedApp, packagesReadable: boolean): PackagingInfo {
  const strong = app.packages.filter(p => p.matchBasis !== 'name')
  const pool = strong.length ? strong : app.packages
  const latest = app.latest?.version ?? null
  const base = {
    packageName: pool[0] ? (pool[0].displayName || pool[0].packageId) : null, packageCount: pool.length,
    deployedVersion: app.deployedPackageVersion, latestVersion: latest,
    lastModifiedAt: pool.map(p => p.lastModifiedAt).filter((v): v is string => !!v).sort().at(-1) ?? null,
  }
  if (app.status === 'Native update') return { ...base, state: 'not-applicable', summary: 'The vendor updater handles this app; no packaging needed.' }
  if (!pool.length) {
    return packagesReadable
      ? { ...base, state: 'no-package', summary: 'No package for this app in the Intune app catalog.' }
      : { ...base, state: 'unknown', summary: 'The Intune app catalog could not be read, so packaging cannot be confirmed.' }
  }
  if (!app.deployedPackageVersion) return { ...base, state: 'unknown', summary: 'A package exists but Intune reports no version for it.' }
  if (!latest) return { ...base, state: 'unknown', summary: `Package version ${app.deployedPackageVersion}; no verified latest version to compare with.` }
  return compareVersions(app.deployedPackageVersion, latest) === -1
    ? { ...base, state: 'behind', summary: `Package ${app.deployedPackageVersion} is older than the latest verified ${latest}.` }
    : { ...base, state: 'current', summary: `Package ${app.deployedPackageVersion} covers the latest verified ${latest}.` }
}

// ── Impact ────────────────────────────────────────────────────────────────────────────────────────

export function impactOf(app: AssessedApp): ImpactInfo {
  const latest = app.latest?.version
  const byVersion = latest
    ? [...app.installed].filter(i => compareVersions(i.version, latest) === -1).sort((a, b) => b.deviceCount - a.deviceCount).map(i => ({ version: i.version, deviceCount: i.deviceCount, provider: i.provider }))
    : []
  const total = app.totalDevices
  return {
    devicesBehind: app.affectedDevices, totalDevices: total,
    percentBehind: latest && total > 0 ? Math.min(100, Math.round((app.affectedDevices / total) * 100)) : null,
    byVersion, basis: IMPACT_BASIS,
  }
}

export function buildLifecycle(app: AssessedApp, assignments: AssignmentIndexFull, packagesReadable: boolean): AppLifecycle {
  return { owner: ownerOf(app), ring: ringOf(app, assignments), packaging: packagingOf(app, packagesReadable), impact: impactOf(app) }
}
