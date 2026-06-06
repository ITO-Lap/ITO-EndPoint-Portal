/**
 * KpiModal — Reusable KPI drill-down modal
 *
 * Opens when any of the 18 KPI cards is clicked.
 * Features:
 *   - KPI name, value, description header
 *   - Applied filters display
 *   - Last generated timestamp
 *   - Searchable, sortable, paginated device table
 *   - Column visibility controls
 *   - Export to Excel button (with progress + toast)
 *   - Empty state, loading state
 *   - Fully responsive
 */

import { useState, useMemo, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Search, Download, ChevronUp, ChevronDown,
  SlidersHorizontal, ChevronLeft, ChevronRight,
  FileText, AlertCircle, CheckCircle2, Loader2,
} from 'lucide-react'
import type { ApiDevice } from '../../api'
import type { KpiId, KpiFilterOpts } from '../../lib/kpiConfig'
import { KPI_CONFIGS } from '../../lib/kpiConfig'
import { generateKpiExcel } from '../../lib/kpiExport'

// ── Types ─────────────────────────────────────────────────────────────────────

interface KpiModalProps {
  kpiId: KpiId
  allDevices: ApiDevice[]
  appliedFilters: string
  generatedBy?: string
  loading?: boolean
  opts?: KpiFilterOpts
  onClose: () => void
}

type SortDir = 'asc' | 'desc'
type ExportState = 'idle' | 'generating' | 'success' | 'error'

const PAGE_SIZE = 20

// ── Sort icon helper ──────────────────────────────────────────────────────────

function SortIcon({ col, sortKey, sortDir }: { col: string; sortKey: string; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronDown className="h-3 w-3 opacity-20" />
  return sortDir === 'asc'
    ? <ChevronUp   className="h-3 w-3 text-[#7C5CFC]" />
    : <ChevronDown className="h-3 w-3 text-[#7C5CFC]" />
}

// ── Cell value renderer ───────────────────────────────────────────────────────

function CellValue({ colKey, value }: { colKey: string; value: string }) {
  // Risk Level chip
  if (colKey === 'riskLevel' || colKey === 'severity') {
    const colors: Record<string, string> = {
      Critical: 'bg-red-50 text-red-700 border-red-200',
      High:     'bg-amber-50 text-amber-700 border-amber-200',
      Medium:   'bg-orange-50 text-orange-700 border-orange-200',
      Low:      'bg-emerald-50 text-emerald-700 border-emerald-200',
    }
    return (
      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.62rem] font-bold ${colors[value] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
        {value}
      </span>
    )
  }

  // Compliance chip
  if (colKey === 'complianceState') {
    const colors: Record<string, string> = {
      Compliant:       'bg-emerald-50 text-emerald-700 border-emerald-200',
      Warning:         'bg-amber-50 text-amber-700 border-amber-200',
      'Non-Compliant': 'bg-red-50 text-red-700 border-red-200',
    }
    return (
      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.62rem] font-bold ${colors[value] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
        {value}
      </span>
    )
  }

  // EOL / lifecycle status chip
  if (colKey === 'eolStatus' || colKey === 'lifecycleStatus') {
    if (value === '● EOL' || value === 'EOL' || value === 'Inactive')
      return <span className="inline-flex rounded-full border bg-red-50 text-red-700 border-red-200 px-2 py-0.5 text-[0.62rem] font-bold">{value}</span>
    if (value === '⚠ Near EOL' || value === 'Near EOL' || value === 'Stale')
      return <span className="inline-flex rounded-full border bg-amber-50 text-amber-700 border-amber-200 px-2 py-0.5 text-[0.62rem] font-bold">{value}</span>
    if (value === 'Active')
      return <span className="inline-flex rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200 px-2 py-0.5 text-[0.62rem] font-bold">{value}</span>
  }

  // OS status
  if (colKey === 'osStatus' || colKey === 'versionsBehind') {
    if (value.includes('↓↓') || (parseInt(value) >= 2))
      return <span className="text-red-600 font-semibold text-xs">{value}</span>
    if (value.includes('↓') || value === '1')
      return <span className="text-amber-600 font-semibold text-xs">{value}</span>
    if (value.includes('✓') || value === '0')
      return <span className="text-emerald-600 font-semibold text-xs">{value}</span>
  }

  // OS version — add visual indicator
  if (colKey === 'osVersion') {
    const major = parseInt(value.split('.')[0] ?? '0')
    if (major < 12) return <span className="text-red-600 font-mono text-xs">{value}</span>
    if (major < 15) return <span className="text-amber-600 font-mono text-xs">{value}</span>
    return <span className="text-emerald-600 font-mono text-xs">{value}</span>
  }

  // Patch status
  if (colKey === 'patchStatus') {
    if (value === 'Fully Patched')
      return <span className="inline-flex rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200 px-2 py-0.5 text-[0.62rem] font-bold">{value}</span>
    if (value === 'Missing Critical')
      return <span className="inline-flex rounded-full border bg-red-50 text-red-700 border-red-200 px-2 py-0.5 text-[0.62rem] font-bold">{value}</span>
    return <span className="inline-flex rounded-full border bg-amber-50 text-amber-700 border-amber-200 px-2 py-0.5 text-[0.62rem] font-bold">{value}</span>
  }

  return <span className="text-slate-700 text-xs">{value || '—'}</span>
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function KpiModal({
  kpiId, allDevices, appliedFilters, generatedBy = 'IT Admin',
  loading = false, opts, onClose,
}: KpiModalProps) {
  const config = KPI_CONFIGS[kpiId]

  // ── State ──────────────────────────────────────────────────────────────────
  const [search,      setSearch]      = useState('')
  const [sortKey,     setSortKey]     = useState('deviceName')
  const [sortDir,     setSortDir]     = useState<SortDir>('asc')
  const [page,        setPage]        = useState(1)
  const [exportState, setExportState] = useState<ExportState>('idle')
  const [showCols,    setShowCols]    = useState(false)
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(config.columns.filter(c => c.visible).map(c => c.key))
  )

  const generatedAt = new Date().toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // ── Filtered device list for this KPI ─────────────────────────────────────
  const kpiDevices = useMemo(
    () => config.filterFn(allDevices, opts),
    [config, allDevices, opts]
  )

  const kpiValue = useMemo(
    () => config.getValue(allDevices, opts),
    [config, allDevices, opts]
  )

  // ── Search + sort ──────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    const q = search.toLowerCase().trim()
    let rows = q
      ? kpiDevices.filter(d =>
          Object.values(d).some(v =>
            String(v ?? '').toLowerCase().includes(q)
          )
        )
      : kpiDevices

    // Sort
    rows = [...rows].sort((a, b) => {
      const col = config.columns.find(c => c.key === sortKey)
      const av  = col?.render ? col.render(a) : String((a as Record<string, unknown>)[sortKey] ?? '')
      const bv  = col?.render ? col.render(b) : String((b as Record<string, unknown>)[sortKey] ?? '')
      const cmp = av.localeCompare(bv, undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })

    return rows
  }, [kpiDevices, search, sortKey, sortDir, config.columns])

  // ── Pagination ─────────────────────────────────────────────────────────────
  const totalPages  = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageRows    = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // ── Column helpers ─────────────────────────────────────────────────────────
  const displayCols = config.columns.filter(c => visibleCols.has(c.key))

  const toggleCol = useCallback((key: string) => {
    setVisibleCols(prev => {
      const next = new Set(prev)
      if (next.has(key)) { next.delete(key) } else { next.add(key) }
      return next
    })
  }, [])

  const handleSort = (key: string) => {
    if (!config.columns.find(c => c.key === key)?.sortable) return
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(1)
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExportState('generating')
    setShowCols(false)
    try {
      await new Promise(r => setTimeout(r, 300)) // let state render
      generateKpiExcel({ kpiId, allDevices, appliedFilters, generatedBy, opts })
      setExportState('success')
      setTimeout(() => setExportState('idle'), 3000)
    } catch {
      setExportState('error')
      setTimeout(() => setExportState('idle'), 4000)
    }
  }

  // ── Cell value extractor for display ──────────────────────────────────────
  const getCellDisplay = (device: ApiDevice, colKey: string): string => {
    const col = config.columns.find(c => c.key === colKey)
    if (col?.render) return col.render(device)
    const v = (device as unknown as Record<string, unknown>)[colKey]
    return v != null ? String(v) : '—'
  }

  // ── Render (via Portal so fixed positioning is always viewport-relative) ────
  const modal = (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 99999, background: 'rgba(15,23,42,0.60)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative flex flex-col w-full max-w-5xl animate-slide-up overflow-hidden"
        style={{
          maxHeight: '90vh',
          background: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid rgba(148,163,184,0.25)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.22), 0 0 0 1px rgba(148,163,184,0.2)',
        }}
      >
        {/* Accent bar */}
        <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl"
          style={{ background: `linear-gradient(90deg, ${config.accentColor}CC, ${config.accentColor})` }} />

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(148,163,184,0.15)' }}>
          <div className="flex items-start gap-3 min-w-0">
            {/* Color dot */}
            <div className="mt-1 h-3 w-3 flex-shrink-0 rounded-full"
              style={{ background: config.accentColor, boxShadow: `0 0 8px ${config.accentColor}60` }} />
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-base font-bold text-slate-800 leading-tight">{config.title}</h2>
                <span className="text-[0.6rem] font-bold uppercase tracking-widest text-slate-400">{config.group}</span>
              </div>
              {/* KPI value */}
              <p className="mt-1 text-3xl font-black mono-num" style={{ color: config.accentColor }}>
                {loading ? '—' : String(kpiValue)}
              </p>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed max-w-xl">{config.description}</p>
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="flex-shrink-0 grid h-8 w-8 place-items-center rounded-xl water-glow text-slate-400 hover:text-slate-600"
            style={{ border: '1px solid rgba(148,163,184,0.2)' }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Meta strip ── */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-6 py-2.5 flex-shrink-0 text-[0.65rem] text-slate-400"
          style={{ background: 'rgba(248,250,252,0.6)', borderBottom: '1px solid rgba(148,163,184,0.10)' }}>
          <span><strong className="text-slate-500">Filters:</strong> {appliedFilters || 'All Devices'}</span>
          <span><strong className="text-slate-500">Generated:</strong> {generatedAt}</span>
          <span><strong className="text-slate-500">Records:</strong> {kpiDevices.length.toLocaleString()} devices</span>
        </div>

        {/* ── Controls bar ── */}
        <div className="flex flex-wrap items-center gap-2 px-6 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search devices, users…"
              className="h-8 w-full rounded-full pl-8 pr-3 text-xs water-input"
            />
            {search && (
              <button onClick={() => { setSearch(''); setPage(1) }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
              </button>
            )}
          </div>

          {/* Results count */}
          <span className="text-[0.65rem] text-slate-400">
            {filteredRows.length.toLocaleString()} {search ? 'results' : 'devices'}
            {search && kpiDevices.length !== filteredRows.length && ` of ${kpiDevices.length}`}
          </span>

          <div className="flex-1" />

          {/* Column visibility */}
          <div className="relative">
            <button type="button" onClick={() => setShowCols(v => !v)}
              className="flex items-center gap-1.5 h-8 rounded-full px-3 text-xs font-semibold text-slate-600 water-glow"
              style={{ background: showCols ? 'rgba(124,92,252,0.1)' : 'rgba(255,255,255,0.7)', border: '1px solid rgba(148,163,184,0.25)' }}>
              <SlidersHorizontal className="h-3.5 w-3.5" />Columns
            </button>
            {showCols && (
              <div className="absolute right-0 top-full mt-1 w-48 rounded-2xl glass-strong shadow-xl z-20 p-3"
                style={{ border: '1px solid rgba(148,163,184,0.2)' }}>
                <p className="text-[0.6rem] font-bold uppercase tracking-widest text-slate-400 mb-2">Toggle Columns</p>
                <div className="space-y-1">
                  {config.columns.map(col => (
                    <label key={col.key} className="flex items-center gap-2 cursor-pointer group">
                      <input type="checkbox" checked={visibleCols.has(col.key)}
                        onChange={() => toggleCol(col.key)}
                        className="rounded border-slate-300" style={{ accentColor: config.accentColor }} />
                      <span className="text-xs text-slate-600 group-hover:text-slate-800">{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Export button */}
          <button
            type="button"
            onClick={handleExport}
            disabled={exportState === 'generating' || loading || kpiDevices.length === 0}
            className="flex items-center gap-1.5 h-8 rounded-full px-4 text-xs font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: exportState === 'success' ? '#10B981' : exportState === 'error' ? '#EF4444' : `linear-gradient(135deg, ${config.accentColor}, #6366F1)`, boxShadow: `0 2px 8px ${config.accentColor}40` }}
          >
            {exportState === 'generating' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {exportState === 'success'    && <CheckCircle2 className="h-3.5 w-3.5" />}
            {exportState === 'error'      && <AlertCircle className="h-3.5 w-3.5" />}
            {exportState === 'idle'       && <Download className="h-3.5 w-3.5" />}
            {exportState === 'generating' ? 'Generating…'
              : exportState === 'success' ? 'Downloaded!'
              : exportState === 'error'   ? 'Export Failed'
              : 'Export Excel'}
          </button>
        </div>

        {/* ── Table area ── */}
        <div className="flex-1 overflow-auto min-h-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Loader2 className="h-8 w-8 animate-spin mb-3" style={{ color: config.accentColor }} />
              <p className="text-sm text-slate-500">Loading device data…</p>
            </div>
          ) : kpiDevices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl mb-4"
                style={{ background: `${config.accentColor}15`, border: `1px solid ${config.accentColor}30` }}>
                <FileText className="h-7 w-7" style={{ color: config.accentColor }} />
              </div>
              <p className="text-sm font-bold text-slate-600 mb-1">No devices match this KPI</p>
              <p className="text-xs text-slate-400 max-w-xs">
                {config.id === 'healthy-devices'
                  ? 'Great news — no devices require attention for this KPI.'
                  : 'No devices currently match the criteria for this report. Try adjusting your filters.'}
              </p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="h-7 w-7 text-slate-300 mb-3" />
              <p className="text-sm font-bold text-slate-500">No results for "{search}"</p>
              <button onClick={() => setSearch('')} className="mt-2 text-xs text-[#7C5CFC] hover:underline">
                Clear search
              </button>
            </div>
          ) : (
            <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr style={{ background: 'rgba(248,250,252,0.8)' }}>
                  {displayCols.map(col => (
                    <th key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={`sticky top-0 px-3 py-2.5 text-left font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap text-[0.6rem] select-none ${col.sortable ? 'cursor-pointer hover:text-slate-700' : ''}`}
                      style={{ background: 'rgba(248,250,252,0.95)', borderBottom: '1px solid rgba(148,163,184,0.15)', zIndex: 1 }}>
                      <span className="flex items-center gap-1">
                        {col.label}
                        {col.sortable && <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((device, idx) => (
                  <tr key={device.id || `${device.deviceName}-${idx}`}
                    className="group transition-colors"
                    style={{ background: idx % 2 === 0 ? 'rgba(255,255,255,0.6)' : 'rgba(248,250,252,0.4)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${config.accentColor}08` }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = idx % 2 === 0 ? 'rgba(255,255,255,0.6)' : 'rgba(248,250,252,0.4)' }}
                  >
                    {displayCols.map(col => (
                      <td key={col.key} className="px-3 py-2.5 max-w-[200px] truncate"
                        style={{ borderBottom: '1px solid rgba(148,163,184,0.10)' }}>
                        <CellValue colKey={col.key} value={getCellDisplay(device, col.key)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Pagination footer ── */}
        {!loading && filteredRows.length > 0 && (
          <div className="flex items-center justify-between px-6 py-3 flex-shrink-0 text-xs text-slate-500"
            style={{ borderTop: '1px solid rgba(148,163,184,0.12)', background: 'rgba(248,250,252,0.6)' }}>
            <span>
              Showing {((currentPage - 1) * PAGE_SIZE + 1).toLocaleString()}–
              {Math.min(currentPage * PAGE_SIZE, filteredRows.length).toLocaleString()} of{' '}
              {filteredRows.length.toLocaleString()} devices
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                className="grid h-7 w-7 place-items-center rounded-lg water-glow-sm disabled:opacity-30"
                style={{ border: '1px solid rgba(148,163,184,0.2)', background: 'rgba(255,255,255,0.7)' }}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="px-2 font-medium tabular-nums">
                {currentPage} / {totalPages}
              </span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                className="grid h-7 w-7 place-items-center rounded-lg water-glow-sm disabled:opacity-30"
                style={{ border: '1px solid rgba(148,163,184,0.2)', background: 'rgba(255,255,255,0.7)' }}>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
