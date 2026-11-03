import { createContext, useContext } from 'react'
import type { PermissionMap } from '../lib/permissions'

// Populated once at the app root (see App.tsx) from the signed-in user's
// `permissions` field (GET /api/auth/me — resolved server-side from their
// custom-RBAC role, see server/src/services/roleResolution.ts). Avoids
// threading a new prop through every component that already receives
// viewerRole, since those components can just call usePermissions() instead.
const PermissionsContext = createContext<PermissionMap | null>(null)

export function PermissionsProvider({ permissions, children }: { permissions: PermissionMap; children: React.ReactNode }) {
  return <PermissionsContext.Provider value={permissions}>{children}</PermissionsContext.Provider>
}

export function usePermissions(): PermissionMap {
  const ctx = useContext(PermissionsContext)
  if (!ctx) throw new Error('usePermissions must be inside PermissionsProvider')
  return ctx
}
