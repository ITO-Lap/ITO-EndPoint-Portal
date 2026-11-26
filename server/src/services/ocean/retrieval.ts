// Ocean retrieval: finds the documentation sections relevant to a question, respecting the caller's access level,
// and builds the deterministic "no answer" / "documentation only" responses.

import type { CopilotCitation } from '../copilotTools.js'
import { bump, getIndexes, listDocuments, storeVersion } from './knowledgeStore.js'
import { correctTerm, fuse, queryBigrams, queryTerms, tokenize, type IndexedChunk, type Ranked } from './search.js'
import { LsaModel } from './lsa.js'
import type { WebOutcome } from './webSearch.js'

export const NO_DOCS_SENTENCE = 'I could not find a verified answer in the available project documentation.'

// Local (latent semantic) similarity improves the ranking of sections that already pass the word-match gate, but it does not
// decide relevance on its own: measured on the real documentation it added no recall and only added false positives.
const SEMANTIC_FLOOR = 0.3
const MAX_HITS = 5
const MAX_PER_DOC = 2

export interface DocHit { chunk: IndexedChunk; score: number; coverage: number; weighted: number; matched: number; semantic: number | null }
export interface Retrieval { hits: DocHit[]; adminOnlyMatch: boolean; mode: 'hybrid' | 'keyword'; ms: number; indexedChunks: number; terms: string[] }

// A section answers the question when it covers most of the question's weight (distinctive words count more, and words
// the documentation never uses count against it), or, for long multi-topic questions, at least three distinct terms
// that carry a fair share of the weight, or one dominant distinctive term.
const WEIGHT_MIN = 0.5
const passes = (r: Ranked, nTerms: number): boolean =>
  (r.matched >= Math.min(2, nTerms) && r.weighted >= WEIGHT_MIN) || (r.matched >= 3 && r.weighted >= 0.3) || r.weighted >= 0.7

/** Documents whose title or file name matches the question's own words rank higher; the current page counts too. */
const OVERVIEW_INTENT = /\b(what (?:is|does|are)|explain|overview|about|purpose|describe|introduc\w*|summar\w*)\b/i

function rankBooster(page: string | undefined, terms: string[], question = ''): ((c: IndexedChunk) => number) | undefined {
  const pageTokens = page ? tokenize(page) : []
  const overview = OVERVIEW_INTENT.test(question)
  const cache = new Map<string, Set<string>>()
  const nameTokens = (c: IndexedChunk): Set<string> => {
    let have = cache.get(c.docId)
    if (!have) { have = new Set([...tokenize(c.docPath.replace(/\.[^.]+$/, '')), ...tokenize(c.docTitle)]); cache.set(c.docId, have) }
    return have
  }
  return c => {
    const have = nameTokens(c)
    let m = 1
    if (pageTokens.length && pageTokens.every(t => have.has(t))) m *= 1.35
    const named = terms.filter(t => have.has(t)).length
    if (named >= 2) m *= 1 + Math.min(named, 3) * 0.2   // "stale device" in STALE-DEVICES.md
    // "What does X do / explain X": the document's introduction and overview sections answer it best.
    if (overview && named >= 1) {
      if (c.heading.split(' › ').length === 1) m *= 1.3
      else if (/overview|what it|purpose|introduction|summary|about/i.test(c.heading)) m *= 1.2
    }
    return m
  }
}

// The latent space is rebuilt lazily whenever the knowledge base changes; one per access scope so that a standard
// user's space never contains administrator-only text.
const models = new Map<'general' | 'all', { version: number; model: LsaModel | null }>()
function modelFor(scope: 'general' | 'all'): LsaModel | null {
  const version = storeVersion()
  const cached = models.get(scope)
  if (cached && cached.version === version) return cached.model
  const { general, admin } = getIndexes()
  const model = LsaModel.build(scope === 'all' ? [...general.allChunks(), ...admin.allChunks()] : general.allChunks())
  models.set(scope, { version, model })
  return model
}

export async function retrieveDocs(question: string, opts: { includeAdmin: boolean; page?: string; topK?: number; /** false = return the best candidates without the relevance gate (diagnostics and tuning only) */ gate?: boolean }): Promise<Retrieval> {
  const started = Date.now()
  const { general, admin } = getIndexes()
  const vocabularies = [general.vocabulary(), ...(opts.includeAdmin ? [admin.vocabulary()] : [])]
  const known = (t: string): boolean => vocabularies.some(v => v.has(t))
  let terms = queryTerms(question)
  // "Explain this dashboard" has almost no content words of its own; the current page supplies the subject.
  if (terms.length < 3 && opts.page) terms = [...new Set([...terms, ...tokenize(opts.page)])]
  // Typos ("notificaton") are mapped to the closest word the documentation uses; words it never uses stay (and count against a match).
  terms = [...new Set(terms.map(t => (known(t) ? t : correctTerm(t, vocabularies) ?? t)))]
  const boost = rankBooster(opts.page, terms, question)
  const phrases = queryBigrams(question)
  const topK = opts.topK ?? MAX_HITS

  const keyword = [...general.search(terms, 30, boost, phrases), ...(opts.includeAdmin ? admin.search(terms, 30, boost, phrases) : [])].sort((a, b) => b.score - a.score).slice(0, 30)

  const pool = [...general.allChunks(), ...(opts.includeAdmin ? admin.allChunks() : [])]
  const model = pool.length ? modelFor(opts.includeAdmin ? 'all' : 'general') : null
  let semantic: Array<{ chunk: IndexedChunk; sim: number }> = []
  if (model) {
    const sims = model.similarities(terms)
    const byId = new Map(pool.map(c => [c.id, c]))
    semantic = [...sims].filter(([, sim]) => sim >= SEMANTIC_FLOOR).sort((a, b) => b[1] - a[1]).slice(0, 30).flatMap(([id, sim]) => { const chunk = byId.get(id); return chunk ? [{ chunk, sim }] : [] })
  }
  const mode: Retrieval['mode'] = model ? 'hybrid' : 'keyword'
  const total = pool.length

  const ranked = fuse(keyword, semantic, 30).filter(r => opts.gate === false || passes(r, terms.length))
  const perDoc = new Map<string, number>()
  const hits: DocHit[] = []
  for (const r of ranked) {
    const n = perDoc.get(r.chunk.docId) ?? 0
    if (n >= MAX_PER_DOC) continue
    perDoc.set(r.chunk.docId, n + 1)
    hits.push({ chunk: r.chunk, score: r.score, coverage: r.coverage, weighted: r.weighted, matched: r.matched, semantic: r.semantic })
    if (hits.length >= topK) break
  }

  // Non-admins never receive admin-only text, but they should be told when that is where the answer lives.
  let adminOnlyMatch = false
  if (!hits.length && !opts.includeAdmin) {
    adminOnlyMatch = admin.search(terms, 5, boost, phrases).some(r => passes({ ...r, semantic: null }, terms.length))
  }

  const ms = Date.now() - started
  bump('retrievalMsTotal', ms)
  return { hits, adminOnlyMatch, mode, ms, indexedChunks: total, terms }
}

const sectionOf = (c: IndexedChunk): string => c.heading.split(' › ').slice(1).join(' › ') || c.heading

export function webCitations(web: WebOutcome | null | undefined): CopilotCitation[] {
  return (web?.results ?? []).map(r => ({ source: `${web!.label} (external web)`, recordId: r.title, freshness: new Date().toISOString(), url: r.url, kind: 'web' as const }))
}

export function docCitation(hit: DocHit, label: string): CopilotCitation {
  const doc = listDocuments().find(d => d.id === hit.chunk.docId)
  return {
    source: 'Project documentation', recordId: `${label} · ${hit.chunk.docTitle} › ${sectionOf(hit.chunk)}`,
    freshness: doc?.lastIndexedAt ?? new Date().toISOString(), kind: 'doc',
    docId: hit.chunk.docId, chunkId: hit.chunk.id, title: hit.chunk.docTitle, section: sectionOf(hit.chunk), path: hit.chunk.docPath,
  }
}

/** Excerpts handed to the model, labelled [D1].. so the answer can cite them. */
export function formatExcerpts(hits: DocHit[], maxChars = 6500): string {
  let used = 0
  const parts: string[] = []
  hits.forEach((h, i) => {
    const body = h.chunk.text.length > 1500 ? `${h.chunk.text.slice(0, 1500)}…` : h.chunk.text
    const block = `[D${i + 1}] ${h.chunk.docTitle} › ${sectionOf(h.chunk)} (${h.chunk.docPath})\n${body}`
    if (used + block.length > maxChars && parts.length) return
    used += block.length; parts.push(block)
  })
  return parts.join('\n\n---\n\n')
}

export function noDocsAnswer(opts: { adminOnlyMatch: boolean; page?: string | undefined; notIndexed?: boolean; web?: WebOutcome | null | undefined }): string {
  const steps = [
    `Open ${opts.page && opts.page !== 'Dashboard' ? `the ${opts.page} page` : 'the relevant module'} in the app, or the Documentation page, and check it directly.`,
    opts.adminOnlyMatch
      ? 'This topic appears to be covered in administrator-only documentation. Contact an administrator for the details.'
      : 'Contact an administrator or the EndPoint+ team and describe what you are trying to do.',
    'If this feature should be documented, ask an administrator to add or update the documentation (Settings → Ocean Knowledge) so I can answer it next time.',
  ]
  const note = opts.notIndexed ? '\n\nNote: the Ocean knowledge base has no indexed documentation yet. An administrator can index it in Settings → Ocean Knowledge.' : ''
  let web = ''
  if (opts.web) {
    web = opts.web.results.length
      ? `\n\nExternal web results from ${opts.web.label}. These are not verified project documentation; check them before relying on them:\n${opts.web.results.map((r, i) => `${i + 1}. ${r.title}${r.snippet ? ` — ${r.snippet}` : ''}\n   ${r.url}`).join('\n')}`
      : `\n\nWeb search is switched on, but it returned nothing${opts.web.error ? ` (${opts.web.error})` : ''}.`
  }
  return `${NO_DOCS_SENTENCE}${note}${web}\n\nNext steps:\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
}

export function docsOnlyAnswer(hits: DocHit[]): string {
  const top = hits.slice(0, 3).map((h, i) => {
    const text = h.chunk.text.length > 700 ? `${h.chunk.text.slice(0, 700).replace(/\s+\S*$/, '')}…` : h.chunk.text
    return `[D${i + 1}] ${h.chunk.docTitle} › ${sectionOf(h.chunk)}\n${text}`
  })
  return `Ocean's AI model is not configured, so here are the most relevant documentation excerpts instead of a written answer:\n\n${top.join('\n\n')}`
}

/** Questions about this organisation's live data (as opposed to how the tool works) are allowed to reach the live tools. */
const LIVE_INTENT = /\b(how many|which devices|list (?:all |my |the )?(?:devices|users|apps)|show (?:me )?(?:the |all |my )?(?:devices|users|apps|findings|failures)|status of|compliance (?:status |state )?(?:for|of)|is (?:this|the|my) (?:device|laptop|mac)|who (?:is|has|owns)|find (?:similar )?devices|risk (?:score|findings)|today'?s|recent (?:failures|activity|findings)|right now|currently|last (?:sync|check-?in)|serial number|device [A-Za-z0-9-]{6,})\b/i
export const looksLikeLiveDataQuestion = (message: string, hasRecordContext: boolean): boolean => hasRecordContext || LIVE_INTENT.test(message)

/**
 * A question about how this tool works (as opposed to a greeting, a request to take an action, or a live-data lookup).
 * Only these are answered with the fixed "no verified answer" reply when nothing relevant is documented; everything else
 * still reaches the assistant, which can use its live tools or confirm an action.
 */
const DOC_QUESTION = /\b(how (?:do|does|can|should|to|is|are)|what (?:is|are|does|do|permissions?|environment)|why (?:is|does|do|am|are|can'?t|isn'?t)|where (?:is|do|can|are)|which (?:module|page|data|api|permission|role|source)|can i|explain|describe|configure|set ?up|troubleshoot|documentation|docs\b|limitations?|required|supported|workflow)\b/i
export const looksLikeDocQuestion = (message: string): boolean => DOC_QUESTION.test(message)
