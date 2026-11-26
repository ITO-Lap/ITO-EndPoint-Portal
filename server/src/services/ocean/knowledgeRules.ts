// Ocean knowledge-base rules: which files may become knowledge sources, how they are classified, and how secrets are
// kept out. Pure functions (unit-tested); nothing here touches the disk or the network.

export type AccessClass = 'general' | 'admin'

export const ALLOWED_EXTENSIONS = ['.md', '.markdown', '.txt'] as const
export const MAX_DOC_BYTES = 1_000_000
export const MAX_TITLE_LENGTH = 160

/** Directory names that are never scanned. */
export const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'screenshots', 'assets', 'images', 'img', 'dist', 'build', 'coverage', '.cache'])

/** File names that must never become a knowledge source, whatever their extension. */
const SENSITIVE_NAME_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /(^|[\\/])\.env(\.|$)/i, why: 'environment file' },
  { re: /\.(pem|key|pfx|p12|crt|cer|jks|keystore|kdbx|ppk|asc|gpg)$/i, why: 'key or certificate file' },
  { re: /(^|[\\/])id_(rsa|dsa|ecdsa|ed25519)/i, why: 'SSH key' },
  { re: /(^|[\\/])\.(npmrc|netrc|pgpass|htpasswd|git-credentials)$/i, why: 'credential file' },
  { re: /\.(log|logs|out|sqlite|db|bak|dump|sql)$/i, why: 'raw log or data file' },
  { re: /(secret|credential|password|passwd|apikey|api-key|access[-_]?token|private[-_]?key|connection[-_]?string)[^\\/]*$/i, why: 'file name suggests credentials' },
  { re: /(^|[\\/])session-secret/i, why: 'session secret' },
]

export function sensitivePathReason(path: string): string | null {
  for (const { re, why } of SENSITIVE_NAME_PATTERNS) if (re.test(path)) return why
  return null
}

export function hasAllowedExtension(path: string): boolean {
  const lower = path.toLowerCase()
  return ALLOWED_EXTENSIONS.some(ext => lower.endsWith(ext))
}

/** Reason a repo-relative path cannot be a knowledge source, or null when it is acceptable by name/extension. */
export function pathExclusionReason(path: string): string | null {
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/')
  for (const dir of parts.slice(0, -1)) if (EXCLUDED_DIRS.has(dir.toLowerCase())) return `excluded folder "${dir}"`
  const sensitive = sensitivePathReason(normalized)
  if (sensitive) return `blocked: ${sensitive}`
  if (!hasAllowedExtension(normalized)) return `unsupported file type (allowed: ${ALLOWED_EXTENSIONS.join(', ')})`
  return null
}

// ── Secret detection ─────────────────────────────────────────────────────────

/** High-precision patterns: real credential formats, not the word "password". */
const SECRET_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/, label: 'private key block' },
  { re: /\bAKIA[0-9A-Z]{16}\b/, label: 'AWS access key id' },
  { re: /\bAIza[A-Za-z0-9_-]{30,}\b/, label: 'Google API key' },
  { re: /\bsk-[A-Za-z0-9_-]{20,}\b/, label: 'API secret key' },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, label: 'Slack token' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/, label: 'GitHub token' },
  { re: /\bglpat-[A-Za-z0-9_-]{16,}\b/, label: 'GitLab token' },
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, label: 'JSON web token' },
  { re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s@/]{3,}@[^\s]+/i, label: 'connection string with credentials' },
  { re: /\bBearer\s+[A-Za-z0-9\-_.=]{24,}/, label: 'bearer token' },
  // NAME = long-looking value, e.g. client_secret: "Q8x...". Placeholders are filtered in isPlaceholder().
  { re: /\b(?:client[_-]?secret|api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|secret[_-]?key|password|passwd|private[_-]?key)\b["']?\s*[:=]\s*["']?([A-Za-z0-9/+_\-.~]{20,})["']?/i, label: 'credential assignment' },
]

const PLACEHOLDER = /^(?:<.*>|\$\{.*\}|\{\{.*\}\}|x{4,}|\*{3,}|\.{3,}|your[-_ ]|example|changeme|placeholder|redacted|replace|todo|none|null|undefined|process\.env|env\.)/i

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER.test(value) || /^(?:[A-Z][A-Z0-9_]{3,})$/.test(value) /* an env-var NAME, not a value */ || new Set(value.toLowerCase()).size <= 3
}

export interface SecretFinding { label: string; line: number }

/** Credential-looking content with line numbers (never the value itself). */
export function detectSecrets(text: string): SecretFinding[] {
  const findings: SecretFinding[] = []
  const lines = text.split(/\r?\n/)
  lines.forEach((line, i) => {
    for (const { re, label } of SECRET_PATTERNS) {
      const m = re.exec(line)
      if (!m) continue
      if (label === 'credential assignment' && m[1] && isPlaceholder(m[1])) continue
      findings.push({ label, line: i + 1 })
      break
    }
  })
  return findings
}

/** Masks credential-looking content (defence in depth for anything that reaches a chunk or an answer). */
export function redactSecrets(text: string): string {
  return text
    .split(/\r?\n/)
    .map(line => {
      let out = line
      for (const { re, label } of SECRET_PATTERNS) {
        if (label === 'credential assignment') {
          out = out.replace(new RegExp(re.source, 'gi'), (full, value: string) => (value && !isPlaceholder(value) ? full.replace(value, '[REDACTED]') : full))
        } else {
          out = out.replace(new RegExp(re.source, re.flags.includes('i') ? 'gi' : 'g'), '[REDACTED]')
        }
      }
      return out
    })
    .join('\n')
}

// ── Classification ───────────────────────────────────────────────────────────

/** Operational / configuration documentation is administrator-only by default; feature and user guides are general. */
const ADMIN_PATH_PATTERNS: RegExp[] = [
  /(^|\/)docs\/04-integrations\//i,
  /(^|\/)docs\/05-api-integrations/i,
  /(^|\/)docs\/06-development\//i,
  /(^|\/)docs\/07-installation/i,
  /(^|\/)docs\/08-deployment/i,
  /(^|\/)docs\/09-database/i,
  /(^|\/)docs\/13-api-permission/i,
  /(^|\/)docs\/14-environment-variable/i,
  /(^|\/)docs\/HANDOVER/i,
  /(^|\/)docs\/plans\//i,
  /(^|\/)CLAUDE\.md$/i,
  /(^|\/)AGENTS\.md$/i,
]

export function classifyPath(path: string): AccessClass {
  const normalized = path.replace(/\\/g, '/')
  return ADMIN_PATH_PATTERNS.some(re => re.test(normalized)) ? 'admin' : 'general'
}

/** Documents that are indexed but start disabled (internal plans can describe unbuilt work). */
export function defaultEnabled(path: string): boolean {
  return !/(^|\/)docs\/plans\//i.test(path.replace(/\\/g, '/'))
}

export function deriveTitle(path: string, content: string): string {
  const heading = /^\s*#\s+(.+?)\s*#*\s*$/m.exec(content)?.[1]?.replace(/[`*_]/g, '').trim()
  if (heading) return heading.slice(0, MAX_TITLE_LENGTH)
  const base = path.replace(/\\/g, '/').split('/').pop() ?? path
  return base.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH) || 'Untitled'
}

// ── Upload validation ────────────────────────────────────────────────────────

export interface UploadCheck { ok: boolean; errors: string[] }

export function validateUpload(filename: string, content: unknown): UploadCheck {
  const errors: string[] = []
  if (typeof filename !== 'string' || !filename.trim()) errors.push('A file name is required.')
  else {
    if (/[\\/]|\.\./.test(filename)) errors.push('The file name must not contain path separators.')
    const reason = pathExclusionReason(filename)
    if (reason) errors.push(`This file cannot be used as a knowledge source (${reason}).`)
  }
  if (typeof content !== 'string' || !content.trim()) errors.push('The document is empty.')
  else {
    if (Buffer.byteLength(content, 'utf-8') > MAX_DOC_BYTES) errors.push(`The document is larger than ${Math.round(MAX_DOC_BYTES / 1000)} KB.`)
    if (content.includes('\u0000')) errors.push('The document looks like a binary file.')
    const secrets = detectSecrets(content)
    if (secrets.length) errors.push(`Possible credentials were found (${[...new Set(secrets.map(s => s.label))].join(', ')} at line ${secrets[0]!.line}). Remove them and try again.`)
  }
  return { ok: errors.length === 0, errors }
}
