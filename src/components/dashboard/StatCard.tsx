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
      className={`group flex flex-col rounded-[18px] border bg-white p-4 shadow-sm shadow-slate-900/8 transition w-full min-w-0 h-full text-left focus-visible:ring-2 focus-visible:ring-sky-300 ${
        selected
          ? 'border-sky-400 ring-2 ring-sky-300/60 -translate-y-0.5 shadow-md'
          : 'border-slate-200 hover:-translate-y-0.5 hover:shadow-md hover:border-slate-300'
      } ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
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
    </button>
  )
}
