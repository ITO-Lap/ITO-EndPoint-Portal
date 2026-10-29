import { ApplicationSecurityTabs } from '../components/appIntel/ApplicationSecurityTabs'
import { Fragment, useState, useEffect, useMemo } from 'react'
import {
  Settings, RefreshCw,
  Search, X, ArrowLeft,
  ChevronDown, AlertCircle, Layers, Apple, MonitorSmartphone,
  ChevronRight, FileText,
} from 'lucide-react'
import { api } from '../api'
import { AppIntelligencePage } from './AppIntelligencePage'
import type { ManageEngineAppEntry, ManageEngineAppLogEntry, MacAppClassification } from '../api'
import { usePagination } from '../hooks/usePagination'
import { Pagination } from '../components/ui/Pagination'
import { SortableHeader } from '../components/ui/SortableHeader'
import { sortRows, toggleSortDirection, type SortDirection } from '../lib/tableSorting'

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

const CLASSIFICATION_META: Record<MacAppClassification, { label: string; style: string }> = {
  system_preinstalled:      { label: 'Apple system',   style: 'bg-slate-50 text-slate-500 border-slate-200' },
  managed_self_service:     { label: 'Managed / Self Service', style: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  manual_or_user_installed: { label: 'Manual / user',  style: 'bg-blue-50 text-blue-700 border-blue-200' },
  unknown_review_required:  { label: 'Review',         style: 'bg-amber-50 text-amber-700 border-amber-200' },
}

const SOURCE_FILTERS = [
  ['all', 'All sources'], ['intune', 'Intune'], ['endpoint_central', 'Endpoint Central'],
  ['self_service', 'Self Service'], ['manual', 'Manual'], ['unknown', 'Unknown'],
] as const
type SourceFilter = typeof SOURCE_FILTERS[number][0]

function ClassificationBadge({ entry }: { entry: ManageEngineAppEntry }) {
  if (!entry.classification) return null
  const meta = CLASSIFICATION_META[entry.classification]
  return (
    <span title={`${entry.classificationReason ?? ''}${entry.confidence ? ` (confidence: ${entry.confidence})` : ''}`}
      className={`inline-flex rounded-full border px-2 py-0.5 text-[0.62rem] font-bold ${meta.style}`}>
      {meta.label}
    </span>
  )
}

type AppSortKey = 'name' | 'installedVersion' | 'deviceCount' | 'latestVersion' | 'updateStatus'
type AppPlatformTab = 'Windows' | 'macOS'

function UpdateStatusBadge({ status }: { status: ManageEngineAppEntry['updateStatus'] }) {
  const styles: Record<ManageEngineAppEntry['updateStatus'], string> = {
    'Up to date':       'bg-emerald-50 text-emerald-700 border-emerald-200',
    'Update Available': 'bg-amber-50 text-amber-700 border-amber-200',
    'Unknown':          'bg-slate-50 text-slate-500 border-slate-200',
  }
  // Compared only against the newest version seen in this fleet, never a vendor release — so don't say "up to date".
  const labels: Record<ManageEngineAppEntry['updateStatus'], string> = {
    'Up to date': 'Fleet-aligned', 'Update Available': 'Version drift', 'Unknown': 'Unknown',
  }
  return (
    <span title="Compared with the newest version installed in this fleet, not the vendor's latest release. See Verified updates."
      className={`inline-flex rounded-full border px-2 py-0.5 text-[0.62rem] font-bold ${styles[status]}`}>{labels[status]}</span>
  )
}

// Groups an app's per-device log entries by installed version — powers the
// "Multiple Versions" expandable breakdown (real counts, derived from the
// same log records shown in the log viewer, not a separate fabricated stat).
function versionBreakdown(entry: ManageEngineAppEntry): { version: string; count: number }[] {
  // Intune's detailed device records are fetched only when View Logs is opened.
  // Use its aggregate counts here so expanding Multiple Versions never produces
  // an empty panel before those records have been requested.
  if (entry.versionCounts?.length) return entry.versionCounts.map(({ version, deviceCount }) => ({ version, count: deviceCount }))
  const counts = new Map<string, number>()
  for (const log of entry.logs) counts.set(log.version, (counts.get(log.version) ?? 0) + 1)
  return Array.from(counts.entries()).map(([version, count]) => ({ version, count }))
}

function AppLogsPanel({ entry, onClose }: { entry: ManageEngineAppEntry; onClose: () => void }) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const logs = sortKey ? sortRows(entry.logs, log => {
    switch (sortKey) {
      case 'device': return log.deviceName
      case 'version': return log.version
      case 'status': return log.status
      case 'lastSeen': return Date.parse(log.lastSeen) || log.lastSeen
      case 'error': return log.errorDetails
      default: return ''
    }
  }, sortDirection) : entry.logs
  const handleSort = (key: string) => { setSortDirection(direction => toggleSortDirection(sortKey, direction, key)); setSortKey(key) }
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
              <thead><tr>
                <SortableHeader label="Device" sortKey="device" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Version" sortKey="version" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Status" sortKey="status" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Last Seen" sortKey="lastSeen" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Error Details" sortKey="error" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
              </tr></thead>
              <tbody>
                {logs.map(log => (
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

interface MacControls { hiddenSystemApps: number; showSystem: boolean; onToggleSystem: (v: boolean) => void }

function AppsPlatformTable({ entries, platformLoading, loadLogs, macControls }: {
  entries: ManageEngineAppEntry[]; platformLoading: boolean
  loadLogs?: (entry: ManageEngineAppEntry) => Promise<ManageEngineAppLogEntry[]>
  /** Present only on the macOS tab, where entries carry a classification. */
  macControls?: MacControls
}) {
  const [classFilter, setClassFilter]   = useState<'all' | MacAppClassification>('all')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const classifiable = !!macControls
  const [search, setSearch]     = useState('')
  const [sortKey, setSortKey]   = useState<AppSortKey>('deviceCount')
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('desc')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [logEntry, setLogEntry] = useState<ManageEngineAppEntry | null>(null)
  const [logsLoadingId, setLogsLoadingId] = useState<string | null>(null)
  const [logsError, setLogsError] = useState<string | null>(null)

  // Intune keeps the per-device list server-side until a row is opened.
  const openLogs = async (entry: ManageEngineAppEntry) => {
    if (!loadLogs) { setLogEntry(entry); return }
    setLogsLoadingId(entry.appId)
    setLogsError(null)
    try { setLogEntry({ ...entry, logs: await loadLogs(entry) }) }
    catch (e) { setLogsError(e instanceof Error ? e.message : 'Could not load devices for this application') }
    finally { setLogsLoadingId(null) }
  }

  const toggleSort = (next: string) => {
    const key = next as AppSortKey
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const filteredSorted = useMemo(() => {
    let result = entries
    if (classFilter !== 'all') result = result.filter(a => a.classification === classFilter)
    if (sourceFilter !== 'all') result = result.filter(a => a.installSource === sourceFilter || a.reportedBy?.includes(sourceFilter))
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(a => a.name.toLowerCase().includes(q))
    }
    const dir = sortDir === 'asc' ? 1 : -1
    return [...result].sort((a, b) => {
      switch (sortKey) {
        case 'name':           return a.name.localeCompare(b.name) * dir
        case 'installedVersion': return (a.installedVersions[0] ?? '').localeCompare(b.installedVersions[0] ?? '', undefined, { numeric: true }) * dir
        case 'deviceCount':     return (a.deviceCount - b.deviceCount) * dir
        case 'latestVersion':   return a.latestVersion.localeCompare(b.latestVersion) * dir
        case 'updateStatus':    return a.updateStatus.localeCompare(b.updateStatus) * dir
        default:                return 0
      }
    })
  }, [entries, search, sortKey, sortDir, classFilter, sourceFilter])

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

      {macControls && (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-2 font-semibold text-slate-600 cursor-pointer">
            <input type="checkbox" checked={macControls.showSystem} onChange={e => macControls.onToggleSystem(e.target.checked)} className="h-3.5 w-3.5 accent-[#F46C00]" />
            Show Apple system apps
          </label>
          <select value={classFilter} onChange={e => setClassFilter(e.target.value as 'all' | MacAppClassification)}
            className="h-8 rounded-xl px-2 text-xs water-input" aria-label="Filter by classification">
            <option value="all">All classifications</option>
            {(Object.keys(CLASSIFICATION_META) as MacAppClassification[])
              .filter(c => macControls.showSystem || c !== 'system_preinstalled')
              .map(c => <option key={c} value={c}>{CLASSIFICATION_META[c].label}</option>)}
          </select>
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value as SourceFilter)}
            className="h-8 rounded-xl px-2 text-xs water-input" aria-label="Filter by source">
            {SOURCE_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {!macControls.showSystem && macControls.hiddenSystemApps > 0 && (
            <span className="text-slate-400">{macControls.hiddenSystemApps.toLocaleString()} Apple system apps hidden</span>
          )}
        </div>
      )}

      {logsError && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">{logsError}</div>}

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
                  <SortableHeader label="Application" sortKey="name" activeSortKey={sortKey} direction={sortDir} onSort={toggleSort} />
                  {classifiable && <th>Classification</th>}
                  <SortableHeader label="Installed Version" sortKey="installedVersion" activeSortKey={sortKey} direction={sortDir} onSort={toggleSort} />
                  <SortableHeader label="Devices" sortKey="deviceCount" activeSortKey={sortKey} direction={sortDir} onSort={toggleSort} />
                  <SortableHeader label="Newest Installed" sortKey="latestVersion" activeSortKey={sortKey} direction={sortDir} onSort={toggleSort} />
                  <SortableHeader label="Fleet Status" sortKey="updateStatus" activeSortKey={sortKey} direction={sortDir} onSort={toggleSort} />
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
                        {classifiable && <td><ClassificationBadge entry={entry} /></td>}
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
                            onClick={() => void openLogs(entry)}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 glass px-2.5 py-1 text-[0.62rem] font-semibold text-slate-500 water-glow-sm"
                          >
                            <FileText className="h-3 w-3" />{logsLoadingId === entry.appId ? 'Loading…' : 'View Logs'}
                          </button>
                        </td>
                      </tr>
                      {expandedId === entry.appId && (
                        <tr>
                          <td colSpan={classifiable ? 7 : 6} className="bg-slate-50/60 !py-3">
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

interface Props { onBack: () => void; viewerRole?: string; userEmail?: string; onNavigate?: (page: string) => void }

type AppSource = 'endpoint-central' | 'intune' | 'verified'
type EcData = Awaited<ReturnType<typeof api.fetchManageEngineAppsInventory>>

// App inventory by source. Endpoint Central: full agent scan minus OS/updates/bundled components, so what
// remains is manual or Self Service installs (the API has no install-source field to split those two).
// Intune: Windows apps assigned as "available" (Company Portal Self Service) with per-device install state.
export function ManageEngineAppInventoryPage({ onBack, viewerRole, userEmail, onNavigate }: Props) {
  const [source, setSource]   = useState<AppSource>('endpoint-central')
  const [ec, setEc]           = useState<EcData | null>(null)
  const [intune, setIntune]   = useState<Awaited<ReturnType<typeof api.fetchIntuneSelfServiceApps>> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [platformTab, setPlatformTab] = useState<AppPlatformTab>('Windows')
  // Default view hides only Apple apps confidently identified as pre-installed macOS; the toggle is for troubleshooting.
  const [showSystem, setShowSystem] = useState(false)

  const load = (refresh = false) => {
    if (source === 'verified') return // the Verified updates view loads and syncs itself
    setLoading(true)
    setError(null)
    const request = source === 'endpoint-central'
      ? api.fetchManageEngineAppsInventory(refresh, showSystem).then(setEc)
      : api.fetchIntuneSelfServiceApps(refresh).then(setIntune)
    request
      .catch(e => setError(e instanceof Error ? e.message : 'Request failed'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [source, showSystem])
  const isVerified = source === 'verified'

  // The Endpoint Central scan runs server-side for a while; keep polling until it reports idle.
  const ecScanning     = source === 'endpoint-central' && ec?.progress.status === 'running'
  const intuneBuilding = source === 'intune' && intune?.progress.status === 'running'
  const scanning = ecScanning || intuneBuilding
  useEffect(() => {
    if (!scanning) return
    const id = window.setInterval(() => {
      if (ecScanning) api.fetchManageEngineAppsInventory(false, showSystem).then(setEc).catch(() => {})
      else api.fetchIntuneSelfServiceApps().then(setIntune).catch(() => {})
    }, 20_000)
    return () => window.clearInterval(id)
  }, [ecScanning, intuneBuilding, showSystem])

  const isEc    = source === 'endpoint-central'
  const windows = isEc ? ec?.windows ?? [] : intune?.windows ?? []
  const macos   = isEc ? ec?.macos ?? [] : []
  const tab: AppPlatformTab = isEc ? platformTab : 'Windows'
  const active  = tab === 'Windows' ? windows : macos
  const cov     = ec?.coverage

  return (
    <div className="flex flex-col gap-5 w-full page-enter">
      <ApplicationSecurityTabs active="ManageEngine App Inventory" onNavigate={onNavigate} />
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
              <p className="text-[0.68rem] text-slate-400">Installed applications by source and platform, plus verified vendor versions and packaging status</p>
            </div>
          </div>
          {!isVerified && (
            <button type="button" onClick={() => load(true)}
              className="flex items-center gap-1.5 rounded-full border border-slate-200 glass px-3 py-1.5 text-xs font-semibold text-slate-500 water-glow">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-[#F46C00]' : ''}`} />Refresh
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 glass rounded-2xl p-1 w-fit">
        {([['endpoint-central', 'Endpoint Central'], ['intune', 'Intune Self Service'], ['verified', 'Verified updates']] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setSource(id)}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${source === id ? 'is-selected' : 'text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {isVerified ? <AppIntelligencePage embedded viewerRole={viewerRole} userEmail={userEmail} /> : <>
      <p className="text-[0.7rem] text-slate-500">
        {isEc
          ? 'Endpoint Central agent inventory for client devices only (Windows servers are excluded), with OS components and updates removed. On macOS, only Apple apps that shipped with the OS are hidden by default (toggle to show them); everything else is labelled Managed / Manual / Review. Endpoint Central does not record how an app was installed, so apps without a known managed deployment are labelled Manual. Only devices running the Endpoint Central agent are covered.'
          : 'Windows apps published to Company Portal (assignment intent “available”). The catalog total includes every published app; the table shows the subset with a discovered installation and counts its installed devices. Source: Microsoft Graph.'}
      </p>

      {ecScanning && ec && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-xs text-orange-800">
          Scanning Endpoint Central client systems (Macs first): {ec.progress.scanned.toLocaleString()} of {ec.progress.total.toLocaleString()}.
          Endpoint Central limits API calls, so a full scan takes a while; the numbers below are partial and update automatically.
        </div>
      )}
      {intuneBuilding && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-xs text-orange-800">
          Reading the Company Portal app catalog and discovered installs from Intune. This takes a few minutes; the list updates automatically.
        </div>
      )}
      {source === 'intune' && intune?.progress.error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">Intune read failed: {intune.progress.error}</div>
      )}

      {error ? (
        <div className="glass rounded-2xl p-10 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-slate-300 mb-3" />
          <p className="text-sm text-slate-500 font-semibold mb-1">Could not load application inventory</p>
          <p className="text-xs text-slate-400">{error}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label={isEc ? 'Windows Apps' : 'Company Portal Catalog'} value={loading ? '—' : (isEc ? windows.length : (intune?.catalogWindowsApps ?? 0))} color="#0078D4"
              sub={isEc ? undefined : `${windows.length.toLocaleString()} with discovered installs`} />
            {isEc && <StatCard label="macOS Apps" value={loading ? '—' : macos.length} color="#10B981" />}
            {isEc && <StatCard label="Devices Scanned" value={loading || !cov ? '—' : cov.withInventory} color="#F46C00"
              sub={cov ? `Mac ${cov.macos.scanned}/${cov.macos.devices} · Windows clients ${cov.windows.scanned}/${cov.windows.devices}${cov.failed ? ` · ${cov.failed} failed` : ''}` : undefined} />}
          </div>

          {isEc && (
            <div className="flex gap-1 glass rounded-2xl p-1 w-fit">
              {(['Windows', 'macOS'] as const).map(p => (
                <button key={p} type="button" onClick={() => setPlatformTab(p)}
                  className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all ${platformTab === p ? 'is-selected' : 'text-slate-500 hover:text-slate-700'}`}
                  style={platformTab === p ? { boxShadow: '0 0 0 1px rgba(255,107,53,0.2), 0 4px 12px rgba(255,107,53,0.1)' } : {}}>
                  {p === 'Windows' ? <MonitorSmartphone className="h-3.5 w-3.5" /> : <Apple className="h-3.5 w-3.5" />}
                  {p} Apps
                </button>
              ))}
            </div>
          )}

          <AppsPlatformTable key={`${source}-${tab}`} entries={active} platformLoading={loading}
            loadLogs={isEc ? undefined : entry => api.fetchIntuneSelfServiceAppDevices(entry.appId)}
            macControls={isEc && tab === 'macOS' ? { hiddenSystemApps: ec?.hiddenSystemApps ?? 0, showSystem, onToggleSystem: setShowSystem } : undefined} />
        </div>
      )}
      </>}
    </div>
  )
}
