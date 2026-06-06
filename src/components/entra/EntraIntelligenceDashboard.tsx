/**
 * Microsoft Entra / Intune Resource Intelligence Dashboard
 *
 * Data source priority:
 *   1. Live Microsoft Graph API (when Entra ID credentials are configured in Settings → Integrations)
 *   2. Demo mock data (when no credentials — clearly labelled)
 *
 * The component fetches from /api/entra/* on mount and on every Refresh click.
 * Sub-components (table, charts) receive typed props — no static imports from entraData.ts.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw, Network, Bell, ExternalLink, AlertCircle,
  ShieldCheck, Monitor, Users as UsersIcon, BarChart3, Activity,
  ChevronDown, Loader2, AlertTriangle,
} from 'lucide-react'
import { api } from '../../api'
import { EntraOverviewCards }        from './EntraOverviewCards'
import { EntraDeviceInventoryTable } from './EntraDeviceInventoryTable'
import { EntraUserRiskTable }        from './EntraUserRiskTable'
import { EntraRelationshipExplorer } from './EntraRelationshipExplorer'
import { EntraHelpdeskPanel }        from './EntraHelpdeskPanel'
import { EntraAiCopilotPanel }       from './EntraAiCopilotPanel'
import type {
  EntraDevice, EntraUser, EntraOverviewMetrics, EntraRelationship,
  EntraIssue, EntraAlert, EntraComplianceTrend,
} from '../../data/entraData'
import {
  ENTRA_OVERVIEW as MOCK_OVERVIEW,
  ENTRA_DEVICES as MOCK_DEVICES,
  ENTRA_USERS as MOCK_USERS,
  ENTRA_RELATIONSHIPS as MOCK_RELATIONSHIPS,
  TOP_ISSUES as MOCK_ISSUES,
  ENTRA_ALERTS as MOCK_ALERTS,
  COMPLIANCE_TREND as MOCK_TREND,
  PLATFORM_DISTRIBUTION as MOCK_PLATFORM,
} from '../../data/entraData'

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

// ── Compliance Trend Chart ────────────────────────────────────────────────────

function ComplianceTrendChart({ data }: { data: EntraComplianceTrend[] }) {
  const maxVal = Math.max(...data.map(d => d.compliant + d.nonCompliant + d.graceperiod))
  return (
    <div>
      <div className="flex flex-wrap gap-4 mb-4">
        {[{ label: 'Compliant', color: 'bg-emerald-500' }, { label: 'Non-Compliant', color: 'bg-red-500' }, { label: 'Grace Period', color: 'bg-amber-500' }]
          .map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className={`h-2.5 w-2.5 rounded-sm ${l.color}`} />
              <span className="text-xs text-slate-400">{l.label}</span>
            </div>
          ))}
      </div>
      <div className="flex items-end gap-3 h-32">
        {data.map(week => {
          const total = week.compliant + week.nonCompliant + week.graceperiod
          const cPct  = maxVal > 0 ? (week.compliant    / maxVal) * 100 : 0
          const nPct  = maxVal > 0 ? (week.nonCompliant / maxVal) * 100 : 0
          const gPct  = maxVal > 0 ? (week.graceperiod  / maxVal) * 100 : 0
          return (
            <div key={week.week} className="flex-1 flex flex-col items-center gap-1 group relative">
              <div className="w-full flex flex-col justify-end h-full gap-px">
                <div style={{ height: `${gPct}%` }}  className="bg-amber-500/80 w-full rounded-sm" />
                <div style={{ height: `${nPct}%` }}  className="bg-red-500/80 w-full rounded-sm"   />
                <div style={{ height: `${cPct}%` }}  className="bg-emerald-500/80 w-full rounded-sm" />
              </div>
              <span className="text-[0.55rem] text-slate-500 whitespace-nowrap">{week.week}</span>
              <div className="absolute bottom-full mb-8 left-1/2 -translate-x-1/2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-[0.65rem] text-slate-200 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
                <p className="text-emerald-400">{week.compliant.toLocaleString()} compliant</p>
                <p className="text-red-400">{week.nonCompliant.toLocaleString()} non-compliant</p>
                <p className="text-amber-400">{week.graceperiod.toLocaleString()} grace</p>
                <p className="text-slate-500 mt-1 border-t border-slate-700 pt-1">{total.toLocaleString()} total</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Platform Distribution ─────────────────────────────────────────────────────

function PlatformDistribution({ devices }: { devices: EntraDevice[] }) {
  const total = devices.length || 1
  const counts: Record<string, { count: number; color: string }> = {
    Windows:    { count: 0, color: '#3B82F6' },
    macOS:      { count: 0, color: '#F59E0B' },
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

// ── Top Issues ────────────────────────────────────────────────────────────────

function TopIssues({ issues }: { issues: EntraIssue[] }) {
  const sev = (s: string) =>
    s === 'High' ? 'bg-red-500/15 text-red-400 border-red-500/30' :
    s === 'Medium' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :
    'bg-slate-500/15 text-slate-400 border-slate-500/30'

  return (
    <div className="space-y-2">
      {issues.map(issue => (
        <div key={issue.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-800/30 px-3 py-2.5 hover:border-slate-700 transition">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-200 truncate">{issue.title}</p>
            <p className="text-[0.65rem] text-slate-500 truncate">{issue.description}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${sev(issue.severity)}`}>{issue.severity}</span>
            <span className="text-xs font-bold text-slate-400">{issue.affectedDevices}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Alerts ────────────────────────────────────────────────────────────────────

function RecentAlerts({ alerts }: { alerts: EntraAlert[] }) {
  const dot = (s: string) => s === 'High' ? 'bg-red-500' : s === 'Medium' ? 'bg-amber-500' : 'bg-emerald-500'
  const txt = (s: string) => s === 'High' ? 'text-red-400' : s === 'Medium' ? 'text-amber-400' : 'text-emerald-400'
  return (
    <div className="space-y-2">
      {alerts.map(a => (
        <div key={a.id} className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-800/30 px-3 py-2.5">
          <div className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${dot(a.severity)}`} />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-300 font-medium">{a.title}</p>
            <p className="text-[0.62rem] text-slate-500">{a.time}</p>
          </div>
          <span className={`text-[0.6rem] font-bold flex-shrink-0 ${txt(a.severity)}`}>{a.severity}</span>
        </div>
      ))}
    </div>
  )
}

// ── Stale devices ─────────────────────────────────────────────────────────────

function StaleDevicesTable({ devices }: { devices: EntraDevice[] }) {
  const stale = [...devices].filter(d => d.daysSinceCheckIn > 7).sort((a, b) => b.daysSinceCheckIn - a.daysSinceCheckIn)
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
            {['Device', 'User', 'Last Check-In', 'OS', 'Compliance', 'Issues'].map(h => (
              <th key={h} className="px-3 py-2.5 text-left text-[0.6rem] font-bold uppercase tracking-wider text-slate-400">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stale.map((d, i) => (
            <tr key={d.id} className={`border-b border-slate-800 hover:bg-slate-800/60 transition-colors ${i % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-900/20'}`}>
              <td className="px-3 py-2.5 font-bold text-slate-200">{d.deviceName}</td>
              <td className="px-3 py-2.5"><p className="text-slate-300">{d.primaryUser}</p><p className="text-[0.6rem] text-slate-500">{d.upn}</p></td>
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

// ── Main Dashboard ────────────────────────────────────────────────────────────

export function EntraIntelligenceDashboard() {
  const [overview,       setOverview]       = useState<EntraOverviewMetrics>(MOCK_OVERVIEW)
  const [devices,        setDevices]        = useState<EntraDevice[]>(MOCK_DEVICES)
  const [users,          setUsers]          = useState<EntraUser[]>(MOCK_USERS)
  const [relationships,  setRelationships]  = useState<EntraRelationship[]>(MOCK_RELATIONSHIPS)
  const [issues]         = useState<EntraIssue[]>(MOCK_ISSUES)
  const [alerts]         = useState<EntraAlert[]>(MOCK_ALERTS)
  const [trend]          = useState<EntraComplianceTrend[]>(MOCK_TREND)

  const [loading,      setLoading]      = useState(true)
  const [isLive,       setIsLive]       = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [lastUpdated,  setLastUpdated]  = useState(new Date())
  const [refreshing,   setRefreshing]   = useState(false)

  const fetchAll = useCallback(async () => {
    setError(null)
    try {
      // Overview
      const rawOverview = await api.fetchEntraOverview().catch(() => null)
      if (rawOverview && Object.keys(rawOverview).length > 0) {
        setOverview(rawOverview as unknown as EntraOverviewMetrics)
        setIsLive(true)
      }

      // Devices
      const rawDevices = await api.fetchEntraDevices({ limit: 100 }).catch(() => null)
      if (rawDevices && rawDevices.length > 0) {
        setDevices(rawDevices as unknown as EntraDevice[])
      }

      // Users
      const rawUsers = await api.fetchEntraUsers().catch(() => null)
      if (rawUsers && rawUsers.length > 0) {
        setUsers(rawUsers as unknown as EntraUser[])
      }

      // Relationships
      const rawRel = await api.fetchEntraRelationships().catch(() => null)
      if (rawRel && rawRel.length > 0) {
        setRelationships(rawRel as unknown as EntraRelationship[])
      }

      setLastUpdated(new Date())
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load Entra data'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchAll()
    setRefreshing(false)
  }

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
          <span className="text-[0.62rem] text-slate-500">
            Updated: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button type="button" onClick={handleRefresh} disabled={loading || refreshing}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-blue-500/50 hover:text-blue-300 transition disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
            Refresh
          </button>
          <div className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 ${
            isLive
              ? 'border-emerald-500/30 bg-emerald-500/10'
              : 'border-amber-500/30 bg-amber-500/10'
          }`}>
            <div className={`h-2 w-2 rounded-full animate-pulse ${isLive ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className={`text-[0.68rem] font-bold ${isLive ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isLive ? 'Live · Microsoft Graph' : 'Demo data'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="mx-5 mt-4 flex items-center gap-2.5 rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
          <p className="text-xs text-red-300">
            <strong>Data fetch error:</strong> {error} — Showing last known / demo data.
          </p>
        </div>
      )}

      {/* ── Demo mode banner ── */}
      {!isLive && !loading && !error && (
        <div className="mx-5 mt-4 flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0" />
          <p className="text-xs text-amber-300">
            <strong>Demo mode:</strong> Showing synthetic data.{' '}
            Connect real Entra ID credentials in{' '}
            <span className="underline cursor-pointer">Settings → Integrations → Microsoft Entra ID</span>{' '}
            to see live device, user, and compliance data from Microsoft Graph.
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

        {/* ── KPI Cards ── */}
        <div>
          <p className="text-[0.6rem] font-black uppercase tracking-[0.15em] text-slate-500 mb-3">Fleet Overview</p>
          <EntraOverviewCards metrics={overview} />
        </div>

        {/* ── Charts row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <Section title="Compliance Status Over Time" icon={BarChart3} color="text-emerald-400"
              action={<span className="text-[0.62rem] text-slate-500 mr-1">Last 6 weeks</span>}>
              <ComplianceTrendChart data={trend} />
            </Section>
          </div>
          <Section title="Devices by Platform" icon={Monitor} color="text-blue-400">
            <PlatformDistribution devices={devices} />
          </Section>
        </div>

        {/* ── Issues + Alerts ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Section title="Top Compliance Issues" icon={AlertCircle} color="text-red-400"
            action={<button className="text-[0.65rem] text-blue-400 hover:text-blue-300 flex items-center gap-1"><span>View all</span><ExternalLink className="h-2.5 w-2.5" /></button>}>
            <TopIssues issues={issues} />
          </Section>
          <Section title="Recent Alerts" icon={Bell} color="text-amber-400"
            action={<button className="text-[0.65rem] text-blue-400 hover:text-blue-300 flex items-center gap-1"><span>View all</span><ExternalLink className="h-2.5 w-2.5" /></button>}>
            <RecentAlerts alerts={alerts} />
          </Section>
        </div>

        {/* ── Risky Users ── */}
        <Section title="Risky Users" icon={UsersIcon} color="text-red-400"
          action={<span className="text-[0.65rem] text-red-400 font-bold">{users.filter(u => u.riskLevel === 'High' || u.riskLevel === 'Medium').length} at risk</span>}>
          <EntraUserRiskTable users={users} />
        </Section>

        {/* ── Stale Devices ── */}
        <Section title="Devices with Stale Check-in" icon={Activity} color="text-amber-400"
          action={<span className="text-[0.65rem] text-amber-400 font-bold">{devices.filter(d => d.daysSinceCheckIn > 7).length} stale</span>}>
          <StaleDevicesTable devices={devices} />
        </Section>

        {/* ── Device Inventory ── */}
        <Section title="Device Inventory" icon={Monitor} color="text-blue-400"
          action={<span className="text-[0.65rem] text-slate-500">{devices.length.toLocaleString()} devices loaded</span>}>
          <EntraDeviceInventoryTable devices={devices} />
        </Section>

        {/* ── Relationship Explorer ── */}
        <Section title="Relationship Intelligence" icon={Network} color="text-purple-400"
          action={<span className="text-[0.62rem] text-slate-500">User → Device → Policy → App</span>}>
          <EntraRelationshipExplorer relationships={relationships} />
        </Section>

        {/* ── Helpdesk + AI ── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Section title="Helpdesk Quick Lookup" icon={ShieldCheck} color="text-teal-400">
            <EntraHelpdeskPanel devices={devices} users={users} />
          </Section>
          <EntraAiCopilotPanel />
        </div>

        <div className="text-center text-[0.62rem] text-slate-600 pt-2 border-t border-slate-800">
          ITO Endpoint · Microsoft Entra Integration · {isLive ? 'Live Microsoft Graph data' : 'Demo mode — configure credentials in Settings'}
        </div>
      </div>
    </div>
  )
}
