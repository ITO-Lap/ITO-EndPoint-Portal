import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react'
import type { ToastItem } from '../../types'

interface ToastProps {
  toast: ToastItem
  onClose: (id: string) => void
}

const CONFIG = {
  success: { icon: CheckCircle2, color: '#10B981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.25)' },
  error:   { icon: AlertCircle,  color: '#EF4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)'  },
  info:    { icon: Info,         color: '#0EA5E9', bg: 'rgba(14,165,233,0.08)',  border: 'rgba(14,165,233,0.25)' },
}

export function Toast({ toast, onClose }: ToastProps) {
  const cfg  = CONFIG[toast.type]
  const Icon = cfg.icon

  return (
    <div
      className="relative flex items-start gap-3 w-full max-w-sm rounded-2xl px-4 py-3.5 overflow-hidden glass-strong animate-slide-up"
      style={{
        border: `1px solid ${cfg.border}`,
        boxShadow: `0 8px 32px rgba(0,0,0,0.10), 0 0 0 1px ${cfg.border}, inset 0 1px 0 rgba(255,255,255,0.95)`,
      }}
      role="status"
      aria-live="polite"
    >
      {/* Left accent */}
      <div
        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
        style={{ background: `linear-gradient(180deg, ${cfg.color}60, ${cfg.color}, ${cfg.color}60)` }}
      />

      {/* Tinted inner glow */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{ background: cfg.bg }}
      />

      {/* Icon */}
      <Icon className="h-4 w-4 flex-shrink-0 mt-0.5 relative z-10" style={{ color: cfg.color }} />

      {/* Text */}
      <div className="flex-1 min-w-0 ml-1 relative z-10">
        <p className="text-sm font-bold text-slate-800">{toast.title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{toast.message}</p>
      </div>

      {/* Close */}
      <button
        type="button"
        aria-label="Close"
        onClick={() => onClose(toast.id)}
        className="flex-shrink-0 grid h-6 w-6 place-items-center rounded-lg water-glow-sm relative z-10"
        style={{ color: '#94A3B8' }}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
