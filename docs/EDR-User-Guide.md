Detection & Response (EDR) — User Guide

> **Document type:** UX Design Reference · Quick-View Guide  
> **Product:** iru Security Platform  
> **Module:** Detection & Response  
> **Version:** 1.0  
> **Last updated:** 2026-06-01  
> **Status:** Design Approved — Ready for Implementation

---

## Table of Contents

1. [Overview & Purpose](#1-overview--purpose)
2. [Navigation Architecture](#2-navigation-architecture)
3. [Information Architecture](#3-information-architecture)
4. [Page Reference — Quick View](#4-page-reference--quick-view)
   - 4.1 [EDR Overview Dashboard](#41-edr-overview-dashboard)
   - 4.2 [Detections](#42-detections-page)
   - 4.3 [Incidents](#43-incidents-page)
   - 4.4 [Investigation View](#44-investigation-view)
   - 4.5 [Response Center](#45-response-center)
   - 4.6 [Device Detail Integration](#46-device-detail-integration)
   - 4.7 [Threats Page Integration](#47-threats-page-integration)
5. [Popup Reference — All Row-Click Popups](#5-popup-reference)
6. [User Flow — End-to-End](#6-user-flow--end-to-end)
7. [Design Patterns & Rules](#7-design-patterns--rules)
8. [Component Specifications](#8-component-specifications)
9. [Terminology Glossary](#9-terminology-glossary)
10. [Changelog](#10-changelog)

---

## 1. Overview & Purpose

### What Is This Module?

The **Detection & Response** module introduces a complete Endpoint Detection & Response (EDR) capability into the iru platform. It provides SOC analysts with a dedicated workspace for:

- Monitoring live threat detections in real time
- Managing security incidents across multiple endpoints
- Conducting forensic investigations with timeline and process analysis
- Executing containment and remediation response actions

### What It Is NOT

| ❌ Does Not Replace | ✅ Complements Instead |
|---|---|
| Threats page (malware catalog) | Adds contextual escalation links to Threats |
| Vulnerabilities page (CVE tracking) | Separate concern — stays unchanged |
| Automation page (rule-based remediation) | Response Center is action execution, not rule configuration |

### Design Philosophy

> "Give SOC analysts their own workflow entry point that doesn't conflict with how IT admins use the product today."

- Every table row opens a **read-only popup** with a single `[✕ Close]` action
- Navigation is additive — existing pages are minimally modified
- SOC role and IT Admin role never share the same primary workflow path

---

## 2. Navigation Architecture

### Decision: Modified Option B — Dedicated Navigation Group

A new **Detection & Response** group is injected into the left sidebar directly below the existing Endpoint group.

**Why this placement:**

| Option | Decision | Reason |
|---|---|---|
| Option A: Under Endpoint | ❌ Rejected | Makes Endpoint group too broad; mixes device management and active response |
| Option B: Separate group | ✅ Selected | Clean role separation; SOC analysts get dedicated entry |
| Option C: Expand Threats | ❌ Rejected | Destructive to existing user workflows; Threats is a read-only intelligence feed |

### Full Left Navigation Structure

```
iru 🤖
├── 🏠 Home
│
├── ▼ Endpoint
│     Devices
│     Enrollment
│     Blueprints
│     Library
│     Users
│     Threats          ← unchanged; gains 3 inline contextual links per row
│     Vulnerabilities
│
├── ▼ Detection & Response     ← NEW GROUP
│     EDR Overview             badge: active incident count
│     Detections               badge: active detection count
│     Incidents                badge: critical count (red dot)
│     Response Center
│
├── 🔐 Identity
│     Directory
│     Applications
│     Authenticators
│
├── Policies
├── Activity
│
├── ▼ Compliance
│     Actions
│     Frameworks
│     Artifacts
│     Sources
│
└── Trust Center
```

### Sidebar Visual Spec

| Element | Specification |
|---|---|
| Group header color | Same purple `#7C5CFC` as existing nav accent |
| Badge on EDR Overview | Gray pill, white count number |
| Badge on Incidents | Red dot `#EF4444` — signals urgency |
| Active nav item | Purple left border + light purple background (matching existing pattern) |
| Group label | 11px uppercase, gray `#6B7280`, same as existing section labels |

---

## 3. Information Architecture

### Complete Page Hierarchy

```
Detection & Response
│
├── EDR Overview (Dashboard)
│   ├── 6 KPI summary cards
│   ├── Detection Trend chart (line)
│   ├── Incident Severity Distribution chart (donut)
│   ├── MITRE ATT&CK Coverage heatmap
│   └── Response Actions Over Time chart (stacked bar)
│
├── Detections
│   ├── Sub-tabs: Detections | Rules
│   ├── 3 summary cards
│   ├── Filter bar
│   ├── Detection table (row-click → popup)
│   └── → POPUP: Detection Detail [✕ close only]
│
├── Incidents
│   ├── Sub-tabs: Incidents | Detections
│   ├── 3 summary cards
│   ├── Filter bar
│   ├── Incidents table (row-click → popup)
│   └── → POPUP: Incident Detail [✕ close only]
│         └── text link → Investigation View (full page)
│               ├── Event Timeline panel (event-click → popup)
│               │     └── → POPUP: Timeline Event Detail [✕ close only]
│               ├── Process Tree panel (node-click → popup)
│               │     └── → POPUP: Process Node Detail [✕ close only]
│               ├── Device Context panel (read-only)
│               └── Threat Intelligence panel (read-only)
│
└── Response Center
    ├── Active Response Actions table (row-click → popup)
    │     └── → POPUP: Response Action Detail [✕ close only]
    ├── [+ Manual Action] → Response Action Palette (slide-in panel)
    └── Response History table (row-click → popup)
          └── → POPUP: Response Action Detail [✕ close only]

[Integration — existing pages]
├── Threats page → 3 inline contextual buttons per row (on row hover)
└── Device Detail → 4 new tabs appended to existing tab row
      Detections | Incidents | Timeline | Response Actions
```

### Separation of Concerns

| Feature | Page | Audience | Purpose |
|---|---|---|---|
| Malware catalog, threat rules | Threats (existing) | Security Engineers | Passive intelligence feed |
| CVE tracking | Vulnerabilities (existing) | Security Engineers | Vulnerability lifecycle |
| Real-time detection stream | EDR → Detections | SOC Analysts | Triage queue |
| Incident case management | EDR → Incidents | SOC Analysts | Multi-device case lifecycle |
| Forensic root-cause analysis | EDR → Investigation | SOC Analysts | Deep forensic workspace |
| Containment execution + audit | EDR → Response Center | SOC Analysts | Action execution + history |

---

## 4. Page Reference — Quick View

---

### 4.1 EDR Overview Dashboard

**Navigation path:** Detection & Response → EDR Overview

**Purpose:** At-a-glance operational status for the SOC team.

#### Layout

```
[Page title: EDR Overview]           [Time range selector]  [Refresh]
─────────────────────────────────────────────────────────────────────

ROW 1 — Six KPI Cards (equal-width grid, 2 columns on medium, 3 on large)

┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
│ Active Incidents   │ │ Endpoints Under   │ │ Active Detections  │
│       12          │ │  Investigation    │ │        47         │
│  ▲ 3 new today    │ │        8          │ │   ▲ 11 today      │
└───────────────────┘ └───────────────────┘ └───────────────────┘

┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
│ Isolated Devices   │ │ Automated Resp.   │ │ MTTR              │
│        3          │ │    Executed       │ │   14m 22s         │
│  All quarantined  │ │       29          │ │  ▼ 3m vs last wk  │
└───────────────────┘ └───────────────────┘ └───────────────────┘

ROW 2 — Two charts, side by side

┌────────────────────────────┐  ┌────────────────────────────┐
│ Detection Trends [7d][24h] │  │ Incident Severity Dist.    │
│ Line chart, multi-series   │  │ Donut chart + legend        │
└────────────────────────────┘  └────────────────────────────┘

ROW 3 — Two charts, side by side

┌────────────────────────────┐  ┌────────────────────────────┐
│ MITRE ATT&CK Coverage      │  │ Response Actions Over Time │
│ Heatmap grid (tactics)     │  │ Stacked bar chart [7d ▾]   │
└────────────────────────────┘  └────────────────────────────┘
```

#### KPI Card Behavior

| Card | Click Destination |
|---|---|
| Active Incidents | Incidents page |
| Endpoints Under Investigation | Incidents page, filtered to Investigating |
| Active Detections | Detections page |
| Isolated Devices | Response Center, filtered to Isolate actions |
| Automated Responses | Response Center, filtered to Automated |
| MTTR | Response Center, history view |

#### Chart Details

| Chart | Type | Data |
|---|---|---|
| Detection Trends | Line, multi-series | Critical / High / Medium by time bucket |
| Incident Severity Distribution | Donut | Total incidents by severity (Critical/High/Medium/Low) |
| MITRE ATT&CK Coverage | Heatmap grid | Detected vs. uncovered tactics |
| Response Actions Over Time | Stacked bar | Isolate / Kill / Quarantine / Block / Restore per day |

---

### 4.2 Detections Page

**Navigation path:** Detection & Response → Detections

**Purpose:** Real-time operational queue of all endpoint detections for analyst triage.

#### Sub-tabs

```
Detections   Rules
──────────
```

`Rules` tab: links to the detection rule configuration (separate concern — existing functionality or future phase).

#### Summary Cards (above filter bar)

| Card | Value |
|---|---|
| Active Detections | Count of non-resolved detections |
| Critical + High | Count by severity |
| Unreviewed | Status = New |

#### Filter Bar

| Filter | Type | Options |
|---|---|---|
| Search | Text input | Searches Detection ID, name, endpoint, user |
| Severity | Dropdown multi-select | Critical, High, Medium, Low |
| MITRE Technique | Dropdown searchable | All T-codes |
| Device | Dropdown searchable | All enrolled devices |
| User | Dropdown searchable | All directory users |
| Detection Type | Dropdown | File Detection, Behavioral, Network |
| Time Range | Dropdown | Last 1h, 6h, 24h, 7d, 30d, Custom |
| Clear all | Text link | Resets all filters |

Toggles on right: `File Detections` / `Behavioral Detections` — matches existing Threats page pattern.

#### Table Columns

| Column | Notes |
|---|---|
| ☐ | Checkbox (bulk actions) |
| Detection ID | Alphanumeric hash, monospace, matching Threat ID format |
| Detection Name | Human-readable name of the detection |
| Endpoint | Hostname of affected device |
| User | Logged-in user at time of detection |
| Technique | MITRE code + name (e.g., T1003 – OS Cred.) |
| Severity | Segmented bar (8 segments, red→amber→yellow) |
| Timestamp | Date + time, matching Threats date format |
| Status | Chip: New (green), Active (orange), Reviewing (blue), Resolved (gray) |

**Default sort:** Timestamp descending (newest first)  
**Default page size:** 50 (matching platform default)  
**Row interaction:** Click anywhere on row → Detection Detail Popup  
**Row hover:** Light purple background `#F5F3FF`  

#### Row Popup Trigger

Every row click → **Detection Detail Popup** (see Section 5.1)

---

### 4.3 Incidents Page

**Navigation path:** Detection & Response → Incidents

**Purpose:** Security incident case management — creation, assignment, tracking, and escalation.

#### Sub-tabs

```
Incidents   Detections
─────────
```

`Detections` sub-tab: filtered view of all detections linked to incidents on this page.

#### Summary Cards (above filter bar)

| Card | Value |
|---|---|
| Active Incidents | Total non-closed incidents |
| Critical | Count of Critical severity incidents |
| Unassigned | Incidents with no owner assigned |

#### Filter Bar

| Filter | Type | Options |
|---|---|---|
| Search | Text input | Incident ID, title, device, analyst |
| Severity | Dropdown | Critical, High, Medium, Low |
| Status | Dropdown | New, Investigating, Pending, Resolved, Closed |
| Owner | Dropdown searchable | All analysts |
| Time Range | Dropdown | Last 24h, 7d, 30d, Custom |
| Clear all | Text link | |

#### Table Columns

| Column | Notes |
|---|---|
| ☐ | Checkbox |
| Incident ID | Format: INC-NNN |
| Title | Human-readable incident title |
| Affected Devices | Count, shown as "N devices" |
| Affected Users | Count, shown as "N users" |
| Severity | Segmented bar (same pattern as Detections) |
| Status | Chip: New, Investigating, Pending, Resolved, Closed |
| Owner | Analyst name or "Unassigned" |
| Created | Relative time or date |
| Last Updated | Relative time |

**Default sort:** Last Updated descending  
**Row interaction:** Click anywhere → Incident Detail Popup  

#### Row Popup Trigger

Every row click → **Incident Detail Popup** (see Section 5.2)

---

### 4.4 Investigation View

**Navigation path:** Incident Detail Popup → "→ Open Full Investigation View" text link

**Purpose:** Full forensic workspace for deep-dive incident analysis. This is a full-page experience, not a popup.

#### Page Header

```
← Incidents    Investigation — INC-001           ● Investigating  ···
APT Lateral Movement Campaign · WIN-DESK-004, MAC-9C2K7L3, LAPTOP-8F7G2Q1
──────────────────────────────────────────────────────────────────────────
```

#### Three-Column Layout

```
┌─────────────────────────────────────┬──────────────────┬────────────────────┐
│ EVENT TIMELINE (wide)                │ DEVICE CONTEXT   │ THREAT INTELLIGENCE│
│                                      │ (narrow)         │ (narrow)           │
│ Filter chips: All Process File       │                  │                    │
│              Registry Network User  │ Scoped to each   │ File Hash rep.     │
│                                      │ affected device  │ IP rep.            │
│ Chronological event stream           │ (scroll/select)  │ Domain rep.        │
│ Each event: timestamp, type, detail  │                  │ Campaign attribution│
│ Click event row → popup             │ Shows: hostname,  │                    │
│                                      │ user, OS, risk   │                    │
│                                      │ score, last seen │                    │
└─────────────────────────────────────┴──────────────────┴────────────────────┘
```

#### Process Tree (full-width, below three-column section)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ PROCESS TREE — [Device selector ▾]                              [Export]        │
│                                                                                  │
│  Visual parent-child tree of all processes on the selected device               │
│  during the incident window.                                                     │
│                                                                                  │
│  Nodes color-coded: ● Critical (red) ● Suspicious (orange) ● Monitor (amber)   │
│  Click any node → Process Node Detail Popup                                     │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### Event Timeline — Event Types and Colors

| Event Type | Icon | Color |
|---|---|---|
| Process Execution | ⚙ | Red (Critical) / Orange (Suspicious) |
| File Activity | 📄 | Orange / Amber |
| Registry Change | 🔧 | Amber |
| Network Connection | 🌐 | Orange (suspicious) / Gray (normal) |
| User Action | 👤 | Red (unauthorized) / Gray (normal) |

#### Popup Triggers

| Element | Popup |
|---|---|
| Event row in timeline | Timeline Event Detail Popup (Section 5.4) |
| Node in Process Tree | Process Node Detail Popup (Section 5.5) |

---

### 4.5 Response Center

**Navigation path:** Detection & Response → Response Center

**Purpose:** Execute response actions and maintain full audit trail of all actions taken across the platform.

#### Page Sections

**Section 1: Active Response Actions** (top of page)

Live queue of in-progress and recently completed actions.

| Column | Notes |
|---|---|
| ☐ | Checkbox |
| Action | Action type (Isolate, Kill, Quarantine, Block, Restore, Disable) |
| Target | Device hostname, process name, file path, IP, or hash |
| Incident | Linked incident ID |
| Initiated | Analyst name or "Automated" + timestamp |
| Status | ✅ Complete, 🔄 Running, ⏳ Queued, ❌ Failed |

**Section 2: Response History** (below active queue)

Full historical log of all response actions, paginated.

Same columns as Active Actions, plus:
- `Result` column: Success / Failed — agent error / Failed — timeout / Reverted

**[+ Manual Action] Button:**
Opens a slide-in **Response Action Palette** panel (right side of screen):

```
┌──────────────────────────────────┐
│  RESPONSE ACTIONS          [✕]  │
│  Target [Select device/IP ▾]    │
│  Incident [Link to INC ▾]       │
│  ─────────────────────────────  │
│  ● Isolate Device                │
│  ● Kill Process                  │
│  ● Quarantine File               │
│  ● Block Hash                    │
│  ● Block IP Address              │
│  ● Disable User Session          │
│  ● Restore Device                │
│  [Select action to configure →]  │
└──────────────────────────────────┘
```

#### All Available Response Actions

| Action | Target | Effect | Reversible? |
|---|---|---|---|
| Isolate Device | Hostname | Cuts all network except EDR tunnel | Yes — Restore Device |
| Kill Process | PID or process name | Terminates the process | No |
| Quarantine File | File path or hash | Moves file to quarantine vault | Yes — manual restore |
| Block Hash | File hash | Blocks execution across all endpoints | Yes — unblock |
| Block IP Address | IP or CIDR | Blocks inbound/outbound to IP | Yes — unblock |
| Disable User Session | Username | Terminates active sessions | Yes — re-enable |
| Restore Device | Hostname | Lifts network isolation | N/A |

#### Row Popup Trigger

All rows (Active + History) → **Response Action Detail Popup** (Section 5.3)

---

### 4.6 Device Detail Integration

**Location:** Existing Device Detail page or drawer

**Change type:** Additive — four new tabs appended to the existing tab row.

#### Updated Tab Row

```
Overview   Apps   Security   Compliance   Detections   Incidents   Timeline   Response Actions
                                         ──────────────────────────────────────────────────
                                                    ← NEW TABS →
```

#### New Tab Contents

| Tab | Content | Row Click |
|---|---|---|
| Detections | Scoped detections for this device only. Same columns as Detections page minus "Endpoint" column | Detection Detail Popup |
| Incidents | Scoped incidents for this device only. Same columns as Incidents page | Incident Detail Popup |
| Timeline | Last 50 events for this device. Condensed timeline (same color coding as Investigation View) | Timeline Event Detail Popup |
| Response Actions | All response actions taken against this device. Same columns as Response Center history | Response Action Detail Popup |

**All row interactions → read-only popup with `[✕ Close]` only.**

---

### 4.7 Threats Page Integration

**Change type:** Minimal — three inline contextual links added per table row.

**No structural changes to the Threats page.** The page does not become an incident management tool.

#### Added to Each Threat Table Row (visible on row hover)

```
Create Incident   Open Investigation   Respond
```

| Button | Behavior | Design |
|---|---|---|
| Create Incident | Opens lightweight "New Incident" form pre-filled with threat data. On submit → navigates to new incident | Purple text link `#7C5CFC` |
| Open Investigation | Navigates to Investigation View scoped to this threat's device | Gray text link `#6B7280` |
| Respond | Opens Response Action Palette (slide-in panel) pre-filled with device | Orange text link `#D97706` |

**Visibility:** Only shown on row hover — maintains table density at rest.

---

## 5. Popup Reference

> **Global rule:** Every popup opened by clicking a table row has exactly ONE interactive control: `[✕ Close]`. No action buttons. No navigation. Read-only information display only.

---

### 5.1 Detection Detail Popup

**Triggered by:** Clicking any row in the Detections table (main page or Device Detail tab)

**Popup width:** 780px max, centered, dark overlay behind

#### Sections

| Section | Content |
|---|---|
| **Header** | Detection ID · Detection Name |
| **Detection Summary** | Status, Severity bar, Source, Detected date, Linked incident (or —), Tags |
| **Endpoint Context** | Hostname, Logged user, OS version, Risk score (bar), Last seen, Compliance status |
| **MITRE ATT&CK** | Tactic, Technique + T-code, Sub-technique, Human-readable description |
| **Detection Evidence** | Process name + PID, Parent process, Command line, File hash + reputation, User context, Network status |
| **Threat Intelligence** | File hash verdict, IP reputation, Domain reputation, Campaign attribution, First/last seen |

**Controls:** `[✕]` top-right icon · `[✕ Close]` bottom-right button (outlined secondary)

---

### 5.2 Incident Detail Popup

**Triggered by:** Clicking any row in the Incidents table (main page or Device Detail tab)

**Popup width:** 780px max, centered

#### Sections

| Section | Content |
|---|---|
| **Header** | Incident ID · Incident Title |
| **Incident Summary** | Status, Severity bar, Owner, Created date, Updated date, SLA timer |
| **Scope** | Affected device list, affected user list, linked detection IDs |
| **Description** | Free-text narrative of the incident |
| **Analyst Notes** | Chronological notes with timestamp and author. Read-only in popup |
| **Response Actions Taken** | List of executed actions with status, timestamp, executor |
| **Linked Items** | Detections, devices, runbooks linked to this incident |
| **Footer** | Text link: `→ Open Full Investigation View` (purple, navigates to Investigation page) |

**Controls:** `[✕]` top-right icon · `[✕ Close]` bottom-right button

> **Important:** "→ Open Full Investigation View" is a **text link**, not a button. It is the only navigation element in the popup. It closes the popup and opens the Investigation full page.

---

### 5.3 Response Action Detail Popup

**Triggered by:** Clicking any row in Response Center (Active or History table) or Device Detail → Response Actions tab

**Popup width:** 680px max, centered

#### Sections

| Section | Content |
|---|---|
| **Header** | Action type · Target |
| **Action Details** | Type, Target, Linked incident, Initiated by, Timestamp, Status, Duration |
| **Execution Log** | Step-by-step chronological log of agent communication |
| **Action Scope** | Specific details based on action type (e.g., isolation scope for Isolate Device) |

**Controls:** `[✕]` top-right icon · `[✕ Close]` bottom-right button

---

### 5.4 Timeline Event Detail Popup

**Triggered by:** Clicking any event row in the Investigation View Event Timeline panel

**Popup width:** 680px max, centered

#### Sections

| Section | Content |
|---|---|
| **Header** | Event type · Timestamp · Device |
| **Process Details** | Process name, PID, file path, user context, integrity level, code signing |
| **Parent Process** | Parent name, PID, path, integrity |
| **Command Line** | Full command string + behavioral note |
| **File Artifacts** | Files created/modified during event: path, size, hash, reputation |
| **Network** | Connections initiated (if any): destination IP, port, protocol, outcome |

**Controls:** `[✕]` top-right icon · `[✕ Close]` bottom-right button

---

### 5.5 Process Node Detail Popup

**Triggered by:** Clicking any node in the Investigation View Process Tree panel

**Popup width:** 640px max, centered

#### Sections

| Section | Content |
|---|---|
| **Header** | Process name · PID |
| **Process Details** | Full path, user, session ID, integrity level, signed status |
| **Parent Chain** | Ancestry from root process to this node |
| **Children** | List of spawned child processes (if any) |
| **Risk Assessment** | Why this node is flagged (red/orange/amber), MITRE mapping |
| **File Hash** | SHA-256, reputation from threat intel |

**Controls:** `[✕]` top-right icon · `[✕ Close]` bottom-right button

---

### Popup Quick-Reference Table

| Popup | Triggered From | Width | Navigation Link? |
|---|---|---|---|
| Detection Detail | Detections table row | 780px | None |
| Incident Detail | Incidents table row | 780px | → Investigation View (text link) |
| Response Action Detail | Response Center row | 680px | None |
| Timeline Event Detail | Investigation timeline row | 680px | None |
| Process Node Detail | Investigation process tree node | 640px | None |

---

## 6. User Flow — End-to-End

### Standard Detection → Resolution Flow

```
STAGE 1 — DETECTION
────────────────────
EDR agent detects threat on endpoint
  │
  ▼
Detection record auto-created (DET-NNN)
  │
  ▼
Appears in Detections table with status: New
  │
  ▼
[Analyst opens Detections page]
  │
  ▼
Analyst clicks detection row
  ▼
┌── Detection Detail Popup ─────────────────────┐
│  Evidence · MITRE · Endpoint · Threat Intel    │
│  [✕ Close] only                               │
└───────────────────────────────────────────────┘


STAGE 2 — INCIDENT CREATION
────────────────────────────
Analyst identifies pattern across multiple devices
  │
  ▼
Option A: Threats page → click "Create Incident" inline link on threat row
Option B: Incidents page → click [+ New Incident] → manual creation
  │
  ▼
Incident record created (INC-NNN), linked detections attached
  │
  ▼
Incident assigned to analyst → status: Investigating


STAGE 3 — INVESTIGATION
─────────────────────────
[Analyst opens Incidents page]
  │
  ▼
Analyst clicks incident row
  ▼
┌── Incident Detail Popup ──────────────────────┐
│  Summary · Scope · Notes · Actions taken      │
│  Linked items                                 │
│  → Open Full Investigation View (text link)   │
│  [✕ Close] only                              │
└───────────────────────────────────────────────┘
  │
  ▼ (clicks "→ Open Full Investigation View")
Investigation View opens (full page)
  │
  ▼
[Analyst reviews Event Timeline]
  │
  ▼
Analyst clicks suspicious event
  ▼
┌── Timeline Event Detail Popup ────────────────┐
│  Process · Command · File artifacts · Network  │
│  [✕ Close] only                              │
└───────────────────────────────────────────────┘
  │
  ▼
[Analyst reviews Process Tree]
  │
  ▼
Analyst clicks malicious node
  ▼
┌── Process Node Detail Popup ──────────────────┐
│  Process details · Parent chain · Risk reason  │
│  [✕ Close] only                              │
└───────────────────────────────────────────────┘
  │
  ▼
[Analyst reviews Device Context + Threat Intel panels]
Attribution confirmed. Scope understood.


STAGE 4 — RESPONSE
────────────────────
[Analyst navigates to Response Center]
  │
  ▼
Clicks [+ Manual Action]
Response Action Palette slides in
  │
  ▼
Selects: Isolate Device → Target: WIN-DESK-004 → Links INC-001 → Execute
  │
  ▼
Action runs (8 seconds) → appears in Active table as ✅ Complete
  │
  ▼
Analyst clicks completed row
  ▼
┌── Response Action Detail Popup ───────────────┐
│  Action details · Execution log · Scope        │
│  [✕ Close] only                              │
└───────────────────────────────────────────────┘
  │
  ▼
Additional actions executed as needed:
  Block Hash → Automated across all endpoints
  Kill Process → Targeted process
  Quarantine File → Malicious artifact


STAGE 5 — RESOLUTION
──────────────────────
Forensics complete. Remediation verified.
  │
  ▼
Response Center → Restore Device for isolated endpoint
  │
  ▼
Incidents page → INC-NNN → Popup → Add analyst note
Status updated: Resolved
  │
  ▼
Linked detections → all status: Resolved
EDR Overview MTTR metric automatically updated
  │
  ▼
Incident closed. Audit trail preserved in Response History.
```

---

## 7. Design Patterns & Rules

### Pattern 1 — Row Click → Popup Only

**Rule:** Every data table row in the EDR module opens a read-only popup. Navigation to a different page only happens via explicit links or buttons outside the popup.

**Rationale:** Analysts triaging 47+ detections must not lose their position in the queue when reviewing a single row's detail. Popup allows review and dismissal without losing scroll position or filter state.

### Pattern 2 — Single Close Action in Popups

**Rule:** Every popup contains exactly `[✕ Close]` as its only interactive control. No action buttons (Isolate, Escalate, Assign) appear inside popups.

**Rationale:** Separates information review from action execution. Reduces accidental actions when reading data. Response actions live exclusively in Response Center.

**Exception:** The Incident Detail Popup contains a **text link** `→ Open Full Investigation View`. This is a text link (not a button) and navigates to a new page — it is not an action that modifies data.

### Pattern 3 — Contextual Links, Not Full Integration

**Rule:** The existing Threats page gains only three hover-visible text links per row: `Create Incident | Open Investigation | Respond`. The Threats page does not gain charts, sub-tabs, or incident management UI.

**Rationale:** Preserve existing user mental model. Threats = intelligence feed. EDR = response workspace. The links are entry points into EDR — not EDR functionality embedded in Threats.

### Pattern 4 — Tab Appending in Device Detail

**Rule:** Four new tabs are appended to the right of the existing Device Detail tab row. No existing tabs are modified or removed.

**Rationale:** Additive changes preserve learned behavior. Existing users continue to navigate to Overview, Apps, Security, Compliance exactly as before.

### Pattern 5 — Badge Counts on Nav Items

**Rule:** Active incident count on `EDR Overview` nav item. Critical incident count with red dot on `Incidents` nav item.

**Rationale:** SOC analysts need to see operational urgency before opening any page. Badges match the platform's existing notification pattern without introducing new UI patterns.

---

## 8. Component Specifications

### Matching the iru Platform Design Language

All EDR components use the existing iru design system. No new design patterns are introduced.

#### Status Chips

| Status | Background | Text Color | Usage |
|---|---|---|---|
| New | `#D1FAE5` | `#065F46` | Fresh detection or incident, not yet reviewed |
| Active / Investigating | `#FEF3C7` | `#92400E` | Under active review |
| Reviewing | `#DBEAFE` | `#1E40AF` | Being assessed, not yet acted upon |
| Pending | `#F3E8FF` | `#6B21A8` | Waiting on action or external input |
| Resolved | `#F3F4F6` | `#374151` | Issue addressed, verified clean |
| Closed | `#F9FAFB` | `#9CA3AF` | Case closed, archived |

#### Severity Bars

Segmented bar with 8 segments. Same component as existing Threats page severity indicator.

| Severity | Segments filled | Color |
|---|---|---|
| Critical | 8/8 | Red `#DC2626` |
| High | 5/8 | Orange `#EA580C` |
| Medium | 3/8 | Amber `#D97706` |
| Low | 2/8 | Yellow `#CA8A04` |

#### Table Specifications

| Property | Value |
|---|---|
| Row height | 44px (matching existing Threats table) |
| Header height | 40px |
| Font size — data | 12px |
| Font size — header | 11px uppercase |
| Default page size | 50 results |
| Pagination | `|← ← N of N → →|` (matching existing) |
| Row hover | Background `#F5F3FF` (light purple, matching active nav accent) |
| Checkbox | Left column, bulk-selection |

#### Popup Specifications

| Property | Value |
|---|---|
| Overlay | `rgba(0,0,0,0.45)` |
| Modal background | `#FFFFFF` |
| Border radius | `8px` |
| Max width | 780px (detail) / 680px (action) / 640px (node) |
| Section header | `11px` uppercase, `#6B7280`, `letter-spacing: 0.08em` |
| Data labels | `12px`, `#6B7280` |
| Data values | `13px`, `#111827`, semi-bold |
| Close button (top-right) | `24×24px` icon button, no border, hover: `#F3F4F6` bg |
| Close button (bottom-right) | Outlined secondary: border `#D1D5DB`, text `#374151`, `6px` radius |

#### Navigation Badges

| Badge type | Style | Position |
|---|---|---|
| Count (incidents) | `12px` gray pill, white text | Right of nav label |
| Critical indicator | `8px` red dot `#EF4444` | Right of nav label |

---

## 9. Terminology Glossary

| Term | Definition |
|---|---|
| Detection | A single alert from an EDR agent or behavioral engine flagging suspicious activity on one endpoint |
| Incident | A grouped security case that may encompass multiple detections and multiple endpoints |
| Investigation | A forensic deep-dive into an incident's evidence: timeline, process tree, threat intel |
| Response Action | A containment or remediation command executed against an endpoint, process, file, IP, or user |
| MTTR | Mean Time To Respond — average time from detection creation to first response action |
| MITRE ATT&CK | A globally-accessible knowledge base of adversary tactics and techniques (mitre.org/attack) |
| Tactic | High-level adversary goal category (e.g., Credential Access, Lateral Movement) |
| Technique | Specific method used to achieve a tactic (e.g., T1003 – OS Credential Dumping) |
| IOC | Indicator of Compromise — file hash, IP, domain, or registry key linked to known malware |
| TTP | Tactics, Techniques, and Procedures — the behavioral fingerprint of a threat actor |
| Isolation | Network quarantine of a device — all connections cut except EDR management tunnel |
| APT | Advanced Persistent Threat — a sophisticated, targeted threat actor (state-sponsored or criminal) |
| EDR Agent | Lightweight software running on each managed endpoint that streams telemetry to the platform |
| SOC | Security Operations Center — the team responsible for monitoring and responding to threats |
| SLA | Service Level Agreement — the target response time for a given incident severity |
| Process Tree | Visual hierarchy of running processes showing parent-child relationships |

---

## 10. Changelog

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-06-01 | UX Design Team | Initial design and documentation — all 7 modules, 5 popups, full user flow |

---

> **Next steps for implementation team:**
>
> 1. Implement `Detection & Response` nav group in sidebar — use existing nav group component, add red badge variant
> 2. Build EDR Overview dashboard — reuse existing chart and card components from Threats page
> 3. Build Detections page — extend existing threat table component with new columns
> 4. Build Incidents page — new table, same filter/pagination pattern
> 5. Build Investigation View — new three-column layout, process tree is a new component
> 6. Build Response Center — extend existing table with status badge variants
> 7. Add 4 tabs to Device Detail — reuse scoped table components from steps 3–6
> 8. Add 3 hover-reveal text links to Threats page rows — minimal change, highest priority for quick win
> 9. Implement popup system — single reusable modal component, content injected per type

---

*End of document. For questions contact the UX Design Team.*
