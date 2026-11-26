// Ocean knowledge base — documentation viewer and administrator management routes.
//
//   GET    /api/ocean/docs/:id                   view an indexed document (sections) — copilot.read; admin-only docs need ocean.docs.manage
//   GET    /api/ocean/admin/documents            list documents with index status        } ocean.docs.manage
//   POST   /api/ocean/admin/documents            add or update an approved document      }
//   PATCH  /api/ocean/admin/documents/:id        enable/disable, change access class     }
//   POST   /api/ocean/admin/documents/:id/reindex                                         }
//   DELETE /api/ocean/admin/documents/:id        remove an uploaded document             }
//   POST   /api/ocean/admin/reindex              re-scan and re-index all documentation  }
//   GET    /api/ocean/admin/status               index health, provider flags, counters  }
//   GET    /api/ocean/admin/events               recent audit trail                      }
//
// Nothing here returns credentials: documents are validated and redacted before they are stored, provider settings
// are reported only as configured / not configured, and every change is written to the audit trail.

import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import { identifyAuditActor, requireCapability } from '../middleware/requireRole.js'
import { permissionsForRole } from '../services/roleResolution.js'
import { getGeminiConfig } from '../store/integrationStore.js'
import { isIndexing, docsRoot, discoverRepoFiles, reindexAll, reindexOne, upsertUploaded } from '../services/ocean/indexer.js'
import { webProvider } from '../services/ocean/webSearch.js'
import { MAX_DOC_BYTES } from '../services/ocean/knowledgeRules.js'
import * as store from '../services/ocean/knowledgeStore.js'

const router = Router()
router.use(identifyAuditActor)

const who = (req: { auditActor?: { email: string; appRole: string } }) => ({ actor: req.auditActor?.email ?? 'unknown', role: req.auditActor?.appRole ?? 'unknown' })

const toApi = (d: store.DocRecord) => ({
  id: d.id, source: d.source, path: d.path, title: d.title, enabled: d.enabled, classification: d.classification, status: d.status,
  statusReason: d.statusReason, bytes: d.bytes, sections: d.chunkCount, lastIndexedAt: d.lastIndexedAt, fileModifiedAt: d.fileModifiedAt,
  addedBy: d.addedBy, updatedBy: d.updatedBy,
})

// ── Viewer ───────────────────────────────────────────────────────────────────

router.get('/docs/:id', requireCapability('copilot.read'), asyncHandler(async (req, res) => {
  const doc = store.getDocument(String(req.params['id']))
  if (!doc || !doc.enabled || doc.status !== 'indexed') { res.status(404).json({ success: false, error: 'Document not found.' }); return }
  if (doc.classification === 'admin') {
    const perms = await permissionsForRole(who(req).role)
    // Same answer as a missing document, so the existence of admin-only documents is not disclosed.
    if (perms['ocean.docs.manage'] !== true) { res.status(404).json({ success: false, error: 'Document not found.' }); return }
  }
  res.json({ success: true, data: { ...toApi(doc), chunks: store.chunksOfDoc(doc.id).map(c => ({ id: c.id, idx: c.idx, heading: c.heading, text: c.text })) } })
}))

// ── Administration ───────────────────────────────────────────────────────────

const admin = Router()
admin.use(requireCapability('ocean.docs.manage'))

admin.get('/documents', (_req, res) => { res.json({ success: true, data: store.listDocuments().map(toApi) }) })

const uploadSchema = z.object({
  filename: z.string().min(1).max(120),
  content: z.string().min(1).max(MAX_DOC_BYTES * 2),
  title: z.string().max(160).optional(),
  classification: z.enum(['general', 'admin']).optional(),
})

admin.post('/documents', (req, res) => {
  const parsed = uploadSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ success: false, error: 'filename and content are required.' }); return }
  const { actor, role } = who(req)
  const { filename, content, title, classification } = parsed.data
  const result = upsertUploaded({ filename, content, ...(title ? { title } : {}), ...(classification ? { classification } : {}), actor, role })
  if (!result.ok) {
    store.recordEvent({ type: 'doc_rejected', actor, role, detail: parsed.data.filename.slice(0, 80) })
    res.status(400).json({ success: false, error: result.errors.join(' '), errors: result.errors }); return
  }
  res.status(result.created ? 201 : 200).json({ success: true, data: toApi(result.doc) })
})

const patchSchema = z.object({ enabled: z.boolean().optional(), classification: z.enum(['general', 'admin']).optional() })

admin.patch('/documents/:id', (req, res) => {
  const parsed = patchSchema.safeParse(req.body)
  const doc = store.getDocument(String(req.params['id']))
  if (!doc) { res.status(404).json({ success: false, error: 'Document not found.' }); return }
  if (!parsed.success || (parsed.data.enabled === undefined && parsed.data.classification === undefined)) { res.status(400).json({ success: false, error: 'Provide enabled and/or classification.' }); return }
  if (parsed.data.enabled === true && doc.status !== 'indexed') { res.status(400).json({ success: false, error: `This document cannot be enabled: ${doc.statusReason ?? doc.status}.` }); return }
  const { actor, role } = who(req)
  const patch: Partial<store.DocRecord> = { updatedBy: actor }
  if (parsed.data.enabled !== undefined) { patch.enabled = parsed.data.enabled; patch.enabledOverride = true }
  if (parsed.data.classification !== undefined) { patch.classification = parsed.data.classification; patch.classificationOverride = true }
  const updated = store.patchDocument(doc.id, patch)!
  store.saveMeta()
  store.recordEvent({ type: 'doc_changed', actor, role, detail: `${doc.path}: ${[parsed.data.enabled !== undefined && (parsed.data.enabled ? 'enabled' : 'disabled'), parsed.data.classification && `access ${parsed.data.classification}`].filter(Boolean).join(', ')}` })
  res.json({ success: true, data: toApi(updated) })
})

admin.post('/documents/:id/reindex', (req, res) => {
  const { actor, role } = who(req)
  const result = reindexOne(String(req.params['id']), actor, role)
  if (!result.ok) { res.status(400).json({ success: false, error: result.error }); return }
  res.json({ success: true, data: toApi(result.doc!) })
})

admin.delete('/documents/:id', (req, res) => {
  const doc = store.getDocument(String(req.params['id']))
  if (!doc) { res.status(404).json({ success: false, error: 'Document not found.' }); return }
  if (doc.source !== 'uploaded') { res.status(400).json({ success: false, error: 'Repository documents cannot be deleted here; disable them instead.' }); return }
  const { actor, role } = who(req)
  store.removeDocument(doc.id); store.saveMeta(); store.saveChunks()
  store.recordEvent({ type: 'doc_deleted', actor, role, detail: doc.path })
  res.json({ success: true })
})

admin.post('/reindex', asyncHandler(async (req, res) => {
  const { actor, role } = who(req)
  try {
    const report = await reindexAll({ force: req.query['force'] === '1', actor, role })
    res.json({ success: true, data: report })
  } catch (e) {
    res.status(409).json({ success: false, error: e instanceof Error ? e.message : 'Re-index failed.' })
  }
}))

admin.get('/status', (_req, res) => {
  const docs = store.listDocuments()
  const searchable = docs.filter(d => d.enabled && d.status === 'indexed')
  const answered = store.counters.queries
  res.json({
    success: true,
    data: {
      documents: { total: docs.length, enabled: searchable.length, disabled: docs.filter(d => !d.enabled).length, excluded: docs.filter(d => d.status === 'excluded').length, errors: docs.filter(d => d.status === 'error').length, adminOnly: docs.filter(d => d.classification === 'admin').length },
      sections: store.allChunks().length,
      lastIndexedAt: docs.map(d => d.lastIndexedAt).filter((x): x is string => !!x).sort().pop() ?? null,
      indexing: isIndexing(),
      repoDocsFolderFound: discoverRepoFiles(docsRoot()).files.length > 0,
      provider: { aiConfigured: !!getGeminiConfig()?.apiKey },
      search: { mode: 'local', description: 'Keyword (BM25) + local latent-semantic search + typo tolerance, computed on this server; no external API.' },
      web: { fallbackEnabled: store.getSettings().webFallback, ...(() => { const w = webProvider(); return { provider: w.label, ready: w.ready, ...(w.reason ? { reason: w.reason } : {}) } })() },
      usage: { ...store.counters, avgRetrievalMs: answered ? Math.round(store.counters.retrievalMsTotal / answered) : 0 },
    },
  })
})

const settingsSchema = z.object({ webFallback: z.boolean() })
admin.get('/settings', (_req, res) => { const w = webProvider(); res.json({ success: true, data: { ...store.getSettings(), webProvider: { name: w.label, ready: w.ready, ...(w.reason ? { reason: w.reason } : {}) } } }) })
admin.put('/settings', (req, res) => {
  const parsed = settingsSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ success: false, error: 'webFallback (true/false) is required.' }); return }
  const { actor, role } = who(req)
  if (parsed.data.webFallback && !webProvider().ready) { res.status(400).json({ success: false, error: `Web search cannot be enabled: ${webProvider().reason ?? 'no provider is available'}.` }); return }
  const settings = store.setSettings(parsed.data)
  store.recordEvent({ type: 'settings_changed', actor, role, detail: `web fallback ${settings.webFallback ? 'ON (provider: ' + webProvider().label + ')' : 'OFF'}` })
  res.json({ success: true, data: settings })
})

admin.get('/gaps', (_req, res) => { res.json({ success: true, data: store.topGaps(50) }) })
admin.delete('/gaps', (req, res) => { const { actor, role } = who(req); store.clearGaps(); store.recordEvent({ type: 'gaps_cleared', actor, role, detail: 'documentation gap list cleared' }); res.json({ success: true }) })

admin.get('/events', (_req, res) => { res.json({ success: true, data: store.recentEvents(100) }) })

router.use('/admin', admin)
export default router
