import { describe, expect, it } from 'vitest'
import { scoreEndpoint } from '../patchOperations.js'

describe('scoreEndpoint', () => {
  it('makes missing critical patches and stale scans explainable in the health score', () => {
    const result = scoreEndpoint({
      resourceId: '1', detailResourceId: '11', platform: 'Windows', names: ['PC-01'],
      missingOsPatches: 3, missingThirdPartyPatches: 0, missingDriverPatches: 0, missingBiosPatches: 0,
      criticalPatchCount: 2, importantPatchCount: 1, moderatePatchCount: 0, lowPatchCount: 0,
      lastScanTime: null, lastSuccessfulScanTime: new Date(Date.now() - 15 * 86_400_000).toISOString(), scanSucceeded: true,
    })
    expect(result.level).toBe('critical')
    expect(result.score).toBeLessThan(45)
    expect(result.factors.map(f => f.label)).toEqual(expect.arrayContaining([
      '2 critical patches missing', '1 important patch missing', 'Patch scan is 15 days old',
    ]))
  })

  it('keeps a recently scanned endpoint with no missing patches healthy', () => {
    const result = scoreEndpoint({
      resourceId: '2', detailResourceId: '22', platform: 'Mac', names: ['Mac-01'],
      missingOsPatches: 0, missingThirdPartyPatches: 0, missingDriverPatches: 0, missingBiosPatches: 0,
      criticalPatchCount: 0, importantPatchCount: 0, moderatePatchCount: 0, lowPatchCount: 0,
      lastScanTime: null, lastSuccessfulScanTime: new Date().toISOString(), scanSucceeded: true,
    })
    expect(result).toMatchObject({ score: 100, level: 'healthy', factors: [] })
  })
})
