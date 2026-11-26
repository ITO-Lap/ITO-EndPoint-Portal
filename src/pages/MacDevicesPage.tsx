import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  Apple, ArrowLeft, RefreshCw, Shield, Lock, ShieldCheck, ShieldAlert,
  AlertTriangle, CheckCircle, XCircle, Search, X,
  Info,
  BarChart2,
  Clock, Download, FileText, Filter,
} from 'lucide-react'
import { api } from '../api'
import type { ApiDevice, ManageEngineFleetProfileResult, MacSecurityAppDevice, MacSecurityAppInventory } from '../api'
import { DeviceDetailPanel } from '../components/devices/DeviceDetailPanel'
import { useColumnResize } from '../hooks/useColumnResize'
import { useOptionalPermissions } from '../context/permissionsHooks'
import { usePagination } from '../hooks/usePagination'
import { Pagination } from '../components/ui/Pagination'
import { SortableHeader } from '../components/ui/SortableHeader'
import { sortRows, toggleSortDirection, type SortDirection } from '../lib/tableSorting'
import { MacFleetReportsPage }       from './MacFleetReportsPage'
import { downloadTableExcel } from '../lib/kpiExport'
import { CopyText } from '../components/ui/CopyText'

const PAGE_SIZE  = 50

// ─── Column definitions ────────────────────────────────────────────────────────

const DEVICE_COLS = [
  { key: 'device',     label: 'Device',             min: 120, default: 200 },
  { key: 'user',       label: 'User',               min:  80, default: 140 },
  { key: 'model',      label: 'Model',              min:  80, default: 140 },
  { key: 'macos',      label: 'macOS',              min:  80, default: 100 },
  { key: 'actions',    label: 'Actions',             min:  80, default:  90, noResize: true },
  { key: 'checkin',    label: 'Last Check-in',      min: 100, default: 140 },
  { key: 'filevault',  label: 'FileVault',          min:  80, default: 100 },
  { key: 'compliance', label: 'MDM Status / Profiles', min: 120, default: 190 },
  { key: 'logs',       label: 'Logs',               min:  70, default:  90, noResize: true },
] as const
type DColKey = typeof DEVICE_COLS[number]['key']

const SECURITY_COLS = [
  { key: 'device',   label: 'Device',           min: 120, default: 180 },
  { key: 'user',     label: 'User',             min:  80, default: 130 },
  { key: 'fv',       label: 'FileVault',        min:  70, default:  90 },
  { key: 'zscaler',  label: 'Zscaler',          min:  90, default: 120 },
  { key: 'crowdstrike', label: 'CrowdStrike',   min:  90, default: 120 },
  { key: 'fw',       label: 'Firewall',         min:  70, default:  90 },
  { key: 'policies', label: 'Applied Policies', min: 100, default: 160 },
  { key: 'checkin',  label: 'Last Check-in',    min: 100, default: 140 },
  { key: 'risk',     label: 'Risk',             min:  60, default:  80 },
  { key: 'actions',  label: 'Actions',           min:  80, default:  90, noResize: true },
] as const
type SColKey = typeof SECURITY_COLS[number]['key']
const MAC_SECURITY_COLS = SECURITY_COLS.filter(col => col.key !== 'fw')


// ─── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'devices' | 'security' | 'reports'

interface Props {
  onBack: () => void
  onViewDevice?: (deviceName: string) => void
  /** Rendered inside ManagedDevicesPage — hides this page's own back/title header. */
  embedded?: boolean
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function extractModelBase(model?: string): string {
  if (!model) return 'Mac'
  const m = model.match(/^(MacBook Pro|MacBook Air|Mac mini|Mac Pro|Mac Studio|iMac|MacBook)/i)
  return m?.[1] ?? model.split('(')[0].trim()
}

// Full version as reported (e.g. 26.7.1) so patch releases and any future version show up as their own entry.
function extractOsVersion(osVersion?: string): string {
  return osVersion?.trim() || 'Unknown'
}

function compareOsVersionsDesc(a: string, b: string): number {
  const pa = a.match(/\d+/g)?.map(Number) ?? [], pb = b.match(/\d+/g)?.map(Number) ?? []
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0)
    if (d !== 0) return d
  }
  return a.localeCompare(b)
}

function filevaultState(d: ApiDevice): 'On' | 'Off' | 'Pending' | 'Unknown' {
  const status = d.encryptionStatus?.trim().toLowerCase() ?? ''
  if (!hasReportedStatus(status)) return 'Unknown'
  if (/\bpending\b/.test(status)) return 'Pending'
  if (/\b(not encrypted|off|disabled|false)\b/.test(status)) return 'Off'
  if (/\b(encrypted|enabled|on|true|yes)\b/.test(status)) return 'On'
  return 'Unknown'
}

function filevaultOn(d: ApiDevice): boolean {
  return filevaultState(d) === 'On'
}

function filevaultOff(d: ApiDevice): boolean {
  return filevaultState(d) === 'Off'
}

function hasReportedStatus(status?: string): boolean {
  return !!status?.trim() && !/^(—|unknown|not reported|not applicable|n\/a|none)$/i.test(status.trim())
}

function profileResultsLabel(result: ManageEngineFleetProfileResult | undefined, loading: boolean, fetchFailed = false): { text: string; title: string } {
  if (!result) return fetchFailed
    ? { text: 'Unavailable', title: 'The fleet profile-status request failed. Refresh to retry.' }
    : { text: loading ? 'Loading…' : 'Not loaded', title: 'ManageEngine profile status has not been loaded.' }
  if (result.unavailable || !result.snapshot) return { text: 'Unavailable', title: 'Endpoint Central profile results could not be retrieved for this device.' }
  const { profiles, stale, lastSuccessfulSyncAt } = result.snapshot
  if (!profiles.length) return { text: 'No profiles', title: 'The Endpoint Central API returned no associated profiles for this device.' }
  const detail = profiles.map(profile => [
    profile.profileName,
    profile.status ?? 'Status not reported',
    profile.remarks ?? profile.localizedRemarks,
  ].filter(Boolean).join(' — ')).join('\n')
  const syncNote = `${stale ? 'Last successful sync (stale)' : 'Last synced'}: ${new Date(lastSuccessfulSyncAt).toLocaleString()}`
  return {
    text: `${profiles[0]!.status ?? 'Status not reported'}${profiles.length > 1 ? ` +${profiles.length - 1}` : ''}`,
    title: `${detail}\n${syncNote}`,
  }
}

type DeviceMetricDetail = 'filevault' | 'compliance'

function metricBar(label: string, value: number, assessed: number, total: number, color: string, icon: React.ReactNode, onClick: () => void) {
  const pct = assessed > 0 ? Math.round((value / assessed) * 100) : null
  const barColor =
    color === 'emerald' ? 'bg-emerald-500' :
    color === 'orange'  ? 'bg-indigo-500'  :
    color === 'amber'   ? 'bg-amber-500'   :
    color === 'red'     ? 'bg-red-500'     : 'bg-slate-400'
  const textColor =
    color === 'emerald' ? 'text-emerald-600' :
    color === 'orange'  ? 'text-indigo-600'  :
    color === 'amber'   ? 'text-amber-600'   :
    color === 'red'     ? 'text-red-600'     : 'text-slate-600'
  const borderColor =
    color === 'emerald' ? 'border-emerald-200' :
    color === 'orange'  ? 'border-indigo-200'  :
    color === 'amber'   ? 'border-amber-200'   :
    color === 'red'     ? 'border-red-200'     : 'border-slate-200'
  return (
    <button type="button" onClick={onClick} aria-label={`View device details for ${label}`} className={`bg-white rounded-2xl border ${borderColor} shadow-sm px-4 py-4 flex flex-col gap-3 text-left transition hover:shadow-md hover:border-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-semibold text-slate-700">{label}</span>
        </div>
        <span className={`text-lg font-black ${pct === null ? 'text-slate-400' : textColor}`}>{pct === null ? 'N/A' : `${pct}%`}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-2 rounded-full ${barColor} transition-all duration-700`} style={{ width: `${pct ?? 0}%` }} />
      </div>
      <p className="text-[0.65rem] text-slate-400">
        {assessed === 0 ? 'No status reported by device-management API' : <><span className={`font-semibold ${textColor}`}>{value.toLocaleString()}</span> of {assessed.toLocaleString()} reported</>}
        {assessed !== total && <span> · {total.toLocaleString()} total</span>}
      </p>
    </button>
  )
}
// ─── Report engine helpers ────────────────────────────────────────────────────

type ReportType = 'macos_versions' | 'stale_devices' | 'fleet_kpi_cards'

interface ReportDef {
  id: ReportType
  label: string
  description: string
  icon: React.ReactNode
  accent: string
  group: 'analytical' | 'full'
}

const REPORT_DEFS: ReportDef[] = [
  { id: 'macos_versions',     label: 'macOS Updates',      description: 'Version distribution & upgrade eligibility',   icon: <Apple         className="h-4 w-4" />, accent: 'orange',  group: 'analytical' },
  { id: 'stale_devices',      label: 'Stale Devices',      description: 'Devices that haven\'t checked in recently',    icon: <Clock         className="h-4 w-4" />, accent: 'amber',   group: 'analytical' },
  { id: 'fleet_kpi_cards',    label: 'Fleet KPI Cards',    description: 'Fleet health KPI dashboard',                   icon: <BarChart2     className="h-4 w-4" />, accent: 'orange',  group: 'full' },
]

// Oldest major still treated as current; any newer major (27, 28, …) is automatically 'latest'.
const CURRENT_MACOS_MAJOR = 26
type MacOSCategory = 'latest' | 'outdated' | 'eol'
function macOSCategory(version: string): MacOSCategory {
  const major = parseInt(version.split('.')[0] ?? '0')
  if (major >= CURRENT_MACOS_MAJOR) return 'latest'
  if (major >= 14) return 'outdated'
  return 'eol'
}

const MACOS_CAT_META: Record<MacOSCategory, { label: string; color: string; action: string }> = {
  latest:  { label: `Latest (macOS ${CURRENT_MACOS_MAJOR}+)`, color: 'emerald', action: 'No action needed'       },
  outdated: { label: 'Outdated',       color: 'amber',   action: 'Upgrade recommended'    },
  eol:     { label: 'End of Life',     color: 'red',     action: 'Urgent upgrade required' },
}

function stalenessDays(lastCheckIn: string): number {
  const s = lastCheckIn.toLowerCase()
  if (!s || s.includes('just') || s.includes('min') || s.includes('hour') || s.includes('today') || s.includes('added')) return 0
  if (s.includes('yesterday') || s === '1 day ago') return 1
  const dayM = s.match(/(\d+)\s*day/);   if (dayM)  return parseInt(dayM[1])
  const weekM = s.match(/(\d+)\s*week/); if (weekM) return parseInt(weekM[1]) * 7
  if (s.includes('week'))  return 7
  const monM = s.match(/(\d+)\s*month/); if (monM)  return parseInt(monM[1]) * 30
  if (s.includes('month')) return 30
  // Absolute date string (e.g. "May 8, 2026 09:15 AM")
  const parsed = new Date(lastCheckIn)
  if (!isNaN(parsed.getTime())) {
    return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86400000))
  }
  return 0
}

function checkInDot(lastCheckIn: string): string {
  const d = stalenessDays(lastCheckIn)
  if (d === 0) return 'bg-emerald-500'
  if (d <= 2)  return 'bg-lime-500'
  if (d <= 6)  return 'bg-amber-400'
  return 'bg-red-500'
}

function downloadCsv(filename: string, headers: string[], rows: (string | number)[]) {
  const csv = [
    headers.join(','),
    ...(rows as unknown as (string | number)[][]).map(r =>
      r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    ),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Devices Tab ───────────────────────────────────────────────────────────────

function Chips({ label, items, active, onToggle }: {
  label: string; items: { key: string; count: number }[]; active: string | null; onToggle: (k: string) => void
}) {
  if (!items.length) return null
  return (
    <div>
      <p className="text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide mb-2">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map(({ key, count }) => {
          const isA = active === key
          return (
            <button key={key} type="button" onClick={() => onToggle(key)}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${isA ? 'is-selected' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
              {key}
              <span className={`rounded-full px-1 text-[0.58rem] font-bold ${isA ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
            </button>
          )
        })}
        {active && <button type="button" onClick={() => onToggle(active)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-400 hover:bg-slate-50 transition">Clear ×</button>}
      </div>
    </div>
  )
}

function DevicesTab({
  devices,
  loading,
  profileResults,
  profileResultsLoading,
  profileResultsError,
  onSelectDevice,
  onViewLogs,
}: {
  devices: ApiDevice[]
  loading: boolean
  profileResults: Record<string, ManageEngineFleetProfileResult>
  profileResultsLoading: boolean
  profileResultsError: boolean
  onSelectDevice: (d: ApiDevice) => void
  onViewLogs: (d: ApiDevice) => void
}) {
  const canLogs = useOptionalPermissions()?.['devices.logs'] === true
  const { widths: dw, startResize: dResize, totalWidth: dTotal } = useColumnResize<DColKey>(DEVICE_COLS, 'mac-devices')
  const [search, setSearch] = useState('')
  const [activeModel, setActiveModel] = useState<string | null>(null)
  const [activeOS, setActiveOS] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const modelBreakdown = useMemo(() => {
    const map: Record<string, number> = {}
    devices.forEach(d => { const k = extractModelBase(d.model); map[k] = (map[k] ?? 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }))
  }, [devices])

  const osBreakdown = useMemo(() => {
    const map: Record<string, number> = {}
    devices.forEach(d => { const k = extractOsVersion(d.osVersion); map[k] = (map[k] ?? 0) + 1 })
    return Object.entries(map).sort((a, b) => compareOsVersionsDesc(a[0], b[0])).map(([key, count]) => ({ key, count }))
  }, [devices])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return devices.filter(d => {
      if (activeModel && extractModelBase(d.model) !== activeModel) return false
      if (activeOS && extractOsVersion(d.osVersion) !== activeOS) return false
      if (q && !d.deviceName.toLowerCase().includes(q) && !d.user.toLowerCase().includes(q) && !(d.osVersion ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [devices, search, activeModel, activeOS])

  const sortedDevices = sortKey ? sortRows(filtered, device => {
    switch (sortKey) {
      case 'device': return device.deviceName
      case 'user': return device.user
      case 'model': return extractModelBase(device.model)
      case 'macos': return device.osVersion
      case 'checkin': return Date.parse(device.lastCheckIn) || device.lastCheckIn
      case 'filevault': return filevaultState(device)
      case 'compliance': return device.managementSource === 'ManageEngine'
        ? profileResultsLabel(profileResults[device.id], profileResultsLoading, profileResultsError).text
        : device.complianceState
      default: return ''
    }
  }, sortDirection) : filtered
  const { page, setPage, totalPages, paginated } = usePagination(sortedDevices, PAGE_SIZE)
  const handleSort = (key: string) => {
    setSortDirection(direction => toggleSortDirection(sortKey, direction, key))
    setSortKey(key)
  }

  // Exports every row matching the current filters/search (not just the visible page), in table order.
  function handleExportExcel() {
    downloadTableExcel({
      fileName: 'Mac_Devices_Report',
      title: 'Mac Devices Report',
      generatedBy: 'Mac Devices',
      filters: [
        ['Model', activeModel ?? 'All'],
        ['macOS Version', activeOS ?? 'All'],
        ['Search', search.trim() || 'None'],
        ['Devices in fleet', String(devices.length)],
      ],
      headers: ['Device', 'User', 'Serial Number', 'Model', 'macOS', 'Last Check-in', 'Enrolled', 'FileVault', 'MDM Status / Profiles', 'Profile Details'],
      rows: sortedDevices.map(d => {
        const profile = d.managementSource === 'ManageEngine'
          ? profileResultsLabel(profileResults[d.id], profileResultsLoading, profileResultsError)
          : { text: d.complianceState, title: '' }
        return [
          d.deviceName, d.user, d.serialNumber ?? '', d.model ? extractModelBase(d.model) : '', d.osVersion ?? '',
          d.lastCheckIn, d.enrollmentDate ? new Date(d.enrollmentDate).toLocaleDateString() : '',
          filevaultState(d), profile.text, profile.title.replace(/\n/g, '; '),
        ]
      }),
    })
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-slate-400 gap-2">
      <RefreshCw className="h-4 w-4 animate-spin" /><span className="text-sm">Loading devices…</span>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 flex flex-col gap-4">
        <Chips label="By Model" items={modelBreakdown} active={activeModel} onToggle={k => setActiveModel(p => p === k ? null : k)} />
        <Chips label="By macOS Version" items={osBreakdown} active={activeOS} onToggle={k => setActiveOS(p => p === k ? null : k)} />
        <p className="text-xs text-slate-500">Endpoint Central does not return an overall device-compliance verdict. The table shows each Mac’s profile status exactly as returned by the API.</p>
        {(activeModel || activeOS) && (
          <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
            <span className="text-xs text-slate-500">{filtered.length} of {devices.length} devices</span>
            <button type="button" onClick={() => { setActiveModel(null); setActiveOS(null) }} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">Clear all</button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
      <div className="relative w-full max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search devices, users…"
          className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400" />
        {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="h-3 w-3" /></button>}
      </div>
        <button type="button" onClick={handleExportExcel} disabled={filtered.length === 0}
          className="ml-auto flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition shadow-sm disabled:opacity-50">
          <Download className="h-3.5 w-3.5" />Export Excel ({filtered.length.toLocaleString()})
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
            <Apple className="h-8 w-8 opacity-30" /><p className="text-sm">No devices match filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm" style={{ tableLayout: 'fixed', width: dTotal }}>
              <colgroup>
                {DEVICE_COLS.map(col => <col key={col.key} style={{ width: dw[col.key] }} />)}
              </colgroup>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-left">
                  {DEVICE_COLS.map(col => col.key === 'actions' || col.key === 'logs' ? (
                    <th key={col.key} className="px-4 py-3 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400" style={{ width: dw[col.key] }}>{col.label}</th>
                  ) : (
                    <SortableHeader key={col.key} label={col.label} sortKey={col.key} activeSortKey={sortKey} direction={sortDirection} onSort={handleSort}
                      className="relative px-4 py-3 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap overflow-hidden" >
                        <span className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-indigo-400/50 active:bg-indigo-500 transition-colors"
                          onMouseDown={e => dResize(col.key, e)} onClick={e => e.stopPropagation()} />
                    </SortableHeader>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((d, i) => {
                  const fv = filevaultOn(d)
                  const isNew = d.id.startsWith('added-')
                  return (
                    <tr key={d.id} onClick={() => onSelectDevice(d)}
                      className={`border-b border-slate-100 last:border-0 transition hover:bg-slate-50 cursor-pointer ${i % 2 !== 0 ? 'bg-slate-50/40' : ''}`}>
                      <td className="px-4 py-3 overflow-hidden">
                        <div className="flex items-center gap-2">
                          <Apple className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                          <CopyText value={d.deviceName} label="Device name"><span className="font-medium text-slate-800 truncate">{d.deviceName}</span></CopyText>
                          {isNew && <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[0.55rem] font-bold text-emerald-700 flex-shrink-0">NEW</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs overflow-hidden"><CopyText value={d.user} label="User"><span className="truncate block">{d.user}</span></CopyText></td>
                      <td className="px-4 py-3 text-xs text-slate-500 overflow-hidden"><span className="truncate block">{d.model ? extractModelBase(d.model) : '—'}</span></td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-500 overflow-hidden"><span className="truncate block">{d.osVersion}</span></td>
                      <td className="px-4 py-3 text-xs text-slate-500 overflow-hidden">
                        <button type="button" onClick={e => { e.stopPropagation(); onSelectDevice(d) }} aria-label={`View ${d.deviceName} details`} title="View device details" className="rounded-md p-1 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600">
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 overflow-hidden">
                        <span className="flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${checkInDot(d.lastCheckIn)}`} />
                          <span className="truncate">{d.lastCheckIn}</span>
                        </span>
                        {d.enrollmentDate && <span className="block text-[0.6rem] text-slate-400 truncate mt-0.5 pl-3">Enrolled {d.enrollmentDate}</span>}
                      </td>
                      <td className="px-4 py-3 overflow-hidden">
                        {fv
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700"><CheckCircle className="h-2.5 w-2.5" />On</span>
                          : <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[0.6rem] font-bold text-red-600"><XCircle className="h-2.5 w-2.5" />Off</span>
                        }
                      </td>
                      <td className="px-4 py-3 overflow-hidden">
                        {d.managementSource === 'ManageEngine'
                          ? (() => {
                            const profileStatus = profileResultsLabel(profileResults[d.id], profileResultsLoading)
                            return <span title={profileStatus.title} className="inline-flex max-w-full items-center gap-1 rounded-full bg-slate-50 border border-slate-200 px-2 py-0.5 text-[0.6rem] font-semibold text-slate-600"><Info className="h-2.5 w-2.5 flex-shrink-0" /><span className="truncate">{profileStatus.text}</span></span>
                          })()
                          : d.complianceState === 'Compliant'
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700"><ShieldCheck className="h-2.5 w-2.5" />Compliant</span>
                          : d.complianceState === 'Warning'
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[0.6rem] font-bold text-amber-700"><AlertTriangle className="h-2.5 w-2.5" />Warning</span>
                          : <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[0.6rem] font-bold text-red-600"><ShieldAlert className="h-2.5 w-2.5" />Non-Compliant</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 overflow-hidden">
                        {canLogs
                          ? <button type="button" onClick={e => { e.stopPropagation(); onViewLogs(d) }} aria-label={`View logs for ${d.deviceName}`} title="Pull and export this device's log" className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 font-semibold text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600"><FileText className="h-3 w-3" />Logs</button>
                          : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-[0.6rem] text-slate-400 font-medium uppercase tracking-wide hidden sm:inline">Check-in status:</span>
              <span className="flex items-center gap-1 text-[0.6rem] text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Today</span>
              <span className="flex items-center gap-1 text-[0.6rem] text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-lime-500" />1–2 days</span>
              <span className="flex items-center gap-1 text-[0.6rem] text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" />3–6 days</span>
              <span className="flex items-center gap-1 text-[0.6rem] text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-red-500" />7+ days stale</span>
            </div>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} itemLabel="device" />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Report table column definitions ────────────────────────────────────────────

const RPT_MACOS_COLS = [
  { key: 'device',   label: 'Device',          min: 100, default: 150 },
  { key: 'user',     label: 'User',            min:  80, default: 110 },
  { key: 'serial',   label: 'Serial Number',   min:  90, default: 130 },
  { key: 'model',    label: 'Model',           min:  70, default: 100 },
  { key: 'version',  label: 'macOS Version',   min:  80, default: 100 },
  { key: 'category', label: 'Category',        min:  80, default: 110 },
  { key: 'checkin',  label: 'Last Check-in',   min: 100, default: 140 },
  { key: 'days',     label: 'Days Since Check-in', min: 80, default: 120 },
  { key: 'enrolled', label: 'Enrolled',        min:  80, default: 100 },
  { key: 'filevault',label: 'FileVault',       min:  70, default:  90 },
  { key: 'passcode', label: 'Passcode',        min:  70, default:  90 },
  { key: 'action',   label: 'Action Required', min: 100, default: 150 },
] as const
type MRColKey = typeof RPT_MACOS_COLS[number]['key']

const RPT_STALE_COLS = [
  { key: 'device',  label: 'Device',         min: 100, default: 160 },
  { key: 'user',    label: 'User',           min:  80, default: 120 },
  { key: 'model',   label: 'Model',          min:  70, default: 110 },
  { key: 'checkin', label: 'Last Check-in',  min: 100, default: 150 },
  { key: 'days',    label: 'Days Inactive',  min:  70, default: 110 },
  { key: 'action',  label: 'Action',         min:  80, default: 110 },
] as const
type STColKey = typeof RPT_STALE_COLS[number]['key']

// ─── Reports Tab ───────────────────────────────────────────────────────────────

function TableWrap({ title, count, footer, pagination, children }: { title: string; count?: number; footer?: string; pagination?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50">
        <FileText className="h-3.5 w-3.5 text-slate-400" />
        <span className="text-xs font-bold text-slate-700">{title}</span>
        {count !== undefined && <span className="rounded-full bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[0.58rem] font-bold text-slate-500">{count}</span>}
      </div>
      {children}
      {footer && <div className="px-5 py-2 border-t border-slate-100 bg-slate-50 text-[0.6rem] text-slate-400">{footer}</div>}
      {pagination}
    </div>
  )
}

function ReportsTab({
  devices,
}: {
  devices: ApiDevice[]
}) {
  const [activeReport, setActiveReport] = useState<ReportType>('macos_versions')
  const [staleThresh,  setStaleThresh]  = useState<7 | 14 | 30 | 60>(14)
  const [macFilter,    setMacFilter]    = useState<'all' | MacOSCategory>('all')
  const [checkInFilter,  setCheckInFilter]  = useState<'all' | 'today' | '1-2d' | '3-6d' | '7plus'>('all')
  const [macSortKey, setMacSortKey] = useState<string | null>(null)
  const [macSortDirection, setMacSortDirection] = useState<SortDirection>('asc')
  const [staleSortKey, setStaleSortKey] = useState<string | null>(null)
  const [staleSortDirection, setStaleSortDirection] = useState<SortDirection>('desc')

  // Column resize — one hook call per report table
  const { widths: mrW, startResize: mrR, totalWidth: mrT } = useColumnResize<MRColKey>(RPT_MACOS_COLS, 'rpt-macos')

  const { widths: stW, startResize: stR, totalWidth: stT } = useColumnResize<STColKey>(RPT_STALE_COLS, 'rpt-stale')

  const def = REPORT_DEFS.find(d => d.id === activeReport)!

  // ── Precomputed report data ──────────────────────────────────────────────────

  const macRows = useMemo(() => {
    const map: Partial<Record<MacOSCategory, ApiDevice[]>> = {}
    devices.forEach(d => {
      const cat = macOSCategory(d.osVersion ?? '')
      if (!map[cat]) map[cat] = []
      map[cat]!.push(d)
    })
    return map
  }, [devices])

  const staleRows = useMemo(() => devices.map(d => ({
    device: d, days: stalenessDays(d.lastCheckIn),
  })).filter(r => r.days >= staleThresh), [devices, staleThresh])


  // ── Filtered lists + pagination — one hook call per report table (rules of hooks:
  // these must live here, not inside the individual xReport() functions below, since
  // those are invoked conditionally based on activeReport) ──────────────────────────

  const macFilteredRows = useMemo(() => {
    const catFiltered = macFilter === 'all' ? devices : devices.filter(d => macOSCategory(d.osVersion ?? '') === macFilter)
    return catFiltered.filter(d => {
      const days = stalenessDays(d.lastCheckIn)
      if (checkInFilter === 'today')  return days === 0
      if (checkInFilter === '1-2d')   return days >= 1 && days <= 2
      if (checkInFilter === '3-6d')   return days >= 3 && days <= 6
      if (checkInFilter === '7plus')  return days >= 7
      return true
    })
  }, [devices, macFilter, checkInFilter])
  const macSortedRows = macSortKey ? sortRows(macFilteredRows, device => {
    switch (macSortKey) {
      case 'device': return device.deviceName
      case 'user': return device.user
      case 'model': return extractModelBase(device.model)
      case 'serial': return device.serialNumber
      case 'version': return device.osVersion
      case 'checkin': return Date.parse(device.lastCheckIn) || device.lastCheckIn
      case 'days': return stalenessDays(device.lastCheckIn)
      case 'enrolled': return Date.parse(device.enrollmentDate ?? '') || 0
      case 'filevault': return filevaultState(device)
      case 'passcode': return device.passcodeStatus
      case 'category': return MACOS_CAT_META[macOSCategory(device.osVersion ?? '')].label
      case 'action': return MACOS_CAT_META[macOSCategory(device.osVersion ?? '')].action
      default: return ''
    }
  }, macSortDirection) : macFilteredRows
  const { page: macPage, setPage: setMacPage, totalPages: macTotalPages, paginated: macPaginated } = usePagination(macSortedRows, PAGE_SIZE)

  const staleSortedRows = staleSortKey ? sortRows(staleRows, row => {
    switch (staleSortKey) {
      case 'device': return row.device.deviceName
      case 'user': return row.device.user
      case 'model': return extractModelBase(row.device.model)
      case 'checkin': return Date.parse(row.device.lastCheckIn) || row.device.lastCheckIn
      case 'days': return row.days
      case 'action': return row.days >= 30 ? 'Re-enroll' : 'Check in'
      default: return row.days
    }
  }, staleSortDirection) : [...staleRows].sort((a, b) => b.days - a.days)
  const { page: stalePage, setPage: setStalePage, totalPages: staleTotalPages, paginated: stalePaginated } = usePagination(staleSortedRows, PAGE_SIZE)

  const handleMacSort = (key: string) => { setMacSortDirection(direction => toggleSortDirection(macSortKey, direction, key)); setMacSortKey(key); setMacPage(1) }
  const handleStaleSort = (key: string) => { setStaleSortDirection(direction => toggleSortDirection(staleSortKey, direction, key)); setStaleSortKey(key); setStalePage(1) }

  // ── CSV export ────────────────────────────────────────────────────────────────

  function handleExport() {
    const ts = new Date().toISOString().slice(0, 10)
    if (activeReport === 'macos_versions') {
      downloadCsv(`macos-versions-${ts}.csv`,
        ['Device', 'User', 'Serial Number', 'Model', 'macOS Version', 'Category', 'Last Check-in', 'Days Since Check-in', 'Enrolled', 'FileVault', 'Passcode', 'Action Required'],
        macSortedRows.map(d => {
          const cat = macOSCategory(d.osVersion ?? '')
          return [
            d.deviceName, d.user, d.serialNumber ?? '', d.model ? extractModelBase(d.model) : '', d.osVersion, MACOS_CAT_META[cat].label,
            d.lastCheckIn, stalenessDays(d.lastCheckIn), d.enrollmentDate ? new Date(d.enrollmentDate).toLocaleDateString() : '',
            filevaultState(d), d.passcodeStatus ?? 'Unknown', MACOS_CAT_META[cat].action,
          ]
        }) as unknown as (string | number)[],
      )
    } else if (activeReport === 'stale_devices') {
      downloadCsv(`stale-devices-${ts}.csv`,
        ['Device', 'User', 'Model', 'Last Check-in', 'Days Inactive'],
        staleRows.map(r => [r.device.deviceName, r.device.user, r.device.model ?? '', r.device.lastCheckIn, r.days]) as unknown as (string | number)[],
      )
    }
  }

  // ── Shared UI helpers ─────────────────────────────────────────────────────────

  // ── Report renderers ──────────────────────────────────────────────────────────

  function MacOSVersionsReport() {
    const CAT_ORDER: MacOSCategory[] = ['latest', 'outdated', 'eol']
    const filtered = macFilteredRows
    const CI_OPTS: { key: typeof checkInFilter; label: string; dot: string; active: string }[] = [
      { key: 'all',    label: 'All',       dot: 'bg-slate-400',   active: 'bg-slate-600 text-white border-slate-600'   },
      { key: 'today',  label: 'Today',     dot: 'bg-emerald-500', active: 'bg-emerald-500 text-white border-emerald-500' },
      { key: '1-2d',   label: '1–2 days',  dot: 'bg-lime-500',    active: 'bg-lime-500 text-white border-lime-500'       },
      { key: '3-6d',   label: '3–6 days',  dot: 'bg-amber-400',   active: 'bg-amber-400 text-white border-amber-400'     },
      { key: '7plus',  label: '7+ days',   dot: 'bg-red-500',     active: 'bg-red-500 text-white border-red-500'         },
    ]
    return (
      <div className="flex flex-col gap-4">
        {/* Distribution summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {CAT_ORDER.map(cat => {
            const meta  = MACOS_CAT_META[cat]
            const count = macRows[cat]?.length ?? 0
            const pct   = devices.length > 0 ? Math.round(count / devices.length * 100) : 0
            const colors = { emerald: 'border-emerald-200 text-emerald-600 bg-emerald-100', lime: 'border-lime-200 text-lime-600 bg-lime-100', amber: 'border-amber-200 text-amber-600 bg-amber-100', red: 'border-red-200 text-red-600 bg-red-100' }
            const c = colors[meta.color as keyof typeof colors]
            return (
              <button key={cat} type="button" onClick={() => setMacFilter(p => p === cat ? 'all' : cat)}
                className={`bg-white rounded-2xl border shadow-sm px-4 py-3 text-left transition hover:shadow-md ${macFilter === cat ? 'ring-2 ring-indigo-300' : ''} ${c.split(' ')[0]}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-2xl font-black ${c.split(' ')[1]}`}>{count}</span>
                  <span className={`rounded-full ${c.split(' ')[2]} px-1.5 py-0.5 text-[0.58rem] font-bold ${c.split(' ')[1]}`}>{pct}%</span>
                </div>
                <p className="text-[0.65rem] font-semibold text-slate-600">{meta.label}</p>
                <p className="text-[0.58rem] text-slate-400 mt-0.5">{meta.action}</p>
              </button>
            )
          })}
        </div>
        <TableWrap title="Devices by macOS Version" count={filtered.length} footer="Click cards above to filter by OS · Use check-in chips to filter by activity · Drag column edges to resize"
          pagination={<Pagination page={macPage} totalPages={macTotalPages} onPageChange={setMacPage} totalItems={filtered.length} pageSize={PAGE_SIZE} itemLabel="device" />}>
          {/* Check-in filter chips */}
          <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5 border-b border-slate-100 bg-white">
            <span className="text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide mr-1">Last Check-in:</span>
            {CI_OPTS.map(o => (
              <button key={o.key} type="button"
                onClick={() => setCheckInFilter(p => p === o.key ? 'all' : o.key)}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.6rem] font-semibold transition ${
                  checkInFilter === o.key ? o.active : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}>
                <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${checkInFilter === o.key ? 'bg-white' : o.dot}`} />
                {o.label}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="text-xs" style={{ tableLayout: 'fixed', width: mrT }}>
              <colgroup>{RPT_MACOS_COLS.map(c => <col key={c.key} style={{ width: mrW[c.key] }} />)}</colgroup>
              <thead className="sticky top-0 z-10"><tr className="border-b border-slate-100 text-left bg-slate-50">
                {RPT_MACOS_COLS.map(c => (
                  <SortableHeader key={c.key} label={c.label} sortKey={c.key} activeSortKey={macSortKey} direction={macSortDirection} onSort={handleMacSort}
                    className="relative px-4 py-2.5 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 overflow-hidden">
                    <span className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-indigo-400/50 active:bg-indigo-500 transition-colors"
                      onMouseDown={e => mrR(c.key, e)} onClick={e => e.stopPropagation()} />
                  </SortableHeader>
                ))}
              </tr></thead>
              <tbody>
                {macPaginated.map((d, i) => {
                  const cat  = macOSCategory(d.osVersion ?? '')
                  const meta = MACOS_CAT_META[cat]
                  const days = stalenessDays(d.lastCheckIn)
                  const fv   = filevaultState(d)
                  const badgeCls = cat === 'latest' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : cat === 'outdated' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-red-50 border-red-200 text-red-700'
                  return (
                    <tr key={d.id} className={`border-b border-slate-100 last:border-0 ${i%2 ? 'bg-slate-50/40' : ''}`}>
                      <td className="px-4 py-2.5 overflow-hidden"><span className="flex items-center gap-1.5"><Apple className="h-3 w-3 text-slate-400 flex-shrink-0" /><CopyText value={d.deviceName} label="Device name"><span className="font-medium text-slate-700 truncate block">{d.deviceName}</span></CopyText></span></td>
                      <td className="px-4 py-2.5 text-slate-500 overflow-hidden truncate"><CopyText value={d.user} label="User">{d.user}</CopyText></td>
                      <td className="px-4 py-2.5 font-mono text-slate-500 overflow-hidden"><CopyText value={d.serialNumber ?? ''} label="Serial number"><span className="truncate block">{d.serialNumber || '—'}</span></CopyText></td>
                      <td className="px-4 py-2.5 text-slate-500 overflow-hidden truncate">{d.model ? extractModelBase(d.model) : '—'}</td>
                      <td className="px-4 py-2.5 font-mono font-bold text-slate-700 overflow-hidden truncate">{d.osVersion}</td>
                      <td className="px-4 py-2.5 overflow-hidden"><span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.58rem] font-bold ${badgeCls}`}>{meta.label}</span></td>
                      <td className="px-4 py-2.5 overflow-hidden">
                        <span className="flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${checkInDot(d.lastCheckIn)}`} />
                          <span className="truncate text-slate-500">{d.lastCheckIn}</span>
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 tabular-nums font-semibold overflow-hidden ${days >= 30 ? 'text-red-600' : days >= 7 ? 'text-amber-600' : 'text-slate-500'}`}>{days === 0 ? 'Today' : `${days}d`}</td>
                      <td className="px-4 py-2.5 text-slate-500 overflow-hidden truncate">{d.enrollmentDate ? new Date(d.enrollmentDate).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-2.5 overflow-hidden">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.58rem] font-bold ${fv === 'On' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : fv === 'Off' ? 'bg-red-50 border-red-200 text-red-600' : fv === 'Pending' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>{fv === 'Unknown' ? 'Not reported' : fv}</span>
                      </td>
                      <td className="px-4 py-2.5 overflow-hidden">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.58rem] font-bold ${d.passcodeStatus === 'Present' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : d.passcodeStatus === 'Missing' ? 'bg-red-50 border-red-200 text-red-600' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>{d.passcodeStatus === 'Present' ? 'Set' : d.passcodeStatus === 'Missing' ? 'Missing' : 'Not reported'}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 overflow-hidden truncate">{meta.action}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </TableWrap>
      </div>
    )
  }

  function StaleDevicesReport() {
    const counts = {
      7:  devices.filter(d => stalenessDays(d.lastCheckIn) >= 7).length,
      14: devices.filter(d => stalenessDays(d.lastCheckIn) >= 14).length,
      30: devices.filter(d => stalenessDays(d.lastCheckIn) >= 30).length,
      60: devices.filter(d => stalenessDays(d.lastCheckIn) >= 60).length,
    }
    return (
      <div className="flex flex-col gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-3.5 flex items-center gap-3 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          <span className="text-xs font-semibold text-slate-600">Inactive threshold:</span>
          {([7, 14, 30, 60] as const).map(d => (
            <button key={d} type="button" onClick={() => { setStaleThresh(d); setStalePage(1) }}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${staleThresh === d ? 'bg-amber-500 border-amber-500 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
              {d}+ days
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-400">{staleRows.length} device{staleRows.length !== 1 ? 's' : ''} inactive ≥ {staleThresh} days</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([7, 14, 30, 60] as const).map(d => {
            const selected = staleThresh === d
            return (
              <button key={d} type="button" onClick={() => { setStaleThresh(d); setStalePage(1) }} aria-pressed={selected}
                className={`text-left bg-white rounded-2xl border shadow-sm px-4 py-3 transition hover:shadow-md cursor-pointer ${
                  selected ? 'border-amber-400 ring-2 ring-amber-300' : d >= 30 ? 'border-amber-200 hover:border-amber-300' : 'border-slate-200 hover:border-slate-300'}`}>
                <p className={`text-2xl font-black ${d >= 30 ? 'text-amber-600' : 'text-slate-700'}`}>{counts[d]}</p>
                <p className="text-[0.62rem] text-slate-400 mt-0.5">Inactive ≥ {d} days</p>
                <p className={`text-[0.58rem] font-semibold mt-1 ${selected ? 'text-amber-600' : 'text-slate-400'}`}>{selected ? 'Showing below ↓' : 'Click to view devices →'}</p>
              </button>
            )
          })}
        </div>
        <TableWrap title={`Devices Inactive ≥ ${staleThresh} days`} count={staleRows.length} footer="Stale devices may need re-enrollment or manual check-in"
          pagination={staleRows.length > 0 && <Pagination page={stalePage} totalPages={staleTotalPages} onPageChange={setStalePage} totalItems={staleRows.length} pageSize={PAGE_SIZE} itemLabel="device" />}>
          {staleRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
              <CheckCircle className="h-8 w-8 opacity-30" />
              <p className="text-sm">No devices inactive beyond {staleThresh} days</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="text-xs" style={{ tableLayout: 'fixed', width: stT }}>
                <colgroup>{RPT_STALE_COLS.map(c => <col key={c.key} style={{ width: stW[c.key] }} />)}</colgroup>
                <thead className="sticky top-0 z-10"><tr className="border-b border-slate-100 text-left bg-slate-50">
                  {RPT_STALE_COLS.map(c => (
                    <SortableHeader key={c.key} label={c.label} sortKey={c.key} activeSortKey={staleSortKey} direction={staleSortDirection} onSort={handleStaleSort}
                      className="relative px-4 py-2.5 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 overflow-hidden">
                      <span className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-indigo-400/50 active:bg-indigo-500 transition-colors"
                        onMouseDown={e => stR(c.key, e)} onClick={e => e.stopPropagation()} />
                    </SortableHeader>
                  ))}
                </tr></thead>
                <tbody>
                  {stalePaginated.map((r, i) => (
                    <tr key={r.device.id} className={`border-b border-slate-100 last:border-0 ${i%2 ? 'bg-slate-50/40' : ''}`}>
                      <td className="px-4 py-2.5 overflow-hidden"><span className="flex items-center gap-1.5"><Apple className="h-3 w-3 text-slate-400" /><span className="font-medium text-slate-700 truncate block">{r.device.deviceName}</span></span></td>
                      <td className="px-4 py-2.5 text-slate-500 truncate overflow-hidden">{r.device.user}</td>
                      <td className="px-4 py-2.5 text-slate-500 overflow-hidden truncate">{r.device.model ? extractModelBase(r.device.model) : '—'}</td>
                      <td className="px-4 py-2.5 overflow-hidden">
                        <span className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full flex-shrink-0 bg-red-400" />
                          <span className="truncate text-slate-500">{r.device.lastCheckIn}</span>
                        </span>
                        {r.device.enrollmentDate && <span className="block text-[0.58rem] text-slate-400 truncate mt-0.5 pl-3">Enrolled {r.device.enrollmentDate}</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`font-bold ${r.days >= 30 ? 'text-amber-600' : 'text-slate-600'}`}>{r.days}d</span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {r.days >= 30
                          ? <span className="inline-flex items-center rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[0.58rem] font-bold text-red-600">Re-enroll</span>
                          : <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[0.58rem] font-bold text-amber-600">Send nudge</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TableWrap>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const isFullReport = activeReport === 'fleet_kpi_cards'
  const analyticalDefs = REPORT_DEFS.filter(d => d.group === 'analytical')
  const fullDefs       = REPORT_DEFS.filter(d => d.group === 'full')

  return (
    <div className="flex flex-col gap-5">

      {/* ── Report selector — one row ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {[...analyticalDefs, ...fullDefs].map(d => {
            const isActive = activeReport === d.id
            return (
              <button key={d.id} type="button" onClick={() => setActiveReport(d.id)}
                className={`flex flex-col gap-1.5 rounded-xl border px-3 py-3 text-left transition shadow-sm hover:shadow-md ${
                  isActive ? 'is-selected' : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                }`}>
                <div className="flex items-center justify-between gap-2">
                  <div className={`rounded-lg p-1.5 w-fit ${isActive ? 'bg-sky-100 text-sky-600' : 'bg-white text-slate-500 border border-slate-200'}`}>{d.icon}</div>
                  {d.group === 'full' && <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[0.55rem] font-bold text-slate-500 uppercase tracking-wide">Full Page</span>}
                </div>
                <p className={`text-xs font-bold leading-tight ${isActive ? 'text-sky-700' : 'text-slate-700'}`}>{d.label}</p>
                <p className="text-[0.62rem] text-slate-400 leading-tight">{d.description}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Controls bar — hidden for full-page reports */}
      {!isFullReport && (
        <div className="flex items-center gap-3 flex-wrap bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-2.5">
          <div className="flex items-center gap-1">
            <span className="text-slate-400">{def.icon}</span>
            <span className="text-xs font-semibold text-slate-700">{def.label}</span>
            <span className="text-xs text-slate-400">— {def.description}</span>
          </div>
          <button type="button" onClick={handleExport}
            className="ml-auto flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition shadow-sm">
            <Download className="h-3.5 w-3.5" />Export CSV
          </button>
        </div>
      )}

      {/* Active analytical report */}
      {activeReport === 'macos_versions'     && MacOSVersionsReport()}
      {activeReport === 'stale_devices'      && StaleDevicesReport()}

      {/* Active full-page report */}
      {activeReport === 'fleet_kpi_cards'  && <MacFleetReportsPage />}

    </div>
  )
}

// ─── Security Tab ──────────────────────────────────────────────────────────────

function MacSecurityAppInventoryModal({
  inventory,
  loading,
  error,
  onRefresh,
  onClose,
}: {
  inventory: MacSecurityAppInventory | null
  loading: boolean
  error: string | null
  onRefresh: () => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'both' | 'zscaler' | 'crowdstrike' | 'inventory-failed'>('all')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const rows = inventory?.devices ?? []
  const assessed = inventory?.inventoryAvailableDevices ?? 0
  // Never call an app "not installed" when its inventory request failed.
  // It is only absent from the inventory returned by the device connector.
  const zscalerNotDetected = assessed - (inventory?.zscalerInstalled ?? 0)
  const crowdstrikeNotDetected = assessed - (inventory?.crowdstrikeInstalled ?? 0)
  const filtered = useMemo(() => {
    const query = search.toLowerCase()
    return rows.filter(row => {
      if (!row.deviceName.toLowerCase().includes(query) && !row.primaryUser.toLowerCase().includes(query)) return false
      if (availabilityFilter === 'inventory-failed') return !row.inventoryAvailable
      if (availabilityFilter === 'both') return row.inventoryAvailable && row.zscaler.installed && row.crowdstrike.installed
      if (availabilityFilter === 'zscaler') return row.inventoryAvailable && row.zscaler.installed
      if (availabilityFilter === 'crowdstrike') return row.inventoryAvailable && row.crowdstrike.installed
      return true
    })
  }, [rows, search, availabilityFilter])
  const sortedRows = sortKey ? sortRows(filtered, row => {
    switch (sortKey) {
      case 'device': return row.deviceName
      case 'user': return row.primaryUser
      case 'zscaler': return row.zscaler.version ?? (row.zscaler.installed ? 'Installed' : 'Not detected')
      case 'crowdstrike': return row.crowdstrike.version ?? (row.crowdstrike.installed ? 'Installed' : 'Not detected')
      case 'inventory': return row.inventoryAvailable ? hasTargetAppEvidence(row) ? 'App found' : 'No target app found' : 'Request failed'
      case 'lastCheckin': return Date.parse(row.lastSync) || row.lastSync
      default: return ''
    }
  }, sortDirection) : filtered
  const { page, setPage, totalPages, paginated } = usePagination(sortedRows, PAGE_SIZE)
  const handleSort = (key: string) => { setSortDirection(direction => toggleSortDirection(sortKey, direction, key)); setSortKey(key); setPage(1) }

  function setFilter(filter: typeof availabilityFilter) {
    setAvailabilityFilter(filter)
    setPage(1)
  }

  function statusLabel(row: MacSecurityAppDevice, agent: 'zscaler' | 'crowdstrike') {
    if (!row.inventoryAvailable) return 'Inventory unavailable'
    const app = row[agent]
    return app.installed ? `Installed${app.version ? ` · ${app.version}` : ''}` : 'Not detected in inventory'
  }

  function hasTargetAppEvidence(row: MacSecurityAppDevice) {
    return row.inventoryAvailable && (row.zscaler.installed || row.crowdstrike.installed)
  }

  function handleExport() {
    const includeZscaler = availabilityFilter !== 'crowdstrike' && availabilityFilter !== 'inventory-failed'
    const includeCrowdStrike = availabilityFilter !== 'zscaler' && availabilityFilter !== 'inventory-failed'
    const headers = ['Device', 'User', 'Connector', ...(includeZscaler ? ['Zscaler'] : []), ...(includeCrowdStrike ? ['CrowdStrike'] : []), availabilityFilter === 'inventory-failed' ? 'Inventory Error' : 'Inventory Status', 'Last Check-in']
    const exportRows = filtered.map(row => [row.deviceName, row.primaryUser, row.connector, ...(includeZscaler ? [statusLabel(row, 'zscaler')] : []), ...(includeCrowdStrike ? [statusLabel(row, 'crowdstrike')] : []), !row.inventoryAvailable ? 'Inventory request failed' : hasTargetAppEvidence(row) ? 'App found' : 'No target app found', row.lastSync])
    downloadCsv(`macos-zscaler-crowdstrike-apps-${new Date().toISOString().slice(0, 10)}.csv`, headers, exportRows as unknown as (string | number)[])
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4">
          <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600"><Shield className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-slate-800">Zscaler &amp; CrowdStrike App Availability</h2>
            <p className="text-[0.65rem] text-slate-400">{inventory ? `${inventory.totalDevices} enrolled Macs · ${inventory.inventoryAvailableDevices} scanned · ${inventory.inventoryUnavailableDevices} unavailable` : 'Mac app inventory results'}</p>
          </div>
          {inventory && <button type="button" onClick={handleExport} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Download className="h-3.5 w-3.5" />Export CSV</button>}
          <button type="button" onClick={onRefresh} disabled={loading} title="Refresh app inventory" className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        {inventory && (
          <div className="grid grid-cols-2 gap-2 border-b border-slate-100 px-5 py-3 sm:grid-cols-5">
            <button type="button" aria-pressed={availabilityFilter === 'both'} onClick={() => setFilter('both')} className={`rounded-lg border px-3 py-2 text-left transition ${availabilityFilter === 'both' ? 'border-emerald-300 bg-emerald-100 ring-1 ring-emerald-200' : 'border-transparent bg-emerald-50 hover:border-emerald-200'}`}><p className="text-[0.6rem] font-semibold uppercase text-emerald-700">Both apps found</p><p className="text-sm font-bold text-slate-800">{inventory.bothAppsInstalled} <span className="text-xs font-medium text-slate-500">/ {assessed} scanned</span></p><p className="text-[0.62rem] text-slate-500">Zscaler + Falcon · View Macs</p></button>
            <button type="button" aria-pressed={availabilityFilter === 'zscaler'} onClick={() => setFilter('zscaler')} className={`rounded-lg border px-3 py-2 text-left transition ${availabilityFilter === 'zscaler' ? 'border-sky-300 bg-sky-100 ring-1 ring-sky-200' : 'border-transparent bg-sky-50 hover:border-sky-200'}`}><p className="text-[0.6rem] font-semibold uppercase text-sky-700">Zscaler detected</p><p className="text-sm font-bold text-slate-800">{inventory.zscalerInstalled} <span className="text-xs font-medium text-slate-500">/ {assessed} inventoried</span></p><p className="text-[0.62rem] text-slate-500">Not detected: {zscalerNotDetected} · View detected</p></button>
            <button type="button" aria-pressed={availabilityFilter === 'crowdstrike'} onClick={() => setFilter('crowdstrike')} className={`rounded-lg border px-3 py-2 text-left transition ${availabilityFilter === 'crowdstrike' ? 'border-indigo-300 bg-indigo-100 ring-1 ring-indigo-200' : 'border-transparent bg-indigo-50 hover:border-indigo-200'}`}><p className="text-[0.6rem] font-semibold uppercase text-indigo-700">CrowdStrike detected</p><p className="text-sm font-bold text-slate-800">{inventory.crowdstrikeInstalled} <span className="text-xs font-medium text-slate-500">/ {assessed} inventoried</span></p><p className="text-[0.62rem] text-slate-500">Not detected: {crowdstrikeNotDetected} · View detected</p></button>
            <button type="button" aria-pressed={availabilityFilter === 'inventory-failed'} onClick={() => setFilter('inventory-failed')} className={`rounded-lg border px-3 py-2 text-left transition ${availabilityFilter === 'inventory-failed' ? 'border-amber-300 bg-amber-100 ring-1 ring-amber-200' : 'border-transparent bg-amber-50 hover:border-amber-200'}`}><p className="text-[0.6rem] font-semibold uppercase text-amber-700">Inventory request failed</p><p className="text-sm font-bold text-slate-800">{inventory.inventoryUnavailableDevices}</p><p className="text-[0.62rem] text-slate-500">Could not assess these Macs</p></button>
            <button type="button" aria-pressed={availabilityFilter === 'all'} onClick={() => setFilter('all')} className={`rounded-lg border px-3 py-2 text-left transition ${availabilityFilter === 'all' ? 'border-slate-300 bg-slate-100 ring-1 ring-slate-200' : 'border-transparent bg-slate-50 hover:border-slate-200'}`}><p className="text-[0.6rem] font-semibold uppercase text-slate-500">Total Macs</p><p className="text-sm font-bold text-slate-800">{inventory.totalDevices}</p><p className="text-[0.62rem] text-slate-500">Show all devices</p></button>
          </div>
        )}
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search device or user…" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" /></div>
          {availabilityFilter !== 'all' && <button type="button" onClick={() => setFilter('all')} className="shrink-0 text-xs font-medium text-indigo-600 hover:text-indigo-700">Clear filter</button>}
        </div>
        {error && <p className="px-5 py-3 text-xs text-red-600">Could not load app inventory: {error}</p>}
        <div className="min-h-0 flex-1 overflow-auto">
          {loading && !inventory ? <p className="p-10 text-center text-sm text-slate-400">Scanning Mac app inventory…</p> : !inventory ? <p className="p-10 text-center text-sm text-slate-400">No app inventory results.</p> : (
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[0.6rem] uppercase text-slate-400"><tr>
                <SortableHeader label="Device" sortKey="device" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-4 py-3 font-semibold" />
                <SortableHeader label="User" sortKey="user" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-4 py-3 font-semibold" />
                {availabilityFilter !== 'crowdstrike' && availabilityFilter !== 'inventory-failed' && <SortableHeader label="Zscaler" sortKey="zscaler" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-4 py-3 font-semibold" />}
                {availabilityFilter !== 'zscaler' && availabilityFilter !== 'inventory-failed' && <SortableHeader label="CrowdStrike Falcon" sortKey="crowdstrike" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-4 py-3 font-semibold" />}
                <SortableHeader label={availabilityFilter === 'inventory-failed' ? 'Inventory Error' : 'Inventory Status'} sortKey="inventory" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-4 py-3 font-semibold" />
                <SortableHeader label="Last Check-in" sortKey="lastCheckin" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-4 py-3 font-semibold" />
              </tr></thead>
              <tbody>{paginated.map((row, index) => (
                <tr key={row.deviceId} className={`border-b border-slate-100 ${index % 2 ? 'bg-slate-50/40' : ''}`}>
                  <td className="px-4 py-3 font-semibold text-slate-700"><CopyText value={row.deviceName} label="Device name">{row.deviceName}</CopyText></td>
                  <td className="px-4 py-3 text-slate-500">{row.primaryUser || '—'}</td>
                  {availabilityFilter !== 'crowdstrike' && availabilityFilter !== 'inventory-failed' && <td className={`px-4 py-3 ${row.inventoryAvailable && row.zscaler.installed ? 'text-emerald-700' : row.inventoryAvailable ? 'text-red-600' : 'text-amber-700'}`}>{statusLabel(row, 'zscaler')}</td>}
                  {availabilityFilter !== 'zscaler' && availabilityFilter !== 'inventory-failed' && <td className={`px-4 py-3 ${row.inventoryAvailable && row.crowdstrike.installed ? 'text-emerald-700' : row.inventoryAvailable ? 'text-red-600' : 'text-amber-700'}`}>{statusLabel(row, 'crowdstrike')}</td>}
                  <td className="px-4 py-3">{!row.inventoryAvailable ? <span className="font-medium text-amber-700">Request failed</span> : hasTargetAppEvidence(row) ? <span className="font-medium text-emerald-700">App found</span> : <span className="font-medium text-red-600">No target app found</span>}</td>
                  <td className="px-4 py-3 text-slate-500">{row.lastSync || '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
        {inventory && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} itemLabel="device" />}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-3"><span className="text-[0.65rem] text-slate-400">App presence from MDM inventory; not sensor-health telemetry.</span><button type="button" onClick={onClose} className="rounded-lg bg-indigo-500 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-600">Close</button></div>
      </div>
    </div>
  )
}

async function fetchMacSecurityAppInventory(devices: ApiDevice[]): Promise<MacSecurityAppInventory> {
  const macDevices = devices.filter(device => device.platform === 'macOS')
  const rows: MacSecurityAppDevice[] = []
  const batchSize = 8

  for (let start = 0; start < macDevices.length; start += batchSize) {
    const batch = macDevices.slice(start, start + batchSize)
    const results = await Promise.allSettled(batch.map(device => api.fetchDeviceApps(device.id)))
    results.forEach((result, index) => {
      const device = batch[index]!
      const apps = result.status === 'fulfilled' ? result.value : []
      const matchesApp = (app: (typeof apps)[number], pattern: RegExp) => pattern.test(`${app.name} ${app.publisher} ${app.appType ?? ''}`)
      const isInstalled = (pattern: RegExp) => apps.some(app => app.status === 'Installed' && matchesApp(app, pattern))
      const getVersion = (pattern: RegExp) => apps.find(app => app.status === 'Installed' && matchesApp(app, pattern))?.version ?? null
      const inventoryAvailable = result.status === 'fulfilled'

      rows.push({
        deviceId: device.id,
        deviceName: device.deviceName,
        primaryUser: device.user,
        connector: device.managementSource,
        lastSync: device.lastCheckIn,
        inventoryAvailable,
        zscaler: { installed: inventoryAvailable && isInstalled(/zscaler/i), version: inventoryAvailable ? getVersion(/zscaler/i) : null },
        crowdstrike: { installed: inventoryAvailable && isInstalled(/crowd\s*strike|\bfalcon\b/i), version: inventoryAvailable ? getVersion(/crowd\s*strike|\bfalcon\b/i) : null },
      })
    })
  }

  const assessed = rows.filter(row => row.inventoryAvailable)
  return {
    platform: 'macOS',
    totalDevices: rows.length,
    inventoryAvailableDevices: assessed.length,
    inventoryUnavailableDevices: rows.length - assessed.length,
    zscalerInstalled: assessed.filter(row => row.zscaler.installed).length,
    crowdstrikeInstalled: assessed.filter(row => row.crowdstrike.installed).length,
    bothAppsInstalled: assessed.filter(row => row.zscaler.installed && row.crowdstrike.installed).length,
    devices: rows,
  }
}

type GapFilter = 'filevault' | 'compliance' | null

function SecurityTab({
  devices,
  loading,
  onSelectDevice,
  onSelectDetails,
  onShowGap,
}: {
  devices: ApiDevice[]
  loading: boolean
  onSelectDevice: (d: ApiDevice) => void
  onSelectDetails: (d: ApiDevice, tab: 'security' | 'compliance') => void
  onShowGap: (title: string, icon: React.ReactNode, devices: ApiDevice[], accent: string, detailTab: 'security' | 'compliance', metric?: DeviceMetricDetail) => void
}) {
  const { widths: sw, startResize: sResize, totalWidth: sTotal } = useColumnResize<SColKey>(SECURITY_COLS, 'mac-security')
  const [search, setSearch] = useState('')
  const [riskFilter, setRiskFilter] = useState<'All' | 'At Risk' | 'Secure'>('All')
  const [gapFilter, setGapFilter] = useState<GapFilter>(null)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [agentInventory, setAgentInventory] = useState<MacSecurityAppInventory | null>(null)
  const [agentInventoryLoading, setAgentInventoryLoading] = useState(true)
  const [agentInventoryError, setAgentInventoryError] = useState<string | null>(null)
  const [showAgentInventory, setShowAgentInventory] = useState(false)

  // Manual refresh from the details panel.
  async function loadAgentInventory() {
    setAgentInventoryLoading(true)
    setAgentInventoryError(null)
    try {
      setAgentInventory(await fetchMacSecurityAppInventory(devices))
    } catch (error) {
      setAgentInventoryError(error instanceof Error ? error.message : 'Failed to load app inventory')
    } finally {
      setAgentInventoryLoading(false)
    }
  }

  // Flag loading during render when the inventory has to be (re)fetched; the effect only fetches.
  const inventoryTarget = loading ? null : devices
  const [prevInventoryTarget, setPrevInventoryTarget] = useState(inventoryTarget)
  if (inventoryTarget !== prevInventoryTarget) {
    setPrevInventoryTarget(inventoryTarget)
    if (inventoryTarget) { setAgentInventoryLoading(true); setAgentInventoryError(null) }
  }

  useEffect(() => {
    if (loading) return
    let cancelled = false
    fetchMacSecurityAppInventory(devices)
      .then(inventory => { if (!cancelled) setAgentInventory(inventory) })
      .catch((error: unknown) => { if (!cancelled) setAgentInventoryError(error instanceof Error ? error.message : 'Failed to load app inventory') })
      .finally(() => { if (!cancelled) setAgentInventoryLoading(false) })
    return () => { cancelled = true }
  }, [devices, loading])

  const agentInventoryById = useMemo(() => new Map(agentInventory?.devices.map(device => [device.deviceId, device]) ?? []), [agentInventory])

  const total = devices.length

  const secStats = useMemo(() => ({
    filevaultOn:  devices.filter(d => filevaultOn(d)).length,
    filevaultReported: devices.filter(d => hasReportedStatus(d.encryptionStatus)).length,
    securityUnreported: devices.filter(d => !hasReportedStatus(d.encryptionStatus)).length,
    noFileVault:  devices.filter(d => filevaultOff(d)).length,
  }), [devices])

  function isAtRisk(d: ApiDevice): boolean {
    const inventory = agentInventoryById.get(d.id)
    return filevaultOff(d) || (inventory?.inventoryAvailable === true && (!inventory.zscaler.installed || !inventory.crowdstrike.installed))
  }

  function matchesGap(d: ApiDevice, gap: GapFilter): boolean {
    if (!gap) return true
    if (gap === 'filevault')  return filevaultOff(d)
    return true
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return devices.filter(d => {
      if (riskFilter === 'At Risk' && !isAtRisk(d)) return false
      if (riskFilter === 'Secure' && isAtRisk(d)) return false
      if (!matchesGap(d, gapFilter)) return false
      if (q && !d.deviceName.toLowerCase().includes(q) && !d.user.toLowerCase().includes(q)) return false
      return true
    })
  }, [devices, search, riskFilter, gapFilter, agentInventoryById])

  const sortedDevices = sortKey ? sortRows(filtered, device => {
    const agent = agentInventoryById.get(device.id)
    switch (sortKey) {
      case 'device': return device.deviceName
      case 'user': return device.user
      case 'fv': return filevaultState(device)
      case 'zscaler': return agent?.zscaler.version ?? (agent?.zscaler.installed ? 'Installed' : 'Not detected')
      case 'crowdstrike': return agent?.crowdstrike.version ?? (agent?.crowdstrike.installed ? 'Installed' : 'Not detected')
      case 'policies': return device.appliedPolicies?.join(', ')
      case 'checkin': return Date.parse(device.lastCheckIn) || device.lastCheckIn
      case 'risk': return isAtRisk(device) ? 'At Risk' : 'Secure'
      default: return ''
    }
  }, sortDirection) : filtered
  const { page, setPage, totalPages, paginated } = usePagination(sortedDevices, PAGE_SIZE)
  const handleSort = (key: string) => { setSortDirection(direction => toggleSortDirection(sortKey, direction, key)); setSortKey(key); setPage(1) }

  function toggleGap(gap: GapFilter) {
    setGapFilter(prev => prev === gap ? null : gap)
    setRiskFilter('All')
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-slate-400 gap-2">
      <RefreshCw className="h-4 w-4 animate-spin" /><span className="text-sm">Loading security data…</span>
    </div>
  )

  const GAP_LABEL: Record<NonNullable<GapFilter>, string> = {
    filevault:  'No FileVault',
    compliance: 'Non-Compliant',
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {metricBar('FileVault Encryption', secStats.filevaultOn, secStats.filevaultReported, total, 'emerald', <Lock className="h-3.5 w-3.5 text-emerald-500" />, () => onShowGap('FileVault Encryption Details', <Lock className="h-4 w-4 text-emerald-600" />, devices, 'emerald', 'security', 'filevault'))}
        <button type="button" onClick={() => setShowAgentInventory(true)} className="bg-white rounded-2xl border border-indigo-200 shadow-sm px-4 py-4 flex flex-col gap-3 text-left transition hover:shadow-md hover:border-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
          <div className="flex items-center gap-2"><Shield className="h-3.5 w-3.5 text-indigo-500" /><span className="text-xs font-semibold text-slate-700">Zscaler &amp; CrowdStrike Apps</span></div>
          <div className="flex items-baseline gap-3 text-[0.68rem]">
            <span className="font-semibold text-emerald-700">Both apps {agentInventoryLoading ? '…' : agentInventory ? `${agentInventory.bothAppsInstalled} found` : '—'}</span>
            <span className="font-semibold text-slate-500">{agentInventoryLoading ? '' : agentInventory ? `/ ${agentInventory.inventoryAvailableDevices} Macs scanned` : ''}</span>
          </div>
          <p className="text-[0.65rem] text-slate-400">{agentInventoryLoading ? 'Checking app inventory…' : agentInventory ? `Zscaler ${agentInventory.zscalerInstalled}; Falcon ${agentInventory.crowdstrikeInstalled}; ${agentInventory.inventoryUnavailableDevices} scans unavailable · View details` : 'App inventory unavailable · Retry in details'}</p>
        </button>
      </div>

      {total > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide">Security Gaps — click to filter devices</p>
            {gapFilter && (
              <button type="button" onClick={() => setGapFilter(null)} className="flex items-center gap-1 text-[0.65rem] font-medium text-slate-500 hover:text-slate-700 transition">
                <X className="h-3 w-3" />Clear filter
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {secStats.noFileVault > 0 && (
              <button type="button" onClick={() => { toggleGap('filevault'); onShowGap('Devices without FileVault', <Lock className="h-4 w-4 text-red-600" />, devices.filter(d => filevaultOff(d)), 'red', 'security') }}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 ${gapFilter === 'filevault' ? 'border-red-400 bg-red-100 ring-2 ring-red-200 shadow-sm' : 'border-red-200 bg-red-50 hover:bg-red-100 hover:border-red-300'}`}>
                <Lock className="h-3.5 w-3.5 text-red-500" />
                <span className="text-xs font-semibold text-red-700">{secStats.noFileVault} without FileVault</span>
                {gapFilter === 'filevault' && <X className="h-3 w-3 text-red-400 ml-1" />}
              </button>
            )}
            {secStats.noFileVault === 0 && secStats.securityUnreported === 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-xs font-semibold text-emerald-700">No security gaps detected</span>
              </div>
            )}
            {secStats.noFileVault === 0 && secStats.securityUnreported > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                <Info className="h-3.5 w-3.5 text-amber-600" />
                <span className="text-xs font-semibold text-amber-700">No confirmed gaps; security status is unreported for {secStats.securityUnreported} device{secStats.securityUnreported === 1 ? '' : 's'}.</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search devices…"
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2 text-xs text-slate-700 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400" />
          {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="h-3 w-3" /></button>}
        </div>
        <div className="flex rounded-xl border border-slate-200 bg-slate-50 overflow-hidden text-xs">
          {(['All', 'At Risk', 'Secure'] as const).map(f => (
            <button key={f} type="button" onClick={() => { setRiskFilter(f); setGapFilter(null) }}
              className={`px-3 py-2 font-medium transition ${riskFilter === f && !gapFilter ? (f === 'At Risk' ? 'bg-red-500 text-white' : 'bg-indigo-500 text-white') : 'text-slate-600 hover:bg-slate-100'}`}>{f}</button>
          ))}
        </div>
        {gapFilter && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-2.5 py-1 text-[0.65rem] font-semibold text-white">
            Filtered: {GAP_LABEL[gapFilter]}
          </span>
        )}
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} device{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
            <ShieldCheck className="h-7 w-7 opacity-30" /><p className="text-sm">No devices match filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm" style={{ tableLayout: 'fixed', width: sTotal - sw.fw }}>
              <colgroup>
                {MAC_SECURITY_COLS.map(col => <col key={col.key} style={{ width: sw[col.key] }} />)}
              </colgroup>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-left">
                  {MAC_SECURITY_COLS.map(col => col.key === 'actions' ? (
                    <th key={col.key} className="px-4 py-3 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400" style={{ width: sw[col.key] }}>{col.label}</th>
                  ) : (
                    <SortableHeader key={col.key} label={col.label} sortKey={col.key} activeSortKey={sortKey} direction={sortDirection} onSort={handleSort}
                      className="relative px-4 py-3 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap overflow-hidden" >
                        <span className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-indigo-400/50 active:bg-indigo-500 transition-colors"
                          onMouseDown={e => sResize(col.key, e)} onClick={e => e.stopPropagation()} />
                    </SortableHeader>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((d, i) => {
                  const fv  = filevaultState(d)
                  const appInventory = agentInventoryById.get(d.id)
                  const agentMissing = appInventory?.inventoryAvailable === true && (!appInventory.zscaler.installed || !appInventory.crowdstrike.installed)
                  const atRisk = fv === 'Off' || agentMissing || d.complianceState === 'Non-Compliant'
                  const policyCount = d.appliedPolicies?.length ?? 0

                  return (
                    <tr key={d.id} onClick={() => onSelectDevice(d)}
                      className={`border-b border-slate-100 last:border-0 transition hover:bg-slate-50 cursor-pointer ${i % 2 !== 0 ? 'bg-slate-50/40' : ''}`}>
                      <td className="px-4 py-3 overflow-hidden">
                        <div className="flex items-center gap-2">
                          <Apple className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                          <CopyText value={d.deviceName} label="Device name"><span className="font-medium text-slate-800 text-xs truncate">{d.deviceName}</span></CopyText>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 overflow-hidden"><CopyText value={d.user} label="User"><span className="truncate block">{d.user}</span></CopyText></td>
                      <td className="px-4 py-3 overflow-hidden">
                        {fv === 'On'
                          ? <button type="button" onClick={e => { e.stopPropagation(); onSelectDetails(d, 'security') }} aria-label={`View ${d.deviceName} FileVault details`} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"><CheckCircle className="h-2.5 w-2.5" />On</button>
                          : fv === 'Off'
                          ? <button type="button" onClick={e => { e.stopPropagation(); onSelectDetails(d, 'security') }} aria-label={`View ${d.deviceName} FileVault details`} className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[0.6rem] font-bold text-red-600 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"><XCircle className="h-2.5 w-2.5" />Off</button>
                          : <button type="button" onClick={e => { e.stopPropagation(); onSelectDetails(d, 'security') }} aria-label={`View ${d.deviceName} FileVault details`} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6rem] font-bold hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${fv === 'Pending' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}><Info className="h-2.5 w-2.5" />{fv}</button>
                        }
                      </td>
                      {(['zscaler', 'crowdstrike'] as const).map(agent => {
                        const installed = appInventory?.inventoryAvailable && appInventory[agent].installed
                        const label = agentInventoryLoading ? 'Checking…' : appInventory?.inventoryAvailable === false ? 'Inventory unavailable' : appInventory?.inventoryAvailable ? installed ? `Installed${appInventory[agent].version ? ` · ${appInventory[agent].version}` : ''}` : 'Not found' : 'Unknown'
                        const good = installed === true
                        const knownMissing = appInventory?.inventoryAvailable === true && !installed
                        return <td key={agent} className="px-4 py-3 overflow-hidden"><span className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${good ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : knownMissing ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>{good ? <CheckCircle className="h-2.5 w-2.5" /> : knownMissing ? <AlertTriangle className="h-2.5 w-2.5" /> : <Info className="h-2.5 w-2.5" />}<span className="truncate">{label}</span></span></td>
                      })}
                      <td className="px-4 py-3 overflow-hidden">
                        {policyCount > 0
                          ? <button type="button" onClick={e => { e.stopPropagation(); onSelectDetails(d, 'compliance') }} aria-label={`View ${d.deviceName} applied policies`} className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded"><Shield className="h-3 w-3 text-indigo-400 flex-shrink-0" />{policyCount} polic{policyCount !== 1 ? 'ies' : 'y'}</button>
                          : <span className="text-xs text-slate-300">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 overflow-hidden"><span className="truncate block">{d.lastCheckIn}</span></td>
                      <td className="px-4 py-3 overflow-hidden">
                        {atRisk
                          ? <button type="button" onClick={e => { e.stopPropagation(); onSelectDetails(d, 'security') }} aria-label={`View ${d.deviceName} security risk details`} className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[0.6rem] font-bold text-red-600 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"><AlertTriangle className="h-2.5 w-2.5" />At Risk</button>
                          : <button type="button" onClick={e => { e.stopPropagation(); onSelectDetails(d, 'security') }} aria-label={`View ${d.deviceName} security details`} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"><CheckCircle className="h-2.5 w-2.5" />Secure</button>
                        }
                      </td>
                      <td className="px-4 py-3 overflow-hidden">
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={e => { e.stopPropagation(); onSelectDevice(d) }}
                            title="Device details"
                            className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-1 text-indigo-600 hover:bg-indigo-100 hover:border-indigo-300 transition">
                            <Info className="h-3 w-3" />
                            <span className="text-[0.6rem] font-semibold">Info</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} itemLabel="device" />
          </div>
        )}
      </div>
      {showAgentInventory && createPortal(
        <MacSecurityAppInventoryModal
          inventory={agentInventory}
          loading={agentInventoryLoading}
          error={agentInventoryError}
          onRefresh={() => { void loadAgentInventory() }}
          onClose={() => setShowAgentInventory(false)}
        />,
        document.body
      )}
    </div>
  )
}

// ─── KPI Drill-down Modal ─────────────────────────────────────────────────────

function KpiDrillModal({
  title, icon, devices, accent, metric, onClose, onSelectDevice,
}: {
  title: string
  icon: React.ReactNode
  devices: ApiDevice[]
  accent: string
  metric?: DeviceMetricDetail
  onClose: () => void
  onSelectDevice: (d: ApiDevice) => void
}) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const detailKeys: DeviceMetricDetail[] = metric ? [metric] : ['filevault', 'compliance']
  const detailLabels: Record<DeviceMetricDetail, string> = {
    filevault: 'FileVault Status',
    compliance: 'Compliance Details',
  }

  function detailValue(device: ApiDevice, key: DeviceMetricDetail): string {
    if (key === 'filevault') return device.encryptionStatus || 'Not reported'
    return device.complianceState
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return devices
    return devices.filter(d =>
      d.deviceName.toLowerCase().includes(q) ||
      d.user.toLowerCase().includes(q) ||
      (d.model ?? '').toLowerCase().includes(q) ||
      (d.osVersion ?? '').toLowerCase().includes(q)
    )
  }, [devices, search])

  const sortedDevices = sortKey ? sortRows(filtered, device => {
    switch (sortKey) {
      case 'device': return device.deviceName
      case 'user': return device.user
      case 'model': return extractModelBase(device.model)
      case 'macos': return device.osVersion
      case 'filevault': return filevaultState(device)
      case 'compliance': return device.complianceState
      case 'checkin': return Date.parse(device.lastCheckIn) || device.lastCheckIn
      default: return ''
    }
  }, sortDirection) : filtered
  const { page, setPage, totalPages, paginated } = usePagination(sortedDevices, PAGE_SIZE)
  const handleSort = (key: string) => { setSortDirection(direction => toggleSortDirection(sortKey, direction, key)); setSortKey(key); setPage(1) }

  function handleExport() {
    const headers = ['Device', 'User', 'Model', 'macOS', ...detailKeys.map(key => detailLabels[key]), 'Last Check-in']
    const rows = filtered.map(d => [
      d.deviceName, d.user, d.model ?? '', d.osVersion ?? '',
      ...detailKeys.map(key => key === 'compliance'
        ? `${detailValue(d, key)}; Reason: ${d.primaryIssue && d.primaryIssue !== 'None' ? d.primaryIssue : 'No reason reported'}; Policy: ${d.policyFailed || 'Not reported'}; Checked: ${d.lastComplianceCheck || 'Not reported'}`
        : detailValue(d, key)),
      d.lastCheckIn,
    ])
    downloadCsv(`${title.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0,10)}.csv`, headers, rows as unknown as (string|number)[])
  }

  const accentRing = accent === 'emerald' ? 'focus:ring-emerald-300' : accent === 'red' ? 'focus:ring-red-300' : accent === 'orange' ? 'focus:ring-indigo-300' : 'focus:ring-slate-300'

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-pointer" />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50 flex-shrink-0">
          <div className="rounded-xl bg-slate-100 p-2 flex-shrink-0">{icon}</div>
          <div className="flex-1">
            <p className="font-bold text-slate-800 text-sm">{title}</p>
            <p className="text-[0.62rem] text-slate-400">{devices.length} device{devices.length !== 1 ? 's' : ''}</p>
            {metric === 'compliance' && <p className="mt-1 text-[0.62rem] text-amber-700">Warnings can indicate a policy issue or unavailable compliance details. Review each device reason below.</p>}
          </div>
          <button type="button" onClick={handleExport}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition mr-1">
            <Download className="h-3.5 w-3.5" />Export CSV
          </button>
          <button type="button" onClick={onClose}
            className="rounded-xl border border-slate-200 p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition flex-shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* Search */}
        <div className="px-6 py-3 border-b border-slate-100 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by device, user, model, OS…"
              className={`w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 py-2 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${accentRing} focus:border-transparent`} />
            {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="h-3 w-3" /></button>}
          </div>
        </div>
        {/* Table */}
        <div className="flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-slate-400 gap-2">
              <Apple className="h-7 w-7 opacity-30" /><p className="text-sm">No devices match</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
                <tr>
                  <SortableHeader label="Device" sortKey="device" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-4 py-3 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400" />
                  <SortableHeader label="User" sortKey="user" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-4 py-3 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400" />
                  <SortableHeader label="Model" sortKey="model" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-4 py-3 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400" />
                  <SortableHeader label="macOS" sortKey="macos" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-4 py-3 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400" />
                  {detailKeys.map(key => <SortableHeader key={key} label={detailLabels[key]} sortKey={key} activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-4 py-3 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400" />)}
                  <SortableHeader label="Last Check-in" sortKey="checkin" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-4 py-3 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400" />
                </tr>
              </thead>
              <tbody>
                {paginated.map((d, i) => (
                  <tr key={d.id} onClick={() => onSelectDevice(d)}
                    className={`border-b border-slate-100 last:border-0 cursor-pointer transition-colors hover:bg-indigo-50/60 ${i % 2 !== 0 ? 'bg-slate-50/40' : ''}`}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <Apple className="h-3 w-3 text-slate-400 flex-shrink-0" />
                        <CopyText value={d.deviceName} label="Device name"><span className="font-medium text-slate-800 truncate max-w-[140px]">{d.deviceName}</span></CopyText>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 truncate max-w-[120px]"><CopyText value={d.user} label="User">{d.user}</CopyText></td>
                    <td className="px-4 py-2.5 text-slate-500 truncate max-w-[100px]">{extractModelBase(d.model)}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-500">{d.osVersion}</td>
                    {detailKeys.map(key => (
                      <td key={key} className="px-4 py-2.5">
                        <span className={`font-medium ${key !== 'compliance' ? 'text-slate-700' : d.complianceState === 'Compliant' ? 'text-emerald-700' : d.complianceState === 'Warning' ? 'text-amber-700' : 'text-red-700'}`}>
                          {detailValue(d, key)}
                        </span>
                        {key === 'compliance' && (
                          <span className="block text-[0.6rem] text-slate-500">
                            {d.primaryIssue && d.primaryIssue !== 'None' ? `Reason: ${d.primaryIssue}` : d.policyFailed && d.policyFailed !== 'None' ? `Issue: ${d.policyFailed}` : 'No reported failed policy'}
                            {d.lastComplianceCheck ? ` · Checked: ${d.lastComplianceCheck}` : ''}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-slate-500">{d.lastCheckIn || 'Not reported'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {filtered.length > 0 && (
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} itemLabel="device" />
        )}
        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between flex-shrink-0">
          <span className="text-[0.65rem] text-slate-400">click a row to view details</span>
          <button type="button" onClick={onClose}
            className="rounded-xl bg-indigo-500 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-600 transition shadow-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'devices',      label: 'Devices',     icon: <Apple     className="h-3.5 w-3.5" /> },
  { id: 'security',     label: 'Security',    icon: <Shield    className="h-3.5 w-3.5" /> },
  { id: 'reports',      label: 'Reports',     icon: <BarChart2 className="h-3.5 w-3.5" /> },
]

export function MacDevicesPage({ onBack, embedded }: Props) {
  const [tab, setTab]                     = useState<Tab>('devices')
  const [devices, setDevices]             = useState<ApiDevice[]>([])
  const [loadingDevices, setLoadingDevices] = useState(true)
  const [fetchError, setFetchError]       = useState<string | null>(null)
  const [profileResults, setProfileResults] = useState<Record<string, ManageEngineFleetProfileResult>>({})
  const [profileResultsLoading, setProfileResultsLoading] = useState(false)
  const [profileResultsError, setProfileResultsError] = useState(false)
  const [panelDevice, setPanelDevice]     = useState<ApiDevice | null>(null)
  const [panelInitialTab, setPanelInitialTab] = useState<'overview' | 'security' | 'compliance' | 'logs'>('overview')
  const [kpiModal, setKpiModal]           = useState<{ title: string; icon: React.ReactNode; devices: ApiDevice[]; accent: string; detailTab?: 'security' | 'compliance'; metric?: DeviceMetricDetail } | null>(null)

  const requestDevices = () => {
    return api.fetchAllDevicesRaw({ platform: 'macOS', limit: 500 })
      .then(r => {
        setDevices(r.devices)
        setFetchError(null)
        if (!r.devices.some(device => device.managementSource === 'ManageEngine')) {
          setProfileResults({})
          setProfileResultsError(false)
          return
        }

        setProfileResultsLoading(true)
        setProfileResultsError(false)
        void api.fetchManageEngineFleetProfileResults()
          .then(response => setProfileResults(Object.fromEntries(response.results.map(result => [result.deviceId, result]))))
          .catch(() => setProfileResultsError(true))
          .finally(() => setProfileResultsLoading(false))
      })
      .catch((e: unknown) => {
        setDevices([])
        setFetchError(e instanceof Error ? e.message : 'Failed to load Mac devices')
      })
      .finally(() => setLoadingDevices(false))
  }

  const fetchAll = () => {
    setLoadingDevices(true)
    void requestDevices()
  }

  // loadingDevices is already true on first render.
  useEffect(() => { void requestDevices() }, [])

  const stats = useMemo(() => {
    const total        = devices.length
    const filevaultOn_ = devices.filter(d => filevaultOn(d)).length
    const filevaultReported = devices.filter(d => hasReportedStatus(d.encryptionStatus)).length
    const compliant    = devices.filter(d => d.complianceState === 'Compliant').length
    const warning      = devices.filter(d => d.complianceState === 'Warning').length
    const nonCompliant = devices.filter(d => d.complianceState === 'Non-Compliant').length
    return { total, filevaultOn: filevaultOn_, filevaultReported, compliant, warning, nonCompliant }
  }, [devices])

  const isLoading = loadingDevices

  const apiStatusPill = (
    <span className={`ag-live-label ${loadingDevices ? 'ag-live-checking' : fetchError ? 'ag-live-error' : ''}`}>
      <i />{loadingDevices ? 'Checking…' : fetchError ? 'ManageEngine API — Unavailable' : 'ManageEngine API'}
    </span>
  )

  return (
    <div className="flex flex-col gap-5 w-full">

      {/* ── Header ── */}
      {embedded ? (
        <div className="flex items-center justify-end gap-2">
          {apiStatusPill}
          <button type="button" onClick={fetchAll}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm transition ${isLoading ? 'border-indigo-300 bg-indigo-50 animate-pulse' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-indigo-500' : ''}`} />Refresh
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          <button type="button" onClick={onBack}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition">
            <ArrowLeft className="h-4 w-4" />Dashboard
          </button>
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-2xl bg-slate-100 border border-slate-200">
              <Apple className="h-5 w-5 text-slate-700" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Mac Devices</h1>
              <p className="text-xs text-slate-500 mt-0.5">Managed by ManageEngine — device & security reports</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {apiStatusPill}
            <button type="button" onClick={fetchAll}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm transition ${isLoading ? 'border-indigo-300 bg-indigo-50 animate-pulse' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-indigo-500' : ''}`} />Refresh
            </button>
          </div>
        </div>
      )}

      {/* ── Overview stat cards — each clickable, opens drill-down modal ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <button type="button" disabled={loadingDevices}
          onClick={() => setKpiModal({ title: 'All Mac Devices', icon: <Apple className="h-4 w-4 text-slate-600" />, devices: devices, accent: 'slate' })}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 flex items-center gap-3 text-left w-full transition hover:shadow-md hover:border-slate-400 disabled:cursor-default group">
          <div className="rounded-xl bg-slate-100 p-2 flex-shrink-0 group-hover:bg-slate-200 transition"><Apple className="h-4 w-4 text-slate-600" /></div>
          <div><p className="text-2xl font-black text-slate-800">{loadingDevices ? '—' : stats.total.toLocaleString()}</p><p className="text-[0.62rem] text-slate-400 font-medium">Total Macs</p></div>
        </button>
        <button type="button" disabled={loadingDevices}
          onClick={() => setKpiModal({ title: 'FileVault Enabled', icon: <Lock className="h-4 w-4 text-emerald-600" />, devices: devices.filter(d => filevaultOn(d)), accent: 'emerald' })}
          className="bg-white rounded-2xl border border-emerald-200 shadow-sm px-4 py-3 flex items-center gap-3 text-left w-full transition hover:shadow-md hover:border-emerald-400 disabled:cursor-default group">
          <div className="rounded-xl bg-emerald-100 p-2 flex-shrink-0 group-hover:bg-emerald-200 transition"><Lock className="h-4 w-4 text-emerald-600" /></div>
          <div>
            <p className="text-2xl font-black text-emerald-600">{loadingDevices ? '—' : stats.filevaultReported > 0 ? `${Math.round(stats.filevaultOn / stats.filevaultReported * 100)}%` : 'N/A'}</p>
            <p className="text-[0.62rem] text-slate-400 font-medium">FileVault On</p>
          </div>
        </button>
        <button type="button" disabled={loadingDevices}
          onClick={() => setTab('security')}
          className="bg-white rounded-2xl border border-indigo-200 shadow-sm px-4 py-3 flex items-center gap-3 text-left w-full transition hover:shadow-md hover:border-indigo-400 disabled:cursor-default group">
          <div className="rounded-xl bg-indigo-100 p-2 flex-shrink-0 group-hover:bg-indigo-200 transition"><Shield className="h-4 w-4 text-indigo-600" /></div>
          <div>
            <p className="text-lg font-black text-indigo-600">Apps</p>
            <p className="text-[0.62rem] text-slate-400 font-medium">Zscaler + CrowdStrike</p>
          </div>
        </button>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-1 bg-slate-100 rounded-2xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
              tab === t.id ? 'is-selected' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {tab === 'devices'      && <DevicesTab      devices={devices} loading={loadingDevices} profileResults={profileResults} profileResultsLoading={profileResultsLoading} profileResultsError={profileResultsError} onSelectDevice={d => { setPanelInitialTab('overview'); setPanelDevice(d) }} onViewLogs={d => { setPanelInitialTab('logs'); setPanelDevice(d) }} />}
      {tab === 'security'     && <SecurityTab     devices={devices} loading={loadingDevices} onSelectDevice={d => { setPanelInitialTab('overview'); setPanelDevice(d) }} onSelectDetails={(d, detailTab) => { setPanelInitialTab(detailTab); setPanelDevice(d) }} onShowGap={(title, icon, affectedDevices, accent, detailTab, metric) => setKpiModal({ title, icon, devices: affectedDevices, accent, detailTab, metric })} />}
      {tab === 'reports'      && <ReportsTab      devices={devices} />}

      {/* ── Device detail panel ── */}
      {panelDevice && (
        <>
          <div className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[1px] cursor-pointer" onClick={() => setPanelDevice(null)} aria-hidden />
          <div className="fixed right-0 top-0 bottom-0 z-40 w-full max-w-[600px] shadow-2xl border-l border-slate-200 overflow-hidden flex flex-col">
            <DeviceDetailPanel device={panelDevice} onBack={() => setPanelDevice(null)} backLabel={embedded ? 'Managed Devices' : 'Mac Devices'} initialTab={panelInitialTab} />
          </div>
        </>
      )}

      {/* ── KPI Drill-down Modal ── */}
      {kpiModal && createPortal(
        <KpiDrillModal
          title={kpiModal.title}
          icon={kpiModal.icon}
          devices={kpiModal.devices}
          accent={kpiModal.accent}
          metric={kpiModal.metric}
          onClose={() => setKpiModal(null)}
          onSelectDevice={d => { setPanelInitialTab(kpiModal.detailTab ?? 'overview'); setKpiModal(null); setPanelDevice(d) }}
        />,
        document.body
      )}

    </div>
  )
}
