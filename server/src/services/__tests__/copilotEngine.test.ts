import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockFetch = vi.hoisted(() => vi.fn())
vi.mock('../../store/integrationStore.js', () => ({ getGeminiConfig: vi.fn() }))

const mockGetToolByName = vi.hoisted(() => vi.fn())
const mockToolsAllowedForRole = vi.hoisted(() => vi.fn())
vi.mock('../copilotTools.js', () => ({
  getToolByName: mockGetToolByName,
  toolsAllowedForRole: mockToolsAllowedForRole,
  scrubSecrets: (v: unknown) => v,
  COPILOT_TOOLS: [],
}))

import { getGeminiConfig } from '../../store/integrationStore.js'
import { runCopilotChat } from '../copilotEngine.js'

const ctx = { actorEmail: 'admin@zinnia.com', actorRole: 'Global Admin' }
const gemini = { apiKey: 'AIza-test-key', model: 'gemini-2.5-flash', enableGoogleSearch: true }

function response(data: unknown) {
  return { ok: true, status: 200, json: vi.fn().mockResolvedValue(data) }
}
function toolCallResponse(name: string, args: Record<string, unknown>, id = 'call_1') {
  return { candidates: [{ content: { role: 'model', parts: [{ functionCall: { id, name, args } }] } }] }
}
function finalResponse(text: string) {
  return { candidates: [{ content: { role: 'model', parts: [{ text }] } }] }
}

describe('copilotEngine — Gemini runCopilotChat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
    mockToolsAllowedForRole.mockReturnValue([])
    vi.mocked(getGeminiConfig).mockReturnValue(gemini)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('returns available:false and makes no Gemini request when Gemini is not configured', async () => {
    vi.mocked(getGeminiConfig).mockReturnValue(undefined)
    const result = await runCopilotChat({ history: [], userMessage: 'hello', ctx })
    expect(result.available).toBe(false)
    expect(result.message.content.toLowerCase()).toContain('unavailable')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('short-circuits a write tool call into a pending action and never executes it', async () => {
    const writeRun = vi.fn()
    mockGetToolByName.mockReturnValue({ name: 'trigger_automation_rule', rbac: 'write', run: writeRun, describeAction: (args: Record<string, unknown>) => `Run rule ${args.ruleId}` })
    mockFetch.mockResolvedValueOnce(response(toolCallResponse('trigger_automation_rule', { ruleId: 'rule-1' })))
    const result = await runCopilotChat({ history: [], userMessage: 'run rule-1', ctx })
    expect(result.pendingAction?.toolName).toBe('trigger_automation_rule')
    expect(result.pendingAction?.args).toEqual({ ruleId: 'rule-1' })
    expect(writeRun).not.toHaveBeenCalled()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('executes a read tool, sends the result to Gemini, and returns internal citations', async () => {
    const freshness = new Date().toISOString()
    const readRun = vi.fn().mockResolvedValue({ result: { count: 1 }, citations: [{ source: 'Intune', recordId: 'device-1', freshness }] })
    mockGetToolByName.mockReturnValue({ name: 'lookup_devices', rbac: 'read', run: readRun })
    mockFetch.mockResolvedValueOnce(response(toolCallResponse('lookup_devices', { query: 'device-1' })))
    mockFetch.mockResolvedValueOnce(response(finalResponse('Found 1 device.')))
    const result = await runCopilotChat({ history: [], userMessage: 'find device-1', ctx })
    expect(readRun).toHaveBeenCalledTimes(1)
    expect(result.message.content).toBe('Found 1 device.')
    expect(result.message.citations).toEqual([{ source: 'Intune', recordId: 'device-1', freshness }])
    const secondRequest = JSON.parse(mockFetch.mock.calls[1]![1].body as string)
    expect(secondRequest.contents.at(-1).parts[0].functionResponse.response.result).toEqual({ count: 1 })
  })

  it('adds page context transiently to this Gemini request without adding a conversation turn', async () => {
    mockFetch.mockResolvedValueOnce(response(finalResponse('This device looks fine.')))
    await runCopilotChat({ history: [], userMessage: 'why is this mismatched?', ctx, pageContext: { page: 'Risk Scoring', deviceId: 'dev-123' } })
    const request = JSON.parse(mockFetch.mock.calls[0]![1].body as string)
    expect(request.contents).toHaveLength(1)
    expect(request.contents[0].parts[0].text).toContain('Risk Scoring')
    expect(request.contents[0].parts[0].text).toContain('dev-123')
  })

  it('uses Google Search grounding by default and can disable it', async () => {
    mockFetch.mockResolvedValueOnce(response(finalResponse('Hi.')))
    await runCopilotChat({ history: [], userMessage: 'hello', ctx })
    let request = JSON.parse(mockFetch.mock.calls[0]![1].body as string)
    expect(request.tools).toContainEqual({ google_search: {} })
    vi.mocked(getGeminiConfig).mockReturnValue({ ...gemini, enableGoogleSearch: false })
    mockFetch.mockResolvedValueOnce(response(finalResponse('Hi.')))
    await runCopilotChat({ history: [], userMessage: 'hello', ctx })
    request = JSON.parse(mockFetch.mock.calls[1]![1].body as string)
    expect(request.tools ?? []).not.toContainEqual({ google_search: {} })
  })

  it('returns Google Search source citations from grounding metadata', async () => {
    mockFetch.mockResolvedValueOnce(response({ candidates: [{ content: { role: 'model', parts: [{ text: 'Vendor guidance.' }] }, groundingMetadata: { groundingChunks: [{ web: { title: 'Vendor advisory', uri: 'https://example.test/advisory' } }] } }] }))
    const result = await runCopilotChat({ history: [], userMessage: 'latest advisory', ctx })
    expect(result.message.citations?.[0]).toMatchObject({ source: 'Google Search', recordId: 'Vendor advisory', url: 'https://example.test/advisory' })
  })
})
