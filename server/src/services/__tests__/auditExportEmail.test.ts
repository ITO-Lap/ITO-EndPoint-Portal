import { describe, it, expect } from 'vitest'
import { validateRecipients, EmailRecipientError } from '../auditExportEmail.js'

describe('validateRecipients', () => {
  it('accepts valid addresses when no domain allowlist is configured', () => {
    delete process.env.INTUNE_AUDIT_EMAIL_ALLOWED_DOMAINS
    expect(validateRecipients(['a@zinnia.com', 'b@other.com'])).toEqual(['a@zinnia.com', 'b@other.com'])
  })

  it('rejects a malformed address', () => {
    expect(() => validateRecipients(['not-an-email'])).toThrow(EmailRecipientError)
  })

  it('rejects an empty recipient list', () => {
    expect(() => validateRecipients([])).toThrow(EmailRecipientError)
  })

  it('rejects more than 20 recipients', () => {
    const many = Array.from({ length: 21 }, (_, i) => `user${i}@zinnia.com`)
    expect(() => validateRecipients(many)).toThrow(EmailRecipientError)
  })

  it('enforces the allowed-domain restriction when configured', () => {
    process.env.INTUNE_AUDIT_EMAIL_ALLOWED_DOMAINS = 'zinnia.com'
    expect(() => validateRecipients(['attacker@evil.com'])).toThrow(EmailRecipientError)
    expect(validateRecipients(['admin@zinnia.com'])).toEqual(['admin@zinnia.com'])
    delete process.env.INTUNE_AUDIT_EMAIL_ALLOWED_DOMAINS
  })

  it('is case-insensitive on domain matching', () => {
    process.env.INTUNE_AUDIT_EMAIL_ALLOWED_DOMAINS = 'zinnia.com'
    expect(validateRecipients(['Admin@Zinnia.COM'])).toEqual(['admin@zinnia.com'])
    delete process.env.INTUNE_AUDIT_EMAIL_ALLOWED_DOMAINS
  })
})
