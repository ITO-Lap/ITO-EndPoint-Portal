// Endpoint Operations Copilot — tool registry.
//
// Every tool wraps ALREADY-REAL app logic (services/routes that hit live
// Intune/ManageEngine/Entra/Jira/Postgres, or degrade gracefully with an
// explicit "not configured" result) — nothing here fabricates data or
// silently falls back to mock content. If a wrapped source throws (not
// configured, upstream API error), the tool's `run()` re-throws with a
// plain-English message; the calling engine feeds that back to the model so
// the final answer states the failure plainly instead of inventing an
// answer.
//
// RBAC: 'read' tools are available to Global Admin / IT Admin / Helpdesk.
// 'write' tools are available to Global Admin / IT Admin only, and are NEVER
// executed inside the OpenAI tool-calling loop — copilotEngine.ts always
// short-circuits a write tool call into a pendingAction and only invokes
// `run()` for a write tool from the separate POST /actions/:id/confirm route
// (server/src/routes/copilot.ts), after RBAC is re-checked there.
//
// ctx.role comes from the verified session (see requireSession.ts) by the
// time it reaches here. This module trusts the caller (routes/copilot.ts) to
// have already run requireCapability() — ctx.role here is only used for
// defensive double-checks inside write-tool preview logic, not as the
// primary gate.

import { isDbAvailable, query } from '../db/index.js'
import * as scheduledReportsStore from '../store/scheduledReportsStore.js'
import { credentialsFromEnv, getManagedDevices, getCompliancePolicies, getConfigurationProfiles } from './graphApi.js'
import { batchComputeRiskScores, fleetRiskSummary } from './riskScoring.js'
import { detectConflicts, conflictSummary } from './policyConflict.js'
import { getLatestSyncRun, getChangeHistory } from './securityPoliciesStore.js'
import { fetchAllDevices } from '../routes/devices.js'
import { fetchLiveDevices } from '../routes/automations.js'
import { getCoverageSnapshot } from '../routes/securityInventory.js'
import { getPostureResult, getPillarDeviceList, getPostureDiagnostics } from '../routes/securityPosture.js'
import { getMissingPatches, PatchApiError, isPatchApiConfigured } from './endpointCentralPatch.js'
import { getUserIntelligence } from '../routes/users.js'
import { getRoleActivityEventsLive, listQuerySchema as roleActivityQuerySchema, liveBrowseMaxDays } from '../routes/roleActivity.js'
import { listAllItems } from './intuneScriptsConfigGraph.js'
import { getIntuneConfig } from '../store/integrationStore.js'
import { createJiraIssue, isJiraConfigured, type JiraIssueInput } from './jira.js'
import { sendTeamsMessage, isTeamsConfigured } from './teams.js'
import { runAutomationRule } from './automationEngine.js'
import { getRuleById } from '../data/mockAutomations.js'

// ─── Shared types ──────────────────────────────────────────────────────────

export interface CopilotCitation {
  source: string       // 'Intune' | 'Entra' | 'ManageEngine' | 'Jira' | 'internal' | ...
  recordId: string
  freshness: string     // ISO timestamp of when the underlying tool call ran
  /** Present only for a public web source. */
  url?: string
  /** What kind of source this is: project documentation, live tool data, or the public web (absent on older records). */
  kind?: 'doc' | 'live' | 'web'
  /** Documentation citations only: which indexed document/section the statement came from. */
  docId?: string
  chunkId?: string
  title?: string
  section?: string
  path?: string
}

export interface ToolContext {
  actorEmail: string
  actorRole: string
}

export interface ToolRunResult {
  result: unknown
  citations: CopilotCitation[]
}

export type ToolRbac = 'read' | 'write'

export interface ToolDefinition {
  name: string
  description: string
  rbac: ToolRbac
  /** JSON schema for the `parameters` field of an OpenAI function-calling tool. */
  parameters: Record<string, unknown>
  /** Executes the tool for real. For write tools, this is ONLY ever called by
   *  the confirm route after explicit user confirmation — never from inside
   *  the chat tool-calling loop. */
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolRunResult>
  /** Human-readable one-line summary of what a write tool is about to do,
   *  shown to the user as `CopilotPendingAction.summary` before they confirm.
   *  Read tools don't need this — they execute inline. */
  describeAction?: (args: Record<string, unknown>) => string
}

// ─── Secret-shaped value scrubbing ──────────────────────────────────────────
// Defensive redaction applied before persisting tool args/results and before
// sending tool results back to OpenAI. The read tools here only ever surface
// data that's already public-to-the-app, so this should be a no-op in
// practice — it exists as a defense-in-depth guard, not because any tool is
// expected to legitimately return a secret.

const SECRET_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9\-_.=]{10,}\b/gi,
  /\bsk-[A-Za-z0-9]{16,}\b/g,                      // OpenAI-style API keys
  /\bAIza[A-Za-z0-9_-]{20,}\b/g,                   // Google AI Studio API keys
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/gi,            // Slack tokens
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,               // GitHub tokens
  /\bglpat-[A-Za-z0-9-_]{16,}\b/g,                 // GitLab tokens
  /\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s"']+/gi, // DB connection strings
  /\b[A-Za-z0-9._%+-]+:[A-Za-z0-9._%+-]{8,}@[A-Za-z0-9.-]+\b/g, // user:secret@host
]

function scrubString(value: string): string {
  let out = value
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, '[REDACTED]')
  return out
}

export function scrubSecrets<T>(value: T): T {
  if (typeof value === 'string') return scrubString(value) as unknown as T
  if (Array.isArray(value)) return value.map(v => scrubSecrets(v)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = scrubSecrets(v)
    return out as unknown as T
  }
  return value
}

// ─── Small shared helpers ────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString()
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

// ─── 1. get_risk_scores ──────────────────────────────────────────────────────

const getRiskScores: ToolDefinition = {
  name: 'get_risk_scores',
  description: 'Get AI-computed device risk scores (0-100) for the fleet, ranked highest-risk first. Wraps the same rule-based scoring engine as the Risk Scoring page. Requires Intune/Entra credentials to be configured.',
  rbac: 'read',
  parameters: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max number of devices to return, highest risk first. Default 20, max 200.' },
    },
  },
  run: async (args) => {
    const limit = Math.min(Math.max(Number(args.limit ?? 20) || 20, 1), 200)
    const creds = credentialsFromEnv()
    const devices = await getManagedDevices(creds)
    // AI enrichment intentionally skipped here (useAi: false) — the Copilot
    // model itself narrates the rule-based factors in its final answer, so
    // paying for a second nested OpenAI call per device would be redundant.
    const scores = await batchComputeRiskScores(devices, null, { limit, useAi: false })
    const freshness = now()
    const citations: CopilotCitation[] = scores.map(s => ({ source: 'Intune', recordId: s.deviceId, freshness }))
    return {
      result: {
        count: scores.length,
        // The list is the riskiest devices of the whole fleet; these counts cover every device.
        fleet: fleetRiskSummary(devices),
        scores: scores.map(s => ({
          deviceId: s.deviceId, deviceName: s.deviceName, userEmail: s.userEmail,
          overallScore: s.overallScore, riskLevel: s.riskLevel,
          factors: s.factors.map(f => f.description), actionItems: s.actionItems,
        })),
      },
      citations,
    }
  },
}

// ─── 2. get_policy_conflicts ─────────────────────────────────────────────────

const getPolicyConflicts: ToolDefinition = {
  name: 'get_policy_conflicts',
  description: 'Detect duplicate, stale, or conflicting Intune compliance policies and configuration profiles. Wraps the same detection used by the Intelligence Platform policies view. Requires Intune/Entra credentials to be configured.',
  rbac: 'read',
  parameters: { type: 'object', properties: {} },
  run: async () => {
    const creds = credentialsFromEnv()
    const [compliance, config] = await Promise.all([
      getCompliancePolicies(creds),
      getConfigurationProfiles(creds),
    ])
    const conflicts = detectConflicts(compliance, config)
    const summary = conflictSummary(conflicts)
    const freshness = now()
    const citations: CopilotCitation[] = conflicts.map(c => ({ source: 'Intune', recordId: c.id, freshness }))
    return { result: { summary, conflicts }, citations }
  },
}

// ─── 3. get_security_policy_status ───────────────────────────────────────────

const getSecurityPolicyStatus: ToolDefinition = {
  name: 'get_security_policy_status',
  description: 'Get the latest Security Policies sync run status and recent policy changes (added/modified/removed) across Intune device-management and Entra ID identity policies. Requires DATABASE_URL and Intune/Entra to be configured.',
  rbac: 'read',
  parameters: {
    type: 'object',
    properties: {
      changeLimit: { type: 'number', description: 'Max number of recent changes to include. Default 20, max 100.' },
    },
  },
  run: async (args) => {
    if (!isDbAvailable()) {
      return {
        result: { configured: false, message: 'Security Policies requires a PostgreSQL database (DATABASE_URL), which is not configured.' },
        citations: [],
      }
    }
    const limit = Math.min(Math.max(Number(args.changeLimit ?? 20) || 20, 1), 100)
    const [latestSyncRun, changes] = await Promise.all([
      getLatestSyncRun(),
      getChangeHistory({ limit, syncRunId: undefined }),
    ])
    const freshness = now()
    const citations: CopilotCitation[] = []
    if (latestSyncRun) citations.push({ source: 'internal', recordId: latestSyncRun.id, freshness })
    for (const c of changes) citations.push({ source: c.source === 'intune' ? 'Intune' : 'Entra', recordId: c.policyId, freshness })
    return { result: { latestSyncRun, changes }, citations }
  },
}

// ─── 4. get_role_activity ────────────────────────────────────────────────────

const getRoleActivity: ToolDefinition = {
  name: 'get_role_activity',
  description: `Get recent admin role-management / RBAC / permission-change activity across Entra ID, Intune, and SharePoint. Bounded date range, defaults to the last 24 hours; max span is ${liveBrowseMaxDays()} days.`,
  rbac: 'read',
  parameters: {
    type: 'object',
    properties: {
      startUtc: { type: 'string', description: 'ISO-8601 start of range. Defaults to 24h before endUtc.' },
      endUtc: { type: 'string', description: 'ISO-8601 end of range. Defaults to now.' },
      search: { type: 'string', description: 'Free-text filter against actor/operation/target.' },
    },
  },
  run: async (args, ctx) => {
    const parsed = roleActivityQuerySchema.parse({
      ...(typeof args.startUtc === 'string' ? { startUtc: args.startUtc } : {}),
      ...(typeof args.endUtc === 'string' ? { endUtc: args.endUtc } : {}),
      ...(typeof args.search === 'string' ? { search: args.search } : {}),
      pageSize: 50,
    })
    const out = await getRoleActivityEventsLive(parsed, { email: ctx.actorEmail, appRole: ctx.actorRole })
    const freshness = now()
    const citations: CopilotCitation[] = out.data.map(e => ({
      source: e.source === 'entra_role_mgmt' ? 'Entra' : e.source === 'intune_rbac' ? 'Intune' : 'SharePoint',
      recordId: e.sourceRecordId, freshness,
    }))
    return { result: out, citations }
  },
}

// ─── 5. get_endpoint_protection_coverage ─────────────────────────────────────

const getEndpointProtectionCoverage: ToolDefinition = {
  name: 'get_endpoint_protection_coverage',
  description: 'Get CrowdStrike Falcon and Zscaler coverage percentages for physical Windows and macOS devices (excludes VDI), as shown on the Security Posture page. Uses the shared cached fleet scan; if the first scan is still running it returns its progress instead of data.',
  rbac: 'read',
  parameters: { type: 'object', properties: {} },
  run: async () => {
    const snap = getCoverageSnapshot()
    const scanTime = now()
    if (snap.state === 'scanning') {
      return { result: { scanning: true, progress: snap.progress, note: 'The first fleet scan is still running; ask again in a few minutes.' }, citations: [{ source: 'internal', recordId: 'coverage:scan', freshness: scanTime }] }
    }
    const { windows, macos, scanTime: scannedAt, stale } = snap.result
    return {
      result: { windows, macos, scanTime: scannedAt, stale: stale === true },
      citations: [
        { source: 'internal', recordId: 'coverage:windows', freshness: scannedAt },
        { source: 'internal', recordId: 'coverage:macos', freshness: scannedAt },
      ],
    }
  },
}

// ─── Security Posture tools (read-only) ──────────────────────────────────────

const POSTURE_PILLARS = ['encryption', 'patching', 'compliance', 'checkin']
const POSTURE_SOURCES = ['all', 'intune', 'manageengine']

const getSecurityPosture: ToolDefinition = {
  name: 'get_security_posture',
  description: 'Get the Security Posture summary shown on the Security Posture page: overall score and grade, the four pillars (Disk Encryption, Critical Patching, MDM Compliance, MDM Check-in) with passing / failing / not-reported counts, Windows and macOS Endpoint Central agent coverage, and data-health notes (stale MDM details, Patch Manager availability). Windows devices are in both Intune and Endpoint Central; macOS devices are only in Endpoint Central.',
  rbac: 'read',
  parameters: { type: 'object', properties: { source: { type: 'string', enum: POSTURE_SOURCES, description: "Which devices to include: 'all' (default), 'intune' or 'manageengine'." } } },
  run: async (args) => {
    const source = asString(args.source, 'all')
    if (!POSTURE_SOURCES.includes(source)) throw new Error(`source must be one of: ${POSTURE_SOURCES.join(', ')}`)
    const r = await getPostureResult(source as 'all' | 'intune' | 'manageengine')
    const grade = r.overall.score === null ? null : r.overall.score >= 90 ? 'A' : r.overall.score >= 80 ? 'B' : r.overall.score >= 70 ? 'C' : 'D'
    return {
      result: {
        generatedAt: r.generatedAt, source: r.source, deviceCount: r.deviceCount,
        overall: { ...r.overall, grade },
        pillars: r.pillars.map(p => ({
          id: p.id, label: p.label, weight: p.weight, scorePct: p.scorePct, inScope: p.inScope,
          passing: p.passing, failing: p.failing, notReported: p.notReported, unavailableReason: p.unavailableReason,
          byPlatform: p.byPlatform, topFindings: p.topFindings.slice(0, 5), unmatchedAgents: p.unmatchedAgents,
        })),
        agentCoverage: r.coverage ? { windows: r.coverage.windows, macos: r.coverage.macos } : null,
        dataHealth: r.enrichment,
      },
      citations: [{ source: 'internal', recordId: `security-posture:${source}`, freshness: r.generatedAt }],
    }
  },
}

const listPostureDevices: ToolDefinition = {
  name: 'list_posture_devices',
  description: 'List the devices behind a Security Posture pillar number, with each device\'s verdict (pass, fail or unknown = not reported), the one-line finding, the source the verdict is based on, and its patch resource id. Filter by status, platform or text. Use this for "which devices have encryption off", "which Macs are missing critical patches" or "show failing check-ins".',
  rbac: 'read',
  parameters: {
    type: 'object',
    properties: {
      pillar: { type: 'string', enum: POSTURE_PILLARS, description: 'encryption, patching, compliance or checkin.' },
      status: { type: 'string', enum: ['pass', 'fail', 'unknown'], description: 'Verdict filter. Default: fail.' },
      platform: { type: 'string', enum: ['Windows', 'macOS'], description: 'Optional platform filter.' },
      query: { type: 'string', description: 'Optional text search (device, user, serial, finding).' },
      limit: { type: 'number', description: 'Max rows. Default 20, max 50.' },
    },
    required: ['pillar'],
  },
  run: async (args) => {
    const pillar = asString(args.pillar)
    if (!POSTURE_PILLARS.includes(pillar)) throw new Error(`pillar must be one of: ${POSTURE_PILLARS.join(', ')}`)
    const status = asString(args.status, 'fail')
    if (!['pass', 'fail', 'unknown'].includes(status)) throw new Error('status must be pass, fail or unknown')
    const limit = Math.min(Math.max(Number(args.limit ?? 20) || 20, 1), 50)
    const platform = asString(args.platform)
    const q = asString(args.query)
    const list = await getPillarDeviceList({
      pillarId: pillar as 'encryption', status: status as 'pass', page: 1, pageSize: limit,
      ...(platform ? { platform } : {}), ...(q ? { q } : {}),
    })
    const freshness = now()
    return {
      result: {
        pillar, status, total: list.total, returned: list.rows.length,
        devices: list.rows.map(d => ({
          id: d.id, deviceName: d.deviceName, user: d.user, platform: d.platform, source: d.source, serialNumber: d.serialNumber,
          status: d.status, finding: d.detail, verdictBasedOn: d.facts?.find(f => f.label === 'Verdict based on')?.value,
          patchResourceId: d.patchResourceId,
        })),
      },
      citations: list.rows.slice(0, 10).map(d => ({ source: 'internal', recordId: `posture:${pillar}:${d.id}`, freshness })),
    }
  },
}

const getDeviceMissingPatches: ToolDefinition = {
  name: 'get_device_missing_patches',
  description: 'Get the full list of missing patches for ONE device from Endpoint Central Patch Manager, grouped by severity (Critical, Important, Moderate, Low) with KB number, description, category and release date. Needs the device\'s patchResourceId, which list_posture_devices returns for Patching and Check-in findings.',
  rbac: 'read',
  parameters: {
    type: 'object',
    properties: {
      patchResourceId: { type: 'string', description: 'Endpoint Central Patch Manager resource id (patchResourceId from list_posture_devices).' },
      view: { type: 'string', enum: ['all', 'critical', 'os', 'app'], description: 'Which patches to return. Default: all.' },
    },
    required: ['patchResourceId'],
  },
  run: async (args) => {
    const id = asString(args.patchResourceId).trim()
    if (!id) throw new Error('patchResourceId is required')
    const view = asString(args.view, 'all')
    if (!['all', 'critical', 'os', 'app'].includes(view)) throw new Error('view must be all, critical, os or app')
    if (!isPatchApiConfigured()) throw new Error('Endpoint Central is not configured')
    try {
      const r = await getMissingPatches(id, view as 'all')
      const bySeverity: Record<string, Array<{ kb: string | null; description: string; category: string; releasedAt: string | null }>> = {}
      for (const p of r.patches) (bySeverity[p.severity] ??= []).push({ kb: p.kb, description: (p.description || p.name).slice(0, 200), category: p.category, releasedAt: p.releasedAt })
      const counts = Object.fromEntries(Object.entries(bySeverity).map(([k, v]) => [k, v.length]))
      return { result: { patchResourceId: id, view, total: r.patches.length, counts, patches: bySeverity }, citations: [{ source: 'ManageEngine', recordId: id, freshness: r.fetchedAt }] }
    } catch (e) {
      if (e instanceof PatchApiError && e.kind === 'scope_required') throw new Error('Endpoint Central rejected the token: the PatchMgmt read scope is missing.', { cause: e })
      throw new Error(`Endpoint Central could not return the patch list right now (it may be rate-limited): ${e instanceof Error ? e.message : e}`, { cause: e })
    }
  },
}

const getPostureDiagnosticsTool: ToolDefinition = {
  name: 'get_posture_diagnostics',
  description: 'Get how Security Posture reconciled its sources: devices by platform, how many Windows devices matched an Endpoint Central agent and by which key (resource id, serial, MAC, host name), Patch Manager coverage, ambiguous host names, unmatched agent rows, and the latest ManageEngine MDM detail-read health (requested, recovered, failed, throttling reasons). Counts only; no device names.',
  rbac: 'read',
  parameters: { type: 'object', properties: {} },
  run: async () => {
    const { diag, mdmDetailReads } = await getPostureDiagnostics()
    const counts: Record<string, unknown> = { ...diag }
    delete counts['samples']                       // device names stay in the admin-only diagnostics endpoint
    return { result: { ...counts, mdmDetailReads }, citations: [{ source: 'internal', recordId: 'security-posture:diagnostics', freshness: now() }] }
  },
}

// ─── 6. get_scheduled_reports ─────────────────────────────────────────────────

const getScheduledReports: ToolDefinition = {
  name: 'get_scheduled_reports',
  description: 'List configured scheduled reports (critical patching, stale devices, compliance, inventory).',
  rbac: 'read',
  parameters: { type: 'object', properties: {} },
  run: async () => {
    const reports = (await scheduledReportsStore.listReports()).slice(0, 50)
    const freshness = now()
    const citations: CopilotCitation[] = reports.map(r => ({ source: 'internal', recordId: r.id, freshness }))
    const data = reports.map(r => ({
      id: r.id, name: r.name, report_type: r.report_type, schedule_cron: r.schedule_cron, format: r.format,
      is_active: r.is_active, last_run_at: r.last_run_at, next_run_at: r.next_run_at,
    }))
    return { result: { data }, citations }
  },
}

// ─── 7. get_audit_log ─────────────────────────────────────────────────────────

const getAuditLog: ToolDefinition = {
  name: 'get_audit_log',
  description: 'List recent entries from the application audit log (who did what, when). Requires DATABASE_URL.',
  rbac: 'read',
  parameters: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max rows to return. Default 25, max 200.' },
      action: { type: 'string', description: 'Filter by exact action name (e.g. COPILOT_JIRA_CREATED).' },
      resourceType: { type: 'string', description: 'Filter by resource_type (e.g. device, policy).' },
    },
  },
  run: async (args) => {
    if (!isDbAvailable()) {
      return { result: { configured: false, message: 'Audit log requires DATABASE_URL, which is not configured.', data: [] }, citations: [] }
    }
    const limit = Math.min(Math.max(Number(args.limit ?? 25) || 25, 1), 200)
    const clauses: string[] = ['1=1']
    const params: unknown[] = []
    if (typeof args.action === 'string' && args.action) { clauses.push(`action = $${params.length + 1}`); params.push(args.action) }
    if (typeof args.resourceType === 'string' && args.resourceType) { clauses.push(`resource_type = $${params.length + 1}`); params.push(args.resourceType) }
    const where = clauses.join(' AND ')
    const result = await query<{ id: string; user_email: string | null; action: string; resource_type: string | null; resource_id: string | null; created_at: string }>(
      `SELECT id, user_email, action, resource_type, resource_id, created_at
       FROM audit_logs WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length + 1}`,
      [...params, limit]
    )
    const freshness = now()
    const citations: CopilotCitation[] = result.rows.map(r => ({ source: 'internal', recordId: r.id, freshness }))
    return { result: { data: result.rows }, citations }
  },
}

// ─── 8. get_user_intelligence ─────────────────────────────────────────────────

const getUserIntelligenceTool: ToolDefinition = {
  name: 'get_user_intelligence',
  description: 'Get correlated Entra sign-in/MFA risk and Intune/ManageEngine device compliance for a single user. Accepts an Entra object id (UUID) or a UPN/email.',
  rbac: 'read',
  parameters: {
    type: 'object',
    properties: {
      userId: { type: 'string', description: 'Entra object id (UUID) or UPN/email of the user.' },
    },
    required: ['userId'],
  },
  run: async (args) => {
    const userId = asString(args.userId)
    if (!userId) throw new Error('userId is required')
    const data = await getUserIntelligence(userId)
    const freshness = now()
    const citations: CopilotCitation[] = [{ source: 'Entra', recordId: userId, freshness }]
    for (const d of (data.devices ?? []) as Array<{ deviceId: string; managementSource: string }>) {
      citations.push({ source: d.managementSource === 'ManageEngine' ? 'ManageEngine' : 'Intune', recordId: d.deviceId, freshness })
    }
    return { result: data, citations }
  },
}

// ─── 9. get_intune_scripts_config ────────────────────────────────────────────

const getIntuneScriptsConfig: ToolDefinition = {
  name: 'get_intune_scripts_config',
  description: 'List Intune scripts, remediations, and configuration/compliance policy metadata (Settings Catalog, Device Configuration, Compliance, Endpoint Security, Administrative Templates). Metadata only — no script contents. Requires Intune credentials.',
  rbac: 'read',
  parameters: {
    type: 'object',
    properties: {
      search: { type: 'string', description: 'Filter by display name substring.' },
      category: { type: 'string', description: 'Filter by category.' },
      limit: { type: 'number', description: 'Max items to return. Default 25, max 100.' },
    },
  },
  run: async (args) => {
    const cfg = getIntuneConfig()
    if (!cfg) {
      return { result: { configured: false, message: 'Intune is not configured.', data: [] }, citations: [] }
    }
    const creds = { tenantId: cfg.tenantId, clientId: cfg.clientId, clientSecret: cfg.clientSecret }
    const { items, categoryErrors } = await listAllItems(creds)
    let filtered = items
    if (typeof args.category === 'string' && args.category) filtered = filtered.filter(i => i.category === args.category)
    if (typeof args.search === 'string' && args.search) {
      const needle = args.search.toLowerCase()
      filtered = filtered.filter(i => i.displayName.toLowerCase().includes(needle))
    }
    const limit = Math.min(Math.max(Number(args.limit ?? 25) || 25, 1), 100)
    const page = filtered.slice(0, limit).map(i => ({
      compositeId: i.compositeId, type: i.type, category: i.category, displayName: i.displayName,
      lastModifiedDateTime: i.lastModifiedDateTime,
    }))
    const freshness = now()
    const citations: CopilotCitation[] = page.map(i => ({ source: 'Intune', recordId: i.compositeId, freshness }))
    return { result: { total: filtered.length, data: page, categoryErrors }, citations }
  },
}

// ─── 10. lookup_devices ───────────────────────────────────────────────────────

const lookupDevices: ToolDefinition = {
  name: 'lookup_devices',
  description: 'Search managed devices by name, assigned user, device id, or serial number across Intune and ManageEngine. Use this to resolve a deviceId before calling other tools that need one.',
  rbac: 'read',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search text — device name, user, device id, or serial number.' },
      limit: { type: 'number', description: 'Max results. Default 10, max 50.' },
    },
    required: ['query'],
  },
  run: async (args) => {
    const q = asString(args.query).toLowerCase()
    if (!q) throw new Error('query is required')
    const limit = Math.min(Math.max(Number(args.limit ?? 10) || 10, 1), 50)
    const { devices } = await fetchAllDevices()
    const matches = devices.filter(d =>
      d.deviceName?.toLowerCase().includes(q) ||
      d.user?.toLowerCase().includes(q) ||
      d.id?.toLowerCase().includes(q) ||
      d.serialNumber?.toLowerCase().includes(q)
    ).slice(0, limit)
    const freshness = now()
    const citations: CopilotCitation[] = matches.map(d => ({
      source: d.managementSource === 'ManageEngine' ? 'ManageEngine' : 'Intune', recordId: d.id, freshness,
    }))
    return {
      result: {
        count: matches.length,
        devices: matches.map(d => ({
          id: d.id, deviceName: d.deviceName, user: d.user, platform: d.platform,
          managementSource: d.managementSource, complianceState: d.complianceState,
          severity: d.severity, primaryIssue: d.primaryIssue, lastCheckIn: d.lastCheckIn,
        })),
      },
      citations,
    }
  },
}

// ─── 11. create_jira_ticket (write) ──────────────────────────────────────────

const VALID_ISSUE_TYPES = ['Incident', 'Task', 'Bug', 'Story']
const VALID_PRIORITIES = ['Critical', 'High', 'Medium', 'Low']

function toJiraInput(args: Record<string, unknown>): JiraIssueInput {
  const summary = asString(args.summary)
  const description = asString(args.description)
  const issueType = asString(args.issueType, 'Task')
  const priority = asString(args.priority, 'Medium')
  if (!summary) throw new Error('summary is required')
  if (!description) throw new Error('description is required')
  if (!VALID_ISSUE_TYPES.includes(issueType)) throw new Error(`issueType must be one of: ${VALID_ISSUE_TYPES.join(', ')}`)
  if (!VALID_PRIORITIES.includes(priority)) throw new Error(`priority must be one of: ${VALID_PRIORITIES.join(', ')}`)
  return {
    summary, description,
    issueType: issueType as JiraIssueInput['issueType'],
    priority: priority as JiraIssueInput['priority'],
    ...(typeof args.projectKey === 'string' && args.projectKey ? { projectKey: args.projectKey } : {}),
    ...(Array.isArray(args.labels) ? { labels: args.labels.map(String) } : {}),
  }
}

const createJiraTicket: ToolDefinition = {
  name: 'create_jira_ticket',
  description: 'Create a Jira ticket. WRITE ACTION — always returns a pending action for the user to confirm; never executes automatically.',
  rbac: 'write',
  parameters: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'Short issue summary/title.' },
      description: { type: 'string', description: 'Full issue description.' },
      issueType: { type: 'string', enum: VALID_ISSUE_TYPES, description: 'Jira issue type.' },
      priority: { type: 'string', enum: VALID_PRIORITIES, description: 'Jira priority.' },
      projectKey: { type: 'string', description: 'Optional Jira project key override.' },
      labels: { type: 'array', items: { type: 'string' }, description: 'Optional labels.' },
    },
    required: ['summary', 'description', 'issueType', 'priority'],
  },
  describeAction: (args) => `Create a ${asString(args.priority, 'Medium')} priority Jira ${asString(args.issueType, 'Task')}: "${asString(args.summary)}"`,
  run: async (args) => {
    if (!isJiraConfigured()) throw new Error('Jira is not configured — add JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in Settings → Integrations')
    const input = toJiraInput(args)
    const issue = await createJiraIssue(input)
    const freshness = now()
    return { result: issue, citations: [{ source: 'Jira', recordId: issue.key, freshness }] }
  },
}

// ─── 12. trigger_automation_rule (write) ─────────────────────────────────────

const triggerAutomationRule: ToolDefinition = {
  name: 'trigger_automation_rule',
  description: 'Manually run an existing automation rule in test mode (matches up to 5 live devices; Slack/Jira/Teams actions are simulated, runbook/script/report/notification actions run for real). WRITE ACTION — always returns a pending action for the user to confirm; never executes automatically.',
  rbac: 'write',
  parameters: {
    type: 'object',
    properties: {
      ruleId: { type: 'string', description: 'The automation rule id to run (from the Automations page).' },
    },
    required: ['ruleId'],
  },
  describeAction: (args) => {
    const rule = getRuleById(asString(args.ruleId))
    return rule
      ? `Run automation rule "${rule.name}" in test mode (up to 5 matching devices)`
      : `Run automation rule ${asString(args.ruleId)} in test mode (up to 5 matching devices)`
  },
  run: async (args) => {
    const ruleId = asString(args.ruleId)
    if (!ruleId) throw new Error('ruleId is required')
    const rule = getRuleById(ruleId)
    if (!rule) throw new Error(`Automation rule not found: ${ruleId}`)
    const devices = await fetchLiveDevices()
    const runResult = await runAutomationRule(rule, devices, { testMode: true, maxDevices: 5 })
    const freshness = now()
    return { result: runResult.execution, citations: [{ source: 'internal', recordId: runResult.execution.id, freshness }] }
  },
}

// ─── 13. send_team_alert (write) ─────────────────────────────────────────────
// Wraps the same real Microsoft Teams incoming-webhook integration used by
// automation rules' "teams_notify" action (services/teams.ts, gated on
// TEAMS_WEBHOOK_URL). This is a genuine external notification — distinct
// from server/src/data/notificationStore.ts, which only appends a row to the
// in-app bell and has no reach outside this app, so it does not qualify as a
// "send a notification" write action on its own.

const VALID_ALERT_SEVERITIES = ['Critical', 'High', 'Medium', 'Low', 'Info']

const sendTeamAlert: ToolDefinition = {
  name: 'send_team_alert',
  description: 'Send an alert message to the configured Microsoft Teams channel via incoming webhook. WRITE ACTION — always returns a pending action for the user to confirm; never executes automatically. Requires TEAMS_WEBHOOK_URL to be configured.',
  rbac: 'write',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Short alert title.' },
      message: { type: 'string', description: 'Alert body text.' },
      severity: { type: 'string', enum: VALID_ALERT_SEVERITIES, description: 'Alert severity, used to color the card. Default Medium.' },
      deviceName: { type: 'string', description: 'Optional device name to include as a fact.' },
      deviceUser: { type: 'string', description: 'Optional device user to include as a fact.' },
    },
    required: ['title', 'message'],
  },
  describeAction: (args) => `Send a Teams alert: "${asString(args.title)}" (${asString(args.severity, 'Medium')})`,
  run: async (args) => {
    if (!isTeamsConfigured()) throw new Error('Microsoft Teams is not configured — add TEAMS_WEBHOOK_URL in Settings → Integrations')
    const title = asString(args.title)
    const message = asString(args.message)
    if (!title) throw new Error('title is required')
    if (!message) throw new Error('message is required')
    const severity = asString(args.severity, 'Medium')
    const color = severity === 'Critical' ? 'FF0000' : severity === 'High' ? 'FF6600' : severity === 'Medium' ? 'FFC000' : severity === 'Low' ? '0078D4' : '64748B'
    const facts: Array<{ name: string; value: string }> = [{ name: 'Severity', value: severity }]
    if (typeof args.deviceName === 'string' && args.deviceName) facts.push({ name: 'Device', value: args.deviceName })
    if (typeof args.deviceUser === 'string' && args.deviceUser) facts.push({ name: 'User', value: args.deviceUser })
    facts.push({ name: 'Sent via', value: 'Endpoint Operations Copilot' })
    const outcome = await sendTeamsMessage({
      summary: title,
      themeColor: color,
      title: `⚡ ${title}`,
      text: message,
      sections: [{ title: 'Details', facts }],
    })
    if (!outcome.success) throw new Error(outcome.error ?? 'Teams webhook send failed')
    const freshness = now()
    return { result: { sent: true, title, severity }, citations: [{ source: 'internal', recordId: 'teams-alert', freshness }] }
  },
}

// ─── Registry ────────────────────────────────────────────────────────────────

export const COPILOT_TOOLS: ToolDefinition[] = [
  getRiskScores,
  getPolicyConflicts,
  getSecurityPolicyStatus,
  getRoleActivity,
  getEndpointProtectionCoverage,
  getSecurityPosture,
  listPostureDevices,
  getDeviceMissingPatches,
  getPostureDiagnosticsTool,
  getScheduledReports,
  getAuditLog,
  getUserIntelligenceTool,
  getIntuneScriptsConfig,
  lookupDevices,
  createJiraTicket,
  triggerAutomationRule,
  sendTeamAlert,
]

export function getToolByName(name: string): ToolDefinition | undefined {
  return COPILOT_TOOLS.find(t => t.name === name)
}

export const READ_TOOL_NAMES = COPILOT_TOOLS.filter(t => t.rbac === 'read').map(t => t.name)
export const WRITE_TOOL_NAMES = COPILOT_TOOLS.filter(t => t.rbac === 'write').map(t => t.name)

// In-process tool-exposure gate for the 3 built-in roles only — the real
// security perimeter (routes/copilot.ts) now uses requireCapability() /
// custom RBAC; this stays role-literal because toolsAllowedForRole() is
// called synchronously inside the Gemini tool-calling loop, and the custom-
// RBAC permission lookup is async (store-backed). A custom role therefore
// gets the same page/route access as today but not a bespoke tool-exposure
// split — a deliberately scoped-out gap, not an oversight.
export const READ_ROLES = ['Global Admin', 'IT Admin', 'Helpdesk']
export const WRITE_ROLES = ['Global Admin', 'IT Admin']

export function toolsAllowedForRole(role: string): ToolDefinition[] {
  const canRead = READ_ROLES.includes(role)
  const canWrite = WRITE_ROLES.includes(role)
  return COPILOT_TOOLS.filter(t => (t.rbac === 'read' && canRead) || (t.rbac === 'write' && canWrite))
}
