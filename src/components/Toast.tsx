import { X } from 'lucide-react'
import type { ToastItem } from '../types'

interface ToastProps {
  toast: ToastItem
  onClose: (id: string) => void
}

export function Toast({ toast, onClose }: ToastProps) {
  const baseStyles =
    'rounded-2xl border px-4 py-3 shadow-lg shadow-slate-950/10 flex items-start gap-3 w-full max-w-sm'
  const statusStyles = {
    success: 'border-emerald-200 bg-emerald-50 text-slate-900',
    error: 'border-red-200 bg-red-50 text-slate-900',
    info: 'border-sky-200 bg-sky-50 text-slate-900',
  }

  return (
    <div className={`${baseStyles} ${statusStyles[toast.type]}`} role="status" aria-live="polite">
      <div className="flex-1">
        <p className="text-sm font-semibold">{toast.title}</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-700">{toast.message}</p>
      </div>
      <button
        type="button"
        aria-label="Close notification"
        onClick={() => onClose(toast.id)}
        className="rounded-full p-1 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
