import { Fragment, useState, useEffect, useMemo } from 'react'
import {
  Settings, RefreshCw,
  Search, X, ArrowLeft,
  ChevronDown, ChevronUp, AlertCircle, Layers, Apple, MonitorSmartphone,
  ChevronRight, FileText,
} from 'lucide-react'
import { api } from '../api'
import type { ApiDevice, ManageEngineAppEntry } from '../api'
import { usePagination } from '../hooks/usePagination'
import { Pagination } from '../components/ui/Pagination'

const PAGE_SIZE = 50

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="glass rounded-2xl p-4 overflow-hidden relative">
      <div className="h-[2px] absolute top-0 left-0 right-0" style={{ background: color }} />
      <p className="text-[0.6rem] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</p>
      <p className="text-2xl font-black" style={{ color }}>{value}</p>
      {sub && <p className="text-[0.62rem] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

type AppSortKey = 'name' | 'deviceCount' | 'latestVersion' | 'updateStatus'
type AppPlatformTab = 'Windows' | 'macOS'

function SortHeader({ label, sortKeyName, activeKey, dir, onToggle }: {
  label: string; sortKeyName: AppSortKey; activeKey: AppSortKey; dir: 'asc' | 'desc'; onToggle: (key: AppSortKey) => void
}) {
  return (
    <th>
      <button type="button" onClick={() => onToggle(sortKeyName)} className="inline-flex items-center gap-1 font-inherit">
        {label}
        {activeKey === sortKeyName && (dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
      </button>
    </th>
  )
}

function UpdateStatusBadge({ status }: { status: ManageEngineAppEntry['updateStatus'] }) {
  const styles: Record<ManageEngineAppEntry['updateStatus'], string> = {
    'Up to date':       'bg-emerald-50 text-emerald-700 border-emerald-200',
    'Update Available': 'bg-amber-50 text-amber-700 border-amber-200',
    'Unknown':          'bg-slate-50 text-slate-500 border-slate-200',
  }
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.62rem] font-bold ${styles[status]}`}>{status}</span>
}

// Groups an app's per-device log entries by installed version — powers the
// "Multiple Versions" expandable breakdown (real counts, derived from the
// same log records shown in the log viewer, not a separate fabricated stat).
function versionBreakdown(entry: ManageEngineAppEntry): { version: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const log of entry.logs) counts.set(log.version, (counts.get(log.version) ?? 0) + 1)
  return Array.from(counts.entries()).map(([version, count]) => ({ version, count }))
}

function AppLogsPanel({ entry, onClose }: { entry: ManageEngineAppEntry; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm cursor-pointer" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-40 w-full max-w-[640px] shadow-2xl border-l border-white/20 overflow-hidden flex flex-col glass-strong">
        <div className="h-[3px] flex-shrink-0" style={{ background: 'linear-gradient(90deg,#FF6B35,#F46C00,#FFB800)' }} />
        <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100 flex-shrink-0">
          <div>
            <p className="text-sm font-black text-slate-800">{entry.name}</p>
            <p className="text-[0.68rem] text-slate-400">{entry.platform} · Installation logs · {entry.logs.length} device{entry.logs.length === 1 ? '' : 's'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-xl water-glow text-slate-400">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {entry.logs.length === 0 ? (
            <div className="p-10 text-center">
              <FileText className="mx-auto h-8 w-8 text-slate-300 mb-3" />
              <p className="text-sm text-slate-400">No installation records for this application.</p>
            </div>
          ) : (
            <table className="z-table">
              <thead><tr>{['Device', 'Version', 'Status', 'Last Seen', 'Error Details'].map(h => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {entry.logs.map(log => (
                  <tr key={log.deviceId}>
                    <td className="font-semibold text-slate-700">{log.deviceName || '—'}</td>
                    <td className="font-mono text-[0.7rem] text-slate-500">{log.version}</td>
                    <td><UpdateStatusBadge status={log.status === 'Installed' ? 'Up to date' : log.status} /></td>
                    <td className="text-slate-400 text-[0.68rem]">{log.lastSeen || '—'}</td>
                    <td className="text-slate-400 text-[0.68rem]">{log.errorDetails ?? 'Not reported by this integration'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}

function AppsPlatformTable({ entries, platformLoading }: { entries: ManageEngineAppEntry[]; platformLoading: boolean }) {
  const [search, setSearch]     = useState('')
  const [sortKey, setSortKey]   = useState<AppSortKey>('deviceCount')
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('desc')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [logEntry, setLogEntry] = useState<ManageEngineAppEntry | null>(null)

  const toggleSort = (key: AppSortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const filteredSorted = useMemo(() => {
    let result = entries
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(a => a.name.toLowerCase().includes(q))
    }
    const dir = sortDir === 'asc' ? 1 : -1
    return [...result].sort((a, b) => {
      switch (sortKey) {
        case 'name':           return a.name.localeCompare(b.name) * dir
        case 'deviceCount':     return (a.deviceCount - b.deviceCount) * dir
        case 'latestVersion':   return a.latestVersion.localeCompare(b.latestVersion) * dir
        case 'updateStatus':    return a.updateStatus.localeCompare(b.updateStatus) * dir
        default:                return 0
      }
    })
  }, [entries, search, sortKey, sortDir])

  const { page, setPage, totalPages, paginated } = usePagination(filteredSorted, PAGE_SIZE)

  if (platformLoading) return (
    <div className="glass rounded-2xl p-10 text-center">
      <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-[#F46C00] border-t-transparent mb-3" />
      <p className="text-sm text-slate-400">Loading installed-application inventory…</p>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search applications…" className="h-9 w-full rounded-xl pl-9 pr-3 text-xs water-input" />
        {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2"><X className="h-3.5 w-3.5 text-slate-400" /></button>}
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="h-[2px]" style={{ background: 'linear-gradient(90deg,#FF6B35,#F46C00,#FFB800)' }} />
        {filteredSorted.length === 0 ? (
          <div className="p-10 text-center">
            <Layers className="mx-auto h-8 w-8 text-slate-300 mb-3" />
            <p className="text-sm text-slate-400">{entries.length === 0 ? 'No applications reported for this platform.' : 'No applications match'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="z-table">
              <thead>
                <tr>
                  <SortHeader label="Application" sortKeyName="name" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                  <th>Installed Version</th>
                  <SortHeader label="Devices" sortKeyName="deviceCount" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                  <SortHeader label="Latest Version" sortKeyName="latestVersion" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                  <SortHeader label="Update Status" sortKeyName="updateStatus" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(entry => {
                  const multi = entry.installedVersions.length > 1
                  return (
                    <Fragment key={entry.appId}>
                      <tr>
                        <td className="font-semibold text-slate-700">{entry.name}</td>
                        <td className="font-mono text-[0.7rem] text-slate-500">
                          {multi ? (
                            <button
                              type="button"
                              onClick={() => setExpandedId(id => id === entry.appId ? null : entry.appId)}
                              className="inline-flex items-center gap-1 rounded-full bg-orange-50 border border-orange-200 px-2 py-0.5 text-[0.65rem] font-bold text-orange-700"
                            >
                              {expandedId === entry.appId ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              Multiple Versions
                            </button>
                          ) : entry.installedVersions[0] ?? 'Unknown'}
                        </td>
                        <td className="text-slate-600 font-semibold">{entry.deviceCount}</td>
                        <td className="font-mono text-[0.7rem] text-slate-500">{entry.latestVersion}</td>
                        <td><UpdateStatusBadge status={entry.updateStatus} /></td>
                        <td>
                          <button
                            type="button"
                            onClick={() => setLogEntry(entry)}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 glass px-2.5 py-1 text-[0.62rem] font-semibold text-slate-500 water-glow-sm"
                          >
                            <FileText className="h-3 w-3" />View Logs
                          </button>
                        </td>
                      </tr>
                      {expandedId === entry.appId && (
                        <tr>
                          <td colSpan={6} className="bg-slate-50/60 !py-3">
                            <div className="space-y-1 pl-2">
                              {versionBreakdown(entry).map(v => (
                                <div key={v.version} className="flex items-center justify-between gap-2 text-xs max-w-sm">
                                  <span className="font-mono text-slate-500">{v.version}</span>
                                  <span className="text-slate-400">{v.count} device{v.count === 1 ? '' : 's'}</span>
                                </div>
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
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage}
              totalItems={filteredSorted.length} pageSize={PAGE_SIZE} itemLabel="application" />
          </div>
        )}
      </div>

      {logEntry && <AppLogsPanel entry={logEntry} onClose={() => setLogEntry(null)} />}
    </div>
  )
}

interface Props { onBack: () => void }

// ManageEngine App Inventory — real cross-device installed-application
// aggregation (deviceCount/version breakdown/update status) via
// getManageEngineAppInventory(). The plain device-listing, fabricated
// "Patch Status" percentages, and fake "Automation" rule toggles that used
// to live alongside this in ManageEngineDevicesPage.tsx were removed —
// they duplicated the ManageEngine console or had zero real backing.
export function ManageEngineAppInventoryPage({ onBack }: Props) {
  const [devices, setDevices] = useState<ApiDevice[]>([])
  const [data, setData]       = useState<{ windows: ManageEngineAppEntry[]; macos: ManageEngineAppEntry[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(false)
  const [platformTab, setPlatformTab] = useState<AppPlatformTab>('Windows')

  const load = () => {
    setLoading(true)
    setError(false)
    Promise.all([
      api.fetchAllDevicesRaw({ source: 'manageengine', limit: 500 }).then(r => r.devices).catch(() => []),
      api.fetchManageEngineAppsInventory(),
    ])
      .then(([devs, apps]) => { setDevices(devs); setData(apps) })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const windows = data?.windows ?? []
  const macos   = data?.macos ?? []
  const active  = platformTab === 'Windows' ? windows : macos

  return (
    <div className="flex flex-col gap-5 w-full page-enter">
      {/* Header */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="h-[3px]" style={{ background: 'linear-gradient(90deg,#FF6B35,#F46C00,#FFB800)' }} />
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={onBack}
              className="flex items-center gap-1.5 rounded-full border border-slate-200 glass px-3 py-1.5 text-sm font-medium text-slate-600 water-glow">
              <ArrowLeft className="h-4 w-4" />Back
            </button>
            <div className="grid h-10 w-10 place-items-center rounded-2xl" style={{ background: 'linear-gradient(135deg,#FF6B35,#F46C00)' }}>
              <Settings className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-800">ManageEngine App Inventory</h1>
              <p className="text-[0.68rem] text-slate-400">Cross-device installed-application aggregation, by platform</p>
            </div>
          </div>
          <button type="button" onClick={load}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 glass px-3 py-1.5 text-xs font-semibold text-slate-500 water-glow">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-[#F46C00]' : ''}`} />Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="glass rounded-2xl p-10 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-slate-300 mb-3" />
          <p className="text-sm text-slate-500 font-semibold mb-1">Could not load application inventory</p>
          <p className="text-xs text-slate-400">Check the ManageEngine connection in Settings → Integrations.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="Windows Apps" value={loading ? '—' : windows.length} color="#0078D4" />
            <StatCard label="macOS Apps"   value={loading ? '—' : macos.length}   color="#10B981" />
            <StatCard label="Devices Scanned" value={devices.length} color="#F46C00" sub="ManageEngine" />
          </div>

          <div className="flex gap-1 glass rounded-2xl p-1 w-fit">
            {(['Windows', 'macOS'] as const).map(p => (
              <button key={p} type="button" onClick={() => setPlatformTab(p)}
                className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all ${platformTab === p ? 'glass-strong text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                style={platformTab === p ? { boxShadow: '0 0 0 1px rgba(255,107,53,0.2), 0 4px 12px rgba(255,107,53,0.1)' } : {}}>
                {p === 'Windows' ? <MonitorSmartphone className="h-3.5 w-3.5" /> : <Apple className="h-3.5 w-3.5" />}
                {p} Apps
              </button>
            ))}
          </div>

          <AppsPlatformTable entries={active} platformLoading={loading} />
        </div>
      )}
    </div>
  )
}
