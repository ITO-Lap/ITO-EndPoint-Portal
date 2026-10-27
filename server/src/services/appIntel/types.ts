// App Intelligence — shared types. Read-only: nothing here installs, publishes or deploys anything.

export type AppPlatform = 'windows' | 'macOS'

/** Where a piece of data came from. Providers are never merged into one anonymous "inventory". */
export type ProviderId = 'intune' | 'manageengine-mdm' | 'endpoint-central'

export type AppStatus =
  | 'Up to date'
  | 'Update available — existing package'
  | 'Package required'
  | 'Repackage required'
  | 'Native update'
  | 'Review required'
  | 'Data unavailable'

export type Confidence = 'high' | 'medium' | 'low'

/**
 * How an app got onto devices, derived from Intune package + assignment data (not per-device proof):
 *  - custom        — IT packaged it in Intune (LOB / Win32 / pkg / dmg / winget app), not offered for self-service
 *  - self-service  — a matching Intune package is offered to users through the Company Portal ("available" intent)
 *  - manual        — no matching package: installed by the user/vendor installer outside managed deployment
 * OS-native apps are excluded from the scan before they ever reach this classification.
 */
export type InstallSource = 'custom' | 'self-service' | 'manual'

export interface InstalledVersion {
  version: string
  /** Devices (or installs) reporting this version for this provider. */
  deviceCount: number
  provider: ProviderId
  /** Provider-side record ids (e.g. Intune detectedApp ids) used to list devices on demand. */
  sourceRecordIds?: string[]
}

export interface DeployedPackage {
  provider: 'intune'
  packageId: string
  displayName: string
  publisher: string | null
  /** Intune mobileApp.owner — the person/team recorded as owning the package. Null when not recorded. */
  owner?: string | null
  /** Version the package installs, only when the provider reports one. */
  version: string | null
  versionSource: string | null
  /** How this package was tied to the app. Name-only matches are never auto-merged into a decision. */
  matchBasis: 'bundleId' | 'wingetId' | 'productCode' | 'name'
  bundleId?: string | null
  wingetId?: string | null
  productCode?: string | null
  odataType: string
  lastModifiedAt: string | null
}

/** Release notes for the latest verified version. Never invented: each field is null when the source publishes nothing. */
export interface ReleaseNotes {
  summary: string | null
  url: string | null
  /** Vendor home page, shown only when no release-notes link exists. */
  vendorUrl?: string | null
  source: string
  unavailableReason: string | null
}

export interface LatestVerified {
  version: string
  /** Human-readable provenance, e.g. "Homebrew cask API (google-chrome)". */
  versionSource: string
  sourceUrl: string
  lastCheckedAt: string
  /** True when the source says the app updates itself (vendor auto-update). */
  selfUpdating: boolean
  releaseNotes?: ReleaseNotes
}

export type LatestUnavailable = { reason: string; lastCheckedAt: string }

export interface AppIdentity {
  publisher: string | null
  displayName: string
  bundleId: string | null
  productCode: string | null
  wingetId: string | null
  brewToken: string | null
}

export interface EvidenceItem {
  label: string
  value: string
  /** Provider / adapter the value came from. */
  source: string
  /** When that provider was last read (ISO). */
  asOf: string | null
}

export interface AppRecord {
  key: string
  platform: AppPlatform
  identity: AppIdentity
  installed: InstalledVersion[]
  packages: DeployedPackage[]
  /** Confidence that this record is one real app (strong identifier) and that its latest-version source is the right one. */
  confidence: Confidence
  confidenceReason: string
  providers: ProviderId[]
  /** Vendor auto-updater classification (not an OS-native app). */
  nativeHint: string | null
  /** Set when the app is OS-native (built-in / Store / Apple system); such apps are excluded from the scan. */
  nativeReason: string | null
  installSource: InstallSource
  /** What the install-source call rests on. 'name' means a name-only package match (low confidence). */
  installSourceBasis: 'bundleId' | 'wingetId' | 'name' | 'none'
  installSourceReason: string
}

export interface AppAssessment {
  status: AppStatus
  /** Plain-language reason for the status. */
  reason: string
  action: string
  deployedPackageVersion: string | null
  latest: LatestVerified | null
  latestUnavailable: LatestUnavailable | null
  /** Devices running a version older than the latest verified one (0 when not comparable). */
  affectedDevices: number
  evidence: EvidenceItem[]
  dataGaps: string[]
}

export interface AssessedApp extends AppRecord, AppAssessment {
  totalDevices: number
  detectedVersion: string[]
  lastCheckedAt: string | null
  /** Owner, deployment ring, packaging state and impact — attached after the install-source pass (see lifecycle.ts). */
  lifecycle?: import('./lifecycle.js').AppLifecycle
}
