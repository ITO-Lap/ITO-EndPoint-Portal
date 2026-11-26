// Patch Tuesday briefing: a single Slack message that tells the team what Microsoft shipped last time, when the next
// release lands, which exploited CVEs still touch the fleet and which Windows versions are about to lose support.
// Built from the same data as the Windows Updates page (no new sources).

import { getWindowsFleetSummary, type WindowsFleetSummary } from './windowsUpdateFleet.js'
import { getWindowsIntel, type WindowsIntel } from './windowsSecurityIntel.js'
import { sendSlackBlocks } from './slack.js'
import { getSlackConfig } from '../store/integrationStore.js'

const fmt = (iso: string): string => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const plural = (n: number, w: string): string => `${n} ${n === 1 ? w : w === 'advisory' ? 'advisories' : `${w}s`}`

export function buildBriefingMessage(intel: WindowsIntel, fleet: WindowsFleetSummary): { text: string; blocks: unknown[] } {
  const next = intel.upcoming.nextPatchTuesday
  const when = next.daysAway === 0 ? 'today' : `in ${plural(next.daysAway, 'day')}`
  const last = intel.latestRelease
  const ex = fleet.exposure
  const fleetBuilds = new Map(fleet.builds.map(b => [b.build, b.devices]))

  const lines: string[] = []
  if (ex) {
    const overdue = ex.kevClock.filter(k => k.status === 'overdue')
    if (overdue.length) lines.push(`Patch the ${plural(overdue.length, 'overdue CISA KEV CVE')} first: ${overdue.slice(0, 3).map(k => `${k.cve} (${plural(k.devices, 'device')}, ${-k.daysLeft}d overdue)`).join(', ')}.`)
    const dueSoon = ex.kevClock.filter(k => k.status === 'due-soon')
    if (dueSoon.length) lines.push(`${plural(dueSoon.length, 'KEV deadline')} fall within 7 days: ${dueSoon.slice(0, 3).map(k => k.cve).join(', ')}.`)
    if (ex.bands.Critical) lines.push(`Review the ${plural(ex.bands.Critical, 'device')} in Critical exposure (score 70+) on the Risk & deadlines tab.`)
  }
  const ending = intel.upcomingEndOfServicing.map(l => ({ l, devices: fleetBuilds.get(l.build) ?? 0 })).filter(x => x.devices > 0)
  for (const { l, devices } of ending.slice(0, 2)) lines.push(`${plural(devices, 'device')} run ${l.version}, ${l.daysToEnd < 0 ? 'which is out of support' : `support ends in ${plural(l.daysToEnd, 'day')}`}; plan the feature update.`)
  if (!lines.length) lines.push('No urgent actions: no overdue KEV deadlines or near end-of-support builds affect your devices.')

  const blocks: unknown[] = [
    { type: 'header', text: { type: 'plain_text', text: 'Windows Patch Tuesday briefing' } },
    { type: 'section', text: { type: 'mrkdwn', text: `*Next Patch Tuesday:* ${fmt(next.date)} (${when})\n*Next optional preview:* ${fmt(intel.upcoming.nextOptionalPreview.date)}` } },
    ...(last ? [{ type: 'section', text: { type: 'mrkdwn', text: `*Last release (${last.title}):* ${last.totals.cves} Windows CVEs · ${last.totals.critical} critical · ${last.totals.exploited} exploited · ${last.totals.inKev} in CISA KEV` } }] : []),
    ...(intel.earlyRelease && intel.earlyRelease.windowsAdvisories > 0 ? [{ type: 'section', text: { type: 'mrkdwn', text: `*Early look:* MSRC has already published ${intel.earlyRelease.title} (${plural(intel.earlyRelease.windowsAdvisories, 'Windows advisory')}).` } }] : []),
    ...(ex ? [{ type: 'section', fields: [
      { type: 'mrkdwn', text: `*Critical exposure*\n${plural(ex.bands.Critical, 'device')}` }, { type: 'mrkdwn', text: `*High exposure*\n${plural(ex.bands.High, 'device')}` },
      { type: 'mrkdwn', text: `*Devices missing updates*\n${fleet.devicesAffected} of ${fleet.devicesChecked}` }, { type: 'mrkdwn', text: `*KEV CVEs touching the fleet*\n${ex.kevClock.length}` },
    ] }] : [{ type: 'section', text: { type: 'mrkdwn', text: '_Fleet exposure unavailable right now (Endpoint Central or Microsoft data not reachable)._' } }]),
    { type: 'section', text: { type: 'mrkdwn', text: `*Recommended actions*\n${lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}` } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: 'Sources: Microsoft MSRC, CISA KEV, endoflife.date, Endpoint Central, Intune · EndPoint+' }] },
  ]
  return { text: `Windows Patch Tuesday briefing: next release ${fmt(next.date)} (${when})`, blocks }
}

export async function sendWindowsBriefing(channelId: string): Promise<{ ok: boolean; error?: string; devices?: number }> {
  const cfg = getSlackConfig()
  if (!cfg?.botToken) return { ok: false, error: 'Slack Bot OAuth token is not configured.' }
  let intel: WindowsIntel
  try { intel = await getWindowsIntel() } catch (e) { return { ok: false, error: `Microsoft/CISA data unavailable: ${e instanceof Error ? e.message : String(e)}` } }
  const fleet = await getWindowsFleetSummary()
  const message = buildBriefingMessage(intel, fleet)
  const result = await sendSlackBlocks(cfg, channelId, message.text, message.blocks)
  return { ...result, devices: fleet.devicesAffected }
}
