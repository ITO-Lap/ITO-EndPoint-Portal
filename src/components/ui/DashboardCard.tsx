import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface DashboardCardProps {
  title: string
  icon?: LucideIcon
  action?: ReactNode
  className?: string
  accent?: boolean
  accentColor?: string
  hoverable?: boolean
  children: ReactNode
}

export function DashboardCard({
  title, icon: Icon, action, className = '',
  accent = true, accentColor, hoverable = false, children,
}: DashboardCardProps) {
  const color = accentColor ?? '#F46C00'

  return (
    <div
      className={`flex flex-col rounded-3xl w-full min-w-0 h-full overflow-hidden glass ${
        hoverable ? 'water-glow-card cursor-pointer' : ''
      } ${className}`}
    >
      {/* Gradient accent bar */}
      {accent && (
        <div
          className="flex-shrink-0 h-[2.5px] w-full"
          style={{ background: accentColor
            ? `linear-gradient(90deg, transparent, ${color}90, ${color}, transparent)`
            : 'linear-gradient(90deg, transparent 0%, #FFC600 25%, #F46C00 50%, #FB471F 75%, transparent 100%)',
          }}
        />
      )}

      {/* Header */}
      <div
        className="flex items-center justify-between gap-3 px-5 py-3.5 min-w-0 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {Icon && (
            <span
              className="grid h-7 w-7 place-items-center rounded-xl flex-shrink-0 water-glow-sm"
              style={{
                background: `linear-gradient(135deg, ${color}18, ${color}08)`,
                border: `1px solid ${color}30`,
                color,
              }}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
          )}
          <h3 className="text-sm font-bold tracking-tight text-slate-800 break-words">{title}</h3>
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>

      <div className="flex-1 px-5 py-4 min-w-0 w-full">{children}</div>
    </div>
  )
}
