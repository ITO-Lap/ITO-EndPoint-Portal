import { ShieldAlert } from 'lucide-react'
import type { ComplianceDetailRow } from '../../types'
import { Badge } from '../ui/Badge'
import { DashboardCard } from '../ui/DashboardCard'

interface ComplianceDetailsProps {
  rows: ComplianceDetailRow[]
  onRowClick?: (row: ComplianceDetailRow) => void
}

export function ComplianceDetails({ rows, onRowClick }: ComplianceDetailsProps) {
  return (
    <DashboardCard title="Compliance / Issue Details" icon={ShieldAlert}>
      <div className="divide-y divide-slate-100 min-w-0 w-full">
        {rows.map((row) => {
          const showValueText = row.value && row.value !== row.badge?.label
          const isClickable = onRowClick && row.label === 'Policy Failed' && row.value && row.value !== 'None' && row.value !== 'N/A'
          return (
            <div
              key={row.label}
              className={`flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0 min-w-0 ${
                isClickable ? 'rounded-lg px-2 -mx-2 cursor-pointer hover:bg-indigo-50 transition group' : ''
              }`}
              onClick={isClickable ? () => onRowClick(row) : undefined}
              role={isClickable ? 'button' : undefined}
              tabIndex={isClickable ? 0 : undefined}
              onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') onRowClick(row) } : undefined}
              aria-label={isClickable ? `View policy details: ${row.value}` : undefined}
            >
              <span className={`text-xs shrink-0 w-[46%] leading-snug pt-0.5 ${isClickable ? 'text-indigo-600 group-hover:text-indigo-700 font-medium' : 'text-slate-500'}`}>
                {row.label}
                {isClickable && <span className="ml-1 text-[0.6rem] opacity-60">↗</span>}
              </span>
              <div className="flex flex-col items-end gap-1 min-w-0 text-right">
                {row.badge ? (
                  <Badge label={row.badge.label} variant={row.badge.variant} className="text-[0.62rem] px-2 py-0.5 h-fit" />
                ) : null}
                {showValueText ? (
                  <span className="text-[0.7rem] font-medium text-slate-800 break-words leading-snug">{row.value}</span>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </DashboardCard>
  )
}
