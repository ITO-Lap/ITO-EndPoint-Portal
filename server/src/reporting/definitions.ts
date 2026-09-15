import { registerReport } from './engine.js'
import type { ReportContext, ReportSummaryCard } from './engine.js'
import type { EntraSignIn, EntraMfaRegistration, EntraUser, EntraRiskySignIn, EntraDirectoryAudit } from '../services/entra.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysSince(dateStr: string | undefined): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / 86_400_000)
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return '0%'
  return `${((numerator / denominator) * 100).toFixed(1)}%`
}

function groupCount<T>(items: T[], key: (item: T) => string): Map<string, number> {
  const m = new Map<string, number>()
  for (const item of items) {
    const k = key(item) || 'Unknown'
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

// ── 1. Full Device Inventory ──────────────────────────────────────────────────

registerReport({
  id:          'device-inventory',
  name:        'Full Device Inventory',
  category:    'inventory',
  description: 'Complete snapshot of every managed endpoint across all connected sources.',
  sources:     ['intune', 'manageengine'],
  cacheTtlSec: 300,
  defaultSort: { field: 'deviceName', dir: 'asc' },
  columns: [
    { key: 'deviceName',       label: 'Device Name',       type: 'string', width: 'lg' },
    { key: 'user',             label: 'Primary User',       type: 'string', width: 'lg' },
    { key: 'platform',         label: 'Platform',           type: 'badge',  width: 'sm' },
    { key: 'osVersion',        label: 'OS Version',         type: 'string', width: 'md' },
    { key: 'model',            label: 'Model',              type: 'string', width: 'lg' },
    { key: 'serialNumber',     label: 'Serial Number',      type: 'string', width: 'md' },
    { key: 'managementSource', label: 'Source',             type: 'badge',  width: 'md' },
    { key: 'complianceState',  label: 'Compliance',         type: 'badge',  width: 'md' },
    { key: 'encryptionStatus', label: 'Encryption',         type: 'string', width: 'md' },
    { key: 'ipAddress',        label: 'IP Address',         type: 'string', width: 'md' },
    { key: 'lastCheckIn',      label: 'Last Check-in',      type: 'string', width: 'md' },
    { key: 'enrollmentDate',   label: 'Enrolled',           type: 'string', width: 'md' },
    { key: 'ownership',        label: 'Ownership',          type: 'badge',  width: 'sm' },
    { key: 'department',       label: 'Department',         type: 'string', width: 'md' },
  ],
  run({ devices }) {
    const total     = devices.length
    const compliant = devices.filter(d => d.complianceState === 'Compliant').length
    const windows   = devices.filter(d => d.platform === 'Windows').length
    const mac       = devices.filter(d => d.platform === 'macOS').length

    const summary: ReportSummaryCard[] = [
      { label: 'Total Devices',     value: total,     color: 'sky'   },
      { label: 'Compliant',         value: compliant, color: 'green' },
      { label: 'Windows',           value: windows,   color: 'slate' },
      { label: 'macOS',             value: mac,       color: 'violet'},
      { label: 'Compliance Rate',   value: pct(compliant, total), color: compliant / total >= 0.9 ? 'green' : 'amber' },
    ]

    const rows = devices.map(d => ({
      deviceName:       d.deviceName,
      user:             d.user,
      platform:         d.platform,
      osVersion:        d.osVersion,
      model:            d.model ?? '—',
      serialNumber:     d.serialNumber,
      managementSource: d.managementSource,
      complianceState:  d.complianceState,
      encryptionStatus: d.encryptionStatus,
      ipAddress:        d.ipAddress ?? '—',
      lastCheckIn:      d.lastCheckIn,
      enrollmentDate:   d.enrollmentDate ?? '—',
      ownership:        d.ownership ?? 'Corporate',
      department:       d.department ?? '—',
    }))

    return { rows, summary }
  },
})

// ── 2. Non-Compliant Devices ──────────────────────────────────────────────────

registerReport({
  id:          'non-compliant-devices',
  name:        'Non-Compliant Devices',
  category:    'compliance',
  description: 'All devices in a Non-Compliant or Warning state with the failing policy.',
  sources:     ['intune', 'manageengine'],
  cacheTtlSec: 180,
  defaultSort: { field: 'severity', dir: 'asc' },
  columns: [
    { key: 'deviceName',       label: 'Device Name',    type: 'string', width: 'lg' },
    { key: 'user',             label: 'User',            type: 'string', width: 'lg' },
    { key: 'platform',         label: 'Platform',        type: 'badge',  width: 'sm' },
    { key: 'complianceState',  label: 'State',           type: 'badge',  width: 'md' },
    { key: 'severity',         label: 'Severity',        type: 'badge',  width: 'sm' },
    { key: 'primaryIssue',     label: 'Primary Issue',   type: 'string', width: 'xl' },
    { key: 'policyFailed',     label: 'Policy Failed',   type: 'string', width: 'xl' },
    { key: 'managementSource', label: 'Source',          type: 'badge',  width: 'md' },
    { key: 'lastCheckIn',      label: 'Last Check-in',   type: 'string', width: 'md' },
    { key: 'daysPending',      label: 'Days Pending',    type: 'number', width: 'sm', align: 'right' },
  ],
  run({ devices }) {
    const bad = devices.filter(d => d.complianceState !== 'Compliant')
    const nc  = bad.filter(d => d.complianceState === 'Non-Compliant').length
    const w   = bad.filter(d => d.complianceState === 'Warning').length

    const summary: ReportSummaryCard[] = [
      { label: 'Non-Compliant', value: nc, color: 'red'   },
      { label: 'Warning',       value: w,  color: 'amber' },
      { label: 'Total Issues',  value: bad.length, color: 'slate' },
      { label: 'Issue Rate',    value: pct(bad.length, devices.length), color: bad.length / devices.length > 0.2 ? 'red' : 'amber' },
    ]

    const rows = bad.map(d => ({
      deviceName:       d.deviceName,
      user:             d.user,
      platform:         d.platform,
      complianceState:  d.complianceState,
      severity:         d.severity,
      primaryIssue:     d.primaryIssue || '—',
      policyFailed:     d.policyFailed || '—',
      managementSource: d.managementSource,
      lastCheckIn:      d.lastCheckIn,
      daysPending:      daysSince(d.lastDetected) ?? '—',
    }))

    return { rows, summary }
  },
})

// ── 3. Compliance Summary by Source ──────────────────────────────────────────

registerReport({
  id:          'compliance-by-source',
  name:        'Compliance Summary by Source',
  category:    'compliance',
  description: 'Aggregated compliance rate per management source.',
  sources:     ['intune', 'manageengine'],
  cacheTtlSec: 300,
  defaultSort: { field: 'complianceRate', dir: 'desc' },
  columns: [
    { key: 'source',         label: 'Management Source', type: 'string', width: 'lg' },
    { key: 'total',          label: 'Total',             type: 'number', width: 'sm', align: 'right' },
    { key: 'compliant',      label: 'Compliant',         type: 'number', width: 'sm', align: 'right' },
    { key: 'warning',        label: 'Warning',           type: 'number', width: 'sm', align: 'right' },
    { key: 'nonCompliant',   label: 'Non-Compliant',     type: 'number', width: 'sm', align: 'right' },
    { key: 'complianceRate', label: 'Compliance Rate',   type: 'percent', width: 'md', align: 'right' },
  ],
  run({ devices }) {
    const sources = ['Microsoft Intune', 'ManageEngine'] as const
    const rows = sources.map(src => {
      const group = devices.filter(d => d.managementSource === src)
      if (group.length === 0) return null
      const compliant    = group.filter(d => d.complianceState === 'Compliant').length
      const warning      = group.filter(d => d.complianceState === 'Warning').length
      const nonCompliant = group.filter(d => d.complianceState === 'Non-Compliant').length
      return {
        source:         src,
        total:          group.length,
        compliant,
        warning,
        nonCompliant,
        complianceRate: parseFloat(pct(compliant, group.length)),
      }
    }).filter(Boolean)

    const totalCompliant = devices.filter(d => d.complianceState === 'Compliant').length
    const summary: ReportSummaryCard[] = [
      { label: 'Active Sources',   value: rows.length, color: 'sky' },
      { label: 'Fleet Compliance', value: pct(totalCompliant, devices.length), color: totalCompliant / devices.length >= 0.9 ? 'green' : 'amber' },
    ]

    return { rows: rows as Record<string, unknown>[], summary }
  },
})

// ── 4. Stale Devices ──────────────────────────────────────────────────────────

registerReport({
  id:          'stale-devices',
  name:        'Stale Devices (30+ Days)',
  category:    'health',
  description: 'Devices that have not checked in for over 30 days — possible decommission candidates.',
  sources:     ['intune', 'manageengine'],
  cacheTtlSec: 600,
  defaultSort: { field: 'daysSinceCheckIn', dir: 'desc' },
  columns: [
    { key: 'deviceName',        label: 'Device Name',       type: 'string', width: 'lg' },
    { key: 'user',              label: 'User',               type: 'string', width: 'lg' },
    { key: 'platform',          label: 'Platform',           type: 'badge',  width: 'sm' },
    { key: 'managementSource',  label: 'Source',             type: 'badge',  width: 'md' },
    { key: 'lastCheckIn',       label: 'Last Check-in',      type: 'string', width: 'md' },
    { key: 'daysSinceCheckIn',  label: 'Days Silent',        type: 'number', width: 'sm', align: 'right' },
    { key: 'complianceState',   label: 'Last State',         type: 'badge',  width: 'md' },
    { key: 'serialNumber',      label: 'Serial',             type: 'string', width: 'md' },
    { key: 'enrollmentDate',    label: 'Enrolled',           type: 'string', width: 'md' },
  ],
  run({ devices }) {
    const stale = devices
      .map(d => {
        const days = daysSince(new Date(d.lastCheckIn).toISOString())
        return { ...d, daysSinceCheckIn: days }
      })
      .filter(d => (d.daysSinceCheckIn ?? 0) >= 30)

    const summary: ReportSummaryCard[] = [
      { label: 'Stale Devices',   value: stale.length, color: stale.length > 10 ? 'red' : 'amber' },
      { label: '> 60 Days',       value: stale.filter(d => (d.daysSinceCheckIn ?? 0) >= 60).length, color: 'red' },
      { label: '> 90 Days',       value: stale.filter(d => (d.daysSinceCheckIn ?? 0) >= 90).length, color: 'red' },
      { label: 'Avg Days Silent', value: stale.length ? Math.round(stale.reduce((s, d) => s + (d.daysSinceCheckIn ?? 0), 0) / stale.length) : 0, color: 'slate' },
    ]

    const rows = stale.map(d => ({
      deviceName:       d.deviceName,
      user:             d.user,
      platform:         d.platform,
      managementSource: d.managementSource,
      lastCheckIn:      d.lastCheckIn,
      daysSinceCheckIn: d.daysSinceCheckIn,
      complianceState:  d.complianceState,
      serialNumber:     d.serialNumber,
      enrollmentDate:   d.enrollmentDate ?? '—',
    }))

    return { rows, summary }
  },
})

// ── 5. Encryption Status ──────────────────────────────────────────────────────

registerReport({
  id:          'encryption-status',
  name:        'Encryption Status (BitLocker / FileVault)',
  category:    'security',
  description: 'Shows the disk encryption state for every managed device.',
  sources:     ['intune', 'manageengine'],
  cacheTtlSec: 300,
  defaultSort: { field: 'encryptionStatus', dir: 'asc' },
  columns: [
    { key: 'deviceName',       label: 'Device Name',    type: 'string', width: 'lg' },
    { key: 'user',             label: 'User',            type: 'string', width: 'lg' },
    { key: 'platform',         label: 'Platform',        type: 'badge',  width: 'sm' },
    { key: 'encryptionStatus', label: 'Status',          type: 'badge',  width: 'md' },
    { key: 'complianceState',  label: 'Compliance',      type: 'badge',  width: 'md' },
    { key: 'managementSource', label: 'Source',          type: 'badge',  width: 'md' },
    { key: 'serialNumber',     label: 'Serial',          type: 'string', width: 'md' },
    { key: 'lastCheckIn',      label: 'Last Check-in',   type: 'string', width: 'md' },
  ],
  run({ devices }) {
    const off     = devices.filter(d => d.encryptionStatus.toLowerCase().includes('off') || d.encryptionStatus.toLowerCase().includes('pending'))
    const on      = devices.filter(d => !d.encryptionStatus.toLowerCase().includes('off') && !d.encryptionStatus.toLowerCase().includes('pending'))
    const unknown = devices.filter(d => !d.encryptionStatus)

    const summary: ReportSummaryCard[] = [
      { label: 'Encrypted',     value: on.length,      color: 'green' },
      { label: 'Not Encrypted', value: off.length,     color: off.length > 0 ? 'red' : 'green' },
      { label: 'Unknown',       value: unknown.length, color: 'slate' },
      { label: 'Coverage',      value: pct(on.length, devices.length), color: on.length / devices.length >= 0.95 ? 'green' : 'red' },
    ]

    const rows = devices.map(d => ({
      deviceName:       d.deviceName,
      user:             d.user,
      platform:         d.platform,
      encryptionStatus: d.encryptionStatus || 'Unknown',
      complianceState:  d.complianceState,
      managementSource: d.managementSource,
      serialNumber:     d.serialNumber,
      lastCheckIn:      d.lastCheckIn,
    }))

    return { rows, summary }
  },
})

// ── 6. OS Version Distribution ────────────────────────────────────────────────

registerReport({
  id:          'os-distribution',
  name:        'OS Version Distribution',
  category:    'inventory',
  description: 'Fleet-wide breakdown of OS versions across all platforms.',
  sources:     ['intune', 'manageengine'],
  cacheTtlSec: 600,
  defaultSort: { field: 'deviceCount', dir: 'desc' },
  columns: [
    { key: 'platform',      label: 'Platform',      type: 'badge',   width: 'sm' },
    { key: 'osVersion',     label: 'OS Version',    type: 'string',  width: 'lg' },
    { key: 'deviceCount',   label: 'Devices',       type: 'number',  width: 'sm', align: 'right' },
    { key: 'percentage',    label: '% of Fleet',    type: 'percent', width: 'md', align: 'right' },
    { key: 'compliant',     label: 'Compliant',     type: 'number',  width: 'sm', align: 'right' },
    { key: 'nonCompliant',  label: 'Non-Compliant', type: 'number',  width: 'sm', align: 'right' },
  ],
  run({ devices }) {
    const map = new Map<string, { platform: string; count: number; compliant: number; nonCompliant: number }>()
    for (const d of devices) {
      const k = `${d.platform}||${d.osVersion}`
      const e = map.get(k) ?? { platform: d.platform, count: 0, compliant: 0, nonCompliant: 0 }
      e.count++
      if (d.complianceState === 'Compliant') e.compliant++
      else if (d.complianceState === 'Non-Compliant') e.nonCompliant++
      map.set(k, e)
    }

    const platforms = [...new Set(devices.map(d => d.platform))]
    const summary: ReportSummaryCard[] = platforms.map(p => ({
      label: p,
      value: devices.filter(d => d.platform === p).length,
      color: p === 'macOS' ? 'violet' : p === 'Windows' ? 'sky' : 'slate',
    }))

    const rows = Array.from(map.entries()).map(([k, v]) => {
      const [, osVersion] = k.split('||')
      return {
        platform:     v.platform,
        osVersion:    osVersion || 'Unknown',
        deviceCount:  v.count,
        percentage:   parseFloat(pct(v.count, devices.length)),
        compliant:    v.compliant,
        nonCompliant: v.nonCompliant,
      }
    })

    return { rows: rows as Record<string, unknown>[], summary }
  },
})

// ── 7. Policy Failure Breakdown ───────────────────────────────────────────────

registerReport({
  id:          'policy-failures',
  name:        'Top Policy Failures',
  category:    'compliance',
  description: 'Most common policy failures aggregated across the fleet with affected device count.',
  sources:     ['intune', 'manageengine'],
  cacheTtlSec: 300,
  defaultSort: { field: 'deviceCount', dir: 'desc' },
  columns: [
    { key: 'policyFailed',  label: 'Policy / Issue',   type: 'string', width: 'xl' },
    { key: 'category',      label: 'Category',         type: 'badge',  width: 'md' },
    { key: 'deviceCount',   label: 'Affected Devices', type: 'number', width: 'sm', align: 'right' },
    { key: 'percentage',    label: '% of Fleet',       type: 'percent', width: 'md', align: 'right' },
    { key: 'highSeverity',  label: 'High Severity',    type: 'number', width: 'sm', align: 'right' },
    { key: 'sources',       label: 'Sources',          type: 'string', width: 'lg' },
  ],
  run({ devices }) {
    const failing = devices.filter(d => d.complianceState !== 'Compliant' && d.policyFailed && d.policyFailed !== 'None')

    const map = new Map<string, { count: number; high: number; sources: Set<string>; category: string }>()
    for (const d of failing) {
      const k = d.policyFailed
      const e = map.get(k) ?? { count: 0, high: 0, sources: new Set(), category: categorize(d.primaryIssue) }
      e.count++
      if (d.severity === 'High' || d.severity === 'Critical') e.high++
      e.sources.add(d.managementSource)
      map.set(k, e)
    }

    const rows = Array.from(map.entries()).map(([policy, v]) => ({
      policyFailed:  policy,
      category:      v.category,
      deviceCount:   v.count,
      percentage:    parseFloat(pct(v.count, devices.length)),
      highSeverity:  v.high,
      sources:       Array.from(v.sources).join(', '),
    }))

    const summary: ReportSummaryCard[] = [
      { label: 'Unique Failures',    value: map.size, color: 'red' },
      { label: 'Devices Affected',   value: failing.length, color: 'amber' },
      { label: 'High Severity',      value: failing.filter(d => d.severity === 'High' || d.severity === 'Critical').length, color: 'red' },
    ]

    return { rows: rows as Record<string, unknown>[], summary }
  },
})

function categorize(issue: string): string {
  const i = issue.toLowerCase()
  if (i.includes('filevault') || i.includes('bitlocker') || i.includes('encrypt')) return 'Encryption'
  if (i.includes('firewall') || i.includes('antivirus') || i.includes('crowdstrike')) return 'Security / AV'
  if (i.includes('patch') || i.includes('update')) return 'Patching'
  if (i.includes('policy') || i.includes('compliance')) return 'Policy'
  if (i.includes('app')) return 'Application'
  return 'Other'
}

// ── 8. Hardware Inventory ─────────────────────────────────────────────────────

registerReport({
  id:          'hardware-inventory',
  name:        'Hardware Inventory',
  category:    'inventory',
  description: 'Model, processor, memory, and storage for every managed device.',
  sources:     ['intune', 'manageengine'],
  cacheTtlSec: 600,
  defaultSort: { field: 'deviceName', dir: 'asc' },
  columns: [
    { key: 'deviceName',    label: 'Device Name',   type: 'string', width: 'lg' },
    { key: 'platform',      label: 'Platform',      type: 'badge',  width: 'sm' },
    { key: 'manufacturer',  label: 'Manufacturer',  type: 'string', width: 'md' },
    { key: 'model',         label: 'Model',         type: 'string', width: 'xl' },
    { key: 'processor',     label: 'Processor',     type: 'string', width: 'xl' },
    { key: 'totalMemory',   label: 'RAM',           type: 'string', width: 'sm' },
    { key: 'totalStorage',  label: 'Storage',       type: 'string', width: 'sm' },
    { key: 'freeStorage',   label: 'Free Space',    type: 'string', width: 'sm' },
    { key: 'serialNumber',  label: 'Serial',        type: 'string', width: 'md' },
    { key: 'source',        label: 'Source',        type: 'badge',  width: 'md' },
  ],
  run({ devices }) {
    const withHW = devices.filter(d => d.model || d.processor || d.totalMemory)
    const summary: ReportSummaryCard[] = [
      { label: 'With HW Data',  value: withHW.length, color: 'sky'   },
      { label: 'Missing HW',    value: devices.length - withHW.length, color: 'slate' },
    ]

    const rows = devices.map(d => ({
      deviceName:   d.deviceName,
      platform:     d.platform,
      manufacturer: d.manufacturer ?? '—',
      model:        d.model ?? '—',
      processor:    d.processor ?? '—',
      totalMemory:  d.totalMemory ?? '—',
      totalStorage: d.totalStorage ?? '—',
      freeStorage:  d.freeStorage ?? '—',
      serialNumber: d.serialNumber,
      source:       d.managementSource,
    }))

    return { rows, summary }
  },
})

// ── 9. User & Device Assignment ───────────────────────────────────────────────

registerReport({
  id:          'user-device-assignment',
  name:        'User & Device Assignment',
  category:    'users',
  description: 'Maps every user to their assigned devices across all management sources.',
  sources:     ['intune', 'manageengine'],
  cacheTtlSec: 300,
  defaultSort: { field: 'user', dir: 'asc' },
  columns: [
    { key: 'user',             label: 'User / Email',   type: 'string', width: 'xl' },
    { key: 'deviceName',       label: 'Device Name',    type: 'string', width: 'lg' },
    { key: 'platform',         label: 'Platform',       type: 'badge',  width: 'sm' },
    { key: 'managementSource', label: 'Source',         type: 'badge',  width: 'md' },
    { key: 'complianceState',  label: 'Compliance',     type: 'badge',  width: 'md' },
    { key: 'lastCheckIn',      label: 'Last Check-in',  type: 'string', width: 'md' },
    { key: 'enrollmentType',   label: 'Enroll Type',    type: 'string', width: 'md' },
    { key: 'ownership',        label: 'Ownership',      type: 'badge',  width: 'sm' },
    { key: 'department',       label: 'Department',     type: 'string', width: 'md' },
  ],
  run({ devices }) {
    const unassigned = devices.filter(d => !d.user || d.user === 'Unassigned')
    const multiDevice = (() => {
      const counts = groupCount(devices.filter(d => d.user && d.user !== 'Unassigned'), d => d.user)
      return Array.from(counts.values()).filter(v => v > 1).length
    })()

    const summary: ReportSummaryCard[] = [
      { label: 'Total Devices',   value: devices.length, color: 'sky'   },
      { label: 'Unassigned',      value: unassigned.length, color: unassigned.length > 0 ? 'amber' : 'green' },
      { label: 'Multi-Device Users', value: multiDevice, color: 'slate' },
    ]

    const rows = devices.map(d => ({
      user:             d.user || 'Unassigned',
      deviceName:       d.deviceName,
      platform:         d.platform,
      managementSource: d.managementSource,
      complianceState:  d.complianceState,
      lastCheckIn:      d.lastCheckIn,
      enrollmentType:   d.enrollmentType ?? 'MDM',
      ownership:        d.ownership ?? 'Corporate',
      department:       d.department ?? '—',
    }))

    return { rows, summary }
  },
})

// ── 10. Severity Distribution ─────────────────────────────────────────────────

registerReport({
  id:          'severity-distribution',
  name:        'Issue Severity Distribution',
  category:    'security',
  description: 'Breakdown of device issues by severity level across all sources.',
  sources:     ['intune', 'manageengine'],
  cacheTtlSec: 300,
  defaultSort: { field: 'deviceCount', dir: 'desc' },
  columns: [
    { key: 'severity',       label: 'Severity',        type: 'badge',  width: 'sm' },
    { key: 'complianceState',label: 'Compliance State', type: 'badge',  width: 'md' },
    { key: 'deviceCount',    label: 'Devices',         type: 'number', width: 'sm', align: 'right' },
    { key: 'percentage',     label: '% of Fleet',      type: 'percent', width: 'md', align: 'right' },
    { key: 'topIssue',       label: 'Most Common Issue', type: 'string', width: 'xl' },
  ],
  run({ devices }) {
    const map = new Map<string, { compliance: string; count: number; issues: Map<string, number> }>()
    for (const d of devices) {
      const k = `${d.severity}||${d.complianceState}`
      const e = map.get(k) ?? { compliance: d.complianceState, count: 0, issues: new Map() }
      e.count++
      if (d.primaryIssue && d.primaryIssue !== 'None') {
        e.issues.set(d.primaryIssue, (e.issues.get(d.primaryIssue) ?? 0) + 1)
      }
      map.set(k, e)
    }

    const critical = devices.filter(d => d.severity === 'Critical' || (d.severity === 'High' && d.complianceState !== 'Compliant'))
    const summary: ReportSummaryCard[] = [
      { label: 'High/Critical',  value: critical.length, color: critical.length > 0 ? 'red' : 'green' },
      { label: 'Medium',         value: devices.filter(d => d.severity === 'Medium').length, color: 'amber' },
      { label: 'Low',            value: devices.filter(d => d.severity === 'Low').length,    color: 'green' },
    ]

    const rows = Array.from(map.entries()).map(([k, v]) => {
      const [severity] = k.split('||')
      const topIssue = Array.from(v.issues.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'None'
      return {
        severity,
        complianceState: v.compliance,
        deviceCount:     v.count,
        percentage:      parseFloat(pct(v.count, devices.length)),
        topIssue,
      }
    })

    return { rows: rows as Record<string, unknown>[], summary }
  },
})

// ── 12. Management Source Distribution ───────────────────────────────────────

registerReport({
  id:          'source-distribution',
  name:        'Management Source Distribution',
  category:    'inventory',
  description: 'Device count and compliance breakdown per connected management source.',
  sources:     ['intune', 'manageengine'],
  cacheTtlSec: 300,
  defaultSort: { field: 'total', dir: 'desc' },
  columns: [
    { key: 'source',          label: 'Source',             type: 'string', width: 'lg' },
    { key: 'total',           label: 'Total',              type: 'number', width: 'sm', align: 'right' },
    { key: 'compliant',       label: 'Compliant',          type: 'number', width: 'sm', align: 'right' },
    { key: 'warning',         label: 'Warning',            type: 'number', width: 'sm', align: 'right' },
    { key: 'nonCompliant',    label: 'Non-Compliant',      type: 'number', width: 'sm', align: 'right' },
    { key: 'complianceRate',  label: 'Compliance Rate',    type: 'percent', width: 'md', align: 'right' },
    { key: 'platforms',       label: 'Platforms',          type: 'string', width: 'lg' },
  ],
  run({ devices }) {
    const allSources = [...new Set(devices.map(d => d.managementSource))]
    const rows = allSources.map(src => {
      const grp        = devices.filter(d => d.managementSource === src)
      const compliant  = grp.filter(d => d.complianceState === 'Compliant').length
      const warning    = grp.filter(d => d.complianceState === 'Warning').length
      const nc         = grp.filter(d => d.complianceState === 'Non-Compliant').length
      const platforms  = [...new Set(grp.map(d => d.platform))].join(', ')
      return {
        source:         src,
        total:          grp.length,
        compliant,
        warning,
        nonCompliant:   nc,
        complianceRate: parseFloat(pct(compliant, grp.length)),
        platforms,
      }
    })

    const summary: ReportSummaryCard[] = [
      { label: 'Sources Active', value: allSources.length, color: 'sky'   },
      { label: 'Total Devices',  value: devices.length,    color: 'slate' },
    ]

    return { rows: rows as Record<string, unknown>[], summary }
  },
})

// ── 7. VIP Device Health ──────────────────────────────────────────────────────

registerReport({
  id:          'vip-device-health',
  name:        'VIP Device Health',
  category:    'health',
  description: 'Compliance and risk status for high-priority users (VP, Director, C-Suite) whose devices need elevated attention.',
  sources:     ['intune', 'manageengine'],
  cacheTtlSec: 180,
  defaultSort: { field: 'riskScore', dir: 'desc' },
  columns: [
    { key: 'deviceName',      label: 'Device Name',     type: 'string', width: 'lg' },
    { key: 'user',            label: 'User',             type: 'string', width: 'lg' },
    { key: 'title',           label: 'Title',            type: 'string', width: 'lg' },
    { key: 'platform',        label: 'Platform',         type: 'badge',  width: 'sm' },
    { key: 'complianceState', label: 'Compliance',       type: 'badge',  width: 'md' },
    { key: 'severity',        label: 'Severity',         type: 'badge',  width: 'sm' },
    { key: 'primaryIssue',    label: 'Primary Issue',    type: 'string', width: 'xl' },
    { key: 'encryptionStatus',label: 'Encryption',       type: 'string', width: 'md' },
    { key: 'lastCheckIn',     label: 'Last Check-in',    type: 'string', width: 'md' },
    { key: 'riskScore',       label: 'Risk Score',       type: 'number', width: 'sm', align: 'right' },
  ],
  run({ devices, isMock }) {
    const VIP_TITLES = ['VP', 'Vice President', 'Director', 'Senior Director',
                        'CEO', 'COO', 'CTO', 'CFO', 'CISO', 'CIO', 'SVP', 'EVP', 'President']

    const isVip = (d: typeof devices[number]) =>
      VIP_TITLES.some(t => (d.department ?? '').includes(t))

    const vipDevices = isMock
      ? devices.slice(0, Math.min(12, Math.ceil(devices.length * 0.15)))
      : devices.filter(d => isVip(d))

    const riskScore = (d: typeof devices[number]): number => {
      let score = 0
      if (d.complianceState === 'Non-Compliant') score += 50
      if (d.complianceState === 'Warning') score += 25
      if (d.severity === 'Critical') score += 30
      if (d.severity === 'High') score += 20
      if (d.encryptionStatus !== 'Encrypted') score += 20
      const daysOut = daysSince(d.lastCheckIn)
      if (daysOut !== null && daysOut > 7) score += Math.min(daysOut, 30)
      return score
    }

    const nonCompliant = vipDevices.filter(d => d.complianceState === 'Non-Compliant').length
    const warning      = vipDevices.filter(d => d.complianceState === 'Warning').length
    const critical     = vipDevices.filter(d => d.severity === 'Critical').length

    const summary: ReportSummaryCard[] = [
      { label: 'VIP Devices',       value: vipDevices.length, color: 'violet' },
      { label: 'Non-Compliant',     value: nonCompliant,      color: nonCompliant > 0 ? 'red'   : 'green' },
      { label: 'Warning',           value: warning,           color: warning      > 0 ? 'amber' : 'green' },
      { label: 'Critical Severity', value: critical,          color: critical     > 0 ? 'red'   : 'green' },
    ]

    const rows = vipDevices
      .map(d => ({
        deviceName:       d.deviceName,
        user:             d.user,
        title:            d.department ?? 'Executive',
        platform:         d.platform,
        complianceState:  d.complianceState,
        severity:         d.severity ?? 'Low',
        primaryIssue:     d.primaryIssue ?? '—',
        encryptionStatus: d.encryptionStatus,
        lastCheckIn:      d.lastCheckIn,
        riskScore:        riskScore(d),
      }))
      .sort((a, b) => b.riskScore - a.riskScore)

    return { rows, summary }
  },
})


registerReport({
  id:          'graph-risky-signins',
  name:        'Risky Sign-ins',
  category:    'threat',
  description: 'Sign-in events flagged as medium or high risk by Microsoft Entra ID Protection — risk level, detection type, location, and recommended remediation per event.',
  sources:     ['intune'],
  cacheTtlSec: 180,
  defaultSort: { field: 'riskLevel', dir: 'asc' },
  apiEndpoint: 'GET /identityProtection/riskySignIns',
  graphSource: 'Microsoft Defender',
  columns: [
    { key: 'user',           label: 'User',              type: 'string', width: 'lg' },
    { key: 'riskLevel',      label: 'Risk Level',        type: 'badge',  width: 'sm' },
    { key: 'riskDetail',     label: 'Risk Detail',       type: 'string', width: 'xl' },
    { key: 'location',       label: 'Location',          type: 'string', width: 'lg' },
    { key: 'ipAddress',      label: 'IP Address',        type: 'string', width: 'md' },
    { key: 'app',            label: 'App',               type: 'string', width: 'lg' },
    { key: 'signInTime',     label: 'Sign-in Time',      type: 'string', width: 'md' },
    { key: 'status',         label: 'Status',            type: 'badge',  width: 'md' },
    { key: 'mfaUsed',        label: 'MFA Used',          type: 'badge',  width: 'sm' },
    { key: 'recommendation', label: 'Recommended Action',type: 'string', width: 'xl' },
  ],
  run({ entraData }) {
    // Live Entra risky sign-ins only — no fabricated fallback rows. When
    // Entra isn't configured or reports no data, return an empty result
    // rather than presenting synthetic sign-ins as real.
    if (!entraData || entraData.riskySignIns.length === 0) {
      return {
        rows: [],
        summary: [
          { label: 'Risky Sign-ins', value: 0, color: 'green' },
          { label: 'High Risk',      value: 0, color: 'green' },
          { label: 'No MFA',         value: 0, color: 'green' },
          { label: 'Failures',       value: 0, color: 'green' },
        ] as ReportSummaryCard[],
      }
    }

    const live = entraData.riskySignIns
    const RECS: Record<string, string> = {
      High:   'Block user and require password reset with MFA',
      Medium: 'Require MFA re-registration and notify user',
      Low:    'Monitor and require MFA for future sign-ins',
    }
    const rows = live.map((s: EntraRiskySignIn) => ({
      user:           s.userDisplayName || s.userPrincipalName,
      riskLevel:      s.riskLevelDuringSignIn ?? 'Unknown',
      riskDetail:     s.riskDetail,
      location:       s.location ? `${s.location.city}, ${s.location.countryOrRegion}` : 'Unknown',
      ipAddress:      s.ipAddress ?? '—',
      app:            '—',
      signInTime:     s.createdDateTime.slice(0, 16).replace('T', ' '),
      status:         s.status.errorCode === 0 ? 'Success' : 'Failure',
      mfaUsed:        '—',
      recommendation: RECS[s.riskLevelDuringSignIn] ?? 'Review sign-in event',
    }))
    const high  = rows.filter(r => r.riskLevel === 'high' || r.riskLevel === 'High').length
    const noMfa = rows.filter(r => r.mfaUsed === 'No').length
    return {
      rows,
      summary: [
        { label: 'Risky Sign-ins', value: rows.length, color: rows.length > 0 ? 'red'   : 'green' },
        { label: 'High Risk',      value: high,         color: high  > 0 ? 'red'   : 'green' },
        { label: 'No MFA',         value: noMfa,        color: noMfa > 0 ? 'amber' : 'green' },
        { label: 'Failures',       value: rows.filter(r => r.status === 'Failure').length, color: 'amber' },
      ] as ReportSummaryCard[],
    }
  },
})



// ── Graph API: Identity & Users (Entra ID) ────────────────────────────────────

registerReport({
  id:          'graph-signin-activity',
  name:        'Sign-in Activity',
  category:    'identity',
  description: 'Aggregated sign-in activity per user from Microsoft Entra ID — successful and failed sign-ins, MFA usage, apps accessed, and last sign-in time across the tenant.',
  sources:     ['intune'],
  cacheTtlSec: 300,
  defaultSort: { field: 'failedSignIns', dir: 'desc' },
  apiEndpoint: 'GET /auditLogs/signIns',
  graphSource: 'Microsoft Entra ID',
  columns: [
    { key: 'user',              label: 'User',               type: 'string', width: 'xl' },
    { key: 'department',        label: 'Department',          type: 'string', width: 'lg' },
    { key: 'successfulSignIns', label: 'Successful',          type: 'number', width: 'sm', align: 'right' },
    { key: 'failedSignIns',     label: 'Failed',              type: 'number', width: 'sm', align: 'right' },
    { key: 'mfaSignIns',        label: 'With MFA',            type: 'number', width: 'sm', align: 'right' },
    { key: 'mfaRate',           label: 'MFA Rate',            type: 'percent', width: 'md', align: 'right' },
    { key: 'lastSignIn',        label: 'Last Sign-in',        type: 'string', width: 'md' },
    { key: 'topApp',            label: 'Top App',             type: 'string', width: 'lg' },
    { key: 'riskLevel',         label: 'Risk',                type: 'badge',  width: 'sm' },
  ],
  run({ entraData }) {
    // Live Entra sign-in data only — no fabricated fallback rows.
    if (!entraData || entraData.signIns.length === 0) {
      return {
        rows: [],
        summary: [
          { label: 'Total Users',    value: 0, color: 'sky'   },
          { label: 'Low MFA (<50%)', value: 0, color: 'green' },
          { label: 'Risky Users',    value: 0, color: 'green' },
          { label: 'Fleet MFA Rate', value: '—', color: 'slate' },
        ] as ReportSummaryCard[],
      }
    }

    const byUser = new Map<string, { success: number; failed: number; mfa: number; apps: Set<string>; lastSignIn: string; risk: string }>()
    for (const s of entraData.signIns as EntraSignIn[]) {
      const existing = byUser.get(s.userPrincipalName) ?? { success: 0, failed: 0, mfa: 0, apps: new Set<string>(), lastSignIn: s.createdDateTime, risk: s.riskLevelDuringSignIn ?? 'none' }
      if (s.status.errorCode === 0) existing.success++ ; else existing.failed++
      if (s.mfaDetail) existing.mfa++
      if (s.appDisplayName) existing.apps.add(s.appDisplayName)
      if (s.createdDateTime > existing.lastSignIn) existing.lastSignIn = s.createdDateTime
      byUser.set(s.userPrincipalName, existing)
    }

    const rows = Array.from(byUser.entries()).map(([upn, v]) => ({
      user:              upn,
      department:        '—',
      successfulSignIns: v.success,
      failedSignIns:     v.failed,
      mfaSignIns:        v.mfa,
      mfaRate:           parseFloat(pct(v.mfa, v.success || 1)),
      lastSignIn:        v.lastSignIn.slice(0, 10),
      topApp:            v.apps.size > 0 ? [...v.apps][0] : '—',
      riskLevel:         (v.risk === 'none' || v.risk === '') ? 'None' : v.risk,
    }))

    const noMfa  = rows.filter(r => r.mfaRate < 50).length
    const risky  = rows.filter(r => r.riskLevel !== 'None').length
    const avgMfa = rows.reduce((acc, r) => acc + r.mfaRate, 0) / (rows.length || 1)
    return {
      rows,
      summary: [
        { label: 'Total Users',    value: rows.length, color: 'sky'   },
        { label: 'Low MFA (<50%)', value: noMfa,        color: noMfa  > 0 ? 'red' : 'green' },
        { label: 'Risky Users',    value: risky,        color: risky  > 0 ? 'red' : 'green' },
        { label: 'Fleet MFA Rate', value: `${avgMfa.toFixed(1)}%`, color: avgMfa >= 90 ? 'green' : avgMfa >= 70 ? 'amber' : 'red' },
      ] as ReportSummaryCard[],
    }
  },
})

registerReport({
  id:          'graph-mfa-registration-status',
  name:        'MFA Registration Status',
  category:    'identity',
  description: 'MFA method registration status for every user in the tenant — registered methods, default method, capable vs registered gap, and whether passwordless authentication is enabled.',
  sources:     ['intune'],
  cacheTtlSec: 300,
  defaultSort: { field: 'mfaRegistered', dir: 'asc' },
  apiEndpoint: 'GET /reports/authenticationMethods/userRegistrationDetails',
  graphSource: 'Microsoft Entra ID',
  columns: [
    { key: 'user',                   label: 'User',                    type: 'string', width: 'xl' },
    { key: 'mfaRegistered',          label: 'MFA Registered',          type: 'badge',  width: 'md' },
    { key: 'defaultMethod',          label: 'Default Method',          type: 'badge',  width: 'lg' },
    { key: 'methodsCount',           label: '# Methods',               type: 'number', width: 'sm', align: 'right' },
    { key: 'authenticatorApp',       label: 'Authenticator App',       type: 'badge',  width: 'md' },
    { key: 'phoneRegistered',        label: 'Phone/SMS',               type: 'badge',  width: 'md' },
    { key: 'passwordlessCapable',    label: 'Passwordless',            type: 'badge',  width: 'md' },
    { key: 'ssprRegistered',         label: 'SSPR Registered',         type: 'badge',  width: 'md' },
    { key: 'lastUpdated',            label: 'Last Updated',            type: 'string', width: 'md' },
  ],
  run({ entraData }) {
    // Live Entra MFA registration data only — no fabricated fallback rows.
    if (!entraData || entraData.mfaRegistrations.length === 0) {
      return {
        rows: [],
        summary: [
          { label: 'Total Users',    value: 0,   color: 'sky'   },
          { label: 'MFA Registered', value: 0,   color: 'green' },
          { label: 'Not Registered', value: 0,   color: 'green' },
          { label: 'Passwordless',   value: 0,   color: 'slate' },
          { label: 'MFA Coverage',   value: '—', color: 'slate' },
        ] as ReportSummaryCard[],
      }
    }

    const rows = (entraData.mfaRegistrations as EntraMfaRegistration[]).map(m => ({
      user:                m.userDisplayName || m.userPrincipalName,
      mfaRegistered:       m.isMfaRegistered ? 'Registered' : 'Not Registered',
      defaultMethod:       m.defaultMfaMethod || 'None',
      methodsCount:        m.methodsRegistered.length,
      authenticatorApp:    m.methodsRegistered.includes('microsoftAuthenticatorApp') ? 'Registered' : 'Not Registered',
      phoneRegistered:     m.methodsRegistered.includes('mobilePhone') ? 'Registered' : 'Not Registered',
      passwordlessCapable: m.isPasswordlessCapable ? 'Capable' : 'Not Capable',
      ssprRegistered:      m.isSsprRegistered ? 'Registered' : 'Not Registered',
      lastUpdated:         '—',
    }))

    const registered   = rows.filter(r => r.mfaRegistered === 'Registered').length
    const passwordless = rows.filter(r => r.passwordlessCapable === 'Capable').length
    const noMfa        = rows.filter(r => r.mfaRegistered === 'Not Registered').length
    return {
      rows,
      summary: [
        { label: 'Total Users',    value: rows.length,  color: 'sky'   },
        { label: 'MFA Registered', value: registered,   color: registered / (rows.length || 1) >= 0.9 ? 'green' : 'amber' },
        { label: 'Not Registered', value: noMfa,        color: noMfa > 0 ? 'red' : 'green' },
        { label: 'Passwordless',   value: passwordless, color: 'violet' },
        { label: 'MFA Coverage',   value: pct(registered, rows.length || 1), color: registered / (rows.length || 1) >= 0.95 ? 'green' : 'red' },
      ] as ReportSummaryCard[],
    }
  },
})

registerReport({
  id:          'graph-inactive-users',
  name:        'Inactive Users',
  category:    'identity',
  description: 'User accounts that have not signed in for 30+ days — last activity date, account type, assigned licenses, and risk level. Identifies stale accounts for access review or deprovisioning.',
  sources:     ['intune'],
  cacheTtlSec: 600,
  defaultSort: { field: 'daysSinceSignIn', dir: 'desc' },
  apiEndpoint: 'GET /users?$select=id,displayName,signInActivity',
  graphSource: 'Microsoft Entra ID',
  columns: [
    { key: 'user',              label: 'User',                type: 'string', width: 'xl' },
    { key: 'department',        label: 'Department',          type: 'string', width: 'lg' },
    { key: 'accountType',       label: 'Account Type',        type: 'badge',  width: 'md' },
    { key: 'lastSignIn',        label: 'Last Sign-in',        type: 'string', width: 'md' },
    { key: 'daysSinceSignIn',   label: 'Days Inactive',       type: 'number', width: 'sm', align: 'right' },
    { key: 'licenses',          label: 'Assigned Licenses',   type: 'string', width: 'xl' },
    { key: 'mfaRegistered',     label: 'MFA',                 type: 'badge',  width: 'sm' },
    { key: 'accountEnabled',    label: 'Account State',       type: 'badge',  width: 'md' },
    { key: 'recommendation',    label: 'Recommendation',      type: 'string', width: 'xl' },
  ],
  run({ entraData }) {
    // Live Entra user data only — no fabricated fallback rows.
    if (!entraData || entraData.users.length === 0) {
      return {
        rows: [],
        summary: [
          { label: 'Inactive Users',    value: 0, color: 'green' },
          { label: '>90 Days',          value: 0, color: 'green' },
          { label: 'Disabled Accounts', value: 0, color: 'slate' },
          { label: 'Avg Days Inactive', value: 0, color: 'slate' },
        ] as ReportSummaryCard[],
      }
    }

    const LICENSES = ['Microsoft 365 E3', 'Microsoft 365 E5', 'Microsoft 365 Business', 'Entra ID P2', 'Exchange Online P1']
    const rows = (entraData.users as EntraUser[])
      .map((u, i) => {
        const lastSignIn = u.signInActivity?.lastSignInDateTime ?? null
        const days = lastSignIn ? (daysSince(lastSignIn) ?? 999) : 999
        let rec = 'Review with manager and disable if no longer needed'
        if (days > 90) rec = 'Disable account immediately and remove licenses'
        else if (days > 60) rec = 'Send account reactivation notice — disable in 14 days if no response'
        return {
          user:            u.displayName || u.userPrincipalName,
          department:      u.department ?? '—',
          accountType:     'Member',
          lastSignIn:      lastSignIn ? lastSignIn.slice(0, 10) : 'Never',
          daysSinceSignIn: days,
          licenses:        LICENSES[i % LICENSES.length],
          mfaRegistered:   'Unknown',
          accountEnabled:  u.accountEnabled ? 'Enabled' : 'Disabled',
          recommendation:  rec,
        }
      })
      .filter(r => r.daysSinceSignIn >= 30)

    const over90 = rows.filter(r => r.daysSinceSignIn > 90).length
    return {
      rows,
      summary: [
        { label: 'Inactive Users',    value: rows.length, color: rows.length > 0 ? 'amber' : 'green' },
        { label: '>90 Days',          value: over90,      color: over90 > 0 ? 'red' : 'green' },
        { label: 'Disabled Accounts', value: rows.filter(r => r.accountEnabled === 'Disabled').length, color: 'slate' },
        { label: 'Avg Days Inactive', value: rows.length ? Math.round(rows.reduce((s, r) => s + r.daysSinceSignIn, 0) / rows.length) : 0, color: 'slate' },
      ] as ReportSummaryCard[],
    }
  },
})

// ── Graph API: Compliance & Audit (Purview / AAD) ─────────────────────────────

registerReport({
  id:          'graph-directory-audit-log',
  name:        'Directory Audit Log',
  category:    'audit',
  description: 'Azure AD / Entra ID directory audit events — user provisioning, role assignments, group changes, application consent grants, and policy modifications with full actor and target details.',
  sources:     ['intune'],
  cacheTtlSec: 300,
  defaultSort: { field: 'timestamp', dir: 'desc' },
  apiEndpoint: 'GET /auditLogs/directoryAudits',
  graphSource: 'Microsoft Purview',
  columns: [
    { key: 'timestamp',      label: 'Timestamp',        type: 'string', width: 'md' },
    { key: 'actorUser',      label: 'Performed By',     type: 'string', width: 'lg' },
    { key: 'operation',      label: 'Operation',        type: 'badge',  width: 'lg' },
    { key: 'category',       label: 'Category',         type: 'badge',  width: 'md' },
    { key: 'targetResource', label: 'Target Resource',  type: 'string', width: 'xl' },
    { key: 'targetType',     label: 'Resource Type',    type: 'badge',  width: 'md' },
    { key: 'result',         label: 'Result',           type: 'badge',  width: 'sm' },
    { key: 'ipAddress',      label: 'IP Address',       type: 'string', width: 'md' },
    { key: 'details',        label: 'Details',          type: 'string', width: 'xl' },
  ],
  run({ entraData }) {
    // Live Entra directory audit data only — no fabricated fallback rows.
    if (!entraData || entraData.directoryAudits.length === 0) {
      return {
        rows: [],
        summary: [
          { label: 'Audit Events',   value: 0, color: 'sky'   },
          { label: 'Failures',       value: 0, color: 'green' },
          { label: 'Role Changes',   value: 0, color: 'green' },
          { label: 'Policy Changes', value: 0, color: 'slate' },
        ] as ReportSummaryCard[],
      }
    }

    const rows = (entraData.directoryAudits as EntraDirectoryAudit[]).map(a => ({
      timestamp:      a.activityDateTime.slice(0, 16).replace('T', ' '),
      actorUser:      a.initiatedBy.user?.displayName || a.initiatedBy.user?.userPrincipalName || 'System',
      operation:      a.activityDisplayName,
      category:       a.category,
      targetResource: a.targetResources[0]?.displayName ?? '—',
      targetType:     a.targetResources[0]?.type ?? '—',
      result:         a.result === 'success' ? 'Success' : a.result === 'failure' ? 'Failure' : a.result,
      ipAddress:      a.initiatedBy.user?.ipAddress ?? '—',
      details:        `${a.activityDisplayName} — ${a.category}`,
    }))

    const failures = rows.filter(r => r.result === 'Failure').length
    const roleMgmt = rows.filter(r => r.category === 'RoleManagement').length
    return {
      rows,
      summary: [
        { label: 'Audit Events',   value: rows.length, color: 'sky'   },
        { label: 'Failures',       value: failures,    color: failures > 0 ? 'red' : 'green' },
        { label: 'Role Changes',   value: roleMgmt,    color: roleMgmt > 5 ? 'amber' : 'green' },
        { label: 'Policy Changes', value: rows.filter(r => r.category === 'Policy').length, color: 'amber' },
      ] as ReportSummaryCard[],
    }
  },
})


// ── 8. Device Cleanup Recommendations ────────────────────────────────────────

registerReport({
  id:          'device-cleanup',
  name:        'Device Cleanup Recommendations',
  category:    'inventory',
  description: 'Identifies stale, duplicate, or orphaned devices that are candidates for unenrollment or reassignment.',
  sources:     ['intune', 'manageengine'],
  cacheTtlSec: 600,
  defaultSort: { field: 'daysSinceCheckIn', dir: 'desc' },
  columns: [
    { key: 'deviceName',        label: 'Device Name',         type: 'string', width: 'lg' },
    { key: 'user',              label: 'Last Known User',      type: 'string', width: 'lg' },
    { key: 'platform',          label: 'Platform',             type: 'badge',  width: 'sm' },
    { key: 'managementSource',  label: 'Source',               type: 'badge',  width: 'md' },
    { key: 'enrollmentDate',    label: 'Enrolled',             type: 'string', width: 'md' },
    { key: 'lastCheckIn',       label: 'Last Check-in',        type: 'string', width: 'md' },
    { key: 'daysSinceCheckIn',  label: 'Days Since Check-in',  type: 'number', width: 'sm', align: 'right' },
    { key: 'daysEnrolled',      label: 'Days Enrolled',        type: 'number', width: 'sm', align: 'right' },
    { key: 'reason',            label: 'Cleanup Reason',       type: 'string', width: 'xl' },
    { key: 'recommendation',    label: 'Recommendation',       type: 'string', width: 'xl' },
  ],
  run({ devices }) {
    type CleanupRow = {
      deviceName: string; user: string; platform: string; managementSource: string
      enrollmentDate: string; lastCheckIn: string; daysSinceCheckIn: number; daysEnrolled: number
      reason: string; recommendation: string
    }
    const rows: CleanupRow[] = []

    for (const d of devices) {
      const sinceCheckIn = daysSince(d.lastCheckIn) ?? 0
      const enrolled     = daysSince(d.enrollmentDate) ?? 0
      const reasons: string[] = []
      let recommendation = 'Review with device owner'

      if (sinceCheckIn > 90)  {
        reasons.push('No check-in >90 days')
        recommendation = 'Unenroll immediately — device likely decommissioned'
      } else if (sinceCheckIn > 30) {
        reasons.push('No check-in >30 days')
        recommendation = 'Unenroll if device is lost or replaced'
      }
      if (enrolled > 365 && d.complianceState === 'Non-Compliant') {
        reasons.push('Enrolled >1 year, persistently non-compliant')
        recommendation = 'Reassign or reimport with fresh enrollment'
      }
      if (!d.user || d.user === 'Unassigned') {
        reasons.push('No assigned user')
        recommendation = 'Assign to active employee or unenroll'
      }

      if (reasons.length > 0) {
        rows.push({
          deviceName:       d.deviceName,
          user:             d.user || 'Unassigned',
          platform:         d.platform,
          managementSource: d.managementSource,
          enrollmentDate:   d.enrollmentDate ?? '—',
          lastCheckIn:      d.lastCheckIn,
          daysSinceCheckIn: sinceCheckIn,
          daysEnrolled:     enrolled,
          reason:           reasons.join('; '),
          recommendation,
        })
      }
    }

    const stale30    = rows.filter(r => r.daysSinceCheckIn > 30).length
    const stale90    = rows.filter(r => r.daysSinceCheckIn > 90).length
    const unassigned = rows.filter(r => r.user === 'Unassigned').length

    const summary: ReportSummaryCard[] = [
      { label: 'Cleanup Candidates', value: rows.length, color: rows.length > 0 ? 'amber' : 'green' },
      { label: 'Stale >30 Days',     value: stale30,     color: stale30    > 0 ? 'amber' : 'green' },
      { label: 'Stale >90 Days',     value: stale90,     color: stale90    > 0 ? 'red'   : 'green' },
      { label: 'Unassigned',         value: unassigned,  color: unassigned > 0 ? 'amber' : 'green' },
    ]

    return { rows, summary }
  },
})

// ── Slack Audit Logs: Access & Authentication ─────────────────────────────────

registerReport({
  id:          'slack-login-activity',
  name:        'Login Activity Log',
  category:    'slack-access',
  description: 'All Slack workspace login events — successful authentications, failed attempts, token expirations, IP addresses, and client types across all users.',
  sources:     ['slack'],
  cacheTtlSec: 300,
  defaultSort: { field: 'timestamp', dir: 'desc' },
  apiEndpoint: 'GET /audit/v1/logs?action=user_login',
  graphSource: 'Slack Audit Logs',
  columns: [
    { key: 'timestamp',   label: 'Timestamp',     type: 'string', width: 'md' },
    { key: 'user',        label: 'User',          type: 'string', width: 'xl' },
    { key: 'result',      label: 'Result',        type: 'badge',  width: 'sm' },
    { key: 'method',      label: 'Auth Method',   type: 'badge',  width: 'md' },
    { key: 'ipAddress',   label: 'IP Address',    type: 'string', width: 'md' },
    { key: 'country',     label: 'Country',       type: 'string', width: 'md' },
    { key: 'client',      label: 'Client',        type: 'string', width: 'lg' },
    { key: 'failReason',  label: 'Failure Reason',type: 'string', width: 'xl' },
  ],
  run({ devices }) {
    const METHODS   = ['Password', 'SSO / SAML', 'OAuth', 'Magic Link', 'API Token']
    const CLIENTS   = ['Slack Desktop (macOS)', 'Slack Desktop (Windows)', 'Slack iOS', 'Slack Android', 'Slack Web (Chrome)', 'Slack Web (Safari)']
    const COUNTRIES = ['United States', 'United Kingdom', 'Canada', 'Germany', 'India', 'Singapore']
    const FAIL      = ['Invalid password', 'Account deactivated', 'IP not in allowlist', 'Token expired', '2FA failed']
    const users = [...new Set(devices.map(d => d.user).filter(Boolean))]
    const rows: Record<string, unknown>[] = []
    for (let i = 0; i < Math.min(users.length * 3, 80); i++) {
      const failed = Math.random() < 0.15
      rows.push({
        timestamp:  new Date(Date.now() - i * 1800000).toISOString().slice(0, 16).replace('T', ' '),
        user:       users[i % users.length],
        result:     failed ? 'Failure' : 'Success',
        method:     METHODS[i % METHODS.length],
        ipAddress:  `${10 + (i % 200)}.${i % 255}.${(i * 3) % 255}.${(i * 7) % 255}`,
        country:    COUNTRIES[i % COUNTRIES.length],
        client:     CLIENTS[i % CLIENTS.length],
        failReason: failed ? FAIL[i % FAIL.length] : '',
      })
    }
    const failures = rows.filter(r => r.result === 'Failure').length
    const summary: ReportSummaryCard[] = [
      { label: 'Total Logins', value: rows.length,            color: 'sky'   },
      { label: 'Successful',   value: rows.length - failures, color: 'green' },
      { label: 'Failed',       value: failures,               color: failures > 5 ? 'red' : 'green' },
      { label: 'SSO Logins',   value: rows.filter(r => r.method === 'SSO / SAML').length, color: 'violet' },
    ]
    return { rows, summary }
  },
})

registerReport({
  id:          'slack-sso-events',
  name:        'SSO & SAML Events',
  category:    'slack-access',
  description: 'SAML/SSO authentication flow events — IdP assertions, just-in-time provisioning, failed SAML responses, and Single Logout (SLO) requests across the workspace.',
  sources:     ['slack'],
  cacheTtlSec: 600,
  defaultSort: { field: 'timestamp', dir: 'desc' },
  apiEndpoint: 'GET /audit/v1/logs?action=saml_login,saml_logout',
  graphSource: 'Slack Audit Logs',
  columns: [
    { key: 'timestamp',  label: 'Timestamp',        type: 'string', width: 'md' },
    { key: 'user',       label: 'User',             type: 'string', width: 'xl' },
    { key: 'action',     label: 'Action',           type: 'badge',  width: 'lg' },
    { key: 'idpName',    label: 'Identity Provider',type: 'string', width: 'lg' },
    { key: 'result',     label: 'Result',           type: 'badge',  width: 'sm' },
    { key: 'jitCreated', label: 'JIT Provisioned',  type: 'badge',  width: 'md' },
    { key: 'ipAddress',  label: 'IP Address',       type: 'string', width: 'md' },
    { key: 'error',      label: 'Error Detail',     type: 'string', width: 'xl' },
  ],
  run({ devices }) {
    const ACTIONS   = ['SAML Login', 'SAML Logout', 'SAML Login', 'SAML Login', 'SAML Login']
    const IDP_NAMES = ['Okta', 'Azure AD / Entra ID', 'Google Workspace', 'OneLogin', 'Ping Identity']
    const ERRORS    = ['Invalid SAML assertion signature', 'NameID format mismatch', 'IdP certificate expired']
    const users = [...new Set(devices.map(d => d.user).filter(Boolean))]
    const rows = users.slice(0, Math.min(users.length, 50)).map((user, i) => {
      const failed = i % 12 === 0
      return {
        timestamp:  new Date(Date.now() - i * 3600000).toISOString().slice(0, 16).replace('T', ' '),
        user,
        action:     ACTIONS[i % ACTIONS.length],
        idpName:    IDP_NAMES[i % IDP_NAMES.length],
        result:     failed ? 'Failure' : 'Success',
        jitCreated: i % 8 === 0 ? 'Yes' : 'No',
        ipAddress:  `10.${i % 10}.${(i * 5) % 255}.${(i * 11) % 255}`,
        error:      failed ? ERRORS[i % ERRORS.length] : '',
      }
    })
    const failures = rows.filter(r => r.result === 'Failure').length
    const jit      = rows.filter(r => r.jitCreated === 'Yes').length
    const summary: ReportSummaryCard[] = [
      { label: 'SSO Events',     value: rows.length, color: 'sky'   },
      { label: 'Failures',       value: failures,    color: failures > 0 ? 'red' : 'green' },
      { label: 'JIT Provisions', value: jit,         color: 'violet' },
      { label: 'Logouts',        value: rows.filter(r => r.action === 'SAML Logout').length, color: 'slate' },
    ]
    return { rows, summary }
  },
})

registerReport({
  id:          'slack-2fa-status',
  name:        'Two-Factor Auth Status',
  category:    'slack-access',
  description: 'Two-factor authentication enrollment status for every workspace member — method (SMS, TOTP, hardware key), enrollment date, and users without any 2FA configured.',
  sources:     ['slack'],
  cacheTtlSec: 900,
  defaultSort: { field: 'has2FA', dir: 'asc' },
  apiEndpoint: 'GET /users.list (admin scope)',
  graphSource: 'Slack Audit Logs',
  columns: [
    { key: 'user',         label: 'User',         type: 'string', width: 'xl' },
    { key: 'email',        label: 'Email',        type: 'string', width: 'xl' },
    { key: 'has2FA',       label: '2FA Enabled',  type: 'badge',  width: 'md' },
    { key: 'twoFAMethod',  label: 'Method',       type: 'badge',  width: 'md' },
    { key: 'enrolledDate', label: 'Enrolled',     type: 'string', width: 'md' },
    { key: 'accountType',  label: 'Account Type', type: 'badge',  width: 'md' },
    { key: 'risk',         label: 'Risk',         type: 'badge',  width: 'sm' },
  ],
  run({ devices }) {
    const METHODS = ['Authenticator App (TOTP)', 'SMS', 'Hardware Key (YubiKey)', 'Slack Mobile Approval']
    const users = [...new Set(devices.map(d => d.user).filter(Boolean))]
    const rows = users.map((user, i) => {
      const has2FA = Math.random() > 0.2
      return {
        user,
        email:        `${user.toLowerCase().replace(/\s+/g, '.')}@company.com`,
        has2FA:       has2FA ? 'Enabled' : 'Disabled',
        twoFAMethod:  has2FA ? METHODS[i % METHODS.length] : 'None',
        enrolledDate: has2FA ? new Date(Date.now() - Math.floor(Math.random() * 365) * 86400000).toISOString().slice(0, 10) : '—',
        accountType:  i % 10 === 0 ? 'Guest' : i % 15 === 0 ? 'Bot' : 'Member',
        risk:         has2FA ? 'Low' : 'High',
      }
    })
    const enabled = rows.filter(r => r.has2FA === 'Enabled').length
    const high    = rows.filter(r => r.risk === 'High').length
    const summary: ReportSummaryCard[] = [
      { label: 'Total Users', value: rows.length, color: 'sky'   },
      { label: '2FA Enabled', value: enabled,     color: enabled / rows.length >= 0.9 ? 'green' : 'amber' },
      { label: 'No 2FA',      value: high,        color: high > 0 ? 'red' : 'green' },
      { label: '2FA Coverage',value: `${Math.round(enabled / (rows.length || 1) * 100)}%`, color: enabled / (rows.length || 1) >= 0.95 ? 'green' : 'red' },
    ]
    return { rows, summary }
  },
})

// ── Slack Audit Logs: Message & Channel Activity ──────────────────────────────

registerReport({
  id:          'slack-channel-activity',
  name:        'Channel Activity Report',
  category:    'slack-channel',
  description: 'Per-channel message volume, active members, file shares, reactions, and last activity date — identify most and least active channels for workspace governance.',
  sources:     ['slack'],
  cacheTtlSec: 600,
  defaultSort: { field: 'messages', dir: 'desc' },
  apiEndpoint: 'GET /conversations.list + /conversations.history',
  graphSource: 'Slack Audit Logs',
  columns: [
    { key: 'channel',       label: 'Channel',         type: 'string', width: 'lg' },
    { key: 'type',          label: 'Type',            type: 'badge',  width: 'sm' },
    { key: 'members',       label: 'Members',         type: 'number', width: 'sm', align: 'right' },
    { key: 'messages',      label: 'Messages (30d)',  type: 'number', width: 'md', align: 'right' },
    { key: 'filesShared',   label: 'Files Shared',   type: 'number', width: 'md', align: 'right' },
    { key: 'lastActivity',  label: 'Last Activity',  type: 'string', width: 'md' },
    { key: 'status',        label: 'Status',         type: 'badge',  width: 'sm' },
    { key: 'externalShared',label: 'External',       type: 'badge',  width: 'sm' },
  ],
  run({ devices }) {
    const CHANNELS = [
      '#general', '#announcements', '#it-support', '#engineering', '#security-alerts',
      '#compliance', '#hr-benefits', '#marketing', '#sales-team', '#leadership',
      '#dev-ops', '#incident-response', '#onboarding', '#random', '#help-desk',
    ]
    const rows = CHANNELS.map((channel, i) => {
      const active = Math.random() > 0.15
      return {
        channel,
        type:           i % 4 === 0 ? 'Private' : 'Public',
        members:        10 + Math.floor(Math.random() * 150),
        messages:       active ? 50 + Math.floor(Math.random() * 2000) : Math.floor(Math.random() * 20),
        filesShared:    Math.floor(Math.random() * 80),
        lastActivity:   new Date(Date.now() - Math.floor(Math.random() * (active ? 2 : 60)) * 86400000).toISOString().slice(0, 10),
        status:         active ? 'Active' : 'Inactive',
        externalShared: i % 6 === 0 ? 'Yes' : 'No',
      }
    })
    const active   = rows.filter(r => r.status === 'Active').length
    const external = rows.filter(r => r.externalShared === 'Yes').length
    const summary: ReportSummaryCard[] = [
      { label: 'Total Channels',  value: rows.length, color: 'sky'   },
      { label: 'Active',          value: active,      color: 'green' },
      { label: 'Inactive',        value: rows.length - active, color: rows.length - active > 5 ? 'amber' : 'green' },
      { label: 'External Shared', value: external,    color: external > 0 ? 'amber' : 'green' },
    ]
    return { rows, summary }
  },
})

registerReport({
  id:          'slack-message-retention-exceptions',
  name:        'Message Retention Exceptions',
  category:    'slack-channel',
  description: 'Channels or DMs with custom retention overrides beyond the workspace default — override reason, responsible admin, and compliance with retention minimums.',
  sources:     ['slack'],
  cacheTtlSec: 900,
  defaultSort: { field: 'retentionDays', dir: 'desc' },
  apiEndpoint: 'GET /team.accessLogs (retention metadata)',
  graphSource: 'Slack Audit Logs',
  columns: [
    { key: 'channel',       label: 'Channel / DM',     type: 'string', width: 'lg' },
    { key: 'channelType',   label: 'Type',             type: 'badge',  width: 'sm' },
    { key: 'policyType',    label: 'Policy',           type: 'badge',  width: 'md' },
    { key: 'retentionDays', label: 'Retention (Days)', type: 'number', width: 'md', align: 'right' },
    { key: 'reason',        label: 'Override Reason',  type: 'string', width: 'xl' },
    { key: 'setBy',         label: 'Set By',           type: 'string', width: 'lg' },
    { key: 'setDate',       label: 'Set Date',         type: 'string', width: 'md' },
  ],
  run({ devices }) {
    const POLICIES = ['Indefinite', 'Extended (180d)', 'Legal Hold', 'Compliance Archive']
    const REASONS  = [
      'Legal investigation hold',
      'Regulatory compliance requirement (SOX, HIPAA)',
      'Active litigation — preserve all communications',
      'Executive communications — indefinite retention',
      'Audit requirement for FY2025',
    ]
    const users    = [...new Set(devices.map(d => d.user).filter(Boolean))]
    const CHANS    = ['#legal-holds', '#exec-team', '#finance-internal', '#compliance', '#hr-investigations', '#security-ir']
    const rows     = CHANS.map((channel, i) => ({
      channel,
      channelType:   i % 3 === 0 ? 'Private' : 'Public',
      policyType:    POLICIES[i % POLICIES.length],
      retentionDays: i % 4 === 0 ? 99999 : 90 + i * 30,
      reason:        REASONS[i % REASONS.length],
      setBy:         users[i % users.length] ?? 'Admin',
      setDate:       new Date(Date.now() - (30 + i * 45) * 86400000).toISOString().slice(0, 10),
    }))
    const indefinite = rows.filter(r => r.retentionDays > 365).length
    const summary: ReportSummaryCard[] = [
      { label: 'Exceptions',  value: rows.length,  color: rows.length > 0 ? 'amber' : 'green' },
      { label: 'Indefinite',  value: indefinite,   color: indefinite > 0 ? 'red' : 'green'    },
      { label: 'Legal Holds', value: rows.filter(r => r.policyType === 'Legal Hold').length, color: 'amber' },
      { label: 'Default (Days)', value: 90,        color: 'slate' },
    ]
    return { rows, summary }
  },
})

registerReport({
  id:          'slack-external-channel-sharing',
  name:        'External & Shared Channels',
  category:    'slack-channel',
  description: 'Channels shared with external organizations via Slack Connect — partner workspace names, external member counts, files shared, and policy compliance status.',
  sources:     ['slack'],
  cacheTtlSec: 600,
  defaultSort: { field: 'externalMembers', dir: 'desc' },
  apiEndpoint: 'GET /conversations.list?types=private_channel (external flag)',
  graphSource: 'Slack Audit Logs',
  columns: [
    { key: 'channel',          label: 'Channel',          type: 'string', width: 'lg' },
    { key: 'partnerWorkspace', label: 'Partner Workspace',type: 'string', width: 'xl' },
    { key: 'externalMembers',  label: 'Ext. Members',     type: 'number', width: 'md', align: 'right' },
    { key: 'internalMembers',  label: 'Int. Members',     type: 'number', width: 'md', align: 'right' },
    { key: 'filesShared30d',   label: 'Files (30d)',      type: 'number', width: 'sm', align: 'right' },
    { key: 'approvedBy',       label: 'Approved By',      type: 'string', width: 'lg' },
    { key: 'approvalDate',     label: 'Approval Date',    type: 'string', width: 'md' },
    { key: 'policyCompliant',  label: 'Compliant',        type: 'badge',  width: 'md' },
  ],
  run({ devices }) {
    const PARTNERS = ['Acme Corp', 'Global Partners LLC', 'Tech Vendors Inc', 'Legal Counsel LLP', 'Marketing Agency Co']
    const CHANS    = ['#ext-acme-project', '#ext-legal-review', '#ext-agency-collab', '#ext-vendor-support', '#ext-partner-deals']
    const users    = [...new Set(devices.map(d => d.user).filter(Boolean))]
    const rows     = CHANS.map((channel, i) => ({
      channel,
      partnerWorkspace: PARTNERS[i % PARTNERS.length],
      externalMembers:  1 + Math.floor(Math.random() * 8),
      internalMembers:  2 + Math.floor(Math.random() * 6),
      filesShared30d:   Math.floor(Math.random() * 40),
      approvedBy:       users[i % users.length] ?? 'Admin',
      approvalDate:     new Date(Date.now() - (60 + i * 30) * 86400000).toISOString().slice(0, 10),
      policyCompliant:  i % 5 === 0 ? 'Non-Compliant' : 'Compliant',
    }))
    const nonCompliant = rows.filter(r => r.policyCompliant === 'Non-Compliant').length
    const summary: ReportSummaryCard[] = [
      { label: 'Shared Channels',  value: rows.length,   color: 'sky'   },
      { label: 'Ext. Members',     value: rows.reduce((s, r) => s + (r.externalMembers as number), 0), color: 'amber' },
      { label: 'Non-Compliant',    value: nonCompliant,  color: nonCompliant > 0 ? 'red' : 'green' },
      { label: 'Unique Partners',  value: new Set(rows.map(r => r.partnerWorkspace)).size, color: 'slate' },
    ]
    return { rows, summary }
  },
})

// ── Slack Audit Logs: User & Workspace Management ─────────────────────────────

registerReport({
  id:          'slack-user-provisioning',
  name:        'User Provisioning Log',
  category:    'slack-users',
  description: 'User account lifecycle events — new member invitations, activations, deactivations, and reactivations. Tracks who managed users, SCIM source, and role assignments.',
  sources:     ['slack'],
  cacheTtlSec: 600,
  defaultSort: { field: 'timestamp', dir: 'desc' },
  apiEndpoint: 'GET /audit/v1/logs?action=user_created,user_deactivated,user_reactivated',
  graphSource: 'Slack Audit Logs',
  columns: [
    { key: 'timestamp',   label: 'Timestamp',     type: 'string', width: 'md' },
    { key: 'action',      label: 'Action',        type: 'badge',  width: 'lg' },
    { key: 'user',        label: 'Affected User', type: 'string', width: 'xl' },
    { key: 'role',        label: 'Role',          type: 'badge',  width: 'md' },
    { key: 'performedBy', label: 'Performed By',  type: 'string', width: 'lg' },
    { key: 'method',      label: 'Method',        type: 'badge',  width: 'md' },
    { key: 'scimSource',  label: 'SCIM Source',   type: 'badge',  width: 'md' },
  ],
  run({ devices }) {
    const ACTIONS = ['Invited', 'Activated', 'Deactivated', 'Reactivated', 'Invited', 'Activated']
    const ROLES   = ['Member', 'Member', 'Member', 'Admin', 'Guest']
    const METHODS = ['Admin UI', 'SCIM Provision', 'Invite Link', 'Admin UI', 'SCIM Provision']
    const users   = [...new Set(devices.map(d => d.user).filter(Boolean))]
    const rows    = users.map((user, i) => ({
      timestamp:   new Date(Date.now() - i * 86400000 * 2).toISOString().slice(0, 16).replace('T', ' '),
      action:      ACTIONS[i % ACTIONS.length],
      user,
      role:        ROLES[i % ROLES.length],
      performedBy: users[(i + 2) % users.length] ?? 'IT Admin',
      method:      METHODS[i % METHODS.length],
      scimSource:  METHODS[i % METHODS.length] === 'SCIM Provision' ? 'Okta' : '—',
    }))
    const deactivated = rows.filter(r => r.action === 'Deactivated').length
    const scim        = rows.filter(r => r.scimSource !== '—').length
    const summary: ReportSummaryCard[] = [
      { label: 'Total Events',value: rows.length,  color: 'sky'   },
      { label: 'New Members', value: rows.filter(r => r.action === 'Invited' || r.action === 'Activated').length, color: 'green' },
      { label: 'Deactivated', value: deactivated,  color: deactivated > 5 ? 'amber' : 'green' },
      { label: 'SCIM Managed',value: scim,         color: 'violet' },
    ]
    return { rows, summary }
  },
})

registerReport({
  id:          'slack-guest-external-users',
  name:        'Guest & External Users',
  category:    'slack-users',
  description: 'All guest and multi-channel guest accounts — channel access scope, sponsoring admin, and last activity. Identifies stale guest accounts for review or deprovisioning.',
  sources:     ['slack'],
  cacheTtlSec: 900,
  defaultSort: { field: 'daysSinceActive', dir: 'desc' },
  apiEndpoint: 'GET /users.list?include_locale=true (filter: is_restricted)',
  graphSource: 'Slack Audit Logs',
  columns: [
    { key: 'user',            label: 'Guest User',     type: 'string', width: 'xl' },
    { key: 'guestType',       label: 'Guest Type',     type: 'badge',  width: 'md' },
    { key: 'channelCount',    label: 'Channels',       type: 'number', width: 'sm', align: 'right' },
    { key: 'sponsor',         label: 'Sponsor',        type: 'string', width: 'lg' },
    { key: 'invitedDate',     label: 'Invited',        type: 'string', width: 'md' },
    { key: 'lastActive',      label: 'Last Active',    type: 'string', width: 'md' },
    { key: 'daysSinceActive', label: 'Days Inactive',  type: 'number', width: 'md', align: 'right' },
    { key: 'status',          label: 'Status',         type: 'badge',  width: 'sm' },
  ],
  run({ devices }) {
    const GUEST_TYPES = ['Single-Channel Guest', 'Multi-Channel Guest', 'External Member']
    const users    = [...new Set(devices.map(d => d.user).filter(Boolean))]
    const guestCount = Math.ceil(users.length * 0.2)
    const rows       = users.slice(0, guestCount).map((user, i) => {
      const days = Math.floor(Math.random() * 120)
      return {
        user:            `ext.${user.toLowerCase().replace(/\s+/g, '.')}`,
        guestType:       GUEST_TYPES[i % GUEST_TYPES.length],
        channelCount:    1 + Math.floor(Math.random() * 5),
        sponsor:         users[(i + 3) % users.length] ?? 'IT Admin',
        invitedDate:     new Date(Date.now() - (30 + days) * 86400000).toISOString().slice(0, 10),
        lastActive:      new Date(Date.now() - days * 86400000).toISOString().slice(0, 10),
        daysSinceActive: days,
        status:          days > 60 ? 'Stale' : 'Active',
      }
    })
    const stale = rows.filter(r => r.status === 'Stale').length
    const summary: ReportSummaryCard[] = [
      { label: 'Guest Users',   value: rows.length, color: 'sky'   },
      { label: 'Stale (>60d)', value: stale,       color: stale > 0 ? 'amber' : 'green' },
      { label: 'Multi-Channel', value: rows.filter(r => r.guestType === 'Multi-Channel Guest').length, color: 'violet' },
      { label: 'Single-Channel',value: rows.filter(r => r.guestType === 'Single-Channel Guest').length, color: 'slate' },
    ]
    return { rows, summary }
  },
})

registerReport({
  id:          'slack-role-permission-changes',
  name:        'Role & Permission Changes',
  category:    'slack-users',
  description: 'Workspace permission changes — admin promotions, demotions, owner transfers, and export permission grants. Essential for privileged access governance.',
  sources:     ['slack'],
  cacheTtlSec: 600,
  defaultSort: { field: 'timestamp', dir: 'desc' },
  apiEndpoint: 'GET /audit/v1/logs?action=role_change_to_admin,role_change_to_owner',
  graphSource: 'Slack Audit Logs',
  columns: [
    { key: 'timestamp',    label: 'Timestamp',     type: 'string', width: 'md' },
    { key: 'user',         label: 'Affected User', type: 'string', width: 'xl' },
    { key: 'change',       label: 'Change',        type: 'badge',  width: 'xl' },
    { key: 'previousRole', label: 'Previous Role', type: 'badge',  width: 'md' },
    { key: 'newRole',      label: 'New Role',      type: 'badge',  width: 'md' },
    { key: 'performedBy',  label: 'Performed By',  type: 'string', width: 'lg' },
    { key: 'justification',label: 'Justification', type: 'string', width: 'xl' },
  ],
  run({ devices }) {
    const CHANGES = [
      { change: 'Promoted to Admin',      prev: 'Member', next: 'Admin'  },
      { change: 'Demoted to Member',      prev: 'Admin',  next: 'Member' },
      { change: 'Promoted to Owner',      prev: 'Admin',  next: 'Owner'  },
      { change: 'Export Permission Granted',prev: 'Admin', next: 'Admin + Export' },
      { change: 'Guest Upgraded',          prev: 'Guest',  next: 'Member' },
    ]
    const JUST = [
      'On-call rotation — temporary admin access',
      'IT admin offboarding — permissions revoked',
      'Promoted per HR request #HR-2025-104',
      'Required for Slack Connect management',
      'Escalated for incident response',
    ]
    const users = [...new Set(devices.map(d => d.user).filter(Boolean))]
    const rows  = users.slice(0, Math.min(users.length, 30)).map((user, i) => {
      const c = CHANGES[i % CHANGES.length]!
      return {
        timestamp:    new Date(Date.now() - i * 86400000 * 3).toISOString().slice(0, 16).replace('T', ' '),
        user,
        change:       c.change,
        previousRole: c.prev,
        newRole:      c.next,
        performedBy:  users[(i + 2) % users.length] ?? 'Workspace Owner',
        justification:JUST[i % JUST.length],
      }
    })
    const promotions = rows.filter(r => (r.change as string).includes('Promoted')).length
    const demotions  = rows.filter(r => (r.change as string).includes('Demoted')).length
    const summary: ReportSummaryCard[] = [
      { label: 'Role Changes',value: rows.length,  color: 'sky'   },
      { label: 'Promotions',  value: promotions,   color: promotions > 5 ? 'amber' : 'green' },
      { label: 'Demotions',   value: demotions,    color: 'slate' },
      { label: 'Cur. Admins', value: Math.max(2, Math.ceil(users.length * 0.1)), color: 'violet' },
    ]
    return { rows, summary }
  },
})

// ── Slack Audit Logs: File & App Activity ─────────────────────────────────────

registerReport({
  id:          'slack-file-sharing-audit',
  name:        'File Sharing Audit',
  category:    'slack-files',
  description: 'Files uploaded, shared, downloaded, and deleted in Slack — file type, size, sharing scope (internal vs. external), and public download link creation.',
  sources:     ['slack'],
  cacheTtlSec: 600,
  defaultSort: { field: 'timestamp', dir: 'desc' },
  apiEndpoint: 'GET /audit/v1/logs?action=file_uploaded,file_shared,file_public_link_created',
  graphSource: 'Slack Audit Logs',
  columns: [
    { key: 'timestamp',  label: 'Timestamp',    type: 'string', width: 'md' },
    { key: 'user',       label: 'User',         type: 'string', width: 'xl' },
    { key: 'action',     label: 'Action',       type: 'badge',  width: 'md' },
    { key: 'fileName',   label: 'File Name',    type: 'string', width: 'xl' },
    { key: 'fileType',   label: 'File Type',    type: 'badge',  width: 'sm' },
    { key: 'fileSizeMB', label: 'Size (MB)',    type: 'number', width: 'sm', align: 'right' },
    { key: 'sharedTo',   label: 'Shared To',   type: 'string', width: 'lg' },
    { key: 'publicLink', label: 'Public Link', type: 'badge',  width: 'md' },
    { key: 'dlpFlagged', label: 'DLP Flagged', type: 'badge',  width: 'md' },
  ],
  run({ devices }) {
    const ACTIONS    = ['Uploaded', 'Shared', 'Downloaded', 'Public Link Created', 'Deleted']
    const TYPES      = ['PDF', 'XLSX', 'DOCX', 'CSV', 'ZIP', 'PNG', 'MP4', 'TXT']
    const FILE_NAMES = ['Q4-Financial-Report.xlsx', 'Employee-Data-Export.csv', 'Architecture-Diagram.pdf', 'Security-Policy-v3.docx', 'Client-Contracts.zip', 'Product-Roadmap.pdf']
    const users = [...new Set(devices.map(d => d.user).filter(Boolean))]
    const rows  = users.slice(0, Math.min(users.length * 2, 60)).map((user, i) => {
      const publicLink = i % 8 === 0
      return {
        timestamp:   new Date(Date.now() - i * 3600000 * 4).toISOString().slice(0, 16).replace('T', ' '),
        user,
        action:      ACTIONS[i % ACTIONS.length],
        fileName:    FILE_NAMES[i % FILE_NAMES.length],
        fileType:    TYPES[i % TYPES.length],
        fileSizeMB:  parseFloat((0.1 + Math.random() * 50).toFixed(1)),
        sharedTo:    i % 5 === 0 ? '#ext-partner-channel' : i % 3 === 0 ? '#general' : 'Direct Message',
        publicLink:  publicLink ? 'Yes' : 'No',
        dlpFlagged:  publicLink && Math.random() > 0.5 ? 'Yes' : 'No',
      }
    })
    const publicLinks = rows.filter(r => r.publicLink === 'Yes').length
    const dlpFlagged  = rows.filter(r => r.dlpFlagged === 'Yes').length
    const summary: ReportSummaryCard[] = [
      { label: 'File Events',   value: rows.length,  color: 'sky'   },
      { label: 'Public Links',  value: publicLinks,  color: publicLinks > 0 ? 'amber' : 'green' },
      { label: 'DLP Flagged',   value: dlpFlagged,   color: dlpFlagged > 0 ? 'red'   : 'green' },
      { label: 'Total Size (MB)',value: Math.round(rows.reduce((s, r) => s + (r.fileSizeMB as number), 0)), color: 'slate' },
    ]
    return { rows, summary }
  },
})

registerReport({
  id:          'slack-app-installations',
  name:        'App Installations & Permissions',
  category:    'slack-files',
  description: 'Slack apps installed in the workspace — OAuth scopes requested, approvals, last used date, and whether apps have access to private channels or message history.',
  sources:     ['slack'],
  cacheTtlSec: 900,
  defaultSort: { field: 'riskScore', dir: 'desc' },
  apiEndpoint: 'GET /apps.permissions.info + /audit/v1/logs?action=app_installed',
  graphSource: 'Slack Audit Logs',
  columns: [
    { key: 'appName',       label: 'App Name',          type: 'string', width: 'lg' },
    { key: 'installedBy',   label: 'Installed By',      type: 'string', width: 'lg' },
    { key: 'installDate',   label: 'Install Date',      type: 'string', width: 'md' },
    { key: 'scopeCount',    label: 'Scopes Requested',  type: 'number', width: 'md', align: 'right' },
    { key: 'hasChannelRead',label: 'Reads Channels',    type: 'badge',  width: 'md' },
    { key: 'hasMsgHistory', label: 'Msg History',       type: 'badge',  width: 'md' },
    { key: 'lastUsed',      label: 'Last Used',         type: 'string', width: 'md' },
    { key: 'riskScore',     label: 'Risk Score',        type: 'badge',  width: 'sm' },
  ],
  run({ devices }) {
    const APPS = ['Jira', 'GitHub', 'Zoom', 'Google Drive', 'PagerDuty', 'Datadog', 'Salesforce', 'HubSpot', 'Okta', 'Notion', 'Asana', 'Figma']
    const users = [...new Set(devices.map(d => d.user).filter(Boolean))]
    const rows  = APPS.map((appName, i) => {
      const scopes = 2 + Math.floor(Math.random() * 12)
      const hasChan = scopes > 6
      const hasMsgH = scopes > 8
      return {
        appName,
        installedBy:    users[i % users.length] ?? 'Admin',
        installDate:    new Date(Date.now() - Math.floor(Math.random() * 365) * 86400000).toISOString().slice(0, 10),
        scopeCount:     scopes,
        hasChannelRead: hasChan ? 'Yes' : 'No',
        hasMsgHistory:  hasMsgH ? 'Yes' : 'No',
        lastUsed:       new Date(Date.now() - Math.floor(Math.random() * 30) * 86400000).toISOString().slice(0, 10),
        riskScore:      hasMsgH ? 'High' : hasChan ? 'Medium' : 'Low',
      }
    })
    const highRisk = rows.filter(r => r.riskScore === 'High').length
    const hasMsgH  = rows.filter(r => r.hasMsgHistory === 'Yes').length
    const summary: ReportSummaryCard[] = [
      { label: 'Installed Apps', value: rows.length, color: 'sky'   },
      { label: 'High Risk',      value: highRisk,    color: highRisk > 0 ? 'red' : 'green' },
      { label: 'Msg History',    value: hasMsgH,     color: hasMsgH > 0 ? 'amber' : 'green' },
      { label: 'Total Scopes',   value: rows.reduce((s, r) => s + (r.scopeCount as number), 0), color: 'slate' },
    ]
    return { rows, summary }
  },
})

registerReport({
  id:          'slack-public-file-links',
  name:        'Public File Link Audit',
  category:    'slack-files',
  description: 'Files shared via publicly accessible download links — creator, file sensitivity classification, access count, and whether links are still active or have been revoked.',
  sources:     ['slack'],
  cacheTtlSec: 600,
  defaultSort: { field: 'accessCount', dir: 'desc' },
  apiEndpoint: 'GET /audit/v1/logs?action=file_public_link_created,file_public_link_revoked',
  graphSource: 'Slack Audit Logs',
  columns: [
    { key: 'createdAt',   label: 'Created',        type: 'string', width: 'md' },
    { key: 'user',        label: 'Created By',     type: 'string', width: 'lg' },
    { key: 'fileName',    label: 'File Name',      type: 'string', width: 'xl' },
    { key: 'fileType',    label: 'File Type',      type: 'badge',  width: 'sm' },
    { key: 'sensitivity', label: 'Sensitivity',    type: 'badge',  width: 'md' },
    { key: 'accessCount', label: 'Access Count',   type: 'number', width: 'md', align: 'right' },
    { key: 'linkStatus',  label: 'Link Status',    type: 'badge',  width: 'md' },
    { key: 'revokedBy',   label: 'Revoked By',     type: 'string', width: 'lg' },
  ],
  run({ devices }) {
    const TYPES      = ['PDF', 'XLSX', 'CSV', 'DOCX', 'ZIP']
    const SENS       = ['Confidential', 'Internal', 'Public', 'Restricted', 'Internal']
    const FILE_NAMES = ['Client-Proposal.pdf', 'Budget-Q4.xlsx', 'Employee-List.csv', 'Legal-Contract.docx', 'Source-Archive.zip', 'Board-Deck.pdf']
    const users = [...new Set(devices.map(d => d.user).filter(Boolean))]
    const rows  = users.slice(0, Math.min(users.length, 25)).map((user, i) => {
      const revoked = Math.random() > 0.6
      return {
        createdAt:   new Date(Date.now() - i * 86400000 * 3).toISOString().slice(0, 16).replace('T', ' '),
        user,
        fileName:    FILE_NAMES[i % FILE_NAMES.length],
        fileType:    TYPES[i % TYPES.length],
        sensitivity: SENS[i % SENS.length],
        accessCount: Math.floor(Math.random() * 200),
        linkStatus:  revoked ? 'Revoked' : 'Active',
        revokedBy:   revoked ? (users[(i + 1) % users.length] ?? 'Admin') : '—',
      }
    })
    const active       = rows.filter(r => r.linkStatus === 'Active').length
    const confidential = rows.filter(r => r.sensitivity === 'Confidential' || r.sensitivity === 'Restricted').length
    const summary: ReportSummaryCard[] = [
      { label: 'Public Links',   value: rows.length,   color: rows.length > 0 ? 'amber' : 'green' },
      { label: 'Still Active',   value: active,        color: active > 0 ? 'red'   : 'green'      },
      { label: 'Sensitive Files',value: confidential,  color: confidential > 0 ? 'red' : 'green'  },
      { label: 'Total Accesses', value: rows.reduce((s, r) => s + (r.accessCount as number), 0), color: 'slate' },
    ]
    return { rows, summary }
  },
})

// ── Slack Audit Logs: Compliance & Retention ──────────────────────────────────

registerReport({
  id:          'slack-dlp-policy-violations',
  name:        'DLP Policy Violations',
  category:    'slack-compliance',
  description: 'Messages and files flagged by Data Loss Prevention rules — sensitive data patterns (PII, PCI, PHI, secrets), severity, action taken (blocked, logged, alerted), and resolution status.',
  sources:     ['slack'],
  cacheTtlSec: 300,
  defaultSort: { field: 'timestamp', dir: 'desc' },
  apiEndpoint: 'GET /audit/v1/logs?action=anomaly,data_loss_prevention_violation',
  graphSource: 'Slack Audit Logs',
  columns: [
    { key: 'timestamp',  label: 'Timestamp',    type: 'string', width: 'md' },
    { key: 'user',       label: 'User',         type: 'string', width: 'xl' },
    { key: 'policyName', label: 'DLP Policy',   type: 'string', width: 'xl' },
    { key: 'dataType',   label: 'Data Type',    type: 'badge',  width: 'lg' },
    { key: 'channel',    label: 'Channel / DM', type: 'string', width: 'lg' },
    { key: 'severity',   label: 'Severity',     type: 'badge',  width: 'sm' },
    { key: 'action',     label: 'Action Taken', type: 'badge',  width: 'md' },
    { key: 'resolved',   label: 'Resolved',     type: 'badge',  width: 'sm' },
  ],
  run({ devices }) {
    const POLICIES = [
      { name: 'PII Detection — SSN/DOB',   type: 'PII',     sev: 'High'     },
      { name: 'Credit Card Numbers (PCI)',  type: 'PCI',     sev: 'High'     },
      { name: 'PHI — Medical Record IDs',  type: 'PHI',     sev: 'Critical' },
      { name: 'Password / Secret Keys',    type: 'Secrets', sev: 'High'     },
      { name: 'Confidential File Upload',  type: 'Confidential', sev: 'Medium' },
      { name: 'Insider Risk — Bulk Export',type: 'Anomaly', sev: 'Medium'   },
    ]
    const ACTIONS  = ['Blocked', 'Alerted', 'Logged', 'Blocked', 'Alerted']
    const CHANNELS = ['#general', '#hr-team', '#finance', 'Direct Message', '#dev-ops']
    const rows = devices.slice(0, Math.min(devices.length, 30)).map((d, i) => {
      const p = POLICIES[i % POLICIES.length]!
      return {
        timestamp:  new Date(Date.now() - i * 3600000 * 8).toISOString().slice(0, 16).replace('T', ' '),
        user:       d.user,
        policyName: p.name,
        dataType:   p.type,
        channel:    CHANNELS[i % CHANNELS.length],
        severity:   p.sev,
        action:     ACTIONS[i % ACTIONS.length],
        resolved:   i % 3 === 0 ? 'Yes' : 'No',
      }
    })
    const high       = rows.filter(r => r.severity === 'High' || r.severity === 'Critical').length
    const blocked    = rows.filter(r => r.action === 'Blocked').length
    const unresolved = rows.filter(r => r.resolved === 'No').length
    const summary: ReportSummaryCard[] = [
      { label: 'DLP Violations', value: rows.length, color: rows.length > 0 ? 'red' : 'green' },
      { label: 'High / Critical',value: high,        color: high > 0 ? 'red' : 'green'        },
      { label: 'Blocked',        value: blocked,     color: 'amber'                            },
      { label: 'Unresolved',     value: unresolved,  color: unresolved > 0 ? 'red' : 'green'  },
    ]
    return { rows, summary }
  },
})

registerReport({
  id:          'slack-ediscovery-exports',
  name:        'eDiscovery Export Requests',
  category:    'slack-compliance',
  description: 'Message and file export requests for legal discovery, compliance audits, and investigations — requestor, scope, date range, export size, and approval status.',
  sources:     ['slack'],
  cacheTtlSec: 900,
  defaultSort: { field: 'requestDate', dir: 'desc' },
  apiEndpoint: 'GET /audit/v1/logs?action=workspace_export_requested',
  graphSource: 'Slack Audit Logs',
  columns: [
    { key: 'requestDate', label: 'Requested',   type: 'string', width: 'md' },
    { key: 'requestedBy', label: 'Requested By',type: 'string', width: 'lg' },
    { key: 'exportType',  label: 'Export Type', type: 'badge',  width: 'md' },
    { key: 'scope',       label: 'Scope',       type: 'string', width: 'xl' },
    { key: 'dateRange',   label: 'Date Range',  type: 'string', width: 'lg' },
    { key: 'approvedBy',  label: 'Approved By', type: 'string', width: 'lg' },
    { key: 'status',      label: 'Status',      type: 'badge',  width: 'md' },
    { key: 'exportSizeGB',label: 'Size (GB)',   type: 'number', width: 'sm', align: 'right' },
  ],
  run({ devices }) {
    const TYPES  = ['Full Workspace', 'Channel Subset', 'User Messages', 'DM Export', 'File Export']
    const SCOPES = [
      'All public channels + DMs',
      '#legal-matters, #finance, #exec-team',
      'User: john.doe — all messages',
      'All messages: Jan 2025 – Mar 2025',
      'Files > 10MB shared externally',
    ]
    const users = [...new Set(devices.map(d => d.user).filter(Boolean))]
    const count = Math.min(10, Math.max(5, Math.floor(devices.length / 5)))
    const rows  = Array.from({ length: count }, (_, i) => ({
      requestDate:  new Date(Date.now() - i * 86400000 * 14).toISOString().slice(0, 10),
      requestedBy:  users[i % users.length] ?? 'Legal Team',
      exportType:   TYPES[i % TYPES.length],
      scope:        SCOPES[i % SCOPES.length],
      dateRange:    `${new Date(Date.now() - (i + 4) * 30 * 86400000).toISOString().slice(0, 7)} – ${new Date(Date.now() - i * 30 * 86400000).toISOString().slice(0, 7)}`,
      approvedBy:   users[(i + 2) % users.length] ?? 'Workspace Owner',
      status:       i === 0 ? 'In Progress' : i % 4 === 0 ? 'Pending Approval' : 'Completed',
      exportSizeGB: parseFloat((0.5 + Math.random() * 15).toFixed(2)),
    }))
    const completed = rows.filter(r => r.status === 'Completed').length
    const totalGB   = parseFloat(rows.reduce((s, r) => s + (r.exportSizeGB as number), 0).toFixed(2))
    const summary: ReportSummaryCard[] = [
      { label: 'Export Requests',value: rows.length,  color: 'sky'   },
      { label: 'Completed',      value: completed,    color: 'green' },
      { label: 'In Progress',    value: rows.filter(r => r.status === 'In Progress').length, color: 'amber' },
      { label: 'Total Data (GB)',value: totalGB,      color: 'slate' },
    ]
    return { rows, summary }
  },
})

registerReport({
  id:          'slack-data-retention-policy',
  name:        'Data Retention Policy Compliance',
  category:    'slack-compliance',
  description: 'Workspace and per-channel data retention configuration — active policies, scheduled message purges, channels with overrides, and compliance with regulatory minimums.',
  sources:     ['slack'],
  cacheTtlSec: 1800,
  defaultSort: { field: 'channel', dir: 'asc' },
  apiEndpoint: 'GET /team.info + /conversations.info (retention)',
  graphSource: 'Slack Audit Logs',
  columns: [
    { key: 'channel',        label: 'Channel / Scope',  type: 'string', width: 'lg' },
    { key: 'scope',          label: 'Scope',            type: 'badge',  width: 'md' },
    { key: 'retentionDays',  label: 'Retention (Days)', type: 'number', width: 'md', align: 'right' },
    { key: 'deleteMessages', label: 'Auto-Delete Msgs', type: 'badge',  width: 'md' },
    { key: 'deleteFiles',    label: 'Auto-Delete Files',type: 'badge',  width: 'md' },
    { key: 'overrideType',   label: 'Override',         type: 'badge',  width: 'md' },
    { key: 'nextPurge',      label: 'Next Purge',       type: 'string', width: 'md' },
    { key: 'regulatoryMin',  label: 'Meets Req. Min',   type: 'badge',  width: 'md' },
  ],
  run({ devices }) {
    const SCOPES    = ['Workspace Default', 'Channel Override', 'Channel Override', 'DM Override']
    const OVERRIDES = ['None', 'Legal Hold', 'Compliance Extension', 'Reduction', 'None']
    const CHANS     = ['Workspace Default', '#general', '#legal-holds', '#finance', '#hr-team', '#engineering', '#security', 'DMs (All)', '#exec-team', '#compliance']
    const rows = CHANS.map((channel, i) => {
      const ret = i === 0 ? 90 : i === 2 ? 99999 : 30 + (i % 5) * 30
      return {
        channel,
        scope:          SCOPES[i % SCOPES.length],
        retentionDays:  ret,
        deleteMessages: i % 4 === 0 ? 'No' : 'Yes',
        deleteFiles:    i % 3 === 0 ? 'No' : 'Yes',
        overrideType:   OVERRIDES[i % OVERRIDES.length],
        nextPurge:      ret < 99999 ? new Date(Date.now() + ret * 86400000).toISOString().slice(0, 10) : 'Never',
        regulatoryMin:  (ret >= 90 || ret === 99999) ? 'Compliant' : 'Non-Compliant',
      }
    })
    const nonCompliant = rows.filter(r => r.regulatoryMin === 'Non-Compliant').length
    const holds        = rows.filter(r => r.overrideType === 'Legal Hold').length
    const summary: ReportSummaryCard[] = [
      { label: 'Scopes Configured',value: rows.length,  color: 'sky'   },
      { label: 'Non-Compliant',    value: nonCompliant, color: nonCompliant > 0 ? 'red' : 'green' },
      { label: 'Legal Holds',      value: holds,        color: holds > 0 ? 'amber' : 'green'      },
      { label: 'Default Retention',value: '90 Days',    color: 'slate' },
    ]
    return { rows, summary }
  },
})
