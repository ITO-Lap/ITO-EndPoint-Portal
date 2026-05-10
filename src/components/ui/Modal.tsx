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

const sizeClass = {
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
}

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
      {/* Overlay */}
      <button
        type="button"
        aria-label="Close modal"
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className={`relative z-10 flex flex-col w-full ${sizeClass[size]} rounded-t-3xl sm:rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/15 max-h-[92dvh] sm:max-h-[calc(100vh-4rem)]`}>
        {/* Header */}
        <div className="flex flex-shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 leading-tight">{title}</h2>
            {description && (
              <p className="mt-0.5 text-xs text-slate-500 leading-snug">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-sky-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 text-slate-900">
          {children}
        </div>
      </div>
    </div>
  )
}
