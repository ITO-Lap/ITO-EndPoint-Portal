import { createContext, useContext } from 'react'
import type { PermissionMap } from '../lib/permissions'

// Populated once at the app root (see App.tsx) from the signed-in user's `permissions` field
// (GET /api/auth/me, resolved server-side from their custom-RBAC role, see server/src/services/roleResolution.ts).
// Avoids threading a prop through every component that already receives viewerRole.
export const PermissionsContext = createContext<PermissionMap | null>(null)

export function usePermissions(): PermissionMap {
  const ctx = useContext(PermissionsContext)
  if (!ctx) throw new Error('usePermissions must be inside PermissionsProvider')
  return ctx
}

/** Like usePermissions(), but returns null outside a provider (for shared components that also render in isolation). */
export function useOptionalPermissions(): PermissionMap | null {
  return useContext(PermissionsContext)
}
