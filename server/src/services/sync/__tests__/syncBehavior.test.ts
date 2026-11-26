// The sync must behave the same whether data lives in local files or in PostgreSQL. This suite runs against
// the file backend always, and against PostgreSQL on PGlite (real PostgreSQL in WebAssembly) when the dev
// dependency is installed: `npm i -D @electric-sql/pglite` in server/.

import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest'
import type { Device } from '../../../types.js'
import type { SyncBackend } from '../backend.js'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
type Pg = { query(sql: string, params?: unknown[]): Promise<{ rows: Row[]; affectedRows?: number }>; exec(sql: string): Promise<Array<{ rows: Row[] }>> }
let pg: Pg
const pgliteAvailable = await import(/* @vite-ignore */ '@electric-sql/pglite' as string).then(() => true, () => false)

vi.mock('../../../db/index.js', () => ({
  isDbAvailable: () => true,
  query: async (sql: string, params?: unknown[]) => { const r = await pg.query(sql, params); return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length } },
}))
const fetchSourceDevices = vi.fn<(source: string, prev: unknown) => Promise<Device[]>>()
vi.mock('../../deviceSources.js', () => ({ fetchSourceDevices: (s: string, p: unknown) => fetchSourceDevices(s, p) }))
vi.mock('../../intune.js', () => ({ isIntuneConfigured: () => true }))
vi.mock('../../manageEngine.js', () => ({ isManageEngineConfigured: () => true }))
const refreshApps = vi.fn()
const refreshPatches = vi.fn()
vi.mock('../../endpointCentralSoftware.js', () => ({ refreshEndpointCentralAppInventory: (tick?: () => Promise<unknown>) => refreshApps(tick) }))
vi.mock('../../endpointCentralPatch.js', () => ({ refreshPatchData: () => refreshPatches() }))
const posture = vi.fn()
const pillarRows = vi.fn()
vi.mock('../../../routes/securityPosture.js', () => ({ getPostureResult: () => posture(), getPillarDeviceList: (o: unknown) => pillarRows(o) }))
vi.mock('../../../store/deviceSnapshotStore.js', () => ({ loadSourceDevices: () => null }))

const CHECKED_IN = new Date().toISOString() // fixed, so two fetches of the same fleet really are identical
const dev = (id: string, o: Partial<Device> = {}): Device => ({ id, deviceName: `PC-${id}`, user: 'a@x.com', serialNumber: `S-${id}`, platform: 'Windows', osVersion: '11', managementSource: 'Microsoft Intune', lastCheckIn: CHECKED_IN, complianceState: 'Compliant', encryptionStatus: 'Encrypted', primaryIssue: 'None', policyFailed: '', severity: 'Low', confidence: 'High', firstDetected: '', lastDetected: '', issueSource: '', ...o })
const fleet = (n: number, o: Partial<Device> = {}) => Array.from({ length: n }, (_, i) => dev(`i${i}`, o))

const kinds = [{ name: 'file', available: true }, { name: 'postgres', available: pgliteAvailable }] as const

describe.each(kinds)('sync behaviour on $name storage', ({ name, available }) => {
  describe.skipIf(!available)('', () => {
    let engine: typeof import('../syncEngine.js')
    let backendMod: typeof import('../backend.js')
    let store: SyncBackend

    beforeAll(async () => {
      engine = await import('../syncEngine.js')
      backendMod = await import('../backend.js')
      if (name === 'postgres') {
        const { PGlite } = await import(/* @vite-ignore */ '@electric-sql/pglite' as string)
        pg = new PGlite() as Pg
        const { runMigrations } = await import('../../../db/migrate.js')
        await runMigrations({ query: async (sql, p) => p ? pg.query(sql, p) : { rows: (await pg.exec(sql)).at(-1)?.rows ?? [] } })
        store = (await import('../pgBackend.js')).pgBackend
      } else {
        store = (await import('../fileBackend.js')).createFileBackend({ persist: false })
      }
      backendMod.__setBackendForTests(store)
    })

    afterEach(() => { vi.useRealTimers() })

    beforeEach(async () => {
      fetchSourceDevices.mockReset(); refreshApps.mockReset(); refreshPatches.mockReset(); posture.mockReset(); pillarRows.mockReset()
      engine.__resetTickForTests()
      if (name === 'postgres') {
        await pg.exec('TRUNCATE devices, sync_jobs, sync_logs, stale_device_status, security_findings RESTART IDENTITY CASCADE')
        await pg.exec(`UPDATE sync_sources SET last_attempt_at = NULL, last_success_at = NULL, last_status = 'never', last_error = NULL, last_record_count = NULL, enabled = true,
          interval_minutes = CASE module WHEN 'applications' THEN 480 WHEN 'patches' THEN 1440 WHEN 'findings' THEN 60 ELSE 45 END`)
      } else (store as unknown as { __reset(): void }).__reset()
    })

    const sync = (source: 'intune' | 'manageengine' = 'intune') => engine.runSync(source, 'devices', { trigger: 'manual', actor: 'test@x.com' })
    const active = (source: 'intune' | 'manageengine' = 'intune') => store.countActive(source)
    const status = async (source = 'intune') => (await engine.getSyncStatus()).find(s => s.source === source)!

    it('creates new records, then updates nothing when the data is identical', async () => {
      fetchSourceDevices.mockResolvedValue(fleet(5))
      expect((await sync()).counts).toMatchObject({ fetched: 5, created: 5, updated: 0, unchanged: 0 })
      const before = (await store.getRecord('intune', 'i0'))!.updatedAt
      fetchSourceDevices.mockResolvedValue(fleet(5))
      expect((await sync()).counts).toMatchObject({ created: 0, updated: 0, unchanged: 5 })
      expect((await store.getRecord('intune', 'i0'))!.updatedAt).toBe(before) // not rewritten
      expect(await active()).toBe(5)
    })

    it('updates only the record whose data changed', async () => {
      const base = fleet(3)
      fetchSourceDevices.mockResolvedValue(base)
      await sync()
      fetchSourceDevices.mockResolvedValue([base[0]!, { ...base[1]!, osVersion: '12' }, base[2]!])
      expect((await sync()).counts).toMatchObject({ created: 0, updated: 1, unchanged: 2 })
      expect((await store.getRecord('intune', 'i1'))!.device.osVersion).toBe('12')
      expect(await active()).toBe(3)
    })

    it('never duplicates: repeats in one response collapse, and the same ID from another source stays separate', async () => {
      fetchSourceDevices.mockResolvedValue([dev('x'), dev('x', { osVersion: '12' }), dev('y')])
      expect((await sync()).counts).toMatchObject({ fetched: 3, duplicatesInResponse: 1, created: 2 })
      expect((await store.getRecord('intune', 'x'))!.device.osVersion).toBe('12')
      fetchSourceDevices.mockResolvedValue([dev('x', { managementSource: 'ManageEngine' })])
      await sync('manageengine')
      expect(await active('intune')).toBe(2)
      expect(await active('manageengine')).toBe(1)
    })

    it('retires a device only after consecutive complete syncs without it, never deletes it, and reactivates it', async () => {
      fetchSourceDevices.mockResolvedValue(fleet(4))
      await sync()
      fetchSourceDevices.mockResolvedValue(fleet(4).slice(0, 3))
      expect((await sync()).counts?.retired).toBe(0)
      expect((await store.getRecord('intune', 'i3'))!.active).toBe(true) // one miss is not enough
      expect((await sync()).counts?.retired).toBe(1)
      const retired = (await store.getRecord('intune', 'i3'))!
      expect(retired).toMatchObject({ active: false })
      expect(retired.retiredAt).not.toBeNull() // still stored, marked retired
      expect(await active()).toBe(3)
      fetchSourceDevices.mockResolvedValue(fleet(4))
      expect((await sync()).counts?.reactivated).toBe(1)
      expect((await store.getRecord('intune', 'i3'))!.active).toBe(true)
    })

    it('keeps stored data and the last success time when the API fails, and stores no secret', async () => {
      fetchSourceDevices.mockResolvedValue(fleet(4))
      await sync()
      const good = (await status()).lastSuccessAt
      expect(good).not.toBeNull()
      fetchSourceDevices.mockRejectedValue(new Error('Graph 503 Bearer abc.def.ghi client_secret=topsecret'))
      expect((await sync()).outcome).toBe('failed')
      expect(await active()).toBe(4)
      const s = await status()
      expect(s).toMatchObject({ status: 'failed', stale: true, lastSuccessAt: good, recordCount: 4 })
      const logs = await engine.recentLogs('intune', 'devices')
      expect(JSON.stringify([s.lastError, logs])).not.toMatch(/topsecret|abc\.def\.ghi/)
    })

    it('never lets an empty answer wipe stored data', async () => {
      fetchSourceDevices.mockResolvedValue(fleet(4))
      await sync()
      fetchSourceDevices.mockResolvedValue([])
      expect((await sync()).outcome).toBe('failed')
      expect(await active()).toBe(4)
    })

    it('treats a much smaller answer as partial: updates it, retires nothing, does not move last success', async () => {
      fetchSourceDevices.mockResolvedValue(fleet(40))
      await sync()
      const good = (await status()).lastSuccessAt
      fetchSourceDevices.mockResolvedValue(fleet(40).slice(0, 5))
      await sync()
      const r = await sync()
      expect(r.outcome).toBe('partial')
      expect(r.counts?.retired).toBe(0)
      expect(await active()).toBe(40)
      expect(await status()).toMatchObject({ status: 'partial', stale: true, lastSuccessAt: good })
    })

    it('refuses a second sync for the same source while one is running, but other sources are independent', async () => {
      const job = await store.acquire('intune', 'devices', 'schedule', null, 10)
      expect(job).not.toBeNull()
      fetchSourceDevices.mockResolvedValue(fleet(2))
      expect((await sync()).status).toBe('already_running')
      expect(fetchSourceDevices).not.toHaveBeenCalled()
      expect(await active()).toBe(0)
      expect(await store.acquire('manageengine', 'devices', 'manual', null, 10)).not.toBeNull()
      expect((await status()).running).toBe(true)
    })

    it('joins concurrent callers in this process instead of starting two syncs', async () => {
      fetchSourceDevices.mockImplementation(async () => { await new Promise(r => setTimeout(r, 30)); return fleet(2) })
      const [a, b] = await Promise.all([sync(), sync()])
      expect(fetchSourceDevices).toHaveBeenCalledTimes(1)
      expect(a.jobId).toBe(b.jobId)
    })

    it('records a stale transition once, not on every sync', async () => {
      const old = new Date(Date.now() - 40 * 86_400_000).toISOString()
      fetchSourceDevices.mockResolvedValue([dev('s1', { lastCheckIn: old }), dev('f1')])
      await sync(); await sync(); await sync()
      fetchSourceDevices.mockResolvedValue([dev('s1'), dev('f1')])
      expect((await sync()).outcome).toBe('succeeded')
      expect(await active()).toBe(2)
    })

    it('shows imported snapshot data without claiming a live success', async () => {
      const r = await engine.runSync('intune', 'devices', { trigger: 'import', actor: 'snapshot-import', devices: fleet(3) })
      expect(r.outcome).toBe('succeeded')
      expect(await status()).toMatchObject({ lastSuccessAt: null, status: 'never', recordCount: 3 })
    })

    it('validates and saves schedules', async () => {
      expect(await engine.updateSchedule('intune', 'devices', { intervalMinutes: 60, enabled: false }, 'admin@x.com')).toMatchObject({ intervalMinutes: 60, enabled: false })
      await expect(engine.updateSchedule('intune', 'devices', { intervalMinutes: 3 }, 'a')).rejects.toThrow(RangeError)
      await expect(engine.updateSchedule('intune', 'devices', { intervalMinutes: 30.5 }, 'a')).rejects.toThrow(RangeError)
    })

    it('serves the stored fleet without calling the API', async () => {
      fetchSourceDevices.mockResolvedValue(fleet(3))
      await sync()
      fetchSourceDevices.mockClear()
      expect((await store.loadActive()).map(d => d.id).sort()).toEqual(['i0', 'i1', 'i2'])
      expect(fetchSourceDevices).not.toHaveBeenCalled()
    })

    const syncModule = (module: 'applications' | 'patches') => engine.runSync('manageengine', module, { trigger: 'manual', actor: 'test@x.com' })
    const row = async (module: string) => (await engine.getSyncStatus()).find(s => s.source === 'manageengine' && s.module === module)!

    describe('application inventory and patch data modules', () => {
      it('start with the agreed schedules: applications every 8 hours, patches daily', async () => {
        expect(await row('applications')).toMatchObject({ intervalMinutes: 480, enabled: true, status: 'never' })
        expect(await row('patches')).toMatchObject({ intervalMinutes: 1440, enabled: true, status: 'never' })
      })

      it('record a successful inventory refresh with its app count, and keep the heartbeat going during the long scan', async () => {
        refreshApps.mockImplementation(async (tick?: () => Promise<unknown>) => { await tick?.(); await tick?.(); return { apps: 412, devices: 100, scanned: 100, failed: 2 } })
        expect((await syncModule('applications')).outcome).toBe('succeeded')
        expect(await row('applications')).toMatchObject({ status: 'succeeded', recordCount: 412, stale: false })
        expect((await row('applications')).lastSuccessAt).not.toBeNull()
      })

      it('report partial when many devices could not be read, and keep the last success time', async () => {
        refreshApps.mockResolvedValue({ apps: 400, devices: 100, scanned: 100, failed: 0 })
        await syncModule('applications')
        const good = (await row('applications')).lastSuccessAt
        refreshApps.mockResolvedValue({ apps: 380, devices: 100, scanned: 80, failed: 20, failureReasons: [{ reason: 'Endpoint Central inventory API 404', devices: 15 }, { reason: 'rate limited (retries used up)', devices: 5 }] })
        expect((await syncModule('applications')).outcome).toBe('partial')
        expect(await row('applications')).toMatchObject({ status: 'partial', stale: true, lastSuccessAt: good, recordCount: 380 })
        expect((await row('applications')).lastError).toContain('20 of 100')
        expect((await row('applications')).lastError).toContain('Main causes: Endpoint Central inventory API 404 for 15; rate limited (retries used up) for 5.')
      })

      it('fail, without claiming success, when the scan throws or reads nothing', async () => {
        refreshApps.mockRejectedValue(new Error('Endpoint Central 503 Bearer abc.def.ghi'))
        expect((await syncModule('applications')).outcome).toBe('failed')
        expect((await row('applications')).lastError).not.toContain('abc.def.ghi')
        refreshApps.mockResolvedValue({ apps: 0, devices: 50, scanned: 0, failed: 50 })
        expect((await syncModule('applications')).outcome).toBe('failed')
        refreshApps.mockResolvedValue({ apps: 0, devices: 0, scanned: 0, failed: 0 })
        expect((await syncModule('applications')).outcome).toBe('failed')
        expect((await row('applications')).lastSuccessAt).toBeNull()
      })

      it('patch refresh: succeeds with the system count; says detail is unavailable when the scope is missing; fails on an empty list', async () => {
        refreshPatches.mockResolvedValue({ systems: 300, devicesMissingCritical: 12, criticalAvailable: true })
        expect((await syncModule('patches')).outcome).toBe('succeeded')
        expect(await row('patches')).toMatchObject({ status: 'succeeded', recordCount: 300 })
        refreshPatches.mockResolvedValue({ systems: 300, devicesMissingCritical: 0, criticalAvailable: false, criticalNote: 'scope' })
        expect((await syncModule('patches')).outcome).toBe('partial')
        expect((await row('patches')).lastError).toContain('not available through the current API connection')
        refreshPatches.mockResolvedValue({ systems: 0, devicesMissingCritical: 0, criticalAvailable: true })
        expect((await syncModule('patches')).outcome).toBe('failed')
      })

      it('each module has its own lock: a running device sync does not block patches', async () => {
        await store.acquire('manageengine', 'devices', 'schedule', null, 10)
        refreshPatches.mockResolvedValue({ systems: 5, devicesMissingCritical: 0, criticalAvailable: true })
        expect((await syncModule('patches')).outcome).toBe('succeeded')
      })

      it('enforces each module\'s own interval limits', async () => {
        await expect(engine.updateSchedule('manageengine', 'applications', { intervalMinutes: 30 }, 'a')).rejects.toThrow(RangeError)
        await expect(engine.updateSchedule('manageengine', 'patches', { intervalMinutes: 1441 }, 'a')).rejects.toThrow(RangeError)
        expect(await engine.updateSchedule('manageengine', 'applications', { intervalMinutes: 720 }, 'a')).toMatchObject({ intervalMinutes: 720 })
        expect(await engine.updateSchedule('manageengine', 'devices', { intervalMinutes: 15 }, 'a')).toMatchObject({ intervalMinutes: 15 })
      })

      it('the scheduler runs one source\'s due modules one after another: devices, patches, then the long inventory scan', async () => {
        const order: string[] = []
        let running = 0, maxRunning = 0
        const track = (name: string) => async () => { order.push(name); running++; maxRunning = Math.max(maxRunning, running); await new Promise(r => setTimeout(r, 15)); running--; return null }
        fetchSourceDevices.mockImplementation(async (src: string) => { if (src === 'manageengine') await track('devices')(); return fleet(2) })
        refreshPatches.mockImplementation(async () => { await track('patches')(); return { systems: 5, devicesMissingCritical: 0, criticalAvailable: true } })
        refreshApps.mockImplementation(async () => { await track('applications')(); return { apps: 5, devices: 5, scanned: 5, failed: 0 } })
        posture.mockResolvedValue({ pillars: [] }) // findings run: nothing assessable, which is fine for this ordering test
        expect(await engine.startDueSyncs('schedule')).toBe(5) // intune devices, three manageengine modules, security findings
        for (let i = 0; i < 100 && order.length < 3; i++) await new Promise(r => setTimeout(r, 10))
        await new Promise(r => setTimeout(r, 120))
        expect(order).toEqual(['devices', 'patches', 'applications'])
        expect(maxRunning).toBe(1) // never two at once for the shared Endpoint Central rate limit
      })
    })

    describe('security findings history', () => {
      const pillar = (id: string, o: Record<string, unknown> = {}) => ({ id, label: id, assessed: 10, failing: 1, ...o })
      const frow = (id: string, detail = 'BitLocker off') => ({ id, deviceName: `PC-${id}`, platform: 'Windows', source: 'Microsoft Intune', detail })
      /** One run: `failing` maps pillar id -> device ids failing now. */
      const run = async (failing: Record<string, string[]>, pillars = Object.keys(failing).map(id => pillar(id)), detail?: string) => {
        posture.mockResolvedValue({ pillars })
        pillarRows.mockImplementation(async (o: { pillarId: string }) => ({ rows: (failing[o.pillarId] ?? []).map(id => frow(id, detail)), totalPages: 1 }))
        return engine.runSync('portal', 'findings', { trigger: 'manual', actor: 't' })
      }
      const f = async (st?: 'open' | 'resolved') => (await store.listFindings(st ? { status: st } : {}))

      it('starts hourly, and opens a finding the first time a check fails', async () => {
        expect(await engine.getSyncStatus().then(r => r.find(x => x.module === 'findings'))).toMatchObject({ source: 'portal', intervalMinutes: 60, configured: true })
        const r = await run({ encryption: ['a', 'b'], patching: ['a'] })
        expect(r.outcome).toBe('succeeded')
        expect(await store.countFindings('open')).toBe(3)
        expect((await engine.getSyncStatus()).find(x => x.module === 'findings')!.recordCount).toBe(3)
        const all = await f('open')
        expect(all.map(x => `${x.pillar}:${x.deviceId}`).sort()).toEqual(['encryption:a', 'encryption:b', 'patching:a'])
        expect(all[0]!.firstSeenAt).toBe(all[0]!.lastSeenAt)
      })

      it('keeps when it was first seen, resolves it when the check passes, and reopens it if it fails again', async () => {
        await run({ encryption: ['a', 'b'] })
        const first = (await f('open')).find(x => x.deviceId === 'a')!.firstSeenAt
        await new Promise(r => setTimeout(r, 15))
        await run({ encryption: ['a'] }) // b fixed
        const open = await f('open'); const done = await f('resolved')
        expect(open.map(x => x.deviceId)).toEqual(['a'])
        expect(open[0]!.firstSeenAt).toBe(first) // history preserved
        expect(done.map(x => x.deviceId)).toEqual(['b'])
        expect(done[0]!.resolvedAt).not.toBeNull()
        await run({ encryption: ['a', 'b'] }) // b fails again
        const back = (await f('open')).find(x => x.deviceId === 'b')!
        expect(back).toMatchObject({ status: 'open', resolvedAt: null, reopenedCount: 1 })
      })

      it('never resolves a pillar that could not be assessed, and says so', async () => {
        await run({ patching: ['a', 'b'], encryption: ['c'] })
        const r = await run({ encryption: ['c'] }, [pillar('encryption'), pillar('patching', { unavailableReason: 'Patch Manager data could not be loaded.', assessed: 0 })])
        expect(r.outcome).toBe('partial')
        expect(r.error).toContain('not assessable')
        expect((await f('open')).map(x => `${x.pillar}:${x.deviceId}`).sort()).toEqual(['encryption:c', 'patching:a', 'patching:b']) // patching untouched
        expect(await f('resolved')).toHaveLength(0)
      })

      it('does not turn a sudden near-total drop into a wave of resolved findings', async () => {
        const many = Array.from({ length: 40 }, (_, i) => `d${i}`)
        await run({ compliance: many })
        const r = await run({ compliance: ['d0', 'd1'] }) // 2 of 40 still seen: looks like a partial read
        expect(r.outcome).toBe('partial')
        expect(await store.countFindings('open', 'compliance')).toBe(40)
        expect(await store.countFindings('resolved')).toBe(0)
        await run({ compliance: many.slice(0, 30) }) // a normal improvement (10 fixed) is resolved
        expect(await store.countFindings('open', 'compliance')).toBe(30)
        expect(await store.countFindings('resolved', 'compliance')).toBe(10)
      })

      it('fails, leaving history unchanged, when nothing can be assessed or the posture read throws', async () => {
        await run({ encryption: ['a'] })
        expect((await run({}, [pillar('encryption', { assessed: 0, unavailableReason: 'x' })])).outcome).toBe('failed')
        posture.mockRejectedValue(new Error('boom client_secret=hunter2'))
        const r = await engine.runSync('portal', 'findings', { trigger: 'manual', actor: 't' })
        expect(r.outcome).toBe('failed')
        expect(await store.countFindings('open')).toBe(1)
        expect((await engine.getSyncStatus()).find(x => x.module === 'findings')!.lastError).not.toContain('hunter2')
      })

      it('lists and filters history by status and check', async () => {
        await run({ encryption: ['a'], patching: ['a', 'b'] })
        await run({ encryption: ['a'], patching: ['a'] })
        expect((await store.listFindings({ pillar: 'patching' })).map(x => x.status).sort()).toEqual(['open', 'resolved'])
        expect(await store.listFindings({ status: 'open', pillar: 'patching', limit: 1 })).toHaveLength(1)
        expect(await store.countFindings('resolved')).toBe(1)
      })
    })

    it('reclaims the lock of a job that died, but not a live one', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      await store.acquire('intune', 'devices', 'schedule', null, 10)
      if (name === 'postgres') await pg.exec(`UPDATE sync_jobs SET heartbeat_at = NOW() - INTERVAL '1 hour'`)
      else vi.setSystemTime(Date.now() + 11 * 60_000)
      fetchSourceDevices.mockResolvedValue(fleet(2))
      expect((await sync()).outcome).toBe('succeeded')
    })
  })
})

describe.skipIf(!pgliteAvailable)('postgres-only guarantees', () => {
  it('has a unique key on (source, external_id) and a partial unique index as the lock', async () => {
    if (!pg) return
    await pg.exec('TRUNCATE devices, sync_jobs RESTART IDENTITY CASCADE')
    await pg.query(`INSERT INTO devices (source, external_id, payload, payload_hash) VALUES ('intune','x','{}','h')`)
    await expect(pg.query(`INSERT INTO devices (source, external_id, payload, payload_hash) VALUES ('intune','x','{}','h')`)).rejects.toThrow()
    await pg.query(`INSERT INTO sync_jobs (source, module, trigger) VALUES ('intune','devices','schedule')`)
    await expect(pg.query(`INSERT INTO sync_jobs (source, module, trigger) VALUES ('intune','devices','manual')`)).rejects.toThrow()
  })
  it('migrations are idempotent', async () => {
    if (!pg) return
    const { runMigrations } = await import('../../../db/migrate.js')
    expect(await runMigrations({ query: async (sql, p) => p ? pg.query(sql, p) : { rows: (await pg.exec(sql)).at(-1)?.rows ?? [] } })).toEqual([])
  })
})
