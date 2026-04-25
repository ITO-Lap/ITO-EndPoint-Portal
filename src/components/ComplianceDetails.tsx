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
      <div className="space-y-4 min-w-0 w-full">
        {rows.map((row) => (
          <div key={row.label} className="grid gap-2 rounded-[24px] border border-slate-200/80 bg-slate-50 px-4 py-4 min-w-0 w-full">
            <div className="flex items-center justify-between gap-4 min-w-0">
              <span className="text-sm font-medium text-slate-600 min-w-0 truncate">{row.label}</span>
              {row.badge ? <Badge label={row.badge.label} variant={row.badge.variant} className="flex-shrink-0" /> : null}
            </div>
            <p className="text-sm text-slate-900 min-w-0 break-words">{row.value}</p>
          </div>
        ))}
      </div>
    </DashboardCard>
  )
}
