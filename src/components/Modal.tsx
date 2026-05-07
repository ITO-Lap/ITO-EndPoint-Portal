import { useEffect } from 'react'
import type { ReactNode } from 'react'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  description?: string
}

export function Modal({ open, title, onClose, children, description }: ModalProps) {
  useEffect(() => {
    if (!open) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-0 sm:px-4 py-0 sm:py-6">
      <button
        type="button"
        aria-label="Close modal"
        className="absolute inset-0 bg-slate-950/50 transition-opacity"
        onClick={onClose}
      />
      <div className="relative z-10 flex flex-col w-full sm:max-w-3xl rounded-t-2xl sm:rounded-lg border border-slate-200 bg-white shadow-lg shadow-slate-950/10 max-h-[92dvh] sm:max-h-[calc(100vh-3rem)]">
        <div className="flex flex-shrink-0 items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-full border border-slate-200 bg-slate-100 p-2 text-slate-700 transition hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-sky-300"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 text-slate-900">{children}</div>
      </div>
    </div>
  )
}
