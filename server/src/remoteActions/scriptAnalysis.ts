// Deterministic script analysis: language / platform detection, metadata extraction, structural syntax checks and a
// rule-based risk classification. Nothing here executes a script and nothing here calls an AI service.
//
// Rules live in a plain table (RISK_RULES) so security can extend them later without touching the engine.

import { containsSecret } from './redaction.js'

export type ScriptLanguage = 'powershell' | 'shell' | 'unknown'
export type ScriptPlatform = 'Windows' | 'macOS' | 'both' | 'unknown'
export type RiskLevel = 'low' | 'medium' | 'high' | 'blocked'

export interface Finding {
  ruleId: string
  severity: RiskLevel
  category: string
  message: string
  line?: number
  /** Trimmed code fragment that triggered the rule (secrets are never echoed). */
  match?: string
}

export interface SyntaxIssue { message: string; line?: number }

export interface ScriptAnalysis {
  language: ScriptLanguage
  platform: ScriptPlatform
  name: string
  description: string
  requiresAdmin: boolean
  /** Why admin was inferred, e.g. "#Requires -RunAsAdministrator". Empty when not detected. */
  adminEvidence: string[]
  risk: RiskLevel
  findings: Finding[]
  /** Hard validation failures (empty script, wrong extension, malformed). Any entry stops job creation. */
  errors: string[]
  syntaxIssues: SyntaxIssue[]
  /** Medium/High need a justification; High needs approval; Blocked can never run. */
  requiresJustification: boolean
  requiresApproval: boolean
  rollbackRecommended: boolean
  lineCount: number
}

export interface AnalyzeInput { content: string; fileName?: string; declaredLanguage?: ScriptLanguage }

export const MAX_SCRIPT_BYTES = 200 * 1024

const RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2, blocked: 3 }
export const maxRisk = (a: RiskLevel, b: RiskLevel): RiskLevel => (RANK[a] >= RANK[b] ? a : b)

// ── Language / platform detection ──────────────────────────────────────────────

export function languageFromFileName(fileName: string | undefined): ScriptLanguage {
  const ext = fileName?.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  if (ext === 'ps1') return 'powershell'
  if (ext === 'sh' || ext === 'zsh' || ext === 'bash') return 'shell'
  return 'unknown'
}

export function detectLanguage(content: string, fileName?: string): ScriptLanguage {
  const byName = languageFromFileName(fileName)
  if (byName !== 'unknown') return byName
  const head = content.slice(0, 300)
  if (/^#!.*\b(bash|zsh|sh|dash|ksh)\b/m.test(head.split('\n')[0] ?? '')) return 'shell'
  if (/^#!.*\b(pwsh|powershell)\b/.test(head.split('\n')[0] ?? '')) return 'powershell'
  let ps = 0
  let sh = 0
  if (/\b(Get|Set|New|Remove|Invoke|Write|Start|Stop|Test|Import|Out)-[A-Z][A-Za-z]+/.test(content)) ps += 3
  if (/^\s*param\s*\(/im.test(content) || /\$_\b|\$env:|\[CmdletBinding\(/i.test(content)) ps += 2
  if (/Write-Output|Write-Host|\| ?Where-Object|\| ?ForEach-Object/i.test(content)) ps += 2
  if (/^\s*(if|while)\b.*\bthen\b|^\s*fi\s*$|\besac\b|\$\(\s*\w|\[\[ .* \]\]|^\s*echo\s/m.test(content)) sh += 2
  if (/\b(grep|sed|awk|chmod|chown|defaults write|launchctl|brew|diskutil|scutil|networksetup|mdfind)\b/.test(content)) sh += 3
  if (ps === 0 && sh === 0) return 'unknown'
  return ps > sh ? 'powershell' : 'shell'
}

export function detectPlatform(content: string, language: ScriptLanguage): ScriptPlatform {
  if (language === 'powershell') {
    // PowerShell 7 scripts that branch on $IsMacOS are cross-platform; everything else is Windows PowerShell.
    return /\$IsMacOS|\$IsLinux/.test(content) ? 'both' : 'Windows'
  }
  if (language === 'shell') {
    // Windows-only tooling inside a shell script (Git-bash style) is not something the macOS agent can run.
    return /\b(reg\.exe|cmd\.exe|powershell\.exe|wmic)\b/i.test(content) ? 'unknown' : 'macOS'
  }
  return 'unknown'
}

// ── Metadata ───────────────────────────────────────────────────────────────────

function extractMetadata(content: string, language: ScriptLanguage, fileName?: string): { name: string; description: string } {
  const lines = content.split(/\r?\n/)
  let name = ''
  let description = ''

  if (language === 'powershell') {
    const block = content.match(/<#([\s\S]*?)#>/)?.[1]
    if (block) {
      description = block.match(/\.SYNOPSIS\s*([\s\S]*?)(?=\n\s*\.[A-Z]+|\s*$)/i)?.[1]?.trim()
        || block.match(/\.DESCRIPTION\s*([\s\S]*?)(?=\n\s*\.[A-Z]+|\s*$)/i)?.[1]?.trim() || ''
      name = block.match(/^\s*(?:\.NAME|Name:)\s*(.+)$/im)?.[1]?.trim() ?? ''
    }
  }
  for (const line of lines.slice(0, 40)) {
    const kv = line.match(/^\s*#\s*(name|title|description|synopsis|purpose)\s*:\s*(.+)$/i)
    if (!kv) continue
    const key = kv[1]!.toLowerCase()
    if ((key === 'name' || key === 'title') && !name) name = kv[2]!.trim()
    else if (!description) description = kv[2]!.trim()
  }
  if (!description) {
    // First prose comment line after the shebang / requires lines.
    const first = lines.slice(0, 15).find(l => /^\s*#(?![!#])\s*[A-Za-z]/.test(l) && !/^\s*#\s*requires\b/i.test(l))
    if (first) description = first.replace(/^\s*#\s*/, '').trim()
  }
  if (!name && fileName) name = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
  return { name: name.slice(0, 120), description: description.replace(/\s+/g, ' ').slice(0, 500) }
}

// ── Comment stripping (line numbers preserved) so a commented-out command does not trigger a rule ──

export function stripComments(content: string, language: ScriptLanguage): string {
  if (language === 'unknown') return content
  let text = content
  if (language === 'powershell') text = text.replace(/<#[\s\S]*?#>/g, m => m.replace(/[^\n]/g, ' '))
  return text.split('\n').map(line => {
    let quote: string | null = null
    for (let i = 0; i < line.length; i++) {
      const c = line[i]!
      if (quote) { if (c === quote && line[i - 1] !== '`' && line[i - 1] !== '\\') quote = null; continue }
      if (c === '"' || c === "'") { quote = c; continue }
      if (c === '#' && (i === 0 || /\s|;/.test(line[i - 1]!)) && !(language === 'shell' && line[i + 1] === '!' && i === 0)) {
        return line.slice(0, i)
      }
    }
    return line
  }).join('\n')
}

// ── Structural syntax checks (heuristic: nothing is executed or parsed by a real interpreter) ──

export function checkSyntax(content: string, language: ScriptLanguage): SyntaxIssue[] {
  const issues: SyntaxIssue[] = []
  const code = stripComments(content, language)

  // Quote balance across the whole script, ignoring PowerShell here-strings and escaped quotes.
  let scan = language === 'powershell' ? code.replace(/@"[\s\S]*?"@|@'[\s\S]*?'@/g, m => m.replace(/[^\n]/g, ' ')) : code
  if (language === 'shell') scan = scan.replace(/<<-?\s*['"]?(\w+)['"]?[\s\S]*?\n\s*\1\b/g, m => m.replace(/[^\n]/g, ' '))
  let quote: string | null = null
  let quoteLine = 1
  let line = 1
  for (let i = 0; i < scan.length; i++) {
    const c = scan[i]!
    if (c === '\n') { line++; if (quote === null) continue }
    const escaped = language === 'powershell' ? scan[i - 1] === '`' : scan[i - 1] === '\\' && quote !== "'"
    if (quote) { if (c === quote && !escaped) quote = null; continue }
    if ((c === '"' || c === "'") && !escaped) {
      // An apostrophe inside a shell word (don't) is not a quote opener; only treat as opener at a word boundary.
      if (c === "'" && language === 'shell' && /\w/.test(scan[i - 1] ?? ' ') ) continue
      quote = c; quoteLine = line
    }
  }
  if (quote) issues.push({ message: `Unterminated ${quote === '"' ? 'double' : 'single'} quote`, line: quoteLine })

  if (language === 'powershell') {
    const stripped = scan.replace(/"(?:[^"`]|`.)*"|'(?:[^']|'')*'/g, m => m.replace(/[^\n]/g, ' '))
    const pairs: Array<[string, string, string]> = [['{', '}', 'braces'], ['(', ')', 'parentheses'], ['[', ']', 'brackets']]
    for (const [o, c, label] of pairs) {
      const opens = stripped.split(o).length - 1
      const closes = stripped.split(c).length - 1
      if (opens !== closes) issues.push({ message: `Unbalanced ${label}: ${opens} "${o}" vs ${closes} "${c}"` })
    }
  } else if (language === 'shell') {
    const count = (re: RegExp) => (scan.match(re) ?? []).length
    const checks: Array<[string, number, number]> = [
      ['if … fi', count(/(^|[;&|(]\s*)if\s/gm), count(/(^|[;&|\s])fi(\s|;|$)/gm)],
      ['case … esac', count(/(^|[;&|]\s*)case\s.+\sin\b/gm), count(/(^|[;&|\s])esac(\s|;|$)/gm)],
      ['do … done', count(/(^|[;&|\s])do(\s|$)/gm), count(/(^|[;&|\s])done(\s|;|$)/gm)],
    ]
    for (const [label, opens, closes] of checks) if (opens !== closes) issues.push({ message: `Unbalanced ${label} (${opens} vs ${closes})` })
    const braces = (scan.match(/\{/g) ?? []).length - (scan.match(/\}/g) ?? []).length
    if (braces !== 0) issues.push({ message: `Unbalanced braces (${Math.abs(braces)} ${braces > 0 ? 'unclosed' : 'extra'})` })
  }
  return issues
}

// ── Risk rules ─────────────────────────────────────────────────────────────────

interface RiskRule {
  id: string
  severity: RiskLevel
  category: string
  message: string
  languages: ScriptLanguage[]
  pattern: RegExp
}

const PS: ScriptLanguage[] = ['powershell']
const SH: ScriptLanguage[] = ['shell']
const BOTH: ScriptLanguage[] = ['powershell', 'shell']

/** Extend this table to add a security rule. Patterns run against comment-stripped code, case-insensitive. */
export const RISK_RULES: RiskRule[] = [
  // ── Blocked: no legitimate use through a remote-action tool ──
  { id: 'sh.rm-root', severity: 'blocked', category: 'Destructive', message: 'Recursive delete of the filesystem root, home or system directories', languages: SH,
    pattern: /\brm\s+(?:-[a-z]*\s+)*-[a-z]*[rf][a-z]*\s+(?:--no-preserve-root\s+)?(?:\/(?:\*|\s|$|;)|~\/?(?:\s|$|;|\*)|\$HOME\/?(?:\s|$|;|\*)|"\$HOME"|\/(?:System|Library|Users|usr|etc|var|bin|sbin|Applications)\/?(?:\s|$|;|\*))/im },
  { id: 'sh.fork-bomb', severity: 'blocked', category: 'Destructive', message: 'Fork bomb pattern', languages: SH, pattern: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/ },
  { id: 'sh.disk-wipe', severity: 'blocked', category: 'Destructive', message: 'Raw disk write / erase / format', languages: SH,
    pattern: /\bdd\s+[^\n]*\bof=\/dev\/(?:r?disk|sd|nvme)|\bmkfs(?:\.\w+)?\b|\bdiskutil\s+(?:erase(?:disk|volume)|secureerase|zerodisk|apfs\s+deletecontainer|partitiondisk|reformat)\b|\bshred\s+[^\n]*\/dev\//i },
  { id: 'ps.disk-wipe', severity: 'blocked', category: 'Destructive', message: 'Disk format / wipe', languages: PS,
    pattern: /\bFormat-Volume\b|\bClear-Disk\b|\bInitialize-Disk\b[^\n]*-PartitionStyle|\bformat(?:\.com)?\s+[a-z]:|\bRemove-Partition\b|\bdiskpart\b/i },
  { id: 'ps.rm-root', severity: 'blocked', category: 'Destructive', message: 'Recursive delete of a drive root or Windows system directory', languages: PS,
    pattern: /\b(?:Remove-Item|ri|rm|del|rd|rmdir)\b[^\n|;]*?(?:-Recurse|\/s)[^\n|;]*?['"]?[a-z]:\\(?:Windows|Users|Program Files(?: \(x86\))?|ProgramData)?\\?\*?['"]?(?:\s|$|;)|\b(?:Remove-Item|ri|rm|del|rd|rmdir)\b[^\n|;]*?['"]?[a-z]:\\['"]?\s*(?:-Recurse|-Force)/i },
  { id: 'any.download-execute', severity: 'blocked', category: 'Remote code', message: 'Downloads and immediately executes remote code', languages: BOTH,
    pattern: /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh\b|\b(?:iex|Invoke-Expression)\b[^\n]*(?:DownloadString|Invoke-WebRequest|Invoke-RestMethod|\biwr\b|\birm\b|Net\.WebClient)|(?:\biwr\b|\birm\b|Invoke-WebRequest|Invoke-RestMethod)\b[^\n]*\|\s*(?:iex|Invoke-Expression)\b/i },

  // ── High ──
  { id: 'sh.rm-recursive', severity: 'high', category: 'Destructive', message: 'Recursive / forced file deletion', languages: SH, pattern: /\brm\s+(?:-[a-z]*\s+)*-[a-z]*(?:r|f)[a-z]*\b/i },
  { id: 'ps.rm-recursive', severity: 'high', category: 'Destructive', message: 'Recursive / forced file deletion', languages: PS, pattern: /\b(?:Remove-Item|ri|rm|del|rd|rmdir)\b[^\n|;]*(?:-Recurse|-Force)\b/i },
  { id: 'ps.registry-delete', severity: 'high', category: 'Registry', message: 'Deletes registry keys or values', languages: PS, pattern: /\bRemove-Item(?:Property)?\b[^\n]*\b(?:HK(?:LM|CU|CR|U|CC)|Registry::)|\breg(?:\.exe)?\s+delete\b|\bClear-ItemProperty\b/i },
  { id: 'ps.security-controls', severity: 'high', category: 'Security controls', message: 'Disables or weakens a security control (Defender, firewall, SmartScreen, UAC, execution policy, BitLocker)', languages: PS,
    pattern: /\bSet-MpPreference\b[^\n]*-Disable\w+\s+\$?(?:true|1)|\bDisable-(?:BitLocker|WindowsOptionalFeature)\b|\bSet-NetFirewallProfile\b[^\n]*-Enabled\s+(?:False|\$false|0)|\bnetsh\s+advfirewall\s+set\b[^\n]*\boff\b|\bSet-ExecutionPolicy\s+(?:-ExecutionPolicy\s+)?(?:Bypass|Unrestricted)\b|\bEnableLUA\b|\bConsentPromptBehaviorAdmin\b|\bAdd-MpPreference\b[^\n]*-Exclusion|\bUninstall-WindowsFeature\b[^\n]*Defender|\bsc(?:\.exe)?\s+(?:stop|config|delete)\s+(?:WinDefend|Sense|mpssvc)/i },
  { id: 'sh.security-controls', severity: 'high', category: 'Security controls', message: 'Disables or weakens a security control (Gatekeeper, SIP, FileVault, firewall, XProtect)', languages: SH,
    pattern: /\bspctl\s+--?(?:master-disable|global-disable)\b|\bcsrutil\s+(?:disable|clear|authenticated-root\s+disable)\b|\bfdesetup\s+(?:disable|remove)\b|\bsocketfilterfw\b[^\n]*--setglobalstate\s+off|\bdefaults\s+write\s+\/Library\/Preferences\/com\.apple\.alf\b[^\n]*globalstate[^\n]*\b0\b|\bxattr\b[^\n]*-d\s+com\.apple\.quarantine|\blaunchctl\s+(?:unload|bootout|disable)\b[^\n]*(?:crowdstrike|falcon|zscaler|jamf|endpointcentral|manageengine|microsoft\.intune|defender)/i },
  { id: 'ps.security-tooling', severity: 'high', category: 'Security controls', message: 'Stops or removes a security/management agent service', languages: PS,
    pattern: /\b(?:Stop|Remove|Disable)-Service\b[^\n]*(?:csagent|crowdstrike|zscaler|windefend|sense|intune|ccmexec|ManageEngine|UEMS)|\bsc(?:\.exe)?\s+(?:stop|delete)\s+(?:csagent|csfalconservice|zsatray|zsaservice)/i },
  { id: 'any.accounts', severity: 'high', category: 'User accounts', message: 'Creates, modifies or removes user accounts, groups or passwords', languages: BOTH,
    pattern: /\b(?:New|Remove|Set|Disable|Enable)-LocalUser\b|\b(?:Add|Remove)-LocalGroupMember\b|\bnet(?:\.exe)?\s+(?:user|localgroup)\b|\bsysadminctl\b|\bdscl\b[^\n]*(?:-create|-delete|-passwd|-append|-change)|\bdseditgroup\b|\b(?:useradd|userdel|usermod|passwd|chpasswd)\b|\bsecurity\s+(?:delete-keychain|add-generic-password|set-keychain-password)\b|\bpwpolicy\b/i },
  { id: 'any.encoded', severity: 'high', category: 'Obfuscation', message: 'Encoded or obfuscated command execution', languages: BOTH,
    pattern: /-(?:enc|encodedcommand|e)\s+[A-Za-z0-9+/=]{20,}|\bFromBase64String\b[^\n]*\b(?:iex|Invoke-Expression)\b|\bbase64\s+(?:-d|--decode|-D)\b[^\n]*\|\s*(?:ba|z)?sh\b|\beval\s+["'$(`][^\n]*base64/i },
  { id: 'any.persistence', severity: 'high', category: 'Persistence', message: 'Creates persistence (scheduled task, launch daemon, startup item, cron)', languages: BOTH,
    pattern: /\bRegister-ScheduledTask\b|\bschtasks(?:\.exe)?\s+\/create\b|\/Library\/Launch(?:Daemons|Agents)\b[^\n]*(?:>|tee|cp|mv|plist)|\blaunchctl\s+(?:load|bootstrap)\b|\bcrontab\b|CurrentVersion\\Run\b/i },

  // ── Medium ──
  { id: 'any.reboot', severity: 'medium', category: 'Availability', message: 'Reboots or shuts down the device', languages: BOTH,
    pattern: /\b(?:Restart-Computer|Stop-Computer)\b|\bshutdown(?:\.exe)?\s+\/[rsp]\b|\bshutdown\s+(?:-[rh]|now)\b|(?:^|[;&|]\s*|\bsudo\s+)(?:reboot|halt|poweroff)\b|\bosascript\b[^\n]*(?:restart|shut down)/im },
  { id: 'sh.sudo', severity: 'medium', category: 'Privilege', message: 'Uses sudo / root privileges', languages: SH, pattern: /(?:^|[;&|(]\s*)sudo\b|\bsu\s+-?\s*root\b|\bchown\s+(?:-R\s+)?root\b|\bchmod\s+(?:-R\s+)?(?:[0-7]?777|u\+s|\+s)\b/im },
  { id: 'ps.registry-write', severity: 'medium', category: 'Registry', message: 'Modifies the registry', languages: PS, pattern: /\b(?:Set-ItemProperty|New-ItemProperty|New-Item)\b[^\n]*\b(?:HK(?:LM|CU|CR|U|CC)|Registry::)|\breg(?:\.exe)?\s+(?:add|import|load)\b|\bregedit(?:\.exe)?\s+\/s\b/i },
  { id: 'any.network', severity: 'medium', category: 'Network', message: 'Changes network, DNS, proxy, firewall or hosts-file settings', languages: BOTH,
    pattern: /\b(?:Set|New|Remove)-(?:DnsClientServerAddress|NetIPAddress|NetRoute|NetFirewallRule|NetAdapter\w*|DnsClient\w*)\b|\bnetsh(?:\.exe)?\s+(?:interface|advfirewall|winhttp|wlan)\b|\broute(?:\.exe)?\s+(?:add|delete|-p)\b|\bnetworksetup\s+-set\w+|\bscutil\s+--set\b|\bifconfig\s+\w+\s+(?:down|up|inet)\b|\bpfctl\b|(?:drivers\\etc\\hosts|\/etc\/hosts)\b[^\n]*(?:>|Add-Content|Set-Content|tee)|(?:>>?|Add-Content|Set-Content|tee)[^\n]*(?:drivers\\etc\\hosts|\/etc\/hosts)/i },
  { id: 'any.services', severity: 'medium', category: 'Services', message: 'Stops, disables or removes system services', languages: BOTH,
    pattern: /\b(?:Stop|Set|Remove)-Service\b|\bsc(?:\.exe)?\s+(?:stop|config|delete)\b|\bnet\s+stop\b|\bTaskkill\b|\bStop-Process\b[^\n]*-Force|\bkillall\s+-9\b|\bpkill\s+-9\b|\bkill\s+-9\b|\blaunchctl\s+(?:stop|remove|kill)\b|\bsystemsetup\b\s+-set/i },
  { id: 'any.install', severity: 'medium', category: 'Software', message: 'Installs or removes software / packages', languages: BOTH,
    pattern: /\bmsiexec(?:\.exe)?\b[^\n]*\/[ix]\b|\bStart-Process\b[^\n]*(?:setup|install)|\bInstall-Package\b|\bUninstall-Package\b|\bwinget\s+(?:install|uninstall)\b|\bchoco\s+(?:install|uninstall)\b|\binstaller\s+-pkg\b|\bbrew\s+(?:install|uninstall|remove)\b|\bsoftwareupdate\s+-(?:i|-install)\b|\bhdiutil\s+attach\b|\bprofiles\s+(?:install|remove|-[IR])\b/i },
  { id: 'any.download', severity: 'medium', category: 'Network', message: 'Downloads content from the network', languages: BOTH, pattern: /\b(?:Invoke-WebRequest|Invoke-RestMethod|Start-BitsTransfer|Net\.WebClient|iwr|irm)\b|\bcurl\s+[^\n]*-[a-zA-Z]*[oO]\b|\bwget\b|\bcurl\b[^\n]*https?:\/\//i },
  { id: 'any.system-paths', severity: 'medium', category: 'System files', message: 'Writes to protected system locations', languages: BOTH,
    pattern: /(?:Set-Content|Out-File|Add-Content|Copy-Item|Move-Item|New-Item)\b[^\n]*\b[a-z]:\\Windows\\|(?:>>?|\btee\b|\bcp\b|\bmv\b|\binstall\b)\s+[^\n]*\/(?:etc|usr\/(?:local\/)?(?:bin|sbin|lib)|Library\/(?:LaunchDaemons|Preferences|Extensions)|System)\//i },
  { id: 'any.defaults-write', severity: 'medium', category: 'Configuration', message: 'Changes macOS system preferences', languages: SH, pattern: /\bdefaults\s+(?:write|delete)\b|\bPlistBuddy\b[^\n]*-c\s+["']?(?:Set|Add|Delete)\b|\bnvram\b[^\n]*=/i },
  { id: 'any.secure-string', severity: 'medium', category: 'Credentials', message: 'Handles credentials in the script', languages: PS, pattern: /\bConvertTo-SecureString\b[^\n]*-AsPlainText|\bGet-Credential\b|\bNew-Object\s+System\.Management\.Automation\.PSCredential\b/i },
]

const ADMIN_EVIDENCE: Array<{ re: RegExp; label: string; languages: ScriptLanguage[] }> = [
  { re: /^\s*#\s*requires\b[^\n]*-RunAsAdministrator/im, label: '#Requires -RunAsAdministrator', languages: PS },
  { re: /IsInRole\s*\(\s*\[?(?:Security\.Principal\.)?WindowsBuiltInRole\]?::Administrator/i, label: 'Checks for the Administrator role', languages: PS },
  { re: /Start-Process\b[^\n]*-Verb\s+RunAs/i, label: 'Start-Process -Verb RunAs', languages: PS },
  { re: /\b(?:HKLM|HKEY_LOCAL_MACHINE)[:\\]/i, label: 'Writes under HKLM', languages: PS },
  { re: /\b[a-z]:\\(?:Windows|Program Files)/i, label: 'Touches Windows / Program Files', languages: PS },
  { re: /(?:Set|Stop|Start|New|Remove)-Service\b|\bsc(?:\.exe)?\s+(?:stop|start|config|create|delete)\b|Register-ScheduledTask|Install-WindowsFeature|Enable-WindowsOptionalFeature|Set-NetFirewall\w*|Set-MpPreference/i, label: 'Service / feature / firewall change', languages: PS },
  { re: /(?:^|[;&|(]\s*)sudo\b/im, label: 'Uses sudo', languages: SH },
  { re: /\bid\s+-u\b[^\n]*(?:-ne|!=)\s*0|\$EUID\b|\$\(\s*id\s+-u\s*\)/, label: 'Checks for root (id -u / $EUID)', languages: SH },
  { re: /(?:^|\s)\/(?:Library|System|etc|usr\/local|private\/var\/db)\//, label: 'Touches system directories', languages: SH },
  { re: /\b(?:launchctl\s+(?:load|bootstrap)|installer\s+-pkg|profiles\s+(?:install|remove)|systemsetup|dscl\s+\.|fdesetup|softwareupdate)\b/, label: 'Root-only macOS tooling', languages: SH },
]

function lineOf(content: string, index: number): number {
  let line = 1
  for (let i = 0; i < index && i < content.length; i++) if (content.charCodeAt(i) === 10) line++
  return line
}

// Secrets are matched on the RAW text (a secret in a comment is still a leaked secret).
const SECRET_LINE_RULES: Array<{ id: string; message: string; re: RegExp }> = [
  { id: 'secret.private-key', message: 'Embedded private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { id: 'secret.token', message: 'Hard-coded access token (JWT, cloud, or source-control token)', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b|\b(?:AKIA|ASIA)[0-9A-Z]{16}\b|\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b|\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: 'secret.credential', message: 'Hard-coded password, secret, API key or connection-string credential', re: /\b[\w.-]*(?:password|passwd|pwd|secret|api[_-]?key|apikey|client[_-]?secret|access[_-]?token|refresh[_-]?token)\b[\w.-]*["']?\s*[:=]\s*["'](?!\s*[$<{])[^"'\r\n]{4,}["']|\b(?:password|pwd|accountkey|sharedaccesskey)\s*=\s*[^;\s'"$<{]{4,}/i },
]

export function findSecrets(content: string): Finding[] {
  const findings: Finding[] = []
  const lines = content.split(/\r?\n/)
  lines.forEach((text, i) => {
    for (const rule of SECRET_LINE_RULES) {
      if (rule.re.test(text) && containsSecret(text)) {
        findings.push({ ruleId: rule.id, severity: 'blocked', category: 'Hard-coded secret', message: `${rule.message}. Remove it and pass the value securely at run time.`, line: i + 1 })
        break
      }
    }
  })
  return findings
}

export function evaluateRules(content: string, language: ScriptLanguage): Finding[] {
  if (language === 'unknown') return []
  const code = stripComments(content, language)
  const findings: Finding[] = []
  for (const rule of RISK_RULES) {
    if (!rule.languages.includes(language)) continue
    const flags = rule.pattern.flags.includes('g') ? rule.pattern.flags : `${rule.pattern.flags}g`
    const re = new RegExp(rule.pattern.source, flags)
    let m: RegExpExecArray | null
    let count = 0
    while ((m = re.exec(code)) && count < 5) {
      count++
      findings.push({
        ruleId: rule.id, severity: rule.severity, category: rule.category, message: rule.message,
        line: lineOf(code, m.index), match: m[0].trim().replace(/\s+/g, ' ').slice(0, 120),
      })
      if (m[0].length === 0) re.lastIndex++
    }
  }
  return findings
}

// ── Public entry point ─────────────────────────────────────────────────────────

export function analyzeScript(input: AnalyzeInput): ScriptAnalysis {
  const { content, fileName } = input
  const errors: string[] = []

  const trimmed = content.replace(/\uFEFF/g, '').trim()
  if (!trimmed) errors.push('The script is empty.')
  if (Buffer.byteLength(content, 'utf8') > MAX_SCRIPT_BYTES) errors.push(`The script is larger than ${MAX_SCRIPT_BYTES / 1024} KB.`)
  // eslint-disable-next-line no-control-regex
  if (/[\x00]/.test(content)) errors.push('The script contains binary (NUL) data and is not a text script.')

  const byName = languageFromFileName(fileName)
  const detected = trimmed ? detectLanguage(content, fileName) : 'unknown'
  if (fileName && byName === 'unknown') errors.push(`Unsupported file type "${fileName}". Only .ps1 and .sh scripts are accepted.`)
  const language: ScriptLanguage = input.declaredLanguage && input.declaredLanguage !== 'unknown' ? input.declaredLanguage : detected
  if (input.declaredLanguage && input.declaredLanguage !== 'unknown' && detected !== 'unknown' && detected !== input.declaredLanguage) {
    errors.push(`The script looks like ${detected === 'powershell' ? 'PowerShell' : 'Shell'} but was declared as ${input.declaredLanguage === 'powershell' ? 'PowerShell' : 'Shell'}.`)
  }
  if (trimmed && language === 'unknown') errors.push('The script language could not be determined. Choose PowerShell or Shell.')

  const platform = detectPlatform(content, language)
  const { name, description } = extractMetadata(content, language, fileName)

  const adminEvidence = ADMIN_EVIDENCE.filter(e => e.languages.includes(language) && e.re.test(content)).map(e => e.label)
  const syntaxIssues = trimmed && language !== 'unknown' ? checkSyntax(content, language) : []
  if (syntaxIssues.length) errors.push(...syntaxIssues.map(i => `Syntax: ${i.message}${i.line ? ` (line ${i.line})` : ''}`))

  const findings = trimmed ? [...findSecrets(content), ...evaluateRules(content, language)] : []
  let risk: RiskLevel = 'low'
  for (const f of findings) risk = maxRisk(risk, f.severity)
  // A structurally broken script is never "low risk": nobody can say what it will do.
  if (syntaxIssues.length) risk = maxRisk(risk, 'medium')

  return {
    language, platform, name, description,
    requiresAdmin: adminEvidence.length > 0, adminEvidence,
    risk, findings, errors, syntaxIssues,
    requiresJustification: RANK[risk] >= RANK.medium && risk !== 'blocked',
    requiresApproval: risk === 'high',
    rollbackRecommended: risk === 'high' || risk === 'medium' && findings.some(f => ['Registry', 'Network', 'Services', 'Software'].includes(f.category)),
    lineCount: trimmed ? content.split(/\r?\n/).length : 0,
  }
}

/** Can this analysis ever become a job? Blocked scripts and hard errors cannot. */
export const isRunnable = (a: ScriptAnalysis): boolean => a.risk !== 'blocked' && a.errors.length === 0
