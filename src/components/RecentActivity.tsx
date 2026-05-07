import { Laptop2 } from 'lucide-react'
import type { ActivityItem, DeviceData } from '../types'
import { getDeviceByName } from '../data/dashboardData'
import { Badge } from './Badge'
import { DashboardCard } from './DashboardCard'

interface RecentActivityProps {
  items: ActivityItem[]
  onViewAll?: () => void
  onRowClick?: (device: DeviceData) => void
}

const statusVariantMap = {
  green: 'green',
  yellow: 'yellow',
  red: 'red',
} as const

export function RecentActivity({ items, onViewAll, onRowClick }: RecentActivityProps) {
  const handleRowClick = (deviceName: string) => {
    const device = getDeviceByName(deviceName)
    if (device && onRowClick) {
      onRowClick(device)
    }
  }

  return (
    <DashboardCard
      title="Recent Activity"
      action={
        <button
          type="button"
          onClick={onViewAll}
          className="text-xs font-semibold text-sky-600 hover:text-sky-700 focus-visible:ring-2 focus-visible:ring-sky-300 rounded px-1 flex-shrink-0"
        >
          View All
        </button>
      }
    >
      <div className="space-y-1.5 min-w-0 w-full">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="rounded-full bg-slate-100 p-3 mb-3">
              <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-900 mb-1">No activities found</p>
            <p className="text-xs text-slate-500">Try adjusting your filters.</p>
          </div>
        ) : (
          items.map((item) => (
            <button
              key={item.device}
              type="button"
              onClick={() => handleRowClick(item.device)}
              className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-slate-50 px-3 py-2.5 hover:bg-slate-100 hover:border-sky-300/60 focus-visible:ring-2 focus-visible:ring-sky-300 transition w-full text-left min-w-0"
            >
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-800 text-slate-200 flex-shrink-0">
                <Laptop2 className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-900 truncate">{item.device}</p>
                <p className="text-[0.65rem] text-slate-500 truncate mt-0.5">{item.message}</p>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <Badge variant={statusVariantMap[item.color]} label={item.status} className="px-2 py-0.5 text-[0.62rem]" />
                <span className="text-[0.62rem] text-slate-400 whitespace-nowrap">{item.time}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </DashboardCard>
  )
}
