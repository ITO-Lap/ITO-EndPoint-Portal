import type { ComplianceSegment } from '../types'
import { DashboardCard } from './DashboardCard'

interface ComplianceDonutProps {
  segments: ComplianceSegment[]
}

export function ComplianceDonut({ segments }: ComplianceDonutProps) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  const segmentsWithPercent = segments.map((segment) => ({
    ...segment,
    ratio: Math.round((segment.value / total) * 1000) / 10,
  }))
  const gradient = segmentsWithPercent
    .map((segment, index) => {
      const start = segmentsWithPercent.slice(0, index).reduce((sum, item) => sum + item.ratio, 0)
      const end = start + segment.ratio
      return `${segment.color} ${start}% ${end}%`
    })
    .join(', ')

  return (
    <DashboardCard title="Compliance Status Overview">
      <div className="flex items-center gap-5 w-full min-w-0">
        {/* Donut chart */}
        <div className="flex-shrink-0 flex items-center justify-center">
          <div className="relative flex h-[140px] w-[140px] items-center justify-center rounded-full bg-slate-100 shadow-inner shadow-slate-900/10">
            <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(${gradient})` }} />
            <div className="relative flex h-[76px] w-[76px] items-center justify-center rounded-full bg-white text-center shadow-lg shadow-slate-900/10">
              <div>
                <p className="text-[0.55rem] uppercase tracking-wider text-slate-400">Total</p>
                <p className="mt-0.5 text-sm font-bold text-slate-900">12,842</p>
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-2.5 min-w-0">
          {segmentsWithPercent.map((segment) => (
            <div key={segment.label} className="flex items-start gap-2.5 min-w-0">
              <span className="mt-1 h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: segment.color }} />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 leading-tight">{segment.label}</p>
                <p className="text-[0.65rem] text-slate-500 mt-0.5">
                  {segment.value.toLocaleString()} <span className="text-slate-400">·</span> {segment.percent}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardCard>
  )
}
