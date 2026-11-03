import { describe, it, expect, beforeEach, vi } from 'vitest'

// Keep this store test hermetic — no real disk writes to server/.rbac.json.
vi.mock('fs', async importOriginal => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, readFileSync: vi.fn(() => { throw new Error('no file in tests') }), writeFileSync: vi.fn() }
})

import * as store from '../rolesStore.js'

beforeEach(() => {
  store.__resetStateForTests()
})

describe('rolesStore — built-in role seeding', () => {
  it('seeds exactly the 3 built-ins, once, idempotently', async () => {
    const roles = await store.listRoles()
    const names = roles.map(r => r.name).sort()
    expect(names).toEqual(['Global Admin', 'Helpdesk', 'IT Admin'])

    await store.ensureBuiltinRolesSeeded()
    expect(await store.listRoles()).toHaveLength(3)
  })

  it('Global Admin is seeded with every permission true', async () => {
    const roles = await store.listRoles()
    const globalAdmin = roles.find(r => r.name === 'Global Admin')!
    expect(Object.values(globalAdmin.permissions).every(v => v === true)).toBe(true)
  })

  it('Helpdesk has narrower permissions than IT Admin', async () => {
    const roles = await store.listRoles()
    const itAdmin = roles.find(r => r.name === 'IT Admin')!
    const helpdesk = roles.find(r => r.name === 'Helpdesk')!
    expect(itAdmin.permissions['roleActivity.export']).toBe(true)
    expect(helpdesk.permissions['roleActivity.export']).toBe(false)
  })
})

describe('rolesStore — custom roles CRUD', () => {
  it('creates, gets by id and by name, updates, and deletes a custom role', async () => {
    const created = await store.createRole({ name: 'Auditor', permissions: { 'pages.Dashboard': true }, created_by: 'admin@zinnia.com' })
    expect(created.id).toBeTruthy()
    expect(created.is_builtin).toBe(false)

    expect((await store.getRole(created.id))?.name).toBe('Auditor')
    expect((await store.getRoleByName('Auditor'))?.id).toBe(created.id)

    const updated = await store.updateRole(created.id, { permissions: { 'pages.Dashboard': true, 'staleDevices.read': true } })
    expect(updated?.permissions['staleDevices.read']).toBe(true)

    await store.deleteRole(created.id)
    expect(await store.getRole(created.id)).toBeUndefined()
  })
})

describe('rolesStore — per-user assignments', () => {
  it('assigns, reassigns (upsert), and removes a user', async () => {
    const roles = await store.listRoles()
    const itAdmin = roles.find(r => r.name === 'IT Admin')!
    const helpdesk = roles.find(r => r.name === 'Helpdesk')!

    await store.setAssignment('Pat@Zinnia.com', itAdmin.id, 'admin@zinnia.com')
    expect((await store.getAssignment('pat@zinnia.com'))?.role_id).toBe(itAdmin.id)

    // upsert: reassigning the same (lowercased) email updates in place, no duplicate row
    await store.setAssignment('pat@zinnia.com', helpdesk.id, 'admin@zinnia.com')
    const assignments = await store.listAssignments()
    expect(assignments.filter(a => a.user_email === 'pat@zinnia.com')).toHaveLength(1)
    expect((await store.getAssignment('pat@zinnia.com'))?.role_id).toBe(helpdesk.id)

    await store.removeAssignment('pat@zinnia.com')
    expect(await store.getAssignment('pat@zinnia.com')).toBeUndefined()
  })
})

describe('rolesStore — audit log', () => {
  it('records and lists entries, most recent first', async () => {
    await store.recordRbacAuditEntry({ userEmail: 'admin@zinnia.com', action: 'role_created', resourceId: 'r1', oldValue: null, newValue: { name: 'Auditor' } })
    await store.recordRbacAuditEntry({ userEmail: 'admin@zinnia.com', action: 'role_deleted', resourceId: 'r1', oldValue: { name: 'Auditor' }, newValue: null })
    const entries = await store.listRbacAuditEntries()
    expect(entries).toHaveLength(2)
    expect(entries[0]?.action).toBe('role_deleted')
  })
})
