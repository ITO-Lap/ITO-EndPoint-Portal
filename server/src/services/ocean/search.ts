// Keyword (BM25) + optional semantic (cosine) retrieval over chunks, fused with reciprocal-rank fusion.
// Pure functions: no I/O, so the ranking is unit-testable on real documentation.

const STOPWORDS = new Set(('a an and are as at be but by can could do does did for from has have how i if in into is it its me my of on or our so ' +
  'than that the their them then there these they this to us was we what when where which who why will with would you your please tell show explain about ' +
  'ocean help need want get use using used').split(' '))

/** The question's own content words (lower-cased, no stop words, not stemmed), in order. */
export function contentWords(question: string): string[] {
  return (question.toLowerCase().match(/[a-z0-9][a-z0-9'_.-]*[a-z0-9]|[a-z0-9]/g) ?? []).filter(w => !STOPWORDS.has(w) && w.length > 1)
}

export function stem(word: string): string {
  let w = word
  if (w.length > 5 && w.endsWith('ies')) return `${w.slice(0, -3)}y`
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3)
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2)
  else if (w.length > 4 && w.endsWith('es') && /(s|x|z|ch|sh)es$/.test(w)) w = w.slice(0, -2)
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1)
  return w
}

/** Lower-cased word tokens; identifiers like GEMINI_API_KEY also contribute their parts. */
export function tokenize(text: string): string[] {
  const out: string[] = []
  for (const raw of text.toLowerCase().match(/[a-z0-9][a-z0-9_.-]*[a-z0-9]|[a-z0-9]/g) ?? []) {
    const pieces = raw.split(/[_.-]+/).filter(Boolean)
    const whole = raw.replace(/[.-]+$/, '')
    if (pieces.length > 1 && whole.includes('_')) out.push(stem(whole))
    for (const p of pieces) if (!STOPWORDS.has(p) && (p.length > 1 || /\d/.test(p))) out.push(stem(p))
  }
  return out
}

/** Everyday phrasings mapped to the words the documentation actually uses (phrase -> extra search terms). */
const SYNONYMS: Array<[RegExp, string]> = [
  [/\b(log ?in|sign ?in|sso|authenticat\w*)\b/i, 'authentication login sign-in session'],
  [/\b(access control|access level|who can|permission\w*|rbac|role\w*)\b/i, 'rbac roles permissions access'],
  [/\b(notif\w*|alert\w*)\b/i, 'notification slack schedule'],
  [/\bn\/?a\b/i, 'unavailable unknown missing not available'],
  [/\b(missing|not showing|doesn'?t show|absent)\b/i, 'missing excluded filtered'],
  [/\b(env(ironment)? var\w*|\.env|config(uration)? (value|variable)s?)\b/i, 'environment variables configuration env'],
  [/\b(limitation\w*|known issue\w*|constraint\w*)\b/i, 'limitations known gaps risks'],
  [/\b(error|fail\w*|not working|broken)\b/i, 'troubleshooting error failed'],
  [/\b(calculat\w*|comput\w*|formula|derived?|determined?)\b/i, 'calculated computed formula'],
  // "ocean" is a stop word (people address it), so a question about what Ocean itself can read would lose its subject.
  // Only a capability question about Ocean brings it back, pointing at the Ocean capability section.
  [/\b(can|could|does|do|is|will)\b[^?]*\bocean\b[^?]*\b(read|see|sees|reads|access|source code|the code|codebase|files?)\b|\bocean\b[^?]*\b(source code|the codebase|read the code|access (to )?(the )?code)\b|\b(source code|the codebase)\b[^?]*\bocean\b/i, 'ocean assistant read source code documentation indexed capability'],
]

export function queryTerms(question: string): string[] {
  const extra = SYNONYMS.filter(([re]) => re.test(question)).map(([, add]) => add).join(' ')
  const base = tokenize(question)
  // Synonyms widen recall but must not outvote the user's own words, so they are appended after them.
  return [...new Set([...base, ...tokenize(extra)])]
}

/** Ordered consecutive word pairs of a question ("stale device", "device report"), used to reward exact phrases. */
export function queryBigrams(question: string): string[] {
  const toks = tokenize(question)
  const out: string[] = []
  for (let i = 0; i + 1 < toks.length; i++) if (toks[i] !== toks[i + 1]) out.push(`${toks[i]} ${toks[i + 1]}`)
  return [...new Set(out)]
}

/** Optimal-string-alignment distance (insert, delete, substitute, swap neighbours), abandoning early past `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev2: number[] = []
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let best = cur[0]!
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2]! + 1)
      cur[j] = v; if (v < best) best = v
    }
    if (best > max) return max + 1
    prev2 = prev; prev = cur
  }
  return prev[b.length]!
}

/**
 * Typo tolerance: a question word the documentation never uses ("notificaton") is replaced by the closest word it does use
 * (edit distance 1, or 2 for long words), preferring the more common one. Words with no close match stay as they are.
 */
export function correctTerm(term: string, vocabularies: Array<ReadonlyMap<string, number>>): string | null {
  if (term.length < 5 || /\d/.test(term)) return null
  const max = term.length >= 9 ? 2 : 1
  let best: { word: string; df: number; d: number } | null = null
  for (const vocab of vocabularies) {
    for (const [word, df] of vocab) {
      if (word[0] !== term[0] && term.length < 9) continue            // keep it cheap and precise: same first letter for shorter words
      const d = editDistance(term, word, max)
      if (d > max) continue
      if (!best || d < best.d || (d === best.d && df > best.df)) best = { word, df, d }
    }
  }
  return best ? best.word : null
}

export interface IndexedChunk { id: string; docId: string; docTitle: string; docPath: string; heading: string; text: string }
export interface Scored { chunk: IndexedChunk; score: number; coverage: number; /** Share of the question's total term weight (rarer words weigh more; words the docs never use weigh most) this section covers. */ weighted: number; matched: number }

interface Prepared { chunk: IndexedChunk; tf: Map<string, number>; len: number; bigrams: Set<string> }

export class Bm25Index {
  private readonly docs: Prepared[]
  private readonly df = new Map<string, number>()
  private readonly avgLen: number

  constructor(chunks: IndexedChunk[]) {
    this.docs = chunks.map(chunk => {
      // Headings and titles describe the section, so they count more than body text.
      const tokens = [...tokenize(chunk.text), ...tokenize(chunk.heading), ...tokenize(chunk.heading), ...tokenize(chunk.docTitle)]
      const tf = new Map<string, number>()
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1)
      const body = tokenize(chunk.text)
      const bigrams = new Set<string>()
      for (let i = 0; i + 1 < body.length; i++) bigrams.add(`${body[i]} ${body[i + 1]}`)
      return { chunk, tf, len: tokens.length, bigrams }
    })
    this.avgLen = this.docs.reduce((s, d) => s + d.len, 0) / Math.max(1, this.docs.length)
  }

  get size(): number { return this.docs.length }
  /** term -> number of sections containing it */
  vocabulary(): ReadonlyMap<string, number> { return this.df }
  allChunks(): IndexedChunk[] { return this.docs.map(d => d.chunk) }

  search(terms: string[], limit = 30, boost?: (chunk: IndexedChunk) => number, phrases: string[] = []): Scored[] {
    if (!terms.length || !this.docs.length) return []
    const N = this.docs.length
    const k1 = 1.4, b = 0.75
    const scored: Scored[] = []
    const idfOf = (t: string): number => { const n = this.df.get(t) ?? 0; return Math.log(1 + (N - n + 0.5) / (n + 0.5)) }
    const totalWeight = terms.reduce((sum, t) => sum + idfOf(t), 0) || 1
    for (const d of this.docs) {
      let score = 0, matched = 0, matchedWeight = 0
      for (const t of terms) {
        const f = d.tf.get(t)
        if (!f) continue
        matched++
        const idf = idfOf(t)
        matchedWeight += idf
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + b * (d.len / this.avgLen))))
      }
      if (!matched) continue
      let multiplier = boost ? boost(d.chunk) : 1
      if (phrases.length) { const hit = phrases.filter(p => d.bigrams.has(p)).length; if (hit) multiplier *= 1 + Math.min(hit, 3) * 0.12 }   // exact phrase
      scored.push({ chunk: d.chunk, score: score * multiplier, coverage: matched / terms.length, weighted: matchedWeight / totalWeight, matched })
    }
    return scored.sort((a, b2) => b2.score - a.score).slice(0, limit)
  }
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0, na = 0, nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) { dot += a[i]! * b[i]!; na += a[i]! * a[i]!; nb += b[i]! * b[i]! }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

export interface Ranked { chunk: IndexedChunk; score: number; coverage: number; weighted: number; matched: number; semantic: number | null }

/** Reciprocal-rank fusion of the keyword ranking and (when available) the semantic ranking. */
export function fuse(keyword: Scored[], semantic: Array<{ chunk: IndexedChunk; sim: number }>, limit: number): Ranked[] {
  const K = 60
  const merged = new Map<string, Ranked>()
  keyword.forEach((s, i) => merged.set(s.chunk.id, { chunk: s.chunk, score: 1 / (K + i + 1), coverage: s.coverage, weighted: s.weighted, matched: s.matched, semantic: null }))
  semantic.forEach((s, i) => {
    const prev = merged.get(s.chunk.id)
    const add = 1 / (K + i + 1)
    if (prev) { prev.score += add; prev.semantic = s.sim } else merged.set(s.chunk.id, { chunk: s.chunk, score: add, coverage: 0, weighted: 0, matched: 0, semantic: s.sim })
  })
  return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, limit)
}
