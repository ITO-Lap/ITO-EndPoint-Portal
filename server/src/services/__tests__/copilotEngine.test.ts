import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock OpenAI entirely — no real network calls. The mock `create` fn is
// controlled per-test via `mockCreate.mockResolvedValueOnce(...)`.
const mockCreate = vi.hoisted(() => vi.fn())
vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreate } }
  },
}))

vi.mock('../../store/integrationStore.js', () => ({
  getOpenAIConfig: vi.fn(),
}))

const mockGetToolByName = vi.hoisted(() => vi.fn())
const mockToolsAllowedForRole = vi.hoisted(() => vi.fn())
vi.mock('../copilotTools.js', () => ({
  getToolByName: mockGetToolByName,
  toolsAllowedForRole: mockToolsAllowedForRole,
  scrubSecrets: (v: unknown) => v,
  COPILOT_TOOLS: [],
}))

import { getOpenAIConfig } from '../../store/integrationStore.js'
import { runCopilotChat } from '../copilotEngine.js'

function toolCallResponse(name: string, args: Record<string, unknown>, id = 'call_1') {
  return {
    choices: [{
      message: {
        role: 'assistant', content: null,
        tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
      },
    }],
  }
}

function finalResponse(content: string) {
  return { choices: [{ message: { role: 'assistant', content, tool_calls: [] } }] }
}

const ctx = { actorEmail: 'admin@zinnia.com', actorRole: 'Global Admin' }

describe('copilotEngine — runCopilotChat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockToolsAllowedForRole.mockReturnValue([])
  })

  it('returns available:false and makes no OpenAI call when OpenAI is not configured', async () => {
    vi.mocked(getOpenAIConfig).mockReturnValue(undefined)

    const result = await runCopilotChat({ history: [], userMessage: 'hello', ctx })

    expect(result.available).toBe(false)
    expect(result.message.role).toBe('assistant')
    expect(result.message.content.toLowerCase()).toContain('unavailable')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('short-circuits a write tool call into a pendingAction and never executes it', async () => {
    vi.mocked(getOpenAIConfig).mockReturnValue({ apiKey: 'test-key' })
    const writeRun = vi.fn()
    mockGetToolByName.mockReturnValue({
      name: 'trigger_automation_rule', rbac: 'write', run: writeRun,
      describeAction: (args: Record<string, unknown>) => `Run rule ${args.ruleId}`,
    })
    mockCreate.mockResolvedValueOnce(toolCallResponse('trigger_automation_rule', { ruleId: 'rule-1' }))

    const result = await runCopilotChat({ history: [], userMessage: 'run rule-1', ctx })

    expect(result.available).toBe(true)
    expect(result.pendingAction).toBeDefined()
    expect(result.pendingAction?.toolName).toBe('trigger_automation_rule')
    expect(result.pendingAction?.args).toEqual({ ruleId: 'rule-1' })
    expect(writeRun).not.toHaveBeenCalled()
    // Only one OpenAI call — the loop stops immediately on a write tool call.
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('executes a read tool inline, feeds the result back, and returns citations on the final answer', async () => {
    vi.mocked(getOpenAIConfig).mockReturnValue({ apiKey: 'test-key' })
    const freshness = new Date().toISOString()
    const readRun = vi.fn().mockResolvedValue({
      result: { count: 1 },
      citations: [{ source: 'Intune', recordId: 'device-1', freshness }],
    })
    mockGetToolByName.mockReturnValue({ name: 'lookup_devices', rbac: 'read', run: readRun })
    mockCreate
      .mockResolvedValueOnce(toolCallResponse('lookup_devices', { query: 'device-1' }))
      .mockResolvedValueOnce(finalResponse('Found 1 device.'))

    const result = await runCopilotChat({ history: [], userMessage: 'find device-1', ctx })

    expect(readRun).toHaveBeenCalledTimes(1)
    expect(result.available).toBe(true)
    expect(result.message.content).toBe('Found 1 device.')
    expect(result.message.citations).toEqual([{ source: 'Intune', recordId: 'device-1', freshness }])
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it('feeds a tool failure back to the model instead of throwing', async () => {
    vi.mocked(getOpenAIConfig).mockReturnValue({ apiKey: 'test-key' })
    const readRun = vi.fn().mockRejectedValue(new Error('Intune is not configured'))
    mockGetToolByName.mockReturnValue({ name: 'lookup_devices', rbac: 'read', run: readRun })
    mockCreate
      .mockResolvedValueOnce(toolCallResponse('lookup_devices', { query: 'x' }))
      .mockResolvedValueOnce(finalResponse('Intune is not configured, so I could not look up that device.'))

    const result = await runCopilotChat({ history: [], userMessage: 'find x', ctx })

    expect(result.available).toBe(true)
    expect(result.message.content).toContain('not configured')
    expect(result.toolCallTrace[0]?.error).toBe('Intune is not configured')
  })
})
