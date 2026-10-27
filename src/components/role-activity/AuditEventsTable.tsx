import { useState } from 'react'
import { RefreshCw, ChevronUp, ChevronDown, Columns3, Loader2 } from 'lucide-react'
import type { RoleActivityEvent } from '../../api/roleActivity'
import { Pagination } from '../ui/Pagination'
import { SortableHeader } from '../ui/SortableHeader'
import { ALL_COLUMNS, DEFAULT_VISIBLE_COLUMNS } from './auditColumns'

interface Props {
  events: RoleActivityEvent[]
  loading: boolean
  error: string | null
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  sortField: string
  sortDirection: 'asc' | 'desc'
  onSortChange: (field: string, direction: 'asc' | 'desc') => void
  timezone: string
  onRowClick: (event: RoleActivityEvent) => void
  onRefresh: () => void
  lastRefreshed: Date | null
}

export function AuditEventsTable({
  events, loading, error, page, pageSize, total, onPageChange, onPageSizeChange,
  sortField, sortDirection, onSortChange, timezone, onRowClick, onRefresh, lastRefreshed,
}: Props) {
  const [visibleKeys, setVisibleKeys] = useState<string[]>(DEFAULT_VISIBLE_COLUMNS)
  const [chooserOpen, setChooserOpen] = useState(false)
  const columns = ALL_COLUMNS.filter(c => visibleKeys.includes(c.key))
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function toggleColumn(key: string) {
    setVisibleKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  function handleSort(key: string) {
    if (sortField === key) onSortChange(key, sortDirection === 'asc' ? 'desc' : 'asc')
    else onSortChange(key, 'desc')
  }

  return (
    <div className="rounded-xl border border-slate-200/60 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="font-semibold text-slate-700">{total.toLocaleString()} events</span>
          {lastRefreshed && <span>Last refreshed {lastRefreshed.toLocaleTimeString()}</span>}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="audit-page-size" className="text-[0.68rem] text-slate-500">Rows:</label>
          <select id="audit-page-size" value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))}
            className="h-7 rounded-lg border border-slate-200 bg-white px-1.5 text-xs text-slate-700 focus:outline-none focus:border-orange-400">
            {[10, 25, 50, 100, 200].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <div className="relative">
            <button type="button" onClick={() => setChooserOpen(o => !o)} title="Choose columns"
              aria-expanded={chooserOpen}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
              <Columns3 className="h-3.5 w-3.5" aria-hidden="true" /> Columns
            </button>
            {chooserOpen && (
              <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-slate-200 bg-white shadow-lg p-2 max-h-72 overflow-y-auto">
                {ALL_COLUMNS.map(c => (
                  <label key={c.key} className="flex items-center gap-2 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50 rounded cursor-pointer">
                    <input type="checkbox" checked={visibleKeys.includes(c.key)} onChange={() => toggleColumn(c.key)} className="cursor-pointer" />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={onRefresh} title="Refresh"
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div role="alert" className="p-6 text-center text-sm text-red-600">{error}</div>
      ) : loading && events.length === 0 ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-slate-400" aria-hidden="true" /></div>
      ) : events.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-400">No role activity events match the current filters and range.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-500 font-semibold">
                {columns.map(c => (
                  c.sortable
                    ? <SortableHeader key={c.key} label={c.label} sortKey={c.key} activeSortKey={sortField} direction={sortDirection} onSort={handleSort} className="px-3 py-2.5 whitespace-nowrap" />
                    : <th key={c.key} scope="col" className="px-3 py-2.5 whitespace-nowrap">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.map(event => (
                <tr key={event.id} tabIndex={0} onClick={() => onRowClick(event)}
                  onKeyDown={e => { if (e.key === 'Enter') onRowClick(event) }}
                  className="hover:bg-slate-50/60 focus:bg-orange-50/50 transition-colors cursor-pointer focus:outline-none">
                  {columns.map(c => (
                    <td key={c.key} className="px-3 py-2.5 text-slate-700 max-w-[220px] truncate">{c.render(event, timezone)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} totalItems={total} pageSize={pageSize} itemLabel="event" />
    </div>
  )
}
