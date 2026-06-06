// OpenAI integration removed — hook kept as a no-op stub for type compatibility.
import type { DeviceData } from '../types'

export function useAiAnalysis(_device: DeviceData | null, _isMockData: boolean) {
  return { analysis: null, loading: false }
}
