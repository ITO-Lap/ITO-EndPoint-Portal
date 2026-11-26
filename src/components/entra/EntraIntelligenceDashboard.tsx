/**
 * Microsoft Entra / Intune Resource Intelligence Dashboard
 *
 * Live Microsoft Graph API data only (when Entra ID credentials are
 * configured in Settings → Integrations). No mock/demo data is ever
 * rendered — when Entra isn't configured, or a fetch fails, or Graph
 * returns zero devices, a distinct empty state is shown instead.
 *
 * The component fetches from /api/entra/* on mount and on every Refresh click.
 * Sub-components (table, charts) receive typed props — no static imports from entraData.ts.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw, Network,
  Monitor, Activity,
  ChevronDown, Loader2, AlertTriangle, PlugZap,
} from 'lucide-react'
import { SortableHeader } from '../ui/SortableHeader'
import { sortRows, toggleSortDirection, type SortDirection } from '../../lib/tableSorting'
import { api } from '../../api'
import type { EntraDevice } from '../../data/entraData'
import { CopyText } from '../ui/CopyText'

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, icon: Icon, color = 'text-blue-400', children, action }: {
  title: string; icon: React.ElementType; color?: string
  children: React.ReactNode; action?: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 overflow-hidden">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 border-b border-slate-800 hover:bg-slate-800/30 transition">
        <div className="flex items-center gap-2.5">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-slate-800">
            <Icon className={`h-3.5 w-3.5 ${color}`} />
          </div>
          <span className="text-sm font-bold text-slate-200">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {action}
          <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  )
}

// ── Platform Distribution ─────────────────────────────────────────────────────

function PlatformDistribution({ devices }: { devices: EntraDevice[] }) {
  const total = devices.length || 1
  const counts: Record<string, { count: number; color: string }> = {
    Windows:    { count: 0, color: '#3B82F6' },
    macOS:      { count: 0, color: '#818CF8' },
    'iOS/iPadOS':{ count: 0, color: '#8B5CF6' },
    Android:    { count: 0, color: '#10B981' },
    Linux:      { count: 0, color: '#64748B' },
  }
  devices.forEach(d => {
    const k = d.os === 'iOS' ? 'iOS/iPadOS' : d.os
    if (counts[k]) counts[k].count++
  })

  return (
    <div className="space-y-3">
      {Object.entries(counts).map(([platform, { count, color }]) => (
        <div key={platform}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-slate-300">{platform}</span>
            <span className="text-xs text-slate-400">{count.toLocaleString()} ({((count / total) * 100).toFixed(1)}%)</span>
          </div>
          <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${(count / total) * 100}%`, background: color }} />
          </div>
        </div>
      ))}
      <div className="mt-2 pt-2 border-t border-slate-800 flex justify-between text-xs text-slate-500">
        <span>Total</span><span className="font-bold text-slate-300">{devices.length.toLocaleString()}</span>
      </div>
    </div>
  )
}

// ── Stale devices ─────────────────────────────────────────────────────────────

function StaleDevicesTable({ devices }: { devices: EntraDevice[] }) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const staleDevices = devices.filter(d => d.daysSinceCheckIn > 7)
  const stale = sortKey ? sortRows(staleDevices, device => {
    switch (sortKey) {
      case 'device': return device.deviceName
      case 'user': return device.primaryUser
      case 'checkin': return device.daysSinceCheckIn
      case 'os': return device.os
      case 'compliance': return device.complianceState
      case 'issues': return device.openIssues.length
      default: return ''
    }
  }, sortDirection) : [...staleDevices].sort((a, b) => b.daysSinceCheckIn - a.daysSinceCheckIn)
  const handleSort = (key: string) => { setSortDirection(direction => toggleSortDirection(sortKey, direction, key)); setSortKey(key) }
  if (!stale.length) return <p className="text-xs text-emerald-400 py-4 text-center">✓ No stale devices — all devices have checked in within 7 days.</p>

  const compBg = (c: string) =>
    c === 'Compliant' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
    c === 'Non-Compliant' ? 'bg-red-500/15 text-red-400 border-red-500/30' :
    'bg-amber-500/15 text-amber-400 border-amber-500/30'

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-700/60">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-800/80 border-b border-slate-700">
            <SortableHeader label="Device" sortKey="device" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-3 py-2.5 text-left text-[0.6rem] font-bold uppercase tracking-wider text-slate-400" />
            <SortableHeader label="User" sortKey="user" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-3 py-2.5 text-left text-[0.6rem] font-bold uppercase tracking-wider text-slate-400" />
            <SortableHeader label="Last Check-In" sortKey="checkin" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-3 py-2.5 text-left text-[0.6rem] font-bold uppercase tracking-wider text-slate-400" />
            <SortableHeader label="OS" sortKey="os" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-3 py-2.5 text-left text-[0.6rem] font-bold uppercase tracking-wider text-slate-400" />
            <SortableHeader label="Compliance" sortKey="compliance" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-3 py-2.5 text-left text-[0.6rem] font-bold uppercase tracking-wider text-slate-400" />
            <SortableHeader label="Issues" sortKey="issues" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-3 py-2.5 text-left text-[0.6rem] font-bold uppercase tracking-wider text-slate-400" />
          </tr>
        </thead>
        <tbody>
          {stale.map((d, i) => (
            <tr key={d.id} className={`border-b border-slate-800 hover:bg-slate-800/60 transition-colors ${i % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-900/20'}`}>
              <td className="px-3 py-2.5 font-bold text-slate-200"><CopyText value={d.deviceName} label="Device name">{d.deviceName}</CopyText></td>
              <td className="px-3 py-2.5"><CopyText value={d.primaryUser} label="User"><p className="text-slate-300">{d.primaryUser}</p></CopyText><CopyText value={d.upn} label="User email"><p className="text-[0.6rem] text-slate-500">{d.upn}</p></CopyText></td>
              <td className="px-3 py-2.5">
                <span className={`font-bold ${d.daysSinceCheckIn > 14 ? 'text-red-400' : d.daysSinceCheckIn > 7 ? 'text-amber-400' : 'text-slate-300'}`}>
                  {d.daysSinceCheckIn}d ago
                </span>
              </td>
              <td className="px-3 py-2.5 text-slate-400">{d.os}</td>
              <td className="px-3 py-2.5">
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${compBg(d.complianceState)}`}>{d.complianceState}</span>
              </td>
              <td className="px-3 py-2.5">
                {d.openIssues.length > 0
                  ? <span className="text-red-400">{d.openIssues.length} issue{d.openIssues.length > 1 ? 's' : ''}</span>
                  : <span className="text-emerald-400">None</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface EntraLoadResult {
  configured?: boolean
  devices?: EntraDevice[]
  error?: string
  updated?: Date
}

async function loadEntraData(): Promise<EntraLoadResult> {
  const r: EntraLoadResult = {}
  try {
    const overview = await api.fetchEntraOverview()
    r.configured = overview.configured

    if (overview.configured) {
      // Devices — still needed for the Platform Distribution and Stale Devices widgets
      const rawDevices = await api.fetchEntraDevices({ limit: 100 })
      r.devices = rawDevices as unknown as EntraDevice[]
    } else {
      r.devices = []
    }

    r.updated = new Date()
  } catch (e) {
    r.error = e instanceof Error ? e.message : 'Failed to load Entra data'
    r.devices = []
  }
  return r
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export function EntraIntelligenceDashboard() {
  const [devices,        setDevices]        = useState<EntraDevice[]>([])
  // null = not yet known (still loading / errored before first successful check)
  const [configured,     setConfigured]     = useState<boolean | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [lastUpdated,  setLastUpdated]  = useState<Date | null>(null)
  const [refreshing,   setRefreshing]   = useState(false)

  const applyResult = useCallback((r: EntraLoadResult) => {
    if (r.configured !== undefined) setConfigured(r.configured)
    if (r.devices) setDevices(r.devices)
    if (r.error !== undefined) setError(r.error)
    if (r.updated) setLastUpdated(r.updated)
    setLoading(false)
  }, [])

  const fetchAll = useCallback(async () => {
    setError(null)
    applyResult(await loadEntraData())
  }, [applyResult])

  // error is already null on first mount, so the initial load skips the reset.
  useEffect(() => {
    let cancelled = false
    loadEntraData().then(r => { if (!cancelled) applyResult(r) })
    return () => { cancelled = true }
  }, [applyResult])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchAll()
    setRefreshing(false)
  }

  const isLive = configured === true && !error

  return (
    <div className="min-h-full w-full bg-[#0d1117] text-slate-100 rounded-2xl overflow-hidden">

      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-[#0d1117]/95 backdrop-blur-sm border-b border-slate-800 px-5 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 flex-shrink-0">
            <Network className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-black text-white leading-tight">Microsoft Entra · Intune</h1>
            <p className="text-[0.62rem] text-slate-400">Resource Intelligence Dashboard · Real-time overview</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-blue-400" />}
          {lastUpdated && (
            <span className="text-[0.62rem] text-slate-500">
              Updated: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button type="button" onClick={handleRefresh} disabled={loading || refreshing}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-blue-500/50 hover:text-blue-300 transition disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
            Refresh
          </button>
          {!loading && (
            <div className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 ${
              isLive
                ? 'border-emerald-500/30 bg-emerald-500/10'
                : 'border-slate-600/40 bg-slate-700/20'
            }`}>
              <div className={`h-2 w-2 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
              <span className={`text-[0.68rem] font-bold ${isLive ? 'text-emerald-400' : 'text-slate-400'}`}>
                {error ? 'Error' : isLive ? 'Live · Microsoft Graph' : 'Not configured'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && !loading && (
        <div className="mx-5 mt-4 flex items-center gap-2.5 rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
          <p className="text-xs text-red-300">
            <strong>Data fetch error:</strong> {error}
          </p>
          <button type="button" onClick={handleRefresh}
            className="ml-auto flex-shrink-0 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-[0.65rem] font-semibold text-red-300 hover:bg-red-500/20 transition">
            Retry
          </button>
        </div>
      )}

      {/* ── Not-configured banner ── */}
      {!loading && !error && configured === false && (
        <div className="mx-5 mt-4 flex items-center gap-2.5 rounded-xl border border-slate-600/40 bg-slate-800/40 px-4 py-3">
          <PlugZap className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <p className="text-xs text-slate-300">
            <strong>Not configured:</strong> Microsoft Entra ID credentials aren't set up.{' '}
            Connect them in{' '}
            <span className="underline cursor-pointer">Settings → Integrations → Microsoft Entra ID</span>{' '}
            to see live platform distribution and stale check-in data from Microsoft Graph.
          </p>
        </div>
      )}

      {/* ── Integration status strip ── */}
      <div className="px-5 py-2 bg-slate-900/60 border-b border-slate-800/60 flex flex-wrap gap-4 text-[0.65rem]">
        {[
          { name: 'Microsoft Graph', ok: isLive },
          { name: 'Intune',          ok: isLive },
          { name: 'Azure AD',        ok: isLive },
          { name: 'Security Center', ok: isLive },
        ].map(s => (
          <div key={s.name} className="flex items-center gap-1.5">
            <div className={`h-1.5 w-1.5 rounded-full ${s.ok ? 'bg-emerald-500' : 'bg-slate-600'}`} />
            <span className="text-slate-400">{s.name}</span>
            <span className={`font-semibold ${s.ok ? 'text-emerald-500' : 'text-slate-500'}`}>
              {s.ok ? 'Connected' : 'Not configured'}
            </span>
          </div>
        ))}
      </div>

      <div className="p-5 space-y-5">

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : !isLive ? (
          /* ── Not configured / error — no widgets, no fabricated content ── */
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-700/60 bg-slate-900/60 py-16 text-center">
            <div className="rounded-2xl bg-slate-800 p-4 border border-slate-700"><PlugZap className="h-6 w-6 text-slate-500" /></div>
            <p className="text-sm font-bold text-slate-300">{error ? 'Unable to load Entra data' : 'No live data available'}</p>
            <p className="text-xs text-slate-500 max-w-xs">
              {error
                ? 'Check the connection to Microsoft Graph and try again.'
                : 'Connect Microsoft Entra ID credentials in Settings → Integrations to see device and compliance data here.'}
            </p>
          </div>
        ) : devices.length === 0 ? (
          /* ── Configured, connected, but Graph returned no devices ── */
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-700/60 bg-slate-900/60 py-16 text-center">
            <div className="rounded-2xl bg-slate-800 p-4 border border-slate-700"><Monitor className="h-6 w-6 text-slate-500" /></div>
            <p className="text-sm font-bold text-slate-300">No device data</p>
            <p className="text-xs text-slate-500 max-w-xs">
              Connected to Microsoft Graph, but no managed devices were returned. Verify the
              DeviceManagementManagedDevices.Read.All permission is granted in Azure.
            </p>
          </div>
        ) : (
          <>
            {/* ── Platform Distribution ── */}
            <Section title="Devices by Platform" icon={Monitor} color="text-blue-400">
              <PlatformDistribution devices={devices} />
            </Section>

            {/* ── Stale Devices ── */}
            <Section title="Devices with Stale Check-in" icon={Activity} color="text-amber-400"
              action={<span className="text-[0.65rem] text-amber-400 font-bold">{devices.filter(d => d.daysSinceCheckIn > 7).length} stale</span>}>
              <StaleDevicesTable devices={devices} />
            </Section>
          </>
        )}

        <div className="text-center text-[0.62rem] text-slate-600 pt-2 border-t border-slate-800">
          EndPoint+ · Microsoft Entra Integration · {isLive ? 'Live Microsoft Graph data' : 'Not configured'}
        </div>
      </div>
    </div>
  )
}
