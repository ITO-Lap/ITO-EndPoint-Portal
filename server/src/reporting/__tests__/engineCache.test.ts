import { describe, it, expect, beforeEach, vi } from 'vitest'
import { runReport, invalidateReportCache, type ReportDef, type ReportContext } from '../engine.js'

const runner = vi.fn()
const def: ReportDef = {
  id: 'test-report', name: 'T', category: 'inventory', description: '', sources: [], cacheTtlSec: 600,
  columns: [{ key: 'n', label: 'N' }] as ReportDef['columns'],
  run: (ctx, params) => { runner(params); return { rows: Array.from({ length: 10 }, (_, i) => ({ n: i + 1 })) } },
}
const ctx = { devices: [], isMock: false } as ReportContext
const ns = (r: ReturnType<typeof runReport>) => r.rows.map(x => x['n'])

beforeEach(() => { runner.mockClear(); invalidateReportCache() })

describe('report cache is per request, not per report', () => {
  it('returns different rows for page 2 and for a different sort, instead of the first answer', () => {
    expect(ns(runReport(def, ctx, { limit: 3, offset: 0, sortBy: 'n', sortDir: 'asc' }))).toEqual([1, 2, 3])
    expect(ns(runReport(def, ctx, { limit: 3, offset: 3, sortBy: 'n', sortDir: 'asc' }))).toEqual([4, 5, 6])
    expect(ns(runReport(def, ctx, { limit: 3, offset: 0, sortBy: 'n', sortDir: 'desc' }))).toEqual([10, 9, 8])
  })

  it('still serves an identical repeat request from the cache, whatever the parameter order', () => {
    runReport(def, ctx, { limit: 3, offset: 3, sortBy: 'n' })
    const again = runReport(def, ctx, { sortBy: 'n', offset: 3, limit: 3 })
    expect(again.cached).toBe(true)
    expect(runner).toHaveBeenCalledTimes(1)
  })

  it('treats a different filter parameter as a different request', () => {
    runReport(def, ctx, { limit: 3, ...{ platform: 'Windows' } } as never)
    const other = runReport(def, ctx, { limit: 3, ...{ platform: 'macOS' } } as never)
    expect(other.cached).toBe(false)
    expect(runner).toHaveBeenCalledTimes(2)
  })

  it('invalidating a report clears every cached variant of it, and only it', () => {
    runReport(def, ctx, { offset: 0 }); runReport(def, ctx, { offset: 3 })
    const other: ReportDef = { ...def, id: 'other-report' }
    runReport(other, ctx, {})
    invalidateReportCache('test-report')
    expect(runReport(def, ctx, { offset: 0 }).cached).toBe(false)
    expect(runReport(def, ctx, { offset: 3 }).cached).toBe(false)
    expect(runReport(other, ctx, {}).cached).toBe(true)
  })

  it('stays bounded when many different requests are made', () => {
    for (let i = 0; i < 300; i++) runReport(def, ctx, { offset: i })
    runner.mockClear()
    runReport(def, ctx, { offset: 299 }) // newest is still cached
    expect(runner).not.toHaveBeenCalled()
    runReport(def, ctx, { offset: 0 })   // oldest was evicted
    expect(runner).toHaveBeenCalledTimes(1)
  })
})
