import type { StatCardData } from '../../types'

interface StatCardProps {
  data: StatCardData
  onClick?: () => void
  selected?: boolean
}

function resolveColor(accent: string, iconBg: string): string {
  const combined = accent + iconBg
  if (combined.includes('orange') || combined.includes('red-6')) return '#F46C00'
  if (combined.includes('emerald') || combined.includes('green')) return '#10B981'
  if (combined.includes('red') || combined.includes('rose'))      return '#EF4444'
  if (combined.includes('amber') || combined.includes('yellow'))  return '#F59E0B'
  if (combined.includes('violet') || combined.includes('purple')) return '#8B5CF6'
  if (combined.includes('blue') || combined.includes('cyan'))     return '#0EA5E9'
  return '#F46C00'
}

export function StatCard({ data, onClick, selected = false }: StatCardProps) {
  const Icon        = data.icon
  const isPositive  = data.trend.startsWith('↑')
  const accentColor = resolveColor(data.accent, data.iconBg)

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`group relative flex flex-col rounded-3xl p-5 glass transition-all w-full min-w-0 h-full text-left overflow-hidden water-glow-card focus-visible:outline-none ${
        onClick ? 'cursor-pointer' : 'cursor-default'
      } ${selected ? 'ring-2' : ''}`}
      style={selected ? {
        boxShadow: 'var(--water-glow-lg)',
        borderColor: 'rgba(14,165,233,0.50)',
        ringColor: 'rgba(14,165,233,0.30)',
      } : {}}
    >
      {/* Top gradient stripe */}
      <div
        className="absolute top-0 left-0 right-0 h-[2.5px]"
        style={{
          background: `linear-gradient(90deg, transparent, ${accentColor}CC, ${accentColor}, transparent)`,
          opacity: selected ? 1 : 0.7,
        }}
      />

      {/* Ambient radial bloom (visible on hover via group) */}
      <div
        className="pointer-events-none absolute -top-8 -right-8 h-28 w-28 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: `${accentColor}28` }}
      />

      {/* Header */}
      <div className="relative flex items-start justify-between gap-2 min-w-0">
        <p className="text-[0.6rem] font-black uppercase tracking-[0.14em] text-slate-400 leading-snug">
          {data.title}
        </p>
        <div
          className="grid h-9 w-9 place-items-center rounded-2xl flex-shrink-0 transition-all duration-300 group-hover:scale-110"
          style={{
            background: `linear-gradient(135deg, ${accentColor}22, ${accentColor}10)`,
            border: `1.5px solid ${accentColor}35`,
            boxShadow: `0 4px 12px ${accentColor}25`,
          }}
        >
          <Icon className="h-4 w-4" style={{ color: accentColor }} />
        </div>
      </div>

      {/* Big number */}
      <p
        className="relative mt-3 text-[2rem] font-black mono-num leading-none tracking-tight animate-number-enter"
        style={{ color: '#0F172A' }}
      >
        {data.value}
      </p>

      {/* Subtle sub-bar */}
      <div
        className="relative mt-2 h-1 rounded-full overflow-hidden"
        style={{ background: 'rgba(148,163,184,0.15)' }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: '65%', background: `linear-gradient(90deg, ${accentColor}60, ${accentColor})` }}
        />
      </div>

      {/* Trend row */}
      <div className="relative mt-auto pt-3 flex items-center justify-between gap-2">
        <span className="text-xs font-bold" style={{ color: isPositive ? '#10B981' : '#EF4444' }}>
          {data.trend}
        </span>
        <span className="text-[0.6rem] font-medium text-slate-400">{data.trendChange}</span>
      </div>

      {/* Selected ripple ring */}
      {selected && (
        <div
          className="absolute inset-0 rounded-3xl pointer-events-none animate-pulse-water"
          style={{ border: '1.5px solid rgba(14,165,233,0.40)' }}
        />
      )}
    </button>
  )
}
