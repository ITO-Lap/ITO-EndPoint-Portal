# Endpoint Operations Copilot

> **Location:** Slide-out panel, toggled from the header — available on every page  
> **Audience:** Global Admin · IT Admin · Helpdesk (read-only for Helpdesk; write actions Global Admin/IT Admin only)  
> **Model:** OpenAI `gpt-4o-mini` via tool/function calling

---

## What it is

The Endpoint Operations Copilot is a chat-based AI assistant that sits above the rest of the platform — Intune, Entra, ManageEngine, security posture, automation, and more — and answers questions or takes action using **only real data already surfaced elsewhere in this app**. It never fabricates device, user, or policy data: every answer is grounded in a tool call against a real service or route, and every write action requires the user to explicitly confirm before anything executes.

An earlier, page-scoped "AI Copilot Panel" inside Entra Intelligence returned pre-built canned responses in demo mode with no tool-calling or write capability — it was removed in the same refactor that produced this feature (see the "Fake Entra AI panels" removal in the project's git history and [`ENTRA-INTELLIGENCE.md`](ENTRA-INTELLIGENCE.md), which should be updated to drop that reference). The Endpoint Operations Copilot is global (available from any page via the header), backed by a real tool-calling loop, and is the only AI chat surface left in the app.

---

## Architecture

- **Frontend:** `src/components/copilot/CopilotPanel.tsx` — a slide-out chat panel reachable from a toggle in the header on every page.
- **Backend:** 5 REST endpoints under `/api/copilot` on the Express server. Each chat turn runs an OpenAI tool/function-calling loop against `gpt-4o-mini`, using the same configuration source as the rest of the app — `getOpenAIConfig()` in `server/src/store/integrationStore.ts` (see [`docs/04-integrations/OPENAI.md`](../04-integrations/OPENAI.md) for how that config is set via `OPENAI_API_KEY` or the Settings UI).
- **Persistence:** Conversation, message, and pending-action history persists to PostgreSQL — `copilot_conversations`, `copilot_messages`, and `copilot_pending_actions` tables in `server/src/db/schema.sql` — when `DATABASE_URL` is configured. This is the same optional-DB pattern already used by `server/src/routes/scheduledReports.ts` and `server/src/routes/auditLog.ts`: without `DATABASE_URL`, the Copilot still works one-shot (the model can still call read tools and answer in the current turn), it just has no memory of prior turns and no server-side conversation list. See the root [`CLAUDE.md`](../../CLAUDE.md) environment table and [`docs/06-development/README.md`](../06-development/README.md) for `DATABASE_URL` setup — it isn't re-documented here.

---

## Tool list

The model chooses which tool(s) to call based on the user's message; every tool wraps a real, already-existing function or route — none of them synthesize data.

### Read tools

Available to **Global Admin, IT Admin, and Helpdesk**.

| # | Tool | Wraps | Data source | RBAC |
|---|---|---|---|---|
| 1 | `get_risk_scores` | `server/src/services/riskScoring.ts` (`computeRiskScore` / `batchComputeRiskScores`) | Device risk scoring engine | Global Admin, IT Admin, Helpdesk |
| 2 | `get_policy_conflicts` | `server/src/services/policyConflict.ts` (`detectConflicts`) | Policy conflict detector | Global Admin, IT Admin, Helpdesk |
| 3 | `get_security_policy_status` | `server/src/routes/securityPolicies.ts` + `securityPoliciesGraph.ts` + `securityPoliciesStore.ts` | Security policy inventory/sync state — see [`docs/04-integrations/SECURITY-POLICIES.md`](../04-integrations/SECURITY-POLICIES.md) for the Graph permissions this ultimately depends on | Global Admin, IT Admin, Helpdesk |
| 4 | `get_role_activity` | `server/src/routes/roleActivity.ts` | Live fan-out to Entra Graph, Intune Graph, and the SharePoint O365 Management Activity API — **no database involved**. That route's own file header documents this as a deliberate design choice (the DB-backed version of this module was removed; see the comment at the top of `roleActivity.ts`), not an oversight, and this tool inherits the same bounded max-range constraint the route enforces | Global Admin, IT Admin, Helpdesk |
| 5 | `get_endpoint_protection_coverage` | `server/src/security-agents/service.ts` (`scanFleet`, `listDevicesMissingAgent`, `buildPlatformCoverage`) | CrowdStrike/Zscaler endpoint-protection gap detection | Global Admin, IT Admin, Helpdesk |
| 6 | `get_scheduled_reports` | `server/src/routes/scheduledReports.ts` | Scheduled report configs (Postgres-backed, degrades to empty list without `DATABASE_URL`) | Global Admin, IT Admin, Helpdesk |
| 7 | `get_audit_log` | `server/src/routes/auditLog.ts` | Application audit trail (Postgres-backed, degrades to empty list without `DATABASE_URL`) | Global Admin, IT Admin, Helpdesk |
| 8 | `get_user_intelligence` | `GET /api/users/:id` in `server/src/routes/users.ts` | User + device-association intelligence | Global Admin, IT Admin, Helpdesk |
| 9 | `get_intune_scripts_config` | `server/src/routes/intuneScriptsConfig.ts` (`GET /items`, `GET /items/:compositeId` — metadata only, not the `/download` or `/export` routes) | Intune scripts/configuration profile catalog — see [`docs/04-integrations/INTUNE-SCRIPTS-CONFIGURATIONS.md`](../04-integrations/INTUNE-SCRIPTS-CONFIGURATIONS.md) | Global Admin, IT Admin, Helpdesk |
| 10 | `lookup_devices` | `server/src/services/intune.ts` (`getIntuneDevices()`) + `server/src/services/manageEngine.ts` (`getManageEngineDevices()`) | Live device inventory across both configured MDM sources. Kandji was removed from this app (see [`docs/04-integrations/MANAGEENGINE.md`](../04-integrations/MANAGEENGINE.md)); Intune and ManageEngine are the only two device sources this tool can query | Global Admin, IT Admin, Helpdesk |

### Write tools

Available to **Global Admin and IT Admin only**. Write tools **never execute directly** from a model tool call — see [Confirmation flow](#confirmation-flow) below.

| # | Tool | Wraps | Behavior | RBAC |
|---|---|---|---|---|
| 11 | `create_jira_ticket` | `server/src/services/jira.ts` (`createJiraIssue`) | Real Jira REST v3 `POST /rest/api/3/issue` call, using the same `JIRA_BASE_URL` / `JIRA_EMAIL` / `JIRA_API_TOKEN` credentials as the rest of the app | Global Admin, IT Admin |
| 12 | `trigger_automation_rule` | `server/src/services/automationEngine.ts` (`runAutomationRule(rule, devices, { testMode: true, maxDevices: 5 })`) | This is the **same real manual "test run" entry point** already exposed at `POST /api/automation-rules/:id/test` (see [`AUTOMATION-ENGINE.md`](AUTOMATION-ENGINE.md)) — not a fake or simulated button. In test mode, Slack/Jira/Teams notification actions are simulated to avoid spamming external systems, but runbook execution, script execution, and in-app notifications actually run against up to 5 real devices. A full, non-test-mode "production run" trigger was **deliberately not added** to the Copilot: the automation engine has no manual production-run entry point at all outside of `POST /api/automation-rules/:id/test` — production runs only happen via the engine's own scheduled/event triggers, and adding a Copilot-only bypass for that would mean the Copilot could do something no human operator can do through the UI | Global Admin, IT Admin |

### Confluence — evaluated, not added

Confluence was evaluated as a possible write tool ("attach findings to a Confluence page"). `server/src/services/confluence.ts` only implements a **read** function, `searchConfluencePages` — which itself falls back to mock data when Confluence isn't configured — and has no attach, create, or write function of any kind. Rather than build a new write path into `confluence.ts` just to support the Copilot, no Confluence tool (read or write) was added in this pass. This is a deliberate scope decision, not an oversight: if Confluence read support is wanted later, `searchConfluencePages` already exists and could be exposed as tool #13.

---

## Confirmation flow

Write tools follow a strict **propose → confirm → execute** lifecycle so the model can never make a change unilaterally:

1. When the model decides to call a write tool (`create_jira_ticket` or `trigger_automation_rule`), `POST /api/copilot/chat` does **not** execute it. Instead, it returns a `pendingAction` object in the response — the proposed tool call, its arguments, and a human-readable description of what it would do — and (when `DATABASE_URL` is configured) persists it to `copilot_pending_actions` with status `pending`.
2. The chat panel renders the pending action with an explicit confirm/reject choice. Nothing runs until the user confirms.
3. Only `POST /api/copilot/actions/:id/confirm` actually executes the underlying tool. This endpoint **re-checks RBAC** at confirmation time (not just at chat time) — a user's role could theoretically change between proposing and confirming, and this endpoint doesn't trust the original request's role check.
4. On execution, the pending action's status transitions to `executed` (or `failed` if the underlying call errors) — or `rejected` if the user declines instead of confirming. Every execution also writes a row to the existing in-app Audit Log (`audit_logs` table, surfaced via `server/src/routes/auditLog.ts`), the same trail already used elsewhere in the app.

No write tool result ever reaches the model or the user as "done" without passing through this lifecycle.

---

## RBAC model

The Copilot reuses the existing `requireAppRole()` pattern from `server/src/middleware/requireRole.ts`, gated on the same `x-user-role` / `x-user-email` headers the frontend already sends on every request — headers the frontend derives from the hardcoded `viewerRole` prop in `src/App.tsx`, not a verified session or JWT.

- **Read tools:** Global Admin, IT Admin, Helpdesk.
- **Write tools:** Global Admin, IT Admin only.
- **End User:** gets no Copilot UI at all — the header toggle isn't rendered for that role.

This is the same known, accepted limitation already called out in `requireRole.ts` and in [`docs/04-integrations/INTUNE-AUDIT-LOGS.md`](../04-integrations/INTUNE-AUDIT-LOGS.md): a client-supplied header is not a verified credential. Enforcing roles here is a real improvement over routes that don't check anything at all, but it is **not** real security — true per-user enforcement requires re-enabling the existing (currently unused) OAuth flow in `server/src/routes/auth.ts` and switching `requireAppRole()` to read a verified session JWT instead of a client-supplied header. That gap is documented here deliberately, not softened or omitted.

---

## Environment variables

No new environment variables are introduced. The Copilot relies on:

- `OPENAI_API_KEY` — see [`docs/04-integrations/OPENAI.md`](../04-integrations/OPENAI.md) and the root [`CLAUDE.md`](../../CLAUDE.md) env table.
- `DATABASE_URL` — see the root [`CLAUDE.md`](../../CLAUDE.md) env table and [`docs/06-development/README.md`](../06-development/README.md).

Both are already documented in full elsewhere; this feature doesn't add anything new on top of them.

---

## Data retention

Conversation, message, and pending-action rows in `copilot_conversations`, `copilot_messages`, and `copilot_pending_actions` persist **indefinitely** in Postgres when `DATABASE_URL` is configured — there is no automatic purge or TTL implemented in this pass. This app has no stated data-retention policy documented elsewhere (the closest precedent, blob lifecycle for Intune Audit Log exports in [`INTUNE-AUDIT-LOGS.md`](../04-integrations/INTUNE-AUDIT-LOGS.md), is handled by an external Azure Storage lifecycle policy the app doesn't manage itself). Until a retention policy exists for this app, treat unbounded Copilot chat history as a known gap, not a designed SLA — if a retention window is needed, it would need to be added as a scheduled cleanup job against these three tables.

---

## Key files

| File | Role |
|---|---|
| `src/components/copilot/CopilotPanel.tsx` | Slide-out chat panel, header toggle, pending-action confirm/reject UI |
| `server/src/routes/copilot.ts` | `/api/copilot/*` route handlers (chat, conversation history, pending-action confirm) |
| `server/src/services/copilotTools.ts` | Tool definitions and dispatch — where each tool above wires to its underlying service/route |
| `server/src/store/integrationStore.ts` | `getOpenAIConfig()` — shared OpenAI config source |
| `server/src/db/schema.sql` | `copilot_conversations`, `copilot_messages`, `copilot_pending_actions` table definitions |
| `server/src/middleware/requireRole.ts` | `requireAppRole()` — shared RBAC middleware reused by the Copilot's routes |
