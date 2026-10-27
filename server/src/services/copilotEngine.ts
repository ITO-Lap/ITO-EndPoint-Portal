// Endpoint Operations Copilot — Gemini tool-calling loop.
// Gemini chooses between role-scoped internal tools and Google Search grounding.
// The application, never Gemini, executes internal tool calls.

import { getGeminiConfig } from '../store/integrationStore.js'
import { COPILOT_TOOLS, getToolByName, toolsAllowedForRole, scrubSecrets, type CopilotCitation, type ToolContext } from './copilotTools.js'

const DEFAULT_MODEL = 'gemini-2.5-flash'
const MAX_TOOL_ITERATIONS = 5

export interface CopilotMessage { role: 'user' | 'assistant'; content: string; citations?: CopilotCitation[] }
export interface CopilotRequestContext { page?: string; deviceId?: string; userId?: string; reportId?: string; automationRunId?: string; findingId?: string }
export interface CopilotPendingActionDraft { toolName: string; args: Record<string, unknown>; summary: string }
export interface CopilotChatResult {
  message: CopilotMessage
  pendingAction?: CopilotPendingActionDraft
  available: boolean
  toolCallTrace: Array<{ tool: string; args: unknown; result?: unknown; error?: string }>
}

type GeminiPart = {
  text?: string
  functionCall?: { id?: string; name?: string; args?: Record<string, unknown> }
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> }
}
type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] }
type GeminiResponse = {
  candidates?: Array<{ content?: GeminiContent; groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> } }>
  error?: { message?: string }
}

const SYSTEM_PROMPT = `You are Ocean, the Endpoint Operations assistant for Zinnia's endpoint management platform.
Rules:
- For facts about this organisation's devices, users, policies, apps, risk, or activity, ALWAYS call an approved internal tool. Never invent internal data.
- Public-web research is permitted only for information that cannot come from internal tools, such as vendor release notes or current CVE guidance. Treat public web sources as external, not as internal telemetry.
- Never send secrets, credentials, access tokens, or unrequested personal data to a public-web query. Keep Google Search queries generic and minimal.
- If an internal source is unavailable, say so plainly. Ask a clarification only when an internal record cannot be identified from the question or page context.
- For write actions, call the corresponding tool. The application requires user confirmation before it executes; never claim completion before confirmation.
- Be concise and cite internal records and external sources used.`

function describePageContext(context: CopilotRequestContext): string | null {
  const parts = [
    context.page && `Current page: ${context.page}.`,
    context.deviceId && `Referenced device id: ${context.deviceId}.`,
    context.userId && `Referenced user id: ${context.userId}.`,
    context.reportId && `Referenced report id: ${context.reportId}.`,
    context.automationRunId && `Referenced automation run id: ${context.automationRunId}.`,
    context.findingId && `Referenced finding id: ${context.findingId}.`,
  ].filter(Boolean)
  return parts.length ? `${parts.join(' ')} If a record is ambiguous, use the referenced id with a relevant internal tool.` : null
}

function toGeminiTools(role: string, googleSearchEnabled: boolean): unknown[] {
  const declarations = toolsAllowedForRole(role).map(tool => ({ name: tool.name, description: tool.description, parameters: tool.parameters }))
  return [
    ...(declarations.length ? [{ functionDeclarations: declarations }] : []),
    ...(googleSearchEnabled ? [{ google_search: {} }] : []),
  ]
}

async function generateContent(contents: GeminiContent[], tools: unknown[]): Promise<GeminiResponse> {
  const config = getGeminiConfig()
  if (!config?.apiKey) throw new Error('GEMINI_API_KEY is not configured')
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model || DEFAULT_MODEL)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      ...(tools.length ? { tools } : {}),
      generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
    }),
  })
  const data = await response.json().catch(() => ({})) as GeminiResponse
  if (!response.ok) throw new Error(data.error?.message || `Gemini request failed (${response.status})`)
  return data
}

function externalCitations(response: GeminiResponse): CopilotCitation[] {
  const freshness = new Date().toISOString()
  return (response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []).flatMap(({ web }) => web?.uri ? [{ source: 'Google Search', recordId: web.title || web.uri, freshness, url: web.uri }] : [])
}

function functionResponse(id: string | undefined, name: string, response: Record<string, unknown>): GeminiPart {
  return { functionResponse: { ...(id ? { id } : {}), name, response } }
}

export async function runCopilotChat(params: { history: CopilotMessage[]; userMessage: string; ctx: ToolContext; pageContext?: CopilotRequestContext }): Promise<CopilotChatResult> {
  const { history, userMessage, ctx, pageContext } = params
  const config = getGeminiConfig()
  if (!config?.apiKey) {
    return { available: false, message: { role: 'assistant', content: 'Ocean is currently unavailable — Google Gemini is not configured. Add GEMINI_API_KEY in Settings → Integrations to enable it.' }, toolCallTrace: [] }
  }

  const note = pageContext ? describePageContext(pageContext) : null
  const contents: GeminiContent[] = [
    ...history.map(message => ({ role: message.role === 'assistant' ? 'model' as const : 'user' as const, parts: [{ text: message.content }] })),
    { role: 'user', parts: [{ text: `${note ? `${note}\n\n` : ''}${userMessage}` }] },
  ]
  const tools = toGeminiTools(ctx.actorRole, config.enableGoogleSearch !== false)
  const citations: CopilotCitation[] = []
  const toolCallTrace: CopilotChatResult['toolCallTrace'] = []

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await generateContent(contents, tools)
    const modelContent = response.candidates?.[0]?.content
    if (!modelContent) return { available: true, message: { role: 'assistant', content: 'The Copilot did not return a response. Please try again.' }, toolCallTrace }

    citations.push(...externalCitations(response))
    const calls = modelContent.parts.flatMap(part => part.functionCall?.name ? [part.functionCall] : [])
    if (!calls.length) {
      const content = modelContent.parts.map(part => part.text || '').filter(Boolean).join('\n').trim()
      return { available: true, message: { role: 'assistant', content: content || 'I could not produce a response. Please try again.', ...(citations.length ? { citations } : {}) }, toolCallTrace }
    }

    contents.push(modelContent)
    const functionResponses: GeminiPart[] = []
    for (const call of calls) {
      const toolName = call.name!
      const args = call.args && typeof call.args === 'object' ? call.args : {}
      const redactedArgs = scrubSecrets(args)
      const tool = getToolByName(toolName)
      if (!tool) {
        toolCallTrace.push({ tool: toolName, args: redactedArgs, error: 'Unknown tool' })
        functionResponses.push(functionResponse(call.id, toolName, { error: `Unknown tool: ${toolName}` }))
        continue
      }
      if (tool.rbac === 'write') {
        const summary = tool.describeAction ? tool.describeAction(args) : `Run ${tool.name} with the given arguments`
        return { available: true, message: { role: 'assistant', content: `${summary}. This requires your confirmation before it runs — review and confirm or reject below.` }, pendingAction: { toolName: tool.name, args: redactedArgs, summary }, toolCallTrace }
      }
      try {
        const output = await tool.run(args, ctx)
        const result = scrubSecrets(output.result)
        citations.push(...output.citations)
        toolCallTrace.push({ tool: toolName, args: redactedArgs, result })
        functionResponses.push(functionResponse(call.id, toolName, { result: result as Record<string, unknown> }))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        toolCallTrace.push({ tool: toolName, args: redactedArgs, error: message })
        functionResponses.push(functionResponse(call.id, toolName, { error: message }))
      }
    }
    contents.push({ role: 'user', parts: functionResponses })
  }

  return { available: true, message: { role: 'assistant', content: 'I gathered information across multiple tool calls but reached the maximum reasoning depth for a single turn. Please ask a more specific follow-up question.', ...(citations.length ? { citations } : {}) }, toolCallTrace }
}

export { COPILOT_TOOLS }
