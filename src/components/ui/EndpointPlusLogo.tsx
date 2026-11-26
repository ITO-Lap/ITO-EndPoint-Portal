/**
 * EndPoint+ logo — a bold "E" (endpoint) with a "+" accent, on an indigo→cyan
 * rounded square. All brand lockups in the app come from this file.
 */

import { useId } from 'react'
import type { ReactNode } from 'react'

const WORDMARK_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Nunito", "Poppins", ui-rounded, sans-serif'

// ── EndpointPlusIcon ──────────────────────────────────────────────────────────

interface EndpointPlusIconProps {
  className?: string
  style?: React.CSSProperties
  label?: string
}

export function EndpointPlusIcon({ className = '', style, label = 'EndPoint+ logo mark' }: EndpointPlusIconProps) {
  const gid = useId()
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} style={style} aria-label={label} role="img">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4F46E5" />
          <stop offset="1" stopColor="#06B6D4" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${gid})`} />
      {/* E */}
      <rect x="14" y="14" width="7" height="36" rx="2" fill="#fff" />
      <rect x="14" y="14" width="24" height="7" rx="2" fill="#fff" />
      <rect x="14" y="28.5" width="19" height="7" rx="2" fill="#fff" />
      <rect x="14" y="43" width="24" height="7" rx="2" fill="#fff" />
      {/* + */}
      <rect x="41" y="29.5" width="15" height="5" rx="2.5" fill="#FDE047" />
      <rect x="46" y="24.5" width="5" height="15" rx="2.5" fill="#FDE047" />
    </svg>
  )
}

// ── EndpointPlusWordmark ──────────────────────────────────────────────────────

interface EndpointPlusWordmarkProps {
  className?: string
  style?: React.CSSProperties
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
}

const WM: Record<string, string> = {
  xs: 'text-sm', sm: 'text-base', md: 'text-xl',
  lg: 'text-2xl', xl: 'text-3xl', '2xl': 'text-4xl',
}

export function EndpointPlusWordmark({ className = '', style, size = 'md' }: EndpointPlusWordmarkProps) {
  return (
    <span
      className={`font-extrabold tracking-tight select-none ${WM[size] ?? 'text-xl'} ${className}`}
      style={{ color: '#334155', fontFamily: WORDMARK_FONT, ...style }}
    >
      EndPoint<span style={{ color: '#06B6D4' }}>+</span>
    </span>
  )
}

// ── EndpointPlusVertical ──────────────────────────────────────────────────────

interface EndpointPlusVerticalProps {
  iconSize?: 'sm' | 'md' | 'lg' | 'xl'
  wordmarkSize?: EndpointPlusWordmarkProps['size']
  subtitle?: ReactNode
  className?: string
  style?: React.CSSProperties
}

const VI: Record<string, string> = { sm: 'h-12', md: 'h-20', lg: 'h-28', xl: 'h-36' }

export function EndpointPlusVertical({
  iconSize = 'md', wordmarkSize = 'lg', subtitle, className = '', style,
}: EndpointPlusVerticalProps) {
  return (
    <div className={`flex flex-col items-center gap-2 ${className}`} style={style}>
      <EndpointPlusIcon className={`${VI[iconSize] ?? 'h-20'} w-auto`} />
      <EndpointPlusWordmark size={wordmarkSize} />
      {subtitle && (
        <span className="text-[0.6rem] font-black uppercase tracking-[0.22em]" style={{ color: '#4F46E5' }}>
          {subtitle}
        </span>
      )}
    </div>
  )
}

// ── EndpointPlusHorizontal ────────────────────────────────────────────────────

interface EndpointPlusHorizontalProps {
  iconSize?: 'xs' | 'sm' | 'md' | 'lg'
  wordmarkSize?: EndpointPlusWordmarkProps['size']
  subtitle?: ReactNode
  gap?: string
  className?: string
  style?: React.CSSProperties
}

const HI: Record<string, string> = { xs: 'h-6', sm: 'h-9', md: 'h-12', lg: 'h-16' }

export function EndpointPlusHorizontal({
  iconSize = 'sm', wordmarkSize = 'sm', subtitle, gap = 'gap-2.5', className = '', style,
}: EndpointPlusHorizontalProps) {
  return (
    <div className={`flex items-center ${gap} ${className}`} style={style}>
      <EndpointPlusIcon className={`${HI[iconSize] ?? 'h-9'} w-auto flex-shrink-0`} />
      <div className="min-w-0">
        <EndpointPlusWordmark size={wordmarkSize} />
        {subtitle && (
          <p className="text-[0.55rem] font-black uppercase tracking-[0.22em] leading-tight" style={{ color: '#4F46E5' }}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  )
}

// ── EndpointPlusBadge ─────────────────────────────────────────────────────────

export function EndpointPlusBadge({ className = '' }: { className?: string }) {
  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <EndpointPlusIcon className="h-4 w-auto" />
      <span className="text-[0.65rem] font-extrabold tracking-tight" style={{ color: '#334155', fontFamily: WORDMARK_FONT }}>
        EndPoint<span style={{ color: '#06B6D4' }}>+</span>
      </span>
    </div>
  )
}
