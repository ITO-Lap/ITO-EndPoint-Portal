import type { StatCardData } from '../types'

export function StatCard({ data }: { data: StatCardData }) {
  const Icon = data.icon
  const isPositive = data.trend.startsWith('↑')
  const trendTextColor = isPositive ? 'text-emerald-600' : 'text-red-600'

  return (
    <article className="rounded-[28px] border border-slate-300 bg-white p-6 shadow-md shadow-slate-900/10 transition hover:-translate-y-0.5 hover:shadow-lg w-full min-w-0">
      <div className="flex items-start justify-between gap-4 min-w-0">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-400 truncate">{data.title}</p>
          <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-950 truncate">{data.value}</p>
        </div>
        <div className={`grid h-14 w-14 place-items-center rounded-3xl ${data.iconBg} ${data.iconText} flex-shrink-0`}>
          <Icon className="h-7 w-7" />
        </div>
      </div>
      <div className="mt-6 flex items-center justify-between gap-4 text-sm text-slate-500">
        <span className={`font-semibold ${trendTextColor}`}>{data.trend}</span>
        <span>{data.trendChange}</span>
      </div>
    </article>
  )
}
