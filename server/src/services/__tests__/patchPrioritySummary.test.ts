import { describe, it, expect, vi } from 'vitest'
import type { PatchSystemStatus, MissingPatch } from '../endpointCentralPatch.js'

vi.mock('../endpointCentralPatch.js', () => ({
  getPatchSystems: vi.fn(),
  getFleetCriticalPatches: vi.fn(),
}))

import { getPatchSystems, getFleetCriticalPatches } from '../endpointCentralPatch.js'
import { getPatchPrioritySummary } from '../patchPrioritySummary.js'

function makeSystem(overrides: Partial<PatchSystemStatus> = {}): PatchSystemStatus {
  return {
    resourceId: 'r1', detailResourceId: 'd1', platform: 'Windows', osName: 'Windows 11 Enterprise Edition (x64)',
    names: ['WIN-1'], missingOsPatches: 0, missingThirdPartyPatches: 0, missingDriverPatches: 0, missingBiosPatches: 0,
    criticalPatchCount: 0, importantPatchCount: 0, moderatePatchCount: 0, lowPatchCount: 0,
    lastScanTime: null, lastSuccessfulScanTime: null, scanSucceeded: true,
    ...overrides,
  }
}

function makePatch(overrides: Partial<MissingPatch> = {}): MissingPatch {
  return {
    patchId: 'p1', name: 'Security Update', description: 'Security Update KB5039211', severity: 'Critical', category: 'Security',
    vendor: 'Microsoft', updateType: 'Security', kb: 'KB5039211', bulletinId: null, cves: [], releasedAt: null, rebootRequirement: null,
    ...overrides,
  } as MissingPatch
}

describe('getPatchPrioritySummary', () => {
  it('sums severity counts per platform, excluding Windows servers', async () => {
    vi.mocked(getPatchSystems).mockResolvedValue([
      makeSystem({ detailResourceId: 'w1', platform: 'Windows', criticalPatchCount: 3, importantPatchCount: 2, moderatePatchCount: 1, lowPatchCount: 1 }),
      makeSystem({ detailResourceId: 'w2', platform: 'Windows', osName: 'Windows Server 2022 Standard Edition (x64)', criticalPatchCount: 99 }), // server — excluded
      makeSystem({ detailResourceId: 'm1', platform: 'Mac', osName: 'macOS 15', criticalPatchCount: 1, importantPatchCount: 1 }),
    ])
    vi.mocked(getFleetCriticalPatches).mockResolvedValue(new Map())

    const summary = await getPatchPrioritySummary()
    expect(summary.windows).toEqual({ critical: 3, high: 2, other: 2 })
    expect(summary.macos).toEqual({ critical: 1, high: 1, other: 0 })
  })

  it('groups top missing patches by KB, counting distinct devices, sorted by device count desc', async () => {
    vi.mocked(getPatchSystems).mockResolvedValue([
      makeSystem({ detailResourceId: 'w1', platform: 'Windows', criticalPatchCount: 1 }),
      makeSystem({ detailResourceId: 'w2', platform: 'Windows', criticalPatchCount: 1 }),
      makeSystem({ detailResourceId: 'w3', platform: 'Windows', criticalPatchCount: 1 }),
    ])
    vi.mocked(getFleetCriticalPatches).mockResolvedValue(new Map([
      ['w1', [makePatch({ kb: 'KB-A' }), makePatch({ kb: 'KB-B', description: 'Less common' })]],
      ['w2', [makePatch({ kb: 'KB-A' })]],
      ['w3', [makePatch({ kb: 'KB-A' })]],
    ]))

    const summary = await getPatchPrioritySummary()
    expect(summary.topPatches.windows[0]).toMatchObject({ kb: 'KB-A', deviceCount: 3 })
    expect(summary.topPatches.windows[1]).toMatchObject({ kb: 'KB-B', deviceCount: 1 })
  })

  it('caps the top patches list at 3 per platform', async () => {
    vi.mocked(getPatchSystems).mockResolvedValue([makeSystem({ detailResourceId: 'w1', platform: 'Windows', criticalPatchCount: 1 })])
    vi.mocked(getFleetCriticalPatches).mockResolvedValue(new Map([
      ['w1', [1, 2, 3, 4, 5].map(i => makePatch({ kb: `KB-${i}`, patchId: `p${i}` }))],
    ]))

    const summary = await getPatchPrioritySummary()
    expect(summary.topPatches.windows).toHaveLength(3)
  })

  it('returns zeroed macOS data when there are no Mac systems', async () => {
    vi.mocked(getPatchSystems).mockResolvedValue([makeSystem({ platform: 'Windows' })])
    vi.mocked(getFleetCriticalPatches).mockResolvedValue(new Map())

    const summary = await getPatchPrioritySummary()
    expect(summary.macos).toEqual({ critical: 0, high: 0, other: 0 })
    expect(summary.topPatches.macos).toEqual([])
  })
})
