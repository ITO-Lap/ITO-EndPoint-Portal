// Editable package configuration: defaults from analysis, a strict patch schema, and the validation gate that
// must pass before artifacts are generated or a package is created.

import { z } from 'zod'
import { checkCommand } from './commands.js'
import type { PackageAnalysis, PackageConfig, PackageJob } from './types.js'

const GUID = /^\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}$/
const APPX_NAME = /^[A-Za-z0-9][A-Za-z0-9.\-_]{1,127}$/
const SAFE_PATH = /^[A-Za-z0-9 _\-.()%~:\\/]{1,260}$/
const SAFE_DISPLAY = /^[A-Za-z0-9 _\-.()+,]{1,128}$/
const SETUP_FILE = /^(?:[A-Za-z0-9 _\-.()+]+\/)*[A-Za-z0-9 _\-.()+]+\.(msi|exe|msix|appx)$/i
const VERSION = /^[0-9A-Za-z][0-9A-Za-z.\-_+]{0,63}$/

const text = (max: number) => z.string().max(max)

const detectionSchema = z.object({
  type: z.enum(['msi-product-code', 'appx-package', 'file-exists', 'registry-uninstall', 'custom-script']),
  value: text(300).optional(),
  minVersion: text(64).optional(),
  guidance: text(500).optional(),
}).strict()

/** Fields the engineer may edit. Unknown keys are rejected rather than silently dropped. */
export const configPatchSchema = z.object({
  appName: text(128),
  publisher: text(128),
  version: text(64),
  description: text(2000),
  installCommand: text(600),
  uninstallCommand: text(600),
  detection: detectionSchema,
  installBehavior: z.enum(['system', 'user']),
  architecture: z.enum(['x64', 'x86', 'arm64']),
  setupFile: text(200),
  acknowledgedUnverifiedCommands: z.boolean(),
}).partial().strict()

export type ConfigPatch = z.infer<typeof configPatchSchema>

export function defaultConfig(a: PackageAnalysis, fallbackName: string): PackageConfig {
  const stem = fallbackName.replace(/\.[^.]+$/, '')
  return {
    appName: a.appName ?? stem,
    publisher: a.publisher ?? '',
    version: a.version ?? '',
    description: '',
    installCommand: a.commands.install ?? '',
    uninstallCommand: a.commands.uninstall ?? '',
    detection: { ...a.detection },
    installBehavior: 'system',
    architecture: a.architecture ?? 'x64',
    setupFile: a.installerFile,
    acknowledgedUnverifiedCommands: false,
  }
}

export function applyPatch(current: PackageConfig, patch: ConfigPatch): PackageConfig {
  // Changing any command/detection field invalidates a prior acknowledgement unless it is re-sent in the same patch.
  const touched = ['installCommand', 'uninstallCommand', 'detection', 'setupFile'].some(k => k in patch)
  const next = { ...current, ...patch } as PackageConfig
  if (touched && !('acknowledgedUnverifiedCommands' in patch)) next.acknowledgedUnverifiedCommands = false
  return next
}

/** Problems that block package creation. Empty array = configuration is internally consistent and safe. */
export function configProblems(c: PackageConfig, job: Pick<PackageJob, 'analysis'>): string[] {
  const p: string[] = []
  if (!c.appName.trim()) p.push('App name is required.')
  if (!c.publisher.trim()) p.push('Publisher is required.')
  if (!VERSION.test(c.version)) p.push('Version is required and may only contain letters, digits, ".", "-", "_" or "+".')
  if (!c.setupFile) p.push('No setup file selected.')
  else if (!SETUP_FILE.test(c.setupFile) || c.setupFile.split('/').some(seg => seg === '..' || seg === '.')) p.push('Setup file must be a relative .msi, .exe, .msix or .appx path inside the source folder.')

  const install = checkCommand(c.installCommand, c.setupFile, 'install')
  if (!install.ok) p.push(install.reason!)
  const uninstall = checkCommand(c.uninstallCommand, c.setupFile, 'uninstall')
  if (!uninstall.ok) p.push(uninstall.reason!)
  // The generated install.ps1/uninstall.ps1 only do real work for MSIX/AppX; for anything else a command that
  // calls them would just call itself.
  const isAppx = /\.(msix|appx)$/i.test(c.setupFile)
  if (!isAppx && /-File \.\\(un)?install\.ps1/i.test(`${c.installCommand} ${c.uninstallCommand}`)) {
    p.push('The generated PowerShell wrapper commands are only valid for MSIX/AppX packages.')
  }

  const d = c.detection
  switch (d.type) {
    case 'msi-product-code': if (!d.value || !GUID.test(d.value)) p.push('MSI detection needs a ProductCode in {GUID} form.'); break
    case 'appx-package': if (!d.value || !APPX_NAME.test(d.value)) p.push('AppX detection needs a valid package name.'); break
    case 'file-exists': if (!d.value || !SAFE_PATH.test(d.value)) p.push('File detection needs a plain path (letters, digits, spaces and . _ - ( ) % ~ : \\ /).'); break
    case 'registry-uninstall': if (!d.value || !SAFE_DISPLAY.test(d.value)) p.push('Registry detection needs the application DisplayName (letters, digits, spaces and . _ - ( ) + ,).'); break
    case 'custom-script': p.push('Choose a detection method: no reliable rule could be derived automatically.'); break
  }
  if (d.minVersion && !VERSION.test(d.minVersion)) p.push('Detection minimum version is not a valid version string.')

  const a = job.analysis
  if (a && a.commands.confidence !== 'verified' && !c.acknowledgedUnverifiedCommands) {
    p.push('Commands are not verified — acknowledge that they must be tested on Windows before packaging.')
  }
  return p
}

export function outputFileName(c: Pick<PackageConfig, 'appName' | 'version' | 'architecture'>): string {
  const clean = (s: string): string => s.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return `${clean(c.appName) || 'App'}-${clean(c.version) || '0'}-${c.architecture}.intunewin`
}
