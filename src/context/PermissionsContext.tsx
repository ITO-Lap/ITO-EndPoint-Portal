import { PermissionsContext } from './permissionsHooks'
import type { PermissionMap } from '../lib/permissions'

export function PermissionsProvider({ permissions, children }: { permissions: PermissionMap; children: React.ReactNode }) {
  return <PermissionsContext.Provider value={permissions}>{children}</PermissionsContext.Provider>
}
