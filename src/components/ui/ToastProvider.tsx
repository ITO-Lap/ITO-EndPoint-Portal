import { useCallback, useMemo, useState } from 'react'
import { Toast } from './Toast'
import type { ReactNode } from 'react'
import type { ToastItem, ToastType } from '../../types'
import { ToastContext } from './toastHooks'

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const notify = useCallback((type: ToastType, title: string, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const toast: ToastItem = { id, type, title, message }
    setToasts((current) => [toast, ...current])
    window.setTimeout(() => removeToast(id), 3000)
  }, [removeToast])

  const value = useMemo(() => ({ notify }), [notify])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed left-1/2 top-20 z-50 flex max-h-[calc(100vh-2.5rem)] w-full max-w-[36rem] -translate-x-1/2 flex-col gap-3 overflow-hidden">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onClose={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}
