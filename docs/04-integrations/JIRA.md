# Jira Integration

Connects to **Jira Cloud REST API v3** to create and search incident/task tickets from compliance
issues. Falls back to a "not configured" state (no mock tickets are fabricated) when credentials are
missing.

---

## Prerequisites

- A Jira Cloud site (`https://yourorg.atlassian.net`)
- An Atlassian account with permission to create issues in the target project
- A Jira project (defaults to key `ITO` if none is specified)

---

## Credential setup

1. Go to **id.atlassian.com/manage-profile/security/api-tokens** → **Create API token**
2. Name it (e.g., `ITO Endpoint Copilot`) and copy the token — it is not shown again
3. Note your Jira site's base URL and the email address associated with your Atlassian account

---

## Configuration

### Via environment variables (`server/.env`)

```env
JIRA_BASE_URL=https://yourorg.atlassian.net
JIRA_EMAIL=you@yourorg.com
JIRA_API_TOKEN=your-api-token
JIRA_PROJECT_KEY=ITO
```

`JIRA_PROJECT_KEY` is optional — it defaults to `ITO` when unset, and can be overridden per-ticket.

### Via Settings UI

Settings → Integrations → Jira → fill in Base URL, Email, API Token (and optionally Project Key).

### Auth scheme

Basic auth over HTTPS: `Authorization: Basic base64(JIRA_EMAIL:JIRA_API_TOKEN)`, built in
`authHeaders()` in `server/src/services/jira.ts`. Jira is considered "configured"
(`isJiraConfigured()`) only when all three of `JIRA_BASE_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN` are
set.

---

## What the integration does

`server/src/services/jira.ts` exposes two functions, both against `POST/GET /rest/api/3/...`:

- **`createJiraIssue(input)`** — `POST /rest/api/3/issue`. Builds an Atlassian Document Format (ADF)
  description from a plain string, and returns the created issue's key, URL, and metadata.
- **`searchJiraIssues(query)`** — `GET /rest/api/3/search` with a JQL query scoped to
  `project = <JIRA_PROJECT_KEY>`. Returns `[]` (not an error) when Jira isn't configured.

### Where it's used

**1. Manual ticket creation — Risk Scoring page**
`src/pages/RiskScoringPage.tsx` shows a **Create Jira Ticket** action on expanded device rows for
`critical`/`high` risk devices, gated on `GET /api/.../jira-status` (or equivalent integration-status
check) reporting Jira as connected. It opens `src/components/runbooks/JiraModal.tsx`, which
pre-fills summary/description/priority from the device's risk factors and AI summary, lets the admin
edit before submitting, and calls the create-issue endpoint. This is a direct, unconfirmed write —
there is no confirm step because the admin is already reviewing the exact ticket content in the
modal before clicking Create.

**2. Endpoint Operations Copilot — `create_jira_ticket` tool**
`server/src/services/copilotTools.ts` defines a `create_jira_ticket` write tool
(`rbac: 'write'`) that the AI can call during a chat turn with `summary`, `description`, `issueType`,
`priority`, and optional `projectKey`/`labels`. Like all write tools in the Copilot, it never executes
automatically:
1. The model's tool call is captured as a **pending action** (`describeAction()` renders a
   human-readable preview, e.g. `Create a High priority Jira Incident: "..."`).
2. The action is only actually run — i.e. `createJiraIssue()` is called — after the user explicitly
   confirms it via `POST /api/copilot/actions/:id/confirm`.
3. If Jira isn't configured, the tool throws immediately with a message pointing at the required env
   vars, without ever reaching Jira.

**3. Automation Rules engine**
`server/src/services/automationEngine.ts` implements a `create_jira` automation action
(`handleCreateJira()`). When a rule with that action fires (or is manually test-run), it builds a
summary/description from the matched device and rule, sets priority from the device's severity, and
calls `createJiraIssue()` directly — this path runs automatically as part of rule execution, it is
not gated behind the Copilot's confirm flow. In an automation rule's **test run**, Jira actions (like
Slack/Teams) are simulated rather than actually created, so testing a rule never creates a real
ticket.

---

## Costs / rate limits

Jira Cloud REST API v3 is subject to Atlassian's standard rate limits for your site's tier; no
additional cost beyond your existing Jira Cloud subscription.

---

## When Jira is not configured

- `isJiraConfigured()` returns `false`
- `createJiraIssue()` throws `Jira is not configured — add JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in Settings → Integrations`
- `searchJiraIssues()` returns `[]` instead of throwing
- Risk Scoring hides/disables the Create Jira Ticket action
- The Copilot's `create_jira_ticket` tool call fails with the same configuration error instead of reaching Jira
- Automation rules with a `create_jira` action report a failed action result (`Jira not configured — ...`) rather than throwing

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `Jira is not configured — add JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN` | Missing env vars | Add to `server/.env` or Settings UI |
| `Jira API error 401` | Invalid email/API token pair | Regenerate the token at id.atlassian.com |
| `Jira API error 400` | Invalid `issueType`/`priority` name, or project key doesn't exist on your site | Confirm the project's configured issue types and priority scheme in Jira admin |
| `Jira search error: 400` | Malformed JQL (e.g. project key doesn't exist) | Check `JIRA_PROJECT_KEY` matches a real project |

---

## Related Docs
- [Confluence](CONFLUENCE.md) — shares Jira's credentials on the same Atlassian site
