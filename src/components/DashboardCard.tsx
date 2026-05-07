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
    <div className={`flex flex-col rounded-[18px] border border-slate-200 bg-white shadow-sm shadow-slate-900/8 w-full min-w-0 h-full ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 min-w-0 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {Icon ? (
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600 flex-shrink-0">
              <Icon className="h-4 w-4" />
            </span>
          ) : null}
          <h3 className="text-sm font-semibold text-slate-900 break-words">{title}</h3>
        </div>
        {action ? <div className="flex-shrink-0">{action}</div> : null}
      </div>
      <div className="flex-1 px-4 py-3.5 min-w-0 w-full">{children}</div>
    </div>
  )
}
