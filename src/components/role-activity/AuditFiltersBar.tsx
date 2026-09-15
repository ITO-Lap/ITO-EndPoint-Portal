import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { RoleActivityFilters, RoleActivitySource, FilterOptions } from '../../api/roleActivity'
import { SOURCE_LABELS } from '../../api/roleActivity'

interface Props {
  filters: RoleActivityFilters
  onChange: (next: RoleActivityFilters) => void
  source: RoleActivitySource | undefined
  onSourceChange: (next: RoleActivitySource | undefined) => void
  filterOptions: FilterOptions | null
}

// A single Search box covers actor/operation/target (the server does a
// combined substring match across all three — see `search` in
// server/src/routes/roleActivity.ts), so separate Actor/Operation/Target
// inputs were redundant with it and just added visual clutter. Source is
// kept as its own control since it's a distinct dropdown, not a substring
// match.
export function AuditFiltersBar({ filters, onChange, source, onSourceChange, filterOptions }: Props) {
  const [search, setSearch] = useState(filters.search ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => setSearch(filters.search ?? ''), [filters.search])

  function handleSearchInput(value: string) {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => onChange({ search: value || undefined }), 400)
  }

  const activeCount = (filters.search ? 1 : 0) + (source ? 1 : 0)

  return (
    <div className="rounded-xl border border-slate-200/60 bg-white shadow-sm p-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          <input
            type="search" aria-label="Search role activity events" placeholder="Search actor, operation, or target…"
            value={search} onChange={e => handleSearchInput(e.target.value)}
            className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-700 focus:outline-none focus:border-orange-400"
          />
        </div>
        <select
          aria-label="Filter by source" value={source ?? ''}
          onChange={e => onSourceChange((e.target.value || undefined) as RoleActivitySource | undefined)}
          className="h-8 w-full sm:w-44 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:border-orange-400"
        >
          <option value="">All sources</option>
          {(filterOptions?.sources ?? []).map(s => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
        </select>
        {activeCount > 0 && (
          <button type="button" onClick={() => { onChange({}); onSourceChange(undefined) }}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 transition whitespace-nowrap">
            <X className="h-3 w-3" aria-hidden="true" /> Clear ({activeCount})
          </button>
        )}
      </div>
    </div>
  )
}
