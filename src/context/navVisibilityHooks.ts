import { createContext, useContext } from 'react'

export type NavVisibilityPrefs = Record<string, boolean>

export interface NavVisibilityContextValue {
  prefs: NavVisibilityPrefs
  hiddenNavIds: Set<string>
  isVisible: (id: string) => boolean
  setVisible: (id: string, visible: boolean) => void
  toggleVisible: (id: string) => void
  resetToDefaults: () => void
  isAlwaysVisible: (id: string) => boolean
}

export const NavVisibilityContext = createContext<NavVisibilityContextValue | null>(null)

export function useNavVisibility(): NavVisibilityContextValue {
  const ctx = useContext(NavVisibilityContext)
  if (!ctx) throw new Error('useNavVisibility must be inside NavVisibilityProvider')
  return ctx
}
