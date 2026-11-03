// Custom RBAC management — frontend HTTP client for /api/roles/*.
//
// See server/src/routes/roles.ts for the authoritative contract. The backend
// enforces the 'roles.manage' permission on every route here — same
// x-user-role/x-user-email actor pattern as every other recent feature
// module (see server/src/middleware/requireRole.ts), set once from
// RolesSection with the same viewerRole/userEmail every other page receives.

const SERVER = import.meta.env.VITE_API_URL ?? ''
const BASE = `${SERVER}/api/roles`

let currentRole = 'Global Admin'
let currentEmail = 'admin@zinnia.com'

export function setRolesActor(role: string, email: string): void {
  currentRole = role
  currentEmail = email
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-user-role': currentRole,
      'x-user-email': currentEmail,
      ...(init?.headers ?? {}),
    },
  })
  const body = await res.json() as T & { success: boolean; error?: string }
  if (!res.ok || !body.success) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body
}

const get  = <T>(path: string): Promise<T> => request<T>(path)
const post = <T>(path: string, data: unknown): Promise<T> => request<T>(path, { method: 'POST', body: JSON.stringify(data) })
const put  = <T>(path: string, data: unknown): Promise<T> => request<T>(path, { method: 'PUT', body: JSON.stringify(data) })
const del  = <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' })

// ─── Shared types (mirrors server/src/store/rolesStore.ts + rolePermissions.ts) ──

export type PermissionMap = Record<string, boolean>

export interface CustomRole {
  id: string
  name: string
  is_builtin: boolean
  permissions: PermissionMap
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface UserRoleAssignment {
  id: string
  user_email: string
  role_id: string
  assigned_by: string
  created_at: string
  updated_at: string
}

export interface PermissionGroup {
  key: string
  label: string
  keys: { key: string; label: string }[]
}

export const rolesApi = {
  listRoles: (): Promise<{ success: boolean; data: CustomRole[] }> =>
    get('/'),

  permissionKeys: (): Promise<{ success: boolean; data: PermissionGroup[] }> =>
    get('/permission-keys'),

  createRole: (input: { name: string; permissions: PermissionMap }): Promise<{ success: boolean; data: CustomRole }> =>
    post('/', input),

  updateRole: (id: string, patch: { name?: string; permissions?: PermissionMap }): Promise<{ success: boolean; data: CustomRole }> =>
    put(`/${id}`, patch),

  deleteRole: (id: string): Promise<{ success: boolean }> =>
    del(`/${id}`),

  listAssignments: (): Promise<{ success: boolean; data: UserRoleAssignment[] }> =>
    get('/assignments'),

  assignUser: (userEmail: string, roleId: string): Promise<{ success: boolean; data: UserRoleAssignment }> =>
    post('/assignments', { userEmail, roleId }),

  removeAssignment: (email: string): Promise<{ success: boolean }> =>
    del(`/assignments/${encodeURIComponent(email)}`),
}
