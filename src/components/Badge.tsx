import type { BadgeVariant } from '../types'

const styles: Record<BadgeVariant, string> = {
  blue: 'bg-sky-100 text-sky-700',
  red: 'bg-red-100 text-red-700',
  green: 'bg-emerald-100 text-emerald-700',
  orange: 'bg-orange-100 text-orange-700',
  yellow: 'bg-amber-100 text-amber-700',
  gray: 'bg-slate-100 text-slate-700',
}

interface BadgeProps {
  label: string
  variant?: BadgeVariant
  className?: string
}

export function Badge({ label, variant = 'gray', className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[0.75rem] font-semibold ${styles[variant]} ${className}`}>
      {label}
    </span>
  )
}
