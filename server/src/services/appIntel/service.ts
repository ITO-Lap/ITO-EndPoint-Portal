import { assessApp, type AssessContext } from './decision.js'
import { detectEndpointCentralInventory, type AppIntelCapabilities, type ProviderCapability } from './capabilities.js'
import { fetchBrewCaskLatest, fetchWingetLatest, type LatestResult } from './latestVersion.js'
import { classifyInstallSource } from './installSource.js'
import { attachPackages, fromManageEngineMdm, groupIntuneDetected, normalizeMobileApps, type MdmAppEntry } from './normalize.js'
import { liveProviders, type AppIntelProviders, type IntuneDeviceRef, type IntuneAssignmentSummary, type ProbeResult } from './providers.js'
import { getManageEngineConfig } from '../../store/integrationStore.js'
import { alertOnVerifiedReleaseChanges } from './releaseAlerts.js'
import { buildLifecycle, type AssignmentIndexFull } from './lifecycle.js'
import { getCveStore } from './cve.js'
import type { AppPlatform, AssessedApp, DeployedPackage, ProviderId } from './types.js'

// Orchestrates a read-only sync: provider inventory -> normalisation -> latest-version lookups ->
// decisions, cached in memory with a visible lastSyncedAt. Live failures are recorded per provider
// and surfaced; they never fall back to mock or stale-as-fresh data.

export type SyncState = 'idle' | 'syncing' | 'ready' | 'error'

export interface Snapshot {
  apps: AssessedApp[]
  syncedAt: string
  providerAsOf: Partial<Record<ProviderId, string | null>>
  packagesReadable: boolean
  errors: Record<string, string>
  /** OS-native apps (built-in / Store / Apple system) left out of the scan, per platform. */
  excludedNative: Record<AppPlatform, number>
  /** MDM device lists keyed by app key (Intune devices are fetched on demand). */
  mdmDevices: Map<string, Array<{ deviceId: string; deviceName: string; version: string }>>
}

export interface AppIntelDeps {
  providers: AppIntelProviders
  latest: {
    brew: (token: string) => Promise<LatestResult>
    winget: (id: string) => Promise<LatestResult>
  }
  now: () => number
  endpointCentral: () => Promise<ProviderCapability>
  packagers: () => { windows: boolean; macOS: boolean }
  /** Runs after each successful sync with the assessed apps (used to queue background CVE lookups). Must not throw or block. */
  afterSync?: (apps: AssessedApp[]) => void
}

const MAX_WINGET_LOOKUPS = 40
const MAX_ASSIGNMENT_LOOKUPS = 400
const ASSIGNMENT_CONCURRENCY = 6
const WINGET_CONCURRENCY = 4

export function createAppIntelService(deps: AppIntelDeps) {
  let snapshot: Snapshot | null = null
  let state: SyncState = 'idle'
  let inFlight: Promise<void> | null = null
  let capabilitiesCache: AppIntelCapabilities | null = null
  let lastError: string | null = null

  async function runSync(): Promise<void> {
    const t = deps.now()
    const nowIso = new Date(t).toISOString()
    const errors: Record<string, string> = {}
    const p = deps.providers

    const [detected, mobile, mdm] = await Promise.allSettled([
      p.intuneConfigured() ? p.fetchIntuneDetected() : Promise.resolve(null),
      p.intuneConfigured() ? p.fetchIntuneMobileApps() : Promise.resolve(null),
      p.manageEngineConfigured() ? p.fetchManageEngineApps() : Promise.resolve(null),
    ])
    const val = <T,>(r: PromiseSettledResult<T | null>, label: string): T | null => {
      if (r.status === 'fulfilled') return r.value
      errors[label] = r.reason instanceof Error ? r.reason.message.slice(0, 300) : 'Request failed'
      return null
    }
    let detectedRows = val(detected, 'intune-detected-apps')
    if (detectedRows === null && detected.status === 'rejected') {
      const saved = p.lastGoodDetected?.()
      if (saved) {
        detectedRows = saved.rows
        errors['intune-detected-apps'] = `${errors['intune-detected-apps'] ?? 'Intune read failed'} Showing the last good Intune data from ${saved.savedAt.slice(0, 16).replace('T', ' ')} UTC; it refreshes on the next successful sync.`
      }
    }
    const mobileRaw = val(mobile, 'intune-app-catalog')
    const mdmEntries: MdmAppEntry[] | null = val(mdm, 'manageengine-mdm')
    const meCoverage = mdmEntries ? p.manageEngineCoverage?.() ?? null : null
    if (meCoverage && meCoverage.devicesUnread > 0) {
      errors['manageengine-coverage'] = `ManageEngine app lists could not be read for ${meCoverage.devicesUnread} of ${meCoverage.devicesTotal} devices${meCoverage.unreadSample.length ? ` (e.g. ${meCoverage.unreadSample.join(', ')})` : ''}; those devices are not counted, so affected-device numbers may be under-reported.`
    }

    if (detectedRows === null && mdmEntries === null && !p.intuneConfigured() && !p.manageEngineConfigured()) {
      throw new Error('No inventory provider is configured. Connect Intune or ManageEngine in Settings.')
    }
    if (detectedRows === null && mdmEntries === null) {
      throw new Error(`All inventory providers failed: ${Object.values(errors).join(' | ') || 'no data'}`)
    }

    let records = [
      ...(detectedRows ? groupIntuneDetected(detectedRows) : []),
      ...(mdmEntries ? fromManageEngineMdm(mdmEntries) : []),
    ]
    // Scope: OS-native apps (Windows built-ins, Store/MSIX, Apple system apps) are not scanned at all.
    const excludedNative: Record<AppPlatform, number> = { windows: 0, macOS: 0 }
    records = records.filter(r => {
      if (!r.nativeReason) return true
      excludedNative[r.platform]++
      return false
    })

    const packagesReadable = mobileRaw !== null
    let packages: DeployedPackage[]
    if (mobileRaw) {
      packages = normalizeMobileApps(mobileRaw)
      records = attachPackages(records, packages)
    }

    // Install source (custom / self-service / manual) needs the assignments of the packages that matched an app.
    const assignments: AssignmentIndexFull = {}
    const matchedIds = [...new Set(records.flatMap(r => r.packages.map(pk => pk.packageId)))].slice(0, MAX_ASSIGNMENT_LOOKUPS)
    for (let i = 0; i < matchedIds.length; i += ASSIGNMENT_CONCURRENCY) {
      await Promise.all(matchedIds.slice(i, i + ASSIGNMENT_CONCURRENCY).map(async id => {
        try { assignments[id] = await p.fetchIntuneAssignments(id) } catch { assignments[id] = 'unavailable' }
      }))
    }
    if (Object.values(assignments).includes('unavailable')) errors['intune-assignments'] = 'Some package assignments could not be read; self-service offers may be under-reported.'
    // Entra group names make deployment rings readable; without Group.Read.All the ring simply stays unidentified.
    const groupIds = [...new Set(Object.values(assignments).flatMap(a => (Array.isArray(a) ? a : []).map(x => x.groupId).filter((g): g is string => !!g)))]
    if (groupIds.length && p.resolveGroupNames) {
      try {
        const names = await p.resolveGroupNames(groupIds)
        for (const list of Object.values(assignments)) if (Array.isArray(list)) for (const x of list) if (x.groupId && names[x.groupId]) x.groupName = names[x.groupId]!
      } catch { errors['intune-group-names'] = 'Assignment group names could not be read (Group.Read.All is needed), so deployment rings cannot be inferred from group names.' }
    }
    records = records.map(r => classifyInstallSource(r, assignments))

    // Latest-version lookups: only for catalog-mapped apps, and never for apps that are native-update anyway on Windows.
    const wingetIds = new Set<string>(), brewTokens = new Set<string>()
    for (const r of records) {
      if (r.platform === 'macOS' && r.identity.brewToken) brewTokens.add(r.identity.brewToken)
      if (r.platform === 'windows' && r.identity.wingetId && !r.nativeHint) wingetIds.add(r.identity.wingetId)
    }
    const latestByKey = new Map<string, LatestResult>()
    await Promise.all([...brewTokens].map(async tk => { latestByKey.set(`brew:${tk}`, await deps.latest.brew(tk)) }))
    const wingetList = [...wingetIds].slice(0, MAX_WINGET_LOOKUPS)
    for (let i = 0; i < wingetList.length; i += WINGET_CONCURRENCY) {
      await Promise.all(wingetList.slice(i, i + WINGET_CONCURRENCY).map(async id => { latestByKey.set(`winget:${id}`, await deps.latest.winget(id)) }))
    }

    const providerAsOf: Snapshot['providerAsOf'] = {
      intune: detectedRows ? nowIso : null,
      'manageengine-mdm': mdmEntries ? nowIso : null,
    }
    const ctx: AssessContext = { providerAsOf, packagesReadable, nowIso }
    const apps = records.map(r => {
      const latest = r.platform === 'macOS'
        ? (r.identity.brewToken ? latestByKey.get(`brew:${r.identity.brewToken}`) ?? null : null)
        : (r.identity.wingetId ? latestByKey.get(`winget:${r.identity.wingetId}`) ?? null : null)
      const assessed = assessApp(r, latest, ctx)
      return { ...assessed, lifecycle: buildLifecycle(assessed, assignments, packagesReadable) }
    })

    const mdmDevices: Snapshot['mdmDevices'] = new Map()
    if (mdmEntries) {
      for (const rec of fromManageEngineMdm(mdmEntries)) {
        const entry = mdmEntries.find(e => (rec.identity.bundleId ? e.appId === rec.identity.bundleId : e.name === rec.identity.displayName))
        if (entry) mdmDevices.set(rec.key, entry.logs)
      }
    }
    // This is deliberately after all vendor verification succeeds, and it only
    // compares against the previous verified baseline — device inventory alone
    // never produces a release alert.
    const syncedAt = new Date(deps.now()).toISOString()
    await alertOnVerifiedReleaseChanges(apps, { syncedAt, errors })
    snapshot = { apps, syncedAt, providerAsOf, packagesReadable, errors, excludedNative, mdmDevices }
    capabilitiesCache = null
    try { deps.afterSync?.(apps) } catch (e) { console.warn('[app-intel] post-sync hook failed:', e instanceof Error ? e.message : e) }
  }

  function startSync(): Promise<void> {
    if (inFlight) return inFlight
    state = 'syncing'
    inFlight = runSync()
      .then(() => { state = 'ready'; lastError = null })
      .catch(e => { state = 'error'; lastError = e instanceof Error ? e.message : 'Sync failed' })
      .finally(() => { inFlight = null })
    return inFlight
  }

  async function capabilities(): Promise<AppIntelCapabilities> {
    if (capabilitiesCache) return capabilitiesCache
    const p = deps.providers
    const fromProbe = (r: ProbeResult | null, perm: string, off: string): ProviderCapability => {
      if (r === null) return { state: 'not_configured', message: off }
      if (r.ok) return { state: 'ok', message: 'Readable' }
      return r.status === 403 || r.status === 401
        ? { state: 'missing_permission', message: `Microsoft Graph denied access — grant the ${perm} application permission.` }
        : { state: 'error', message: r.message }
    }
    const probes = p.intuneConfigured() ? await p.probeIntune() : null
    const ec = await deps.endpointCentral()
    capabilitiesCache = {
      intune: {
        detectedApps: fromProbe(probes?.detectedApps ?? null, 'DeviceManagementManagedDevices.Read.All', 'Intune is not configured.'),
        appCatalog: fromProbe(probes?.appCatalog ?? null, 'DeviceManagementApps.Read.All', 'Intune is not configured.'),
      },
      manageEngineMdm: p.manageEngineConfigured()
        ? { state: 'ok', message: 'MDM app inventory (per-device installed apps) is used for macOS.' }
        : { state: 'not_configured', message: 'ManageEngine is not configured.' },
      endpointCentralInventory: ec,
      selfService: {
        intuneCompanyPortal: p.intuneConfigured()
          ? { state: 'ok', message: 'Apps whose matching Intune package has an "available" assignment are classed as Self-service.' }
          : { state: 'not_configured', message: 'Intune is not configured, so Company Portal offers cannot be identified.' },
        endpointCentralPortal: ec.state === 'adapter_unverified'
          ? { state: 'adapter_unverified', message: 'Endpoint Central self-service portal data is not read yet: no verified endpoint.' }
          : { state: ec.state, message: `Endpoint Central self-service portal apps cannot be identified: ${ec.message}` },
      },
      latestVersionSources: {
        winget: { state: 'ok', message: 'Microsoft winget-pkgs manifests via the GitHub API (60 requests/hour unauthenticated; set GITHUB_TOKEN to raise).' },
        homebrew: { state: 'ok', message: 'Homebrew cask API (formulae.brew.sh), queried per cask token.' },
      },
      packagers: deps.packagers(),
    }
    return capabilitiesCache
  }

  return {
    startSync,
    getState: () => ({ state, lastError, syncedAt: snapshot?.syncedAt ?? null, errors: snapshot?.errors ?? {}, packagesReadable: snapshot?.packagesReadable ?? null, excludedNative: snapshot?.excludedNative ?? null }),
    getSnapshot: () => snapshot,
    capabilities,
    async devicesFor(app: AssessedApp): Promise<{ devices: Array<{ name: string; user: string | null; version: string; provider: ProviderId }>; note: string | null }> {
      const out: Array<{ name: string; user: string | null; version: string; provider: ProviderId }> = []
      let note: string | null = null
      for (const iv of app.installed.filter(i => i.provider === 'intune').slice(0, 15)) {
        for (const id of iv.sourceRecordIds ?? []) {
          try {
            const devs: IntuneDeviceRef[] = await deps.providers.fetchIntuneDevicesForDetectedApp(id)
            devs.forEach(d => out.push({ name: d.deviceName, user: d.user, version: iv.version, provider: 'intune' }))
          } catch (e) { note = `Some Intune device lists could not be read: ${e instanceof Error ? e.message.slice(0, 120) : 'error'}` }
        }
      }
      for (const l of snapshot?.mdmDevices.get(app.key) ?? []) out.push({ name: l.deviceName, user: null, version: l.version, provider: 'manageengine-mdm' })
      return { devices: out.slice(0, 500), note }
    },
    async assignmentsFor(pkgs: DeployedPackage[]): Promise<Record<string, IntuneAssignmentSummary[] | 'unavailable'>> {
      const out: Record<string, IntuneAssignmentSummary[] | 'unavailable'> = {}
      for (const pk of pkgs.slice(0, 5)) {
        try { out[pk.packageId] = await deps.providers.fetchIntuneAssignments(pk.packageId) } catch { out[pk.packageId] = 'unavailable' }
      }
      return out
    },
  }
}

export type AppIntelService = ReturnType<typeof createAppIntelService>

let singleton: AppIntelService | null = null
export function getAppIntelService(): AppIntelService {
  singleton ??= createAppIntelService({
    providers: liveProviders,
    latest: {
      brew: tk => fetchBrewCaskLatest(tk),
      winget: id => fetchWingetLatest(id, { githubToken: process.env.GITHUB_TOKEN }),
    },
    now: Date.now,
    endpointCentral: () => detectEndpointCentralInventory(getManageEngineConfig()),
    // No packaging workflow is registered in this codebase today.
    packagers: () => ({ windows: false, macOS: false }),
    afterSync: apps => getCveStore().scheduleFor(apps),
  })
  return singleton
}

export type { AppPlatform }
