import { Circle, Laptop2 } from 'lucide-react'
import type { ActivityItem } from '../types'
import { Badge } from './Badge'
import { DashboardCard } from './DashboardCard'

interface RecentActivityProps {
  items: ActivityItem[]
}

const statusVariantMap = {
  green: 'green',
  yellow: 'yellow',
  red: 'red',
} as const

export function RecentActivity({ items }: RecentActivityProps) {
  return (
    <DashboardCard title="Recent Activity" action={<a href="#" className="text-sm font-semibold text-sky-600 hover:text-sky-700 flex-shrink-0">View All</a>}>
      <div className="space-y-3 min-w-0 w-full">
        {items.map((item) => (
          <div key={item.device} className="flex items-center justify-between gap-3 rounded-3xl border border-slate-200/80 bg-slate-50 px-4 py-5 shadow-sm shadow-slate-900/5 min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="grid h-11 w-11 place-items-center rounded-3xl bg-slate-900 text-slate-100 flex-shrink-0">
                <Laptop2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{item.device}</p>
                <p className="text-sm text-slate-500 truncate">{item.message}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <Badge variant={statusVariantMap[item.color]} label={item.status} className="flex-shrink-0" />
              <div className="flex items-center gap-2 text-xs text-slate-500 flex-shrink-0">
                <Circle className="h-2.5 w-2.5 text-slate-400 flex-shrink-0" />
                <span className="whitespace-nowrap">{item.time}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </DashboardCard>
  )
}
