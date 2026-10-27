import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../auditExportEmail.js', () => ({
  graphSendMail: vi.fn(async () => {}),
  validateRecipients: vi.fn((recipients: string[]) => recipients),
}))

import { graphSendMail } from '../auditExportEmail.js'
import { sendReportEmail } from '../reportEmail.js'

const ORIGINAL_ENV = process.env.INTUNE_AUDIT_EMAIL_SENDER_UPN

describe('sendReportEmail', () => {
  beforeEach(() => {
    vi.mocked(graphSendMail).mockClear()
  })
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.INTUNE_AUDIT_EMAIL_SENDER_UPN
    else process.env.INTUNE_AUDIT_EMAIL_SENDER_UPN = ORIGINAL_ENV
  })

  it('returns a clear config error (never fakes success) when no sender mailbox is configured', async () => {
    delete process.env.INTUNE_AUDIT_EMAIL_SENDER_UPN
    const result = await sendReportEmail({ recipients: ['a@zinnia.com'], subject: 'Report', filename: 'r.xlsx', content: Buffer.from('x'), contentType: 'application/octet-stream' })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/INTUNE_AUDIT_EMAIL_SENDER_UPN/)
    expect(graphSendMail).not.toHaveBeenCalled()
  })

  it('sends via Graph with the content base64-encoded as an attachment when configured', async () => {
    process.env.INTUNE_AUDIT_EMAIL_SENDER_UPN = 'reports@zinnia.com'
    const content = Buffer.from('hello world')
    const result = await sendReportEmail({ recipients: ['ito_endpoint@zinnia.com'], subject: 'Weekly Report', filename: 'weekly.xlsx', content, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    expect(result.ok).toBe(true)
    expect(graphSendMail).toHaveBeenCalledTimes(1)
    const [senderUpn, rawMessage] = vi.mocked(graphSendMail).mock.calls[0]!
    const message = rawMessage as { attachments: Array<{ contentBytes: string; name: string }>; toRecipients: Array<{ emailAddress: { address: string } }> }
    expect(senderUpn).toBe('reports@zinnia.com')
    expect(message.attachments[0]!.contentBytes).toBe(content.toString('base64'))
    expect(message.attachments[0]!.name).toBe('weekly.xlsx')
    expect(message.toRecipients[0]!.emailAddress.address).toBe('ito_endpoint@zinnia.com')
  })

  it('returns {ok:false} instead of throwing when the Graph call fails', async () => {
    process.env.INTUNE_AUDIT_EMAIL_SENDER_UPN = 'reports@zinnia.com'
    vi.mocked(graphSendMail).mockRejectedValueOnce(new Error('Graph sendMail failed (403)'))
    const result = await sendReportEmail({ recipients: ['a@zinnia.com'], subject: 'x', filename: 'x.csv', content: Buffer.from('x'), contentType: 'text/csv' })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/403/)
  })
})
