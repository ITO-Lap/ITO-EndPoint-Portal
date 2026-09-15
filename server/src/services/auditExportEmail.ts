// Email delivery for completed Intune audit exports.
//
// Sends via Microsoft Graph sendMail from a designated service mailbox
// (INTUNE_AUDIT_EMAIL_SENDER_UPN), using the same app-only credentials as
// the rest of this module. This requires the Graph application permission
// Mail.Send, ideally restricted to that one mailbox via an Exchange Online
// application access policy (New-ApplicationAccessPolicy) rather than
// granted tenant-wide — see docs/04-integrations for setup notes.
//
// Large exports are never attached — a short-lived expiring download link
// (minted by auditExportStorage.getExportDownloadUrl) is sent instead, so a
// forwarded email can never leak a permanent blob URL.
//
// When INTUNE_AUDIT_EMAIL_SENDER_UPN is unset, sends are logged and rejected
// with a clear configuration error rather than silently no-op'd — email
// delivery must never appear to succeed when nothing was actually sent.

import { getAuditGraphToken } from './intuneAuditAuth.js'
import { getExportDownloadUrl, downloadExportArtifact } from './auditExportStorage.js'
import type { StoredArtifact } from './auditExportStorage.js'

export class EmailConfigError extends Error {}
export class EmailRecipientError extends Error {}

function allowedDomains(): string[] {
  return (process.env.INTUNE_AUDIT_EMAIL_ALLOWED_DOMAINS ?? '')
    .split(',')
    .map(d => d.trim().toLowerCase())
    .filter(Boolean)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Validates recipients against RFC-shape and (when configured) an allowed-
 *  domain list. Restricting external recipients is a data-exfiltration
 *  control, not just a UX nicety — every send path must call this. */
export function validateRecipients(recipients: string[]): string[] {
  if (recipients.length === 0) throw new EmailRecipientError('At least one recipient is required.')
  if (recipients.length > 20) throw new EmailRecipientError('At most 20 recipients are allowed per send.')

  const domains = allowedDomains()
  const normalized = recipients.map(r => r.trim().toLowerCase())

  for (const r of normalized) {
    if (!EMAIL_RE.test(r)) throw new EmailRecipientError(`"${r}" is not a valid email address.`)
    if (domains.length > 0) {
      const domain = r.split('@')[1] ?? ''
      if (!domains.includes(domain)) {
        throw new EmailRecipientError(`Recipient domain "${domain}" is not in the approved allowlist (${domains.join(', ')}).`)
      }
    }
  }
  return normalized
}

export interface SendExportEmailInput {
  recipients: string[]
  subject: string
  message?: string | undefined
  artifact: StoredArtifact & { format: string }
  filename: string
}

export interface SendExportEmailResult {
  deliveryMode: 'attachment' | 'link'
  sentAt: string
}

function attachmentMaxBytes(): number {
  return Number(process.env.INTUNE_AUDIT_EMAIL_ATTACHMENT_MAX_MB ?? 20) * 1024 * 1024
}

function linkTtlMinutes(): number {
  return Number(process.env.INTUNE_AUDIT_EMAIL_LINK_TTL_MINUTES ?? 30)
}

async function graphSendMail(senderUpn: string, message: object): Promise<void> {
  const token = await getAuditGraphToken()
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderUpn)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, saveToSentItems: true }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Graph sendMail failed (${res.status}): ${body.slice(0, 300)}`)
  }
}

/** Sends (or generates a link for) one completed export artifact. Content is
 *  escaped as plain text within the HTML body — recipient list, subject,
 *  and message are all server-validated and never rendered as raw HTML from
 *  untrusted input. */
export async function sendExportEmail(input: SendExportEmailInput): Promise<SendExportEmailResult> {
  const senderUpn = process.env.INTUNE_AUDIT_EMAIL_SENDER_UPN
  if (!senderUpn) {
    throw new EmailConfigError(
      'INTUNE_AUDIT_EMAIL_SENDER_UPN is not configured — email delivery is unavailable until a service mailbox is set.'
    )
  }
  const recipients = validateRecipients(input.recipients)
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const useLink = input.artifact.sizeBytes > attachmentMaxBytes()
  const bodyLines = [
    input.message ? `<p>${escape(input.message)}</p>` : '',
    `<p>Format: ${escape(input.artifact.format.toUpperCase())}</p>`,
    `<p>SHA-256: <code>${escape(input.artifact.sha256)}</code></p>`,
  ]

  if (useLink) {
    const url = await getExportDownloadUrl(input.artifact.blobPath, linkTtlMinutes())
    bodyLines.push(`<p><a href="${escape(url)}">Download the export</a> — link expires in ${linkTtlMinutes()} minutes.</p>`)
    await graphSendMail(senderUpn, {
      subject: input.subject,
      body: { contentType: 'HTML', content: bodyLines.join('\n') },
      toRecipients: recipients.map(address => ({ emailAddress: { address } })),
    })
    return { deliveryMode: 'link', sentAt: new Date().toISOString() }
  }

  const content = await downloadExportArtifact(input.artifact.blobPath)
  await graphSendMail(senderUpn, {
    subject: input.subject,
    body: { contentType: 'HTML', content: bodyLines.join('\n') },
    toRecipients: recipients.map(address => ({ emailAddress: { address } })),
    attachments: [{
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: input.filename,
      contentType: input.artifact.contentType,
      contentBytes: content.toString('base64'),
    }],
  })
  return { deliveryMode: 'attachment', sentAt: new Date().toISOString() }
}
