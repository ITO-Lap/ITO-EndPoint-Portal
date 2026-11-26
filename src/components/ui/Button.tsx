import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'solid' | 'water' | 'outline' | 'ghost' | 'verma'
  size?: 'sm' | 'md' | 'lg'
  icon?: LucideIcon
  children: ReactNode
}

const sizeStyles = {
  sm: 'h-7 px-3 text-[0.72rem] gap-1',
  md: 'h-8 px-4 text-xs gap-1.5',
  lg: 'h-9 px-5 text-sm gap-2',
}

export function Button({ variant = 'solid', size = 'md', icon: Icon, children, className = '', ...props }: ButtonProps) {
  const base = `inline-flex items-center justify-center font-bold rounded-full transition-all ${sizeStyles[size]} disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none ${className}`

  if (variant === 'solid' || variant === 'verma') {
    return (
      <button type="button" className={`${base} btn-verma text-white`} {...props}>
        {Icon && <Icon className="h-3.5 w-3.5 flex-shrink-0" />}
        {children}
      </button>
    )
  }

  if (variant === 'water') {
    return (
      <button type="button" className={`${base} btn-water text-white`} {...props}>
        {Icon && <Icon className="h-3.5 w-3.5 flex-shrink-0" />}
        {children}
      </button>
    )
  }

  if (variant === 'outline') {
    return (
      <button
        type="button"
        className={`${base} glass water-glow text-slate-700`}
        style={{ border: '1px solid rgba(148,163,184,0.35)' }}
        {...props}
      >
        {Icon && <Icon className="h-3.5 w-3.5 flex-shrink-0" />}
        {children}
      </button>
    )
  }

  // ghost
  return (
    <button
      type="button"
      className={`${base} water-glow text-slate-600`}
      style={{ background: 'rgba(255,255,255,0.50)', border: '1px solid rgba(148,163,184,0.20)' }}
      {...props}
    >
      {Icon && <Icon className="h-3.5 w-3.5 flex-shrink-0" />}
      {children}
    </button>
  )
}
