import type { StatCardData } from '../../types'

interface StatCardProps {
  data: StatCardData
  onClick?: () => void
  selected?: boolean
}

export function StatCard({ data, onClick, selected = false }: StatCardProps) {
  const Icon = data.icon
  const isPositive = data.trend.startsWith('↑')
  const trendTextColor = isPositive ? 'text-emerald-600' : 'text-red-500'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`group flex flex-col rounded-2xl border bg-white p-3 shadow-sm shadow-slate-900/8 transition w-full min-w-0 h-full text-left focus-visible:ring-2 focus-visible:ring-orange-300 ${
        selected
          ? 'border-orange-400 ring-2 ring-orange-300/60 -translate-y-0.5 shadow-md'
          : 'border-slate-200 hover:-translate-y-0.5 hover:shadow-md hover:border-slate-300'
      } ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex items-start justify-between gap-2 min-w-0">
        <p className="text-[0.6rem] font-semibold uppercase tracking-widest text-slate-500 leading-snug break-words">{data.title}</p>
        <div className={`grid h-8 w-8 place-items-center rounded-xl ${data.iconBg} ${data.iconText} flex-shrink-0`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2.5 text-[1.4rem] font-bold tracking-tight text-slate-900 leading-none">{data.value}</p>
      <div className="mt-auto pt-3 flex items-center justify-between gap-2 text-xs">
        <span className={`font-bold ${trendTextColor}`}>{data.trend}</span>
        <span className="text-slate-400 text-[0.6rem]">{data.trendChange}</span>
      </div>
    </button>
  )
}
