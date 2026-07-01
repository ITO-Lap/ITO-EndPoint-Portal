import { createContext, useContext } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { navItems } from '../data/dashboardData'

// ── Types ─────────────────────────────────────────────────────────────────────

export type NavVisibilityPrefs = Record<string, boolean>

// ── Constants ─────────────────────────────────────────────────────────────────

// These items can NEVER be hidden — Settings must always be reachable
export const ALWAYS_VISIBLE_IDS = new Set(['settings'])

// Build default: all items visible
const DEFAULT_PREFS: NavVisibilityPrefs = Object.fromEntries(
  navItems.map(item => [item.id, true]),
)

// ── Context ───────────────────────────────────────────────────────────────────

export interface NavVisibilityContextValue {
  prefs: NavVisibilityPrefs
  hiddenNavIds: Set<string>
  isVisible: (id: string) => boolean
  setVisible: (id: string, visible: boolean) => void
  toggleVisible: (id: string) => void
  resetToDefaults: () => void
  isAlwaysVisible: (id: string) => boolean
}

const NavVisibilityContext = createContext<NavVisibilityContextValue | null>(null)

// ── Provider ──────────────────────────────────────────────────────────────────

export function NavVisibilityProvider({ children }: { children: React.ReactNode }) {
  const [stored, setStored] = useLocalStorage<NavVisibilityPrefs>(
    'ito_nav_visibility',
    DEFAULT_PREFS,
  )

  // Merge defaults with stored so any newly added nav items appear visible
  const prefs: NavVisibilityPrefs = { ...DEFAULT_PREFS, ...stored }

  const isAlwaysVisible = (id: string) => ALWAYS_VISIBLE_IDS.has(id)

  const isVisible = (id: string): boolean => {
    if (isAlwaysVisible(id)) return true
    return prefs[id] !== false
  }

  const setVisible = (id: string, visible: boolean) => {
    if (isAlwaysVisible(id)) return
    setStored(prev => ({ ...DEFAULT_PREFS, ...prev, [id]: visible }))
  }

  const toggleVisible = (id: string) => {
    if (isAlwaysVisible(id)) return
    setStored(prev => ({ ...DEFAULT_PREFS, ...prev, [id]: !(prev[id] !== false) }))
  }

  const resetToDefaults = () => setStored(DEFAULT_PREFS)

  const hiddenNavIds = new Set(
    Object.entries(prefs)
      .filter(([id, visible]) => !visible && !isAlwaysVisible(id))
      .map(([id]) => id),
  )

  return (
    <NavVisibilityContext.Provider value={{
      prefs,
      hiddenNavIds,
      isVisible,
      setVisible,
      toggleVisible,
      resetToDefaults,
      isAlwaysVisible,
    }}>
      {children}
    </NavVisibilityContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useNavVisibility(): NavVisibilityContextValue {
  const ctx = useContext(NavVisibilityContext)
  if (!ctx) throw new Error('useNavVisibility must be inside NavVisibilityProvider')
  return ctx
}
