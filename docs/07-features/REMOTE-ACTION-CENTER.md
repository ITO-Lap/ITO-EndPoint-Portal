# Remote Action Center

Secure script execution on managed Windows (PowerShell) and macOS (Shell) devices, with validation, approvals, job tracking and an audit trail. It also includes a **Microsoft Graph API Runner**. Nav: **Automations → Remote Action Center** ("Secure script execution and endpoint automation").

> **Honest capability summary** (see *Provider capabilities*): the only provider that can execute scripts with the integrations in this project is **Microsoft Intune**, and only once the app registration is granted write permissions. **Endpoint Central is registered but disabled** (no verified script-execution API/scope). Neither returns live streaming output or a progress percentage; the UI shows only what the provider reports.

## Flow

Three steps: **Script** (pick a saved script or paste/upload one, then Validate and review) → **Devices** (search, select, optional delivery options) → **Review and run** (pre-flight, approval notice, justification, device-count confirmation, run). Advanced fields (language, timeout, run-as, tags, owner, description, rollback, extra device filters, provider and timing) are folded under "More options".

* **Scripts**: paste or upload `.ps1`/`.sh` (≤ 200 KB). Language, platform, name, description (`.SYNOPSIS`, `# Description:`) and admin requirement (`#Requires -RunAsAdministrator`, `sudo`, HKLM…) are detected. Nothing runs automatically.
* **Saving is never blocked by the review.** The review is informational at save time; only empty, over-200 KB or binary content is refused. Blocked scripts and scripts with validation/syntax errors are re-checked at pre-flight and cannot run.
* **Safety review (deterministic, no AI)**: `server/src/remoteActions/scriptAnalysis.ts`. Classification **Low / Medium / High / Blocked**. Rules are a plain table (`RISK_RULES`) so security can extend them.
  * *Blocked* (can be saved to the library but is never run; pre-flight refuses it): `rm -rf /`, disk wipe/format, fork bomb, download-and-execute, hard-coded secrets/keys/tokens.
  * *High*: recursive/forced delete, user-account changes, disabling security controls (Defender, Gatekeeper, SIP, FileVault, firewall…), encoded commands, persistence.
  * *Medium*: reboot/shutdown, sudo/root, registry writes, network/DNS/hosts changes, service stop, software install, downloads, system paths.
  * Structural syntax checks (quotes, braces, `if/fi`, `do/done`) — a heuristic, not an interpreter.
* **Approval matrix**: Low → none. Medium → justification; the script *version* must be approved once; a job needs approval only above `mediumRiskApprovalAbove` devices (default 10). High → version approved **and every job** approved. Nobody can approve their own request.
* **Targeting**: single/multiple devices or dynamic filters (OS, source, name, serial, check-in recency, compliance, department, owner, OS version). The device list is resolved and frozen at job creation.
* **Pre-flight**: platform compatibility, enrolled/managed by the chosen provider, recent check-in, provider capability (PowerShell/shell, run-as), policy limits. Every excluded device is shown with its reason.
* **Execution options**: run now, run when device is online, schedule (held by this app, sent at the time), pilot (≤ 5 devices by default). More than one device requires typing the device count.
* **Job states** (never invented): job — *Awaiting approval, Approved, Scheduled, Queued, Running, Completed, Completed with failures, Failed, Cancelled, Rejected*; device — *Queued, Waiting for device to come online, Sent to provider, Provider accepted, Running, Succeeded, Failed, Timed out, Skipped, Cancelled*.
* **Progress**: a bar appears only when every device returned `__ITO_PROGRESS__:<0-100>|<message>` markers in provider-returned output. Otherwise only counts and states are shown.
* **Retry failed devices only**, **cancel** (only where the provider supports it), CSV export (formula-injection safe), audit trail per job/script.

## Provider capabilities

| Provider | Enabled when | PowerShell / Shell | Output | Streaming / progress | Cancel |
|---|---|---|---|---|---|
| **Microsoft Intune** (`deviceManagementScripts`, `deviceShellScripts`) | The Graph token's `roles` claim contains `DeviceManagementScripts.ReadWrite.All` (or `DeviceManagementConfiguration.ReadWrite.All`), `Group.ReadWrite.All`, and `Device.Read.All`/`Directory.Read.All` (checked from the real token) | Yes / Yes | Short `resultMessage` per device | No / No | Removes the assignment (devices that already received it keep running) |
| **Endpoint Central** | **Never, today** — only patch + inventory scopes are in use; no script-execution API verified | — | — | — | — |
| **Mock** | Outside production (or `REMOTE_ACTIONS_MOCK=1`) | Simulated | Simulated | Simulated | Yes |

Intune assigns scripts to **groups** and runs them at the device's next check-in (typically hours). The provider creates a short-lived security group per job containing exactly the job's devices, creates and assigns the script, polls `deviceRunStates`, then deletes the group. **This Intune flow has not been verified against a live tenant in this repository** (no write permission is granted); it is covered by mocked-transport unit tests only. Validate it in a test tenant before enabling it for production.

## Microsoft Graph API Runner

Server-side only; the token never reaches the browser, logs, downloads or API responses. Authenticated Graph requests only — no shell. Only `https://graph.microsoft.com/{v1.0|beta}` can be called; hosts/schemes in the endpoint are rejected and pagination links must point back at the same origin.

* **Approved-endpoint catalogue** (`CATALOG` in `graphRunnerLib.ts`): Intune managed devices, configuration & compliance, scripts, Autopilot, RBAC, apps, users, groups, Entra devices, audit logs, reports. Anything else is **Blocked** until security adds a row. Credential/privilege surfaces (LAPS passwords, BitLocker/FileVault keys, auth methods, app credentials, role assignments, `$batch`, …) are blocked for every method.
* **Classification**: Read-only (GET) · Change (POST/PATCH/PUT) — justification + confirmation screen · Destructive (DELETE, wipe/retire/etc., bulk bodies > 10 items) — justification + **approver authorization (not the requester)** · Blocked.
* **Permission check**: the minimum permission for the endpoint is compared with the roles actually granted to the app registration; missing permissions are listed and the request is **not sent**. Re-checked at approval time.
* **Limits**: 30 s timeout, 5 MB response, 100 KB body, `$top` ≤ 999, ≤ 10 pages / 5,000 rows when fetching all pages, 30 requests/min/IP. One automatic retry when Graph throttles with `Retry-After` ≤ 5 s; otherwise the wait is shown.
* **Results**: request id, time, requestor, method, endpoint, HTTP status, duration, Graph correlation id, JSON / table view, next-page control, explained errors. Downloads (`.json`, `.csv`, `.txt`) are built from sanitized output and **omit** every masked value.
* **History**: Graph API History records every request (sanitized body and output), approval, HTTP result and download. Reopen, clone or rerun; changes/deletes go back through justification, confirmation and approval. Requests whose bodies contained secrets cannot be replayed from history.
* **Graph Assistant (AI)**: plain-English → draft request, explain endpoint/minimum permission/errors/output, suggest `$select`/`$filter`. Drafts only.

## AI (Script Assistant)

Explain a script, summarize changes, list risks/prerequisites, suggest targeting, draft a script, suggest a rollback, analyze failed logs. AI **never** executes, approves, saves, modifies or retries anything; generated scripts are drafts that go through the same validation and approval. Everything sent to the model passes through `redactForAI()` (secrets **and** emails, IPs, MACs, GUIDs, user-profile paths). Without an AI key a deterministic explanation from the rule engine is shown.

## Permissions (RBAC)

Built on the project's custom RBAC (Settings → Roles & Permissions). Suggested mapping:

| Requested role | Permissions |
|---|---|
| Viewer | `pages.Remote Action Center`, `remoteActions.read`, `graphRunner.read` |
| Operator | + `remoteActions.execute`, `graphRunner.run` |
| Script Admin | + `remoteActions.author` |
| Approver | `remoteActions.approve`, `graphRunner.approve` |
| Super Admin | `remoteActions.admin` (limits, emergency stop) — **Global Admin has every permission** |

Defaults: **IT Admin** gets read, author, execute, `graphRunner.read/run`. **Approve** and **admin** are Global Admin only until granted to a custom role. `graphRunner.change` (POST/PATCH/PUT) is also not granted by default. Helpdesk has no access.

## Security controls

Session required on every route; permission key per route **and** server-side rules in `remoteActions/service.ts`; script integrity hash checked before dispatch (what runs is byte-identical to what was approved); separation of duties; idempotency (same request within 10 min returns the same job); per-user hourly and global concurrent-job limits; per-IP route rate limits; emergency stop; log sanitizing (control/ANSI characters stripped, markup escaped, secrets masked, rendered as text only); CSV formula-injection guard; audit log (append-only JSONL + `audit_logs` table when PostgreSQL is configured).

## Storage

Same architecture as other modules: JSON files under `DATA_DIR` with atomic writes and a `.bak` (`remote-actions.v1.json`), plus an append-only `remote-actions-audit.v1.jsonl`. Script bodies are AES-256-GCM encrypted at rest when `REMOTE_ACTIONS_ENCRYPTION_KEY` is set (32 bytes, base64 or hex); the project has no managed key service, so without it bodies are plain and the UI warns. Not stored in the browser. A PostgreSQL backend (like Scheduled Reports) is a future enhancement; the audit trail is already mirrored to PostgreSQL when available.

## Configuration

| Variable | Purpose |
|---|---|
| `REMOTE_ACTIONS_ENCRYPTION_KEY` | Encrypt script bodies at rest (recommended) |
| `REMOTE_ACTIONS_MOCK=1` | Enable the mock provider in production (never recommended) |
| `DATA_DIR` | Where the stores are written |
| Graph app registration | `DeviceManagementScripts.ReadWrite.All`, `Group.ReadWrite.All`, `Device.Read.All` (Intune execution); the read/write permission for each Graph endpoint you intend to call |

## API

`/api/remote-actions/*`: `status`, `dashboard`, `scripts` (+`/analyze`, `/:id`, `/:id/versions/:v/decision`, `/:id/archive`), `devices`, `preflight`, `jobs` (+`/:id`, `/:id/decision`, `/:id/refresh`, `/:id/cancel`, `/:id/retry-failed`, `/:id/export`), `audit`, `policy`, `emergency-stop`, `assistant`; Graph: `graph/templates`, `graph/validate`, `graph/requests`, `graph/history` (+`/:id`, `/decision`, `/rerun`, `/next`, `/download`), `graph/assistant`.

## Limitations / future work

Intune execution unverified live; Endpoint Central execution not available; no live output streaming; Intune result messages are size-limited and arrive after the device checks in; Intune cannot stop a script already running; PostgreSQL storage backend; rule table is code-managed (an admin UI for rules/catalogue is future work); approvals are in-app only (no Teams/Slack notification yet).
