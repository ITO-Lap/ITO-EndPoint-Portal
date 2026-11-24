// Persistence for the Remote Action Center: scripts, versions, jobs, saved Graph templates, policy.
//
// Uses the project's existing file-store pattern (DATA_DIR + atomic write with .bak). Every state change is also
// appended to an append-only audit log (JSONL) and mirrored to the PostgreSQL `audit_logs` table when DATABASE_URL is
// configured. Browser storage is never used for any of this.
//
// Script bodies are encrypted at rest with AES-256-GCM when REMOTE_ACTIONS_ENCRYPTION_KEY (32 bytes, base64 or hex)
// is set. No managed key service exists in this project, so without the key bodies are stored in clear text and the
// status endpoint says so.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import { dirname } from 'node:path'
import { dataFile, readJsonFile, writeJsonAtomic } from '../store/dataDir.js'
import { recordAuditLog } from '../services/auditLog.js'
import { DEFAULT_POLICY, type ExecutionPolicy } from './jobLogic.js'
import { redactJson } from './redaction.js'
import type { RemoteJob, RemoteScript } from './types.js'

export interface GraphTemplate {
  id: string
  name: string
  description: string
  version: 'v1.0' | 'beta'
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  endpoint: string
  query: Record<string, string>
  body?: unknown
  createdBy: string
  createdAt: string
}

export interface GraphHistoryRecord {
  id: string
  name: string
  description: string
  justification: string
  version: 'v1.0' | 'beta'
  method: string
  endpoint: string
  query: Record<string, string>
  /** Sanitized: secrets and sensitive keys masked. */
  body?: unknown
  classification: 'read_only' | 'change' | 'destructive' | 'blocked'
  approvalStatus: 'not_required' | 'pending' | 'approved' | 'rejected'
  requestedBy: string
  approver?: string
  requestedAt: string
  executedAt?: string
  status: 'pending_approval' | 'rejected' | 'executed' | 'failed' | 'cancelled'
  httpStatus?: number
  durationMs?: number
  correlationId?: string
  tenantId?: string
  resultSummary?: string
  /** Sanitized output kept for review/download; capped so the store cannot grow without bound. */
  output?: unknown
  outputTruncated?: boolean
  downloads: Array<{ at: string; by: string; format: 'json' | 'csv' | 'txt' }>
  executedBy?: string
  /** Next-page link Graph returned (same-origin, validated before it is followed). */
  nextLink?: string
  pagesFetched?: number
  retryAfterSeconds?: number
  retryOf?: string
}

interface State {
  schemaVersion: 1
  scripts: RemoteScript[]
  jobs: RemoteJob[]
  graphTemplates: GraphTemplate[]
  graphHistory: GraphHistoryRecord[]
  policy: ExecutionPolicy
}

const emptyState = (): State => ({ schemaVersion: 1, scripts: [], jobs: [], graphTemplates: [], graphHistory: [], policy: { ...DEFAULT_POLICY } })

const STATE_FILE = (): string => dataFile('remote-actions.v1.json')
const AUDIT_FILE = (): string => dataFile('remote-actions-audit.v1.jsonl')

let state: State | null = null

export function load(): State {
  if (state) return state
  const raw = readJsonFile<Partial<State>>(STATE_FILE())
  const base = emptyState()
  state = {
    ...base, ...raw, schemaVersion: 1,
    scripts: (raw?.scripts ?? []).map(decryptScript),
    policy: { ...base.policy, ...(raw?.policy ?? {}) },
  }
  return state
}

/** Test hook: drops the in-memory copy so the next call re-reads from disk (or, with `wipe`, starts from an empty store). */
export function resetForTests(wipe = false): void { state = wipe ? emptyState() : null; if (wipe) persist() }

function persist(): void {
  const s = load()
  writeJsonAtomic(STATE_FILE(), { ...s, scripts: s.scripts.map(encryptScript) }, false)
}

// ── Encryption at rest ─────────────────────────────────────────────────────────

function key(): Buffer | null {
  const raw = process.env['REMOTE_ACTIONS_ENCRYPTION_KEY']?.trim()
  if (!raw) return null
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  if (buf.length !== 32) { console.error('[remoteActions] REMOTE_ACTIONS_ENCRYPTION_KEY must decode to 32 bytes; script bodies are NOT encrypted.'); return null }
  return buf
}

export const encryptionEnabled = (): boolean => key() !== null

const PREFIX = 'enc:v1:'

export function encryptText(text: string): string {
  const k = key()
  if (!k) return text
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', k, iv)
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()])
  return `${PREFIX}${Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64')}`
}

export function decryptText(text: string): string {
  if (!text.startsWith(PREFIX)) return text
  const k = key()
  if (!k) throw new Error('A stored script is encrypted but REMOTE_ACTIONS_ENCRYPTION_KEY is not set.')
  const buf = Buffer.from(text.slice(PREFIX.length), 'base64')
  const d = createDecipheriv('aes-256-gcm', k, buf.subarray(0, 12))
  d.setAuthTag(buf.subarray(12, 28))
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8')
}

const mapVersions = (s: RemoteScript, fn: (t: string) => string): RemoteScript => ({
  ...s,
  versions: s.versions.map(v => ({ ...v, content: fn(v.content), ...(v.rollbackContent ? { rollbackContent: fn(v.rollbackContent) } : {}) })),
})
const encryptScript = (s: RemoteScript): RemoteScript => mapVersions(s, encryptText)
const decryptScript = (s: RemoteScript): RemoteScript => mapVersions(s, decryptText)

// ── Audit ──────────────────────────────────────────────────────────────────────

export interface AuditEvent {
  at: string
  id: string
  actor: string
  action: string
  resourceType: 'script' | 'job' | 'graph_request' | 'graph_template' | 'policy' | 'provider'
  resourceId: string
  provider?: string
  detail?: unknown
}

/** Append-only. Never throws: an audit failure must not turn a completed action into an error, but it is logged loudly. */
export function audit(e: Omit<AuditEvent, 'at' | 'id'>): AuditEvent {
  const event: AuditEvent = { at: new Date().toISOString(), id: randomUUID(), ...e, ...(e.detail !== undefined ? { detail: redactJson(e.detail) } : {}) }
  try {
    const file = AUDIT_FILE()
    if (!existsSync(dirname(file))) mkdirSync(dirname(file), { recursive: true })
    appendFileSync(file, `${JSON.stringify(event)}\n`)
  } catch (err) { console.error('[remoteActions] audit append failed:', err instanceof Error ? err.message : err) }
  void recordAuditLog({ userEmail: e.actor, action: `remote_actions.${e.action}`, resourceType: e.resourceType, resourceId: e.resourceId, ...(event.detail !== undefined ? { newValue: event.detail } : {}) })
  return event
}

export function readAudit(filter: { resourceType?: string; resourceId?: string; limit?: number } = {}): AuditEvent[] {
  try {
    const lines = readFileSync(AUDIT_FILE(), 'utf8').split('\n').filter(Boolean)
    const events: AuditEvent[] = []
    for (let i = lines.length - 1; i >= 0 && events.length < (filter.limit ?? 200); i--) {
      try {
        const e = JSON.parse(lines[i]!) as AuditEvent
        if (filter.resourceType && e.resourceType !== filter.resourceType) continue
        if (filter.resourceId && e.resourceId !== filter.resourceId) continue
        events.push(e)
      } catch { /* skip a torn line */ }
    }
    return events
  } catch { return [] }
}

// ── Scripts ────────────────────────────────────────────────────────────────────

export const listScripts = (): RemoteScript[] => load().scripts
export const getScript = (id: string): RemoteScript | undefined => load().scripts.find(s => s.id === id)
export function saveScript(script: RemoteScript): RemoteScript {
  const s = load()
  const i = s.scripts.findIndex(x => x.id === script.id)
  if (i >= 0) s.scripts[i] = script; else s.scripts.push(script)
  persist()
  return script
}

// ── Jobs ───────────────────────────────────────────────────────────────────────

export const listJobs = (): RemoteJob[] => load().jobs
export const getJob = (id: string): RemoteJob | undefined => load().jobs.find(j => j.id === id)
export function saveJob(job: RemoteJob): RemoteJob {
  const s = load()
  const i = s.jobs.findIndex(x => x.id === job.id)
  if (i >= 0) s.jobs[i] = job; else s.jobs.push(job)
  persist()
  return job
}

// ── Policy ─────────────────────────────────────────────────────────────────────

export const getPolicy = (): ExecutionPolicy => load().policy
export function savePolicy(p: ExecutionPolicy): ExecutionPolicy { load().policy = p; persist(); return p }

// ── Graph templates + history ──────────────────────────────────────────────────

const HISTORY_CAP = 2000
export const listGraphTemplates = (): GraphTemplate[] => load().graphTemplates
export function saveGraphTemplate(t: GraphTemplate): GraphTemplate {
  const s = load()
  const i = s.graphTemplates.findIndex(x => x.id === t.id)
  if (i >= 0) s.graphTemplates[i] = t; else s.graphTemplates.push(t)
  persist()
  return t
}
export function deleteGraphTemplate(id: string): boolean {
  const s = load(); const n = s.graphTemplates.length
  s.graphTemplates = s.graphTemplates.filter(t => t.id !== id)
  if (s.graphTemplates.length !== n) { persist(); return true }
  return false
}
export const listGraphHistory = (): GraphHistoryRecord[] => load().graphHistory
export const getGraphHistory = (id: string): GraphHistoryRecord | undefined => load().graphHistory.find(h => h.id === id)
export function saveGraphHistory(r: GraphHistoryRecord): GraphHistoryRecord {
  const s = load()
  const i = s.graphHistory.findIndex(x => x.id === r.id)
  if (i >= 0) s.graphHistory[i] = r; else s.graphHistory.push(r)
  if (s.graphHistory.length > HISTORY_CAP) s.graphHistory = s.graphHistory.slice(-HISTORY_CAP)
  persist()
  return r
}
