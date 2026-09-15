// Durable, resumable export engine for Intune audit events.
//
// Checkpoint granularity is per-chunk (matching the module's default 7-day
// chunking), not per-page: a chunk is only ever marked 'completed' after
// every one of its @odata.nextLink pages has been fetched and written to
// this job's scratch files. If the process crashes mid-chunk, resuming
// re-fetches that ONE chunk from its own start rather than trusting a
// partially-written local scratch file to have survived — cheap (one chunk
// is at most a few thousand events) and correctness-first. Already-completed
// chunks are never re-fetched.
//
// Memory model: events are streamed chunk-by-chunk into per-chunk JSONL
// scratch files on local disk (never held in application memory as an
// array). Final artifact assembly re-streams those files in order rather
// than loading them all at once; the only whole-job, in-memory structure is
// a Set<string> of event IDs used for de-duplication, which is bounded by
// unique-event-count (36-byte strings), not by event payload size.

import { randomUUID, createHash } from 'crypto'
import { mkdir, writeFile, appendFile, readFile, rm } from 'fs/promises'
import { createReadStream } from 'fs'
import { join } from 'path'
import { createInterface } from 'readline'
import { PassThrough } from 'stream'
import { query, isDbAvailable } from '../db/index.js'
import {
  splitIntoUtcChunks, fetchAuditEventsForChunk, TransientGraphError, FatalGraphError,
  type GraphAuditEvent, type ChunkRange,
} from './intuneAuditGraph.js'
import { csvHeaderLine, csvRowLine } from './intuneAuditCsv.js'
import { uploadExportArtifact, buildExportBlobPath, type StoredArtifact } from './auditExportStorage.js'

export const SCHEMA_VERSION = '1'

export type ExportFormat = 'json' | 'csv' | 'zip'

export interface AuditEventFilters {
  category?: string | undefined
  activity?: string | undefined
  activityType?: string | undefined
  activityOperationType?: string | undefined
  activityResult?: string | undefined
  actorUserPrincipalName?: string | undefined
  actorApplicationName?: string | undefined
  ipAddress?: string | undefined
  resourceDisplayName?: string | undefined
  resourceType?: string | undefined
  resourceId?: string | undefined
  correlationId?: string | undefined
  search?: string | undefined
}

export interface CreateExportJobInput {
  tenantId: string
  rangeStartUtc: Date
  rangeEndUtc: Date
  timezone: string
  filters: AuditEventFilters
  formats: ExportFormat[]
  createdBy: string
  scheduleId?: string | undefined
  correlationId?: string | undefined
}

export interface ExportJobRow {
  id: string
  tenant_id: string
  status: string
  range_start_utc: string
  range_end_utc: string
  timezone: string
  filters: AuditEventFilters
  formats: ExportFormat[]
  chunk_size_days: number
  total_chunks: number
  completed_chunks: number
  total_pages: number
  event_count: number
  duplicate_count: number
  retry_count: number
  error_summary: string | null
  correlation_id: string
  created_by: string
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export class ExportConfigError extends Error {}
export class ExportNotFoundError extends Error {}
export class ExportCancelledError extends Error {}

function maxRangeDays(): number {
  return Number(process.env.INTUNE_AUDIT_MAX_RANGE_DAYS ?? 366)
}

function chunkDays(): number {
  return Number(process.env.INTUNE_AUDIT_CHUNK_DAYS ?? 7)
}

function maxConcurrentChunks(): number {
  return Math.max(1, Number(process.env.INTUNE_AUDIT_MAX_CONCURRENT_CHUNKS ?? 1))
}

function scratchDir(jobId: string): string {
  const base = process.env.INTUNE_AUDIT_SCRATCH_DIR ?? join(process.cwd(), '.intune-audit-scratch')
  return join(base, jobId)
}

function requireDb(): void {
  if (!isDbAvailable()) {
    throw new ExportConfigError('DATABASE_URL is not configured — durable audit exports require PostgreSQL.')
  }
}

/** Validates and creates a new export job + its chunk checkpoint rows. Does
 *  NOT start processing — callers (the route handler) kick off
 *  runExportJob() asynchronously after this returns so the HTTP request
 *  isn't held open for a potentially year-long export. */
export async function createExportJob(input: CreateExportJobInput): Promise<ExportJobRow> {
  requireDb()

  if (input.rangeEndUtc <= input.rangeStartUtc) {
    throw new ExportConfigError('End of range must be after the start of range.')
  }
  if (input.rangeEndUtc.getTime() > Date.now() + 60_000) {
    throw new ExportConfigError('End of range cannot be in the future.')
  }
  const rangeDays = (input.rangeEndUtc.getTime() - input.rangeStartUtc.getTime()) / (24 * 60 * 60 * 1000)
  const limit = maxRangeDays()
  if (rangeDays > limit) {
    throw new ExportConfigError(`Requested range spans ${rangeDays.toFixed(1)} days, exceeding the server-configured maximum of ${limit} days.`)
  }
  if (input.formats.length === 0) {
    throw new ExportConfigError('At least one export format (json, csv, zip) is required.')
  }

  const chunks = splitIntoUtcChunks(input.rangeStartUtc, input.rangeEndUtc, chunkDays())
  const correlationId = input.correlationId ?? randomUUID()

  const jobResult = await query<ExportJobRow>(
    `INSERT INTO intune_audit_export_jobs
       (tenant_id, status, range_start_utc, range_end_utc, timezone, filters, formats,
        chunk_size_days, total_chunks, correlation_id, created_by, schedule_id)
     VALUES ($1,'queued',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      input.tenantId, input.rangeStartUtc.toISOString(), input.rangeEndUtc.toISOString(), input.timezone,
      JSON.stringify(input.filters ?? {}), JSON.stringify(input.formats), chunkDays(), chunks.length,
      correlationId, input.createdBy, input.scheduleId ?? null,
    ]
  )
  const job = jobResult.rows[0]
  if (!job) throw new ExportConfigError('Failed to create export job row.')

  for (const chunk of chunks) {
    await query(
      `INSERT INTO intune_audit_export_chunks (job_id, chunk_index, chunk_start_utc, chunk_end_utc)
       VALUES ($1,$2,$3,$4)`,
      [job.id, chunk.index, chunk.startUtc.toISOString(), chunk.endUtc.toISOString()]
    )
  }

  return job
}

export async function getExportJob(jobId: string, tenantId: string): Promise<ExportJobRow | null> {
  requireDb()
  const result = await query<ExportJobRow>(
    'SELECT * FROM intune_audit_export_jobs WHERE id=$1 AND tenant_id=$2',
    [jobId, tenantId]
  )
  return result.rows[0] ?? null
}

export async function listExportJobs(tenantId: string, limit: number, offset: number) {
  requireDb()
  const result = await query<ExportJobRow>(
    `SELECT * FROM intune_audit_export_jobs WHERE tenant_id=$1
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [tenantId, limit, offset]
  )
  const count = await query<{ count: string }>('SELECT COUNT(*) FROM intune_audit_export_jobs WHERE tenant_id=$1', [tenantId])
  return { rows: result.rows, total: Number(count.rows[0]?.count ?? 0) }
}

export async function requestCancelExportJob(jobId: string, tenantId: string): Promise<void> {
  requireDb()
  const result = await query(
    `UPDATE intune_audit_export_jobs SET status='cancelled', updated_at=NOW()
     WHERE id=$1 AND tenant_id=$2 AND status IN ('queued','running') RETURNING id`,
    [jobId, tenantId]
  )
  if (result.rows.length === 0) {
    throw new ExportNotFoundError('Export job not found, or not in a cancellable state.')
  }
}

async function isCancelled(jobId: string): Promise<boolean> {
  const result = await query<{ status: string }>('SELECT status FROM intune_audit_export_jobs WHERE id=$1', [jobId])
  return result.rows[0]?.status === 'cancelled'
}

function matchesFilters(event: GraphAuditEvent, filters: AuditEventFilters): boolean {
  if (filters.category && event.category !== filters.category) return false
  if (filters.activity && event.activity !== filters.activity) return false
  if (filters.activityType && event.activityType !== filters.activityType) return false
  if (filters.activityOperationType && event.activityOperationType !== filters.activityOperationType) return false
  if (filters.activityResult && event.activityResult !== filters.activityResult) return false
  if (filters.actorUserPrincipalName && event.actor?.userPrincipalName?.toLowerCase() !== filters.actorUserPrincipalName.toLowerCase()) return false
  if (filters.actorApplicationName && event.actor?.applicationDisplayName?.toLowerCase() !== filters.actorApplicationName.toLowerCase()) return false
  if (filters.ipAddress && event.actor?.ipAddress !== filters.ipAddress) return false
  if (filters.correlationId && event.correlationId !== filters.correlationId) return false
  if (filters.resourceType && !(event.resources ?? []).some(r => r.type === filters.resourceType)) return false
  if (filters.resourceId && !(event.resources ?? []).some(r => r.resourceId === filters.resourceId)) return false
  if (filters.resourceDisplayName && !(event.resources ?? []).some(r => r.displayName === filters.resourceDisplayName)) return false
  if (filters.search) {
    const needle = filters.search.toLowerCase()
    const haystack = [
      event.displayName, event.activity, event.componentName, event.actor?.userPrincipalName,
      ...(event.resources ?? []).map(r => r.displayName),
    ].filter(Boolean).join(' ').toLowerCase()
    if (!haystack.includes(needle)) return false
  }
  return true
}

async function fetchOneChunk(
  jobId: string, chunk: ChunkRange, scratchFile: string, filters: AuditEventFilters
): Promise<{ pagesFetched: number; eventsMatched: number }> {
  await mkdir(join(scratchFile, '..'), { recursive: true })
  await writeFile(scratchFile, '') // truncate — resume of this chunk always restarts from scratch

  let eventsMatched = 0
  const { pagesFetched } = await fetchAuditEventsForChunk(chunk, async page => {
    const lines = page.events
      .filter(e => matchesFilters(e, filters))
      .map(e => JSON.stringify(e))
    if (lines.length > 0) {
      await appendFile(scratchFile, lines.join('\n') + '\n')
      eventsMatched += lines.length
    }
  })

  await query(
    `UPDATE intune_audit_export_chunks SET pages_fetched=$2, events_fetched=$3 WHERE job_id=$1 AND chunk_index=$4`,
    [jobId, pagesFetched, eventsMatched, chunk.index]
  )

  return { pagesFetched, eventsMatched }
}

interface ChunkRow {
  chunk_index: number
  chunk_start_utc: string
  chunk_end_utc: string
  status: string
  retry_count: number
}

// Runs bounded-concurrency workers over `pending` chunks. Deliberately does
// NOT use Promise.all's race-to-reject-on-first-failure behavior: if it did,
// one worker's chunk failure would return control to the caller (which marks
// the job 'failed' and cleans up workDir) while sibling workers are still
// mid-flight, writing to the very scratch files that cleanup is about to
// touch. Instead every worker runs to completion (recording failures rather
// than throwing them), and only after every worker has fully settled do we
// surface the first failure — cancellation is the one exception, since
// stopping every worker from claiming further chunks as soon as possible is
// the whole point of cancellation.
async function processChunksBounded(
  jobId: string, pending: ChunkRow[], filters: AuditEventFilters
): Promise<void> {
  const concurrency = maxConcurrentChunks()
  let cursor = 0
  let firstFailure: Error | null = null

  async function worker(): Promise<void> {
    while (cursor < pending.length) {
      const row = pending[cursor]
      cursor += 1
      if (!row) continue
      if (await isCancelled(jobId)) throw new ExportCancelledError('Export was cancelled')

      const chunk: ChunkRange = {
        index: row.chunk_index,
        startUtc: new Date(row.chunk_start_utc),
        endUtc: new Date(row.chunk_end_utc),
      }
      await query(
        `UPDATE intune_audit_export_chunks SET status='running', started_at=NOW() WHERE job_id=$1 AND chunk_index=$2`,
        [jobId, chunk.index]
      )

      try {
        const scratchFile = join(scratchDir(jobId), `chunk-${String(chunk.index).padStart(6, '0')}.jsonl`)
        const { pagesFetched } = await fetchOneChunk(jobId, chunk, scratchFile, filters)
        await query(
          `UPDATE intune_audit_export_chunks SET status='completed', completed_at=NOW() WHERE job_id=$1 AND chunk_index=$2`,
          [jobId, chunk.index]
        )
        await query(
          `UPDATE intune_audit_export_jobs
             SET completed_chunks = completed_chunks + 1,
                 total_pages      = total_pages + $2,
                 updated_at       = NOW()
           WHERE id=$1`,
          [jobId, pagesFetched]
        )
      } catch (err) {
        if (err instanceof ExportCancelledError) throw err
        const message = err instanceof Error ? err.message : String(err)
        await query(
          `UPDATE intune_audit_export_chunks
             SET status='failed', retry_count = retry_count + 1, last_error=$3
           WHERE job_id=$1 AND chunk_index=$2`,
          [jobId, chunk.index, message.slice(0, 1000)]
        )
        await query(
          `UPDATE intune_audit_export_jobs SET retry_count = retry_count + 1, updated_at=NOW() WHERE id=$1`,
          [jobId]
        )
        if (!firstFailure) firstFailure = err instanceof Error ? err : new Error(message)
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, pending.length) }, () => worker())
  const results = await Promise.allSettled(workers)

  const cancelled = results.find(r => r.status === 'rejected' && r.reason instanceof ExportCancelledError)
  if (cancelled && cancelled.status === 'rejected') throw cancelled.reason as ExportCancelledError

  const otherRejection = results.find(r => r.status === 'rejected')
  if (otherRejection && otherRejection.status === 'rejected') throw otherRejection.reason as Error

  if (firstFailure) throw firstFailure
}

interface AssembledResult {
  eventCount: number
  duplicateCount: number
  artifacts: Array<StoredArtifact & { format: ExportFormat }>
}

/** Streams every completed chunk's scratch file in order, deduplicating by
 *  event ID, and writes JSON/CSV output files plus (optionally) a ZIP
 *  bundling them with the manifest. Never holds the full event list in
 *  memory — only the Set of seen IDs. */
async function assembleArtifacts(
  job: ExportJobRow, totalChunks: number, workDir: string
): Promise<AssembledResult> {
  const seenIds = new Set<string>()
  let duplicateCount = 0
  let eventCount = 0

  const wantJson = job.formats.includes('json') || job.formats.includes('zip')
  const wantCsv = job.formats.includes('csv') || job.formats.includes('zip')

  const jsonPath = join(workDir, 'audit-events.json')
  const csvPath = join(workDir, 'audit-events.csv')

  if (wantJson) await writeFile(jsonPath, '[')
  if (wantCsv) await writeFile(csvPath, csvHeaderLine())

  let isFirstJsonEntry = true

  for (let i = 0; i < totalChunks; i++) {
    const scratchFile = join(scratchDir(job.id), `chunk-${String(i).padStart(6, '0')}.jsonl`)
    let lineReader
    try {
      lineReader = createInterface({ input: createReadStream(scratchFile) })
    } catch {
      continue // chunk produced zero matching events — no scratch file written
    }

    for await (const line of lineReader) {
      if (!line.trim()) continue
      const event = JSON.parse(line) as GraphAuditEvent
      if (seenIds.has(event.id)) {
        duplicateCount += 1
        continue
      }
      seenIds.add(event.id)
      eventCount += 1

      if (wantJson) {
        await appendFile(jsonPath, (isFirstJsonEntry ? '' : ',') + JSON.stringify(event))
        isFirstJsonEntry = false
      }
      if (wantCsv) {
        await appendFile(csvPath, csvRowLine(event))
      }
    }
  }

  if (wantJson) await appendFile(jsonPath, ']')

  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    exportRequestId: job.id,
    tenantId: job.tenant_id,
    requestedBy: job.created_by,
    createdAtUtc: job.created_at,
    timezone: job.timezone,
    requestedRange: { startUtc: job.range_start_utc, endUtc: job.range_end_utc },
    appliedFilters: job.filters,
    eventCount,
    chunkCount: totalChunks,
    pageCount: job.total_pages,
    duplicateCount,
    formats: job.formats,
    completionStatus: 'completed',
    correlationId: job.correlation_id,
    retryCount: job.retry_count,
  }
  const manifestPath = join(workDir, 'manifest.json')
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2))

  const artifacts: Array<StoredArtifact & { format: ExportFormat }> = []
  const createdAt = new Date(job.created_at)

  if (job.formats.includes('json')) {
    const buf = await readFile(jsonPath)
    const stored = await uploadExportArtifact(
      buildExportBlobPath(job.tenant_id, createdAt, job.id, 'audit-events.json'),
      buf, 'application/json', { jobId: job.id, format: 'json' }
    )
    artifacts.push({ ...stored, format: 'json' })
  }
  if (job.formats.includes('csv')) {
    const buf = await readFile(csvPath)
    const stored = await uploadExportArtifact(
      buildExportBlobPath(job.tenant_id, createdAt, job.id, 'audit-events.csv'),
      buf, 'text/csv', { jobId: job.id, format: 'csv' }
    )
    artifacts.push({ ...stored, format: 'csv' })
  }
  if (job.formats.includes('zip')) {
    const zipBuf = await buildZipBuffer([
      { name: 'audit-events.json', path: jsonPath, exists: wantJson },
      { name: 'audit-events.csv', path: csvPath, exists: wantCsv },
      { name: 'manifest.json', path: manifestPath, exists: true },
    ])
    const stored = await uploadExportArtifact(
      buildExportBlobPath(job.tenant_id, createdAt, job.id, 'audit-export.zip'),
      zipBuf, 'application/zip', { jobId: job.id, format: 'zip' }
    )
    artifacts.push({ ...stored, format: 'zip' })
  }

  // Manifest + checksum are always stored alongside the artifacts so a
  // downloader can verify integrity even for single-format (non-zip) exports.
  const manifestBuf = await readFile(manifestPath)
  await uploadExportArtifact(
    buildExportBlobPath(job.tenant_id, createdAt, job.id, 'manifest.json'),
    manifestBuf, 'application/json', { jobId: job.id, format: 'manifest' }
  )
  const checksumLines = artifacts.map(a => `${a.sha256}  ${a.blobPath.split('/').pop()}`).join('\n') + '\n'
  await uploadExportArtifact(
    buildExportBlobPath(job.tenant_id, createdAt, job.id, 'checksums.sha256'),
    Buffer.from(checksumLines, 'utf-8'), 'text/plain', { jobId: job.id, format: 'checksums' }
  )

  return { eventCount, duplicateCount, artifacts }
}

async function buildZipBuffer(files: Array<{ name: string; path: string; exists: boolean }>): Promise<Buffer> {
  const { ZipArchive } = await import('archiver')
  return new Promise((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level: 9 } })
    const stream = new PassThrough()
    const chunks: Buffer[] = []
    stream.on('data', c => chunks.push(c))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    archive.on('error', reject)
    archive.pipe(stream)
    for (const file of files) {
      if (file.exists) archive.file(file.path, { name: file.name })
    }
    void archive.finalize()
  })
}

/** Processes every pending/failed chunk of a job, then assembles and uploads
 *  the requested artifacts. Safe to call repeatedly on the same jobId — a
 *  prior call's completed chunks are skipped, satisfying "resume from
 *  checkpoint" whether the previous call crashed, was killed, or partially
 *  failed. Only marks the job 'completed' once every chunk AND every
 *  requested artifact has been durably stored — a partial result is always
 *  surfaced as 'failed', never silently reported as success. */
export async function runExportJob(jobId: string): Promise<void> {
  requireDb()
  const jobResult = await query<ExportJobRow>('SELECT * FROM intune_audit_export_jobs WHERE id=$1', [jobId])
  const job = jobResult.rows[0]
  if (!job) throw new ExportNotFoundError(`Export job ${jobId} not found`)
  if (job.status === 'completed') return
  if (job.status === 'cancelled') return

  await query(`UPDATE intune_audit_export_jobs SET status='running', started_at=COALESCE(started_at, NOW()), updated_at=NOW() WHERE id=$1`, [jobId])

  const workDir = join(scratchDir(jobId), 'work')
  await mkdir(workDir, { recursive: true })

  try {
    const pendingResult = await query<ChunkRow>(
      `SELECT chunk_index, chunk_start_utc, chunk_end_utc, status, retry_count
       FROM intune_audit_export_chunks WHERE job_id=$1 AND status != 'completed' ORDER BY chunk_index`,
      [jobId]
    )

    if (pendingResult.rows.length > 0) {
      await processChunksBounded(jobId, pendingResult.rows, job.filters)
    }

    const totalResult = await query<{ count: string }>(
      `SELECT COUNT(*) FROM intune_audit_export_chunks WHERE job_id=$1`, [jobId]
    )
    const completedResult = await query<{ count: string }>(
      `SELECT COUNT(*) FROM intune_audit_export_chunks WHERE job_id=$1 AND status='completed'`, [jobId]
    )
    const totalChunks = Number(totalResult.rows[0]?.count ?? 0)
    const completedChunks = Number(completedResult.rows[0]?.count ?? 0)

    if (completedChunks !== totalChunks) {
      throw new Error(`Only ${completedChunks}/${totalChunks} chunks completed — not marking export successful.`)
    }

    const refreshed = (await query<ExportJobRow>('SELECT * FROM intune_audit_export_jobs WHERE id=$1', [jobId])).rows[0]
    if (!refreshed) throw new ExportNotFoundError(`Export job ${jobId} disappeared mid-run`)
    const { eventCount, duplicateCount, artifacts } = await assembleArtifacts(refreshed, totalChunks, workDir)

    for (const artifact of artifacts) {
      await query(
        `INSERT INTO intune_audit_export_artifacts (job_id, format, blob_path, content_type, size_bytes, sha256_checksum, schema_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [jobId, artifact.format, artifact.blobPath, artifact.contentType, artifact.sizeBytes, artifact.sha256, SCHEMA_VERSION]
      )
    }

    await query(
      `UPDATE intune_audit_export_jobs
         SET status='completed', event_count=$2, duplicate_count=$3, completed_at=NOW(), updated_at=NOW()
       WHERE id=$1`,
      [jobId, eventCount, duplicateCount]
    )
  } catch (err) {
    if (err instanceof ExportCancelledError) {
      await query(`UPDATE intune_audit_export_jobs SET status='cancelled', updated_at=NOW() WHERE id=$1`, [jobId])
      return
    }
    const message = err instanceof Error ? err.message : String(err)
    await query(
      `UPDATE intune_audit_export_jobs SET status='failed', error_summary=$2, updated_at=NOW() WHERE id=$1`,
      [jobId, message.slice(0, 2000)]
    )
    throw err
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

/** Called once at server startup to resume any job left 'running' by a
 *  previous process that crashed mid-export. Completed chunks are preserved
 *  (checkpointed in the DB); only incomplete chunks are re-fetched. */
export async function resumeInterruptedExportJobsOnStartup(): Promise<void> {
  if (!isDbAvailable()) return
  const stuck = await query<{ id: string }>(`SELECT id FROM intune_audit_export_jobs WHERE status='running'`)
  for (const row of stuck.rows) {
    console.log(`[intuneAuditExport] Resuming interrupted export job ${row.id} from its last checkpoint`)
    runExportJob(row.id).catch(err => {
      console.error(`[intuneAuditExport] Resume failed for job ${row.id}:`, err instanceof Error ? err.message : err)
    })
  }
}

export function isRetryableGraphFailure(err: unknown): boolean {
  return err instanceof TransientGraphError
}

export function isFatalGraphFailure(err: unknown): err is FatalGraphError {
  return err instanceof FatalGraphError
}

/** Computes the SHA-256 checksum of a buffer — exposed for tests that verify
 *  a downloaded artifact matches its manifest-recorded checksum. */
export function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}
