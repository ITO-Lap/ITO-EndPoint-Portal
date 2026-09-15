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

There is no standalone `/api/ai/*` route anymore (the old `analyzeDevice()`/`chatWithAI()` REST
endpoints and their frontend caller were removed as unused leftovers). OpenAI is called from three
separate places, each instantiating its own client from `OPENAI_API_KEY` / the Settings-pushed
config:

### Risk Scoring narrative (`server/src/routes/intelligence.ts` → `GET /api/intelligence/risk-scores`)

`batchComputeRiskScores()` uses OpenAI (when configured) to generate the per-device AI narrative and
action items shown on the Risk Scoring page; falls back to a non-AI scoring path when unconfigured.

### Compliance Intelligence executive summary (`POST /api/intelligence/summary`)

Builds a prompt from live tenant stats (device counts, compliance %, stale devices, policy
conflicts) and returns a 3–4 sentence executive summary. Returns `{ success: false, error: 'OpenAI
not configured — set OPENAI_API_KEY' }` (HTTP 200, not 503) rather than throwing, when unconfigured.

### Issue explanation (`POST /api/intelligence/explain`)

Given a device name + issue description, returns a plain-English explanation, root cause, and
step-by-step remediation. Same not-configured behavior as `/summary`.

**Model used (all of the above):** `gpt-4o-mini`, `max_tokens: 400–500`

### Endpoint Operations Copilot (`server/src/services/copilotEngine.ts`, mounted at `/api/copilot`)

Runs a tool-calling loop against `gpt-4o-mini` (`server/src/services/copilotTools.ts` defines the
tools). Read tools execute immediately; write tools (e.g. `create_jira_ticket`,
`trigger_automation_rule`) return a pending action that only executes after the user confirms via
`POST /api/copilot/actions/:id/confirm`. If OpenAI isn't configured, the Copilot replies with a
plain "currently unavailable" message instead of erroring.

### Automation Rules — AI-generated content

`server/src/services/openai.ts` still exports `analyzeDevice()`, `buildAutomationRule()`, and
`generateRemediationScript()`, used by `server/src/services/automationEngine.ts` for AI-backed
automation actions (e.g. an automation rule step that asks the model to analyze a device or draft a
remediation script). `chatWithAI()` in the same file is currently unused dead code — nothing calls
it.

---

## Modifying the AI behaviour

**To change the Risk Scoring / automation-rule analysis prompt:** edit `analyzeDevice()` in `server/src/services/openai.ts`

**To change the Compliance Intelligence summary/explain prompts:** edit the prompt strings directly in `server/src/routes/intelligence.ts`

**To change the Copilot's system prompt or tool list:** edit `server/src/services/copilotEngine.ts` / `copilotTools.ts`

**To use a different model:** each call site hardcodes `model: 'gpt-4o-mini'` in its own `chat.completions.create()` call — there is no single shared model config to change (aside from `setOpenAIConfig({ model })` for the parts of `services/openai.ts` that read it back via `getOpenAIConfig()`).

---

## Costs

GPT-4o-mini is very inexpensive. A typical request (summary, explain, single-device analysis) costs:
- ~400 prompt tokens + ~200–500 completion tokens ≈ **< $0.001 per request**

For a fleet of 500 devices analyzed daily: **< $0.50/day**.

---

## When OpenAI is not configured

- `getOpenAI()` / `isOpenAIConfigured()` / `isOpenAIAvailable()` (one per call site) all return falsy
- `POST /api/intelligence/summary` and `/explain` return `{ success: false, error: '...' }` with HTTP 200, not a 503
- Risk Scoring falls back to non-AI scoring rather than erroring
- The Endpoint Operations Copilot responds with a plain-text "currently unavailable" message
- The Settings UI shows OpenAI as "Not Configured"
- All non-AI dashboard features work normally

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `OpenAI not configured — set OPENAI_API_KEY` | No API key | Add to `server/.env` or Settings UI |
| `401 Incorrect API key` | Invalid or expired key | Regenerate at platform.openai.com |
| `429 Rate limit exceeded` | Too many requests | Add request throttling; upgrade tier |
| `Model not found` | Wrong model name | Check model name at platform.openai.com/models |
| Slow responses | gpt-4o used instead of mini | Ensure model is `gpt-4o-mini` |
