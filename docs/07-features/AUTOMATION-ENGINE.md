# Automation Engine — Feature Guide

> **Location:** Automation → Automation (sidebar)  
> **Audience:** IT Admins · Security Engineers · Global Admins  
> **Permissions:** Global Admin and IT Admin only

---

## What It Does

The Automation Engine lets you configure trigger-based workflows that fire automatically across your endpoint fleet — no manual intervention required. A rule moves through:

```
Trigger → Conditions → Actions → Log
```

---

## Navigation

- **Sidebar → Automation → Automation**
- Badge count shows active rule count

---

## Dashboard View

### Stats Bar (3 cards)
| Card | Description |
|---|---|
| Total Rules | All configured rules |
| Active | Rules currently enabled and running |
| Inactive | Rules toggled off |

### View Tabs
| Tab | Content |
|---|---|
| **Automation Rules** | Rule cards with category filter + rule count badges |
| **Execution History** | Full execution log with status filter (All / Success / Failed / Skipped) |

---

## Rule Categories

| Category | Color | Purpose |
|---|---|---|
| Compliance | Green | Policy enforcement and remediation |
| Security | Red | Threat response and hardening |
| Patching | Orange | Update deployment and patch enforcement |
| Reporting | Violet | Automated report generation and delivery |
| Drift | Amber | Configuration drift detection |

---

## Available Triggers

| Trigger | When it fires |
|---|---|
| Device becomes Non-Compliant | Any device fails a compliance policy |
| Device encryption turns Off | BitLocker/FileVault disabled |
| Fleet compliance drops below threshold | Fleet-wide compliance % drops |
| Device goes offline for N days | No MDM check-in for configured days |
| New device enrolled | First-time enrollment |
| Compliance drift detected | Device config diverges from baseline |
| Risky sign-in detected | Azure Identity Protection flags a sign-in |
| Scheduled (cron) | Fixed schedule (daily/weekly/monthly) |
| Script execution fails | Remote script returns error exit code |

---

## Available Actions

| Action | Description |
|---|---|
| **Execute Runbook** | Triggers a remediation runbook from the Runbook Library |
| **Send Notification** | In-app notification to admins |
| **Send Slack Message** | Posts to configured Slack channel (requires Slack integration) |
| **Create Jira Ticket** | Auto-creates incident/task in Jira (requires Jira integration) |
| **Run Remote Script** | Executes a script from the Script Library against the target device |
| **Generate Report** | Triggers a report and delivers to configured recipients |

Multiple actions can be chained per rule, executed in sequence.

---

## Rule Conditions (Filters)

Each rule can be scoped by:
- **Platform:** Windows / macOS / Linux / All
- **MDM Source:** Intune / ManageEngine / All
- **Severity:** Low / Medium / High / Critical / All
- **Compliance State:** Non-Compliant / Warning / All

---

## Creating a Rule

1. Click **[New Rule]** → or use a **Quick-Start Template**
2. Fill in: Name, Description, Category
3. Select a Trigger
4. (Optional) Set Condition filters
5. Select one or more Actions
6. Toggle **Enable immediately** if ready
7. Click **Create Rule**

### Quick-Start Templates

The Automation page sidebar includes 3 pre-built templates:
- **Auto-Remediate Encryption** — BitLocker/FileVault runbook on encryption-off event
- **Jira Escalation on Critical** — Creates incident when device hits Critical severity
- **Weekly Patch Report** — Scheduled report delivery on Fridays

Click a template to pre-fill the Create Rule form.

---

## Rule Cards

Each rule card shows:
- Rule name + category badge
- Description
- Trigger chip (what fires it)
- Action chips (what it does)
- Enable/disable toggle with toast confirmation
- Last triggered timestamp + cumulative run count
- **Test Run** button — fires a simulated test trigger and logs the result
- **Details** expand — shows full trigger config, conditions, and action settings

---

## Execution History Tab

Shows the last 50 rule executions with:
- Rule name + category badge
- Device that triggered it (if applicable)
- Trigger reason
- Actions executed (with individual success/failure status)
- Duration (ms)
- Relative timestamp

**Filters:** All / Success / Failed / Skipped

---

## Pipeline Diagram (in sidebar)

The Automation page sidebar shows a visual pipeline:
```
Trigger → Conditions → Actions → Log
```
With hover descriptions for each stage. This helps new users understand the workflow model.

---

## Webhook / Integration Dependencies

| Action | Requires |
|---|---|
| Slack Message | Slack Bot Token in Settings → Integrations → Slack |
| Jira Ticket | Jira credentials in Settings → Integrations → Jira |
| Execute Runbook | Runbook in the Runbook Library |
| Run Script | Script in the Script Library |

---

## Platform-Specific Automation

Each MDM platform page (Mac Devices, Intune Devices, Windows Devices, ManageEngine Devices) has its own **Automation** tab with 5 pre-built rules scoped to that platform. These rules are independent of the global Automation Engine and are managed per-page.

| Platform | Example Rules |
|---|---|
| Mac Devices | FileVault Auto-Remediation, Stale Mac Alert, macOS Version Enforcement |
| Intune | BitLocker Remediation, Defender Health Alert, Non-Compliant Escalation |
| Windows | Critical Patch Auto-Push, BitLocker Key Escrow, Defender RTP Alert |
| ManageEngine | Missing Patches Alert, Auto-Deploy Security Patches, Unauthorized Software Alert |

---

## Files

| File | Purpose |
|---|---|
| `src/components/automation/AutomationPage.tsx` | Main page (Rules + History tabs, Quick-Start templates, sidebar) |
| `src/hooks/useAutomations.ts` | Data fetching hook (rules, executions, stats) |
| `src/api/index.ts` | `createAutomationRule`, `toggleAutomationRule`, `deleteAutomationRule`, etc. |
| `server/src/routes/automations.ts` | Express router |
| `server/src/data/mockAutomations.ts` | In-memory store + CRUD helpers |

---

## Related Docs
- [Remote Scripts](REMOTE-SCRIPTS.md) — script library for the `execute_script` action
- [Runbooks](RUNBOOKS.md) — runbook library for the `execute_runbook` action
- [Endpoint Pages](ENDPOINT-PAGES.md) — platform-specific automation tabs
