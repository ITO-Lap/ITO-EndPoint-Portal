import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'net'
import { errorHandler } from '../../middleware/errorHandler.js'

function httpJson(
  method: 'GET' | 'POST',
  url: string,
  headers: Record<string, string> = {},
  body?: unknown
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined
    const req = http.request(
      url,
      { method, headers: { 'Content-Type': 'application/json', ...headers } },
      res => {
        let data = ''
        res.on('data', chunk => { data += chunk })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }))
      }
    )
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

const mockRunCopilotChat = vi.hoisted(() => vi.fn())
vi.mock('../../services/copilotEngine.js', () => ({
  runCopilotChat: mockRunCopilotChat,
}))

const mockGetToolByName = vi.hoisted(() => vi.fn())
vi.mock('../../services/copilotTools.js', () => ({
  getToolByName: mockGetToolByName,
  scrubSecrets: (v: unknown) => v,
  READ_ROLES: ['Global Admin', 'IT Admin', 'Helpdesk'],
  WRITE_ROLES: ['Global Admin', 'IT Admin'],
}))

vi.mock('../../db/index.js', () => ({
  isDbAvailable: vi.fn(() => false),
  query: vi.fn(),
}))

import copilotRouter from '../copilot.js'

async function startServer() {
  const app = express()
  app.use(express.json())
  app.use('/api/copilot', copilotRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>(resolve => server.once('listening', resolve))
  const port = (server.address() as AddressInfo).port
  return { server, baseUrl: `http://127.0.0.1:${port}/api/copilot` }
}

describe('POST /api/copilot/chat — RBAC', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRunCopilotChat.mockResolvedValue({
      available: true,
      message: { role: 'assistant', content: 'Hi there.' },
      toolCallTrace: [],
    })
  })

  it('blocks an End User with 403 and never calls the engine', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const res = await httpJson('POST', `${baseUrl}/chat`, { 'x-user-role': 'End User' }, { message: 'hello' })
      expect(res.status).toBe(403)
      expect(mockRunCopilotChat).not.toHaveBeenCalled()
    } finally { server.close() }
  })

  it('allows Helpdesk (read tier) through to the engine', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const res = await httpJson('POST', `${baseUrl}/chat`, { 'x-user-role': 'Helpdesk' }, { message: 'hello' })
      expect(res.status).toBe(200)
      expect(mockRunCopilotChat).toHaveBeenCalledTimes(1)
    } finally { server.close() }
  })

  it('returns available:false content without persisting when OpenAI is unavailable', async () => {
    mockRunCopilotChat.mockResolvedValue({
      available: false,
      message: { role: 'assistant', content: 'The Copilot is unavailable — OpenAI is not configured.' },
      toolCallTrace: [],
    })
    const { server, baseUrl } = await startServer()
    try {
      const res = await httpJson('POST', `${baseUrl}/chat`, { 'x-user-role': 'Global Admin' }, { message: 'hello' })
      const body = JSON.parse(res.body)
      expect(res.status).toBe(200)
      expect(body.available).toBe(false)
      expect(typeof body.conversationId).toBe('string')
      expect(body.message.content).toContain('unavailable')
    } finally { server.close() }
  })
})

describe('POST /api/copilot/actions/:id/confirm and /reject — pending action lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function createPendingAction(baseUrl: string, writeRun: ReturnType<typeof vi.fn>) {
    mockGetToolByName.mockReturnValue({
      name: 'create_jira_ticket', rbac: 'write', run: writeRun,
      describeAction: () => 'Create a Jira ticket',
    })
    mockRunCopilotChat.mockResolvedValue({
      available: true,
      message: { role: 'assistant', content: 'Confirm to create the ticket.' },
      pendingAction: { toolName: 'create_jira_ticket', args: { summary: 'Test issue' }, summary: 'Create a Jira ticket' },
      toolCallTrace: [],
    })
    const chatRes = await httpJson('POST', `${baseUrl}/chat`, { 'x-user-role': 'Global Admin' }, { message: 'file a ticket' })
    const body = JSON.parse(chatRes.body)
    return body.pendingAction.id as string
  }

  it('blocks Helpdesk from confirming a write action with 403 and never runs it', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const writeRun = vi.fn()
      const id = await createPendingAction(baseUrl, writeRun)
      const res = await httpJson('POST', `${baseUrl}/actions/${id}/confirm`, { 'x-user-role': 'Helpdesk' })
      expect(res.status).toBe(403)
      expect(writeRun).not.toHaveBeenCalled()
    } finally { server.close() }
  })

  it('Global Admin confirming transitions the action to executed and runs the tool exactly once', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const writeRun = vi.fn().mockResolvedValue({ result: { key: 'ITO-123' }, citations: [] })
      const id = await createPendingAction(baseUrl, writeRun)
      const res = await httpJson('POST', `${baseUrl}/actions/${id}/confirm`, { 'x-user-role': 'Global Admin' })
      const body = JSON.parse(res.body)
      expect(res.status).toBe(200)
      expect(body.status).toBe('executed')
      expect(writeRun).toHaveBeenCalledTimes(1)

      // Confirming again should now 404 (no longer pending).
      const second = await httpJson('POST', `${baseUrl}/actions/${id}/confirm`, { 'x-user-role': 'Global Admin' })
      expect(second.status).toBe(404)
      expect(writeRun).toHaveBeenCalledTimes(1)
    } finally { server.close() }
  })

  it('transitions to failed (not thrown) when the underlying write function throws', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const writeRun = vi.fn().mockRejectedValue(new Error('Jira is not configured'))
      const id = await createPendingAction(baseUrl, writeRun)
      const res = await httpJson('POST', `${baseUrl}/actions/${id}/confirm`, { 'x-user-role': 'IT Admin' })
      const body = JSON.parse(res.body)
      expect(res.status).toBe(200)
      expect(body.status).toBe('failed')
      expect(body.message).toContain('not configured')
    } finally { server.close() }
  })

  it('rejecting transitions to rejected and never calls the write function', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const writeRun = vi.fn()
      const id = await createPendingAction(baseUrl, writeRun)
      const res = await httpJson('POST', `${baseUrl}/actions/${id}/reject`, { 'x-user-role': 'Helpdesk' })
      const body = JSON.parse(res.body)
      expect(res.status).toBe(200)
      expect(body.status).toBe('rejected')
      expect(writeRun).not.toHaveBeenCalled()

      const confirmAfterReject = await httpJson('POST', `${baseUrl}/actions/${id}/confirm`, { 'x-user-role': 'Global Admin' })
      expect(confirmAfterReject.status).toBe(404)
      expect(writeRun).not.toHaveBeenCalled()
    } finally { server.close() }
  })
})

describe('POST /api/copilot/chat — page context passthrough', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRunCopilotChat.mockResolvedValue({
      available: true,
      message: { role: 'assistant', content: 'Hi there.' },
      toolCallTrace: [],
    })
  })

  it('forwards a sanitized context object to the engine as pageContext', async () => {
    const { server, baseUrl } = await startServer()
    try {
      await httpJson(
        'POST', `${baseUrl}/chat`, { 'x-user-role': 'Global Admin' },
        { message: 'why is this mismatched?', context: { page: 'Risk Scoring', deviceId: 'dev-123', evil: 'ignored', nested: { a: 1 } } }
      )
      expect(mockRunCopilotChat).toHaveBeenCalledTimes(1)
      const call = mockRunCopilotChat.mock.calls[0]![0]
      expect(call.pageContext).toEqual({ page: 'Risk Scoring', deviceId: 'dev-123' })
    } finally { server.close() }
  })

  it('passes pageContext as undefined when no context is sent', async () => {
    const { server, baseUrl } = await startServer()
    try {
      await httpJson('POST', `${baseUrl}/chat`, { 'x-user-role': 'Global Admin' }, { message: 'hello' })
      const call = mockRunCopilotChat.mock.calls[0]![0]
      expect(call.pageContext).toBeUndefined()
    } finally { server.close() }
  })
})

describe('POST /api/copilot/actions/:id/confirm — send_team_alert write tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('confirming a send_team_alert pending action runs the tool exactly once', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const writeRun = vi.fn().mockResolvedValue({ result: { sent: true, title: 'Fleet issue' }, citations: [] })
      mockGetToolByName.mockReturnValue({
        name: 'send_team_alert', rbac: 'write', run: writeRun,
        describeAction: () => 'Send a Teams alert',
      })
      mockRunCopilotChat.mockResolvedValue({
        available: true,
        message: { role: 'assistant', content: 'Confirm to send the alert.' },
        pendingAction: { toolName: 'send_team_alert', args: { title: 'Fleet issue', message: 'x' }, summary: 'Send a Teams alert' },
        toolCallTrace: [],
      })
      const chatRes = await httpJson('POST', `${baseUrl}/chat`, { 'x-user-role': 'Global Admin' }, { message: 'alert the team' })
      const id = JSON.parse(chatRes.body).pendingAction.id as string

      const res = await httpJson('POST', `${baseUrl}/actions/${id}/confirm`, { 'x-user-role': 'Global Admin' })
      const body = JSON.parse(res.body)
      expect(res.status).toBe(200)
      expect(body.status).toBe('executed')
      expect(writeRun).toHaveBeenCalledTimes(1)
    } finally { server.close() }
  })

  it('blocks Helpdesk from confirming a send_team_alert action', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const writeRun = vi.fn()
      mockGetToolByName.mockReturnValue({
        name: 'send_team_alert', rbac: 'write', run: writeRun,
        describeAction: () => 'Send a Teams alert',
      })
      mockRunCopilotChat.mockResolvedValue({
        available: true,
        message: { role: 'assistant', content: 'Confirm to send the alert.' },
        pendingAction: { toolName: 'send_team_alert', args: { title: 'x', message: 'y' }, summary: 'Send a Teams alert' },
        toolCallTrace: [],
      })
      const chatRes = await httpJson('POST', `${baseUrl}/chat`, { 'x-user-role': 'Global Admin' }, { message: 'alert the team' })
      const id = JSON.parse(chatRes.body).pendingAction.id as string

      const res = await httpJson('POST', `${baseUrl}/actions/${id}/confirm`, { 'x-user-role': 'Helpdesk' })
      expect(res.status).toBe(403)
      expect(writeRun).not.toHaveBeenCalled()
    } finally { server.close() }
  })
})

describe('GET /api/copilot/conversations — no DB configured', () => {
  it('returns an empty array rather than an error', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const res = await httpJson('GET', `${baseUrl}/conversations`, { 'x-user-role': 'Global Admin' })
      const body = JSON.parse(res.body)
      expect(res.status).toBe(200)
      expect(body.conversations).toEqual([])
    } finally { server.close() }
  })
})
