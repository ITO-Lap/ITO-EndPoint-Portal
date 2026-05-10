import { useState, useEffect, useRef } from 'react'
import { api, type DeviceAnalysis } from '../api'
import type { DeviceData } from '../types'

export function useAiAnalysis(device: DeviceData | null, isMockData: boolean) {
  const [analysis, setAnalysis]   = useState<DeviceAnalysis | null>(null)
  const [loading,  setLoading]    = useState(false)
  const lastKeyRef = useRef<string>('')

  useEffect(() => {
    // Only run for live devices that have a compliance issue
    const isLive     = !isMockData && !!device?.id
    const hasIssue   = device?.complianceState !== 'Compliant'
    const key        = device ? `${device.id}-${device.complianceState}` : ''

    if (!isLive || !hasIssue || !device) {
      setAnalysis(null)
      return
    }

    // Skip if we already fetched for this exact device+state
    if (key === lastKeyRef.current) return
    lastKeyRef.current = key

    let cancelled = false
    setLoading(true)
    setAnalysis(null)

    api.analyzeDeviceFields({
      deviceName:       device.deviceName,
      user:             device.user,
      platform:         device.platform,
      osVersion:        device.osVersion,
      managementSource: device.managementSource,
      complianceState:  device.complianceState,
      encryptionStatus: device.encryptionStatus,
      primaryIssue:     device.primaryIssue,
      policyFailed:     device.policyFailed,
      severity:         device.severity,
    })
      .then(a => { if (!cancelled) setAnalysis(a) })
      .catch(() => { if (!cancelled) setAnalysis(null) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [device, isMockData])

  return { analysis, loading }
}
