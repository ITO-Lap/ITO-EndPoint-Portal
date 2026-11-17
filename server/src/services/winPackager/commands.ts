// Silent install/uninstall suggestions and command safety rules.
//
// Confidence is deliberate and never inflated:
//   verified — the installer's own metadata (MSI/MSIX) determines the command.
//   likely   — a recognised installer technology; the usual switches apply but MUST be tested on Windows.
//   unknown  — nothing reliable is known; no command is guessed.

import type { CommandSuggestion, DetectionRule, InstallerTech } from './types.js'

const q = (s: string): string => `"${s}"`

export interface SuggestInput {
  tech: InstallerTech
  installerFile: string
  productCode?: string
  identityName?: string
}

export function suggestCommands(i: SuggestInput): CommandSuggestion {
  switch (i.tech) {
    case 'msi':
      return {
        install: `msiexec /i ${q(i.installerFile)} /qn /norestart`,
        ...(i.productCode ? { uninstall: `msiexec /x ${q(i.productCode)} /qn /norestart` } : {}),
        confidence: i.productCode ? 'verified' : 'likely',
        basis: i.productCode ? 'Standard Windows Installer switches; ProductCode read from the MSI Property table.' : 'Standard Windows Installer switches, but no ProductCode could be read — uninstall needs manual entry.',
      }
    case 'msix':
    case 'appx':
      return {
        install: 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\install.ps1',
        uninstall: 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\uninstall.ps1',
        confidence: 'likely',
        basis: 'Generated scripts use Add-AppxPackage / Remove-AppxPackage. Installing for all users from SYSTEM context may need provisioning — test on Windows.',
      }
    case 'inno-setup':
      return { install: `${q(i.installerFile)} /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-`, confidence: 'likely', basis: 'Inno Setup marker found in the executable. Uninstall is unins000.exe in the install folder — enter its path after a test install.' }
    case 'nsis':
      return { install: `${q(i.installerFile)} /S`, confidence: 'likely', basis: 'NSIS marker found in the executable. NSIS uninstall path is application-specific — enter it after a test install.' }
    case 'wix-burn':
      return { install: `${q(i.installerFile)} /quiet /norestart`, uninstall: `${q(i.installerFile)} /uninstall /quiet /norestart`, confidence: 'likely', basis: 'WiX Burn bundle section found in the executable.' }
    case 'advanced-installer':
      return { install: `${q(i.installerFile)} /exenoui /qn /norestart`, confidence: 'likely', basis: 'Advanced Installer marker found. Switches vary by build — test on Windows.' }
    case 'installshield':
      return { install: `${q(i.installerFile)} /s /v"/qn /norestart"`, confidence: 'likely', basis: 'InstallShield marker found. Response-file based installs are common — test on Windows.' }
    case 'squirrel':
      return { install: `${q(i.installerFile)} --silent`, confidence: 'likely', basis: 'Squirrel installer marker found. Squirrel installs per user into AppData; machine-wide deployment usually needs a different approach.' }
    default:
      return { confidence: 'unknown', basis: 'Installer technology not recognised. Provide the vendor-documented silent command manually; no command is guessed.' }
  }
}

export function suggestDetection(i: { tech: InstallerTech; productCode?: string; version?: string; identityName?: string; appName?: string }): DetectionRule {
  if (i.tech === 'msi' && i.productCode) {
    return { type: 'msi-product-code', value: i.productCode, ...(i.version ? { minVersion: i.version } : {}) }
  }
  if ((i.tech === 'msix' || i.tech === 'appx') && i.identityName) {
    return { type: 'appx-package', value: i.identityName, ...(i.version ? { minVersion: i.version } : {}), guidance: 'Uses Get-AppxPackage. For system-context installs, also check Get-AppxProvisionedPackage -Online.' }
  }
  if (i.appName) {
    return { type: 'registry-uninstall', value: i.appName, ...(i.version ? { minVersion: i.version } : {}), guidance: 'Matches DisplayName in the Uninstall registry keys. Confirm the exact DisplayName on a Windows test machine.' }
  }
  return { type: 'custom-script', guidance: 'No reliable detection could be derived. Supply a detection script or a known file/registry path.' }
}

// ── Command safety ─────────────────────────────────────────────────────────────

const FORBIDDEN = /[&|;<>^`\r\n\0]|\$\(/
const GENERATED_SCRIPT = /^powershell(?:\.exe)? -NoProfile -ExecutionPolicy Bypass -File \.\\(install|uninstall)\.ps1$/i
const UNINSTALLER_EXE = /^(?:unins\d*|uninstall\w*|uninst\w*)\.exe$/i

/** Tokenises one command line. Quotes group a token; a backslash is a literal (Windows paths). */
export function tokenize(cmd: string): string[] | null {
  const tokens: string[] = []
  let cur = ''
  let inQuote = false
  let hasToken = false
  for (const ch of cmd) {
    if (ch === '"') { inQuote = !inQuote; hasToken = true; continue }
    if (!inQuote && /\s/.test(ch)) { if (hasToken) { tokens.push(cur); cur = ''; hasToken = false } continue }
    cur += ch; hasToken = true
  }
  if (inQuote) return null
  if (hasToken) tokens.push(cur)
  return tokens
}

export interface CommandCheck { ok: boolean; reason?: string }

/**
 * A command is only accepted when it runs one of: msiexec, the job's own setup file, the generated PowerShell
 * wrapper scripts, or (uninstall only) an installed uninstaller executable. No shell operators, no arbitrary programs.
 */
export function checkCommand(cmd: string, setupFile: string, role: 'install' | 'uninstall'): CommandCheck {
  const trimmed = cmd.trim()
  if (!trimmed) return { ok: false, reason: `${role} command is required.` }
  if (trimmed.length > 600) return { ok: false, reason: `${role} command is too long.` }
  if (FORBIDDEN.test(trimmed)) return { ok: false, reason: `${role} command contains shell operators or control characters, which are not allowed.` }
  if (GENERATED_SCRIPT.test(trimmed)) return { ok: true }
  const tokens = tokenize(trimmed)
  if (!tokens || tokens.length === 0) return { ok: false, reason: `${role} command has unbalanced quotes.` }
  const program = tokens[0]!
  const base = program.replace(/\\/g, '/').split('/').pop()!.toLowerCase()
  if (base === 'msiexec' || base === 'msiexec.exe') {
    if (program.includes('/') || program.includes('\\')) return { ok: false, reason: 'Use plain "msiexec" without a path.' }
    return { ok: true }
  }
  const norm = (v: string): string => v.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase()
  if (norm(program) === norm(setupFile)) return { ok: true }
  if (role === 'uninstall' && UNINSTALLER_EXE.test(base) && (/^[A-Za-z]:[\\/]/.test(program) || program.startsWith('%'))) return { ok: true }
  return { ok: false, reason: `${role} command must run msiexec, the setup file "${setupFile}", the generated scripts${role === 'uninstall' ? ', or an installed uninstaller (unins*.exe / uninstall*.exe)' : ''}.` }
}
