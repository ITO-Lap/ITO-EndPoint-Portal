import { describe, it, expect, vi } from 'vitest'
import { createAppIntelService, type AppIntelDeps } from '../service.js'
import { detectEndpointCentralInventory, EC_INVENTORY_SCOPE } from '../capabilities.js'
import { filterApps, sortApps, summarize, packagingIntentFor, toRow, hasUpdateAvailable } from '../query.js'
import type { AppIntelProviders } from '../providers.js'
import type { LatestResult } from '../latestVersion.js'
import type { MdmAppEntry, MobileAppRaw, IntuneDetectedRow } from '../normalize.js'

const NOW = Date.parse('2026-10-12T10:00:00Z')
const ok = (version: string, over: Partial<{ selfUpdating: boolean }> = {}): LatestResult => ({ ok: true, value: { version, versionSource: 'test source', sourceUrl: 'u', lastCheckedAt: new Date(NOW).toISOString(), selfUpdating: false, ...over } })

const mac = (appId: string, name: string, versions: string[]): MdmAppEntry => ({ appId, name, platform: 'macOS', logs: versions.map((v, i) => ({ deviceId: `d${i}`, deviceName: `Mac-${i}`, version: v })) })
const win = (over: Partial<IntuneDetectedRow>): IntuneDetectedRow => ({ id: 'r', displayName: 'Slack', version: '4.0.0', publisher: 'Slack Technologies', deviceCount: 1, platform: 'windows', ...over })

function providers(over: Partial<AppIntelProviders> = {}): AppIntelProviders {
  return {
    intuneConfigured: () => true, manageEngineConfigured: () => true,
    fetchIntuneDetected: async () => [], fetchIntuneMobileApps: async () => [], fetchManageEngineApps: async () => [],
    fetchIntuneDevicesForDetectedApp: async () => [], fetchIntuneAssignments: async () => [],
    probeIntune: async () => ({ detectedApps: { ok: true }, appCatalog: { ok: true } }), ...over,
  }
}
function svc(p: AppIntelProviders, latest: Partial<AppIntelDeps['latest']> = {}) {
  return createAppIntelService({
    providers: p, now: () => NOW,
    latest: { brew: async () => ok('6.1.0'), winget: async () => ok('5.0.0'), ...latest },
    endpointCentral: async () => ({ state: 'scope_missing', message: 'MDM-only' }),
    packagers: () => ({ windows: false, macOS: false }),
  })
}
const sync = async (s: ReturnType<typeof svc>) => { await s.startSync(); return s.getSnapshot()! }

describe('sync', () => {
  it('correlates MDM inventory with Intune packages and the verified latest version', async () => {
    const mobile: MobileAppRaw[] = [{ '@odata.type': '#microsoft.graph.macOSDmgApp', id: 'p1', displayName: 'Zoom', primaryBundleId: 'us.zoom.xos', primaryBundleVersion: '6.0.0' }]
    const s = svc(providers({ fetchManageEngineApps: async () => [mac('us.zoom.xos', 'zoom.us', ['6.0.0', '6.0.0', '5.9.0'])], fetchIntuneMobileApps: async () => mobile }))
    const snap = await sync(s)
    const zoom = snap.apps.find(a => a.identity.bundleId === 'us.zoom.xos')!
    expect(zoom.status).toBe('Repackage required') // package 6.0.0 < latest 6.1.0
    expect(zoom.deployedPackageVersion).toBe('6.0.0')
    expect(zoom.latest?.version).toBe('6.1.0')
    expect(zoom.affectedDevices).toBe(3)
    expect(zoom.detectedVersion.sort()).toEqual(['5.9.0', '6.0.0'])
    expect(snap.syncedAt).toBe(new Date(NOW).toISOString())
    expect(s.getState().state).toBe('ready')
  })

  it('apps outside the catalog are Data unavailable — inventory never supplies the latest version', async () => {
    const snap = await sync(svc(providers({ fetchManageEngineApps: async () => [mac('com.acme.tool', 'Acme', ['9.9.9'])] })))
    const a = snap.apps[0]!
    expect(a.status).toBe('Data unavailable')
    expect(a.latest).toBeNull()
  })

  it('Windows catalog apps use the winget adapter; native apps are excluded; vendor-auto-update apps are Native update', async () => {
    const winget = vi.fn(async () => ok('24.09'))
    const s = svc(providers({ fetchIntuneDetected: async () => [
      win({ id: '1', displayName: 'Acme Inventory Tool', publisher: 'Acme' }),                        // not in the catalog
      win({ id: '2', displayName: '7-Zip 23.01 (x64)', publisher: 'Igor Pavlov', version: '23.01' }),  // catalog (version in name)
      win({ id: '3', displayName: '05980FDA.ProjectPlan365', publisher: 'CN=ABC', version: '1.0' }),   // Store app -> excluded
      win({ id: '5', displayName: 'Microsoft Windows Desktop Runtime', publisher: 'Microsoft Corporation' }), // inbox -> excluded
      win({ id: '4', displayName: 'Slack', publisher: 'Slack Technologies', version: '4.0.0' }),       // vendor auto-update
    ] }), { winget })
    const snap = await sync(s)
    expect(winget).toHaveBeenCalledTimes(1)
    expect(winget).toHaveBeenCalledWith('7zip.7zip')
    const names = snap.apps.map(a => a.identity.displayName)
    expect(names).not.toContain('05980FDA.ProjectPlan365')
    expect(names).not.toContain('Microsoft Windows Desktop Runtime')
    expect(snap.excludedNative).toEqual({ windows: 2, macOS: 0 })
    expect(s.getState().excludedNative).toEqual({ windows: 2, macOS: 0 })
    const st = (n: string) => snap.apps.find(a => a.identity.displayName === n)!.status
    expect(st('7-Zip')).toBe('Package required')
    expect(st('Slack')).toBe('Native update')
    expect(st('Acme Inventory Tool')).toBe('Data unavailable')
  })

  it('excludes Apple system apps from the macOS scan but keeps third-party apps', async () => {
    const snap = await sync(svc(providers({ fetchManageEngineApps: async () => [mac('com.apple.Safari', 'Safari', ['17.0']), mac('com.acme.tool', 'Acme', ['1.0'])] })))
    expect(snap.apps.map(a => a.identity.displayName)).toEqual(['Acme'])
    expect(snap.excludedNative).toEqual({ windows: 0, macOS: 1 })
  })

  it('classifies install source: self-service (Company Portal), custom (packaged), manual (no package)', async () => {
    const mobile: MobileAppRaw[] = [
      { '@odata.type': '#microsoft.graph.macOSDmgApp', id: 'pkg-zoom', displayName: 'Zoom', primaryBundleId: 'us.zoom.xos', primaryBundleVersion: '6.0.0' },
      { '@odata.type': '#microsoft.graph.macOSPkgApp', id: 'pkg-vlc', displayName: 'VLC', primaryBundleId: 'org.videolan.vlc', primaryBundleVersion: '3.0.0' },
    ]
    const fetchIntuneAssignments = vi.fn(async (id: string) => id === 'pkg-zoom' ? [{ intent: 'available', target: 'group' }] : [{ intent: 'required', target: 'group' }])
    const snap = await sync(svc(providers({
      fetchIntuneMobileApps: async () => mobile, fetchIntuneAssignments,
      fetchManageEngineApps: async () => [mac('us.zoom.xos', 'zoom.us', ['6.0.0']), mac('org.videolan.vlc', 'VLC', ['3.0.0']), mac('com.acme.tool', 'Acme', ['1.0'])],
    })))
    const src = (b: string) => snap.apps.find(a => a.identity.bundleId === b)!
    expect(src('us.zoom.xos')).toMatchObject({ installSource: 'self-service', installSourceBasis: 'bundleId' })
    expect(src('org.videolan.vlc')).toMatchObject({ installSource: 'custom', installSourceBasis: 'bundleId' })
    expect(src('com.acme.tool')).toMatchObject({ installSource: 'manual', installSourceBasis: 'none' })
    expect(fetchIntuneAssignments).toHaveBeenCalledTimes(2) // only matched packages are looked up
  })

  it('unreadable assignments are reported and never silently treated as "no self-service"', async () => {
    const mobile: MobileAppRaw[] = [{ '@odata.type': '#microsoft.graph.macOSDmgApp', id: 'p', displayName: 'Zoom', primaryBundleId: 'us.zoom.xos', primaryBundleVersion: '6.0.0' }]
    const snap = await sync(svc(providers({ fetchIntuneMobileApps: async () => mobile, fetchIntuneAssignments: async () => { throw new Error('403') }, fetchManageEngineApps: async () => [mac('us.zoom.xos', 'zoom.us', ['6.0.0'])] })))
    expect(snap.errors['intune-assignments']).toMatch(/self-service offers may be under-reported/)
    expect(snap.apps[0]!.installSourceReason).toMatch(/cannot be ruled out/)
  })

  it('MDM-only: macOS data comes from MDM, Intune is not required, and provider identity is preserved', async () => {
    const snap = await sync(svc(providers({ intuneConfigured: () => false, fetchManageEngineApps: async () => [mac('us.zoom.xos', 'zoom.us', ['6.1.0'])] })))
    const a = snap.apps[0]!
    expect(a.providers).toEqual(['manageengine-mdm'])
    expect(a.installed.every(i => i.provider === 'manageengine-mdm')).toBe(true)
    expect(snap.packagesReadable).toBe(false)
    expect(a.status).toBe('Up to date') // no outdated versions, so packages are irrelevant
  })

  it('an unreadable Intune catalog yields Review required, never an invented "Package required"', async () => {
    const snap = await sync(svc(providers({ fetchManageEngineApps: async () => [mac('us.zoom.xos', 'zoom.us', ['5.0.0'])], fetchIntuneMobileApps: async () => { throw new Error('403 Forbidden') } })))
    expect(snap.packagesReadable).toBe(false)
    expect(snap.apps[0]!.status).toBe('Review required')
    expect(snap.errors['intune-app-catalog']).toMatch(/403/)
  })

  it('a failed provider is reported and never replaced with mock data', async () => {
    const snap = await sync(svc(providers({ fetchIntuneDetected: async () => { throw new Error('Graph 503') }, fetchManageEngineApps: async () => [mac('us.zoom.xos', 'zoom.us', ['6.1.0'])] })))
    expect(snap.errors['intune-detected-apps']).toMatch(/503/)
    expect(snap.apps.every(a => a.platform === 'macOS')).toBe(true)
    expect(snap.providerAsOf.intune).toBeNull()
  })

  it('goes to an error state (no snapshot) when every provider fails or none is configured', async () => {
    const s1 = svc(providers({ fetchIntuneDetected: async () => { throw new Error('boom') }, fetchManageEngineApps: async () => { throw new Error('boom2') } }))
    await s1.startSync()
    expect(s1.getState().state).toBe('error')
    expect(s1.getState().lastError).toMatch(/All inventory providers failed/)
    expect(s1.getSnapshot()).toBeNull()
    const s2 = svc(providers({ intuneConfigured: () => false, manageEngineConfigured: () => false }))
    await s2.startSync()
    expect(s2.getState().lastError).toMatch(/No inventory provider is configured/)
  })

  it('only one sync runs at a time', async () => {
    const fetchIntuneDetected = vi.fn(async () => [])
    const s = svc(providers({ fetchIntuneDetected }))
    await Promise.all([s.startSync(), s.startSync()])
    expect(fetchIntuneDetected).toHaveBeenCalledTimes(1)
  })
})

describe('capabilities', () => {
  it('reports missing Graph permissions with the permission name', async () => {
    const s = svc(providers({ probeIntune: async () => ({ detectedApps: { ok: false, status: 403, message: 'Forbidden' }, appCatalog: { ok: true } }) }))
    const c = await s.capabilities()
    expect(c.intune.detectedApps).toMatchObject({ state: 'missing_permission' })
    expect(c.intune.detectedApps.message).toMatch(/DeviceManagementManagedDevices\.Read\.All/)
    expect(c.intune.appCatalog.state).toBe('ok')
    expect(c.packagers).toEqual({ windows: false, macOS: false })
  })
  it('Endpoint Central inventory is disabled for an MDM-only connection', async () => {
    const cap = await detectEndpointCentralInventory({ clientId: 'c', clientSecret: 's', refreshToken: 'r', apiDomain: 'x' }, { ENDPOINT_CENTRAL_BASE_URL: 'https://ec.example' }, async () => ['MDMOnDemand.MDMInventory.ALL', 'MDMOnDemand.MDMDeviceMgmt.ALL'])
    expect(cap.state).toBe('scope_missing')
    expect(cap.message).toMatch(/MDM-only/)
    expect(cap.message).toContain(EC_INVENTORY_SCOPE)
  })
  it('needs both the scope and an explicit host, and still makes no unverified calls', async () => {
    const cfg = { clientId: 'c', clientSecret: 's', refreshToken: 'r', apiDomain: 'x' }
    const scopes = async () => ['MDMOnDemand.MDMInventory.ALL', EC_INVENTORY_SCOPE]
    expect((await detectEndpointCentralInventory(cfg, {}, scopes)).state).toBe('host_missing')
    expect((await detectEndpointCentralInventory(cfg, { ENDPOINT_CENTRAL_BASE_URL: 'https://ec.example' }, scopes)).state).toBe('adapter_unverified')
  })
  it('accepts the broader Inventory.ALL scope as granting read access', async () => {
    const cfg = { clientId: 'c', clientSecret: 's', refreshToken: 'r', apiDomain: 'x' }
    const scopes = async () => ['MDMOnDemand.MDMInventory.ALL', 'DesktopCentralCloud.Inventory.ALL']
    expect((await detectEndpointCentralInventory(cfg, { ENDPOINT_CENTRAL_BASE_URL: 'https://ec.example' }, scopes)).state).toBe('adapter_unverified')
    expect((await detectEndpointCentralInventory(cfg, {}, scopes)).state).toBe('host_missing')
    // other DesktopCentralCloud scopes do not imply inventory access
    expect((await detectEndpointCentralInventory(cfg, { ENDPOINT_CENTRAL_BASE_URL: 'https://ec.example' }, async () => ['DesktopCentralCloud.PatchMgmt.ALL'])).state).toBe('scope_missing')
  })
  it('handles an unconfigured ManageEngine and token errors', async () => {
    expect((await detectEndpointCentralInventory(undefined)).state).toBe('not_configured')
    expect((await detectEndpointCentralInventory({ clientId: 'c', clientSecret: 's', refreshToken: 'r', apiDomain: 'x' }, {}, async () => { throw new Error('auth failed') })).state).toBe('error')
  })
})

describe('query helpers', () => {
  const build = async () => (await sync(svc(providers({
    fetchManageEngineApps: async () => [mac('us.zoom.xos', 'zoom.us', ['5.0.0', '5.0.0']), mac('com.apple.Safari', 'Safari', ['17.0']), mac('com.google.Chrome', 'Google Chrome', ['150.0']), mac('com.acme.tool', 'Acme Tool', ['1.0'])],
    fetchIntuneDetected: async () => [win({ id: '1', displayName: 'Acme Win', publisher: 'Acme' })],
  }), { brew: async tk => (tk === 'google-chrome' ? ok('155.0', { selfUpdating: true }) : ok('6.1.0')) }))).apps

  it('filters by platform, status, provider, confidence and search', async () => {
    const apps = await build()
    const f = (o: object) => filterApps(apps, { platform: 'macOS', ...o }, NOW).map(a => a.identity.displayName)
    expect(f({})).toHaveLength(3) // Safari is native and never enters the scan
    expect(f({ status: 'Package required' }).sort()).toEqual(['Google Chrome', 'zoom.us'])
    expect(f({ status: 'Native update' })).toEqual([])
    expect(f({ q: 'safari' })).toEqual([])
    expect(f({ confidence: 'high' })).toHaveLength(3)
    expect(f({ installSource: 'manual' })).toHaveLength(3)
    expect(f({ installSource: 'custom' })).toHaveLength(0)
    expect(f({ q: 'acme' })).toEqual(['Acme Tool'])
    expect(filterApps(apps, { platform: 'windows', provider: 'intune' }, NOW)).toHaveLength(1)
    expect(filterApps(apps, { platform: 'windows', provider: 'manageengine-mdm' }, NOW)).toHaveLength(0)
    expect(filterApps(apps, { platform: 'macOS', syncState: 'never' }, NOW).map(a => a.identity.displayName)).toContain('Acme Tool')
    expect(filterApps(apps, { platform: 'macOS', syncState: 'checked' }, NOW).map(a => a.identity.displayName)).toEqual(['zoom.us', 'Google Chrome'])
  })

  it('"Update available" counts every app with a confirmed newer version, with a breakdown by next step', async () => {
    const apps = await build()
    const s = summarize(apps, 'macOS')
    // zoom.us (5.0.0 < 6.1.0) and Chrome (150 < 155) both need packaging under the macOS policy; Acme has no verified latest.
    expect(s.updateAvailable).toBe(2)
    expect(s.updateBreakdown).toMatchObject({ needsPackaging: 2, vendorUpdate: 0, existingPackage: 0, review: 0, devicesBehind: 3 })
    expect(filterApps(apps, { platform: 'macOS', updateAvailable: true }, NOW).map(a => a.identity.displayName).sort()).toEqual(['Google Chrome', 'zoom.us'])
    expect(hasUpdateAvailable(apps.find(a => a.identity.displayName === 'Acme Tool')!)).toBe(false) // never inferred without a verified latest
  })

  it('default sort puts packaging work first; explicit sorts work', async () => {
    const apps = await build()
    expect(sortApps(apps.filter(a => a.platform === 'macOS'), undefined)[0]!.identity.displayName).toBe('zoom.us')
    expect(sortApps(apps.filter(a => a.platform === 'macOS'), 'app', 'desc')[0]!.identity.displayName).toBe('zoom.us')
  })

  it('summary counts per platform; Package required includes Repackage', async () => {
    const s = summarize(await build(), 'macOS')
    expect(s).toMatchObject({ appsDiscovered: 3, packageRequired: 2, nativeUpdate: 0, dataUnavailable: 1, byInstallSource: { custom: 0, selfService: 0, manual: 3 } })
  })

  it('produces a build-only packaging hand-off only when a package is required', async () => {
    const apps = await build()
    const zoom = apps.find(a => a.identity.bundleId === 'us.zoom.xos')!
    expect(packagingIntentFor(zoom)).toMatchObject({ platform: 'macOS', sourceKind: 'homebrew', sourceId: 'zoom', targetVersion: '6.1.0', kind: 'new-package', allowedActions: ['build-package'] })
    expect(packagingIntentFor(apps.find(a => a.identity.displayName === 'Google Chrome')!)).toMatchObject({ platform: 'macOS', sourceKind: 'homebrew', sourceId: 'google-chrome', targetVersion: '155.0' })
    expect(toRow(zoom)).toMatchObject({ latestVerifiedVersion: '6.1.0', deployedPackageVersion: null })
  })
})
