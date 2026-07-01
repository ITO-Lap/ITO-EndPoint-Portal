# Platform-Specific Endpoint Pages — Feature Guide

> **Location:** Endpoint Management → Intune Devices / Windows Devices / ManageEngine Devices  
> **Audience:** IT Admins · Endpoint Engineers · Helpdesk  
> **Data source:** Live MDM APIs when configured; empty state with connect prompt otherwise

---

## Overview

Three dedicated platform pages give each MDM source its own focused workspace with platform-specific KPIs, device tables, automation rules, and reports.

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

## Windows Devices Page

**Route:** `Windows Devices` | **File:** `src/pages/WindowsDevicesPage.tsx`

Shows all Windows devices across ALL MDM sources (Intune + ManageEngine combined).

### KPI Cards (5)
| Card | Color | Description |
|---|---|---|
| Total Windows | Blue `#0078D4` | All Windows devices regardless of MDM |
| Compliant | Green | Passed all policies |
| Non-Compliant | Red | Failed one or more policies |
| BitLocker On | Green `#7FBA00` | Disk encryption enabled |
| MDM Sources | Gold `#FFB900` | Number of connected MDM sources |

### Tabs
| Tab | Content |
|---|---|
| Devices | Filterable by source (Intune / ManageEngine), sortable table |
| Patch Status | 4-tier patch age distribution (Up to date / Slightly behind / At risk / Critical) |
| Security | Same as Patch Status |
| Automation | 5 Windows-specific rules |
| Reports | CSV export |

### Windows Automation Rules (5)
1. **Critical Patch Auto-Push** — deploys critical updates within 4h of release
2. **BitLocker Recovery Key Escrow** — ensures keys are escrowed to Intune on new enrollment
3. **Stale Patch Alert — 30 Day** — Jira task for devices not patched in 30 days
4. **Defender Real-time Off Alert** — urgent Slack alert when Defender RTP disabled
5. **Monthly Patch Summary Report** — generates and delivers monthly patch summary

---

## ManageEngine Devices Page

**Route:** `ManageEngine Devices` | **File:** `src/pages/ManageEngineDevicesPage.tsx`

### KPI Cards (5)
| Card | Color | Description |
|---|---|---|
| Total Managed | Orange `#FF6B35` | All ManageEngine-managed devices |
| Compliant | Green | Passed compliance checks |
| Non-Compliant | Red | Failed checks |
| Windows | Blue `#0078D4` | Windows device count |
| Linux | Gold | Linux device count |

### Tabs
| Tab | Content |
|---|---|
| Devices | Cross-platform table (Windows + Linux + macOS) |
| Patch Status | 4-tier distribution: Fully Patched / Available / Critical Missing / Severely Behind |
| Software | Same as Patch Status (software focus) |
| Automation | 5 ManageEngine-specific rules |
| Reports | Export |

### ManageEngine Automation Rules (5)
1. **Missing Critical Patches Alert** — Jira task when > 3 critical patches missing
2. **Auto-Deploy Security Patches** — deploys approved security patches within 24h
3. **Unauthorized Software Alert** — detects and alerts on blacklisted software
4. **Offline Device Check-in** — notification if device not scanned in 7 days
5. **Weekly Patch Report** — delivers weekly patch summary to stakeholders

---

## Shared Architecture

All three pages follow the same pattern:

```
PlatformPage
├── Header card (gradient top bar + icon + title + refresh)
├── 5 KPI stat cards (colored accent bars + trend indicators)
├── Tab bar (Devices / Compliance|Patch / Security / Automation / Reports)
└── Tab content
     ├── DevicesTab — search, compliance filter, sortable table, device detail panel
     ├── ComplianceTab or PatchTab — breakdown bars + device list
     ├── AutomationTab — 5 rules with toggle, test run, expand details
     └── ReportsTab — KPI tiles + export button
```

### Automation Tab (shared across all 3 pages)

Each automation rule card shows:
- Rule name + category badge
- Description
- Trigger chip (e.g., "Device becomes Non-Compliant")
- Action chips (e.g., "Create Jira ticket", "Send Slack alert")
- Toggle (enable/disable) with toast confirmation
- Last triggered timestamp + total run count
- Expand/collapse details
- Test Run button

All rules are in-memory (local state per page). They share the same visual pattern as the main Automation Engine page but are scoped to the platform context.

---

## Data Sources

| Page | API Call | Filter |
|---|---|---|
| Intune Devices | `api.fetchAllDevicesRaw({ source: 'intune', limit: 500 })` | Excludes macOS |
| Windows Devices | `api.fetchAllDevicesRaw({ platform: 'Windows', limit: 500 })` | All Windows |
| ManageEngine Devices | `api.fetchAllDevicesRaw({ source: 'manageengine', limit: 500 })` | All ME-managed |

---

## Empty States

When no MDM is configured, each page shows:
> "No [platform] devices found. Connect [MDM name] in Settings → Integrations to populate this view."

---

## Related Docs
- [Intune Integration Setup](../04-integrations/INTUNE.md)
- [ManageEngine Integration Setup](../04-integrations/MANAGEENGINE.md)
- [Automation Engine](AUTOMATION-ENGINE.md)
</content>
</invoke>