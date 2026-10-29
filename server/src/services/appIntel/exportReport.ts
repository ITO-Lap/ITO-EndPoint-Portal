// CSV / Excel export for the verified application inventory. It runs on the same filtered list the
// inventory screen shows (filterApps), so the file and the screen cannot disagree. Read-only.
//
//  - inventory mode: one row per application ("Number of Devices" = unique devices reporting the app).
//  - device mode (one app): one row per device with the user the source reports for it.
// A missing latest version or user is written as "Unavailable" / "Not reported", never as compliant.

import { compareVersions } from './version.js'
import type { AssessedApp, ProviderId } from './types.js'

export type ExportFormat = 'csv' | 'xlsx'
export interface ExportDevice { name: string; user: string | null; version: string; provider: ProviderId }
export interface ExportMeta {
  generatedAt: string
  /** Human-readable filters that were applied, e.g. ["Platform: windows", "Status: Package required"]. */
  filters: string[]
  syncedAt: string | null
  providerAsOf: Record<string, string | null>
  syncNote?: string | null
}
interface Column { key: string; label: string; width: number }

const PROVIDER_LABEL: Record<ProviderId, string> = { intune: 'Microsoft Intune', 'manageengine-mdm': 'ManageEngine MDM', 'endpoint-central': 'Endpoint Central' }

/** Neutralises spreadsheet formulas: a cell starting with = + - @ (or tab/CR) is prefixed with an apostrophe. */
export function sanitizeCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
}

export function toCsv(rows: Record<string, unknown>[], columns: Column[]): string {
  const q = (v: unknown) => `"${sanitizeCell(v).replace(/"/g, '""')}"`
  return '﻿' + [columns.map(c => q(c.label)).join(','), ...rows.map(r => columns.map(c => q(r[c.key])).join(','))].join('\r\n')
}

const INVENTORY_COLUMNS: Column[] = [
  { key: 'app', label: 'Application Name', width: 34 }, { key: 'publisher', label: 'Publisher', width: 24 },
  { key: 'platform', label: 'Platform', width: 10 }, { key: 'installed', label: 'Installed Application Version (devices)', width: 40 },
  { key: 'latest', label: 'Available Application Version', width: 22 }, { key: 'latestSource', label: 'Version Source', width: 34 },
  { key: 'sourceUrl', label: 'Package / Source Link', width: 40 }, { key: 'devices', label: 'Number of Devices', width: 12 },
  { key: 'behind', label: 'Devices Behind Latest', width: 14 }, { key: 'status', label: 'Compliance Status', width: 30 },
  { key: 'sources', label: 'Data Sources', width: 26 }, { key: 'lastChecked', label: 'Last Checked', width: 22 },
]
const DEVICE_COLUMNS: Column[] = [
  { key: 'device', label: 'Device Name', width: 30 }, { key: 'user', label: 'Username / Email ID', width: 32 },
  { key: 'app', label: 'Application Name', width: 30 }, { key: 'installed', label: 'Installed Version', width: 18 },
  { key: 'latest', label: 'Available Application Version', width: 22 }, { key: 'status', label: 'Update Status', width: 28 },
  { key: 'source', label: 'Management Source', width: 22 },
]

const httpsOnly = (url: string | null | undefined): string => {
  try { return url && new URL(url).protocol === 'https:' ? url : 'Unavailable' } catch { return 'Unavailable' }
}

export function inventoryRows(apps: AssessedApp[]): Record<string, unknown>[] {
  return apps.map(a => ({
    app: a.identity.displayName, publisher: a.identity.publisher ?? '', platform: a.platform,
    installed: [...a.installed].sort((x, y) => y.deviceCount - x.deviceCount).map(i => `${i.version} (${i.deviceCount} device${i.deviceCount === 1 ? '' : 's'})`).join('; ') || 'Unavailable',
    latest: a.latest?.version ?? 'Unavailable', latestSource: a.latest?.versionSource ?? '', sourceUrl: httpsOnly(a.latest?.sourceUrl),
    devices: a.totalDevices, behind: a.latest ? a.affectedDevices : 'Unknown', status: a.status,
    sources: a.providers.map(p => PROVIDER_LABEL[p]).join(', '), lastChecked: a.lastCheckedAt ?? 'Never',
  }))
}

export function deviceStatus(installed: string, latest: string | null | undefined): string {
  if (!latest) return 'Unknown — no verified latest version'
  const cmp = compareVersions(installed, latest)
  return cmp === null ? 'Unknown — version cannot be compared' : cmp < 0 ? 'Update required' : 'Up to date'
}

export function deviceRows(app: AssessedApp, devices: ExportDevice[]): Record<string, unknown>[] {
  return devices.map(d => ({
    device: d.name, user: d.user ?? 'Not reported', app: app.identity.displayName, installed: d.version,
    latest: app.latest?.version ?? 'Unavailable', status: deviceStatus(d.version, app.latest?.version), source: PROVIDER_LABEL[d.provider],
  }))
}

export async function buildAppExport(
  mode: { kind: 'inventory'; apps: AssessedApp[] } | { kind: 'devices'; app: AssessedApp; devices: ExportDevice[] },
  format: ExportFormat, meta: ExportMeta,
): Promise<{ content: Buffer; contentType: string; filename: string; rowCount: number }> {
  const inv = mode.kind === 'inventory'
  const columns = inv ? INVENTORY_COLUMNS : DEVICE_COLUMNS
  const rows = inv ? inventoryRows(mode.apps) : deviceRows(mode.app, mode.devices)
  const stamp = meta.generatedAt.slice(0, 10)
  const base = inv ? `application-inventory-${stamp}` : `application-devices-${mode.app.identity.displayName.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 40)}-${stamp}`

  if (format === 'csv') return { content: Buffer.from(toCsv(rows, columns), 'utf-8'), contentType: 'text/csv; charset=utf-8', filename: `${base}.csv`, rowCount: rows.length }

  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'ITO Endpoint'; wb.created = new Date(meta.generatedAt)
  const ws = wb.addWorksheet(inv ? 'Applications' : 'Devices')
  ws.columns = columns.map(c => ({ header: c.label, key: c.key, width: c.width }))
  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  rows.forEach(r => ws.addRow(Object.fromEntries(columns.map(c => [c.key, typeof r[c.key] === 'number' ? r[c.key] : sanitizeCell(r[c.key])]))))
  const info = wb.addWorksheet('Report info')
  info.columns = [{ width: 28 }, { width: 90 }]
  const lines: [string, string][] = [
    ['Report', inv ? 'Application inventory (verified updates)' : `Devices for ${mode.app.identity.displayName}`],
    ['Generated at (UTC)', meta.generatedAt], ['Filters applied', meta.filters.join('; ') || 'None'], ['Rows', String(rows.length)],
    ['Last inventory sync', meta.syncedAt ?? 'Never'],
    ...Object.entries(meta.providerAsOf).map(([p, at]): [string, string] => [`Source read: ${p}`, at ?? 'Not read']),
    ['Counts', 'Number of Devices = unique devices reporting the application in the source inventory; it is not a count of installations or users.'],
    ['Users', inv ? 'Per-device users are included in the device-level export of a single application (the source does not list users per application).' : 'Username is the user the source reports for the device; "Not reported" means the source gave none.'],
    ['Status meaning', 'Missing latest version or an unparseable version is shown as Unknown. It is never treated as up to date.'],
    ...(meta.syncNote ? [['Note', meta.syncNote] as [string, string]] : []),
  ]
  lines.forEach(([k, v]) => { const row = info.addRow([sanitizeCell(k), sanitizeCell(v)]); row.getCell(1).font = { bold: true } })
  const content = Buffer.from(await wb.xlsx.writeBuffer())
  return { content, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: `${base}.xlsx`, rowCount: rows.length }
}
