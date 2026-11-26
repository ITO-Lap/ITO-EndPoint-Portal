# Settings

## What the Settings page is and who can use it

Settings (nav id `settings`, page title "Settings", permission key `pages.Settings`, Settings group) is where admins connect integrations, manage roles and permissions, control sidebar visibility and manage the Ocean knowledge base. Component: `src/components/settings/SettingsPage.tsx`. Default access: Global Admin and IT Admin; Helpdesk does not have the page. The Settings entry can never be hidden from the sidebar ("always visible"). The page has a left menu with 12 sections: General, Navigation, Integrations (badge 7), Roles & Permissions, Ocean Knowledge, Compliance, Automation, Data Sync, Security, Notifications, Data & Privacy and Danger Zone. Which parts are real, and which are not saved, is stated per section below.

## Settings: which sections are live and which are not saved

Live (talk to the server or stored in the browser): Integrations (push credentials, sync, test, Slack health), Roles & Permissions, Ocean Knowledge, Data Sync, Auto sign-out, Navigation (browser-local), and the Slack "Test Connection" in Notifications. **Saved to the server** (Save Changes is active; see "Saved settings" below): General, Compliance, Automation, the rest of Security, Notifications and Data & Privacy. These saved values are recorded and kept across restarts, but the portal does not **enforce** them yet; each page says so in a blue note. **Not connected:** the Danger Zone actions and the Data & Privacy export buttons, which report "Not available yet" and change nothing.

## Settings: General section

Organization identity and display form. Fields: Organization Name (default "Verma Technologies"), Admin Email Domain ("zinnia.com"), IT Support Email, Timezone (default America/Los_Angeles), Date Format (MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD), Language (en-US default), Fiscal Year Start (January default). Not persisted.

## Settings: Navigation section

"Navigation Visibility" controls which items appear in the left sidebar. Hiding an item removes only the menu entry; the page stays reachable directly. Each nav item has a switch; items the viewer's role cannot access are marked as role-blocked; "Reset to Defaults" (click twice to confirm) makes everything visible. Editing needs the capability `settings.navigationEdit` (IT Admin and Global Admin by default). Settings itself is always visible. Preferences are kept by `src/context/NavVisibilityContext.tsx` on the client.

## Settings: Integrations section

Cards for Microsoft Intune, Microsoft Entra ID, ManageEngine, Jira, Confluence, Slack, Google Gemini, OpenAI and the optional PostgreSQL database, plus an "Add Integration" catalog modal (Jamf, CrowdStrike, ServiceNow and others, a UI preview that does not connect anything). A summary strip shows "N of 9 Connected" (health from `GET /api/integrations/status`) and a Refresh button.

Card fields (secrets are masked):
- Jira: Server URL, Jira Email, API Token (masked), Project Key. Pushed to the server and used at once by ticket creation and search (saved in an owner-only file under `DATA_DIR`; `JIRA_*` variables are the fallback). Test Connection calls Jira's `myself` endpoint.
- Confluence: URL, Space Key, API Token, all optional; it reuses the Jira URL, email and token unless overridden. Test Connection lists one space.
- PostgreSQL (optional): Connection string (a `postgresql://` URL with user, password, host, port and database name; masked) and TLS (`auto`, `require`, `disable`). Save the field, then Push to Server: the connection is tested and saved only if it works, and it applies after the server restarts. Test Connection re-checks it; Disconnect removes the saved connection. The card shows "Storage in use" (Local files or PostgreSQL). Without PostgreSQL the tool works fully on local files. See [../17-database-sync-architecture.md](../17-database-sync-architecture.md).
- Intune: Tenant ID, Client ID, Client Secret, Tenant Domain (optional endpoint).
- Entra ID: Tenant ID, Client ID, Client Secret.
- ManageEngine: Client ID, Client Secret, Refresh Token, API Domain (a URL such as the MDM data-center base URL).
- Slack: Incoming Webhook URL, Bot OAuth Token, Signing Secret, Workspace ID (a webhook or bot token is required).
- Gemini: Google AI Studio API Key (must start with `AIza`), Copilot Model (default gemini-2.5-flash), Google Search Grounding true/false.
- OpenAI: API Key (must start with `sk-`), Organization ID, Default Model (default gpt-4o-mini).
- Jira: Server URL, email, API token, project key. Confluence: URL, space key, API token.

Buttons: **Push to Server** activates the entered credentials on the running server (blocked if the secret looks like a placeholder or is shorter than 10 characters), **Sync** forces a fresh fetch, **Test** runs the same call and shows "200 OK - Connected in N ms" or the error, and Disconnect only clears the local card state. Sync counts devices for Intune and ManageEngine, user, sign-in and audit rows for Entra, a token check for Slack, a models list for OpenAI and a one-token test for Gemini. Results (device count, last sync, latency, error) are remembered and shown in the card.

A Slack health panel (shown when Slack is configured) polls `GET /api/slack/health` every 30 seconds and offers a Reconnect button (`POST /api/slack/reconnect`).

Server variables can supply the same credentials; values pushed in the UI are persisted in the integration store under `DATA_DIR` (see `server/src/store/integrationStore.ts`). Only intune, manageengine, entra, slack, openai and gemini are accepted by the server; Jira and Confluence cards cannot push credentials ("Unknown integration") and are configured with `JIRA_BASE_URL` and `CONFLUENCE_BASE_URL` style variables.

## Settings: Roles & Permissions section

Visible only to roles with `roles.manage` (Global Admin); others see a no-access message. It shows the roles as cards (Global Admin, IT Admin, Helpdesk are permanent built-ins and cannot be deleted or renamed), a **Create Role** button, and a **User Assignments** table where you assign a role to a user by email with an Assign button and remove it with Unassign.

The role editor lists every permission key as a checkbox, in two groups: "Page access" (one `pages.<title>` key per nav page: Dashboard, Managed Devices, ManageEngine App Inventory, Stale Devices, App Guardian, Mac Fleet Reports, Entra Intelligence, Security Posture, Policy Conflicts, Risk Scoring, Role Activity Audit, Patch Operations, Windows Updates, Windows Package Builder, Mac Package Builder, Automation, Reports & Analytics, Scheduled Reports, Settings, Documentation) and "Capabilities" (for example `appIntel.read`, `appIntel.write`, `securityPolicies.read`, `staleDevices.export`, `devices.logs`, `patchOps.scanRemediate`, `copilot.access`, `copilot.read`, `copilot.write`, `ocean.docs.manage`, `notificationSchedules.edit`, `roleActivity.export`, `settings.navigationEdit`, `winPackager.read/write/validate`, `macPackager.read`, `roles.manage`). Global Admin's checkboxes are locked on: it is hard-coded to have every permission and is never read from a stored row, so nobody can lock themselves out. Role names must be 2 to 60 characters and unique. A custom role cannot be deleted while any user is assigned to it.

Role resolution at sign-in: email allowlist gives Global Admin; otherwise a per-user assignment made here; otherwise the legacy Entra (AAD) group lookup gives IT Admin or Helpdesk; otherwise access is denied. Permissions are cached per role for 15 seconds and the cache is cleared on every edit. Role and assignment changes are written to an RBAC audit trail. See `docs/ROLES.md`.

IT Admin has every page and these capabilities by default: `appIntel.read/write`, `securityPolicies.read/sync`, `staleDevices.read/export`, `devices.logs`, `patchOps.scanRemediate`, `copilot.access/read/write`, `ocean.docs.manage`, `intuneScriptsConfig.access`, `notificationSchedules.edit`, `scheduledReports.editSlackSchedule`, `roleActivity.export`, `settings.navigationEdit`, `winPackager.read/write/validate`, `macPackager.read`. Helpdesk lacks Policy Conflicts, Risk Scoring, Automation, Reports & Analytics, Scheduled Reports, Settings, Windows Package Builder and Mac Package Builder, and has read-only capabilities.

## How do I change a role's permissions in Settings?
Open Settings, then Roles & Permissions (needs the `roles.manage` capability, Global Admin by default). Click a role card to open the editor, tick or untick the Page access and Capabilities checkboxes, and save. Global Admin, IT Admin and Helpdesk are built-in and cannot be deleted or renamed; Global Admin always has every permission. To give a person a role, add them in the User Assignments table by email. Changes apply within 15 seconds (the permission cache) or at the next sign-in.

## Settings: Ocean Knowledge section

Shown in the menu only to roles with `ocean.docs.manage` (IT Admin and Global Admin by default). It administers the documentation Ocean (the AI assistant, see [OCEAN.md](OCEAN.md) and [AI-COPILOT.md](AI-COPILOT.md)) answers from. Contents:
- **Status tiles**: Documents (enabled / total, with excluded and disabled counts), Sections, Last indexed, AI model (Configured or Not configured; without a Gemini key Ocean shows document excerpts only), and Search ("Local": keyword plus semantic plus typo tolerance computed on the server, no external API).
- A warning when no `docs/` folder is found next to the deployment (set `OCEAN_DOCS_ROOT`).
- **Re-index** (all documents; force option) and per-document reindex.
- **Web fallback** switch (off by default): when the documentation has no answer, a few public web results can be added, always labelled external and not verified; only a short keyword query is sent. It cannot be turned on unless a web provider is ready (`OCEAN_WEB_SEARCH_PROVIDER`: `microsoft-learn` default with no key, `brave`, `google-cse`, `off`).
- **Add or update an approved document**: file name (for example vpn-guide.md), optional title, "Who can see it" (Everyone who can use Ocean, or Administrators only), content pasted or loaded from a .md, .markdown or .txt file, up to 1 MB (`MAX_DOC_BYTES` 1,000,000). An existing file name updates that document. Documents containing credentials are rejected.
- **Documents table**: status (Indexed, Excluded, Error with reason), access class, a "use as source" switch (only for indexed documents), sections, last indexed and actions. Repository documents can be disabled but not deleted; uploaded ones can be deleted.
- **Documentation gaps**: questions Ocean could not answer, most asked first, masked and shortened; a clear button.
- **Usage** counters (questions, answered from documentation, no verified answer, web fallback searches, blocked, rate limited, average retrieval ms) and a **Recent activity** audit list (last 100 events).

## Settings: Compliance, Automation and Security sections

These forms save to the server (see "Saved settings") but are not enforced by the portal today.
- Compliance: check frequency (15 min to daily), grace period, Strict Mode, auto-escalation and escalate-after (12 to 72 hours), risk score weights (Encryption 40, OS Version 25, App Compliance 20, Device Check-in 15; must total 100).
- Automation: auto-remediation (off by default), trigger-after hours, dry run first (on), max automations per day (5, 10, 25, 50 or unlimited), pre-execution notification lead time (5 to 60 minutes), log retention (30 days to 1 year). The working automation engine is documented in [AUTOMATION-ENGINE.md](AUTOMATION-ENGINE.md).
- Security, **Auto sign-out (live)**: a Global Admin chooses how long a person may be inactive before being signed out: 15, 30, 45 or 60 minutes (default 60). It is saved on the server (`DATA_DIR/session-settings.json`) through `PUT /api/auth/session-settings`, applies to everyone immediately, and other roles see it read-only. Inactivity means no click, key press or scroll (background refreshing does not count); the browser reports activity at most once a minute and the server rejects calls from an idle session (`IDLE_TIMEOUT`). Two fixed rules apply whatever the setting: everyone must sign in again at least every 9 hours (the session token expires 9 hours after sign-in, activity does not extend it), and every server restart signs everyone out because each token carries a per-start ID. The login page shows why a person was signed out. The rest of this card is UI-only: failed-login lockout (3, 5, 10), "Require MFA for all admins", SSO toggle, IP allowlist (CIDR per line), audit log retention (30 days to 2 years).

## Settings: Notifications section

Email delivery sender name and reply-to, a compliance digest toggle and frequency, a Slack card (webhook URL) and a PagerDuty card (integration key). These fields save to the server, except the Slack webhook URL and the PagerDuty key: those are credentials and are never saved here (connect Slack in Integrations; the fields say so). The one live action is **Test Connection** for Slack, which calls `POST /api/slack/test` and reports "Bot token verified - workspace reachable" or the error. Report delivery schedules are configured on the Scheduled Reports page ([SCHEDULED-REPORTS.md](SCHEDULED-REPORTS.md)).

## Settings: Data & Privacy and Danger Zone sections

Data & Privacy: device record retention (90 days to indefinitely), activity log retention, PII masking in exports, GDPR compliance mode, and export buttons for device records, activity log and compliance reports (they only show a toast). Danger Zone: reset settings, purge activity log and revoke sessions, behind confirmations; the actions only show success messages and change nothing on the server. Note: a QuietHours dialog component exists in `src/components/settings/QuietHoursModal.tsx` but is not used anywhere.

## Saved settings

General, Compliance, Automation, Security (except Auto sign-out), Notifications and Data & Privacy each have a Save Changes button that stores that section's values on the server and shows "Last saved <time> by <person>". The page loads the saved values when it opens, so they survive a reload and a restart.

- **Where:** `DATA_DIR/app-settings.json` by default, or the `app_settings` table (migration `004_app_settings`) once PostgreSQL is connected; a section PostgreSQL does not have yet is read from the file, so connecting PostgreSQL later loses nothing.
- **API:** `GET /api/settings` (all saved sections) and `PUT /api/settings/:section` (replaces one section). Both need the `pages.Settings` permission. Each save is written to the audit log as `SETTINGS_UPDATED` with the old and new values.
- **Validation:** unknown fields are refused. Examples: the time zone must exist, the logo must be an http(s) URL, risk weights must add up to 100, retention and similar numbers must be whole numbers, and every line of the IP allowlist must be an IP address or CIDR range. Credentials are not accepted: a Slack webhook or PagerDuty key sent to Notifications is rejected.
- **Not enforced yet:** nothing in the portal reads these values to change its behaviour, except that Auto sign-out and the Data Sync schedules are separate, live settings. Treat the saved values as the team's recorded policy until enforcement is built. In particular the IP allowlist and the MFA, lockout and retention options do not restrict or delete anything.

## Settings API endpoints

| Method | Path | Purpose | Permission |
|---|---|---|---|
| POST | `/api/integrations/:id/credentials` | Push credentials for intune, manageengine, entra, slack, openai, gemini | Signed-in session |
| GET | `/api/integrations/status` | Health of each integration | Signed-in session |
| POST | `/api/integrations/:id/sync` | Force a fetch or connection test | Signed-in session |
| GET | `/api/integrations/intune/debug` | Intune connectivity and permission diagnostic | Signed-in session |
| GET | `/api/slack/health` | Slack health snapshot | Signed-in session |
| POST | `/api/slack/test` | Test Slack connection | Signed-in session |
| POST | `/api/slack/reconnect` | Force a Slack health re-check | Signed-in session |
| GET | `/api/roles` | List roles (Global Admin shown all-true) | `roles.manage` |
| GET | `/api/roles/permission-keys` | Permission taxonomy for the editor | `roles.manage` |
| POST | `/api/roles` | Create a role (name 2-60 chars, permissions) | `roles.manage` |
| PUT | `/api/roles/:id` | Rename (custom only) or change permissions | `roles.manage` |
| DELETE | `/api/roles/:id` | Delete a custom, unassigned role | `roles.manage` |
| GET/POST | `/api/roles/assignments` | List or set a user's role (userEmail, roleId) | `roles.manage` |
| DELETE | `/api/roles/assignments/:email` | Remove a user's assignment | `roles.manage` |
| GET | `/api/ocean/admin/documents` | List documents and index status | `ocean.docs.manage` |
| POST | `/api/ocean/admin/documents` | Add or update an approved document | `ocean.docs.manage` |
| PATCH | `/api/ocean/admin/documents/:id` | Enable or disable, set access class | `ocean.docs.manage` |
| POST | `/api/ocean/admin/documents/:id/reindex` | Re-index one document | `ocean.docs.manage` |
| DELETE | `/api/ocean/admin/documents/:id` | Delete an uploaded document | `ocean.docs.manage` |
| POST | `/api/ocean/admin/reindex` | Re-scan and re-index all (`?force=1`) | `ocean.docs.manage` |
| GET | `/api/ocean/admin/status` | Index health, provider flags, counters | `ocean.docs.manage` |
| GET/PUT | `/api/ocean/admin/settings` | Read or set the web fallback | `ocean.docs.manage` |
| GET/DELETE | `/api/ocean/admin/gaps` | List or clear documentation gaps | `ocean.docs.manage` |
| GET | `/api/ocean/admin/events` | Recent audit trail | `ocean.docs.manage` |
| GET | `/api/ocean/docs/:id` | View an indexed document (admin-only docs need `ocean.docs.manage`) | `copilot.read` |

## Settings environment variables

Integration credentials can come from `server/.env` instead of the UI: `INTUNE_TENANT_ID`, `INTUNE_CLIENT_ID`, `INTUNE_CLIENT_SECRET`, `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `MANAGEENGINE_*`, `SLACK_BOT_TOKEN`, `SLACK_WEBHOOK_URL`, `SLACK_SIGNING_SECRET`, `SLACK_WORKSPACE_ID`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_ENABLE_GOOGLE_SEARCH`. Ocean: `OCEAN_DOCS_ROOT`, `OCEAN_AUTO_REINDEX_HOURS` (default 6, 0 off), `OCEAN_WEB_SEARCH_PROVIDER`. Others: `DATA_DIR`, `DATABASE_URL` (optional for roles and schedules, which have file fallbacks), `AUTH_ENFORCED` (never disable in production). Full list: `docs/14-environment-variable-reference.md`.

## Settings troubleshooting

- "Push Blocked": the secret field is empty, a placeholder or under 10 characters.
- "Push Failed - Server is offline or unreachable": the API is down or the server rejected the request.
- Sync says not configured: push credentials first.
- The Roles & Permissions or Ocean Knowledge section is missing: your role lacks `roles.manage` or `ocean.docs.manage`.
- A role edit does not take effect immediately: allow up to 15 seconds or sign in again.
- "Reassign every user on this role before deleting it": unassign users first.
- Ocean web fallback cannot be enabled: no ready provider; check `OCEAN_WEB_SEARCH_PROVIDER`.
- Changes in General, Compliance, Automation, Security, Data & Privacy or Danger Zone disappear or have no effect: these sections are not wired to the server.

## Settings limitations

- Seven of the eleven sections are visual placeholders without persistence.
- (Fixed 2026-11-20) Jira and Confluence credentials can now be pushed from the UI; see "Settings: Integrations section".
- Disconnect on an integration card is local only; it does not remove server credentials.
- Navigation visibility is a view preference, not an access control.
- Most Settings API routes check only the signed-in session, not a capability; the UI hides the sections.


## Settings: Data Sync (live)

Shows which storage is in use (local files by default, PostgreSQL once connected and restarted), then one card per scheduled module: **Device, security and check-in data** (Intune and ManageEngine, default 45 minutes), **Application inventory** (Endpoint Central, default 8 hours), **Patch data** (Endpoint Central, default daily) and **Security findings history** (default 1 hour). Each source has an on/off switch, its last successful sync and a "Sync every" choice limited to what that module allows. Changes save at once through `PUT /api/sync/schedule` and need the `sync.manage` capability (Global Admin and IT Admin by default); other roles see the values read-only. Without PostgreSQL everything works on local files. Full design: [../17-database-sync-architecture.md](../17-database-sync-architecture.md).

