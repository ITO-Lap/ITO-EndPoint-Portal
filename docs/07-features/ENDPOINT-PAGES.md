# Platform-Specific Endpoint Pages — Feature Guide

> **Location:** Endpoint Management → Intune Devices
> **Audience:** IT Admins · Endpoint Engineers · Helpdesk
> **Data source:** Live MDM APIs when configured; empty state with connect prompt otherwise

---

## Overview

The Intune Devices page gives the Intune MDM source its own focused workspace with platform-specific
KPIs, a device table, automation rules, and reports. (A "Windows Devices" cross-source page and a
separate "ManageEngine Devices" page previously existed alongside this one but were removed in the
differentiation refactor — cross-platform ManageEngine devices are now covered by the Mac Devices and
ManageEngine App Inventory pages instead.)

---

## Intune Devices Page

**Route:** `Intune Devices` | **File:** `src/pages/IntuneDevicesPage.tsx`

### KPI Cards (5)
| Card | Color | Description |
|---|---|---|
| Total Devices | Blue `#0078D4` | All Intune-managed devices (non-macOS) |
| Compliant | Green | Passed all compliance policies |
| Non-Compliant | Red | Failed one or more policies |
| BitLocker On | Cyan | Disk encryption enabled |
| Defender Active | Indigo | Microsoft Defender AV running |

### Tabs
| Tab | Content |
|---|---|
| Devices | Filterable table: device name, user, OS, compliance, BitLocker, Defender, last check-in |
| Compliance | Policy breakdown bars (BitLocker, Defender, policy pass rate) + non-compliant device list |
| Security | Same as Compliance (extended security view) |
| Automation | 5 Intune-specific rules |
| Reports | 4 KPI tiles + CSV export |

### Intune Automation Rules (5)
1. **BitLocker Auto-Remediation** — triggers BitLocker runbook when encryption is off
2. **Defender Health Alert** — Jira incident when Defender goes inactive
3. **Non-Compliant Device Escalation** — escalates devices non-compliant > 48h
4. **Windows Update Enforcement** — pushes update check when patch age > 30 days
5. **Stale Device Quarantine Alert** — flags devices offline > 14 days

---

## Page Architecture

```
IntuneDevicesPage
├── Header card (gradient top bar + icon + title + refresh)
├── 5 KPI stat cards (colored accent bars + trend indicators)
├── Tab bar (Devices / Compliance / Security / Automation / Reports)
└── Tab content
     ├── DevicesTab — search, compliance filter, sortable table, device detail panel
     ├── ComplianceTab — breakdown bars + device list
     ├── AutomationTab — 5 rules with toggle, test run, expand details
     └── ReportsTab — KPI tiles + export button
```

### Automation Tab

Each automation rule card shows:
- Rule name + category badge
- Description
- Trigger chip (e.g., "Device becomes Non-Compliant")
- Action chips (e.g., "Create Jira ticket", "Send Slack alert")
- Toggle (enable/disable) with toast confirmation
- Last triggered timestamp + total run count
- Expand/collapse details
- Test Run button

All rules are in-memory (local state on this page). They share the same visual pattern as the main Automation Engine page but are scoped to the Intune context.

---

## Data Sources

| Page | API Call | Filter |
|---|---|---|
| Intune Devices | `api.fetchAllDevicesRaw({ source: 'intune', limit: 500 })` | Excludes macOS |

---

## Empty States

When Intune is not configured, the page shows:
> "No Intune devices found. Connect Microsoft Intune in Settings → Integrations to populate this view."

---

## Related Docs
- [Intune Integration Setup](../04-integrations/INTUNE.md)
- [ManageEngine Integration Setup](../04-integrations/MANAGEENGINE.md)
- [Automation Engine](AUTOMATION-ENGINE.md)
</content>
</invoke>