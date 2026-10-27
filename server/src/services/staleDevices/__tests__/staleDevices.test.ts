import { describe, it, expect } from 'vitest'
import { classifyEcDevice, classifyIntuneDevice, evaluateDevices, normalizeSerial, toIsoUtc } from '../normalize.js'
import type { RawEcDevice, RawIntuneDevice } from '../normalize.js'
import { createStaleDevicesService } from '../service.js'
import { csvCell, filterDevices, inBucket, sortDevices, summarize, toCsv } from '../query.js'
import type { SourceMeta, SourceRecord, StaleSnapshot } from '../types.js'

const NOW = Date.parse('2026-10-20T06:00:00Z')
const daysAgo = (d: number): string => new Date(NOW - d * 86_400_000).toISOString()

const meta = (state: SourceMeta['state'] = 'ok'): SourceMeta => ({ state, lastAttemptAt: daysAgo(0), lastSuccessAt: state === 'ok' ? daysAgo(0) : null, error: state === 'error' ? 'boom' : null, inScope: 0 })

const intune = (over: RawIntuneDevice = {}): RawIntuneDevice => ({
  id: 'i-1', deviceName: 'WIN-001', operatingSystem: 'Windows', osVersion: '10.0.22631.4037', serialNumber: 'SN-ABC-123',
  userDisplayName: 'Asha Rao', userPrincipalName: 'asha@zinnia.com', emailAddress: 'asha@zinnia.com', lastSyncDateTime: daysAgo(1),
  azureADDeviceId: 'AAAA-1', managementAgent: 'mdm', ...over,
})
const ec = (over: RawEcDevice = {}): RawEcDevice => ({
  device_id: 'e-1', device_name: 'WIN-001', serial_number: 'SN-ABC-123', platform_type: 'Windows', os_version: '10.0.22631',
  last_contact_time: Date.parse(daysAgo(1)), user: { user_email: 'asha@zinnia.com', user_name: 'Asha' }, ...over,
})
const mac = (over: RawEcDevice = {}): RawEcDevice => ({ device_id: 'm-1', device_name: 'MBP-1', serial_number: 'C02XYZ123', platform_type: 'iOS', model: 'MacBook Pro', os_version: '14.5', last_contact_time: Date.parse(daysAgo(1)), user: { user_email: 'ravi@zinnia.com', user_name: 'Ravi' }, ...over })

function build(i: RawIntuneDevice[], e: RawEcDevice[], states: { intune?: SourceMeta['state']; ec?: SourceMeta['state'] } = {}): StaleSnapshot {
  const keep = (r: ReturnType<typeof classifyIntuneDevice>): SourceRecord[] => (r.include ? [r.record] : [])
  return {
    intune: i.flatMap(r => keep(classifyIntuneDevice(r))), endpointCentral: e.flatMap(r => keep(classifyEcDevice(r))),
    meta: { intune: meta(states.intune), 'endpoint-central': meta(states.ec) }, syncedAt: daysAgo(0),
  }
}
const run = (i: RawIntuneDevice[], e: RawEcDevice[], states?: Parameters<typeof build>[2]) => evaluateDevices({ snapshot: build(i, e, states), now: NOW })

describe('stale rule', () => {
  it('1. Intune-only Windows device with last sync older than 21 days is stale', () => {
    const [d] = run([intune({ serialNumber: null, lastSyncDateTime: daysAgo(30) })], [])
    expect(d).toMatchObject({ staleStatus: 'stale', managedBy: 'Intune', effectiveSource: 'intune', inactiveDays: 30 })
    expect(d!.explanation).toBe('Stale because the latest verified check-in was 30 days ago from Intune.')
  })

  it('2. Endpoint Central-only macOS device older than 21 days is stale', () => {
    const [d] = run([], [mac({ last_contact_time: Date.parse(daysAgo(28)) })])
    expect(d).toMatchObject({ staleStatus: 'stale', platform: 'macOS', managedBy: 'Endpoint Central', inactiveDays: 28 })
    expect(d!.explanation).toBe('Stale because the latest verified check-in was 28 days ago from Endpoint Central.')
  })

  it('3. Windows device with Intune stale but Endpoint Central recent is source_drift, not stale', () => {
    const [d] = run([intune({ lastSyncDateTime: daysAgo(40) })], [ec({ last_contact_time: Date.parse(daysAgo(2)) })])
    expect(d).toMatchObject({ staleStatus: 'source_drift', effectiveSource: 'endpoint-central', managedBy: 'Intune + Endpoint Central' })
    const [rev] = run([intune({ lastSyncDateTime: daysAgo(1) })], [ec({ last_contact_time: Date.parse(daysAgo(50)) })])
    expect(rev!.staleStatus).toBe('source_drift')
  })

  it('4. Windows device with both sources older than 21 days is stale, using the latest of the two', () => {
    const [d] = run([intune({ lastSyncDateTime: daysAgo(40) })], [ec({ last_contact_time: Date.parse(daysAgo(25)) })])
    expect(d).toMatchObject({ staleStatus: 'stale', effectiveSource: 'endpoint-central', inactiveDays: 25 })
  })

  it('uses a strict 21-day cutoff in UTC', () => {
    const exactly = run([intune({ serialNumber: null, lastSyncDateTime: daysAgo(21) })], [])[0]!
    const justOver = run([intune({ serialNumber: null, lastSyncDateTime: new Date(NOW - 21 * 86_400_000 - 1000).toISOString() })], [])[0]!
    expect(exactly.staleStatus).toBe('active')
    expect(justOver.staleStatus).toBe('stale')
  })

  it('7. a missing, sentinel or implausible timestamp is no_checkin_data, never stale', () => {
    for (const lastSyncDateTime of [null, '', '0001-01-01T00:00:00Z', 'not-a-date', daysAgo(-30)]) {
      const [d] = run([intune({ serialNumber: null, lastSyncDateTime })], [])
      expect(d!.staleStatus).toBe('no_checkin_data')
      expect(d!.inactiveDays).toBeNull()
    }
    expect(run([], [mac({ last_contact_time: undefined })])[0]!.staleStatus).toBe('no_checkin_data')
    expect(run([], [mac({ last_contact_time: 0 })])[0]!.staleStatus).toBe('no_checkin_data')
  })

  it('a source with no timestamp does not make a recently-seen device stale', () => {
    const [d] = run([intune({ lastSyncDateTime: null })], [ec({ last_contact_time: Date.parse(daysAgo(3)) })])
    expect(d!.staleStatus).toBe('active')
  })
})

describe('scope', () => {
  it('5. Android, iOS, iPadOS and macOS Intune records are excluded', () => {
    const rows = ['Android', 'iOS', 'iPadOS', 'macOS', 'Linux', 'Windows Phone'].map((operatingSystem, n) => intune({ id: `x${n}`, operatingSystem, serialNumber: `SER-${n}000`, lastSyncDateTime: daysAgo(90) }))
    expect(build(rows, []).intune).toHaveLength(0)
    expect(run(rows, [])).toHaveLength(0)
  })

  it('Endpoint Central keeps Windows clients and Macs only', () => {
    const snap = build([], [ec(), mac(), mac({ device_id: 'a', platform_type: 'Android', model: 'Pixel' }), mac({ device_id: 'p', platform_type: 'iOS', model: 'iPhone 15' }), mac({ device_id: 'u', platform_type: undefined, model: undefined })])
    expect(snap.endpointCentral.map(r => r.platform).sort()).toEqual(['Windows', 'macOS'])
  })

  it('6. Windows Server is excluded before caching, counting and export', () => {
    const servers = [
      intune({ id: 's1', operatingSystem: 'Windows Server 2022', serialNumber: 'SRV-0001', lastSyncDateTime: daysAgo(90) }),
      intune({ id: 's2', osVersion: '10.0.20348.2113', serialNumber: 'SRV-0002', lastSyncDateTime: daysAgo(90) }),
    ]
    const ecServers = [ec({ device_id: 's3', os_version: 'Windows Server 2019 Standard', serial_number: 'SRV-0003', last_contact_time: Date.parse(daysAgo(90)) }), ec({ device_id: 's4', model: 'Windows Server', serial_number: 'SRV-0004' })]
    const snap = build(servers, ecServers)
    expect(snap.intune).toHaveLength(0)
    expect(snap.endpointCentral).toHaveLength(0)
    const devices = evaluateDevices({ snapshot: snap, now: NOW })
    expect(summarize(devices)).toMatchObject({ staleWindows: 0, totalInScope: 0, needsReview: 0 })
    expect(toCsv(devices, 'UTC').trim().split('\r\n')).toHaveLength(1) // header only
    expect(JSON.stringify(snap)).not.toMatch(/SRV-000/)
  })

  it('an unclassifiable Windows record goes to needs_review, outside the stale totals', () => {
    const [d] = run([intune({ osVersion: '10.0.17763.5329', serialNumber: null, lastSyncDateTime: daysAgo(60) })], [])
    expect(d!.staleStatus).toBe('needs_review')
    const [e] = run([], [ec({ os_version: undefined, model: undefined, product_name: undefined, last_contact_time: Date.parse(daysAgo(60)) })])
    expect(e!.staleStatus).toBe('needs_review')
    expect(summarize([d!, e!])).toMatchObject({ staleWindows: 0, needsReview: 2, totalInScope: 0 })
  })

  it('an Exchange ActiveSync-only Intune record is not treated as a management check-in', () => {
    const [d] = run([intune({ managementAgent: 'eas', serialNumber: null, lastSyncDateTime: daysAgo(60) })], [])
    expect(d!.staleStatus).toBe('needs_review')
  })
})

describe('correlation', () => {
  it('8. matching serial numbers produce one unified "Intune + Endpoint Central" device', () => {
    const devices = run([intune({ serialNumber: 'sn-abc 123' })], [ec({ device_name: 'DIFFERENT-NAME', serial_number: 'SN-ABC 123' })])
    expect(devices).toHaveLength(1)
    expect(devices[0]).toMatchObject({ managedBy: 'Intune + Endpoint Central', intuneDeviceId: 'i-1', endpointCentralDeviceId: 'e-1', correlationConfidence: 'high' })
  })

  it('9. the same device name without a strong identifier is not merged and is held for review', () => {
    const devices = run([intune({ serialNumber: null, lastSyncDateTime: daysAgo(60) })], [ec({ serial_number: null, last_contact_time: Date.parse(daysAgo(2)) })])
    expect(devices).toHaveLength(2)
    expect(devices.every(d => d.staleStatus === 'needs_review' && d.correlationConfidence === 'unresolved')).toBe(true)
    expect(devices[0]!.possibleDuplicateOf).toEqual(['WIN-001'])
    expect(summarize(devices)).toMatchObject({ staleWindows: 0, totalInScope: 0 })
  })

  it('placeholder serials never correlate', () => {
    for (const serial of ['To Be Filled By O.E.M.', 'Unknown', '0', '123456789', 'Default string', 'AAAAAAAA']) expect(normalizeSerial(serial)).toBeNull()
    const devices = run([intune({ serialNumber: 'Default string', deviceName: 'A' })], [ec({ serial_number: 'Default string', device_name: 'B' })])
    expect(devices).toHaveLength(2)
  })

  it('duplicate Intune records for one serial collapse to one device using the newest sync', () => {
    const [d, ...rest] = run([intune({ id: 'old', lastSyncDateTime: daysAgo(80) }), intune({ id: 'new', lastSyncDateTime: daysAgo(2), azureADDeviceId: 'BBBB' })], [])
    expect(rest).toHaveLength(0)
    expect(d).toMatchObject({ staleStatus: 'active', intuneDeviceId: 'new' })
  })

  it('takes user details from Intune first, Endpoint Central only as a fallback, and never from the hostname', () => {
    expect(run([intune()], [ec({ user: { user_email: 'other@zinnia.com', user_name: 'Other' } })])[0]).toMatchObject({ username: 'Asha Rao', email: 'asha@zinnia.com' })
    expect(run([intune({ userDisplayName: '', userPrincipalName: '', emailAddress: '' })], [ec()])[0]).toMatchObject({ email: 'asha@zinnia.com' })
    const none = run([intune({ userDisplayName: '', userPrincipalName: '', emailAddress: '', deviceName: 'jsmith-laptop', serialNumber: null })], [])[0]!
    expect([none.username, none.email]).toEqual(['', ''])
  })
})

describe('source availability', () => {
  it('10. a failed source never produces a false stale result and is surfaced', () => {
    const [d] = run([intune({ serialNumber: null, lastSyncDateTime: daysAgo(45) })], [], { ec: 'error' })
    expect(d!.staleStatus).toBe('needs_review')
    expect(d!.explanation).toMatch(/Endpoint Central could not be read/)
    expect(d!.sourceDataStatus['endpoint-central']).toBe('error')
    const [m] = run([], [mac({ last_contact_time: Date.parse(daysAgo(45)) })], { ec: 'error' })
    expect(m!.staleStatus).toBe('needs_review')
  })

  it('an unconfigured source is not an error: Intune-only organisations still get stale results', () => {
    expect(run([intune({ serialNumber: null, lastSyncDateTime: daysAgo(45) })], [], { ec: 'not_configured' })[0]!.staleStatus).toBe('stale')
  })

  it('a recent check-in stays active even when another source failed', () => {
    expect(run([intune({ lastSyncDateTime: daysAgo(1) })], [], { ec: 'error' })[0]!.staleStatus).toBe('active')
  })

  it('service: keeps in-scope records only, records a failed source, and does not report it as stale', async () => {
    let failEc = false
    const svc = createStaleDevicesService({
      cacheFile: null, now: () => NOW,
      providers: {
        intuneConfigured: () => true, ecConfigured: () => true,
        fetchIntune: async () => [intune({ serialNumber: null, lastSyncDateTime: daysAgo(45) }), intune({ id: 'and', operatingSystem: 'Android' })],
        fetchEc: async () => { if (failEc) throw new Error('MDM 503'); return [mac({ last_contact_time: Date.parse(daysAgo(45)) })] },
      },
    })
    expect(svc.getState().state).toBe('idle')
    await svc.startSync()
    expect(svc.getState()).toMatchObject({ state: 'ready', sources: { intune: { state: 'ok', inScope: 1 }, 'endpoint-central': { state: 'ok', inScope: 1 } } })
    expect(summarize(svc.devices())).toMatchObject({ staleWindows: 1, staleMacOS: 1 })
    failEc = true
    await svc.startSync()
    expect(svc.getState().sources['endpoint-central']).toMatchObject({ state: 'error', error: 'MDM 503' })
    expect(summarize(svc.devices())).toMatchObject({ staleWindows: 0, staleMacOS: 0, needsReview: 2 })
  })
})

describe('query + export', () => {
  const devices = run([intune({ serialNumber: null, deviceName: '=cmd', lastSyncDateTime: daysAgo(35), userDisplayName: 'Asha' })], [mac({ device_name: 'MBP', last_contact_time: Date.parse(daysAgo(100)) }), mac({ device_id: 'm2', serial_number: 'C02OK0001', last_contact_time: Date.parse(daysAgo(1)) })])

  it('filters by view, bucket and search, and sorts by inactivity', () => {
    expect(filterDevices(devices, { view: 'stale' })).toHaveLength(2)
    expect(filterDevices(devices, { view: 'macos' }).map(d => d.platform)).toEqual(['macOS'])
    expect(filterDevices(devices, { view: 'stale', bucket: '90+' })).toHaveLength(1)
    expect(filterDevices(devices, { view: 'stale', q: 'c02xyz' })).toHaveLength(1)
    expect(sortDevices(filterDevices(devices, { view: 'stale' }), 'inactiveDays', 'desc').map(d => d.inactiveDays)).toEqual([100, 35])
    expect(inBucket(21, '21-30')).toBe(true)
  })

  it('exports only the filtered rows, in the requested timezone, with formula injection neutralised', () => {
    const csv = toCsv(filterDevices(devices, { view: 'windows' }), 'Asia/Kolkata')
    const lines = csv.trim().split('\r\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('Last check-in (Asia/Kolkata)')
    expect(lines[1]).toContain("'=cmd")
    expect(lines[1]).toContain(' 11:30') // 06:00 UTC minus 35 days = 11:30 IST
    expect(csvCell('+1')).toBe("'+1")
    expect(toIsoUtc('2026-10-01T00:00:00Z').iso).toBe('2026-10-01T00:00:00.000Z')
  })
})
