import { describe, it, expect } from 'vitest'
import { assessApp, type AssessContext } from '../decision.js'
import type { LatestResult } from '../latestVersion.js'
import type { AppRecord, DeployedPackage } from '../types.js'

const NOW = '2026-10-12T10:00:00.000Z'
const ctx = (over: Partial<AssessContext> = {}): AssessContext => ({ providerAsOf: { intune: NOW, 'manageengine-mdm': NOW }, packagesReadable: true, nowIso: NOW, ...over })

const latest = (version: string, over: Partial<{ selfUpdating: boolean }> = {}): LatestResult => ({
  ok: true, value: { version, versionSource: 'Homebrew cask API (zoom)', sourceUrl: 'https://formulae.brew.sh/api/cask/zoom.json', lastCheckedAt: NOW, selfUpdating: false, ...over },
})
const unavailable = (reason: string): LatestResult => ({ ok: false, value: { reason, lastCheckedAt: NOW } })

function rec(over: Partial<AppRecord> = {}): AppRecord {
  return {
    key: 'k', platform: 'macOS',
    identity: { publisher: null, displayName: 'Zoom', bundleId: 'us.zoom.xos', productCode: null, wingetId: null, brewToken: 'zoom' },
    installed: [{ version: '6.0.0', deviceCount: 5, provider: 'manageengine-mdm' }],
    packages: [], confidence: 'high', confidenceReason: 'MDM bundle identifier', providers: ['manageengine-mdm'], nativeHint: null, nativeReason: null,
    installSource: 'manual', installSourceBasis: 'none', installSourceReason: 'test', ...over,
  }
}
const pkg = (over: Partial<DeployedPackage> = {}): DeployedPackage => ({
  provider: 'intune', packageId: 'p1', displayName: 'Zoom', publisher: 'Zoom', version: '6.0.0', versionSource: 'Intune bundle version',
  matchBasis: 'bundleId', bundleId: 'us.zoom.xos', odataType: 'macOSDmgApp', lastModifiedAt: null, ...over,
})

describe('assessApp — decisions', () => {
  it('Up to date when every detected version is at or above latest', () => {
    const r = assessApp(rec({ installed: [{ version: '6.1.0', deviceCount: 3, provider: 'manageengine-mdm' }] }), latest('6.1.0'), ctx())
    expect(r.status).toBe('Up to date')
    expect(r.affectedDevices).toBe(0)
  })

  it('Package required only when newer is confirmed AND no package exists (readable catalog)', () => {
    const r = assessApp(rec(), latest('6.1.0'), ctx())
    expect(r.status).toBe('Package required')
    expect(r.affectedDevices).toBe(5)
    expect(r.action).toBe('Packaging needed — create package for 6.1.0')
    expect(r.reason).toMatch(/no package for this app was found/)
  })

  it('Update available — existing package when the deployed package already covers latest', () => {
    const r = assessApp(rec({ packages: [pkg({ version: '6.1.0' })] }), latest('6.1.0'), ctx())
    expect(r.status).toBe('Update available — existing package')
    expect(r.deployedPackageVersion).toBe('6.1.0')
    expect(r.action).toMatch(/Packaging needed — deploy 6\.1\.0 to 5 device/)
  })

  it('Repackage required when the deployed package is older than latest', () => {
    const r = assessApp(rec({ packages: [pkg({ version: '6.0.0' })] }), latest('6.1.0'), ctx())
    expect(r.status).toBe('Repackage required')
    expect(r.reason).toMatch(/older than the latest verified version 6\.1\.0/)
  })

  it('Review required when a strong package reports no version', () => {
    const r = assessApp(rec({ packages: [pkg({ version: null })] }), latest('6.1.0'), ctx())
    expect(r.status).toBe('Review required')
    expect(r.dataGaps.join(' ')).toMatch(/no version/)
  })

  it('never says Package required from a name-only package candidate', () => {
    const r = assessApp(rec({ platform: 'windows', identity: { publisher: 'Zoom', displayName: 'Zoom', bundleId: null, productCode: null, wingetId: 'Zoom.Zoom', brewToken: null }, packages: [pkg({ matchBasis: 'name', bundleId: null, version: null })] }), latest('6.1.0'), ctx())
    expect(r.status).toBe('Review required')
    expect(r.reason).toMatch(/similar name/)
  })

  it('does not assert "no package" when the Intune catalog could not be read', () => {
    const r = assessApp(rec(), latest('6.1.0'), ctx({ packagesReadable: false }))
    expect(r.status).toBe('Review required')
    expect(r.dataGaps.join(' ')).toMatch(/catalog could not be read/)
  })

  it('Data unavailable when no latest-version source is mapped', () => {
    const r = assessApp(rec(), null, ctx())
    expect(r.status).toBe('Data unavailable')
    expect(r.latest).toBeNull()
    expect(r.reason).toMatch(/No approved latest-version source/)
  })

  it('Data unavailable (with the reason) when the source lookup failed', () => {
    const r = assessApp(rec(), unavailable('GitHub API rate limit reached'), ctx())
    expect(r.status).toBe('Data unavailable')
    expect(r.latestUnavailable?.reason).toMatch(/rate limit/)
  })

  it('an unreadable version does not hide confirmed-behind devices, and is not counted as behind', () => {
    const r = assessApp(rec({ installed: [{ version: 'Unknown', deviceCount: 2, provider: 'manageengine-mdm' }, { version: '6.0.0', deviceCount: 1, provider: 'manageengine-mdm' }] }), latest('6.1.0'), ctx())
    expect(r.status).toBe('Package required')
    expect(r.affectedDevices).toBe(1)
    expect(r.dataGaps.join(' ')).toMatch(/2 device\(s\) report a version that cannot be compared/)
  })

  it('Review required when every installed version is unreadable', () => {
    const r = assessApp(rec({ installed: [{ version: 'Unknown', deviceCount: 2, provider: 'manageengine-mdm' }] }), latest('6.1.0'), ctx())
    expect(r.status).toBe('Review required')
    expect(r.affectedDevices).toBe(0)
  })

  it('Review required (not a false update) when installed uses a date-style scheme and latest does not', () => {
    const r = assessApp(rec({ installed: [{ version: '20240115', deviceCount: 4, provider: 'manageengine-mdm' }] }), latest('6.1.0'), ctx())
    expect(r.status).toBe('Review required')
    expect(r.affectedDevices).toBe(0)
  })

  it('compares numerically (9.0 < 10.0) rather than as strings', () => {
    const r = assessApp(rec({ installed: [{ version: '9.0.0', deviceCount: 1, provider: 'manageengine-mdm' }] }), latest('10.0.0'), ctx())
    expect(r.status).toBe('Package required')
  })
})

describe('assessApp — native updates are excluded from packaging', () => {
  it('Store / App Store apps are Native update even with an old version', () => {
    const r = assessApp(rec({ nativeHint: 'Microsoft Store / MSIX package' }), latest('9.9.9'), ctx())
    expect(r.status).toBe('Native update')
    expect(r.action).toBe('No packaging needed')
  })
  it('Native update without any latest lookup', () => {
    expect(assessApp(rec({ nativeHint: 'Apple system app' }), null, ctx()).status).toBe('Native update')
  })
  it('a macOS app behind a verified self-updating cask is routed for packaging review', () => {
    const r = assessApp(rec(), latest('6.1.0', { selfUpdating: true }), ctx())
    expect(r.status).toBe('Package required')
    expect(r.action).toMatch(/Packaging needed/)
  })
})

describe('assessApp — evidence and provenance', () => {
  it('keeps detected / package / latest evidence distinct with source and freshness', () => {
    const r = assessApp(rec({ packages: [pkg({ version: '6.0.0' })] }), latest('6.1.0'), ctx())
    const byLabel = (l: string) => r.evidence.find(e => e.label === l)!
    expect(byLabel('Detected versions')).toMatchObject({ source: 'ManageEngine MDM inventory', asOf: NOW, value: '6.0.0 ×5' })
    expect(byLabel('Deployed package').source).toMatch(/Intune/)
    expect(byLabel('Latest verified version')).toMatchObject({ value: '6.1.0', source: 'Homebrew cask API (zoom)', asOf: NOW })
    expect(byLabel('Comparison').value).toMatch(/6\.0\.0 older than 6\.1\.0/)
  })
  it('never derives the latest version from inventory', () => {
    const r = assessApp(rec({ installed: [{ version: '9.9.9', deviceCount: 1, provider: 'manageengine-mdm' }] }), null, ctx())
    expect(r.latest).toBeNull()
    expect(r.status).toBe('Data unavailable')
  })
  it('low-confidence identity is recorded as a data gap', () => {
    const r = assessApp(rec({ confidence: 'low', confidenceReason: 'Name-only identity' }), null, ctx())
    expect(r.dataGaps).toContain('Name-only identity')
  })
})
