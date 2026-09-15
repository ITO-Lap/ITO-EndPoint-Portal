# Intune Audit Logs Module

Retrieves Microsoft Intune **administrative audit events** — who changed what configuration, compliance policy, app, enrollment profile, or role assignment, and when — via the Microsoft Graph v1.0 endpoint:

```
GET https://graph.microsoft.com/v1.0/deviceManagement/auditEvents
```

This is **not** the same as:

| Term | What it actually is |
|---|---|
| Intune administrative audit events (this module) | Config/policy/app/role change history from `deviceManagement/auditEvents` |
| Intune reports | Pre-aggregated usage dashboards under `deviceManagement/reports/*` |
| Azure Monitor operational logs | Platform-level Azure logs, not Intune-specific |
| Device diagnostic files | Logs collected from a specific device |
| Intune Management Extension (IME) client logs | Local Win32 app-deployment logs on the endpoint itself |

Every request happens server-side. No Graph token, client secret, certificate, storage credential, or email credential is ever sent to the browser.

---

## Required Microsoft Graph permission

**`DeviceManagementConfiguration.Read.All`** (Application permission, admin-consented).

`auditEvents` returns events across every Intune RBAC resource category (apps, compliance, device configuration, enrollment, roles, certificates, …), not just one category. `DeviceManagementApps.Read.All` — the permission suggested in some quick-start guides — only surfaces app-management events; using it alone would silently under-return audit data outside that category and violate the "never report a partial export as successful" guarantee this module makes. If your organization wants a tighter scope, confirm exactly which audit categories you need before narrowing the permission, and update `INTUNE_AUDIT_AUTH_MODE`'s app registration accordingly.

---

## Authentication modes

Set `INTUNE_AUDIT_AUTH_MODE` in `server/.env` (default `client_secret`):

| Mode | When to use | Required env vars |
|---|---|---|
| `client_secret` | Default — reuses the same app registration as the rest of this app | `INTUNE_TENANT_ID`, `INTUNE_CLIENT_ID`, `INTUNE_CLIENT_SECRET` |
| `certificate` | Preferred over a client secret for production | `INTUNE_AUDIT_CERT_PEM`, `INTUNE_AUDIT_CERT_THUMBPRINT` |
| `managed_identity` | Hosted on Azure App Service / Container Apps with a system- or user-assigned identity | `INTUNE_AUDIT_MANAGED_IDENTITY_CLIENT_ID` (omit for system-assigned) |

### Certificate setup

1. Generate a certificate and upload the **public key** to the app registration (**Certificates & secrets → Certificates → Upload certificate**).
2. Set `INTUNE_AUDIT_CERT_PEM` to the PEM-encoded **private key + certificate chain** contents (not a file path — store the actual PEM in your secret manager / Key Vault and inject it as an env var, so nothing sensitive touches disk in a container image).
3. Set `INTUNE_AUDIT_CERT_THUMBPRINT` to the certificate's SHA-1 thumbprint (hex, as shown in the Azure portal).

### Managed Identity setup

1. Enable a system-assigned identity (or create a user-assigned one) on the App Service / Container App hosting this server.
2. In the Azure AD app registration used for Graph access, grant that identity the same `DeviceManagementConfiguration.Read.All` application permission (via `New-ApplicationAccessPolicy`-style role assignment, or by making the identity itself the credential for a first-party Graph-permitted resource — consult your tenant's Conditional Access / Graph app-only auth policy).
3. Set `INTUNE_AUDIT_AUTH_MODE=managed_identity`. No secret ever needs to be stored.

---

## Chunking, pagination, and resume — how the one-year export actually works

A single Graph query for a year of audit events would be enormous and Graph paginates internally regardless. This module:

1. Splits the requested `[start, end)` range into fixed-size UTC chunks (`INTUNE_AUDIT_CHUNK_DAYS`, default **7 days**), inclusive-start/exclusive-end, so no event is duplicated or skipped at a chunk boundary.
2. Fetches every `@odata.nextLink` page within a chunk before considering that chunk done.
3. Honors `Retry-After` on HTTP 429 and retries transient network/5xx failures with exponential backoff + jitter.
4. Writes each chunk's matching events to its own scratch file (never holds a year of events in application memory — only a `Set` of event IDs for de-duplication).
5. Marks a chunk `completed` in PostgreSQL only after every page in it has been fetched and written. This is the checkpoint: if the process crashes mid-export, calling the export again re-fetches only the chunks that never completed — already-completed chunks are skipped entirely.
6. Only marks the whole job `completed` after every chunk has completed **and** every requested artifact (JSON/CSV/ZIP) has been uploaded with a verified SHA-256 checksum. A job that can't reach that state is marked `failed`, never silently reported as successful.

Server-side limits (not overridable by the client): `INTUNE_AUDIT_CHUNK_DAYS` (default 7), `INTUNE_AUDIT_MAX_RANGE_DAYS` (default 366), `INTUNE_AUDIT_MAX_CONCURRENT_CHUNKS` (default 1 — sequential; raise cautiously, Graph itself will throttle back with 429 if you go too high).

The live "browse events" table in the UI is intentionally capped at `INTUNE_AUDIT_LIVE_BROWSE_MAX_DAYS` (default 31 days) — it fetches and filters in memory for responsive interactive browsing. Anything beyond that cap should go through **Create Export**, which streams to disk/blob and never loads the full range into memory.

---

## Azure Blob Storage

Completed exports are stored privately under:

```
intune-audit-exports/{tenantId}/{yyyy}/{mm}/{dd}/{exportRequestId}/
  audit-events.json
  audit-events.csv
  audit-export.zip
  manifest.json
  checksums.sha256
```

Configure one of:

```env
# Preferred — Managed Identity + Azure RBAC (Storage Blob Data Contributor on the container/account)
INTUNE_AUDIT_STORAGE_ACCOUNT_URL=https://<account>.blob.core.windows.net
# Fallback — non-Azure hosting or local testing
INTUNE_AUDIT_STORAGE_CONNECTION_STRING=
INTUNE_AUDIT_STORAGE_CONTAINER=intune-audit-exports
```

Downloads never expose a permanent blob URL — `GET /api/intune/exports/:id/download` mints a short-lived SAS (user-delegation SAS under Managed Identity, shared-key SAS under a connection string) scoped to that one blob, capped at 24 hours.

Without either variable set, and only when `NODE_ENV !== production`, exports fall back to `INTUNE_AUDIT_LOCAL_STORAGE_DIR` (a local directory) so the module still works in local dev without Azure credentials — this fallback throws in production rather than silently writing to disk.

**Retention / lifecycle**: this module does not itself delete old blobs. Apply an [Azure Storage lifecycle management policy](https://learn.microsoft.com/azure/storage/blobs/lifecycle-management-overview) scoped to the `intune-audit-exports/` prefix, using each schedule's configured `retentionDays` as a guide. For regulatory retention requirements, consider an immutability policy (WORM) on the container.

---

## Email delivery

Sent server-side via Microsoft Graph `sendMail` from one designated service mailbox:

```env
INTUNE_AUDIT_EMAIL_SENDER_UPN=audit-exports@yourtenant.onmicrosoft.com
INTUNE_AUDIT_EMAIL_ALLOWED_DOMAINS=zinnia.com
INTUNE_AUDIT_EMAIL_ATTACHMENT_MAX_MB=20
INTUNE_AUDIT_EMAIL_LINK_TTL_MINUTES=30
```

Grant `Mail.Send` on the app registration, then scope it to only the service mailbox with an Exchange Online application access policy — **do not** grant tenant-wide `Mail.Send`:

```powershell
New-ApplicationAccessPolicy -AppId <client-id> -PolicyScopeGroupId audit-exports@yourtenant.onmicrosoft.com -AccessRight RestrictAccess -Description "Intune Audit Logs export mailer"
```

Exports larger than `INTUNE_AUDIT_EMAIL_ATTACHMENT_MAX_MB` are sent as an expiring download link instead of an attachment. `INTUNE_AUDIT_EMAIL_ALLOWED_DOMAINS` restricts recipients to an approved allowlist — this is a data-exfiltration control, not just validation, and every send path enforces it server-side regardless of what the UI shows.

---

## Scheduling

Recurring exports poll from PostgreSQL every `INTUNE_AUDIT_SCHEDULER_POLL_SECONDS` (default 60s) — state lives entirely in `intune_audit_export_schedules`, so a server restart never loses a schedule. Overlapping runs of the same schedule are prevented by an atomic `is_running` claim; a claim older than 2 hours is treated as a crashed run and reclaimed automatically.

Weekly/monthly/yearly cadences are anchored to the schedule's creation date (weekday for weekly, day-of-month clamped for shorter months for monthly, month+day for yearly) rather than requiring a separate day-of-week/day-of-month field. Next-run computation is timezone/DST-aware (walks calendar days in the schedule's IANA timezone via `Intl`, not fixed UTC offsets).

---

## Setup checklist

1. Grant `DeviceManagementConfiguration.Read.All` on the app registration and admin-consent it.
2. Choose an auth mode (`INTUNE_AUDIT_AUTH_MODE`) and set its credentials.
3. Set `DATABASE_URL` and apply the schema: `psql $DATABASE_URL -f server/src/db/schema.sql` (idempotent — safe to re-run; it only adds this module's tables alongside the existing ones).
4. Configure Blob Storage (`INTUNE_AUDIT_STORAGE_ACCOUNT_URL` or `_CONNECTION_STRING`).
5. (Optional) Configure email (`INTUNE_AUDIT_EMAIL_SENDER_UPN` + Exchange application access policy) if you want export delivery or scheduled reports emailed.
6. Restart the server — it resumes any export left `running` by a previous crash, and starts the schedule poller if `DATABASE_URL` is set.

---

## Testing

```bash
cd server
npm test                 # unit tests — no external dependencies required
DATABASE_URL=postgresql://localhost/intune_audit_test npm test   # includes the end-to-end resumable-export test
```

The end-to-end suite (`src/services/__tests__/intuneAuditExport.e2e.test.ts`) exercises the real chunking → pagination → checkpoint/resume → dedup → JSON/CSV/ZIP assembly → manifest/checksum pipeline against a real PostgreSQL database, with Graph mocked and Blob Storage on the local-disk dev fallback. It's skipped automatically when `DATABASE_URL` is unset.

---

## Known limitations

- **No live Azure tenant was available to validate this against** — the pipeline is exercised end-to-end with mocked Graph responses and local-disk storage, and the unit tests validate 429/Retry-After/backoff/timeout handling against a fake HTTP layer. Before production use, run one full export against a real tenant and confirm the artifact event counts against a manual Graph query for the same range.
- **Role enforcement is header-based, not session-based.** This app has no per-user login today (see `server/src/routes/auth.ts` — wired but unused by the frontend). `x-user-role`/`x-user-email` headers sent by the frontend are trusted, matching how the rest of the app already works, but a header is not a verified credential. Re-enabling the existing OAuth flow and switching `server/src/middleware/requireRole.ts` to read the verified session JWT would close this gap without needing new infrastructure.
- **Checkpoint granularity is per-chunk, not per-page.** If the process crashes mid-chunk, the whole chunk (default ≤7 days) is re-fetched on resume rather than resuming from the exact page — simpler and more robust against ephemeral local disk, at the cost of re-fetching at most one chunk's worth of pages.
- **Live browse is capped at 31 days**; longer ranges require creating an export (this is by design, to avoid unbounded memory use — see above).
- **Blob retention/lifecycle is not automated by this app** — apply an Azure Storage lifecycle policy.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Export job X not found` on cancel/download | Wrong tenant, or DB reset since creation | Confirm `DATABASE_URL` points at the same database the job was created against |
| Export stuck `queued` forever | Server restarted before the export's fire-and-forget `runExportJob()` ran | Restart again — `resumeInterruptedExportJobsOnStartup()` picks up any job left `running`; a `queued` job that never started needs to be re-triggered via the UI |
| `Database not configured` on export/schedule endpoints | `DATABASE_URL` unset | Set it and re-run `schema.sql` |
| `Graph sendMail failed (403)` | Missing `Mail.Send` or application access policy not applied | Grant the permission and confirm the access policy scopes it to the sender mailbox |
| Export completes with fewer events than expected | Wrong Graph permission (see above) | Confirm `DeviceManagementConfiguration.Read.All` is granted, not just `DeviceManagementApps.Read.All` |
