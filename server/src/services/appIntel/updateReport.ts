import { getSlackConfig } from '../../store/integrationStore.js'
import { sendSlackMessage } from '../slack.js'
import { exportToExcel, type ReportColumn } from '../reportExporter.js'
import { formatCount, type ReportOverview } from '../reportOverview.js'
import { getAppIntelService } from './service.js'
import { hasUpdateAvailable } from './query.js'
import { compareVersions, parseVersion } from './version.js'
import type { AssessedApp, AppPlatform } from './types.js'

// Slack "Verified application update report": every app whose installed version is behind the latest
// VERIFIED vendor version (winget manifest / Homebrew cask), with the number of devices behind and the
// packaging next step. Patching decisions rest on this, so it states its own limits (unverifiable apps,
// unread devices) instead of presenting a partial picture as complete.

export interface UpdateReportMeta {
  syncedAt: string
  /** Per-provider sync problems from the snapshot (e.g. ManageEngine devices that could not be read). */
  errors: Record<string, string>
  /** App keys whose verified latest version is new since the previous baseline. */
  newReleaseKeys?: ReadonlySet<string>
}

export interface UpdateReport { messages: string[]; updatesAvailable: number; devicesBehind: number }

const MAX_APPS_PER_PLATFORM = 25
const MAX_MESSAGE_CHARS = 3500

const esc = (v: string): string => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[*_~`]/g, '')
const PLATFORM_LABEL: Record<AppPlatform, string> = { windows: 'Windows', macOS: 'macOS' }

function behindVersions(app: AssessedApp): string {
  const latest = app.latest?.version
  if (!latest) return ''
  return app.installed
    .filter(i => parseVersion(i.version) && compareVersions(i.version, latest) === -1)
    .sort((a, b) => b.deviceCount - a.deviceCount)
    .slice(0, 3)
    .map(i => `${esc(i.version)} ×${i.deviceCount}`)
    .join(', ')
}

function line(app: AssessedApp, isNew: boolean): string {
  const devices = `${app.affectedDevices}/${app.totalDevices} device${app.totalDevices === 1 ? '' : 's'} behind`
  return `• *${esc(app.identity.displayName)}* ${behindVersions(app)} → *${esc(app.latest!.version)}* — ${devices} · ${esc(app.status)}${isNew ? ' · :new: release' : ''}\n   _${esc(app.latest!.versionSource)}_`
}

export function buildUpdateReport(apps: AssessedApp[], meta: UpdateReportMeta): UpdateReport {
  const updates = apps.filter(hasUpdateAvailable)
  const devicesBehind = updates.reduce((n, a) => n + a.affectedDevices, 0)
  const count = (pred: (a: AssessedApp) => boolean) => updates.filter(pred).length
  const unverifiable = apps.filter(a => !a.latest && a.status !== 'Native update').length
  const needsReview = apps.filter(a => a.status === 'Review required').length

  const head = [
    `:package: *Verified application update report*`,
    `*${updates.length}* app${updates.length === 1 ? '' : 's'} behind the latest verified version · *${devicesBehind}* device-installs to update`,
    `Package required: ${count(a => a.status === 'Package required' || a.status === 'Repackage required')} · Existing package ready: ${count(a => a.status === 'Update available — existing package')} · Vendor/native update: ${count(a => a.status === 'Native update')} · Needs review: ${count(a => a.status === 'Review required')}`,
  ]
  const blocks: string[] = []
  for (const platform of ['windows', 'macOS'] as const) {
    const list = updates.filter(a => a.platform === platform).sort((a, b) => b.affectedDevices - a.affectedDevices)
    if (!list.length) continue
    const shown = list.slice(0, MAX_APPS_PER_PLATFORM).map(a => line(a, meta.newReleaseKeys?.has(a.key) ?? false))
    if (list.length > shown.length) shown.push(`• +${list.length - shown.length} more ${PLATFORM_LABEL[platform]} app(s) — see Verified updates in the dashboard`)
    blocks.push(`*${PLATFORM_LABEL[platform]}* (${list.length})\n${shown.join('\n')}`)
  }
  if (!updates.length) blocks.push('_No installed app is behind its latest verified version._')

  const notes = [
    ...Object.values(meta.errors).map(e => `:warning: ${esc(e)}`),
    ...(unverifiable ? [`${unverifiable} app(s) have no verified latest-version source, so updates for them cannot be confirmed.`] : []),
    ...(needsReview ? [`${needsReview} app(s) need manual review (version could not be compared or package match is unclear).`] : []),
    `_Inventory synced ${meta.syncedAt}. "Behind" means older than the latest version published in winget-pkgs / Homebrew; pre-releases are ignored._`,
  ]

  // Slack truncates long messages: split on block boundaries and keep the caveats in the last one.
  const messages: string[] = []
  let cur = head.join('\n')
  for (const block of [...blocks, notes.join('\n')]) {
    if (cur.length + block.length + 2 > MAX_MESSAGE_CHARS && cur) { messages.push(cur); cur = '' }
    cur = cur ? `${cur}\n\n${block}` : block
  }
  messages.push(cur)
  return { messages, updatesAvailable: updates.length, devicesBehind }
}

export async function sendUpdateReportToSlack(apps: AssessedApp[], meta: UpdateReportMeta, channelId = process.env.SLACK_APP_UPDATE_CHANNEL_ID ?? process.env.SLACK_CRITICAL_PATCH_CHANNEL_ID): Promise<{ ok: boolean; error?: string; updatesAvailable: number; devicesBehind: number }> {
  const report = buildUpdateReport(apps, meta)
  const cfg = getSlackConfig()
  if (!cfg || (!cfg.webhookUrl && !(cfg.botToken && channelId))) {
    return { ok: false, error: 'Slack is not configured (set a bot token with SLACK_APP_UPDATE_CHANNEL_ID, or an incoming webhook).', updatesAvailable: report.updatesAvailable, devicesBehind: report.devicesBehind }
  }
  for (const text of report.messages) {
    const sent = await sendSlackMessage(cfg, channelId, text)
    if (!sent.ok) return { ok: false, ...(sent.error ? { error: sent.error } : {}), updatesAvailable: report.updatesAvailable, devicesBehind: report.devicesBehind }
  }
  return { ok: true, updatesAvailable: report.updatesAvailable, devicesBehind: report.devicesBehind }
}

export function buildUpdatesOverview(apps: AssessedApp[], meta: Pick<UpdateReportMeta, 'syncedAt' | 'errors'>): ReportOverview {
  const updates = apps.filter(hasUpdateAvailable)
  const devicesBehind = updates.reduce((n, a) => n + a.affectedDevices, 0)
  const count = (pred: (a: AssessedApp) => boolean) => updates.filter(pred).length
  const needsPackage = count(a => a.status === 'Package required' || a.status === 'Repackage required')
  const unverifiable = apps.filter(a => !a.latest && a.status !== 'Native update').length
  const top = [...updates].sort((a, b) => b.affectedDevices - a.affectedDevices)[0]
  const problems = Object.keys(meta.errors).length
  return {
    title: 'Verified Application Updates',
    fields: [
      { label: 'Apps behind latest version', value: updates.length },
      { label: 'Device-installs to update', value: devicesBehind },
      { label: 'Windows / macOS apps', value: `${count(a => a.platform === 'windows')} / ${count(a => a.platform === 'macOS')}` },
      { label: 'Package required', value: needsPackage },
      { label: 'Existing package ready', value: count(a => a.status === 'Update available — existing package') },
      { label: 'Vendor / native update', value: count(a => a.status === 'Native update') },
      { label: 'Needs review', value: count(a => a.status === 'Review required') },
      { label: 'No verified source', value: unverifiable },
    ],
    action: !updates.length ? 'No installed app is behind its latest verified version.'
      : `${needsPackage ? `Package ${formatCount(needsPackage)} app${needsPackage === 1 ? '' : 's'} first. ` : ''}Biggest gap: ${top!.identity.displayName} (${formatCount(top!.affectedDevices)} of ${formatCount(top!.totalDevices)} devices behind).`,
    footnote: `Inventory synced ${meta.syncedAt.slice(0, 16).replace('T', ' ')} UTC${problems ? ` · ${problems} sync warning${problems === 1 ? '' : 's'}, see workbook` : ''}`,
  }
}

const columns: ReportColumn[] = [
  { key: 'app', label: 'Application', width: 32 }, { key: 'platform', label: 'Platform', width: 12 },
  { key: 'installed', label: 'Installed versions (behind)', width: 34 }, { key: 'latest', label: 'Latest verified', width: 18 },
  { key: 'behind', label: 'Devices behind', width: 16 }, { key: 'total', label: 'Total devices', width: 16 },
  { key: 'status', label: 'Status', width: 34 }, { key: 'action', label: 'Next step', width: 48 },
  { key: 'source', label: 'Verified by', width: 44 }, { key: 'checked', label: 'Checked at', width: 24 },
]

/** Excel version of the update report for Scheduled Reports; built from the latest verified sync, never from stale-as-fresh data. */
export async function createAppUpdatesReport(): Promise<{ content: Buffer; filename: string; rows: number; overview: ReportOverview }> {
  const svc = getAppIntelService()
  let snap = svc.getSnapshot()
  if (!snap) { await svc.startSync(); snap = svc.getSnapshot() }
  if (!snap) throw new Error(`No verified application inventory is available: ${svc.getState().lastError ?? 'sync has not completed'}`)
  const rows = snap.apps.filter(hasUpdateAvailable).sort((a, b) => b.affectedDevices - a.affectedDevices).map(a => ({
    app: a.identity.displayName, platform: PLATFORM_LABEL[a.platform], installed: behindVersions(a), latest: a.latest!.version,
    behind: a.affectedDevices, total: a.totalDevices, status: a.status, action: a.action, source: a.latest!.versionSource, checked: a.lastCheckedAt ?? '',
  }))
  const caveats = Object.values(snap.errors)
  const content = await exportToExcel(rows, columns, {
    title: 'Verified Application Update Report',
    subtitle: `Apps behind the latest verified vendor version (winget-pkgs / Homebrew). Inventory synced ${snap.syncedAt}.${caveats.length ? ` Caveats: ${caveats.join(' | ')}` : ''}`,
    generatedAt: new Date().toISOString(), generatedBy: 'ITO Endpoint', recordCount: rows.length,
  })
  return { content, filename: `verified-app-updates-${snap.syncedAt.slice(0, 10)}.xlsx`, rows: rows.length, overview: buildUpdatesOverview(snap.apps, snap) }
}
