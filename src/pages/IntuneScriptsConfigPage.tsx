import { useState, useEffect, useCallback } from 'react'
import {
  Search, X, Download, FileCode2, RefreshCw, Package,
  CheckCircle2, XCircle, Copy, Check,
} from 'lucide-react'
import {
  intuneScriptsConfigApi, setIntuneScriptsConfigActor,
  CATEGORY_LABELS, ALL_CATEGORIES,
} from '../api/intuneScriptsConfig'
import type {
  InventoryListItem, ResourceCategory, ItemDetailResponse,
} from '../api/intuneScriptsConfig'
import type { UserToolRole } from '../types'
import { Badge } from '../components/ui/Badge'
import { Pagination } from '../components/ui/Pagination'
import { SortableHeader } from '../components/ui/SortableHeader'
import { toggleSortDirection, type SortDirection } from '../lib/tableSorting'
import { useToast } from '../components/ui/ToastProvider'

const PAGE_SIZE = 25
const PLATFORMS = ['windows', 'macos', 'ios', 'android', 'linux'] as const

function platformLabel(p: string): string {
  const map: Record<string, string> = { windows: 'Windows', macos: 'macOS', ios: 'iOS', android: 'Android', linux: 'Linux' }
  return map[p.toLowerCase()] ?? p
}

function normalizePlatform(platforms: string | string[] | null): string {
  if (!platforms) return '—'
  const value = Array.isArray(platforms) ? platforms[0] : platforms
  return value ? platformLabel(value) : '—'
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      title="Copy"
      onClick={() => { void navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="inline-flex items-center rounded p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
    </button>
  )
}

function Field({ label, value, copyable }: { label: string; value: string | null | undefined; copyable?: boolean }) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 border-b border-slate-100 last:border-b-0">
      <span className="text-[0.68rem] font-medium text-slate-500 flex-shrink-0">{label}</span>
      <span className="text-xs text-slate-800 text-right break-all flex items-center gap-1">
        {value}
        {copyable && <CopyButton value={value} />}
      </span>
    </div>
  )
}

function DetailDrawer({ compositeId, onClose }: { compositeId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<ItemDetailResponse['data'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const { notify } = useToast()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    intuneScriptsConfigApi.getItemDetail(compositeId)
      .then(res => { if (!cancelled) setDetail(res.data) })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load details') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [compositeId])

  async function handleDownload() {
    if (!detail) return
    setDownloading(true)
    try {
      await intuneScriptsConfigApi.downloadItem(detail.compositeId, detail.displayName, detail.type)
    } catch {
      notify('error', 'Download failed', 'Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close details" className="absolute inset-0 bg-slate-900/25" onClick={onClose} />
      <div className="relative z-10 h-full w-full sm:w-[480px] bg-white shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Item Detail</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-slate-100 transition">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">Loading…</div>
        ) : error || !detail ? (
          <div className="p-8 text-center text-sm text-red-600">{error ?? 'Not found'}</div>
        ) : (
          <div className="px-5 py-4 space-y-5">
            <section>
              <h3 className="text-[0.68rem] font-semibold uppercase text-slate-400 mb-1">Item</h3>
              <Field label="Name" value={detail.displayName} copyable />
              <Field label="Resource ID" value={detail.compositeId.split(':')[1]} copyable />
              <Field label="Category" value={CATEGORY_LABELS[detail.category]} />
              <Field label="Last Modified" value={formatDate(detail.lastModifiedDateTime)} />
            </section>

            <section>
              <h3 className="text-[0.68rem] font-semibold uppercase text-slate-400 mb-1">
                Assignments ({detail.assignments.length})
              </h3>
              {detail.assignments.length === 0 ? (
                <p className="text-xs text-slate-400 py-1">Not assigned</p>
              ) : (
                <ul className="space-y-1">
                  {detail.assignments.map(a => (
                    <li key={a.id} className="text-xs text-slate-700 flex items-center gap-1.5 py-1">
                      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${a.targetType?.toLowerCase().includes('exclusion') ? 'bg-red-400' : 'bg-emerald-400'}`} />
                      {a.groupDisplayName ?? a.groupId ?? a.targetType ?? 'Unknown target'}
                      {a.targetType?.toLowerCase().includes('exclusion') && <span className="text-red-500 text-[0.62rem] font-semibold">(excluded)</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-[0.68rem] font-semibold uppercase text-slate-400">Raw record</h3>
              </div>
              <pre className="text-[0.62rem] bg-slate-50 border border-slate-100 rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto text-slate-600">
                {JSON.stringify(detail.raw, null, 2)}
              </pre>
            </section>

            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={downloading}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white transition disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,#10B981,#0EA5E9)' }}
            >
              {downloading ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Downloading…</> : <><Download className="h-3.5 w-3.5" />Download</>}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

interface Props {
  viewerRole: UserToolRole
  userEmail?: string
}

// Rendered as the "Scripts & Configs" tab within IntuneDevicesPage (itself
// nested inside ManagedDevicesPage) — not a standalone routed page, so
// there's no onBack/page-level header here; the parent page(s) already
// provide the title and Back button.
export function IntuneScriptsConfigTab({ viewerRole, userEmail }: Props) {
  useEffect(() => { setIntuneScriptsConfigActor(viewerRole, userEmail ?? 'unknown@zinnia.com') }, [viewerRole, userEmail])

  const [items, setItems] = useState<InventoryListItem[]>([])
  const [total, setTotal] = useState(0)
  const [configured, setConfigured] = useState(true)
  const [categoryErrors, setCategoryErrors] = useState<Partial<Record<ResourceCategory, string>>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<ResourceCategory | 'all'>('all')
  const [platform, setPlatform] = useState<string | 'all'>('all')
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState<'name' | 'category' | 'platform' | 'modified'>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [detailId, setDetailId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [exportingSelected, setExportingSelected] = useState(false)
  const [exportingAll, setExportingAll] = useState(false)
  const { notify } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await intuneScriptsConfigApi.listItems({
        search: search.trim() || undefined,
        category: category === 'all' ? undefined : category,
        platform: platform === 'all' ? undefined : platform,
        page, pageSize: PAGE_SIZE, sortBy: sortKey, sortDirection,
      })
      setItems(res.data)
      setTotal(res.pagination.total)
      setConfigured(res.configured)
      setCategoryErrors(res.categoryErrors)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Intune scripts & configurations')
    } finally {
      setLoading(false)
    }
  }, [search, category, platform, page, sortKey, sortDirection])

  useEffect(() => { void load() }, [load])
  useEffect(() => { setPage(1) }, [search, category, platform])

  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const allOnPageSelected = items.length > 0 && items.every(i => selectedIds.has(i.compositeId))
  const someOnPageSelected = items.some(i => selectedIds.has(i.compositeId))

  // Selects/deselects only the current page — selections on other pages are
  // preserved so a multi-page bulk export can be built up page by page.
  const toggleSelectAllOnPage = () => setSelectedIds(prev => {
    const next = new Set(prev)
    if (allOnPageSelected) items.forEach(i => next.delete(i.compositeId))
    else items.forEach(i => next.add(i.compositeId))
    return next
  })

  async function handleDownload(item: InventoryListItem) {
    setDownloadingId(item.compositeId)
    try {
      await intuneScriptsConfigApi.downloadItem(item.compositeId, item.displayName, item.type)
    } catch {
      notify('error', 'Download failed', 'Please try again.')
    } finally {
      setDownloadingId(null)
    }
  }

  async function handleDownloadSelected() {
    setExportingSelected(true)
    try {
      await intuneScriptsConfigApi.exportSelected([...selectedIds])
      notify('success', 'Export complete', `Exported ${selectedIds.size} item(s)`)
      setSelectedIds(new Set())
    } catch {
      notify('error', 'Export failed', 'Please try again.')
    } finally {
      setExportingSelected(false)
    }
  }

  async function handleExportAll() {
    setExportingAll(true)
    try {
      await intuneScriptsConfigApi.exportAll({
        category: category === 'all' ? undefined : category,
        platform: platform === 'all' ? undefined : platform,
        search: search.trim() || undefined,
      })
      notify('success', 'Export complete', 'Your download should begin shortly.')
    } catch {
      notify('error', 'Export failed', 'Please try again.')
    } finally {
      setExportingAll(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasCategoryErrors = Object.keys(categoryErrors).length > 0
  const handleSort = (key: typeof sortKey) => {
    setSortDirection(direction => toggleSortDirection(sortKey, direction, key))
    setSortKey(key)
    setPage(1)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-4 flex-wrap">
        <button
          type="button"
          onClick={() => void handleExportAll()}
          disabled={exportingAll || !configured || total === 0}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white transition disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg,#10B981,#0EA5E9)' }}
        >
          {exportingAll ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Exporting…</> : <><Package className="h-3.5 w-3.5" />Export All</>}
        </button>
      </div>

      {!configured ? (
        <div className="glass rounded-2xl p-10 text-center">
          <FileCode2 className="mx-auto h-8 w-8 text-slate-300 mb-3" />
          <p className="text-sm text-slate-500 font-medium">Intune isn't connected</p>
          <p className="text-xs text-slate-400 mt-1">Connect Intune in Settings to browse scripts and configurations.</p>
        </div>
      ) : (
        <>
          {/* Category pills */}
          <div className="flex gap-1 glass rounded-2xl p-1 flex-wrap">
            <button type="button" onClick={() => setCategory('all')}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${category === 'all' ? 'is-selected' : 'text-slate-500 hover:text-slate-700'}`}>
              All
            </button>
            {ALL_CATEGORIES.map(c => (
              <button key={c} type="button" onClick={() => setCategory(c)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${category === c ? 'is-selected' : 'text-slate-500 hover:text-slate-700'}`}>
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>

          {/* Search + platform filter */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name…"
                className="h-9 w-full rounded-xl pl-9 pr-3 text-xs water-input" />
              {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2"><X className="h-3.5 w-3.5 text-slate-400" /></button>}
            </div>
            <button type="button" onClick={() => setPlatform('all')}
              className={`rounded-full border px-3 py-1 text-[0.68rem] font-semibold transition ${platform === 'all' ? 'text-white border-transparent' : 'border-slate-200 glass text-slate-600 hover:border-slate-300'}`}
              style={platform === 'all' ? { background: 'linear-gradient(135deg,#0078D4,#6366F1)' } : {}}>
              All Platforms
            </button>
            {PLATFORMS.map(p => (
              <button key={p} type="button" onClick={() => setPlatform(p)}
                className={`rounded-full border px-3 py-1 text-[0.68rem] font-semibold transition ${platform === p ? 'text-white border-transparent' : 'border-slate-200 glass text-slate-600 hover:border-slate-300'}`}
                style={platform === p ? { background: 'linear-gradient(135deg,#0078D4,#6366F1)' } : {}}>
                {platformLabel(p)}
              </button>
            ))}
            <span className="ml-auto self-center text-[0.65rem] text-slate-400">
              {total.toLocaleString()} item{total !== 1 ? 's' : ''}
            </span>
          </div>

          {hasCategoryErrors && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Some categories failed to load: {Object.entries(categoryErrors).map(([cat, msg]) => `${CATEGORY_LABELS[cat as ResourceCategory]} (${msg})`).join('; ')}
            </div>
          )}

          {/* Bulk toolbar */}
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#0078D4]/20 bg-sky-50 px-4 py-3">
              <span className="text-xs font-bold text-[#0078D4]">{selectedIds.size} item{selectedIds.size > 1 ? 's' : ''} selected</span>
              <button
                type="button"
                onClick={() => void handleDownloadSelected()}
                disabled={exportingSelected}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white transition disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#0078D4,#6366F1)' }}
              >
                {exportingSelected ? <><RefreshCw className="h-3 w-3 animate-spin" />Exporting…</> : <><Download className="h-3 w-3" />Download Selected (ZIP)</>}
              </button>
              <button type="button" onClick={() => setSelectedIds(new Set())} className="text-xs font-semibold text-slate-500 hover:text-slate-700">
                Clear
              </button>
            </div>
          )}

          {/* Table */}
          <div className="glass rounded-2xl overflow-hidden">
            <div className="h-[2px]" style={{ background: 'linear-gradient(90deg,#0078D4,#0EA5E9,#6366F1)' }} />
            {loading ? (
              <div className="p-10 text-center">
                <RefreshCw className="mx-auto h-6 w-6 animate-spin text-slate-300 mb-3" />
                <p className="text-sm text-slate-400">Loading…</p>
              </div>
            ) : error ? (
              <div className="p-10 text-center text-sm text-red-600">{error}</div>
            ) : items.length === 0 ? (
              <div className="p-10 text-center">
                <FileCode2 className="mx-auto h-8 w-8 text-slate-300 mb-3" />
                <p className="text-sm text-slate-400">No items match your filters</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="z-table">
                    <thead>
                      <tr>
                        <th className="w-8">
                          <input
                            type="checkbox"
                            ref={el => { if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected }}
                            checked={allOnPageSelected}
                            onChange={toggleSelectAllOnPage}
                            aria-label="Select all items on this page"
                            className="h-3.5 w-3.5 rounded border-slate-300"
                          />
                        </th>
                        <SortableHeader label="Name" sortKey="name" activeSortKey={sortKey} direction={sortDirection} onSort={key => handleSort(key as typeof sortKey)} />
                        <SortableHeader label="Category" sortKey="category" activeSortKey={sortKey} direction={sortDirection} onSort={key => handleSort(key as typeof sortKey)} />
                        <SortableHeader label="Platform" sortKey="platform" activeSortKey={sortKey} direction={sortDirection} onSort={key => handleSort(key as typeof sortKey)} />
                        <SortableHeader label="Last Modified" sortKey="modified" activeSortKey={sortKey} direction={sortDirection} onSort={key => handleSort(key as typeof sortKey)} />
                        <th>Assigned</th><th />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(item => (
                        <tr key={item.compositeId} onClick={() => setDetailId(item.compositeId)} className="cursor-pointer">
                          <td onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(item.compositeId)}
                              onChange={() => toggleSelect(item.compositeId)}
                              className="h-3.5 w-3.5 rounded border-slate-300"
                            />
                          </td>
                          <td><span className="font-semibold text-slate-700">{item.displayName}</span></td>
                          <td><Badge label={CATEGORY_LABELS[item.category]} variant="blue" /></td>
                          <td className="text-slate-500 text-[0.7rem]">{normalizePlatform(item.platforms)}</td>
                          <td className="text-slate-400 text-[0.68rem]">{formatDate(item.lastModifiedDateTime)}</td>
                          <td>
                            {item.isAssigned ? (
                              <span className="inline-flex items-center gap-1 text-[0.68rem] font-bold text-emerald-600"><CheckCircle2 className="h-3 w-3" />Assigned</span>
                            ) : item.isAssigned === false ? (
                              <span className="inline-flex items-center gap-1 text-[0.68rem] font-bold text-slate-400"><XCircle className="h-3 w-3" />Not assigned</span>
                            ) : (
                              <span className="text-slate-300 text-[0.68rem]">—</span>
                            )}
                          </td>
                          <td onClick={e => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => void handleDownload(item)}
                              disabled={downloadingId === item.compositeId}
                              title="Download"
                              className="rounded-lg p-1.5 text-slate-400 hover:text-[#0078D4] hover:bg-slate-100 transition disabled:opacity-50"
                            >
                              {downloadingId === item.compositeId
                                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                : <Download className="h-3.5 w-3.5" />}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  totalItems={total}
                  pageSize={PAGE_SIZE}
                  itemLabel="item"
                />
              </>
            )}
          </div>
        </>
      )}

      {detailId && <DetailDrawer compositeId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  )
}
