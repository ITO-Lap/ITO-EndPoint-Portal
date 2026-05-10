import { useState, useEffect, useCallback } from 'react'
import { api } from '../../api'
import type { ReportMeta, ReportResult, ReportColumn, ReportSummaryCard, IntegrationStatusItem } from '../../api'

// ── Source tab config ──────────────────────────────────────────────────────────

type SourceKey = 'all' | 'intune' | 'kandji' | 'manageengine'

const SOURCE_TABS: { key: SourceKey; label: string; short: string; logo: string }[] = [
  {
    key: 'all',
    label: 'All Sources',
    short: 'All',
    logo: 'M4 6h16M4 12h16M4 18h16', // bars icon
  },
  {
    key: 'intune',
    label: 'Microsoft Intune',
    short: 'Intune',
    logo: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  },
  {
    key: 'kandji',
    label: 'Kandji',
    short: 'Kandji',
    logo: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z',
  },
  {
    key: 'manageengine',
    label: 'ManageEngine',
    short: 'ManageEngine',
    logo: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  },
]

// ── Category metadata ──────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  inventory:  { label: 'Inventory',  color: 'bg-sky-50 text-sky-700 border-sky-200' },
  compliance: { label: 'Compliance', color: 'bg-green-50 text-green-700 border-green-200' },
  security:   { label: 'Security',   color: 'bg-red-50 text-red-700 border-red-200' },
  software:   { label: 'Software',   color: 'bg-violet-50 text-violet-700 border-violet-200' },
  health:     { label: 'Health',     color: 'bg-amber-50 text-amber-700 border-amber-200' },
  users:      { label: 'Users',      color: 'bg-slate-50 text-slate-700 border-slate-200' },
}

const SUMMARY_COLORS: Record<ReportSummaryCard['color'], string> = {
  green:  'bg-green-50 border-green-200 text-green-800',
  red:    'bg-red-50 border-red-200 text-red-800',
  amber:  'bg-amber-50 border-amber-200 text-amber-800',
  sky:    'bg-sky-50 border-sky-200 text-sky-800',
  slate:  'bg-slate-50 border-slate-200 text-slate-800',
  violet: 'bg-violet-50 border-violet-200 text-violet-800',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return '1d ago'
  if (diffDays < 30) return `${diffDays}d ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
  return `${Math.floor(diffDays / 365)}y ago`
}

function reportMatchesSource(report: ReportMeta, source: SourceKey): boolean {
  if (source === 'all') return true
  return report.sources.includes(source)
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function CategoryPill({ category }: { category: string }) {
  const meta = CATEGORY_META[category] ?? { label: category, color: 'bg-slate-50 text-slate-600 border-slate-200' }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${meta.color}`}>
      {meta.label}
    </span>
  )
}

function CellValue({ col, value }: { col: ReportColumn; value: unknown }) {
  const str = value == null ? '—' : String(value)

  if (col.type === 'badge') {
    const lc = str.toLowerCase()
    const color =
      lc === 'compliant'      ? 'bg-green-100 text-green-800' :
      lc === 'non-compliant'  ? 'bg-red-100 text-red-800' :
      lc === 'warning'        ? 'bg-amber-100 text-amber-800' :
      lc === 'enabled'        ? 'bg-green-100 text-green-800' :
      lc === 'disabled'       ? 'bg-red-100 text-red-800' :
      lc === 'windows'        ? 'bg-blue-100 text-blue-800' :
      lc === 'macos'          ? 'bg-slate-100 text-slate-800' :
      lc === 'linux'          ? 'bg-orange-100 text-orange-800' :
      lc === 'active'         ? 'bg-teal-100 text-teal-800' :
      lc === 'inactive'       ? 'bg-slate-100 text-slate-600' :
      'bg-slate-100 text-slate-700'
    return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{str}</span>
  }

  if (col.type === 'percent') {
    const num = parseFloat(str)
    const pct = isNaN(num) ? str : `${num.toFixed(1)}%`
    const color = num >= 90 ? 'text-green-700' : num >= 70 ? 'text-amber-700' : 'text-red-700'
    return <span className={`font-mono text-sm font-medium ${color}`}>{pct}</span>
  }

  if (col.type === 'date') {
    if (!value) return <span className="text-slate-400">—</span>
    try {
      const d = new Date(str)
      const formatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      const ago = getRelativeTime(d)
      return (
        <span className="text-slate-600 text-sm" title={str}>
          {formatted} <span className="text-slate-400 text-xs">({ago})</span>
        </span>
      )
    } catch { return <span className="text-slate-600 text-sm">{str}</span> }
  }

  if (col.type === 'number') {
    const num = typeof value === 'number' ? value : parseFloat(str)
    return <span className="font-mono text-sm">{isNaN(num) ? str : num.toLocaleString()}</span>
  }

  return <span className="text-sm text-slate-700">{str || '—'}</span>
}

function SummaryCards({ cards }: { cards: ReportSummaryCard[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 mb-5">
      {cards.map(card => (
        <div key={card.label} className={`rounded-xl border p-3 ${SUMMARY_COLORS[card.color]}`}>
          <p className="text-xs font-medium opacity-75 mb-1 truncate">{card.label}</p>
          <p className="text-xl font-bold">
            {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
          </p>
        </div>
      ))}
    </div>
  )
}

// ── Source tabs ────────────────────────────────────────────────────────────────

function SourceTabs({
  active,
  onChange,
  reports,
  integrations,
}: {
  active: SourceKey
  onChange: (key: SourceKey) => void
  reports: ReportMeta[]
  integrations: IntegrationStatusItem[]
}) {
  function countFor(key: SourceKey) {
    return key === 'all' ? reports.length : reports.filter(r => r.sources.includes(key)).length
  }

  function statusFor(key: SourceKey): 'connected' | 'disconnected' | null {
    if (key === 'all') return null
    const item = integrations.find(i => i.id === key)
    if (!item) return null
    return item.configured && item.healthy !== false ? 'connected' : 'disconnected'
  }

  return (
    <div className="mb-5 flex items-center gap-1 rounded-2xl bg-white border border-slate-200 shadow-sm p-1.5 overflow-x-auto">
      {SOURCE_TABS.map(tab => {
        const isActive = active === tab.key
        const status = statusFor(tab.key)
        const count = countFor(tab.key)
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`
              relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all flex-shrink-0
              ${isActive
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}
            `}
          >
            {/* Source icon */}
            <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d={tab.logo} />
            </svg>

            <span>{tab.label}</span>

            {/* Connection status dot */}
            {status && (
              <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                status === 'connected'
                  ? isActive ? 'bg-green-400' : 'bg-green-500'
                  : isActive ? 'bg-slate-400' : 'bg-slate-300'
              }`} />
            )}

            {/* Report count badge */}
            <span className={`
              ml-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums
              ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}
            `}>
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── Result table ───────────────────────────────────────────────────────────────

function ResultTable({
  result,
  onSort,
  sortBy,
  sortDir,
}: {
  result: ReportResult
  onSort: (field: string) => void
  sortBy?: string
  sortDir: 'asc' | 'desc'
}) {
  const widthClass: Record<string, string> = { sm: 'w-20', md: 'w-32', lg: 'w-44', xl: 'w-60' }

  if (result.rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <svg className="h-10 w-10 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm font-medium">No data for this report</p>
        <p className="text-xs mt-1">Connect an MDM source or check configuration</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-100 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {result.columns.map(col => (
              <th
                key={col.key}
                onClick={() => onSort(col.key)}
                className={`
                  px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500
                  cursor-pointer select-none hover:text-slate-800 transition-colors
                  ${col.align === 'right' ? 'text-right' : 'text-left'}
                  ${col.width ? widthClass[col.width] : ''}
                `}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {sortBy === col.key
                    ? <span className="text-slate-800">{sortDir === 'asc' ? '↑' : '↓'}</span>
                    : <span className="opacity-20">↕</span>
                  }
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 bg-white">
          {result.rows.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50 transition-colors">
              {result.columns.map(col => (
                <td
                  key={col.key}
                  className={`px-4 py-2.5 ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  <CellValue col={col} value={row[col.key]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Pagination ─────────────────────────────────────────────────────────────────

function Pagination({
  total, offset, limit, onPage,
}: {
  total: number; offset: number; limit: number; onPage: (offset: number) => void
}) {
  const totalPages = Math.ceil(total / limit)
  const currentPage = Math.floor(offset / limit) + 1
  if (totalPages <= 1) return null

  const pages: (number | '...')[] = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    if (currentPage > 3) pages.push('...')
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i)
    if (currentPage < totalPages - 2) pages.push('...')
    pages.push(totalPages)
  }

  return (
    <div className="flex items-center justify-between mt-4 text-sm text-slate-600">
      <span>Showing {offset + 1}–{Math.min(offset + limit, total)} of {total.toLocaleString()} rows</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(Math.max(0, offset - limit))} disabled={offset === 0}
          className="rounded px-2.5 py-1 border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition">←</button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`e-${i}`} className="px-1">…</span>
          ) : (
            <button key={p} onClick={() => onPage((p - 1) * limit)}
              className={`rounded px-2.5 py-1 border transition ${p === currentPage ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200 hover:bg-slate-100'}`}>
              {p}
            </button>
          )
        )}
        <button onClick={() => onPage(offset + limit)} disabled={offset + limit >= total}
          className="rounded px-2.5 py-1 border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition">→</button>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 100

export function ReportsPage() {
  const [reports, setReports] = useState<ReportMeta[]>([])
  const [integrations, setIntegrations] = useState<IntegrationStatusItem[]>([])
  const [loadingMeta, setLoadingMeta] = useState(true)

  // Filters
  const [activeSource, setActiveSource] = useState<SourceKey>('all')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  // Runner state
  const [selectedReport, setSelectedReport] = useState<ReportMeta | null>(null)
  const [result, setResult] = useState<ReportResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<string | undefined>(undefined)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    Promise.all([
      api.listReports(),
      api.fetchIntegrationStatus().catch(() => [] as IntegrationStatusItem[]),
    ]).then(([rpts, ints]) => {
      setReports(rpts)
      setIntegrations(ints)
    }).catch(() => setError('Failed to load report catalog'))
      .finally(() => setLoadingMeta(false))
  }, [])

  // When source tab changes, reset category + report selection
  const handleSourceChange = useCallback((key: SourceKey) => {
    setActiveSource(key)
    setSelectedCategory('all')
    setSelectedReport(null)
    setResult(null)
    setError(null)
  }, [])

  const runSelected = useCallback(async (
    report: ReportMeta,
    newOffset = 0,
    newSortBy?: string,
    newSortDir?: 'asc' | 'desc',
  ) => {
    setRunning(true)
    setError(null)
    try {
      const res = await api.runReport(report.id, {
        limit:   PAGE_SIZE,
        offset:  newOffset,
        sortBy:  newSortBy,
        sortDir: newSortDir,
      })
      setResult(res)
      setOffset(newOffset)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to run report')
    } finally {
      setRunning(false)
    }
  }, [])

  const handleSelectReport = useCallback((report: ReportMeta) => {
    setSelectedReport(report)
    setResult(null)
    setSortBy(undefined)
    setSortDir('asc')
    setOffset(0)
    runSelected(report, 0, undefined, 'asc')
  }, [runSelected])

  const handleSort = useCallback((field: string) => {
    if (!selectedReport) return
    const newDir = sortBy === field && sortDir === 'asc' ? 'desc' : 'asc'
    setSortBy(field)
    setSortDir(newDir)
    runSelected(selectedReport, 0, field, newDir)
  }, [selectedReport, sortBy, sortDir, runSelected])

  const handlePage = useCallback((newOffset: number) => {
    if (!selectedReport) return
    runSelected(selectedReport, newOffset, sortBy, sortDir)
  }, [selectedReport, sortBy, sortDir, runSelected])

  const handleExport = useCallback(() => {
    if (!selectedReport) return
    const url = api.exportReportCsvUrl(selectedReport.id)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedReport.id}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [selectedReport])

  // Derive visible report list
  const sourceFiltered = reports.filter(r => reportMatchesSource(r, activeSource))
  const categories = ['all', ...Array.from(new Set(sourceFiltered.map(r => r.category)))]
  const visibleReports = selectedCategory === 'all'
    ? sourceFiltered
    : sourceFiltered.filter(r => r.category === selectedCategory)

  // Source context label shown in the report runner header
  const activeSourceLabel = SOURCE_TABS.find(t => t.key === activeSource)?.label ?? 'All Sources'

  return (
    <div className="space-y-0">
      {/* Source tabs */}
      <SourceTabs
        active={activeSource}
        onChange={handleSourceChange}
        reports={reports}
        integrations={integrations}
      />

      {/* Body: sidebar + runner */}
      <div className="flex gap-5 min-h-0">
        {/* Sidebar */}
        <aside className="w-60 flex-shrink-0">
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Reports</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{activeSourceLabel}</p>
            </div>

            {/* Category chips */}
            <div className="px-3 py-2 border-b border-slate-100 flex flex-wrap gap-1">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => {
                    setSelectedCategory(cat)
                    // If current selected report isn't in the new filter, clear it
                    if (selectedReport && cat !== 'all' && selectedReport.category !== cat) {
                      setSelectedReport(null)
                      setResult(null)
                    }
                  }}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition
                    ${selectedCategory === cat
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                  {cat === 'all' ? 'All' : CATEGORY_META[cat]?.label ?? cat}
                </button>
              ))}
            </div>

            {/* Report list */}
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 320px)' }}>
              {loadingMeta ? (
                <div className="space-y-2 p-3">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-12 rounded-lg bg-slate-100 animate-pulse" />
                  ))}
                </div>
              ) : visibleReports.length === 0 ? (
                <div className="py-10 px-4 text-center text-slate-400">
                  <p className="text-sm font-medium">No reports</p>
                  <p className="text-xs mt-1">Try a different source or category</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {visibleReports.map(report => {
                    const isSelected = selectedReport?.id === report.id
                    return (
                      <li key={report.id}>
                        <button
                          onClick={() => handleSelectReport(report)}
                          className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${isSelected ? 'bg-slate-50 border-l-2 border-slate-800' : 'border-l-2 border-transparent'}`}
                        >
                          <p className={`text-sm font-medium leading-snug ${isSelected ? 'text-slate-900' : 'text-slate-700'}`}>
                            {report.name}
                          </p>
                          <div className="mt-1">
                            <CategoryPill category={report.category} />
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </aside>

        {/* Report runner */}
        <div className="flex-1 min-w-0">
          {!selectedReport ? (
            <div className="flex h-72 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-slate-400">
              <div className="text-center px-6">
                <svg className="h-10 w-10 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm font-medium">Select a report</p>
                <p className="text-xs mt-1">
                  {visibleReports.length > 0
                    ? `${visibleReports.length} report${visibleReports.length !== 1 ? 's' : ''} available for ${activeSourceLabel}`
                    : 'No reports match the current filter'}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h1 className="text-base font-semibold text-slate-900 truncate">{selectedReport.name}</h1>
                    <CategoryPill category={selectedReport.category} />
                    {result?.cached && (
                      <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs text-amber-700 font-medium">
                        Cached
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">{selectedReport.description}</p>
                  {result && (
                    <p className="text-xs text-slate-400 mt-1">
                      {result.totalRows.toLocaleString()} rows · generated {new Date(result.generatedAt).toLocaleTimeString()}
                      {' · '}
                      <span className="text-slate-500 font-medium">{activeSourceLabel}</span>
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => runSelected(selectedReport, 0, sortBy, sortDir)}
                    disabled={running}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
                  >
                    <svg className={`h-3.5 w-3.5 ${running ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {running ? 'Running…' : 'Refresh'}
                  </button>
                  <button
                    onClick={handleExport}
                    disabled={!result || running}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export CSV
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Loading skeleton */}
              {running && !result && (
                <div className="space-y-2">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="h-9 rounded-lg bg-slate-100 animate-pulse" style={{ opacity: 1 - i * 0.1 }} />
                  ))}
                </div>
              )}

              {/* Summary cards */}
              {result?.summary && result.summary.length > 0 && (
                <SummaryCards cards={result.summary} />
              )}

              {/* Table */}
              {result && (
                <>
                  <ResultTable result={result} onSort={handleSort} sortBy={sortBy} sortDir={sortDir} />
                  <Pagination total={result.totalRows} offset={offset} limit={PAGE_SIZE} onPage={handlePage} />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
