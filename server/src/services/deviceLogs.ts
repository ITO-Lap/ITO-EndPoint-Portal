// Per-device activity log for Managed Devices (Windows and macOS, Intune and ManageEngine).
// Read-only: it assembles what the connected sources already know about one device into a single timeline that can be
// exported. Every section is fetched independently, so one failing source never hides the rest.

import type { Device } from '../types.js'
import { exportToExcel, type ReportColumn } from './reportExporter.js'
import { getIntuneDeviceActivity, getIntuneDeviceApps, getIntuneDevicePolicies, isIntuneConfigured } from './intune.js'
import { getManageEngineDeviceApps, getManageEngineDevicePolicies, getManageEngineDeviceProfileResults, isManageEngineConfigured } from './manageEngine.js'

export type LogCategory = 'Device' | 'Compliance' | 'Policy' | 'Profile' | 'Action' | 'Remote action' | 'App'
export interface DeviceLogEntry { time: string; category: LogCategory; event: string; status: string; detail: string; source: string }
export interface LogSection { name: string; ok: boolean; count: number; error?: string }
export interface DeviceLog {
  device: { id: string; name: string; platform: string; source: string; user: string; serialNumber: string; osVersion: string }
  generatedAt: string
  entries: DeviceLogEntry[]
  sections: LogSection[]
}

const COLUMNS: ReportColumn[] = [
  { key: 'time', label: 'Time (UTC)', width: 24 }, { key: 'category', label: 'Category', width: 16 }, { key: 'event', label: 'Event', width: 44 },
  { key: 'status', label: 'Status', width: 18 }, { key: 'detail', label: 'Details', width: 70 }, { key: 'source', label: 'Source', width: 18 },
]

/** ISO string from an ISO date, epoch seconds/milliseconds, or '' when unusable. */
export function toIso(value: unknown): string {
  if (value === null || value === undefined || value === '' || value === '—') return ''
  const n = typeof value === 'number' ? value : /^\d+$/.test(String(value)) ? Number(value) : NaN
  const ms = Number.isFinite(n) ? (n < 1e11 ? n * 1000 : n) : Date.parse(String(value))
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : ''
}

/** Splits the "Policy name — State" encoding used for Intune policy rows. */
export function parsePolicy(line: string): { name: string; state: string } {
  const i = line.lastIndexOf(' — ')
  return i === -1 ? { name: line, state: '' } : { name: line.slice(0, i), state: line.slice(i + 3) }
}

export function deviceFactEntries(d: Device): DeviceLogEntry[] {
  const source = d.managementSource
  const out: DeviceLogEntry[] = []
  const add = (time: unknown, event: string, status: string, detail: string, category: LogCategory = 'Device') => out.push({ time: toIso(time), category, event, status, detail, source })
  if (d.enrollmentDate) add(d.enrollmentDate, 'Enrolled', '', `${d.enrollmentType ?? 'Enrollment'}${d.ownership ? ` · ${d.ownership}` : ''}`)
  add(d.lastCheckIn, 'Last check-in', '', `OS ${d.osVersion}${d.osBuildNumber ? ` (build ${d.osBuildNumber})` : ''}`)
  add(d.lastCheckIn, 'Compliance state', d.complianceState, d.complianceState === 'Compliant' ? 'No issues reported.' : `${d.primaryIssue}${d.policyFailed ? ` · policy: ${d.policyFailed}` : ''}`, 'Compliance')
  if (d.complianceState !== 'Compliant' && d.primaryIssue) {
    add(d.firstDetected, 'Issue first detected', d.severity, d.primaryIssue, 'Compliance')
    if (d.lastDetected && d.lastDetected !== d.firstDetected) add(d.lastDetected, 'Issue last detected', d.severity, d.primaryIssue, 'Compliance')
  }
  add('', 'Disk encryption', d.encryptionStatus, '')
  if (d.passcodeStatus) add('', 'Passcode', d.passcodeStatus, '')
  return out
}

export function sortEntries(entries: DeviceLogEntry[]): DeviceLogEntry[] {
  return [...entries].sort((a, b) => (b.time || '').localeCompare(a.time || '') || a.category.localeCompare(b.category) || a.event.localeCompare(b.event))
}

const guard = async <T>(name: string, sections: LogSection[], fn: () => Promise<T[]>, toEntries: (rows: T[]) => DeviceLogEntry[], into: DeviceLogEntry[]): Promise<void> => {
  try {
    const entries = toEntries(await fn())
    into.push(...entries)
    sections.push({ name, ok: true, count: entries.length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Request failed'
    // Graph/Zoho throttling comes back as a long JSON blob; say what it means instead.
    const error = /\b429\b|TooManyRequests|too many requests/i.test(msg) ? 'The source is throttling requests (HTTP 429). Use "Pull again" in a minute.' : msg.slice(0, 240)
    sections.push({ name, ok: false, count: 0, error })
  }
}

export async function collectDeviceLog(device: Device): Promise<DeviceLog> {
  const source = device.managementSource
  const entries = deviceFactEntries(device)
  const sections: LogSection[] = [{ name: 'Device record', ok: true, count: entries.length }]

  if (source === 'Microsoft Intune' && isIntuneConfigured()) {
    await guard('Intune action history', sections, () => getIntuneDeviceActivity(device.id, device.deviceName), rows => rows.map(r => ({ ...r, source })), entries)
    await guard('Intune policy states', sections, () => getIntuneDevicePolicies(device.id), rows => rows.map(r => { const p = parsePolicy(r); return { time: '', category: 'Policy' as const, event: p.name, status: p.state, detail: '', source } }), entries)
    await guard('Intune detected apps', sections, () => getIntuneDeviceApps(device.id), rows => rows.map(a => ({ time: '', category: 'App' as const, event: a.name, status: a.status, detail: [a.version, a.publisher].filter(Boolean).join(' · '), source })), entries)
  } else if (source === 'ManageEngine' && isManageEngineConfigured()) {
    await guard('ManageEngine profile results', sections, async () => (await getManageEngineDeviceProfileResults(device.id)).profiles,
      rows => rows.map(p => ({ time: toIso(p.appliedTime), category: 'Profile' as const, event: p.profileName, status: p.status ?? '', detail: p.localizedRemarks ?? p.remarks ?? '', source })), entries)
    await guard('ManageEngine policies', sections, () => getManageEngineDevicePolicies(device.id),
      rows => rows.filter(r => !entries.some(e => e.category === 'Profile' && e.event === parsePolicy(r).name)).map(r => ({ time: '', category: 'Policy' as const, event: parsePolicy(r).name, status: parsePolicy(r).state, detail: '', source })), entries)
    await guard('ManageEngine installed apps', sections, () => getManageEngineDeviceApps(device.id), rows => rows.map(a => ({ time: '', category: 'App' as const, event: a.name, status: a.status, detail: [a.version, a.publisher].filter(Boolean).join(' · '), source })), entries)
  } else {
    sections.push({ name: `${source} details`, ok: false, count: 0, error: `${source} is not configured, so only the device record is shown.` })
  }

  return {
    device: { id: device.id, name: device.deviceName, platform: device.platform, source, user: device.user, serialNumber: device.serialNumber, osVersion: device.osVersion },
    generatedAt: new Date().toISOString(), entries: sortEntries(entries), sections,
  }
}

/** Spreadsheet apps run text starting with = + - @ as a formula; neutralise it (device and app names are user-controlled). */
export const safeCell = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v)
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
}

export function logToCsv(log: DeviceLog): string {
  const esc = (v: unknown) => `"${safeCell(v).replace(/"/g, '""')}"`
  const head = COLUMNS.map(c => esc(c.label)).join(',')
  return [head, ...log.entries.map(e => COLUMNS.map(c => esc((e as unknown as Record<string, unknown>)[c.key])).join(','))].join('\r\n')
}

export async function logToExcel(log: DeviceLog, generatedBy: string): Promise<Buffer> {
  const rows = log.entries.map(e => ({ ...e, time: e.time ? e.time.replace('T', ' ').slice(0, 19) : '', event: safeCell(e.event), detail: safeCell(e.detail) }))
  return exportToExcel(rows, COLUMNS, {
    title: 'Device log', subtitle: `${log.device.name} · ${log.device.platform} · ${log.device.source} · ${log.device.user || 'no user'} · ${log.device.serialNumber || 'no serial'}`,
    generatedAt: log.generatedAt, generatedBy, recordCount: rows.length,
  })
}

export const logFilename = (log: DeviceLog, ext: 'csv' | 'xlsx'): string =>
  `device-log-${log.device.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 60) || 'device'}-${log.generatedAt.slice(0, 10)}.${ext}`
