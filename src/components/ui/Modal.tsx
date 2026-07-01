import { X } from 'lucide-react'
import { useEffect } from 'react'
import type { ReactNode } from 'react'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  description?: string
  size?: 'md' | 'lg'
}

const sizeClass = { md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' }

export function Modal({ open, title, onClose, children, description, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-0 sm:px-4">
      {/* Frosted overlay */}
      <button
        type="button"
        aria-label="Close modal"
        className="absolute inset-0 transition-opacity"
        style={{ background: 'rgba(15,23,42,0.25)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
        onClick={onClose}
      />

      {/* Glass panel */}
      <div
        className={`relative z-10 flex flex-col w-full ${sizeClass[size]} rounded-t-3xl sm:rounded-3xl overflow-hidden glass-strong animate-slide-up max-h-[92dvh] sm:max-h-[calc(100vh-4rem)]`}
        style={{ boxShadow: '0 24px 80px rgba(14,165,233,0.12), 0 8px 32px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.95)' }}
      >
        {/* Top accent */}
        <div
          className="absolute top-0 left-0 right-0 h-[2.5px]"
          style={{ background: 'linear-gradient(90deg, transparent, #0EA5E9, #6366F1, transparent)' }}
        />

        {/* Header */}
        <div
          className="flex flex-shrink-0 items-start justify-between gap-4 px-6 py-4 mt-[2.5px]"
          style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}
        >
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-800 leading-tight">{title}</h2>
            {description && (
              <p className="mt-0.5 text-xs text-slate-400 leading-snug">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 grid h-7 w-7 place-items-center rounded-xl water-glow-sm"
            style={{ background: 'rgba(148,163,184,0.10)', border: '1px solid rgba(148,163,184,0.20)', color: '#94A3B8' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 text-slate-700">
          {children}
        </div>
      </div>
    </div>
  )
}
