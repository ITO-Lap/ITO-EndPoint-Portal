// Email delivery for scheduled reports — reuses auditExportEmail.ts's Graph
// sendMail plumbing (same INTUNE_AUDIT_EMAIL_SENDER_UPN service mailbox,
// same recipient validation) instead of building a new email stack. Unlike
// sendExportEmail() there, this takes a raw Buffer directly — no dependency
// on auditExportStorage.ts's blob/StoredArtifact machinery, since scheduled
// reports are generated in memory, not persisted to blob storage first.
//
// Never throws past the caller and never fakes success: when
// INTUNE_AUDIT_EMAIL_SENDER_UPN isn't set, returns a clear {ok:false, error}
// — same live/mock convention as every other integration in this app.

import { graphSendMail, validateRecipients } from './auditExportEmail.js'

export interface SendReportEmailInput {
  recipients: string[]
  subject: string
  message?: string
  filename: string
  content: Buffer
  contentType: string
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function sendReportEmail(input: SendReportEmailInput): Promise<{ ok: boolean; error?: string }> {
  const senderUpn = process.env.INTUNE_AUDIT_EMAIL_SENDER_UPN
  if (!senderUpn) {
    return { ok: false, error: 'INTUNE_AUDIT_EMAIL_SENDER_UPN is not configured — email delivery is unavailable until a service mailbox is set.' }
  }
  try {
    const recipients = validateRecipients(input.recipients)
    await graphSendMail(senderUpn, {
      subject: input.subject,
      body: { contentType: 'HTML', content: `<p>${escapeHtml(input.message ?? 'Your scheduled report is attached.')}</p>` },
      toRecipients: recipients.map(address => ({ emailAddress: { address } })),
      attachments: [{
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: input.filename,
        contentType: input.contentType,
        contentBytes: input.content.toString('base64'),
      }],
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
