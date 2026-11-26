import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

const saveJiraConfig = vi.fn()
const saveConfluenceConfig = vi.fn()
vi.mock('../../store/atlassianConfig.js', () => ({
  saveJiraConfig: (c: unknown) => saveJiraConfig(c),
  saveConfluenceConfig: (c: unknown) => saveConfluenceConfig(c),
  getJiraConfig: () => ({ baseUrl: 'https://acme.atlassian.net', email: 'a@acme.com', apiToken: 't', projectKey: 'ITO' }),
  getConfluenceConfig: () => ({ baseUrl: 'https://acme.atlassian.net', email: 'a@acme.com', apiToken: 't', spaceKey: undefined }),
}))

let server: http.Server
let base = ''
beforeAll(async () => {
  const { default: router } = await import('../integrations.js')
  const app = express(); app.use(express.json()); app.use('/api/integrations', router)
  server = http.createServer(app)
  await new Promise<void>(r => server.listen(0, r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>(r => server.close(() => r())))
beforeEach(() => { saveJiraConfig.mockReset(); saveConfluenceConfig.mockReset() })

const push = (id: string, fields: unknown, role = 'Global Admin') =>
  fetch(`${base}/api/integrations/${id}/credentials`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-role': role }, body: JSON.stringify({ fields }) })
    .then(async r => ({ status: r.status, json: await r.json() as Record<string, unknown> }))

describe('Jira and Confluence credentials can be pushed from Settings -> Integrations', () => {
  it('saves valid Jira settings', async () => {
    const r = await push('jira', { baseUrl: 'https://acme.atlassian.net', email: 'a@acme.com', apiToken: 'ATATT-token', projectKey: 'OPS' })
    expect(r.status).toBe(200)
    expect(saveJiraConfig).toHaveBeenCalledWith({ baseUrl: 'https://acme.atlassian.net', email: 'a@acme.com', apiToken: 'ATATT-token', projectKey: 'OPS' })
    expect(JSON.stringify(r.json)).not.toContain('ATATT-token') // the token is never echoed back
  })

  it('rejects an invalid URL, an invalid email and a missing token for Jira', async () => {
    expect((await push('jira', { baseUrl: 'not a url', email: 'a@acme.com', apiToken: 'x' })).status).toBe(400)
    expect((await push('jira', { baseUrl: 'https://acme.atlassian.net', email: 'nope', apiToken: 'x' })).status).toBe(400)
    expect((await push('jira', { baseUrl: 'https://acme.atlassian.net', email: 'a@acme.com', apiToken: '' })).status).toBe(400)
    expect(saveJiraConfig).not.toHaveBeenCalled()
  })

  it('accepts Confluence with every field optional, and ignores empty values', async () => {
    const r = await push('confluence', { baseUrl: '', spaceKey: 'IT', apiToken: '' })
    expect(r.status).toBe(200)
    expect(saveConfluenceConfig).toHaveBeenCalledWith({ spaceKey: 'IT' })
  })

  it('refuses anyone without the Settings page permission', async () => {
    expect((await push('jira', { baseUrl: 'https://acme.atlassian.net', email: 'a@acme.com', apiToken: 'x' }, 'Helpdesk')).status).toBe(403)
    expect(saveJiraConfig).not.toHaveBeenCalled()
  })

  it('lists Jira and Confluence in the integration status', async () => {
    const res = await fetch(`${base}/api/integrations/status`, { headers: { 'x-user-role': 'Helpdesk' } })
    const ids = ((await res.json()) as { data: Array<{ id: string }> }).data.map(x => x.id)
    expect(ids).toEqual(expect.arrayContaining(['jira', 'confluence', 'postgres']))
  })
})
