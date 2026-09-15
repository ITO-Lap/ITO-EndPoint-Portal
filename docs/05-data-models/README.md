# Data Models

All TypeScript types are defined in two files:

| File | Scope |
|---|---|
| `src/types.ts` | Frontend types — used by React components, hooks, and API client |
| `server/src/types.ts` | Server types — used by route handlers and service functions |

The two type files are kept **in sync manually**. The `api/index.ts` file mirrors the server types as frontend interfaces and includes a mapping function (`apiDeviceToDeviceData`) to convert between them.

---

## Type hierarchy

```
Frontend types (src/types.ts)
├── DeviceData               ← device as displayed in the Dashboard
├── DeviceSummaryData        ← alias for DeviceData
├── SecurityProfile          ← embedded in DeviceData
├── SecurityEvent            ← part of SecurityProfile
├── ComplianceDetailRow      ← table row in ComplianceDetails component
├── RunbookData              ← runbook card data
├── ComplianceSegment        ← donut chart segment
├── IssueCategory            ← bar chart category
├── ActivityItem             ← recent activity feed item
├── StatCardData             ← stat card display data
├── NotificationItem         ← notification badge item
├── ConnectedSource          ← sidebar source chip
├── NavItem                  ← sidebar navigation item
├── AppUser                  ← user record in UsersPage
├── UserDeviceRef            ← device reference on a user record
├── UserActivityEvent        ← user activity timeline item
├── UserSource               ← source where user record came from
├── JiraTicket               ← Jira ticket on user record
├── ToastItem                ← toast notification
├── BadgeVariant             ← badge colour union
├── UserToolRole             ← 'Global Admin' | 'IT Admin' | 'Helpdesk' | 'End User'
├── UserStatus               ← 'Active' | 'Inactive' | 'Suspended'
└── UserRiskLevel            ← 'Low' | 'Medium' | 'High' | 'Critical'

API types (src/api/index.ts) — mirror of server types
├── ApiStats                 ← response from GET /api/devices/stats
├── ApiDevice                ← response from GET /api/devices
├── ApiNotification          ← response from GET /api/notifications
├── AppStatus                ← app install record on a device
├── LapsInfo                 ← LAPS password info on a device
├── IntegrationStatusItem    ← response from GET /api/integrations/status
└── IntegrationSyncResult    ← response from POST /api/integrations/:id/sync

Server types (server/src/types.ts)
└── Device                   ← normalised device record from any MDM source
```

---

## Further reading

- [Types Reference](TYPES-REFERENCE.md) — full shape of every type with field descriptions
