/**
 * Zinnia Logo — Faithful reconstruction from official brand brief
 *
 * Architecture (per official brief):
 *   "Three overlapping looped shapes (petal/wing structure)
 *    converging at a SINGLE POINT on the RIGHT."
 *
 * Each loop is a CLOSED CURVE defined by two cubic bezier halves:
 *   • Outer sweep  — the wide, graceful arc from the convergence point
 *                    to the dome, passing well above/outside the axis
 *   • Inner return — the tighter return path from dome back to convergence
 *
 * Convergence point (shared tip): (172, 108) — right side of the icon
 * Dome positions:
 *   Red    (50,  35) — upper-left
 *   Orange (44,  88) — center-left
 *   Yellow (60, 152) — lower-left
 *
 * Drawing order: Yellow → Orange → Red (yellow behind, red on top)
 * Stroke weight: uniform 9px across all loops (matching official brand)
 *
 * Wordmark: "zinnia" bold, rounded sans-serif, warm gray #6D6E71
 */

import type { ReactNode } from 'react'

// ── Convergence point (shared by all three loops) ─────────────────────────────
const CX = 172
const CY = 108

// ── Loop paths ───────────────────────────────────────────────────────────────
// Each path: M convergence  C outer_cp1 outer_cp2 dome  C inner_cp3 inner_cp4 convergence  Z
// Control points computed geometrically to produce the Zinnia petal shape:
//   outer arc passes ~35px "above" the chord (wider side of loop)
//   inner arc passes ~15px "below" the chord (tighter return side)

const LOOPS = [
  {
    // Yellow — smallest, dome lower-left. Drawn first (furthest back).
    color: '#FFB800',
    d: `M ${CX},${CY} C 152,74 40,87 60,152 C 78,170 173,135 ${CX},${CY} Z`,
    sw: 9,
  },
  {
    // Orange — medium, dome center-left.
    color: '#F46C00',
    d: `M ${CX},${CY} C 168,62 61,41 44,88 C 48,130 163,106 ${CX},${CY} Z`,
    sw: 9,
  },
  {
    // Red — largest, dome upper-left. Drawn last (front).
    color: '#E8172D',
    d: `M ${CX},${CY} C 172,62 98,2 50,35 C 50,82 151,94 ${CX},${CY} Z`,
    sw: 9,
  },
] as const

// ── ZinniaIcon ────────────────────────────────────────────────────────────────

interface ZinniaIconProps {
  className?: string
  style?: React.CSSProperties
  label?: string
}

export function ZinniaIcon({ className = '', style, label = 'Zinnia logo mark' }: ZinniaIconProps) {
  return (
    <svg
      viewBox="34 -5 145 180"
      fill="none"
      className={className}
      style={style}
      aria-label={label}
      role="img"
    >
      {LOOPS.map(loop => (
        <path
          key={loop.color}
          d={loop.d}
          fill="none"
          stroke={loop.color}
          strokeWidth={loop.sw}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  )
}

// ── ZinniaWordmark ────────────────────────────────────────────────────────────

interface ZinniaWordmarkProps {
  className?: string
  style?: React.CSSProperties
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
}

const WM: Record<string, string> = {
  xs: 'text-sm', sm: 'text-base', md: 'text-xl',
  lg: 'text-2xl', xl: 'text-3xl', '2xl': 'text-4xl',
}

export function ZinniaWordmark({ className = '', style, size = 'md' }: ZinniaWordmarkProps) {
  return (
    <span
      className={`font-bold tracking-tight select-none ${WM[size] ?? 'text-xl'} ${className}`}
      style={{
        color: '#6D6E71',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Nunito", "Poppins", ui-rounded, sans-serif',
        ...style,
      }}
    >
      zinnia
    </span>
  )
}

// ── ZinniaVertical ────────────────────────────────────────────────────────────

interface ZinniaVerticalProps {
  iconSize?: 'sm' | 'md' | 'lg' | 'xl'
  wordmarkSize?: ZinniaWordmarkProps['size']
  subtitle?: ReactNode
  className?: string
  style?: React.CSSProperties
}

const VI: Record<string, string> = { sm: 'h-12', md: 'h-20', lg: 'h-28', xl: 'h-36' }

export function ZinniaVertical({
  iconSize = 'md', wordmarkSize = 'lg', subtitle, className = '', style,
}: ZinniaVerticalProps) {
  return (
    <div className={`flex flex-col items-center gap-2 ${className}`} style={style}>
      <ZinniaIcon className={`${VI[iconSize] ?? 'h-20'} w-auto`} />
      <ZinniaWordmark size={wordmarkSize} />
      {subtitle && (
        <span className="text-[0.6rem] font-black uppercase tracking-[0.22em]" style={{ color: '#F46C00' }}>
          {subtitle}
        </span>
      )}
    </div>
  )
}

// ── ZinniaHorizontal ──────────────────────────────────────────────────────────

interface ZinniaHorizontalProps {
  iconSize?: 'xs' | 'sm' | 'md' | 'lg'
  wordmarkSize?: ZinniaWordmarkProps['size']
  subtitle?: ReactNode
  gap?: string
  className?: string
  style?: React.CSSProperties
}

const HI: Record<string, string> = { xs: 'h-6', sm: 'h-9', md: 'h-12', lg: 'h-16' }

export function ZinniaHorizontal({
  iconSize = 'sm', wordmarkSize = 'sm', subtitle, gap = 'gap-2.5', className = '', style,
}: ZinniaHorizontalProps) {
  return (
    <div className={`flex items-center ${gap} ${className}`} style={style}>
      <ZinniaIcon className={`${HI[iconSize] ?? 'h-9'} w-auto flex-shrink-0`} />
      <div className="min-w-0">
        <ZinniaWordmark size={wordmarkSize} />
        {subtitle && (
          <p className="text-[0.55rem] font-black uppercase tracking-[0.22em] leading-tight" style={{ color: '#F46C00' }}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  )
}

// ── ZinniaBadge ───────────────────────────────────────────────────────────────

export function ZinniaBadge({ className = '' }: { className?: string }) {
  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <ZinniaIcon className="h-4 w-auto" />
      <span
        className="text-[0.65rem] font-bold tracking-tight"
        style={{ color: '#6D6E71', fontFamily: '-apple-system, BlinkMacSystemFont, "Nunito", sans-serif' }}
      >
        zinnia
      </span>
    </div>
  )
}
