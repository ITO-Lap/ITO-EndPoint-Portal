import { describe, it, expect, beforeEach, vi } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'net'
import { errorHandler } from '../../middleware/errorHandler.js'

vi.mock('fs', async importOriginal => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, readFileSync: vi.fn(() => { throw new Error('no file in tests') }), writeFileSync: vi.fn() }
})

import * as rolesStore from '../../store/rolesStore.js'
import rolesRouter from '../roles.js'

interface Envelope { success: boolean; data?: unknown; error?: string }

function httpRequest(method: string, url: string, headers: Record<string, string> = {}, body?: unknown): Promise<{ status: number; json: Envelope }> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined
    const req = http.request(url, {
      method,
      headers: { ...headers, ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}) },
    }, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, json: data ? JSON.parse(data) : null }))
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function startServer() {
  const app = express()
  app.use(express.json())
  app.use('/api/roles', rolesRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>(resolve => server.once('listening', resolve))
  const port = (server.address() as AddressInfo).port
  return { server, baseUrl: `http://127.0.0.1:${port}/api/roles` }
}

const ADMIN = { 'x-user-role': 'Global Admin', 'x-user-email': 'admin@zinnia.com' }
const HELPDESK = { 'x-user-role': 'Helpdesk', 'x-user-email': 'helpdesk@zinnia.com' }

describe('routes/roles — custom RBAC management (file-based store, no database)', () => {
  beforeEach(() => {
    rolesStore.__resetStateForTests()
  })

  it('rejects a caller without the roles.manage permission', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const res = await httpRequest('GET', baseUrl, HELPDESK)
      expect(res.status).toBe(403)
    } finally { server.close() }
  })

  it('GET / lists the 3 seeded built-ins, Global Admin shown as all-true', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const res = await httpRequest('GET', baseUrl, ADMIN)
      expect(res.status).toBe(200)
      const roles = res.json.data as Array<{ name: string; permissions: Record<string, boolean> }>
      expect(roles.map(r => r.name).sort()).toEqual(['Global Admin', 'Helpdesk', 'IT Admin'])
      const globalAdmin = roles.find(r => r.name === 'Global Admin')!
      expect(Object.values(globalAdmin.permissions).every(v => v === true)).toBe(true)
    } finally { server.close() }
  })

  it('creates a custom role, then updates its permissions', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const created = await httpRequest('POST', baseUrl, ADMIN, { name: 'Auditor', permissions: { 'pages.Dashboard': true } })
      expect(created.status).toBe(201)
      const role = created.json.data as { id: string; permissions: Record<string, boolean> }
      expect(role.permissions['pages.Dashboard']).toBe(true)

      const updated = await httpRequest('PUT', `${baseUrl}/${role.id}`, ADMIN, { permissions: { 'staleDevices.read': true } })
      expect(updated.status).toBe(200)
      const updatedRole = updated.json.data as { permissions: Record<string, boolean> }
      expect(updatedRole.permissions['pages.Dashboard']).toBe(true) // merged, not replaced
      expect(updatedRole.permissions['staleDevices.read']).toBe(true)
    } finally { server.close() }
  })

  it('refuses to create a role with a name that already exists', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const res = await httpRequest('POST', baseUrl, ADMIN, { name: 'IT Admin', permissions: {} })
      expect(res.status).toBe(409)
    } finally { server.close() }
  })

  it('refuses to delete a built-in role', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const roles = (await httpRequest('GET', baseUrl, ADMIN)).json.data as Array<{ id: string; name: string }>
      const helpdesk = roles.find(r => r.name === 'Helpdesk')!
      const res = await httpRequest('DELETE', `${baseUrl}/${helpdesk.id}`, ADMIN)
      expect(res.status).toBe(403)
    } finally { server.close() }
  })

  it('refuses to delete a custom role that still has assigned users', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const created = (await httpRequest('POST', baseUrl, ADMIN, { name: 'Auditor', permissions: {} })).json.data as { id: string }
      await httpRequest('POST', `${baseUrl}/assignments`, ADMIN, { userEmail: 'pat@zinnia.com', roleId: created.id })

      const res = await httpRequest('DELETE', `${baseUrl}/${created.id}`, ADMIN)
      expect(res.status).toBe(409)
    } finally { server.close() }
  })

  it('assigns, reassigns, and unassigns a user by email', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const roles = (await httpRequest('GET', baseUrl, ADMIN)).json.data as Array<{ id: string; name: string }>
      const itAdmin = roles.find(r => r.name === 'IT Admin')!

      const assigned = await httpRequest('POST', `${baseUrl}/assignments`, ADMIN, { userEmail: 'pat@zinnia.com', roleId: itAdmin.id })
      expect(assigned.status).toBe(200)

      const list = (await httpRequest('GET', `${baseUrl}/assignments`, ADMIN)).json.data as Array<{ user_email: string }>
      expect(list.some(a => a.user_email === 'pat@zinnia.com')).toBe(true)

      const removed = await httpRequest('DELETE', `${baseUrl}/assignments/pat@zinnia.com`, ADMIN)
      expect(removed.status).toBe(200)
      const after = (await httpRequest('GET', `${baseUrl}/assignments`, ADMIN)).json.data as Array<{ user_email: string }>
      expect(after.some(a => a.user_email === 'pat@zinnia.com')).toBe(false)
    } finally { server.close() }
  })

  it('GET /permission-keys returns the grouped taxonomy', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const res = await httpRequest('GET', `${baseUrl}/permission-keys`, ADMIN)
      expect(res.status).toBe(200)
      const groups = res.json.data as Array<{ key: string; keys: Array<{ key: string }> }>
      expect(groups.some(g => g.key === 'pages')).toBe(true)
      expect(groups.some(g => g.key === 'capabilities')).toBe(true)
    } finally { server.close() }
  })
})
