# OpenAI Integration

Enables AI-powered device compliance analysis and freeform IT assistant chat. Uses **GPT-4o-mini** by default.

---

## Prerequisites

- An OpenAI account with API access
- An API key with at minimum `model:read` + `completions:write` permissions

---

## OpenAI API key setup

1. Go to **platform.openai.com → API Keys → Create new secret key**
2. Name it (e.g., `ITO Endpoint Copilot`)
3. Copy the key — it is not shown again
4. Ensure your account has GPT-4o-mini access (available on all paid tiers)

---

## Configuration

### Via environment variables (`server/.env`)

```env
OPENAI_API_KEY=sk-proj-...
```

### Via Settings UI

Settings → Integrations → OpenAI → fill in API Key (and optionally Org ID / Model).

---

## What the AI does

### Device Analysis (`POST /api/ai/analyze`)

Sends a structured prompt to GPT-4o-mini with device details. The model returns:

```json
{
  "summary": "One-sentence compliance status",
  "rootCause": "Why the issue occurred",
  "recommendation": "What to do about it",
  "suggestedRunbook": "Name of runbook to run",
  "riskLevel": "High",
  "steps": ["Step 1", "Step 2", "Step 3", "Step 4", "Step 5"]
}
```

**Model used:** `gpt-4o-mini`  
**Temperature:** `0.2` (deterministic, factual)  
**Max tokens:** `600`  
**Response format:** `json_object` (structured JSON, no prose)

### IT Assistant Chat (`POST /api/ai/chat`)

Freeform Q&A with a system prompt specialised in Intune, Kandji, and ManageEngine. When a device is in context, its details are included in the prompt.

**Model used:** `gpt-4o-mini`  
**Temperature:** `0.3`  
**Max tokens:** `500`

---

## Modifying the AI behaviour

**To change the analysis prompt:** edit `analyzeDevice()` in `server/src/services/openai.ts`

**To change the chat system prompt:** edit the `system` constant in `chatWithAI()` in the same file

**To use a different model:** change the `model` field in the `chat.completions.create()` calls, or pass it through `setOpenAIConfig({ model: 'gpt-4o' })` at runtime.

**To add response caching:** wrap `analyzeDevice()` with a device-ID keyed cache (e.g., using a Map with TTL) to avoid redundant API calls for the same device.

---

## Costs

GPT-4o-mini is very inexpensive. A typical device analysis costs:
- ~400 prompt tokens + ~200 completion tokens ≈ **< $0.001 per analysis**

For a fleet of 500 devices analyzed daily: **< $0.50/day**.

---

## When OpenAI is not configured

- `GET /api/ai/status` returns `{ "openai": false }`
- `POST /api/ai/analyze` returns `503 Service Unavailable`
- `POST /api/ai/chat` returns `503 Service Unavailable`
- The Settings UI shows OpenAI as "Not Configured"
- All dashboard features work normally — only AI features are disabled

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `OpenAI is not configured. Set OPENAI_API_KEY` | No API key | Add to `server/.env` or Settings UI |
| `401 Incorrect API key` | Invalid or expired key | Regenerate at platform.openai.com |
| `429 Rate limit exceeded` | Too many requests | Add request throttling; upgrade tier |
| `Model not found` | Wrong model name | Check model name at platform.openai.com/models |
| Slow responses | gpt-4o used instead of mini | Ensure model is `gpt-4o-mini` |
