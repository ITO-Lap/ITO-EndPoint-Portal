# Scheduled Reports

## What the Scheduled Reports page is and who can use it

Scheduled Reports (nav id `scheduled_reports`, page title "Scheduled Reports", permission key `pages.Scheduled Reports`, in the Reports group) lets an admin create recurring reports that are generated on a cron schedule and delivered to a Slack channel, to email recipients, or both. Page: `src/pages/ScheduledReportsPage.tsx`. Backend: `server/src/routes/scheduledReports.ts`, `server/src/services/scheduledReportRunner.ts`, `server/src/store/scheduledReportsStore.ts`, `server/src/routes/notificationSchedules.ts` and `server/src/services/notificationScheduler.ts`.

Default access: Global Admin and IT Admin; Helpdesk does not have the page. Editing the day/time of a Slack notification schedule needs the capability `notificationSchedules.edit` (page text mentions `scheduledReports.editSlackSchedule`), which IT Admin has by default; Global Admin always has every permission. For on-screen reports see [REPORTS-ANALYTICS.md](REPORTS-ANALYTICS.md).

## What the Scheduled Reports page shows

- **Header**: a Refresh button and a "New Schedule" button. Subtitle: "Schedule report delivery to a Slack channel or email recipients. Default format is Excel."
- **New / Edit form**: Report Name (required, placeholder "Weekly Compliance Report"); Report Type; Format (PDF, EXCEL, CSV, PPTX; default Excel); Delivery (Email, Slack channel, Email + Slack; default Slack channel); Slack channel ID (required for Slack delivery; the bot must be invited to the channel); Schedule; Recipients (type an address and press Add or Enter; chips with an x to remove). The form buttons are "Create Schedule" or "Save Changes", and "Cancel". The form pre-fills a default recipient and a default Slack channel; check both before saving.
- **Report Type choices**: critical patching, stale devices, compliance, inventory, Managed App Report (id `app-updates`), Windows updates (feature & security), and three Slack-only types: fleet health digest, duplicate Entra device objects, Windows Patch Tuesday briefing. The type cannot be changed when editing.
- **Schedule presets**: Daily at 8am (`0 8 * * *`), Weekly Mon 8am (`0 8 * * 1`), Weekly Mon 11am (`0 11 * * 1`), Monthly 1st 8am (`0 8 1 * *`), Every weekday at 7am (`0 7 * * 1-5`), or type any 5-field cron.
- **Schedule list**: each schedule shows its name, an Active/Off badge, a format badge, report type and cron, delivery destination (Slack channel ID and/or email recipients), last run time, and the result message of the last Run Now. A red note appears if no delivery is set ("No delivery set - will fail. Click Edit.") or a Slack-only report has no channel.
- **Row actions**: On/Off toggle, Run Now, Edit, Delete (asks for confirmation).
- **Slack Notification Schedule section** (only for schedules with a Slack channel): shows Enabled or Paused, "Slack not configured" if applicable, a plain-language description, the time zone, the next scheduled notification, the last notification outcome and error, and an "Edit schedule" button (replaced by "Global Admin required to edit this schedule." when you lack permission). The edit dialog offers Daily or Weekly, weekday chips Sun to Sat, a time, a time zone (list includes Asia/Kolkata, UTC, America/New_York, America/Los_Angeles, Europe/London, Asia/Singapore, Australia/Sydney) and an enable toggle.

## How Scheduled Reports work

**Report types and formats.** Valid types are `critical-patching`, `stale-devices`, `compliance`, `inventory`, `app-updates`, `fleet-digest`, `entra-duplicate-devices`, `windows-updates`, `windows-briefing`. Valid formats are `pdf`, `excel`, `csv`, `pptx`. Only `compliance` and `inventory` honour the chosen format. `critical-patching`, `stale-devices`, `windows-updates` and `app-updates` always produce an .xlsx workbook, so the form shows their Format as Excel and disabled, and the server stores and delivers them as Excel (with the Excel content type) whatever format was sent. `fleet-digest`, `entra-duplicate-devices` and `windows-briefing` are Slack messages, not files, and are Slack-only (the Email delivery choice is hidden, and update is rejected without a channel). Compliance and inventory pull Intune devices through Microsoft Graph using the server's Intune credentials. Excel, PDF and PPTX need the packages `exceljs`, `pdfkit` and `pptxgenjs` installed on the server (`cd server && npm install exceljs pdfkit pptxgenjs`); without them the exporter falls back to CSV.

**Cadence and time zone.** The schedule is a raw 5-field cron (the server only checks that there are five fields). A runner (`startScheduledReportRunner`) ticks every 60 seconds and fires an active schedule whose cron matches the current minute in the schedule's time zone and that has not already run in this minute. Cron supports lists, ranges, `*` and `/` steps. The page saves `filters.timezone = "Asia/Kolkata"` on every schedule it creates or edits, so cron times are India Standard Time; if `filters.timezone` is missing the runner uses UTC. Once you open a schedule's "Slack Notification Schedule" section, a row in `notification_schedules` takes over and the cron runner skips that report, so only one engine fires it. That generic scheduler polls every 60 seconds by default (`NOTIFICATION_SCHEDULER_POLL_SECONDS`, minimum 15) and uses a day/time model instead of cron: frequency `daily` or `weekly` (one or more weekdays), `HH:MM` 24-hour time, an IANA time zone. The default for a new one is weekly, Monday, 09:00, Asia/Kolkata, seeded from the existing cron when it is a simple daily or weekly shape (monthly and complex crons fall back to the default). Saving never sends a message; it only recomputes the next run. An enabled schedule cannot have exactly the same day, time and time zone as another enabled schedule sending to the same Slack channel.

**Recipients and delivery channels.** A schedule needs a Slack channel (`filters.slackChannelId`) or at least one email recipient. Slack delivery uploads the file (or posts a headline overview) with the Slack bot token from Settings -> Integrations -> Slack; a webhook alone cannot upload files. Email delivery uses Microsoft Graph sendMail from the service mailbox in `INTUNE_AUDIT_EMAIL_SENDER_UPN`; recipient addresses are validated against the allowed domains (`INTUNE_AUDIT_EMAIL_ALLOWED_DOMAINS`). With both channels, each is attempted independently and a failure message names the channel that failed.

**Run outcome and history.** Run Now (and each automatic run) records a run row (status, format, record count, file size, error, triggered by scheduler or manual, start and end) and raises a bell notification, "<name> delivered to Slack / by email / to Slack and email" or "could not be delivered ...". The last 50 runs per schedule are kept.

**Storage.** With `DATABASE_URL` set, schedules and runs live in PostgreSQL tables `scheduled_reports`, `report_runs`, `notification_schedules` and `schedule_audit_log`. Without it the feature still works and stores a JSON file `scheduled-reports.json` under `DATA_DIR` (default `%ProgramData%\ito-endpoint` on Windows, `server/data` otherwise), single-process only. Changes to a Slack notification schedule are written to an audit trail (last 200 entries in the file backend) as `NOTIFICATION_SCHEDULE_UPDATED`.

## Scheduled Reports API endpoints

Mounted behind the session gate and the 200 per 15 minutes per client API rate limit. Every schedule route needs the `pages.Scheduled Reports` permission; the notification-schedule PATCH additionally needs `notificationSchedules.edit`.

| Method | Path | Purpose | Permission |
|---|---|---|---|
| GET | `/api/scheduled-reports` | List schedules | `pages.Scheduled Reports` |
| GET | `/api/scheduled-reports/:id` | Get one schedule | `pages.Scheduled Reports` |
| POST | `/api/scheduled-reports` | Create (name, report_type, schedule_cron, format default excel, recipients, filters, created_by) | `pages.Scheduled Reports` |
| PUT | `/api/scheduled-reports/:id` | Update name, cron, format, recipients, filters or is_active | `pages.Scheduled Reports` |
| DELETE | `/api/scheduled-reports/:id` | Delete a schedule | `pages.Scheduled Reports` |
| POST | `/api/scheduled-reports/:id/run` | Generate and deliver now (Run Now) | `pages.Scheduled Reports` |
| GET | `/api/scheduled-reports/:id/runs` | Run history | `pages.Scheduled Reports` |
| GET | `/api/notification-schedules` | List all Slack notification schedules (with report name and type) | Any signed-in role |
| GET | `/api/notification-schedules/:module/:sourceId` | Get (or create with defaults) one schedule; module is `scheduled_report` | Any signed-in role |
| PATCH | `/api/notification-schedules/:module/:sourceId` | Edit day, time, time zone, enabled | `notificationSchedules.edit` |

Validation errors (HTTP 400): missing name, report type or cron; cron not five fields; unknown type or format; no Slack channel and no recipients; Slack-only report without a channel; weekly frequency without weekdays; invalid time zone or time.

## Scheduled Reports settings and environment variables

| Variable | Used for |
|---|---|
| `DATABASE_URL` | Optional; PostgreSQL storage instead of the JSON file |
| `DATA_DIR` | Folder for the JSON store and other runtime data |
| `NOTIFICATION_SCHEDULER_POLL_SECONDS` | Slack notification scheduler poll interval (default 60, minimum 15) |
| `INTUNE_AUDIT_EMAIL_SENDER_UPN` | Service mailbox used to send email reports; email fails without it |
| `INTUNE_AUDIT_EMAIL_ALLOWED_DOMAINS` | Allowed recipient domains for email |
| `SLACK_BOT_TOKEN` | Slack file and block delivery (or set in Settings -> Integrations) |
| `SLACK_CRITICAL_PATCH_CHANNEL_ID` | Channel for application update reports and packaging requests |

See `docs/14-environment-variable-reference.md` for the full list.

## Scheduled Reports troubleshooting

- "Slack Bot OAuth token is not configured.": add a bot token in Settings -> Integrations -> Slack and push it. A webhook URL alone is not enough for files.
- "INTUNE_AUDIT_EMAIL_SENDER_UPN is not configured": set the sender mailbox in `server/.env` and restart.
- Slack upload fails: invite the bot to the channel and check the channel ID.
- Report did not fire: check the toggle is On, the cron and the time zone (cron is read in Asia/Kolkata for schedules saved from this page), and whether the Slack Notification Schedule section has taken over timing.
- "Another enabled schedule already sends to this Slack channel at this exact day and time.": change the time or day.
- "Delivered ... (N rows)" but you wanted a PDF: only compliance and inventory honour the format.
- The Slack Notification Schedule section shows "Scheduler unavailable" when no schedule can be read. It works without PostgreSQL (the store uses a JSON file), so check the server log rather than adding a database.

## Scheduled Reports limitations

- Cron monthly or complex expressions cannot be shown in the Slack day/time editor; they seed a default (weekly Monday 09:00).
- The JSON-file store is safe for one server process only.
- No per-run download; reports are delivered, not stored for later retrieval in the UI. Run history is available through the API only (no UI).
- Every schedule route needs the `pages.Scheduled Reports` permission on the server (Global Admin and IT Admin by default).
