import { useState } from 'react'

export function useDashboardState() {
  const [runbookModalOpen, setRunbookModalOpen] = useState(false)

  return {
    runbookModalOpen,
    setRunbookModalOpen,
  }
}
