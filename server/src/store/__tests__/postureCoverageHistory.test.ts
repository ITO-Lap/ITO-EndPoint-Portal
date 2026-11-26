import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadCoverageHistory, recordCoverage } from '../postureCoverageHistory.js'

const dirs: string[] = []
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'cov-')); dirs.push(d); return join(d, 'h.json') }
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }) })
const e = (date: string, wa: number, ma: number) => ({ date, windows: { devices: 100, withAgent: wa }, macos: { devices: 10, withAgent: ma } })

describe('postureCoverageHistory', () => {
  it('keeps one entry per day (latest wins), sorted by date', () => {
    const f = tmp()
    recordCoverage(e('2026-11-19', 80, 9), f)
    recordCoverage(e('2026-11-18', 70, 8), f)
    const h = recordCoverage(e('2026-11-19', 85, 10), f)
    expect(h.map(x => [x.date, x.windows.withAgent])).toEqual([['2026-11-18', 70], ['2026-11-19', 85]])
    expect(loadCoverageHistory(f)).toEqual(h)
  })
  it('never records an empty reading as 0%', () => {
    const f = tmp()
    recordCoverage(e('2026-11-18', 70, 8), f)
    const h = recordCoverage({ date: '2026-11-19', windows: { devices: 0, withAgent: 0 }, macos: { devices: 0, withAgent: 0 } }, f)
    expect(h).toHaveLength(1)
  })
})
