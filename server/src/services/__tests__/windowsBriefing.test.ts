import { describe, it, expect, vi } from 'vitest'
vi.mock('../../store/integrationStore.js', () => ({ getSlackConfig: vi.fn(() => ({ botToken: 'x' })) }))
vi.mock('../slack.js', () => ({ sendSlackBlocks: vi.fn(async () => ({ ok: true })) }))
import { buildBriefingMessage } from '../windowsBriefing.js'
import type { WindowsIntel } from '../windowsSecurityIntel.js'
import type { WindowsFleetSummary } from '../windowsUpdateFleet.js'

const intel = {
  upcoming: { nextPatchTuesday: { date: '2026-11-10', daysAway: 4 }, nextOptionalPreview: { date: '2026-11-24', daysAway: 18 }, note: '' },
  latestRelease: { title: 'Oct 2026', totals: { cves: 90, critical: 5, exploited: 1, inKev: 1 } },
  earlyRelease: null,
  upcomingEndOfServicing: [{ version: '23H2', build: 22631, daysToEnd: 3 }],
} as unknown as WindowsIntel
const fleet = (exposure: unknown): WindowsFleetSummary => ({ devicesAffected: 10, devicesChecked: 100, builds: [{ build: 22631, devices: 7 }], exposure } as unknown as WindowsFleetSummary)
const text = (m: { blocks: unknown[] }) => JSON.stringify(m.blocks)

describe('buildBriefingMessage', () => {
  it('lists overdue KEV CVEs and ending builds as actions', () => {
    const m = buildBriefingMessage(intel, fleet({ bands: { Critical: 3, High: 1, Medium: 0, Low: 6 }, kevClock: [{ cve: 'CVE-2026-1', status: 'overdue', daysLeft: -5, devices: 4 }] }))
    expect(m.text).toContain('Nov 10, 2026')
    expect(text(m)).toMatch(/CVE-2026-1 \(4 devices, 5d overdue\)/)
    expect(text(m)).toMatch(/7 devices run 23H2, support ends in 3 days/)
    expect(text(m)).toMatch(/3 device in Critical|3 devices in Critical/)
  })
  it('degrades when fleet exposure is unavailable', () => {
    const m = buildBriefingMessage(intel, fleet(null))
    expect(text(m)).toMatch(/Fleet exposure unavailable/)
  })
  it('says there is nothing urgent when nothing applies', () => {
    const quiet = { ...intel, upcomingEndOfServicing: [] } as unknown as WindowsIntel
    expect(text(buildBriefingMessage(quiet, fleet({ bands: { Critical: 0, High: 0, Medium: 0, Low: 5 }, kevClock: [] })))).toMatch(/No urgent actions/)
  })
})
