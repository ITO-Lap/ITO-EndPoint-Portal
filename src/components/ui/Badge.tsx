import type { BadgeVariant } from '../../types'

const styles: Record<BadgeVariant, { bg: string; text: string; border: string; dot: string }> = {
  blue:   { bg: 'rgba(14,165,233,0.10)',  text: '#0284C7', border: 'rgba(14,165,233,0.25)',  dot: '#0EA5E9' },
  red:    { bg: 'rgba(239,68,68,0.10)',   text: '#DC2626', border: 'rgba(239,68,68,0.25)',   dot: '#EF4444' },
  green:  { bg: 'rgba(16,185,129,0.10)',  text: '#059669', border: 'rgba(16,185,129,0.25)',  dot: '#10B981' },
  orange: { bg: 'rgba(244,108,0,0.10)',   text: '#C2530A', border: 'rgba(244,108,0,0.25)',   dot: '#F46C00' },
  yellow: { bg: 'rgba(245,158,11,0.10)',  text: '#B45309', border: 'rgba(245,158,11,0.25)',  dot: '#F59E0B' },
  gray:   { bg: 'rgba(148,163,184,0.12)', text: '#475569', border: 'rgba(148,163,184,0.25)', dot: '#94A3B8' },
}

interface BadgeProps {
  label: string
  variant?: BadgeVariant
  showDot?: boolean
  className?: string
}

export function Badge({ label, variant = 'gray', showDot = false, className = '' }: BadgeProps) {
  const s = styles[variant]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold backdrop-blur-sm water-glow-sm ${className}`}
      style={{
        background:  s.bg,
        color:       s.text,
        border:      `1px solid ${s.border}`,
        backdropFilter: 'blur(8px)',
      }}
    >
      {showDot && (
        <span className="h-1.5 w-1.5 rounded-full flex-shrink-0 animate-pulse" style={{ background: s.dot }} />
      )}
      {label}
    </span>
  )
}
