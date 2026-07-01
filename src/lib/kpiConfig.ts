/**
 * KPI Configuration Engine
 *
 * Defines all 18 KPI cards for the Mac Fleet Reports dashboard.
 * Each KPI has:
 *   - id, title, description, group
 *   - filterFn: which devices belong to this KPI
 *   - columns: what to show in the modal table
 *   - getRecommendedAction / getRiskLevel: used in the Recommendations sheet
 */

import type { ApiDevice } from '../api'

// ── Types ─────────────────────────────────────────────────────────────────────

export type KpiId =
  // Fleet Overview (5)
  | 'total-devices'
  | 'healthy-devices'
  | 'requiring-action'
  | 'compliance-score'
  | 'fleet-risk-score'
  // Patch Health (4)
  | 'fully-patched'
  | 'missing-critical-patches'
  | 'missing-security-updates'
  | 'missing-app-updates'
  // Device Lifecycle (5)
  | 'active-devices'
  | 'stale-devices'
  | 'inactive-devices'
  | 'eol-devices'
  | 'near-eol-devices'
  // OS Health (4)
  | 'on-current-version'
  | 'one-version-behind'
  | 'two-plus-versions-behind'
  | 'latest-macos-version'

export type KpiGroup =
  | 'Fleet Overview'
  | 'Patch Health'
  | 'Device Lifecycle'
  | 'OS Health'

export interface KpiColumn {
  key: string
  label: string
  visible: boolean      // default visibility
  sortable: boolean
  render?: (device: ApiDevice) => string
}

export interface KpiConfig {
  id: KpiId
  group: KpiGroup
  title: string
  description: string
  accentColor: string   // CSS color string
  isInfoCard?: boolean  // no drill-down (e.g. "Latest macOS Version")
  filterFn: (devices: ApiDevice[], opts?: KpiFilterOpts) => ApiDevice[]
  getValue: (devices: ApiDevice[], opts?: KpiFilterOpts) => string | number
  columns: KpiColumn[]
  getRecommendedAction: (device: ApiDevice) => string
  getRiskLevel: (device: ApiDevice) => 'Critical' | 'High' | 'Medium' | 'Low'
}

export interface KpiFilterOpts {
  staleThresholdDays?: number   // default 30
  nearEolThresholdDays?: number // default 90
}

// ── macOS Version Helpers ─────────────────────────────────────────────────────

export const CURRENT_MACOS = { major: 15, version: '15.5', name: 'Tahoe' }

// Major versions that are fully EOL (Apple ended security updates)
const EOL_MAJOR_VERSIONS = new Set([10, 11])

// Major versions EOL within 90 days (near EOL) — update quarterly
const NEAR_EOL_MAJOR_VERSIONS = new Set([12]) // Monterey

function parseMajorVersion(osVersion: string): number {
  const m = (osVersion ?? '').match(/^(\d+)/)
  return m ? parseInt(m[1]) : 0
}

function parseOsVersion(osVersion: string): number[] {
  return (osVersion ?? '').split('.').map(Number)
}

function compareVersions(a: string, b: string): number {
  const pa = parseOsVersion(a)
  const pb = parseOsVersion(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

function versionsBehind(osVersion: string): number {
  const major = parseMajorVersion(osVersion)
  if (major === 0) return 99
  return Math.max(0, CURRENT_MACOS.major - major)
}

// ── Last Check-In Helpers ─────────────────────────────────────────────────────

function parseLastCheckIn(lastCheckIn: string): Date | null {
  if (!lastCheckIn || lastCheckIn === 'Just added' || lastCheckIn === '—') return null
  // Relative strings
  const relMatch = lastCheckIn.match(/(\d+)\s+(minute|hour|day|week|month)s?\s+ago/i)
  if (relMatch) {
    const n = parseInt(relMatch[1])
    const unit = relMatch[2].toLowerCase()
    const now = new Date()
    if (unit === 'minute') return new Date(now.getTime() - n * 60_000)
    if (unit === 'hour')   return new Date(now.getTime() - n * 3_600_000)
    if (unit === 'day')    return new Date(now.getTime() - n * 86_400_000)
    if (unit === 'week')   return new Date(now.getTime() - n * 7 * 86_400_000)
    if (unit === 'month')  return new Date(now.getTime() - n * 30 * 86_400_000)
  }
  const d = new Date(lastCheckIn)
  return isNaN(d.getTime()) ? null : d
}

function daysSinceCheckIn(lastCheckIn: string): number {
  const d = parseLastCheckIn(lastCheckIn)
  if (!d) return 999
  return Math.floor((Date.now() - d.getTime()) / 86_400_000)
}

function isStale(device: ApiDevice, thresholdDays = 30): boolean {
  const days = daysSinceCheckIn(device.lastCheckIn)
  return days > 7 && days <= thresholdDays
}

function isInactive(device: ApiDevice): boolean {
  return daysSinceCheckIn(device.lastCheckIn) > 30 && daysSinceCheckIn(device.lastCheckIn) <= 90
}

function isActive(device: ApiDevice): boolean {
  return daysSinceCheckIn(device.lastCheckIn) <= 7
}

// ── Patch Helpers (derived from available fields) ────────────────────────────

function hasMissingCriticalPatch(device: ApiDevice): boolean {
  return device.severity === 'Critical' ||
    device.complianceState === 'Non-Compliant' &&
    (device.primaryIssue?.toLowerCase().includes('patch') ||
     device.primaryIssue?.toLowerCase().includes('update') ||
     device.primaryIssue?.toLowerCase().includes('cve') ||
     device.policyFailed?.toLowerCase().includes('patch') ||
     device.policyFailed?.toLowerCase().includes('update'))
}

function hasMissingSecurityUpdate(device: ApiDevice): boolean {
  return (device.severity === 'High' || device.severity === 'Critical') &&
    device.complianceState !== 'Compliant'
}

function hasMissingAppUpdate(device: ApiDevice): boolean {
  return device.severity === 'Medium' && device.complianceState !== 'Compliant'
}

function isFullyPatched(device: ApiDevice): boolean {
  return device.complianceState === 'Compliant' &&
    device.severity === 'Low' &&
    !device.primaryIssue
}

// ── EOL Helpers ───────────────────────────────────────────────────────────────

function isEol(device: ApiDevice): boolean {
  const major = parseMajorVersion(device.osVersion)
  return EOL_MAJOR_VERSIONS.has(major)
}

function isNearEol(device: ApiDevice): boolean {
  const major = parseMajorVersion(device.osVersion)
  return NEAR_EOL_MAJOR_VERSIONS.has(major) && !EOL_MAJOR_VERSIONS.has(major)
}

// ── Compliance / Health Helpers ───────────────────────────────────────────────

function isHealthy(device: ApiDevice): boolean {
  return device.complianceState === 'Compliant' &&
    !isEol(device) &&
    !isInactive(device) &&
    versionsBehind(device.osVersion) <= 1
}

function requiresAction(device: ApiDevice): boolean {
  return !isHealthy(device)
}

// ── Display Helpers ───────────────────────────────────────────────────────────

function fmtDaysAgo(lastCheckIn: string): string {
  const days = daysSinceCheckIn(lastCheckIn)
  if (days === 999) return 'Unknown'
  if (days === 0)   return 'Today'
  if (days === 1)   return 'Yesterday'
  return `${days} days ago`
}

function fmtOsStatus(osVersion: string): string {
  const behind = versionsBehind(osVersion)
  if (behind === 0) return '✓ Current'
  if (behind === 1) return '↓ 1 version behind'
  if (behind === 2) return '↓↓ 2 versions behind'
  return `↓↓↓ ${behind} versions behind`
}

function fmtLifecycleStatus(device: ApiDevice): string {
  if (isEol(device))      return 'EOL'
  if (isNearEol(device))  return 'Near EOL'
  const days = daysSinceCheckIn(device.lastCheckIn)
  if (days > 90)  return 'Inactive'
  if (days > 30)  return 'Stale'
  return 'Active'
}

// ── Common Column Sets ────────────────────────────────────────────────────────

const BASE_COLS: KpiColumn[] = [
  { key: 'deviceName',      label: 'Device Name',     visible: true,  sortable: true },
  { key: 'serialNumber',    label: 'Serial Number',   visible: false, sortable: true },
  { key: 'user',            label: 'Assigned User',   visible: true,  sortable: true },
  { key: 'model',           label: 'Device Model',    visible: true,  sortable: true },
  { key: 'managementSource',label: 'MDM Source',      visible: false, sortable: true },
]

const PATCH_COLS: KpiColumn[] = [
  ...BASE_COLS,
  { key: 'osVersion',       label: 'macOS Version',   visible: true,  sortable: true },
  { key: 'complianceState', label: 'Compliance',      visible: true,  sortable: true },
  { key: 'severity',        label: 'Severity',        visible: true,  sortable: true },
  { key: 'primaryIssue',    label: 'Primary Issue',   visible: true,  sortable: true },
  { key: 'lastCheckIn',     label: 'Last Check-In',   visible: true,  sortable: true,
    render: d => fmtDaysAgo(d.lastCheckIn) },
  { key: 'patchStatus',     label: 'Patch Status',    visible: true,  sortable: true,
    render: d => isFullyPatched(d) ? 'Fully Patched' : hasMissingCriticalPatch(d) ? 'Missing Critical' : 'Missing Updates' },
  { key: 'riskLevel',       label: 'Risk Level',      visible: true,  sortable: true,
    render: d => d.severity },
  { key: 'action',          label: 'Recommended Action', visible: true, sortable: false },
]

const LIFECYCLE_COLS: KpiColumn[] = [
  ...BASE_COLS,
  { key: 'osVersion',       label: 'macOS Version',   visible: true,  sortable: true },
  { key: 'lastCheckIn',     label: 'Last Check-In',   visible: true,  sortable: true,
    render: d => fmtDaysAgo(d.lastCheckIn) },
  { key: 'daysStale',       label: 'Days Since Check-In', visible: true, sortable: true,
    render: d => { const n = daysSinceCheckIn(d.lastCheckIn); return n === 999 ? 'Unknown' : String(n) } },
  { key: 'lifecycleStatus', label: 'Lifecycle Status', visible: true, sortable: true,
    render: d => fmtLifecycleStatus(d) },
  { key: 'complianceState', label: 'Compliance',       visible: true, sortable: true },
  { key: 'riskLevel',       label: 'Risk Level',       visible: true, sortable: true,
    render: d => d.severity },
  { key: 'action',          label: 'Recommended Action', visible: true, sortable: false },
]

const OS_COLS: KpiColumn[] = [
  ...BASE_COLS,
  { key: 'osVersion',       label: 'Current macOS',     visible: true,  sortable: true },
  { key: 'latestVersion',   label: 'Latest Available',  visible: true,  sortable: false,
    render: () => CURRENT_MACOS.version },
  { key: 'versionsBehind',  label: 'Versions Behind',   visible: true,  sortable: true,
    render: d => String(versionsBehind(d.osVersion)) },
  { key: 'osStatus',        label: 'OS Status',         visible: true,  sortable: true,
    render: d => fmtOsStatus(d.osVersion) },
  { key: 'upgradeEligible', label: 'Upgrade Eligible',  visible: true,  sortable: false,
    render: d => isEol(d) ? 'Hardware Limit' : 'Eligible' },
  { key: 'complianceState', label: 'Compliance',        visible: true,  sortable: true },
  { key: 'lastCheckIn',     label: 'Last Check-In',     visible: true,  sortable: true,
    render: d => fmtDaysAgo(d.lastCheckIn) },
  { key: 'action',          label: 'Recommended Action', visible: true, sortable: false },
]

const FLEET_COLS: KpiColumn[] = [
  ...BASE_COLS,
  { key: 'osVersion',       label: 'macOS Version',   visible: true,  sortable: true },
  { key: 'complianceState', label: 'Compliance',      visible: true,  sortable: true },
  { key: 'severity',        label: 'Severity',        visible: true,  sortable: true },
  { key: 'primaryIssue',    label: 'Primary Issue',   visible: true,  sortable: true },
  { key: 'lastCheckIn',     label: 'Last Check-In',   visible: true,  sortable: true,
    render: d => fmtDaysAgo(d.lastCheckIn) },
  { key: 'lifecycleStatus', label: 'Lifecycle Status', visible: true, sortable: true,
    render: d => fmtLifecycleStatus(d) },
  { key: 'eolStatus',       label: 'EOL Status',      visible: true,  sortable: true,
    render: d => isEol(d) ? 'EOL' : isNearEol(d) ? 'Near EOL' : '—' },
  { key: 'riskLevel',       label: 'Risk Level',      visible: true,  sortable: true,
    render: d => d.severity },
  { key: 'action',          label: 'Recommended Action', visible: true, sortable: false },
]

// ── The 18 KPI Configurations ─────────────────────────────────────────────────

export const KPI_CONFIGS: Record<KpiId, KpiConfig> = {

  // ── Fleet Overview ──────────────────────────────────────────────────────────

  'total-devices': {
    id: 'total-devices', group: 'Fleet Overview',
    title: 'Total Devices',
    description: 'All enrolled macOS devices currently managed by your MDM platform.',
    accentColor: '#6366F1',
    filterFn: devices => devices,
    getValue: devices => devices.length,
    columns: FLEET_COLS,
    getRecommendedAction: d => {
      if (hasMissingCriticalPatch(d)) return 'Apply critical patches immediately'
      if (isEol(d)) return 'Schedule device replacement'
      if (!isActive(d)) return 'Investigate check-in failure'
      return 'No action required'
    },
    getRiskLevel: d => d.severity,
  },

  'healthy-devices': {
    id: 'healthy-devices', group: 'Fleet Overview',
    title: 'Healthy Devices',
    description: 'Devices that are compliant, on a supported macOS version, active, and not EOL.',
    accentColor: '#10B981',
    filterFn: devices => devices.filter(d => isHealthy(d)),
    getValue: devices => devices.filter(d => isHealthy(d)).length,
    columns: FLEET_COLS,
    getRecommendedAction: () => 'Maintain current patch schedule',
    getRiskLevel: () => 'Low',
  },

  'requiring-action': {
    id: 'requiring-action', group: 'Fleet Overview',
    title: 'Requiring Action',
    description: 'Devices with compliance failures, missing patches, outdated OS, or lifecycle issues.',
    accentColor: '#EF4444',
    filterFn: devices => devices.filter(d => requiresAction(d)),
    getValue: devices => devices.filter(d => requiresAction(d)).length,
    columns: FLEET_COLS,
    getRecommendedAction: d => {
      if (hasMissingCriticalPatch(d)) return 'Apply critical patches immediately'
      if (isEol(d)) return 'Replace device — no security updates available'
      if (isInactive(d)) return 'Recover device or initiate retirement'
      if (versionsBehind(d.osVersion) >= 2) return 'Upgrade macOS to latest version'
      return 'Review compliance policy failures'
    },
    getRiskLevel: d => d.severity,
  },

  'compliance-score': {
    id: 'compliance-score', group: 'Fleet Overview',
    title: 'Compliance Score',
    description: 'Weighted compliance score across patch status, OS currency, device lifecycle, and security controls.',
    accentColor: '#7C5CFC',
    filterFn: devices => devices,
    getValue: devices => {
      if (!devices.length) return '—'
      const compliant = devices.filter(d => d.complianceState === 'Compliant').length
      return `${((compliant / devices.length) * 100).toFixed(1)}%`
    },
    columns: FLEET_COLS,
    getRecommendedAction: d => {
      if (d.complianceState === 'Non-Compliant') return 'Remediate compliance failures'
      if (d.complianceState === 'Warning') return 'Address policy warnings'
      return 'Maintain compliance'
    },
    getRiskLevel: d => d.complianceState === 'Non-Compliant' ? 'High' : d.complianceState === 'Warning' ? 'Medium' : 'Low',
  },

  'fleet-risk-score': {
    id: 'fleet-risk-score', group: 'Fleet Overview',
    title: 'Fleet Risk Score',
    description: 'Composite risk metric. Higher score = higher risk. Calculated from EOL devices, missing patches, stale check-ins, and outdated OS.',
    accentColor: '#F59E0B',
    filterFn: devices => devices.filter(d => d.severity === 'Critical' || d.severity === 'High' || isEol(d)),
    getValue: devices => {
      if (!devices.length) return 0
      const eolWeight     = devices.filter(d => isEol(d)).length * 3
      const critPatch     = devices.filter(d => hasMissingCriticalPatch(d)).length * 2.5
      const staleDevices  = devices.filter(d => !isActive(d)).length * 1.5
      const outdatedOs    = devices.filter(d => versionsBehind(d.osVersion) >= 2).length
      const raw = (eolWeight + critPatch + staleDevices + outdatedOs) / devices.length * 10
      return Math.min(100, Math.round(raw))
    },
    columns: FLEET_COLS,
    getRecommendedAction: d => {
      if (isEol(d)) return 'Immediate replacement required — no security updates'
      if (hasMissingCriticalPatch(d)) return 'Apply critical patches within 24h'
      return 'Review and address compliance issues'
    },
    getRiskLevel: d => d.severity,
  },

  // ── Patch Health ─────────────────────────────────────────────────────────────

  'fully-patched': {
    id: 'fully-patched', group: 'Patch Health',
    title: 'Fully Patched Devices',
    description: 'Devices with no missing patches — compliant with all security, OS, and application update policies.',
    accentColor: '#10B981',
    filterFn: devices => devices.filter(d => isFullyPatched(d)),
    getValue: devices => devices.filter(d => isFullyPatched(d)).length,
    columns: PATCH_COLS,
    getRecommendedAction: () => 'Maintain patch schedule — no action required',
    getRiskLevel: () => 'Low',
  },

  'missing-critical-patches': {
    id: 'missing-critical-patches', group: 'Patch Health',
    title: 'Missing Critical Patches',
    description: 'Devices missing one or more critical security patches (CVSS ≥ 9.0 or Apple-rated Critical). These represent active exploit risk.',
    accentColor: '#EF4444',
    filterFn: devices => devices.filter(d => hasMissingCriticalPatch(d)),
    getValue: devices => devices.filter(d => hasMissingCriticalPatch(d)).length,
    columns: PATCH_COLS,
    getRecommendedAction: () => 'Apply critical patches within 24 hours',
    getRiskLevel: () => 'Critical',
  },

  'missing-security-updates': {
    id: 'missing-security-updates', group: 'Patch Health',
    title: 'Missing Security Updates',
    description: 'Devices missing security updates (non-critical but important). Should be resolved within 7 days.',
    accentColor: '#F59E0B',
    filterFn: devices => devices.filter(d => hasMissingSecurityUpdate(d) && !hasMissingCriticalPatch(d)),
    getValue: devices => devices.filter(d => hasMissingSecurityUpdate(d) && !hasMissingCriticalPatch(d)).length,
    columns: PATCH_COLS,
    getRecommendedAction: () => 'Schedule security update deployment within 7 days',
    getRiskLevel: () => 'High',
  },

  'missing-app-updates': {
    id: 'missing-app-updates', group: 'Patch Health',
    title: 'Missing App Updates',
    description: 'Devices with available application updates. Lower risk but contributes to compliance score.',
    accentColor: '#D97706',
    filterFn: devices => devices.filter(d => hasMissingAppUpdate(d) && !hasMissingSecurityUpdate(d)),
    getValue: devices => devices.filter(d => hasMissingAppUpdate(d) && !hasMissingSecurityUpdate(d)).length,
    columns: PATCH_COLS,
    getRecommendedAction: () => 'Schedule application updates in next maintenance window',
    getRiskLevel: () => 'Medium',
  },

  // ── Device Lifecycle ─────────────────────────────────────────────────────────

  'active-devices': {
    id: 'active-devices', group: 'Device Lifecycle',
    title: 'Active Devices',
    description: 'Devices that have checked in within the last 7 days. These are actively being managed.',
    accentColor: '#10B981',
    filterFn: devices => devices.filter(d => isActive(d)),
    getValue: devices => devices.filter(d => isActive(d)).length,
    columns: LIFECYCLE_COLS,
    getRecommendedAction: d => {
      if (hasMissingCriticalPatch(d)) return 'Apply critical patches'
      if (versionsBehind(d.osVersion) >= 2) return 'Schedule macOS upgrade'
      return 'No action required'
    },
    getRiskLevel: d => d.severity,
  },

  'stale-devices': {
    id: 'stale-devices', group: 'Device Lifecycle',
    title: 'Stale Devices',
    description: 'Devices that have not checked in within the configured stale threshold. May indicate connectivity issues or user absence.',
    accentColor: '#F59E0B',
    filterFn: (devices, opts) => {
      const thresh = opts?.staleThresholdDays ?? 30
      return devices.filter(d => {
        const days = daysSinceCheckIn(d.lastCheckIn)
        return days > 7 && days <= thresh
      })
    },
    getValue: (devices, opts) => {
      const thresh = opts?.staleThresholdDays ?? 30
      return devices.filter(d => {
        const days = daysSinceCheckIn(d.lastCheckIn)
        return days > 7 && days <= thresh
      }).length
    },
    columns: LIFECYCLE_COLS,
    getRecommendedAction: d => {
      const days = daysSinceCheckIn(d.lastCheckIn)
      if (days > 60) return 'Send urgent recall notice — mark as potentially lost'
      return 'Send check-in reminder to assigned user'
    },
    getRiskLevel: d => {
      const days = daysSinceCheckIn(d.lastCheckIn)
      return days > 60 ? 'High' : days > 30 ? 'Medium' : 'Low'
    },
  },

  'inactive-devices': {
    id: 'inactive-devices', group: 'Device Lifecycle',
    title: 'Inactive Devices',
    description: 'Devices with no check-in for 31–90 days. High probability of being lost, forgotten, or off-network.',
    accentColor: '#EF4444',
    filterFn: devices => devices.filter(d => {
      const days = daysSinceCheckIn(d.lastCheckIn)
      return days > 30 && days <= 90
    }),
    getValue: devices => devices.filter(d => {
      const days = daysSinceCheckIn(d.lastCheckIn)
      return days > 30 && days <= 90
    }).length,
    columns: LIFECYCLE_COLS,
    getRecommendedAction: () => 'Escalate to manager — investigate device location, initiate retirement if unrecovered',
    getRiskLevel: () => 'High',
  },

  'eol-devices': {
    id: 'eol-devices', group: 'Device Lifecycle',
    title: 'EOL Devices',
    description: 'Devices running a macOS version Apple no longer supports with security updates. Critical security risk — replacement required.',
    accentColor: '#DC2626',
    filterFn: devices => devices.filter(d => isEol(d)),
    getValue: devices => devices.filter(d => isEol(d)).length,
    columns: [
      ...BASE_COLS,
      { key: 'osVersion',      label: 'macOS Version',   visible: true, sortable: true },
      { key: 'eolStatus',      label: 'EOL Status',      visible: true, sortable: false, render: () => '● EOL' },
      { key: 'lastCheckIn',    label: 'Last Check-In',   visible: true, sortable: true, render: d => fmtDaysAgo(d.lastCheckIn) },
      { key: 'complianceState',label: 'Compliance',      visible: true, sortable: true },
      { key: 'riskLevel',      label: 'Risk Level',      visible: true, sortable: true, render: () => 'Critical' },
      { key: 'action',         label: 'Recommended Action', visible: true, sortable: false },
    ],
    getRecommendedAction: () => 'Immediate replacement required — device receives no security updates',
    getRiskLevel: () => 'Critical',
  },

  'near-eol-devices': {
    id: 'near-eol-devices', group: 'Device Lifecycle',
    title: 'Near EOL Devices',
    description: 'Devices approaching End-of-Life within 90 days. Plan replacement now to avoid security gaps.',
    accentColor: '#F97316',
    filterFn: devices => devices.filter(d => isNearEol(d)),
    getValue: devices => devices.filter(d => isNearEol(d)).length,
    columns: [
      ...BASE_COLS,
      { key: 'osVersion',      label: 'macOS Version',   visible: true, sortable: true },
      { key: 'eolStatus',      label: 'EOL Status',      visible: true, sortable: false, render: () => '⚠ Near EOL' },
      { key: 'lastCheckIn',    label: 'Last Check-In',   visible: true, sortable: true, render: d => fmtDaysAgo(d.lastCheckIn) },
      { key: 'complianceState',label: 'Compliance',      visible: true, sortable: true },
      { key: 'riskLevel',      label: 'Risk Level',      visible: true, sortable: false, render: () => 'High' },
      { key: 'action',         label: 'Recommended Action', visible: true, sortable: false },
    ],
    getRecommendedAction: () => 'Schedule replacement within 60 days — submit procurement request',
    getRiskLevel: () => 'High',
  },

  // ── OS Health ────────────────────────────────────────────────────────────────

  'on-current-version': {
    id: 'on-current-version', group: 'OS Health',
    title: `On ${CURRENT_MACOS.name} (Current)`,
    description: `Devices running macOS ${CURRENT_MACOS.version} — the latest available version.`,
    accentColor: '#10B981',
    filterFn: devices => devices.filter(d => versionsBehind(d.osVersion) === 0),
    getValue: devices => devices.filter(d => versionsBehind(d.osVersion) === 0).length,
    columns: OS_COLS,
    getRecommendedAction: () => 'Maintain current OS — no upgrade needed',
    getRiskLevel: d => d.severity,
  },

  'one-version-behind': {
    id: 'one-version-behind', group: 'OS Health',
    title: '1 Version Behind',
    description: 'Devices running macOS one major version behind the latest. Should be upgraded in next maintenance window.',
    accentColor: '#F59E0B',
    filterFn: devices => devices.filter(d => versionsBehind(d.osVersion) === 1),
    getValue: devices => devices.filter(d => versionsBehind(d.osVersion) === 1).length,
    columns: OS_COLS,
    getRecommendedAction: () => 'Schedule macOS upgrade in next maintenance window',
    getRiskLevel: () => 'Medium',
  },

  'two-plus-versions-behind': {
    id: 'two-plus-versions-behind', group: 'OS Health',
    title: '2+ Versions Behind',
    description: 'Devices running macOS two or more major versions behind. These devices are missing significant security improvements and should be upgraded urgently.',
    accentColor: '#EF4444',
    filterFn: devices => devices.filter(d => versionsBehind(d.osVersion) >= 2),
    getValue: devices => devices.filter(d => versionsBehind(d.osVersion) >= 2).length,
    columns: OS_COLS,
    getRecommendedAction: d => {
      if (isEol(d)) return 'Hardware cannot support latest macOS — replace device'
      return 'Upgrade macOS urgently — 2+ versions behind current'
    },
    getRiskLevel: () => 'High',
  },

  'latest-macos-version': {
    id: 'latest-macos-version', group: 'OS Health',
    title: 'Latest macOS Version',
    description: `Current latest macOS release: ${CURRENT_MACOS.version} (${CURRENT_MACOS.name}). Informational card — click to see all devices on this version.`,
    accentColor: '#6366F1',
    isInfoCard: true,
    filterFn: devices => devices.filter(d => compareVersions(d.osVersion, CURRENT_MACOS.version) >= 0),
    getValue: () => `${CURRENT_MACOS.version} (${CURRENT_MACOS.name})`,
    columns: OS_COLS,
    getRecommendedAction: () => 'No action — device is on latest macOS',
    getRiskLevel: () => 'Low',
  },
}

// ── Utility exports ────────────────────────────────────────────────────────────

export const KPI_GROUPS: KpiGroup[] = [
  'Fleet Overview',
  'Patch Health',
  'Device Lifecycle',
  'OS Health',
]

export const KPI_IDS_BY_GROUP: Record<KpiGroup, KpiId[]> = {
  'Fleet Overview': [
    'total-devices', 'healthy-devices', 'requiring-action',
    'compliance-score', 'fleet-risk-score',
  ],
  'Patch Health': [
    'fully-patched', 'missing-critical-patches',
    'missing-security-updates', 'missing-app-updates',
  ],
  'Device Lifecycle': [
    'active-devices', 'stale-devices', 'inactive-devices',
    'eol-devices', 'near-eol-devices',
  ],
  'OS Health': [
    'on-current-version', 'one-version-behind',
    'two-plus-versions-behind', 'latest-macos-version',
  ],
}

export { daysSinceCheckIn, versionsBehind, fmtDaysAgo, fmtOsStatus, fmtLifecycleStatus, isHealthy, isEol, isNearEol, isActive }
