// Excel workbook attached to the weekly "Endpoint Fleet Health" Slack digest.
// The Slack message is the headline; this is the evidence behind each number:
//   Summary                — the five KPIs with week-over-week change, platform mix, top actions
//   Non-Compliant          — every non-compliant/warning device, worst severity first
//   Stale Devices          — devices silent for STALE_DAYS+, longest silent first
//   Critical Patches       — one row per device missing critical patches, oldest exposure first
//   Patch Detail           — one row per missing critical patch (KB, CVEs, age, reboot)

import type { Device } from '../types.js'
import type { MissingPatch, PatchSystemStatus } from './endpointCentralPatch.js'
import { isSupportedCriticalPatchClient } from './criticalPatchReport.js'
import { STALE_DAYS } from './staleDevicesReport.js'
import type { FleetSnapshot } from '../store/fleetSnapshotStore.js'

const DAY_MS = 86_400_000
const SEVERITY_RANK: Record<Device['severity'], number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }

export interface FleetReportData {
  devices: Device[]
  /** null when Patch Manager was unavailable. */
  patchSystems: PatchSystemStatus[] | null
  /** null when per-system patch detail could not be fetched. */
  patchesBySystem: Map<string, MissingPatch[]> | null
}

type Row = Record<string, string | number>

const daysBetween = (from: string | null | undefined, now: Date): number | null => {
  if (!from) return null
  const ts = Date.parse(from)
  return Number.isFinite(ts) ? Math.max(0, Math.floor((now.getTime() - ts) / DAY_MS)) : null
}
const systemName = (s: PatchSystemStatus) => s.names[0] ?? s.resourceId

export function buildNonCompliantRows(devices: Device[], now: Date): Row[] {
  return devices
    .filter(d => d.complianceState !== 'Compliant')
    .sort((a, b) => Number(b.complianceState === 'Non-Compliant') - Number(a.complianceState === 'Non-Compliant')
      || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.deviceName.localeCompare(b.deviceName))
    .map(d => ({
      deviceName: d.deviceName, user: d.user, platform: d.platform, source: d.managementSource, osVersion: d.osVersion,
      complianceState: d.complianceState, severity: d.severity, primaryIssue: d.primaryIssue, policyFailed: d.policyFailed,
      encryption: d.encryptionStatus, lastCheckIn: d.lastCheckIn, daysSinceCheckIn: daysBetween(d.lastCheckIn, now) ?? '', serialNumber: d.serialNumber,
    }))
}

export function buildStaleRows(devices: Device[], now: Date): Row[] {
  return devices
    .map(d => ({ d, days: daysBetween(d.lastCheckIn, now) }))
    .filter((r): r is { d: Device; days: number } => r.days !== null && r.days >= STALE_DAYS)
    .sort((a, b) => b.days - a.days)
    .map(({ d, days }) => ({
      deviceName: d.deviceName, user: d.user, platform: d.platform, source: d.managementSource, lastCheckIn: d.lastCheckIn,
      daysSilent: days, lastComplianceState: d.complianceState, serialNumber: d.serialNumber,
    }))
}

function criticalSystems(systems: PatchSystemStatus[]): PatchSystemStatus[] {
  return systems.filter(s => s.scanSucceeded && s.criticalPatchCount > 0 && isSupportedCriticalPatchClient(s))
}

/** One row per device; "exposure" is the age of the oldest critical patch still missing. */
export function buildPatchRollupRows(systems: PatchSystemStatus[], patchesBySystem: Map<string, MissingPatch[]> | null, now: Date): Row[] {
  return criticalSystems(systems).map(s => {
    const patches = patchesBySystem?.get(s.detailResourceId) ?? []
    const aged = patches.map(p => ({ p, days: daysBetween(p.releasedAt, now) })).filter((x): x is { p: MissingPatch; days: number } => x.days !== null)
    const oldest = aged.sort((a, b) => b.days - a.days)[0]
    return {
      deviceName: systemName(s), platform: s.platform, operatingSystem: s.osName ?? 'Not reported', criticalPatches: s.criticalPatchCount,
      oldestPatchAgeDays: oldest?.days ?? '', oldestPatch: oldest ? (oldest.p.description || oldest.p.name) : '',
      cveCount: new Set(patches.flatMap(p => p.cves)).size,
      rebootRequired: patches.some(p => /required|yes/i.test(p.rebootRequirement ?? '')) ? 'Yes' : patches.length ? 'No' : '',
      lastSuccessfulScan: s.lastSuccessfulScanTime ?? '',
    }
  }).sort((a, b) => (Number(b.oldestPatchAgeDays) || -1) - (Number(a.oldestPatchAgeDays) || -1)
    || Number(b.criticalPatches) - Number(a.criticalPatches) || String(a.deviceName).localeCompare(String(b.deviceName)))
}

export function buildPatchDetailRows(systems: PatchSystemStatus[], patchesBySystem: Map<string, MissingPatch[]> | null, now: Date): Row[] {
  return criticalSystems(systems).flatMap(s =>
    (patchesBySystem?.get(s.detailResourceId) ?? []).map(p => ({
      deviceName: systemName(s), platform: s.platform, patch: p.description || p.name, kb: p.kb ?? '', cves: p.cves.join(', '),
      vendor: p.vendor ?? '', releasedAt: p.releasedAt ? p.releasedAt.slice(0, 10) : '', ageDays: daysBetween(p.releasedAt, now) ?? '',
      rebootRequired: p.rebootRequirement ?? '', deploymentStatus: p.deploymentStatus ?? '',
    })))
    .sort((a, b) => (Number(b.ageDays) || -1) - (Number(a.ageDays) || -1))
}

interface Column { header: string; key: string; width: number }
const HEADER_FILL = 'FF0F172A'

export async function buildFleetDigestWorkbook(data: FleetReportData, current: FleetSnapshot, baseline: FleetSnapshot | null, actions: string[], now = new Date()): Promise<Buffer> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'ITO Endpoint'
  wb.created = now

  const addTable = (name: string, columns: Column[], rows: Row[], emptyNote: string) => {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] })
    ws.columns = columns
    ws.getRow(1).eachCell(c => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    })
    if (rows.length === 0) { ws.addRow({ [columns[0]!.key]: emptyNote }); return ws }
    rows.forEach(r => ws.addRow(r))
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }
    return ws
  }
  const shade = (ws: import('exceljs').Worksheet, key: string, rules: Array<[RegExp | ((v: number) => boolean), string]>) => {
    const col = ws.getColumn(key)
    col.eachCell((cell, rowNumber) => {
      if (rowNumber === 1) return
      const v = cell.value
      for (const [rule, argb] of rules) {
        const hit = typeof rule === 'function' ? typeof v === 'number' && rule(v) : typeof v === 'string' && rule.test(v)
        if (hit) { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }; break }
      }
    })
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const ws = wb.addWorksheet('Summary')
  ws.columns = [{ width: 36 }, { width: 16 }, { width: 18 }, { width: 14 }, { width: 14 }]
  ws.mergeCells('A1:E1')
  ws.getCell('A1').value = `Endpoint Fleet Health · ${current.date}`
  ws.getCell('A1').font = { bold: true, size: 16 }
  ws.mergeCells('A2:E2')
  ws.getCell('A2').value = baseline ? `Compared with the ${baseline.date} snapshot` : 'First report: no earlier snapshot to compare against yet'
  ws.getCell('A2').font = { size: 10, color: { argb: 'FF64748B' } }

  const rate = (s: FleetSnapshot) => (s.total > 0 ? Math.round((s.compliant / s.total) * 1000) / 10 : 0)
  const kpis: Array<{ label: string; cur: number | null; prev: number | null | undefined; lowerIsBetter: boolean; fmt: string }> = [
    { label: 'Managed devices', cur: current.total, prev: baseline?.total, lowerIsBetter: false, fmt: '#,##0' },
    { label: 'Compliance rate', cur: rate(current), prev: baseline ? rate(baseline) : null, lowerIsBetter: false, fmt: '0.0"%"' },
    { label: 'Non-compliant', cur: current.nonCompliant, prev: baseline?.nonCompliant, lowerIsBetter: true, fmt: '#,##0' },
    { label: `Stale (${STALE_DAYS}+ days)`, cur: current.stale, prev: baseline?.stale, lowerIsBetter: true, fmt: '#,##0' },
    { label: 'Devices missing critical patches', cur: current.criticalPatchDevices, prev: baseline?.criticalPatchDevices, lowerIsBetter: true, fmt: '#,##0' },
  ]
  const header = ws.getRow(4)
  header.values = ['Metric', 'Current', baseline ? `Previous (${baseline.date})` : 'Previous', 'Change', 'Trend']
  header.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } } })
  kpis.forEach((k, i) => {
    const row = ws.getRow(5 + i)
    const hasPrev = k.prev !== null && k.prev !== undefined && k.cur !== null
    const diff = hasPrev ? Math.round((k.cur! - k.prev!) * 10) / 10 : null
    const trend = diff === null ? '—' : diff === 0 ? 'No change' : (k.lowerIsBetter ? diff < 0 : diff > 0) ? 'Improved' : 'Worse'
    row.values = [k.label, k.cur ?? 'Unavailable', hasPrev ? k.prev! : '—', diff ?? '—', trend]
    for (const col of [2, 3, 4]) if (typeof row.getCell(col).value === 'number') row.getCell(col).numFmt = k.fmt
    row.getCell(1).font = { bold: true }
    const argb = trend === 'Improved' ? 'FFDCFCE7' : trend === 'Worse' ? 'FFFEE2E2' : null
    if (argb) row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
  })

  let r = 5 + kpis.length + 1
  ws.getCell(`A${r}`).value = 'Devices by platform'
  ws.getCell(`A${r}`).font = { bold: true, size: 12 }
  r++
  for (const [platform, count] of Object.entries(current.byPlatform).sort((a, b) => b[1] - a[1])) {
    ws.getCell(`A${r}`).value = platform
    ws.getCell(`B${r}`).value = count
    ws.getCell(`C${r}`).value = current.total ? count / current.total : 0
    ws.getCell(`C${r}`).numFmt = '0.0%'
    r++
  }
  r++
  ws.getCell(`A${r}`).value = 'Top actions'
  ws.getCell(`A${r}`).font = { bold: true, size: 12 }
  r++
  if (!actions.length) ws.getCell(`A${r}`).value = 'No action needed.'
  actions.forEach((a, i) => { ws.getCell(`A${r + i}`).value = `${i + 1}. ${a}` })
  r += Math.max(actions.length, 1) + 1
  if (current.criticalPatchDevices === null) {
    ws.getCell(`A${r}`).value = 'Note: Patch Manager was unavailable; the critical patch sheets are empty.'
    ws.getCell(`A${r}`).font = { italic: true, color: { argb: 'FFB45309' } }
  }

  // ── Detail sheets ──────────────────────────────────────────────────────────
  const nonCompliant = addTable('Non-Compliant', [
    { header: 'Device', key: 'deviceName', width: 26 }, { header: 'User', key: 'user', width: 28 }, { header: 'Platform', key: 'platform', width: 11 },
    { header: 'Source', key: 'source', width: 17 }, { header: 'OS Version', key: 'osVersion', width: 16 }, { header: 'Compliance', key: 'complianceState', width: 14 },
    { header: 'Severity', key: 'severity', width: 10 }, { header: 'Primary Issue', key: 'primaryIssue', width: 36 }, { header: 'Policy Failed', key: 'policyFailed', width: 30 },
    { header: 'Encryption', key: 'encryption', width: 14 }, { header: 'Last Check-in', key: 'lastCheckIn', width: 22 }, { header: 'Days Since Check-in', key: 'daysSinceCheckIn', width: 12 },
    { header: 'Serial Number', key: 'serialNumber', width: 20 },
  ], buildNonCompliantRows(data.devices, now), 'No non-compliant devices.')
  shade(nonCompliant, 'severity', [[/^critical$/i, 'FFFECACA'], [/^high$/i, 'FFFED7AA'], [/^medium$/i, 'FFFEF08A']])

  const stale = addTable('Stale Devices', [
    { header: 'Device', key: 'deviceName', width: 26 }, { header: 'User', key: 'user', width: 28 }, { header: 'Platform', key: 'platform', width: 11 },
    { header: 'Source', key: 'source', width: 17 }, { header: 'Last Check-in', key: 'lastCheckIn', width: 22 }, { header: 'Days Silent', key: 'daysSilent', width: 12 },
    { header: 'Last Compliance State', key: 'lastComplianceState', width: 20 }, { header: 'Serial Number', key: 'serialNumber', width: 20 },
  ], buildStaleRows(data.devices, now), `No devices silent for ${STALE_DAYS}+ days.`)
  shade(stale, 'daysSilent', [[v => v >= 90, 'FFFECACA'], [v => v >= 60, 'FFFED7AA']])

  const systems = data.patchSystems ?? []
  const rollup = addTable('Critical Patches', [
    { header: 'Device', key: 'deviceName', width: 26 }, { header: 'Platform', key: 'platform', width: 10 }, { header: 'Operating System', key: 'operatingSystem', width: 34 },
    { header: 'Critical Patches Missing', key: 'criticalPatches', width: 14 }, { header: 'Oldest Patch Age (days)', key: 'oldestPatchAgeDays', width: 14 },
    { header: 'Oldest Missing Patch', key: 'oldestPatch', width: 48 }, { header: 'Distinct CVEs', key: 'cveCount', width: 10 },
    { header: 'Reboot Required', key: 'rebootRequired', width: 12 }, { header: 'Last Successful Scan', key: 'lastSuccessfulScan', width: 22 },
  ], buildPatchRollupRows(systems, data.patchesBySystem, now),
  data.patchSystems ? 'No devices with missing critical patches.' : 'Patch Manager was unavailable for this run.')
  shade(rollup, 'oldestPatchAgeDays', [[v => v >= 60, 'FFFECACA'], [v => v >= 30, 'FFFED7AA']])

  addTable('Patch Detail', [
    { header: 'Device', key: 'deviceName', width: 26 }, { header: 'Platform', key: 'platform', width: 10 }, { header: 'Missing Patch', key: 'patch', width: 52 },
    { header: 'KB', key: 'kb', width: 14 }, { header: 'CVEs', key: 'cves', width: 34 }, { header: 'Vendor', key: 'vendor', width: 18 },
    { header: 'Released', key: 'releasedAt', width: 12 }, { header: 'Age (days)', key: 'ageDays', width: 10 },
    { header: 'Reboot Required', key: 'rebootRequired', width: 16 }, { header: 'Deployment Status', key: 'deploymentStatus', width: 18 },
  ], buildPatchDetailRows(systems, data.patchesBySystem, now),
  data.patchesBySystem ? 'No missing critical patch detail.' : 'Per-patch detail was unavailable for this run.')

  return Buffer.from(await wb.xlsx.writeBuffer())
}
