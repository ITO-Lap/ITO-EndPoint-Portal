import { describe, it, expect, vi, beforeEach } from 'vitest'

const getPostureResult = vi.fn()
const getPillarDeviceList = vi.fn()
const getPostureDiagnostics = vi.fn()
const getMissingPatches = vi.fn()
const isPatchApiConfigured = vi.fn(() => true)
const getCoverageSnapshot = vi.fn()

vi.mock('../../routes/securityPosture.js', () => ({
  getPostureResult: (...a: unknown[]) => getPostureResult(...a),
  getPillarDeviceList: (...a: unknown[]) => getPillarDeviceList(...a),
  getPostureDiagnostics: (...a: unknown[]) => getPostureDiagnostics(...a),
}))
vi.mock('../../routes/securityInventory.js', () => ({ getCoverageSnapshot: () => getCoverageSnapshot() }))
vi.mock('../endpointCentralPatch.js', () => ({
  getMissingPatches: (...a: unknown[]) => getMissingPatches(...a),
  isPatchApiConfigured: () => isPatchApiConfigured(),
  PatchApiError: class PatchApiError extends Error { constructor(public kind: string, m: string) { super(m) } },
}))

const { getToolByName, toolsAllowedForRole } = await import('../copilotTools.js')
const ctx = { actorEmail: 'a@b.c', actorRole: 'IT Admin' }
const run = (name: string, args: Record<string, unknown> = {}) => getToolByName(name)!.run(args, ctx)

beforeEach(() => { vi.clearAllMocks(); isPatchApiConfigured.mockReturnValue(true) })

describe('Security Posture assistant tools', () => {
  it('are registered as read tools for every role that can read, and none are writes', () => {
    for (const n of ['get_security_posture', 'list_posture_devices', 'get_device_missing_patches', 'get_posture_diagnostics']) {
      expect(getToolByName(n)?.rbac).toBe('read')
      expect(toolsAllowedForRole('Helpdesk').map(t => t.name)).toContain(n)
      expect(toolsAllowedForRole('End User').map(t => t.name)).not.toContain(n)
    }
  })

  it('get_security_posture returns score, grade, pillars and data health', async () => {
    getPostureResult.mockResolvedValue({
      generatedAt: '2026-11-19T10:00:00Z', source: 'all', deviceCount: 10, overall: { score: 84, assessedPillars: 4, totalPillars: 4 },
      pillars: [{ id: 'encryption', label: 'Disk Encryption', weight: 0.35, scorePct: 90, inScope: 8, passing: 7, failing: 1, notReported: 0, byPlatform: [], topFindings: [] }],
      coverage: { windows: { devices: 5, withAgent: 4 }, macos: { devices: 2, withAgent: 2 } },
      enrichment: { patchLoaded: true, agentRowsLoaded: 4, mdmDetailsStale: 0, mdmDetailsUnread: 0 },
    })
    const { result } = await run('get_security_posture')
    expect(getPostureResult).toHaveBeenCalledWith('all')
    expect(result).toMatchObject({ overall: { score: 84, grade: 'B' }, agentCoverage: { windows: { withAgent: 4 } }, dataHealth: { patchLoaded: true } })
    await expect(run('get_security_posture', { source: 'bogus' })).rejects.toThrow(/source must be/)
  })

  it('list_posture_devices defaults to failing devices, caps the page and exposes the patch resource id', async () => {
    getPillarDeviceList.mockResolvedValue({ total: 1, rows: [{ id: 'd1', deviceName: 'WIN-1', user: 'u', platform: 'Windows', source: 'Microsoft Intune', serialNumber: 'S', status: 'fail', detail: '6 critical, 10 important patches missing', facts: [{ label: 'Verdict based on', value: 'Endpoint Central Patch Manager' }], patchResourceId: 'R1' }] })
    const { result } = await run('list_posture_devices', { pillar: 'patching', limit: 999 })
    expect(getPillarDeviceList).toHaveBeenCalledWith(expect.objectContaining({ pillarId: 'patching', status: 'fail', pageSize: 50 }))
    expect(result).toMatchObject({ total: 1, devices: [{ deviceName: 'WIN-1', patchResourceId: 'R1', verdictBasedOn: 'Endpoint Central Patch Manager' }] })
    await expect(run('list_posture_devices', { pillar: 'nope' })).rejects.toThrow(/pillar must be/)
  })

  it('get_device_missing_patches groups by severity, and explains throttling or a missing scope plainly', async () => {
    getMissingPatches.mockResolvedValue({ fetchedAt: '2026-11-19T10:00:00Z', patches: [
      { severity: 'Critical', kb: 'KB1', description: 'Fix one', name: 'n', category: 'OS update', releasedAt: null },
      { severity: 'Low', kb: 'KB2', description: 'Fix two', name: 'n', category: 'Application update', releasedAt: null },
    ] })
    const { result } = await run('get_device_missing_patches', { patchResourceId: 'R1' })
    expect(result).toMatchObject({ total: 2, counts: { Critical: 1, Low: 1 } })
    getMissingPatches.mockRejectedValue(new Error('Patch API 429'))
    await expect(run('get_device_missing_patches', { patchResourceId: 'R1' })).rejects.toThrow(/rate-limited/)
    await expect(run('get_device_missing_patches', {})).rejects.toThrow(/patchResourceId is required/)
    isPatchApiConfigured.mockReturnValue(false)
    await expect(run('get_device_missing_patches', { patchResourceId: 'R1' })).rejects.toThrow(/not configured/)
  })

  it('get_posture_diagnostics returns counts only, never device names', async () => {
    getPostureDiagnostics.mockResolvedValue({ diag: { windows: 4, samples: { ambiguous: [{ name: 'SECRET-HOST' }] } }, mdmDetailReads: { requested: 10, failed: 0 } })
    const { result } = await run('get_posture_diagnostics')
    expect(JSON.stringify(result)).not.toContain('SECRET-HOST')
    expect(result).toMatchObject({ windows: 4, mdmDetailReads: { requested: 10 } })
  })

  it('get_endpoint_protection_coverage returns scan progress instead of waiting on the first scan', async () => {
    getCoverageSnapshot.mockReturnValue({ state: 'scanning', progress: { done: 10, total: 100, startedAt: 'x' } })
    const { result } = await run('get_endpoint_protection_coverage')
    expect(result).toMatchObject({ scanning: true, progress: { done: 10, total: 100 } })
    getCoverageSnapshot.mockReturnValue({ state: 'stale', result: { windows: { a: 1 }, macos: { b: 2 }, scanTime: 't', scanDurationMs: 1, stale: true } })
    expect((await run('get_endpoint_protection_coverage')).result).toMatchObject({ stale: true, windows: { a: 1 } })
  })
})
