import OpenAI from 'openai'
import type { Device } from '../types.js'

let client: OpenAI | null = null

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')
    client = new OpenAI({ apiKey })
  }
  return client
}

export interface DeviceAnalysis {
  summary: string
  rootCause: string
  recommendation: string
  suggestedRunbook: string
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical'
  steps: string[]
}

export async function analyzeDevice(device: Device): Promise<DeviceAnalysis> {
  const ai = getClient()

  const prompt = `You are an enterprise IT compliance analyst. Analyze this managed device and return a JSON response only.

Device: ${device.deviceName}
User: ${device.user}
Platform: ${device.platform} — ${device.osVersion}
Management Source: ${device.managementSource}
Compliance State: ${device.complianceState}
Encryption Status: ${device.encryptionStatus}
Primary Issue: ${device.primaryIssue}
Policy Failed: ${device.policyFailed}
Severity: ${device.severity}

Return ONLY valid JSON matching this shape exactly:
{
  "summary": "one-sentence status summary",
  "rootCause": "root cause of the compliance issue",
  "recommendation": "recommended remediation action",
  "suggestedRunbook": "runbook name to execute",
  "riskLevel": "Low" | "Medium" | "High" | "Critical",
  "steps": ["step 1", "step 2", "step 3", "step 4", "step 5"]
}`

  const response = await ai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    max_tokens: 600,
    temperature: 0.2,
  })

  const content = response.choices[0]?.message.content ?? '{}'
  return JSON.parse(content) as DeviceAnalysis
}

export async function chatWithAI(message: string, deviceContext?: Device): Promise<string> {
  const ai = getClient()

  const system = `You are an expert enterprise IT endpoint management assistant helping IT administrators.
You specialise in Microsoft Intune, Kandji, and ManageEngine environments.
Be concise, technical, and action-oriented. Prefer bullet points for steps.`

  const context = deviceContext
    ? `Active device context:\n- Name: ${deviceContext.deviceName}\n- Platform: ${deviceContext.platform} (${deviceContext.osVersion})\n- Compliance: ${deviceContext.complianceState}\n- Issue: ${deviceContext.primaryIssue}\n- Source: ${deviceContext.managementSource}\n\n`
    : ''

  const response = await ai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: context + message },
    ],
    max_tokens: 500,
    temperature: 0.3,
  })

  return response.choices[0]?.message.content ?? 'Unable to generate a response.'
}

export function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY
}
