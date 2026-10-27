import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Shield, HardDrive, Download, ClipboardCheck, CheckCircle, AlertTriangle, Clock,
  Globe, Monitor, Server, X, Info, Wrench, ChevronDown, RefreshCw, Search,
  FileDown, HelpCircle,
} from 'lucide-react'
import { api } from '../api'
import type { PillarDeviceList, PillarDevicesParams, PosturePillar, PosturePillarDevice, PostureSource, SecurityPostureResult } from '../api'
import { EndpointProtectionCoverage } from '../components/security/EndpointProtectionCoverage'
import { SortableHeader } from '../components/ui/SortableHeader'
import { sortRows, toggleSortDirection, type SortDirection } from '../lib/tableSorting'
import { deriveRisks, describeSegment, devicesToCsv, scoreBand, type PostureRisk, type RiskSeverity, type SegmentStatus } from '../lib/securityPosture'
import { CopyText } from '../components/ui/CopyText'

// ─── Remediation step library ──────────────────────────────────────────────────

const PILLAR_REMEDIATION: Record<string, string[]> = {
  encryption: [
    'Identify non-encrypted devices in your MDM console under Compliance → Encryption.',
    'Push a BitLocker (Windows) or FileVault (macOS) enforcement policy via Intune or ManageEngine.',
    'Set a compliance policy that marks devices without encryption as Non-Compliant.',
    'For Windows: Settings → Update & Security → Device Encryption → Turn On.',
    'For macOS: System Preferences → Privacy & Security → FileVault → Turn On.',
    'Monitor enrollment: re-scan after 48 hours and follow up with non-compliant users.',
  ],
  bitlocker: [
    'Open Intune → Devices → Configuration Policies and create a BitLocker policy.',
    'Assign the policy to the non-compliant device group.',
    'Force a device sync via Intune to apply immediately: Devices → [Device] → Sync.',
    'Verify encryption status: Get-BitLockerVolume in PowerShell on the target device.',
    'Store recovery keys in Entra ID — enable "Save BitLocker recovery key to Azure AD" in policy.',
  ],
  filevault: [
    'In ManageEngine, create or update a FileVault configuration profile and enable enforcement.',
    'Assign the profile containing the FileVault item to the device.',
    'The user will see a prompt on next login — they must enter their password to enable.',
    'Verify in ManageEngine: Devices → [Device] → Profiles → FileVault status.',
    'Escrow the recovery key: confirm personal recovery key is synced to ManageEngine.',
  ],
  edr: [
    'Open your EDR console (CrowdStrike Falcon / Microsoft Defender) and filter for inactive sensors.',
    'Re-deploy the agent via MDM push to devices with inactive status.',
    'Set a compliance policy that requires an active, up-to-date EDR agent.',
    'Review the quarantine queue for any flagged threats on recently re-activated agents.',
    'Enable real-time protection and tamper protection to prevent agent deactivation.',
  ],
  crowdstrike: [
    'In Falcon, go to Hosts → Host Management and filter Status = Reduced Functionality.',
    'Re-deploy Falcon sensor via ManageEngine (Software Repository → Managed Software) or Intune (App deployment).',
    'Verify sensor version is current — update via Sensor Update policies in Falcon.',
    'Check prevention policy assignment — ensure devices are in an enforced policy group.',
  ],
  defender: [
    'In Intune, go to Endpoint Security → Microsoft Defender for Endpoint.',
    'Review the Defender health report and identify devices with inactive protection.',
    'Push a remediation script or compliance policy to re-enable Defender.',
    'Run: Start-Service -Name WinDefend in an elevated PowerShell session if Defender was manually disabled.',
  ],
  firewall: [
    'Create or update an Endpoint Security → Firewall policy in Intune (Windows) or ManageEngine (macOS).',
    'Assign the policy to non-compliant devices.',
    'For Windows: Configure Windows Defender Firewall via Group Policy or Intune → Domain/Private/Public profiles.',
    'For macOS: Set Application Firewall to On in the ManageEngine Firewall configuration profile.',
    'Set compliance rule: Firewall must be enabled → mark devices without it as Non-Compliant.',
  ],
  patching: [
    'Open your MDM patch report and filter for devices with critical updates outstanding.',
    'Force-push critical patches immediately via Intune (Software Updates) or ManageEngine (Auto-update enforcement).',
    'For Intune (Windows): Configure Windows Update for Business → set deadline policies for critical updates.',
    'For ManageEngine (macOS): Enable macOS update enforcement in the configuration profile settings.',
    'Notify device owners whose machines require a restart to complete patching.',
    'Re-run the patch compliance report in 24 hours to confirm coverage improvement.',
  ],
  identity: [
    'Run the MFA registration report from Entra ID: Security → Authentication Methods → User Registration Details.',
    'Export the list of users without MFA enrolled and contact them directly.',
    'Create a Conditional Access policy: Require MFA → assign to All Users → exclude break-glass accounts.',
    'Set a registration campaign in Entra ID: Security → Authentication Methods → Registration Campaign.',
    'After grace period, set CA policy to Block for non-MFA-enrolled users.',
  ],
  checkin: [
    'Filter the device list by last check-in older than 7 days and group by user and platform.',
    'Ask owners of long-offline devices to connect to the network/VPN and open the Company Portal or MDM agent to sync.',
    'Force a sync from the MDM console (Intune → Devices → Sync, or ManageEngine → Devices → Scan).',
    'Retire or wipe devices that have been offline for more than 30 days and are confirmed lost or replaced.',
  ],
  compliance: [
    'Review compliance policy failures in Intune: Devices → Monitor → Device Compliance or ManageEngine: Devices → Compliance.',
    'Identify the most common failing policies and prioritize those for remediation.',
    'Force MDM check-in for devices that haven\'t synced recently: Intune → [Device] → Sync.',
    'Re-assign failed policies to the affected device groups.',
    'Consider retiring or wiping devices that have been offline for more than 30 days.',
  ],
}

function getPillarSteps(pillarId: string): string[] {
  return PILLAR_REMEDIATION[pillarId]
    ?? PILLAR_REMEDIATION[pillarId.replace(/^me_|^win|^aad|^mac|^okta|^intune/, '')]
    ?? PILLAR_REMEDIATION['compliance']
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CisControl {
  number: number
  name: string
  coverage: number
  status: 'Implemented' | 'Partial' | 'Not Started'
}

// ─── CIS Controls (org-level, shared) ─────────────────────────────────────────

const CIS_CONTROLS: CisControl[] = [
  { number: 1,  name: 'Inventory of Enterprise Assets',  coverage: 95, status: 'Implemented' },
  { number: 2,  name: 'Inventory of Software Assets',    coverage: 82, status: 'Implemented' },
  { number: 3,  name: 'Data Protection',                 coverage: 87, status: 'Implemented' },
  { number: 4,  name: 'Secure Configuration',            coverage: 79, status: 'Partial'     },
  { number: 5,  name: 'Account Management',              coverage: 89, status: 'Implemented' },
  { number: 6,  name: 'Access Control Management',       coverage: 84, status: 'Implemented' },
  { number: 7,  name: 'Continuous Vulnerability Mgmt',   coverage: 74, status: 'Partial'     },
  { number: 8,  name: 'Audit Log Management',            coverage: 96, status: 'Implemented' },
  { number: 9,  name: 'Malware Defenses',                coverage: 93, status: 'Implemented' },
  { number: 10, name: 'Security Awareness Training',     coverage: 61, status: 'Partial'     },
]

// ─── Pillar presentation ───────────────────────────────────────────────────────

const PILLAR_META: Record<PosturePillar['id'], { icon: typeof Shield; bar: string; iconBg: string; icon_c: string }> = {
  encryption: { icon: HardDrive,      bar: 'bg-emerald-500', iconBg: 'bg-emerald-100', icon_c: 'text-emerald-600' },
  patching:   { icon: Download,       bar: 'bg-amber-500',   iconBg: 'bg-amber-100',   icon_c: 'text-amber-600'   },
  compliance: { icon: ClipboardCheck, bar: 'bg-green-500',   iconBg: 'bg-green-100',   icon_c: 'text-green-600'   },
  checkin:    { icon: Clock,          bar: 'bg-orange-500',  iconBg: 'bg-orange-100',  icon_c: 'text-orange-600'  },
}

const SOURCE_TABS: { id: PostureSource; label: string; icon: typeof Globe }[] = [
  { id: 'all',          label: 'All Sources',      icon: Globe   },
  { id: 'intune',       label: 'Microsoft Intune', icon: Monitor },
  { id: 'manageengine', label: 'ManageEngine',     icon: Server  },
]

function scoreColor(score: number | null): { stroke: string; text: string; bg: string; border: string } {
  switch (scoreBand(score)) {
    case 'good': return { stroke: '#22c55e', text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' }
    case 'fair': return { stroke: '#f59e0b', text: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200'   }
    case 'poor': return { stroke: '#ef4444', text: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-200'     }
    default:     return { stroke: '#cbd5e1', text: 'text-slate-500',   bg: 'bg-slate-50',   border: 'border-slate-200'   }
  }
}

function scoreGrade(score: number | null): string {
  if (score === null) return '—'
  return score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : 'D'
}

function severityCfg(severity: RiskSeverity): { badge: string; dot: string } {
  switch (severity) {
    case 'Critical': return { badge: 'bg-red-100 border-red-200 text-red-700',         dot: 'bg-red-500'    }
    case 'High':     return { badge: 'bg-orange-100 border-orange-200 text-orange-700', dot: 'bg-orange-500' }
    case 'Medium':   return { badge: 'bg-amber-100 border-amber-200 text-amber-600',   dot: 'bg-amber-500'  }
    case 'Low':      return { badge: 'bg-slate-100 border-slate-200 text-slate-600',   dot: 'bg-slate-400'  }
  }
}

function downloadCsv(filename: string, devices: PosturePillarDevice[]): void {
  const blob = new Blob([devicesToCsv(devices)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}

const fmtTime = (iso: string): string => new Date(iso).toLocaleString()

function cisBadge(status: CisControl['status']): string {
  switch (status) {
    case 'Implemented': return 'bg-emerald-50 border-emerald-200 text-emerald-700'
    case 'Partial':     return 'bg-amber-50 border-amber-200 text-amber-600'
    case 'Not Started': return 'bg-slate-100 border-slate-200 text-slate-500'
  }
}

function cisCoverageColor(coverage: number): string {
  if (coverage >= 90) return 'bg-emerald-500'
  if (coverage >= 75) return 'bg-orange-500'
  if (coverage >= 60) return 'bg-amber-500'
  return 'bg-red-500'
}

// ─── SVG Gauge ─────────────────────────────────────────────────────────────────

function ScoreGauge({ score }: { score: number | null }) {
  const radius = 44
  const circumference = 2 * Math.PI * radius
  const { stroke, text } = scoreColor(score)
  const grade = scoreGrade(score)

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg width="120" height="120" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="10" />
          <circle
            cx="60" cy="60" r={radius} fill="none" stroke={stroke}
            strokeWidth="10" strokeLinecap="round"
            strokeDasharray={`${circumference * (score ?? 0) / 100} ${circumference}`}
            strokeDashoffset={0}
            transform="rotate(-90 60 60)"
            style={{ transition: 'stroke-dasharray 0.8s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-black ${text}`}>{score ?? 'N/A'}</span>
          <span className={`text-xs font-bold ${text} -mt-0.5`}>{grade}</span>
        </div>
      </div>
      <p className="text-xs font-semibold text-slate-700 mt-1">Security Score</p>
    </div>
  )
}

// ─── Pillar Card ───────────────────────────────────────────────────────────────

function PillarCard({ pillar, isSelected, onClick }: { pillar: PosturePillar; isSelected: boolean; onClick: () => void }) {
  const meta = PILLAR_META[pillar.id]
  const Icon = meta.icon
  const coveragePct = pillar.inScope ? Math.round((pillar.assessed / pillar.inScope) * 100) : 0

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={isSelected}
      aria-label={`${pillar.label}: ${pillar.scorePct === null ? 'no data' : `${pillar.scorePct}%`}. ${isSelected ? 'Hide' : 'Show'} details`}
      className={`text-left bg-white rounded-2xl border shadow-sm px-4 py-4 flex flex-col gap-3 transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${isSelected ? 'is-selected' : 'border-slate-200 hover:border-orange-200'}`}
    >
      <div className="flex items-start gap-2.5">
        <div className={`rounded-xl p-2 ${isSelected ? 'bg-sky-100' : meta.iconBg} flex-shrink-0 transition-colors`}>
          <Icon className={`h-4 w-4 ${isSelected ? 'text-orange-600' : meta.icon_c}`} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-800">{pillar.label}</p>
          <p className="text-[0.65rem] text-slate-400 mt-0.5">{pillar.description}</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[0.65rem] font-semibold text-slate-500">Passing</span>
          <span className="text-sm font-black text-slate-800">{pillar.scorePct === null ? 'N/A' : `${pillar.scorePct}%`}</span>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
          <div className={`h-2 rounded-full ${meta.bar} transition-all duration-700`} style={{ width: `${pillar.scorePct ?? 0}%` }} />
        </div>
      </div>

      <p className="text-[0.62rem] text-slate-500">
        {pillar.assessed.toLocaleString()} of {pillar.inScope.toLocaleString()} in-scope devices assessed
        {pillar.inScope > 0 && <span className="text-slate-400"> ({coveragePct}% coverage)</span>}
      </p>

      {pillar.topFindings.length > 0 && (
        <div className="rounded-lg bg-red-50/60 border border-red-100 px-2.5 py-1.5">
          <p className="text-[0.58rem] font-bold uppercase tracking-wide text-red-700 mb-0.5">Top missing critical patches</p>
          <ul className="space-y-0.5">
            {pillar.topFindings.slice(0, 2).map(f => (
              <li key={f.label} className="flex items-start justify-between gap-2 text-[0.62rem] text-slate-600">
                <span className="line-clamp-2 min-w-0">{f.label}</span>
                <span className="flex-shrink-0 font-semibold text-red-700">{f.devices.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-3 pt-0.5 flex-wrap">
        <div className="flex items-center gap-1">
          <CheckCircle className="h-3 w-3 text-emerald-500" />
          <span className="text-[0.68rem] font-semibold text-slate-700">{pillar.passing.toLocaleString()}</span>
          <span className="text-[0.62rem] text-slate-400">passing</span>
        </div>
        <div className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 text-red-400" />
          <span className="text-[0.68rem] font-semibold text-slate-700">{pillar.failing.toLocaleString()}</span>
          <span className="text-[0.62rem] text-slate-400">failing</span>
        </div>
        <div className="flex items-center gap-1">
          <HelpCircle className="h-3 w-3 text-slate-400" />
          <span className="text-[0.68rem] font-semibold text-slate-700">{pillar.notReported.toLocaleString()}</span>
          <span className="text-[0.62rem] text-slate-400">not reported</span>
        </div>
        <div className="ml-auto flex items-center gap-1 text-[0.6rem] text-slate-400">
          <ChevronDown className={`h-3 w-3 transition-transform ${isSelected ? 'rotate-180 text-orange-500' : ''}`} />
          {isSelected ? 'close' : 'details'}
        </div>
      </div>
    </button>
  )
}

// ─── Drill-down filter ─────────────────────────────────────────────────────────

interface Segment { platform?: string; sourceKey?: string; status?: SegmentStatus }
const DEFAULT_SEGMENT: Segment = { status: 'fail' }

const STATUS_STYLE: Record<SegmentStatus, { label: string; chip: string }> = {
  pass:    { label: 'Passing',      chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  fail:    { label: 'Failing',      chip: 'bg-red-50 text-red-700 border-red-200'             },
  unknown: { label: 'Not reported', chip: 'bg-slate-50 text-slate-500 border-slate-200'       },
}

const sameSegment = (a: Segment, b: Segment): boolean =>
  a.platform === b.platform && a.sourceKey === b.sourceKey && a.status === b.status

/** A count that opens the matching devices below. Highlights while its segment is the active one. */
function CountButton({ n, label, active, tone, onClick }: { n: number; label: string; active: boolean; tone: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={n === 0} aria-pressed={active} aria-label={label}
      className={`rounded-md px-1.5 py-0.5 font-semibold tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:cursor-default disabled:opacity-50 ${tone} ${active ? 'bg-orange-100 ring-1 ring-orange-400' : 'hover:bg-slate-100 underline decoration-dotted underline-offset-2'}`}>
      {n.toLocaleString()}
    </button>
  )
}

function BreakdownTable({ title, dimension, rows, segment, onSelect }: {
  title: string
  dimension: 'platform' | 'sourceKey'
  rows: PosturePillar['byPlatform']
  segment: Segment
  onSelect: (s: Segment) => void
}) {
  if (!rows.length) return null
  return (
    <div>
      <p className="text-[0.65rem] font-bold text-slate-700 uppercase tracking-wide mb-2">{title}</p>
      <div className="space-y-2.5">
        {rows.map(r => {
          const total = r.assessed + r.notReported
          const w = (n: number) => (total ? `${(n / total) * 100}%` : '0%')
          const target = (status?: SegmentStatus): Segment => ({ [dimension]: r.key, ...(status ? { status } : {}) })
          const isActive = (status?: SegmentStatus) => sameSegment(segment, target(status))
          const labelOf = (kind: string, n: number) => `${r.key}: ${n.toLocaleString()} ${kind} — show devices`
          return (
            <div key={r.key}>
              <div className="flex items-center justify-between gap-2 text-[0.65rem] mb-1">
                <button type="button" onClick={() => onSelect(target())} aria-pressed={isActive()}
                  aria-label={`${r.key}: show all ${total.toLocaleString()} in-scope devices`}
                  className={`font-semibold rounded-md px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${isActive() ? 'bg-orange-100 text-orange-800' : 'text-slate-700 hover:bg-slate-100'}`}>
                  {r.key}
                </button>
                <span className="text-slate-400 flex items-center gap-0.5 flex-wrap justify-end">
                  <CountButton n={r.passing} label={labelOf('passing', r.passing)} active={isActive('pass')} tone="text-emerald-600" onClick={() => onSelect(target('pass'))} />pass ·
                  <CountButton n={r.failing} label={labelOf('failing', r.failing)} active={isActive('fail')} tone="text-red-500" onClick={() => onSelect(target('fail'))} />fail ·
                  <CountButton n={r.notReported} label={labelOf('not reported', r.notReported)} active={isActive('unknown')} tone="text-slate-600" onClick={() => onSelect(target('unknown'))} />n/r
                </span>
              </div>
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100" role="img"
                aria-label={`${r.key}: ${r.passing} passing, ${r.failing} failing, ${r.notReported} not reported`}>
                <div className="bg-emerald-500" style={{ width: w(r.passing) }} />
                <div className="bg-red-400" style={{ width: w(r.failing) }} />
                <div className="bg-slate-300" style={{ width: w(r.notReported) }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Finding cell: summary + itemised findings (e.g. the missing patches) ──────

const ITEMS_COLLAPSED = 3

function FindingCell({ row }: { row: PosturePillarDevice }) {
  const [itemsVisible, setItemsVisible] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const items = row.items ?? []
  const shown = showAll ? items : items.slice(0, ITEMS_COLLAPSED)
  return (
    <div>
      <p className="text-slate-700">{row.detail}</p>
      {items.length > 0 && (
        <>
          <button type="button" onClick={() => { setItemsVisible(visible => !visible); setShowAll(false) }} aria-expanded={itemsVisible}
            className="mt-1 text-[0.65rem] font-semibold text-orange-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 rounded">
            {itemsVisible ? 'Hide missing patches' : `Show ${items.length.toLocaleString()} missing critical patch${items.length === 1 ? '' : 'es'}`}
          </button>
          {itemsVisible && <>
            <ul className="mt-1 space-y-0.5 list-disc pl-4 text-[0.65rem] text-slate-500" aria-label="Missing critical patches">
              {shown.map((it, i) => <li key={i}>{it}</li>)}
            </ul>
            {items.length > ITEMS_COLLAPSED && (
              <button type="button" onClick={() => setShowAll(open => !open)} aria-expanded={showAll}
                className="mt-0.5 text-[0.65rem] font-semibold text-orange-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 rounded">
                {showAll ? 'Show fewer' : `+${items.length - ITEMS_COLLAPSED} more`}
              </button>
            )}
          </>}
        </>
      )}
    </div>
  )
}

// ─── Pillar Detail Panel ────────────────────────────────────────────────────────

const PAGE_SIZE = 25

function PillarDetailPanel({ pillar, source, onClose }: { pillar: PosturePillar; source: PostureSource; onClose: () => void }) {
  const meta = PILLAR_META[pillar.id]
  const Icon = meta.icon
  const steps = getPillarSteps(pillar.id)
  const [segment, setSegment] = useState<Segment>(DEFAULT_SEGMENT)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState<NonNullable<PillarDevicesParams['sortKey']> | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [list, setList] = useState<PillarDeviceList | null>(null)
  const [listState, setListState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [reload, setReload] = useState(0)
  const seq = useRef(0)

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(query.trim()); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [query])

  const params = useMemo<PillarDevicesParams>(() => ({
    source, ...segment, q: debounced, page, pageSize: PAGE_SIZE,
    ...(sortKey ? { sortKey, sortDir: sortDirection } : {}),
  }), [source, segment, debounced, page, sortKey, sortDirection])

  useEffect(() => {
    const mine = ++seq.current
    api.fetchPillarDevices(pillar.id, params)
      .then(r => { if (mine === seq.current) { setList(r); setListState('ready') } })
      .catch(() => { if (mine === seq.current) setListState('error') })
  }, [pillar.id, params, reload])

  const select = (next: Segment) => { setListState('loading'); setSegment(next); setPage(1) }
  const handleSort = (key: string) => {
    setListState('loading')
    setSortDirection(dir => toggleSortDirection(sortKey, dir, key))
    setSortKey(key as NonNullable<PillarDevicesParams['sortKey']>)
    setPage(1)
  }
  const exportCsv = async () => {
    try {
      const all = await api.fetchPillarDevices(pillar.id, { ...params, page: 1, pageSize: 5000 })
      downloadCsv(`security-posture-${pillar.id}-${segment.status ?? 'all'}.csv`, all.rows)
    } catch { setListState('error') }
  }
  const th = 'px-3 py-2 text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide'
  const isDefault = sameSegment(segment, DEFAULT_SEGMENT)
  const statusTile = (status: SegmentStatus, n: number, tone: string) => (
    <button type="button" onClick={() => select({ ...(segment.platform ? { platform: segment.platform } : {}), ...(segment.sourceKey ? { sourceKey: segment.sourceKey } : {}), status })}
      aria-pressed={segment.status === status} disabled={n === 0} aria-label={`Show ${n.toLocaleString()} ${STATUS_STYLE[status].label.toLowerCase()} devices`}
      className={`rounded-xl border px-3 py-2.5 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:opacity-60 ${tone} ${segment.status === status ? 'ring-2 ring-orange-400' : 'hover:shadow-sm'}`}>
      <p className="text-lg font-black">{n.toLocaleString()}</p>
      <p className="text-[0.58rem] font-medium opacity-70">{STATUS_STYLE[status].label}</p>
    </button>
  )

  return (
    <section aria-label={`${pillar.label} details`} className="bg-white rounded-2xl border border-orange-200 shadow-md overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 bg-orange-50 border-b border-orange-100">
        <div className="flex items-center gap-2.5">
          <div className={`rounded-xl p-2 ${meta.iconBg}`}><Icon className={`h-4 w-4 ${meta.icon_c}`} /></div>
          <div>
            <p className="text-sm font-bold text-slate-800">{pillar.label}</p>
            <p className="text-[0.62rem] text-slate-500">{pillar.description} · Scope: {pillar.scope}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label={`Close ${pillar.label} details`}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-orange-100 hover:text-slate-600 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-5 space-y-5">
        {pillar.unavailableReason && (
          <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
            <Info className="h-3.5 w-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-[0.68rem] text-amber-800">{pillar.unavailableReason}</p>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-center">
            <p className="text-lg font-black text-slate-800">{pillar.scorePct === null ? 'N/A' : `${pillar.scorePct}%`}</p>
            <p className="text-[0.58rem] text-slate-400 font-medium">Passing (of assessed)</p>
          </div>
          {statusTile('pass', pillar.passing, 'border-emerald-100 bg-emerald-50 text-emerald-600')}
          {statusTile('fail', pillar.failing, 'border-red-100 bg-red-50 text-red-600')}
          {statusTile('unknown', pillar.notReported, 'border-slate-200 bg-white text-slate-600')}
        </div>
        <p className="text-[0.65rem] text-slate-500 -mt-2">
          Only the {pillar.assessed.toLocaleString()} devices that report this signal are scored. The {pillar.notReported.toLocaleString()} "not reported" devices are never counted as passing or failing. Click any number to see those devices below.
        </p>

        {pillar.topFindings.length > 0 && (
          <div>
            <p className="text-[0.65rem] font-bold text-slate-700 uppercase tracking-wide mb-2">Most common missing critical patches</p>
            <ul className="space-y-1">
              {pillar.topFindings.map(f => (
                <li key={f.label}>
                  <button type="button" onClick={() => { setQuery(f.label); setDebounced(f.label); select({ status: 'fail' }) }}
                    aria-label={`${f.label} — missing on ${f.devices.toLocaleString()} devices — show devices`}
                    className="w-full flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-1.5 text-left text-xs hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">
                    <span className="text-slate-700 min-w-0 break-words">{f.label}</span>
                    <span className="flex-shrink-0 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[0.62rem] font-bold text-red-700">{f.devices.toLocaleString()} devices</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <BreakdownTable title="By platform" dimension="platform" rows={pillar.byPlatform} segment={segment} onSelect={select} />
          <BreakdownTable title="By management source" dimension="sourceKey" rows={pillar.bySource} segment={segment} onSelect={select} />
        </div>

        {/* Devices for the active segment */}
        <div aria-live="polite">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <p className="text-[0.65rem] font-bold text-slate-700 uppercase tracking-wide">
              Showing: <span className="text-orange-700 normal-case">{describeSegment(segment)}</span>
              {list && <span className="text-slate-400 normal-case font-semibold"> — {list.total.toLocaleString()} device{list.total === 1 ? '' : 's'}</span>}
            </p>
            {!isDefault && (
              <button type="button" onClick={() => { setQuery(''); setDebounced(''); select(DEFAULT_SEGMENT) }}
                className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[0.62rem] font-semibold text-orange-700 hover:bg-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">
                Reset filter
              </button>
            )}
            <label className="relative ml-auto">
              <span className="sr-only">Search devices</span>
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
              <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search device, user, serial, patch…"
                className="rounded-lg border border-slate-200 py-1 pl-7 pr-2 text-xs w-60 focus:outline-none focus:ring-2 focus:ring-orange-300" />
            </label>
            <button type="button" disabled={!list?.total} onClick={exportCsv}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">
              <FileDown className="h-3 w-3" />Export CSV
            </button>
          </div>

          {listState === 'error' ? (
            <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-xs text-red-700">The device list could not be loaded.</p>
              <button type="button" onClick={() => { setListState('loading'); setReload(n => n + 1) }}
                className="rounded-lg border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100">Retry</button>
            </div>
          ) : listState === 'loading' && !list ? (
            <div aria-busy="true" className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-9 animate-pulse rounded-lg bg-slate-100" />)}</div>
          ) : list && list.total === 0 ? (
            <p role="status" className={`rounded-xl border px-4 py-3 text-xs ${segment.status === 'fail' && !debounced ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
              {segment.status === 'fail' && !debounced && isDefault ? 'No failing devices — every assessed device passes this check.' : 'No devices match this filter.'}
            </p>
          ) : list && (
            <div className={`overflow-x-auto rounded-xl border border-slate-100 transition-opacity ${listState === 'loading' ? 'opacity-60' : ''}`}>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <SortableHeader label="Device" sortKey="deviceName" activeSortKey={sortKey ?? null} direction={sortDirection} onSort={handleSort} className={th} />
                    <SortableHeader label="User" sortKey="user" activeSortKey={sortKey ?? null} direction={sortDirection} onSort={handleSort} className={th} />
                    <SortableHeader label="Platform" sortKey="platform" activeSortKey={sortKey ?? null} direction={sortDirection} onSort={handleSort} className={th} />
                    <SortableHeader label="Source" sortKey="source" activeSortKey={sortKey ?? null} direction={sortDirection} onSort={handleSort} className={th} />
                    <th className={th}>Status</th>
                    <SortableHeader label="Finding" sortKey="detail" activeSortKey={sortKey ?? null} direction={sortDirection} onSort={handleSort} className={th} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.rows.map(d => (
                    <tr key={d.id} className="align-top hover:bg-slate-50/60">
                      <td className="px-3 py-2 font-semibold text-slate-700"><CopyText value={d.deviceName} label="Device name">{d.deviceName}</CopyText></td>
                      <td className="px-3 py-2 text-slate-500"><CopyText value={d.user} label="User">{d.user}</CopyText></td>
                      <td className="px-3 py-2 text-slate-500">{d.platform}</td>
                      <td className="px-3 py-2 text-slate-500">{d.source}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${STATUS_STYLE[d.status].chip}`}>{STATUS_STYLE[d.status].label}</span>
                      </td>
                      <td className="px-3 py-2"><FindingCell row={d} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {list && list.totalPages > 1 && (
            <div className="mt-2 flex items-center justify-end gap-2 text-xs text-slate-500">
              <button type="button" disabled={list.page <= 1} onClick={() => { setListState('loading'); setPage(list.page - 1) }}
                className="rounded-lg border border-slate-200 px-2.5 py-1 font-semibold hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">Previous</button>
              <span>Page {list.page} of {list.totalPages}</span>
              <button type="button" disabled={list.page >= list.totalPages} onClick={() => { setListState('loading'); setPage(list.page + 1) }}
                className="rounded-lg border border-slate-200 px-2.5 py-1 font-semibold hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">Next</button>
            </div>
          )}
        </div>

        {/* Remediation */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Wrench className="h-3.5 w-3.5 text-orange-500" />
            <p className="text-[0.65rem] font-bold text-slate-700 uppercase tracking-wide">Remediation Steps</p>
          </div>
          <ol className="space-y-1.5">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="flex-shrink-0 h-4 w-4 rounded-full bg-orange-100 text-orange-700 text-[0.55rem] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                <p className="text-[0.65rem] text-slate-600 leading-snug">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function SecurityPosturePage() {
  const [controlSortKey, setControlSortKey] = useState<string | null>(null)
  const [controlSortDirection, setControlSortDirection] = useState<SortDirection>('asc')
  const sortedControls = controlSortKey ? sortRows(CIS_CONTROLS, control => {
    switch (controlSortKey) {
      case 'number': return Number(control.number)
      case 'name': return control.name
      case 'coverage': return control.coverage
      case 'status': return control.status
      default: return ''
    }
  }, controlSortDirection) : CIS_CONTROLS
  const handleControlSort = (key: string) => {
    setControlSortDirection(direction => toggleSortDirection(controlSortKey, direction, key))
    setControlSortKey(key)
  }

  const [activeSource, setActiveSource] = useState<PostureSource>('all')
  const [data, setData] = useState<SecurityPostureResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<PosturePillar['id'] | null>(null)
  const [expandedRisk, setExpandedRisk] = useState<PosturePillar['id'] | null>(null)
  const detailRef = useRef<HTMLDivElement>(null)
  const requestSeq = useRef(0)

  const load = useCallback((source: PostureSource, refresh: boolean) => {
    const seq = ++requestSeq.current
    api.fetchSecurityPosture(source, refresh)
      .then(r => { if (seq === requestSeq.current) { setData(r); setError(null) } })
      .catch(() => { if (seq === requestSeq.current) setError('Security posture data could not be loaded.') })
      .finally(() => { if (seq === requestSeq.current) setLoading(false) })
  }, [])

  useEffect(() => { load(activeSource, false) }, [activeSource, load])

  const changeSource = (s: PostureSource) => {
    if (s === activeSource) return
    setLoading(true); setSelectedId(null); setExpandedRisk(null); setActiveSource(s)
  }
  const refresh = () => { setLoading(true); load(activeSource, true) }

  const pillars = useMemo(() => data?.pillars ?? [], [data])
  const selected = pillars.find(p => p.id === selectedId) ?? null
  const risks: PostureRisk[] = useMemo(() => deriveRisks(pillars), [pillars])
  const overall = data?.overall.score ?? null
  const { text: scoreText, bg: scoreBg, border: scoreBorder } = scoreColor(overall)
  const needAttention = pillars.filter(p => p.scorePct !== null && p.scorePct < 70).length
  const failingChecks = pillars.reduce((n, p) => n + p.failing, 0)
  const notReportedChecks = pillars.reduce((n, p) => n + p.notReported, 0)

  const selectPillar = (id: PosturePillar['id']) => {
    setSelectedId(cur => (cur === id ? null : id))
  }
  const viewDevices = (id: PosturePillar['id']) => {
    setSelectedId(id)
    requestAnimationFrame(() => detailRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <div className="flex flex-col gap-5 w-full">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-orange-100 p-2.5 flex-shrink-0">
            <Shield className="h-6 w-6 text-orange-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Security Posture</h1>
            <p className="mt-0.5 text-sm text-slate-500">Live security health computed from your connected MDM sources</p>
          </div>
        </div>
        <button type="button" onClick={refresh} disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh
        </button>
      </div>

      {/* ── How to read this page ── */}
      <div className="flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
        <Info className="h-4 w-4 text-sky-600 flex-shrink-0 mt-0.5" />
        <p className="text-[0.68rem] text-sky-900 leading-snug">
          <span className="font-bold">Live data.</span> Each tile scores only the devices that actually report that signal; devices that don't are shown as <em>not reported</em>, never as passing or failing. Click a tile to see the failing devices behind it. Firewall, EDR and MFA signals are not returned by the connected device APIs — endpoint protection coverage is shown separately below.
        </p>
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-xs text-red-700">{error}</p>
          <button type="button" onClick={refresh} className="rounded-lg border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100">Retry</button>
        </div>
      )}

      {/* ── MDM Source Tabs ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3">
        <p className="text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide mb-2.5">Filter by MDM Source</p>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="MDM source">
          {SOURCE_TABS.map(tab => {
            const Icon = tab.icon
            const active = activeSource === tab.id
            const count = !data ? null : tab.id === 'all' ? data.sourceCounts.intune + data.sourceCounts.manageengine : data.sourceCounts[tab.id]
            return (
              <button key={tab.id} type="button" role="tab" aria-selected={active} onClick={() => changeSource(tab.id)}
                className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${active ? 'border-orange-400 bg-orange-50 text-orange-700 shadow-sm' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
                <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                <span>{tab.label}</span>
                {count !== null && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold ${active ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>{count.toLocaleString()}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Row 1: Score card + mini stats ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" aria-busy={loading}>
        <div className={`bg-white rounded-2xl border ${scoreBorder} shadow-sm px-6 py-5 flex flex-col items-center gap-4`}>
          <ScoreGauge score={overall} />
          <div className={`w-full rounded-xl ${scoreBg} border ${scoreBorder} px-4 py-2.5 flex items-center gap-2`}>
            <Clock className={`h-3.5 w-3.5 ${scoreText} flex-shrink-0`} />
            <div>
              <p className="text-[0.6rem] font-semibold text-slate-500 uppercase tracking-wide">Last Assessed</p>
              <p className={`text-[0.72rem] font-bold ${scoreText}`}>{data ? fmtTime(data.generatedAt) : loading ? 'Loading…' : '—'}</p>
            </div>
          </div>
          <div className="w-full grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-center">
              <p className="text-xs font-black text-slate-800">{data ? data.deviceCount.toLocaleString() : '—'}</p>
              <p className="text-[0.6rem] text-slate-400 font-medium">Total Devices</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-center">
              <p className="text-xs font-black text-slate-800">{scoreGrade(overall)}</p>
              <p className="text-[0.6rem] text-slate-400 font-medium">Letter Grade</p>
            </div>
          </div>
          {data && (
            <p className="text-[0.6rem] text-slate-400 text-center">
              Weighted average of {data.overall.assessedPillars} of {data.overall.totalPillars} pillars that could be assessed
            </p>
          )}
        </div>

        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-red-200 shadow-sm px-4 py-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-red-100 p-2"><AlertTriangle className="h-4 w-4 text-red-600" /></div>
              <p className="text-xs font-semibold text-slate-600">Pillars Below 70%</p>
            </div>
            <p className="text-3xl font-black text-red-600">{needAttention}</p>
            <p className="text-[0.65rem] text-slate-400">Need attention</p>
          </div>
          <div className="bg-white rounded-2xl border border-orange-200 shadow-sm px-4 py-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-orange-100 p-2"><Shield className="h-4 w-4 text-orange-600" /></div>
              <p className="text-xs font-semibold text-slate-600">Failing Checks</p>
            </div>
            <p className="text-3xl font-black text-orange-600">{failingChecks.toLocaleString()}</p>
            <p className="text-[0.65rem] text-slate-400">Across pillars — a device can fail several</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-slate-100 p-2"><HelpCircle className="h-4 w-4 text-slate-500" /></div>
              <p className="text-xs font-semibold text-slate-600">Not Reported</p>
            </div>
            <p className="text-3xl font-black text-slate-600">{notReportedChecks.toLocaleString()}</p>
            <p className="text-[0.65rem] text-slate-400">Device checks with no data from the source</p>
          </div>

          <div className="sm:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3">
            <p className="text-[0.65rem] font-semibold text-slate-500 uppercase tracking-wide mb-3">Pillar Health Overview</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              {pillars.map(p => (
                <button key={p.id} type="button" onClick={() => viewDevices(p.id)} aria-label={`Open ${p.label} details`}
                  className="flex items-center gap-2 rounded-lg text-left hover:bg-slate-50 px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">
                  <span className="text-[0.62rem] font-semibold text-slate-500 w-28 shrink-0 truncate">{p.label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-1.5 rounded-full ${PILLAR_META[p.id].bar}`} style={{ width: `${p.scorePct ?? 0}%` }} />
                  </div>
                  <span className={`text-[0.62rem] font-bold w-9 text-right ${PILLAR_META[p.id].icon_c}`}>{p.scorePct === null ? 'N/A' : `${p.scorePct}%`}</span>
                </button>
              ))}
              {!pillars.length && <p className="text-xs text-slate-400">{loading ? 'Loading pillars…' : 'No pillar data.'}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 2: pillar cards + detail ── */}
      <div className="space-y-4" ref={detailRef}>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {loading && !pillars.length
            ? [0, 1, 2, 3].map(i => <div key={i} className="h-44 animate-pulse rounded-2xl bg-slate-100" aria-hidden />)
            : pillars.map(pillar => (
                <PillarCard key={pillar.id} pillar={pillar} isSelected={selectedId === pillar.id} onClick={() => selectPillar(pillar.id)} />
              ))}
        </div>
        {selected && <PillarDetailPanel key={`${activeSource}-${selected.id}`} pillar={selected} source={activeSource} onClose={() => setSelectedId(null)} />}
      </div>

      {/* ── Endpoint Protection Coverage (live — Falcon/Zscaler on physical Windows & macOS devices) ── */}
      <EndpointProtectionCoverage />

      {/* ── Row 3: Top Risks + CIS Controls ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

        {/* Top Risks */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Top Risks</h2>
              <p className="text-[0.65rem] text-slate-400 mt-0.5">
                Derived from the live pillars{activeSource === 'all' ? '' : ` for ${SOURCE_TABS.find(t => t.id === activeSource)?.label}`}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2.5 py-1 text-[0.65rem] font-bold text-red-600">
              <AlertTriangle className="h-2.5 w-2.5" />
              {risks.length} active
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {!risks.length && <p className="px-5 py-4 text-xs text-slate-400">{loading ? 'Loading…' : 'No failing devices found in the assessed pillars.'}</p>}
            {risks.map(risk => {
              const sc = severityCfg(risk.severity)
              const isExpanded = expandedRisk === risk.pillarId
              const steps = getPillarSteps(risk.pillarId)
              return (
                <div key={risk.pillarId}>
                  <button type="button" onClick={() => setExpandedRisk(isExpanded ? null : risk.pillarId)} aria-expanded={isExpanded}
                    className={`w-full flex items-start gap-3 px-5 py-3.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-400 ${isExpanded ? 'bg-orange-50/60' : 'hover:bg-slate-50/60'}`}>
                    <span className={`flex-shrink-0 mt-1.5 h-2 w-2 rounded-full ${sc.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${sc.badge}`}>{risk.severity}</span>
                        <span className="text-[0.62rem] text-slate-400">{pillars.find(p => p.id === risk.pillarId)?.label}</span>
                      </div>
                      <p className="text-xs text-slate-700 font-medium leading-snug">{risk.title}</p>
                    </div>
                    <ChevronDown className={`flex-shrink-0 h-3.5 w-3.5 text-slate-400 mt-1 transition-transform ${isExpanded ? 'rotate-180 text-orange-500' : ''}`} />
                  </button>
                  {isExpanded && (
                    <div className="px-5 pb-4 bg-orange-50/40 border-t border-orange-100">
                      <div className="pt-3 flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5">
                          <Wrench className="h-3 w-3 text-orange-500" />
                          <p className="text-[0.6rem] font-bold text-slate-600 uppercase tracking-wide">Recommended Remediation</p>
                        </div>
                        <button type="button" onClick={() => viewDevices(risk.pillarId)}
                          className="rounded-lg border border-orange-200 bg-white px-2.5 py-1 text-[0.65rem] font-semibold text-orange-700 hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">
                          View {risk.count.toLocaleString()} devices
                        </button>
                      </div>
                      <ol className="space-y-1.5">
                        {steps.slice(0, 4).map((step, j) => (
                          <li key={j} className="flex items-start gap-2">
                            <span className="flex-shrink-0 h-4 w-4 rounded-full bg-orange-100 text-orange-700 text-[0.55rem] font-bold flex items-center justify-center mt-0.5">{j + 1}</span>
                            <p className="text-[0.65rem] text-slate-600 leading-snug">{step}</p>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* CIS Controls Coverage */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800">CIS Controls Coverage</h2>
              <p className="text-[0.65rem] text-slate-400 mt-0.5">Static reference values — not calculated from your fleet</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Implemented
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[0.6rem] font-bold text-amber-600">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Partial
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <SortableHeader label="#" sortKey="number" activeSortKey={controlSortKey} direction={controlSortDirection} onSort={handleControlSort} className="px-4 py-2.5 text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide w-10" />
                  <SortableHeader label="Control Name" sortKey="name" activeSortKey={controlSortKey} direction={controlSortDirection} onSort={handleControlSort} className="px-3 py-2.5 text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide" />
                  <SortableHeader label="Coverage" sortKey="coverage" activeSortKey={controlSortKey} direction={controlSortDirection} onSort={handleControlSort} className="px-3 py-2.5 text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide w-28" />
                  <SortableHeader label="Status" sortKey="status" activeSortKey={controlSortKey} direction={controlSortDirection} onSort={handleControlSort} className="px-4 py-2.5 text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedControls.map(ctrl => (
                  <tr key={ctrl.number} className="hover:bg-slate-50/60 transition">
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center justify-center h-5 w-5 rounded-lg bg-slate-100 text-[0.62rem] font-bold text-slate-600">
                        {ctrl.number}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs font-medium text-slate-700">{ctrl.name}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className={`h-1.5 rounded-full ${cisCoverageColor(ctrl.coverage)}`} style={{ width: `${ctrl.coverage}%` }} />
                        </div>
                        <span className="text-[0.65rem] font-bold text-slate-600 w-8 text-right">{ctrl.coverage}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${cisBadge(ctrl.status)}`}>
                        {ctrl.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  )
}
