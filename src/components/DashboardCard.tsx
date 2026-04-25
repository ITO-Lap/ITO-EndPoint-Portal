import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface DashboardCardProps {
  title: string
  icon?: LucideIcon
  action?: ReactNode
  className?: string
  children: ReactNode
}

export function DashboardCard({ title, icon: Icon, action, className = '', children }: DashboardCardProps) {
  return (
    <div className={`rounded-[28px] border border-slate-300 bg-white shadow-md shadow-slate-900/10 w-full min-w-0 ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 px-6 py-5 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          {Icon ? (
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 text-slate-700 flex-shrink-0">
              <Icon className="h-5 w-5" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900 truncate">{title}</h3>
          </div>
        </div>
        {action ? <div className="flex-shrink-0">{action}</div> : null}
      </div>
      <div className="px-6 py-5 min-w-0 w-full">{children}</div>
    </div>
  )
}
