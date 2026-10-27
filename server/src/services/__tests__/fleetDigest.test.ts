import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../routes/devices.js', () => ({ fetchAllDevices: vi.fn() }))
vi.mock('../endpointCentralPatch.js', () => ({ getPatchSystems: vi.fn(), getFleetCriticalPatches: vi.fn() }))
vi.mock('../fleetDigestReport.js', () => ({ buildFleetDigestWorkbook: vi.fn() }))
vi.mock('../criticalPatchReport.js', () => ({ isSupportedCriticalPatchClient: vi.fn(() => true) }))
vi.mock('../staleDevicesReport.js', () => ({ STALE_DAYS: 30 }))
vi.mock('../slack.js', () => ({ sendSlackBlocks: vi.fn(), uploadSlackFile: vi.fn() }))
vi.mock('../../store/integrationStore.js', () => ({ getSlackConfig: vi.fn() }))
vi.mock('../../store/fleetSnapshotStore.js', () => ({ listSnapshots: vi.fn(() => []), saveSnapshot: vi.fn() }))

import { pickBaseline, formatDelta, buildActions, buildDigestMessage, sendFleetDigest } from '../fleetDigest.js'
import { fetchAllDevices } from '../../routes/devices.js'
import { getPatchSystems, getFleetCriticalPatches } from '../endpointCentralPatch.js'
import { sendSlackBlocks, uploadSlackFile } from '../slack.js'
import { getSlackConfig } from '../../store/integrationStore.js'
import { saveSnapshot } from '../../store/fleetSnapshotStore.js'
import { buildFleetDigestWorkbook } from '../fleetDigestReport.js'
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

describe('sendFleetDigest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getSlackConfig).mockReturnValue({ botToken: 'xoxb-test' } as never)
    vi.mocked(fetchAllDevices).mockResolvedValue({ devices: [{ platform: 'Windows', complianceState: 'Compliant', lastCheckIn: new Date().toISOString() }] as never, mock: false })
    vi.mocked(getPatchSystems).mockResolvedValue([])
    vi.mocked(getFleetCriticalPatches).mockResolvedValue(new Map())
    vi.mocked(sendSlackBlocks).mockResolvedValue({ ok: true, ts: '1700000000.000100' })
    vi.mocked(uploadSlackFile).mockResolvedValue({ ok: true })
    vi.mocked(buildFleetDigestWorkbook).mockResolvedValue(Buffer.from('xlsx'))
  })

  it('sends one message: digest blocks with the workbook attached, and saves the snapshot', async () => {
    const result = await sendFleetDigest('C123')
    expect(result.ok).toBe(true)
    expect(saveSnapshot).toHaveBeenCalledOnce()
    expect(sendSlackBlocks).not.toHaveBeenCalled()
    expect(uploadSlackFile).toHaveBeenCalledOnce()
    const upload = vi.mocked(uploadSlackFile).mock.calls[0]![1]
    expect(upload).toMatchObject({ channelId: 'C123', filename: expect.stringMatching(/^endpoint-fleet-health-\d{4}-\d{2}-\d{2}\.xlsx$/) })
    expect(upload.blocks?.length).toBeGreaterThan(0)
    expect(upload).not.toHaveProperty('initialComment')
  })

  it('does not post or save a snapshot when no devices are returned', async () => {
    vi.mocked(fetchAllDevices).mockResolvedValue({ devices: [], mock: false })
    expect((await sendFleetDigest('C123')).ok).toBe(false)
    expect(uploadSlackFile).not.toHaveBeenCalled()
    expect(saveSnapshot).not.toHaveBeenCalled()
  })

  it('reports an upload failure without saving a snapshot', async () => {
    vi.mocked(uploadSlackFile).mockResolvedValue({ ok: false, error: 'missing_scope' })
    expect(await sendFleetDigest('C123')).toMatchObject({ ok: false, error: 'missing_scope' })
    expect(saveSnapshot).not.toHaveBeenCalled()
  })

  it('falls back to a message without the file when the workbook cannot be built', async () => {
    vi.mocked(buildFleetDigestWorkbook).mockRejectedValue(new Error('boom'))
    const result = await sendFleetDigest('C123')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Digest posted without the Excel report')
    expect(sendSlackBlocks).toHaveBeenCalledOnce()
    expect(uploadSlackFile).not.toHaveBeenCalled()
    expect(saveSnapshot).toHaveBeenCalledOnce()
  })

  it('still sends when Patch Manager is down, with no patch metric', async () => {
    vi.mocked(getPatchSystems).mockRejectedValue(new Error('down'))
    const result = await sendFleetDigest('C123')
    expect(result.ok).toBe(true)
    expect(result.snapshot?.criticalPatchDevices).toBeNull()
  })
})
