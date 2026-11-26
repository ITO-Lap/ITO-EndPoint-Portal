// Local "semantic" search: latent semantic analysis (truncated SVD of the TF-IDF matrix) computed on the server from
// the indexed documentation itself. No external API, no model download, nothing leaves the network. Words that appear
// in the same kinds of sections end up close together, so "sign in problems" can reach a section about "login failure".
//
// Pure and deterministic (seeded), so it is unit-testable and rebuilds identically.

import { tokenize, type IndexedChunk } from './search.js'

const MIN_DF = 2

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-12), v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export class LsaModel {
  private constructor(
    private readonly termIndex: Map<string, number>,
    private readonly idf: Float64Array,
    private readonly basis: Float64Array[],        // k vectors of length = vocabulary size (orthonormal)
    private readonly chunkIds: string[],
    private readonly chunkVectors: Float64Array[], // unit vectors in the latent space
  ) {}

  get dims(): number { return this.basis.length }
  get vocabularySize(): number { return this.termIndex.size }

  /** null when the corpus is too small for a meaningful latent space. */
  static build(chunks: IndexedChunk[], dims = 48, seed = 20260101): LsaModel | null {
    const n = chunks.length
    if (n < 8) return null

    const tfs = chunks.map(c => {
      const tf = new Map<string, number>()
      for (const t of [...tokenize(c.text), ...tokenize(c.heading), ...tokenize(c.docTitle)]) tf.set(t, (tf.get(t) ?? 0) + 1)
      return tf
    })
    const df = new Map<string, number>()
    for (const tf of tfs) for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1)
    const termIndex = new Map<string, number>()
    for (const [t, d] of df) if (d >= MIN_DF) termIndex.set(t, termIndex.size)
    const m = termIndex.size
    const k = Math.min(dims, Math.max(2, Math.floor(Math.min(n, m) / 2)))
    if (m < 8) return null

    const idf = new Float64Array(m)
    for (const [t, i] of termIndex) idf[i] = Math.log(1 + n / (df.get(t) ?? 1))

    // Sparse, row-normalised TF-IDF matrix A (n x m).
    const rowIdx: Int32Array[] = [], rowVal: Float64Array[] = []
    for (const tf of tfs) {
      const idx: number[] = [], val: number[] = []
      for (const [t, f] of tf) { const i = termIndex.get(t); if (i !== undefined) { idx.push(i); val.push((1 + Math.log(f)) * idf[i]!) } }
      const norm = Math.sqrt(val.reduce((s, x) => s + x * x, 0)) || 1
      rowIdx.push(Int32Array.from(idx)); rowVal.push(Float64Array.from(val.map(x => x / norm)))
    }

    const rand = mulberry32(seed)
    let Q: Float64Array[] = Array.from({ length: k }, () => Float64Array.from({ length: m }, () => gaussian(rand)))
    const times = (Qs: Float64Array[]): Float64Array[] => Qs.map(q => {            // A * q  -> length n
      const out = new Float64Array(n)
      for (let r = 0; r < n; r++) { let s = 0; const ix = rowIdx[r]!, vl = rowVal[r]!; for (let j = 0; j < ix.length; j++) s += vl[j]! * q[ix[j]!]!; out[r] = s }
      return out
    })
    const timesT = (Ys: Float64Array[]): Float64Array[] => Ys.map(y => {           // A^T * y -> length m
      const out = new Float64Array(m)
      for (let r = 0; r < n; r++) { const yr = y[r]!; if (!yr) continue; const ix = rowIdx[r]!, vl = rowVal[r]!; for (let j = 0; j < ix.length; j++) out[ix[j]!] = out[ix[j]!]! + vl[j]! * yr }
      return out
    })
    const orthonormalise = (vs: Float64Array[]): Float64Array[] => {
      const out: Float64Array[] = []
      for (const v of vs) {
        const w = Float64Array.from(v)
        for (const u of out) { let d = 0; for (let i = 0; i < m; i++) d += w[i]! * u[i]!; for (let i = 0; i < m; i++) w[i] = w[i]! - d * u[i]! }
        let norm = 0; for (let i = 0; i < m; i++) norm += w[i]! * w[i]!
        norm = Math.sqrt(norm)
        if (norm > 1e-10) { for (let i = 0; i < m; i++) w[i] = w[i]! / norm; out.push(w) }
      }
      return out
    }

    Q = orthonormalise(Q)
    for (let it = 0; it < 5; it++) Q = orthonormalise(timesT(times(Q)))   // subspace (power) iteration on A^T A

    const projected = times(Q)                                            // chunk coordinates (k vectors of length n)
    const chunkVectors = chunks.map((_, r) => {
      const v = new Float64Array(Q.length)
      let norm = 0
      for (let j = 0; j < Q.length; j++) { v[j] = projected[j]![r]!; norm += v[j]! * v[j]! }
      norm = Math.sqrt(norm) || 1
      for (let j = 0; j < Q.length; j++) v[j] = v[j]! / norm
      return v
    })
    return new LsaModel(termIndex, idf, Q, chunks.map(c => c.id), chunkVectors)
  }

  /** Cosine similarity of the question's terms to every chunk, in the latent space. */
  similarities(terms: string[]): Map<string, number> {
    const q = new Float64Array(this.basis.length)
    let used = 0
    for (const t of terms) {
      const i = this.termIndex.get(t)
      if (i === undefined) continue
      used++
      for (let j = 0; j < q.length; j++) q[j] = q[j]! + this.idf[i]! * this.basis[j]![i]!
    }
    const out = new Map<string, number>()
    if (!used) return out
    let norm = 0; for (let j = 0; j < q.length; j++) norm += q[j]! * q[j]!
    norm = Math.sqrt(norm)
    if (!norm) return out
    for (let r = 0; r < this.chunkIds.length; r++) {
      const v = this.chunkVectors[r]!
      let dot = 0; for (let j = 0; j < q.length; j++) dot += q[j]! * v[j]!
      out.set(this.chunkIds[r]!, dot / norm)
    }
    return out
  }
}
