import { describe, it, expect } from 'vitest'
import type { PosturePillar, PosturePillarDevice } from '../../api'
import { deriveRisks, riskSeverity, scoreBand, devicesToCsv, describeSegment } from '../securityPosture'

const pillar = (over: Partial<PosturePillar> = {}): PosturePillar => ({
  id: 'encryption', label: 'Disk Encryption', description: '', scope: '', weight: 0.35, inScope: 100, assessed: 100,
  passing: 90, failing: 10, notReported: 0, scorePct: 90, byPlatform: [], bySource: [], topFindings: [], ...over,
})
const dev = (over: Partial<PosturePillarDevice> = {}): PosturePillarDevice => ({
  id: '1', deviceName: 'WIN-01', user: 'a@zinnia.com', platform: 'Windows', source: 'Microsoft Intune', serialNumber: 'ABC123', status: 'fail', detail: 'BitLocker Off', ...over,
})

describe('riskSeverity', () => {
  it('scales with the share of assessed devices failing, one level higher for encryption and patching', () => {
    const s = (id: PosturePillar['id'], failing: number) => riskSeverity({ id, failing, assessed: 100 })
    expect([s('checkin', 1), s('checkin', 5), s('checkin', 10), s('checkin', 30)]).toEqual(['Low', 'Medium', 'High', 'Critical'])
    expect([s('encryption', 1), s('encryption', 5), s('encryption', 10), s('patching', 30)]).toEqual(['Low', 'High', 'Critical', 'Critical'])
  })
  it('is Low when nothing was assessed', () => expect(riskSeverity({ id: 'patching', failing: 0, assessed: 0 })).toBe('Low'))
})

describe('deriveRisks', () => {
  it('lists only pillars with failing devices, most severe first', () => {
    const risks = deriveRisks([
      pillar({ id: 'checkin', failing: 3, assessed: 100 }),
      pillar({ id: 'patching', failing: 30, assessed: 100 }),
      pillar({ id: 'compliance', failing: 0 }),
    ])
    expect(risks.map(r => r.pillarId)).toEqual(['patching', 'checkin'])
    expect(risks[0]!.title).toBe('30 devices missing critical patches')
    expect(risks[0]!.count).toBe(30)
  })
  it('uses singular wording for one device', () => {
    expect(deriveRisks([pillar({ failing: 1 })])[0]!.title).toBe('1 device without disk encryption enabled')
  })
})

describe('scoreBand', () => {
  it('bands scores and never treats null as a number', () => {
    expect([scoreBand(95), scoreBand(75), scoreBand(40), scoreBand(null)]).toEqual(['good', 'fair', 'poor', 'none'])
  })
})

describe('describeSegment', () => {
  it('describes the active drill-down', () => {
    expect(describeSegment({ platform: 'Windows', status: 'fail' })).toBe('Windows · Failing')
    expect(describeSegment({ sourceKey: 'ManageEngine', status: 'unknown' })).toBe('ManageEngine · Not reported')
    expect(describeSegment({ platform: 'macOS' })).toBe('macOS · All in-scope')
    expect(describeSegment({ status: 'pass' })).toBe('Passing')
  })
})

describe('devicesToCsv', () => {
  it('quotes cells and neutralises spreadsheet formulas from device-supplied text', () => {
    const csv = devicesToCsv([dev({ deviceName: '=HYPERLINK("http://x")', user: 'say "hi", ok' })])
    const [header, row] = csv.split('\n')
    expect(header).toBe('"Device Name","User","Platform","Source","Serial Number","Status","Finding","Missing Items"')
    expect(row).toContain(`"'=HYPERLINK(""http://x"")"`)
    expect(row).toContain('"say ""hi"", ok"')
  })
  it('includes the status and the itemised missing patches', () => {
    const csv = devicesToCsv([dev({ status: 'fail', items: ['KB1 — Update A', 'KB2 — Update B'] })])
    expect(csv.split('\n')[1]).toContain('"Failing","BitLocker Off","KB1 — Update A | KB2 — Update B"')
  })
})
