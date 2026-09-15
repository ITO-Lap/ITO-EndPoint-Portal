import { useState, useEffect, useCallback } from 'react'
import { useColumnResize } from '../../hooks/useColumnResize'
import { usePagination } from '../../hooks/usePagination'
import { Pagination } from '../ui/Pagination'
import { X, Monitor, Laptop, Globe, Search, RefreshCw, Lock, LockOpen, ChevronRight } from 'lucide-react'
import { api, type ApiDevice } from '../../api'
import { DeviceDetailPanel } from './DeviceDetailPanel'

const PAGE_SIZE = 50

// ── Resizable column definitions ──────────────────────────────────────────────
const COLS = [
  { key: 'device',     label: 'Device',        min: 120, default: 200 },
  { key: 'user',       label: 'User',           min:  80, default: 180 },
  { key: 'source',     label: 'Source',         min:  80, default: 110 },
  { key: 'os',         label: 'OS',             min:  80, default: 130 },
  { key: 'compliance', label: 'Compliance',     min:  90, default: 120 },
  { key: 'checkin',    label: 'Last Check-in',  min: 100, default: 155 },
  { key: 'encryption', label: 'Encryption',     min:  90, default: 130 },
  { key: 'issue',      label: 'Issue',          min: 100, default: 200 },
  { key: 'actions',    label: '',               min:  60, default:  80, noResize: true },
] as const

const SOURCE_TABS = [
  { id: 'all',          label: 'All Sources',  activeClass: 'bg-slate-900 text-white' },
  { id: 'intune',       label: 'Intune',        activeClass: 'bg-orange-600 text-white'  },
  { id: 'manageengine', label: 'ManageEngine',  activeClass: 'bg-orange-500 text-white' },
] as const

type SourceId      = typeof SOURCE_TABS[number]['id']
type ComplianceOpt = '' | 'Compliant' | 'Warning' | 'Non-Compliant'
type PlatformOpt   = '' | 'Windows' | 'macOS' | 'Linux'

interface Props {
  open: boolean
  onClose: () => void
  onViewDevice: (deviceName: string) => void
  sourceCounts?: { intune: number; manageEngine: number }
}

function PlatformIcon({ p }: { p: string }) {
  if (p === 'Windows') return <Monitor className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />
  if (p === 'macOS')   return <Laptop  className="h-3.5 w-3.5 text-lime-500 flex-shrink-0" />
  return                      <Globe   className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
}

function CompliancePill({ state }: { state: string }) {
  const [bg, dot] =
    state === 'Compliant'    ? ['bg-emerald-50 border-emerald-200 text-emerald-700', 'bg-emerald-500'] :
    state === 'Warning'      ? ['bg-amber-50   border-amber-200   text-amber-700',   'bg-amber-500']   :
                               ['bg-red-50     border-red-200     text-red-700',     'bg-red-500']
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${bg}`}>
      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${dot}`} />
      {state}
    </span>
  )
}

function SourcePill({ src }: { src: string }) {
  if (src === 'Microsoft Intune')
    return <span className="inline-flex rounded-full bg-orange-50 border border-orange-200 px-2 py-0.5 text-xs font-medium text-orange-700">Intune</span>
  return   <span className="inline-flex rounded-full bg-orange-50 border border-orange-200 px-2 py-0.5 text-xs font-medium text-orange-700">ManageEngine</span>
}

function EncryptionCell({ status }: { status: string }) {
  const on = /encrypt|bitlocker on|filevault on|luks|enabled/i.test(status) && !/off|pending|not /i.test(status)
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${on ? 'text-emerald-600' : 'text-red-500'}`}>
      {on ? <Lock className="h-3 w-3 flex-shrink-0" /> : <LockOpen className="h-3 w-3 flex-shrink-0" />}
      <span className="truncate max-w-[90px]">{status}</span>
    </span>
  )
}

function SeverityDot({ s }: { s: string }) {
  const c = s === 'Critical' ? 'bg-red-600' : s === 'High' ? 'bg-orange-500' : s === 'Medium' ? 'bg-amber-400' : 'bg-orange-400'
  return <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${c}`} title={s} />
}

function TableSkeleton() {
  return (
    <div className="animate-pulse px-4 py-3 space-y-2">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="h-12 rounded-lg bg-slate-100" />
      ))}
    </div>
  )
}

function SummaryBar({ devices }: { devices: ApiDevice[] }) {
  const compliant    = devices.filter(d => d.complianceState === 'Compliant').length
  const warning      = devices.filter(d => d.complianceState === 'Warning').length
  const nonCompliant = devices.filter(d => d.complianceState === 'Non-Compliant').length
  const encrypted    = devices.filter(d => /encrypt|on|luks|enabled/i.test(d.encryptionStatus) && !/off|pending|not /i.test(d.encryptionStatus)).length

  return (
    <div className="flex flex-wrap gap-4 px-6 py-2.5 border-b border-slate-100 bg-slate-50/60 text-xs flex-shrink-0">
      <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />{compliant} Compliant
      </span>
      <span className="flex items-center gap-1.5 text-amber-700 font-medium">
        <span className="h-2 w-2 rounded-full bg-amber-500" />{warning} Warning
      </span>
      <span className="flex items-center gap-1.5 text-red-700 font-medium">
        <span className="h-2 w-2 rounded-full bg-red-500" />{nonCompliant} Non-Compliant
      </span>
      <span className="ml-auto flex items-center gap-1.5 text-slate-500">
        <Lock className="h-3 w-3" />{encrypted} of {devices.length} encrypted
      </span>
    </div>
  )
}

// Client-side search across all meaningful device fields
function matchesSearch(d: ApiDevice, q: string): boolean {
  if (!q) return true
  const term = q.toLowerCase()
  // Also try matching just the username part of an email (before @)
  const atIdx = term.indexOf('@')
  const userPart = atIdx > 0 ? term.slice(0, atIdx) : ''
  const check = (v?: string | null) => !!v && v.toLowerCase().includes(term)
  const checkUser = (v?: string | null) => {
    if (!v) return false
    const vl = v.toLowerCase()
    return vl.includes(term) || (userPart && vl.includes(userPart))
  }
  return (
    check(d.deviceName)   ||
    checkUser(d.user)     ||
    check(d.serialNumber) ||
    check(d.ipAddress)    ||
    check(d.macAddress)   ||
    check(d.model)        ||
    check(d.department)   ||
    check(d.osVersion)
  )
}

export function AllDevicesDrawer({ open, onClose, onViewDevice, sourceCounts }: Props) {
  // allDevices: full unfiltered set loaded from server (re-fetched on source/compliance/platform change)
  const [allDevices, setAllDevices] = useState<ApiDevice[]>([])
  const [serverTotal, setServerTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [selected, setSelected] = useState<ApiDevice | null>(null)

  const { widths, startResize, totalWidth } = useColumnResize(COLS, 'all-devices')

  const [source,     setSource]     = useState<SourceId>('all')
  const [compliance, setCompliance] = useState<ComplianceOpt>('')
  const [platform,   setPlatform]   = useState<PlatformOpt>('')
  const [searchRaw,  setSearchRaw]  = useState('')

  // Reset on open
  useEffect(() => {
    if (!open) return
    setSource('all'); setCompliance(''); setPlatform(''); setSearchRaw('')
    setSelected(null)
  }, [open])

  // Fetch from server only when structural filters change (not search — that's client-side)
  const fetchDevices = useCallback(async () => {
    if (!open) return
    setLoading(true); setError(null)
    try {
      const result = await api.fetchAllDevicesRaw({
        ...(source !== 'all' ? { source } : {}),
        ...(compliance ? { compliance }   : {}),
        ...(platform   ? { platform }     : {}),
        limit: 10000,
      })
      setAllDevices(result.devices)
      setServerTotal(result.total)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load devices')
      setAllDevices([])
    } finally {
      setLoading(false)
    }
  }, [open, source, compliance, platform])

  useEffect(() => { fetchDevices() }, [fetchDevices])

  // Client-side search — instant, no server round-trip
  const devices = searchRaw ? allDevices.filter(d => matchesSearch(d, searchRaw)) : allDevices
  const total   = searchRaw ? devices.length : serverTotal

  const { page, setPage, totalPages, paginated } = usePagination(devices, PAGE_SIZE)

  const totalAll = (sourceCounts?.intune ?? 0) + (sourceCounts?.manageEngine ?? 0)
  const getTabCount = (id: SourceId) => {
    if (id === 'all')          return totalAll || serverTotal
    if (id === 'intune')       return sourceCounts?.intune ?? 0
    return sourceCounts?.manageEngine ?? 0
  }

  const clearFilters = () => {
    setSource('all'); setCompliance(''); setPlatform(''); setSearchRaw('')
  }
  const hasFilters = source !== 'all' || compliance !== '' || platform !== '' || searchRaw !== ''

  // Whether to show split-pane (device selected on desktop)
  const showDetail = selected !== null

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm cursor-pointer transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="All Devices"
        className={`fixed inset-y-0 right-0 z-50 flex flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out w-full sm:w-[96vw] lg:w-[90vw] xl:w-[85vw] 2xl:w-[80vw] ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* ── Global Header ────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200 bg-white flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 leading-tight">All Devices</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {loading ? 'Loading…' : `${total.toLocaleString()} device${total !== 1 ? 's' : ''} across all connected sources`}
              </p>
            </div>
            <span className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              LIVE
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-4 flex-shrink-0 rounded-full p-2 hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition focus-visible:ring-2 focus-visible:ring-orange-300"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Body: list pane + optional detail pane ─────────── */}
        <div className="flex flex-1 min-h-0">

          {/* ── LEFT: List Pane ───────────────────────────────── */}
          <div className={`flex flex-col min-h-0 flex-shrink-0 transition-all duration-300 ${showDetail ? 'hidden lg:flex lg:w-[44%] xl:w-[42%] border-r border-slate-200' : 'flex w-full'}`}>

            {/* Source Tabs */}
            <div className="flex gap-1.5 px-4 pt-3 pb-3 border-b border-slate-100 flex-shrink-0 overflow-x-auto">
              {SOURCE_TABS.map(tab => {
                const count = getTabCount(tab.id)
                const isActive = source === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSource(tab.id)}
                    className={`flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-orange-300 ${
                      isActive ? tab.activeClass : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tab.label}
                    <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${isActive ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-500'}`}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-slate-100 flex-shrink-0">
              {/* Search */}
              <div className="relative flex-1 min-w-[140px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search…"
                  value={searchRaw}
                  onChange={e => setSearchRaw(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-7.5 pr-2.5 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-300 transition"
                />
              </div>
              {/* Compliance */}
              <div className="flex items-center gap-1">
                {(['', 'Compliant', 'Warning', 'Non-Compliant'] as ComplianceOpt[]).map(opt => (
                  <button
                    key={opt || 'all-c'}
                    type="button"
                    onClick={() => setCompliance(opt)}
                    className={`rounded-full px-2 py-0.5 text-xs font-medium border transition focus-visible:ring-2 focus-visible:ring-orange-300 ${
                      compliance === opt
                        ? opt === 'Compliant'     ? 'bg-emerald-500 text-white border-emerald-500'
                        : opt === 'Warning'       ? 'bg-amber-500   text-white border-amber-500'
                        : opt === 'Non-Compliant' ? 'bg-red-500     text-white border-red-500'
                                                  : 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {opt || 'All'}
                  </button>
                ))}
              </div>
              {/* Platform */}
              <div className="flex items-center gap-1">
                {(['', 'Windows', 'macOS', 'Linux'] as PlatformOpt[]).map(opt => (
                  <button
                    key={opt || 'all-p'}
                    type="button"
                    onClick={() => setPlatform(opt)}
                    className={`rounded-full px-2 py-0.5 text-xs font-medium border transition focus-visible:ring-2 focus-visible:ring-orange-300 ${
                      platform === opt ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {opt || 'All'}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-2 flex-shrink-0">
                {hasFilters && (
                  <button type="button" onClick={clearFilters} className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2 transition">
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={fetchDevices}
                  disabled={loading}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>

            {/* Summary Bar */}
            {!loading && !error && devices.length > 0 && !showDetail && (
              <SummaryBar devices={devices} />
            )}

            {/* Device List / Table */}
            <div className="flex-1 overflow-auto">
              {loading ? (
                <TableSkeleton />
              ) : error ? (
                <div className="flex flex-col items-center justify-center h-64 gap-3">
                  <p className="text-sm text-slate-500">{error}</p>
                  <button type="button" onClick={fetchDevices} className="text-xs text-orange-600 underline">Retry</button>
                </div>
              ) : devices.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 gap-2">
                  <Search className="h-10 w-10 text-slate-200" />
                  <p className="text-sm font-medium text-slate-400">No devices match current filters</p>
                  {hasFilters && <button type="button" onClick={clearFilters} className="text-xs text-orange-600 underline">Clear filters</button>}
                </div>
              ) : showDetail ? (
                /* Compact list when detail is open */
                <div className="divide-y divide-slate-100">
                  {devices.map(device => {
                    const isActive = selected?.id === device.id
                    return (
                      <button
                        key={device.id}
                        type="button"
                        onClick={() => setSelected(device)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-300 ${
                          isActive ? 'bg-orange-50 border-l-2 border-orange-500' : 'hover:bg-slate-50 border-l-2 border-transparent'
                        }`}
                      >
                        <PlatformIcon p={device.platform} />
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs font-semibold truncate ${isActive ? 'text-orange-700' : 'text-slate-900'}`}>{device.deviceName}</p>
                          <p className="text-xs text-slate-400 truncate">{device.user}</p>
                        </div>
                        <CompliancePill state={device.complianceState} />
                      </button>
                    )
                  })}
                </div>
              ) : (
                /* Full table — resizable columns */
                <>
                <table className="text-sm border-collapse" style={{ tableLayout: 'fixed', width: totalWidth }}>
                  <colgroup>
                    {COLS.map(c => <col key={c.key} style={{ width: widths[c.key] }} />)}
                  </colgroup>
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
                    <tr>
                      {COLS.map(c => (
                        <th
                          key={c.key}
                          className="relative px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap select-none overflow-hidden"
                          style={{ width: widths[c.key] }}
                        >
                          {c.label}
                          {/* Drag handle — visible on hover */}
                          {c.key !== 'actions' && (
                            <span
                              className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/60 active:bg-orange-500 transition-colors"
                              onMouseDown={e => startResize(c.key, e)}
                            />
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginated.map(device => (
                      <tr
                        key={device.id}
                        className="group hover:bg-orange-50/40 cursor-pointer transition-colors"
                        onClick={() => setSelected(device)}
                      >
                        <td className="px-4 py-3 overflow-hidden">
                          <div className="flex items-center gap-2 min-w-0">
                            <PlatformIcon p={device.platform} />
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 text-sm leading-tight truncate" title={device.deviceName}>{device.deviceName}</p>
                              <p className="text-xs text-slate-400 font-mono leading-tight truncate">{device.serialNumber}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-sm overflow-hidden">
                          <span className="block truncate" title={device.user}>{device.user}</span>
                        </td>
                        <td className="px-4 py-3 overflow-hidden"><SourcePill src={device.managementSource} /></td>
                        <td className="px-4 py-3 text-slate-500 text-xs overflow-hidden">
                          <span className="block truncate" title={device.osVersion}>{device.osVersion}</span>
                        </td>
                        <td className="px-4 py-3 overflow-hidden"><CompliancePill state={device.complianceState} /></td>
                        <td className="px-4 py-3 text-slate-500 text-xs overflow-hidden">
                          <span className="block truncate" title={device.lastCheckIn}>{device.lastCheckIn}</span>
                        </td>
                        <td className="px-4 py-3 overflow-hidden"><EncryptionCell status={device.encryptionStatus} /></td>
                        <td className="px-4 py-3 overflow-hidden">
                          {device.primaryIssue && device.primaryIssue !== 'None' ? (
                            <div className="flex items-center gap-2 min-w-0">
                              <SeverityDot s={device.severity} />
                              <span className="text-xs text-slate-600 truncate" title={device.primaryIssue}>{device.primaryIssue}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 overflow-hidden">
                          <span className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-orange-600 bg-orange-50 hover:bg-orange-100 border border-orange-200 transition opacity-0 group-hover:opacity-100">
                            Details <ChevronRight className="h-3 w-3" />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination page={page} totalPages={totalPages} onPageChange={setPage}
                  totalItems={devices.length} pageSize={PAGE_SIZE} itemLabel="device" />
                </>
              )}
            </div>

            {/* Footer */}
            {!loading && !error && devices.length > 0 && (
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 bg-slate-50 flex-shrink-0 text-xs text-slate-500">
                <span>
                  <span className="font-semibold text-slate-700">{devices.length.toLocaleString()}</span> of{' '}
                  <span className="font-semibold text-slate-700">{total.toLocaleString()}</span> devices
                </span>
              </div>
            )}
          </div>

          {/* ── RIGHT: Detail Pane ─────────────────────────────── */}
          {showDetail && (
            <div className="flex-1 min-h-0 min-w-0 flex flex-col lg:flex">
              <DeviceDetailPanel
                device={selected}
                onBack={() => setSelected(null)}
              />
              {/* "Open in Dashboard" footer */}
              <div className="flex-shrink-0 bg-white border-t border-slate-200 px-5 py-3 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Viewing <span className="font-semibold text-slate-600">{selected.deviceName}</span>
                </span>
                <button
                  type="button"
                  onClick={() => { onClose(); onViewDevice(selected.deviceName) }}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold bg-orange-600 hover:bg-orange-700 text-white transition focus-visible:ring-2 focus-visible:ring-orange-300"
                >
                  Open in Dashboard <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
