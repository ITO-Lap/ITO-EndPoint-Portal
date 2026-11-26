import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import type { ReactNode } from 'react'

interface SortableHeaderProps {
  label: string
  sortKey: string
  activeSortKey: string | null
  direction: 'asc' | 'desc'
  onSort: (sortKey: string) => void
  className?: string
  children?: ReactNode
}

export function SortableHeader({ label, sortKey, activeSortKey, direction, onSort, className = '', children }: SortableHeaderProps) {
  const active = activeSortKey === sortKey
  return (
    <th scope="col" aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'} className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 text-inherit hover:text-[#4F46E5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 rounded"
        title={`Sort by ${label}`}
      >
        {label}
        {active
          ? direction === 'asc' ? <ArrowUp className="h-3 w-3 shrink-0" aria-hidden="true" /> : <ArrowDown className="h-3 w-3 shrink-0" aria-hidden="true" />
          : <ArrowUpDown className="h-3 w-3 shrink-0 opacity-40" aria-hidden="true" />}
      </button>
      {children}
    </th>
  )
}