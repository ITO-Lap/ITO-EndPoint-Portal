import { describe, it, expect } from 'vitest'
import { classifyInstallSource, type AssignmentIndex } from '../installSource.js'
import type { AppRecord, DeployedPackage } from '../types.js'

const pkg = (over: Partial<DeployedPackage> = {}): DeployedPackage => ({
  provider: 'intune', packageId: 'p1', displayName: 'Zoom', publisher: null, version: '6.0.0', versionSource: null,
  matchBasis: 'bundleId', bundleId: 'us.zoom.xos', odataType: 'macOSDmgApp', lastModifiedAt: null, ...over,
})
const rec = (packages: DeployedPackage[] = []): AppRecord => ({
  key: 'k', platform: 'macOS', identity: { publisher: null, displayName: 'Zoom', bundleId: 'us.zoom.xos', productCode: null, wingetId: null, brewToken: null },
  installed: [], packages, confidence: 'high', confidenceReason: '', providers: ['manageengine-mdm'], nativeHint: null, nativeReason: null,
  installSource: 'manual', installSourceBasis: 'none', installSourceReason: '',
})
const c = (r: AppRecord, a: AssignmentIndex = {}) => classifyInstallSource(r, a)

describe('classifyInstallSource', () => {
  it('no matching package → manual (installed outside managed deployment)', () => {
    expect(c(rec())).toMatchObject({ installSource: 'manual', installSourceBasis: 'none' })
  })
  it('a package offered with an "available" intent → self-service (Company Portal)', () => {
    const r = c(rec([pkg()]), { p1: [{ intent: 'available' }] })
    expect(r).toMatchObject({ installSource: 'self-service', installSourceBasis: 'bundleId' })
    expect(r.installSourceReason).toMatch(/Company Portal/)
  })
  it('availableWithoutEnrollment also counts as self-service', () => {
    expect(c(rec([pkg()]), { p1: [{ intent: 'availableWithoutEnrollment' }] }).installSource).toBe('self-service')
  })
  it('a package that is only required/uninstall → custom (IT-packaged)', () => {
    expect(c(rec([pkg()]), { p1: [{ intent: 'required' }, { intent: 'uninstall' }] }).installSource).toBe('custom')
  })
  it('a package with no assignments → custom', () => {
    expect(c(rec([pkg()]), { p1: [] }).installSource).toBe('custom')
  })
  it('unreadable assignments → custom with an explicit caveat, never assumed not-self-service', () => {
    const r = c(rec([pkg()]), { p1: 'unavailable' })
    expect(r.installSource).toBe('custom')
    expect(r.installSourceReason).toMatch(/cannot be ruled out/)
    expect(c(rec([pkg()]), {}).installSourceReason).toMatch(/cannot be ruled out/) // missing entry is treated the same way
  })
  it('a name-only package match is flagged low confidence', () => {
    const r = c(rec([pkg({ matchBasis: 'name', bundleId: null })]), { p1: [{ intent: 'available' }] })
    expect(r).toMatchObject({ installSource: 'self-service', installSourceBasis: 'name' })
    expect(r.installSourceReason).toMatch(/by name only \(low confidence\)/)
  })
  it('a strong-identifier package outranks a name-only candidate', () => {
    const r = c(rec([pkg({ packageId: 'name1', matchBasis: 'name', bundleId: null }), pkg({ packageId: 'strong1' })]), { name1: [{ intent: 'available' }], strong1: [{ intent: 'required' }] })
    expect(r).toMatchObject({ installSource: 'custom', installSourceBasis: 'bundleId' })
  })
})
