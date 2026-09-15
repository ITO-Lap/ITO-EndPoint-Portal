import { describe, it, expect } from 'vitest'
import {
  decodeScriptContent, extractDecodedScripts, sanitizeFilename, dedupeFilename,
  buildConfigJson, buildManifest, buildExportEntry, buildExportZip, pLimit,
  type ExportEntry,
} from '../intuneScriptsConfigExport.js'
import type { InventoryItem, Assignment } from '../intuneScriptsConfigGraph.js'

function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    compositeId: 'powershell_script:abc-123',
    type: 'powershell_script',
    category: 'scripts/powershell',
    label: 'PowerShell Script',
    id: 'abc-123',
    displayName: 'My Script',
    lastModifiedDateTime: '2026-01-01T00:00:00Z',
    raw: {},
    ...overrides,
  }
}

describe('decodeScriptContent / extractDecodedScripts', () => {
  it('base64-decodes to the original UTF-8 text', () => {
    const original = 'Write-Host "Hello, World!"'
    const b64 = Buffer.from(original, 'utf-8').toString('base64')
    expect(decodeScriptContent(b64)).toBe(original)
  })

  it('extracts scriptContent for a PowerShell/shell script item', () => {
    const item = makeItem({ raw: { scriptContent: Buffer.from('echo hi').toString('base64') } })
    const scripts = extractDecodedScripts(item)
    expect(scripts).toEqual([{ field: 'scriptContent', content: 'echo hi' }])
  })

  it('extracts both detection and remediation script content for a remediation', () => {
    const item = makeItem({
      type: 'remediation',
      raw: {
        detectionScriptContent: Buffer.from('detect').toString('base64'),
        remediationScriptContent: Buffer.from('remediate').toString('base64'),
      },
    })
    const scripts = extractDecodedScripts(item)
    expect(scripts).toHaveLength(2)
    expect(scripts.map(s => s.content)).toEqual(['detect', 'remediate'])
  })

  it('never decodes an unrelated field, even one that looks like content', () => {
    const item = makeItem({ raw: { secretValue: Buffer.from('super-secret').toString('base64') } })
    expect(extractDecodedScripts(item)).toEqual([])
  })

  it('skips empty/missing content fields', () => {
    const item = makeItem({ raw: { scriptContent: '' } })
    expect(extractDecodedScripts(item)).toEqual([])
  })
})

describe('sanitizeFilename', () => {
  it('strips path-traversal characters', () => {
    expect(sanitizeFilename('../../etc/passwd', 'fallback-id')).not.toContain('..')
    expect(sanitizeFilename('../../etc/passwd', 'fallback-id')).not.toContain('/')
  })

  it('strips backslashes and Windows-reserved characters', () => {
    const result = sanitizeFilename('bad<name>:"weird"|file?*', 'fallback-id')
    expect(result).not.toMatch(/[\\/<>:"|?*]/)
  })

  it('falls back to the resource id when the display name is empty', () => {
    expect(sanitizeFilename('', 'fallback-id')).toBe('fallback-id')
    expect(sanitizeFilename('   ', 'fallback-id')).toBe('fallback-id')
  })

  it('falls back to the resource id when the name is only unsafe characters', () => {
    expect(sanitizeFilename('../..\\..', 'fallback-id')).toBe('fallback-id')
  })

  it('preserves a normal display name', () => {
    expect(sanitizeFilename('Reset BitLocker Keys', 'fallback-id')).toBe('Reset BitLocker Keys')
  })
})

describe('dedupeFilename', () => {
  it('returns the candidate unchanged on first use', () => {
    const used = new Set<string>()
    expect(dedupeFilename(used, 'script.ps1')).toBe('script.ps1')
  })

  it('appends " (1)", " (2)", … on repeated collisions', () => {
    const used = new Set<string>()
    expect(dedupeFilename(used, 'script.ps1')).toBe('script.ps1')
    expect(dedupeFilename(used, 'script.ps1')).toBe('script (1).ps1')
    expect(dedupeFilename(used, 'script.ps1')).toBe('script (2).ps1')
  })

  it('keeps the extension intact when de-duplicating', () => {
    const used = new Set<string>(['policy.json'])
    expect(dedupeFilename(used, 'policy.json')).toBe('policy (1).json')
  })
})

describe('buildConfigJson', () => {
  it('preserves @odata.type, id, name, settings, assignments, groups, scope tags, and version', () => {
    const item = makeItem({
      type: 'compliance_policy',
      category: 'configurations/compliance',
      displayName: 'iOS Baseline',
      raw: { '@odata.type': '#microsoft.graph.iosCompliancePolicy', id: 'abc-123', displayName: 'iOS Baseline', roleScopeTagIds: ['0', '1'] },
    })
    const assignments: Assignment[] = [
      { id: 'a1', target: { '@odata.type': '#microsoft.graph.groupAssignmentTarget', groupId: 'g1' } },
      { id: 'a2', target: { '@odata.type': '#microsoft.graph.exclusionGroupAssignmentTarget', groupId: 'g2' } },
    ]
    const json = buildConfigJson(item, assignments, null, { g1: 'Marketing', g2: 'Contractors' })

    expect(json.id).toBe('abc-123')
    expect(json.name).toBe('iOS Baseline')
    expect(json.scopeTagIds).toEqual(['0', '1'])
    expect(json.graphApiVersion).toBe('v1.0')
    expect(json.includedGroups).toEqual(['Marketing'])
    expect(json.excludedGroups).toEqual(['Contractors'])
    expect(json.source).toBe(item.raw)
    expect(json.exportedAt).toBeTruthy()
  })

  it('labels the Graph API version as beta for beta-only resource types', () => {
    const item = makeItem({ type: 'settings_catalog', category: 'configurations/settings-catalog', raw: { id: 'x' } })
    const json = buildConfigJson(item, [], [{ settingInstance: {} }], {})
    expect(json.graphApiVersion).toBe('beta')
    expect(json.settings).toEqual([{ settingInstance: {} }])
  })

  it('never leaks a secret-shaped field beyond what is already in the raw source object', () => {
    // buildConfigJson intentionally passes `source: item.raw` through verbatim —
    // it must not invent new fields that pull in anything beyond what Graph returned.
    const item = makeItem({ raw: { id: 'x', displayName: 'y' } })
    const json = buildConfigJson(item, [], null, {})
    expect(Object.keys(json.source)).toEqual(['id', 'displayName'])
  })
})

describe('buildExportEntry / buildManifest', () => {
  it('produces a .ps1 file for a PowerShell script and a .json file for a policy', () => {
    const scriptItem = makeItem({ raw: { scriptContent: Buffer.from('Get-Process').toString('base64') } })
    const usedNames = new Set<string>()
    const scriptEntry = buildExportEntry(scriptItem, [], null, {}, usedNames)
    expect(scriptEntry.zipPath).toBe('scripts/powershell/My Script.ps1')
    expect(scriptEntry.content.toString('utf-8')).toBe('Get-Process')

    const policyItem = makeItem({ type: 'compliance_policy', category: 'configurations/compliance', id: 'p1', displayName: 'Policy A', raw: { id: 'p1' } })
    const policyEntry = buildExportEntry(policyItem, [], null, {}, usedNames)
    expect(policyEntry.zipPath).toBe('configurations/compliance/Policy A.json')
    expect(JSON.parse(policyEntry.content.toString('utf-8')).id).toBe('p1')
  })

  it('produces a decoded .ps1 file for a remediation, not a .json wrapping base64 content', () => {
    const remediationItem = makeItem({
      type: 'remediation',
      category: 'scripts/remediations',
      displayName: 'Fix BitLocker',
      raw: {
        detectionScriptContent: Buffer.from('# detect').toString('base64'),
        remediationScriptContent: Buffer.from('# remediate').toString('base64'),
      },
    })
    const entry = buildExportEntry(remediationItem, [], null, {}, new Set())
    expect(entry.zipPath).toBe('scripts/remediations/Fix BitLocker.ps1')
    expect(entry.content.toString('utf-8')).toContain('# detect')
    expect(entry.content.toString('utf-8')).toContain('# remediate')
  })

  it('de-duplicates filenames across a batch via the shared usedNames set', () => {
    const usedNames = new Set<string>()
    const item1 = makeItem({ id: '1', displayName: 'Duplicate' })
    const item2 = makeItem({ id: '2', displayName: 'Duplicate' })
    const e1 = buildExportEntry(item1, [], null, {}, usedNames)
    const e2 = buildExportEntry(item2, [], null, {}, usedNames)
    expect(e1.zipPath).not.toBe(e2.zipPath)
  })

  it('records success and failure entries separately in the manifest, with counts', () => {
    const entries: ExportEntry[] = [
      { compositeId: 'a', resourceType: 'powershell_script', category: 'scripts/powershell', resourceId: 'a', displayName: 'A', lastModifiedDateTime: null, zipPath: 'scripts/powershell/A.ps1', content: Buffer.from(''), success: true },
      { compositeId: 'b', resourceType: 'compliance_policy', category: 'configurations/compliance', resourceId: 'b', displayName: 'B', success: false, error: 'Graph 404' },
    ]
    const manifest = buildManifest(entries)
    expect(manifest.totalRequested).toBe(2)
    expect(manifest.totalSucceeded).toBe(1)
    expect(manifest.totalFailed).toBe(1)
    expect(manifest.entries.find(e => e.compositeId === 'b')).toMatchObject({ status: 'failed', error: 'Graph 404' })
    expect(manifest.entries.find(e => e.compositeId === 'a')).toMatchObject({ status: 'success', filename: 'scripts/powershell/A.ps1' })
  })
})

describe('buildExportZip', () => {
  it('produces a valid, non-empty zip buffer containing manifest.json and every successful entry', async () => {
    const entries: ExportEntry[] = [
      { compositeId: 'a', resourceType: 'powershell_script', category: 'scripts/powershell', resourceId: 'a', displayName: 'A', lastModifiedDateTime: null, zipPath: 'scripts/powershell/A.ps1', content: Buffer.from('Get-Process'), success: true },
      { compositeId: 'b', resourceType: 'compliance_policy', category: 'configurations/compliance', resourceId: 'b', displayName: 'B', success: false, error: 'Graph 404' },
    ]
    const zipBuf = await buildExportZip(entries)
    expect(zipBuf.length).toBeGreaterThan(0)
    // ZIP local file header signature
    expect(zipBuf.subarray(0, 4).toString('hex')).toBe('504b0304')

    // ZIP local/central file headers store filenames as plaintext regardless
    // of content compression — so the expected paths are findable as raw
    // byte strings without needing an unzip library.
    const asLatin1 = zipBuf.toString('latin1')
    expect(asLatin1).toContain('intune-export/manifest.json')
    expect(asLatin1).toContain('intune-export/scripts/powershell/A.ps1')
    // the failed entry must not produce a phantom file in the zip
    expect(asLatin1).not.toContain('configurations/compliance/B')
  })

  it('still produces a valid zip when every entry fails (only the manifest is present)', async () => {
    const entries: ExportEntry[] = [
      { compositeId: 'a', resourceType: 'compliance_policy', category: 'configurations/compliance', resourceId: 'a', displayName: 'A', success: false, error: 'timeout' },
    ]
    const zipBuf = await buildExportZip(entries)
    expect(zipBuf.subarray(0, 4).toString('hex')).toBe('504b0304')
  })
})

describe('pLimit', () => {
  it('runs all tasks and preserves result order regardless of completion order', async () => {
    const tasks = [
      () => new Promise<number>(r => setTimeout(() => r(1), 10)),
      () => Promise.resolve(2),
      () => new Promise<number>(r => setTimeout(() => r(3), 5)),
    ]
    const results = await pLimit(tasks, 2)
    expect(results).toEqual([1, 2, 3])
  })

  it('never runs more than `limit` tasks concurrently', async () => {
    let active = 0
    let maxActive = 0
    const tasks = Array.from({ length: 10 }, () => async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise(r => setTimeout(r, 5))
      active -= 1
      return true
    })
    await pLimit(tasks, 3)
    expect(maxActive).toBeLessThanOrEqual(3)
  })

  it('a rejected task does not stop the other tasks from completing (caller catches per-task)', async () => {
    const tasks = [
      () => Promise.resolve('ok-1'),
      () => Promise.reject(new Error('boom')).catch(() => 'recovered'),
      () => Promise.resolve('ok-2'),
    ]
    const results = await pLimit(tasks, 2)
    expect(results).toEqual(['ok-1', 'recovered', 'ok-2'])
  })
})
