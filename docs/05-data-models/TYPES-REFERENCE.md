# Types Reference

Complete field-by-field reference for every TypeScript type.

---

## `DeviceData` (`src/types.ts`)

The primary device model used throughout the frontend.

```ts
interface DeviceData {
  deviceName: string          // e.g. "LAPTOP-8F7G2Q1"
  user: string                // e.g. "john.doe@company.com"
  serialNumber: string        // e.g. "PF2X3B7"
  platform: string            // "Windows" | "macOS" | "Linux"
  osVersion: string           // e.g. "Windows 11 Pro 23H2"
  managementSource: string    // "Microsoft Intune" | "ManageEngine"
  lastCheckIn: string         // human-readable date string
  complianceState: 'Compliant' | 'Warning' | 'Non-Compliant'
  encryptionStatus: string    // "BitLocker On" | "BitLocker Off" | "FileVault On" | ...
  primaryIssue: string        // human-readable issue description or "None"
  policyFailed: string        // policy name that failed or "None"
  severity: 'Low' | 'Medium' | 'High'
  confidence: string          // e.g. "85%"
  firstDetected: string       // human-readable date or "N/A"
  lastDetected: string        // human-readable date or "N/A"
  issueSource: string         // which MDM source detected the issue
  recommendedRunbook: string  // runbook name or "None"
  nextSteps: string[]         // ordered remediation steps
  issueCategory: string       // e.g. "BitLocker / Encryption"
  hasOpenIssue: boolean
  badgeState?: string         // override for the compliance badge text
  security?: SecurityProfile  // optional extended security data
}
```

---

## `SecurityProfile` (`src/types.ts`)

Optional security enrichment embedded in `DeviceData`.

```ts
interface SecurityProfile {
  riskScore: number                           // 0–100
  riskLevel: 'Critical' | 'High' | 'Medium' | 'Low'
  edrStatus: 'Active' | 'Inactive' | 'Not Installed'
  edrProduct: string                          // "Microsoft Defender for Endpoint" | "CrowdStrike Falcon"
  firewallEnabled: boolean
  vpnCompliant: boolean
  missingPatches: number
  lastSecurityScan: string
  vulnerabilities: {
    critical: number
    high: number
    medium: number
    low: number
  }
  unauthorizedApps: string[]
  recentEvents: SecurityEvent[]
}

interface SecurityEvent {
  time: string
  type: 'Critical' | 'Alert' | 'Warning' | 'Info'
  description: string
}
```

---

## `RunbookData` (`src/types.ts`)

A runbook to display in `RunbookCard` and `RunbookModal`.

```ts
interface RunbookData {
  runbookName: string    // "Enable BitLocker and Sync Device"
  runbookLink: string    // "View steps in runbook" (display label)
  steps: string[]        // ordered remediation steps
  escalation: string     // "Yes" | "No"
  automation: string     // "Yes (Intune)" | "Partial (ManageEngine)" | "N/A"
}
```

---

## `AppUser` (`src/types.ts`)

Full user record used in the Users page.

```ts
interface AppUser {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  title: string
  department: string
  location: string
  timezone: string
  toolRole: UserToolRole        // 'Global Admin' | 'IT Admin' | 'Helpdesk' | 'End User'
  status: UserStatus            // 'Active' | 'Inactive' | 'Suspended'
  mfaEnabled: boolean
  lastActive: string
  lastLogin: string
  loginLocation: string
  createdAt: string
  riskLevel: UserRiskLevel      // 'Low' | 'Medium' | 'High' | 'Critical'
  assignedDevices: UserDeviceRef[]
  recentActivity: UserActivityEvent[]
  sources: UserSource[]
  jiraTickets: JiraTicket[]
}
```

---

## `ApiDevice` (`src/api/index.ts`)

Server response shape from `GET /api/devices`. A superset of `DeviceData` with raw hardware/network fields.

```ts
interface ApiDevice {
  id: string
  deviceName: string
  user: string
  serialNumber: string
  platform: 'Windows' | 'macOS' | 'Linux'
  osVersion: string
  managementSource: 'Microsoft Intune' | 'ManageEngine'
  lastCheckIn: string
  complianceState: 'Compliant' | 'Warning' | 'Non-Compliant'
  encryptionStatus: string
  primaryIssue: string
  policyFailed: string
  severity: 'Low' | 'Medium' | 'High' | 'Critical'  // Critical only in server type
  confidence: string
  firstDetected: string
  lastDetected: string
  issueSource: string

  // Hardware (optional)
  manufacturer?: string
  model?: string
  totalStorage?: string
  freeStorage?: string
  totalMemory?: string
  processor?: string
  architecture?: string

  // Network (optional)
  ipAddress?: string
  macAddress?: string
  wifiMacAddress?: string

  // Enrollment & Identity (optional)
  enrollmentDate?: string
  enrollmentType?: string
  ownership?: 'Corporate' | 'Personal'
  isAadRegistered?: boolean
  department?: string

  // OS (optional)
  osBuildNumber?: string

  // Security (optional)
  firewallStatus?: string
  antivirusStatus?: string
  secureBoot?: string
  tpmVersion?: string

  // Compliance (optional)
  lastComplianceCheck?: string
  appliedPolicies?: string[]

  // Applications (optional)
  apps?: AppStatus[]

  // LAPS (optional)
  laps?: LapsInfo
}
```

---

## `ApiStats` (`src/api/index.ts`)

Response from `GET /api/devices/stats`.

```ts
interface ApiStats {
  total: number
  compliant: number
  nonCompliant: number
  warning: number
  windows: number
  mac: number
  sources: {
    intune: number
    manageEngine: number
  }
  mock: boolean     // true when returning mock data (no MDM configured)
}
```

---

## `StatCardData` (`src/types.ts`)

Configuration for a stat card widget.

```ts
interface StatCardData {
  title: string         // "Total Devices"
  value: string         // "12,842"
  trend: string         // "↑ 5.6%"
  trendChange: string   // "vs last 7 days"
  icon: LucideIcon
  accent: string        // Tailwind color class e.g. "text-sky-700"
  iconBg: string        // "bg-sky-100"
  iconText: string      // "text-sky-600"
}
```

---

## `ComplianceSegment` (`src/types.ts`)

One segment in the donut chart.

```ts
interface ComplianceSegment {
  label: string    // "Compliant"
  value: number    // raw count
  percent: string  // "84.4%"
  color: string    // hex color e.g. "#22c55e"
}
```

---

## `IssueCategory` (`src/types.ts`)

One bar in the issue category breakdown.

```ts
interface IssueCategory {
  label: string   // "BitLocker / Encryption"
  value: number   // count of devices with this issue
  color: string   // hex color
}
```

---

## `ActivityItem` (`src/types.ts`)

One row in the recent activity feed.

```ts
interface ActivityItem {
  device: string                              // device name
  status: 'Compliant' | 'Warning' | 'Non-Compliant'
  message: string                             // short description
  time: string                                // "9:15 AM" or "Yesterday"
  color: 'green' | 'yellow' | 'red'          // status dot color
}
```

---

## `IntegrationStatusItem` (`src/api/index.ts`)

Response from `GET /api/integrations/status` (one per source).

```ts
interface IntegrationStatusItem {
  id: string                 // "intune" | "manageengine" | "openai"
  name: string               // "Microsoft Intune"
  configured: boolean
  deviceCount: number | null // null if never synced
  lastSyncAt: string | null  // ISO timestamp or null
  latencyMs: number | null
  error: string | null       // error message from last sync attempt
  healthy: boolean | null    // null = never tested
}
```

---

## Severity vs RiskLevel

Two separate scales are used:

| Type | Values | Used in |
|---|---|---|
| `DeviceData.severity` | `'Low' \| 'Medium' \| 'High'` | Compliance issue severity |
| `SecurityProfile.riskLevel` | `'Low' \| 'Medium' \| 'High' \| 'Critical'` | Overall device security risk |
| `ApiDevice.severity` | `'Low' \| 'Medium' \| 'High' \| 'Critical'` | Server-side (Critical mapped to High on frontend) |

The mapping in `apiDeviceToDeviceData()`: `severity === 'Critical' ? 'High' : severity`.
