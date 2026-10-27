import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hasUpdateAvailable } from './query.js'
import { sendUpdateReportToSlack } from './updateReport.js'
import { compareVersions } from './version.js'
import type { AssessedApp } from './types.js'

type ReleaseBaseline = Record<string, string>
interface ReleaseAlertState {
  versions: ReleaseBaseline
  pending: Record<string, VerifiedReleaseChange>
  initializedAt: string
  lastSentAt: string | null
}
const file = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.app-release-alerts.json')
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function readState(): ReleaseAlertState | null {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as ReleaseAlertState | ReleaseBaseline
    if ('versions' in raw && 'pending' in raw) return raw as ReleaseAlertState
    // Migrate the former flat baseline without creating an alert storm.
    return { versions: raw as ReleaseBaseline, pending: {}, initializedAt: new Date().toISOString(), lastSentAt: null }
  } catch { return null }
}
function saveState(state: ReleaseAlertState): void {
  try { writeFileSync(file, JSON.stringify(state, null, 2), 'utf8') } catch (error) { console.error('[app-release-alerts] Could not persist state:', error) }
}

export interface VerifiedReleaseChange { key: string; app: string; platform: 'windows' | 'macOS'; previous: string; latest: string; source: string; affectedDevices: number }

export function findVerifiedReleaseChanges(previous: ReleaseBaseline, apps: AssessedApp[]): VerifiedReleaseChange[] {
  return apps.flatMap(app => {
    const latest = app.latest
    const prior = previous[app.key]
    if (!latest || !prior || compareVersions(latest.version, prior) !== 1) return []
    return [{ key: app.key, app: app.identity.displayName, platform: app.platform, previous: prior, latest: latest.version, source: latest.versionSource, affectedDevices: app.affectedDevices }]
  })
}

function alertIntervalMs(): number {
  const configured = Number(process.env.APP_INTEL_RELEASE_ALERT_INTERVAL_MS)
  return Number.isFinite(configured) && configured >= WEEK_MS ? configured : WEEK_MS
}

/** Records the first verified sync as a baseline. Once a week it posts the full update report
 * (every app behind its verified latest, flagging releases new since the last report) — never per release. */
export async function alertOnVerifiedReleaseChanges(apps: AssessedApp[], meta: { syncedAt: string; errors: Record<string, string> }): Promise<void> {
  const now = new Date()
  const existing = readState()
  const versions = Object.fromEntries(apps.filter(app => app.latest).map(app => [app.key, app.latest!.version])) as ReleaseBaseline
  if (!existing) {
    saveState({ versions, pending: {}, initializedAt: now.toISOString(), lastSentAt: null })
    return
  }
  const changes = findVerifiedReleaseChanges(existing.versions, apps)
  const pending = { ...existing.pending }
  for (const change of changes) {
    const prior = pending[change.key]
    pending[change.key] = prior ? { ...change, previous: prior.previous } : change
  }
  const state: ReleaseAlertState = { ...existing, versions: { ...existing.versions, ...versions }, pending }
  saveState(state)
  if (!Object.keys(pending).length && !apps.some(hasUpdateAvailable)) return
  const ageSinceBaseline = now.getTime() - Date.parse(state.initializedAt)
  const ageSinceLastSent = state.lastSentAt ? now.getTime() - Date.parse(state.lastSentAt) : Infinity
  if (ageSinceBaseline < alertIntervalMs() || ageSinceLastSent < alertIntervalMs()) return

  const sent = await sendUpdateReportToSlack(apps, { ...meta, newReleaseKeys: new Set(Object.keys(pending)) })
  if (!sent.ok) { console.error('[app-release-alerts] Slack update report failed:', sent.error); return }
  saveState({ ...state, pending: {}, lastSentAt: now.toISOString() })
}
