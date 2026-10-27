import { useState, useEffect } from 'react'
import {
  ArrowLeft, Monitor, Laptop, Globe, Shield, ShieldCheck,
  Network, Lock, LockOpen, CheckCircle2,
  AlertTriangle, XCircle, Building2, RefreshCw,
  Server, Fingerprint, Package,
  Key, RotateCcw, Clock, AlertCircle, Loader, Search,
} from 'lucide-react'
import { api } from '../../api'
import { CopyText } from '../ui/CopyText'
import type { ApiDevice, AppStatus, ManageEngineDeviceProfileSnapshot } from '../../api'

type Tab = 'overview' | 'hardware' | 'network' | 'security' | 'apps' | 'compliance'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview',   label: 'Overview'   },
  { id: 'hardware',   label: 'Hardware'   },
  { id: 'network',    label: 'Network'    },
  { id: 'security',   label: 'Security'   },
  { id: 'apps',       label: 'Apps'       },
  { id: 'compliance', label: 'Compliance' },
]

interface Props {
  device: ApiDevice
  onBack: () => void
  backLabel?: string
  initialTab?: Tab
}

// ── Atoms ──────────────────────────────────────────────────────────────────

function PlatformIcon({ p, size = 'md' }: { p: string; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'h-8 w-8' : size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5'
  if (p === 'Windows') return <Monitor className={`${cls} text-orange-500`} />
  if (p === 'macOS')   return <Laptop  className={`${cls} text-lime-500`} />
  return                      <Globe   className={`${cls} text-emerald-500`} />
}

function ComplianceBadge({ state }: { state: string }) {
  if (state === 'Compliant')
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-sm font-semibold text-emerald-700">
        <CheckCircle2 className="h-4 w-4" /> Compliant
      </span>
    )
  if (state === 'Warning')
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-sm font-semibold text-amber-700">
        <AlertTriangle className="h-4 w-4" /> Warning
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 border border-red-200 px-3 py-1 text-sm font-semibold text-red-700">
      <XCircle className="h-4 w-4" /> Non-Compliant
    </span>
  )
}

function SourcePill({ src }: { src: string }) {
  if (src === 'Microsoft Intune')
    return <span className="inline-flex rounded-full bg-orange-50 border border-orange-200 px-2.5 py-0.5 text-xs font-semibold text-orange-700">Microsoft Intune</span>
  return   <span className="inline-flex rounded-full bg-orange-50 border border-orange-200 px-2.5 py-0.5 text-xs font-semibold text-orange-700">ManageEngine</span>
}

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${ok ? 'text-emerald-700' : 'text-red-600'}`}>
      <span className={`h-2 w-2 rounded-full ${ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
      {label}
    </span>
  )
}

function stalenessDays(lastCheckIn: string): number {
  const s = lastCheckIn.toLowerCase()
  if (!s || s.includes('just') || s.includes('min') || s.includes('hour') || s.includes('today') || s.includes('added')) return 0
  if (s.includes('yesterday') || s === '1 day ago') return 1
  const dayM = s.match(/(\d+)\s*day/);   if (dayM)  return parseInt(dayM[1])
  const weekM = s.match(/(\d+)\s*week/); if (weekM) return parseInt(weekM[1]) * 7
  if (s.includes('week'))  return 7
  const monM = s.match(/(\d+)\s*month/); if (monM)  return parseInt(monM[1]) * 30
  if (s.includes('month')) return 30
  const parsed = new Date(lastCheckIn)
  if (!isNaN(parsed.getTime())) return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86400000))
  return 0
}

function CheckInBadge({ days }: { days: number }) {
  const label = days === 0 ? 'Today' : days === 1 ? '1d ago' : `${days}d ago`
  const cls = days === 0
    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
    : days <= 2
    ? 'bg-lime-50 border-lime-200 text-lime-700'
    : days <= 6
    ? 'bg-amber-50 border-amber-200 text-amber-700'
    : 'bg-red-50 border-red-200 text-red-600'
  return <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[0.58rem] font-bold ${cls}`}>{label}</span>
}

function Field({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value || value === 'N/A' || value === 'Unknown') return null
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</p>
      <CopyText value={value} label={label} className={`text-sm text-slate-800 ${mono ? 'font-mono' : 'font-medium'}`} />
    </div>
  )
}

function BoolField({ label, value }: { label: string; value?: boolean | null }) {
  if (value === undefined || value === null) return null
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</p>
      <StatusDot ok={value} label={value ? 'Yes' : 'No'} />
    </div>
  )
}

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
        <span className="text-slate-500">{icon}</span>
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 p-4">
        {children}
      </div>
    </div>
  )
}

// ── App status icon + pill ─────────────────────────────────────────────────

function AppStatusPill({ status }: { status: AppStatus['status'] }) {
  if (status === 'Installed')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="h-3 w-3" /> Installed
      </span>
    )
  if (status === 'Failed')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-xs font-semibold text-red-700">
        <XCircle className="h-3 w-3" /> Failed
      </span>
    )
  if (status === 'Pending')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-700">
        <Loader className="h-3 w-3" /> Pending
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500">
      N/A
    </span>
  )
}

// ── Overview Tab ──────────────────────────────────────────────────────────

function OverviewTab({ d }: { d: ApiDevice }) {
  return (
    <div className="space-y-3">
      <SectionCard title="Identity & Enrollment" icon={<Server className="h-4 w-4" />}>
        <Field label="Primary User" value={d.user} />
        <Field label="Department" value={d.department} />
        <Field label="Ownership" value={d.ownership} />
        <Field label="MDM Enrollment" value={d.managementSource === 'ManageEngine' ? 'Enrolled (active)' : 'Managed'} />
        <Field label="Serial Number" value={d.serialNumber} mono />
        <Field label="Enrollment Type" value={d.enrollmentType} />
        <Field label="Enrollment Date" value={d.enrollmentDate} />
        <BoolField label="Azure AD Registered" value={d.isAadRegistered} />
      </SectionCard>

      <SectionCard title="Device Status" icon={<Server className="h-4 w-4" />}>
        {d.lastCheckIn && (
          <div className="flex flex-col gap-0.5">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Last Check-in</p>
            <p className="text-sm font-medium text-slate-800">{d.lastCheckIn}</p>
            <CheckInBadge days={stalenessDays(d.lastCheckIn)} />
          </div>
        )}
        {d.lastComplianceCheck && (
          <div className="flex flex-col gap-0.5">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Last Compliance Check</p>
            <p className="text-sm font-medium text-slate-800">{d.lastComplianceCheck}</p>
            <CheckInBadge days={stalenessDays(d.lastComplianceCheck)} />
          </div>
        )}
        <Field label="OS Version" value={d.osVersion} />
        <Field label="OS Build" value={d.osBuildNumber} mono />
      </SectionCard>

      {d.primaryIssue && d.primaryIssue !== 'None' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-800">Issue Detected</p>
              <p className="text-sm text-red-700 mt-0.5">{d.primaryIssue}</p>
              {d.policyFailed && d.policyFailed !== 'None' && (
                <p className="text-xs text-red-500 mt-1">Policy: {d.policyFailed}</p>
              )}
              <div className="flex flex-wrap gap-4 mt-2 text-xs text-red-600">
                {d.firstDetected && d.firstDetected !== 'N/A' && <span>First detected: {d.firstDetected}</span>}
                <span>Last seen: {d.lastDetected}</span>
                <span>Confidence: {d.confidence}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Hardware Tab ──────────────────────────────────────────────────────────

function HardwareTab({ d }: { d: ApiDevice }) {
  const storageUsed = d.totalStorage && d.freeStorage
    ? `${d.freeStorage} free of ${d.totalStorage}`
    : d.totalStorage ?? undefined

  return (
    <div className="space-y-3">
      <SectionCard title="Device Hardware" icon={<Monitor className="h-4 w-4" />}>
        <Field label="Manufacturer" value={d.manufacturer} />
        <Field label="Model" value={d.model} />
        <Field label="Processor" value={d.processor} />
        <Field label="Architecture" value={d.architecture} />
        <Field label="Memory (RAM)" value={d.totalMemory} />
        <Field label="Storage" value={storageUsed} />
      </SectionCard>

      <SectionCard title="Operating System" icon={<Monitor className="h-4 w-4" />}>
        <Field label="Platform" value={d.platform} />
        <Field label="OS Version" value={d.osVersion} />
        <Field label="OS Build Number" value={d.osBuildNumber} mono />
      </SectionCard>
    </div>
  )
}

// ── Network Tab ───────────────────────────────────────────────────────────

function NetworkTab({ d }: { d: ApiDevice }) {
  return (
    <SectionCard title="Network Interfaces" icon={<Network className="h-4 w-4" />}>
      <Field label="IP Address (v4)" value={d.ipAddress} mono />
      <div />
      <Field label="Ethernet MAC" value={d.macAddress} mono />
      <Field label="Wi-Fi MAC" value={d.wifiMacAddress} mono />
    </SectionCard>
  )
}

// ── Security Tab ──────────────────────────────────────────────────────────

function SecurityTab({ d }: { d: ApiDevice }) {
  const encOk = /encrypt|on|luks|enabled/i.test(d.encryptionStatus) && !/off|pending|not /i.test(d.encryptionStatus)
  const fwOk  = d.firewallStatus?.toLowerCase() === 'enabled'
  const avOk  = d.antivirusStatus?.toLowerCase() === 'active'
  const sbOk  = d.secureBoot?.toLowerCase() === 'enabled'
  const laps  = d.laps

  return (
    <div className="space-y-3">
      {/* Security posture */}
      <SectionCard title="Security Posture" icon={<Shield className="h-4 w-4" />}>
        <div className="col-span-2 grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-0.5">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Encryption</p>
            <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${encOk ? 'text-emerald-700' : 'text-red-600'}`}>
              {encOk ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
              {d.encryptionStatus}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Firewall</p>
            <StatusDot ok={!!fwOk} label={d.firewallStatus ?? '—'} />
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Antivirus / EDR</p>
            <StatusDot ok={!!avOk} label={d.antivirusStatus ?? '—'} />
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Secure Boot</p>
            {d.secureBoot === 'Not Applicable'
              ? <span className="text-sm text-slate-400 font-medium">Not Applicable</span>
              : <StatusDot ok={!!sbOk} label={d.secureBoot ?? '—'} />}
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">TPM Version</p>
            <p className="text-sm font-medium text-slate-800">{d.tpmVersion ?? '—'}</p>
          </div>
        </div>
      </SectionCard>

      {/* LAPS */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
          <Key className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700">Local Administrator Password (LAPS)</h3>
          {laps && (
            <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${laps.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {laps.enabled ? 'Enabled' : 'Disabled'}
            </span>
          )}
        </div>

        {!laps ? (
          <div className="flex items-center gap-3 px-4 py-3">
            <AlertCircle className="h-5 w-5 text-slate-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-slate-600">LAPS status not available</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {d.managementSource === 'Microsoft Intune'
                  ? 'Reading Windows LAPS from Microsoft Graph requires delegated (signed-in-user) permissions this backend doesn\'t use yet — it only makes app-only requests.'
                  : 'No LAPS data source is connected for this device.'}
              </p>
            </div>
          </div>
        ) : !laps.enabled ? (
          <div className="flex items-center gap-3 px-4 py-3">
            <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-700">LAPS not configured</p>
              <p className="text-xs text-slate-400 mt-0.5">{laps.source ?? 'Local admin password is not managed'}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 p-4">
            <div className="flex flex-col gap-0.5">
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Source</p>
              <p className="text-sm font-medium text-slate-800">{laps.source}</p>
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Account Name</p>
              <p className="text-sm font-mono font-medium text-slate-800">{laps.accountName}</p>
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Last Rotation</p>
              <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-700">
                <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
                {laps.passwordLastRotated ?? '—'}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Password Expires</p>
              <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-700">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                {laps.passwordExpiresAt ?? '—'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── App type badge ─────────────────────────────────────────────────────────

function AppTypeBadge({ type }: { type?: string }) {
  if (!type) return null
  const [bg, text] =
    type === 'App Store'    ? ['bg-orange-50 border-orange-200 text-orange-700', ''] :
    type === 'System'       ? ['bg-slate-100 border-slate-200 text-slate-500', ''] :
    type === 'MDM Managed'  ? ['bg-lime-50 border-lime-200 text-lime-700', ''] :
    ['bg-slate-50 border-slate-200 text-slate-500', '']
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${bg} ${text}`}>
      {type}
    </span>
  )
}

// ── Apps Tab ──────────────────────────────────────────────────────────────

function AppsTab({ d }: { d: ApiDevice }) {
  const [filter, setFilter] = useState<'all' | 'installed' | 'failed' | 'pending'>('all')
  const [fetchedApps, setFetchedApps] = useState<AppStatus[] | null>(null)
  const [appsLoading, setAppsLoading] = useState(false)
  const [search, setSearch] = useState('')

  // Lazy-fetch from server — the endpoint returns what's available for the
  // device's management source (mock data or live API).
  // Only skip if the device already has app data bundled in the sync payload.
  useEffect(() => {
    if (d.apps && d.apps.length > 0) return   // already have data — no round-trip needed
    setAppsLoading(true)
    api.fetchDeviceApps(d.id)
      .then(apps => setFetchedApps(apps.length > 0 ? apps : null))
      .catch(() => setFetchedApps(null))
      .finally(() => setAppsLoading(false))
  }, [d.id])

  // fetchedApps=null means "fetch returned nothing useful", fall back to bundled data
  const allApps = fetchedApps ?? d.apps ?? []
  // Only show apps actively assigned to or installed on this device/user
  const apps      = allApps.filter(a => a.status !== 'NotApplicable')
  const installed = apps.filter(a => a.status === 'Installed')
  const failed    = apps.filter(a => a.status === 'Failed')
  const pending   = apps.filter(a => a.status === 'Pending')

  const q = search.trim().toLowerCase()
  const matchesSearch = (a: AppStatus) =>
    !q ||
    a.name.toLowerCase().includes(q) ||
    (a.publisher ?? '').toLowerCase().includes(q)

  if (appsLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-400">
        <RefreshCw className="h-8 w-8 text-slate-300 animate-spin" />
        <p className="text-sm font-medium">Loading installed applications…</p>
      </div>
    )
  }

  if (apps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-slate-400">
        <Package className="h-10 w-10 text-slate-200" />
        <p className="text-sm font-medium">No application data available</p>
        <p className="text-xs">App inventory is populated on device sync</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Summary strip + search */}
      <div className="flex flex-wrap items-center gap-2">
        {([
          { key: 'all',       label: 'All',          count: apps.length,      activeClass: 'bg-slate-900 text-white border-slate-900' },
          { key: 'installed', label: 'Installed',    count: installed.length, activeClass: 'bg-emerald-500 text-white border-emerald-500' },
          { key: 'failed',    label: 'Failed',       count: failed.length,    activeClass: 'bg-red-500 text-white border-red-500' },
          { key: 'pending',   label: 'Pending',      count: pending.length,   activeClass: 'bg-amber-500 text-white border-amber-500' },
        ] as const).map(btn => (
          <button
            key={btn.key}
            type="button"
            onClick={() => setFilter(btn.key)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border transition focus-visible:ring-2 focus-visible:ring-orange-300 ${
              filter === btn.key ? btn.activeClass : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {btn.label}
            <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${filter === btn.key ? 'bg-white/25' : 'bg-slate-100 text-slate-500'}`}>
              {btn.count}
            </span>
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search apps…"
            className="h-7 w-44 rounded-full border border-slate-200 bg-white pl-7 pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent transition"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="Clear search"
            >
              <XCircle className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Failed apps — always surfaced at top when viewing "all" */}
      {filter === 'all' && failed.filter(matchesSearch).length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-red-100 border-b border-red-200">
            <XCircle className="h-4 w-4 text-red-600" />
            <span className="text-sm font-semibold text-red-700">Failed Installations ({failed.filter(matchesSearch).length})</span>
          </div>
          <div className="divide-y divide-red-100">
            {failed.filter(matchesSearch).map((app, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-red-800 leading-tight">{app.name}</p>
                    {app.version && <p className="text-xs text-red-500 font-mono mt-0.5">{app.version}</p>}
                  </div>
                  {app.errorCode && (
                    <span className="flex-shrink-0 rounded bg-red-200 px-1.5 py-0.5 text-xs font-mono font-semibold text-red-800">
                      {app.errorCode}
                    </span>
                  )}
                </div>
                {app.errorDescription && (
                  <p className="text-xs text-red-700 mt-1.5 leading-relaxed">{app.errorDescription}</p>
                )}
                {app.lastAttempt && (
                  <p className="text-xs text-red-400 mt-1">Last attempt: {app.lastAttempt}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending apps */}
      {filter === 'all' && pending.filter(matchesSearch).length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-100 border-b border-amber-200">
            <Loader className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-semibold text-amber-700">Pending ({pending.filter(matchesSearch).length})</span>
          </div>
          <div className="divide-y divide-amber-100">
            {pending.filter(matchesSearch).map((app, i) => (
              <div key={i} className="px-4 py-3">
                <p className="text-sm font-semibold text-amber-800">{app.name}</p>
                {app.errorDescription && <p className="text-xs text-amber-700 mt-1">{app.errorDescription}</p>}
                {app.lastAttempt && <p className="text-xs text-amber-400 mt-0.5">Last attempt: {app.lastAttempt}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* App table — failed/pending when filter is active, installed when "all" or "installed" */}
      {(() => {
        const baseApps = filter === 'failed'
          ? failed
          : filter === 'pending'
          ? pending
          : installed
        const tableApps = baseApps.filter(matchesSearch)

        if (baseApps.length === 0) return null

        if (tableApps.length === 0 && q) {
          return (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-400 rounded-xl border border-slate-200 bg-white">
              <Search className="h-7 w-7 text-slate-200" />
              <p className="text-sm font-medium">No apps match "{search}"</p>
              <button type="button" onClick={() => setSearch('')} className="text-xs text-orange-500 hover:underline">Clear search</button>
            </div>
          )
        }

        return (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
              <Package className="h-4 w-4 text-slate-500" />
              <span className="text-sm font-semibold text-slate-700">
                {filter === 'failed' ? 'Failed Installations' : filter === 'pending' ? 'Pending Installations' : `Installed Applications (${q ? `${tableApps.length} of ${installed.length}` : installed.length})`}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[520px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Application', 'Version', 'Bundle ID / Publisher', 'Type', filter === 'failed' || filter === 'pending' ? 'Last Attempt' : 'Installed', 'Status'].map((h, i) => (
                      <th key={i} className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tableApps.map((app, i) => (
                    <tr key={i} className={`${app.status === 'Failed' ? 'bg-red-50/40' : app.status === 'Pending' ? 'bg-amber-50/40' : 'hover:bg-slate-50'} transition-colors`}>
                      <td className="px-3 py-2.5 font-medium text-slate-900 max-w-[200px]">
                        <p className="truncate" title={app.name}>{app.name}</p>
                        {app.errorCode && <p className="text-xs font-mono text-red-500 mt-0.5">{app.errorCode}</p>}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{app.version}</td>
                      <td className="px-3 py-2.5 text-slate-400 font-mono text-xs max-w-[180px] truncate" title={app.publisher}>{app.publisher || '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <AppTypeBadge type={app.appType} />
                        {!app.appType && <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">
                        {app.status === 'Installed' ? (app.installDate ?? '—') : (app.lastAttempt ?? '—')}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <AppStatusPill status={app.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ── Compliance Tab ────────────────────────────────────────────────────────

// Real per-policy state is encoded as a "— <State>" suffix (see server's
// getIntuneDevicePolicies) so this shape stays a plain string[] shared with
// ManageEngine's applied-profile names, which carry no per-policy state at all.
type PolicyVerdict = 'pass' | 'fail' | 'neutral'

function parsePolicyState(policy: string): { name: string; verdict: PolicyVerdict } {
  const match = policy.match(/^(.*) — (Compliant|Non-Compliant|Error|Conflict|Not Applicable|Unknown)$/)
  if (!match) return { name: policy, verdict: 'neutral' }
  const [, name, state] = match
  const verdict: PolicyVerdict =
    state === 'Compliant' ? 'pass' :
    state === 'Non-Compliant' || state === 'Error' || state === 'Conflict' ? 'fail' : 'neutral'
  return { name, verdict }
}

function ComplianceTab({ d }: { d: ApiDevice }) {
  const hasIssue = d.primaryIssue && d.primaryIssue !== 'None'
  const [fetchedPolicies, setFetchedPolicies] = useState<{ deviceId: string; policies: string[] | null } | null>(null)
  const [profileFetch, setProfileFetch] = useState<{ deviceId: string; snapshot: ManageEngineDeviceProfileSnapshot | null; error: boolean } | null>(null)

  useEffect(() => {
    if (d.managementSource === 'ManageEngine') {
      api.fetchManageEngineDeviceProfileResults(d.id)
        .then(snapshot => setProfileFetch({ deviceId: d.id, snapshot, error: false }))
        .catch(() => setProfileFetch({ deviceId: d.id, snapshot: null, error: true }))
      return
    }
    if (d.appliedPolicies && d.appliedPolicies.length > 0) return
    api.fetchDevicePolicies(d.id)
      .then(policies => setFetchedPolicies({ deviceId: d.id, policies: policies.length > 0 ? policies : null }))
      .catch(() => setFetchedPolicies({ deviceId: d.id, policies: null }))
  }, [d.id, d.managementSource, d.appliedPolicies])

  const isManageEngine = d.managementSource === 'ManageEngine'
  const currentProfileFetch = profileFetch?.deviceId === d.id ? profileFetch : null
  const profileSnapshot = currentProfileFetch?.snapshot ?? null
  const currentFetchedPolicies = fetchedPolicies?.deviceId === d.id ? fetchedPolicies.policies : null
  const policies = currentFetchedPolicies ?? d.appliedPolicies ?? []
  const policiesLoading = isManageEngine
    ? currentProfileFetch === null
    : !(d.appliedPolicies && d.appliedPolicies.length > 0) && fetchedPolicies?.deviceId !== d.id

  return (
    <div className="space-y-3">
      <SectionCard title="Compliance Status" icon={<ShieldCheck className="h-4 w-4" />}>
        <div className="col-span-2 flex items-center gap-3 pb-1">
          {isManageEngine
            ? <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-600"><AlertCircle className="h-4 w-4" />Unavailable</span>
            : <ComplianceBadge state={d.complianceState} />}
          {d.managementSource && <SourcePill src={d.managementSource} />}
        </div>
        {isManageEngine && <p className="col-span-2 text-xs text-slate-500">Endpoint Central does not expose an overall device compliance verdict through its documented API. Profile results below are shown individually.</p>}
        {d.lastComplianceCheck && (
          <div className="flex flex-col gap-0.5">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Last Compliance Check</p>
            <p className="text-sm font-medium text-slate-800">{d.lastComplianceCheck}</p>
            <CheckInBadge days={stalenessDays(d.lastComplianceCheck)} />
          </div>
        )}
        <Field label="Issue Source" value={d.issueSource} />
        {!isManageEngine && hasIssue && <Field label="Failed Policy" value={d.policyFailed} />}
        {!isManageEngine && hasIssue && (
          <div className="col-span-2 flex flex-col gap-0.5">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Active Issue</p>
            <p className="text-sm text-red-700 font-medium">{d.primaryIssue}</p>
            <div className="flex gap-3 mt-1 text-xs text-slate-400">
              <span>Severity: <span className={`font-semibold ${d.severity === 'Critical' || d.severity === 'High' ? 'text-red-600' : d.severity === 'Medium' ? 'text-amber-600' : 'text-orange-600'}`}>{d.severity}</span></span>
              <span>Confidence: {d.confidence}</span>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title={isManageEngine ? 'ManageEngine Profile Results' : 'Applied Policies'} icon={<Fingerprint className="h-4 w-4" />}>
        <div className="col-span-2 space-y-1.5">
          {policiesLoading ? (
            <div className="flex items-center gap-2 py-4 text-slate-400">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading applied policies…</span>
            </div>
          ) : isManageEngine ? currentProfileFetch?.error && !profileSnapshot ? (
            <p className="text-sm text-amber-700 py-2">Profile results are currently unavailable. The last known device data has not been changed.</p>
          ) : !profileSnapshot || profileSnapshot.profiles.length === 0 ? (
            <p className="text-sm text-slate-400 italic py-2">No profile result data was returned for this device.</p>
          ) : <>
            {profileSnapshot.stale && <p className="text-xs text-amber-700">Refresh failed; showing the last successful profile data from {new Date(profileSnapshot.lastSuccessfulSyncAt).toLocaleString()}.</p>}
            {!profileSnapshot.stale && <p className="text-xs text-slate-400">Last successful profile sync: {new Date(profileSnapshot.lastSuccessfulSyncAt).toLocaleString()}</p>}
            {profileSnapshot.profiles.map((profile, i) => (
            <div key={profile.profileId ?? `${profile.profileName}-${i}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-700">{profile.profileName}</span>
                <span className="text-xs font-semibold text-slate-600">{profile.status ?? 'Status not reported'}</span>
              </div>
              {profile.remarks && <p className="text-xs text-slate-500">{profile.remarks}</p>}
              {!profile.remarks && profile.localizedRemarks && <p className="text-xs text-slate-500">{profile.localizedRemarks}</p>}
              {profile.appliedTime && <p className="text-[0.65rem] text-slate-400">Applied: {formatProfileAppliedTime(profile.appliedTime)}</p>}
              {profile.profileId && <p className="text-[0.65rem] font-mono text-slate-400">Profile ID: {profile.profileId}</p>}
            </div>
            ))}
          </> : policies.length === 0 ? (
            <p className="text-sm text-slate-400 italic py-2">No policy assignment data available for this device.</p>
          ) : policies.map((policy, i) => {
            const parsed = parsePolicyState(policy)
            // Sources with no real per-policy state (e.g. ManageEngine applied
            // profile names) fall back to the coarse device-level policyFailed fuzzy-match.
            const verdict: PolicyVerdict = parsed.verdict !== 'neutral' ? parsed.verdict :
              (d.policyFailed && d.policyFailed !== 'None' &&
                d.policyFailed.split(';').some(p => parsed.name.startsWith(p.trim().split('–')[0]?.trim() ?? '')))
                ? 'fail' : 'neutral'
            const cls = verdict === 'fail' ? 'bg-red-50 border-red-200'
              : verdict === 'pass' ? 'bg-emerald-50 border-emerald-200'
              : 'bg-slate-50 border-slate-200'
            const textCls = verdict === 'fail' ? 'text-red-700' : verdict === 'pass' ? 'text-emerald-700' : 'text-slate-600'
            return (
              <div key={i} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm border ${cls}`}>
                <span className={`font-medium ${textCls}`}>{parsed.name}</span>
                {verdict === 'fail'
                  ? <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                  : verdict === 'pass'
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                  : <AlertCircle className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />}
              </div>
            )
          })}
        </div>
      </SectionCard>
    </div>
  )
}

function formatProfileAppliedTime(value: string): string {
  const numeric = Number(value)
  const date = new Date(Number.isFinite(numeric) ? numeric : value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

// ── Main Component ────────────────────────────────────────────────────────

export function DeviceDetailPanel({ device: d, onBack, backLabel = 'All Devices', initialTab = 'overview' }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)

  const failedApps = d.apps?.filter(a => a.status === 'Failed').length ?? 0
  const pendingApps = d.apps?.filter(a => a.status === 'Pending').length ?? 0

  return (
    <div className="flex flex-col h-full bg-[#faf9f0]">
      {/* ── Panel Header ── */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 transition focus-visible:ring-2 focus-visible:ring-orange-300 rounded"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {backLabel}
          </button>
        </div>

        {/* Device hero */}
        <div className="px-5 pt-4 pb-3 flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
            <PlatformIcon p={d.platform} size="lg" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CopyText value={d.deviceName} label="Device name"><h2 className="text-base font-bold text-slate-900 leading-tight">{d.deviceName}</h2></CopyText>
              {d.managementSource === 'ManageEngine'
                ? <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600"><AlertCircle className="h-3.5 w-3.5" />MDM compliance unavailable</span>
                : <ComplianceBadge state={d.complianceState} />}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <SourcePill src={d.managementSource} />
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-500">{d.model ?? d.platform}</span>
              {d.department && (
                <>
                  <span className="text-xs text-slate-400">·</span>
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <Building2 className="h-3 w-3" />{d.department}
                  </span>
                </>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
              <RefreshCw className="h-3 w-3 flex-shrink-0" />
              <span>Last sync: {d.lastCheckIn}</span>
              <CheckInBadge days={stalenessDays(d.lastCheckIn)} />
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 px-5 pb-0 overflow-x-auto">
          {TABS.map(tab => {
            const hasBadge = tab.id === 'apps' && (failedApps + pendingApps) > 0
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex-shrink-0 px-3 py-2 text-xs font-semibold border-b-2 transition focus-visible:ring-2 focus-visible:ring-orange-300 rounded-t ${
                  activeTab === tab.id
                    ? 'border-sky-500 text-sky-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                {tab.label}
                {hasBadge && (
                  <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold">
                    {failedApps + pendingApps}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {activeTab === 'overview'   && <OverviewTab   d={d} />}
        {activeTab === 'hardware'   && <HardwareTab   d={d} />}
        {activeTab === 'network'    && <NetworkTab    d={d} />}
        {activeTab === 'security'   && <SecurityTab   d={d} />}
        {activeTab === 'apps'       && <AppsTab       d={d} />}
        {activeTab === 'compliance' && <ComplianceTab d={d} />}
      </div>
    </div>
  )
}
