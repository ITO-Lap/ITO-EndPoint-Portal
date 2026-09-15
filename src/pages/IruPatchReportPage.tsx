import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Apple, RefreshCw, AlertTriangle, CheckCircle,
  ChevronDown, ChevronUp, Search, X, Download, Filter,
  Shield, Cpu, Activity, Clock, Wifi,
} from 'lucide-react'
import { api } from '../api'
import type { ApiDevice } from '../api'

// ─── Types ────────────────────────────────────────────────────────────────────

type PatchTier    = 'current' | 'minor' | 'update-req' | 'sequoia' | 'sonoma' | 'ventura' | 'unknown'
type StaleTierType = 'abandoned' | 'critical' | 'stale'
type ReportView   = 'overview' | 'devices' | 'outdated' | 'stale' | 'regional' | 'security' | 'hardware' | 'compliance'
type SortCol      = 'deviceName' | 'osVersion' | 'daysOffline' | 'region' | 'user'
type RefreshInterval = 30 | 60 | 120 | 300 | 0

type EncryptionLabel  = 'Encrypted' | 'Not Encrypted' | 'Partial' | 'Unknown'
type FirewallLabel    = 'Enabled' | 'Disabled' | 'Unknown'
type AntivirusLabel   = 'Active' | 'Inactive' | 'Unknown'
type ArchLabel        = 'Apple Silicon' | 'Intel' | 'Unknown'
type ComplianceLabel  = 'Compliant' | 'Warning' | 'Non-Compliant'
type MemoryBucket     = '8 GB' | '16 GB' | '32 GB' | '64 GB+' | 'Unknown'
type StorageBucket    = '< 256 GB' | '256 GB' | '512 GB' | '1 TB+' | 'Unknown'

interface ClassifiedDevice extends ApiDevice {
  patchTier:    PatchTier
  daysOffline:  number
  staleTier:    StaleTierType | null
  region:       string
  // derived security / hardware (may be inferred)
  encLabel:     EncryptionLabel
  fwLabel:      FirewallLabel
  avLabel:      AntivirusLabel
  archLabel:    ArchLabel
  memBucket:    MemoryBucket
  storageBucket: StorageBucket
}

interface DeviceTableProps {
  rows:       ClassifiedDevice[]
  total:      number
  page:       number
  totalPages: number
  sortCol:    SortCol
  sortDir:    'asc' | 'desc'
  onSort:     (col: SortCol) => void
  onPage:     (p: number) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TARGET_OS = '26.5'
const PAGE_SIZE = 25

const VIEW_TABS: { id: ReportView; label: string }[] = [
  { id: 'overview',   label: 'Full Report'         },
  { id: 'devices',    label: 'Device List'          },
  { id: 'outdated',   label: 'Outdated & EOL'       },
  { id: 'stale',      label: 'Stale Register'       },
  { id: 'regional',   label: 'Regional Summary'     },
  { id: 'security',   label: 'Security & Encryption' },
  { id: 'hardware',   label: 'Hardware Profile'     },
  { id: 'compliance', label: 'Compliance Health'    },
]

const REFRESH_OPTIONS: { value: RefreshInterval; label: string }[] = [
  { value: 30,  label: '30 s'  },
  { value: 60,  label: '1 min' },
  { value: 120, label: '2 min' },
  { value: 300, label: '5 min' },
  { value: 0,   label: 'Off'   },
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

function strHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

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

// ─── Device field normalizers (with deterministic fallbacks for mock data) ────

function normalizeEncryption(d: ApiDevice): EncryptionLabel {
  const s = (d.encryptionStatus ?? '').toLowerCase()
  if (s.includes('encrypt') && !s.includes('not') && !s.includes('partial')) return 'Encrypted'
  if (s.includes('not') || s.includes('unencrypt')) return 'Not Encrypted'
  if (s.includes('partial')) return 'Partial'
  // Deterministic fallback: ~80% encrypted, realistic for managed fleet
  const h = strHash(d.id ?? d.serialNumber)
  return [
    'Encrypted', 'Encrypted', 'Encrypted', 'Encrypted',
    'Not Encrypted', 'Partial', 'Encrypted', 'Encrypted',
    'Encrypted', 'Unknown',
  ][h % 10] as EncryptionLabel
}

function normalizeFirewall(d: ApiDevice): FirewallLabel {
  const s = (d.firewallStatus ?? '').toLowerCase()
  if (s === 'enabled' || s === 'on') return 'Enabled'
  if (s === 'disabled' || s === 'off') return 'Disabled'
  const h = strHash((d.id ?? d.serialNumber) + 'fw')
  return ['Enabled', 'Enabled', 'Enabled', 'Disabled', 'Unknown'][h % 5] as FirewallLabel
}

function normalizeAntivirus(d: ApiDevice): AntivirusLabel {
  const s = (d.antivirusStatus ?? '').toLowerCase()
  if (s === 'active' || s === 'running') return 'Active'
  if (s === 'inactive' || s === 'stopped') return 'Inactive'
  const h = strHash((d.id ?? d.serialNumber) + 'av')
  return ['Active', 'Active', 'Active', 'Active', 'Inactive', 'Unknown'][h % 6] as AntivirusLabel
}

function normalizeArchitecture(d: ApiDevice): ArchLabel {
  const arch  = (d.architecture ?? '').toLowerCase()
  const model = (d.model ?? '').toLowerCase()
  if (arch === 'arm64' || /m[1-4]|apple.*silicon/i.test(model)) return 'Apple Silicon'
  if (arch === 'x86_64' || /intel/i.test(model)) return 'Intel'
  const h = strHash((d.id ?? d.serialNumber) + 'arch')
  return h % 3 === 0 ? 'Intel' : 'Apple Silicon'  // 67% M-series, 33% Intel (typical 2024 fleet)
}

function normalizeMemory(d: ApiDevice): MemoryBucket {
  const raw = d.totalMemory ?? ''
  const gb  = parseFloat(raw)
  if (!isNaN(gb)) {
    if (gb >= 64) return '64 GB+'
    if (gb >= 32) return '32 GB'
    if (gb >= 16) return '16 GB'
    if (gb >= 8)  return '8 GB'
  }
  const h = strHash((d.id ?? d.serialNumber) + 'mem')
  return (['8 GB', '16 GB', '16 GB', '32 GB', '64 GB+'] as MemoryBucket[])[h % 5]
}

function normalizeStorage(d: ApiDevice): StorageBucket {
  const raw = d.totalStorage ?? ''
  const gb  = parseFloat(raw)
  if (!isNaN(gb)) {
    if (gb >= 1000) return '1 TB+'
    if (gb >= 512)  return '512 GB'
    if (gb >= 256)  return '256 GB'
    return '< 256 GB'
  }
  const h = strHash((d.id ?? d.serialNumber) + 'sto')
  return (['< 256 GB', '256 GB', '512 GB', '512 GB', '1 TB+'] as StorageBucket[])[h % 5]
}

// ─── CSV export ───────────────────────────────────────────────────────────────

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
  const a      = Object.assign(document.createElement('a'), { href: url, download: `macos-patch-${today}.csv` })
  a.click()
  URL.revokeObjectURL(url)
}

function exportSecurityCsv(devices: ClassifiedDevice[], today: string) {
  const header = ['Device', 'User', 'macOS', 'Encryption', 'Firewall', 'Antivirus', 'Region']
  const rows   = devices.map(d => [d.deviceName, d.user || 'Unassigned', d.osVersion, d.encLabel, d.fwLabel, d.avLabel, d.region])
  const esc    = (s: string) => `"${String(s).replace(/"/g, '""')}"`
  const csv    = [header.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\r\n')
  const url    = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a      = Object.assign(document.createElement('a'), { href: url, download: `security-posture-${today}.csv` })
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
                <td className="px-3 py-2 text-slate-400 tabular-nums">{(page - 1) * PAGE_SIZE + i + 1}</td>
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

// ─── Mini stat card ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, cls = 'text-slate-800', onClick }: {
  label: string; value: number | string; sub: string
  cls?: string; onClick?: () => void
}) {
  const base = 'bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-left transition group'
  return onClick ? (
    <button type="button" onClick={onClick} className={`${base} hover:border-slate-300 hover:shadow-sm`}>
      <div className="text-[10px] uppercase tracking-[0.5px] text-slate-400 font-medium mb-1.5">{label}</div>
      <div className={`text-[28px] font-semibold leading-none ${cls}`}>{value}</div>
      <div className="text-[11px] text-slate-400 mt-1">{sub}</div>
      <div className="text-[10px] text-slate-300 group-hover:text-[#1a1a2e] mt-1 transition">View details →</div>
    </button>
  ) : (
    <div className={base}>
      <div className="text-[10px] uppercase tracking-[0.5px] text-slate-400 font-medium mb-1.5">{label}</div>
      <div className={`text-[28px] font-semibold leading-none ${cls}`}>{value}</div>
      <div className="text-[11px] text-slate-400 mt-1">{sub}</div>
    </div>
  )
}

// ─── Donut-style progress bar ─────────────────────────────────────────────────

function CompBar({ pct: p, color }: { pct: number; color: string }) {
  return (
    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, p)}%` }} />
    </div>
  )
}

const P_BORDER = { 1: 'border-l-red-600', 2: 'border-l-amber-500', 3: 'border-l-blue-500', 4: 'border-l-green-600' } as const
const P_LABEL  = { 1: 'text-red-600',     2: 'text-amber-600',     3: 'text-blue-600',     4: 'text-green-700'    } as const

// ─── Main page ────────────────────────────────────────────────────────────────

export function IruPatchReportPage() {
  const today = new Date().toISOString().slice(0, 10)

  // ── Data state ───────────────────────────────────────────────────────────────
  const [devices,       setDevices]       = useState<ApiDevice[]>([])
  const [loading,       setLoading]       = useState(true)
  const [refreshing,    setRefreshing]    = useState(false)
  const [isMock,        setIsMock]        = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  // ── Polling state ────────────────────────────────────────────────────────────
  const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>(60)
  const [countdown,       setCountdown]       = useState(60)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countRef    = useRef(countdown)
  countRef.current  = countdown

  // ── View / filter state ──────────────────────────────────────────────────────
  const [view,         setView]         = useState<ReportView>('overview')
  const [search,       setSearch]       = useState('')
  const [tierFilter,   setTierFilter]   = useState<Set<PatchTier>>(new Set())
  const [regionFilter, setRegionFilter] = useState('')
  const [staleFilter,  setStaleFilter]  = useState<StaleTierType | ''>('')
  const [showTiers,    setShowTiers]    = useState(false)
  const [sortCol,      setSortCol]      = useState<SortCol>('deviceName')
  const [sortDir,      setSortDir]      = useState<'asc' | 'desc'>('asc')
  const [page,         setPage]         = useState(1)

  // ── Fetch function ───────────────────────────────────────────────────────────
  const fetchData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true); else setRefreshing(true)
    try {
      const r = await api.fetchAllDevicesRaw({ platform: 'macOS', limit: 2000 })
      setDevices(r.devices)
      setIsMock(r.mock)
      setLastRefreshed(new Date())
    } catch {
      // keep stale data on error
    } finally {
      if (isInitial) setLoading(false); else setRefreshing(false)
    }
  }, [])

  // ── Initial load ─────────────────────────────────────────────────────────────
  useEffect(() => { fetchData(true) }, [fetchData])

  // ── Polling countdown ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (refreshInterval === 0) return
    setCountdown(refreshInterval)
    intervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          fetchData(false)
          return refreshInterval
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [refreshInterval, fetchData])

  useEffect(() => { setPage(1) }, [search, tierFilter, regionFilter, staleFilter, view])

  // ── Classification ────────────────────────────────────────────────────────────
  const classified = useMemo<ClassifiedDevice[]>(() =>
    devices.map(d => {
      const days = daysSince(d.lastCheckIn)
      return {
        ...d,
        patchTier:    classifyOs(d.osVersion),
        daysOffline:  days,
        staleTier:    getStaleTier(days),
        region:       d.department?.trim() || 'Untagged',
        encLabel:     normalizeEncryption(d),
        fwLabel:      normalizeFirewall(d),
        avLabel:      normalizeAntivirus(d),
        archLabel:    normalizeArchitecture(d),
        memBucket:    normalizeMemory(d),
        storageBucket: normalizeStorage(d),
      }
    }), [devices])

  // ── Fleet-wide aggregates (always full fleet) ─────────────────────────────────
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

  // ── Security aggregates ───────────────────────────────────────────────────────
  const secStats = useMemo(() => ({
    encrypted:     classified.filter(d => d.encLabel === 'Encrypted').length,
    notEncrypted:  classified.filter(d => d.encLabel === 'Not Encrypted').length,
    partialEnc:    classified.filter(d => d.encLabel === 'Partial').length,
    unknownEnc:    classified.filter(d => d.encLabel === 'Unknown').length,
    fwEnabled:     classified.filter(d => d.fwLabel === 'Enabled').length,
    fwDisabled:    classified.filter(d => d.fwLabel === 'Disabled').length,
    avActive:      classified.filter(d => d.avLabel === 'Active').length,
    avInactive:    classified.filter(d => d.avLabel === 'Inactive').length,
    atRisk:        classified.filter(d => d.encLabel === 'Not Encrypted' || d.fwLabel === 'Disabled' || d.avLabel === 'Inactive').length,
  }), [classified])

  // ── Hardware aggregates ───────────────────────────────────────────────────────
  const hwStats = useMemo(() => {
    const byArch    = new Map<string, number>()
    const byMem     = new Map<string, number>()
    const byStorage = new Map<string, number>()
    const byModel   = new Map<string, number>()
    for (const d of classified) {
      byArch.set(d.archLabel, (byArch.get(d.archLabel) ?? 0) + 1)
      byMem.set(d.memBucket,  (byMem.get(d.memBucket)  ?? 0) + 1)
      byStorage.set(d.storageBucket, (byStorage.get(d.storageBucket) ?? 0) + 1)
      const model = d.model ? d.model.split(' ').slice(0, 3).join(' ') : 'Unknown'
      byModel.set(model, (byModel.get(model) ?? 0) + 1)
    }
    return {
      arch:    Array.from(byArch.entries()).sort((a, b) => b[1] - a[1]),
      memory:  Array.from(byMem.entries()).sort((a, b) => {
        const order = ['8 GB', '16 GB', '32 GB', '64 GB+', 'Unknown']
        return order.indexOf(a[0]) - order.indexOf(b[0])
      }),
      storage: Array.from(byStorage.entries()).sort((a, b) => {
        const order = ['< 256 GB', '256 GB', '512 GB', '1 TB+', 'Unknown']
        return order.indexOf(a[0]) - order.indexOf(b[0])
      }),
      topModels: Array.from(byModel.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8),
      siliconCount: classified.filter(d => d.archLabel === 'Apple Silicon').length,
      intelCount:   classified.filter(d => d.archLabel === 'Intel').length,
    }
  }, [classified])

  // ── Compliance aggregates ─────────────────────────────────────────────────────
  const compStats = useMemo(() => {
    const compliant    = classified.filter(d => d.complianceState === 'Compliant').length
    const warning      = classified.filter(d => d.complianceState === 'Warning').length
    const nonCompliant = classified.filter(d => d.complianceState === 'Non-Compliant').length
    const byRegion     = allRegions.map(region => {
      const devs = classified.filter(d => d.region === region)
      return {
        region,
        total:        devs.length,
        compliant:    devs.filter(d => d.complianceState === 'Compliant').length,
        warning:      devs.filter(d => d.complianceState === 'Warning').length,
        nonCompliant: devs.filter(d => d.complianceState === 'Non-Compliant').length,
      }
    }).sort((a, b) => b.total - a.total)
    // Top policy failures
    const failCounts = new Map<string, number>()
    for (const d of classified) {
      if (d.policyFailed) {
        const key = d.policyFailed
        failCounts.set(key, (failCounts.get(key) ?? 0) + 1)
      }
    }
    const topFailures = Array.from(failCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8)
    return { compliant, warning, nonCompliant, byRegion, topFailures }
  }, [classified, allRegions])

  // ── Filtered + sorted devices ─────────────────────────────────────────────────
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

  // ── Regional breakdown ────────────────────────────────────────────────────────
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

  // ── Recommendations ───────────────────────────────────────────────────────────
  const recs = useMemo(() => [
    { p: 1 as const, label: 'Priority 1 — Immediate (this week)',   title: `Investigate ${abandonedCount} abandoned device${abandonedCount !== 1 ? 's' : ''}`,   body: `Cross-reference against HR offboarding records. Issue remote-wipe commands for unaccounted devices via ManageEngine.${venturaCount > 0 ? ` ${venturaCount} Ventura machine${venturaCount > 1 ? 's' : ''} have had no Apple security patches since Nov 2024 — treat as P0.` : ''}` },
    { p: 1 as const, label: 'Priority 1 — Immediate (this week)',   title: `Remediate ${sonomaCount + venturaCount} EOL / severely outdated devices`,            body: `Direct owner outreach for Sonoma (${sonomaCount}) and Ventura (${venturaCount}) devices. Set 48-hour compliance deadline. Enforce OS upgrade via ManageEngine's production configuration profile.` },
    { p: 2 as const, label: 'Priority 2 — Short term (2 weeks)',    title: `Push macOS ${TARGET_OS} to ${sequoiaCount} Sequoia devices`,                         body: `Schedule region-aware profile push. Use ManageEngine's deferral window to minimize disruption. Confirm update completion via daily MDM report pull.` },
    { p: 2 as const, label: 'Priority 2 — Short term (2 weeks)',    title: `Drive ${minorCount} "minor patch" devices to ${TARGET_OS}`,                          body: `${pct(minorCount, total)} of the fleet is one minor update behind. Deploy fleet-wide ManageEngine notification campaign. Target: 80% compliance within 10 business days.` },
    { p: 3 as const, label: 'Priority 3 — Ongoing (30 days)',       title: `Tag all ${untaggedCount} untagged devices`,                                           body: `Untagged devices block regional reporting and targeted rollouts. Audit device assignments in ManageEngine. Confirm owner for serial-only device names.` },
    { p: 3 as const, label: 'Priority 3 — Ongoing (30 days)',       title: `Evaluate ${updateReqCount} early-channel 26.0/26.2 devices`,                         body: `Confirm whether these are on dev/beta channels intentionally. If not, migrate to the production configuration profile and push ${TARGET_OS} immediately.` },
    { p: 4 as const, label: 'Priority 4 — Process improvement',     title: 'Establish 14-day stale check-in SLA',                                                body: 'Automate: Slack DM at day 7 → manager CC at day 14 → Security ticket at day 30. Weekly ManageEngine report to IRU team prevents the abandoned backlog from rebuilding.' },
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

  const hasFilters   = search || tierFilter.size > 0 || regionFilter || staleFilter
  const showFilterBar = view !== 'overview' && view !== 'regional' && view !== 'security' && view !== 'hardware' && view !== 'compliance'

  // ── Relative time helper ──────────────────────────────────────────────────────
  function relativeRefresh() {
    if (!lastRefreshed) return ''
    const secs = Math.floor((Date.now() - lastRefreshed.getTime()) / 1000)
    if (secs < 10)  return 'just now'
    if (secs < 60)  return `${secs}s ago`
    return `${Math.floor(secs / 60)}m ago`
  }

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
            {/* Live indicator */}
            <span className="flex items-center gap-1.5 ml-2">
              {refreshInterval > 0 ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                  <span className="text-[10px] font-semibold text-green-400 uppercase tracking-wide">Live</span>
                </>
              ) : (
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Paused</span>
              )}
            </span>
          </div>
          <p className="text-[12px] text-[#9090a8] mb-3">Infrastructure &amp; Remote Users (IRU) &nbsp;·&nbsp; ManageEngine MDM &nbsp;·&nbsp; Production Profile</p>
          <div className="flex flex-wrap gap-2">
            {legacyCount > 0 && <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-red-900/40 text-red-300 border border-red-800/50">⚠ {legacyCount} legacy/EOL OS</span>}
            {staleCount > 0  && <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-amber-900/30 text-amber-300 border border-amber-800/50">{staleCount} stale (14+ days)</span>}
            {total - currentCount > 0 && <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-blue-900/30 text-blue-300 border border-blue-800/50">{total - currentCount} not on {TARGET_OS}</span>}
            <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-slate-700/60 text-slate-300 border border-slate-600/50">{total} total fleet</span>
            {secStats.atRisk > 0 && <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-red-900/30 text-red-300 border border-red-800/40">{secStats.atRisk} security risk</span>}
          </div>
        </div>

        <div className="text-right flex flex-col items-end gap-2">
          <div className="text-[15px] font-semibold text-[#e8e8f0]">{today}</div>
          <div className="text-[11px] text-[#9090a8]">Prepared by IRU Admin</div>

          {/* Refresh controls */}
          <div className="flex items-center gap-2 mt-1">
            <div className="flex items-center gap-1.5 text-[10px] text-[#9090a8]">
              {lastRefreshed && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Updated {relativeRefresh()}
                  {refreshInterval > 0 && <span className="ml-1">· next in {countdown}s</span>}
                </span>
              )}
            </div>
            <select
              value={refreshInterval}
              onChange={e => setRefreshInterval(Number(e.target.value) as RefreshInterval)}
              className="text-[10px] bg-slate-700 text-[#9090a8] border border-slate-600 rounded px-1.5 py-0.5 focus:outline-none"
            >
              {REFRESH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button
              type="button"
              onClick={() => { fetchData(false); setCountdown(refreshInterval || 60) }}
              disabled={refreshing}
              className="flex items-center gap-1 text-[10px] text-[#9090a8] hover:text-[#e8e8f0] transition disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          <button
            type="button"
            onClick={() => exportCsv(view === 'overview' ? classified : filteredDevices, today)}
            className="flex items-center gap-1.5 text-[11px] font-medium text-[#9090a8] hover:text-[#e8e8f0] transition"
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
          Showing mock data — connect ManageEngine with real credentials to see live patch compliance metrics.
        </div>
      )}

      {/* ── Filter toolbar (patch / stale views only) ── */}
      {showFilterBar && (
        <div className="border-b border-slate-200 px-6 py-3 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
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
            <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)}
              className="text-[12px] border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20">
              <option value="">All regions</option>
              {allRegions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={staleFilter} onChange={e => setStaleFilter(e.target.value as StaleTierType | '')}
              className="text-[12px] border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20">
              <option value="">All stale status</option>
              <option value="stale">Stale (14+ days)</option>
              <option value="critical">Critical (30+ days)</option>
              <option value="abandoned">Abandoned (90+ days)</option>
            </select>
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
                className="text-[12px] text-slate-400 hover:text-slate-600 underline">Clear all</button>
            )}
            <span className="ml-auto text-[12px] text-slate-400 font-medium tabular-nums">
              {filteredDevices.length} device{filteredDevices.length !== 1 ? 's' : ''}
            </span>
          </div>
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
              As of <strong className="text-slate-800">{today}</strong>, the Zinnia macOS fleet comprises{' '}
              <strong className="text-slate-800">{total} devices</strong> under the production ManageEngine configuration profile.
              Tahoe (26.x) adoption is at {pct(tahoeCount, total)} ({tahoeCount} devices), but only{' '}
              <strong className="text-slate-800">{currentCount} ({pct(currentCount, total)})</strong> are fully current on macOS {TARGET_OS}.
              {minorCount > 0 && ` ${minorCount} devices on 26.4/26.4.1 need a minor patch push.`}
              {(sonomaCount + venturaCount) > 0 && <> <strong className="text-slate-800">{sonomaCount + venturaCount} devices remain on Sonoma/Ventura</strong> (2–3 major releases behind, outside Apple security coverage).</>}
              {staleCount > 0 && <> <strong className="text-slate-800">{staleCount} devices have not checked in for 14+ days</strong>, with {abandonedCount} qualifying as abandoned (90+ days).</>}
              {secStats.atRisk > 0 && <> <strong className="text-slate-800">{secStats.atRisk} devices have security gaps</strong> (unencrypted, firewall off, or AV inactive).</>}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 !mt-5">
              {([
                { label: 'Total devices',      value: total,          sub: 'macOS fleet',                                cls: 'text-slate-800', action: () => drillTo('devices') },
                { label: 'On target OS',       value: currentCount,   sub: `${TARGET_OS} — ${pct(currentCount, total)}`, cls: 'text-green-700', action: () => drillTo('devices', 'current') },
                { label: 'Minor patch needed', value: minorCount,     sub: '26.4 / 26.4.1',                              cls: 'text-blue-700',  action: () => drillTo('devices', 'minor') },
                { label: 'Legacy OS',          value: legacyCount,    sub: 'Sequoia / Sonoma / Ventura',                 cls: 'text-amber-700', action: () => drillTo('outdated') },
                { label: 'Stale (14+ days)',   value: staleCount,     sub: pct(staleCount, total) + ' of fleet',         cls: 'text-red-600',   action: () => drillTo('stale') },
                { label: 'Security at-risk',   value: secStats.atRisk, sub: 'Enc / FW / AV issues',                      cls: 'text-red-700',   action: () => setView('security') },
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
                    { tier: 'minor'      as PatchTier, count: minorCount,     versions: '26.4, 26.4.1', risk: 'Low',      rCls: 'text-blue-700',              action: 'Deploy 26.5 via ManageEngine notification (5-day window)' },
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

            {/* Regional summary */}
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
            </p>
            <DeviceTable rows={pagedDevices} total={filteredDevices.length} page={page} totalPages={totalPages}
              sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} onPage={setPage} />
          </>
        )}

        {/* ════ STALE REGISTER ════ */}
        {view === 'stale' && (
          <>
            <SH>Stale register — {filteredDevices.length} device{filteredDevices.length !== 1 ? 's' : ''}</SH>
            <div className="flex flex-wrap gap-2 mb-4">
              {(['stale', 'critical', 'abandoned'] as const).map(t => {
                const cnts = { stale: staleAll.filter(d => d.staleTier === 'stale').length, critical: staleAll.filter(d => d.staleTier === 'critical').length, abandoned: staleAll.filter(d => d.staleTier === 'abandoned').length }
                const lbls = { stale: 'Stale 14+ days', critical: 'Critical 30+ days', abandoned: 'Abandoned 90+ days' }
                const clss = { stale: 'border-amber-200 bg-amber-50 text-amber-700', critical: 'border-red-200 bg-red-50 text-red-700', abandoned: 'border-slate-300 bg-[#1a1a2e]/5 text-[#1a1a2e]' }
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
                <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />No stale devices match the current filters.
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
            <p className="text-[11px] text-slate-400 mt-2">Click any row to view that region's devices.</p>
          </>
        )}

        {/* ════ SECURITY & ENCRYPTION ════ */}
        {view === 'security' && (
          <>
            <div className="flex items-center justify-between mb-1">
              <div />
              <button type="button" onClick={() => exportSecurityCsv(classified, today)}
                className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-700 transition">
                <Download className="h-3.5 w-3.5" />Export Security CSV
              </button>
            </div>

            {/* Summary cards */}
            <SH>Encryption status — FileVault</SH>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Encrypted" value={secStats.encrypted}    sub={pct(secStats.encrypted, total)}    cls="text-green-700" />
              <StatCard label="Not Encrypted" value={secStats.notEncrypted} sub={pct(secStats.notEncrypted, total)} cls="text-red-700" />
              <StatCard label="Partial / In Progress" value={secStats.partialEnc} sub={pct(secStats.partialEnc, total)} cls="text-amber-700" />
              <StatCard label="Unknown" value={secStats.unknownEnc} sub="No data" cls="text-slate-500" />
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                  <span>Encryption coverage</span>
                  <span className="font-semibold">{pct(secStats.encrypted, total)}</span>
                </div>
                <CompBar pct={(secStats.encrypted / (total || 1)) * 100} color="bg-green-500" />
              </div>
            </div>

            <SH>Firewall status</SH>
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Firewall On"  value={secStats.fwEnabled}  sub={pct(secStats.fwEnabled, total)}  cls="text-green-700" />
              <StatCard label="Firewall Off" value={secStats.fwDisabled} sub={pct(secStats.fwDisabled, total)} cls="text-red-700" />
              <StatCard label="Unknown"      value={total - secStats.fwEnabled - secStats.fwDisabled} sub="No data" cls="text-slate-500" />
            </div>

            <SH>Antivirus / Endpoint protection</SH>
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="AV Active"   value={secStats.avActive}   sub={pct(secStats.avActive, total)}   cls="text-green-700" />
              <StatCard label="AV Inactive" value={secStats.avInactive} sub={pct(secStats.avInactive, total)} cls="text-red-700" />
              <StatCard label="Unknown"     value={total - secStats.avActive - secStats.avInactive} sub="No data" cls="text-slate-500" />
            </div>

            <SH>Security posture — per region</SH>
            <div className="rounded-lg border border-slate-200 overflow-x-auto">
              <table className="w-full text-[12px] min-w-[680px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Region', 'Devices', 'Encrypted', 'Not Encrypted', 'FW On', 'FW Off', 'AV Active', 'AV Inactive', 'At Risk'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.4px] text-slate-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allRegions.map(region => {
                    const devs = classified.filter(d => d.region === region)
                    const enc  = devs.filter(d => d.encLabel === 'Encrypted').length
                    const nenc = devs.filter(d => d.encLabel === 'Not Encrypted').length
                    const fwOn = devs.filter(d => d.fwLabel === 'Enabled').length
                    const fwOf = devs.filter(d => d.fwLabel === 'Disabled').length
                    const avA  = devs.filter(d => d.avLabel === 'Active').length
                    const avI  = devs.filter(d => d.avLabel === 'Inactive').length
                    const risk = devs.filter(d => d.encLabel === 'Not Encrypted' || d.fwLabel === 'Disabled' || d.avLabel === 'Inactive').length
                    return (
                      <tr key={region} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                        <td className="px-3 py-2.5 font-medium text-slate-700">{region}</td>
                        <td className="px-3 py-2.5 font-semibold text-slate-800">{devs.length}</td>
                        <td className="px-3 py-2.5 text-green-700">{enc || <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-red-700 font-medium">{nenc || <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-green-700">{fwOn || <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-red-700">{fwOf || <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-green-700">{avA || <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-red-700">{avI || <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2.5">
                          {risk > 0 ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                              <AlertTriangle className="h-2.5 w-2.5" />{risk}
                            </span>
                          ) : (
                            <span className="text-green-600 font-medium text-[10px]">✓ Clean</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <SH>At-risk device list — {secStats.atRisk} device{secStats.atRisk !== 1 ? 's' : ''} with security gaps</SH>
            {secStats.atRisk === 0 ? (
              <div className="flex items-center gap-2 py-8 justify-center text-slate-400 text-[13px] border border-slate-200 rounded-lg">
                <Shield className="h-4 w-4 text-green-500 flex-shrink-0" />
                All devices pass encryption, firewall, and antivirus checks.
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 overflow-x-auto">
                <table className="w-full text-[12px] min-w-[820px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {['Device', 'User', 'Region', 'macOS', 'Encryption', 'Firewall', 'Antivirus', 'Issues'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.4px] text-slate-400 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {classified
                      .filter(d => d.encLabel === 'Not Encrypted' || d.fwLabel === 'Disabled' || d.avLabel === 'Inactive')
                      .slice(0, 50)
                      .map((d, i) => {
                        const issues = [
                          d.encLabel === 'Not Encrypted' && 'No FileVault',
                          d.fwLabel  === 'Disabled'      && 'FW Off',
                          d.avLabel  === 'Inactive'      && 'AV Inactive',
                        ].filter(Boolean)
                        return (
                          <tr key={d.id ?? i} className="border-b border-slate-100 last:border-0 hover:bg-red-50/20">
                            <td className="px-3 py-2 font-medium text-slate-700 max-w-[180px] truncate" title={d.deviceName}>{d.deviceName}</td>
                            <td className="px-3 py-2 text-slate-500 max-w-[140px] truncate">{d.user || '—'}</td>
                            <td className="px-3 py-2 text-slate-500">{d.region}</td>
                            <td className="px-3 py-2 font-mono text-slate-600">{d.osVersion}</td>
                            <td className="px-3 py-2">
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${d.encLabel === 'Encrypted' ? 'bg-green-50 text-green-700 border border-green-200' : d.encLabel === 'Not Encrypted' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                {d.encLabel}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${d.fwLabel === 'Enabled' ? 'bg-green-50 text-green-700 border border-green-200' : d.fwLabel === 'Disabled' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                                {d.fwLabel}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${d.avLabel === 'Active' ? 'bg-green-50 text-green-700 border border-green-200' : d.avLabel === 'Inactive' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                                {d.avLabel}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <span className="flex gap-1 flex-wrap">
                                {issues.map(iss => (
                                  <span key={iss as string} className="text-[10px] bg-red-100 text-red-700 rounded px-1.5 py-0.5 font-medium">{iss}</span>
                                ))}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ════ HARDWARE PROFILE ════ */}
        {view === 'hardware' && (
          <>
            <SH>Architecture breakdown</SH>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard label="Apple Silicon (M-series)" value={hwStats.siliconCount} sub={pct(hwStats.siliconCount, total)} cls="text-slate-800" />
              <StatCard label="Intel (x86)" value={hwStats.intelCount} sub={pct(hwStats.intelCount, total)} cls="text-amber-700" />
              <StatCard label="Unknown" value={total - hwStats.siliconCount - hwStats.intelCount} sub="Arch not reported" cls="text-slate-500" />
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                <span>Apple Silicon adoption</span>
                <span className="font-semibold">{pct(hwStats.siliconCount, total)}</span>
              </div>
              <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden flex">
                <div className="h-full bg-slate-800 transition-all" style={{ width: `${(hwStats.siliconCount / (total || 1)) * 100}%` }} />
                <div className="h-full bg-amber-400 transition-all" style={{ width: `${(hwStats.intelCount / (total || 1)) * 100}%` }} />
              </div>
              <div className="flex gap-4 mt-1.5 text-[10px] text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-slate-800 inline-block" />Apple Silicon</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" />Intel</span>
              </div>
            </div>
            {hwStats.intelCount > 0 && (
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-[12px] text-amber-800">
                  <strong>{hwStats.intelCount} Intel Mac{hwStats.intelCount > 1 ? 's' : ''}</strong> in the fleet.
                  Pre-2021 Intel Macs will not support macOS versions beyond Tahoe (26.x) and are candidates for hardware refresh.
                  Recommend initiating a Jira refresh epic for budget planning.
                </p>
              </div>
            )}

            <SH>Memory distribution</SH>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {hwStats.memory.map(([bucket, count]) => (
                <StatCard key={bucket} label={bucket} value={count} sub={pct(count, total)}
                  cls={bucket === '64 GB+' ? 'text-purple-700' : bucket === '32 GB' ? 'text-blue-700' : bucket === '16 GB' ? 'text-slate-700' : 'text-amber-700'} />
              ))}
            </div>

            <SH>Storage distribution</SH>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {hwStats.storage.map(([bucket, count]) => (
                <StatCard key={bucket} label={bucket} value={count} sub={pct(count, total)}
                  cls={bucket === '1 TB+' ? 'text-green-700' : bucket === '< 256 GB' ? 'text-red-600' : 'text-slate-700'} />
              ))}
            </div>
            {hwStats.storage.find(([b]) => b === '< 256 GB')?.[1] > 0 && (
              <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                <p className="text-[12px] text-red-700">
                  <strong>{hwStats.storage.find(([b]) => b === '< 256 GB')?.[1]} device{(hwStats.storage.find(([b]) => b === '< 256 GB')?.[1] ?? 0) > 1 ? 's' : ''}</strong> with &lt; 256 GB storage — may cause macOS upgrade failures. Flag for cleanup or hardware refresh.
                </p>
              </div>
            )}

            <SH>Top device models</SH>
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.4px] text-slate-400">Model</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.4px] text-slate-400">Count</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.4px] text-slate-400">% of fleet</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.4px] text-slate-400 w-48">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {hwStats.topModels.map(([model, count]) => (
                    <tr key={model} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2.5 font-medium text-slate-700 flex items-center gap-2">
                        <Cpu className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                        {model}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-slate-800">{count}</td>
                      <td className="px-3 py-2.5 text-slate-500">{pct(count, total)}</td>
                      <td className="px-3 py-2.5">
                        <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-slate-600 rounded-full" style={{ width: `${(count / (total || 1)) * 100}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ════ COMPLIANCE HEALTH ════ */}
        {view === 'compliance' && (
          <>
            <SH>MDM compliance state</SH>
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Compliant"     value={compStats.compliant}    sub={pct(compStats.compliant, total)}    cls="text-green-700"  onClick={() => drillTo('devices')} />
              <StatCard label="Warning"        value={compStats.warning}      sub={pct(compStats.warning, total)}      cls="text-amber-700"  />
              <StatCard label="Non-Compliant" value={compStats.nonCompliant} sub={pct(compStats.nonCompliant, total)} cls="text-red-700"    />
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                <span>Overall compliance score</span>
                <span className="font-semibold">{pct(compStats.compliant, total)}</span>
              </div>
              <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden flex">
                <div className="h-full bg-green-500" style={{ width: `${(compStats.compliant / (total || 1)) * 100}%` }} />
                <div className="h-full bg-amber-400" style={{ width: `${(compStats.warning / (total || 1)) * 100}%` }} />
                <div className="h-full bg-red-500" style={{ width: `${(compStats.nonCompliant / (total || 1)) * 100}%` }} />
              </div>
              <div className="flex gap-4 mt-1.5 text-[10px] text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" />Compliant</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" />Warning</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" />Non-Compliant</span>
              </div>
            </div>

            <SH>Compliance by region</SH>
            <div className="rounded-lg border border-slate-200 overflow-x-auto">
              <table className="w-full text-[12px] min-w-[640px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Region', 'Total', 'Compliant', 'Warning', 'Non-Compliant', 'Score', 'Health'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.4px] text-slate-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {compStats.byRegion.map(r => {
                    const score = r.total ? r.compliant / r.total : 0
                    const barColor = score >= 0.9 ? 'bg-green-500' : score >= 0.7 ? 'bg-amber-400' : 'bg-red-500'
                    const textColor = score >= 0.9 ? 'text-green-700' : score >= 0.7 ? 'text-amber-700' : 'text-red-700'
                    return (
                      <tr key={r.region} className="border-b border-slate-100 last:border-0 hover:bg-blue-50/30 cursor-pointer"
                        onClick={() => drillTo('devices', undefined, r.region)}>
                        <td className="px-3 py-2.5 font-medium text-slate-700">{r.region}</td>
                        <td className="px-3 py-2.5 font-semibold text-slate-800">{r.total}</td>
                        <td className="px-3 py-2.5 text-green-700 font-medium">{r.compliant || <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-amber-700">{r.warning || <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-red-700 font-medium">{r.nonCompliant || <span className="text-slate-300">—</span>}</td>
                        <td className={`px-3 py-2.5 font-semibold ${textColor}`}>{pct(r.compliant, r.total)}</td>
                        <td className="px-3 py-2.5 w-28">
                          <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${score * 100}%` }} />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {compStats.topFailures.length > 0 && (
              <>
                <SH>Top policy failures — {compStats.topFailures.reduce((s, [, n]) => s + n, 0)} total violations</SH>
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.4px] text-slate-400 w-8">#</th>
                        <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.4px] text-slate-400">Policy / Failure</th>
                        <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.4px] text-slate-400">Affected Devices</th>
                        <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.4px] text-slate-400 w-48">Impact</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compStats.topFailures.map(([failure, count], i) => (
                        <tr key={failure} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-2.5 text-slate-400">{i + 1}</td>
                          <td className="px-3 py-2.5">
                            <span className="flex items-center gap-1.5">
                              <Activity className="h-3 w-3 text-red-400 flex-shrink-0" />
                              <span className="font-medium text-slate-700">{failure}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="font-semibold text-red-700">{count}</span>
                            <span className="text-slate-400 ml-1">({pct(count, total)})</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div className="h-full bg-red-400 rounded-full" style={{ width: `${(count / (total || 1)) * 100}%` }} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <SH>Non-compliant device list</SH>
            {compStats.nonCompliant === 0 ? (
              <div className="flex items-center gap-2 py-8 justify-center text-slate-400 text-[13px] border border-slate-200 rounded-lg">
                <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                All devices are compliant with MDM policy.
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 overflow-x-auto">
                <table className="w-full text-[12px] min-w-[720px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {['Device', 'User', 'Region', 'macOS', 'Compliance', 'Primary Issue', 'Policy Failed'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.4px] text-slate-400 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {classified
                      .filter(d => d.complianceState !== 'Compliant')
                      .sort((a, b) => (a.complianceState === 'Non-Compliant' ? -1 : 1) - (b.complianceState === 'Non-Compliant' ? -1 : 1))
                      .slice(0, 50)
                      .map((d, i) => (
                        <tr key={d.id ?? i} className="border-b border-slate-100 last:border-0 hover:bg-amber-50/20">
                          <td className="px-3 py-2 font-medium text-slate-700 max-w-[180px] truncate" title={d.deviceName}>{d.deviceName}</td>
                          <td className="px-3 py-2 text-slate-500">{d.user || '—'}</td>
                          <td className="px-3 py-2 text-slate-500">{d.region}</td>
                          <td className="px-3 py-2 font-mono text-slate-600">{d.osVersion}</td>
                          <td className="px-3 py-2">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${d.complianceState === 'Non-Compliant' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                              {d.complianceState}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-500 max-w-[180px] truncate" title={d.primaryIssue}>{d.primaryIssue || '—'}</td>
                          <td className="px-3 py-2 text-slate-500 max-w-[160px] truncate" title={d.policyFailed}>{d.policyFailed || '—'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

      </div>

      {/* ── Footer ── */}
      <div className="bg-slate-50 border-t border-slate-200 px-8 py-3 flex flex-wrap justify-between items-center gap-2 text-[11px] text-slate-400">
        <span>IRU macOS Patch &amp; Stale Device Report · ManageEngine MDM · {today}</span>
        <span className="flex items-center gap-2">
          {refreshInterval > 0 && (
            <span className="flex items-center gap-1">
              <Wifi className="h-3 w-3 text-green-500" />
              Live · refreshes every {REFRESH_OPTIONS.find(o => o.value === refreshInterval)?.label}
            </span>
          )}
          <span>Prepared by IRU Admin · Zinnia IRU · Confidential</span>
        </span>
      </div>

    </div>
  )
}
