import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  RefreshCw, Download, CheckCircle2, AlertTriangle, XCircle,
  Clock, Package, Info, ArrowDownToLine, Search, HelpCircle,
} from 'lucide-react'
import { useToast } from '../ui/ToastProvider'
import { appVersionsApi } from '../../api'
import type { BatchVersionResult, LibraryApp } from '../../api'

// ── Known installed versions (sample MDM data for 6 reference apps) ───────────

const KNOWN_INSTALLED: Record<string, { version: string; vendor: string }> = {
  'google chrome':      { version: '120.0.6099.129', vendor: 'Google LLC' },
  'visual studio code': { version: '1.83.1',         vendor: 'Microsoft Corporation' },
  'firefox':            { version: '118.0.2',         vendor: 'Mozilla Foundation' },
  'docker desktop':     { version: '4.24.0',          vendor: 'Docker, Inc.' },
  'slack':              { version: '4.35.131',         vendor: 'Slack Technologies' },
  'citrix workspace':   { version: '24.5.0',           vendor: 'Cloud Software Group' },
}

// Default apps shown when no external list is provided
const DEFAULT_APP_NAMES = [
  'Google Chrome', 'Visual Studio Code', 'Firefox',
  'Docker Desktop', 'Slack', 'Citrix Workspace',
]

// ── Logo colors — deterministic from app name ─────────────────────────────────

const LOGO_COLORS = [
  'bg-blue-500', 'bg-purple-600', 'bg-emerald-600', 'bg-orange-500',
  'bg-red-500',  'bg-sky-500',    'bg-indigo-600',  'bg-teal-600',
  'bg-amber-500','bg-rose-500',   'bg-cyan-600',    'bg-violet-600',
]
function logoColor(name: string) { return LOGO_COLORS[name.charCodeAt(0) % LOGO_COLORS.length] }
function logoLetter(name: string) { return name.replace(/^(Microsoft|Adobe|Google|Citrix)\s+/i, '').charAt(0).toUpperCase() }

// ── Version comparison ────────────────────────────────────────────────────────

function parseVer(v: string): number[] {
  return v.replace(/[-+][^\s]*/g, '').split('.').map(s => parseInt(s, 10) || 0)
}
function isOutdated(installed: string, latest: string): boolean {
  const a = parseVer(installed); const b = parseVer(latest)
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d < 0) return true
    if (d > 0) return false
  }
  return false
}

// ── Cache (per-app-name, 1 h TTL) ────────────────────────────────────────────

const CACHE_TTL = 60 * 60 * 1000

function loadCachedResult(name: string): BatchVersionResult | null {
  try {
    const raw = localStorage.getItem(`mac_avi_${name.toLowerCase()}`)
    if (!raw) return null
    const entry = JSON.parse(raw) as { r: BatchVersionResult; ts: number }
    if (Date.now() - entry.ts > CACHE_TTL) return null
    return entry.r
  } catch { return null }
}
function saveCachedResult(name: string, r: BatchVersionResult) {
  try { localStorage.setItem(`mac_avi_${name.toLowerCase()}`, JSON.stringify({ r, ts: Date.now() })) } catch { /* quota */ }
}

// ── Row status ────────────────────────────────────────────────────────────────

type RowStatus = 'up-to-date' | 'outdated' | 'unknown' | 'not-found' | 'loading'

function rowStatus(name: string, result: BatchVersionResult | undefined, globalLoading: boolean): RowStatus {
  if (globalLoading && !result) return 'loading'
  if (!result) return 'loading'
  if (result.error || !result.latestVersion) return 'not-found'
  const known = KNOWN_INSTALLED[name.toLowerCase()]
  if (!known) return 'unknown'
  return isOutdated(known.version, result.latestVersion) ? 'outdated' : 'up-to-date'
}

const STATUS_CFG: Record<RowStatus, { label: string; badge: string; rowBg: string; rowBorder: string }> = {
  'up-to-date': { label: 'Up to date',  badge: 'bg-emerald-50 border-emerald-200 text-emerald-700', rowBg: 'bg-[#f0fdf4]', rowBorder: 'border-l-4 border-l-emerald-400' },
  outdated:     { label: 'Outdated',    badge: 'bg-red-50 border-red-200 text-red-700',             rowBg: 'bg-[#fff5f5]', rowBorder: 'border-l-4 border-l-red-400'     },
  unknown:      { label: 'Latest known',badge: 'bg-sky-50 border-sky-200 text-sky-700',             rowBg: '',             rowBorder: ''                                },
  'not-found':  { label: 'Not tracked', badge: 'bg-slate-100 border-slate-200 text-slate-500',      rowBg: '',             rowBorder: ''                                },
  loading:      { label: 'Checking…',   badge: 'bg-amber-50 border-amber-200 text-amber-600',       rowBg: '',             rowBorder: ''                                },
}

// ── Summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({
  appNames, results, loading,
}: { appNames: string[]; results: Map<string, BatchVersionResult>; loading: boolean }) {
  let outdated = 0; let upToDate = 0; let unknown = 0
  for (const name of appNames) {
    const s = rowStatus(name, results.get(name.toLowerCase()), loading)
    if (s === 'outdated') outdated++
    else if (s === 'up-to-date') upToDate++
    else if (s === 'unknown') unknown++
  }
  return (
    <div className="grid grid-cols-4 gap-3">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 flex items-center gap-3">
        <div className="rounded-xl bg-red-100 p-2 flex-shrink-0"><AlertTriangle className="h-4 w-4 text-red-600" /></div>
        <div><p className="text-xl font-black text-red-600">{loading ? '—' : outdated}</p><p className="text-[0.62rem] text-slate-400 font-medium">Outdated</p></div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 flex items-center gap-3">
        <div className="rounded-xl bg-emerald-100 p-2 flex-shrink-0"><CheckCircle2 className="h-4 w-4 text-emerald-600" /></div>
        <div><p className="text-xl font-black text-emerald-600">{loading ? '—' : upToDate}</p><p className="text-[0.62rem] text-slate-400 font-medium">Up to Date</p></div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 flex items-center gap-3">
        <div className="rounded-xl bg-sky-100 p-2 flex-shrink-0"><HelpCircle className="h-4 w-4 text-sky-600" /></div>
        <div><p className="text-xl font-black text-sky-600">{loading ? '—' : unknown}</p><p className="text-[0.62rem] text-slate-400 font-medium">Latest Known</p></div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 flex items-center gap-3">
        <div className="rounded-xl bg-slate-100 p-2 flex-shrink-0"><Package className="h-4 w-4 text-slate-500" /></div>
        <div><p className="text-xl font-black text-slate-700">{appNames.length}</p><p className="text-[0.62rem] text-slate-400 font-medium">Total Apps</p></div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  apps?: LibraryApp[]
}

export function AppVersionInventory({ apps: externalApps }: Props) {
  const appNames: string[] = useMemo(
    () => externalApps && externalApps.length > 0
      ? [...new Set(externalApps.map(a => a.name))]
      : DEFAULT_APP_NAMES,
    [externalApps],
  )

  const [results, setResults]       = useState<Map<string, BatchVersionResult>>(new Map())
  const [loading, setLoading]       = useState(false)
  const [checkedAt, setCheckedAt]   = useState<string | null>(null)
  const [fromCache, setFromCache]   = useState(false)
  const [search, setSearch]         = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | RowStatus>('all')
  const [downloading, setDownloading] = useState<string | null>(null)
  const { showToast } = useToast()

  const applyResults = useCallback((list: BatchVersionResult[], ts: string, cached: boolean) => {
    const map = new Map<string, BatchVersionResult>()
    for (const r of list) map.set(r.name.toLowerCase(), r)
    setResults(map)
    setCheckedAt(ts)
    setFromCache(cached)
  }, [])

  const fetchVersions = useCallback(async (force = false) => {
    if (!force) {
      // Try per-item cache first
      const cached: BatchVersionResult[] = []
      for (const name of appNames) {
        const c = loadCachedResult(name)
        if (!c) { cached.length = 0; break }
        cached.push(c)
      }
      if (cached.length === appNames.length) {
        applyResults(cached, cached[0]?.fetchedAt ?? new Date().toISOString(), true)
        return
      }
    }

    setLoading(true)
    setResults(new Map())
    try {
      const resp = await appVersionsApi.batchLookup(appNames)
      for (const r of resp.results) saveCachedResult(r.name, r)
      applyResults(resp.results, resp.checkedAt, false)
    } catch { /* errors shown per-row */ } finally {
      setLoading(false)
    }
  }, [appNames, applyResults])

  // Re-fetch when the app list changes (e.g. Kandji loads new data)
  useEffect(() => {
    void fetchVersions(false)
  }, [fetchVersions])

  const checkedAtLabel = checkedAt
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(checkedAt))
    : null

  // Filter + sort
  const displayed = useMemo(() => {
    const q = search.toLowerCase()
    return appNames
      .filter(name => {
        if (q && !name.toLowerCase().includes(q)) return false
        if (statusFilter !== 'all') {
          const s = rowStatus(name, results.get(name.toLowerCase()), loading)
          if (s !== statusFilter) return false
        }
        return true
      })
      .sort((a, b) => {
        const order: Record<RowStatus, number> = { outdated: 0, 'up-to-date': 1, unknown: 2, 'not-found': 3, loading: 4 }
        const sa = rowStatus(a, results.get(a.toLowerCase()), loading)
        const sb = rowStatus(b, results.get(b.toLowerCase()), loading)
        return (order[sa] ?? 4) - (order[sb] ?? 4) || a.localeCompare(b)
      })
  }, [appNames, results, loading, search, statusFilter])

  function handleDownload(name: string, result: BatchVersionResult | undefined) {
    const url = result?.directDownloadUrl ?? '#'
    if (!url || url === '#') { showToast(`No download URL available for ${name}`, 'error'); return }
    setDownloading(name)
    showToast(`Opening download for ${name}…`, 'info')
    const a = document.createElement('a')
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => setDownloading(null), 3000)
  }

  const filterCounts = useMemo(() => {
    const c: Record<RowStatus, number> = { outdated: 0, 'up-to-date': 0, unknown: 0, 'not-found': 0, loading: 0 }
    for (const name of appNames) {
      const s = rowStatus(name, results.get(name.toLowerCase()), loading)
      c[s] = (c[s] ?? 0) + 1
    }
    return c
  }, [appNames, results, loading])

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-800">App Version Check</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Latest versions via Homebrew Cask API · {appNames.length} apps
            {externalApps && externalApps.length > 0 && ' from your Kandji library'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {checkedAtLabel && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[0.65rem] text-slate-500">
              <Clock className="h-3 w-3" />
              {fromCache ? 'Cached' : 'Checked'} {checkedAtLabel}
            </span>
          )}
          <button type="button" onClick={() => void fetchVersions(true)} disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Checking…' : 'Refresh'}
          </button>
        </div>
      </div>

      <SummaryBar appNames={appNames} results={results} loading={loading} />

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search apps…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
          />
        </div>
        {(['all', 'outdated', 'up-to-date', 'unknown', 'not-found'] as const).map(f => {
          const labels: Record<string, string> = { all: 'All', outdated: 'Outdated', 'up-to-date': 'Up to date', unknown: 'Latest known', 'not-found': 'Not tracked' }
          const count = f === 'all' ? appNames.length : filterCounts[f as RowStatus]
          return (
            <button key={f} type="button" onClick={() => setStatusFilter(f)}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold transition ${
                statusFilter === f
                  ? 'bg-slate-800 border-slate-800 text-white'
                  : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
              }`}>
              {labels[f]} <span className="opacity-60">{count}</span>
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-start gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
          <Info className="h-3.5 w-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
          <p className="text-[0.62rem] text-slate-500 leading-relaxed">
            Versions fetched from Homebrew Cask API (formulae.brew.sh). "Latest known" means the version is available but no installed version to compare against. "Not tracked" means the app is not in the Homebrew catalogue.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-left text-[0.65rem] font-bold uppercase tracking-wider text-slate-500 w-[220px]">App</th>
                <th className="px-4 py-3 text-left text-[0.65rem] font-bold uppercase tracking-wider text-slate-500 w-[140px]">Installed Version</th>
                <th className="px-4 py-3 text-left text-[0.65rem] font-bold uppercase tracking-wider text-slate-500 w-[140px]">Latest Version</th>
                <th className="px-4 py-3 text-left text-[0.65rem] font-bold uppercase tracking-wider text-slate-500 w-[140px]">Status</th>
                <th className="px-4 py-3 text-left text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">Action</th>
              </tr>
            </thead>
            <tbody>
              {displayed.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-400">
                    {search ? `No apps match "${search}"` : 'No apps to display'}
                  </td>
                </tr>
              ) : displayed.map((name, idx) => {
                const key      = name.toLowerCase()
                const result   = results.get(key)
                const status   = loading && !result ? 'loading' : rowStatus(name, result, loading)
                const cfg      = STATUS_CFG[status]
                const known    = KNOWN_INSTALLED[key]
                const isLast   = idx === displayed.length - 1
                const isDown   = downloading === name

                return (
                  <tr key={name}
                    className={`transition-colors ${!isLast ? 'border-b border-slate-100' : ''} ${cfg.rowBg} ${cfg.rowBorder}`}>
                    {/* App identity */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className={`h-8 w-8 rounded-lg ${logoColor(name)} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                          <span className="text-xs font-black text-white">{logoLetter(name)}</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800 leading-snug">{name}</p>
                          {known && <p className="text-[0.6rem] text-slate-400">{known.vendor}</p>}
                        </div>
                      </div>
                    </td>

                    {/* Installed version */}
                    <td className="px-4 py-3.5">
                      {known
                        ? <span className="font-mono text-[0.65rem] bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 text-slate-600">{known.version}</span>
                        : <span className="text-slate-300 text-xs" title="Installed version not available from MDM library API">—</span>
                      }
                    </td>

                    {/* Latest version */}
                    <td className="px-4 py-3.5">
                      {status === 'loading' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-amber-600">
                          <RefreshCw className="h-3 w-3 animate-spin" />Checking…
                        </span>
                      ) : status === 'not-found' ? (
                        <span className="text-xs text-slate-300" title={result?.error ?? 'Not in Homebrew'}>—</span>
                      ) : (
                        <span className={`font-mono text-xs rounded px-1.5 py-0.5 border ${
                          status === 'outdated'   ? 'bg-red-50 border-red-200 text-red-700 font-bold' :
                          status === 'up-to-date' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                                                    'bg-sky-50 border-sky-200 text-sky-700'
                        }`}>
                          {result?.latestVersion}
                        </span>
                      )}
                    </td>

                    {/* Status badge */}
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.65rem] font-bold ${cfg.badge}`}>
                        {status === 'up-to-date' && <CheckCircle2 className="h-3 w-3" />}
                        {status === 'outdated'   && <AlertTriangle className="h-3 w-3" />}
                        {status === 'not-found'  && <XCircle className="h-3 w-3" />}
                        {status === 'unknown'    && <HelpCircle className="h-3 w-3" />}
                        {status === 'loading'    && <RefreshCw className="h-3 w-3 animate-spin" />}
                        {cfg.label}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3.5">
                      {status === 'outdated' ? (
                        <button type="button" onClick={() => handleDownload(name, result)} disabled={isDown}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60 transition shadow-sm">
                          {isDown ? <><RefreshCw className="h-3 w-3 animate-spin" />Starting…</> : <><ArrowDownToLine className="h-3 w-3" />Download Update</>}
                        </button>
                      ) : (status === 'up-to-date' || status === 'unknown') && result?.directDownloadUrl ? (
                        <button type="button" onClick={() => handleDownload(name, result)} disabled={isDown}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-60 transition">
                          <Download className="h-3 w-3" />Download
                        </button>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
          <p className="text-[0.6rem] text-slate-400">
            Installed versions shown for 6 reference apps only. In production, pull live installed versions from your MDM device inventory API.
          </p>
          <p className="text-[0.6rem] text-slate-400">
            {displayed.length} of {appNames.length} apps shown
          </p>
        </div>
      </div>
    </div>
  )
}
