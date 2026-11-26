// Ocean knowledge base storage: document metadata, text chunks, admin settings, documentation gaps and usage counters.
//
// File-backed in the app data folder (DATA_DIR), like the other runtime stores, so it works with or without
// DATABASE_URL and survives re-deploys. Writes are atomic. Raw credentials never reach this store: content is
// validated and redacted before it is chunked (see indexer.ts / knowledgeRules.ts).

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dataDir, dataFile, readJsonFile, writeJsonAtomic } from '../../store/dataDir.js'
import { Bm25Index, type IndexedChunk } from './search.js'
import type { AccessClass } from './knowledgeRules.js'

export type DocSource = 'repo' | 'uploaded'
export type DocStatus = 'indexed' | 'excluded' | 'error'

export interface DocRecord {
  id: string
  source: DocSource
  /** Repo-relative path (repo docs) or "uploaded/<file name>" (uploaded docs). */
  path: string
  title: string
  enabled: boolean
  classification: AccessClass
  status: DocStatus
  statusReason: string | null
  contentHash: string
  bytes: number
  fileModifiedAt: string | null
  lastIndexedAt: string | null
  chunkCount: number
  /** Admin choices that a re-scan must not overwrite. */
  enabledOverride: boolean
  classificationOverride: boolean
  addedBy: string | null
  updatedBy: string | null
}

export interface StoredChunk { id: string; docId: string; idx: number; heading: string; text: string }

export interface OceanEvent {
  at: string
  type: string
  actor: string
  role: string
  detail: string
}

export interface OceanSettings { /** Allow a clearly-labelled public-web fallback when the documentation has no answer. Off by default. */ webFallback: boolean }
export interface DocGap { question: string; count: number; lastAt: string; page: string | null }
export interface OceanCounters { queries: number; documentationAnswers: number; noDocumentation: number; webFallbacks: number; blockedRequests: number; rateLimited: number; errors: number; retrievalMsTotal: number; since: string }
interface MetaFile { version: 1; documents: DocRecord[]; events: OceanEvent[]; settings?: OceanSettings; gaps?: DocGap[]; counters?: OceanCounters }
interface ChunksFile { chunks: StoredChunk[] }

const META = dataFile('ocean-knowledge.json')
const CHUNKS = dataFile('ocean-chunks.json')
const MAX_EVENTS = 200

let meta: MetaFile | null = null
let chunksFile: ChunksFile | null = null
let version = 0
let indexes: { version: number; general: Bm25Index; admin: Bm25Index } | null = null

export const docId = (source: DocSource, path: string): string => createHash('sha1').update(`${source}:${path}`).digest('hex').slice(0, 12)
/** Bump CHUNKER_VERSION when chunking/redaction changes, so existing documents are re-indexed on the next scan. */
const CHUNKER_VERSION = 'c2'
export const hashContent = (content: string): string => `${createHash('sha256').update(content).digest('hex')}:${CHUNKER_VERSION}`

function loadMeta(): MetaFile {
  if (!meta) {
    meta = readJsonFile<MetaFile>(META) ?? { version: 1, documents: [], events: [] }
    if (meta.counters) Object.assign(counters, meta.counters)
  }
  return meta
}
function loadChunks(): ChunksFile {
  if (!chunksFile) chunksFile = readJsonFile<ChunksFile>(CHUNKS) ?? { chunks: [] }
  return chunksFile
}
const touch = (): void => { version++; indexes = null }
export const saveMeta = (): void => writeJsonAtomic(META, loadMeta())
export const saveChunks = (): void => writeJsonAtomic(CHUNKS, loadChunks())
export const storeVersion = (): number => version

// ── Documents ────────────────────────────────────────────────────────────────

export const listDocuments = (): DocRecord[] => [...loadMeta().documents].sort((a, b) => a.path.localeCompare(b.path))
export const getDocument = (id: string): DocRecord | undefined => loadMeta().documents.find(d => d.id === id)

export function putDocument(record: DocRecord): void {
  const docs = loadMeta().documents
  const i = docs.findIndex(d => d.id === record.id)
  if (i === -1) docs.push(record); else docs[i] = record
  touch()
}

export function patchDocument(id: string, patch: Partial<DocRecord>): DocRecord | undefined {
  const doc = getDocument(id)
  if (!doc) return undefined
  Object.assign(doc, patch)
  touch()
  return doc
}

export function removeDocument(id: string): void {
  const m = loadMeta()
  m.documents = m.documents.filter(d => d.id !== id)
  const c = loadChunks()
  c.chunks = c.chunks.filter(ch => ch.docId !== id)
  rmSync(uploadedFile(id), { force: true })
  touch()
}

// ── Chunks and vectors ───────────────────────────────────────────────────────

export const chunksOfDoc = (id: string): StoredChunk[] => loadChunks().chunks.filter(c => c.docId === id).sort((a, b) => a.idx - b.idx)
export const getChunk = (chunkId: string): StoredChunk | undefined => loadChunks().chunks.find(c => c.id === chunkId)
export const allChunks = (): StoredChunk[] => loadChunks().chunks

export function replaceChunks(id: string, chunks: Array<Omit<StoredChunk, 'id' | 'docId'>>): void {
  const c = loadChunks()
  c.chunks = c.chunks.filter(ch => ch.docId !== id)
  for (const ch of chunks) c.chunks.push({ id: `${id}#${ch.idx}`, docId: id, idx: ch.idx, heading: ch.heading, text: ch.text })
  touch()
}

/** Chunks of enabled, successfully indexed documents, split by access class. */
export function searchableChunks(): { general: IndexedChunk[]; admin: IndexedChunk[] } {
  const docs = new Map(listDocuments().filter(d => d.enabled && d.status === 'indexed').map(d => [d.id, d]))
  const general: IndexedChunk[] = [], admin: IndexedChunk[] = []
  for (const ch of loadChunks().chunks) {
    const d = docs.get(ch.docId)
    if (!d) continue
    const item: IndexedChunk = { id: ch.id, docId: d.id, docTitle: d.title, docPath: d.path, heading: ch.heading, text: ch.text }
    ;(d.classification === 'admin' ? admin : general).push(item)
  }
  return { general, admin }
}

export function getIndexes(): { general: Bm25Index; admin: Bm25Index } {
  if (!indexes || indexes.version !== version) {
    const { general, admin } = searchableChunks()
    indexes = { version, general: new Bm25Index(general), admin: new Bm25Index(admin) }
  }
  return indexes
}

// ── Uploaded document files ──────────────────────────────────────────────────

function uploadDir(): string {
  const dir = join(dataDir(), 'ocean-docs')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}
export const uploadedFile = (id: string): string => join(uploadDir(), `${id}.md`)
export const writeUploaded = (id: string, content: string): void => writeFileSync(uploadedFile(id), content, { encoding: 'utf-8', mode: 0o600 })
export const readUploaded = (id: string): string | null => { try { return readFileSync(uploadedFile(id), 'utf-8') } catch { return null } }

// ── Audit trail + counters ───────────────────────────────────────────────────

export function recordEvent(event: Omit<OceanEvent, 'at'>): void {
  const m = loadMeta()
  m.events.unshift({ at: new Date().toISOString(), ...event })
  if (m.events.length > MAX_EVENTS) m.events.length = MAX_EVENTS
  console.info(`[ocean] ${event.type} by ${event.actor} (${event.role}): ${event.detail}`)
  try { saveMeta() } catch { /* the audit trail is best-effort on disk, always logged to the console */ }
}
export const recentEvents = (limit = 100): OceanEvent[] => loadMeta().events.slice(0, limit)

export const counters: OceanCounters = { queries: 0, documentationAnswers: 0, noDocumentation: 0, webFallbacks: 0, blockedRequests: 0, rateLimited: 0, errors: 0, retrievalMsTotal: 0, since: new Date().toISOString() }

let saveTimer: ReturnType<typeof setTimeout> | undefined
function persistSoon(): void {
  if (saveTimer) return
  saveTimer = setTimeout(() => { saveTimer = undefined; try { loadMeta().counters = { ...counters }; saveMeta() } catch { /* counters are best-effort */ } }, 5000)
  saveTimer.unref?.()
}
/** Writes pending counter/gap changes now (used on shutdown and in tests). */
export function flushStore(): void {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = undefined }
  loadMeta().counters = { ...counters }
  saveMeta()
}
/** Increments a usage counter; counters survive restarts (saved a few seconds after the last change). */
export function bump(key: Exclude<keyof OceanCounters, 'since'>, by = 1): void { loadMeta(); counters[key] += by; persistSoon() }

// ── Admin settings ───────────────────────────────────────────────────────────

export const getSettings = (): OceanSettings => ({ webFallback: false, ...loadMeta().settings })
export function setSettings(patch: Partial<OceanSettings>): OceanSettings {
  const m = loadMeta()
  m.settings = { ...getSettings(), ...patch }
  saveMeta()
  return m.settings
}

// ── Documentation gaps: questions Ocean could not answer ─────────────────────

const MAX_GAPS = 200
export function recordGap(question: string, page: string | null): void {
  const m = loadMeta()
  const gaps = (m.gaps ??= [])
  const key = question.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 100)
  if (!key) return
  const existing = gaps.find(g => g.question === key)
  if (existing) { existing.count++; existing.lastAt = new Date().toISOString() }
  else gaps.push({ question: key, count: 1, lastAt: new Date().toISOString(), page })
  if (gaps.length > MAX_GAPS) { gaps.sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt)); gaps.length = MAX_GAPS }
  persistSoon()
}
export const topGaps = (limit = 25): DocGap[] => [...(loadMeta().gaps ?? [])].sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt)).slice(0, limit)
export function clearGaps(): void { loadMeta().gaps = []; saveMeta() }

/** Test helper: forget cached state so the next call re-reads the data folder. */
export function resetKnowledgeCache(): void { meta = null; chunksFile = null; indexes = null; version++ }
