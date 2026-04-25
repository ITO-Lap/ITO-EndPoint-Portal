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
      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr] grid-cols-1 w-full">
        <div className="flex items-center justify-center min-w-0">
          <div className="relative flex h-40 w-40 md:h-48 md:w-48 items-center justify-center rounded-full bg-slate-100 shadow-inner shadow-slate-900/10 flex-shrink-0">
            <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(${gradient})` }} />
            <div className="relative flex h-24 w-24 md:h-32 md:w-32 items-center justify-center rounded-full bg-white text-center shadow-lg shadow-slate-900/10">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Total</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">12,842</p>
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-4 min-w-0 w-full">
          {segmentsWithPercent.map((segment) => (
            <div key={segment.label} className="flex items-center gap-3 rounded-3xl border border-slate-200/80 bg-slate-50 p-4 min-w-0">
              <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: segment.color }} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 truncate">{segment.label}</p>
                <p className="text-sm text-slate-500 truncate">{segment.value.toLocaleString()} ({segment.percent})</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardCard>
  )
}
