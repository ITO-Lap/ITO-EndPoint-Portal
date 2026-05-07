import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'solid' | 'outline'
  icon?: LucideIcon
  children: ReactNode
}

const variantStyles = {
  solid:
    'bg-sky-600 text-white shadow-sm shadow-sky-500/10 hover:bg-sky-700 focus-visible:ring-2 focus-visible:ring-sky-300',
  outline:
    'border border-slate-300 bg-white text-sky-600 hover:border-slate-400 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-sky-300',
}

export function Button({ variant = 'solid', icon: Icon, children, className = '', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-[32px] items-center justify-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      {children}
    </button>
  )
}
