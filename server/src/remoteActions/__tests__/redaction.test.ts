import { describe, it, expect } from 'vitest'
import { redactSecrets, redactForAI, redactJson, sanitizeLog, containsSecret } from '../redaction.js'

describe('redactSecrets', () => {
  it('masks bearer tokens, JWTs and authorization headers', () => {
    const jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop'
    expect(redactSecrets(`Authorization: Bearer ${jwt}`)).toBe('Authorization: Bearer [REDACTED]')
    expect(redactSecrets(`token is ${jwt}`)).not.toContain('eyJhbGci')
    expect(redactSecrets('curl -H "authorization: basic dXNlcjpwYXNz"')).not.toContain('dXNlcjpwYXNz')
  })
  it('masks keyed literals and connection-string secrets but keeps variable references', () => {
    expect(redactSecrets('$password = "Sup3rS3cret!"')).toContain('[REDACTED]')
    expect(redactSecrets('{"client_secret": "abcd1234efgh"}')).not.toContain('abcd1234efgh')
    expect(redactSecrets('Server=db;User Id=sa;Password=hunter22;')).toBe('Server=db;User Id=sa;Password=[REDACTED];')
    expect(redactSecrets('$password = $env:APP_PASSWORD')).toBe('$password = $env:APP_PASSWORD')
  })
  it('masks cloud/source-control keys and private keys', () => {
    expect(redactSecrets('AKIAABCDEFGHIJKLMNOP')).toBe('[REDACTED AWS KEY]')
    expect(redactSecrets('ghp_abcdefghijklmnopqrstuvwx1234')).toBe('[REDACTED TOKEN]')
    expect(redactSecrets('-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----')).toBe('[REDACTED PRIVATE KEY]')
  })
  it('leaves ordinary text alone', () => {
    const t = 'Get-Process | Where-Object { $_.CPU -gt 10 }'
    expect(redactSecrets(t)).toBe(t); expect(containsSecret(t)).toBe(false)
  })
})

describe('redactForAI', () => {
  it('also removes personal data', () => {
    const out = redactForAI('user jane.doe@zinnia.com on 10.1.2.3 mac AA:BB:CC:DD:EE:FF at C:\\Users\\jdoe\\x and /Users/jane/y id 123e4567-e89b-12d3-a456-426614174000')
    expect(out).toBe('user [EMAIL] on [IP] mac [MAC] at C:\\Users\\[USER]\\x and /Users/[USER]/y id [ID]')
  })
})

describe('redactJson', () => {
  it('masks sensitive keys at any depth and scrubs string values', () => {
    const out = redactJson({ headers: { Authorization: 'Bearer abcdefghijklmnop' }, a: [{ access_token: 'x', note: 'Password=abc123;' }], ok: 1, empty: { token: '' } })
    expect(JSON.stringify(out)).not.toMatch(/abcdefghijklmnop|abc123/)
    expect(out.headers.Authorization).toBe('[REDACTED]'); expect(out.ok).toBe(1); expect(out.empty.token).toBe('')
  })
})

describe('sanitizeLog', () => {
  it('strips control/ANSI characters, escapes markup, scrubs secrets and truncates', () => {
    const out = sanitizeLog('\x1b[31mred\x1b[0m <script>alert(1)</script> a>b password="hunter22x"\x00')
    expect(out).toBe('red &lt;script>alert(1)&lt;/script> a>b password="[REDACTED]"')
    expect(sanitizeLog('x'.repeat(50), 10)).toMatch(/truncated 40 characters/)
    expect(sanitizeLog(undefined)).toBe('')
  })
})
