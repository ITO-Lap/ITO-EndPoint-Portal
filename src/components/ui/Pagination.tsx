import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  totalItems: number
  pageSize: number
  itemLabel?: string
  itemLabelPlural?: string
}

// Shared pagination control — same visual language across the whole app
// (originally used across several device-listing pages). Page numbers
// are windowed (first, last, current±1, ellipsis) so a dataset with hundreds
// of pages never renders hundreds of buttons in a row.
export function Pagination({ page, totalPages, onPageChange, totalItems, pageSize, itemLabel = 'item', itemLabelPlural }: PaginationProps) {
  if (totalItems === 0) return null

  const start = Math.min((page - 1) * pageSize + 1, totalItems)
  const end   = Math.min(page * pageSize, totalItems)
  const label = totalItems === 1 ? itemLabel : (itemLabelPlural ?? `${itemLabel}s`)

  const pages: (number | 'ellipsis')[] = []
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) {
      pages.push(p)
    } else if (pages[pages.length - 1] !== 'ellipsis') {
      pages.push('ellipsis')
    }
  }

  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 bg-slate-50 flex-wrap gap-2">
      <p className="text-[0.68rem] text-slate-500">
        Showing {start}–{end} of {totalItems} {label}
      </p>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1}
          className="rounded-lg border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-orange-300"
          aria-label="Previous page">
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        {pages.map((p, i) => p === 'ellipsis' ? (
          <span key={`ellipsis-${i}`} className="px-1.5 text-[0.68rem] text-slate-400">…</span>
        ) : (
          <button key={p} type="button" onClick={() => onPageChange(p)}
            className={`rounded-lg border px-2.5 py-1 text-[0.68rem] font-semibold transition focus-visible:ring-2 focus-visible:ring-orange-300 ${
              p === page ? 'bg-orange-600 border-orange-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}>
            {p}
          </button>
        ))}
        <button type="button" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}
          className="rounded-lg border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-orange-300"
          aria-label="Next page">
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
