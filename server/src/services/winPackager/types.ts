// Windows Package Builder — shared types. Original implementation; no third-party packager source is used.

export type PackageSourceType = 'msi' | 'exe' | 'msix' | 'appx' | 'zip'
export type InstallerKind = 'msi' | 'exe' | 'msix' | 'appx'
export type Architecture = 'x64' | 'x86' | 'arm64'

/** User-visible job states. Never "ready" unless every gate genuinely passed. */
export type PackageJobState =
  | 'processing'
  | 'review-required'
  | 'validation-failed'
  | 'unsupported'
  | 'api-unavailable'
  | 'ready'

export interface PackageJobEvent {
  at: string
  actor: string
  action: string
  detail?: string
}

/** How much a suggested command can be trusted. Only "verified" may ever be shown without a warning. */
export type CommandConfidence = 'verified' | 'likely' | 'unknown'

export type InstallerTech =
  | 'msi' | 'msix' | 'appx' | 'inno-setup' | 'nsis' | 'wix-burn' | 'installshield' | 'advanced-installer' | 'squirrel' | 'unknown'

export interface SignatureInfo {
  /** present-unverified = an Authenticode blob exists; cryptographic validity can only be proven on Windows. */
  status: 'unsigned' | 'present-unverified' | 'valid' | 'invalid'
  signer?: string
  note: string
}

export interface CommandSuggestion {
  install?: string
  uninstall?: string
  confidence: CommandConfidence
  /** Why this confidence was assigned (shown to the engineer). */
  basis: string
}

export interface DetectionRule {
  type: 'msi-product-code' | 'appx-package' | 'file-exists' | 'registry-uninstall' | 'custom-script'
  /** MSI: {ProductCode}. AppX: package name. file/registry: a path or key. */
  value?: string
  minVersion?: string
  /** Human guidance when the rule could not be derived automatically. */
  guidance?: string
}

export interface ArchiveEntry { name: string; size: number; kind: InstallerKind | null }

export interface PackageAnalysis {
  analyzedAt: string
  /** The file actually inspected (the upload, or the installer chosen inside a ZIP). */
  installerFile: string
  installerKind: InstallerKind | null
  tech: InstallerTech
  appName?: string
  publisher?: string
  version?: string
  architecture?: Architecture
  productCode?: string
  upgradeCode?: string
  packageIdentity?: string
  packageFamilyName?: string
  minOsVersion?: string
  signature: SignatureInfo
  commands: CommandSuggestion
  detection: DetectionRule
  /** 0-100. Based on how many facts were read from the file itself rather than guessed. */
  confidence: number
  warnings: string[]
  /** ZIP only: nested installers the engineer can choose from. */
  archiveEntries?: ArchiveEntry[]
  /** Always true until the Windows worker has passed install + detection + uninstall. */
  windowsValidationRequired: true
}


export interface PackageConfig {
  appName: string
  publisher: string
  version: string
  description: string
  installCommand: string
  uninstallCommand: string
  detection: DetectionRule
  installBehavior: 'system' | 'user'
  architecture: Architecture
  /** Installer file name relative to the source folder; this is the IntuneWinAppUtil setup file. */
  setupFile: string
  /** Set true by the engineer once they accept that an unverified command has not been tested. */
  acknowledgedUnverifiedCommands: boolean
}

export type CheckStatus = 'pass' | 'fail' | 'skipped'
export interface ValidationStep {
  name: 'install' | 'detect-after-install' | 'uninstall' | 'detect-after-uninstall'
  status: CheckStatus
  exitCode?: number
  durationMs?: number
  rebootIndicated?: boolean
  stdout?: string
  stderr?: string
}

export interface ValidationResult {
  /** "validated" only when all four steps pass. "not-tested" = no worker was available. */
  outcome: 'validated' | 'failed' | 'not-tested'
  at: string
  workerName?: string
  steps: ValidationStep[]
  message: string
}

export interface PackageOutput {
  fileName: string
  /** Folder the deliverables were copied to (Desktop/win-packager/<app>). */
  exportDir?: string
  sizeBytes: number
  sha256: string
  createdAt: string
  workerName?: string
}

export interface PackageJob {
  id: string
  state: PackageJobState
  stateReason?: string
  createdAt: string
  updatedAt: string
  createdBy: string
  source: {
    fileName: string
    storedName: string
    type: PackageSourceType
    sizeBytes: number
    sha256: string
  }
  analysis?: PackageAnalysis
  config?: PackageConfig
  /** Optional logo, stored in artifacts/ — never inside the source folder. */
  validation?: ValidationResult
  approval?: { by: string; at: string }
  output?: PackageOutput
  events: PackageJobEvent[]
}

export interface PackagerLimits {
  maxUploadBytes: number
  /** Microsoft's Win32 app package limit. */
  maxIntuneBytes: number
}
