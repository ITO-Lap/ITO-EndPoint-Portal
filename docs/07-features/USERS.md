# Users Feature

The Users page provides a full directory of user accounts with compliance risk scoring, device associations, and activity history.

---

## Access control

Only **Global Admins** can access the Users page. IT Admins and Helpdesk users do not see "Users" in the sidebar.

---

## What it shows

### User list

- Name, email, job title, department
- Role badge (`Global Admin`, `IT Admin`, `Helpdesk`, `End User`)
- Status badge (`Active`, `Inactive`, `Suspended`)
- Risk level badge (`Low`, `Medium`, `High`, `Critical`)
- MFA status
- Last active timestamp
- Number of assigned devices

### Search & filter

- Search by name or email
- Filter by role
- Filter by status
- Filter by risk level

---

## User detail drawer

Click any user to open a side drawer with full detail:

| Section | Content |
|---|---|
| **Identity** | Photo placeholder, full name, title, department, location, timezone |
| **Account** | Email, phone, role, status, MFA, created date |
| **Devices** | All devices assigned to this user with compliance state and risk score |
| **Activity** | Timeline of recent events (logins, MFA events, device syncs, role changes, alerts) |
| **Sources** | Directories and MDM systems where this user record originates |
| **Jira Tickets** | Open/recent Jira issues associated with this user |

---

## Data source

User data comes from `src/data/usersData.ts` (mock data). In production, this would be fetched from:
- Microsoft Entra ID (Azure AD) via Graph API
- Your HR system / identity provider
- MDM device ownership records

---

## Risk level calculation

The `riskLevel` on a user is derived from their devices' compliance states and security profiles:

| Condition | Risk Level |
|---|---|
| All devices compliant, no security issues | Low |
| Any device in Warning state | Medium |
| Any device non-compliant | High |
| Critical device security events | Critical |

In the current mock data, risk levels are set statically. In production, calculate dynamically from device data.

---

## Key files

| File | Role |
|---|---|
| `src/pages/UsersPage.tsx` | Page root with list + drawer |
| `src/data/usersData.ts` | Mock user records |
| `src/types.ts` | `AppUser`, `UserDeviceRef`, `UserActivityEvent`, `UserSource`, `JiraTicket` types |

---

## Extending the Users feature

### Add a field to user records

1. Add to `AppUser` in `src/types.ts`
2. Update `src/data/usersData.ts` mock data
3. Render in `UsersPage.tsx` drawer

### Connect to a real user directory

1. Create `server/src/routes/users.ts`
2. Call Microsoft Graph `/users` endpoint (similar to devices)
3. Map to `AppUser` shape
4. Add `GET /api/users` to `server/src/index.ts`
5. Create `src/hooks/useUsers.ts` to fetch from `GET /api/users`
6. Replace mock data in `UsersPage.tsx` with the hook
