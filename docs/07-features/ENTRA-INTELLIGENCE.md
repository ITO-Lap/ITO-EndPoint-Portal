# Entra Intelligence Dashboard — Feature Guide

> **Location:** Endpoint Management → Entra Intelligence  
> **Audience:** Intune Admins · Helpdesk · Security Admins · SOC  
> **Data source:** Microsoft Graph API (live when Entra ID configured); demo data otherwise

---

## What It Does

The Entra Intelligence Dashboard brings Microsoft Entra ID and Intune data directly into ITO Endpoint. It provides a dark-themed enterprise view of your Windows/cross-platform fleet with:

- 13 KPI metric cards (devices, compliance, patches, users, security)
- Compliance trend chart (6 weeks)
- Device platform distribution
- Top compliance issues + recent alerts
- Risky users table (from Azure Identity Protection)
- Stale device table
- Relationship Explorer — User → Device → Group → Policy → App chain
- Helpdesk Quick Lookup
- AI Copilot panel

---

## Accessing It

Navigate to **Endpoint Management → Entra Intelligence** in the sidebar.

The page shows a status indicator:
- 🟢 **Live · Microsoft Graph** — credentials configured and API calls succeeding
- 🟡 **Demo data** — no credentials configured; showing synthetic example data

---

## Live Data vs Demo Mode

| Data Type | When Live | When Demo |
|---|---|---|
| Device inventory | Real Intune managed devices | 8 synthetic devices |
| Users | Real Entra directory users | 5 synthetic users |
| Risky users | Real Azure Identity Protection | Pre-set risk levels |
| Compliance | Computed from live devices | Hardcoded metrics |
| Blueprints / Groups | Demo only (Graph doesn't expose easily) | Mock data |
| Relationships | Demo only | Pre-built chains |

---

## Required Microsoft Graph Permissions

The following **Application** permissions must be granted to your app registration:

| Permission | Purpose | Status |
|---|---|---|
| `User.Read.All` | User directory sync | ✅ Used by existing Entra service |
| `AuditLog.Read.All` | Sign-in logs | ✅ Used by existing Entra service |
| `IdentityRiskyUser.Read.All` | Risky user detection | ✅ Fetched live |
| **`DeviceManagementManagedDevices.Read.All`** | **Intune device inventory** | ⚠️ **Add this** |
| `DeviceManagementConfiguration.Read.All` | Compliance policies | Optional |

**To add permissions:** Azure Portal → App registrations → your app → API permissions → Add a permission → Microsoft Graph → Application → search `DeviceManagement` → **Grant admin consent**.

---

## KPI Cards (13)

| Card | Color | Drill-down |
|---|---|---|
| Total Devices | Blue | All devices |
| Compliant Devices | Green | Compliant filter |
| Non-Compliant | Red | Non-Compliant filter |
| Inactive Devices | Amber | Devices not synced in 7+ days |
| Total Users | Purple | — |
| Total Groups | Indigo | — |
| Failed Policies | Red | — |
| App Install Failures | Orange | — |
| Missing Encryption | Red | BitLocker not enabled |
| Missing Defender | Red | Defender inactive |
| Pending Reboot | Amber | — |
| High Risk Users | Red | Identity Protection risky users |
| Open Tickets | Amber | — |

---

## Components

### Compliance Trend Chart
6-week stacked bar chart showing Compliant / Non-Compliant / Grace Period counts. Hover for exact numbers.

### Device Platform Distribution
Horizontal bar chart: Windows (65%) / iOS (17%) / Android (10%) / macOS (6%) / Linux (2%).

### Top Compliance Issues
Ranked list of compliance failures with severity badge and affected device count.

### Risky Users Table
Shows all users from Azure Identity Protection with:
- Risk level chip (High / Medium / Low)
- Risk factors (impossible travel, password spray, leaked creds)
- MFA status
- Last sign-in date

### Stale Devices Table
Devices not synced in 7+ days, sorted by days stale. Color-coded by age (amber → red).

### Device Inventory Table
Full resizable, sortable, searchable device table with:
- Device name, user, OS, OS version, ownership
- MDM source badge
- BitLocker encryption chip
- Compliance chip
- Days since last check-in (color-coded)

### Relationship Explorer
Select any user to see their full resource graph:
- **Devices** — compliance + OS
- **Groups** — Security / M365
- **Policies** — assigned compliance/config policies
- **Apps** — assigned applications
- **Tickets** — linked incidents
- **Issues** — open compliance failures

### Helpdesk Quick Lookup
Search any device or user. Shows:
- Device compliance state
- BitLocker + Defender status
- Last check-in
- Open issues
- Suggested action
- **Sync Device** button → `POST /api/entra/devices/:id/sync`
- **Run AI Diagnosis** button → `POST /api/entra/devices/:id/diagnose`
- **Create Ticket** button

### AI Copilot Panel
Chat panel with sample prompts. In demo mode, returns pre-built analytical responses. Intended for future connection to real AI backend.

---

## Backend API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/entra/overview` | 13 KPI metrics |
| GET | `/api/entra/devices` | Device inventory (filtered by `compliance`, `os`, `limit`) |
| GET | `/api/entra/users` | User directory (filtered by `riskLevel`) |
| GET | `/api/entra/groups` | Group list |
| GET | `/api/entra/relationships` | Resource relationships (by `userId`) |
| GET | `/api/entra/security` | Security metrics |
| POST | `/api/entra/devices/:id/sync` | Trigger MDM sync |
| POST | `/api/entra/devices/:id/diagnose` | Run device diagnosis |

---

## Files

| File | Purpose |
|---|---|
| `src/components/entra/EntraIntelligenceDashboard.tsx` | Main dashboard orchestrator |
| `src/data/entraData.ts` | Mock/demo data + all TypeScript types |
| `server/src/routes/entra.ts` | Express router |
| `server/src/services/entraIntelligence.ts` | Business logic + Graph API calls |
| `server/src/data/entra.ts` | Server-side mock data |

---

## Design

The dashboard uses a deliberately dark navy theme (`bg-[#0d1117]`) to visually distinguish it from the rest of the light-themed app — signalling "this is a Microsoft Entra/Intune section". Status chips use translucent colored backgrounds matching the existing platform badge system.

---

## Related Docs
- [Entra ID Integration Setup](../04-integrations/ENTRA.md) — credentials, permissions, Graph API
- [EDR Feature Guide](EDR.md) — detection & response design (companion module)
