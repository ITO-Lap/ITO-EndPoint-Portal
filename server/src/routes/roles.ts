// Custom RBAC management — Settings → Roles & Permissions.
//
// Global Admin / IT Admin / Helpdesk are permanent, non-deletable built-in
// roles (seeded by rolesStore.ensureBuiltinRolesSeeded()); their permissions
// can still be edited here except Global Admin's, which is always all-true
// in code (see rolePermissions.isGlobalAdmin) regardless of what's stored.
// Custom roles are plain rows, fully editable and deletable (once unassigned).
//
// Every route requires the 'roles.manage' capability — see
// server/src/services/rolePermissions.ts for the full permission taxonomy
// this exposes to the frontend via GET /permission-keys.

import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import { requireCapability } from '../middleware/requireRole.js'
import * as rolesStore from '../store/rolesStore.js'
import { PERMISSION_GROUPS, PERMISSION_KEYS, isGlobalAdmin } from '../services/rolePermissions.js'
import { invalidatePermissionsCache } from '../services/roleResolution.js'

const router = Router()
router.use(requireCapability('roles.manage'))

const actorEmail = (req: { header(n: string): string | undefined }) => req.header('x-user-email') ?? 'unknown@zinnia.com'

const permissionsSchema = z.record(z.string(), z.boolean()).refine(
  perms => Object.keys(perms).every(k => PERMISSION_KEYS.includes(k)),
  { message: 'Unknown permission key' },
)

function audit(req: { header(n: string): string | undefined }, action: string, resourceId: string, oldValue: unknown, newValue: unknown): void {
  void rolesStore.recordRbacAuditEntry({ userEmail: actorEmail(req), action, resourceId, oldValue, newValue })
}

// GET /api/roles
router.get('/', asyncHandler(async (_req, res) => {
  const roles = await rolesStore.listRoles()
  res.json({ success: true, data: roles.map(r => (isGlobalAdmin(r.name) ? { ...r, permissions: Object.fromEntries(PERMISSION_KEYS.map(k => [k, true])) } : r)) })
}))

// GET /api/roles/permission-keys
router.get('/permission-keys', asyncHandler(async (_req, res) => {
  res.json({ success: true, data: PERMISSION_GROUPS })
}))

// POST /api/roles { name, permissions }
router.post('/', asyncHandler(async (req, res) => {
  const schema = z.object({ name: z.string().trim().min(2).max(60), permissions: permissionsSchema.optional() })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid role' }); return }
  const { name, permissions = {} } = parsed.data

  const existing = await rolesStore.getRoleByName(name)
  if (existing) { res.status(409).json({ success: false, error: `A role named "${name}" already exists.` }); return }

  const full = Object.fromEntries(PERMISSION_KEYS.map(k => [k, permissions[k] === true]))
  const role = await rolesStore.createRole({ name, permissions: full, created_by: actorEmail(req) })
  audit(req, 'role_created', role.id, null, role)
  res.status(201).json({ success: true, data: role })
}))

// PUT /api/roles/:id { name?, permissions? }
router.put('/:id', asyncHandler(async (req, res) => {
  const id = req.params.id as string
  const existing = await rolesStore.getRole(id)
  if (!existing) { res.status(404).json({ success: false, error: 'Role not found' }); return }

  const schema = z.object({ name: z.string().trim().min(2).max(60).optional(), permissions: permissionsSchema.optional() })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid update' }); return }
  const { name, permissions } = parsed.data

  if (existing.is_builtin && name !== undefined && name !== existing.name) {
    res.status(400).json({ success: false, error: 'Built-in role names cannot be changed.' }); return
  }

  const patch: { name?: string; permissions?: Record<string, boolean> } = {}
  if (name !== undefined) patch.name = name
  if (permissions !== undefined) {
    const full = { ...existing.permissions, ...permissions }
    if (isGlobalAdmin(existing.name)) full['roles.manage'] = true // stored for display only; enforcement never reads this for Global Admin
    patch.permissions = full
  }

  const updated = await rolesStore.updateRole(id, patch)
  audit(req, 'role_updated', id, existing, updated)
  invalidatePermissionsCache(existing.name)
  if (patch.name) invalidatePermissionsCache(patch.name)
  res.json({ success: true, data: updated })
}))

// DELETE /api/roles/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = req.params.id as string
  const existing = await rolesStore.getRole(id)
  if (!existing) { res.status(404).json({ success: false, error: 'Role not found' }); return }
  if (existing.is_builtin) { res.status(403).json({ success: false, error: 'Built-in roles cannot be deleted.' }); return }

  const assignments = await rolesStore.listAssignments()
  if (assignments.some(a => a.role_id === id)) {
    res.status(409).json({ success: false, error: 'Reassign every user on this role before deleting it.' }); return
  }

  await rolesStore.deleteRole(id)
  audit(req, 'role_deleted', id, existing, null)
  invalidatePermissionsCache(existing.name)
  res.json({ success: true })
}))

// GET /api/roles/assignments
router.get('/assignments', asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await rolesStore.listAssignments() })
}))

// POST /api/roles/assignments { userEmail, roleId }
router.post('/assignments', asyncHandler(async (req, res) => {
  const schema = z.object({ userEmail: z.string().trim().email(), roleId: z.string().trim().min(1) })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid assignment' }); return }
  const { userEmail, roleId } = parsed.data

  const role = await rolesStore.getRole(roleId)
  if (!role) { res.status(404).json({ success: false, error: 'Role not found' }); return }

  const before = await rolesStore.getAssignment(userEmail)
  const assignment = await rolesStore.setAssignment(userEmail, roleId, actorEmail(req))
  audit(req, before ? 'user_reassigned' : 'user_assigned', userEmail, before ?? null, assignment)
  res.json({ success: true, data: assignment })
}))

// DELETE /api/roles/assignments/:email
router.delete('/assignments/:email', asyncHandler(async (req, res) => {
  const email = req.params.email as string
  const before = await rolesStore.getAssignment(email)
  await rolesStore.removeAssignment(email)
  audit(req, 'user_unassigned', email, before ?? null, null)
  res.json({ success: true })
}))

export default router
