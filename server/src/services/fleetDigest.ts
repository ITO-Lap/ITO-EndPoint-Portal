// Weekly Fleet Health Digest — one Slack message with the headline numbers,
// week-over-week deltas and the top actions, instead of five separate file
// uploads. Each run also records a daily snapshot (fleetSnapshotStore.ts) so
// the next digest has something to compare against.

import { fetchAllDevices } from '../routes/devices.js'
import { getPatchSystems } from './endpointCentralPatch.js'
import { isSupportedCriticalPatchClient } from './criticalPatchReport.js'
import { STALE_DAYS } from './staleDevicesReport.js'
import { sendSlackBlocks } from './slack.js'
import { getSlackConfig } from '../store/integrationStore.js'
import { listSnapshots, saveSnapshot, type FleetSnapshot } from '../store/fleetSnapshotStore.js'

const DAY_MS = 86_400_000
const TARGET_BASELINE_DAYS = 7
const MAX_BASELINE_AGE_DAYS = 14

export async function collectFleetSnapshot(now = new Date()): Promise<FleetSnapshot> {
  const { devices } = await fetchAllDevices()
  const stale = devices.filter(d => {
    const ts = Date.parse(d.lastCheckIn)
    return Number.isFinite(ts) && Math.floor((now.getTime() - ts) / DAY_MS) >= STALE_DAYS
  }).length

  let criticalPatchDevices: number | null = null
  try {
    const systems = await getPatchSystems()
    criticalPatchDevices = systems.filter(s => s.scanSucceeded && s.criticalPatchCount > 0 && isSupportedCriticalPatchClient(s)).length
  } catch (error) {
    console.error('[fleet-digest] Patch Manager unavailable, omitting patch metric:', error)
  }

  const byPlatform: Record<string, number> = {}
  for (const d of devices) byPlatform[d.platform] = (byPlatform[d.platform] ?? 0) + 1

  return {
    date: now.toISOString().slice(0, 10), takenAt: now.toISOString(), total: devices.length,
    compliant: devices.filter(d => d.complianceState === 'Compliant').length,
    warning: devices.filter(d => d.complianceState === 'Warning').length,
    nonCompliant: devices.filter(d => d.complianceState === 'Non-Compliant').length,
    stale, criticalPatchDevices, byPlatform,
  }
}

/** The earlier snapshot closest to 7 days before `current`, ignoring anything older than 14 days. */
export function pickBaseline(current: FleetSnapshot, history: FleetSnapshot[]): FleetSnapshot | null {
  const currentDay = Date.parse(current.date)
  const candidates = history
    .map(s => ({ s, age: Math.round((currentDay - Date.parse(s.date)) / DAY_MS) }))
    .filter(({ age }) => age > 0 && age <= MAX_BASELINE_AGE_DAYS)
  if (!candidates.length) return null
  candidates.sort((a, b) => Math.abs(a.age - TARGET_BASELINE_DAYS) - Math.abs(b.age - TARGET_BASELINE_DAYS))
  return candidates[0]!.s
}

const complianceRate = (s: FleetSnapshot): number => (s.total > 0 ? (s.compliant / s.total) * 100 : 0)

/** `lowerIsBetter` decides whether a rise is shown as bad (🔴) or good (🟢). */
export function formatDelta(current: number, previous: number | null | undefined, lowerIsBetter: boolean, unit = ''): string {
  if (previous === null || previous === undefined) return ''
  const diff = Math.round((current - previous) * 10) / 10
  if (diff === 0) return ' · no change'
  const good = lowerIsBetter ? diff < 0 : diff > 0
  return ` · ${good ? '🟢' : '🔴'} ${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)}${unit}`
}

export function buildActions(s: FleetSnapshot): string[] {
  const actions: string[] = []
  if (s.criticalPatchDevices) actions.push(`Patch ${s.criticalPatchDevices} device${s.criticalPatchDevices === 1 ? '' : 's'} with missing critical patches`)
  if (s.nonCompliant) actions.push(`Review ${s.nonCompliant} non-compliant device${s.nonCompliant === 1 ? '' : 's'}`)
  if (s.stale) actions.push(`Investigate or retire ${s.stale} device${s.stale === 1 ? '' : 's'} silent for ${STALE_DAYS}+ days`)
  return actions.slice(0, 3)
}

export function buildDigestMessage(current: FleetSnapshot, baseline: FleetSnapshot | null): { text: string; blocks: unknown[] } {
  const rate = Math.round(complianceRate(current) * 10) / 10
  const prevRate = baseline ? Math.round(complianceRate(baseline) * 10) / 10 : null
  const patchLine = current.criticalPatchDevices === null
    ? '_Patch Manager unavailable_'
    : `*${current.criticalPatchDevices}*${formatDelta(current.criticalPatchDevices, baseline?.criticalPatchDevices, true)}`

  const fields = [
    { type: 'mrkdwn', text: `*Managed devices*\n${current.total}${formatDelta(current.total, baseline?.total, false)}` },
    { type: 'mrkdwn', text: `*Compliance rate*\n${rate}%${formatDelta(rate, prevRate, false, ' pts')}` },
    { type: 'mrkdwn', text: `*Non-compliant*\n${current.nonCompliant}${formatDelta(current.nonCompliant, baseline?.nonCompliant, true)}` },
    { type: 'mrkdwn', text: `*Stale (${STALE_DAYS}+ days)*\n${current.stale}${formatDelta(current.stale, baseline?.stale, true)}` },
    { type: 'mrkdwn', text: `*Devices missing critical patches*\n${patchLine}` },
  ]
  const actions = buildActions(current)
  const compared = baseline ? `vs ${baseline.date}` : 'first digest: no earlier snapshot to compare against yet'
  const blocks: unknown[] = [
    { type: 'header', text: { type: 'plain_text', text: `Endpoint Fleet Health · ${current.date}` } },
    { type: 'section', fields },
    ...(actions.length ? [{ type: 'section', text: { type: 'mrkdwn', text: `*Top actions*\n${actions.map((a, i) => `${i + 1}. ${a}`).join('\n')}` } }] : []),
    { type: 'context', elements: [{ type: 'mrkdwn', text: `Compared ${compared} · ITO Endpoint` }] },
  ]
  return { text: `Endpoint Fleet Health ${current.date}: ${rate}% compliant, ${current.nonCompliant} non-compliant, ${current.stale} stale`, blocks }
}

export async function sendFleetDigest(channelId: string): Promise<{ ok: boolean; error?: string; snapshot?: FleetSnapshot }> {
  const cfg = getSlackConfig()
  if (!cfg?.botToken) return { ok: false, error: 'Slack Bot OAuth token is not configured.' }
  const current = await collectFleetSnapshot()
  if (current.total === 0) return { ok: false, error: 'No device data available (no MDM source is connected or returned devices).' }
  const baseline = pickBaseline(current, listSnapshots())
  const { text, blocks } = buildDigestMessage(current, baseline)
  const result = await sendSlackBlocks(cfg, channelId, text, blocks)
  // Record only after a successful post and only for real data, so an outage
  // can never become a misleading 0-device baseline.
  if (result.ok) saveSnapshot(current)
  return { ...result, snapshot: current }
}
