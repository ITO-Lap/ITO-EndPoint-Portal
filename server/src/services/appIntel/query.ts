import { normText } from './normalize.js'
import type { AppCve, CveSeverity } from './cve.js'
import type { AppRequestRecord } from './requests.js'
import type { PackagingState } from './lifecycle.js'
import type { AppPlatform, AssessedApp, AppStatus, Confidence, InstallSource, ProviderId } from './types.js'

// Pure list / summary / hand-off helpers over assessed apps (server-side filter, sort, page).

export type SyncFilter = 'checked' | 'stale' | 'never'
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000

export interface AppFilters {
  platform: AppPlatform
  provider?: ProviderId | undefined
  status?: AppStatus | undefined
  publisher?: string | undefined
  syncState?: SyncFilter | undefined
  confidence?: Confidence | undefined
  installSource?: InstallSource | undefined
  /** Only apps where a newer verified version exists than at least one detected version. */
  updateAvailable?: boolean | undefined
  q?: string | undefined
}

export type AppSortKey = 'app' | 'publisher' | 'affected' | 'devices' | 'status' | 'lastChecked'

export interface AppRow {
  key: string
  app: string
  publisher: string | null
  platform: AppPlatform
  installedVersions: Array<{ version: string; deviceCount: number; provider: ProviderId }>
  affectedDevices: number
  totalDevices: number
  deployedPackageVersion: string | null
  latestVerifiedVersion: string | null
  status: AppStatus
  action: string
  providers: ProviderId[]
  latestSource: string | null
  lastChecked: string | null
  confidence: Confidence
  installSource: InstallSource
  installSourceBasis: 'bundleId' | 'wingetId' | 'name' | 'none'
  installSourceReason: string
  /** Intune package owner; null = not recorded. */
  owner: string | null
  /** Deployment ring read from assignments; null = not identified. */
  ring: string | null
  ringBasis: 'assignment-target' | 'group-name' | 'none'
  packagingState: PackagingState | null
  /** Estimated share of this app's detected installs that are behind the latest verified version. */
  impactPercent: number | null
  cve: { state: AppCve['state']; total: number; highestSeverity: CveSeverity | null; knownExploited: number; exposedDevices: number } | null
  request: { jiraKey: string | null; jiraUrl: string | null; jiraAt: string | null; slackAt: string | null } | null
}

const STATUS_PRIORITY: Record<AppStatus, number> = {
  'Package required': 0, 'Repackage required': 1, 'Update available — existing package': 2, 'Review required': 3,
  'Native update': 4, 'Up to date': 5, 'Data unavailable': 6,
}

/** A newer VERIFIED version exists than at least one detected version (needs a confirmed latest and a comparable version). */
export const hasUpdateAvailable = (a: AssessedApp): boolean => !!a.latest && a.affectedDevices > 0

export const syncStateOf = (app: AssessedApp, nowMs: number): SyncFilter => {
  if (!app.lastCheckedAt || !app.latest) return 'never'
  return nowMs - Date.parse(app.lastCheckedAt) > STALE_AFTER_MS ? 'stale' : 'checked'
}

export interface RowExtras { cve?: AppCve | undefined; requests?: AppRequestRecord[] | undefined }

export function toRow(a: AssessedApp, extras: RowExtras = {}): AppRow {
  const jira = extras.requests?.filter(r => r.kind === 'jira').at(-1)
  const slack = extras.requests?.filter(r => r.kind === 'slack').at(-1)
  return {
    key: a.key, app: a.identity.displayName, publisher: a.identity.publisher, platform: a.platform,
    installedVersions: [...a.installed].sort((x, y) => y.deviceCount - x.deviceCount).map(i => ({ version: i.version, deviceCount: i.deviceCount, provider: i.provider })),
    affectedDevices: a.affectedDevices, totalDevices: a.totalDevices,
    deployedPackageVersion: a.deployedPackageVersion, latestVerifiedVersion: a.latest?.version ?? null,
    status: a.status, action: a.action, providers: a.providers, latestSource: a.latest?.versionSource ?? null,
    lastChecked: a.lastCheckedAt, confidence: a.confidence,
    installSource: a.installSource, installSourceBasis: a.installSourceBasis, installSourceReason: a.installSourceReason,
    owner: a.lifecycle?.owner.name ?? null, ring: a.lifecycle?.ring.ring ?? null, ringBasis: a.lifecycle?.ring.basis ?? 'none',
    packagingState: a.lifecycle?.packaging.state ?? null, impactPercent: a.lifecycle?.impact.percentBehind ?? null,
    cve: extras.cve ? { state: extras.cve.state, total: extras.cve.counts.total, highestSeverity: extras.cve.highestSeverity, knownExploited: extras.cve.counts.knownExploited, exposedDevices: extras.cve.exposedDevices } : null,
    request: jira || slack ? { jiraKey: jira?.externalKey ?? null, jiraUrl: jira?.externalUrl ?? null, jiraAt: jira?.createdAt ?? null, slackAt: slack?.createdAt ?? null } : null,
  }
}

export function filterApps(apps: AssessedApp[], f: AppFilters, nowMs: number): AssessedApp[] {
  const q = normText(f.q)
  return apps.filter(a =>
    a.platform === f.platform &&
    (!f.provider || a.providers.includes(f.provider)) &&
    (!f.status || a.status === f.status) &&
    (!f.publisher || normText(a.identity.publisher) === normText(f.publisher)) &&
    (!f.syncState || syncStateOf(a, nowMs) === f.syncState) &&
    (!f.confidence || a.confidence === f.confidence) &&
    (!f.installSource || a.installSource === f.installSource) &&
    (!f.updateAvailable || hasUpdateAvailable(a)) &&
    (!q || normText(a.identity.displayName).includes(q) || normText(a.identity.publisher).includes(q) || normText(a.identity.bundleId).includes(q)))
}

export function sortApps(apps: AssessedApp[], key: AppSortKey | undefined, dir: 'asc' | 'desc' = 'asc'): AssessedApp[] {
  const d = dir === 'desc' ? -1 : 1
  const cmpStr = (x: string, y: string) => x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' })
  const base = (a: AssessedApp, b: AssessedApp): number => {
    switch (key) {
      case 'app': return cmpStr(a.identity.displayName, b.identity.displayName)
      case 'publisher': return cmpStr(a.identity.publisher ?? '', b.identity.publisher ?? '')
      case 'affected': return a.affectedDevices - b.affectedDevices
      case 'devices': return a.totalDevices - b.totalDevices
      case 'lastChecked': return (a.lastCheckedAt ?? '').localeCompare(b.lastCheckedAt ?? '')
      case 'status': return STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]
      default: return STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status] || b.affectedDevices - a.affectedDevices || cmpStr(a.identity.displayName, b.identity.displayName)
    }
  }
  return [...apps].sort((a, b) => (key ? d * base(a, b) : base(a, b)))
}

export function summarize(apps: AssessedApp[], platform: AppPlatform) {
  const list = apps.filter(a => a.platform === platform)
  const count = (s: AppStatus) => list.filter(a => a.status === s).length
  return {
    platform,
    appsDiscovered: list.length,
    // Every app with a confirmed newer version, whatever the next step is (see updateBreakdown).
    updateAvailable: list.filter(hasUpdateAvailable).length,
    updateBreakdown: {
      existingPackage: list.filter(a => hasUpdateAvailable(a) && a.status === 'Update available — existing package').length,
      needsPackaging: list.filter(a => hasUpdateAvailable(a) && (a.status === 'Package required' || a.status === 'Repackage required')).length,
      vendorUpdate: list.filter(a => hasUpdateAvailable(a) && a.status === 'Native update').length,
      review: list.filter(a => hasUpdateAvailable(a) && a.status === 'Review required').length,
      devicesBehind: list.filter(hasUpdateAvailable).reduce((n, a) => n + a.affectedDevices, 0),
    },
    packageRequired: count('Package required') + count('Repackage required'),
    packageRequiredBreakdown: { newPackage: count('Package required'), repackage: count('Repackage required') },
    reviewRequired: count('Review required'),
    nativeUpdate: count('Native update'),
    byInstallSource: { custom: list.filter(a => a.installSource === 'custom').length, selfService: list.filter(a => a.installSource === 'self-service').length, manual: list.filter(a => a.installSource === 'manual').length },
    upToDate: count('Up to date'),
    dataUnavailable: count('Data unavailable'),
    publishers: [...new Set(list.map(a => a.identity.publisher).filter((p): p is string => !!p))].sort((a, b) => a.localeCompare(b)),
  }
}

export interface PackagingIntent {
  platform: AppPlatform
  /** Windows: winget PackageIdentifier. macOS: Homebrew cask token. Null only if the catalog has none. */
  sourceId: string | null
  sourceKind: 'winget' | 'homebrew'
  displayName: string
  publisher: string | null
  bundleId: string | null
  targetVersion: string
  reason: string
  kind: 'new-package' | 'repackage'
  /** Reviewed-workflow hand-off only: building is allowed, publishing/deploying is not. */
  allowedActions: ['build-package']
}

/** Hand-off contract for the existing packaging workflows. Only produced when a package is actually required. */
export function packagingIntentFor(a: AssessedApp): PackagingIntent | null {
  if ((a.status !== 'Package required' && a.status !== 'Repackage required') || !a.latest) return null
  const mac = a.platform === 'macOS'
  return {
    platform: a.platform, sourceKind: mac ? 'homebrew' : 'winget',
    sourceId: mac ? a.identity.brewToken : a.identity.wingetId,
    displayName: a.identity.displayName, publisher: a.identity.publisher, bundleId: a.identity.bundleId,
    targetVersion: a.latest.version, reason: a.reason,
    kind: a.status === 'Repackage required' ? 'repackage' : 'new-package',
    allowedActions: ['build-package'],
  }
}
