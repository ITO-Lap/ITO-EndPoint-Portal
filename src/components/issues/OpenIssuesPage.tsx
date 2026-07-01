import { useState, useEffect, useMemo } from 'react'
import {
  ArrowLeft, Search, RefreshCw, ExternalLink, ClipboardList,
  ChevronUp, ChevronDown, ChevronsUpDown, Apple, Monitor, Laptop2,
} from 'lucide-react'
import { api } from '../../api'
import type { ApiDevice } from '../../api'
import { useColumnResize } from '../../hooks/useColumnResize'

type SortField = 'deviceName' | 'user' | 'issueSource' | 'primaryIssue' | 'severity' | 'firstDetected' | 'complianceState'
type SortDir = 'asc' | 'desc'

const SEVERITY_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }

const SEVERITY_BADGE: Record<string, string> = {
  Critical: 'bg-red-100 text-red-700 border-red-200',
  High:     'bg-orange-100 text-orange-700 border-orange-200',
  Medium:   'bg-amber-100 text-amber-700 border-amber-200',
  Low:      'bg-slate-100 text-slate-600 border-slate-200',
}

const COMPLIANCE_BADGE: Record<string, string> = {
  'Non-Compliant': 'bg-red-100 text-red-700 border-red-200',
  'Warning':       'bg-amber-100 text-amber-700 border-amber-200',
}

const CATEGORY_COLORS: Record<string, string> = {
  'Encryption / FileVault': '#ef4444',
  'Security / AV':          '#f97316',
  'OS / Patch':             '#f59e0b',
  'Device Check-in':        '#22c55e',
  'Compliance Policies':    '#f59e0b',
  'Application Issues':     '#6366f1',
  'Other':                  '#64748b',
}

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === 'macOS') return <Apple className="h-3.5 w-3.5 text-slate-400" />
  if (platform === 'Windows') return <Monitor className="h-3.5 w-3.5 text-slate-400" />
  return <Laptop2 className="h-3.5 w-3.5 text-slate-400" />
}

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (field !== sortField) return <ChevronsUpDown className="h-3 w-3 text-slate-400" />
  return sortDir === 'asc'
    ? <ChevronUp className="h-3 w-3 text-orange-500" />
    : <ChevronDown className="h-3 w-3 text-orange-500" />
}

const COLS = [
  { key: 'deviceName',    label: 'Device',         min: 100, default: 180 },
  { key: 'user',          label: 'User',            min:  80, default: 140 },
  { key: 'complianceState', label: 'Status',        min:  80, default: 110 },
  { key: 'issueSource',   label: 'Category',        min:  80, default: 120 },
  { key: 'primaryIssue',  label: 'Issue',           min: 100, default: 200 },
  { key: 'severity',      label: 'Severity',        min:  70, default:  90 },
  { key: 'firstDetected', label: 'First Detected',  min:  90, default: 120 },
  { key: 'actions',       label: '',                min:  40, default:  50, noResize: true },
] as const
type OColKey = typeof COLS[number]['key']

interface Props {
  onBack: () => void
  onViewDevice?: (deviceName: string) => void
}

export function OpenIssuesPage({ onBack, onViewDevice }: Props) {
  const [devices, setDevices] = useState<ApiDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('severity')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [ncResult, warnResult] = await Promise.all([
        api.fetchAllDevicesRaw({ compliance: 'Non-Compliant', limit: 500 }),
        api.fetchAllDevicesRaw({ compliance: 'Warning', limit: 500 }),
      ])
      setDevices([...ncResult.devices, ...warnResult.devices])
    } catch {
      setDevices([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  // Derive issue categories from the loaded devices
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {}
    devices.forEach(d => {
      const cat = d.issueSource || 'Other'
      map[cat] = (map[cat] ?? 0) + 1
    })
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value }))
  }, [devices])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return devices.filter(d => {
      const matchesCategory = !activeCategory || d.issueSource === activeCategory
      const matchesSearch = !q ||
        d.deviceName.toLowerCase().includes(q) ||
        d.user.toLowerCase().includes(q) ||
        (d.primaryIssue ?? '').toLowerCase().includes(q) ||
        (d.issueSource ?? '').toLowerCase().includes(q)
      return matchesCategory && matchesSearch
    })
  }, [devices, search, activeCategory])

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

  const severityCounts = useMemo(() => ({
    Critical: devices.filter(d => d.severity === 'Critical').length,
    High:     devices.filter(d => d.severity === 'High').length,
    Medium:   devices.filter(d => d.severity === 'Medium').length,
    Low:      devices.filter(d => d.severity === 'Low').length,
  }), [devices])

  const { widths, startResize, totalWidth } = useColumnResize(COLS, 'open-issues')

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </button>
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-orange-50 border border-orange-200">
            <ClipboardList className="h-4 w-4 text-orange-600" />
          </div>
          <h1 className="text-xl font-bold text-orange-700">Open Issues</h1>
          {!loading && (
            <span className="rounded-full border border-orange-200 bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700">
              {devices.length.toLocaleString()}
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

      {/* Severity summary strip */}
      <div className="rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4 flex items-center gap-6 flex-wrap">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Total Open</p>
          <p className="text-2xl font-bold text-orange-700">{loading ? '—' : devices.length.toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-0.5">devices with issues</p>
        </div>
        <div className="h-10 w-px bg-orange-200" />
        {(['Critical', 'High', 'Medium', 'Low'] as const).map(sev => (
          <div key={sev}>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{sev}</p>
            <p className={`text-xl font-bold ${sev === 'Critical' ? 'text-red-600' : sev === 'High' ? 'text-orange-600' : sev === 'Medium' ? 'text-amber-600' : 'text-slate-500'}`}>
              {loading ? '—' : severityCounts[sev]}
            </p>
          </div>
        ))}
      </div>

      {/* Issue Category Cards */}
      {!loading && categoryBreakdown.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">By Category</p>
          <div className="flex flex-wrap gap-2">
            {categoryBreakdown.map(cat => {
              const isActive = activeCategory === cat.label
              const color = CATEGORY_COLORS[cat.label] ?? '#64748b'
              return (
                <button
                  key={cat.label}
                  type="button"
                  onClick={() => setActiveCategory(isActive ? null : cat.label)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition shadow-sm ${
                    isActive
                      ? 'border-orange-400 bg-orange-50 text-orange-700 ring-2 ring-orange-200'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  {cat.label}
                  <span className={`rounded-full px-1.5 py-0.5 font-semibold ${isActive ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>
                    {cat.value}
                  </span>
                </button>
              )
            })}
            {activeCategory && (
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50 transition"
              >
                Clear filter ×
              </button>
            )}
          </div>
        </div>
      )}

      {/* Search */}
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

      {/* Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading issues…
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
            <ClipboardList className="h-8 w-8 opacity-30" />
            <p className="text-sm font-medium">No issues found</p>
            {(search || activeCategory) && <p className="text-xs">Try clearing your filters</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse" style={{ tableLayout: 'fixed', width: totalWidth }}>
              <colgroup>
                {COLS.map(c => <col key={c.key} style={{ width: widths[c.key as OColKey] }} />)}
              </colgroup>
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  {COLS.map(col => {
                    const isSortable = col.key !== 'actions'
                    return (
                      <th
                        key={col.key}
                        className="relative px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 select-none whitespace-nowrap overflow-hidden"
                        style={{ width: widths[col.key as OColKey] }}
                        onClick={isSortable ? () => handleSort(col.key as SortField) : undefined}
                      >
                        <span className={`flex items-center gap-1 ${isSortable ? 'cursor-pointer hover:text-slate-700 transition' : ''}`}>
                          {col.label}
                          {isSortable && <SortIcon field={col.key as SortField} sortField={sortField} sortDir={sortDir} />}
                        </span>
                        {!('noResize' in col && col.noResize) && (
                          <span
                            className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                            onMouseDown={e => startResize(col.key as OColKey, e)}
                            onClick={e => e.stopPropagation()}
                          />
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {sorted.map((device, idx) => (
                  <tr
                    key={device.id}
                    className={`border-b border-slate-100 last:border-0 transition hover:bg-slate-50 ${idx % 2 === 0 ? '' : 'bg-slate-50/40'} ${onViewDevice ? 'cursor-pointer' : ''}`}
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
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold whitespace-nowrap ${COMPLIANCE_BADGE[device.complianceState] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        {device.complianceState}
                      </span>
                    </td>
                    <td className="overflow-hidden px-4 py-3">
                      <span className="flex items-center gap-1.5 text-xs text-slate-600 whitespace-nowrap">
                        <span
                          className="h-2 w-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: CATEGORY_COLORS[device.issueSource] ?? '#64748b' }}
                        />
                        <span className="block truncate">{device.issueSource || 'Other'}</span>
                      </span>
                    </td>
                    <td className="overflow-hidden px-4 py-3 text-xs text-slate-500">
                      <span className="block truncate" title={device.primaryIssue}>{device.primaryIssue || '—'}</span>
                    </td>
                    <td className="overflow-hidden px-4 py-3">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold ${SEVERITY_BADGE[device.severity] ?? SEVERITY_BADGE.Low}`}>
                        {device.severity}
                      </span>
                    </td>
                    <td className="overflow-hidden px-4 py-3 text-xs text-slate-500">
                      <span className="block truncate">{device.firstDetected || '—'}</span>
                    </td>
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
            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 text-xs text-slate-400">
              Showing {sorted.length.toLocaleString()} of {devices.length.toLocaleString()} open issues
              {activeCategory && <span> · filtered by <strong className="text-slate-600">{activeCategory}</strong></span>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
