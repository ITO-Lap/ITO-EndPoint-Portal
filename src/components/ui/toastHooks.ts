import { createContext, useContext } from 'react'
import type { ToastType } from '../../types'

export interface ToastContextValue {
  notify: (type: ToastType, title: string, message: string) => void
}

export const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
