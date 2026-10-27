import { compareVersions, maxVersion, parseVersion } from './version.js'
import type { LatestResult } from './latestVersion.js'
import type {
  AppRecord, AssessedApp, AppStatus, DeployedPackage, EvidenceItem, ProviderId,
} from './types.js'

// Packaging decision engine. Pure function: no I/O, no clock reads (time is passed in).
//
// Rules (from the module spec):
//  - "latest" only ever comes from an approved adapter result, never from inventory.
//  - "Package required" only when a newer version is CONFIRMED and no suitable package exists.
//  - Anything uncertain (unparsable version, name-only package match, unreadable package catalog)
//    is "Review required"; a missing/failed latest source is "Data unavailable".

export interface AssessContext {
  /** Per-provider time the inventory was last read. */
  providerAsOf: Partial<Record<ProviderId, string | null>>
  /** False when Intune's package catalog could not be read — then "no package" can't be asserted. */
  packagesReadable: boolean
  nowIso: string
}

const PROVIDER_LABEL: Record<ProviderId, string> = {
  intune: 'Microsoft Intune',
  'manageengine-mdm': 'ManageEngine MDM inventory',
  'endpoint-central': 'Endpoint Central agent inventory',
}

const STRONG = new Set(['bundleId', 'wingetId', 'productCode'])
const isStrong = (p: DeployedPackage): boolean => STRONG.has(p.matchBasis)

function installedSummary(r: AppRecord): string {
  return [...r.installed]
    .sort((a, b) => b.deviceCount - a.deviceCount)
    .map(i => `${i.version} ×${i.deviceCount}`)
    .join(', ')
}

export function assessApp(record: AppRecord, latest: LatestResult | null, ctx: AssessContext): AssessedApp {
  const evidence: EvidenceItem[] = []
  const gaps: string[] = []
  const totalDevices = record.installed.reduce((n, i) => n + i.deviceCount, 0)

  for (const prov of record.providers) {
    const rows = record.installed.filter(i => i.provider === prov)
    evidence.push({
      label: 'Detected versions', source: PROVIDER_LABEL[prov], asOf: ctx.providerAsOf[prov] ?? null,
      value: rows.length ? rows.map(i => `${i.version} ×${i.deviceCount}`).join(', ') : 'none',
    })
  }

  // Package evidence (kept distinct from detected / latest).
  const strongPkgs = record.packages.filter(isStrong)
  const namePkgs = record.packages.filter(p => !isStrong(p))
  for (const p of record.packages) {
    evidence.push({
      label: 'Deployed package', source: 'Microsoft Intune app catalog', asOf: ctx.providerAsOf.intune ?? null,
      value: `${p.displayName || p.packageId} (${p.odataType}) — version ${p.version ?? 'not reported'} — matched by ${p.matchBasis}${isStrong(p) ? '' : ' (low confidence)'}`,
    })
  }
  if (!record.packages.length) evidence.push({ label: 'Deployed package', source: 'Microsoft Intune app catalog', asOf: ctx.providerAsOf.intune ?? null, value: ctx.packagesReadable ? 'none found' : 'catalog unreadable' })

  const strongVersion = maxVersion(strongPkgs.map(p => p.version).filter((v): v is string => !!v))
  const deployedPackageVersion = strongVersion ?? (strongPkgs.length === 0 && namePkgs.length === 1 ? namePkgs[0]!.version : null)

  const base = {
    deployedPackageVersion, latest: latest?.ok ? latest.value : null,
    latestUnavailable: latest && !latest.ok ? latest.value : null,
    evidence, dataGaps: gaps, affectedDevices: 0,
  }
  const done = (status: AppStatus, reason: string, action: string, extra: Partial<AssessedApp> = {}): AssessedApp => ({
    ...record, ...base, status, reason, action,
    totalDevices, detectedVersion: record.installed.map(i => i.version),
    lastCheckedAt: latest ? (latest.ok ? latest.value.lastCheckedAt : latest.value.lastCheckedAt) : null,
    ...extra,
  })

  if (record.confidence === 'low') gaps.push(record.confidenceReason)
  if (!record.packages.length && !ctx.packagesReadable) gaps.push('Intune app catalog could not be read, so existing packages cannot be confirmed.')

  // 1. Native-update apps never need packaging.
  if (record.nativeHint) {
    const affected = latest?.ok ? outdatedCount(record, latest.value.version) : 0
    if (latest?.ok) evidence.push(latestEvidence(latest.value))
    return done('Native update', record.nativeHint + (affected ? `. ${affected} device(s) report an older version than ${latest!.ok ? latest!.value.version : ''} — check the updater policy if they stay behind.` : ''),
      'No packaging needed', { affectedDevices: affected })
  }

  // 2. Latest-version source.
  if (!latest) {
    gaps.push('No verified latest-version source is mapped for this app.')
    return done('Data unavailable', 'No approved latest-version source (winget manifest or Homebrew cask) is mapped for this app, so a newer version cannot be confirmed.', 'Add a verified catalog mapping to enable comparison')
  }
  if (!latest.ok) {
    gaps.push(latest.value.reason)
    return done('Data unavailable', `The latest-version source could not confirm a version: ${latest.value.reason}.`, 'Retry the sync later')
  }
  const L = latest.value
  evidence.push(latestEvidence(L))

  // Windows vendor updaters remain informational. For macOS, an installed
  // version behind a verified release is explicitly routed for packaging /
  // deployment review, even when the vendor advertises an auto-updater.
  if (L.selfUpdating && record.platform !== 'macOS') {
    const affected = outdatedCount(record, L.version)
    return done('Native update', `${L.versionSource} reports this app updates itself${affected ? `; ${affected} device(s) are behind ${L.version}` : ''}.`, 'No packaging needed', { affectedDevices: affected })
  }

  // 3. Version comparison — never guess. Rows whose version is unparsable ("Unknown") or uses a different
  // numbering scheme than the verified latest (e.g. a build date vs 1.2.3) are left out of the comparison,
  // so one unreadable device cannot hide real updates on the others (and cannot create a false one).
  const notComparable = record.installed.filter(i => !isComparable(i.version, L.version))
  const comparable = record.installed.filter(i => isComparable(i.version, L.version))
  const notComparableDevices = notComparable.reduce((n, i) => n + i.deviceCount, 0)
  if (notComparable.length) gaps.push(`${notComparableDevices} device(s) report a version that cannot be compared with ${L.version} (${notComparable.map(i => i.version).join(', ')}); they are not counted as behind.`)
  const behind = comparable.filter(i => compareVersions(i.version, L.version) === -1)
  const affectedDevices = behind.reduce((n, i) => n + i.deviceCount, 0)
  evidence.push({
    label: 'Comparison', source: 'Version comparator', asOf: ctx.nowIso,
    value: behind.length
      ? `${behind.map(i => i.version).join(', ')} older than ${L.version}`
      : `all comparable versions (${installedSummary({ ...record, installed: comparable })}) are at or above ${L.version}`,
  })

  if (!behind.length && notComparable.length) {
    return done('Review required', `Some installed versions cannot be compared with ${L.version} (${notComparable.map(i => i.version).join(', ')}), so the status cannot be decided automatically.`, 'Review the installed versions manually')
  }
  if (!behind.length) {
    return done('Up to date', `Every detected version is at or above the latest verified version ${L.version} (${L.versionSource}).`, 'No action')
  }

  // 4. Outdated — decide what packaging is needed.
  if (strongPkgs.length) {
    if (!strongVersion) {
      gaps.push('A package matches by a strong identifier but Intune reports no version for it.')
      return done('Review required', `A deployed package exists (matched by ${strongPkgs[0]!.matchBasis}) but Intune does not report its version, so it cannot be compared with ${L.version}.`, 'Check the package version in Intune', { affectedDevices })
    }
    if (compareVersions(strongVersion, L.version) !== -1) {
      return done('Update available — existing package', `${affectedDevices} device(s) run an older version, and the deployed package (${strongVersion}) already covers ${L.version}.`, record.platform === 'macOS' ? `Packaging needed — deploy ${strongVersion} to ${affectedDevices} device(s)` : `Deploy the existing package to ${affectedDevices} device(s)`, { affectedDevices })
    }
    return done('Repackage required', `The deployed package (${strongVersion}) is older than the latest verified version ${L.version} (${L.versionSource}).`, record.platform === 'macOS' ? `Packaging needed — repackage to ${L.version}` : `Create a new package for ${L.version} and redeploy`, { affectedDevices })
  }

  if (!ctx.packagesReadable) {
    return done('Review required', `Latest verified version is ${L.version}, but the Intune app catalog could not be read, so existing packages cannot be ruled out.`, 'Retry the sync, then review', { affectedDevices })
  }
  if (namePkgs.length) {
    gaps.push('Only name-based package candidates exist; a name match is not a strong identifier.')
    return done('Review required', `A package with a similar name exists (${namePkgs.map(p => p.displayName).slice(0, 3).join(', ')}) but it cannot be tied to this app by a strong identifier, so it is unclear whether a suitable package already exists.`, 'Confirm whether the candidate package is the same app', { affectedDevices })
  }
  return done('Package required', `${affectedDevices} device(s) run an older version than the latest verified ${L.version} (${L.versionSource}) and no package for this app was found in the Intune app catalog.`, record.platform === 'macOS' ? `Packaging needed — create package for ${L.version}` : `Create a package for ${L.version}`, { affectedDevices })
}

/** Both versions parse and share a numbering scheme (a date-style 2024xxxx major is never compared with a 1.x-style one). */
function isComparable(installed: string, latest: string): boolean {
  const a = parseVersion(installed), b = parseVersion(latest)
  return !!a && !!b && (a.nums[0]! >= 1000) === (b.nums[0]! >= 1000)
}

function outdatedCount(r: AppRecord, latest: string): number {
  return r.installed.filter(i => isComparable(i.version, latest) && compareVersions(i.version, latest) === -1).reduce((n, i) => n + i.deviceCount, 0)
}

function latestEvidence(L: { version: string; versionSource: string; lastCheckedAt: string }): EvidenceItem {
  return { label: 'Latest verified version', value: L.version, source: L.versionSource, asOf: L.lastCheckedAt }
}
