// File implementation of SyncBackend: the default, and the whole story when no PostgreSQL is configured.
//
//   DATA_DIR/sync-state.json                   schedules + status per source, recent jobs and log lines
//   DATA_DIR/cache/sync-devices-<source>.json  one record per device with its hash and sync bookkeeping
//
// Same rules as the PostgreSQL backend (see store/fileDeviceStore.ts). Single server process only: the
// "one running job" lock is in memory, and any job left 'running' by an earlier process is closed at start.
// Tests (NODE_ENV=test) keep everything in memory unless a directory is given.

import { dataFile, readJsonFile, writeJsonAtomic } from '../../store/dataDir.js'
import { applyUpsert, staleTransitions, type DeviceRecord, type StaleEvent } from '../../store/fileDeviceStore.js'
import { STALE_DAYS } from '../staleDevices/types.js'
import type { SyncBackend, SourceRow, LogRow, SyncTrigger, FindingRow, FindingsUpdate } from './backend.js'
import type { DeviceSource } from '../../store/deviceSnapshotStore.js'

interface SourceState { source: string; module: string; displayName: string; enabled: boolean; intervalMinutes: number; lastAttemptAt: string | null; lastSuccessAt: string | null; status: SourceRow['status']; lastError: string | null; recordCount: number | null; updatedBy: string | null }
interface JobState { id: number; source: string; module: string; status: 'running' | 'succeeded' | 'partial' | 'failed'; trigger: SyncTrigger; triggeredBy: string | null; startedAt: string; heartbeatAt: string; finishedAt: string | null; counts: Record<string, number> | null; error: string | null }
interface State { version: 1; nextJobId: number; nextLogId: number; sources: SourceState[]; jobs: JobState[]; logs: LogRow[] }
interface FindingsFile { findings: Record<string, FindingRow & { lastJobId: number }> }
interface DeviceFile { records: Record<string, DeviceRecord>; staleLatest: Record<string, boolean>; staleEvents: StaleEvent[] }

const MAX_JOBS = 100
const MAX_LOGS = 300
const MAX_STALE_EVENTS = 2000

const defaults = (): SourceState[] => [
  { source: 'intune', module: 'devices', displayName: 'Microsoft Intune', enabled: true, intervalMinutes: 45, lastAttemptAt: null, lastSuccessAt: null, status: 'never', lastError: null, recordCount: null, updatedBy: null },
  { source: 'manageengine', module: 'devices', displayName: 'ManageEngine Endpoint Central', enabled: true, intervalMinutes: 45, lastAttemptAt: null, lastSuccessAt: null, status: 'never', lastError: null, recordCount: null, updatedBy: null },
  { source: 'manageengine', module: 'applications', displayName: 'Application inventory (Endpoint Central)', enabled: true, intervalMinutes: 480, lastAttemptAt: null, lastSuccessAt: null, status: 'never', lastError: null, recordCount: null, updatedBy: null },
  { source: 'portal', module: 'findings', displayName: 'Security findings history', enabled: true, intervalMinutes: 60, lastAttemptAt: null, lastSuccessAt: null, status: 'never', lastError: null, recordCount: null, updatedBy: null },
  { source: 'manageengine', module: 'patches', displayName: 'Patch data (Endpoint Central)', enabled: true, intervalMinutes: 1440, lastAttemptAt: null, lastSuccessAt: null, status: 'never', lastError: null, recordCount: null, updatedBy: null },
]

export interface FileBackendOptions { /** Save to disk. Default: yes, except under tests. */ persist?: boolean }

export function createFileBackend(opts: FileBackendOptions = {}): SyncBackend & { __reset(): void } {
  const persist = opts.persist ?? !(process.env['NODE_ENV'] === 'test' || process.env['VITEST'])
  const stateFile = (): string => dataFile('sync-state.json')
  const devicesFile = (source: string): string => dataFile(`cache/sync-devices-${source}.json`)

  const load = (): State => {
    const saved = persist ? readJsonFile<State>(stateFile()) : undefined
    const base: State = saved?.version === 1 ? saved : { version: 1, nextJobId: 1, nextLogId: 1, sources: defaults(), jobs: [], logs: [] }
    for (const d of defaults()) if (!base.sources.some(s => s.source === d.source && s.module === d.module)) base.sources.push(d)
    // A job still 'running' belongs to a process that no longer exists.
    for (const j of base.jobs) if (j.status === 'running') { j.status = 'failed'; j.finishedAt = new Date().toISOString(); j.error = 'Abandoned: the server stopped before this job finished.' }
    return base
  }

  let state = load()
  const devices = new Map<string, DeviceFile>()

  const save = (): void => { if (persist) { try { writeJsonAtomic(stateFile(), state, false) } catch (e) { console.warn('[sync] could not save sync state:', e instanceof Error ? e.message : e) } } }
  const deviceFile = (source: string): DeviceFile => {
    let f = devices.get(source)
    if (!f) {
      const saved = persist ? readJsonFile<DeviceFile>(devicesFile(source)) : undefined
      f = { records: saved?.records ?? {}, staleLatest: saved?.staleLatest ?? {}, staleEvents: saved?.staleEvents ?? [] }
      devices.set(source, f)
    }
    return f
  }
  const saveDevices = (source: string): void => { if (persist) { try { writeJsonAtomic(devicesFile(source), deviceFile(source), false) } catch (e) { console.warn(`[sync] could not save ${source} devices:`, e instanceof Error ? e.message : e) } } }
  const findingsFile = (): string => dataFile('cache/sync-findings.json')
  let findings: FindingsFile | null = null
  const loadFindings = (): FindingsFile => {
    if (!findings) findings = { findings: (persist ? readJsonFile<FindingsFile>(findingsFile())?.findings : undefined) ?? {} }
    return findings
  }
  const saveFindings = (): void => { if (persist && findings) { try { writeJsonAtomic(findingsFile(), findings, false) } catch (e) { console.warn('[sync] could not save findings:', e instanceof Error ? e.message : e) } } }
  const sourceState = (source: string, module: string): SourceState | undefined => state.sources.find(s => s.source === source && s.module === module)
  const job = (id: number): JobState | undefined => state.jobs.find(j => j.id === id)

  return {
    kind: 'file',

    __reset() { state = { version: 1, nextJobId: 1, nextLogId: 1, sources: defaults(), jobs: [], logs: [] }; devices.clear(); findings = { findings: {} } },

    async acquire(source, module, trigger, actor, staleMinutes) {
      const now = Date.now()
      for (const j of state.jobs) {
        if (j.status === 'running' && j.source === source && j.module === module && now - Date.parse(j.heartbeatAt) > staleMinutes * 60_000) {
          j.status = 'failed'; j.finishedAt = new Date(now).toISOString(); j.error = 'Abandoned: the server stopped before this job finished.'
        }
      }
      if (state.jobs.some(j => j.status === 'running' && j.source === source && j.module === module)) return null
      const t = new Date(now).toISOString()
      const id = state.nextJobId++
      state.jobs.unshift({ id, source, module, status: 'running', trigger, triggeredBy: actor, startedAt: t, heartbeatAt: t, finishedAt: null, counts: null, error: null })
      state.jobs.length = Math.min(state.jobs.length, MAX_JOBS)
      save()
      return id
    },

    async heartbeat(jobId) { const j = job(jobId); if (j) j.heartbeatAt = new Date().toISOString() },

    async finish({ jobId, source, module, outcome, counts, error, recordCount, imported }) {
      const j = job(jobId)
      if (j) { j.status = outcome; j.finishedAt = new Date().toISOString(); j.counts = counts ? { ...counts } : null; j.error = error }
      const s = sourceState(source, module)
      if (s) {
        if (imported) { if (recordCount !== null) s.recordCount = recordCount }
        else {
          s.lastAttemptAt = new Date().toISOString(); s.status = outcome; s.lastError = error
          if (outcome === 'succeeded') s.lastSuccessAt = s.lastAttemptAt // only a full success moves it
          if (recordCount !== null) s.recordCount = recordCount
        }
      }
      save()
    },

    async log(jobId, source, module, level, message, detail) {
      state.logs.unshift({ id: state.nextLogId++, jobId, source, module, level, message: message.slice(0, 1000), createdAt: new Date().toISOString() })
      state.logs.length = Math.min(state.logs.length, MAX_LOGS)
      void detail // counts are on the job record; log lines stay text-only in files
      save()
    },

    async countActive(source) { return Object.values(deviceFile(source).records).filter(r => r.active).length },

    async loadActive(source) {
      const sources: DeviceSource[] = source ? [source] : ['intune', 'manageengine']
      return sources.flatMap(s => Object.values(deviceFile(s).records).filter(r => r.active).map(r => r.device))
    },

    async upsert(source, jobId, incoming, complete) {
      const f = deviceFile(source)
      const records = new Map(Object.entries(f.records))
      const result = applyUpsert(records, incoming, jobId, complete)
      f.records = Object.fromEntries(records)
      const latest = new Map(Object.entries(f.staleLatest))
      const events = staleTransitions(records, latest, jobId, STALE_DAYS)
      f.staleLatest = Object.fromEntries(latest)
      f.staleEvents = [...f.staleEvents, ...events].slice(-MAX_STALE_EVENTS)
      saveDevices(source)
      return result
    },

    async recordFindings(jobId, current, assessedPillars) {
      const file = loadFindings().findings
      const now = new Date().toISOString()
      const out: FindingsUpdate = { opened: 0, reopened: 0, updated: 0, unchanged: 0, resolved: 0 }
      const seen = new Set<string>()
      for (const f of current) {
        const key = `${f.pillar}:${f.deviceId}`
        seen.add(key)
        const prev = file[key]
        if (!prev) { file[key] = { ...f, status: 'open', firstSeenAt: now, lastSeenAt: now, resolvedAt: null, reopenedCount: 0, lastJobId: jobId }; out.opened++; continue }
        const changed = prev.detail !== f.detail || prev.deviceName !== f.deviceName
        if (prev.status === 'resolved') { prev.reopenedCount++; prev.resolvedAt = null; out.reopened++ } else if (changed) out.updated++; else out.unchanged++
        Object.assign(prev, { ...f, status: 'open', lastSeenAt: now, lastJobId: jobId })
      }
      for (const [key, rec] of Object.entries(file)) {
        if (rec.status === 'open' && !seen.has(key) && assessedPillars.includes(rec.pillar)) { rec.status = 'resolved'; rec.resolvedAt = now; out.resolved++ }
      }
      saveFindings()
      return out
    },

    async listFindings({ status, pillar, limit = 200 }) {
      return Object.values(loadFindings().findings)
        .filter(f => (!status || f.status === status) && (!pillar || f.pillar === pillar))
        .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))
        .slice(0, limit)
        .map(({ lastJobId: _job, ...row }) => row as FindingRow) // eslint-disable-line @typescript-eslint/no-unused-vars
    },

    async countFindings(status, pillar) {
      return Object.values(loadFindings().findings).filter(f => f.status === status && (!pillar || f.pillar === pillar)).length
    },

    async getRecord(source, externalId) {
      const r = deviceFile(source).records[externalId]
      return r ? { active: r.active, retiredAt: r.retiredAt, updatedAt: r.updatedAt, device: r.device } : null
    },

    async statusRows() {
      return state.sources.map(s => ({
        source: s.source, module: s.module, displayName: s.displayName, enabled: s.enabled, intervalMinutes: s.intervalMinutes,
        lastAttemptAt: s.lastAttemptAt, lastSuccessAt: s.lastSuccessAt, status: s.status, lastError: s.lastError, recordCount: s.recordCount,
        running: state.jobs.some(j => j.status === 'running' && j.source === s.source && j.module === s.module),
      }))
    },

    async updateSchedule(source, module, patch, actor) {
      const s = sourceState(source, module)
      if (!s) return
      if (patch.enabled !== undefined) s.enabled = patch.enabled
      if (patch.intervalMinutes !== undefined) s.intervalMinutes = patch.intervalMinutes
      s.updatedBy = actor
      save()
    },

    async recentLogs(source, module, limit) {
      return state.logs.filter(l => (!source || l.source === source) && (!module || l.module === module)).slice(0, limit)
    },
  }
}

export const fileBackend = createFileBackend()
