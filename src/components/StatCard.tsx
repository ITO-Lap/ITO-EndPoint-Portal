import type { StatCardData } from '../types'

export function StatCard({ data }: { data: StatCardData }) {
  const Icon = data.icon
  const isPositive = data.trend.startsWith('↑')
  const trendTextColor = isPositive ? 'text-emerald-600' : 'text-red-500'

  return (
    <article className="flex flex-col rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/8 transition hover:-translate-y-0.5 hover:shadow-md w-full min-w-0 h-full">
      <div className="flex items-start justify-between gap-3 min-w-0">
        <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-slate-500 leading-snug break-words">{data.title}</p>
        <div className={`grid h-10 w-10 place-items-center rounded-2xl ${data.iconBg} ${data.iconText} flex-shrink-0`}>
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
      <p className="mt-3 text-[1.6rem] font-bold tracking-tight text-slate-900 leading-none break-words">{data.value}</p>
      <div className="mt-auto pt-4 flex items-center justify-between gap-3 text-xs">
        <span className={`font-bold ${trendTextColor}`}>{data.trend}</span>
        <span className="text-slate-400 text-[0.65rem]">{data.trendChange}</span>
      </div>
    </article>
  )
}
