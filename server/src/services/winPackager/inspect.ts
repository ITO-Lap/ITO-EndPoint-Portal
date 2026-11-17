// Orchestrates read-only inspection of an uploaded file (or of the installer chosen inside a ZIP) into one
// PackageAnalysis. Facts come from the file itself; anything not found stays undefined rather than being guessed.

import { statSync } from 'node:fs'
import type { ArchiveEntry, Architecture, InstallerKind, PackageAnalysis, SignatureInfo } from './types.js'
import { suggestCommands, suggestDetection } from './commands.js'
import { inspectMsi } from './msiInspect.js'
import { inspectMsix } from './msixInspect.js'
import { inspectPe } from './peInspect.js'
import { listZipEntries, validateZipEntries } from './zipSafe.js'

const KIND_BY_EXT: Record<string, InstallerKind> = { '.msi': 'msi', '.exe': 'exe', '.msix': 'msix', '.appx': 'appx' }

export function installerKindFor(name: string): InstallerKind | null {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? null : KIND_BY_EXT[name.slice(dot).toLowerCase()] ?? null
}

/** Architecture hinted by the installer's file name (x64/amd64/win64, arm64, x86/win32/ia32). */
export function architectureFromFileName(name: string): Architecture | undefined {
  const n = name.toLowerCase()
  if (/(^|[^a-z0-9])(arm64|aarch64)([^a-z0-9]|$)/.test(n)) return 'arm64'
  if (/(^|[^a-z0-9])(x64|amd64|x86[-_]64|win64)([^a-z0-9]|$)/.test(n)) return 'x64'
  if (/(^|[^a-z0-9])(x86|win32|ia32|i386)([^a-z0-9]|$)/.test(n)) return 'x86'
  return undefined
}

const NO_SIGNATURE: SignatureInfo = { status: 'unsigned', note: 'Not inspected yet.' }

const base = (installerFile: string): Omit<PackageAnalysis, 'commands' | 'detection' | 'installerKind' | 'tech' | 'confidence'> => ({
  analyzedAt: new Date().toISOString(),
  installerFile,
  signature: NO_SIGNATURE,
  warnings: [],
  windowsValidationRequired: true,
})

/** Lists a ZIP's contents for the installer picker. Rejects unsafe archives before anything is extracted. */
export function analyzeArchive(zipPath: string, fileName: string): PackageAnalysis {
  const entries = listZipEntries(zipPath)
  const problems = validateZipEntries(entries)
  const archiveEntries: ArchiveEntry[] = entries
    .filter(e => !e.isDirectory)
    .map(e => ({ name: e.name, size: e.size, kind: installerKindFor(e.name) }))
  const nested = archiveEntries.filter(e => e.kind)
  const warnings = [...problems]
  if (!problems.length && nested.length === 0) warnings.push('No .msi, .exe, .msix or .appx installer was found inside the archive.')
  return {
    ...base(fileName),
    installerKind: null,
    tech: 'unknown',
    signature: { status: 'unsigned', note: 'Select the installer inside the archive to inspect its signature.' },
    commands: { confidence: 'unknown', basis: 'Select the installer inside the archive first.' },
    detection: { type: 'custom-script', guidance: 'Select the installer inside the archive first.' },
    confidence: 0,
    warnings,
    archiveEntries,
  }
}

export async function analyzeInstaller(file: string, installerFile: string): Promise<PackageAnalysis> {
  const kind = installerKindFor(installerFile)
  if (!kind) throw new Error('Unsupported installer type.')
  const warnings: string[] = []
  const common = base(installerFile)
  const size = statSync(file).size

  if (kind === 'msi') {
    const info = inspectMsi(file)
    const p = Object.fromEntries(Object.entries(info.properties).map(([k, v]) => [k, v.trim()]))
    const productCode = p['ProductCode']
    const version = p['ProductVersion']
    const commands = suggestCommands({ tech: 'msi', installerFile, ...(productCode ? { productCode } : {}) })
    if (!productCode) warnings.push('ProductCode not found in the MSI — detection and uninstall need manual configuration.')
    if (info.signature.status === 'unsigned') warnings.push('MSI is unsigned.')
    return {
      ...common, installerKind: 'msi', tech: 'msi',
      ...(p['ProductName'] ? { appName: p['ProductName'] } : {}),
      ...(p['Manufacturer'] ? { publisher: p['Manufacturer'] } : {}),
      ...(version ? { version } : {}),
      ...(info.architecture ? { architecture: info.architecture } : {}),
      ...(productCode ? { productCode } : {}),
      ...(p['UpgradeCode'] ? { upgradeCode: p['UpgradeCode'] } : {}),
      signature: info.signature,
      commands,
      detection: suggestDetection({ tech: 'msi', ...(productCode ? { productCode } : {}), ...(version ? { version } : {}) }),
      confidence: Math.min(100, 50 + (productCode ? 25 : 0) + (version ? 10 : 0) + (p['Manufacturer'] ? 5 : 0) + (info.architecture ? 10 : 0)),
      warnings,
    }
  }

  if (kind === 'msix' || kind === 'appx') {
    const info = await inspectMsix(file)
    const appName = info.displayName ?? info.identityName
    if (info.signature.status === 'unsigned') warnings.push('Package is unsigned; Windows will not install an unsigned MSIX/AppX without sideloading policy.')
    warnings.push('For all-user/SYSTEM deployment through Intune, MSIX usually needs Add-AppxProvisionedPackage; the generated script uses Add-AppxPackage.')
    return {
      ...common, installerKind: kind, tech: kind,
      appName,
      publisher: info.publisherDisplayName ?? info.publisher,
      version: info.version,
      ...(info.architecture ? { architecture: info.architecture } : {}),
      packageIdentity: info.identityName,
      packageFamilyName: info.packageFamilyName,
      ...(info.minOsVersion ? { minOsVersion: info.minOsVersion } : {}),
      signature: info.signature,
      commands: suggestCommands({ tech: kind, installerFile, identityName: info.identityName }),
      detection: suggestDetection({ tech: kind, identityName: info.identityName, version: info.version }),
      confidence: Math.min(100, 70 + (info.architecture ? 10 : 0) + (info.signature.status !== 'unsigned' ? 10 : 0) + 10),
      warnings,
    }
  }

  // exe
  const pe = inspectPe(file)
  const v = pe.versionStrings
  const appName = v['ProductName'] ?? v['FileDescription']
  const version = v['ProductVersion'] ?? v['FileVersion']
  const commands = suggestCommands({ tech: pe.tech, installerFile })
  if (pe.tech === 'unknown') warnings.push('Installer technology not recognised — enter the vendor-documented silent switches manually.')
  if (pe.signature.status === 'unsigned') warnings.push('Executable is unsigned.')
  if (size < 64 * 1024) warnings.push('Executable is very small; it may be a launcher rather than a full installer.')
  // The PE header describes the installer STUB, which is frequently 32-bit even for a 64-bit app (NSIS, Inno Setup).
  // A file-name hint wins; otherwise the stub value is used but flagged for confirmation.
  const hinted = architectureFromFileName(installerFile.split('/').pop() ?? installerFile)
  const arch: Architecture | undefined = hinted ?? pe.architecture
  if (hinted && pe.architecture && hinted !== pe.architecture) warnings.push(`The installer executable is ${pe.architecture} but its file name suggests ${hinted}. Installer stubs are often 32-bit; the architecture was set from the file name — confirm it.`)
  else if (!hinted && pe.architecture) warnings.push(`Architecture (${pe.architecture}) comes from the installer executable itself and may differ from the installed application — confirm it.`)
  return {
    ...common, installerKind: 'exe', tech: pe.tech,
    ...(appName ? { appName } : {}),
    ...(v['CompanyName'] ? { publisher: v['CompanyName'] } : {}),
    ...(version ? { version } : {}),
    ...(arch ? { architecture: arch } : {}),
    signature: pe.signature,
    commands: pe.techEvidence ? { ...commands, basis: `${commands.basis} Evidence: ${pe.techEvidence}.` } : commands,
    detection: suggestDetection({ tech: pe.tech, ...(appName ? { appName } : {}), ...(version ? { version } : {}) }),
    confidence: Math.min(100, (pe.tech === 'unknown' ? 15 : 40) + (appName ? 15 : 0) + (version ? 15 : 0) + (arch ? 10 : 0) + (pe.signature.status !== 'unsigned' ? 5 : 0)),
    warnings,
  }
}
