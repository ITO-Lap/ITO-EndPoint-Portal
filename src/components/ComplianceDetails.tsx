import { ShieldAlert } from 'lucide-react'
import type { ComplianceDetailRow } from '../types'
import { Badge } from './Badge'
import { DashboardCard } from './DashboardCard'

interface ComplianceDetailsProps {
  rows: ComplianceDetailRow[]
}

export function ComplianceDetails({ rows }: ComplianceDetailsProps) {
  return (
    <DashboardCard title="Compliance / Issue Details" icon={ShieldAlert}>
      <div className="divide-y divide-slate-100 min-w-0 w-full">
        {rows.map((row) => {
          const showValueText = row.value && row.value !== row.badge?.label
          return (
            <div key={row.label} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0 min-w-0">
              <span className="text-xs text-slate-500 shrink-0 w-[46%] leading-snug pt-0.5">{row.label}</span>
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
