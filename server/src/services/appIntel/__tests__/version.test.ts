import { describe, it, expect } from 'vitest'
import { parseVersion, compareVersions, maxVersion } from '../version.js'

describe('parseVersion', () => {
  it('parses dotted numerics of any length', () => {
    expect(parseVersion('155.0.8059.40')!.nums).toEqual([155, 0, 8059, 40])
    expect(parseVersion('2025.912.644.0')!.nums).toEqual([2025, 912, 644, 0])
    expect(parseVersion('7')!.nums).toEqual([7])
  })
  it('strips a leading v and reads a Homebrew ",build" suffix', () => {
    expect(parseVersion('v1.2.3')!.nums).toEqual([1, 2, 3])
    expect(parseVersion('1.2.3,456')).toMatchObject({ nums: [1, 2, 3], build: 456 })
  })
  it('detects pre-release labels', () => {
    expect(parseVersion('1.2.0-beta.2')!.pre).toBe('beta.2')
    expect(parseVersion('3.0rc1')!.pre).toBe('rc.1')
    expect(parseVersion('1.2.3')!.pre).toBeNull()
  })
  it.each([[''], ['Unknown'], ['latest'], [null], [undefined], ['n/a']])('returns null for %s', v => {
    expect(parseVersion(v as string)).toBeNull()
  })
})

describe('compareVersions', () => {
  it('compares numerically, not lexicographically', () => {
    expect(compareVersions('9.0.0', '10.0.0')).toBe(-1)
    expect(compareVersions('1.10', '1.9')).toBe(1)
    expect(compareVersions('152.0.7977.76', '148.0.7778.218')).toBe(1)
    expect(compareVersions('155.0.8059.9', '155.0.8059.40')).toBe(-1)
  })
  it('treats missing trailing segments as zero', () => {
    expect(compareVersions('1.2', '1.2.0.0')).toBe(0)
    expect(compareVersions('1.2', '1.2.0.1')).toBe(-1)
  })
  it('orders a pre-release below its release and handles build numbers', () => {
    expect(compareVersions('1.2.0-beta.1', '1.2.0')).toBe(-1)
    expect(compareVersions('1.2.0-rc.1', '1.2.0-beta.3')).toBe(1)
    expect(compareVersions('1.2.3,456', '1.2.3,455')).toBe(1)
    expect(compareVersions('1.2.3', '1.2.3,0')).toBe(0)
  })
  it('returns null (never a guess) when either side is unparsable', () => {
    expect(compareVersions('Unknown', '1.0')).toBeNull()
    expect(compareVersions('1.0', '')).toBeNull()
  })
  it('compares large calendar-style versions correctly', () => {
    expect(compareVersions('2026.827.803.0', '2025.912.644.0')).toBe(1)
  })
})

describe('maxVersion', () => {
  it('returns the highest version', () => expect(maxVersion(['1.9', '1.10', '1.2'])).toBe('1.10'))
  it('returns null when any version is unparsable', () => expect(maxVersion(['1.0', 'Unknown'])).toBeNull())
  it('returns null for an empty list', () => expect(maxVersion([])).toBeNull())
})
