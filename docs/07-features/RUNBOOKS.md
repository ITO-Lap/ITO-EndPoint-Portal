# Runbooks Feature

Runbooks are step-by-step remediation playbooks for common compliance issues. They guide IT admins through fixing device problems consistently and repeatably.

---

## What a runbook contains

```ts
interface RunbookData {
  runbookName: string    // "Enable BitLocker and Sync Device"
  runbookLink: string    // Display label for the link
  steps: string[]        // Ordered remediation steps
  escalation: string     // "Yes" | "No" — whether this needs escalation
  automation: string     // "Yes (Intune)" | "Partial (ManageEngine)" | "N/A"
}
```

---

## Built-in runbooks

| Runbook | Platform | Issue |
|---|---|---|
| Enable BitLocker and Sync Device | Windows | BitLocker encryption off |
| Enable FileVault on macOS | macOS | FileVault off or pending |
| Force OS Update via Intune | Windows | OS version out of compliance |
| No Action Required | Any | Device is compliant |

---

## Where runbooks appear

### 1. Dashboard — Runbook Card

The dashboard automatically selects the appropriate runbook for the currently selected device via `getRunbookForDevice()` in `src/data/dashboardData.ts`.

Selection logic:
```
if device.complianceState === 'Compliant'
  → "No Action Required"
else if device.platform === 'macOS'
  → "Enable FileVault on macOS"
else if device.recommendedRunbook === 'Force OS Update via Intune'
  → "Force OS Update via Intune"
else
  → "Enable BitLocker and Sync Device"
```

### 2. Runbooks Page

A dedicated library page (currently a placeholder) that will show all available runbooks as cards. Accessible from the sidebar.

### 3. AI Analysis

When `POST /api/ai/analyze` runs, the AI response includes a `suggestedRunbook` field — the name of the runbook it recommends for the device's issue.

---

## Components

| Component | File | Role |
|---|---|---|
| RunbookCard | `src/components/runbooks/RunbookCard.tsx` | Card display on Dashboard |
| RunbookModal | `src/components/runbooks/RunbookModal.tsx` | Full step list modal |

---

## Adding a new runbook

### To the Dashboard

1. Add a runbook object to `src/data/dashboardData.ts`
2. Update the `getRunbookForDevice()` function to return it for the relevant device condition

### To the Runbook library (server)

1. Add to `server/src/data/mockRunbooks.ts`
2. The `GET /api/runbooks` endpoint returns all runbooks

---

## Runbook automation status

The `automation` field indicates what level of automation is possible:

| Value | Meaning |
|---|---|
| `"Yes (Intune)"` | Can be fully automated via Intune policy push |
| `"Yes (ManageEngine)"` | Can be automated via a ManageEngine configuration profile |
| `"Partial (ManageEngine)"` | Partially automated; some manual steps required |
| `"N/A"` | No automation available — manual execution only |

---

## Future: Runbook execution

The current implementation is **display-only** — runbooks show steps but do not execute them. Future phases planned:

1. **Intune Policy Push** — automatically push a compliance policy to a device via Graph API
2. **Script execution** — send a PowerShell/shell script to a device via the MDM
3. **Approval workflow** — require a second admin to approve before execution
4. **Execution log** — record every runbook run in the Activity Log
