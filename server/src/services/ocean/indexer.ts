// Ocean document ingestion: scans the repository's approved documentation, validates and indexes uploaded
// documents, and keeps the index fresh. Sensitive files are refused by name, type and content.

import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { SERVER_ROOT } from '../../store/dataDir.js'
import { chunkMarkdown } from './chunker.js'
import {
  EXCLUDED_DIRS, MAX_DOC_BYTES, classifyPath, defaultEnabled, deriveTitle, detectSecrets, hasAllowedExtension, pathExclusionReason, redactSecrets, sensitivePathReason, validateUpload,
  type AccessClass,
} from './knowledgeRules.js'
import * as store from './knowledgeStore.js'
import type { DocRecord } from './knowledgeStore.js'

export interface ReindexReport { scanned: number; indexed: number; unchanged: number; excluded: number; errors: number; removed: number; durationMs: number; repoDocsFound: boolean }

export const docsRoot = (): string => resolve(process.env['OCEAN_DOCS_ROOT']?.trim() || join(SERVER_ROOT, '..'))

/** Repo-relative files that may be documentation: the root README/CLAUDE.md and everything under docs/. */
export function discoverRepoFiles(root = docsRoot()): { files: string[]; blocked: string[] } {
  const files: string[] = [], blocked: string[] = []
  const add = (rel: string) => {
    if (sensitivePathReason(rel)) { blocked.push(rel); return }
    if (hasAllowedExtension(rel)) files.push(rel)
  }
  for (const name of ['README.md', 'CLAUDE.md']) {
    try { if (lstatSync(join(root, name)).isFile()) add(name) } catch { /* not present in this deployment */ }
  }
  const walk = (dir: string): void => {
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue                       // never follow links out of the docs folder
      const full = join(dir, e.name)
      if (e.isDirectory()) { if (!EXCLUDED_DIRS.has(e.name.toLowerCase())) walk(full); continue }
      if (e.isFile()) add(relative(root, full).split(sep).join('/'))
    }
  }
  walk(join(root, 'docs'))
  return { files: files.sort(), blocked: blocked.sort() }
}

function baseRecord(source: DocRecord['source'], path: string, existing?: DocRecord): DocRecord {
  return {
    id: store.docId(source, path), source, path, title: existing?.title ?? path, enabled: existing?.enabled ?? defaultEnabled(path),
    classification: existing?.classification ?? classifyPath(path), status: 'excluded', statusReason: null, contentHash: '', bytes: 0,
    fileModifiedAt: null, lastIndexedAt: existing?.lastIndexedAt ?? null, chunkCount: 0,
    enabledOverride: existing?.enabledOverride ?? false, classificationOverride: existing?.classificationOverride ?? false,
    addedBy: existing?.addedBy ?? null, updatedBy: existing?.updatedBy ?? null,
  }
}

/** Validates and indexes one document's text; returns the stored record. */
function indexContent(rec: DocRecord, content: string, force: boolean): { rec: DocRecord; changed: boolean } {
  const hash = store.hashContent(content)
  rec.bytes = Buffer.byteLength(content, 'utf-8')
  if (!force && rec.status === 'indexed' && rec.contentHash === hash && rec.chunkCount > 0 && store.chunksOfDoc(rec.id).length === rec.chunkCount) return { rec, changed: false }
  rec.title = deriveTitle(rec.path, content)
  // Image-only lines (screenshots) carry no searchable text and clutter excerpts.
  const chunks = chunkMarkdown(rec.title, redactSecrets(content).replace(/^[ \t]*!\[[^\]]*\]\([^)]*\)[ \t]*$/gm, ''))
  if (!chunks.length) { rec.status = 'excluded'; rec.statusReason = 'no readable text sections'; rec.chunkCount = 0; rec.contentHash = hash; store.replaceChunks(rec.id, []); return { rec, changed: true } }
  store.replaceChunks(rec.id, chunks)
  rec.status = 'indexed'; rec.statusReason = null; rec.contentHash = hash; rec.chunkCount = chunks.length; rec.lastIndexedAt = new Date().toISOString()
  return { rec, changed: true }
}

function applyAdminChoices(rec: DocRecord, existing?: DocRecord): void {
  rec.enabled = existing?.enabledOverride ? existing.enabled : defaultEnabled(rec.path)
  rec.classification = existing?.classificationOverride ? existing.classification : classifyPath(rec.path)
}

let indexing = false
export const isIndexing = (): boolean => indexing

export async function reindexAll(opts: { force?: boolean; actor?: string; role?: string } = {}): Promise<ReindexReport> {
  if (indexing) throw new Error('A re-index is already running. Try again in a moment.')
  indexing = true
  const started = Date.now()
  const report: ReindexReport = { scanned: 0, indexed: 0, unchanged: 0, excluded: 0, errors: 0, removed: 0, durationMs: 0, repoDocsFound: false }
  try {
    const root = docsRoot()
    const { files, blocked } = discoverRepoFiles(root)
    report.repoDocsFound = files.length > 0
    const seen = new Set<string>()

    for (const path of blocked) {
      const id = store.docId('repo', path); seen.add(id)
      const rec = baseRecord('repo', path, store.getDocument(id))
      rec.statusReason = `blocked: ${sensitivePathReason(path)}`; rec.enabled = false
      store.putDocument(rec); store.replaceChunks(id, []); report.excluded++; report.scanned++
    }

    for (const path of files) {
      report.scanned++
      const id = store.docId('repo', path); seen.add(id)
      const existing = store.getDocument(id)
      const rec = baseRecord('repo', path, existing)
      try {
        const reason = pathExclusionReason(path)
        const full = join(root, path)
        const stat = lstatSync(full)
        rec.fileModifiedAt = stat.mtime.toISOString(); rec.bytes = stat.size
        if (reason) { rec.statusReason = reason; applyAdminChoices(rec, existing); store.putDocument(rec); store.replaceChunks(id, []); report.excluded++; continue }
        if (stat.size > MAX_DOC_BYTES) { rec.statusReason = `larger than ${Math.round(MAX_DOC_BYTES / 1000)} KB`; applyAdminChoices(rec, existing); store.putDocument(rec); store.replaceChunks(id, []); report.excluded++; continue }
        const content = readFileSync(full, 'utf-8')
        const secrets = detectSecrets(content)
        if (content.includes('\u0000')) { rec.statusReason = 'binary content'; applyAdminChoices(rec, existing); store.putDocument(rec); store.replaceChunks(id, []); report.excluded++; continue }
        if (secrets.length) {
          rec.statusReason = `possible credentials found (${[...new Set(secrets.map(s => s.label))].join(', ')} at line ${secrets[0]!.line}); remove them to index this file`
          rec.enabled = false; rec.classification = existing?.classification ?? classifyPath(path); store.putDocument(rec); store.replaceChunks(id, []); report.excluded++; continue
        }
        applyAdminChoices(rec, existing)
        if (existing) { rec.title = existing.title; rec.contentHash = existing.contentHash; rec.chunkCount = existing.chunkCount; rec.status = existing.status; rec.lastIndexedAt = existing.lastIndexedAt }
        const { changed } = indexContent(rec, content, !!opts.force)
        store.putDocument(rec)
        if (changed) report.indexed++; else report.unchanged++
      } catch (e) {
        rec.status = 'error'; rec.statusReason = e instanceof Error ? e.message.slice(0, 200) : 'read error'; applyAdminChoices(rec, existing)
        store.putDocument(rec); report.errors++
      }
    }

    for (const doc of store.listDocuments()) {
      if (doc.source === 'repo' && !seen.has(doc.id)) { store.removeDocument(doc.id); report.removed++ }
    }
    store.saveMeta(); store.saveChunks()
    report.durationMs = Date.now() - started
    store.recordEvent({ type: 'reindex', actor: opts.actor ?? 'system', role: opts.role ?? 'system', detail: `${report.indexed} indexed, ${report.unchanged} unchanged, ${report.excluded} excluded, ${report.errors} errors, ${report.removed} removed` })
    return report
  } finally { indexing = false }
}

// ── Uploaded / pasted documents ──────────────────────────────────────────────

export interface UploadInput { filename: string; content: string; title?: string; classification?: AccessClass; actor: string; role: string }

export function upsertUploaded(input: UploadInput): { ok: true; doc: DocRecord; created: boolean } | { ok: false; errors: string[] } {
  const check = validateUpload(input.filename, input.content)
  if (!check.ok) return { ok: false, errors: check.errors }
  const path = `uploaded/${input.filename.trim()}`
  const id = store.docId('uploaded', path)
  const existing = store.getDocument(id)
  const rec = baseRecord('uploaded', path, existing)
  rec.enabled = existing?.enabled ?? true
  rec.classification = input.classification ?? existing?.classification ?? 'general'
  rec.classificationOverride = true
  rec.addedBy = existing?.addedBy ?? input.actor; rec.updatedBy = input.actor
  rec.fileModifiedAt = new Date().toISOString()
  store.writeUploaded(id, input.content)
  const { rec: done } = indexContent(rec, input.content, true)
  if (input.title?.trim()) done.title = input.title.trim().slice(0, 160)
  store.putDocument(done); store.saveMeta(); store.saveChunks()
  store.recordEvent({ type: existing ? 'doc_updated' : 'doc_added', actor: input.actor, role: input.role, detail: `${done.path} (${done.classification}, ${done.chunkCount} sections)` })
  return { ok: true, doc: done, created: !existing }
}

/** Re-reads one document from its source and re-indexes it. */
export function reindexOne(id: string, actor: string, role: string): { ok: boolean; error?: string; doc?: DocRecord } {
  const doc = store.getDocument(id)
  if (!doc) return { ok: false, error: 'Document not found.' }
  let content: string | null
  if (doc.source === 'uploaded') content = store.readUploaded(id)
  else {
    try { content = readFileSync(join(docsRoot(), doc.path), 'utf-8') } catch { content = null }
  }
  if (content === null) return { ok: false, error: 'The source file could not be read.' }
  const reason = doc.source === 'repo' ? pathExclusionReason(doc.path) : null
  if (reason) return { ok: false, error: reason }
  const secrets = detectSecrets(content)
  if (secrets.length) return { ok: false, error: `Possible credentials found (${secrets[0]!.label} at line ${secrets[0]!.line}). Remove them to index this document.` }
  const { rec } = indexContent({ ...doc }, content, true)
  store.putDocument(rec); store.saveMeta(); store.saveChunks()
  store.recordEvent({ type: 'doc_reindexed', actor, role, detail: rec.path })
  return { ok: true, doc: rec }
}

/**
 * Index repo docs on every start, so Ocean always knows the current documentation without any admin action,
 * then keep them fresh in the background. Files whose content has not changed are skipped (by hash), and admin
 * choices (enabled / classification overrides) are kept, so a start-up scan is cheap.
 */
export async function ensureKnowledgeBase(): Promise<void> {
  try {
    if (discoverRepoFiles().files.length > 0) await reindexAll({ actor: 'system', role: 'startup' })
  } catch (e) { console.error('[ocean] start-up indexing failed:', e) }
  startAutoReindex()
}

let autoTimer: ReturnType<typeof setInterval> | undefined
/** Re-scans the documentation every OCEAN_AUTO_REINDEX_HOURS (default 6; 0 turns it off); unchanged files are skipped. */
export function startAutoReindex(): void {
  if (autoTimer) return
  const raw = Number(process.env['OCEAN_AUTO_REINDEX_HOURS'])
  const hours = Number.isFinite(raw) && raw >= 0 ? raw : 6
  if (hours === 0) return
  autoTimer = setInterval(() => {
    reindexAll({ actor: 'system', role: 'scheduled' }).catch(e => console.error('[ocean] scheduled re-index failed:', e instanceof Error ? e.message : e))
  }, hours * 3_600_000)
  autoTimer.unref?.()
}
