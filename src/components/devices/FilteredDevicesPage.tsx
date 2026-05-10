import { useState, useEffect, useMemo } from 'react'
import {
  ArrowLeft, Search, ChevronUp, ChevronDown, ChevronsUpDown,
  ShieldCheck, ShieldAlert, AlertTriangle, Laptop2, Apple, Monitor,
  RefreshCw, ExternalLink,
} from 'lucide-react'
import { api } from '../../api'
import type { ApiDevice } from '../../api'

type ComplianceFilter = 'Compliant' | 'Non-Compliant' | 'Warning'
type SortField = 'deviceName' | 'user' | 'platform' | 'osVersion' | 'managementSource' | 'lastCheckIn' | 'severity'
type SortDir = 'asc' | 'desc'

const SEVERITY_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }

const CONFIG: Record<ComplianceFilter, {
  title: string
  icon: React.ElementType
  accent: string
  headerBg: string
  badgeClass: string
}> = {
  'Compliant': {
    title: 'Compliant Devices',
    icon: ShieldCheck,
    accent: 'text-emerald-700',
    headerBg: 'bg-emerald-50 border-emerald-200',
    badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  },
  'Non-Compliant': {
    title: 'Non-Compliant Devices',
    icon: ShieldAlert,
    accent: 'text-red-700',
    headerBg: 'bg-red-50 border-red-200',
    badgeClass: 'bg-red-100 text-red-700 border-red-200',
  },
  'Warning': {
    title: 'Warning Devices',
    icon: AlertTriangle,
    accent: 'text-amber-700',
    headerBg: 'bg-amber-50 border-amber-200',
    badgeClass: 'bg-amber-100 text-amber-700 border-amber-200',
  },
}

const SEVERITY_BADGE: Record<string, string> = {
  Critical: 'bg-red-100 text-red-700 border-red-200',
  High:     'bg-orange-100 text-orange-700 border-orange-200',
  Medium:   'bg-amber-100 text-amber-700 border-amber-200',
  Low:      'bg-slate-100 text-slate-600 border-slate-200',
}

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === 'macOS') return <Apple className="h-3.5 w-3.5 text-slate-500" />
  if (platform === 'Windows') return <Monitor className="h-3.5 w-3.5 text-slate-500" />
  return <Laptop2 className="h-3.5 w-3.5 text-slate-500" />
}

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (field !== sortField) return <ChevronsUpDown className="h-3 w-3 text-slate-400" />
  return sortDir === 'asc'
    ? <ChevronUp className="h-3 w-3 text-sky-500" />
    : <ChevronDown className="h-3 w-3 text-sky-500" />
}

interface Props {
  filter: ComplianceFilter
  onBack: () => void
  onViewDevice?: (deviceName: string) => void
}

export function FilteredDevicesPage({ filter, onBack, onViewDevice }: Props) {
  const [devices, setDevices] = useState<ApiDevice[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('deviceName')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const cfg = CONFIG[filter]
  const Icon = cfg.icon

  const fetchData = async () => {
    setLoading(true)
    try {
      const result = await api.fetchAllDevicesRaw({ compliance: filter, limit: 500 })
      setDevices(result.devices)
      setTotal(result.total)
    } catch {
      setDevices([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [filter])

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return devices.filter(d =>
      !q ||
      d.deviceName.toLowerCase().includes(q) ||
      d.user.toLowerCase().includes(q) ||
      d.platform.toLowerCase().includes(q) ||
      d.managementSource.toLowerCase().includes(q) ||
      (d.primaryIssue ?? '').toLowerCase().includes(q)
    )
  }, [devices, search])

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

  const columns: { key: SortField; label: string; width?: string }[] = [
    { key: 'deviceName',       label: 'Device',          width: 'w-44' },
    { key: 'user',             label: 'User',             width: 'w-36' },
    { key: 'platform',         label: 'Platform',         width: 'w-24' },
    { key: 'osVersion',        label: 'OS Version',       width: 'w-28' },
    { key: 'managementSource', label: 'Source',           width: 'w-32' },
    { key: 'lastCheckIn',      label: 'Last Check-in',    width: 'w-32' },
    ...(filter !== 'Compliant' ? [{ key: 'severity' as SortField, label: 'Severity', width: 'w-24' }] : []),
  ]

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
          <div className={`grid h-8 w-8 place-items-center rounded-xl ${cfg.headerBg} border`}>
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
          disabled={loading}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm hover:bg-slate-50 transition disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary strip */}
      <div className={`rounded-2xl border px-5 py-4 ${cfg.headerBg} flex items-center gap-6`}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Showing</p>
          <p className={`text-2xl font-bold ${cfg.accent}`}>{loading ? '—' : sorted.length.toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {search ? `filtered from ${total.toLocaleString()} total` : `of ${total.toLocaleString()} total`}
          </p>
        </div>
        {filter !== 'Compliant' && !loading && sorted.length > 0 && (
          <>
            <div className="h-10 w-px bg-slate-200" />
            {(['Critical', 'High', 'Medium', 'Low'] as const).map(sev => {
              const count = sorted.filter(d => d.severity === sev).length
              if (!count) return null
              return (
                <div key={sev}>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{sev}</p>
                  <p className={`text-xl font-bold ${sev === 'Critical' ? 'text-red-600' : sev === 'High' ? 'text-orange-600' : sev === 'Medium' ? 'text-amber-600' : 'text-slate-500'}`}>
                    {count}
                  </p>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* Search */}
      <div className="relative w-full max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search devices, users, issues…"
          className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-400"
        />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading devices…
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
            <Icon className="h-8 w-8 opacity-30" />
            <p className="text-sm font-medium">No {filter.toLowerCase()} devices found</p>
            {search && <p className="text-xs">Try clearing the search filter</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  {columns.map(col => (
                    <th
                      key={col.key}
                      className={`${col.width ?? ''} px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 cursor-pointer select-none hover:text-slate-700 transition`}
                      onClick={() => handleSort(col.key)}
                    >
                      <span className="flex items-center gap-1">
                        {col.label}
                        <SortIcon field={col.key} sortField={sortField} sortDir={sortDir} />
                      </span>
                    </th>
                  ))}
                  {filter !== 'Compliant' && (
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Issue</th>
                  )}
                  <th className="w-10 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((device, idx) => (
                  <tr
                    key={device.id}
                    className={`border-b border-slate-100 last:border-0 transition hover:bg-slate-50 ${idx % 2 === 0 ? '' : 'bg-slate-50/40'} ${onViewDevice ? 'cursor-pointer' : ''}`}
                    onClick={() => onViewDevice?.(device.deviceName)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <PlatformIcon platform={device.platform} />
                        <span className="font-medium text-slate-800 truncate">{device.deviceName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 truncate max-w-[8rem]">{device.user}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-500">{device.platform}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 font-mono">{device.osVersion}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{device.managementSource}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{device.lastCheckIn}</td>
                    {filter !== 'Compliant' && (
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold ${SEVERITY_BADGE[device.severity] ?? SEVERITY_BADGE.Low}`}>
                          {device.severity}
                        </span>
                      </td>
                    )}
                    {filter !== 'Compliant' && (
                      <td className="px-4 py-3 text-xs text-slate-500 max-w-[12rem]">
                        <span className="truncate block" title={device.primaryIssue}>{device.primaryIssue || '—'}</span>
                      </td>
                    )}
                    {filter === 'Compliant' && <td className="px-4 py-3" />}
                    <td className="px-4 py-3">
                      {onViewDevice && (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); onViewDevice(device.deviceName) }}
                          className="rounded-lg p-1 hover:bg-sky-50 text-slate-400 hover:text-sky-600 transition"
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
              Showing {sorted.length.toLocaleString()} of {total.toLocaleString()} {filter.toLowerCase()} devices
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
