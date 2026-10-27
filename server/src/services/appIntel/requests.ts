import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createJiraIssue, isJiraConfigured, type JiraIssueInput } from '../jira.js'
import { sendSlackMessage } from '../slack.js'
import { getSlackConfig, type RuntimeSlackConfig } from '../../store/integrationStore.js'
import type { AppCve } from './cve.js'
import type { AssessedApp, AppStatus } from './types.js'

// "Create packaging request" (Jira) and "Notify in Slack" straight from a version mismatch.
// Content is always built server-side from the latest sync snapshot — the client only names an app and a
// destination, so it cannot post arbitrary text through this integration. A request is recorded only after
// delivery succeeds, and an existing request for the same app + target version is never duplicated.

export type RequestKind = 'jira' | 'slack'
export const REQUEST_KINDS: readonly RequestKind[] = ['jira', 'slack']

export interface AppRequestRecord {
  id: string
  appKey: string
  app: string
  platform: 'windows' | 'macOS'
  targetVersion: string
  kind: RequestKind
  /** Jira issue key; null for Slack. */
  externalKey: string | null
  externalUrl: string | null
  createdAt: string
  createdBy: string
  createdByRole: string
}

export type RequestErrorCode = 'not_eligible' | 'not_configured' | 'duplicate' | 'delivery_failed'
export class RequestError extends Error {
  constructor(readonly code: RequestErrorCode, message: string, readonly existing?: AppRequestRecord) { super(message) }
}

export type RequestPriority = 'Critical' | 'High' | 'Medium'
export interface RequestContent { title: string; priority: RequestPriority; priorityBasis: string; body: string; slackText: string }

export interface RequestPreview {
  kind: RequestKind
  eligible: boolean
  reason: string | null
  configured: boolean
  configuredNote: string | null
  destination: string
  content: RequestContent | null
  duplicate: AppRequestRecord | null
}

// Statuses that a packaging request makes sense for. Others (Up to date, Native update, Data unavailable) have nothing to package.
const PACKAGING_STATUSES: readonly AppStatus[] = ['Package required', 'Repackage required', 'Update available — existing package']
const SLACK_COOLDOWN_MS = 60 * 60 * 1000

// ── Content ───────────────────────────────────────────────────────────────────────────────────────

/** Inventory strings come from devices, so strip control characters and bound the length before they leave the system. */
const stripControl = (v: string): string => Array.from(v, ch => { const c = ch.charCodeAt(0); return c < 32 || c === 127 ? ' ' : ch }).join('')
const clean = (v: string | null | undefined, max = 200): string => stripControl(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
/** Slack mrkdwn control characters; also defuses <!channel> / <@user> style injection. */
const slackEscape = (v: string): string => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function priorityFor(cve: AppCve): { priority: RequestPriority; basis: string } {
  if (cve.counts.knownExploited > 0) return { priority: 'Critical', basis: `${cve.counts.knownExploited} known-exploited (CISA KEV) CVE(s) affect installed versions` }
  if (cve.counts.critical + cve.counts.high > 0) return { priority: 'High', basis: `${cve.counts.critical} critical and ${cve.counts.high} high severity CVE(s) affect installed versions` }
  return { priority: 'Medium', basis: cve.state === 'ok' || cve.state === 'partial' ? 'No high-severity or known-exploited CVE found for the installed versions' : 'CVE data is not available, so priority is not raised' }
}

function cveLine(c: AppCve): string {
  if (c.state === 'unmapped') return 'Not checked (no verified NVD mapping for this app)'
  if (c.state === 'pending') return 'Still being checked'
  if (c.state === 'unavailable') return `Unavailable (${clean(c.reason, 120)})`
  if (!c.counts.total) return 'None found in NVD for the installed versions (NVD can lag disclosure)'
  const top = c.cves.slice(0, 5).map(x => `${x.id} ${x.severity}${x.knownExploited ? ' KEV' : ''}`).join(', ')
  return `${c.counts.total} (critical ${c.counts.critical}, high ${c.counts.high}, medium ${c.counts.medium}, low ${c.counts.low}; known exploited ${c.counts.knownExploited}). Top: ${top}`
}

export function buildRequestContent(app: AssessedApp, cve: AppCve, actor: string, syncedAt: string | null): RequestContent {
  const name = clean(app.identity.displayName, 100) || 'Unknown app'
  const platform = app.platform === 'macOS' ? 'macOS' : 'Windows'
  const latest = app.latest?.version ?? 'unknown'
  const { priority, basis } = priorityFor(cve)
  const lc = app.lifecycle
  const installed = [...app.installed].sort((a, b) => b.deviceCount - a.deviceCount).slice(0, 8).map(i => `${clean(i.version, 40)} x${i.deviceCount}`).join(', ')
  const pct = lc?.impact.percentBehind
  const notes = app.latest?.releaseNotes
  const notesLine = notes?.url ? notes.url : notes?.summary ? 'see excerpt below' : notes?.vendorUrl ? `not published (vendor site: ${notes.vendorUrl})` : 'not published by the source'
  const lines = [
    `Application: ${name} (${platform})${app.identity.publisher ? ` — ${clean(app.identity.publisher, 80)}` : ''}`,
    `Status: ${app.status}`,
    `Why: ${clean(app.reason, 500)}`,
    `Recommended action: ${clean(app.action, 200)}`,
    '',
    `Installed versions: ${installed || 'none'}`,
    `Deployed package: ${lc?.packaging.packageName ? `${clean(lc.packaging.packageName, 100)} — ${lc.packaging.deployedVersion ?? 'version not reported'}` : 'none found in Intune'}`,
    `Latest verified version: ${latest}${app.latest ? ` (${clean(app.latest.versionSource, 100)}; ${app.latest.sourceUrl})` : ''}`,
    `Estimated impacted devices: ${app.affectedDevices} of ${app.totalDevices}${pct != null ? ` (${pct}%)` : ''} — estimate from per-version detected-app counts`,
    `Owner: ${lc?.owner.name ? clean(lc.owner.name, 100) : 'not recorded in Intune'}`,
    `Deployment ring: ${lc?.ring.ring ? `${lc.ring.ring}${lc.ring.basis === 'group-name' ? ' (inferred from group names)' : ''}` : 'not identified'}`,
    `Known CVEs: ${cveLine(cve)}`,
    `Release notes: ${notesLine}`,
    ...(notes?.summary ? ['', 'Release notes excerpt:', clean(notes.summary, 600)] : []),
    '',
    `Priority: ${priority} — ${basis}.`,
    `Raised from ITO Endpoint → App Inventory by ${clean(actor, 80)}; inventory as of ${syncedAt ?? 'unknown'}. Nothing has been packaged, published or deployed.`,
  ]
  const slack = [
    `:package: *Version mismatch — ${slackEscape(name)} (${platform})*`,
    `Status: *${slackEscape(app.status)}* · latest verified *${slackEscape(latest)}* (${slackEscape(clean(app.latest?.versionSource, 80) || 'no verified source')})`,
    `Estimated impacted devices: *${app.affectedDevices}* of ${app.totalDevices}${pct != null ? ` (${pct}%)` : ''} · Owner: ${slackEscape(lc?.owner.name ? clean(lc.owner.name, 60) : 'not recorded')} · Ring: ${slackEscape(lc?.ring.ring ?? 'not identified')}`,
    `CVEs: ${slackEscape(cveLine(cve))}`,
    `Next step: ${slackEscape(clean(app.action, 160))}`,
    `_Sent by ${slackEscape(clean(actor, 80))} from ITO Endpoint · Priority ${priority}_`,
  ].join('\n')
  return { title: `[App update] ${name} (${platform}) → ${latest}`.slice(0, 250), priority, priorityBasis: basis, body: lines.join('\n'), slackText: slack }
}

// ── Eligibility ───────────────────────────────────────────────────────────────────────────────────

export function eligibility(app: AssessedApp, kind: RequestKind): { ok: true } | { ok: false; reason: string } {
  if (!app.latest) return { ok: false, reason: 'There is no verified latest version for this app, so there is no confirmed mismatch to raise.' }
  if (app.affectedDevices <= 0) return { ok: false, reason: 'No detected version is older than the latest verified version.' }
  if (kind === 'jira' && !PACKAGING_STATUSES.includes(app.status)) {
    return { ok: false, reason: `A packaging request applies to "Package required", "Repackage required" or "Update available — existing package"; this app is "${app.status}".` }
  }
  return { ok: true }
}

// ── Store ─────────────────────────────────────────────────────────────────────────────────────────

export interface RequestStore { all(): AppRequestRecord[]; add(r: AppRequestRecord): void }

export function createFileRequestStore(file: string | null = path.resolve(process.cwd(), '.cache', 'app-requests.v1.json')): RequestStore {
  let records: AppRequestRecord[] = []
  if (file) { try { const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as AppRequestRecord[]; if (Array.isArray(parsed)) records = parsed } catch { /* none yet */ } }
  return {
    all: () => records,
    add(r) {
      records = [...records, r]
      if (!file) return
      try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(records)) } catch (e) { console.warn('[app-requests] could not persist:', e instanceof Error ? e.message : e) }
    },
  }
}

// ── Service ───────────────────────────────────────────────────────────────────────────────────────

export interface RequestDeps {
  store: RequestStore
  now: () => number
  jiraConfigured: () => boolean
  createIssue: (input: JiraIssueInput) => Promise<{ key: string; url: string }>
  slackConfig: () => RuntimeSlackConfig | undefined
  slackChannelId: () => string | undefined
  sendSlack: typeof sendSlackMessage
}

export interface RequestActor { email: string; role: string }

export function createRequestService(deps: RequestDeps) {
  const inFlight = new Set<string>()
  const lockKey = (app: AssessedApp, kind: RequestKind) => `${kind}|${app.key}|${app.latest?.version ?? ''}`

  const findDuplicate = (app: AssessedApp, kind: RequestKind): AppRequestRecord | null => {
    const v = app.latest?.version
    const same = deps.store.all().filter(r => r.kind === kind && r.appKey === app.key && r.targetVersion === v)
    if (kind === 'jira') return same.at(-1) ?? null
    return same.filter(r => deps.now() - Date.parse(r.createdAt) < SLACK_COOLDOWN_MS).at(-1) ?? null
  }

  function destination(kind: RequestKind): { configured: boolean; note: string | null; label: string } {
    if (kind === 'jira') {
      return deps.jiraConfigured() ? { configured: true, note: null, label: 'Jira (new Task)' }
        : { configured: false, note: 'Jira is not configured (JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN).', label: 'Jira (new Task)' }
    }
    const cfg = deps.slackConfig()
    if (cfg?.webhookUrl) return { configured: true, note: null, label: 'Slack (incoming-webhook channel)' }
    if (cfg?.botToken && deps.slackChannelId()) return { configured: true, note: null, label: `Slack (channel ${deps.slackChannelId()})` }
    return { configured: false, note: cfg?.botToken ? 'Set SLACK_APP_UPDATE_CHANNEL_ID so the bot knows which channel to post to.' : 'Slack is not configured.', label: 'Slack' }
  }

  return {
    listFor: (appKey: string): AppRequestRecord[] => deps.store.all().filter(r => r.appKey === appKey),

    preview(app: AssessedApp, cve: AppCve, kind: RequestKind, actor: RequestActor, syncedAt: string | null): RequestPreview {
      const dest = destination(kind)
      const el = eligibility(app, kind)
      return {
        kind, eligible: el.ok, reason: el.ok ? null : el.reason, configured: dest.configured, configuredNote: dest.note, destination: dest.label,
        content: el.ok ? buildRequestContent(app, cve, actor.email, syncedAt) : null, duplicate: findDuplicate(app, kind),
      }
    },

    async create(app: AssessedApp, cve: AppCve, kind: RequestKind, actor: RequestActor, syncedAt: string | null): Promise<AppRequestRecord> {
      const el = eligibility(app, kind)
      if (!el.ok) throw new RequestError('not_eligible', el.reason)
      const dup = findDuplicate(app, kind)
      if (dup) throw new RequestError('duplicate', kind === 'jira' ? `A packaging request for ${app.identity.displayName} ${app.latest!.version} already exists${dup.externalKey ? ` (${dup.externalKey})` : ''}.` : 'A Slack notification for this app and version was already sent in the last hour.', dup)
      const dest = destination(kind)
      if (!dest.configured) throw new RequestError('not_configured', dest.note ?? 'Destination is not configured.')
      const lock = lockKey(app, kind)
      if (inFlight.has(lock)) throw new RequestError('duplicate', 'This request is already being created.')
      inFlight.add(lock)
      try {
        const content = buildRequestContent(app, cve, actor.email, syncedAt)
        let externalKey: string | null = null, externalUrl: string | null = null
        if (kind === 'jira') {
          try {
            const issue = await deps.createIssue({ summary: content.title, description: content.body, issueType: 'Task', priority: content.priority, labels: ['app-packaging', 'app-intelligence'] })
            externalKey = issue.key; externalUrl = issue.url
          } catch (e) { throw new RequestError('delivery_failed', `Jira rejected the request: ${e instanceof Error ? e.message.slice(0, 200) : 'unknown error'}`) }
        } else {
          const sent = await deps.sendSlack(deps.slackConfig()!, deps.slackChannelId(), content.slackText)
          if (!sent.ok) throw new RequestError('delivery_failed', `Slack did not accept the message: ${sent.error ?? 'unknown error'}`)
        }
        const record: AppRequestRecord = {
          id: randomUUID(), appKey: app.key, app: clean(app.identity.displayName, 100), platform: app.platform, targetVersion: app.latest!.version, kind,
          externalKey, externalUrl, createdAt: new Date(deps.now()).toISOString(), createdBy: clean(actor.email, 120), createdByRole: clean(actor.role, 40),
        }
        deps.store.add(record)
        console.info(`[app-requests] ${kind} request for "${record.app}" ${record.targetVersion} created by ${record.createdBy} (${record.createdByRole})${externalKey ? ` → ${externalKey}` : ''}`)
        return record
      } finally { inFlight.delete(lock) }
    },
  }
}

export type RequestService = ReturnType<typeof createRequestService>
let singleton: RequestService | null = null
export function getRequestService(): RequestService {
  return (singleton ??= createRequestService({
    store: createFileRequestStore(), now: Date.now, jiraConfigured: isJiraConfigured,
    createIssue: async input => { const i = await createJiraIssue(input); return { key: i.key, url: i.url } },
    slackConfig: getSlackConfig,
    slackChannelId: () => process.env.SLACK_APP_UPDATE_CHANNEL_ID ?? process.env.SLACK_CRITICAL_PATCH_CHANNEL_ID,
    sendSlack: sendSlackMessage,
  }))
}
