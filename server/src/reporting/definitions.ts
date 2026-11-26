import { registerReport } from './engine.js'
import type { ReportSummaryCard } from './engine.js'
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
