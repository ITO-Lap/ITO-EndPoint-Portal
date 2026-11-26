import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Device } from '../../../types.js'

const fetchSourceDevices = vi.fn<(source: string, prev: unknown) => Promise<Device[]>>()
vi.mock('../../deviceSources.js', () => ({ fetchSourceDevices: (s: string, p: unknown) => fetchSourceDevices(s, p) }))
vi.mock('../../intune.js', () => ({ isIntuneConfigured: () => true }))
vi.mock('../../manageEngine.js', () => ({ isManageEngineConfigured: () => true }))
vi.mock('../../../store/deviceSnapshotStore.js', () => ({ loadSourceDevices: () => null }))

const CHECKED_IN = new Date().toISOString()
const dev = (id: string): Device => ({ id, deviceName: `PC-${id}`, user: '', serialNumber: `S-${id}`, platform: 'Windows', osVersion: '11', managementSource: 'Microsoft Intune', lastCheckIn: CHECKED_IN, complianceState: 'Compliant', encryptionStatus: 'Encrypted', primaryIssue: 'None', policyFailed: '', severity: 'Low', confidence: 'High', firstDetected: '', lastDetected: '', issueSource: '' })

describe('file backend keeps the last good data across a restart', () => {
  beforeEach(() => fetchSourceDevices.mockReset())

  it('reloads devices, schedules and status from disk, and closes a job the old process left running', async () => {
    const { createFileBackend } = await import('../fileBackend.js')
    const { __setBackendForTests } = await import('../backend.js')
    const engine = await import('../syncEngine.js')

    const first = createFileBackend({ persist: true })
    ;(first as unknown as { __reset(): void }).__reset()
    __setBackendForTests(first)
    fetchSourceDevices.mockResolvedValue([dev('a'), dev('b'), dev('c')])
    await engine.runSync('intune', 'devices', { trigger: 'manual', actor: 't' })
    await engine.updateSchedule('intune', 'devices', { intervalMinutes: 90 }, 'admin')
    await first.acquire('manageengine', 'devices', 'schedule', null, 10) // the old process dies while this runs

    const second = createFileBackend({ persist: true }) // a "restarted" server reading the same files
    __setBackendForTests(second)
    expect(await second.countActive('intune')).toBe(3)
    expect((await second.loadActive('intune')).map(d => d.id).sort()).toEqual(['a', 'b', 'c'])
    const intune = (await second.statusRows()).find(s => s.source === 'intune')!
    expect(intune).toMatchObject({ intervalMinutes: 90, status: 'succeeded', recordCount: 3 })
    expect(intune.lastSuccessAt).not.toBeNull()
    const me = (await second.statusRows()).find(s => s.source === 'manageengine')!
    expect(me.running).toBe(false) // abandoned job closed, so a new sync can start
    expect(await second.acquire('manageengine', 'devices', 'manual', null, 10)).not.toBeNull()
    __setBackendForTests(null)
  })
})
