import { useState, useEffect, useMemo } from 'react'
import {
  Apple, RefreshCw, AlertTriangle, CheckCircle,
  ChevronDown, ChevronUp, Search, X, Download, Filter,
} from 'lucide-react'
import { api } from '../api'
import type { ApiDevice } from '../api'

// ─── Types ────────────────────────────────────────────────────────────────────

type PatchTier = 'current' | 'minor' | 'update-req' | 'sequoia' | 'sonoma' | 'ventura' | 'unknown'
type StaleTierType = 'abandoned' | 'critical' | 'stale'
type ReportView = 'overview' | 'devices' | 'outdated' | 'stale' | 'regional'
type SortCol = 'deviceName' | 'osVersion' | 'daysOffline' | 'region' | 'user'

interface ClassifiedDevice extends ApiDevice {
  patchTier:   PatchTier
  daysOffline: number
  staleTier:   StaleTierType | null
  region:      string
}

interface DeviceTableProps {
  rows:        ClassifiedDevice[]
  total:       number
  page:        number
  totalPages:  number
  sortCol:     SortCol
  sortDir:     'asc' | 'desc'
  onSort:      (col: SortCol) => void
  onPage:      (p: number) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TARGET_OS = '26.5'
const TODAY     = new Date().toISOString().slice(0, 10)
const PAGE_SIZE = 25

const VIEW_TABS: { id: ReportView; label: string }[] = [
  { id: 'overview',  label: 'Full Report'      },
  { id: 'devices',   label: 'Device List'      },
  { id: 'outdated',  label: 'Outdated & EOL'   },
  { id: 'stale',     label: 'Stale Register'   },
  { id: 'regional',  label: 'Regional Summary' },
]

const TIER_OPTIONS: { tier: PatchTier; label: string }[] = [
  { tier: 'current',    label: 'Current (26.5)'    },
  { tier: 'minor',      label: 'Minor patch (26.4)' },
  { tier: 'update-req', label: 'Update req (26.x)'  },
  { tier: 'sequoia',    label: 'Sequoia (15.x)'     },
  { tier: 'sonoma',     label: 'Sonoma (14.x)'      },
  { tier: 'ventura',    label: 'Ventura (13.x)'     },
]

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function classifyOs(v: string): PatchTier {
  const s = (v ?? '').trim()
  if (/^26\.5/.test(s)) return 'current'
  if (/^26\.4/.test(s)) return 'minor'
  if (/^26\./.test(s))  return 'update-req'
  if (/^15\./.test(s))  return 'sequoia'
  if (/^14\./.test(s))  return 'sonoma'
  if (/^13\./.test(s))  return 'ventura'
  return 'unknown'
}

function daysSince(dateStr: string): number {
  if (!dateStr || ['Just added', 'Never', '—', ''].includes(dateStr)) return 0
  const rel = dateStr.match(/^(\d+)\s+day/)
  if (rel) return parseInt(rel[1], 10)
  if (/hour|minute|second/i.test(dateStr)) return 0
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return 0
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000))
}

function getStaleTier(days: number): StaleTierType | null {
  if (days >= 90) return 'abandoned'
  if (days >= 30) return 'critical'
  if (days >= 14) return 'stale'
  return null
}

function fmtDate(s: string): string {
  if (!s || ['Just added', 'Never', '—'].includes(s)) return s
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10)
}

function pct(n: number, total: number) {
  return total ? `${((n / total) * 100).toFixed(1)}%` : '0%'
}

function sortDevices(devs: ClassifiedDevice[], col: SortCol, dir: 'asc' | 'desc') {
  return [...devs].sort((a, b) => {
    let c = 0
    if      (col === 'daysOffline') c = a.daysOffline - b.daysOffline
    else if (col === 'osVersion')   c = a.osVersion.localeCompare(b.osVersion)
    else if (col === 'region')      c = a.region.localeCompare(b.region)
    else if (col === 'user')        c = (a.user ?? '').localeCompare(b.user ?? '')
    else                            c = a.deviceName.localeCompare(b.deviceName)
    return dir === 'asc' ? c : -c
  })
}

function csvCategory(v: string) {
  if (/^26\./.test(v)) return 'Latest (Tahoe)'
  if (/^13\./.test(v)) return 'End of Life'
  return 'Outdated'
}
function csvAction(v: string) {
  if (/^26\./.test(v)) return 'No action needed'
  if (/^13\./.test(v)) return 'Urgent upgrade required'
  return 'Upgrade recommended'
}
function exportCsv(devices: ClassifiedDevice[], today: string) {
  const header = ['Device', 'User', 'macOS Version', 'Category', 'Action Required']
  const rows   = devices.map(d => [d.deviceName, d.user || 'Unassigned', d.osVersion, csvCategory(d.osVersion), csvAction(d.osVersion)])
  const esc    = (s: string) => `"${String(s).replace(/"/g, '""')}"`
  const csv    = [header.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\r\n')
  const url    = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a      = Object.assign(document.createElement('a'), { href: url, download: `macos-versions-${today}.csv` })
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Pills ────────────────────────────────────────────────────────────────────

const PATCH_META: Record<PatchTier, { label: string; cls: string }> = {
  'current':    { label: 'Current',            cls: 'bg-green-50  text-green-700  border border-green-200'  },
  'minor':      { label: 'Minor patch needed', cls: 'bg-blue-50   text-blue-700   border border-blue-200'   },
  'update-req': { label: 'Update required',    cls: 'bg-indigo-50 text-indigo-700 border border-indigo-200' },
  'sequoia':    { label: 'Sequoia (15.x)',      cls: 'bg-amber-50  text-amber-700  border border-amber-200'  },
  'sonoma':     { label: 'Sonoma (14.x)',       cls: 'bg-orange-50 text-orange-800 border border-orange-200' },
  'ventura':    { label: 'Ventura (13.x)',      cls: 'bg-red-50    text-red-700    border border-red-200'    },
  'unknown':    { label: 'Unknown',            cls: 'bg-slate-100 text-slate-600  border border-slate-200'  },
}

const STALE_META: Record<StaleTierType, { label: string; cls: string }> = {
  'abandoned': { label: 'Abandoned', cls: 'bg-[#1a1a2e] text-slate-200' },
  'critical':  { label: 'Critical',  cls: 'bg-red-50  text-red-700   border border-red-200'   },
  'stale':     { label: 'Stale',     cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
}

function PatchPill({ tier }: { tier: PatchTier }) {
  const m = PATCH_META[tier]
  return <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${m.cls}`}>{m.label}</span>
}

function StalePill({ tier }: { tier: StaleTierType }) {
  const m = STALE_META[tier]
  return <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${m.cls}`}>{m.label}</span>
}

// ─── Shared device table ──────────────────────────────────────────────────────

function DeviceTable({ rows, total, page, totalPages, sortCol, sortDir, onSort, onPage }: DeviceTableProps) {
  const PAGE_SIZE_LOCAL = PAGE_SIZE

  function Th({ col, children }: { col: SortCol; children: React.ReactNode }) {
    return (
      <th
        className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.4px] text-slate-400 cursor-pointer hover:text-slate-600 select-none whitespace-nowrap"
        onClick={() => onSort(col)}
      >
        {children}{sortCol === col && <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </th>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center gap-2 py-10 justify-center text-slate-400 text-[13px] border border-slate-200 rounded-lg">
        <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
        No devices match the current filters.
      </div>
    )
  }

  return (
    <>
      <div className="rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-[12px] min-w-[960px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.4px] text-slate-400 w-8">#</th>
              <Th col="deviceName">Device</Th>
              <Th col="user">User</Th>
              <Th col="osVersion">macOS Version</Th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.4px] text-slate-400">Patch Status</th>
              <Th col="region">Region</Th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.4px] text-slate-400 whitespace-nowrap">Last Check-in</th>
              <Th col="daysOffline">Days Offline</Th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.4px] text-slate-400">Stale Tier</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d, i) => (
              <tr key={d.id ?? d.serialNumber ?? i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                <td className="px-3 py-2 text-slate-400 tabular-nums">{(page - 1) * PAGE_SIZE_LOCAL + i + 1}</td>
                <td className="px-3 py-2 font-medium text-slate-700 max-w-[200px] truncate" title={d.deviceName}>{d.deviceName}</td>
                <td className="px-3 py-2 text-slate-500 max-w-[160px] truncate" title={d.user ?? ''}>{d.user || <span className="text-slate-300">Unassigned</span>}</td>
                <td className="px-3 py-2 font-mono text-slate-600">{d.osVersion}</td>
                <td className="px-3 py-2"><PatchPill tier={d.patchTier} /></td>
                <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{d.region}</td>
                <td className="px-3 py-2 text-slate-500 tabular-nums whitespace-nowrap">{fmtDate(d.lastCheckIn)}</td>
                <td className="px-3 py-2 font-semibold text-slate-700 tabular-nums">{d.daysOffline > 0 ? d.daysOffline : <span className="text-slate-300">—</span>}</td>
                <td className="px-3 py-2">{d.staleTier ? <StalePill tier={d.staleTier} /> : <span className="text-slate-300">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-[12px] text-slate-500">
          <span>{total} device{total !== 1 ? 's' : ''} · page {page} of {totalPages}</span>
          <div className="flex gap-1">
            <button type="button" disabled={page === 1} onClick={() => onPage(page - 1)}
              className="px-2.5 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">‹ Prev</button>
            <button type="button" disabled={page === totalPages} onClick={() => onPage(page + 1)}
              className="px-2.5 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">Next ›</button>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────

function SH({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mt-6 mb-3">
      <span className="w-[3px] h-[14px] rounded-sm bg-[#1a1a2e] flex-shrink-0" />
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.5px] text-slate-500">{children}</h2>
    </div>
  )
}

const P_BORDER = { 1: 'border-l-red-600', 2: 'border-l-amber-500', 3: 'border-l-blue-500', 4: 'border-l-green-600' } as const
const P_LABEL  = { 1: 'text-red-600',     2: 'text-amber-600',     3: 'text-blue-600',     4: 'text-green-700'    } as const

// ─── Main page ────────────────────────────────────────────────────────────────

export function IruPatchReportPage() {
  const [devices,      setDevices]      = useState<ApiDevice[]>([])
  const [loading,      setLoading]      = useState(true)
  const [isMock,       setIsMock]       = useState(false)

  const [view,         setView]         = useState<ReportView>('overview')
  const [search,       setSearch]       = useState('')
  const [tierFilter,   setTierFilter]   = useState<Set<PatchTier>>(new Set())
  const [regionFilter, setRegionFilter] = useState('')
  const [staleFilter,  setStaleFilter]  = useState<StaleTierType | ''>('')
  const [showTiers,    setShowTiers]    = useState(false)
  const [sortCol,      setSortCol]      = useState<SortCol>('deviceName')
  const [sortDir,      setSortDir]      = useState<'asc' | 'desc'>('asc')
  const [page,         setPage]         = useState(1)

  useEffect(() => {
    api.fetchAllDevicesRaw({ platform: 'macOS', limit: 2000 })
      .then(r => { setDevices(r.devices); setIsMock(r.mock) })
      .catch(() => setDevices([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { setPage(1) }, [search, tierFilter, regionFilter, staleFilter, view])

  // ── Classification ─────────────────────────────────────────────────────────
  const classified = useMemo<ClassifiedDevice[]>(() =>
    devices.map(d => {
      const days = daysSince(d.lastCheckIn)
      return { ...d, patchTier: classifyOs(d.osVersion), daysOffline: days, staleTier: getStaleTier(days), region: d.department?.trim() || 'Untagged' }
    }), [devices])

  // ── Fleet-wide aggregates (always full fleet) ──────────────────────────────
  const total          = classified.length
  const currentCount   = classified.filter(d => d.patchTier === 'current').length
  const minorCount     = classified.filter(d => d.patchTier === 'minor').length
  const updateReqCount = classified.filter(d => d.patchTier === 'update-req').length
  const sequoiaCount   = classified.filter(d => d.patchTier === 'sequoia').length
  const sonomaCount    = classified.filter(d => d.patchTier === 'sonoma').length
  const venturaCount   = classified.filter(d => d.patchTier === 'ventura').length
  const legacyCount    = sequoiaCount + sonomaCount + venturaCount
  const tahoeCount     = classified.filter(d => ['current', 'minor', 'update-req'].includes(d.patchTier)).length
  const untaggedCount  = classified.filter(d => d.region === 'Untagged').length
  const staleAll       = classified.filter(d => d.staleTier !== null)
  const staleCount     = staleAll.length
  const abandonedCount = staleAll.filter(d => d.staleTier === 'abandoned').length

  const allRegions = useMemo(() => Array.from(new Set(classified.map(d => d.region))).sort(), [classified])

  // ── Filtered + sorted devices ──────────────────────────────────────────────
  const filteredDevices = useMemo(() => {
    let devs = [...classified]
    if (view === 'outdated') devs = devs.filter(d => ['sequoia', 'sonoma', 'ventura'].includes(d.patchTier))
    if (view === 'stale')    devs = devs.filter(d => d.staleTier !== null)
    if (tierFilter.size > 0) devs = devs.filter(d => tierFilter.has(d.patchTier))
    if (regionFilter)         devs = devs.filter(d => d.region === regionFilter)
    if (staleFilter)          devs = devs.filter(d => d.staleTier === staleFilter)
    if (search) {
      const q = search.toLowerCase()
      devs = devs.filter(d =>
        d.deviceName.toLowerCase().includes(q) ||
        (d.user ?? '').toLowerCase().includes(q) ||
        d.osVersion.includes(q) ||
        d.region.toLowerCase().includes(q)
      )
    }
    return sortDevices(devs, sortCol, sortDir)
  }, [classified, view, tierFilter, regionFilter, staleFilter, search, sortCol, sortDir])

  const totalPages   = Math.ceil(filteredDevices.length / PAGE_SIZE)
  const pagedDevices = filteredDevices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // ── Regional breakdown ─────────────────────────────────────────────────────
  const regions = useMemo(() => {
    const map = new Map<string, ClassifiedDevice[]>()
    for (const d of classified) {
      const arr = map.get(d.region) ?? []; arr.push(d); map.set(d.region, arr)
    }
    return Array.from(map.entries()).map(([region, devs]) => ({
      region,
      total:     devs.length,
      current:   devs.filter(d => d.patchTier === 'current').length,
      minor:     devs.filter(d => d.patchTier === 'minor').length,
      updateReq: devs.filter(d => d.patchTier === 'update-req').length,
      sequoia:   devs.filter(d => d.patchTier === 'sequoia').length,
      sonoma:    devs.filter(d => d.patchTier === 'sonoma').length,
      ventura:   devs.filter(d => d.patchTier === 'ventura').length,
      stale:     devs.filter(d => d.staleTier !== null).length,
      compPct:   devs.length ? (devs.filter(d => d.patchTier === 'current').length / devs.length) : 0,
    })).sort((a, b) => b.total - a.total)
  }, [classified])

  // ── Recommendations ────────────────────────────────────────────────────────
  const recs = useMemo(() => [
    { p: 1 as const, label: 'Priority 1 — Immediate (this week)',   title: `Investigate ${abandonedCount} abandoned device${abandonedCount !== 1 ? 's' : ''}`,   body: `Cross-reference against HR offboarding records. Issue remote-wipe commands for unaccounted devices via Kandji.${venturaCount > 0 ? ` ${venturaCount} Ventura machine${venturaCount > 1 ? 's' : ''} have had no Apple security patches since Nov 2024 — treat as P0.` : ''}` },
    { p: 1 as const, label: 'Priority 1 — Immediate (this week)',   title: `Remediate ${sonomaCount + venturaCount} EOL / severely outdated devices`,            body: `Direct owner outreach for Sonoma (${sonomaCount}) and Ventura (${venturaCount}) devices. Set 48-hour compliance deadline. Enforce OS upgrade via Kandji PROD blueprint.` },
    { p: 2 as const, label: 'Priority 2 — Short term (2 weeks)',    title: `Push macOS ${TARGET_OS} to ${sequoiaCount} Sequoia devices`,                         body: `Schedule region-aware blueprint push. Use Kandji's 5-day deferral window to minimize disruption. Confirm update completion via daily MDM report pull.` },
    { p: 2 as const, label: 'Priority 2 — Short term (2 weeks)',    title: `Drive ${minorCount} "minor patch" devices to ${TARGET_OS}`,                          body: `${pct(minorCount, total)} of the fleet is one minor update behind. Deploy fleet-wide Kandji nudge campaign. Target: 80% compliance within 10 business days.` },
    { p: 3 as const, label: 'Priority 3 — Ongoing (30 days)',       title: `Tag all ${untaggedCount} untagged devices`,                                           body: `Untagged devices block regional reporting and targeted rollouts. Audit device assignments in Kandji. Confirm owner for serial-only device names.` },
    { p: 3 as const, label: 'Priority 3 — Ongoing (30 days)',       title: `Evaluate ${updateReqCount} early-channel 26.0/26.2 devices`,                         body: `Confirm whether these are on dev/beta channels intentionally. If not, migrate to PROD blueprint and push ${TARGET_OS} immediately.` },
    { p: 4 as const, label: 'Priority 4 — Process improvement',     title: 'Establish 14-day stale check-in SLA',                                                body: 'Automate: Slack DM at day 7 → manager CC at day 14 → Security ticket at day 30. Weekly Kandji report to IRU team prevents the abandoned backlog from rebuilding.' },
    { p: 4 as const, label: 'Priority 4 — Process improvement',     title: 'Hardware refresh planning for pre-M1 Intel Macs',                                    body: "Identify MBP 2017–2019 Intel models — they won't support future macOS releases. Initiate a refresh Jira epic and align with Finance for next fiscal cycle budget." },
  ], [abandonedCount, venturaCount, sonomaCount, sequoiaCount, minorCount, updateReqCount, untaggedCount, total])

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir(col === 'daysOffline' ? 'desc' : 'asc') }
  }

  function toggleTier(tier: PatchTier) {
    setTierFilter(prev => { const n = new Set(prev); n.has(tier) ? n.delete(tier) : n.add(tier); return n })
  }

  function drillTo(v: ReportView, tier?: PatchTier, region?: string, stale?: StaleTierType) {
    setTierFilter(tier ? new Set([tier]) : new Set())
    if (region !== undefined) setRegionFilter(region)
    if (stale  !== undefined) setStaleFilter(stale)
    setView(v)
  }

  const hasFilters = search || tierFilter.size > 0 || regionFilter || staleFilter
  const showFilterBar = view !== 'overview' && view !== 'regional'

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 gap-3 text-slate-400">
        <RefreshCw className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading macOS fleet data…</span>
      </div>
    )
  }

  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 bg-white">

      {/* ── Header ── */}
      <div className="bg-[#1a1a2e] px-8 py-6 flex flex-wrap gap-4 justify-between items-start">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Apple className="h-5 w-5 text-slate-400 flex-shrink-0" />
            <h1 className="text-[18px] font-semibold text-[#e8e8f0] tracking-tight">macOS Patch &amp; Stale Device Report</h1>
          </div>
          <p className="text-[12px] text-[#9090a8] mb-3">Infrastructure &amp; Remote Users (IRU) &nbsp;·&nbsp; Kandji MDM &nbsp;·&nbsp; PROD Blueprint</p>
          <div className="flex flex-wrap gap-2">
            {legacyCount > 0 && <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-red-900/40 text-red-300 border border-red-800/50">⚠ {legacyCount} legacy/EOL OS</span>}
            {staleCount > 0  && <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-amber-900/30 text-amber-300 border border-amber-800/50">{staleCount} stale (14+ days)</span>}
            {total - currentCount > 0 && <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-blue-900/30 text-blue-300 border border-blue-800/50">{total - currentCount} not on {TARGET_OS}</span>}
            <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-slate-700/60 text-slate-300 border border-slate-600/50">{total} total fleet</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[15px] font-semibold text-[#e8e8f0]">{TODAY}</div>
          <div className="text-[11px] text-[#9090a8]">Report date</div>
          <div className="text-[11px] text-[#9090a8] mt-0.5">Prepared by IRU Admin</div>
          <button
            type="button"
            onClick={() => exportCsv(view === 'overview' ? classified : filteredDevices, TODAY)}
            className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-[#9090a8] hover:text-[#e8e8f0] transition ml-auto"
          >
            <Download className="h-3.5 w-3.5" />
            Download CSV{view !== 'overview' && filteredDevices.length !== total ? ` (${filteredDevices.length})` : ''}
          </button>
        </div>
      </div>

      {/* ── View tabs ── */}
      <div className="border-b border-slate-200 bg-slate-50 px-6 flex gap-0 overflow-x-auto">
        {VIEW_TABS.map(tab => (
          <button key={tab.id} type="button" onClick={() => setView(tab.id)}
            className={`px-4 py-3 text-[12px] font-medium whitespace-nowrap border-b-2 transition-colors ${
              view === tab.id ? 'border-[#1a1a2e] text-[#1a1a2e]' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Mock warning ── */}
      {isMock && (
        <div className="bg-amber-50 border-b border-amber-200 px-8 py-2.5 flex items-center gap-2 text-[12px] text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          Showing mock data — connect Kandji with real credentials to see live patch compliance metrics.
        </div>
      )}

      {/* ── Filter toolbar ── */}
      {showFilterBar && (
        <div className="border-b border-slate-200 px-6 py-3 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search device, user, OS…"
                className="pl-8 pr-7 py-1.5 text-[12px] border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 w-52" />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
                </button>
              )}
            </div>

            {/* Region */}
            <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)}
              className="text-[12px] border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20">
              <option value="">All regions</option>
              {allRegions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>

            {/* Stale status */}
            <select value={staleFilter} onChange={e => setStaleFilter(e.target.value as StaleTierType | '')}
              className="text-[12px] border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20">
              <option value="">All stale status</option>
              <option value="stale">Stale (14+ days)</option>
              <option value="critical">Critical (30+ days)</option>
              <option value="abandoned">Abandoned (90+ days)</option>
            </select>

            {/* OS tier toggle */}
            <button type="button" onClick={() => setShowTiers(v => !v)}
              className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border transition ${
                tierFilter.size > 0 || showTiers ? 'bg-[#1a1a2e] text-white border-[#1a1a2e]' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}>
              <Filter className="h-3.5 w-3.5" />
              OS Tier{tierFilter.size > 0 ? ` (${tierFilter.size})` : ''}
              {showTiers ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            {hasFilters && (
              <button type="button" onClick={() => { setSearch(''); setTierFilter(new Set()); setRegionFilter(''); setStaleFilter('') }}
                className="text-[12px] text-slate-400 hover:text-slate-600 underline">
                Clear all
              </button>
            )}

            <span className="ml-auto text-[12px] text-slate-400 font-medium tabular-nums">
              {filteredDevices.length} device{filteredDevices.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* OS tier chips */}
          {showTiers && (
            <div className="flex flex-wrap gap-2 pt-1">
              {TIER_OPTIONS.map(({ tier, label }) => (
                <button key={tier} type="button" onClick={() => toggleTier(tier)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all ${
                    tierFilter.has(tier) ? PATCH_META[tier].cls + ' ring-2 ring-offset-1 ring-slate-300' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Content ── */}
      <div className="px-8 py-6 space-y-1">

        {/* ════ FULL REPORT ════ */}
        {view === 'overview' && (
          <>
            <SH>Executive summary</SH>
            <p className="text-[13px] text-slate-600 leading-relaxed">
              As of <strong className="text-slate-800">{TODAY}</strong>, the Zinnia macOS fleet comprises{' '}
              <strong className="text-slate-800">{total} devices</strong> under the PROD Kandji blueprint.
              Tahoe (26.x) adoption is at {pct(tahoeCount, total)} ({tahoeCount} devices), but only{' '}
              <strong className="text-slate-800">{currentCount} ({pct(currentCount, total)})</strong> are fully current on macOS {TARGET_OS}.
              {minorCount > 0 && ` ${minorCount} devices on 26.4/26.4.1 need a minor patch push.`}
              {(sonomaCount + venturaCount) > 0 && <> <strong className="text-slate-800">{sonomaCount + venturaCount} devices remain on Sonoma/Ventura</strong> (2–3 major releases behind, outside Apple security coverage).</>}
              {staleCount > 0 && <> <strong className="text-slate-800">{staleCount} devices have not checked in for 14+ days</strong>, with {abandonedCount} qualifying as abandoned (90+ days).</>}
            </p>

            {/* Metric cards — clickable drill-throughs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 !mt-5">
              {([
                { label: 'Total devices',      value: total,          sub: 'macOS fleet',                          cls: 'text-slate-800', action: () => drillTo('devices') },
                { label: 'On target OS',       value: currentCount,   sub: `${TARGET_OS} — ${pct(currentCount, total)}`, cls: 'text-green-700', action: () => drillTo('devices', 'current') },
                { label: 'Minor patch needed', value: minorCount,     sub: '26.4 / 26.4.1',                        cls: 'text-blue-700',  action: () => drillTo('devices', 'minor') },
                { label: 'Legacy OS',          value: legacyCount,    sub: 'Sequoia / Sonoma / Ventura',           cls: 'text-amber-700', action: () => drillTo('outdated') },
                { label: 'Stale (14+ days)',   value: staleCount,     sub: pct(staleCount, total) + ' of fleet',   cls: 'text-red-600',   action: () => drillTo('stale') },
                { label: 'Abandoned (90+d)',   value: abandonedCount, sub: 'Last seen 2024–2025',                  cls: 'text-red-700',   action: () => drillTo('stale', undefined, undefined, 'abandoned') },
              ] as const).map(m => (
                <button key={m.label} type="button" onClick={m.action}
                  className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-left hover:border-slate-300 hover:shadow-sm transition group">
                  <div className="text-[10px] uppercase tracking-[0.5px] text-slate-400 font-medium mb-1.5">{m.label}</div>
                  <div className={`text-[28px] font-semibold leading-none ${m.cls}`}>{m.value}</div>
                  <div className="text-[11px] text-slate-400 mt-1">{m.sub}</div>
                  <div className="text-[10px] text-slate-300 group-hover:text-[#1a1a2e] mt-1 transition">View details →</div>
                </button>
              ))}
            </div>

            {/* OS compliance table */}
            <SH>OS patch compliance — all {total} devices</SH>
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Patch tier', 'OS version(s)', 'Device count', '% of fleet', 'Risk level', 'Action required'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.4px] text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {([
                    { tier: 'current'    as PatchTier, count: currentCount,   versions: TARGET_OS,      risk: 'None',     rCls: 'text-green-700',             action: 'No action needed' },
                    { tier: 'minor'      as PatchTier, count: minorCount,     versions: '26.4, 26.4.1', risk: 'Low',      rCls: 'text-blue-700',              action: 'Deploy 26.5 via Kandji nudge (5-day window)' },
                    { tier: 'update-req' as PatchTier, count: updateReqCount, versions: '26.0, 26.2',   risk: 'Medium',   rCls: 'text-amber-600',             action: 'Force-push 26.5; likely on dev/beta channel' },
                    { tier: 'sequoia'    as PatchTier, count: sequoiaCount,   versions: '15.x',         risk: 'Medium',   rCls: 'text-amber-600',             action: 'Enforce OS upgrade to 26.x via blueprint' },
                    { tier: 'sonoma'     as PatchTier, count: sonomaCount,    versions: '14.x',         risk: 'High',     rCls: 'text-red-600',               action: 'Direct outreach + force upgrade within 48h' },
                    { tier: 'ventura'    as PatchTier, count: venturaCount,   versions: '13.x',         risk: 'Critical', rCls: 'text-red-700 font-semibold', action: 'Immediate escalation — no Apple security patches' },
                  ]).map(row => (
                    <tr key={row.tier} className="border-b border-slate-100 last:border-0 hover:bg-blue-50/30 cursor-pointer"
                      onClick={() => drillTo('devices', row.tier)}>
                      <td className="px-3 py-2.5"><PatchPill tier={row.tier} /></td>
                      <td className="px-3 py-2.5 font-mono text-[12px] text-slate-600">{row.versions}</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-800">{row.count}</td>
                      <td className="px-3 py-2.5 text-slate-500">{pct(row.count, total)}</td>
                      <td className={`px-3 py-2.5 ${row.rCls}`}>{row.risk}</td>
                      <td className="px-3 py-2.5 text-slate-500 text-[12px]">{row.action}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td className="px-3 py-2.5 font-semibold text-slate-700">Total</td>
                    <td />
                    <td className="px-3 py-2.5 font-semibold text-slate-700">{total}</td>
                    <td className="px-3 py-2.5 font-semibold text-slate-700">100%</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Regional breakdown */}
            <SH>Regional patch compliance</SH>
            <div className="rounded-lg border border-slate-200 overflow-x-auto">
              <table className="w-full text-[13px] min-w-[720px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Region', 'Total', 'Current 26.5', 'Minor patch', 'Upd req', 'Sequoia 15.x', 'Sonoma 14.x', 'Ventura 13.x', 'Stale 14+d'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.4px] text-slate-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {regions.map(r => (
                    <tr key={r.region} className="border-b border-slate-100 last:border-0 hover:bg-blue-50/30 cursor-pointer"
                      onClick={() => drillTo('devices', undefined, r.region)}>
                      <td className="px-3 py-2.5 font-medium text-slate-700">{r.region}</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-800">{r.total}</td>
                      <td className="px-3 py-2.5 text-green-700 font-medium">{r.current  || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-blue-700">{r.minor    || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-indigo-700">{r.updateReq || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-amber-700">{r.sequoia  || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-orange-700">{r.sonoma   || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-red-700 font-medium">{r.ventura  || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-red-600">{r.stale    || <span className="text-slate-300">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200 font-semibold">
                    <td className="px-3 py-2.5 text-slate-700">Total</td>
                    <td className="px-3 py-2.5 text-slate-700">{total}</td>
                    <td className="px-3 py-2.5 text-green-700">{currentCount}</td>
                    <td className="px-3 py-2.5 text-blue-700">{minorCount}</td>
                    <td className="px-3 py-2.5 text-indigo-700">{updateReqCount}</td>
                    <td className="px-3 py-2.5 text-amber-700">{sequoiaCount}</td>
                    <td className="px-3 py-2.5 text-orange-700">{sonomaCount}</td>
                    <td className="px-3 py-2.5 text-red-700">{venturaCount}</td>
                    <td className="px-3 py-2.5 text-red-600">{staleCount}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Click any row to view that region's devices.</p>

            {/* Stale preview */}
            <SH>Stale device register — {staleCount} device{staleCount !== 1 ? 's' : ''} (14+ days without MDM check-in)</SH>
            {staleCount === 0 ? (
              <div className="flex items-center gap-2 py-8 justify-center text-slate-400 text-[13px] border border-slate-200 rounded-lg">
                <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                No stale devices — all devices checked in within the last 14 days.
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 overflow-x-auto">
                <table className="w-full text-[12px] min-w-[860px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {['#', 'Device', 'User', 'OS', 'Patch status', 'Region', 'Last check-in', 'Days offline', 'Tier'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.4px] text-slate-400 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {staleAll.slice(0, 10).map((d, i) => (
                      <tr key={d.id ?? d.serialNumber ?? i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                        <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                        <td className="px-3 py-2 font-medium text-slate-700 max-w-[180px] truncate" title={d.deviceName}>{d.deviceName}</td>
                        <td className="px-3 py-2 text-slate-500 max-w-[140px] truncate">{d.user || '—'}</td>
                        <td className="px-3 py-2 font-mono text-slate-600">{d.osVersion}</td>
                        <td className="px-3 py-2"><PatchPill tier={d.patchTier} /></td>
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{d.region}</td>
                        <td className="px-3 py-2 text-slate-500 tabular-nums whitespace-nowrap">{fmtDate(d.lastCheckIn)}</td>
                        <td className="px-3 py-2 font-semibold text-slate-700 tabular-nums">{d.daysOffline > 0 ? d.daysOffline : '—'}</td>
                        <td className="px-3 py-2">{d.staleTier && <StalePill tier={d.staleTier} />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {staleCount > 10 && (
                  <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50">
                    <button type="button" onClick={() => setView('stale')}
                      className="text-[12px] text-[#1a1a2e] hover:underline">
                      View all {staleCount} stale devices in Stale Register →
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Recommendations */}
            <SH>IRU admin recommendations &amp; action plan</SH>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-2">
              {recs.map((r, i) => (
                <div key={i} className={`border border-slate-200 border-l-[3px] ${P_BORDER[r.p]} rounded-lg p-4`}>
                  <div className={`text-[10px] font-bold uppercase tracking-[0.5px] mb-1 ${P_LABEL[r.p]}`}>{r.label}</div>
                  <div className="text-[14px] font-semibold text-slate-800 mb-1.5">{r.title}</div>
                  <div className="text-[12px] text-slate-500 leading-relaxed">{r.body}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ════ DEVICE LIST ════ */}
        {view === 'devices' && (
          <>
            <SH>Device list — {filteredDevices.length} device{filteredDevices.length !== 1 ? 's' : ''}</SH>
            <DeviceTable rows={pagedDevices} total={filteredDevices.length} page={page} totalPages={totalPages}
              sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} onPage={setPage} />
          </>
        )}

        {/* ════ OUTDATED & EOL ════ */}
        {view === 'outdated' && (
          <>
            <SH>Outdated &amp; end-of-life — {filteredDevices.length} device{filteredDevices.length !== 1 ? 's' : ''}</SH>
            <p className="text-[13px] text-slate-500 mb-3">
              Devices on macOS Sequoia (15.x), Sonoma (14.x), or Ventura (13.x) — outside current Apple security coverage.
              Use the OS Tier filter to narrow by severity.
            </p>
            <DeviceTable rows={pagedDevices} total={filteredDevices.length} page={page} totalPages={totalPages}
              sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} onPage={setPage} />
          </>
        )}

        {/* ════ STALE REGISTER ════ */}
        {view === 'stale' && (
          <>
            <SH>Stale register — {filteredDevices.length} device{filteredDevices.length !== 1 ? 's' : ''}</SH>

            {/* Quick-filter buttons */}
            <div className="flex flex-wrap gap-2 mb-4">
              {(['stale', 'critical', 'abandoned'] as const).map(t => {
                const cnts  = { stale: staleAll.filter(d => d.staleTier === 'stale').length, critical: staleAll.filter(d => d.staleTier === 'critical').length, abandoned: staleAll.filter(d => d.staleTier === 'abandoned').length }
                const lbls  = { stale: 'Stale 14+ days', critical: 'Critical 30+ days', abandoned: 'Abandoned 90+ days' }
                const clss  = { stale: 'border-amber-200 bg-amber-50 text-amber-700', critical: 'border-red-200 bg-red-50 text-red-700', abandoned: 'border-slate-300 bg-[#1a1a2e]/5 text-[#1a1a2e]' }
                return (
                  <button key={t} type="button"
                    onClick={() => setStaleFilter(staleFilter === t ? '' : t)}
                    className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition ${
                      staleFilter === t ? clss[t] + ' ring-2 ring-offset-1 ring-slate-300' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                    }`}>
                    {lbls[t]}: {cnts[t]}
                  </button>
                )
              })}
            </div>

            {filteredDevices.length === 0 ? (
              <div className="flex items-center gap-2 py-10 justify-center text-slate-400 text-[13px] border border-slate-200 rounded-lg">
                <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                No stale devices match the current filters.
              </div>
            ) : (
              <DeviceTable rows={pagedDevices} total={filteredDevices.length} page={page} totalPages={totalPages}
                sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} onPage={setPage} />
            )}
          </>
        )}

        {/* ════ REGIONAL SUMMARY ════ */}
        {view === 'regional' && (
          <>
            <SH>Regional patch compliance — {regions.length} region{regions.length !== 1 ? 's' : ''}</SH>
            <div className="rounded-lg border border-slate-200 overflow-x-auto">
              <table className="w-full text-[13px] min-w-[900px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Region', 'Total', 'Compliance', 'Current 26.5', 'Minor patch', 'Upd req', 'Sequoia 15.x', 'Sonoma 14.x', 'Ventura 13.x', 'Stale 14+d'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.4px] text-slate-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {regions.map(r => {
                    const bar = r.compPct >= 0.9 ? 'bg-green-500' : r.compPct >= 0.7 ? 'bg-amber-400' : 'bg-red-500'
                    return (
                      <tr key={r.region} className="border-b border-slate-100 last:border-0 hover:bg-blue-50/30 cursor-pointer"
                        onClick={() => drillTo('devices', undefined, r.region)}>
                        <td className="px-3 py-2.5 font-medium text-slate-700">{r.region}</td>
                        <td className="px-3 py-2.5 font-semibold text-slate-800">{r.total}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div className={`h-full rounded-full ${bar}`} style={{ width: `${r.compPct * 100}%` }} />
                            </div>
                            <span className="text-[11px] text-slate-500">{pct(r.current, r.total)}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-green-700 font-medium">{r.current   || <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-blue-700">{r.minor     || <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-indigo-700">{r.updateReq || <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-amber-700">{r.sequoia   || <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-orange-700">{r.sonoma    || <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-red-700 font-medium">{r.ventura   || <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-red-600">{r.stale     || <span className="text-slate-300">—</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200 font-semibold">
                    <td className="px-3 py-2.5 text-slate-700">Total</td>
                    <td className="px-3 py-2.5 text-slate-700">{total}</td>
                    <td className="px-3 py-2.5 text-slate-500 text-[11px]">{pct(currentCount, total)}</td>
                    <td className="px-3 py-2.5 text-green-700">{currentCount}</td>
                    <td className="px-3 py-2.5 text-blue-700">{minorCount}</td>
                    <td className="px-3 py-2.5 text-indigo-700">{updateReqCount}</td>
                    <td className="px-3 py-2.5 text-amber-700">{sequoiaCount}</td>
                    <td className="px-3 py-2.5 text-orange-700">{sonomaCount}</td>
                    <td className="px-3 py-2.5 text-red-700">{venturaCount}</td>
                    <td className="px-3 py-2.5 text-red-600">{staleCount}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">Click any row to view that region's devices in Device List.</p>
          </>
        )}

      </div>

      {/* ── Footer ── */}
      <div className="bg-slate-50 border-t border-slate-200 px-8 py-3 flex flex-wrap justify-between items-center gap-2 text-[11px] text-slate-400">
        <span>IRU macOS Patch &amp; Stale Device Report · Kandji MDM · {TODAY}</span>
        <span>Prepared by IRU Admin · Zinnia Infrastructure &amp; Remote Users · Confidential</span>
      </div>

    </div>
  )
}
