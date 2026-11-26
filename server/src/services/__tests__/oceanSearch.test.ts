import { describe, it, expect } from 'vitest'
import { LsaModel } from '../ocean/lsa.js'
import { Bm25Index, correctTerm, queryBigrams, queryTerms, tokenize, type IndexedChunk } from '../ocean/search.js'

const chunk = (id: string, heading: string, text: string): IndexedChunk => ({ id, docId: id, docTitle: heading, docPath: `docs/${id}.md`, heading, text })

// Two clear topics so a latent space has something to learn: signing in vs report scheduling.
const login = [
  'Users sign in with their Microsoft account. The login flow redirects to Entra ID and returns a session token.',
  'If sign in fails check the session token, the Entra ID app registration and the allowed email list for login.',
  'Login problems usually come from an expired session or a missing Entra ID redirect URI for the sign in callback.',
  'The authentication session lasts eight hours; after that the user must sign in again through Entra ID.',
]
const reports = [
  'Scheduled reports run weekly at a chosen time and are delivered to a Slack channel or by email as an Excel file.',
  'To create a recurring report choose the report type, the cron schedule and the delivery channel for the report.',
  'The report scheduler checks every minute which scheduled reports are due and sends the Excel file to Slack.',
  'Report delivery failures are shown in the schedule row; check the Slack channel id and the email recipients.',
]
const corpus = [...login.map((t, i) => chunk(`l${i}`, 'Authentication', t)), ...reports.map((t, i) => chunk(`r${i}`, 'Scheduled reports', t))]

describe('local latent-semantic model', () => {
  const model = LsaModel.build(corpus, 6)!
  it('builds for a real corpus and refuses a tiny one', () => {
    expect(model).not.toBeNull()
    expect(model.dims).toBeGreaterThan(1)
    expect(LsaModel.build(corpus.slice(0, 3))).toBeNull()
  })
  it('ranks sections of the right topic above the other topic, even for words it has not matched directly', () => {
    const sims = model.similarities(queryTerms('session expired sign in'))
    const best = (prefix: string) => Math.max(...[...sims].filter(([id]) => id.startsWith(prefix)).map(([, v]) => v))
    expect(best('l')).toBeGreaterThan(best('r'))
    const sims2 = model.similarities(queryTerms('recurring excel delivery'))
    const best2 = (prefix: string) => Math.max(...[...sims2].filter(([id]) => id.startsWith(prefix)).map(([, v]) => v))
    expect(best2('r')).toBeGreaterThan(best2('l'))
  })
  it('is deterministic and ignores unknown words', () => {
    const again = LsaModel.build(corpus, 6)!
    expect([...again.similarities(['login'])]).toEqual([...model.similarities(['login'])])
    expect(model.similarities(['zzzunknownzzz']).size).toBe(0)
  })
})

describe('typo tolerance and phrases', () => {
  const index = new Bm25Index(corpus)
  const vocab = [index.vocabulary()]
  it('maps a misspelling to the closest word the documentation uses', () => {
    expect(correctTerm('authentcation', vocab)).toBe('authentication')
    expect(correctTerm('notificaton', [new Map([['notification', 5], ['verification', 2]])])).toBe('notification')
    expect(correctTerm('schedual', vocab)).toMatch(/^schedul/)
    expect(correctTerm('stael', [new Map([['stale', 3], ['steel', 1]])])).toBe('stale')   // swapped letters count as one typo
  })
  it('leaves unrelated or short or numeric words alone', () => {
    expect(correctTerm('netflix', vocab)).toBeNull()
    expect(correctTerm('slak', vocab)).toBeNull()
    expect(correctTerm('abc12345', vocab)).toBeNull()
  })
  it('rewards an exact phrase over the same words scattered', () => {
    const a = chunk('a', 'A', 'The stale device report lists every device that has not checked in for thirty days.')
    const b = chunk('b', 'B', 'Every device is checked nightly; a report is produced and anything stale is marked.')
    const idx = new Bm25Index([a, b])
    const terms = queryTerms('stale device report')
    const plain = idx.search(terms).find(r => r.chunk.id === 'a')!.score
    const phrased = idx.search(terms, 30, undefined, queryBigrams('stale device report')).find(r => r.chunk.id === 'a')!.score
    expect(phrased).toBeGreaterThan(plain)
    expect(tokenize('stale device report')).toEqual(['stale', 'device', 'report'])
  })
})

describe('questions about what Ocean itself can read', () => {
  it('keep their subject, so the Ocean capability section can be found', () => {
    for (const q of ['Can Ocean read the source code?', 'Does Ocean have access to the code?', 'Is the source code visible to Ocean?']) {
      expect(queryTerms(q), q).toEqual(expect.arrayContaining(['assistant', 'documentation', 'capability']))
    }
  })
  it('do not add that noise when Ocean is merely being addressed', () => {
    for (const q of ['Ocean, how do I fix a stale device?', 'Ocean can you explain the patch scan', 'what is the stale device rule']) {
      expect(queryTerms(q), q).not.toContain('capability')
    }
  })
})
