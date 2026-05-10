import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'solid' | 'outline'
  icon?: LucideIcon
  children: ReactNode
}

const variantStyles = {
  solid:
    'bg-sky-600 text-white hover:bg-sky-700 active:bg-sky-800 focus-visible:ring-2 focus-visible:ring-sky-300 disabled:opacity-50 disabled:cursor-not-allowed',
  outline:
    'border border-slate-200 bg-white text-sky-600 hover:bg-slate-50 hover:border-slate-300 active:bg-slate-100 focus-visible:ring-2 focus-visible:ring-sky-300 disabled:opacity-50 disabled:cursor-not-allowed',
}

export function Button({ variant = 'solid', icon: Icon, children, className = '', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3.5 py-0 text-xs font-semibold transition ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      {children}
    </button>
  )
}
