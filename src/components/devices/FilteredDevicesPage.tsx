import { useState, useEffect, useMemo } from 'react'
import {
  ArrowLeft, Search, ChevronUp, ChevronDown, ChevronsUpDown,
  ShieldCheck, ShieldAlert, AlertTriangle, Laptop2, Apple, Monitor,
  RefreshCw, ExternalLink, Server, Settings,
} from 'lucide-react'
import { api } from '../../api'
import type { ApiDevice } from '../../api'
import { useColumnResize } from '../../hooks/useColumnResize'
import { usePagination } from '../../hooks/usePagination'
import { Pagination } from '../ui/Pagination'

const PAGE_SIZE = 50

type ComplianceFilter = 'Compliant' | 'Non-Compliant' | 'Warning' | 'Windows' | 'Mac' | 'Intune' | 'ManageEngine'
type SortField = 'deviceName' | 'user' | 'platform' | 'osVersion' | 'managementSource' | 'lastCheckIn' | 'severity'
type SortDir = 'asc' | 'desc'

const SEVERITY_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }

const CATEGORY_COLORS: Record<string, string> = {
  'Encryption / FileVault': '#ef4444',
  'Security / AV':          '#f97316',
  'OS / Patch':             '#f59e0b',
  'Device Check-in':        '#22c55e',
  'Compliance Policies':    '#a855f7',
  'Application Issues':     '#6366f1',
  'Other':                  '#64748b',
}

const SOURCE_COLORS: Record<string, string> = {
  'Microsoft Intune': '#0078d4',
  'Kandji':           '#7c3aed',
  'ManageEngine':     '#f59e0b',
}

const PLATFORM_COLORS: Record<string, string> = {
  macOS:   '#64748b',
  Windows: '#0ea5e9',
  Linux:   '#f97316',
}

const COLS = [
  { key: 'deviceName',        label: 'Device',        min: 100, default: 180 },
  { key: 'user',              label: 'User',           min:  80, default: 140 },
  { key: 'platform',          label: 'Platform',       min:  60, default:  80 },
  { key: 'osVersion',         label: 'OS Version',     min:  80, default: 120 },
  { key: 'managementSource',  label: 'Source',         min:  80, default: 130 },
  { key: 'lastCheckIn',       label: 'Last Check-in',  min: 100, default: 140 },
  { key: 'severity',          label: 'Severity',       min:  70, default:  90 },
  { key: 'issue',             label: 'Issue',          min: 100, default: 200 },
  { key: 'actions',           label: '',               min:  40, default:  50, noResize: true },
] as const
type FColKey = typeof COLS[number]['key']

const CONFIG: Record<ComplianceFilter, {
  title: string
  icon: React.ElementType
  accent: string
  headerBg: string
  badgeClass: string
  divider: string
}> = {
  Compliant: {
    title:     'Compliant Devices',
    icon:      ShieldCheck,
    accent:    'text-emerald-700',
    headerBg:  'bg-emerald-50 border-emerald-200',
    badgeClass:'bg-emerald-100 text-emerald-700 border-emerald-200',
    divider:   'bg-emerald-200',
  },
  'Non-Compliant': {
    title:     'Non-Compliant Devices',
    icon:      ShieldAlert,
    accent:    'text-red-700',
    headerBg:  'bg-red-50 border-red-200',
    badgeClass:'bg-red-100 text-red-700 border-red-200',
    divider:   'bg-red-200',
  },
  Warning: {
    title:     'Warning Devices',
    icon:      AlertTriangle,
    accent:    'text-amber-700',
    headerBg:  'bg-amber-50 border-amber-200',
    badgeClass:'bg-amber-100 text-amber-700 border-amber-200',
    divider:   'bg-amber-200',
  },
  Windows: {
    title:     'Windows Devices',
    icon:      Monitor,
    accent:    'text-orange-700',
    headerBg:  'bg-orange-50 border-orange-200',
    badgeClass:'bg-orange-100 text-orange-700 border-orange-200',
    divider:   'bg-orange-200',
  },
  Mac: {
    title:     'Mac Devices',
    icon:      Apple,
    accent:    'text-slate-700',
    headerBg:  'bg-slate-50 border-slate-200',
    badgeClass:'bg-slate-100 text-slate-700 border-slate-200',
    divider:   'bg-slate-200',
  },
  Intune: {
    title:     'Microsoft Intune — Devices',
    icon:      Server,
    accent:    'text-orange-700',
    headerBg:  'bg-orange-50 border-orange-200',
    badgeClass:'bg-orange-100 text-orange-700 border-orange-200',
    divider:   'bg-orange-200',
  },
  ManageEngine: {
    title:     'ManageEngine — Devices',
    icon:      Settings,
    accent:    'text-amber-700',
    headerBg:  'bg-amber-50 border-amber-200',
    badgeClass:'bg-amber-100 text-amber-700 border-amber-200',
    divider:   'bg-amber-200',
  },
}

const SEVERITY_BADGE: Record<string, string> = {
  Critical: 'bg-red-100 text-red-700 border-red-200',
  High:     'bg-orange-100 text-orange-700 border-orange-200',
  Medium:   'bg-amber-100 text-amber-700 border-amber-200',
  Low:      'bg-slate-100 text-slate-600 border-slate-200',
}

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === 'macOS')   return <Apple   className="h-3.5 w-3.5 text-slate-400" />
  if (platform === 'Windows') return <Monitor className="h-3.5 w-3.5 text-slate-400" />
  return <Laptop2 className="h-3.5 w-3.5 text-slate-400" />
}

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (field !== sortField) return <ChevronsUpDown className="h-3 w-3 text-slate-400" />
  return sortDir === 'asc'
    ? <ChevronUp   className="h-3 w-3 text-orange-500" />
    : <ChevronDown className="h-3 w-3 text-orange-500" />
}

function FilterChips({
  label,
  items,
  active,
  onToggle,
  colorMap,
}: {
  label: string
  items: { key: string; count: number }[]
  active: string | null
  onToggle: (key: string) => void
  colorMap?: Record<string, string>
}) {
  if (!items.length) return null
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {items.map(({ key, count }) => {
          const isActive = active === key
          const color = colorMap?.[key]
          return (
            <button
              key={key}
              type="button"
              onClick={() => onToggle(key)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition shadow-sm ${
                isActive
                  ? 'border-orange-400 bg-orange-50 text-orange-700 ring-2 ring-orange-200'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {color && (
                <span
                  className="h-2 w-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
              )}
              {key}
              <span className={`rounded-full px-1.5 py-0.5 font-semibold ${isActive ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>
                {count}
              </span>
            </button>
          )
        })}
        {active && (
          <button
            type="button"
            onClick={() => onToggle(active)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50 transition"
          >
            Clear ×
          </button>
        )}
      </div>
    </div>
  )
}

interface Props {
  filter: ComplianceFilter
  onBack: () => void
  onViewDevice?: (deviceName: string) => void
}

export function FilteredDevicesPage({ filter, onBack, onViewDevice }: Props) {
  const [devices, setDevices]   = useState<ApiDevice[]>([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [sortField, setSortField] = useState<SortField>(
    filter === 'Compliant' || filter === 'Windows' || filter === 'Intune' || filter === 'ManageEngine' ? 'deviceName' : 'severity'
  )
  const [sortDir, setSortDir]   = useState<SortDir>('asc')

  // Active filter chips
  const [activePlatform, setActivePlatform] = useState<string | null>(null)
  const [activeSource, setActiveSource]     = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const cfg  = CONFIG[filter]
  const Icon = cfg.icon

  const fetchData = async () => {
    setActivePlatform(null)
    setActiveSource(null)
    setActiveCategory(null)
    setLoading(true)
    try {
      // 10,000 is the server's max allowed limit (server/src/routes/devices.ts) —
      // comfortably above this fleet's real device count, so nothing gets
      // silently truncated before pagination even sees it.
      const result = await api.fetchAllDevicesRaw(
        filter === 'Windows'       ? { platform: 'Windows',   limit: 10000 }
        : filter === 'Mac'         ? { platform: 'macOS',     limit: 10000 }
        : filter === 'Intune'      ? { source: 'intune',      limit: 10000 }
        : filter === 'ManageEngine'? { source: 'manageengine',limit: 10000 }
        : { compliance: filter as 'Compliant' | 'Non-Compliant' | 'Warning', limit: 10000 }
      )
      setDevices(result.devices)
      setTotal(result.total)
    } catch {
      setDevices([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [filter])

  const handleSort = (field: SortField) => {
    if (field === sortField) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  // Derive breakdown counts from all devices (not filtered)
  const platformBreakdown = useMemo(() => {
    const map: Record<string, number> = {}
    devices.forEach(d => { map[d.platform] = (map[d.platform] ?? 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }))
  }, [devices])

  const sourceBreakdown = useMemo(() => {
    const map: Record<string, number> = {}
    devices.forEach(d => { map[d.managementSource] = (map[d.managementSource] ?? 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }))
  }, [devices])

  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {}
    devices.forEach(d => { const c = d.issueSource || 'Other'; map[c] = (map[c] ?? 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }))
  }, [devices])

  const severityCounts = useMemo(() => ({
    Critical: devices.filter(d => d.severity === 'Critical').length,
    High:     devices.filter(d => d.severity === 'High').length,
    Medium:   devices.filter(d => d.severity === 'Medium').length,
    Low:      devices.filter(d => d.severity === 'Low').length,
  }), [devices])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return devices.filter(d => {
      if (activePlatform  && d.platform          !== activePlatform)  return false
      if (activeSource    && d.managementSource   !== activeSource)    return false
      if (activeCategory  && (d.issueSource || 'Other') !== activeCategory) return false
      if (q && !(
        d.deviceName.toLowerCase().includes(q) ||
        d.user.toLowerCase().includes(q) ||
        d.platform.toLowerCase().includes(q) ||
        d.managementSource.toLowerCase().includes(q) ||
        (d.primaryIssue ?? '').toLowerCase().includes(q)
      )) return false
      return true
    })
  }, [devices, search, activePlatform, activeSource, activeCategory])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0
      if (sortField === 'severity') {
        cmp = (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4)
      } else {
        const av = (a[sortField] ?? '') as string
        const bv = (b[sortField] ?? '') as string
        cmp = av.localeCompare(bv)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortField, sortDir])

  const activeFilterCount = [activePlatform, activeSource, activeCategory].filter(Boolean).length

  const activeCols = COLS.filter(c => {
    if (c.key === 'severity' || c.key === 'issue') return filter !== 'Compliant'
    return true
  }) as typeof COLS[number][]
  const { widths, startResize, totalWidth } = useColumnResize(activeCols, 'filtered-devices')
  const { page, setPage, totalPages, paginated } = usePagination(sorted, PAGE_SIZE)

  return (
    <div className="flex flex-col gap-5">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </button>
        <div className="flex items-center gap-2">
          <div className={`grid h-8 w-8 place-items-center rounded-xl border ${cfg.headerBg}`}>
            <Icon className={`h-4 w-4 ${cfg.accent}`} />
          </div>
          <h1 className={`text-xl font-bold ${cfg.accent}`}>{cfg.title}</h1>
          {!loading && (
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.badgeClass}`}>
              {total.toLocaleString()}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={fetchData}
          className={`ml-auto flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm transition ${loading ? 'border-orange-300 bg-orange-50 animate-pulse' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-orange-500' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ── Summary strip ──────────────────────────────────────────── */}
      <div className={`rounded-2xl border px-5 py-4 ${cfg.headerBg} flex items-center gap-6 flex-wrap`}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Total</p>
          <p className={`text-2xl font-bold ${cfg.accent}`}>{loading ? '—' : total.toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {activeFilterCount > 0 ? `${sorted.length.toLocaleString()} shown after filters` : `${filter.toLowerCase()} devices`}
          </p>
        </div>

        {/* Compliant: platform counts in strip */}
        {filter === 'Compliant' && !loading && platformBreakdown.map(({ key, count }) => (
          <div key={key}>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{key}</p>
            <p className="text-xl font-bold text-emerald-700">{count}</p>
          </div>
        ))}

        {/* Non-Compliant / Warning: severity counts in strip */}
        {filter !== 'Compliant' && !loading && devices.length > 0 && (
          <>
            <div className={`h-10 w-px ${cfg.divider}`} />
            {(['Critical', 'High', 'Medium', 'Low'] as const).map(sev => {
              const count = severityCounts[sev]
              if (!count) return null
              return (
                <div key={sev}>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{sev}</p>
                  <p className={`text-xl font-bold ${
                    sev === 'Critical' ? 'text-red-600'
                    : sev === 'High'   ? 'text-orange-600'
                    : sev === 'Medium' ? 'text-amber-600'
                    : 'text-slate-500'
                  }`}>
                    {count}
                  </p>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* ── Breakdown chip sections ─────────────────────────────────── */}
      {!loading && devices.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-5 py-4 flex flex-col gap-5">

          <div className={`grid gap-6 ${filter === 'Compliant' ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {filter !== 'Compliant' && (
              <FilterChips
                label="By Issue Category"
                items={categoryBreakdown}
                active={activeCategory}
                onToggle={v => setActiveCategory(prev => prev === v ? null : v)}
                colorMap={CATEGORY_COLORS}
              />
            )}
            <FilterChips
              label="By Management Source"
              items={sourceBreakdown}
              active={activeSource}
              onToggle={v => setActiveSource(prev => prev === v ? null : v)}
              colorMap={SOURCE_COLORS}
            />
            <FilterChips
              label="By Platform"
              items={platformBreakdown}
              active={activePlatform}
              onToggle={v => setActivePlatform(prev => prev === v ? null : v)}
              colorMap={PLATFORM_COLORS}
            />
          </div>

          {activeFilterCount > 0 && (
            <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
              <span className="text-xs text-slate-500">
                {sorted.length.toLocaleString()} of {total.toLocaleString()} devices match active filters
              </span>
              <button
                type="button"
                onClick={() => { setActivePlatform(null); setActiveSource(null); setActiveCategory(null) }}
                className="text-xs font-medium text-orange-600 hover:text-orange-700 transition"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Search ─────────────────────────────────────────────────── */}
      <div className="relative w-full max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search devices, users, issues…"
          className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
        />
      </div>

      {/* ── Table ──────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading devices…
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
            <Icon className="h-8 w-8 opacity-30" />
            <p className="text-sm font-medium">No devices match your filters</p>
            <p className="text-xs">Try clearing the search or chip filters above</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse" style={{ tableLayout: 'fixed', width: totalWidth }}>
              <colgroup>
                {activeCols.map(c => <col key={c.key} style={{ width: widths[c.key as FColKey] }} />)}
              </colgroup>
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  {activeCols.map(col => {
                    const isSortable = col.key !== 'issue' && col.key !== 'actions'
                    return (
                      <th
                        key={col.key}
                        className={`relative px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 select-none whitespace-nowrap overflow-hidden ${isSortable ? 'cursor-pointer' : ''}`}
                        style={{ width: widths[col.key as FColKey] }}
                        onClick={isSortable ? () => handleSort(col.key as SortField) : undefined}
                      >
                        <span className={`flex items-center gap-1 ${isSortable ? 'cursor-pointer hover:text-slate-700 transition' : ''}`}>
                          {col.label}
                          {isSortable && <SortIcon field={col.key as SortField} sortField={sortField} sortDir={sortDir} />}
                        </span>
                        {!('noResize' in col && col.noResize) && (
                          <span
                            className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                            onMouseDown={e => startResize(col.key as FColKey, e)}
                            onClick={e => e.stopPropagation()}
                          />
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {paginated.map((device, idx) => (
                  <tr
                    key={device.id}
                    className={`border-b border-slate-100 last:border-0 transition hover:bg-slate-50 ${idx % 2 !== 0 ? 'bg-slate-50/40' : ''} ${onViewDevice ? 'cursor-pointer' : ''}`}
                    onClick={() => onViewDevice?.(device.deviceName)}
                  >
                    <td className="overflow-hidden px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <PlatformIcon platform={device.platform} />
                        <span className="block truncate font-medium text-slate-800">{device.deviceName}</span>
                      </div>
                    </td>
                    <td className="overflow-hidden px-4 py-3 text-slate-600">
                      <span className="block truncate">{device.user}</span>
                    </td>
                    <td className="overflow-hidden px-4 py-3">
                      <span className="flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap">
                        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: PLATFORM_COLORS[device.platform] ?? '#94a3b8' }} />
                        <span className="block truncate">{device.platform}</span>
                      </span>
                    </td>
                    <td className="overflow-hidden px-4 py-3 text-xs text-slate-500 font-mono">
                      <span className="block truncate">{device.osVersion}</span>
                    </td>
                    <td className="overflow-hidden px-4 py-3">
                      <span className="flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap">
                        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: SOURCE_COLORS[device.managementSource] ?? '#94a3b8' }} />
                        <span className="block truncate">{device.managementSource}</span>
                      </span>
                    </td>
                    <td className="overflow-hidden px-4 py-3 text-xs text-slate-500">
                      <span className="block truncate">{device.lastCheckIn}</span>
                    </td>
                    {filter !== 'Compliant' && (
                      <td className="overflow-hidden px-4 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold ${SEVERITY_BADGE[device.severity] ?? SEVERITY_BADGE.Low}`}>
                          {device.severity}
                        </span>
                      </td>
                    )}
                    {filter !== 'Compliant' && (
                      <td className="overflow-hidden px-4 py-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[device.issueSource] ?? '#64748b' }} />
                          <span className="block truncate" title={device.primaryIssue}>{device.primaryIssue || '—'}</span>
                        </span>
                      </td>
                    )}
                    <td className="overflow-hidden px-4 py-3">
                      {onViewDevice && (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); onViewDevice(device.deviceName) }}
                          className="rounded-lg p-1 hover:bg-orange-50 text-slate-400 hover:text-orange-600 transition"
                          title="View device"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {activeFilterCount > 0 && (
              <div className="px-4 py-1.5 border-t border-slate-100 bg-slate-50 text-xs text-orange-500">
                {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
              </div>
            )}
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage}
              totalItems={sorted.length} pageSize={PAGE_SIZE} itemLabel="device" />
          </div>
        )}
      </div>
    </div>
  )
}
