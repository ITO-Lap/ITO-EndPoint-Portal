/**
 * Microsoft Teams Incoming Webhook integration.
 * Sends Adaptive Cards to a configured Teams channel via webhook URL.
 */

export interface TeamsMessageSection {
  title?: string
  facts?: Array<{ name: string; value: string }>
  text?: string
}

export interface TeamsMessagePayload {
  summary: string
  themeColor?: string
  title: string
  text?: string
  sections?: TeamsMessageSection[]
}

export function isTeamsConfigured(): boolean {
  return !!process.env.TEAMS_WEBHOOK_URL
}

export async function sendTeamsMessage(payload: TeamsMessagePayload): Promise<{ success: boolean; error?: string }> {
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL
  if (!webhookUrl) {
    return { success: false, error: 'TEAMS_WEBHOOK_URL not configured' }
  }

  const card = {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    summary: payload.summary,
    themeColor: payload.themeColor ?? 'F46C00',
    title: payload.title,
    ...(payload.text ? { text: payload.text } : {}),
    ...(payload.sections?.length ? {
      sections: payload.sections.map(s => ({
        ...(s.title ? { activityTitle: s.title } : {}),
        ...(s.text ? { text: s.text } : {}),
        ...(s.facts?.length ? { facts: s.facts } : {}),
      })),
    } : {}),
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
    })

    if (!res.ok) {
      const body = await res.text()
      return { success: false, error: `Teams webhook returned ${res.status}: ${body}` }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function sendTeamsAlert(opts: {
  ruleName: string
  ruleCategory: string
  deviceName?: string
  deviceUser?: string
  issue?: string
  severity?: string
}): Promise<{ success: boolean; error?: string }> {
  const color = opts.severity === 'Critical' ? 'FF0000'
    : opts.severity === 'High' ? 'FF6600'
    : opts.severity === 'Medium' ? 'FFC000'
    : '0078D4'

  return sendTeamsMessage({
    summary: `Automation Alert: ${opts.ruleName}`,
    themeColor: color,
    title: `⚡ ${opts.ruleName}`,
    sections: [
      {
        title: 'Alert Details',
        facts: [
          { name: 'Category', value: opts.ruleCategory },
          ...(opts.deviceName ? [{ name: 'Device', value: opts.deviceName }] : []),
          ...(opts.deviceUser ? [{ name: 'User', value: opts.deviceUser }] : []),
          ...(opts.issue ? [{ name: 'Issue', value: opts.issue }] : []),
          ...(opts.severity ? [{ name: 'Severity', value: opts.severity }] : []),
          { name: 'Time', value: new Date().toLocaleString() },
        ],
      },
    ],
  })
}
