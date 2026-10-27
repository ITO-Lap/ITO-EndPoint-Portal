import { isInSystemBaseline } from '../data/macosSystemApps.js'

/**
 * macOS app classification.
 *
 * Every raw inventory row is kept; this only *labels* it so the default list can hide Apple apps that shipped with
 * macOS and nothing else. The rules fail towards visibility: anything not confidently a system app stays in the list.
 *
 * Order of evidence:
 *  1. A known managed deployment (Intune / Endpoint Central) wins, even for Apple apps — a managed GarageBand is
 *     `managed_self_service`, never hidden.
 *  2. `system_preinstalled` needs several agreeing signals (never just a name, a `com.apple.*` id, an Apple vendor,
 *     or `/Applications`):
 *       a. sealed-system-volume path AND Apple bundle id (high confidence when the vendor is Apple too), or
 *       b. entry in the versioned baseline for the device's macOS version AND (sealed path OR Apple bundle id).
 *  3. Complete data (bundle id + path + name) with no managed link → `manual_or_user_installed`.
 *  4. Otherwise → `unknown_review_required`.
 *
 * Code-signature data is not available from Endpoint Central's inventory, so "signed by Apple" is approximated by the
 * reported vendor; the path/bundle/baseline signals carry the decision.
 */

export type MacAppClassification =
  | 'system_preinstalled'
  | 'managed_self_service'
  | 'manual_or_user_installed'
  | 'unknown_review_required'

export type MacAppSource = 'intune' | 'endpoint_central' | 'self_service' | 'manual' | 'unknown'

export interface MacAppSignals {
  name: string
  bundleId?: string
  path?: string
  version?: string
  vendor?: string
  macosMajor?: number | null
  /** Which system reported the row. */
  reportedBy: 'intune' | 'endpoint_central'
}

export interface ManagedDeployment {
  source: 'intune' | 'endpoint_central'
  /** e.g. "Company Portal (available)", "Self Service Portal", "Software deployment". */
  kind: string
}

export interface MacAppClassificationResult {
  classification: MacAppClassification
  /** Where the app most plausibly came from — drives the Source filter. */
  installSource: MacAppSource
  confidence: 'high' | 'medium' | 'low'
  /** Auditable, human-readable explanation shown in the UI. */
  reason: string
}

/** Looks up managed deployments by bundle id first, then by normalized app name. */
export class DeploymentIndex {
  private byBundle = new Map<string, ManagedDeployment>()
  private byName = new Map<string, ManagedDeployment>()
  private byPrefix: Array<[string, ManagedDeployment]> = []

  add(deployment: ManagedDeployment, ids: { bundleId?: string; name?: string }): void {
    if (ids.bundleId) this.byBundle.set(ids.bundleId.toLowerCase(), deployment)
    if (ids.name) this.byName.set(normalizeName(ids.name), deployment)
  }

  /** Deployment evident from a bundle-id family (e.g. every `com.manageengine.*` app is an Endpoint Central component). */
  addBundlePrefix(prefix: string, deployment: ManagedDeployment): void {
    const key = prefix.toLowerCase()
    this.byPrefix = [...this.byPrefix.filter(([p]) => p !== key), [key, deployment]] // idempotent
  }

  find(bundleId: string | undefined, name: string): ManagedDeployment | undefined {
    const id = bundleId?.toLowerCase()
    return (id ? this.byBundle.get(id) : undefined)
      ?? (id ? this.byPrefix.find(([prefix]) => id.startsWith(prefix))?.[1] : undefined)
      ?? this.byName.get(normalizeName(name))
  }

  get size(): number { return this.byBundle.size + this.byName.size + this.byPrefix.length }
}

export const normalizeName = (n: string): string => n.trim().toLowerCase().replace(/\s+/g, ' ')

/** Paths on the sealed, read-only system volume (including the cryptex that carries Safari on 13+). */
const PROTECTED_PATHS = ['/system/applications/', '/system/library/', '/system/cryptexes/']
const isProtectedPath = (p: string): boolean => PROTECTED_PATHS.some(prefix => p.toLowerCase().startsWith(prefix))
/**
 * Folders macOS and Apple's own installers write to outside the sealed volume (printer/scanner drivers, Script Editor
 * templates, device-sync helpers, Command Line Tools). Counts as a system signal only together with an Apple bundle id
 * and Apple vendor.
 */
const APPLE_SUPPORT_PATHS = [
  '/library/apple/', '/library/application support/script editor/', '/library/printers/',
  '/library/image capture/', '/library/developer/commandlinetools/', '/library/frameworks/',
]
const isAppleSupportPath = (p: string): boolean => APPLE_SUPPORT_PATHS.some(prefix => p.toLowerCase().startsWith(prefix))
const isAppleBundle = (id: string): boolean => /^com\.apple\./i.test(id)
const isAppleVendor = (v: string): boolean => /^apple( inc\.?)?$/i.test(v.trim())

// Endpoint Central writes "--", "-" or "Unknown" for fields it could not read; all of those mean "not reported".
const clean = (v: string | undefined): string => (v && !/^(-+|unknown|n\/a|none)$/i.test(v.trim()) ? v.trim() : '')

export function classifyMacApp(app: MacAppSignals, deployments?: DeploymentIndex): MacAppClassificationResult {
  const bundleId = clean(app.bundleId)
  const path = clean(app.path)
  const vendor = clean(app.vendor)
  const name = clean(app.name)

  // 1. Managed deployment association wins over every other signal.
  const deployment = deployments?.find(bundleId || undefined, name)
  if (deployment) {
    return {
      classification: 'managed_self_service',
      installSource: /self service|company portal/i.test(deployment.kind) ? 'self_service' : deployment.source,
      confidence: 'high',
      reason: `Matched ${deployment.source === 'intune' ? 'Intune' : 'Endpoint Central'} deployment: ${deployment.kind}`,
    }
  }

  // 2. Pre-installed macOS app — several signals must agree.
  const protectedPath = path !== '' && isProtectedPath(path)
  const appleBundle = bundleId !== '' && isAppleBundle(bundleId)
  const appleVendor = vendor !== '' && isAppleVendor(vendor)
  const inBaseline = bundleId !== '' && isInSystemBaseline(bundleId, app.macosMajor ?? null)

  if (protectedPath && appleBundle) {
    return {
      classification: 'system_preinstalled', installSource: 'unknown', confidence: appleVendor ? 'high' : 'medium',
      reason: appleVendor
        ? 'Found on the sealed macOS system volume and Apple-signed (Apple bundle id and vendor)'
        : 'Found on the sealed macOS system volume with an Apple bundle id (vendor not reported)',
    }
  }
  if (path !== '' && isAppleSupportPath(path) && appleBundle && (appleVendor || vendor === '')) {
    return {
      classification: 'system_preinstalled', installSource: 'unknown', confidence: 'medium',
      reason: `Apple-installed OS support component (Apple support folder and Apple bundle id${appleVendor ? ' and vendor' : '; vendor not reported'})`,
    }
  }
  if (inBaseline && (protectedPath || appleBundle)) {
    const major = app.macosMajor ? `macOS ${app.macosMajor}` : 'known macOS'
    return {
      classification: 'system_preinstalled', installSource: 'unknown', confidence: protectedPath ? 'high' : 'medium',
      reason: `Matched the ${major} Apple system-app baseline${protectedPath ? ' and system path' : ' and Apple bundle id'}`,
    }
  }

  // 3. Complete data and no managed link → installed by a person (or by a deployment we cannot see).
  if (bundleId && path && name) {
    return {
      classification: 'manual_or_user_installed', installSource: 'manual', confidence: 'medium',
      reason: appleBundle
        ? 'Apple app that is not part of the macOS baseline; no managed deployment found'
        : 'Installed outside the system volume; no managed deployment found',
    }
  }

  // 4. Not enough information — keep it visible for review.
  const missing = [!bundleId && 'bundle id', !path && 'install path', !name && 'name'].filter(Boolean).join(', ')
  return {
    classification: 'unknown_review_required', installSource: 'unknown', confidence: 'low',
    reason: `No reliable installation source found (missing ${missing})`,
  }
}

// ── Cross-source de-duplication ──────────────────────────────────────────────

export interface InventoryRecord extends MacAppSignals {
  deviceId: string
  appId?: string
}

const PRIORITY: Record<MacAppClassification, number> = {
  managed_self_service: 3, manual_or_user_installed: 2, unknown_review_required: 1, system_preinstalled: 0,
}

/**
 * Merges the same app reported by several sources on one device. Identity, in order of reliability:
 * device + bundle id → device + application id → device + path → device + normalized name + version.
 * The surviving record keeps the richest identifiers and the union of reporters.
 */
export function dedupeInventoryRecords<T extends InventoryRecord & { reportedByAll?: string[] }>(records: T[]): T[] {
  const out = new Map<string, T>()
  const keyOf = (r: T): string => {
    if (r.bundleId && clean(r.bundleId)) return `${r.deviceId}|b|${r.bundleId.toLowerCase()}`
    if (r.appId) return `${r.deviceId}|a|${r.appId.toLowerCase()}`
    if (r.path && clean(r.path)) return `${r.deviceId}|p|${r.path.toLowerCase()}`
    return `${r.deviceId}|n|${normalizeName(r.name)}|${r.version ?? ''}`
  }
  for (const r of records) {
    const key = keyOf(r)
    const existing = out.get(key)
    if (!existing) { out.set(key, { ...r, reportedByAll: [r.reportedBy] }); continue }
    const reporters = new Set([...(existing.reportedByAll ?? [existing.reportedBy]), r.reportedBy])
    out.set(key, {
      ...existing,
      bundleId: existing.bundleId || r.bundleId,
      path: existing.path || r.path,
      vendor: existing.vendor || r.vendor,
      version: existing.version || r.version,
      reportedByAll: [...reporters],
    })
  }
  return [...out.values()]
}

/** Strongest classification wins when one app is seen with different labels across devices. */
export function strongerClassification(a: MacAppClassification, b: MacAppClassification): MacAppClassification {
  return PRIORITY[a] >= PRIORITY[b] ? a : b
}
