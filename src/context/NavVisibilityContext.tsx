import { useLocalStorage } from '../hooks/useLocalStorage'
import { navItems } from '../data/dashboardData'
import { NavVisibilityContext, type NavVisibilityPrefs } from './navVisibilityHooks'

// ── Constants ─────────────────────────────────────────────────────────────────

// These items can NEVER be hidden — Settings must always be reachable
const ALWAYS_VISIBLE_IDS = new Set(['settings'])

// Build default: all items visible
const DEFAULT_PREFS: NavVisibilityPrefs = Object.fromEntries(
  navItems.map(item => [item.id, true]),
)

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
