import { RefreshCw, Wifi, WifiOff, Server, Cloud, Settings, Zap } from 'lucide-react'

interface SourceCount {
  intune: number
  kandji: number
  manageEngine: number
}

interface LiveDataBarProps {
  sourceCounts: SourceCount
  countdown: number
  lastUpdated: Date | null
  onRefresh: () => void
  refreshing?: boolean
}

interface SourcePill {
  id: keyof SourceCount
  label: string
  shortLabel: string
  Icon: React.ElementType
  iconColor: string
  pillBg: string
  pillBorder: string
  pillText: string
  dotColor: string
}

const SOURCES: SourcePill[] = [
  {
    id: 'intune',
    label: 'Microsoft Intune',
    shortLabel: 'Intune',
    Icon: Server,
    iconColor: 'text-sky-500',
    pillBg: 'bg-sky-50',
    pillBorder: 'border-sky-200',
    pillText: 'text-sky-700',
    dotColor: 'bg-sky-500',
  },
  {
    id: 'kandji',
    label: 'Kandji',
    shortLabel: 'Kandji',
    Icon: Cloud,
    iconColor: 'text-violet-500',
    pillBg: 'bg-violet-50',
    pillBorder: 'border-violet-200',
    pillText: 'text-violet-700',
    dotColor: 'bg-violet-500',
  },
  {
    id: 'manageEngine',
    label: 'ManageEngine',
    shortLabel: 'ME',
    Icon: Settings,
    iconColor: 'text-orange-500',
    pillBg: 'bg-orange-50',
    pillBorder: 'border-orange-200',
    pillText: 'text-orange-700',
    dotColor: 'bg-orange-500',
  },
]

function formatLastUpdated(d: Date): string {
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000)
  if (diffSec < 10)  return 'just now'
  if (diffSec < 60)  return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60)  return `${diffMin}m ago`
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function LiveDataBar({
  sourceCounts,
  countdown,
  lastUpdated,
  onRefresh,
  refreshing = false,
}: LiveDataBarProps) {
  const totalDevices = sourceCounts.intune + sourceCounts.kandji + sourceCounts.manageEngine
  const connectedSources = SOURCES.filter(s => sourceCounts[s.id] > 0).length

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50/80 to-sky-50/60 px-4 py-2.5 shadow-sm shadow-slate-900/5">

      {/* LIVE badge */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <Wifi className="h-3.5 w-3.5 text-emerald-600" />
        <span className="text-[0.7rem] font-bold text-emerald-700 uppercase tracking-wide">Live</span>
        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 text-[0.6rem] font-semibold text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          {connectedSources} {connectedSources === 1 ? 'source' : 'sources'}
        </span>
      </div>

      <div className="h-3.5 w-px bg-slate-300 flex-shrink-0 hidden sm:block" />

      {/* Per-source device count pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {SOURCES.map(s => {
          const count = sourceCounts[s.id]
          const Icon = s.Icon
          return (
            <span
              key={s.id}
              title={`${s.label}: ${count.toLocaleString()} devices`}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold ${s.pillBg} ${s.pillBorder} ${s.pillText}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${count > 0 ? s.dotColor : 'bg-slate-300'}`} />
              <Icon className={`h-2.5 w-2.5 ${count > 0 ? s.iconColor : 'text-slate-400'} hidden sm:block`} />
              <span className="hidden sm:inline">{s.shortLabel}</span>
              <span className="font-bold">{count.toLocaleString()}</span>
            </span>
          )
        })}
      </div>

      <div className="h-3.5 w-px bg-slate-300 flex-shrink-0 hidden md:block" />

      {/* Total */}
      <span className="hidden md:inline-flex items-center gap-1 text-[0.68rem] font-semibold text-slate-600">
        <Zap className="h-3 w-3 text-slate-400" />
        {totalDevices.toLocaleString()} total
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Last updated + countdown */}
      <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
        {lastUpdated && (
          <span className="text-[0.62rem] text-slate-400">
            Updated {formatLastUpdated(lastUpdated)}
          </span>
        )}
        <span
          title={`Auto-refresh in ${countdown}s`}
          className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[0.62rem] font-mono font-semibold text-slate-500"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
          {countdown}s
        </span>
      </div>

      {/* Refresh button */}
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        title="Refresh now"
        className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 transition shadow-sm"
      >
        <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin text-sky-500' : ''}`} />
        <span className="hidden sm:inline">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
      </button>

      {/* No-source fallback inside live mode */}
      {connectedSources === 0 && (
        <div className="flex items-center gap-1.5 ml-1">
          <WifiOff className="h-3 w-3 text-amber-500" />
          <span className="text-[0.65rem] text-amber-600 font-medium">Push credentials in Settings to activate</span>
        </div>
      )}
    </div>
  )
}
