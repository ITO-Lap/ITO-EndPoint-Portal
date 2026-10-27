import { describe, it, expect } from 'vitest'
import type { ApiDevice, ManageEngineFleetProfileResult } from '../../api'
import {
  computeMacPosture, attachPosture, releaseOrdinal, fleetPostureAverage, bandFor, majorVersion,
  POSTURE_LABEL, POSTURE_WEIGHTS,
} from '../macPostureScore'
import { KPI_CONFIGS } from '../kpiConfig'

function mac(over: Record<string, unknown> = {}): ApiDevice {
  return {
    id: 'd1', deviceName: 'Mac-1', user: 'u', serialNumber: 'S', platform: 'macOS', osVersion: '26.1',
    managementSource: 'ManageEngine', lastCheckIn: new Date().toISOString(), complianceState: 'Compliant',
    encryptionStatus: 'Encrypted', passcodeStatus: 'Present', primaryIssue: 'None', policyFailed: 'None',
    severity: 'Low', confidence: '', firstDetected: '', lastDetected: '', issueSource: '', ...over,
  } as unknown as ApiDevice
}

const profiles = (statuses: string[]): ManageEngineFleetProfileResult => ({
  deviceId: 'd1', unavailable: false,
  snapshot: { stale: false, lastSuccessfulSyncAt: '2026-10-10T00:00:00Z', profiles: statuses.map((status, i) => ({ profileId: String(i), profileName: `P${i}`, status, remarks: null, localizedRemarks: null, appliedTime: null })) },
})

describe('weights', () => {
  it('sum to 100', () => expect(Object.values(POSTURE_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100))
})

describe('computeMacPosture', () => {
  it('scores 100 when every signal is healthy', () => {
    const p = computeMacPosture(mac(), { newestMajor: 26, profileResult: profiles(['6', '6']) })
    expect(p.score).toBe(100)
    expect(p.band).toBe('Strong')
    expect(p.coverage).toBe(1)
  })

  it('FileVault off and no passcode drop the score by their weights', () => {
    const p = computeMacPosture(mac({ encryptionStatus: 'Not Encrypted', passcodeStatus: 'Missing' }), { newestMajor: 26, profileResult: profiles(['6']) })
    expect(p.score).toBe(50)
    expect(p.band).toBe('At risk')
  })

  it('excludes unknown signals instead of counting them as failures', () => {
    const p = computeMacPosture(mac({ passcodeStatus: 'Unknown' }), { newestMajor: 26 })
    expect(p.signals.find(s => s.id === 'passcode')!.earned).toBeNull()
    expect(p.signals.find(s => s.id === 'profiles')!.earned).toBeNull()
    expect(p.coverage).toBeCloseTo(0.65)
    expect(p.score).toBe(100)
  })

  it('withholds the score when less than half the weight is assessed', () => {
    const p = computeMacPosture(mac({ encryptionStatus: 'Unknown', passcodeStatus: 'Unknown', osVersion: 'Unknown', lastCheckIn: '' }), { newestMajor: 26 })
    expect(p.score).toBeNull()
    expect(p.band).toBe('Insufficient data')
  })

  it('penalises macOS majors behind the newest in the fleet', () => {
    const os = (v: string) => computeMacPosture(mac({ osVersion: v }), { newestMajor: 26 }).signals.find(s => s.id === 'osVersion')!.earned
    expect([os('26.1'), os('15.4'), os('14.7'), os('13.6')]).toEqual([1, 0.6, 0.3, 0])
  })

  it('counts macOS releases, not raw version numbers (15 → 26 is one release)', () => {
    expect([releaseOrdinal(15), releaseOrdinal(26), releaseOrdinal(27)]).toEqual([15, 16, 17])
    const os = (v: string, newest: number) => computeMacPosture(mac({ osVersion: v }), { newestMajor: newest }).signals.find(s => s.id === 'osVersion')!.earned
    expect(os('26.1', 27)).toBe(0.6)
    expect(os('15.7', 27)).toBe(0.3)
  })

  it('treats a stale MDM check-in as weaker management', () => {
    const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
    const m = (n: number) => computeMacPosture(mac({ lastCheckIn: days(n) }), { newestMajor: 26 }).signals.find(s => s.id === 'mdmManagement')!.earned
    expect([m(2), m(20), m(60)]).toEqual([1, 0.5, 0])
  })

  it('counts only status 6 as an applied profile; failed/pending profiles lower the score', () => {
    const e = (r: ManageEngineFleetProfileResult | undefined) => computeMacPosture(mac(), { newestMajor: 26, profileResult: r }).signals.find(s => s.id === 'profiles')!.earned
    expect(e(profiles(['6', '7', '16', '3']))).toBe(0.25)
    expect(e({ deviceId: 'd1', unavailable: true, snapshot: null })).toBeNull()
    expect(e(profiles([]))).toBeNull()
  })
})

describe('passcode reliability', () => {
  it('does not score a passcode flag that is Missing for every Mac in the fleet', () => {
    const out = attachPosture([mac({ id: 'a', passcodeStatus: 'Missing' }), mac({ id: 'b', passcodeStatus: 'Missing' })])
    const sig = out[0]!.posture!.signals.find(s => s.id === 'passcode')!
    expect(sig.earned).toBeNull()
    expect(sig.detail).toMatch(/not reliably reported/i)
    expect(out[0]!.posture!.score).toBe(100)
  })
  it('scores Missing as a failure once any Mac in the fleet reports a passcode', () => {
    const out = attachPosture([mac({ id: 'a', passcodeStatus: 'Present' }), mac({ id: 'b', passcodeStatus: 'Missing' })])
    expect(out[1]!.posture!.signals.find(s => s.id === 'passcode')!.earned).toBe(0)
    expect(out[1]!.posture!.score).toBeLessThan(out[0]!.posture!.score!)
  })
})

describe('helpers', () => {
  it('bands', () => {
    expect([bandFor(100), bandFor(85), bandFor(84), bandFor(70), bandFor(69), bandFor(null)]).toEqual(['Strong', 'Strong', 'Fair', 'Fair', 'At risk', 'Insufficient data'])
  })
  it('parses majors', () => {
    expect([majorVersion('26.1.2'), majorVersion('15'), majorVersion('Unknown'), majorVersion(undefined)]).toEqual([26, 15, null, null])
  })
  it('attachPosture uses the newest major in the fleet and per-device profile results', () => {
    const out = attachPosture([mac({ id: 'a', osVersion: '26.1' }), mac({ id: 'b', osVersion: '15.2' })], { a: profiles(['6']) })
    expect(out[0]!.posture!.signals.find(s => s.id === 'osVersion')!.earned).toBe(1)
    expect(out[1]!.posture!.signals.find(s => s.id === 'osVersion')!.earned).toBe(0.6)
    expect(out[0]!.posture!.signals.find(s => s.id === 'profiles')!.earned).toBe(1)
  })
  it('fleet average ignores devices without a score', () => {
    const scored = attachPosture([mac({ id: 'a' }), mac({ id: 'b', encryptionStatus: 'Not Encrypted', passcodeStatus: 'Missing' })])
    const nothing = attachPosture([mac({ id: 'c', encryptionStatus: 'Unknown', passcodeStatus: 'Unknown', osVersion: 'x', lastCheckIn: '' })])
    expect(fleetPostureAverage([...scored, ...nothing]).scored).toBe(2)
    expect(fleetPostureAverage(nothing)).toEqual({ average: null, scored: 0 })
  })
})

describe('Device Security Posture KPI', () => {
  const kpi = KPI_CONFIGS['device-security-posture']
  it('is labelled project-calculated, not ManageEngine compliance', () => {
    expect(POSTURE_LABEL).toMatch(/project-calculated/i)
    expect(POSTURE_LABEL).toMatch(/not a ManageEngine compliance verdict/i)
    expect(kpi.caption).toMatch(/Project-calculated/)
    expect(kpi.caption).toMatch(/not ManageEngine compliance/)
    expect(kpi.title).not.toMatch(/compliance/i)
    expect(kpi.description).toMatch(/project-calculated/i)
  })
  it('shows N/A with a reason when nothing can be scored', () => {
    const none = attachPosture([mac({ encryptionStatus: 'Unknown', passcodeStatus: 'Unknown', osVersion: 'x', lastCheckIn: '' })])
    expect(kpi.getValue(none)).toBe('N/A')
    expect(kpi.getUnavailableReason?.(none)).toBeTruthy()
  })
  it('reports the fleet average out of 100', () => {
    expect(kpi.getValue(attachPosture([mac({ id: 'a' }), mac({ id: 'b', encryptionStatus: 'Not Encrypted', passcodeStatus: 'Missing' })]))).toBe('70.5 / 100')
  })
  it('does not alter the existing native compliance score', () => {
    expect(KPI_CONFIGS['compliance-score'].title).toBe('Compliance Score')
  })
})
