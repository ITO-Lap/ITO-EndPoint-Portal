// Sensitive-data redaction for the Remote Action Center and the Graph API Runner.
//
// Everything that is stored in history, written to an audit record, returned in a download, or sent to an AI service
// passes through here first. Deterministic pattern matching only — never delegated to a model.

const MASK = '[REDACTED]'

interface Pattern { name: string; re: RegExp; replace: string | ((m: string, ...g: string[]) => string) }

// Order matters: block-shaped secrets first, then keyed assignments, then bare tokens.
const SECRET_PATTERNS: Pattern[] = [
  { name: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, replace: `[REDACTED PRIVATE KEY]` },
  { name: 'authorization-header', re: /\b(authorization\s*[:=]\s*)(bearer|basic)?\s*[^\s'",;]+/gi, replace: (_m, p1: string, p2?: string) => `${p1}${p2 ? p2 + ' ' : ''}${MASK}` },
  { name: 'bearer', re: /\b(bearer\s+)[A-Za-z0-9\-._~+/]{12,}=*/gi, replace: (_m, p1: string) => `${p1}${MASK}` },
  { name: 'jwt', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, replace: '[REDACTED JWT]' },
  { name: 'aws-access-key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, replace: '[REDACTED AWS KEY]' },
  { name: 'github-token', re: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/g, replace: '[REDACTED TOKEN]' },
  { name: 'slack-token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, replace: '[REDACTED TOKEN]' },
  // Connection strings: Password=...;  /  pwd=...;
  { name: 'connection-string', re: /\b((?:password|pwd|accountkey|sharedaccesskey|secret)\s*=\s*)(?![$<{])[^;\s'"]+/gi, replace: (_m, p1: string) => `${p1}${MASK}` },
  // key = "literal" / key: 'literal' / "key": "literal". Variable references ($env:X, ${X}, $(…)) are NOT secrets.
  {
    name: 'keyed-literal',
    re: /(["']?\b[\w.-]*(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|client[_-]?secret|refresh[_-]?token|access[_-]?token|private[_-]?key)[\w.-]*["']?\s*[:=]\s*)(["'])(?!\s*\$|\s*\{\{|\s*<)([^"'\r\n]{4,})\2/gi,
    replace: (_m, p1: string, q: string) => `${p1}${q}${MASK}${q}`,
  },
]

const PII_PATTERNS: Pattern[] = [
  { name: 'email', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replace: '[EMAIL]' },
  { name: 'ipv4', re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g, replace: '[IP]' },
  { name: 'mac-address', re: /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g, replace: '[MAC]' },
  { name: 'guid', re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, replace: '[ID]' },
  { name: 'windows-user-path', re: /\b([A-Za-z]:\\Users\\)[^\\\s'"]+/g, replace: (_m, p1: string) => `${p1}[USER]` },
  { name: 'mac-user-path', re: /(\/Users\/)[^/\s'"]+/g, replace: (_m, p1: string) => `${p1}[USER]` },
]

const apply = (text: string, patterns: Pattern[]): string =>
  patterns.reduce((acc, p) => acc.replace(p.re, p.replace as never), text)

/** Removes credentials, tokens, keys and connection-string secrets. Safe to run on anything stored or downloaded. */
export function redactSecrets(text: string): string {
  return apply(text, SECRET_PATTERNS)
}

/** Secrets AND personal data (emails, IPs, MACs, GUIDs, user-profile paths). Used before ANY request to an AI service. */
export function redactForAI(text: string): string {
  return apply(apply(text, SECRET_PATTERNS), PII_PATTERNS)
}

/** True when `text` still contains something the secret patterns would redact. */
export function containsSecret(text: string): boolean {
  return redactSecrets(text) !== text
}

// Header / key names whose VALUES must never be kept, wherever they appear in a JSON structure.
const SENSITIVE_KEY = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|password|passwd|secret|token|api[_-]?key|private[_-]?key|credential|assertion)$/i

/** Deep-redacts a JSON-like value: sensitive keys are masked and every string is secret-scrubbed. */
export function redactJson<T>(value: T, depth = 0): T {
  if (depth > 25) return MASK as unknown as T
  if (typeof value === 'string') return redactSecrets(value) as unknown as T
  if (Array.isArray(value)) return value.map(v => redactJson(v, depth + 1)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) && v !== null && v !== undefined && v !== '' ? MASK : redactJson(v, depth + 1)
    }
    return out as T
  }
  return value
}

/**
 * Makes device/script output safe to store and render: strips control characters and ANSI escapes, caps length, and
 * scrubs secrets. (React escapes text on render; this additionally stops markup and terminal escapes ever reaching
 * a downloaded file or a different consumer.)
 */
export function sanitizeLog(text: string | undefined | null, maxChars = 20_000): string {
  if (!text) return ''
  // eslint-disable-next-line no-control-regex
  const stripped = text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
  // Markup-looking "<tag", "</x", "<!--" is entity-escaped; ordinary comparison/redirect characters are left alone.
  const clean = redactSecrets(stripped).replace(/<(?=[A-Za-z/!?])/g, '&lt;')
  return clean.length > maxChars ? `${clean.slice(0, maxChars)}\n…[truncated ${clean.length - maxChars} characters]` : clean
}
