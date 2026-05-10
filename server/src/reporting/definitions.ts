import { registerReport } from './engine.js'
import type { ReportContext, ReportSummaryCard } from './engine.js'

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
  sources:     ['intune', 'kandji', 'manageengine'],
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
  sources:     ['intune', 'kandji', 'manageengine'],
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
  sources:     ['intune', 'kandji', 'manageengine'],
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
    const sources = ['Microsoft Intune', 'Kandji', 'ManageEngine'] as const
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
  sources:     ['intune', 'kandji', 'manageengine'],
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
  sources:     ['intune', 'kandji', 'manageengine'],
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
  sources:     ['intune', 'kandji', 'manageengine'],
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
  sources:     ['intune', 'kandji', 'manageengine'],
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
  sources:     ['intune', 'kandji', 'manageengine'],
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
  sources:     ['intune', 'kandji', 'manageengine'],
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
  sources:     ['intune', 'kandji', 'manageengine'],
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

// ── 11. Kandji Library Inventory ──────────────────────────────────────────────

registerReport({
  id:          'kandji-library-inventory',
  name:        'Kandji Library Inventory',
  category:    'software',
  description: 'All items in the Kandji library — Auto Apps, VPP, Custom Apps, Scripts, Profiles, and more.',
  sources:     ['kandji'],
  cacheTtlSec: 600,
  defaultSort: { field: 'name', dir: 'asc' },
  columns: [
    { key: 'name',        label: 'Name',        type: 'string', width: 'xl' },
    { key: 'category',    label: 'Type',        type: 'badge',  width: 'md' },
    { key: 'enforcement', label: 'Enforcement', type: 'string', width: 'md' },
    { key: 'status',      label: 'Status',      type: 'badge',  width: 'sm' },
    { key: 'id',          label: 'Library ID',  type: 'string', width: 'lg' },
  ],
  run({ kandjiApps }) {
    if (!kandjiApps || kandjiApps.length === 0) {
      return {
        rows: [],
        summary: [{ label: 'No Kandji Data', value: 'Configure Kandji credentials in Settings', color: 'amber' }],
      }
    }

    const cats = groupCount(kandjiApps, a => a.category)
    const summary: ReportSummaryCard[] = [
      { label: 'Total Items',  value: kandjiApps.length, color: 'sky'    },
      { label: 'Active',       value: kandjiApps.filter(a => a.active).length, color: 'green'  },
      { label: 'Inactive',     value: kandjiApps.filter(a => !a.active).length, color: 'slate'  },
      { label: 'Auto Apps',    value: cats.get('Auto App') ?? 0, color: 'sky'    },
      { label: 'VPP Apps',     value: cats.get('VPP App')  ?? 0, color: 'violet' },
      { label: 'Scripts',      value: cats.get('Script')   ?? 0, color: 'amber'  },
    ]

    const rows = kandjiApps.map(a => ({
      name:        a.name,
      category:    a.category,
      enforcement: a.enforcement,
      status:      a.active ? 'Active' : 'Inactive',
      id:          a.id,
    }))

    return { rows, summary }
  },
})

// ── 12. Management Source Distribution ───────────────────────────────────────

registerReport({
  id:          'source-distribution',
  name:        'Management Source Distribution',
  category:    'inventory',
  description: 'Device count and compliance breakdown per connected management source.',
  sources:     ['intune', 'kandji', 'manageengine'],
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
