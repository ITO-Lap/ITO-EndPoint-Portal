import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, AlertCircle, Download, MonitorOff, RefreshCw, Search, X } from 'lucide-react'
import {
  staleDevicesApi, setStaleDevicesActor, MANAGED_BY_OPTIONS, BUCKET_OPTIONS, SOURCE_LABEL,
} from '../api/staleDevices'
import type {
  InactivityBucket, ManagedBy, SourceMeta, StaleDevice, StaleListResult, StalePlatform, StaleSortKey, StaleSourceId, StaleStatus, StaleView, SyncState,
} from '../api/staleDevices'
import { Pagination } from '../components/ui/Pagination'
import { SortableHeader } from '../components/ui/SortableHeader'
import { toggleSortDirection, type SortDirection } from '../lib/tableSorting'
import { hasPermission } from '../lib/permissions'
import { usePermissions } from '../context/PermissionsContext'

const PAGE_SIZE = 25
const POLL_MS = 4000
const TZ_KEY = 'ito.staleDevices.timezone'
const TIMEZONES: Array<[string, string]> = [
  ['Asia/Kolkata', 'India (IST, UTC+5:30)'], ['UTC', 'UTC'], ['America/Los_Angeles', 'US Pacific'], ['America/New_York', 'US Eastern'], ['Europe/London', 'UK'],
]

const TABS: Array<{ id: StaleView; label: string }> = [
  { id: 'stale', label: 'All stale devices' }, { id: 'windows', label: 'Windows' }, { id: 'macos', label: 'macOS' },
  { id: 'drift', label: 'Source drift' }, { id: 'review', label: 'Needs review' },
]

const STATUS_META: Record<StaleStatus, { label: string; cls: string }> = {
  stale:           { label: 'Stale',           cls: 'bg-red-50 text-red-700 border-red-200' },
  active:          { label: 'Active',          cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  source_drift:    { label: 'Source drift',    cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  no_checkin_data: { label: 'No check-in data', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
  needs_review:    { label: 'Needs review',    cls: 'bg-amber-50 text-amber-700 border-amber-200' },
}

function getStoredTz(): string {
  try { const v = localStorage.getItem(TZ_KEY); if (v && TIMEZONES.some(([z]) => z === v)) return v } catch { /* storage unavailable */ }
  return 'Asia/Kolkata'
}

function fmt(iso: string | null, tz: string): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}
const days = (n: number | null): string => (n === null ? '—' : n === 1 ? '1 day' : `${n.toLocaleString()} days`)

function StatusBadge({ status }: { status: StaleStatus }) {
  const m = STATUS_META[status]
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.62rem] font-bold ${m.cls}`}>{m.label}</span>
}

function SourceChip({ name, meta, tz }: { name: string; meta: SourceMeta; tz: string }) {
  const tone = meta.state === 'ok' ? 'bg-emerald-500' : meta.state === 'error' ? 'bg-red-500' : 'bg-slate-300'
  const text = meta.state === 'not_configured' ? 'Not configured'
    : meta.state === 'error' ? `Last refresh failed${meta.lastSuccessAt ? ` · last success ${fmt(meta.lastSuccessAt, tz)}` : ''}`
    : `Refreshed ${fmt(meta.lastSuccessAt, tz)} · ${meta.inScope.toLocaleString()} in scope`
  return (
    <div className="flex items-start gap-2 text-[0.68rem]" title={meta.error ?? undefined}>
      <span className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${tone}`} />
      <span><span className="font-semibold text-slate-700">{name}:</span> <span className="text-slate-500">{text}</span></span>
    </div>
  )
}

function SummaryCard({ label, value, hint, tone, active, onClick }: { label: string; value: number | null; hint: string; tone: string; active?: boolean; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} disabled={!onClick}
      className="glass rounded-2xl p-4 text-left transition water-glow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:cursor-default">
      <p className="text-[0.6rem] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</p>
      <p className="text-2xl font-black tabular-nums" style={{ color: tone }}>{value === null ? '—' : value.toLocaleString()}</p>
      <p className="text-[0.62rem] text-slate-400 mt-0.5">{hint}</p>
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[0.6rem] font-bold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-xs text-slate-700 break-words">{children}</dd>
    </div>
  )
}

function DeviceDrawer({ device, tz, onClose }: { device: StaleDevice; tz: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { closeRef.current?.focus() }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])
  const errors = (Object.entries(device.sourceDataStatus) as Array<[StaleSourceId, string]>).filter(([, s]) => s === 'error')

  return createPortal(
    <div className="fixed inset-0 flex justify-end" style={{ zIndex: 100000, background: 'rgba(15,23,42,0.35)' }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <aside role="dialog" aria-modal="true" aria-label={`Device details — ${device.deviceName}`} className="flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-xl" style={{ borderLeft: '1px solid rgba(148,163,184,0.25)' }}>
        <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="min-w-0 space-y-1.5">
            <h2 className="text-sm font-bold text-slate-800 break-words">{device.deviceName}</h2>
            <p className="text-[0.7rem] text-slate-500">{device.platform} · {device.managedBy}</p>
            <StatusBadge status={device.staleStatus} />
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close device details" className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <section className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-xs font-semibold text-slate-700">{device.explanation}</p>
            {device.reviewReasons.length > 1 && <ul className="mt-1 list-disc pl-4 text-[0.7rem] text-slate-500">{device.reviewReasons.slice(1).map(r => <li key={r}>{r}</li>)}</ul>}
          </section>

          {errors.length > 0 && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[0.7rem] text-amber-800">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>{errors.map(([s]) => SOURCE_LABEL[s]).join(' and ')} could not be read on the last refresh, so this result may be incomplete.</span>
            </div>
          )}

          <section className="space-y-2">
            <h3 className="text-[0.65rem] font-bold uppercase tracking-wide text-slate-500">Device</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Username">{device.username || '—'}</Field>
              <Field label="Email ID">{device.email || '—'}</Field>
              <Field label="OS platform">{device.platform}</Field>
              <Field label="OS version">{device.osVersion}</Field>
              <Field label="Serial number">{device.serialNumber ?? '—'}</Field>
              <Field label="Canonical ID"><span className="font-mono text-[0.68rem]">{device.canonicalDeviceId}</span></Field>
              <Field label="Intune device ID"><span className="font-mono text-[0.68rem]">{device.intuneDeviceId ?? '—'}</span></Field>
              <Field label="Endpoint Central device ID"><span className="font-mono text-[0.68rem]">{device.endpointCentralDeviceId ?? '—'}</span></Field>
              <Field label="Correlation confidence">{device.correlationConfidence}</Field>
              <Field label="Data refreshed">{fmt(device.lastDataRefreshAt, tz)}</Field>
            </dl>
          </section>

          <section className="space-y-2">
            <h3 className="text-[0.65rem] font-bold uppercase tracking-wide text-slate-500">Check-in by source</h3>
            <table className="w-full text-left text-xs">
              <thead><tr className="text-[0.6rem] uppercase tracking-wide text-slate-400"><th className="py-1 pr-2">Source</th><th className="py-1 pr-2">Last check-in</th><th className="py-1">State</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {device.sourceEvidence.map(e => (
                  <tr key={e.source} className="align-top">
                    <td className="py-1.5 pr-2 font-semibold text-slate-700">{SOURCE_LABEL[e.source]}{device.effectiveSource === e.source && <span className="ml-1.5 rounded bg-sky-100 px-1 py-0.5 text-[0.55rem] font-bold text-sky-700">EFFECTIVE</span>}</td>
                    <td className="py-1.5 pr-2 text-slate-600">{fmt(e.lastCheckInAt, tz)}</td>
                    <td className="py-1.5 text-slate-500">{e.state === 'recent' ? 'Recent' : e.state === 'stale' ? 'Older than 21 days' : 'No data'}{e.note && <span className="block text-[0.62rem] text-slate-400">{e.note}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[0.65rem] text-slate-400">Effective last check-in: {fmt(device.effectiveLastCheckInAt, tz)} (UTC {device.effectiveLastCheckInAt ?? '—'}){device.possibleDuplicateOf.length > 0 && ` · Possible duplicate of ${device.possibleDuplicateOf.join(', ')}`}</p>
          </section>
        </div>
      </aside>
    </div>,
    document.body,
  )
}

export function StaleDevicesPage({ onBack, viewerRole = 'IT Admin', userEmail }: { onBack: () => void; viewerRole?: string; userEmail?: string }) {
  setStaleDevicesActor(viewerRole, userEmail)
  const permissions = usePermissions()
  const [view, setView] = useState<StaleView>('stale')
  const [platform, setPlatform] = useState<StalePlatform | ''>('')
  const [managedBy, setManagedBy] = useState<ManagedBy | ''>('')
  const [bucket, setBucket] = useState<InactivityBucket | ''>('')
  const [status, setStatus] = useState<StaleStatus | ''>('')
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [sortKey, setSortKey] = useState<StaleSortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDirection>('desc')
  const [page, setPage] = useState(1)
  const [tz, setTz] = useState(getStoredTz)

  const [data, setData] = useState<StaleListResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<StaleDevice | null>(null)
  const [exporting, setExporting] = useState(false)
  const seq = useRef(0)

  useEffect(() => { const t = setTimeout(() => { setDebounced(query.trim()); setPage(1) }, 300); return () => clearTimeout(t) }, [query])

  const currentQuery = useCallback(() => ({
    view, platform, managedBy, bucket, status, q: debounced, sortKey, sortDir, page, pageSize: PAGE_SIZE,
  }), [view, platform, managedBy, bucket, status, debounced, sortKey, sortDir, page])

  const load = useCallback(() => {
    const mine = ++seq.current
    staleDevicesApi.list(currentQuery())
      .then(d => { if (mine === seq.current) { setData(d); setError(null); setLoading(false) } })
      .catch(e => { if (mine === seq.current) { setError(e instanceof Error ? e.message : 'Request failed'); setLoading(false) } })
  }, [currentQuery])

  useEffect(() => { load() }, [load])

  const syncing = data?.state === 'syncing'
  useEffect(() => {
    if (!syncing) return
    const id = window.setInterval(load, POLL_MS)
    return () => window.clearInterval(id)
  }, [syncing, load])

  const refresh = () => { setLoading(true); staleDevicesApi.sync().then(load).catch(e => { setError(e instanceof Error ? e.message : 'Refresh failed'); setLoading(false) }) }
  const changeTz = (z: string) => { setTz(z); try { localStorage.setItem(TZ_KEY, z) } catch { /* storage unavailable */ } }
  const reset = (fn: () => void) => { fn(); setPage(1) }
  const changeView = (v: StaleView) => { setView(v); setStatus(''); setPage(1); setPlatform('') }
  const handleSort = (key: string) => { setSortDir(d => toggleSortDirection(sortKey, d, key)); setSortKey(key as StaleSortKey); setPage(1) }

  const doExport = async () => {
    setExporting(true)
    try { await staleDevicesApi.exportCsv(currentQuery(), tz) }
    catch (e) { setError(e instanceof Error ? e.message : 'Export failed') }
    finally { setExporting(false) }
  }

  const s = data?.summary ?? null
  const sources = data?.sources
  const anyConfigured = !!sources && (['intune', 'endpoint-central'] as const).some(k => sources[k].state !== 'not_configured')
  const anyError = !!sources && (['intune', 'endpoint-central'] as const).some(k => sources[k].state === 'error')
  const live = data ? (!anyConfigured ? { label: 'Not configured', cls: 'bg-slate-100 text-slate-600' } : anyError ? { label: 'Live — partial (source error)', cls: 'bg-amber-100 text-amber-800' } : { label: 'Live data', cls: 'bg-emerald-100 text-emerald-800' }) : null
  const lastRefresh = (['intune', 'endpoint-central'] as const).map(k => sources?.[k].lastSuccessAt ?? null).filter((v): v is string => !!v).sort().at(-1) ?? null
  const reviewStatuses: Array<[StaleStatus, string]> = [['needs_review', 'Needs review'], ['no_checkin_data', 'No check-in data']]
  const th = 'px-3 py-2 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400'
  const syncRef: SyncState | null = data

  return (
    <div className="flex w-full flex-col gap-5 page-enter">
      <div className="glass rounded-2xl overflow-hidden">
        <div className="h-[3px]" style={{ background: 'linear-gradient(90deg,#FF6B35,#F46C00,#FFB800)' }} />
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={onBack} className="flex items-center gap-1.5 rounded-full border border-slate-200 glass px-3 py-1.5 text-sm font-medium text-slate-600 water-glow">
              <ArrowLeft className="h-4 w-4" />Back
            </button>
            <div className="grid h-10 w-10 place-items-center rounded-2xl" style={{ background: 'linear-gradient(135deg,#FF6B35,#F46C00)' }}><MonitorOff className="h-5 w-5 text-white" /></div>
            <div>
              <h1 className="text-lg font-black text-slate-800">Stale Devices</h1>
              <p className="text-[0.68rem] text-slate-400">Devices with no verified management check-in for more than 21 days.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {live && <span className={`rounded-full px-2.5 py-1 text-[0.65rem] font-bold ${live.cls}`}>{live.label}</span>}
            <label className="text-[0.62rem] font-semibold text-slate-500">Time zone
              <select value={tz} onChange={e => changeTz(e.target.value)} className="ml-1.5 rounded-lg border border-slate-200 px-2 py-1 text-xs font-normal text-slate-700">
                {TIMEZONES.map(([z, l]) => <option key={z} value={z}>{l}</option>)}
              </select>
            </label>
            <button type="button" onClick={refresh} disabled={syncing} className="flex items-center gap-1.5 rounded-full border border-slate-200 glass px-3 py-1.5 text-xs font-semibold text-slate-500 water-glow disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin text-[#F46C00]' : ''}`} />{syncing ? 'Refreshing…' : 'Refresh data'}
            </button>
          </div>
        </div>
      </div>

      {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700"><span>{error}</span><button type="button" onClick={() => { setLoading(true); load() }} className="rounded-lg border border-red-200 bg-white px-3 py-1 font-semibold">Retry</button></div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-busy={loading}>
        <SummaryCard label="Stale Windows" value={s?.staleWindows ?? null} hint="Intune + Endpoint Central" tone="#0078D4" active={view === 'windows'} onClick={() => changeView('windows')} />
        <SummaryCard label="Stale macOS" value={s?.staleMacOS ?? null} hint="Endpoint Central" tone="#10B981" active={view === 'macos'} onClick={() => changeView('macos')} />
        <SummaryCard label="Source drift" value={s?.sourceDrift ?? null} hint="One source recent, one stale" tone="#0EA5E9" active={view === 'drift'} onClick={() => changeView('drift')} />
        <SummaryCard label="No check-in data" value={s?.noCheckinData ?? null} hint="Never counted as stale" tone="#64748B" active={view === 'review' && status === 'no_checkin_data'} onClick={() => { changeView('review'); setStatus('no_checkin_data') }} />
        <SummaryCard label="Needs review" value={s?.needsReview ?? null} hint="Scope or match uncertain" tone="#D97706" active={view === 'review' && status === 'needs_review'} onClick={() => { changeView('review'); setStatus('needs_review') }} />
      </div>

      <div className="glass rounded-2xl px-4 py-3 grid gap-2 md:grid-cols-3">
        {sources ? <>
          <SourceChip name="Intune (Windows)" meta={sources.intune} tz={tz} />
          <SourceChip name="Endpoint Central (Windows + macOS)" meta={sources['endpoint-central']} tz={tz} />
          <p className="text-[0.68rem] text-slate-500">Last successful refresh: {fmt(lastRefresh, tz)}. {syncRef?.state === 'syncing' ? 'Refreshing now…' : ''}</p>
        </> : <p className="text-[0.68rem] text-slate-400">Loading source status…</p>}
      </div>

      <div role="tablist" aria-label="Stale device views" className="flex flex-wrap gap-1 glass rounded-2xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={view === t.id} onClick={() => changeView(t.id)}
            className="rounded-xl px-4 py-1.5 text-xs font-bold text-slate-500 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">{t.label}</button>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="relative min-w-[14rem] flex-1">
            <span className="sr-only">Search devices</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search device, serial number, username or email…"
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-300" />
          </label>
          {(view === 'stale' || view === 'review' || view === 'drift') && (
            <label className="text-[0.62rem] font-semibold text-slate-500">Platform
              <select value={platform} onChange={e => reset(() => setPlatform(e.target.value as StalePlatform | ''))} className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-normal text-slate-700">
                <option value="">All platforms</option><option value="Windows">Windows</option><option value="macOS">macOS</option>
              </select>
            </label>
          )}
          <label className="text-[0.62rem] font-semibold text-slate-500">Managed by
            <select value={managedBy} onChange={e => reset(() => setManagedBy(e.target.value as ManagedBy | ''))} className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-normal text-slate-700">
              <option value="">All sources</option>{MANAGED_BY_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="text-[0.62rem] font-semibold text-slate-500">Inactive for
            <select value={bucket} onChange={e => reset(() => setBucket(e.target.value as InactivityBucket | ''))} className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-normal text-slate-700">
              <option value="">Any age</option>{BUCKET_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          {view === 'review' && (
            <label className="text-[0.62rem] font-semibold text-slate-500">Status
              <select value={status} onChange={e => reset(() => setStatus(e.target.value as StaleStatus | ''))} className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-normal text-slate-700">
                <option value="">All review statuses</option>{reviewStatuses.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          )}
          {hasPermission(viewerRole, permissions, 'staleDevices.export') && (
            <button type="button" onClick={() => void doExport()} disabled={exporting || !data || data.total === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">
              <Download className="h-3.5 w-3.5" />{exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading && !data ? (
          <div aria-busy="true" className="space-y-2 p-4">{[0, 1, 2, 3].map(i => <div key={i} className="h-9 animate-pulse rounded-lg bg-slate-100" />)}</div>
        ) : data && !(['intune', 'endpoint-central'] as const).some(k => data.sources[k].state !== 'not_configured') ? (
          <p role="status" className="px-5 py-10 text-center text-xs text-slate-500">Neither Intune nor ManageEngine is configured, so there is no live data to show. Nothing is simulated.</p>
        ) : data && !data.syncedAt ? (
          <p role="status" className="px-5 py-10 text-center text-xs text-slate-500">First refresh in progress — reading Intune and Endpoint Central. This can take a minute.</p>
        ) : data && data.rows.length === 0 ? (
          <p role="status" className="px-5 py-10 text-center text-xs text-slate-500">No devices match this view and these filters.</p>
        ) : data && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  {([['Device name', 'deviceName'], ['Username', 'username'], ['Email ID', 'email'], ['Last check-in', 'lastCheckIn'], ['Inactive for', 'inactiveDays'], ['OS platform', 'platform'], ['OS version', 'osVersion'], ['Managed by', 'managedBy'], ['Serial number', 'serialNumber']] as const).map(([l, k]) => (
                    <SortableHeader key={k} label={l} sortKey={k} activeSortKey={sortKey} direction={sortDir} onSort={handleSort} className={th} />
                  ))}
                  <SortableHeader label="Source evidence / status" sortKey="status" activeSortKey={sortKey} direction={sortDir} onSort={handleSort} className={th} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map(d => (
                  <tr key={d.canonicalDeviceId} onClick={() => setSelected(d)} className="cursor-pointer align-top hover:bg-sky-50/40">
                    <td className="px-3 py-2">
                      <button type="button" onClick={e => { e.stopPropagation(); setSelected(d) }} aria-label={`View details for ${d.deviceName}`}
                        className="text-left font-semibold text-slate-800 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 rounded">{d.deviceName}</button>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{d.username || '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{d.email || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{fmt(d.effectiveLastCheckInAt, tz)}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-semibold tabular-nums text-slate-700">{days(d.inactiveDays)}</td>
                    <td className="px-3 py-2 text-slate-500">{d.platform}</td>
                    <td className="px-3 py-2 font-mono text-[0.68rem] text-slate-500">{d.osVersion}</td>
                    <td className="px-3 py-2 text-slate-500">{d.managedBy}</td>
                    <td className="px-3 py-2 font-mono text-[0.68rem] text-slate-500">{d.serialNumber ?? '—'}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={d.staleStatus} />
                      <p className="mt-0.5 max-w-[16rem] text-[0.62rem] text-slate-400">
                        {d.sourceEvidence.map(e => `${SOURCE_LABEL[e.source]}: ${e.state === 'no_data' ? 'no data' : fmt(e.lastCheckInAt, tz)}`).join(' · ')}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > 0 && <Pagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} totalItems={data.total} pageSize={data.pageSize} itemLabel="device" />}
      </div>

      <p className="text-[0.65rem] text-slate-400">
        Measures management check-in inactivity (Intune <code>lastSyncDateTime</code>; Endpoint Central MDM <code>last_contact_time</code>), not user sign-in activity. A Windows device is stale only when every source is older than 21 days. Read-only — no retire, wipe or delete actions.
      </p>

      {selected && <DeviceDrawer device={selected} tz={tz} onClose={() => setSelected(null)} />}
    </div>
  )
}
