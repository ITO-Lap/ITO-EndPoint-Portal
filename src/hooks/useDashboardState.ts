import { useState } from 'react'

export function useDashboardState() {
  const [runbookModalOpen, setRunbookModalOpen] = useState(false)
  const [activityModalOpen, setActivityModalOpen] = useState(false)

  return {
    runbookModalOpen,
    activityModalOpen,
    setRunbookModalOpen,
    setActivityModalOpen,
  }
}
