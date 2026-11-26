import { describe, it, expect } from 'vitest'
import { planDetailReads, saveDetailCache, loadDetailCache } from '../mdmDetailCache.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const NOW = 1_000_000_000_000
const H = 3_600_000

describe('planDetailReads', () => {
  const cache = { fresh1: { readAt: NOW - 1 * H, detail: 'F1' }, old1: { readAt: NOW - 20 * H, detail: 'O1' }, old2: { readAt: NOW - 10 * H, detail: 'O2' } }
  it('skips devices with fresh details and reads the rest oldest first, never-read first of all', () => {
    const plan = planDetailReads(['fresh1', 'old2', 'never', 'old1'], cache, NOW, 6 * H)
    expect([...plan.fresh.keys()]).toEqual(['fresh1'])
    expect(plan.toRead).toEqual(['never', 'old1', 'old2'])
  })
  it('reads nothing when everything is fresh', () => {
    expect(planDetailReads(['fresh1'], cache, NOW, 6 * H).toRead).toEqual([])
  })
})

describe('saveDetailCache', () => {
  it('drops devices that no longer exist and entries older than 30 days', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mdc-'))
    const f = join(dir, 'c.json')
    try {
      saveDetailCache({ keep: { readAt: NOW, detail: 1 }, gone: { readAt: NOW, detail: 2 }, ancient: { readAt: NOW - 31 * 24 * H, detail: 3 } }, new Set(['keep', 'ancient']), NOW, f)
      expect(Object.keys(loadDetailCache(f))).toEqual(['keep'])
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
