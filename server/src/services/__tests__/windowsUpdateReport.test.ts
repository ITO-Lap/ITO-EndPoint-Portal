import { describe, it, expect, vi } from 'vitest'

vi.mock('../endpointCentralPatch.js', () => ({ getPatchSystems: vi.fn(), getFleetCriticalPatches: vi.fn(), getFleetMissingOsPatches: vi.fn() }))
vi.mock('../reportExporter.js', () => ({ exportToExcel: vi.fn() }))
vi.mock('../slack.js', () => ({ uploadSlackFile: vi.fn() }))
vi.mock('../../store/integrationStore.js', () => ({ getSlackConfig: vi.fn() }))

import { classifyWindowsUpdate, buildWindowsUpdateRows, buildWindowsUpdateOverview, prioritize, topUpdatesToDeploy, compareSnapshots } from '../windowsUpdateReport.js'
import type { MissingPatch, PatchSystemStatus } from '../endpointCentralPatch.js'

const patch = (o: Partial<MissingPatch>): MissingPatch => ({ patchId: '1', name: 'p', description: '', severity: 'Important', category: 'OS update', vendor: 'Microsoft', updateType: null, kb: null, bulletinId: null, cves: [], releasedAt: '2026-10-01T00:00:00.000Z', rebootRequirement: null, approvalStatus: null, deploymentStatus: null, ...o })
const sys = (o: Partial<PatchSystemStatus>): PatchSystemStatus => ({ resourceId: 'r', detailResourceId: 'd', platform: 'Windows', osName: 'Windows 11 Enterprise Edition (x64)', names: ['PC-1'], missingOsPatches: 1, missingThirdPartyPatches: 0, missingDriverPatches: 0, missingBiosPatches: 0, criticalPatchCount: 0, importantPatchCount: 0, moderatePatchCount: 0, lowPatchCount: 0, lastScanTime: null, lastSuccessfulScanTime: null, scanSucceeded: true, ...o })

describe('classifyWindowsUpdate', () => {
  it('detects feature and security updates, skips the rest', () => {
    expect(classifyWindowsUpdate(patch({ updateType: 'Feature Packs' }))).toBe('Feature update')
    expect(classifyWindowsUpdate(patch({ name: 'Windows 11, version 25H2' }))).toBe('Feature update')
    expect(classifyWindowsUpdate(patch({ updateType: 'Security Updates' }))).toBe('Security update')
    expect(classifyWindowsUpdate(patch({ updateType: 'Non-Security Updates' }))).toBeNull()
    expect(classifyWindowsUpdate(patch({ updateType: 'Others', cves: ['CVE-2026-1234'] }))).toBe('Security update')
    expect(classifyWindowsUpdate(patch({ updateType: 'Non-Security Updates', cves: ['CVE-2026-1234'] }))).toBeNull()
  })
})

describe('buildWindowsUpdateRows', () => {
  const systems = [
    sys({ names: ['PC-1'], detailResourceId: 'a' }),
    sys({ names: ['SRV-1'], detailResourceId: 'b', osName: 'Windows Server 2022 Standard Edition (x64)' }),
    sys({ names: ['MAC-1'], detailResourceId: 'c', platform: 'Mac' }),
    sys({ names: ['BAD-1'], detailResourceId: 'd', scanSucceeded: false }),
  ]
  const missing = new Map([
    ['a', [patch({ updateType: 'Security Updates', description: 'KB5030000 fix' }), patch({ updateType: 'Feature Packs', name: 'Win 11 25H2' }), patch({ updateType: 'Non-Security Updates' })]],
    ['b', [patch({ updateType: 'Security Updates' })]], ['c', [patch({ updateType: 'Security Updates' })]], ['d', [patch({ updateType: 'Security Updates' })]],
  ])
  it('keeps only scanned Windows client devices, feature first', () => {
    const rows = buildWindowsUpdateRows(systems, missing, new Date('2026-11-01T00:00:00Z'))
    expect(rows.map(r => `${r.device}:${r.kind}`).sort()).toEqual(['PC-1:Feature update', 'PC-1:Security update'])
    expect(rows.find(r => r.kind === 'Security update')!.kb).toBe('')
    expect(rows.find(r => r.kind === 'Feature update')!.daysMissing).toBe(31)
    expect(rows[0]!.kind).toBe('Security update') // 31 days missing => P1 sorts first
    expect(rows[0]!.priority).toBe('P1 Urgent')
    const o = buildWindowsUpdateOverview(systems, rows, 1)
    expect(o.fields.find(f => f.label === 'Devices missing updates')?.value).toBe(1)
    expect(o.dataChecks?.[0]?.status).not.toBe('ok')
  })
})

describe('smart helpers', () => {
  it('prioritizes security updates by severity and age', () => {
    expect(prioritize('Security update', 'Critical', 1)).toBe('P1 Urgent')
    expect(prioritize('Security update', 'Moderate', 30)).toBe('P1 Urgent')
    expect(prioritize('Security update', 'Important', 2)).toBe('P2 High')
    expect(prioritize('Security update', 'Low', 14)).toBe('P2 High')
    expect(prioritize('Security update', 'Low', 3)).toBe('P3 Normal')
    expect(prioritize('Feature update', 'Critical', 90)).toBe('P3 Normal')
  })
  it('ranks updates by devices fixed', () => {
    const base = { priority: 'P3 Normal', action: '', operatingSystem: '', severity: '', cves: '', releasedAt: '', daysMissing: 1, rebootRequired: '', lastScan: '', kind: 'Security update', update: 'u' } as const
    const rows = [{ ...base, device: 'A', kb: 'KB1' }, { ...base, device: 'B', kb: 'KB1' }, { ...base, device: 'A', kb: 'KB2' }]
    expect(topUpdatesToDeploy(rows, 1)).toEqual([{ label: 'KB1', devices: 2, kind: 'Security update' }])
  })
  it('compares device sets between runs', () => {
    expect(compareSnapshots({ at: '2026-11-01T00:00:00Z', devices: ['A', 'B', 'C'] }, ['B', 'C', 'D'])).toEqual({ newDevices: 1, resolvedDevices: 1, stillMissing: 2, previousTotal: 3, previousAt: '2026-11-01T00:00:00Z' })
  })
})
