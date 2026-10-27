import { catalogForBundleId, catalogForWindows } from './catalog.js'
import type { AppRecord, AppPlatform, DeployedPackage, InstalledVersion, Confidence } from './types.js'

// Normalisation + matching. Only records with a STRONG identifier (bundle id, winget id, MSI product
// code) are tied together automatically. A name-only match is kept as a low-confidence candidate and
// never drives a "Package required" decision.

/** Placeholder until installSource.ts classifies the record against Intune packages. */
const UNCLASSIFIED = { installSource: 'manual', installSourceBasis: 'none', installSourceReason: 'Not classified yet' } as const

export const normText = (s: string | null | undefined): string =>
  (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

// ── Intune detected apps (Windows today; macOS handled if Graph ever reports it) ──────────────

export interface IntuneDetectedRow {
  id: string
  displayName: string
  version: string | null
  publisher: string | null
  deviceCount: number
  platform: string
}

export function mapGraphPlatform(p: string): AppPlatform | null {
  if (p === 'windows') return 'windows'
  if (p === 'macOS') return 'macOS'
  return null // iOS / Android / others are out of scope
}

/** Microsoft Store / MSIX apps carry an AppX publisher identity ("CN=…") and update through the Store. */
export function storeAppReason(publisher: string | null): string | null {
  return publisher && /^CN=/i.test(publisher.trim())
    ? 'Microsoft Store / MSIX package (AppX publisher identity)'
    : null
}

/** Windows components that ship with the OS (not installed by an administrator or user). */
const WINDOWS_INBOX = /^(microsoft windows\b|windows (driver package|feature experience|setup remediations|subsystem|update)\b|microsoft update health tools)/i

export function windowsInboxReason(name: string, publisher: string | null): string | null {
  return publisher && /microsoft/i.test(publisher) && WINDOWS_INBOX.test(name.trim()) ? 'Windows built-in component' : null
}

/** Apple system / App Store apps on macOS (bundle ids under com.apple.). */
export function appleSystemReason(bundleId: string | null): string | null {
  return bundleId?.startsWith('com.apple.') ? 'Apple system app' : null
}

export function groupIntuneDetected(rows: IntuneDetectedRow[]): AppRecord[] {
  const groups = new Map<string, AppRecord>()
  for (const r of rows) {
    const platform = mapGraphPlatform(r.platform)
    if (!platform || !r.displayName?.trim()) continue
    const cat = platform === 'windows' ? catalogForWindows(r.displayName, r.publisher) : null
    // Catalog-matched apps group by catalog identity (many vendors put the version in the display name,
    // e.g. "7-Zip 23.01 (x64)"); everything else groups only on exact publisher + name.
    const key = cat?.wingetId ? `intune|${platform}|catalog:${cat.wingetId.toLowerCase()}` : `intune|${platform}|${normText(r.publisher)}|${normText(r.displayName)}`
    let rec = groups.get(key)
    if (!rec) {
      const confidence: Confidence = cat ? 'medium' : 'low'
      rec = {
        key, platform,
        identity: { publisher: r.publisher, displayName: cat ? cat.displayName : r.displayName.trim(), bundleId: null, productCode: null, wingetId: cat?.wingetId ?? null, brewToken: cat?.brewToken ?? null },
        installed: [], packages: [], confidence,
        confidenceReason: cat
          ? 'Matched a curated catalog entry by exact name and publisher. Intune detected apps carry no stable identifier.'
          : 'Name-only identity — Intune detected apps carry no stable identifier, so this cannot be tied to a package or catalog entry automatically.',
        providers: ['intune'],
        nativeHint: cat?.windowsVendorAutoUpdate ? `${cat.displayName} updates itself (vendor auto-updater)` : null,
        nativeReason: storeAppReason(r.publisher) ?? windowsInboxReason(r.displayName, r.publisher),
        ...UNCLASSIFIED,
      }
      groups.set(key, rec)
    }
    const version = r.version?.trim() || 'Unknown'
    const existing = rec.installed.find(i => i.version === version && i.provider === 'intune')
    if (existing) {
      existing.deviceCount += r.deviceCount
      existing.sourceRecordIds = [...(existing.sourceRecordIds ?? []), r.id]
    } else {
      rec.installed.push({ version, deviceCount: r.deviceCount, provider: 'intune', sourceRecordIds: [r.id] })
    }
  }
  return [...groups.values()]
}

// ── ManageEngine MDM (macOS) ─────────────────────────────────────────────────────────────────

export interface MdmAppEntry {
  appId: string
  name: string
  platform: 'Windows' | 'macOS'
  logs: Array<{ deviceId: string; deviceName: string; version: string }>
}

const looksLikeBundleId = (s: string): boolean => /^[A-Za-z0-9-]+(\.[A-Za-z0-9_-]+)+$/.test(s)

export function fromManageEngineMdm(entries: MdmAppEntry[]): AppRecord[] {
  const out: AppRecord[] = []
  for (const e of entries) {
    const platform: AppPlatform = e.platform === 'macOS' ? 'macOS' : 'windows'
    const bundleId = platform === 'macOS' && looksLikeBundleId(e.appId) ? e.appId : null
    const cat = catalogForBundleId(bundleId)
    const counts = new Map<string, number>()
    for (const l of e.logs) counts.set(l.version || 'Unknown', (counts.get(l.version || 'Unknown') ?? 0) + 1)
    const installed: InstalledVersion[] = [...counts.entries()].map(([version, deviceCount]) => ({ version, deviceCount, provider: 'manageengine-mdm' as const }))
    out.push({
      key: bundleId ? `mdm|macOS|${bundleId}` : `mdm|${platform}|name:${normText(e.name)}`,
      platform,
      identity: { publisher: null, displayName: e.name, bundleId, productCode: null, wingetId: cat?.wingetId ?? null, brewToken: cat?.brewToken ?? null },
      installed, packages: [],
      confidence: bundleId ? 'high' : 'low',
      confidenceReason: bundleId
        ? 'MDM bundle identifier (strong identifier)'
        : 'No bundle identifier reported by MDM — name-only identity',
      providers: ['manageengine-mdm'],
      nativeHint: null,
      nativeReason: appleSystemReason(bundleId),
      ...UNCLASSIFIED,
    })
  }
  return out
}

// ── Intune packages (mobileApps) ─────────────────────────────────────────────────────────────

export interface MobileAppRaw {
  '@odata.type'?: string
  id: string
  displayName?: string
  publisher?: string | null
  /** mobileApp.owner (Graph v1.0). */
  owner?: string | null
  lastModifiedDateTime?: string | null
  // macOS pkg/dmg
  primaryBundleId?: string | null
  primaryBundleVersion?: string | null
  includedApps?: Array<{ bundleId?: string | null; bundleVersion?: string | null }> | null
  // macOS LOB
  bundleId?: string | null
  versionNumber?: string | null
  // win32
  msiInformation?: { productCode?: string | null; productVersion?: string | null } | null
  // windowsMobileMSI
  productCode?: string | null
  productVersion?: string | null
  // winGetApp
  packageIdentifier?: string | null
}

const clean = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim() : null)

export function normalizeMobileApps(raw: MobileAppRaw[]): DeployedPackage[] {
  const out: DeployedPackage[] = []
  for (const a of raw) {
    const type = (a['@odata.type'] ?? '').replace('#microsoft.graph.', '')
    const base = { provider: 'intune' as const, packageId: a.id, displayName: a.displayName ?? '', publisher: clean(a.publisher), owner: clean(a.owner), odataType: type, lastModifiedAt: clean(a.lastModifiedDateTime) }
    if (type === 'macOSPkgApp' || type === 'macOSDmgApp') {
      const bundles = new Map<string, string | null>()
      if (clean(a.primaryBundleId)) bundles.set(a.primaryBundleId!.trim(), clean(a.primaryBundleVersion))
      for (const b of a.includedApps ?? []) if (clean(b.bundleId) && !bundles.has(b.bundleId!.trim())) bundles.set(b.bundleId!.trim(), clean(b.bundleVersion))
      for (const [bundleId, version] of bundles) {
        out.push({ ...base, version, versionSource: version ? 'Intune bundle version (primaryBundleVersion / includedApps)' : null, matchBasis: 'bundleId', bundleId })
      }
    } else if (type === 'macOSLobApp') {
      const bundleId = clean(a.bundleId)
      if (bundleId) out.push({ ...base, version: clean(a.versionNumber), versionSource: clean(a.versionNumber) ? 'Intune macOSLobApp.versionNumber' : null, matchBasis: 'bundleId', bundleId })
    } else if (type === 'win32LobApp') {
      const v = clean(a.msiInformation?.productVersion)
      out.push({ ...base, version: v, versionSource: v ? 'Intune msiInformation.productVersion' : null, matchBasis: 'name', productCode: clean(a.msiInformation?.productCode) })
    } else if (type === 'windowsMobileMSI') {
      const v = clean(a.productVersion)
      out.push({ ...base, version: v, versionSource: v ? 'Intune windowsMobileMSI.productVersion' : null, matchBasis: 'name', productCode: clean(a.productCode) })
    } else if (type === 'winGetApp') {
      // winget apps always install the repository's current version — Graph reports no fixed version.
      out.push({ ...base, version: null, versionSource: null, matchBasis: 'wingetId', wingetId: clean(a.packageIdentifier) })
    }
  }
  return out
}

/** Attach packages to records. Strong identifiers match automatically; names are kept as low-confidence candidates. */
export function attachPackages(records: AppRecord[], packages: DeployedPackage[]): AppRecord[] {
  const byBundle = new Map<string, DeployedPackage[]>()
  const byWinget = new Map<string, DeployedPackage[]>()
  const byName = new Map<string, DeployedPackage[]>()
  const push = (m: Map<string, DeployedPackage[]>, k: string, p: DeployedPackage) => { const l = m.get(k) ?? []; l.push(p); m.set(k, l) }
  for (const p of packages) {
    if (p.bundleId) push(byBundle, p.bundleId, p)
    else if (p.wingetId) push(byWinget, p.wingetId.toLowerCase(), p)
    else if (p.displayName) push(byName, normText(p.displayName), p)
  }
  return records.map(r => {
    const matched: DeployedPackage[] = []
    if (r.identity.bundleId) matched.push(...(byBundle.get(r.identity.bundleId) ?? []))
    if (r.identity.wingetId) matched.push(...(byWinget.get(r.identity.wingetId.toLowerCase()) ?? []))
    if (r.platform === 'windows') matched.push(...(byName.get(normText(r.identity.displayName)) ?? []))
    return matched.length ? { ...r, packages: matched } : r
  })
}
