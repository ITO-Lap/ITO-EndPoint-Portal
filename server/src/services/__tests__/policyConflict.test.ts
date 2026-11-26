import { describe, it, expect } from 'vitest'
import { detectConflicts, conflictSummary } from '../policyConflict.js'
import type { GraphCompliancePolicy, GraphConfigProfile } from '../graphApi.js'

const recent = new Date().toISOString()
const comp = (id: string, displayName: string, platformType = 'windows10'): GraphCompliancePolicy => ({ id, displayName, description: '', platformType, createdDateTime: recent, lastModifiedDateTime: recent })
const cfg = (id: string, displayName: string, platformType = 'windows10', version = 1): GraphConfigProfile => ({ id, displayName, description: '', platformType, createdDateTime: recent, lastModifiedDateTime: recent, version })

describe('detectConflicts severity and drift', () => {
  it('rates same-platform duplicates high, cross-platform duplicates medium', () => {
    const same = detectConflicts([comp('1', 'Baseline'), comp('2', 'Baseline')], [])
    expect(same).toHaveLength(1)
    expect(same[0]).toMatchObject({ type: 'duplicate_name', severity: 'high' })
    const cross = detectConflicts([comp('1', 'Baseline', 'windows10'), comp('2', 'Baseline', 'iOS')], [])
    expect(cross[0]).toMatchObject({ type: 'duplicate_name', severity: 'medium' })
  })

  it('flags version drift only for same-platform profile copies at different versions', () => {
    const drift = detectConflicts([], [cfg('1', 'WiFi', 'windows10', 2), cfg('2', 'WiFi', 'windows10', 5)])
    expect(drift.map(c => c.type).sort()).toEqual(['duplicate_name', 'version_drift'])
    expect(drift.find(c => c.type === 'version_drift')!.description).toContain('2, 5')
    expect(detectConflicts([], [cfg('1', 'WiFi', 'windows10', 3), cfg('2', 'WiFi', 'windows10', 3)]).some(c => c.type === 'version_drift')).toBe(false)
    expect(detectConflicts([], [cfg('1', 'WiFi', 'windows10', 2), cfg('2', 'WiFi', 'iOS', 5)]).some(c => c.type === 'version_drift')).toBe(false)
  })

  it('counts the new severity and type in the summary, so the High KPI and drift count are no longer always 0', () => {
    const s = conflictSummary(detectConflicts([comp('1', 'A'), comp('2', 'A')], [cfg('3', 'B', 'windows10', 1), cfg('4', 'B', 'windows10', 2)]))
    expect(s.high).toBe(2)
    expect(s.byType.version_drift).toBe(1)
  })

  it('leaves unique policies alone', () => {
    expect(detectConflicts([comp('1', 'A'), comp('2', 'B')], [cfg('3', 'C')])).toEqual([])
  })
})
