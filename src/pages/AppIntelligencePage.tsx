import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Layers, RefreshCw, Search, Info, CheckCircle, AlertTriangle, ChevronDown, Package, ExternalLink, Send, Download } from 'lucide-react'
import { appIntelApi, setAppIntelActor, APP_STATUSES, INSTALL_SOURCE_LABEL, PROVIDER_LABEL } from '../api/appIntel'
import type { AppListFilters, AppListResult, AppPlatform, AppRow, AppStatus, AppSummary, Capabilities, InstallSource, ProviderCapability, ProviderId, RequestKind, SyncStatus } from '../api/appIntel'
import { SortableHeader } from '../components/ui/SortableHeader'
import { toggleSortDirection, type SortDirection } from '../lib/tableSorting'
import { AppDetailDrawer } from '../components/appIntel/AppDetailDrawer'
import { RequestDialog } from '../components/appIntel/RequestDialog'
import { ConfidenceBadge, CveCell, InstallSourceBadge, PackagingBadge, ProviderBadge, StatusBadge } from '../components/appIntel/badges'
import { timeAgo } from '../components/appIntel/format'
import { hasPermission } from '../lib/permissions'
import { usePermissions } from '../context/permissionsHooks'

const PAGE_SIZE = 25
const PACKAGING_ROW_STATUSES = ['Package required', 'Repackage required', 'Update available — existing package']
const POLL_MS = 4000
type SortKey = NonNullable<AppListFilters['sortKey']>

const SORTABLE: Record<string, SortKey> = { app: 'app', publisher: 'publisher', affected: 'affected', devices: 'devices', status: 'status', lastChecked: 'lastChecked' }

const CAP_DOT: Record<string, string> = { ok: 'bg-emerald-500', not_configured: 'bg-slate-300' }
const capDot = (c: ProviderCapability) => CAP_DOT[c.state] ?? 'bg-amber-500'

function CapabilityPanel({ caps }: { caps: Capabilities }) {
  const items: Array<[string, ProviderCapability]> = [
    ['Intune — detected apps', caps.intune.detectedApps],
    ['Intune — app catalog (packages)', caps.intune.appCatalog],
    ['ManageEngine MDM inventory', caps.manageEngineMdm],
    ['Endpoint Central agent inventory', caps.endpointCentralInventory],
    ['Self-service — Intune Company Portal', caps.selfService.intuneCompanyPortal],
    ['Self-service — Endpoint Central portal', caps.selfService.endpointCentralPortal],
    ['Latest versions — winget (Windows)', caps.latestVersionSources.winget],
    ['Latest versions — Homebrew (macOS)', caps.latestVersionSources.homebrew],
  ]
  return (
    <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 md:grid-cols-2">
      {items.map(([label, c]) => (
        <li key={label} className="flex items-start gap-2 text-[0.68rem]">
          <span className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${capDot(c)}`} />
          <span><span className="font-semibold text-slate-700">{label}:</span> <span className="text-slate-500">{c.message}</span></span>
        </li>
      ))}
      <li className="flex items-start gap-2 text-[0.68rem]">
        <span className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${caps.packagers.windows || caps.packagers.macOS ? 'bg-emerald-500' : 'bg-amber-500'}`} />
        <span><span className="font-semibold text-slate-700">Packaging workflows:</span> <span className="text-slate-500">
          Windows {caps.packagers.windows ? 'connected' : 'not connected'} · macOS {caps.packagers.macOS ? 'connected' : 'not connected'}</span></span>
      </li>
    </ul>
  )
}

function updateHint(s: AppSummary): string {
  const b = s.updateBreakdown
  if (!s.updateAvailable) return 'No app has a confirmed newer version'
  const parts = [
    b.needsPackaging && `${b.needsPackaging} need packaging`,
    b.existingPackage && `${b.existingPackage} have a package ready`,
    b.vendorUpdate && `${b.vendorUpdate} updated by the vendor`,
    b.review && `${b.review} to review`,
  ].filter(Boolean)
  return `${parts.join(' · ')} · ${b.devicesBehind.toLocaleString()} devices behind`
}

interface CardDef { id: string; label: string; value: number | null; hint: string; status: AppStatus | null; tone: string; pressed?: boolean; onClick?: () => void }

/** `embedded` drops the page title block so the view can live inside another page (ManageEngine App Inventory). */
export function AppIntelligencePage({ viewerRole, userEmail, embedded = false }: { viewerRole?: string; userEmail?: string; embedded?: boolean } = {}) {
  // Idempotent module-level setting; must be in place before the first request is issued.
  if (viewerRole) setAppIntelActor(viewerRole, userEmail)
  const permissions = usePermissions()
  const canWrite = hasPermission(viewerRole ?? '', permissions, 'appIntel.write')
  const [platform, setPlatform] = useState<AppPlatform>('windows')
  const [status, setStatus] = useState<AppStatus | ''>('')
  const [provider, setProvider] = useState<ProviderId | ''>('')
  const [publisher, setPublisher] = useState('')
  const [syncState, setSyncState] = useState<'' | 'checked' | 'stale' | 'never'>('')
  const [confidence, setConfidence] = useState<'' | 'high' | 'medium' | 'low'>('')
  const [installSource, setInstallSource] = useState<InstallSource | ''>('')
  const [updateOnly, setUpdateOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [page, setPage] = useState(1)

  const [list, setList] = useState<AppListResult | null>(null)
  const [summary, setSummary] = useState<AppSummary | null>(null)
  const [sync, setSync] = useState<SyncStatus | null>(null)
  const [caps, setCaps] = useState<Capabilities | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showSources, setShowSources] = useState(false)
  const [selected, setSelected] = useState<AppRow | null>(null)
  const [dialog, setDialog] = useState<{ row: AppRow; kind: RequestKind } | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(query.trim()); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [query])

  const filters = useMemo<AppListFilters>(() => ({
    platform, status, provider, publisher, syncState, confidence, installSource, updateAvailable: updateOnly ? '1' : '', q: debounced, page, pageSize: PAGE_SIZE,
    ...(sortKey ? { sortKey, sortDir: sortDirection } : {}),
  }), [platform, status, provider, publisher, syncState, confidence, installSource, updateOnly, debounced, page, sortKey, sortDirection])

  const load = useCallback(() => {
    const mine = ++seq.current
    Promise.all([appIntelApi.list(filters), appIntelApi.summary(filters.platform), appIntelApi.status()])
      .then(([l, s, st]) => {
        if (mine !== seq.current) return
        // Never render a summary returned for another platform. This protects
        // the tiles from late responses while users switch Windows/macOS.
        setList(l); setSummary(s.summary?.platform === filters.platform ? s.summary : null); setSync(st); setCaps(st.capabilities); setError(null)
      })
      .catch(e => { if (mine === seq.current) setError(e instanceof Error ? e.message : 'App Intelligence could not be loaded.') })
      .finally(() => { if (mine === seq.current) setLoading(false) })
  }, [filters])

  useEffect(() => { load() }, [load])

  // While a sync runs, poll until it settles — the server never blocks a request on a sync.
  useEffect(() => {
    if (sync?.state !== 'syncing') return
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [sync?.state, load])

  const [reportMsg, setReportMsg] = useState<string | null>(null)
  const sendReport = () => {
    if (!window.confirm('Post the verified application update report to the configured Slack channel now?')) return
    setReportMsg('Sending report to Slack…')
    appIntelApi.sendUpdateReport()
      .then(r => setReportMsg(`Report sent to Slack: ${r.updatesAvailable} app(s) behind, ${r.devicesBehind} device-installs.`))
      .catch(e => setReportMsg(e instanceof Error ? `Slack report failed: ${e.message}` : 'Slack report failed.'))
  }
  const startSync = () => { setError(null); appIntelApi.sync().then(s => { setSync(s); load() }).catch(() => setError('The sync could not be started.')) }

  const reset = () => { setStatus(''); setProvider(''); setPublisher(''); setSyncState(''); setConfidence(''); setInstallSource(''); setUpdateOnly(false); setQuery(''); setDebounced(''); setPage(1) }
  const applyStatus = (s: AppStatus | null) => { setStatus(s ?? ''); setUpdateOnly(false); setPage(1) }
  const toggleUpdates = () => { setUpdateOnly(u => !u); setStatus(''); setPage(1) }
  const changePlatform = (p: AppPlatform) => {
    if (p === platform) return
    // Drop platform-scoped data immediately; a Windows number must never be
    // presented as a macOS result while the macOS request is in flight.
    setSummary(null); setList(null); setPlatform(p); setPublisher(''); setStatus(''); setUpdateOnly(false); setPage(1); setLoading(true)
  }
  const excluded = sync?.excludedNative ? sync.excludedNative[platform] : null
  const handleSort = (key: string) => {
    const k = SORTABLE[key]; if (!k) return
    setSortDirection(d => toggleSortDirection(sortKey, d, k)); setSortKey(k); setPage(1)
  }

  const cards: CardDef[] = [
    { id: 'discovered', label: 'Apps discovered', value: summary?.appsDiscovered ?? null, hint: 'Across the connected providers', status: null, tone: 'text-slate-800' },
    { id: 'update', label: 'Update available', value: summary?.updateAvailable ?? null, status: null, tone: 'text-sky-700', pressed: updateOnly, onClick: toggleUpdates,
      hint: summary ? `${summary.platform === 'macOS' ? 'macOS' : 'Windows'} · ${updateHint(summary)}` : `${platform === 'macOS' ? 'macOS' : 'Windows'} results loading…` },
    { id: 'package', label: 'Package required', value: summary?.packageRequiredBreakdown.newPackage ?? null,
      hint: summary && summary.packageRequiredBreakdown.repackage ? `Plus ${summary.packageRequiredBreakdown.repackage} needing a repackage` : 'Newer version confirmed, no package exists', status: 'Package required', tone: 'text-red-700' },
    { id: 'packaged', label: 'Packaged — ready to deploy', value: summary?.updateBreakdown.existingPackage ?? null, hint: 'Newer version confirmed and a package already exists', status: 'Update available — existing package', tone: 'text-emerald-700' },
  ]
  const syncing = sync?.state === 'syncing'
  const noData = !!sync && !sync.syncedAt && !syncing

  return (
    <div className="flex w-full flex-col gap-5">
      <div className={`flex flex-wrap items-start gap-3 ${embedded ? 'justify-end' : 'justify-between'}`}>
        {!embedded && (
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 rounded-2xl bg-indigo-100 p-2.5"><Layers className="h-6 w-6 text-indigo-600" /></div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">App Intelligence</h1>
              <p className="mt-0.5 text-sm text-slate-500">Correlates Intune and ManageEngine app data with verified latest versions to decide what needs packaging. Read-only.</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-3">
          <p className="text-[0.7rem] text-slate-500" aria-live="polite">
            {syncing ? 'Syncing…' : sync?.syncedAt ? `Last synced ${timeAgo(sync.syncedAt)} (${new Date(sync.syncedAt).toLocaleString()})` : 'Not synced yet'}
          </p>
          <button type="button" onClick={startSync} disabled={syncing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />Sync now
          </button>
          {(['csv', 'xlsx'] as const).map(fmt => (
            <button key={fmt} type="button" disabled={syncing || noData}
              onClick={() => { setReportMsg(`Preparing ${fmt === 'csv' ? 'CSV' : 'Excel'} export…`); appIntelApi.exportReport(filters, fmt).then(() => setReportMsg(null)).catch(e => setReportMsg(e instanceof Error ? `Export failed: ${e.message}` : 'Export failed.')) }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
              <Download className="h-3.5 w-3.5" />Export {fmt === 'csv' ? 'CSV' : 'Excel'}
            </button>
          ))}
          {canWrite && (
            <button type="button" onClick={sendReport} disabled={syncing || noData}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
              <Send className="h-3.5 w-3.5" />Send report to Slack
            </button>
          )}
        </div>
      </div>

      {reportMsg && <p role="status" className="text-right text-[0.7rem] text-slate-500">{reportMsg}</p>}

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-xs text-red-700">{error}</p>
          <button type="button" onClick={() => { setLoading(true); load() }} className="rounded-lg border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100">Retry</button>
        </div>
      )}
      {sync?.state === 'error' && sync.lastError && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
          <p className="text-xs text-red-700"><span className="font-bold">The last sync failed:</span> {sync.lastError}. No data is shown from a failed sync, and nothing falls back to sample data.</p>
        </div>
      )}
      {sync && Object.keys(sync.errors).length > 0 && sync.state !== 'error' && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
          <p className="text-xs text-amber-800"><span className="font-bold">Some sources could not be read:</span> {Object.entries(sync.errors).map(([k, v]) => `${k} — ${v}`).join('; ')}. Affected rows are marked Review required or Data unavailable.</p>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <button type="button" onClick={() => setShowSources(s => !s)} aria-expanded={showSources}
          className="flex w-full items-center justify-between text-left text-xs font-semibold text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded">
          <span>Data sources &amp; capabilities</span>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showSources ? 'rotate-180' : ''}`} />
        </button>
        {showSources && caps && <div className="mt-3"><CapabilityPanel caps={caps} /></div>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Platform" className="flex gap-1 rounded-2xl bg-slate-100 p-1">
          {(['windows', 'macOS'] as const).map(p => (
            <button key={p} type="button" role="tab" aria-selected={platform === p} onClick={() => changePlatform(p)}
              className={`rounded-xl px-4 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${platform === p ? 'is-selected' : 'text-slate-500 hover:text-slate-700'}`}>
              {p === 'windows' ? 'Windows' : 'macOS'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-busy={loading}>
        {cards.map(c => (
          <button key={c.id} type="button" onClick={c.onClick ?? (() => applyStatus(c.status))} aria-pressed={c.pressed ?? (c.status !== null && status === c.status)}
            aria-label={`${c.label}: ${c.value ?? 'loading'}${c.status || c.onClick ? ' — filter the table' : ''}`}
            className={`rounded-2xl border bg-white px-4 py-3 text-left shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${(c.pressed ?? (c.status !== null && status === c.status)) ? 'border-indigo-400 ring-2 ring-indigo-200' : 'border-slate-200'}`}>
            <p className="text-xs font-semibold text-slate-600">{c.label}</p>
            <p className={`mt-1 text-3xl font-black tabular-nums ${c.tone}`}>{c.value === null ? '—' : c.value.toLocaleString()}</p>
            <p className="mt-0.5 text-[0.65rem] text-slate-400">{c.hint}</p>
          </button>
        ))}
      </div>
      <p className="-mt-2 text-[0.7rem] text-slate-500" data-testid="scope-note">
        Scope: <strong>custom</strong> (packaged in Intune), <strong>self-service</strong> (offered in the Company Portal) and <strong>manually installed</strong> apps.
        {excluded !== null && <> {excluded.toLocaleString()} native {platform === 'macOS' ? 'macOS' : 'Windows'} app{excluded === 1 ? '' : 's'} (built-in components, Store/MSIX{platform === 'macOS' ? ', Apple system apps' : ''}) {excluded === 1 ? 'is' : 'are'} excluded from the scan.</>}
        {summary && <> Showing {summary.byInstallSource.custom.toLocaleString()} custom · {summary.byInstallSource.selfService.toLocaleString()} self-service · {summary.byInstallSource.manual.toLocaleString()} manual.</>}
      </p>
      {summary && summary.packageRequiredBreakdown.repackage > 0 && (
        <button type="button" onClick={() => applyStatus('Repackage required')} className="-mt-3 self-start text-[0.7rem] font-semibold text-indigo-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded">
          Show {summary.packageRequiredBreakdown.repackage} app(s) that need a repackage
        </button>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="relative min-w-[14rem] flex-1">
            <span className="sr-only">Search apps</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search app, publisher or bundle id…"
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </label>
          <label className="text-[0.62rem] font-semibold text-slate-500">Provider
            <select value={provider} onChange={e => { setProvider(e.target.value as ProviderId | ''); setPage(1) }} className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-normal text-slate-700">
              <option value="">All providers</option>
              {(Object.keys(PROVIDER_LABEL) as ProviderId[]).map(p => <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>)}
            </select>
          </label>
          <label className="text-[0.62rem] font-semibold text-slate-500">Install source
            <select value={installSource} onChange={e => { setInstallSource(e.target.value as InstallSource | ''); setPage(1) }} className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-normal text-slate-700">
              <option value="">All sources</option>
              {(Object.keys(INSTALL_SOURCE_LABEL) as InstallSource[]).map(k => <option key={k} value={k}>{INSTALL_SOURCE_LABEL[k]}</option>)}
            </select>
          </label>
          <label className="text-[0.62rem] font-semibold text-slate-500">Status
            <select value={status} onChange={e => { setStatus(e.target.value as AppStatus | ''); setPage(1) }} className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-normal text-slate-700">
              <option value="">All statuses</option>
              {APP_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="text-[0.62rem] font-semibold text-slate-500">Publisher
            <input list="app-intel-publishers" value={publisher} onChange={e => { setPublisher(e.target.value); setPage(1) }} placeholder="Any publisher"
              className="mt-0.5 block w-40 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-normal text-slate-700" />
            <datalist id="app-intel-publishers">{(summary?.publishers ?? []).slice(0, 500).map(p => <option key={p} value={p} />)}</datalist>
          </label>
          <label className="text-[0.62rem] font-semibold text-slate-500">Last-sync state
            <select value={syncState} onChange={e => { setSyncState(e.target.value as typeof syncState); setPage(1) }} className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-normal text-slate-700">
              <option value="">Any</option>
              <option value="checked">Checked in the last 24 h</option>
              <option value="stale">Stale (over 24 h)</option>
              <option value="never">Never checked</option>
            </select>
          </label>
          <label className="text-[0.62rem] font-semibold text-slate-500">Confidence
            <select value={confidence} onChange={e => { setConfidence(e.target.value as typeof confidence); setPage(1) }} className="mt-0.5 block rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-normal text-slate-700">
              <option value="">Any</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 self-end pb-1.5 text-[0.7rem] font-semibold text-slate-600">
            <input type="checkbox" checked={updateOnly} onChange={toggleUpdates} className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-500 focus:ring-indigo-400" />
            Only apps with an update available
          </label>
          <button type="button" onClick={reset} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">Reset</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading && !list ? (
          <div aria-busy="true" className="space-y-2 p-4">{[0, 1, 2, 3].map(i => <div key={i} className="h-9 animate-pulse rounded-lg bg-slate-100" />)}</div>
        ) : syncing && !list?.rows.length ? (
          <p role="status" className="px-5 py-8 text-center text-xs text-slate-500">First sync in progress — reading Intune and ManageEngine and checking latest versions. This can take a minute.</p>
        ) : noData ? (
          <p role="status" className="px-5 py-8 text-center text-xs text-slate-500">No inventory has been synced yet. Press “Sync now”.</p>
        ) : list && list.rows.length === 0 ? (
          <p role="status" className="px-5 py-8 text-center text-xs text-slate-500">No apps match these filters.</p>
        ) : list && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  {([['App', 'app'], ['Publisher', 'publisher']] as const).map(([l, k]) => (
                    <SortableHeader key={k} label={l} sortKey={k} activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-3 py-2 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400" />
                  ))}
                  <th className="px-3 py-2 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400">Platform</th>
                  <th className="px-3 py-2 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400">Owner</th>
                  <th className="px-3 py-2 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400">Install source</th>
                  <th className="px-3 py-2 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400">Installed versions</th>
                  <SortableHeader label="Affected devices" sortKey="affected" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-3 py-2 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400" />
                  <th className="px-3 py-2 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400">Deployed package version</th>
                  <th className="px-3 py-2 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400">Deployment ring</th>
                  <th className="px-3 py-2 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400">CVEs</th>
                  <th className="px-3 py-2 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400">Verified latest release</th>
                  <SortableHeader label="Status" sortKey="status" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-3 py-2 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400" />
                  <th className="px-3 py-2 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400">Action</th>
                  <th className="px-3 py-2 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400">Source</th>
                  <SortableHeader label="Last checked" sortKey="lastChecked" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-3 py-2 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.rows.map(r => (
                  <tr key={r.key} onClick={() => setSelected(r)} className="cursor-pointer align-top hover:bg-indigo-50/40">
                    <td className="px-3 py-2">
                      <button type="button" onClick={e => { e.stopPropagation(); setSelected(r) }} aria-label={`View details for ${r.app}`}
                        className="text-left font-semibold text-slate-800 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded">{r.app}</button>
                      <div className="mt-0.5"><ConfidenceBadge confidence={r.confidence} /></div>
                    </td>
                    <td className="px-3 py-2 text-slate-500">{r.publisher ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{r.platform === 'macOS' ? 'macOS' : 'Windows'}</td>
                    <td className="max-w-[10rem] truncate px-3 py-2 text-slate-600" title={r.owner ?? 'No owner recorded on the matched Intune package'}>{r.owner ?? <span className="text-slate-400">Not recorded</span>}</td>
                    <td className="px-3 py-2"><InstallSourceBadge source={r.installSource} basis={r.installSourceBasis} /></td>
                    <td className="px-3 py-2 font-mono text-[0.68rem] text-slate-600">
                      {r.installedVersions.slice(0, 2).map(v => <div key={`${v.provider}-${v.version}`}>{v.version} <span className="text-slate-400">×{v.deviceCount}</span></div>)}
                      {r.installedVersions.length > 2 && <div className="text-slate-400">+{r.installedVersions.length - 2} more</div>}
                    </td>
                    <td className="px-3 py-2 font-semibold tabular-nums text-slate-700" title="Estimate from per-version detected-app counts">{r.affectedDevices.toLocaleString()}{r.impactPercent !== null && r.affectedDevices > 0 && <span className="ml-1 font-normal text-slate-400">({r.impactPercent}%)</span>}</td>
                    <td className="px-3 py-2 font-mono text-[0.68rem] text-slate-600">
                      {r.deployedPackageVersion ?? <span className="font-sans text-slate-400">not reported</span>}
                      {r.packagingState && r.packagingState !== 'unknown' && <div className="mt-0.5 font-sans"><PackagingBadge state={r.packagingState} /></div>}
                    </td>
                    <td className="max-w-[10rem] px-3 py-2 text-slate-600" title={r.ringBasis === 'group-name' ? 'Inferred from assignment group names' : r.ringBasis === 'assignment-target' ? 'Read from the assignment target' : 'No ring could be identified from the assignments'}>
                      {r.ring ?? <span className="text-slate-400">Not identified</span>}{r.ringBasis === 'group-name' && <span className="ml-1 text-[0.58rem] text-slate-400">inferred</span>}
                    </td>
                    <td className="px-3 py-2 text-[0.7rem]"><CveCell cve={r.cve} /></td>
                    <td className="px-3 py-2 font-mono text-[0.68rem] text-slate-600" title={r.latestSource ?? 'No approved latest-version source is mapped for this application'}>{r.latestVerifiedVersion ?? <span className="font-sans text-slate-400">unavailable</span>}</td>
                    <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                    <td className="max-w-[14rem] px-3 py-2 text-slate-600">
                      {r.platform === 'macOS' && r.affectedDevices > 0 && r.latestVerifiedVersion ? (
                        <button type="button" onClick={e => { e.stopPropagation(); setSelected(r) }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-left text-[0.68rem] font-bold text-indigo-700 hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
                          <Package className="h-3.5 w-3.5" />Packaging needed <ExternalLink className="h-3 w-3" />
                        </button>
                      ) : r.action}
                      {r.latestVerifiedVersion && r.affectedDevices > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          {r.request?.jiraKey && (r.request.jiraUrl
                            ? <a href={r.request.jiraUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700 hover:underline" title="Packaging request already created">Request {r.request.jiraKey}</a>
                            : <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700">Request {r.request.jiraKey}</span>)}
                          {r.request?.slackAt && <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[0.6rem] font-bold text-sky-700" title={`Slack notified ${new Date(r.request.slackAt).toLocaleString()}`}>Slack sent</span>}
                          {canWrite && !r.request?.jiraKey && PACKAGING_ROW_STATUSES.includes(r.status) && (
                            <button type="button" onClick={e => { e.stopPropagation(); setDialog({ row: r, kind: 'jira' }) }} aria-label={`Create packaging request for ${r.app}`}
                              className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-white px-1.5 py-0.5 text-[0.62rem] font-semibold text-indigo-700 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"><Package className="h-3 w-3" />Request</button>
                          )}
                          {canWrite && (
                            <button type="button" onClick={e => { e.stopPropagation(); setDialog({ row: r, kind: 'slack' }) }} aria-label={`Notify Slack about ${r.app}`}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[0.62rem] font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"><Send className="h-3 w-3" />Slack</button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">{r.providers.map(p => <ProviderBadge key={p} provider={p} />)}</div>
                      {r.latestSource && <p className="mt-0.5 text-[0.6rem] text-slate-400">{r.latestSource}</p>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-500">{r.lastChecked ? timeAgo(r.lastChecked) : 'never'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list && list.total > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            <span>{list.total.toLocaleString()} app{list.total === 1 ? '' : 's'}</span>
            <div className="flex items-center gap-2">
              <button type="button" disabled={list.page <= 1} onClick={() => setPage(list.page - 1)} className="rounded-lg border border-slate-200 px-2.5 py-1 font-semibold hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">Previous</button>
              <span>Page {list.page} of {list.totalPages}</span>
              <button type="button" disabled={list.page >= list.totalPages} onClick={() => setPage(list.page + 1)} className="rounded-lg border border-slate-200 px-2.5 py-1 font-semibold hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">Next</button>
            </div>
          </div>
        )}
      </div>

      <p className="flex items-start gap-1.5 text-[0.65rem] text-slate-400">
        <CheckCircle className="mt-0.5 h-3 w-3 flex-shrink-0" />
        Latest versions come only from verified sources (Homebrew cask API, Microsoft winget-pkgs manifests) and never from device inventory. Apps without a verified mapping show “Data unavailable”.
      </p>

      {selected && <AppDetailDrawer row={selected} canWrite={canWrite} onClose={() => setSelected(null)} onRequested={() => load()} />}
      {dialog && <RequestDialog appKey={dialog.row.key} appName={dialog.row.app} kind={dialog.kind} onClose={() => setDialog(null)} onDone={() => load()} />}
    </div>
  )
}
