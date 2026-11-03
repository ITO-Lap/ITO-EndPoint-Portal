// Persistence for custom RBAC — dual-backend, same convention as
// scheduledReportsStore.ts: DATABASE_URL set → Postgres (custom_roles,
// user_role_assignments, rbac_audit_log — see server/src/db/schema.sql);
// unset → a JSON file (server/.rbac.json). Every exported function is async
// so both backends share one call-site contract.
//
// The 3 built-in roles (Global Admin, IT Admin, Helpdesk) are seeded once at
// module load from rolePermissions.ts's defaults, on whichever backend is
// active, so a fresh deployment behaves identically to the old hardcoded
// role model before any custom role is ever created.

import { dataFile, legacyServerFile, readJsonFile, writeJsonAtomic } from './dataDir.js'
import { randomUUID } from 'crypto'
import { isDbAvailable, query } from '../db/index.js'
import { BUILTIN_ROLE_DEFAULTS, allTruePermissions, type PermissionMap } from '../services/rolePermissions.js'

export interface CustomRole {
  id:          string
  name:        string
  is_builtin:  boolean
  permissions: PermissionMap
  created_by:  string | null
  created_at:  string
  updated_at:  string
}

export interface UserRoleAssignment {
  id:          string
  user_email:  string
  role_id:     string
  assigned_by: string
  created_at:  string
  updated_at:  string
}

export interface RbacAuditEntry {
  id:         string
  userEmail:  string
  action:     string
  resourceId: string
  oldValue:   unknown
  newValue:   unknown
  createdAt:  string
}

const USE_DB = isDbAvailable()
const MAX_AUDIT_ENTRIES = 200

// ─── DB row → record mappers ────────────────────────────────────────────────

interface RoleRow { id: string; name: string; is_builtin: boolean; permissions: PermissionMap; created_by: string | null; created_at: Date; updated_at: Date }
function roleFromRow(r: RoleRow): CustomRole {
  return { id: r.id, name: r.name, is_builtin: r.is_builtin, permissions: r.permissions, created_by: r.created_by, created_at: r.created_at.toISOString(), updated_at: r.updated_at.toISOString() }
}

interface AssignmentRow { id: string; user_email: string; role_id: string; assigned_by: string; created_at: Date; updated_at: Date }
function assignmentFromRow(r: AssignmentRow): UserRoleAssignment {
  return { id: r.id, user_email: r.user_email, role_id: r.role_id, assigned_by: r.assigned_by, created_at: r.created_at.toISOString(), updated_at: r.updated_at.toISOString() }
}

interface AuditRow { id: string; user_email: string; action: string; resource_id: string; old_value: unknown; new_value: unknown; created_at: Date }
function auditFromRow(r: AuditRow): RbacAuditEntry {
  return { id: r.id, userEmail: r.user_email, action: r.action, resourceId: r.resource_id, oldValue: r.old_value, newValue: r.new_value, createdAt: r.created_at.toISOString() }
}

// ─── JSON-file backend (used only when DATABASE_URL is unset) ──────────────

interface StoreFile {
  roles:       CustomRole[]
  assignments: UserRoleAssignment[]
  auditLog:    RbacAuditEntry[]
}

const STORE_FILE = dataFile('rbac.json', [legacyServerFile('.rbac.json')])

function emptyFile(): StoreFile {
  return { roles: [], assignments: [], auditLog: [] }
}

function load(): StoreFile {
  try {
    const parsed = readJsonFile<Partial<StoreFile>>(STORE_FILE) ?? {}
    return { roles: parsed.roles ?? [], assignments: parsed.assignments ?? [], auditLog: parsed.auditLog ?? [] }
  } catch {
    return emptyFile()
  }
}

function persist(): void {
  try {
    writeJsonAtomic(STORE_FILE, state)
  } catch (e) {
    console.error('[rolesStore] Failed to persist store:', e)
  }
}

let state: StoreFile = USE_DB ? emptyFile() : load()

/** Test-only: reset in-memory state without touching the on-disk file. Also
 *  resets the built-in-role seeding guard, so the next store call re-seeds
 *  against the fresh (empty) state instead of treating it as already done. */
export function __resetStateForTests(initial: Partial<StoreFile> = {}): void {
  state = { ...emptyFile(), ...initial }
  seeded = null
}

// ─── Built-in role seeding ───────────────────────────────────────────────────

function builtinPermissions(name: 'Global Admin' | 'IT Admin' | 'Helpdesk'): PermissionMap {
  return name === 'Global Admin' ? allTruePermissions() : BUILTIN_ROLE_DEFAULTS[name]
}

async function seedBuiltinRoles(): Promise<void> {
  const names: Array<'Global Admin' | 'IT Admin' | 'Helpdesk'> = ['Global Admin', 'IT Admin', 'Helpdesk']
  if (USE_DB) {
    for (const name of names) {
      await query(
        `INSERT INTO custom_roles (name, is_builtin, permissions) VALUES ($1, true, $2)
         ON CONFLICT (name) DO NOTHING`,
        [name, JSON.stringify(builtinPermissions(name))],
      )
    }
    return
  }
  const now = new Date().toISOString()
  for (const name of names) {
    if (state.roles.some(r => r.name === name)) continue
    state.roles.push({ id: randomUUID(), name, is_builtin: true, permissions: builtinPermissions(name), created_by: null, created_at: now, updated_at: now })
  }
  persist()
}

let seeded: Promise<void> | null = null
/** Idempotent; safe to call from every entry point (routes, roleResolution). */
export function ensureBuiltinRolesSeeded(): Promise<void> {
  if (!seeded) seeded = seedBuiltinRoles().catch(e => { seeded = null; throw e })
  return seeded
}

// ─── Roles ───────────────────────────────────────────────────────────────────

export async function listRoles(): Promise<CustomRole[]> {
  await ensureBuiltinRolesSeeded()
  if (USE_DB) {
    const { rows } = await query<RoleRow>('SELECT * FROM custom_roles ORDER BY is_builtin DESC, name ASC')
    return rows.map(roleFromRow)
  }
  return [...state.roles].sort((a, b) => (Number(b.is_builtin) - Number(a.is_builtin)) || a.name.localeCompare(b.name))
}

export async function getRole(id: string): Promise<CustomRole | undefined> {
  await ensureBuiltinRolesSeeded()
  if (USE_DB) {
    const { rows } = await query<RoleRow>('SELECT * FROM custom_roles WHERE id = $1', [id])
    return rows[0] ? roleFromRow(rows[0]) : undefined
  }
  return state.roles.find(r => r.id === id)
}

export async function getRoleByName(name: string): Promise<CustomRole | undefined> {
  await ensureBuiltinRolesSeeded()
  if (USE_DB) {
    const { rows } = await query<RoleRow>('SELECT * FROM custom_roles WHERE name = $1', [name])
    return rows[0] ? roleFromRow(rows[0]) : undefined
  }
  return state.roles.find(r => r.name === name)
}

export async function createRole(input: { name: string; permissions: PermissionMap; created_by: string | null }): Promise<CustomRole> {
  if (USE_DB) {
    const { rows } = await query<RoleRow>(
      `INSERT INTO custom_roles (name, is_builtin, permissions, created_by) VALUES ($1, false, $2, $3) RETURNING *`,
      [input.name, JSON.stringify(input.permissions), input.created_by],
    )
    return roleFromRow(rows[0]!)
  }
  const now = new Date().toISOString()
  const record: CustomRole = { id: randomUUID(), name: input.name, is_builtin: false, permissions: input.permissions, created_by: input.created_by, created_at: now, updated_at: now }
  state.roles.push(record)
  persist()
  return record
}

export async function updateRole(id: string, patch: Partial<Pick<CustomRole, 'name' | 'permissions'>>): Promise<CustomRole | undefined> {
  if (USE_DB) {
    const fields = Object.keys(patch) as Array<keyof typeof patch>
    if (fields.length === 0) return getRole(id)
    const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ')
    const values = fields.map(f => (f === 'permissions' ? JSON.stringify(patch[f]) : patch[f]))
    const { rows } = await query<RoleRow>(`UPDATE custom_roles SET ${sets}, updated_at = NOW() WHERE id = $1 RETURNING *`, [id, ...values])
    return rows[0] ? roleFromRow(rows[0]) : undefined
  }
  const record = state.roles.find(r => r.id === id)
  if (!record) return undefined
  Object.assign(record, patch, { updated_at: new Date().toISOString() })
  persist()
  return record
}

export async function deleteRole(id: string): Promise<void> {
  if (USE_DB) {
    await query('DELETE FROM custom_roles WHERE id = $1', [id])
    return
  }
  state.roles = state.roles.filter(r => r.id !== id)
  persist()
}

// ─── Per-user assignments ────────────────────────────────────────────────────

export async function listAssignments(): Promise<UserRoleAssignment[]> {
  if (USE_DB) {
    const { rows } = await query<AssignmentRow>('SELECT * FROM user_role_assignments ORDER BY created_at DESC')
    return rows.map(assignmentFromRow)
  }
  return [...state.assignments]
}

export async function getAssignment(userEmail: string): Promise<UserRoleAssignment | undefined> {
  const email = userEmail.toLowerCase()
  if (USE_DB) {
    const { rows } = await query<AssignmentRow>('SELECT * FROM user_role_assignments WHERE user_email = $1', [email])
    return rows[0] ? assignmentFromRow(rows[0]) : undefined
  }
  return state.assignments.find(a => a.user_email === email)
}

export async function setAssignment(userEmail: string, roleId: string, assignedBy: string): Promise<UserRoleAssignment> {
  const email = userEmail.toLowerCase()
  if (USE_DB) {
    const { rows } = await query<AssignmentRow>(
      `INSERT INTO user_role_assignments (user_email, role_id, assigned_by) VALUES ($1, $2, $3)
       ON CONFLICT (user_email) DO UPDATE SET role_id = $2, assigned_by = $3, updated_at = NOW()
       RETURNING *`,
      [email, roleId, assignedBy],
    )
    return assignmentFromRow(rows[0]!)
  }
  const now = new Date().toISOString()
  const existing = state.assignments.find(a => a.user_email === email)
  if (existing) {
    existing.role_id = roleId; existing.assigned_by = assignedBy; existing.updated_at = now
    persist()
    return existing
  }
  const record: UserRoleAssignment = { id: randomUUID(), user_email: email, role_id: roleId, assigned_by: assignedBy, created_at: now, updated_at: now }
  state.assignments.push(record)
  persist()
  return record
}

export async function removeAssignment(userEmail: string): Promise<void> {
  const email = userEmail.toLowerCase()
  if (USE_DB) {
    await query('DELETE FROM user_role_assignments WHERE user_email = $1', [email])
    return
  }
  state.assignments = state.assignments.filter(a => a.user_email !== email)
  persist()
}

// ─── Audit log ────────────────────────────────────────────────────────────────

export async function recordRbacAuditEntry(entry: Omit<RbacAuditEntry, 'id' | 'createdAt'>): Promise<void> {
  if (USE_DB) {
    await query(
      'INSERT INTO rbac_audit_log (user_email, action, resource_id, old_value, new_value) VALUES ($1, $2, $3, $4, $5)',
      [entry.userEmail, entry.action, entry.resourceId, JSON.stringify(entry.oldValue), JSON.stringify(entry.newValue)],
    )
    return
  }
  state.auditLog.unshift({ id: randomUUID(), ...entry, createdAt: new Date().toISOString() })
  state.auditLog = state.auditLog.slice(0, MAX_AUDIT_ENTRIES)
  persist()
}

export async function listRbacAuditEntries(limit = 50): Promise<RbacAuditEntry[]> {
  if (USE_DB) {
    const { rows } = await query<AuditRow>('SELECT * FROM rbac_audit_log ORDER BY created_at DESC LIMIT $1', [limit])
    return rows.map(auditFromRow)
  }
  return state.auditLog.slice(0, limit)
}
