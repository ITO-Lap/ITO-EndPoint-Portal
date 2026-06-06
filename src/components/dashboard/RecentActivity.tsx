import { Laptop2, Activity } from 'lucide-react'
import type { ActivityItem } from '../../types'
import { DashboardCard } from '../ui/DashboardCard'

interface RecentActivityProps {
  items: ActivityItem[]
  onViewAll?: () => void
  onRowClick?: (deviceName: string) => void
}

const STATUS_CONFIG = {
  'Compliant':     { dot: '#10B981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.20)', text: '#059669', label: 'Compliant'     },
  'Warning':       { dot: '#F59E0B', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.20)', text: '#B45309', label: 'Warning'       },
  'Non-Compliant': { dot: '#EF4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.20)',  text: '#DC2626', label: 'Non-Compliant' },
} as const

type StatusKey = keyof typeof STATUS_CONFIG

export function RecentActivity({ items, onViewAll, onRowClick }: RecentActivityProps) {
  return (
    <DashboardCard
      title="Recent Activity"
      icon={Activity}
      accentColor="#0EA5E9"
      action={
        <button
          type="button"
          onClick={onViewAll}
          className="text-[0.68rem] font-bold rounded-full px-2.5 py-1 water-glow-sm transition-all"
          style={{ color: '#0EA5E9', background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.22)' }}
        >
          View All
        </button>
      }
    >
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div
            className="grid h-12 w-12 place-items-center rounded-2xl mb-3 water-glow-sm"
            style={{ background: 'rgba(255,255,255,0.70)', border: '1px solid rgba(148,163,184,0.20)' }}
          >
            <Activity className="h-5 w-5 text-slate-300" />
          </div>
          <p className="text-sm font-bold text-slate-400 mb-0.5">No activity yet</p>
          <p className="text-xs text-slate-300">Connect an MDM source to see device events</p>
        </div>
      ) : (
        <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: '22rem' }}>
          {items.map((item, idx) => {
            const statusKey = (item.status ?? (item.color === 'green' ? 'Compliant' : item.color === 'red' ? 'Non-Compliant' : 'Warning')) as StatusKey
            const cfg       = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG['Warning']

            return (
              <button
                key={item.device ?? idx}
                type="button"
                onClick={() => onRowClick?.(item.device)}
                className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-all w-full text-left water-glow"
                style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(148,163,184,0.12)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.80)' }}
              >
                {/* Device icon */}
                <div
                  className="grid h-8 w-8 place-items-center rounded-xl flex-shrink-0 transition-all duration-200 group-hover:scale-105"
                  style={{ background: 'rgba(255,255,255,0.80)', border: '1px solid rgba(148,163,184,0.15)', color: '#94A3B8' }}
                >
                  <Laptop2 className="h-3.5 w-3.5" />
                </div>

                {/* Text */}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-700 truncate">{item.device}</p>
                  <p className="text-[0.65rem] text-slate-400 truncate mt-0.5">{item.message}</p>
                </div>

                {/* Status */}
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.58rem] font-black backdrop-blur-sm"
                    style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.text }}
                  >
                    <span className="h-1 w-1 rounded-full animate-pulse" style={{ background: cfg.dot }} />
                    {cfg.label}
                  </span>
                  <span className="text-[0.58rem] text-slate-300">{item.time}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </DashboardCard>
  )
}
