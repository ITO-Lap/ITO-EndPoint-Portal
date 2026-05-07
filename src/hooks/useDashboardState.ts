import { useState, useCallback } from 'react'
import type { DeviceData } from '../types'

export interface DashboardState {
  selectedDevice: DeviceData
  searchInput: string
  runbookModalOpen: boolean
  activityModalOpen: boolean
}

export function useDashboardState(initialDevice: DeviceData) {
  const [selectedDevice, setSelectedDevice] = useState<DeviceData>(initialDevice)
  const [searchInput, setSearchInput] = useState('')
  const [runbookModalOpen, setRunbookModalOpen] = useState(false)
  const [activityModalOpen, setActivityModalOpen] = useState(false)

  const updateDevice = useCallback((device: DeviceData) => {
    setSelectedDevice(device)
  }, [])

  return {
    selectedDevice,
    searchInput,
    runbookModalOpen,
    activityModalOpen,
    setSelectedDevice: updateDevice,
    setSearchInput,
    setRunbookModalOpen,
    setActivityModalOpen,
  }
}
