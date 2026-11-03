/**
 * KPI Configuration Engine
 *
 * Defines the KPI cards for the Mac Fleet Reports dashboard.
 * Each KPI has:
 *   - id, title, description, group
 *   - filterFn: which devices belong to this KPI
 *   - columns: what to show in the modal table
 *   - getRecommendedAction / getRiskLevel: used in the Recommendations sheet
 */

import type { ApiDevice, PatchSystemStatus } from '../api'
import { POSTURE_LABEL, POSTURE_TITLE, fleetPostureAverage, postureBreakdownText } from './macPostureScore'

// ── Types ─────────────────────────────────────────────────────────────────────

export type KpiId =
  // Fleet Overview (5)
  | 'total-devices'
  | 'healthy-devices'
  | 'requiring-action'
  | 'compliance-score'
  | 'fleet-risk-score'
  | 'device-security-posture'
  | 'filevault-coverage'
  | 'passcode-missing'
  | 'new-enrollments-month'
  // Patch Health (4)
  | 'fully-patched'
  | 'missing-critical-patches'
  | 'missing-security-updates'
  | 'missing-app-updates'
  // Device Lifecycle (5)
  | 'active-devices'
  | 'stale-devices'
  | 'inactive-devices'
  // OS Health (4)
  | 'macos-current'
  | 'macos-outdated'
  | 'macos-unsupported'
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
  isInfoCard?: boolean
  /** Short qualifier shown under the card value (e.g. to mark a project-calculated metric). */
  caption?: string
  /** Omit the card from the dashboard (rather than show N/A) when its data source is not reporting. */
  hideWhenUnavailable?: boolean
  unavailableReason?: string
  getUnavailableReason?: (devices: ApiDevice[]) => string | undefined
  /** Per-period figures shown on the card instead of the single headline value (empty = fall back to the value). */
  getBreakdown?: (devices: ApiDevice[]) => { label: string; count: number }[]
  getCountSize?: (devices: ApiDevice[]) => number
  getPopulationSize?: (devices: ApiDevice[]) => number
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

function isActive(device: ApiDevice): boolean {
  const days = daysSinceCheckIn(device.lastCheckIn)
  return days !== 999 && days <= 7
}

function hasReportedOsVersion(device: ApiDevice): boolean {
  return /^\d+(?:\.\d+)+$/.test(device.osVersion ?? '')
}

function hasNativeCompliance(device: ApiDevice): boolean {
  return device.managementSource === 'Microsoft Intune'
}

function complianceUnavailableReason(devices: ApiDevice[]): string | undefined {
  return devices.some(hasNativeCompliance)
    ? undefined
    : 'No devices with native compliance data are in this fleet. ManageEngine Endpoint Central does not expose an overall device-compliance verdict through the documented API.'
}

// ── Security / lifecycle helpers ──────────────────────────────────────────────

type FileVaultState = 'On' | 'Off' | 'Pending' | 'Unknown'
function fileVaultState(d: ApiDevice): FileVaultState {
  const status = d.encryptionStatus?.trim().toLowerCase() ?? ''
  if (!status || /^(—|unknown|not reported|not applicable|n\/a|none)$/.test(status)) return 'Unknown'
  if (/\bpending\b/.test(status)) return 'Pending'
  if (/\b(not encrypted|off|disabled|false)\b/.test(status)) return 'Off'
  if (/\b(encrypted|enabled|on|true|yes)\b/.test(status)) return 'On'
  return 'Unknown'
}
const fileVaultAssessed = (d: ApiDevice): boolean => fileVaultState(d) !== 'Unknown'
const passcodeAssessed  = (d: ApiDevice): boolean => d.passcodeStatus === 'Present' || d.passcodeStatus === 'Missing'

/** Oldest macOS major still treated as current — keep in step with CURRENT_MACOS_MAJOR in MacDevicesPage. */
const CURRENT_MACOS_MAJOR = 26
/** Majors below this no longer receive Apple security updates. */
const OLDEST_SUPPORTED_MACOS_MAJOR = 14
const macMajor = (d: ApiDevice): number => (hasReportedOsVersion(d) ? parseInt(d.osVersion.split('.')[0]!, 10) : NaN)
const macosCurrent     = (d: ApiDevice): boolean => macMajor(d) >= CURRENT_MACOS_MAJOR
const macosOutdated    = (d: ApiDevice): boolean => macMajor(d) >= OLDEST_SUPPORTED_MACOS_MAJOR && macMajor(d) < CURRENT_MACOS_MAJOR
const macosUnsupported = (d: ApiDevice): boolean => macMajor(d) < OLDEST_SUPPORTED_MACOS_MAJOR

const enrolledAt = (d: ApiDevice): number => Date.parse(d.enrollmentDate ?? '')
const hasEnrollmentDate = (d: ApiDevice): boolean => Number.isFinite(enrolledAt(d))
/** UTC calendar month `offset` months back from now (0 = current). */
const utcMonth = (offset: number): Date => { const n = new Date(); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - offset, 1)) }
const enrolledInMonth = (d: ApiDevice, offset: number): boolean => {
  if (!hasEnrollmentDate(d)) return false
  const e = new Date(enrolledAt(d)), m = utcMonth(offset)
  return e.getUTCFullYear() === m.getUTCFullYear() && e.getUTCMonth() === m.getUTCMonth()
}
const monthLabel = (offset: number): string => utcMonth(offset).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })

// ── Compliance / Health Helpers ───────────────────────────────────────────────

function isHealthy(device: ApiDevice): boolean {
  return hasNativeCompliance(device) && device.complianceState === 'Compliant' && isActive(device)
}

function requiresAction(device: ApiDevice): boolean {
  return hasNativeCompliance(device) && device.complianceState !== 'Compliant'
}

// ── Display Helpers ───────────────────────────────────────────────────────────

function fmtDaysAgo(lastCheckIn: string): string {
  const days = daysSinceCheckIn(lastCheckIn)
  if (days === 999) return 'Unknown'
  if (days === 0)   return 'Today'
  if (days === 1)   return 'Yesterday'
  return `${days} days ago`
}

function fmtLifecycleStatus(device: ApiDevice): string {
  const days = daysSinceCheckIn(device.lastCheckIn)
  if (days === 999) return 'Unknown'
  if (days > 30) return 'Inactive'
  if (days > 7) return 'Stale'
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

// ── Patch Manager helpers ─────────────────────────────────────────────────────
// Patch data comes from Endpoint Central Patch Manager, which only knows devices
// that run its agent. Devices without a match are "not reported", never "patched".

/** Attach Patch Manager rows to MDM devices by serial number (found in the patch system's names). */
export function attachPatchStatus(devices: ApiDevice[], systems: PatchSystemStatus[]): ApiDevice[] {
  const haystacks = systems.map(sys => ({ sys, text: sys.names.join(' ').toUpperCase() }))
  return devices.map(d => {
    const serial = d.serialNumber?.trim().toUpperCase()
    if (!serial || serial.length < 6) return d
    const hit = haystacks.find(h => h.text.includes(serial))
    return hit ? { ...d, patchStatus: hit.sys } : d
  })
}

/** Patch Health cards that filter the device table and open per-device patch details. */
export const PATCH_FILTER_KPIS: readonly KpiId[] = ['missing-critical-patches', 'missing-security-updates', 'missing-app-updates']
export const isPatchFilterKpi = (id: KpiId): boolean => PATCH_FILTER_KPIS.includes(id)
/** Drawer opens on Critical only when the admin came from the Missing Critical card. */
export const initialPatchView = (id: KpiId): 'critical' | 'all' => (id === 'missing-critical-patches' ? 'critical' : 'all')

const hasPatchData = (d: ApiDevice): boolean => !!d.patchStatus?.scanSucceeded
const missingCritical = (d: ApiDevice): boolean => hasPatchData(d) && d.patchStatus!.criticalPatchCount > 0
const missingOsUpdates = (d: ApiDevice): boolean => hasPatchData(d) && d.patchStatus!.missingOsPatches > 0
const missingAppUpdates = (d: ApiDevice): boolean => hasPatchData(d) && d.patchStatus!.missingThirdPartyPatches > 0
const fullyPatched = (d: ApiDevice): boolean => {
  if (!hasPatchData(d)) return false
  const p = d.patchStatus!
  return p.missingOsPatches + p.missingThirdPartyPatches + p.missingDriverPatches + p.missingBiosPatches === 0
}

const PATCH_UNAVAILABLE =
  'No device in this fleet reports Patch Manager data. Patch status comes from Endpoint Central Patch Manager and only covers devices running its agent; the Patch API client also needs the DesktopCentralCloud.PatchMgmt.READ scope.'
const patchUnavailableReason = (devices: ApiDevice[]): string | undefined =>
  devices.some(hasPatchData) ? undefined : PATCH_UNAVAILABLE

export function patchStatusLabel(d: ApiDevice): string {
  const p = d.patchStatus
  if (!p?.scanSucceeded) return 'Not reported (no Patch Manager agent)'
  const parts = [
    p.missingOsPatches && `${p.missingOsPatches} OS`,
    p.missingThirdPartyPatches && `${p.missingThirdPartyPatches} app`,
    p.missingDriverPatches && `${p.missingDriverPatches} driver`,
    p.missingBiosPatches && `${p.missingBiosPatches} BIOS`,
  ].filter(Boolean)
  return parts.length ? `Missing ${parts.join(', ')}` : 'Fully Patched'
}

const PATCH_COLS: KpiColumn[] = [
  ...BASE_COLS,
  { key: 'osVersion',       label: 'macOS Version',   visible: true,  sortable: true },
  { key: 'encryptionStatus',label: 'Encryption Status',visible: true,  sortable: true },
  { key: 'lastCheckIn',     label: 'Last Check-In',   visible: true,  sortable: true,
    render: d => fmtDaysAgo(d.lastCheckIn) },
  { key: 'patchStatus',     label: 'Patch Status',    visible: true,  sortable: true,
    render: patchStatusLabel },
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
  { key: 'encryptionStatus',label: 'Encryption Status', visible: true, sortable: true },
  { key: 'riskLevel',       label: 'Risk Level',       visible: true, sortable: true,
    render: d => d.severity },
  { key: 'action',          label: 'Recommended Action', visible: true, sortable: false },
]

const OS_COLS: KpiColumn[] = [
  ...BASE_COLS,
  { key: 'osVersion',       label: 'Reported macOS Version', visible: true, sortable: true },
  { key: 'lastCheckIn',     label: 'Last Check-In',     visible: true,  sortable: true,
    render: d => fmtDaysAgo(d.lastCheckIn) },
  { key: 'action',          label: 'Recommended Action', visible: true, sortable: false },
]

const POSTURE_COLS: KpiColumn[] = [
  ...BASE_COLS,
  { key: 'postureScore',    label: 'Posture Score (project-calculated)', visible: true, sortable: true,
    render: d => (d.posture?.score ?? 'N/A').toString() },
  { key: 'postureBand',     label: 'Posture Band',    visible: true,  sortable: true,
    render: d => d.posture?.band ?? 'Not calculated' },
  { key: 'postureCoverage', label: 'Signals Assessed', visible: true, sortable: true,
    render: d => (d.posture ? `${Math.round(d.posture.coverage * 100)}%` : 'N/A') },
  { key: 'postureBreakdown',label: 'Score Breakdown', visible: true,  sortable: false,
    render: d => postureBreakdownText(d.posture) },
  { key: 'osVersion',       label: 'macOS Version',   visible: false, sortable: true },
  { key: 'encryptionStatus',label: 'FileVault',       visible: false, sortable: true },
]

const SECURITY_COLS: KpiColumn[] = [
  ...BASE_COLS,
  { key: 'encryptionStatus',label: 'FileVault',       visible: true,  sortable: true },
  { key: 'passcodeStatus',  label: 'Passcode',        visible: true,  sortable: true },
  { key: 'osVersion',       label: 'macOS Version',   visible: true,  sortable: true },
  { key: 'lastCheckIn',     label: 'Last Check-In',   visible: true,  sortable: true,
    render: d => fmtDaysAgo(d.lastCheckIn) },
  { key: 'action',          label: 'Recommended Action', visible: true, sortable: false },
]

const ENROLLMENT_COLS: KpiColumn[] = [
  ...BASE_COLS,
  { key: 'enrollmentDate',  label: 'Enrolled On',     visible: true,  sortable: true,
    render: d => (hasEnrollmentDate(d) ? new Date(enrolledAt(d)).toLocaleDateString() : 'Unknown') },
  { key: 'osVersion',       label: 'macOS Version',   visible: true,  sortable: true },
  { key: 'lastCheckIn',     label: 'Last Check-In',   visible: true,  sortable: true,
    render: d => fmtDaysAgo(d.lastCheckIn) },
  { key: 'action',          label: 'Recommended Action', visible: true, sortable: false },
]

const FLEET_COLS: KpiColumn[] = [
  ...BASE_COLS,
  { key: 'osVersion',       label: 'macOS Version',   visible: true,  sortable: true },
  { key: 'encryptionStatus',label: 'Encryption Status',visible: true,  sortable: true },
  { key: 'severity',        label: 'Severity',        visible: true,  sortable: true },
  { key: 'primaryIssue',    label: 'Primary Issue',   visible: true,  sortable: true },
  { key: 'lastCheckIn',     label: 'Last Check-In',   visible: true,  sortable: true,
    render: d => fmtDaysAgo(d.lastCheckIn) },
  { key: 'lifecycleStatus', label: 'Lifecycle Status', visible: true, sortable: true,
    render: d => fmtLifecycleStatus(d) },
  { key: 'osVersion',       label: 'Reported macOS Version', visible: true, sortable: true },
  { key: 'riskLevel',       label: 'Risk Level',      visible: true,  sortable: true,
    render: d => d.severity },
  { key: 'action',          label: 'Recommended Action', visible: true, sortable: false },
]

// ── KPI Configurations ─────────────────────────────────────────────────

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
    getRecommendedAction: d => isActive(d) ? 'No action required' : 'Review last check-in and contact the assigned user',
    getRiskLevel: d => d.severity,
  },

  'healthy-devices': {
    id: 'healthy-devices', group: 'Fleet Overview',
    hideWhenUnavailable: true,
    title: 'Healthy Devices',
    description: 'Intune-managed devices with native Compliant status and a check-in within the last 7 days.',
    accentColor: '#10B981',
    getUnavailableReason: complianceUnavailableReason,
    filterFn: devices => devices.filter(d => isHealthy(d)),
    getValue: devices => devices.some(hasNativeCompliance) ? devices.filter(d => isHealthy(d)).length : 'N/A',
    getCountSize: devices => devices.filter(d => isHealthy(d)).length,
    getPopulationSize: devices => devices.filter(hasNativeCompliance).length,
    columns: FLEET_COLS,
    getRecommendedAction: () => 'Maintain current patch schedule',
    getRiskLevel: () => 'Low',
  },

  'requiring-action': {
    id: 'requiring-action', group: 'Fleet Overview',
    hideWhenUnavailable: true,
    title: 'Requiring Action',
    description: 'Intune-managed devices with a native compliance status other than Compliant.',
    accentColor: '#EF4444',
    getUnavailableReason: complianceUnavailableReason,
    filterFn: devices => devices.filter(d => requiresAction(d)),
    getValue: devices => devices.some(hasNativeCompliance) ? devices.filter(d => requiresAction(d)).length : 'N/A',
    getCountSize: devices => devices.filter(d => requiresAction(d)).length,
    getPopulationSize: devices => devices.filter(hasNativeCompliance).length,
    columns: FLEET_COLS,
    getRecommendedAction: () => 'Review the device compliance details in its management source',
    getRiskLevel: d => d.severity,
  },

  'compliance-score': {
    id: 'compliance-score', group: 'Fleet Overview',
    hideWhenUnavailable: true,
    title: 'Compliance Score',
    description: 'Native compliance rate from Intune-managed devices only. ManageEngine overall compliance is not available through its documented API.',
    accentColor: '#7C5CFC',
    filterFn: devices => devices.filter(hasNativeCompliance),
    getCountSize: devices => devices.filter(d => hasNativeCompliance(d) && d.complianceState === 'Compliant').length,
    getPopulationSize: devices => devices.filter(hasNativeCompliance).length,
    getUnavailableReason: complianceUnavailableReason,
    getValue: devices => {
      const native = devices.filter(hasNativeCompliance)
      if (!native.length) return 'N/A'
      const compliant = native.filter(d => d.complianceState === 'Compliant').length
      return `${((compliant / native.length) * 100).toFixed(1)}%`
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
    title: 'Inventory Data Gaps',
    description: 'Devices with a missing or unknown last check-in or macOS version in the current MDM inventory.',
    accentColor: '#F59E0B',
    filterFn: devices => devices.filter(d => daysSinceCheckIn(d.lastCheckIn) === 999 || !hasReportedOsVersion(d)),
    getValue: devices => devices.filter(d => daysSinceCheckIn(d.lastCheckIn) === 999 || !hasReportedOsVersion(d)).length,
    columns: FLEET_COLS,
    getRecommendedAction: d => {
      if (daysSinceCheckIn(d.lastCheckIn) === 999) return 'Refresh device inventory to obtain the last check-in'
      return 'Refresh device inventory to obtain the macOS version'
    },
    getRiskLevel: d => d.severity,
  },

  'device-security-posture': {
    id: 'device-security-posture', group: 'Fleet Overview',
    title: POSTURE_TITLE,
    description: `${POSTURE_LABEL}. Weighted from FileVault (30), passcode (20), macOS version relative to the newest in this fleet (20), recent MDM check-in (15) and assigned profiles applied (15). Signals a source does not report are excluded, not counted as failures.`,
    caption: 'Project-calculated · not ManageEngine compliance',
    accentColor: '#0EA5E9',
    getUnavailableReason: devices => fleetPostureAverage(devices).scored
      ? undefined
      : 'Too few posture signals (FileVault, passcode, OS version, MDM check-in, profiles) were reported to calculate a score.',
    filterFn: devices => devices.filter(d => typeof d.posture?.score === 'number'),
    getCountSize: devices => devices.filter(d => d.posture?.band === 'Strong').length,
    getPopulationSize: devices => devices.filter(d => typeof d.posture?.score === 'number').length,
    getValue: devices => {
      const { average } = fleetPostureAverage(devices)
      return average === null ? 'N/A' : `${average} / 100`
    },
    columns: POSTURE_COLS,
    getRecommendedAction: d => {
      const weakest = d.posture?.signals.filter(s => s.earned !== null && s.earned < 1).sort((a, b) => (a.earned as number) * a.weight - (b.earned as number) * b.weight)[0]
      return weakest ? `Improve: ${weakest.label} — ${weakest.detail}` : 'No action — all assessed signals are healthy'
    },
    getRiskLevel: d => (d.posture?.band === 'At risk' ? 'High' : d.posture?.band === 'Fair' ? 'Medium' : 'Low'),
  },

  'filevault-coverage': {
    id: 'filevault-coverage', group: 'Fleet Overview',
    title: 'FileVault Coverage',
    description: 'Share of Macs reporting FileVault disk encryption as On. The device list shows Macs where it is Off or Pending. Macs that do not report an encryption status are excluded.',
    accentColor: '#0EA5E9',
    getUnavailableReason: devices => devices.some(fileVaultAssessed) ? undefined : 'No Mac in this fleet reports a FileVault encryption status.',
    filterFn: devices => devices.filter(d => fileVaultAssessed(d) && fileVaultState(d) !== 'On'),
    getCountSize: devices => devices.filter(d => fileVaultState(d) === 'On').length,
    getPopulationSize: devices => devices.filter(fileVaultAssessed).length,
    getValue: devices => {
      const assessed = devices.filter(fileVaultAssessed)
      return assessed.length ? `${Math.round((assessed.filter(d => fileVaultState(d) === 'On').length / assessed.length) * 100)}%` : 'N/A'
    },
    columns: SECURITY_COLS,
    getRecommendedAction: d => (fileVaultState(d) === 'Pending' ? 'Ask the user to finish FileVault enablement (restart / log in)' : 'Push a FileVault enforcement profile and escrow the recovery key'),
    getRiskLevel: d => (fileVaultState(d) === 'Off' ? 'Critical' : 'High'),
  },

  'passcode-missing': {
    id: 'passcode-missing', group: 'Fleet Overview',
    title: 'Macs Without Passcode',
    description: 'Macs where the MDM reports no device passcode set. Macs that do not report passcode status are excluded.',
    accentColor: '#EF4444',
    getUnavailableReason: devices => devices.some(passcodeAssessed) ? undefined : 'No Mac in this fleet reports passcode status.',
    filterFn: devices => devices.filter(d => d.passcodeStatus === 'Missing'),
    getCountSize: devices => devices.filter(d => d.passcodeStatus === 'Missing').length,
    getPopulationSize: devices => devices.filter(passcodeAssessed).length,
    getValue: devices => (devices.some(passcodeAssessed) ? devices.filter(d => d.passcodeStatus === 'Missing').length : 'N/A'),
    columns: SECURITY_COLS,
    getRecommendedAction: () => 'Deploy a passcode requirement profile',
    getRiskLevel: () => 'High',
  },

  'new-enrollments-month': {
    id: 'new-enrollments-month', group: 'Fleet Overview',
    title: 'New Enrollments',
    description: 'Macs enrolled in the MDM during the current and previous calendar month (UTC). The card value is the current month. Macs without a reported enrollment date are excluded.',
    accentColor: '#6366F1',
    isInfoCard: true,
    getUnavailableReason: devices => devices.some(hasEnrollmentDate) ? undefined : 'The MDM did not return enrollment dates for these Macs.',
    filterFn: devices => devices.filter(d => enrolledInMonth(d, 0) || enrolledInMonth(d, 1)),
    getValue: devices => (devices.some(hasEnrollmentDate) ? devices.filter(d => enrolledInMonth(d, 0)).length : 'N/A'),
    getBreakdown: devices => (devices.some(hasEnrollmentDate)
      ? [{ label: `This month · ${monthLabel(0)}`, count: devices.filter(d => enrolledInMonth(d, 0)).length },
         { label: `Last month · ${monthLabel(1)}`, count: devices.filter(d => enrolledInMonth(d, 1)).length }]
      : []),
    columns: ENROLLMENT_COLS,
    getRecommendedAction: () => 'Confirm the Mac received baseline profiles and security agents',
    getRiskLevel: () => 'Low',
  },

  // ── Patch Health ─────────────────────────────────────────────────────────────

  'fully-patched': {
    id: 'fully-patched', group: 'Patch Health',
    title: 'Fully Patched Devices',
    description: 'Devices whose latest Patch Manager scan shows no missing OS, third-party, driver or BIOS patches. Only devices running the Patch Manager agent are assessed.',
    accentColor: '#10B981',
    getUnavailableReason: patchUnavailableReason,
    filterFn: devices => devices.filter(fullyPatched),
    getValue: devices => devices.some(hasPatchData) ? devices.filter(fullyPatched).length : 'N/A',
    getPopulationSize: devices => devices.filter(hasPatchData).length,
    columns: PATCH_COLS,
    getRecommendedAction: () => 'Maintain patch schedule — no action required',
    getRiskLevel: () => 'Low',
  },

  'missing-critical-patches': {
    id: 'missing-critical-patches', group: 'Patch Health',
    title: 'Missing Critical Patches',
    description: 'Devices with at least one missing patch rated Critical by Patch Manager. Only devices running the Patch Manager agent are assessed.',
    accentColor: '#EF4444',
    getUnavailableReason: patchUnavailableReason,
    filterFn: devices => devices.filter(missingCritical),
    getValue: devices => devices.some(hasPatchData) ? devices.filter(missingCritical).length : 'N/A',
    getPopulationSize: devices => devices.filter(hasPatchData).length,
    columns: PATCH_COLS,
    getRecommendedAction: () => 'Apply critical patches within 24 hours',
    getRiskLevel: () => 'Critical',
  },

  'missing-security-updates': {
    id: 'missing-security-updates', group: 'Patch Health',
    title: 'Missing Security Updates',
    description: 'Devices with missing OS patches per Patch Manager. Only devices running the Patch Manager agent are assessed.',
    accentColor: '#F59E0B',
    getUnavailableReason: patchUnavailableReason,
    filterFn: devices => devices.filter(missingOsUpdates),
    getValue: devices => devices.some(hasPatchData) ? devices.filter(missingOsUpdates).length : 'N/A',
    getPopulationSize: devices => devices.filter(hasPatchData).length,
    columns: PATCH_COLS,
    getRecommendedAction: () => 'Schedule security update deployment within 7 days',
    getRiskLevel: () => 'High',
  },

  'missing-app-updates': {
    id: 'missing-app-updates', group: 'Patch Health',
    title: 'Missing App Updates',
    description: 'Devices with missing third-party application patches per Patch Manager. Only devices running the Patch Manager agent are assessed.',
    accentColor: '#D97706',
    getUnavailableReason: patchUnavailableReason,
    filterFn: devices => devices.filter(missingAppUpdates),
    getValue: devices => devices.some(hasPatchData) ? devices.filter(missingAppUpdates).length : 'N/A',
    getPopulationSize: devices => devices.filter(hasPatchData).length,
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
    getRecommendedAction: () => 'No action required',
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
    description: 'Devices with no check-in for more than 30 days.',
    accentColor: '#EF4444',
    filterFn: devices => devices.filter(d => {
      const days = daysSinceCheckIn(d.lastCheckIn)
      return days > 30 && days !== 999
    }),
    getValue: devices => devices.filter(d => {
      const days = daysSinceCheckIn(d.lastCheckIn)
      return days > 30 && days !== 999
    }).length,
    columns: LIFECYCLE_COLS,
    getRecommendedAction: () => 'Escalate to manager — investigate device location, initiate retirement if unrecovered',
    getRiskLevel: () => 'High',
  },

  // ── OS Health ────────────────────────────────────────────────────────────────

  'macos-current': {
    id: 'macos-current', group: 'OS Health',
    title: `On macOS ${CURRENT_MACOS_MAJOR} or Later`,
    description: `Macs running macOS ${CURRENT_MACOS_MAJOR} or later — the current release line.`,
    accentColor: '#10B981',
    filterFn: devices => devices.filter(macosCurrent),
    getCountSize: devices => devices.filter(macosCurrent).length,
    getPopulationSize: devices => devices.filter(hasReportedOsVersion).length,
    getValue: devices => devices.filter(macosCurrent).length,
    columns: OS_COLS,
    getRecommendedAction: () => 'No action required',
    getRiskLevel: () => 'Low',
  },

  'macos-outdated': {
    id: 'macos-outdated', group: 'OS Health',
    title: 'Outdated macOS',
    description: `Macs on macOS ${OLDEST_SUPPORTED_MACOS_MAJOR}–${CURRENT_MACOS_MAJOR - 1}: still supported by Apple but behind the current release.`,
    accentColor: '#F59E0B',
    filterFn: devices => devices.filter(macosOutdated),
    getCountSize: devices => devices.filter(macosOutdated).length,
    getPopulationSize: devices => devices.filter(hasReportedOsVersion).length,
    getValue: devices => devices.filter(macosOutdated).length,
    columns: OS_COLS,
    getRecommendedAction: () => 'Schedule an OS upgrade (check hardware eligibility first)',
    getRiskLevel: () => 'Medium',
  },

  'macos-unsupported': {
    id: 'macos-unsupported', group: 'OS Health',
    title: 'Unsupported macOS',
    description: `Macs on macOS earlier than ${OLDEST_SUPPORTED_MACOS_MAJOR}, which no longer receive Apple security updates. Classified by macOS version only; hardware upgrade eligibility is not available from the API.`,
    accentColor: '#DC2626',
    filterFn: devices => devices.filter(macosUnsupported),
    getCountSize: devices => devices.filter(macosUnsupported).length,
    getPopulationSize: devices => devices.filter(hasReportedOsVersion).length,
    getValue: devices => devices.filter(macosUnsupported).length,
    columns: OS_COLS,
    getRecommendedAction: () => 'Upgrade if the hardware allows, otherwise plan replacement',
    getRiskLevel: () => 'Critical',
  },

  'latest-macos-version': {
    id: 'latest-macos-version', group: 'OS Health',
    title: 'Most Common OS Version',
    description: 'Most frequently reported numeric macOS version in the current inventory. This is not an assertion that the version is latest.',
    accentColor: '#6366F1',
    filterFn: devices => {
      const counts = new Map<string, number>()
      devices.filter(hasReportedOsVersion).forEach(d => counts.set(d.osVersion, (counts.get(d.osVersion) ?? 0) + 1))
      const topVersion = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
      return topVersion ? devices.filter(d => d.osVersion === topVersion) : []
    },
    getValue: devices => {
      const counts = new Map<string, number>()
      devices.filter(hasReportedOsVersion).forEach(d => counts.set(d.osVersion, (counts.get(d.osVersion) ?? 0) + 1))
      return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/A'
    },
    columns: OS_COLS,
    getRecommendedAction: () => 'Compare this reported version with your approved OS baseline',
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
    'total-devices', 'device-security-posture', 'filevault-coverage', 'passcode-missing',
    'new-enrollments-month', 'fleet-risk-score',
    'healthy-devices', 'requiring-action', 'compliance-score',
  ],
  'Patch Health': [
    'fully-patched', 'missing-critical-patches',
    'missing-security-updates', 'missing-app-updates',
  ],
  'Device Lifecycle': [
    'active-devices', 'stale-devices', 'inactive-devices',
  ],
  'OS Health': [
    'macos-current', 'macos-outdated', 'macos-unsupported', 'latest-macos-version',
  ],
}

/** KPI ids to render for a fleet — cards flagged hideWhenUnavailable drop out when their data source is silent. */
export function visibleKpiIds(group: KpiGroup, devices: ApiDevice[]): KpiId[] {
  return KPI_IDS_BY_GROUP[group].filter(id => {
    const c = KPI_CONFIGS[id]
    return !(c.hideWhenUnavailable && (c.getUnavailableReason?.(devices) ?? c.unavailableReason))
  })
}

export { daysSinceCheckIn, fmtDaysAgo, fmtLifecycleStatus, isHealthy, isActive }
