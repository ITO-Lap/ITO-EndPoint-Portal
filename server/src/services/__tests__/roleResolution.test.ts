import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('fs', async importOriginal => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, readFileSync: vi.fn(() => { throw new Error('no file in tests') }), writeFileSync: vi.fn() }
})

import * as rolesStore from '../../store/rolesStore.js'
import { resolveUserRole, permissionsForRole, invalidatePermissionsCache } from '../roleResolution.js'

beforeEach(() => {
  rolesStore.__resetStateForTests()
  invalidatePermissionsCache()
})

describe('resolveUserRole — resolution order', () => {
  it('allowlisted email always resolves to Global Admin, even with a conflicting legacy group role', async () => {
    const result = await resolveUserRole('boss@zinnia.com', true, { role: 'Helpdesk', lookupFailed: false })
    expect(result).toEqual({ role: 'Global Admin' })
  })

  it('a per-user assignment wins over the legacy AAD group result', async () => {
    const roles = await rolesStore.listRoles()
    const helpdesk = roles.find(r => r.name === 'Helpdesk')!
    await rolesStore.setAssignment('pat@zinnia.com', helpdesk.id, 'admin@zinnia.com')

    const result = await resolveUserRole('pat@zinnia.com', false, { role: 'IT Admin', lookupFailed: false })
    expect(result).toEqual({ role: 'Helpdesk' })
  })

  it('an assignment can point at a custom role, not just a built-in', async () => {
    const custom = await rolesStore.createRole({ name: 'Auditor', permissions: {}, created_by: 'admin@zinnia.com' })
    await rolesStore.setAssignment('pat@zinnia.com', custom.id, 'admin@zinnia.com')

    const result = await resolveUserRole('pat@zinnia.com', false, { role: null, lookupFailed: false })
    expect(result).toEqual({ role: 'Auditor' })
  })

  it('falls back to the legacy AAD group result when there is no assignment', async () => {
    const result = await resolveUserRole('pat@zinnia.com', false, { role: 'IT Admin', lookupFailed: false })
    expect(result).toEqual({ role: 'IT Admin' })
  })

  it('denies when there is no assignment and no legacy group match', async () => {
    const result = await resolveUserRole('pat@zinnia.com', false, { role: null, lookupFailed: false })
    expect(result).toEqual({ denied: true, groupLookupFailed: false })
  })

  it('propagates groupLookupFailed so the caller can distinguish "denied" from "could not check"', async () => {
    const result = await resolveUserRole('pat@zinnia.com', false, { role: null, lookupFailed: true })
    expect(result).toEqual({ denied: true, groupLookupFailed: true })
  })

  it('falls back to the legacy group when the assigned role has since been deleted', async () => {
    const custom = await rolesStore.createRole({ name: 'Temp', permissions: {}, created_by: 'admin@zinnia.com' })
    await rolesStore.setAssignment('pat@zinnia.com', custom.id, 'admin@zinnia.com')
    await rolesStore.deleteRole(custom.id)

    const result = await resolveUserRole('pat@zinnia.com', false, { role: 'Helpdesk', lookupFailed: false })
    expect(result).toEqual({ role: 'Helpdesk' })
  })
})

describe('permissionsForRole', () => {
  it('Global Admin always has every permission, bypassing the stored row entirely', async () => {
    const perms = await permissionsForRole('Global Admin')
    expect(Object.values(perms).every(v => v === true)).toBe(true)
  })

  it('resolves a built-in role by name to its stored permission set', async () => {
    const perms = await permissionsForRole('IT Admin')
    expect(perms['staleDevices.export']).toBe(true)
  })

  it('an unknown role name (e.g. the never-assigned End User) resolves to no permissions', async () => {
    const perms = await permissionsForRole('End User')
    expect(perms).toEqual({})
  })

  it('reflects a role edit immediately after invalidatePermissionsCache()', async () => {
    const before = await permissionsForRole('Helpdesk')
    expect(before['staleDevices.export']).toBe(false)

    const roles = await rolesStore.listRoles()
    const helpdesk = roles.find(r => r.name === 'Helpdesk')!
    await rolesStore.updateRole(helpdesk.id, { permissions: { ...helpdesk.permissions, 'staleDevices.export': true } })
    invalidatePermissionsCache('Helpdesk')

    const after = await permissionsForRole('Helpdesk')
    expect(after['staleDevices.export']).toBe(true)
  })
})
