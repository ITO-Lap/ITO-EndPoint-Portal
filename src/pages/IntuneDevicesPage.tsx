import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Server, RefreshCw, Shield, Lock, ShieldCheck, ShieldAlert,
  Search, X, ArrowLeft,
  BarChart2, CheckCircle2, XCircle, AlertCircle,
  Clock, Monitor, Laptop2, Download, TrendingUp,
  Users, UserX, Building2, KeyRound, Activity, Info,
  Wifi, ShieldBan, CheckCheck, LogIn, Smartphone,
  Calendar, Package, User, ChevronLeft, ChevronRight,
  FileSpreadsheet, FileCode2,
} from 'lucide-react'
import { api } from '../api'
import type { ApiDevice, AppStatus, EntraGroupReportResult, EntraGroupSuggestion } from '../api'
import { intelApi } from '../api/intelligence'
import type { DeviceReportData, DeviceReportDevice } from '../api/intelligence'
import type { UserToolRole } from '../types'
import { DeviceDetailPanel } from '../components/devices/DeviceDetailPanel'
import { useToast } from '../components/ui/ToastProvider'
import { usePagination } from '../hooks/usePagination'
import { Pagination } from '../components/ui/Pagination'
import { SortableHeader } from '../components/ui/SortableHeader'
import { sortRows, toggleSortDirection, type SortDirection } from '../lib/tableSorting'
import { IntuneScriptsConfigTab } from './IntuneScriptsConfigPage'
import { CopyText } from '../components/ui/CopyText'
import { hasPermission, type PermissionMap } from '../lib/permissions'
import { usePermissions } from '../context/PermissionsContext'

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'devices' | 'compliance' | 'security' | 'reports' | 'entra' | 'entra_groups' | 'scripts_config'

// Tabs restricted to this smaller set of roles — currently just Scripts &
// Configs, which reads/exports raw script content and policy JSON and
// should stay admin-only even though the rest of Intune Devices is open to
// Helpdesk. Checked both when building the visible tab list and again
// before rendering tab content, so a stale `tab` value (e.g. from a prior
// session as a different role) can't render restricted content either.
const RESTRICTED_TABS: Partial<Record<Tab, string>> = {
  scripts_config: 'intuneScriptsConfig.access',
}

function canSeeTab(tab: Tab, viewerRole: UserToolRole, permissions: PermissionMap): boolean {
  const requiredKey = RESTRICTED_TABS[tab]
  return !requiredKey || hasPermission(viewerRole, permissions, requiredKey)
}

// ── KPI Card (static or clickable) ───────────────────────────────────────────

function KpiCard({ label, value, sub, color, onClick, disabled }: {
  label: string; value: string | number; sub?: string; color: string
  onClick?: () => void; disabled?: boolean
}) {
  const body = (
    <>
      <div className="h-[2px] absolute top-0 left-0 right-0" style={{ background: color }} />
      <p className="text-[0.6rem] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</p>
      <p className="text-2xl font-black" style={{ color }}>{value}</p>
      {sub && <p className="text-[0.62rem] text-slate-400 mt-0.5">{sub}</p>}
      {onClick && <p className="text-[0.58rem] mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color }}>View devices →</p>}
    </>
  )
  if (!onClick) return <div className="glass rounded-2xl p-4 overflow-hidden relative">{body}</div>
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="glass rounded-2xl p-4 overflow-hidden relative text-left w-full group transition-all hover:shadow-lg hover:scale-[1.02] disabled:cursor-default disabled:hover:scale-100 disabled:hover:shadow-none">
      {body}
    </button>
  )
}

// ── Devices Tab ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

interface IntuneAgentAppDevice {
  deviceId: string
  deviceName: string
  user: string
  platform: 'Windows' | 'macOS'
  lastCheckIn: string
  inventoryAvailable: boolean
  zscaler: { installed: boolean; version: string | null }
  crowdstrike: { installed: boolean; version: string | null }
}

interface IntuneAgentAppInventory {
  totalDevices: number
  inventoryAvailableDevices: number
  inventoryUnavailableDevices: number
  zscalerInstalled: number
  crowdstrikeInstalled: number
  devices: IntuneAgentAppDevice[]
}

type IntuneAgentFilter = 'all' | 'zscaler' | 'crowdstrike' | 'inventory-failed'

function DevicesTab({ devices, loading, onSelect, initialCompliance = 'all', initialPlatform = 'all' }: {
  devices: ApiDevice[]; loading: boolean; onSelect: (d: ApiDevice) => void
  initialCompliance?: string; initialPlatform?: string
}) {
  const [search,     setSearch]     = useState('')
  const [compliance, setCompliance] = useState(initialCompliance)
  const [platform,   setPlatform]   = useState(initialPlatform)
  const [page,       setPage]       = useState(1)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const platformCounts = useMemo(() => ({
    all:     devices.length,
    Windows: devices.filter(d => d.platform === 'Windows').length,
    Android: devices.filter(d => d.platform === 'Android').length,
    iOS:     devices.filter(d => d.platform === 'iOS').length,
    macOS:   devices.filter(d => d.platform === 'macOS').length,
  }), [devices])

  const platformTabs = useMemo(() => {
    const tabs: { id: string; label: string; count: number; icon: React.ReactNode }[] = [
      { id: 'all',     label: 'All',     count: platformCounts.all,     icon: <Monitor    className="h-3 w-3" /> },
      { id: 'Windows', label: 'Windows', count: platformCounts.Windows, icon: <Monitor    className="h-3 w-3" /> },
    ]
    if (platformCounts.Android > 0) tabs.push({ id: 'Android', label: 'Android', count: platformCounts.Android, icon: <Smartphone className="h-3 w-3" /> })
    if (platformCounts.iOS     > 0) tabs.push({ id: 'iOS',     label: 'iOS',     count: platformCounts.iOS,     icon: <Smartphone className="h-3 w-3" /> })
    if (platformCounts.macOS   > 0) tabs.push({ id: 'macOS',   label: 'macOS',   count: platformCounts.macOS,   icon: <Laptop2    className="h-3 w-3" /> })
    return tabs
  }, [platformCounts])

  const filtered = useMemo(() => {
    let list = devices
    if (platform !== 'all')    list = list.filter(d => d.platform === platform)
    if (compliance !== 'all')  list = list.filter(d => d.complianceState === compliance)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(d =>
        d.deviceName?.toLowerCase().includes(q) ||
        d.user?.toLowerCase().includes(q) ||
        d.serialNumber?.toLowerCase().includes(q)
      )
    }
    return list
  }, [devices, platform, compliance, search])

  const sortedDevices = sortKey ? sortRows(filtered, device => {
    switch (sortKey) {
      case 'device': return device.deviceName
      case 'user': return device.user
      case 'platform': return device.platform
      case 'osVersion': return device.osVersion
      case 'serial': return device.serialNumber
      case 'encryption': return device.encryptionStatus
      case 'compliance': return device.complianceState
      case 'lastCheckIn': return Date.parse(device.lastCheckIn) || device.lastCheckIn
      default: return ''
    }
  }, sortDirection) : filtered
  const totalPages  = Math.max(1, Math.ceil(sortedDevices.length / PAGE_SIZE))
  const pageDevices = sortedDevices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleSort = (key: string) => {
    setSortDirection(direction => toggleSortDirection(sortKey, direction, key))
    setSortKey(key)
  }

  useEffect(() => { setPage(1) }, [search, compliance, platform])

  const complianceColor = (s: string) => {
    if (s === 'Compliant')     return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    if (s === 'Non-Compliant') return 'bg-red-50 text-red-700 border-red-200'
    return 'bg-amber-50 text-amber-700 border-amber-200'
  }

  if (loading) return (
    <div className="glass rounded-2xl p-10 text-center">
      <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-[#0078D4] border-t-transparent mb-3" />
      <p className="text-sm text-slate-400">Loading Intune devices…</p>
    </div>
  )

  return (
    <div className="space-y-3">
      {/* Platform sub-tabs */}
      <div className="flex gap-1 glass rounded-2xl p-1 flex-wrap">
        {platformTabs.map(pt => (
          <button key={pt.id} type="button" onClick={() => setPlatform(pt.id)}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${platform === pt.id ? 'is-selected' : 'text-slate-500 hover:text-slate-700'}`}
            style={platform === pt.id ? { boxShadow: '0 0 0 1px rgba(14,165,233,0.2),0 4px 12px rgba(14,165,233,0.1)' } : {}}>
            {pt.icon}{pt.label}
            <span className={`rounded-full px-1.5 py-0.5 text-[0.55rem] font-black ${platform === pt.id ? 'bg-[#0078D4]/10 text-[#0078D4]' : 'bg-slate-100 text-slate-500'}`}>
              {pt.count.toLocaleString()}
            </span>
          </button>
        ))}
      </div>

      {/* Search + compliance filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search devices, users, serial…"
            className="h-9 w-full rounded-xl pl-9 pr-3 text-xs water-input" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2"><X className="h-3.5 w-3.5 text-slate-400" /></button>}
        </div>
        {(['all','Compliant','Warning','Non-Compliant'] as const).map(s => (
          <button key={s} type="button" onClick={() => setCompliance(s)}
            className={`rounded-full border px-3 py-1 text-[0.68rem] font-semibold transition ${compliance === s ? 'text-white border-transparent' : 'border-slate-200 glass text-slate-600 hover:border-slate-300'}`}
            style={compliance === s ? { background: 'linear-gradient(135deg,#0078D4,#6366F1)' } : {}}>
            {s === 'all' ? 'All' : s}
          </button>
        ))}
        <span className="ml-auto self-center text-[0.65rem] text-slate-400">
          {filtered.length.toLocaleString()} device{filtered.length !== 1 ? 's' : ''}
          {filtered.length !== devices.length ? ` of ${devices.length.toLocaleString()} total` : ''}
        </span>
      </div>

      {/* Table */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="h-[2px]" style={{ background: 'linear-gradient(90deg,#0078D4,#0EA5E9,#6366F1)' }} />
        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <Monitor className="mx-auto h-8 w-8 text-slate-300 mb-3" />
            <p className="text-sm text-slate-400">No devices match your filters</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="z-table">
                <thead>
                  <tr>
                    {[
                      ['Device', 'device'], ['User', 'user'], ['Platform', 'platform'], ['OS Version', 'osVersion'],
                      ['Serial', 'serial'], ['Encryption', 'encryption'], ['Compliance', 'compliance'], ['Last Check-in', 'lastCheckIn'],
                    ].map(([label, key]) => <SortableHeader key={key} label={label} sortKey={key} activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />)}
                  </tr>
                </thead>
                <tbody>
                  {pageDevices.map(d => (
                    <tr key={d.id} onClick={() => onSelect(d)} className="cursor-pointer">
                      <td><span className="font-semibold text-slate-700">{d.deviceName || '—'}</span></td>
                      <td className="text-slate-500">{d.user || '—'}</td>
                      <td>
                        <span className="inline-flex items-center gap-1 text-[0.68rem] font-semibold text-slate-600">
                          {d.platform === 'Android' || d.platform === 'iOS'
                            ? <Smartphone className="h-3 w-3 text-slate-400" />
                            : <Monitor    className="h-3 w-3 text-slate-400" />
                          }
                          {d.platform}
                        </span>
                      </td>
                      <td className="text-slate-500 font-mono text-[0.7rem]">{d.osVersion || '—'}</td>
                      <td className="text-slate-400 font-mono text-[0.68rem]">{d.serialNumber || '—'}</td>
                      <td>
                        {d.encryptionStatus?.toLowerCase().includes('on')
                          ? <span className="inline-flex items-center gap-1 text-[0.68rem] font-bold text-emerald-600"><Lock className="h-3 w-3" />On</span>
                          : <span className="inline-flex items-center gap-1 text-[0.68rem] font-bold text-red-500"><Lock className="h-3 w-3" />Off</span>}
                      </td>
                      <td>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.62rem] font-bold ${complianceColor(d.complianceState)}`}>
                          {d.complianceState}
                        </span>
                      </td>
                      <td className="text-slate-400 text-[0.68rem]">{d.lastCheckIn || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100/50 bg-slate-50/30 flex-wrap gap-2">
                <span className="text-[0.65rem] text-slate-400">
                  {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()}
                </span>
                <div className="flex items-center gap-1">
                  <button type="button" disabled={page === 1} onClick={() => setPage(1)}
                    className="rounded-lg border border-slate-200 glass px-2 py-1 text-[0.65rem] font-semibold text-slate-500 disabled:opacity-40 hover:text-slate-700 transition">«</button>
                  <button type="button" disabled={page === 1} onClick={() => setPage(p => p - 1)}
                    className="rounded-lg border border-slate-200 glass px-2 py-1 text-[0.65rem] font-semibold text-slate-500 disabled:opacity-40 hover:text-slate-700 transition">‹ Prev</button>
                  <div className="flex items-center gap-1 mx-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let p: number
                      if (totalPages <= 5)        p = i + 1
                      else if (page <= 3)          p = i + 1
                      else if (page >= totalPages - 2) p = totalPages - 4 + i
                      else                         p = page - 2 + i
                      return (
                        <button key={p} type="button" onClick={() => setPage(p)}
                          className={`rounded-lg px-2.5 py-1 text-[0.65rem] font-bold transition ${p === page ? 'text-white' : 'border border-slate-200 glass text-slate-500 hover:text-slate-700'}`}
                          style={p === page ? { background: 'linear-gradient(135deg,#0078D4,#6366F1)' } : {}}>
                          {p}
                        </button>
                      )
                    })}
                  </div>
                  <button type="button" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                    className="rounded-lg border border-slate-200 glass px-2 py-1 text-[0.65rem] font-semibold text-slate-500 disabled:opacity-40 hover:text-slate-700 transition">Next ›</button>
                  <button type="button" disabled={page === totalPages} onClick={() => setPage(totalPages)}
                    className="rounded-lg border border-slate-200 glass px-2 py-1 text-[0.65rem] font-semibold text-slate-500 disabled:opacity-40 hover:text-slate-700 transition">»</button>
                </div>
                <span className="text-[0.65rem] text-slate-400">Page {page} of {totalPages.toLocaleString()}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Compliance Tab ────────────────────────────────────────────────────────────

function ComplianceTab({ devices }: { devices: ApiDevice[] }) {
  const total = devices.length
  const compliant    = devices.filter(d => d.complianceState === 'Compliant').length
  const warning      = devices.filter(d => d.complianceState === 'Warning').length
  const nonCompliant = devices.filter(d => d.complianceState === 'Non-Compliant').length
  const rate = total > 0 ? Math.round(compliant / total * 100) : 0

  const policies = [
    { name: 'BitLocker Encryption',     pass: devices.filter(d => d.encryptionStatus?.toLowerCase().includes('on')).length,     total, icon: <Lock className="h-3.5 w-3.5" />, color: '#10B981' },
    { name: 'Windows Defender Active',  pass: devices.filter(d => d.antivirusStatus && d.antivirusStatus !== '—').length, total, icon: <Shield className="h-3.5 w-3.5" />, color: '#0EA5E9' },
    { name: 'Compliance Policy Passed', pass: compliant, total, icon: <ShieldCheck className="h-3.5 w-3.5" />, color: '#F46C00' },
  ]

  return (
    <div className="space-y-4">
      {/* Compliance score */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Compliance Rate', value: `${rate}%`, color: rate >= 90 ? '#10B981' : rate >= 70 ? '#F59E0B' : '#EF4444' },
          { label: 'Compliant',       value: compliant,    color: '#10B981' },
          { label: 'Warning',         value: warning,      color: '#F59E0B' },
          { label: 'Non-Compliant',   value: nonCompliant, color: '#EF4444' },
        ].map(s => <KpiCard key={s.label} {...s} />)}
      </div>

      {/* Policy breakdown */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="h-[2px]" style={{ background: 'linear-gradient(90deg,#0EA5E9,#6366F1)' }} />
        <div className="px-5 py-4">
          <p className="text-sm font-bold text-slate-700 mb-4">Compliance Policy Status</p>
          <div className="space-y-4">
            {policies.map(p => {
              const pct = p.total > 0 ? Math.round(p.pass / p.total * 100) : 0
              return (
                <div key={p.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2" style={{ color: p.color }}>{p.icon}<span className="text-xs font-semibold text-slate-700">{p.name}</span></div>
                    <span className="text-xs font-bold" style={{ color: p.color }}>{pct}% ({p.pass}/{p.total})</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: p.color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Non-compliant device list */}
      {nonCompliant > 0 && (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="h-[2px]" style={{ background: 'linear-gradient(90deg,#EF4444,#F59E0B)' }} />
          <div className="px-5 py-3.5 border-b border-slate-100/50">
            <p className="text-sm font-bold text-slate-700">Non-Compliant Devices <span className="text-red-600 ml-1">({nonCompliant})</span></p>
          </div>
          <div className="divide-y divide-slate-100/50">
            {devices.filter(d => d.complianceState !== 'Compliant').slice(0, 10).map(d => (
              <div key={d.id} className="flex items-center gap-3 px-5 py-3">
                <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <CopyText value={d.deviceName} label="Device name"><p className="text-xs font-bold text-slate-700 truncate">{d.deviceName}</p></CopyText>
                  <p className="text-[0.65rem] text-slate-400">{d.primaryIssue || 'Compliance issue detected'}</p>
                </div>
                <span className={`text-[0.62rem] font-bold rounded-full border px-2 py-0.5 ${
                  d.complianceState === 'Non-Compliant' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>{d.complianceState}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function downloadIntuneAppsCsv(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers, ...rows].map(row => row.map(value => `"${value.replace(/"/g, '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const anchor = Object.assign(document.createElement('a'), { href: url, download: filename })
  anchor.click()
  URL.revokeObjectURL(url)
}

function IntuneSecurityTab({ devices, loading }: { devices: ApiDevice[]; loading: boolean }) {
  const [inventory, setInventory] = useState<IntuneAgentAppInventory | null>(null)
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [inventoryError, setInventoryError] = useState<string | null>(null)
  const [filter, setFilter] = useState<IntuneAgentFilter>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const intuneDesktopDevices = useMemo(
    () => devices.filter(device => device.managementSource === 'Microsoft Intune' && (device.platform === 'Windows' || device.platform === 'macOS')),
    [devices],
  )

  const loadInventory = useCallback(async () => {
    setInventoryLoading(true)
    setInventoryError(null)
    try {
      const rows: IntuneAgentAppDevice[] = []
      const batchSize = 8
      for (let start = 0; start < intuneDesktopDevices.length; start += batchSize) {
        const batch = intuneDesktopDevices.slice(start, start + batchSize)
        const results = await Promise.allSettled(batch.map(device => api.fetchDeviceApps(device.id)))
        results.forEach((result, index) => {
          const device = batch[index]!
          const apps: AppStatus[] = result.status === 'fulfilled' ? result.value : []
          const matches = (app: AppStatus, pattern: RegExp) => pattern.test(`${app.name} ${app.publisher} ${app.appType ?? ''}`)
          const installedApp = (pattern: RegExp) => apps.find(app => app.status === 'Installed' && matches(app, pattern))
          const inventoryAvailable = result.status === 'fulfilled'
          const zscaler = installedApp(/zscaler/i)
          const crowdstrike = installedApp(/crowd\s*strike|\bfalcon\b/i)

          rows.push({
            deviceId: device.id,
            deviceName: device.deviceName,
            user: device.user,
            platform: device.platform as 'Windows' | 'macOS',
            lastCheckIn: device.lastCheckIn,
            inventoryAvailable,
            zscaler: { installed: inventoryAvailable && !!zscaler, version: inventoryAvailable ? zscaler?.version ?? null : null },
            crowdstrike: { installed: inventoryAvailable && !!crowdstrike, version: inventoryAvailable ? crowdstrike?.version ?? null : null },
          })
        })
      }
      const assessed = rows.filter(row => row.inventoryAvailable)
      setInventory({
        totalDevices: rows.length,
        inventoryAvailableDevices: assessed.length,
        inventoryUnavailableDevices: rows.length - assessed.length,
        zscalerInstalled: assessed.filter(row => row.zscaler.installed).length,
        crowdstrikeInstalled: assessed.filter(row => row.crowdstrike.installed).length,
        devices: rows,
      })
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : 'Failed to load Intune app inventory')
    } finally {
      setInventoryLoading(false)
    }
  }, [intuneDesktopDevices])

  useEffect(() => {
    if (!loading) void loadInventory()
  }, [loading, loadInventory])

  const visibleRows = useMemo(() => {
    const query = search.toLowerCase()
    return (inventory?.devices ?? []).filter(row => {
      if (!row.deviceName.toLowerCase().includes(query) && !row.user.toLowerCase().includes(query)) return false
      if (filter === 'inventory-failed') return !row.inventoryAvailable
      if (filter === 'zscaler' || filter === 'crowdstrike') return row.inventoryAvailable
      return true
    })
  }, [inventory, search, filter])

  useEffect(() => { setPage(1) }, [filter, search])

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE))
  const sortedRows = sortKey ? sortRows(visibleRows, row => {
    switch (sortKey) {
      case 'device': return row.deviceName
      case 'user': return row.user
      case 'platform': return row.platform
      case 'zscaler': return row.zscaler.version ?? (row.zscaler.installed ? 'Installed' : 'Not installed')
      case 'crowdstrike': return row.crowdstrike.version ?? (row.crowdstrike.installed ? 'Installed' : 'Not installed')
      case 'inventory': return inventoryStatus(row)
      case 'lastCheckIn': return Date.parse(row.lastCheckIn) || row.lastCheckIn
      default: return ''
    }
  }, sortDirection) : visibleRows
  const pageRows = sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const handleSort = (key: string) => { setSortDirection(direction => toggleSortDirection(sortKey, direction, key)); setSortKey(key) }
  const assessed = inventory?.inventoryAvailableDevices ?? 0
  const zscalerMissing = assessed - (inventory?.zscalerInstalled ?? 0)
  const crowdstrikeMissing = assessed - (inventory?.crowdstrikeInstalled ?? 0)

  function appStatus(row: IntuneAgentAppDevice, agent: 'zscaler' | 'crowdstrike') {
    if (!row.inventoryAvailable) return 'Inventory unavailable'
    const app = row[agent]
    return app.installed ? `Installed${app.version ? ` · ${app.version}` : ''}` : 'Not installed'
  }

  function inventoryStatus(row: IntuneAgentAppDevice) {
    if (!row.inventoryAvailable) return 'Request failed'
    return row.zscaler.installed || row.crowdstrike.installed ? 'App found' : 'No target app found'
  }

  const showZscaler = filter !== 'crowdstrike' && filter !== 'inventory-failed'
  const showCrowdStrike = filter !== 'zscaler' && filter !== 'inventory-failed'

  function handleExport() {
    const headers = ['Device', 'User', 'Platform', ...(showZscaler ? ['Zscaler'] : []), ...(showCrowdStrike ? ['CrowdStrike'] : []), filter === 'inventory-failed' ? 'Inventory Error' : 'Inventory Status', 'Last Check-in']
    const rows = visibleRows.map(row => [row.deviceName, row.user, row.platform, ...(showZscaler ? [appStatus(row, 'zscaler')] : []), ...(showCrowdStrike ? [appStatus(row, 'crowdstrike')] : []), inventoryStatus(row), row.lastCheckIn])
    downloadIntuneAppsCsv('intune-zscaler-crowdstrike-apps.csv', headers, rows)
  }

  const tileClass = 'rounded-xl border px-3 py-3 text-left transition hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <button type="button" aria-pressed={filter === 'zscaler'} onClick={() => setFilter('zscaler')} className={`${tileClass} ${filter === 'zscaler' ? 'border-sky-300 bg-sky-100 ring-1 ring-sky-200' : 'border-sky-100 bg-sky-50'}`}>
          <p className="text-[0.6rem] font-black uppercase tracking-widest text-sky-700">Zscaler installed</p><p className="mt-1 text-xl font-black text-slate-800">{inventoryLoading ? '…' : inventory?.zscalerInstalled ?? '—'}</p><p className="text-[0.62rem] text-slate-500">Not installed: {inventory ? zscalerMissing : '—'} · {assessed} assessed</p>
        </button>
        <button type="button" aria-pressed={filter === 'crowdstrike'} onClick={() => setFilter('crowdstrike')} className={`${tileClass} ${filter === 'crowdstrike' ? 'border-orange-300 bg-orange-100 ring-1 ring-orange-200' : 'border-orange-100 bg-orange-50'}`}>
          <p className="text-[0.6rem] font-black uppercase tracking-widest text-orange-700">CrowdStrike installed</p><p className="mt-1 text-xl font-black text-slate-800">{inventoryLoading ? '…' : inventory?.crowdstrikeInstalled ?? '—'}</p><p className="text-[0.62rem] text-slate-500">Not installed: {inventory ? crowdstrikeMissing : '—'} · {assessed} assessed</p>
        </button>
        <button type="button" aria-pressed={filter === 'inventory-failed'} onClick={() => setFilter('inventory-failed')} className={`${tileClass} ${filter === 'inventory-failed' ? 'border-amber-300 bg-amber-100 ring-1 ring-amber-200' : 'border-amber-100 bg-amber-50'}`}>
          <p className="text-[0.6rem] font-black uppercase tracking-widest text-amber-700">Inventory request failed</p><p className="mt-1 text-xl font-black text-slate-800">{inventoryLoading ? '…' : inventory?.inventoryUnavailableDevices ?? '—'}</p><p className="text-[0.62rem] text-slate-500">Could not assess these devices</p>
        </button>
        <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')} className={`${tileClass} ${filter === 'all' ? 'border-slate-300 bg-slate-100 ring-1 ring-slate-200' : 'border-slate-200 bg-slate-50'}`}>
          <p className="text-[0.6rem] font-black uppercase tracking-widest text-slate-500">Total Intune Macs + Windows</p><p className="mt-1 text-xl font-black text-slate-800">{inventoryLoading ? '…' : inventory?.totalDevices ?? intuneDesktopDevices.length}</p><p className="text-[0.62rem] text-slate-500">Show all assessed devices</p>
        </button>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100/60 p-3">
          <div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search device or user…" className="h-9 w-full rounded-xl pl-9 pr-3 text-xs water-input" /></div>
          {filter !== 'all' && <button type="button" onClick={() => setFilter('all')} className="text-xs font-semibold text-sky-700">Clear filter</button>}
          <button type="button" onClick={() => void loadInventory()} disabled={inventoryLoading || loading} className="flex items-center gap-1.5 rounded-lg border border-slate-200 glass px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${inventoryLoading ? 'animate-spin' : ''}`} />Refresh</button>
          {inventory && <button type="button" onClick={handleExport} className="flex items-center gap-1.5 rounded-lg border border-slate-200 glass px-3 py-2 text-xs font-semibold text-slate-600"><Download className="h-3.5 w-3.5" />Export CSV</button>}
          <span className="ml-auto text-[0.65rem] text-slate-400">{visibleRows.length.toLocaleString()} devices</span>
        </div>
        {inventoryError && <p className="px-4 py-3 text-xs text-red-600">Could not load Intune app inventory: {inventoryError}</p>}
        {inventoryLoading && !inventory ? <div className="p-10 text-center text-sm text-slate-400">Checking installed apps on Intune Windows and macOS devices…</div> : !inventory ? <div className="p-10 text-center text-sm text-slate-400">No app inventory results.</div> : visibleRows.length === 0 ? <div className="p-10 text-center text-sm text-slate-400">No devices match this filter.</div> : (
          <div className="overflow-x-auto">
            <table className="z-table min-w-[760px]">
              <thead><tr>
                <SortableHeader label="Device" sortKey="device" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="User" sortKey="user" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Platform" sortKey="platform" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
                {showZscaler && <SortableHeader label="Zscaler" sortKey="zscaler" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />}
                {showCrowdStrike && <SortableHeader label="CrowdStrike" sortKey="crowdstrike" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />}
                <SortableHeader label={filter === 'inventory-failed' ? 'Inventory Error' : 'Inventory Status'} sortKey="inventory" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Last Check-in" sortKey="lastCheckIn" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
              </tr></thead>
              <tbody>{pageRows.map(row => (
                <tr key={row.deviceId}>
                  <td className="font-semibold text-slate-700">{row.deviceName || '—'}</td><td className="text-slate-500">{row.user || '—'}</td><td>{row.platform}</td>
                  {showZscaler && <td className={row.inventoryAvailable && row.zscaler.installed ? 'text-emerald-700' : row.inventoryAvailable ? 'text-red-600' : 'text-amber-700'}>{appStatus(row, 'zscaler')}</td>}
                  {showCrowdStrike && <td className={row.inventoryAvailable && row.crowdstrike.installed ? 'text-emerald-700' : row.inventoryAvailable ? 'text-red-600' : 'text-amber-700'}>{appStatus(row, 'crowdstrike')}</td>}
                  <td className={!row.inventoryAvailable ? 'font-semibold text-amber-700' : row.zscaler.installed || row.crowdstrike.installed ? 'font-semibold text-emerald-700' : 'font-semibold text-red-600'}>{inventoryStatus(row)}</td>
                  <td className="text-slate-400">{row.lastCheckIn || '—'}</td>
                </tr>
              ))}</tbody>
            </table>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={visibleRows.length} pageSize={PAGE_SIZE} itemLabel="device" />
          </div>
        )}
        <div className="border-t border-slate-100/60 px-4 py-3 text-[0.65rem] text-slate-400">Application presence from Intune detected-app inventory; it does not confirm live agent health.</div>
      </div>
    </div>
  )
}

// ── Reports Tab ───────────────────────────────────────────────────────────────

const REPORT_PAGE_SIZE = 50

function ReportsTab({ devices }: { devices: ApiDevice[] }) {
  const total     = devices.length
  const encrypted = devices.filter(d => d.encryptionStatus?.toLowerCase().includes('on')).length
  const compliant = devices.filter(d => d.complianceState === 'Compliant').length
  const withEdr   = devices.filter(d => d.antivirusStatus && d.antivirusStatus !== '—').length

  const kpiCards = [
    { title: 'BitLocker Coverage', value: total > 0 ? `${Math.round(encrypted/total*100)}%` : '—', sub: `${encrypted}/${total} devices encrypted`, color: '#0EA5E9' },
    { title: 'Compliance Rate',    value: total > 0 ? `${Math.round(compliant/total*100)}%` : '—', sub: `${compliant} fully compliant`,            color: '#10B981' },
    { title: 'Defender Coverage',  value: total > 0 ? `${Math.round(withEdr/total*100)}%`   : '—', sub: `${withEdr} with active EDR`,              color: '#F46C00' },
    { title: 'Devices Managed',    value: total.toLocaleString(),                                   sub: 'via Microsoft Intune',                    color: '#6366F1' },
  ]

  // ── Detailed Graph API report ─────────────────────────────────────────────
  const [reportData,    setReportData]    = useState<DeviceReportData | null>(null)
  const [reportLoading, setReportLoading] = useState(true)
  const [reportError,   setReportError]   = useState<string | null>(null)
  const [exporting,     setExporting]     = useState(false)
  const [search,        setSearch]        = useState('')
  const [page,          setPage]          = useState(1)
  const [ownerFilter,   setOwnerFilter]   = useState<'all' | 'company' | 'personal'>('all')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  useEffect(() => {
    let cancelled = false
    intelApi.deviceReport()
      .then(res => {
        if (cancelled) return
        if (res.success) setReportData(res)
        else setReportError('Could not load device report')
        setReportLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setReportError('Server unreachable — check Intune credentials')
        setReportLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const filtered: DeviceReportDevice[] = useMemo(() => {
    if (!reportData) return []
    let items = reportData.devices
    if (ownerFilter !== 'all') items = items.filter(d => d.ownerType === ownerFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(d =>
        d.deviceName?.toLowerCase().includes(q) ||
        d.userPrincipalName?.toLowerCase().includes(q) ||
        d.serialNumber?.toLowerCase().includes(q) ||
        d.model?.toLowerCase().includes(q)
      )
    }
    return items
  }, [reportData, search, ownerFilter])

  const sortedReport = sortKey ? sortRows(filtered, device => {
    switch (sortKey) {
      case 'device': return device.deviceName
      case 'owner': return device.userPrincipalName
      case 'type': return device.ownerType
      case 'os': return device.operatingSystem
      case 'compliance': return device.complianceState
      case 'encrypted': return device.isEncrypted
      case 'enrolled': return Date.parse(device.enrolledDateTime ?? '') || device.enrolledDateTime
      case 'lastSync': return Date.parse(device.lastSyncDateTime ?? '') || device.lastSyncDateTime
      default: return ''
    }
  }, sortDirection) : filtered
  const totalPages = Math.ceil(sortedReport.length / REPORT_PAGE_SIZE)
  const pageItems  = sortedReport.slice((page - 1) * REPORT_PAGE_SIZE, page * REPORT_PAGE_SIZE)
  const handleReportSort = (key: string) => { setSortDirection(direction => toggleSortDirection(sortKey, direction, key)); setSortKey(key); setPage(1) }

  const m1 = reportData?.newDevicesByMonth[0]
  const m2 = reportData?.newDevicesByMonth[1]
  const a1 = reportData?.appsByMonth[0]
  const a2 = reportData?.appsByMonth[1]

  const [invExporting, setInvExporting] = useState(false)

  async function handleExcelExport() {
    setExporting(true)
    try { await intelApi.deviceReportExport() } catch { /* silently fail */ }
    finally { setExporting(false) }
  }

  async function handleInventoryExport() {
    setInvExporting(true)
    try { await intelApi.deviceInventoryExport({ ownerType: ownerFilter, search }) } catch { /* silently fail */ }
    finally { setInvExporting(false) }
  }

  return (
    <div className="space-y-4">

      {/* KPI summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpiCards.map(r => (
          <div key={r.title} className="glass rounded-2xl overflow-hidden relative p-4">
            <div className="h-[2px] absolute top-0 left-0 right-0" style={{ background: r.color }} />
            <div className="flex items-center justify-between mb-1">
              <p className="text-[0.6rem] font-black uppercase tracking-widest text-slate-400">{r.title}</p>
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <p className="text-2xl font-black" style={{ color: r.color }}>{r.value}</p>
            <p className="text-[0.62rem] text-slate-400 mt-0.5">{r.sub}</p>
          </div>
        ))}
      </div>

      {/* Loading state */}
      {reportLoading && (
        <div className="glass rounded-2xl p-8 flex items-center justify-center gap-3">
          <RefreshCw className="h-4 w-4 animate-spin text-blue-400" />
          <p className="text-sm text-slate-400">Loading device report from Intune…</p>
        </div>
      )}

      {/* Error state */}
      {reportError && !reportLoading && (
        <div className="glass rounded-2xl p-6 text-center">
          <p className="text-sm text-red-500">{reportError}</p>
        </div>
      )}

      {/* Report content */}
      {reportData && !reportLoading && (
        <>
          {/* Export header */}
          <div className="glass rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-bold text-slate-700">Device Report</p>
              <p className="text-[0.68rem] text-slate-400">
                {reportData.totalDevices.toLocaleString()} devices · 4-sheet Excel: Summary, Inventory, Enrollments, App Activity
              </p>
            </div>
            <button
              type="button"
              onClick={handleExcelExport}
              disabled={exporting}
              className="flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-white water-glow flex-shrink-0 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#10B981,#0EA5E9)' }}
            >
              {exporting
                ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Exporting…</>
                : <><Download className="h-3.5 w-3.5" />Export to Excel</>
              }
            </button>
          </div>

          {/* New Enrollments by Month */}
          <div className="glass rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-blue-400" />
              <p className="text-xs font-bold text-slate-700">New Enrollments by Month</p>
              <span className="ml-auto text-[0.65rem] text-slate-400">Current & previous month</span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[0.6rem] font-black uppercase tracking-widest text-slate-400 border-b border-white/10">
                  <th className="px-4 py-2.5 text-left">Month</th>
                  <th className="px-4 py-2.5 text-right">Devices Enrolled</th>
                  <th className="px-4 py-2.5 text-left">Trend</th>
                </tr>
              </thead>
              <tbody>
                {[m1, m2].map((m, i) => m ? (
                  <tr key={m.key} className="border-b border-white/5 hover:bg-white/5 transition">
                    <td className="px-4 py-2.5 font-semibold text-slate-700">{m.label}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="text-base font-black text-blue-500">{m.count.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      {i === 0 && m1 && m2 ? (
                        <span className={`font-semibold ${m1.count >= m2.count ? 'text-emerald-500' : 'text-red-400'}`}>
                          {m1.count >= m2.count ? '↑' : '↓'} {Math.abs(m1.count - m2.count)} vs {m2.label}
                        </span>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                ) : null)}
              </tbody>
            </table>
          </div>

          {/* App Activity by Month */}
          <div className="glass rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
              <Package className="h-3.5 w-3.5 text-violet-400" />
              <p className="text-xs font-bold text-slate-700">App Activity by Month</p>
              <span className="ml-auto text-[0.65rem] text-slate-400">Current & previous month</span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[0.6rem] font-black uppercase tracking-widest text-slate-400 border-b border-white/10">
                  <th className="px-4 py-2.5 text-left">Month</th>
                  <th className="px-4 py-2.5 text-right">Apps Added</th>
                  <th className="px-4 py-2.5 text-right">Apps Updated</th>
                  <th className="px-4 py-2.5 text-right">Total Activity</th>
                </tr>
              </thead>
              <tbody>
                {[a1, a2].map(a => a ? (
                  <tr key={a.key} className="border-b border-white/5 hover:bg-white/5 transition">
                    <td className="px-4 py-2.5 font-semibold text-slate-700">{a.label}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={a.added > 0 ? 'text-emerald-500 font-semibold' : 'text-slate-400'}>{a.added.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={a.updated > 0 ? 'text-amber-500 font-semibold' : 'text-slate-400'}>{a.updated.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={a.total > 0 ? 'font-black text-slate-700' : 'text-slate-400'}>{a.total.toLocaleString()}</span>
                    </td>
                  </tr>
                ) : null)}
              </tbody>
            </table>
            {(a1?.total === 0 && a2?.total === 0) && (
              <div className="px-4 py-3 border-t border-white/10 flex items-center gap-2 bg-amber-50/50">
                <AlertCircle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                <p className="text-[0.65rem] text-amber-700">
                  Showing 0 — <code className="bg-amber-100 px-1 rounded font-mono">DeviceManagementApps.Read.All</code> permission not granted in Azure App Registration
                </p>
              </div>
            )}
          </div>

          {/* Device Inventory */}
          <div className="glass rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3 flex-wrap">
              <Users className="h-3.5 w-3.5 text-orange-400" />
              <p className="text-xs font-bold text-slate-700">Device Inventory</p>
              <span className="text-[0.65rem] text-slate-400">{filtered.length.toLocaleString()} devices</span>
              <div className="ml-auto flex items-center gap-2 flex-wrap">
                <select
                  value={ownerFilter}
                  onChange={e => { setOwnerFilter(e.target.value as typeof ownerFilter); setPage(1) }}
                  className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1 text-xs text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  <option value="all">All Owners</option>
                  <option value="company">Company</option>
                  <option value="personal">Personal</option>
                </select>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Device, user, or serial…"
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1) }}
                    className="rounded-lg border border-white/20 bg-white/10 pl-7 pr-7 py-1 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400 w-44"
                  />
                  {search && (
                    <button onClick={() => { setSearch(''); setPage(1) }} className="absolute right-2 top-1/2 -translate-y-1/2">
                      <X className="h-3 w-3 text-slate-400 hover:text-slate-600" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleInventoryExport}
                  disabled={invExporting}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold text-white water-glow disabled:opacity-60 transition flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg,#0EA5E9,#6366F1)' }}
                >
                  {invExporting
                    ? <><RefreshCw className="h-3 w-3 animate-spin" />Exporting…</>
                    : <><Download className="h-3 w-3" />Export</>
                  }
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[0.6rem] font-black uppercase tracking-widest text-slate-400 border-b border-white/10">
                    <SortableHeader label="Device Name" sortKey="device" activeSortKey={sortKey} direction={sortDirection} onSort={handleReportSort} className="px-4 py-2.5 text-left" />
                    <SortableHeader label="Owner (Email)" sortKey="owner" activeSortKey={sortKey} direction={sortDirection} onSort={handleReportSort} className="px-4 py-2.5 text-left" />
                    <SortableHeader label="Type" sortKey="type" activeSortKey={sortKey} direction={sortDirection} onSort={handleReportSort} className="px-4 py-2.5 text-left" />
                    <SortableHeader label="OS" sortKey="os" activeSortKey={sortKey} direction={sortDirection} onSort={handleReportSort} className="px-4 py-2.5 text-left" />
                    <SortableHeader label="Compliance" sortKey="compliance" activeSortKey={sortKey} direction={sortDirection} onSort={handleReportSort} className="px-4 py-2.5 text-left" />
                    <SortableHeader label="Encrypted" sortKey="encrypted" activeSortKey={sortKey} direction={sortDirection} onSort={handleReportSort} className="px-4 py-2.5 text-left" />
                    <SortableHeader label="Enrolled" sortKey="enrolled" activeSortKey={sortKey} direction={sortDirection} onSort={handleReportSort} className="px-4 py-2.5 text-left" />
                    <SortableHeader label="Last Sync" sortKey="lastSync" activeSortKey={sortKey} direction={sortDirection} onSort={handleReportSort} className="px-4 py-2.5 text-left" />
                  </tr>
                </thead>
                <tbody>
                  {pageItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-400">No devices match your search</td>
                    </tr>
                  ) : pageItems.map((d: DeviceReportDevice) => (
                    <tr key={d.id} className="border-b border-white/5 hover:bg-white/5 transition">
                      <td className="px-4 py-2 font-semibold text-slate-800 whitespace-nowrap">{d.deviceName || '—'}</td>
                      <td className="px-4 py-2 text-slate-500 max-w-[180px] truncate" title={d.userPrincipalName}><CopyText value={d.userPrincipalName} label="User">{d.userPrincipalName || '—'}</CopyText></td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold border ${
                          d.ownerType === 'company' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-500 border-slate-200'
                        }`}>
                          {d.ownerType === 'company'
                            ? <><Building2 className="h-2.5 w-2.5" />Corp</>
                            : <><User className="h-2.5 w-2.5" />Personal</>
                          }
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{d.operatingSystem || '—'}</td>
                      <td className="px-4 py-2">
                        {d.complianceState === 'compliant'
                          ? <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[0.6rem] text-emerald-700 border border-emerald-200 font-semibold"><CheckCircle2 className="h-2.5 w-2.5" />Compliant</span>
                          : d.complianceState === 'noncompliant'
                            ? <span className="inline-flex items-center gap-0.5 rounded-full bg-red-50 px-1.5 py-0.5 text-[0.6rem] text-red-700 border border-red-200 font-semibold"><XCircle className="h-2.5 w-2.5" />Non-Compliant</span>
                            : <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-50 px-1.5 py-0.5 text-[0.6rem] text-slate-500 border border-slate-200 font-semibold">{d.complianceState || '—'}</span>
                        }
                      </td>
                      <td className="px-4 py-2 font-semibold">
                        <span className={d.isEncrypted ? 'text-emerald-500' : 'text-red-400'}>{d.isEncrypted ? '✓ Yes' : '✗ No'}</span>
                      </td>
                      <td className="px-4 py-2 text-slate-400 whitespace-nowrap">
                        {d.enrolledDateTime ? new Date(d.enrolledDateTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                      <td className="px-4 py-2 text-slate-400 whitespace-nowrap">
                        {d.lastSyncDateTime ? new Date(d.lastSyncDateTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between text-[0.65rem] text-slate-400">
                <span>
                  {((page - 1) * REPORT_PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * REPORT_PAGE_SIZE, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded hover:bg-white/10 disabled:opacity-30 transition">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="px-2">Page {page} / {totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1 rounded hover:bg-white/10 disabled:opacity-30 transition">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Entra ID Tab ──────────────────────────────────────────────────────────────

interface EUser  { id: string; displayName: string; upn: string; department: string; riskLevel: string; lastSignIn: string; accountStatus: string; mfaStatus: string }
interface EDev   { id: string; deviceName: string; primaryUser: string; os: string; osVersion: string; complianceState: string; encryptionState: string; joinType: string; lastCheckIn: string; daysSinceCheckIn: number; openIssues: string[] }
interface EGroup { id: string; displayName: string; description: string; memberCount: number; type: string }
interface EOvr   { configured: boolean; totalDevices: number; compliantDevices: number; nonCompliantDevices: number; inactiveDevices: number; totalUsers: number; highRiskUsers: number; devicesMissingEncryption: number }

function riskBadge(r: string) {
  if (r === 'High')   return 'bg-red-50 text-red-700 border-red-200'
  if (r === 'Medium') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (r === 'Low')    return 'bg-yellow-50 text-yellow-700 border-yellow-200'
  return 'bg-slate-100 text-slate-500 border-slate-200'
}

function compBadge(s: string) {
  if (s === 'Compliant')       return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (s === 'Non-Compliant')   return 'bg-red-50 text-red-700 border-red-200'
  if (s === 'In Grace Period') return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-slate-100 text-slate-500 border-slate-200'
}

function PermissionNotice({ permission, description }: { permission: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      <div className="rounded-2xl bg-slate-100 p-4 border border-slate-200"><KeyRound className="h-6 w-6 text-slate-400" /></div>
      <p className="text-sm font-bold text-slate-600">Data not available</p>
      <p className="text-xs text-slate-400 max-w-xs">Requires <code className="bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 font-mono text-slate-600">{permission}</code> Application permission in Azure.</p>
      <p className="text-[0.65rem] text-slate-400 max-w-xs">{description}</p>
    </div>
  )
}

const ENTRA_PAGE_SIZE = 50

function EntraIDTab() {
  const [overview,     setOverview]     = useState<EOvr | null>(null)
  const [users,        setUsers]        = useState<EUser[]>([])
  const [devices,      setDevices]      = useState<EDev[]>([])
  const [groups,       setGroups]       = useState<EGroup[]>([])
  const [loading,      setLoading]      = useState(true)
  const [loadError,    setLoadError]    = useState<string | null>(null)
  const [isLive,       setIsLive]       = useState(false)
  const [section,      setSection]      = useState<'users' | 'devices' | 'groups'>('users')
  const [uSearch,      setUSearch]      = useState('')
  const [dSearch,      setDSearch]      = useState('')
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [userSortKey, setUserSortKey] = useState<string | null>(null)
  const [userSortDirection, setUserSortDirection] = useState<SortDirection>('asc')
  const [deviceSortKey, setDeviceSortKey] = useState<string | null>(null)
  const [deviceSortDirection, setDeviceSortDirection] = useState<SortDirection>('asc')

  function load() {
    setLoading(true)
    setLoadError(null)
    Promise.allSettled([
      api.fetchEntraStatus(),
      api.fetchEntraOverview(),
      api.fetchEntraUsers(),
      api.fetchEntraDevices({ limit: 300 }),
      api.fetchEntraGroups(),
    ]).then(([st, ov, us, dv, gr]) => {
      // Credential presence comes from a dedicated, call-independent check —
      // so a permission error on one Graph endpoint (overview, users, …)
      // can't make a genuinely-configured tenant show as "not configured."
      setIsLive(st.status === 'fulfilled' && st.value.configured === true)
      if (ov.status === 'fulfilled') setOverview(ov.value as unknown as EOvr)
      if (us.status === 'fulfilled') setUsers((us.value as EUser[]) ?? [])
      if (dv.status === 'fulfilled') setDevices((dv.value as EDev[]) ?? [])
      if (gr.status === 'fulfilled') setGroups((gr.value as EGroup[]) ?? [])
      const rej = [st, ov, us, dv, gr].find(r => r.status === 'rejected') as PromiseRejectedResult | undefined
      if (rej) setLoadError(rej.reason instanceof Error ? rej.reason.message : 'Some Entra data unavailable')
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])  

  const filteredUsers   = useMemo(() => { const q = uSearch.toLowerCase(); return q ? users.filter(u => u.displayName.toLowerCase().includes(q) || u.upn.toLowerCase().includes(q) || (u.department ?? '').toLowerCase().includes(q)) : users }, [users, uSearch])
  const filteredDevices = useMemo(() => { const q = dSearch.toLowerCase(); return q ? devices.filter(d => d.deviceName.toLowerCase().includes(q) || d.primaryUser.toLowerCase().includes(q)) : devices }, [devices, dSearch])
  const riskCounts      = useMemo(() => ({ high: users.filter(u => u.riskLevel === 'High').length, medium: users.filter(u => u.riskLevel === 'Medium').length }), [users])

  const sortedUsers = userSortKey ? sortRows(filteredUsers, user => {
    switch (userSortKey) {
      case 'name': return user.displayName
      case 'upn': return user.upn
      case 'department': return user.department
      case 'risk': return user.riskLevel
      case 'lastSignIn': return Date.parse(user.lastSignIn ?? '') || user.lastSignIn
      case 'mfa': return user.mfaStatus
      case 'status': return user.accountStatus
      default: return ''
    }
  }, userSortDirection) : filteredUsers
  const sortedDirectoryDevices = deviceSortKey ? sortRows(filteredDevices, device => {
    switch (deviceSortKey) {
      case 'name': return device.deviceName
      case 'primaryUser': return device.primaryUser
      case 'os': return `${device.os} ${device.osVersion ?? ''}`
      case 'joinType': return device.joinType
      case 'compliance': return device.complianceState
      case 'encryption': return device.encryptionState
      case 'checkin': return device.daysSinceCheckIn ?? Date.parse(device.lastCheckIn ?? '')
      case 'issues': return device.openIssues?.length ?? 0
      default: return ''
    }
  }, deviceSortDirection) : filteredDevices
  const { page: usersPage, setPage: setUsersPage, totalPages: usersTotalPages, paginated: paginatedUsers } = usePagination(sortedUsers, ENTRA_PAGE_SIZE)
  const { page: devicesPage, setPage: setDevicesPage, totalPages: devicesTotalPages, paginated: paginatedDevices } = usePagination(sortedDirectoryDevices, ENTRA_PAGE_SIZE)
  const handleUserSort = (key: string) => { setUserSortDirection(direction => toggleSortDirection(userSortKey, direction, key)); setUserSortKey(key); setUsersPage(1) }
  const handleDeviceSort = (key: string) => { setDeviceSortDirection(direction => toggleSortDirection(deviceSortKey, direction, key)); setDeviceSortKey(key); setDevicesPage(1) }

  return (
    <div className="flex flex-col gap-4">

      {/* Source + refresh row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {isLive
            ? <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[0.65rem] font-bold text-emerald-700"><Activity className="h-3 w-3" />Live · Microsoft Graph API</span>
            : <span className="flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-[0.65rem] font-bold text-amber-700"><Info className="h-3 w-3" />Not configured — add Entra ID credentials in Settings</span>
          }
          {loadError && <span className="flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2.5 py-1 text-[0.65rem] font-semibold text-red-600 max-w-xs truncate"><AlertCircle className="h-3 w-3 flex-shrink-0" />{loadError}</span>}
        </div>
        <button type="button" onClick={load}
          className="flex items-center gap-1.5 rounded-full border border-slate-200 glass px-3 py-1.5 text-xs font-semibold text-slate-500 water-glow">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-[#0078D4]' : ''}`} />Refresh
        </button>
      </div>

      {/* KPI overview */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 7 }).map((_, i) => <div key={i} className="glass rounded-2xl h-20 animate-pulse bg-slate-100/50" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
          {[
            { label: 'Total Users',        value: overview?.totalUsers                 ?? '—', icon: <Users      className="h-4 w-4" />, color: '#0078D4' },
            { label: 'High Risk Users',    value: overview?.highRiskUsers              ?? '—', icon: <UserX      className="h-4 w-4" />, color: '#EF4444' },
            { label: 'Total Devices',      value: overview?.totalDevices               ?? '—', icon: <Monitor    className="h-4 w-4" />, color: '#0EA5E9' },
            { label: 'Compliant',          value: overview?.compliantDevices           ?? '—', icon: <ShieldCheck className="h-4 w-4" />, color: '#10B981' },
            { label: 'Non-Compliant',      value: overview?.nonCompliantDevices        ?? '—', icon: <ShieldBan  className="h-4 w-4" />, color: '#EF4444' },
            { label: 'Missing Encryption', value: overview?.devicesMissingEncryption   ?? '—', icon: <Lock       className="h-4 w-4" />, color: '#F59E0B' },
            { label: 'Groups',             value: groups.length > 0 ? groups.length   : '—',  icon: <Building2  className="h-4 w-4" />, color: '#6366F1' },
          ].map(c => (
            <div key={c.label} className="glass rounded-2xl px-4 py-3 overflow-hidden relative">
              <div className="h-[2px] absolute top-0 left-0 right-0 rounded-t-2xl" style={{ background: c.color }} />
              <div className="flex items-center gap-2.5 mt-1">
                <div className="rounded-xl p-1.5 flex-shrink-0" style={{ background: `${c.color}1a`, color: c.color }}>{c.icon}</div>
                <div>
                  <p className="text-lg font-black" style={{ color: c.color }}>{c.value}</p>
                  <p className="text-[0.6rem] font-semibold text-slate-400 leading-tight">{c.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Section switcher */}
      <div className="flex gap-1 glass rounded-2xl p-1 w-fit">
        {([
          { id: 'users'   as const, label: 'Users & Identity', icon: <Users     className="h-3.5 w-3.5" /> },
          { id: 'devices' as const, label: 'Device Directory', icon: <Monitor   className="h-3.5 w-3.5" /> },
          { id: 'groups'  as const, label: 'Groups',           icon: <Building2 className="h-3.5 w-3.5" /> },
        ]).map(s => (
          <button key={s.id} type="button" onClick={() => setSection(s.id)}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${section === s.id ? 'is-selected' : 'text-slate-500 hover:text-slate-700'}`}
            style={section === s.id ? { boxShadow: '0 0 0 1px rgba(0,120,212,0.2),0 4px 12px rgba(0,120,212,0.1)' } : {}}>
            {s.icon}{s.label}
            {s.id === 'users' && riskCounts.high > 0 && <span className="rounded-full px-1.5 py-0.5 text-[0.5rem] font-black bg-red-100 text-red-600 border border-red-200">{riskCounts.high} risk</span>}
          </button>
        ))}
      </div>

      {/* ── Users section ── */}
      {section === 'users' && (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="h-[2px]" style={{ background: 'linear-gradient(90deg,#0078D4,#6366F1)' }} />
          <div className="px-5 py-3.5 border-b border-slate-100/50 flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-700">Users &amp; Identity</p>
              <p className="text-[0.65rem] text-slate-400">{users.length} users · {riskCounts.high} high risk · {users.filter(u => u.accountStatus === 'Disabled').length} disabled — <span className="font-mono">User.Read.All + AuditLog.Read.All</span></p>
            </div>
            <div className="flex items-center gap-2">
              {riskCounts.high > 0 && <span className="rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[0.62rem] font-bold text-red-600">{riskCounts.high} High Risk</span>}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                <input value={uSearch} onChange={e => setUSearch(e.target.value)} placeholder="Search users…"
                  className="w-44 rounded-xl border border-slate-200 bg-white/70 pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#0078D4]/30" />
                {uSearch && <button onClick={() => setUSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><X className="h-3 w-3" /></button>}
              </div>
            </div>
          </div>
          {loading ? (
            <div className="p-8 flex items-center gap-2 text-slate-400 justify-center"><RefreshCw className="h-4 w-4 animate-spin" /><span className="text-sm">Loading users…</span></div>
          ) : users.length === 0 ? (
            <PermissionNotice permission="User.Read.All" description="Grants access to user profiles, sign-in activity, departments, and account state from Azure Active Directory." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-100/50">
                  <tr>
                    <SortableHeader label="Display Name" sortKey="name" activeSortKey={userSortKey} direction={userSortDirection} onSort={handleUserSort} className="px-4 py-2.5 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap" />
                    <SortableHeader label="UPN / Email" sortKey="upn" activeSortKey={userSortKey} direction={userSortDirection} onSort={handleUserSort} className="px-4 py-2.5 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap" />
                    <SortableHeader label="Department" sortKey="department" activeSortKey={userSortKey} direction={userSortDirection} onSort={handleUserSort} className="px-4 py-2.5 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap" />
                    <SortableHeader label="Risk" sortKey="risk" activeSortKey={userSortKey} direction={userSortDirection} onSort={handleUserSort} className="px-4 py-2.5 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap" />
                    <SortableHeader label="Last Sign-In" sortKey="lastSignIn" activeSortKey={userSortKey} direction={userSortDirection} onSort={handleUserSort} className="px-4 py-2.5 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap" />
                    <SortableHeader label="MFA" sortKey="mfa" activeSortKey={userSortKey} direction={userSortDirection} onSort={handleUserSort} className="px-4 py-2.5 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap" />
                    <SortableHeader label="Status" sortKey="status" activeSortKey={userSortKey} direction={userSortDirection} onSort={handleUserSort} className="px-4 py-2.5 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap" />
                  </tr>
                </thead>
                <tbody>
                  {paginatedUsers.flatMap((u, i) => {
                    const rows = [(
                      <tr key={u.id} onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}
                        className={`border-b border-slate-100/50 last:border-0 cursor-pointer transition-colors hover:bg-blue-50/40 ${i % 2 ? 'bg-slate-50/30' : ''} ${u.riskLevel === 'High' ? 'border-l-2 border-l-red-400' : u.riskLevel === 'Medium' ? 'border-l-2 border-l-amber-400' : ''}`}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full flex items-center justify-center text-[0.55rem] font-black text-white flex-shrink-0"
                              style={{ background: u.riskLevel === 'High' ? '#EF4444' : u.riskLevel === 'Medium' ? '#F59E0B' : '#0078D4' }}>
                              {(u.displayName || '?').charAt(0).toUpperCase()}
                            </div>
                            <CopyText value={u.displayName} label="User name"><span className="font-semibold text-slate-700 truncate max-w-[140px]">{u.displayName}</span></CopyText>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 max-w-[160px] truncate"><CopyText value={u.upn} label="User">{u.upn}</CopyText></td>
                        <td className="px-4 py-2.5 text-slate-500">{u.department || '—'}</td>
                        <td className="px-4 py-2.5">
                          {u.riskLevel && u.riskLevel !== 'None'
                            ? <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-bold text-[0.6rem] ${riskBadge(u.riskLevel)}`}><AlertCircle className="h-2.5 w-2.5" />{u.riskLevel}</span>
                            : <span className="text-slate-300 text-[0.6rem]">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">
                          {u.lastSignIn
                            ? <span className="flex items-center gap-1"><LogIn className="h-2.5 w-2.5 text-slate-400 flex-shrink-0" />{u.lastSignIn.startsWith('20') ? new Date(u.lastSignIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : u.lastSignIn}</span>
                            : <span className="text-slate-300">Never</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          {u.mfaStatus === 'Enabled'
                            ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700"><CheckCheck className="h-2.5 w-2.5" />MFA On</span>
                            : u.mfaStatus === 'Disabled'
                            ? <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[0.6rem] font-bold text-red-600"><ShieldBan className="h-2.5 w-2.5" />None</span>
                            : <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[0.6rem] font-bold text-slate-500">Unknown</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${u.accountStatus === 'Active' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-100 border-slate-200 text-slate-500'}`}>
                            {u.accountStatus === 'Active' ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}{u.accountStatus || 'Unknown'}
                          </span>
                        </td>
                      </tr>
                    )]
                    if (expandedUser === u.id) rows.push(
                      <tr key={`${u.id}-exp`} className="bg-blue-50/20">
                        <td colSpan={7} className="px-6 py-3">
                          <div className="flex flex-wrap gap-x-8 gap-y-2 text-xs">
                            <div><p className="text-[0.6rem] font-semibold text-slate-400 uppercase mb-0.5">User ID</p><p className="font-mono text-slate-600 text-[0.62rem]">{u.id}</p></div>
                            <div><p className="text-[0.6rem] font-semibold text-slate-400 uppercase mb-0.5">Risk Level</p><span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${riskBadge(u.riskLevel)}`}>{u.riskLevel || 'None'}</span></div>
                            <div><p className="text-[0.6rem] font-semibold text-slate-400 uppercase mb-0.5">Department</p><p className="text-slate-600">{u.department || '—'}</p></div>
                            <div><p className="text-[0.6rem] font-semibold text-slate-400 uppercase mb-0.5">Last Sign-In</p><p className="text-slate-600">{u.lastSignIn || 'Never'}</p></div>
                          </div>
                        </td>
                      </tr>
                    )
                    return rows
                  })}
                </tbody>
              </table>
              <Pagination page={usersPage} totalPages={usersTotalPages} onPageChange={setUsersPage}
                totalItems={filteredUsers.length} pageSize={ENTRA_PAGE_SIZE} itemLabel="user" />
            </div>
          )}
        </div>
      )}

      {/* ── Device Directory section ── */}
      {section === 'devices' && (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="h-[2px]" style={{ background: 'linear-gradient(90deg,#0EA5E9,#0078D4)' }} />
          <div className="px-5 py-3.5 border-b border-slate-100/50 flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-700">Device Directory</p>
              <p className="text-[0.65rem] text-slate-400">{devices.length} devices from Entra/Intune — <span className="font-mono">DeviceManagementManagedDevices.Read.All</span></p>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
              <input value={dSearch} onChange={e => setDSearch(e.target.value)} placeholder="Search devices…"
                className="w-44 rounded-xl border border-slate-200 bg-white/70 pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#0078D4]/30" />
              {dSearch && <button onClick={() => setDSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><X className="h-3 w-3" /></button>}
            </div>
          </div>
          {loading ? (
            <div className="p-8 flex items-center gap-2 text-slate-400 justify-center"><RefreshCw className="h-4 w-4 animate-spin" /><span className="text-sm">Loading devices…</span></div>
          ) : devices.length === 0 ? (
            <PermissionNotice permission="DeviceManagementManagedDevices.Read.All" description="Grants read access to managed device records, compliance states, and enrollment info from Microsoft Intune." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-100/50">
                  <tr>
                    <SortableHeader label="Device Name" sortKey="name" activeSortKey={deviceSortKey} direction={deviceSortDirection} onSort={handleDeviceSort} className="px-4 py-2.5 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap" />
                    <SortableHeader label="Primary User" sortKey="primaryUser" activeSortKey={deviceSortKey} direction={deviceSortDirection} onSort={handleDeviceSort} className="px-4 py-2.5 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap" />
                    <SortableHeader label="OS" sortKey="os" activeSortKey={deviceSortKey} direction={deviceSortDirection} onSort={handleDeviceSort} className="px-4 py-2.5 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap" />
                    <SortableHeader label="Join Type" sortKey="joinType" activeSortKey={deviceSortKey} direction={deviceSortDirection} onSort={handleDeviceSort} className="px-4 py-2.5 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap" />
                    <SortableHeader label="Compliance" sortKey="compliance" activeSortKey={deviceSortKey} direction={deviceSortDirection} onSort={handleDeviceSort} className="px-4 py-2.5 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap" />
                    <SortableHeader label="Encryption" sortKey="encryption" activeSortKey={deviceSortKey} direction={deviceSortDirection} onSort={handleDeviceSort} className="px-4 py-2.5 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap" />
                    <SortableHeader label="Last Check-in" sortKey="checkin" activeSortKey={deviceSortKey} direction={deviceSortDirection} onSort={handleDeviceSort} className="px-4 py-2.5 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap" />
                    <SortableHeader label="Issues" sortKey="issues" activeSortKey={deviceSortKey} direction={deviceSortDirection} onSort={handleDeviceSort} className="px-4 py-2.5 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap" />
                  </tr>
                </thead>
                <tbody>
                  {paginatedDevices.map((d, i) => (
                    <tr key={d.id} className={`border-b border-slate-100/50 last:border-0 transition-colors hover:bg-blue-50/40 ${i % 2 ? 'bg-slate-50/30' : ''} ${(d.openIssues?.length ?? 0) > 0 ? 'border-l-2 border-l-amber-400' : ''}`}>
                      <td className="px-4 py-2.5"><div className="flex items-center gap-2"><Laptop2 className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" /><CopyText value={d.deviceName} label="Device name"><span className="font-semibold text-slate-700 truncate max-w-[130px]">{d.deviceName}</span></CopyText></div></td>
                      <td className="px-4 py-2.5 text-slate-500 max-w-[110px] truncate">{d.primaryUser || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{d.os}{d.osVersion ? <span className="text-slate-400 ml-1">{d.osVersion}</span> : ''}</td>
                      <td className="px-4 py-2.5"><span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[0.6rem] font-semibold text-blue-700"><Wifi className="h-2.5 w-2.5" />{d.joinType || 'Azure AD'}</span></td>
                      <td className="px-4 py-2.5"><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${compBadge(d.complianceState)}`}>{d.complianceState === 'Compliant' ? <ShieldCheck className="h-2.5 w-2.5" /> : <ShieldAlert className="h-2.5 w-2.5" />}{d.complianceState}</span></td>
                      <td className="px-4 py-2.5">{d.encryptionState === 'Encrypted' ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700"><Lock className="h-2.5 w-2.5" />On</span> : <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[0.6rem] font-bold text-red-600"><Lock className="h-2.5 w-2.5" />Off</span>}</td>
                      <td className="px-4 py-2.5"><span className={`flex items-center gap-1 ${(d.daysSinceCheckIn ?? 0) > 7 ? 'text-amber-600' : 'text-slate-500'}`}><Clock className="h-2.5 w-2.5 flex-shrink-0" />{(d.daysSinceCheckIn ?? 0) > 0 ? `${d.daysSinceCheckIn}d ago` : d.lastCheckIn || '—'}</span></td>
                      <td className="px-4 py-2.5">{(d.openIssues?.length ?? 0) > 0 ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[0.6rem] font-bold text-amber-700"><AlertCircle className="h-2.5 w-2.5" />{d.openIssues.length}</span> : <span className="text-slate-300 text-[0.6rem]">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={devicesPage} totalPages={devicesTotalPages} onPageChange={setDevicesPage}
                totalItems={filteredDevices.length} pageSize={ENTRA_PAGE_SIZE} itemLabel="device" />
            </div>
          )}
        </div>
      )}

      {/* ── Groups section ── */}
      {section === 'groups' && (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="h-[2px]" style={{ background: 'linear-gradient(90deg,#6366F1,#0078D4)' }} />
          <div className="px-5 py-3.5 border-b border-slate-100/50">
            <p className="text-sm font-bold text-slate-700">Groups</p>
            <p className="text-[0.65rem] text-slate-400">{groups.length} groups — requires <span className="font-mono">Group.Read.All</span></p>
          </div>
          {loading ? (
            <div className="p-8 flex items-center gap-2 text-slate-400 justify-center"><RefreshCw className="h-4 w-4 animate-spin" /><span className="text-sm">Loading groups…</span></div>
          ) : groups.length === 0 ? (
            <PermissionNotice permission="Group.Read.All" description="Grants read access to Azure AD groups, their types (Security, Microsoft 365), and membership details." />
          ) : (
            <>
              <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-slate-100/50">
                {[
                  { label: 'Total Groups', value: groups.length, color: '#6366F1' },
                  { label: 'Security',     value: groups.filter(g => g.type === 'Security').length, color: '#EF4444' },
                  { label: 'Microsoft 365', value: groups.filter(g => g.type === 'Microsoft 365').length, color: '#0078D4' },
                  { label: 'Distribution', value: groups.filter(g => g.type === 'Distribution').length, color: '#10B981' },
                ].map(s => (
                  <div key={s.label} className="glass rounded-xl px-3 py-2.5 overflow-hidden relative">
                    <div className="h-[2px] absolute top-0 left-0 right-0 rounded-t-xl" style={{ background: s.color }} />
                    <p className="text-lg font-black mt-1" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-[0.6rem] text-slate-400 font-semibold">{s.label}</p>
                  </div>
                ))}
              </div>
              <div className="divide-y divide-slate-100/50 max-h-96 overflow-y-auto">
                {groups.slice(0, 100).map(g => (
                  <div key={g.id} className="flex items-center gap-3 px-5 py-3 hover:bg-blue-50/30 transition-colors">
                    <div className="rounded-xl p-2 flex-shrink-0" style={{ background: g.type === 'Security' ? '#EF444418' : g.type === 'Microsoft 365' ? '#0078D418' : '#10B98118' }}>
                      <Building2 className="h-3.5 w-3.5" style={{ color: g.type === 'Security' ? '#EF4444' : g.type === 'Microsoft 365' ? '#0078D4' : '#10B981' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-700 truncate">{g.displayName}</p>
                      {g.description && <p className="text-[0.62rem] text-slate-400 truncate">{g.description}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {g.memberCount > 0 && <span className="text-[0.62rem] text-slate-400">{g.memberCount} members</span>}
                      <span className={`rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${g.type === 'Security' ? 'bg-red-50 border-red-200 text-red-700' : g.type === 'Microsoft 365' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>{g.type}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Permissions reference */}
      <div className="glass rounded-2xl px-5 py-4">
        <div className="flex items-start gap-3">
          <KeyRound className="h-4 w-4 text-slate-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-slate-600 mb-2.5">Required Azure App Permissions — Application type, admin consent needed</p>
            <div className="flex flex-wrap gap-2">
              {[
                { name: 'User.Read.All',                           section: 'Users & identity' },
                { name: 'AuditLog.Read.All',                       section: 'Sign-in logs' },
                { name: 'IdentityRiskyUser.Read.All',              section: 'Risk detection' },
                { name: 'DeviceManagementManagedDevices.Read.All', section: 'Device directory' },
                { name: 'Group.Read.All',                          section: 'Groups' },
              ].map(p => (
                <span key={p.name} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[0.62rem]">
                  <code className="font-mono font-semibold text-[#0078D4]">{p.name}</code>
                  <span className="text-slate-400">→ {p.section}</span>
                </span>
              ))}
            </div>
            <p className="text-[0.6rem] text-slate-400 mt-2">Azure portal → App registrations → your app → API permissions → Add permission → Microsoft Graph → Application permissions</p>
          </div>
        </div>
      </div>

    </div>
  )
}

// ── Entra ID Groups (export) Tab ─────────────────────────────────────────────

type OsFilter = 'all' | 'Windows' | 'macOS' | 'iOS' | 'Android' | 'Linux'

function EntraGroupsReportTab() {
  const { notify } = useToast()
  const [groupName, setGroupName] = useState('')
  const [osFilter,  setOsFilter]  = useState<OsFilter>('all')
  const [data,      setData]      = useState<EntraGroupReportResult | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [exporting, setExporting] = useState<'csv' | 'excel' | null>(null)
  const [search,    setSearch]    = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const [suggestions,      setSuggestions]      = useState<EntraGroupSuggestion[]>([])
  const [showSuggestions,  setShowSuggestions]  = useState(false)
  const [searchingGroups,  setSearchingGroups]  = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = groupName.trim()
    if (q.length < 2) return
    debounceRef.current = setTimeout(() => {
      setSearchingGroups(true)
      api.searchEntraGroups(q)
        .then(res => setSuggestions(res))
        .catch(() => setSuggestions([]))
        .finally(() => setSearchingGroups(false))
    }, 250)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [groupName])

  const runReport = useCallback((name: string, os: OsFilter) => {
    if (!name.trim()) return
    setLoading(true)
    setError(null)
    api.fetchEntraGroupReport({ name: name.trim(), os })
      .then(res => setData(res))
      .catch((e: unknown) => {
        setData(null)
        setError(e instanceof Error ? e.message : 'Failed to load group report')
      })
      .finally(() => setLoading(false))
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setShowSuggestions(false)
    runReport(groupName, osFilter)
  }

  function selectSuggestion(name: string) {
    setGroupName(name)
    setSuggestions([])
    setShowSuggestions(false)
    runReport(name, osFilter)
  }

  function handleOsFilterChange(next: OsFilter) {
    setOsFilter(next)
    if (data) runReport(groupName, next)
  }

  async function handleExport(format: 'csv' | 'excel') {
    if (!groupName.trim()) return
    setExporting(format)
    try {
      await api.exportEntraGroupReport({ name: groupName.trim(), os: osFilter, format })
    } catch (e: unknown) {
      notify('error', 'Export failed', e instanceof Error ? e.message : 'Could not export report')
    } finally {
      setExporting(null)
    }
  }

  const filteredRows = useMemo(() => {
    if (!data) return []
    if (!search.trim()) return data.rows
    const q = search.toLowerCase()
    return data.rows.filter(r => r.displayName.toLowerCase().includes(q) || r.userPrincipalName.toLowerCase().includes(q))
  }, [data, search])
  const sortedRows = sortKey ? sortRows(filteredRows, row => {
    switch (sortKey) {
      case 'type': return row.memberType
      case 'name': return row.displayName
      case 'upn': return row.userPrincipalName
      case 'os': return row.operatingSystem
      case 'status': return row.flagged ? 'Needs review' : 'OK'
      default: return ''
    }
  }, sortDirection) : filteredRows
  const handleSort = (key: string) => { setSortDirection(direction => toggleSortDirection(sortKey, direction, key)); setSortKey(key) }

  const showTypeColumn = (data?.memberTypes.length ?? 0) > 1

  return (
    <div className="space-y-4">
      {/* Search form */}
      <div className="glass rounded-2xl p-5">
        <p className="text-sm font-bold text-slate-700 mb-1">Entra ID Group Export</p>
        <p className="text-[0.68rem] text-slate-400 mb-3">
          Enter a group&apos;s display name — we&apos;ll resolve its Object ID, detect whether members are users, devices, or both, and export the correct identity columns for each.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input value={groupName}
              onChange={e => { setGroupName(e.target.value); setShowSuggestions(true) }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Start typing a group name, e.g. Sales…"
              autoComplete="off"
              className="h-9 w-full rounded-xl pl-9 pr-3 text-xs water-input" />
            {showSuggestions && groupName.trim().length >= 2 && (searchingGroups || suggestions.length > 0) && (
              <div className="absolute z-10 mt-1 w-full glass-strong rounded-xl border border-slate-200 shadow-lg max-h-56 overflow-y-auto">
                {searchingGroups && suggestions.length === 0 ? (
                  <div className="px-3 py-2 text-[0.68rem] text-slate-400 flex items-center gap-1.5">
                    <RefreshCw className="h-3 w-3 animate-spin" />Searching groups…
                  </div>
                ) : suggestions.length === 0 ? (
                  <div className="px-3 py-2 text-[0.68rem] text-slate-400">No matching groups</div>
                ) : suggestions.map(s => (
                  <button key={s.id} type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => selectSuggestion(s.displayName)}
                    className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-blue-50/60 transition-colors border-b border-slate-100/60 last:border-0 truncate">
                    {s.displayName}
                  </button>
                ))}
              </div>
            )}
          </div>
          <select value={osFilter} onChange={e => handleOsFilterChange(e.target.value as OsFilter)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400">
            <option value="all">All OS</option>
            <option value="Windows">Windows</option>
            <option value="macOS">macOS</option>
            <option value="iOS">iOS</option>
            <option value="Android">Android</option>
            <option value="Linux">Linux</option>
          </select>
          <button type="submit" disabled={loading || !groupName.trim()}
            className="flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-white water-glow disabled:opacity-50 flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#0078D4,#6366F1)' }}>
            {loading ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Resolving…</> : <>Load Group</>}
          </button>
        </form>
        <p className="text-[0.62rem] text-slate-400 mt-2">OS filter only narrows device members — user members always stay in the report.</p>
      </div>

      {/* Error */}
      {error && !loading && (
        <div className="glass rounded-2xl p-4 flex items-center gap-2 border border-red-200 bg-red-50/60">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {/* Results — hidden while the suggestions dropdown is open so a stale
          result from the previous search can't show through its glass blur */}
      {data && !loading && !showSuggestions && (
        <>
          <div className="glass rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-bold text-slate-700">{data.group.displayName}</p>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                <span className="text-[0.68rem] text-slate-400">{data.totalMembers} member{data.totalMembers !== 1 ? 's' : ''}</span>
                {data.memberTypes.map(t => (
                  <span key={t} className={`rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${t === 'user' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-violet-50 text-violet-700 border-violet-200'}`}>
                    {t === 'user' ? 'Users' : 'Devices'}
                  </span>
                ))}
                {data.flaggedCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[0.6rem] font-bold text-amber-700">
                    <AlertCircle className="h-2.5 w-2.5" />{data.flaggedCount} flagged — no owner UPN
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button type="button" onClick={() => handleExport('csv')} disabled={exporting !== null}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-white water-glow disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#10B981,#0EA5E9)' }}>
                {exporting === 'csv' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}CSV
              </button>
              <button type="button" onClick={() => handleExport('excel')} disabled={exporting !== null}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-white water-glow disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#F46C00,#FB471F)' }}>
                {exporting === 'excel' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}Excel
              </button>
            </div>
          </div>

          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter results…"
              className="h-9 w-full rounded-xl pl-9 pr-3 text-xs water-input" />
            {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2"><X className="h-3.5 w-3.5 text-slate-400" /></button>}
          </div>

          <div className="glass rounded-2xl overflow-hidden">
            <div className="h-[2px]" style={{ background: 'linear-gradient(90deg,#0078D4,#6366F1)' }} />
            {filteredRows.length === 0 ? (
              <div className="p-10 text-center">
                <Building2 className="mx-auto h-8 w-8 text-slate-300 mb-3" />
                <p className="text-sm text-slate-400">No members match your filters</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50/80 border-b border-slate-100/50">
                    <tr>
                      {showTypeColumn && <SortableHeader label="Member Type" sortKey="type" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-4 py-2.5 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap" />}
                      <SortableHeader label="Display Name" sortKey="name" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-4 py-2.5 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap" />
                      <SortableHeader label="UPN" sortKey="upn" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-4 py-2.5 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap" />
                      <SortableHeader label="OS" sortKey="os" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-4 py-2.5 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap" />
                      <SortableHeader label="Status" sortKey="status" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-4 py-2.5 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap" />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((r, i) => (
                      <tr key={`${r.memberType}-${r.displayName}-${i}`} className={`border-b border-slate-100/50 last:border-0 ${r.flagged ? 'bg-amber-50/40' : i % 2 ? 'bg-slate-50/30' : ''}`}>
                        {showTypeColumn && (
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${r.memberType === 'user' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-violet-50 text-violet-700 border-violet-200'}`}>
                              {r.memberType === 'user' ? <Users className="h-2.5 w-2.5" /> : <Monitor className="h-2.5 w-2.5" />}
                              {r.memberType === 'user' ? 'User' : 'Device'}
                            </span>
                          </td>
                        )}
                        <td className="px-4 py-2.5 font-semibold text-slate-700">{r.displayName}</td>
                        <td className="px-4 py-2.5 text-slate-500">{r.userPrincipalName || '—'}</td>
                        <td className="px-4 py-2.5 text-slate-500">{r.operatingSystem || '—'}</td>
                        <td className="px-4 py-2.5">
                          {r.flagged
                            ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[0.6rem] font-bold text-amber-700"><AlertCircle className="h-2.5 w-2.5" />Needs review</span>
                            : <span className="text-emerald-600 text-[0.65rem] font-semibold">OK</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Idle state — hidden while the suggestions dropdown is open, same reason as Results above */}
      {!data && !loading && !error && !showSuggestions && (
        <div className="glass rounded-2xl p-10 text-center">
          <FileSpreadsheet className="mx-auto h-8 w-8 text-slate-300 mb-3" />
          <p className="text-sm text-slate-400">Enter a group name above to generate its member export</p>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

interface Props {
  viewerRole: UserToolRole
  userEmail?: string
  onBack: () => void
  /** Rendered inside ManagedDevicesPage — hides this page's own back/title header. */
  embedded?: boolean
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'devices',    label: 'Devices',    icon: <Monitor    className="h-3.5 w-3.5" /> },
  { id: 'compliance', label: 'Compliance', icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  { id: 'security',   label: 'Security',   icon: <Shield     className="h-3.5 w-3.5" /> },
  { id: 'reports',    label: 'Reports',    icon: <BarChart2  className="h-3.5 w-3.5" /> },
  { id: 'entra',      label: 'Entra ID',   icon: <KeyRound   className="h-3.5 w-3.5 text-[#0078D4]" /> },
  { id: 'entra_groups', label: 'Entra ID Groups', icon: <FileSpreadsheet className="h-3.5 w-3.5 text-[#6366F1]" /> },
  { id: 'scripts_config', label: 'Scripts & Configs', icon: <FileCode2 className="h-3.5 w-3.5 text-[#0078D4]" /> },
]

export function IntuneDevicesPage({ viewerRole, userEmail, onBack, embedded }: Props) {
  const permissions = usePermissions()
  const [tab, setTab]         = useState<Tab>('devices')
  const [devices, setDevices] = useState<ApiDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [panelDevice, setPanelDevice] = useState<ApiDevice | null>(null)
  const isRateLimited = fetchError ? /\b429\b/.test(fetchError) : false

  const fetchDevices = useCallback(() => {
    setLoading(true)
    setFetchError(null)
    api.fetchAllDevicesRaw({ source: 'intune', limit: 10000 })
      .then(r => {
        setDevices(r.devices)
        setFetchError(null)
      })
      .catch((e: unknown) => {
        setDevices([])
        setFetchError(e instanceof Error ? e.message : 'Failed to load Intune devices')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchDevices() }, [fetchDevices])

  const [kpiFilter,    setKpiFilter]    = useState<{ compliance?: string; platform?: string }>({})
  const [kpiFilterKey, setKpiFilterKey] = useState(0)

  const drillToDevices = useCallback((filter: { compliance?: string; platform?: string }) => {
    setKpiFilter(filter)
    setKpiFilterKey(k => k + 1)
    setTab('devices')
  }, [])

  const stats = useMemo(() => ({
    total:        devices.length,
    compliant:    devices.filter(d => d.complianceState === 'Compliant').length,
    nonCompliant: devices.filter(d => d.complianceState === 'Non-Compliant').length,
    encrypted:    devices.filter(d => d.encryptionStatus?.toLowerCase().includes('on')).length,
    withEdr:      devices.filter(d => d.antivirusStatus && d.antivirusStatus !== '—').length,
    windows:      devices.filter(d => d.platform === 'Windows').length,
    android:      devices.filter(d => d.platform === 'Android').length,
    ios:          devices.filter(d => d.platform === 'iOS').length,
  }), [devices])

  const apiStatusPill = (
    <span className={`ag-live-label ${loading ? 'ag-live-checking' : fetchError ? 'ag-live-error' : ''}`}>
      <i />{loading ? 'Checking…' : fetchError ? 'Microsoft Intune API — Unavailable' : 'Microsoft Intune API'}
    </span>
  )

  return (
    <div className="flex flex-col gap-5 w-full page-enter">

      {/* Header */}
      {embedded ? (
        <div className="flex items-center justify-end gap-2">
          {apiStatusPill}
          <button type="button" onClick={fetchDevices}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 glass px-3 py-1.5 text-xs font-semibold text-slate-500 water-glow">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-[#F46C00]' : ''}`} />Refresh
          </button>
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="h-[3px]" style={{ background: 'linear-gradient(90deg,#0078D4,#0EA5E9,#6366F1)' }} />
          <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button type="button" onClick={onBack}
                className="flex items-center gap-1.5 rounded-full border border-slate-200 glass px-3 py-1.5 text-sm font-medium text-slate-600 water-glow">
                <ArrowLeft className="h-4 w-4" />Back
              </button>
              <div className="grid h-10 w-10 place-items-center rounded-2xl" style={{ background: 'linear-gradient(135deg,#0078D4,#0EA5E9)' }}>
                <Server className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-black text-slate-800">Intune Devices</h1>
                <p className="text-[0.68rem] text-slate-400">Microsoft Intune · Windows & Cross-platform MDM</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {apiStatusPill}
              <button type="button" onClick={fetchDevices}
                className="flex items-center gap-1.5 rounded-full border border-slate-200 glass px-3 py-1.5 text-xs font-semibold text-slate-500 water-glow">
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-[#F46C00]' : ''}`} />Refresh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error banner */}
      {fetchError && !loading && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-red-700 mb-1">Intune connection failed</p>
              <p className="text-xs text-red-600 break-words font-mono">{fetchError}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {isRateLimited ? (
                  <span className="text-red-600">Microsoft Graph is throttling requests. Wait briefly before retrying; repeated refreshes may extend the cooldown.</span>
                ) : (
                  <>
                    <span className="font-semibold text-red-700">Check:</span>
                    <span className="text-red-600">· INTUNE_CLIENT_ID / INTUNE_CLIENT_SECRET are correct</span>
                    <span className="text-red-600">· Azure app has <code className="bg-red-100 px-1 rounded">DeviceManagementManagedDevices.Read.All</code> (Application) permission</span>
                    <span className="text-red-600">· Admin consent has been granted in Azure portal</span>
                  </>
                )}
              </div>
            </div>
            <button type="button" onClick={fetchDevices}
              className="flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition flex-shrink-0">
              <RefreshCw className="h-3.5 w-3.5" />Retry
            </button>
          </div>
        </div>
      )}

      {/* KPI Stats — all cards clickable, drill into Devices tab with filter */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        <KpiCard label="Total Devices"   value={loading ? '—' : stats.total.toLocaleString()}
          color="#0078D4" disabled={loading}
          onClick={() => drillToDevices({})} />
        <KpiCard label="Compliant"       value={loading ? '—' : stats.compliant.toLocaleString()}
          color="#10B981" sub="policy passed" disabled={loading}
          onClick={() => drillToDevices({ compliance: 'Compliant' })} />
        <KpiCard label="Non-Compliant"   value={loading ? '—' : stats.nonCompliant.toLocaleString()}
          color="#EF4444" sub="action needed" disabled={loading}
          onClick={() => drillToDevices({ compliance: 'Non-Compliant' })} />
        <KpiCard label="BitLocker / Enc" value={loading ? '—' : (stats.total > 0 ? `${Math.round(stats.encrypted/stats.total*100)}%` : '—')}
          color="#0EA5E9" sub={loading ? undefined : `${stats.encrypted.toLocaleString()} encrypted`} disabled={loading}
          onClick={() => drillToDevices({})} />
        <KpiCard label="Defender Active" value={loading ? '—' : (stats.total > 0 ? `${Math.round(stats.withEdr/stats.total*100)}%` : '—')}
          color="#6366F1" sub={loading ? undefined : `${stats.withEdr.toLocaleString()} devices`} disabled={loading}
          onClick={() => drillToDevices({})} />
      </div>

      {/* Platform breakdown row — visible once loaded */}
      {!loading && (stats.android > 0 || stats.ios > 0) && (
        <div className="grid grid-cols-3 gap-3">
          <KpiCard label="Windows"  value={stats.windows.toLocaleString()}
            color="#0078D4" sub="desktop / laptop" onClick={() => drillToDevices({ platform: 'Windows' })} />
          {stats.android > 0 && (
            <KpiCard label="Android" value={stats.android.toLocaleString()}
              color="#3DDC84" sub="mobile devices" onClick={() => drillToDevices({ platform: 'Android' })} />
          )}
          {stats.ios > 0 && (
            <KpiCard label="iOS / iPad" value={stats.ios.toLocaleString()}
              color="#007AFF" sub="mobile devices" onClick={() => drillToDevices({ platform: 'iOS' })} />
          )}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 glass rounded-2xl p-1 w-fit">
        {TABS.filter(t => canSeeTab(t.id, viewerRole, permissions)).map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              tab === t.id ? 'is-selected' : 'text-slate-500 hover:text-slate-700'
            }`}
            style={tab === t.id ? { boxShadow: '0 0 0 1px rgba(14,165,233,0.2), 0 4px 12px rgba(14,165,233,0.1)' } : {}}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'devices' && (
        <DevicesTab
          key={kpiFilterKey}
          devices={devices}
          loading={loading}
          onSelect={setPanelDevice}
          initialCompliance={kpiFilter.compliance ?? 'all'}
          initialPlatform={kpiFilter.platform ?? 'all'}
        />
      )}
      {tab === 'compliance' && <ComplianceTab devices={devices} />}
      {tab === 'security'   && <IntuneSecurityTab devices={devices} loading={loading} />}
      {tab === 'reports'    && <ReportsTab    devices={devices} />}
      {tab === 'entra'      && <EntraIDTab />}
      {tab === 'entra_groups' && <EntraGroupsReportTab />}
      {tab === 'scripts_config' && canSeeTab('scripts_config', viewerRole, permissions) && (
        <IntuneScriptsConfigTab viewerRole={viewerRole} userEmail={userEmail} />
      )}

      {/* Device panel */}
      {panelDevice && (
        <>
          <div className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm cursor-pointer" onClick={() => setPanelDevice(null)} />
          <div className="fixed right-0 top-0 bottom-0 z-40 w-full max-w-[600px] shadow-2xl border-l border-white/20 overflow-hidden flex flex-col">
            <DeviceDetailPanel device={panelDevice} onBack={() => setPanelDevice(null)} backLabel={embedded ? 'Managed Devices' : 'Intune Devices'} />
          </div>
        </>
      )}
    </div>
  )
}
