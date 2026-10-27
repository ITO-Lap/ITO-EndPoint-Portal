# ITO Endpoint — Roles & Permissions Reference

> **Version:** 1.0 | **Last updated:** May 2026 | **Audience:** IT Operations, IT Admins, Helpdesk

---

## Overview

ITO Endpoint supports three distinct roles, each scoped to a specific level of access. Role assignment is managed exclusively by Global Administrators in **Settings → Roles & Permissions**.

| Role | Who it's for | Access level |
|---|---|---|
| **Global Admin** | IT Operations leads, platform owners | Full read/write across all features and settings |
| **IT Admin** | Endpoint engineers, senior IT staff | Device management, compliance, runbooks — no org settings |
| **Helpdesk** | Front-line support, service desk agents | Read-only views + basic device actions only |

---

## Role Definitions

### 1. Global Admin

The highest privilege level. Intended for IT Operations leads and platform owners who are responsible for the overall health and configuration of the endpoint management platform.

**Typical users:** IT Operations Manager, Senior Endpoint Engineer, Platform Owner

**What they can do:**
- Full access to every dashboard, page, and settings section
- Create, modify, and delete compliance policies
- Connect, configure, and disconnect all integrations (Intune, ManageEngine, OpenAI)
- View, copy, and rotate API keys
- Manage all user accounts and assign roles
- Trigger and configure automated runbooks
- Access and execute Danger Zone actions (purge logs, reset settings, revoke sessions)
- Export all data including full audit logs
- Configure organisation-wide security settings (MFA enforcement, session timeout, IP allowlist)
- Manage notification settings for the entire organisation

---

### 2. IT Admin

A hands-on operational role for engineers who manage day-to-day endpoint health. They can act on devices and run remediation, but cannot change the platform's configuration or view sensitive credentials.

**Typical users:** Endpoint Engineer, Senior IT Support Specialist, Systems Administrator

**What they can do:**
- View all dashboard data and compliance reports
- Search, view, and drill into any device record
- Trigger device sync operations
- Run compliance runbooks and start automations
- View runbook library (read-only, cannot create new runbooks)
- View integration connection status (cannot modify, see API keys, or disconnect)
- View and export device records and compliance reports
- Export activity log (their own actions + device events)
- Configure their own profile and notification preferences
- View security settings (cannot modify org-level security configuration)

**What they cannot do:**
- Modify or create integrations
- View API keys
- Access General / Automation / Danger Zone settings
- Manage other user accounts or change roles
- Modify organisation-wide notification or security settings

---

### 3. Helpdesk

A tightly scoped read-only role for front-line support agents who need to look up device status and compliance information to assist end users, without the ability to make changes.

**Typical users:** IT Helpdesk Agent, Service Desk Analyst, IT Support Technician

**What they can do:**
- View the main compliance dashboard (read-only)
- Search for devices by name, user email, or serial number
- View device details, compliance status, and issue summary
- View the recommended runbook steps for a device (cannot execute)
- View recent activity log (read-only, all entries)
- Trigger a device sync (a single safe, non-destructive action)
- Configure their own profile and notification preferences

**What they cannot do:**
- Run or trigger any runbook or automation
- View or access any Settings section
- View integration configuration or API keys
- Export any data
- View or modify user accounts
- Access Reports & Analytics, Diagnostics, or Activity Log write actions

---

## Permissions Matrix

| Feature / Action | Global Admin | IT Admin | Helpdesk |
|---|:---:|:---:|:---:|
| **Dashboard** | | | |
| View compliance dashboard | ✅ | ✅ | ✅ |
| View stat cards & trends | ✅ | ✅ | ✅ |
| Click stat card filters | ✅ | ✅ | ✅ |
| **Device Management** | | | |
| Search devices | ✅ | ✅ | ✅ |
| View device details | ✅ | ✅ | ✅ |
| View compliance breakdown | ✅ | ✅ | ✅ |
| Trigger device sync | ✅ | ✅ | ✅ |
| Copy device serial / user | ✅ | ✅ | ❌ |
| **Runbooks & Automation** | | | |
| View runbook steps | ✅ | ✅ | ✅ |
| Run / execute a runbook | ✅ | ✅ | ❌ |
| Start automation | ✅ | ✅ | ❌ |
| Create / edit runbooks | ✅ | ❌ | ❌ |
| Configure auto-remediation | ✅ | ❌ | ❌ |
| **Compliance** | | | |
| View compliance policies | ✅ | ✅ | ✅ |
| Modify compliance policies | ✅ | ✅ | ❌ |
| Adjust risk score weights | ✅ | ❌ | ❌ |
| Configure grace period | ✅ | ❌ | ❌ |
| **Integrations** | | | |
| View integration status | ✅ | ✅ | ❌ |
| Trigger integration sync | ✅ | ✅ | ❌ |
| Modify integration config | ✅ | ❌ | ❌ |
| View API keys | ✅ | ❌ | ❌ |
| Connect / disconnect source | ✅ | ❌ | ❌ |
| **Reports & Analytics** | | | |
| View reports | ✅ | ✅ | ❌ |
| Export device records | ✅ | ✅ | ❌ |
| Export audit log | ✅ | ✅ | ❌ |
| Export all data (ZIP) | ✅ | ❌ | ❌ |
| **Activity Log** | | | |
| View activity log | ✅ | ✅ | ✅ (read-only) |
| **Settings** | | | |
| General settings | ✅ | ❌ | ❌ |
| Compliance settings | ✅ | ❌ | ❌ |
| Automation settings | ✅ | ❌ | ❌ |
| Security settings | ✅ | View only | ❌ |
| Notification settings (org) | ✅ | ❌ | ❌ |
| Notification settings (own) | ✅ | ✅ | ✅ |
| Data & Privacy | ✅ | ❌ | ❌ |
| Danger Zone | ✅ | ❌ | ❌ |
| **User Management** | | | |
| View all users | ✅ | ❌ | ❌ |
| Create / deactivate users | ✅ | ❌ | ❌ |
| Assign / change roles | ✅ | ❌ | ❌ |
| Edit own profile | ✅ | ✅ | ✅ |

> **Notification settings (org)** includes editing the day/time schedule of automatic Slack notifications (Scheduled Reports → Slack Notification Schedule). Only Global Admin can edit; IT Admin and Helpdesk see the schedule read-only. See `server/src/routes/notificationSchedules.ts`.

---

## Onboarding Checklist

### Global Admin
- [ ] Sign in via SSO (Microsoft Entra ID)
- [ ] Verify all 4 integrations show "Connected" in Settings → Integrations
- [ ] Set compliance grace period and risk score weights in Settings → Compliance
- [ ] Enable MFA requirement for all admins in Settings → Security
- [ ] Configure quiet hours and notification preferences in Profile → Notifications
- [ ] Review and configure auto-remediation settings in Settings → Automation
- [ ] Invite IT Admins and Helpdesk users and assign roles

### IT Admin
- [ ] Sign in via SSO or email/password
- [ ] Enrol MFA (required by org policy)
- [ ] Familiarise with the compliance dashboard and device search
- [ ] Review the runbook library under Runbooks in the sidebar
- [ ] Set your personal notification preferences in Profile

### Helpdesk
- [ ] Sign in via SSO or email/password
- [ ] Enrol MFA (required by org policy)
- [ ] Learn device search: search by device name, user email, or serial number
- [ ] Understand compliance status colours: green = Compliant, amber = Warning, red = Non-Compliant
- [ ] For any runbook execution needed, escalate to an IT Admin

---

## Role Assignment

Only **Global Admins** can assign roles. The workflow is:

1. Navigate to **Settings → Roles & Permissions**
2. Click **Invite User** or find an existing user in the list
3. Select the role from the dropdown
4. The user receives an email with sign-in instructions

---

## Frequently Asked Questions

**Q: Can an IT Admin run an automation without approval?**
A: Yes — IT Admins have full automation execution rights. Only Helpdesk users require escalation.

**Q: Can Helpdesk see which user owns a device?**
A: Yes, device owner information is visible in Device Summary. However, Helpdesk cannot copy the email address or serial number.

**Q: Who can disconnect an integration?**
A: Only Global Admins. Disconnecting an integration immediately stops all syncs for that platform.

**Q: Can I have both Global Admin and IT Admin users?**
A: Yes. The recommended structure is 1–2 Global Admins (platform owners) and multiple IT Admins for day-to-day operations.

**Q: What happens if a Helpdesk user tries to access Settings?**
A: The Settings page is hidden from the sidebar and inaccessible. If they navigate directly, they see an "Access Denied" message.

---

## Module-specific roles: Intune Audit Logs

The Intune Audit Logs module (`docs/04-integrations/INTUNE-AUDIT-LOGS.md`) defines three finer-grained roles on top of the three tiers above, enforced server-side by every `/api/intune/*` route:

| Module role | Can do | Mapped from |
|---|---|---|
| **Audit Reader** | View and filter audit events, view export/schedule status | Global Admin, IT Admin, Helpdesk |
| **Audit Exporter** | Everything Reader can, plus create/cancel/download/email exports | Global Admin, IT Admin |
| **Audit Administrator** | Everything Exporter can, plus create/edit/disable/delete recurring schedules | Global Admin, IT Admin |

Helpdesk therefore has read-only access to this module — the same tier that has read-only access everywhere else in the app. See `server/src/middleware/requireRole.ts` for the enforcement code and its documented limitation (role is read from a request header sent by the frontend, not a verified session — this app has no per-user login today).

---

*For questions about this documentation, contact: it-support@zinnia.com*
