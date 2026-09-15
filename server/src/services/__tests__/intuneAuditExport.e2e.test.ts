// End-to-end test of the resumable export pipeline: chunking → pagination →
// dedup → checkpointing/resume → artifact assembly (JSON/CSV/ZIP) →
// manifest + SHA-256 checksum → cancellation.
//
// Requires a real PostgreSQL database (DATABASE_URL) with schema.sql already
// applied — the schema itself is exercised, not mocked, since checkpointing
// correctness IS the thing under test. Skipped entirely when DATABASE_URL is
// unset, which is expected in most CI/sandbox environments without Postgres
// (see docs/04-integrations and the completion report's Known Limitations).
// Graph is mocked (fetchAuditEventsForChunk) and Blob Storage falls back to
// local disk (NODE_ENV != production) — only the database is real.

import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createHash } from 'crypto'

const RUN = !!process.env.DATABASE_URL

let scratchDir: string
let storageDir: string

beforeAll(() => {
  if (!RUN) return
  process.env.NODE_ENV = 'test'
  scratchDir = mkdtempSync(join(tmpdir(), 'intune-audit-scratch-'))
  storageDir = mkdtempSync(join(tmpdir(), 'intune-audit-storage-'))
  process.env.INTUNE_AUDIT_SCRATCH_DIR = scratchDir
  process.env.INTUNE_AUDIT_LOCAL_STORAGE_DIR = storageDir
  delete process.env.INTUNE_AUDIT_STORAGE_ACCOUNT_URL
  delete process.env.INTUNE_AUDIT_STORAGE_CONNECTION_STRING
  process.env.INTUNE_AUDIT_MAX_CONCURRENT_CHUNKS = '3'
})

afterAll(() => {
  if (!RUN) return
  rmSync(scratchDir, { recursive: true, force: true })
  rmSync(storageDir, { recursive: true, force: true })
})

// ─── Mock the Graph layer only — chunking/dedup/checkpointing all run for real ──
type ChunkBehavior = {
  events: Array<{ id: string; activityDateTime: string }>
  failFirstAttempts?: number
}
const chunkBehaviors = new Map<number, ChunkBehavior>()
const attemptCounts = new Map<number, number>()
const fetchCalls: number[] = []

vi.mock('../intuneAuditGraph.js', async () => {
  const actual = await vi.importActual<typeof import('../intuneAuditGraph.js')>('../intuneAuditGraph.js')
  return {
    ...actual,
    fetchAuditEventsForChunk: vi.fn(async (chunk: { index: number }, onPage: (p: unknown) => Promise<void> | void) => {
      fetchCalls.push(chunk.index)
      const behavior = chunkBehaviors.get(chunk.index) ?? { events: [] }
      const attempt = (attemptCounts.get(chunk.index) ?? 0) + 1
      attemptCounts.set(chunk.index, attempt)

      if (behavior.failFirstAttempts && attempt <= behavior.failFirstAttempts) {
        throw new actual.TransientGraphError(`Simulated transient failure for chunk ${chunk.index}, attempt ${attempt}`)
      }

      const fakeEvents = behavior.events.map(e => ({
        id: e.id, displayName: 'x', componentName: 'x', category: 'Application', activity: 'Create',
        activityDateTime: e.activityDateTime, activityType: 'Create', activityOperationType: 'Create',
        activityResult: 'Success', correlationId: 'corr', resources: [],
        actor: { type: 'ItPro', userPermissions: null, applicationId: null, applicationDisplayName: null, userPrincipalName: 'admin@zinnia.com', servicePrincipalName: null, ipAddress: '10.0.0.1', userId: 'u1' },
      }))
      // Split into two "pages" when there's more than one event, to exercise
      // multi-page-per-chunk handling even in the mock.
      const mid = Math.ceil(fakeEvents.length / 2)
      if (fakeEvents.length > 1) {
        await onPage({ events: fakeEvents.slice(0, mid), nextLink: 'mock://page2' })
        await onPage({ events: fakeEvents.slice(mid), nextLink: null })
      } else if (fakeEvents.length === 1) {
        await onPage({ events: fakeEvents, nextLink: null })
      } else {
        await onPage({ events: [], nextLink: null })
      }
      return { pagesFetched: fakeEvents.length > 1 ? 2 : 1, eventCount: fakeEvents.length }
    }),
  }
})

const { query, closeDb } = await import('../../db/index.js')
const {
  createExportJob, runExportJob, requestCancelExportJob, getExportJob,
} = await import('../intuneAuditExport.js')

beforeEach(async () => {
  if (!RUN) return
  chunkBehaviors.clear()
  attemptCounts.clear()
  fetchCalls.length = 0
  await query('DELETE FROM intune_audit_export_jobs')
})

afterAll(async () => {
  if (!RUN) return
  await closeDb()
})

describe.skipIf(!RUN)('Intune audit export — end-to-end resumable pipeline', () => {
  it('exports a full 365-day range across all weekly chunks with no gaps/duplicates', async () => {
    const start = new Date('2025-01-01T00:00:00Z')
    const end = new Date('2026-01-01T00:00:00Z') // exactly 365 days
    const expectedChunks = Math.ceil(365 / 7)

    for (let i = 0; i < expectedChunks; i++) {
      chunkBehaviors.set(i, { events: [{ id: `evt-${i}-1`, activityDateTime: '2025-06-01T00:00:00Z' }] })
    }

    const job = await createExportJob({
      tenantId: 'tenant-1', rangeStartUtc: start, rangeEndUtc: end, timezone: 'UTC',
      filters: {}, formats: ['json', 'csv', 'zip'], createdBy: 'tester@zinnia.com',
    })
    expect(job.total_chunks).toBe(expectedChunks)

    await runExportJob(job.id)

    const finished = await getExportJob(job.id, 'tenant-1')
    expect(finished?.status).toBe('completed')
    expect(finished?.event_count).toBe(expectedChunks) // one unique event per chunk
    expect(finished?.duplicate_count).toBe(0)
    expect(finished?.completed_chunks).toBe(expectedChunks)

    const artifacts = await query<{ format: string; sha256_checksum: string; blob_path: string }>(
      'SELECT format, sha256_checksum, blob_path FROM intune_audit_export_artifacts WHERE job_id=$1', [job.id]
    )
    const formats = artifacts.rows.map(a => a.format).sort()
    expect(formats).toEqual(['csv', 'json', 'zip'])

    for (const artifact of artifacts.rows) {
      const buf = readFileSync(join(storageDir, artifact.blob_path))
      const actualChecksum = createHash('sha256').update(buf).digest('hex')
      expect(actualChecksum).toBe(artifact.sha256_checksum)
    }

    const jsonArtifact = artifacts.rows.find(a => a.format === 'json')!
    const parsed = JSON.parse(readFileSync(join(storageDir, jsonArtifact.blob_path), 'utf-8'))
    expect(parsed).toHaveLength(expectedChunks)
  })

  it('exports a full leap-year 366-day range', async () => {
    const start = new Date('2024-01-01T00:00:00Z')
    const end = new Date('2025-01-01T00:00:00Z') // 2024 is a leap year
    const expectedChunks = Math.ceil(366 / 7)
    for (let i = 0; i < expectedChunks; i++) chunkBehaviors.set(i, { events: [] })

    const job = await createExportJob({
      tenantId: 'tenant-1', rangeStartUtc: start, rangeEndUtc: end, timezone: 'UTC',
      filters: {}, formats: ['json'], createdBy: 'tester@zinnia.com',
    })
    await runExportJob(job.id)

    const finished = await getExportJob(job.id, 'tenant-1')
    expect(finished?.status).toBe('completed')
    expect(finished?.total_chunks).toBe(expectedChunks)
    expect(finished?.event_count).toBe(0)
  })

  it('deduplicates events sharing the same ID across chunk pages', async () => {
    const start = new Date('2026-01-01T00:00:00Z')
    const end = new Date('2026-01-15T00:00:00Z') // 2 chunks of 7 days
    chunkBehaviors.set(0, { events: [{ id: 'dup-1', activityDateTime: '2026-01-02T00:00:00Z' }, { id: 'dup-1', activityDateTime: '2026-01-02T00:00:00Z' }] })
    chunkBehaviors.set(1, { events: [{ id: 'unique-1', activityDateTime: '2026-01-10T00:00:00Z' }] })

    const job = await createExportJob({
      tenantId: 'tenant-1', rangeStartUtc: start, rangeEndUtc: end, timezone: 'UTC',
      filters: {}, formats: ['json'], createdBy: 'tester@zinnia.com',
    })
    await runExportJob(job.id)

    const finished = await getExportJob(job.id, 'tenant-1')
    expect(finished?.status).toBe('completed')
    expect(finished?.event_count).toBe(2) // dup-1 (once) + unique-1
    expect(finished?.duplicate_count).toBe(1)
  })

  it('resumes from the last checkpoint after a simulated crash mid-export, without re-fetching completed chunks', async () => {
    const start = new Date('2026-02-01T00:00:00Z')
    const end = new Date('2026-02-22T00:00:00Z') // 3 chunks
    chunkBehaviors.set(0, { events: [{ id: 'c0', activityDateTime: '2026-02-02T00:00:00Z' }] })
    chunkBehaviors.set(1, { events: [{ id: 'c1', activityDateTime: '2026-02-09T00:00:00Z' }], failFirstAttempts: 1 })
    chunkBehaviors.set(2, { events: [{ id: 'c2', activityDateTime: '2026-02-16T00:00:00Z' }] })

    const job = await createExportJob({
      tenantId: 'tenant-1', rangeStartUtc: start, rangeEndUtc: end, timezone: 'UTC',
      filters: {}, formats: ['json'], createdBy: 'tester@zinnia.com',
    })

    // First run: chunk 1 fails once, so the job overall throws/fails.
    await expect(runExportJob(job.id)).rejects.toThrow()
    const afterFirstRun = await getExportJob(job.id, 'tenant-1')
    expect(afterFirstRun?.status).toBe('failed')
    expect(afterFirstRun?.completed_chunks).toBe(2) // 0 and 2 completed; 1 failed

    fetchCalls.length = 0

    // Second run: resumes — only chunk 1 (previously failed) should be re-fetched.
    await runExportJob(job.id)
    expect(fetchCalls).toEqual([1])

    const afterResume = await getExportJob(job.id, 'tenant-1')
    expect(afterResume?.status).toBe('completed')
    expect(afterResume?.event_count).toBe(3)
    expect(afterResume?.completed_chunks).toBe(3)
  })

  it('never reports a partial export as successful when a chunk cannot complete', async () => {
    const start = new Date('2026-03-01T00:00:00Z')
    const end = new Date('2026-03-08T00:00:00Z') // 1 chunk
    chunkBehaviors.set(0, { events: [], failFirstAttempts: 999 }) // always fails

    const job = await createExportJob({
      tenantId: 'tenant-1', rangeStartUtc: start, rangeEndUtc: end, timezone: 'UTC',
      filters: {}, formats: ['json'], createdBy: 'tester@zinnia.com',
    })
    await expect(runExportJob(job.id)).rejects.toThrow()

    const finished = await getExportJob(job.id, 'tenant-1')
    expect(finished?.status).toBe('failed')
    expect(finished?.status).not.toBe('completed')
  })

  it('cancels a queued export instead of letting it complete', async () => {
    const start = new Date('2026-04-01T00:00:00Z')
    const end = new Date('2026-04-08T00:00:00Z')
    chunkBehaviors.set(0, { events: [] })

    const job = await createExportJob({
      tenantId: 'tenant-1', rangeStartUtc: start, rangeEndUtc: end, timezone: 'UTC',
      filters: {}, formats: ['json'], createdBy: 'tester@zinnia.com',
    })
    await requestCancelExportJob(job.id, 'tenant-1')
    await runExportJob(job.id) // should observe cancelled status and no-op

    const finished = await getExportJob(job.id, 'tenant-1')
    expect(finished?.status).toBe('cancelled')
  })

  it('rejects a range exceeding the server-configured maximum', async () => {
    await expect(createExportJob({
      tenantId: 'tenant-1',
      rangeStartUtc: new Date('2020-01-01T00:00:00Z'),
      rangeEndUtc: new Date('2026-01-01T00:00:00Z'),
      timezone: 'UTC', filters: {}, formats: ['json'], createdBy: 'tester@zinnia.com',
    })).rejects.toThrow(/exceeding/)
  })
})
