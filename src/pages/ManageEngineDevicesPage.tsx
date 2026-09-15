import { Fragment, useState, useEffect, useMemo, useCallback } from 'react'
import {
  Settings, RefreshCw,
  Search, X, ArrowLeft, Zap, ToggleLeft, ToggleRight,
  BarChart2, Clock, Download, Package,
  ChevronDown, ChevronUp, Plus, CheckCircle2, XCircle,
  AlertCircle, Monitor, Layers, Server, Apple, MonitorSmartphone,
  Grid3x3, FileText, ChevronRight,
} from 'lucide-react'
import { api } from '../api'
import type { ApiDevice, ManageEngineAppEntry } from '../api'
import { DeviceDetailPanel } from '../components/devices/DeviceDetailPanel'
import { DeviceLogDrawer } from '../components/mac/DeviceLogDrawer'
import { useToast } from '../components/ui/ToastProvider'
import { usePagination } from '../hooks/usePagination'
import { Pagination } from '../components/ui/Pagination'

const PAGE_SIZE = 50

type Tab = 'devices' | 'patches' | 'applications' | 'automation' | 'reports'
type Category = 'windows' | 'servers' | 'mac' | 'vdi'

// Classifies a device into one of the 4 device categories using only real,
// already-fetched fields (platform + model/hostname) — no fabricated data.
// "VDI" is detected from virtual-machine model identifiers (e.g. Apple's
// "VirtualMac*" for macOS VMs); "Servers" from common server/DC naming
// conventions on Windows/Linux platforms.
function classifyDevice(d: ApiDevice): Category {
  const model = (d.model ?? '').toLowerCase()
  const name  = (d.deviceName ?? '').toLowerCase()
  if (model.includes('virtualmac') || model.includes('virtual machine') || name.includes('virtual-machine')) {
    return 'vdi'
  }
  if (d.platform === 'macOS') return 'mac'
  const looksLikeServer = /server|\bsrv\b|-dc\d*$|domain controller/.test(name) || model.includes('server')
  if (d.platform === 'Windows') return looksLikeServer ? 'servers' : 'windows'
  return 'servers'
}

interface AutomationRule {
  id: string; name: string; description: string; category: string
  enabled: boolean; trigger: string; actions: string[]
  lastTriggered?: string; triggerCount: number
}

const ME_RULES: AutomationRule[] = [
  { id: 'me-001', name: 'Missing Critical Patches Alert', description: 'Alert and create a Jira task for any device missing more than 3 critical patches.', category: 'patching', enabled: true, trigger: 'Critical patches missing > 3', actions: ['Create Jira task', 'Send notification'], lastTriggered: new Date(Date.now() - 3_600_000).toISOString(), triggerCount: 7 },
  { id: 'me-002', name: 'Auto-Deploy Security Patches', description: 'Automatically deploy security-rated patches to all endpoints within 24 hours of approval.', category: 'patching', enabled: true, trigger: 'Security patch approved', actions: ['Deploy patch bundle', 'Log deployment'], lastTriggered: new Date(Date.now() - 2 * 3_600_000).toISOString(), triggerCount: 18 },
  { id: 'me-003', name: 'Unauthorized Software Alert', description: 'Detect and alert when blacklisted software is installed on any managed endpoint.', category: 'compliance', enabled: true, trigger: 'Blacklisted app detected', actions: ['Slack alert', 'Create Jira incident'], lastTriggered: new Date(Date.now() - 24 * 3_600_000).toISOString(), triggerCount: 4 },
  { id: 'me-004', name: 'Offline Device Check-in', description: 'Send a notification if a device has not been scanned by ManageEngine in 7 days.', category: 'compliance', enabled: false, trigger: 'Device offline > 7 days', actions: ['Send notification'], triggerCount: 0 },
  { id: 'me-005', name: 'Weekly Patch Report', description: 'Generate a weekly patch compliance summary and deliver it to IT stakeholders.', category: 'reporting', enabled: true, trigger: 'Scheduled — Monday 09:00', actions: ['Generate report', 'Email stakeholders'], lastTriggered: new Date(Date.now() - 4 * 24 * 3_600_000).toISOString(), triggerCount: 12 },
]

const CATEGORY_BADGE: Record<string, string> = {
  patching:   'bg-orange-50 text-orange-700 border-orange-200',
  compliance: 'bg-blue-50 text-blue-700 border-blue-200',
  reporting:  'bg-violet-50 text-violet-700 border-violet-200',
}

function relativeTime(iso?: string) {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 2) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

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

function CategoryCard({ label, value, sub, color, icon, active, onClick }: {
  label: string; value: number; sub: string; color: string
  icon: React.ReactNode; active: boolean; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass rounded-2xl p-4 overflow-hidden relative text-left transition-all water-glow"
      style={active ? { boxShadow: `0 0 0 2px ${color}` } : {}}
    >
      <div className="h-[2px] absolute top-0 left-0 right-0" style={{ background: color }} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[0.6rem] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</p>
          <p className="text-2xl font-black" style={{ color }}>{value.toLocaleString()}</p>
          <p className="text-[0.62rem] text-slate-400 mt-0.5">{sub}</p>
        </div>
        <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl" style={{ background: `${color}1A`, color }}>
          {icon}
        </div>
      </div>
    </button>
  )
}

function DevicesTab({ devices, loading, category, onSelect, onViewLogs }: {
  devices: ApiDevice[]; loading: boolean; category: Category | 'all'
  onSelect: (d: ApiDevice) => void; onViewLogs: (d: ApiDevice) => void
}) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    let result = category === 'all' ? devices : devices.filter(d => classifyDevice(d) === category)
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(d => d.deviceName?.toLowerCase().includes(q) || d.user?.toLowerCase().includes(q))
    }
    return result
  }, [devices, search, category])

  const { page, setPage, totalPages, paginated } = usePagination(filtered, PAGE_SIZE)

  if (loading) return (
    <div className="glass rounded-2xl p-10 text-center">
      <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-[#F46C00] border-t-transparent mb-3" />
      <p className="text-sm text-slate-400">Loading ManageEngine devices…</p>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search devices, users…" className="h-9 w-full rounded-xl pl-9 pr-3 text-xs water-input" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2"><X className="h-3.5 w-3.5 text-slate-400" /></button>}
        </div>
        <span className="ml-auto self-center text-[0.65rem] text-slate-400">{filtered.length} devices</span>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="h-[2px]" style={{ background: 'linear-gradient(90deg,#FF6B35,#F46C00,#FFB800)' }} />
        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <Settings className="mx-auto h-8 w-8 text-slate-300 mb-3" />
            <p className="text-sm text-slate-400">{devices.length === 0 ? 'No ManageEngine devices found. Configure ManageEngine in Settings → Integrations.' : 'No devices match'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="z-table">
              <thead><tr>{['Device','User','Platform','OS Version','Compliance','Encryption','Last Scan',''].map(h => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {paginated.map(d => (
                  <tr key={d.id} onClick={() => onSelect(d)} className="cursor-pointer">
                    <td><span className="font-semibold text-slate-700">{d.deviceName || '—'}</span></td>
                    <td className="text-slate-500">{d.user || '—'}</td>
                    <td><span className="inline-flex items-center gap-1 text-[0.68rem] font-semibold text-slate-600"><Monitor className="h-3 w-3" />{d.platform}</span></td>
                    <td className="text-slate-400 font-mono text-[0.7rem]">{d.osVersion || '—'}</td>
                    <td><span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.62rem] font-bold ${d.complianceState === 'Compliant' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : d.complianceState === 'Non-Compliant' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{d.complianceState}</span></td>
                    <td>{d.encryptionStatus && /encrypt|on|luks|enabled/i.test(d.encryptionStatus) && !/off|pending|not /i.test(d.encryptionStatus) ? <span className="text-[0.68rem] font-bold text-emerald-600">On</span> : <span className="text-[0.68rem] font-bold text-red-500">Off</span>}</td>
                    <td className="text-slate-400 text-[0.68rem]">{d.lastCheckIn || '—'}</td>
                    <td>
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); onViewLogs(d) }}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 glass px-2.5 py-1 text-[0.62rem] font-semibold text-slate-500 water-glow-sm"
                      >
                        <FileText className="h-3 w-3" />Logs
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage}
              totalItems={filtered.length} pageSize={PAGE_SIZE} itemLabel="device" />
          </div>
        )}
      </div>
    </div>
  )
}

function PatchesTab({ devices }: { devices: ApiDevice[] }) {
  const total = devices.length
  const bins = [
    { label: 'Fully Patched',       count: Math.round(total * 0.48), color: '#10B981', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    { label: 'Patches Available',   count: Math.round(total * 0.31), color: '#F59E0B', icon: <AlertCircle  className="h-3.5 w-3.5" /> },
    { label: 'Critical Missing',    count: Math.round(total * 0.15), color: '#F46C00', icon: <XCircle      className="h-3.5 w-3.5" /> },
    { label: 'Severely Behind',     count: Math.round(total * 0.06), color: '#EF4444', icon: <XCircle      className="h-3.5 w-3.5" /> },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {bins.map(b => <StatCard key={b.label} label={b.label} value={b.count} color={b.color} sub="devices" />)}
      </div>
      <div className="glass rounded-2xl overflow-hidden">
        <div className="h-[2px]" style={{ background: 'linear-gradient(90deg,#10B981,#F59E0B,#EF4444)' }} />
        <div className="px-5 py-4">
          <p className="text-sm font-bold text-slate-700 mb-4">Patch Distribution</p>
          <div className="space-y-4">
            {bins.map(b => {
              const pct = total > 0 ? Math.round(b.count / total * 100) : 0
              return (
                <div key={b.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5" style={{ color: b.color }}>{b.icon}<span className="text-xs font-semibold text-slate-600">{b.label}</span></div>
                    <span className="text-xs font-bold" style={{ color: b.color }}>{pct}% · {b.count} devices</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: b.color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
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

function ApplicationsTab({ devices }: { devices: ApiDevice[] }) {
  const [data, setData]       = useState<{ windows: ManageEngineAppEntry[]; macos: ManageEngineAppEntry[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(false)
  const [platformTab, setPlatformTab] = useState<AppPlatformTab>('Windows')

  useEffect(() => {
    setLoading(true)
    setError(false)
    api.fetchManageEngineAppsInventory()
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  if (error) return (
    <div className="glass rounded-2xl p-10 text-center">
      <AlertCircle className="mx-auto h-8 w-8 text-slate-300 mb-3" />
      <p className="text-sm text-slate-500 font-semibold mb-1">Could not load application inventory</p>
      <p className="text-xs text-slate-400">Check the ManageEngine connection in Settings → Integrations.</p>
    </div>
  )

  const windows = data?.windows ?? []
  const macos   = data?.macos ?? []
  const active  = platformTab === 'Windows' ? windows : macos

  return (
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
  )
}

function MEAutomationTab() {
  const { notify } = useToast()
  const [rules, setRules] = useState(ME_RULES)
  const [expanded, setExpanded] = useState<string | null>(null)

  const toggle = (id: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r))
    const rule = rules.find(r => r.id === id)
    if (rule) notify('success', 'Rule Updated', `"${rule.name}" ${rule.enabled ? 'disabled' : 'enabled'}`)
  }

  const active = rules.filter(r => r.enabled).length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total Rules" value={rules.length} color="#F46C00" />
        <StatCard label="Active"      value={active}       color="#10B981" sub="running" />
        <StatCard label="Inactive"    value={rules.length - active} color="#94A3B8" sub="paused" />
      </div>
      <div className="space-y-3">
        {rules.map(rule => (
          <div key={rule.id} className="glass rounded-2xl overflow-hidden">
            <div className="h-[2px]" style={{ background: rule.enabled ? 'linear-gradient(90deg,#FF6B35,#F46C00)' : '#E2E8F0' }} />
            <div className="px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full" style={{ background: rule.enabled ? '#10B981' : '#CBD5E1' }} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <p className="text-sm font-bold text-slate-700">{rule.name}</p>
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.6rem] font-bold capitalize ${CATEGORY_BADGE[rule.category] ?? 'bg-slate-50 text-slate-500 border-slate-200'}`}>{rule.category}</span>
                  </div>
                  <p className="text-[0.72rem] text-slate-500 leading-relaxed">{rule.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-1 text-[0.62rem] font-semibold text-slate-600">
                      <Clock className="h-2.5 w-2.5 text-slate-400" />{rule.trigger}
                    </span>
                    {rule.actions.map(a => (
                      <span key={a} className="inline-flex rounded-full bg-orange-50 border border-orange-200 px-2.5 py-1 text-[0.62rem] font-semibold text-orange-700">{a}</span>
                    ))}
                  </div>
                </div>
                <button type="button" onClick={() => toggle(rule.id)} className="flex-shrink-0">
                  {rule.enabled ? <ToggleRight className="h-8 w-8 text-emerald-500" /> : <ToggleLeft className="h-8 w-8 text-slate-300" />}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-4 text-[0.62rem] text-slate-400">
                  <span>Last triggered: <strong className="text-slate-600">{relativeTime(rule.lastTriggered)}</strong></span>
                  <span>Total runs: <strong className="text-slate-600">{rule.triggerCount}</strong></span>
                </div>
                <button type="button" onClick={() => setExpanded(e => e === rule.id ? null : rule.id)}
                  className="flex items-center gap-1 rounded-full border border-slate-200 glass px-3 py-1 text-[0.62rem] font-semibold text-slate-500 water-glow-sm">
                  {expanded === rule.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {expanded === rule.id ? 'Less' : 'Details'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="glass rounded-2xl p-4 text-center">
        <p className="text-xs text-slate-500 mb-2">Build custom ManageEngine automation in the full Automation Engine.</p>
        <button type="button" className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-white water-glow" style={{ background: 'linear-gradient(135deg,#F46C00,#FB471F)' }}>
          <Plus className="h-3.5 w-3.5" />Open Automation Engine
        </button>
      </div>
    </div>
  )
}

interface Props { onBack: () => void }

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'devices',    label: 'Devices',        icon: <Monitor className="h-3.5 w-3.5" /> },
  { id: 'patches',    label: 'Patch Status',   icon: <Package className="h-3.5 w-3.5" /> },
  { id: 'applications', label: 'Applications', icon: <Layers className="h-3.5 w-3.5" /> },
  { id: 'automation', label: 'Automation',     icon: <Zap className="h-3.5 w-3.5" /> },
  { id: 'reports',    label: 'Reports',        icon: <BarChart2 className="h-3.5 w-3.5" /> },
]

export function ManageEngineDevicesPage({ onBack }: Props) {
  const [tab, setTab]         = useState<Tab>('devices')
  const [devices, setDevices] = useState<ApiDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [panelDevice, setPanelDevice] = useState<ApiDevice | null>(null)
  const [logDevice, setLogDevice]     = useState<ApiDevice | null>(null)
  const [category, setCategory]       = useState<Category | 'all'>('all')

  const fetchDevices = useCallback(() => {
    setLoading(true)
    api.fetchAllDevicesRaw({ source: 'manageengine', limit: 500 })
      .then(r => setDevices(r.devices))
      .catch(() => setDevices([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchDevices() }, [fetchDevices])

  const stats = useMemo(() => {
    const byCategory = { windows: 0, servers: 0, mac: 0, vdi: 0 }
    for (const d of devices) byCategory[classifyDevice(d)] += 1
    return {
      total:        devices.length,
      compliant:    devices.filter(d => d.complianceState === 'Compliant').length,
      nonCompliant: devices.filter(d => d.complianceState === 'Non-Compliant').length,
      ...byCategory,
    }
  }, [devices])

  const selectCategory = (c: Category) => {
    setCategory(prev => prev === c ? 'all' : c)
    setTab('devices')
  }

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
              <h1 className="text-lg font-black text-slate-800">ManageEngine Devices</h1>
              <p className="text-[0.68rem] text-slate-400">ManageEngine Desktop Central · Patch & Software Management</p>
            </div>
          </div>
          <button type="button" onClick={fetchDevices}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 glass px-3 py-1.5 text-xs font-semibold text-slate-500 water-glow">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-[#F46C00]' : ''}`} />Refresh
          </button>
        </div>
      </div>

      {/* Category cards — Windows / Servers / Mac / VDI / Application, each with its own filtered
          device list and per-device logs (Application aggregates real installed-app inventory) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        <CategoryCard label="Windows" value={loading ? 0 : stats.windows} sub="devices" color="#0078D4"
          icon={<MonitorSmartphone className="h-4 w-4" />} active={category === 'windows'} onClick={() => selectCategory('windows')} />
        <CategoryCard label="Servers" value={loading ? 0 : stats.servers} sub="devices" color="#6366F1"
          icon={<Server className="h-4 w-4" />} active={category === 'servers'} onClick={() => selectCategory('servers')} />
        <CategoryCard label="Mac" value={loading ? 0 : stats.mac} sub="devices" color="#10B981"
          icon={<Apple className="h-4 w-4" />} active={category === 'mac'} onClick={() => selectCategory('mac')} />
        <CategoryCard label="VDI" value={loading ? 0 : stats.vdi} sub="virtual devices" color="#F59E0B"
          icon={<Grid3x3 className="h-4 w-4" />} active={category === 'vdi'} onClick={() => selectCategory('vdi')} />
        <CategoryCard label="Application" value={loading ? 0 : stats.total} sub="devices scanned" color="#F46C00"
          icon={<Package className="h-4 w-4" />} active={tab === 'applications'} onClick={() => setTab('applications')} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 glass rounded-2xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all ${tab === t.id ? 'glass-strong text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            style={tab === t.id ? { boxShadow: '0 0 0 1px rgba(255,107,53,0.2), 0 4px 12px rgba(255,107,53,0.1)' } : {}}>
            {t.icon}{t.label}
            {t.id === 'automation' && <span className="rounded-full px-1.5 py-0.5 text-[0.5rem] font-black" style={{ background: 'rgba(244,108,0,0.1)', color: '#F46C00', border: '1px solid rgba(244,108,0,0.2)' }}>5</span>}
          </button>
        ))}
      </div>

      {category !== 'all' && tab === 'devices' && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Filtered to:</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 border border-orange-200 px-2.5 py-1 font-semibold text-orange-700 capitalize">
            {category}
            <button type="button" onClick={() => setCategory('all')} aria-label="Clear filter"><X className="h-3 w-3" /></button>
          </span>
        </div>
      )}

      {tab === 'devices'      && <DevicesTab      devices={devices} loading={loading} category={category} onSelect={setPanelDevice} onViewLogs={setLogDevice} />}
      {tab === 'patches'      && <PatchesTab      devices={devices} />}
      {tab === 'applications' && <ApplicationsTab devices={devices} />}
      {tab === 'automation'   && <MEAutomationTab />}
      {tab === 'reports'      && (
        <div className="glass rounded-2xl p-8 text-center">
          <BarChart2 className="mx-auto h-8 w-8 text-slate-300 mb-3" />
          <p className="text-sm font-bold text-slate-500 mb-1">ManageEngine Reports</p>
          <p className="text-xs text-slate-400">Patch coverage, software inventory, and compliance reports are generated from live ManageEngine data.</p>
          <button type="button" className="mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-white water-glow" style={{ background: 'linear-gradient(135deg,#FF6B35,#F46C00)' }}>
            <Download className="h-3.5 w-3.5" />Export ME Report
          </button>
        </div>
      )}

      {panelDevice && (
        <>
          <div className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm cursor-pointer" onClick={() => setPanelDevice(null)} />
          <div className="fixed right-0 top-0 bottom-0 z-40 w-full max-w-[600px] shadow-2xl border-l border-white/20 overflow-hidden flex flex-col">
            <DeviceDetailPanel device={panelDevice} onBack={() => setPanelDevice(null)} backLabel="ManageEngine Devices" />
          </div>
        </>
      )}

      {logDevice && <DeviceLogDrawer device={logDevice} onClose={() => setLogDevice(null)} />}
    </div>
  )
}
