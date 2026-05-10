# AI Copilot Feature

The AI Copilot uses **OpenAI GPT-4o-mini** to provide two AI-powered capabilities:
1. **Device Analysis** — deep compliance analysis for a specific device
2. **IT Assistant Chat** — freeform Q&A with an IT-specialist AI

Both features require `OPENAI_API_KEY` to be set. Without it, the endpoints return `503`.

---

## Feature 1: Device Analysis

### What it does

Analyzes a specific device's compliance state and generates:
- **Summary** — one-sentence status description
- **Root cause** — why the compliance issue occurred
- **Recommendation** — what action to take
- **Suggested runbook** — which runbook to execute
- **Risk level** — `Low | Medium | High | Critical`
- **Steps** — 5 ordered remediation steps

### How to trigger

```
POST /api/ai/analyze
{ "deviceId": "device-uuid" }
```

The `deviceId` must match a device in the server's current device list (real or mock).

### The prompt

The AI receives structured device data:
```
Device: LAPTOP-8F7G2Q1
User: john.doe@company.com
Platform: Windows — Windows 11 Pro 23H2
Management Source: Microsoft Intune
Compliance State: Non-Compliant
Encryption Status: BitLocker Off
Primary Issue: BitLocker encryption not enabled
Policy Failed: Encryption - BitLocker Policy
Severity: Medium
```

And is instructed to return structured JSON. Temperature `0.2` keeps responses deterministic.

### Customizing the analysis

**`server/src/services/openai.ts`** → edit the `prompt` template in `analyzeDevice()`:
- Add more device fields to the prompt for richer context
- Change the output schema by modifying the JSON shape in the prompt
- Adjust `temperature` (0.0 = most deterministic, 1.0 = most creative)

---

## Feature 2: IT Assistant Chat

### What it does

A freeform conversational AI that answers IT questions. When a device is in context, its details are prepended to give the AI relevant focus.

### How to trigger

```
POST /api/ai/chat
{
  "message": "How do I fix BitLocker compliance for a large fleet?",
  "deviceId": "optional-device-uuid"
}
```

### The system prompt

```
You are an expert enterprise IT endpoint management assistant helping IT administrators.
You specialise in Microsoft Intune, Kandji, and ManageEngine environments.
Be concise, technical, and action-oriented. Prefer bullet points for steps.
```

### Customizing the chat

**`server/src/services/openai.ts`** → edit the `system` constant in `chatWithAI()`:
- Add more specializations (e.g., "You also know CrowdStrike Falcon")
- Change tone (e.g., "Explain as if to a junior IT technician")
- Add output format instructions (e.g., "Always end with a 'TL;DR' bullet point")

---

## Model configuration

| Setting | Value | Why |
|---|---|---|
| Model | `gpt-4o-mini` | Cost-effective; fast; strong IT knowledge |
| Analysis temperature | `0.2` | Deterministic, consistent recommendations |
| Chat temperature | `0.3` | Slightly more conversational but still factual |
| Analysis max_tokens | `600` | Enough for structured JSON response |
| Chat max_tokens | `500` | Enough for a concise answer |
| Response format | `json_object` (analysis only) | Prevents hallucinated text outside the schema |

---

## Upgrading to GPT-4o

For higher quality analysis on complex device issues:

**`server/src/services/openai.ts`** — change model in both functions:
```ts
model: 'gpt-4o'  // was 'gpt-4o-mini'
```

Cost increases ~10x but quality improves significantly for edge-case diagnoses.

---

## Checking AI status

```
GET /api/ai/status
→ { "success": true, "data": { "openai": true } }
```

The Settings page uses this to show a green/red status badge next to the OpenAI integration card.

---

## Error handling

| Scenario | Response |
|---|---|
| No `OPENAI_API_KEY` | `503 Service Unavailable` with descriptive error |
| Device not found | `404 Not Found` |
| OpenAI API error | `500` with the OpenAI error message |
| Message > 1000 chars | `400 Bad Request` (Zod validation) |

---

## Privacy considerations

Device data sent to OpenAI includes:
- Device name and serial number
- User email (UPN)
- OS version and compliance state
- Issue description

Ensure your organization's data governance policy permits sending this to OpenAI. If not:
- Use OpenAI's Zero Data Retention (ZDR) API tier
- Or replace the OpenAI service with a self-hosted model (e.g., Ollama + Llama 3)

To replace with Ollama, change `server/src/services/openai.ts` to use the `openai`-compatible API that Ollama exposes at `http://localhost:11434/v1`.

---

## Key files

| File | Role |
|---|---|
| `server/src/services/openai.ts` | OpenAI client, prompts, API calls |
| `server/src/routes/ai.ts` | `/api/ai/*` route handlers |
| `server/src/store/integrationStore.ts` | `isConfigured('openai')` check |
