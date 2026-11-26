import { describe, it, expect } from 'vitest'
import { readDetailsResilient, statusOf, retryAfterOf } from '../mdmDetailReader.js'

const err = (status: number, extra: Record<string, unknown> = {}) => Object.assign(new Error(`ManageEngine API ${status} on x`), { status, ...extra })
const noSleep = async () => {}

describe('readDetailsResilient', () => {
  it('reads everything on the first try when nothing fails', async () => {
    const { results, stats } = await readDetailsResilient(['a', 'b'], async id => id.toUpperCase(), { concurrency: 4, sleep: noSleep })
    expect([...results.entries()]).toEqual([['a', 'A'], ['b', 'B']])
    expect(stats).toMatchObject({ requested: 2, firstTry: 2, recovered: 0, failed: 0 })
  })

  it('retries throttling (429) and recovers the device instead of dropping it', async () => {
    const calls: Record<string, number> = {}
    const get = async (id: string) => { calls[id] = (calls[id] ?? 0) + 1; if (id === 'b' && calls[id]! < 3) throw err(429); return id }
    const { results, stats } = await readDetailsResilient(['a', 'b'], get, { concurrency: 2, sleep: noSleep })
    expect(results.get('b')).toBe('b')
    expect(stats).toMatchObject({ firstTry: 1, recovered: 1, failed: 0, reasons: { '429': 2 } })
  })

  it('narrows the pool on 429 and honours Retry-After', async () => {
    const sleeps: number[] = []
    let first = true
    const get = async (id: string) => { if (first) { first = false; throw err(429, { retryAfterMs: 4000 }) } return id }
    const { stats } = await readDetailsResilient(['a', 'b', 'c', 'd'], get, { concurrency: 8, minConcurrency: 2, sleep: async ms => { sleeps.push(ms) } })
    expect(stats.failed).toBe(0)
    expect(stats.endConcurrency).toBeLessThan(8)          // halved by the throttle
    expect(sleeps.some(ms => ms >= 3000)).toBe(true)      // waited for the server-requested pause
  })

  it('widens the pool again after sustained success', async () => {
    let calls = 0
    const get = async (id: string) => { if (++calls === 1) throw err(429); return id }
    const ids = Array.from({ length: 60 }, (_, i) => `d${i}`)
    const { stats } = await readDetailsResilient(ids, get, { concurrency: 8, sleep: noSleep })
    expect(stats.failed).toBe(0)
    expect(stats.endConcurrency).toBeGreaterThan(4)
  })

  it('does not retry permanent failures (404) and reports them with their reason', async () => {
    let calls = 0
    const { results, stats } = await readDetailsResilient(['a'], async () => { calls++; throw err(404) }, { concurrency: 1, sleep: noSleep })
    expect(calls).toBe(1)
    expect(results.get('a')).toBeNull()
    expect(stats).toMatchObject({ failed: 1, reasons: { '404': 1 } })
  })

  it('a later round rescues devices once the rate limit clears', async () => {
    let cleared = false
    const sleep = async (ms: number) => { if (ms >= 3000) cleared = true }
    const get = async (id: string) => { if (!cleared) throw err(503); return id }
    const { results, stats } = await readDetailsResilient(['a', 'b'], get, { concurrency: 2, attempts: 2, sleep })
    expect(results.get('a')).toBe('a')
    expect(stats).toMatchObject({ failed: 0, recovered: 2 })
  })

  it('stops within its time budget and reports the rest as unreadable', async () => {
    const { results, stats } = await readDetailsResilient(['a', 'b', 'c'], async () => { throw err(429) }, { concurrency: 1, budgetMs: 0, sleep: noSleep })
    expect(stats.failed).toBe(3)
    expect([...results.values()].every(v => v === null)).toBe(true)
  })

  it('statusOf / retryAfterOf read the error fields', () => {
    expect(statusOf(err(429))).toBe(429)
    expect(statusOf(new Error('ManageEngine API 503 on mdm/devices/1'))).toBe(503)
    expect(statusOf(new Error('socket hang up'))).toBeNull()
    expect(retryAfterOf(err(429, { retryAfterMs: 2000 }))).toBe(2000)
    expect(retryAfterOf(err(429))).toBeNull()
  })
})
