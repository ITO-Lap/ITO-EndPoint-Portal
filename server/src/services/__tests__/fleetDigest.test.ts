import { describe, it, expect, vi } from 'vitest'

vi.mock('../../routes/devices.js', () => ({ fetchAllDevices: vi.fn() }))
vi.mock('../endpointCentralPatch.js', () => ({ getPatchSystems: vi.fn() }))
vi.mock('../criticalPatchReport.js', () => ({ isSupportedCriticalPatchClient: vi.fn(() => true) }))
vi.mock('../staleDevicesReport.js', () => ({ STALE_DAYS: 30 }))
vi.mock('../slack.js', () => ({ sendSlackBlocks: vi.fn() }))
vi.mock('../../store/integrationStore.js', () => ({ getSlackConfig: vi.fn() }))
vi.mock('../../store/fleetSnapshotStore.js', () => ({ listSnapshots: vi.fn(() => []), saveSnapshot: vi.fn() }))

import { pickBaseline, formatDelta, buildActions, buildDigestMessage } from '../fleetDigest.js'
import type { FleetSnapshot } from '../../store/fleetSnapshotStore.js'

const snap = (date: string, overrides: Partial<FleetSnapshot> = {}): FleetSnapshot => ({
  date, takenAt: `${date}T08:00:00Z`, total: 100, compliant: 90, warning: 4, nonCompliant: 6, stale: 10,
  criticalPatchDevices: 5, byPlatform: { Windows: 60, macOS: 40 }, ...overrides,
})

describe('pickBaseline', () => {
  it('prefers the snapshot closest to 7 days back', () => {
    const history = [snap('2026-10-13'), snap('2026-10-19'), snap('2026-10-24')]
    expect(pickBaseline(snap('2026-10-26'), history)?.date).toBe('2026-10-19')
  })
  it('ignores snapshots older than 14 days, the same day, and future days', () => {
    const history = [snap('2026-10-01'), snap('2026-10-26'), snap('2026-10-30')]
    expect(pickBaseline(snap('2026-10-26'), history)).toBeNull()
  })
})

describe('formatDelta', () => {
  it('marks a rise in a lower-is-better metric as bad', () => {
    expect(formatDelta(12, 10, true)).toBe(' · 🔴 ▲ 2')
  })
  it('marks a rise in a higher-is-better metric as good, with unit', () => {
    expect(formatDelta(91.4, 90, false, ' pts')).toBe(' · 🟢 ▲ 1.4 pts')
  })
  it('handles no change and a missing baseline', () => {
    expect(formatDelta(5, 5, true)).toBe(' · no change')
    expect(formatDelta(5, null, true)).toBe('')
  })
})

describe('buildActions', () => {
  it('lists patching first, skips zero metrics, caps at three', () => {
    expect(buildActions(snap('2026-10-26'))).toEqual([
      'Patch 5 devices with missing critical patches',
      'Review 6 non-compliant devices',
      'Investigate or retire 10 devices silent for 30+ days',
    ])
    expect(buildActions(snap('2026-10-26', { nonCompliant: 0, stale: 0, criticalPatchDevices: 1 }))).toEqual([
      'Patch 1 device with missing critical patches',
    ])
  })
  it('does not treat unavailable patch data as an action', () => {
    expect(buildActions(snap('2026-10-26', { criticalPatchDevices: null, nonCompliant: 0, stale: 0 }))).toEqual([])
  })
})

describe('buildDigestMessage', () => {
  it('reports unavailable Patch Manager instead of 0 and notes the missing baseline', () => {
    const { text, blocks } = buildDigestMessage(snap('2026-10-26', { criticalPatchDevices: null }), null)
    const json = JSON.stringify(blocks)
    expect(json).toContain('Patch Manager unavailable')
    expect(json).toContain('first digest')
    expect(text).toContain('90% compliant')
  })
  it('includes week-over-week deltas when a baseline exists', () => {
    const { blocks } = buildDigestMessage(snap('2026-10-26', { stale: 7 }), snap('2026-10-19', { stale: 10 }))
    expect(JSON.stringify(blocks)).toContain('🟢 ▼ 3')
    expect(JSON.stringify(blocks)).toContain('vs 2026-10-19')
  })
})
