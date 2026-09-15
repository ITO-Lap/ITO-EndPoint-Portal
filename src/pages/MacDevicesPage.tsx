import { useState, useEffect, useMemo, Fragment } from 'react'
import { createPortal } from 'react-dom'
import {
  Apple, ArrowLeft, RefreshCw, Shield, Lock, ShieldCheck, ShieldAlert,
  AlertTriangle, CheckCircle, XCircle, Search, X,
  Flame, ClipboardList, Info,
  BarChart2,
  Clock, Download, FileText, Filter,
} from 'lucide-react'
import { api } from '../api'
import type { ApiDevice } from '../api'
import { DeviceDetailPanel } from '../components/devices/DeviceDetailPanel'
import { useColumnResize } from '../hooks/useColumnResize'
import { usePagination } from '../hooks/usePagination'
import { Pagination } from '../components/ui/Pagination'
import { MacFleetReportsPage }       from './MacFleetReportsPage'

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
  { key: 'compliance', label: 'Compliance',         min:  80, default: 110 },
  { key: 'blueprint',  label: 'Applied Policy', min: 100, default: 180 },
] as const
type DColKey = typeof DEVICE_COLS[number]['key']

const SECURITY_COLS = [
  { key: 'device',   label: 'Device',           min: 120, default: 180 },
  { key: 'user',     label: 'User',             min:  80, default: 130 },
  { key: 'fv',       label: 'FileVault',        min:  70, default:  90 },
  { key: 'edr',      label: 'EDR Agent',        min:  80, default: 120 },
  { key: 'fw',       label: 'Firewall',         min:  70, default:  90 },
  { key: 'policies', label: 'Applied Policies', min: 100, default: 160 },
  { key: 'checkin',  label: 'Last Check-in',    min: 100, default: 140 },
  { key: 'risk',     label: 'Risk',             min:  60, default:  80 },
  { key: 'actions',  label: 'Actions',           min:  80, default:  90, noResize: true },
] as const
type SColKey = typeof SECURITY_COLS[number]['key']


// ─── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'devices' | 'security' | 'reports'

interface Props {
  onBack: () => void
  onViewDevice?: (deviceName: string) => void
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function extractModelBase(model?: string): string {
  if (!model) return 'Mac'
  const m = model.match(/^(MacBook Pro|MacBook Air|Mac mini|Mac Pro|Mac Studio|iMac|MacBook)/i)
  return m?.[1] ?? model.split('(')[0].trim()
}

function extractMajorMinor(osVersion?: string): string {
  const m = (osVersion ?? '').match(/(\d+\.\d+)/)
  return m?.[1] ?? osVersion ?? 'Unknown'
}

function filevaultOn(d: ApiDevice): boolean {
  return (d.encryptionStatus ?? '').toLowerCase().includes('on')
}

function edrLabel(d: ApiDevice): string {
  const av = d.antivirusStatus
  if (!av || av === '—' || av === 'None') return ''
  return av
}

function firewallEnabled(d: ApiDevice): boolean {
  return d.firewallStatus === 'Enabled'
}

function metricBar(label: string, value: number, total: number, color: string, icon: React.ReactNode) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  const barColor =
    color === 'emerald' ? 'bg-emerald-500' :
    color === 'orange'  ? 'bg-orange-500'  :
    color === 'amber'   ? 'bg-amber-500'   :
    color === 'red'     ? 'bg-red-500'     : 'bg-slate-400'
  const textColor =
    color === 'emerald' ? 'text-emerald-600' :
    color === 'orange'  ? 'text-orange-600'  :
    color === 'amber'   ? 'text-amber-600'   :
    color === 'red'     ? 'text-red-600'     : 'text-slate-600'
  const borderColor =
    color === 'emerald' ? 'border-emerald-200' :
    color === 'orange'  ? 'border-orange-200'  :
    color === 'amber'   ? 'border-amber-200'   :
    color === 'red'     ? 'border-red-200'     : 'border-slate-200'
  return (
    <div key={label} className={`bg-white rounded-2xl border ${borderColor} shadow-sm px-4 py-4 flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-semibold text-slate-700">{label}</span>
        </div>
        <span className={`text-lg font-black ${textColor}`}>{pct}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-2 rounded-full ${barColor} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[0.65rem] text-slate-400">
        <span className={`font-semibold ${textColor}`}>{value.toLocaleString()}</span> of {total.toLocaleString()} devices
      </p>
    </div>
  )
}

// ─── Report engine helpers ────────────────────────────────────────────────────

type ReportType = 'macos_versions' | 'stale_devices' | 'policy_compliance' | 'fleet_kpi_cards'

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
  { id: 'policy_compliance',  label: 'Policy Compliance',  description: 'Compliance rates by applied policy / profile', icon: <ClipboardList className="h-4 w-4" />, accent: 'purple',  group: 'analytical' },
  { id: 'fleet_kpi_cards',    label: 'Fleet KPI Cards',    description: 'Fleet health KPI dashboard',                   icon: <BarChart2     className="h-4 w-4" />, accent: 'orange',  group: 'full' },
]

type MacOSCategory = 'latest' | 'outdated' | 'eol'
function macOSCategory(version: string): MacOSCategory {
  const major = parseInt(version.split('.')[0] ?? '0')
  if (major >= 26) return 'latest'
  if (major >= 14) return 'outdated'
  return 'eol'
}

const MACOS_CAT_META: Record<MacOSCategory, { label: string; color: string; action: string }> = {
  latest:  { label: 'Latest (Tahoe)',  color: 'emerald', action: 'No action needed'       },
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

function DevicesTab({
  devices,
  loading,
  onSelectDevice,
}: {
  devices: ApiDevice[]
  loading: boolean
  onSelectDevice: (d: ApiDevice) => void
}) {
  const { widths: dw, startResize: dResize, totalWidth: dTotal } = useColumnResize<DColKey>(DEVICE_COLS, 'mac-devices')
  const [search, setSearch] = useState('')
  const [activeModel, setActiveModel] = useState<string | null>(null)
  const [activeOS, setActiveOS] = useState<string | null>(null)
  const [activeCompliance, setActiveCompliance] = useState<string | null>(null)

  const modelBreakdown = useMemo(() => {
    const map: Record<string, number> = {}
    devices.forEach(d => { const k = extractModelBase(d.model); map[k] = (map[k] ?? 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }))
  }, [devices])

  const osBreakdown = useMemo(() => {
    const map: Record<string, number> = {}
    devices.forEach(d => { const k = extractMajorMinor(d.osVersion); map[k] = (map[k] ?? 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }))
  }, [devices])

  const complianceBreakdown = useMemo(() => {
    const map: Record<string, number> = {}
    devices.forEach(d => { map[d.complianceState] = (map[d.complianceState] ?? 0) + 1 })
    return Object.entries(map).sort().map(([key, count]) => ({ key, count }))
  }, [devices])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return devices.filter(d => {
      if (activeModel && extractModelBase(d.model) !== activeModel) return false
      if (activeOS && extractMajorMinor(d.osVersion) !== activeOS) return false
      if (activeCompliance && d.complianceState !== activeCompliance) return false
      if (q && !d.deviceName.toLowerCase().includes(q) && !d.user.toLowerCase().includes(q) && !(d.osVersion ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [devices, search, activeModel, activeOS, activeCompliance])

  const { page, setPage, totalPages, paginated } = usePagination(filtered, PAGE_SIZE)

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-slate-400 gap-2">
      <RefreshCw className="h-4 w-4 animate-spin" /><span className="text-sm">Loading devices…</span>
    </div>
  )

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
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${isA ? 'border-orange-400 bg-orange-50 text-orange-700 ring-1 ring-orange-200' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                {key}
                <span className={`rounded-full px-1 text-[0.58rem] font-bold ${isA ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
              </button>
            )
          })}
          {active && <button type="button" onClick={() => onToggle(active)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-400 hover:bg-slate-50 transition">Clear ×</button>}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 flex flex-col gap-4">
        <Chips label="By Model" items={modelBreakdown} active={activeModel} onToggle={k => setActiveModel(p => p === k ? null : k)} />
        <Chips label="By macOS Version" items={osBreakdown} active={activeOS} onToggle={k => setActiveOS(p => p === k ? null : k)} />
        <Chips label="By Compliance" items={complianceBreakdown} active={activeCompliance} onToggle={k => setActiveCompliance(p => p === k ? null : k)} />
        {(activeModel || activeOS || activeCompliance) && (
          <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
            <span className="text-xs text-slate-500">{filtered.length} of {devices.length} devices</span>
            <button type="button" onClick={() => { setActiveModel(null); setActiveOS(null); setActiveCompliance(null) }} className="text-xs font-medium text-orange-600 hover:text-orange-700">Clear all</button>
          </div>
        )}
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search devices, users…"
          className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400" />
        {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="h-3 w-3" /></button>}
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
                  {DEVICE_COLS.map(col => (
                    <th key={col.key} className="relative px-4 py-3 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap overflow-hidden" style={{ width: dw[col.key] }}>
                      {col.label}
                      {!('noResize' in col && col.noResize) && (
                        <span className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                          onMouseDown={e => dResize(col.key, e)} onClick={e => e.stopPropagation()} />
                      )}
                    </th>
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
                          <span className="font-medium text-slate-800 truncate">{d.deviceName}</span>
                          {isNew && <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[0.55rem] font-bold text-emerald-700 flex-shrink-0">NEW</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs overflow-hidden"><span className="truncate block">{d.user}</span></td>
                      <td className="px-4 py-3 text-xs text-slate-500 overflow-hidden"><span className="truncate block">{d.model ? extractModelBase(d.model) : '—'}</span></td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-500 overflow-hidden"><span className="truncate block">{d.osVersion}</span></td>
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
                        {d.complianceState === 'Compliant'
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700"><ShieldCheck className="h-2.5 w-2.5" />Compliant</span>
                          : d.complianceState === 'Warning'
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[0.6rem] font-bold text-amber-700"><AlertTriangle className="h-2.5 w-2.5" />Warning</span>
                          : <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[0.6rem] font-bold text-red-600"><ShieldAlert className="h-2.5 w-2.5" />Non-Compliant</span>
                        }
                      </td>
                      <td className="px-4 py-3 overflow-hidden">
                        {d.appliedPolicies && d.appliedPolicies.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500 max-w-full">
                            <Shield className="h-3 w-3 text-orange-400 flex-shrink-0" />
                            <span className="truncate">{d.appliedPolicies[0]}</span>
                            {d.appliedPolicies.length > 1 && <span className="text-[0.6rem] text-slate-400 flex-shrink-0">+{d.appliedPolicies.length - 1}</span>}
                          </span>
                        ) : <span className="text-xs text-slate-300">—</span>}
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
  { key: 'model',    label: 'Model',           min:  70, default: 100 },
  { key: 'version',  label: 'macOS Version',   min:  80, default: 100 },
  { key: 'checkin',  label: 'Last Check-in',   min: 100, default: 140 },
  { key: 'category', label: 'Category',        min:  80, default: 110 },
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

const RPT_BP_COLS = [
  { key: 'blueprint', label: 'Applied Policy / Profile', min: 120, default: 220 },
  { key: 'devices',   label: 'Devices',            min:  60, default:  80 },
  { key: 'compliant', label: 'Compliant',          min:  70, default:  90 },
  { key: 'noncomp',   label: 'Non-Compliant',      min:  90, default: 110 },
  { key: 'rate',      label: 'Compliance Rate',    min: 100, default: 140 },
] as const
type BRColKey = typeof RPT_BP_COLS[number]['key']

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
  const [expandedRow,  setExpandedRow]  = useState<string | null>(null)
  const [staleThresh,  setStaleThresh]  = useState<7 | 14 | 30 | 60>(14)
  const [macFilter,    setMacFilter]    = useState<'all' | MacOSCategory>('all')
  const [checkInFilter,  setCheckInFilter]  = useState<'all' | 'today' | '1-2d' | '3-6d' | '7plus'>('all')

  // Column resize — one hook call per report table
  const { widths: mrW, startResize: mrR, totalWidth: mrT } = useColumnResize<MRColKey>(RPT_MACOS_COLS, 'rpt-macos')

  const { widths: stW, startResize: stR, totalWidth: stT } = useColumnResize<STColKey>(RPT_STALE_COLS, 'rpt-stale')
  const { widths: brW, startResize: brR, totalWidth: brT } = useColumnResize<BRColKey>(RPT_BP_COLS,    'rpt-bp')

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

  const blueprintRows = useMemo(() => {
    const map: Record<string, ApiDevice[]> = {}
    devices.forEach(d => {
      const bp = d.appliedPolicies?.[0] ?? 'Unassigned'
      if (!map[bp]) map[bp] = []
      map[bp].push(d)
    })
    return Object.entries(map).map(([bp, devs]) => ({
      blueprint: bp,
      total: devs.length,
      compliant: devs.filter(d => d.complianceState === 'Compliant').length,
      devices: devs,
    })).sort((a, b) => b.total - a.total)
  }, [devices])

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
  const { page: macPage, setPage: setMacPage, totalPages: macTotalPages, paginated: macPaginated } = usePagination(macFilteredRows, PAGE_SIZE)

  const staleSortedRows = useMemo(() => [...staleRows].sort((a, b) => b.days - a.days), [staleRows])
  const { page: stalePage, setPage: setStalePage, totalPages: staleTotalPages, paginated: stalePaginated } = usePagination(staleSortedRows, PAGE_SIZE)

  const { page: bpPage, setPage: setBpPage, totalPages: bpTotalPages, paginated: bpPaginated } = usePagination(blueprintRows, PAGE_SIZE)

  // ── CSV export ────────────────────────────────────────────────────────────────

  function handleExport() {
    const ts = new Date().toISOString().slice(0, 10)
    if (activeReport === 'macos_versions') {
      downloadCsv(`macos-versions-${ts}.csv`,
        ['Device', 'User', 'macOS Version', 'Category', 'Action Required'],
        devices.map(d => {
          const cat = macOSCategory(d.osVersion ?? '')
          return [d.deviceName, d.user, d.osVersion, MACOS_CAT_META[cat].label, MACOS_CAT_META[cat].action]
        }) as unknown as (string | number)[],
      )
    } else if (activeReport === 'stale_devices') {
      downloadCsv(`stale-devices-${ts}.csv`,
        ['Device', 'User', 'Model', 'Last Check-in', 'Days Inactive'],
        staleRows.map(r => [r.device.deviceName, r.device.user, r.device.model ?? '', r.device.lastCheckIn, r.days]) as unknown as (string | number)[],
      )
    } else if (activeReport === 'policy_compliance') {
      downloadCsv(`policy-compliance-${ts}.csv`,
        ['Policy / Profile', 'Devices', 'Compliant', 'Non-Compliant', 'Compliance %'],
        blueprintRows.map(r => [r.blueprint, r.total, r.compliant, r.total - r.compliant, Math.round(r.compliant / r.total * 100)]) as unknown as (string | number)[],
      )
    }
  }

  // ── Shared UI helpers ─────────────────────────────────────────────────────────

  function PctBar({ pct, color }: { pct: number; color: string }) {
    const barCls = color === 'emerald' ? 'bg-emerald-400' : color === 'orange' ? 'bg-orange-400' : color === 'amber' ? 'bg-amber-400' : color === 'red' ? 'bg-red-400' : 'bg-slate-400'
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden min-w-[48px]">
          <div className={`h-1.5 rounded-full ${barCls}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="tabular-nums font-semibold text-slate-700 text-[0.7rem] w-8 text-right">{pct}%</span>
      </div>
    )
  }

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
                className={`bg-white rounded-2xl border shadow-sm px-4 py-3 text-left transition hover:shadow-md ${macFilter === cat ? 'ring-2 ring-orange-300' : ''} ${c.split(' ')[0]}`}>
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
                  <th key={c.key} className="relative px-4 py-2.5 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 overflow-hidden">
                    {c.label}
                    <span className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                      onMouseDown={e => mrR(c.key, e)} onClick={e => e.stopPropagation()} />
                  </th>
                ))}
              </tr></thead>
              <tbody>
                {macPaginated.map((d, i) => {
                  const cat  = macOSCategory(d.osVersion ?? '')
                  const meta = MACOS_CAT_META[cat]
                  const badgeCls = cat === 'latest' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : cat === 'outdated' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-red-50 border-red-200 text-red-700'
                  return (
                    <tr key={d.id} className={`border-b border-slate-100 last:border-0 ${i%2 ? 'bg-slate-50/40' : ''}`}>
                      <td className="px-4 py-2.5 overflow-hidden"><span className="flex items-center gap-1.5"><Apple className="h-3 w-3 text-slate-400 flex-shrink-0" /><span className="font-medium text-slate-700 truncate block">{d.deviceName}</span></span></td>
                      <td className="px-4 py-2.5 text-slate-500 overflow-hidden truncate">{d.user}</td>
                      <td className="px-4 py-2.5 text-slate-500 overflow-hidden truncate">{d.model ? extractModelBase(d.model) : '—'}</td>
                      <td className="px-4 py-2.5 font-mono font-bold text-slate-700 overflow-hidden truncate">{d.osVersion}</td>
                      <td className="px-4 py-2.5 overflow-hidden">
                        <span className="flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${checkInDot(d.lastCheckIn)}`} />
                          <span className="truncate text-slate-500">{d.lastCheckIn}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5 overflow-hidden"><span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.58rem] font-bold ${badgeCls}`}>{meta.label}</span></td>
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
            <button key={d} type="button" onClick={() => setStaleThresh(d)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${staleThresh === d ? 'bg-amber-500 border-amber-500 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
              {d}+ days
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-400">{staleRows.length} device{staleRows.length !== 1 ? 's' : ''} inactive ≥ {staleThresh} days</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([7, 14, 30, 60] as const).map(d => (
            <div key={d} className={`bg-white rounded-2xl border shadow-sm px-4 py-3 ${d >= 30 ? 'border-amber-200' : 'border-slate-200'}`}>
              <p className={`text-2xl font-black ${d >= 30 ? 'text-amber-600' : 'text-slate-700'}`}>{counts[d]}</p>
              <p className="text-[0.62rem] text-slate-400 mt-0.5">Inactive ≥ {d} days</p>
            </div>
          ))}
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
                    <th key={c.key} className="relative px-4 py-2.5 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 overflow-hidden">
                      {c.label}
                      <span className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                        onMouseDown={e => stR(c.key, e)} onClick={e => e.stopPropagation()} />
                    </th>
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

  function BlueprintPolicyReport() {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Policy Groups',       value: blueprintRows.length, border: 'border-slate-200',  txt: 'text-slate-800'  },
            { label: 'Avg Compliance Rate', value: `${Math.round(blueprintRows.reduce((s,r) => s + Math.round(r.compliant/r.total*100), 0) / Math.max(1, blueprintRows.length))}%`, border: 'border-emerald-200', txt: 'text-emerald-600' },
            { label: 'Unassigned Devices',  value: blueprintRows.find(r => r.blueprint === 'Unassigned')?.total ?? 0, border: 'border-amber-200', txt: 'text-amber-600' },
          ].map(c => (
            <div key={c.label} className={`bg-white rounded-2xl border ${c.border} shadow-sm px-4 py-3`}>
              <p className={`text-2xl font-black ${c.txt}`}>{c.value}</p>
              <p className="text-[0.62rem] text-slate-400 mt-0.5">{c.label}</p>
            </div>
          ))}
        </div>
        <TableWrap title="Policy / Profile Breakdown" count={blueprintRows.length} footer="Click a row to see devices under that policy · Drag column edges to resize"
          pagination={<Pagination page={bpPage} totalPages={bpTotalPages} onPageChange={setBpPage} totalItems={blueprintRows.length} pageSize={PAGE_SIZE} itemLabel="policy" />}>
          <div className="overflow-x-auto">
            <table className="text-xs" style={{ tableLayout: 'fixed', width: brT }}>
              <colgroup>{RPT_BP_COLS.map(c => <col key={c.key} style={{ width: brW[c.key] }} />)}</colgroup>
              <thead><tr className="border-b border-slate-100 text-left bg-slate-50">
                {RPT_BP_COLS.map(c => (
                  <th key={c.key} className="relative px-4 py-2.5 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 overflow-hidden">
                    {c.label}
                    <span className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                      onMouseDown={e => brR(c.key, e)} onClick={e => e.stopPropagation()} />
                  </th>
                ))}
              </tr></thead>
              <tbody>
                {bpPaginated.map((r) => {
                  const pct     = Math.round(r.compliant / r.total * 100)
                  const isOpen  = expandedRow === r.blueprint
                  const nonComp = r.total - r.compliant
                  return (
                    <Fragment key={r.blueprint}>
                      <tr onClick={() => setExpandedRow(p => p === r.blueprint ? null : r.blueprint)}
                        className={`border-b border-slate-100 cursor-pointer transition ${isOpen ? 'bg-orange-50' : 'hover:bg-slate-50'}`}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <Shield className="h-3 w-3 text-orange-400 flex-shrink-0" />
                            <span className="font-medium text-slate-700">{r.blueprint}</span>
                            {r.blueprint === 'Unassigned' && <span className="rounded-full bg-amber-100 border border-amber-200 px-1 py-0.5 text-[0.55rem] font-bold text-amber-600">No policy</span>}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 font-bold text-slate-700">{r.total}</td>
                        <td className="px-4 py-2.5 font-semibold text-emerald-600">{r.compliant}</td>
                        <td className="px-4 py-2.5 font-semibold text-red-500">{nonComp}</td>
                        <td className="px-4 py-2.5 min-w-[120px]"><PctBar pct={pct} color={pct >= 80 ? 'emerald' : pct >= 60 ? 'amber' : 'red'} /></td>
                      </tr>
                      {isOpen && (
                        <tr key={`${r.blueprint}-exp`} className="bg-orange-50/40 border-b border-orange-100">
                          <td colSpan={5} className="px-5 py-3">
                            <p className="text-[0.65rem] font-semibold text-slate-500 mb-2">{r.devices.length} device{r.devices.length!==1?'s':''} under this policy</p>
                            <div className="flex flex-wrap gap-1.5">
                              {r.devices.map(d => (
                                <span key={d.id} className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[0.62rem] font-medium ${d.complianceState === 'Compliant' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
                                  <Apple className="h-2.5 w-2.5" />{d.deviceName}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
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

      {/* ── Report selector — two groups ── */}
      <div className="flex flex-col gap-4 bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4">
        {/* Analytical reports */}
        <div>
          <p className="text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide mb-2.5">Analytical Reports</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
            {analyticalDefs.map(d => {
              const isActive = activeReport === d.id
              return (
                <button key={d.id} type="button" onClick={() => { setActiveReport(d.id); setExpandedRow(null) }}
                  className={`flex flex-col gap-1.5 rounded-xl border px-3 py-3 text-left transition shadow-sm hover:shadow-md ${
                    isActive ? 'border-orange-400 bg-orange-50 ring-2 ring-orange-200' : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                  }`}>
                  <div className={`rounded-lg p-1.5 w-fit ${isActive ? 'bg-orange-100 text-orange-600' : 'bg-white text-slate-500 border border-slate-200'}`}>{d.icon}</div>
                  <p className={`text-[0.65rem] font-bold leading-tight ${isActive ? 'text-orange-700' : 'text-slate-700'}`}>{d.label}</p>
                  <p className="text-[0.58rem] text-slate-400 leading-tight hidden sm:block">{d.description}</p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-100" />

        {/* Full-page reports */}
        <div>
          <p className="text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide mb-2.5">Full Report Views</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {fullDefs.map(d => {
              const isActive = activeReport === d.id
              return (
                <button key={d.id} type="button" onClick={() => { setActiveReport(d.id); setExpandedRow(null) }}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition shadow-sm hover:shadow-md ${
                    isActive ? 'border-orange-400 bg-orange-50 ring-2 ring-orange-200' : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                  }`}>
                  <div className={`rounded-lg p-2 flex-shrink-0 ${isActive ? 'bg-orange-100 text-orange-600' : 'bg-white text-slate-500 border border-slate-200'}`}>{d.icon}</div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className={`text-xs font-bold ${isActive ? 'text-orange-700' : 'text-slate-700'}`}>{d.label}</p>
                      <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[0.55rem] font-bold text-slate-500 uppercase tracking-wide">Full Page</span>
                    </div>
                    <p className="text-[0.62rem] text-slate-400 mt-0.5">{d.description}</p>
                  </div>
                </button>
              )
            })}
          </div>
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
      {activeReport === 'policy_compliance'  && BlueprintPolicyReport()}

      {/* Active full-page report */}
      {activeReport === 'fleet_kpi_cards'  && <MacFleetReportsPage />}

    </div>
  )
}

// ─── Security Tab ──────────────────────────────────────────────────────────────

type GapFilter = 'filevault' | 'edr' | 'firewall' | 'compliance' | null

function SecurityTab({
  devices,
  loading,
  onSelectDevice,
}: {
  devices: ApiDevice[]
  loading: boolean
  onSelectDevice: (d: ApiDevice) => void
}) {
  const { widths: sw, startResize: sResize, totalWidth: sTotal } = useColumnResize<SColKey>(SECURITY_COLS, 'mac-security')
  const [search, setSearch] = useState('')
  const [riskFilter, setRiskFilter] = useState<'All' | 'At Risk' | 'Secure'>('All')
  const [gapFilter, setGapFilter] = useState<GapFilter>(null)

  const total = devices.length

  const secStats = useMemo(() => ({
    filevaultOn:  devices.filter(d => filevaultOn(d)).length,
    edrActive:    devices.filter(d => !!edrLabel(d)).length,
    firewallOn:   devices.filter(d => firewallEnabled(d)).length,
    compliant:    devices.filter(d => d.complianceState === 'Compliant').length,
    noFileVault:  devices.filter(d => !filevaultOn(d)).length,
    noEdr:        devices.filter(d => !edrLabel(d)).length,
    noFirewall:   devices.filter(d => !firewallEnabled(d)).length,
    nonCompliant: devices.filter(d => d.complianceState !== 'Compliant').length,
  }), [devices])

  function isAtRisk(d: ApiDevice): boolean {
    return !filevaultOn(d) || !edrLabel(d) || d.complianceState !== 'Compliant'
  }

  function matchesGap(d: ApiDevice, gap: GapFilter): boolean {
    if (!gap) return true
    if (gap === 'filevault')  return !filevaultOn(d)
    if (gap === 'edr')        return !edrLabel(d)
    if (gap === 'firewall')   return !firewallEnabled(d)
    if (gap === 'compliance') return d.complianceState !== 'Compliant'
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
  }, [devices, search, riskFilter, gapFilter])

  const { page, setPage, totalPages, paginated } = usePagination(filtered, PAGE_SIZE)

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
    edr:        'No EDR',
    firewall:   'No Firewall',
    compliance: 'Non-Compliant',
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {metricBar('FileVault Encryption', secStats.filevaultOn, total, 'emerald', <Lock className="h-3.5 w-3.5 text-emerald-500" />)}
        {metricBar('EDR / CrowdStrike', secStats.edrActive, total, 'orange', <Shield className="h-3.5 w-3.5 text-orange-500" />)}
        {metricBar('macOS Firewall', secStats.firewallOn, total, 'amber', <Flame className="h-3.5 w-3.5 text-amber-500" />)}
        {metricBar('MDM Compliance', secStats.compliant, total, 'emerald', <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />)}
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
              <button type="button" onClick={() => toggleGap('filevault')}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-all ${gapFilter === 'filevault' ? 'border-red-400 bg-red-100 ring-2 ring-red-200 shadow-sm' : 'border-red-200 bg-red-50 hover:bg-red-100 hover:border-red-300'}`}>
                <Lock className="h-3.5 w-3.5 text-red-500" />
                <span className="text-xs font-semibold text-red-700">{secStats.noFileVault} without FileVault</span>
                {gapFilter === 'filevault' && <X className="h-3 w-3 text-red-400 ml-1" />}
              </button>
            )}
            {secStats.noEdr > 0 && (
              <button type="button" onClick={() => toggleGap('edr')}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-all ${gapFilter === 'edr' ? 'border-orange-400 bg-orange-100 ring-2 ring-orange-200 shadow-sm' : 'border-orange-200 bg-orange-50 hover:bg-orange-100 hover:border-orange-300'}`}>
                <Shield className="h-3.5 w-3.5 text-orange-500" />
                <span className="text-xs font-semibold text-orange-700">{secStats.noEdr} without EDR</span>
                {gapFilter === 'edr' && <X className="h-3 w-3 text-orange-400 ml-1" />}
              </button>
            )}
            {secStats.noFirewall > 0 && (
              <button type="button" onClick={() => toggleGap('firewall')}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-all ${gapFilter === 'firewall' ? 'border-amber-400 bg-amber-100 ring-2 ring-amber-200 shadow-sm' : 'border-amber-200 bg-amber-50 hover:bg-amber-100 hover:border-amber-300'}`}>
                <Flame className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs font-semibold text-amber-700">{secStats.noFirewall} without Firewall</span>
                {gapFilter === 'firewall' && <X className="h-3 w-3 text-amber-400 ml-1" />}
              </button>
            )}
            {secStats.nonCompliant > 0 && (
              <button type="button" onClick={() => toggleGap('compliance')}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-all ${gapFilter === 'compliance' ? 'border-red-400 bg-red-100 ring-2 ring-red-200 shadow-sm' : 'border-red-200 bg-red-50 hover:bg-red-100 hover:border-red-300'}`}>
                <ShieldAlert className="h-3.5 w-3.5 text-red-500" />
                <span className="text-xs font-semibold text-red-700">{secStats.nonCompliant} non-compliant</span>
                {gapFilter === 'compliance' && <X className="h-3 w-3 text-red-400 ml-1" />}
              </button>
            )}
            {secStats.noFileVault === 0 && secStats.noEdr === 0 && secStats.nonCompliant === 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-xs font-semibold text-emerald-700">No security gaps detected</span>
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
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2 text-xs text-slate-700 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400" />
          {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="h-3 w-3" /></button>}
        </div>
        <div className="flex rounded-xl border border-slate-200 bg-slate-50 overflow-hidden text-xs">
          {(['All', 'At Risk', 'Secure'] as const).map(f => (
            <button key={f} type="button" onClick={() => { setRiskFilter(f); setGapFilter(null) }}
              className={`px-3 py-2 font-medium transition ${riskFilter === f && !gapFilter ? (f === 'At Risk' ? 'bg-red-500 text-white' : 'bg-orange-500 text-white') : 'text-slate-600 hover:bg-slate-100'}`}>{f}</button>
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
            <table className="text-sm" style={{ tableLayout: 'fixed', width: sTotal }}>
              <colgroup>
                {SECURITY_COLS.map(col => <col key={col.key} style={{ width: sw[col.key] }} />)}
              </colgroup>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-left">
                  {SECURITY_COLS.map(col => (
                    <th key={col.key} className="relative px-4 py-3 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap overflow-hidden" style={{ width: sw[col.key] }}>
                      {col.label}
                      {!('noResize' in col && col.noResize) && (
                        <span className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                          onMouseDown={e => sResize(col.key, e)} onClick={e => e.stopPropagation()} />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((d, i) => {
                  const fv  = filevaultOn(d)
                  const edr = edrLabel(d)
                  const fw  = firewallEnabled(d)
                  const atRisk = !fv || !edr || d.complianceState !== 'Compliant'
                  const policyCount = d.appliedPolicies?.length ?? 0

                  return (
                    <tr key={d.id} onClick={() => onSelectDevice(d)}
                      className={`border-b border-slate-100 last:border-0 transition hover:bg-slate-50 cursor-pointer ${i % 2 !== 0 ? 'bg-slate-50/40' : ''}`}>
                      <td className="px-4 py-3 overflow-hidden">
                        <div className="flex items-center gap-2">
                          <Apple className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                          <span className="font-medium text-slate-800 text-xs truncate">{d.deviceName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 overflow-hidden"><span className="truncate block">{d.user}</span></td>
                      <td className="px-4 py-3 overflow-hidden">
                        {fv
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700"><CheckCircle className="h-2.5 w-2.5" />On</span>
                          : <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[0.6rem] font-bold text-red-600"><XCircle className="h-2.5 w-2.5" />Off</span>
                        }
                      </td>
                      <td className="px-4 py-3 overflow-hidden">
                        {edr
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700"><CheckCircle className="h-2.5 w-2.5" /><span className="truncate">{edr}</span></span>
                          : <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 border border-orange-200 px-2 py-0.5 text-[0.6rem] font-bold text-orange-600"><AlertTriangle className="h-2.5 w-2.5" />Not detected</span>
                        }
                      </td>
                      <td className="px-4 py-3 overflow-hidden">
                        {fw
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700"><CheckCircle className="h-2.5 w-2.5" />Enabled</span>
                          : <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[0.6rem] font-bold text-amber-600"><AlertTriangle className="h-2.5 w-2.5" />Unknown</span>
                        }
                      </td>
                      <td className="px-4 py-3 overflow-hidden">
                        {policyCount > 0
                          ? <span className="inline-flex items-center gap-1 text-xs text-slate-600"><Shield className="h-3 w-3 text-orange-400 flex-shrink-0" />{policyCount} polic{policyCount !== 1 ? 'ies' : 'y'}</span>
                          : <span className="text-xs text-slate-300">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 overflow-hidden"><span className="truncate block">{d.lastCheckIn}</span></td>
                      <td className="px-4 py-3 overflow-hidden">
                        {atRisk
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[0.6rem] font-bold text-red-600"><AlertTriangle className="h-2.5 w-2.5" />At Risk</span>
                          : <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700"><CheckCircle className="h-2.5 w-2.5" />Secure</span>
                        }
                      </td>
                      <td className="px-4 py-3 overflow-hidden">
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={e => { e.stopPropagation(); onSelectDevice(d) }}
                            title="Device details"
                            className="inline-flex items-center gap-1 rounded-md border border-orange-200 bg-orange-50 px-1.5 py-1 text-orange-600 hover:bg-orange-100 hover:border-orange-300 transition">
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
    </div>
  )
}

// ─── KPI Drill-down Modal ─────────────────────────────────────────────────────

function KpiDrillModal({
  title, icon, devices, accent, onClose, onSelectDevice,
}: {
  title: string
  icon: React.ReactNode
  devices: ApiDevice[]
  accent: string
  onClose: () => void
  onSelectDevice: (d: ApiDevice) => void
}) {
  const [search, setSearch] = useState('')

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

  const { page, setPage, totalPages, paginated } = usePagination(filtered, PAGE_SIZE)

  function handleExport() {
    const headers = ['Device', 'User', 'Model', 'macOS', 'FileVault', 'EDR', 'Compliance']
    const rows = filtered.map(d => [
      d.deviceName, d.user, d.model ?? '', d.osVersion ?? '',
      filevaultOn(d) ? 'On' : 'Off',
      edrLabel(d) || 'None',
      d.complianceState,
    ])
    downloadCsv(`${title.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0,10)}.csv`, headers, rows as unknown as (string|number)[])
  }

  const accentRing = accent === 'emerald' ? 'focus:ring-emerald-300' : accent === 'red' ? 'focus:ring-red-300' : accent === 'orange' ? 'focus:ring-orange-300' : 'focus:ring-slate-300'

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
          </div>
          <button type="button" onClick={handleExport}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 transition mr-1">
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
                  {['Device', 'User', 'Model', 'macOS', 'FileVault', 'EDR', 'Compliance'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((d, i) => (
                  <tr key={d.id} onClick={() => onSelectDevice(d)}
                    className={`border-b border-slate-100 last:border-0 cursor-pointer transition-colors hover:bg-orange-50/60 ${i % 2 !== 0 ? 'bg-slate-50/40' : ''}`}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <Apple className="h-3 w-3 text-slate-400 flex-shrink-0" />
                        <span className="font-medium text-slate-800 truncate max-w-[140px]">{d.deviceName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 truncate max-w-[120px]">{d.user}</td>
                    <td className="px-4 py-2.5 text-slate-500 truncate max-w-[100px]">{extractModelBase(d.model)}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-500">{d.osVersion}</td>
                    <td className="px-4 py-2.5">
                      {filevaultOn(d)
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700"><CheckCircle className="h-2.5 w-2.5" />On</span>
                        : <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[0.6rem] font-bold text-red-600"><XCircle className="h-2.5 w-2.5" />Off</span>
                      }
                    </td>
                    <td className="px-4 py-2.5">
                      {edrLabel(d)
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 border border-orange-200 px-2 py-0.5 text-[0.6rem] font-bold text-orange-700"><Shield className="h-2.5 w-2.5" />{edrLabel(d)}</span>
                        : <span className="text-slate-300">None</span>
                      }
                    </td>
                    <td className="px-4 py-2.5">
                      {d.complianceState === 'Compliant'
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700"><ShieldCheck className="h-2.5 w-2.5" />Compliant</span>
                        : d.complianceState === 'Warning'
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[0.6rem] font-bold text-amber-700"><AlertTriangle className="h-2.5 w-2.5" />Warning</span>
                        : <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[0.6rem] font-bold text-red-600"><ShieldAlert className="h-2.5 w-2.5" />Non-Compliant</span>
                      }
                    </td>
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
            className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-600 transition shadow-sm">
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

export function MacDevicesPage({ onBack, onViewDevice: _onViewDevice }: Props) {
  const [tab, setTab]                     = useState<Tab>('devices')
  const [devices, setDevices]             = useState<ApiDevice[]>([])
  const [loadingDevices, setLoadingDevices] = useState(true)
  const [panelDevice, setPanelDevice]     = useState<ApiDevice | null>(null)
  const [kpiModal, setKpiModal]           = useState<{ title: string; icon: React.ReactNode; devices: ApiDevice[]; accent: string } | null>(null)

  const fetchAll = () => {
    setLoadingDevices(true)
    api.fetchAllDevicesRaw({ platform: 'macOS', limit: 500 })
      .then(r => setDevices(r.devices))
      .catch(() => setDevices([]))
      .finally(() => setLoadingDevices(false))
  }

  useEffect(() => { fetchAll() }, [])

  const stats = useMemo(() => {
    const total        = devices.length
    const filevaultOn_ = devices.filter(d => filevaultOn(d)).length
    const edrActive    = devices.filter(d => !!edrLabel(d)).length
    const compliant    = devices.filter(d => d.complianceState === 'Compliant').length
    const warning      = devices.filter(d => d.complianceState === 'Warning').length
    const nonCompliant = devices.filter(d => d.complianceState === 'Non-Compliant').length
    return { total, filevaultOn: filevaultOn_, edrActive, compliant, warning, nonCompliant }
  }, [devices])

  const isLoading = loadingDevices

  return (
    <div className="flex flex-col gap-5 w-full">

      {/* ── Header ── */}
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
          <button type="button" onClick={fetchAll}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm transition ${isLoading ? 'border-orange-300 bg-orange-50 animate-pulse' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-orange-500' : ''}`} />Refresh
          </button>
        </div>
      </div>

      {/* ── Overview stat cards — each clickable, opens drill-down modal ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
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
            <p className="text-2xl font-black text-emerald-600">{loadingDevices ? '—' : stats.total > 0 ? `${Math.round(stats.filevaultOn / stats.total * 100)}%` : '—'}</p>
            <p className="text-[0.62rem] text-slate-400 font-medium">FileVault On</p>
          </div>
        </button>
        <button type="button" disabled={loadingDevices}
          onClick={() => setKpiModal({ title: 'EDR Active', icon: <Shield className="h-4 w-4 text-orange-600" />, devices: devices.filter(d => !!edrLabel(d)), accent: 'orange' })}
          className="bg-white rounded-2xl border border-orange-200 shadow-sm px-4 py-3 flex items-center gap-3 text-left w-full transition hover:shadow-md hover:border-orange-400 disabled:cursor-default group">
          <div className="rounded-xl bg-orange-100 p-2 flex-shrink-0 group-hover:bg-orange-200 transition"><Shield className="h-4 w-4 text-orange-600" /></div>
          <div>
            <p className="text-2xl font-black text-orange-600">{loadingDevices ? '—' : stats.total > 0 ? `${Math.round(stats.edrActive / stats.total * 100)}%` : '—'}</p>
            <p className="text-[0.62rem] text-slate-400 font-medium">EDR Active</p>
          </div>
        </button>
        <button type="button" disabled={loadingDevices}
          onClick={() => setKpiModal({ title: 'Compliant Devices', icon: <ShieldCheck className="h-4 w-4 text-emerald-600" />, devices: devices.filter(d => d.complianceState === 'Compliant'), accent: 'emerald' })}
          className="bg-white rounded-2xl border border-emerald-200 shadow-sm px-4 py-3 flex items-center gap-3 text-left w-full transition hover:shadow-md hover:border-emerald-400 disabled:cursor-default group">
          <div className="rounded-xl bg-emerald-100 p-2 flex-shrink-0 group-hover:bg-emerald-200 transition"><ShieldCheck className="h-4 w-4 text-emerald-600" /></div>
          <div>
            <p className="text-2xl font-black text-emerald-600">{loadingDevices ? '—' : stats.compliant.toLocaleString()}</p>
            <p className="text-[0.62rem] text-slate-400 font-medium">Compliant</p>
          </div>
        </button>
        <button type="button" disabled={loadingDevices}
          onClick={() => setKpiModal({ title: 'Needs Attention', icon: <ShieldAlert className="h-4 w-4 text-red-600" />, devices: devices.filter(d => d.complianceState !== 'Compliant'), accent: 'red' })}
          className="bg-white rounded-2xl border border-red-200 shadow-sm px-4 py-3 flex items-center gap-3 text-left w-full transition hover:shadow-md hover:border-red-400 disabled:cursor-default group">
          <div className="rounded-xl bg-red-100 p-2 flex-shrink-0 group-hover:bg-red-200 transition"><ShieldAlert className="h-4 w-4 text-red-600" /></div>
          <div>
            <p className="text-2xl font-black text-red-600">{loadingDevices ? '—' : (stats.warning + stats.nonCompliant).toLocaleString()}</p>
            <p className="text-[0.62rem] text-slate-400 font-medium">Needs Attention</p>
          </div>
        </button>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-1 bg-slate-100 rounded-2xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
              tab === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {tab === 'devices'      && <DevicesTab      devices={devices} loading={loadingDevices} onSelectDevice={setPanelDevice} />}
      {tab === 'security'     && <SecurityTab     devices={devices} loading={loadingDevices} onSelectDevice={setPanelDevice} />}
      {tab === 'reports'      && <ReportsTab      devices={devices} />}

      {/* ── Device detail panel ── */}
      {panelDevice && (
        <>
          <div className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[1px] cursor-pointer" onClick={() => setPanelDevice(null)} aria-hidden />
          <div className="fixed right-0 top-0 bottom-0 z-40 w-full max-w-[600px] shadow-2xl border-l border-slate-200 overflow-hidden flex flex-col">
            <DeviceDetailPanel device={panelDevice} onBack={() => setPanelDevice(null)} backLabel="Mac Devices" />
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
          onClose={() => setKpiModal(null)}
          onSelectDevice={d => { setKpiModal(null); setPanelDevice(d) }}
        />,
        document.body
      )}

    </div>
  )
}
