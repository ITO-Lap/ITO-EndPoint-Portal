import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../store/integrationStore.js', () => ({ getManageEngineConfig: vi.fn(() => ({ clientId: 'c', clientSecret: 's', refreshToken: 'r', apiDomain: 'https://mdm.example' })) }))
vi.mock('../manageEngine.js', () => ({ getAccessToken: vi.fn(async () => 'SECRET-ACCESS-TOKEN') }))

import {
  buildMissingPatchQuery, normalizeMissingPatches, getMissingPatches, clearMissingPatchCache,
  categorize, mapSystem, PatchApiError,
} from '../endpointCentralPatch.js'

// Shape verified against a real tenant response (patch fields trimmed).
const fixture = {
  metadata: { totalPages: 1 },
  response_code: 200,
  message_response: {
    systemreport: [{
      resource_id: '116819000011966437',
      patches: [
        { severity: 'Moderate', patchname: 'Zoom.pkg', update_type: 'Third Party Updates', patch_id: '616735', patch_description: 'Zoom IT 7.2.2', vendor_name: 'Zoom', patch_released_time: '1790579839051', bulletinid: 'MAC-151', reboot_required: 'not required', patch_status: 'Missing', patch_approval_status: 'unapproved', deployment_status: '--' },
        { severity: 'Critical', patchname: 'InstallMacOSMinorUpdate-27.0.1.zip', update_type: 'Security Updates', patch_id: '616758', patch_description: 'macOS 27.0.1 (KB1234567) (CVE-2026-1111) (CVE-2026-1111) (CVE-2026-2222)', vendor_name: 'Apple', patch_released_time: '1790666616000', bulletinid: 'MAC-487', reboot_required: 'autoreboot', patch_status: 'Missing', patch_approval_status: 'approved', deployment_status: 'Failed' },
        { severity: 'Critical', patchname: 'Older.zip', update_type: 'Security Updates', patch_id: '1', patch_description: 'old', vendor_name: 'Apple', patch_released_time: '1700000000000', bulletinid: '--', reboot_required: '--', patch_status: 'Missing', patch_approval_status: 'unapproved', deployment_status: '--' },
        { severity: 'Low', patchname: 'Installed.pkg', update_type: 'Third Party Updates', patch_id: '2', patch_status: 'Installed' },
      ],
    }],
  },
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('buildMissingPatchQuery', () => {
  it('builds the verified Critical query', () => {
    const q = buildMissingPatchQuery('116819000011966437', 'critical')
    expect(Object.fromEntries(q)).toEqual({
      resource_id: '116819000011966437', patch_status: 'Missing',
      page: '1', pageLimit: '100', severity: 'Critical',
    })
  })
  it.each(['all', 'os', 'app'] as const)('omits severity for %s and does not send customerid', view => {
    const q = buildMissingPatchQuery('1234567', view, 2)
    expect(q.has('severity')).toBe(false)
    expect(q.has('customerid')).toBe(false)
    expect(q.get('patch_status')).toBe('Missing')
    expect(q.get('page')).toBe('2')
  })
})

describe('normalizeMissingPatches', () => {
  const rows = normalizeMissingPatches(fixture)
  it('keeps only missing patches', () => expect(rows.map(r => r.name)).not.toContain('Installed.pkg'))
  it('sorts by severity then newest release', () => {
    expect(rows.map(r => r.name)).toEqual(['InstallMacOSMinorUpdate-27.0.1.zip', 'Older.zip', 'Zoom.pkg'])
  })
  it('maps fields, categories, KB and de-duplicated CVEs', () => {
    const os = rows[0]!
    expect(os).toMatchObject({ severity: 'Critical', category: 'OS update', vendor: 'Apple', bulletinId: 'MAC-487', kb: 'KB1234567', rebootRequirement: 'autoreboot', approvalStatus: 'approved', deploymentStatus: 'Failed' })
    expect(os.cves).toEqual(['CVE-2026-1111', 'CVE-2026-2222'])
    expect(os.releasedAt).toBe(new Date(1790666616000).toISOString())
    expect(rows[2]!.category).toBe('Application update')
    expect(rows[1]!.bulletinId).toBeNull()
    expect(rows[1]!.deploymentStatus).toBeNull()
  })
  it('returns [] for an empty report', () => {
    expect(normalizeMissingPatches({ message_response: { systemreport: [] } })).toEqual([])
  })
  it('categorizes unknown update types as Other', () => {
    expect(categorize(null)).toBe('Other')
    expect(categorize('Something New')).toBe('Other')
  })
})

describe('mapSystem', () => {
  it('stores the report id (resource_id_string) separately from resource_id', () => {
    const s = mapSystem({ resource_id: 116819000011966430, resource_id_string: '116819000011966437', os_platform_name: 'Mac', last_successful_scan: 1790568383734 })
    expect(s.resourceId).toBe('116819000011966430')
    expect(s.detailResourceId).toBe('116819000011966437')
    expect(s.lastSuccessfulScanTime).toBe(new Date(1790568383734).toISOString())
  })
  it('normalizes Endpoint Central placeholder counts instead of producing NaN', () => {
    const s = mapSystem({ resource_id: 2, resource_id_string: '22', os_platform_name: 'Windows', missing_ms_patches: '--', critical_patch_count: '--', important_patch_count: '2' })
    expect(s).toMatchObject({ missingOsPatches: 0, criticalPatchCount: 0, importantPatchCount: 2 })
  })
})

describe('getMissingPatches', () => {
  beforeEach(() => clearMissingPatchCache())
  afterEach(() => vi.unstubAllGlobals())

  it('calls the dcapi endpoint with the verified query and Zoho auth header', async () => {
    const f = vi.fn().mockResolvedValue(json(fixture)); vi.stubGlobal('fetch', f)
    const r = await getMissingPatches('116819000011966437', 'critical')
    const [url, init] = f.mock.calls[0]!
    expect(String(url)).toContain('/dcapi/threats/systemreport/patches?')
    expect(String(url)).toContain('severity=Critical')
    expect(String(url)).toContain('resource_id=116819000011966437')
    expect((init as RequestInit).headers).toEqual({ Authorization: 'Zoho-oauthtoken SECRET-ACCESS-TOKEN' })
    expect(r.patches.every(p => p.severity === 'Critical')).toBe(true)
    expect(JSON.stringify(r)).not.toContain('SECRET-ACCESS-TOKEN')
  })
  it('splits OS and app tabs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => json(fixture)))
    expect((await getMissingPatches('1234567', 'os')).patches.map(p => p.category)).toEqual(['OS update', 'OS update'])
    expect((await getMissingPatches('1234567', 'app')).patches.map(p => p.name)).toEqual(['Zoom.pkg'])
  })
  it('treats response_code 204 as an empty result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ response_code: 204, status: 'error' })))
    expect((await getMissingPatches('1234567', 'critical')).patches).toEqual([])
  })
  it('caches for 5 minutes and bypasses the cache on refresh', async () => {
    const f = vi.fn().mockImplementation(async () => json(fixture)); vi.stubGlobal('fetch', f)
    await getMissingPatches('1234567', 'all'); await getMissingPatches('1234567', 'all')
    expect(f).toHaveBeenCalledTimes(1)
    await getMissingPatches('1234567', 'all', true)
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('maps 403 to scope_required and other failures to upstream', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 403 })))
    await expect(getMissingPatches('1234567', 'all')).rejects.toMatchObject({ kind: 'scope_required' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ errorCode: 'IAM0028', errorMsg: 'bad' }, 400)))
    await expect(getMissingPatches('7654321', 'all')).rejects.toBeInstanceOf(PatchApiError)
  })
})
