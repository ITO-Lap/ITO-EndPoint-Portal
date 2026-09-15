# macOS Endpoint Health & Compliance Reporting Module
## Complete UX Design Guide

> **Document type:** Product Design Specification · Implementation Reference  
> **Module:** Mac Fleet Reports  
> **Platform:** ITO Endpoint (iru-compatible)  
> **Version:** 1.0  
> **Last updated:** 2026-06-01  
> **Status:** Design Approved — Ready for Engineering  
> **Audience:** macOS Admins · Endpoint Engineers · Security Teams · IT Managers · CIOs

---

## Table of Contents

1. [Navigation Placement Recommendation](#1-navigation-placement-recommendation)
2. [Main Dashboard Layout](#2-main-dashboard-layout)
3. [Dashboard KPI Cards — Complete Specification](#3-dashboard-kpi-cards)
4. [Dashboard Visualizations](#4-dashboard-visualizations)
5. [Report Categories — Full Table Structures](#5-report-categories)
   - 5.1 [Patch Compliance Report](#51-patch-compliance-report)
   - 5.2 [Stale Device Report](#52-stale-device-report)
   - 5.3 [Outdated macOS Report](#53-outdated-macos-report)
   - 5.4 [End-of-Life (EOL) Device Report](#54-end-of-life-eol-device-report)
   - 5.5 [Executive Summary Report](#55-executive-summary-report)
6. [Region View — Tag-Based Location Intelligence](#6-region-view--tag-based-location-intelligence)
7. [Advanced Filtering Architecture](#7-advanced-filtering-architecture)
8. [Export & Automation Workflow](#8-export--automation-workflow)
9. [Excel Workbook Structure](#9-excel-workbook-structure)
10. [Scheduled Reports](#10-scheduled-reports)
11. [AI Insights Panel](#11-ai-insights-panel)
12. [User Journeys](#12-user-journeys)
13. [Component Specifications](#13-component-specifications)
14. [Implementation Notes](#14-implementation-notes)

---

## 1. Navigation Placement Recommendation

### Decision: `Endpoint Management → Mac Fleet Reports` (dedicated entry)

```
ENDPOINT MANAGEMENT
  ├── Device Lookup
  ├── Mac Devices
  ├── Intune Devices
  ├── Windows Devices
  ├── ManageEngine Devices
  ├── Open Issues
  └── Mac Fleet Reports     ← NEW (badge: last updated time)
```

### Why Not Other Options?

| Option | Decision | Reason |
|---|---|---|
| `Endpoint → Reports` (generic) | ❌ Too generic | Loses macOS-specific context; IT Managers can't find it |
| `Analytics & Reports` section | ❌ Wrong audience | Analytics = operational. Fleet Reports = executive + compliance |
| `Compliance → Device Health` | ❌ Too buried | CIOs won't look in Compliance sub-nav for fleet health |
| `Mac Devices → Reports tab` | ⚠️ Partial fit | Already exists but too limited for executive-level reporting |
| **Endpoint → Mac Fleet Reports** | ✅ **Recommended** | Collocated with Mac Devices, visible to all personas, distinct enough for leadership to find |

### Rationale

1. **Colocation with Mac Devices:** Admins already navigate to Endpoint → Mac Devices. Reports live one step away in the same mental model.
2. **Discoverability for Leadership:** CIOs and Compliance Officers scan the left nav top-to-bottom. Seeing "Mac Fleet Reports" under Endpoint immediately telegraphs its purpose without drilling into tabs.
3. **Separation from operational data:** The existing Mac Devices page shows live device inventory. Fleet Reports shows aggregated, trended, exportable compliance data — a meaningfully different product.
4. **Badge value:** A "Last generated: 2h ago" badge on the nav item tells managers the data is fresh without them needing to open it.

---

## 2. Main Dashboard Layout

### Page Header

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ iru 🤖  [Search or ask Iru AI                    ⌘K]          ✦  🔔  💬  Iru AI    │
├──────────────┬──────────────────────────────────────────────────────────────────────┤
│  [nav]       │ Mac Fleet Reports                              [Schedule ▾] [Export ▾]│
│              │  Endpoint health, patch compliance & lifecycle for your macOS fleet   │
│   Mac Fleet  │                                                                        │
│   Reports    │  Overview   Patch Compliance   Stale Devices   Outdated macOS         │
│   ← active  │  EOL Devices   Executive Summary   Region View                        │
│              │  ──────────                                                            │
│              │  Viewing  All Devices  ▾   Last 30 days  ▾   [+ Add Filter]           │
│              │           AI Insights ● 4 new insights                [Saved Views ▾] │
└──────────────┴──────────────────────────────────────────────────────────────────────┘
```

### Sub-Tab Navigation

```
Overview   Patch Compliance   Stale Devices   Outdated macOS   EOL Devices   Executive Summary   Region View
────────
```

Tab underline style — matching iru platform pattern (purple `#7C5CFC` active indicator).

---

## 3. Dashboard KPI Cards

### Overview Tab — Full KPI Grid

Four card groups, each with a collapsible section header. Cards use the platform's existing white-card, subtle-border style.

---

#### GROUP 1 — Fleet Overview (5 cards)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ FLEET OVERVIEW                                                            [collapse] │
│                                                                                      │
│ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────┐ ┌──────────┐│
│ │ Total Devices  │ │ Healthy         │ │ Requiring       │ │ Compliance │ │ Fleet    ││
│ │                │ │ Devices         │ │ Action          │ │ Score      │ │ Risk     ││
│ │   12,842       │ │   9,214         │ │   3,628         │ │   71.7%    │ │ Score    ││
│ │  ▲ 247 new     │ │  71.7% of fleet │ │  28.3% affected │ │ ▼ 2.1 pts  │ │   68     ││
│ │   this month   │ │                 │ │                 │ │ vs last mo.│ │ Moderate ││
│ └────────────────┘ └────────────────┘ └────────────────┘ └────────────┘ └──────────┘│
└──────────────────────────────────────────────────────────────────────────────────────┘
```

| Card | Value | Trend | Click Destination |
|---|---|---|---|
| Total Devices | 12,842 | ▲ 247 this month | Mac Devices page |
| Healthy Devices | 9,214 | 71.7% | Filtered device list (Compliant) |
| Requiring Action | 3,628 | 28.3% | Filtered device list (Non-Compliant + Warning) |
| Compliance Score | 71.7% | ▼ 2.1 pts vs last month | Executive Summary tab |
| Fleet Risk Score | 68 / 100 | Moderate | Executive Summary tab |

**Compliance Score formula:**
```
(Fully Patched + On Current macOS + Checked-In Last 7d) / Total Devices × 100
```

**Fleet Risk Score formula (0–100, lower is better):**
```
Weighted sum: EOL devices ×3 + Missing Critical Patches ×2.5 + Stale ×1.5 + Outdated OS ×1
```

---

#### GROUP 2 — Patch Health (4 cards)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ PATCH HEALTH                                                              [collapse] │
│                                                                                      │
│ ┌───────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐│
│ │ Fully Patched      │ │ Missing Critical  │ │ Missing Security  │ │ Missing App       ││
│ │ Devices            │ │ Patches           │ │ Updates           │ │ Updates           ││
│ │                    │ │                   │ │                   │ │                   ││
│ │   8,104            │ │       247         │ │      1,124        │ │      2,841        ││
│ │  63.1% of fleet    │ │  ● Critical risk  │ │  ▲ 89 this week   │ │  ▼ 103 resolved   ││
│ └───────────────────┘ └──────────────────┘ └──────────────────┘ └──────────────────┘│
└──────────────────────────────────────────────────────────────────────────────────────┘
```

| Card | Color Accent | Drill-Down |
|---|---|---|
| Fully Patched | Green `#10B981` | Patch Compliance tab, filter: Compliant |
| Missing Critical Patches | Red `#EF4444` | Patch Compliance tab, filter: Critical |
| Missing Security Updates | Orange `#F59E0B` | Patch Compliance tab, filter: Security |
| Missing App Updates | Amber `#D97706` | Patch Compliance tab, filter: Application |

---

#### GROUP 3 — Device Lifecycle (5 cards)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ DEVICE LIFECYCLE                                                          [collapse] │
│                                                                                      │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐│
│ │ Active       │ │ Stale        │ │ Inactive     │ │ EOL          │ │ Near EOL        ││
│ │ Devices      │ │ Devices      │ │ Devices      │ │ Devices      │ │ (≤90 days)      ││
│ │              │ │              │ │              │ │              │ │                 ││
│ │  11,688      │ │    512        │ │    208        │ │    42         │ │      89         ││
│ │ 91.0%        │ │ >30d no sync │ │ >90d no sync │ │ Apple ended  │ │ Replace soon    ││
│ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────┘│
└──────────────────────────────────────────────────────────────────────────────────────┘
```

**Lifecycle Definitions:**

| Status | Definition |
|---|---|
| Active | Checked in within last 7 days |
| Stale | No check-in for 8–30 days |
| Inactive | No check-in for 31–90 days |
| EOL | Apple has ended security updates for this device's hardware/macOS |
| Near EOL | Device will reach EOL within 90 days |

---

#### GROUP 4 — Operating System Health (4 cards)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ OPERATING SYSTEM HEALTH                                                   [collapse] │
│                                                                                      │
│ ┌───────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐│
│ │ Devices on         │ │ 1 Version         │ │ 2+ Versions       │ │ Latest macOS      ││
│ │ Current Version    │ │ Behind            │ │ Behind            │ │ Version           ││
│ │                    │ │                   │ │                   │ │                   ││
│ │   5,847            │ │     4,219         │ │      2,776        │ │  macOS 15.5       ││
│ │  45.5% of fleet    │ │ Sonoma 14.x       │ │ Ventura & below   │ │  Tahoe            ││
│ └───────────────────┘ └──────────────────┘ └──────────────────┘ └──────────────────┘│
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Dashboard Visualizations

All charts rendered below the KPI card groups. Two per row on large screens, single column on medium.

---

### 4.1 Patch Compliance Trend (Line Chart)

```
PATCH COMPLIANCE OVER TIME                              [30d] [90d] [6mo] [1yr]

  100% ┤                                    ╭──────────
   90% ┤──────────╮                 ╭───────╯
   80% ┤           ╰────────────────╯
   70% ┤ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ Target: 85%
   60% ┤
       └─ May 1 ──── May 8 ──── May 15 ──── May 22 ──── Jun 1

  ─── Patch Compliance %    ─ ─ Target Line    ── Fleet Average
```

**Data points:** Daily. Hover tooltip shows: Date, % compliant, # devices patched, # devices missing patches.  
**Interaction:** Click any point → Patch Compliance table filtered to that date.

---

### 4.2 Device Lifecycle Distribution (Donut Chart)

```
DEVICE LIFECYCLE DISTRIBUTION

         ╭──────────────╮
         │              │       ■ Active       11,688  (91.0%)
         │    12,842     │       ■ Stale           512   (4.0%)
         │    Total      │       ■ Inactive         208   (1.6%)
         │              │       ■ EOL               42   (0.3%)
         ╰──────────────╯       ■ Near EOL           89   (0.7%)
                                ■ Unknown            303   (2.4%)
```

**Interaction:** Click any segment → navigates to that lifecycle's report tab with devices pre-filtered.

---

### 4.3 macOS Version Distribution (Horizontal Bar Chart)

```
macOS VERSION DISTRIBUTION                              [by Version] [by Vintage]

  macOS 15 Tahoe    ████████████████████████████░░░░░░░░   5,847 (45.5%)
  macOS 14 Sonoma   ██████████████████░░░░░░░░░░░░░░░░░░   3,612 (28.1%)
  macOS 13 Ventura  ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░   2,104 (16.4%)
  macOS 12 Monterey ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░     672  (5.2%)
  macOS 11 Big Sur  ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░     418  (3.3%)
  macOS 10.x & below █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░     189  (1.5%)
                    └──────────────────────────────────── 12,842
```

**Color coding:** Current version = Green, 1 behind = Amber, 2 behind = Orange, 3+ behind = Red.  
**Interaction:** Click any bar → Outdated macOS tab filtered to that version.

---

### 4.4 Risk Heatmap (Grid: Department × Risk Factor)

```
RISK HEATMAP — BY DEPARTMENT & RISK FACTOR

             Missing    Stale      Outdated   EOL        Overall
             Patches    Devices    macOS      Devices    Risk
             ─────────────────────────────────────────────────
  Finance    ████ H     ██ M       ███ H      █ L        ███ H
  Marketing  ████ H     ████ H     ██ M       ██ M       ████ H
  Eng'g      ██ M       █ L        █ L        █ L        ██ M
  HR         ███ H      ██ M       ███ H      ███ H      ████ H
  Sales      █ L        ███ H      ██ M       █ L        ██ M
  Legal      ████ H     █ L        ████ H     ████ H     ████ H
  IT Ops     █ L        █ L        █ L        █ L        █ L
  Exec       ██ M       █ L        ███ H      ██ M       ███ H

  ████ High (>25% affected)   ███ Medium (11–25%)   ██ Low (<10%)
```

**Interaction:** Click any cell → filtered report for that Department + Risk Factor combination.

---

### 4.5 Department Health Score (Horizontal Bar, ranked)

```
DEPARTMENT COMPLIANCE HEALTH SCORE                    [Sort: Score ▾] [Score ▲]

  IT Ops         ████████████████████████████████████  96%  ● Excellent
  Engineering    ████████████████████████████████░░░░  84%  ● Good
  Sales          ████████████████████████████░░░░░░░░  78%  ● Fair
  Exec           ████████████████████████░░░░░░░░░░░░  72%  ● Fair
  HR             ██████████████████████░░░░░░░░░░░░░░  68%  ● At Risk
  Finance        ████████████████████░░░░░░░░░░░░░░░░  62%  ● At Risk
  Marketing      ██████████████████░░░░░░░░░░░░░░░░░░  56%  ● Critical
  Legal          ████████████░░░░░░░░░░░░░░░░░░░░░░░░  44%  ● Critical
```

**Score formula:** (Patched + On Current OS + Active + Non-EOL) weighted average.

---

### 4.6 Geographic Health View (Regional Map Cards)

*(See Section 6 for full Region View tab design — powered by device Tags)*

Preview on Overview tab: compact version showing region count and health score.

```
GEOGRAPHIC HEALTH VIEW  (extracted from device Tags)          [→ Full Region View]

  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
  │ 🌎 North America  │  │ 🌍 EMEA           │  │ 🌏 APAC           │
  │   6,214 devices  │  │   3,891 devices  │  │   2,737 devices  │
  │  Score: 74  Fair │  │  Score: 68  Risk │  │  Score: 71  Fair │
  │  ▼ 3pts vs last  │  │  ▲ 1pt vs last   │  │  ▼ 5pts vs last  │
  └──────────────────┘  └──────────────────┘  └──────────────────┘
```

---

## 5. Report Categories

---

### 5.1 Patch Compliance Report

**Navigation:** Mac Fleet Reports → Patch Compliance tab

#### Page Layout

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ Patch Compliance Report                              [Export ▾] [Schedule] [+ Filter]│
│ 8,104 fully patched · 247 missing critical patches · 63.1% compliance rate          │
│                                                                                      │
│ Viewing   All Devices ▾   Last Patch Date: All Time ▾   Severity: All ▾   [Clear]   │
│                                                                                      │
│ Quick Filters:  [Missing Critical ●] [Missing Security] [All Patched] [All Devices] │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

#### Summary Cards (above table)

| Card | Value |
|---|---|
| Fully Patched | 8,104 (63.1%) |
| Missing Critical | 247 devices — immediate action |
| Missing Security | 1,124 devices |
| Compliance Rate | 63.1% ▼ 2.1% vs last month |

#### Table Columns

| # | Column | Type | Sortable | Notes |
|---|---|---|---|---|
| 1 | ☐ | Checkbox | — | Bulk action |
| 2 | Device Name | Text link | ✅ | Opens Device Detail panel |
| 3 | Assigned User | Text | ✅ | Links to user profile |
| 4 | Department | Pill | ✅ | Filter-able |
| 5 | Region | Pill | ✅ | Extracted from device Tags (see §6) |
| 6 | OS Version | Text | ✅ | Badge: current/behind |
| 7 | Missing Patches | Number | ✅ | Red if >0 critical |
| 8 | Missing Critical | Number | ✅ | Red badge if >0 |
| 9 | Last Patch Date | Date | ✅ | Relative + absolute |
| 10 | Patch Compliance % | Progress bar | ✅ | Color: green/amber/red |
| 11 | Risk Level | Chip | ✅ | Critical / High / Medium / Low |
| 12 | Actions | Buttons | — | Schedule Update · Notify User · ··· |

#### Full Table Wireframe

```
┌──┬─────────────────┬──────────────┬────────────┬────────┬──────────────┬──────────┬────────────┬──────────────────┬──────────────────┬──────────┬────────────────────────────┐
│☐ │ Device Name     │ Assigned User│ Dept       │ Region │ OS Version   │ Missing  │ Crit.      │ Last Patch       │ Patch Compliance │ Risk     │ Actions                    │
│  │                 │              │            │        │              │ Patches  │ Patches    │ Date             │                  │ Level    │                            │
├──┼─────────────────┼──────────────┼────────────┼────────┼──────────────┼──────────┼────────────┼──────────────────┼──────────────────┼──────────┼────────────────────────────┤
│☐ │ MBP-JSmith-01   │ John Smith   │ Finance    │ AMER   │ 13.7.1 ↓↓   │    12    │   ● 3      │ 45 days ago      │ ██░░░░░░  34%    │ ●Crit.   │ Schedule  Notify  ···      │
│☐ │ MBA-AJones-02   │ Alice Jones  │ Marketing  │ EMEA   │ 14.6.1 ↓    │     7    │   ● 1      │ 22 days ago      │ ████░░░░  58%    │ ●High    │ Schedule  Notify  ···      │
│☐ │ MBP-BKumar-11   │ Bob Kumar    │ Engineering│ APAC   │ 15.5   ✓    │     0    │   ● 0      │ 2 days ago       │ ████████  100%   │ ●Low     │ Schedule  Notify  ···      │
│☐ │ MAC-RPatel-05   │ Rita Patel   │ Legal      │ AMER   │ 12.7.6 ↓↓↓ │    21    │   ● 7      │ 78 days ago      │ █░░░░░░░  18%    │ ●Crit.   │ Schedule  Notify  ···      │
│☐ │ MBP-MChen-33    │ Mike Chen    │ Sales      │ APAC   │ 14.6.1 ↓    │     4    │   ● 0      │ 11 days ago      │ ██████░░  76%    │ ●Medium  │ Schedule  Notify  ···      │
└──┴─────────────────┴──────────────┴────────────┴────────┴──────────────┴──────────┴────────────┴──────────────────┴──────────────────┴──────────┴────────────────────────────┘
```

**OS Version indicators:**
- `✓` = Latest version (green)
- `↓` = 1 version behind (amber)
- `↓↓` = 2 versions behind (orange)
- `↓↓↓` = 3+ versions behind (red)

#### Bulk Actions (when ≥1 row selected)

```
3 devices selected     [Schedule Update]  [Notify Users]  [Export Selected]  [Clear]
```

#### Row-Level Actions

| Action | Behavior |
|---|---|
| Schedule Update | Opens scheduling modal — sets update time, notifies user |
| Notify User | Sends email/push to assigned user with patch summary |
| `···` | More: View Device Detail, Add Note, Flag for Review, Retire |

---

### 5.2 Stale Device Report

**Navigation:** Mac Fleet Reports → Stale Devices tab

#### Definition Panel (top of page)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ ℹ Stale Device Definition                                                            │
│ A device is considered stale when it has not checked in within the selected period.  │
│ Default threshold: 30 days    [Customize Threshold ▾]                               │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

#### Threshold Filter Tabs

```
All Stale   7+ Days  14+ Days  [30+ Days]  60+ Days  90+ Days   Custom Range
                                ──────────
```

Active tab shown with underline. Numbers in each tab: `7+ Days (891)`, `14+ Days (712)`, `30+ Days (512)`.

#### Summary Cards

| Card | Value |
|---|---|
| Total Stale | 512 devices |
| Avg Days Stale | 38.4 days |
| Longest Inactive | 142 days (2 devices) |
| At Risk of Loss | 89 devices (>60 days) |

#### Table Columns

| # | Column | Type | Sortable | Notes |
|---|---|---|---|---|
| 1 | ☐ | Checkbox | — | Bulk action |
| 2 | Device Name | Text link | ✅ | Opens device detail |
| 3 | Assigned User | Text | ✅ | |
| 4 | Last Check-In | Date | ✅ | Relative + absolute, color-coded by age |
| 5 | Last Login | Date | ✅ | Last user authentication |
| 6 | Department | Pill | ✅ | |
| 7 | Region | Pill | ✅ | From device Tags |
| 8 | Location | Text | ✅ | Office/building from Tags |
| 9 | Device Status | Chip | ✅ | Active / Stale / Inactive / Lost |
| 10 | Days Stale | Number + bar | ✅ | Color intensifies with age |
| 11 | Actions | Buttons | — | Send Reminder · Mark Lost · Retire |

#### Full Table Wireframe

```
┌──┬─────────────────┬──────────────┬──────────────────┬──────────────────┬────────────┬────────┬──────────────┬────────────┬─────────────┬──────────────────────────────┐
│☐ │ Device Name     │ Assigned User│ Last Check-In    │ Last Login       │ Department │ Region │ Location     │ Status     │ Days Stale  │ Actions                      │
├──┼─────────────────┼──────────────┼──────────────────┼──────────────────┼────────────┼────────┼──────────────┼────────────┼─────────────┼──────────────────────────────┤
│☐ │ MBP-JDoe-88     │ Jane Doe     │ 89 days ago      │ 91 days ago      │ HR         │ EMEA   │ London HQ    │ ● Inactive │ ████████ 89 │ Send Reminder  Mark Lost  ···│
│☐ │ MBA-KLee-44     │ Kevin Lee    │ 62 days ago      │ 65 days ago      │ Marketing  │ APAC   │ Singapore    │ ● Inactive │ ██████░░ 62 │ Send Reminder  Mark Lost  ···│
│☐ │ MBP-SWood-22    │ Sarah Wood   │ 38 days ago      │ 40 days ago      │ Sales      │ AMER   │ NYC Office   │ ● Stale    │ ████░░░░ 38 │ Send Reminder  Mark Lost  ···│
│☐ │ MAC-TBrown-91   │ Tom Brown    │ 31 days ago      │ 33 days ago      │ Finance    │ AMER   │ Chicago      │ ● Stale    │ ███░░░░░ 31 │ Send Reminder  Mark Lost  ···│
└──┴─────────────────┴──────────────┴──────────────────┴──────────────────┴────────────┴────────┴──────────────┴────────────┴─────────────┴──────────────────────────────┘
```

**Days Stale bar:** Color scale: 0–14d = green, 15–30d = amber, 31–60d = orange, 61–90d = red, 90d+ = dark red.

#### Bulk Actions

```
4 devices selected   [Send Reminder]  [Mark Lost]  [Retire Device]  [Export Selected]  [Clear]
```

#### Row Actions Detail

| Action | Modal Content |
|---|---|
| Send Reminder | Template email/Slack to user. "Your device [name] has not checked in. Please connect to the network or contact IT." Customizable message. |
| Mark Lost | Marks device status = Lost. Triggers MDM lock + wipe workflow (if configured). Creates ticket. |
| Retire Device | Initiates retirement workflow: deprovision, user notification, asset tracking update. |

---

### 5.3 Outdated macOS Report

**Navigation:** Mac Fleet Reports → Outdated macOS tab

#### Summary Cards

| Card | Value |
|---|---|
| On Current Version | 5,847 (45.5%) |
| 1 Version Behind | 4,219 (32.8%) |
| 2+ Versions Behind | 2,776 (21.6%) |
| Upgrade Eligible | 6,441 (of 6,995 outdated) |
| Not Upgrade Eligible | 554 — hardware limitation |

#### Version Behind Quick Filter

```
All  [Current ✓]  [1 Behind ↓]  [2 Behind ↓↓]  [3+ Behind ↓↓↓]
```

#### Table Columns

| # | Column | Type | Sortable | Notes |
|---|---|---|---|---|
| 1 | ☐ | Checkbox | — | |
| 2 | Device Name | Text link | ✅ | |
| 3 | Assigned User | Text | ✅ | |
| 4 | Department | Pill | ✅ | |
| 5 | Region | Pill | ✅ | From Tags |
| 6 | Current OS Version | Text + badge | ✅ | Badge: ✓ / ↓ / ↓↓ / ↓↓↓ |
| 7 | Latest Available | Text | — | Target version |
| 8 | Versions Behind | Number | ✅ | Color: green/amber/orange/red |
| 9 | Upgrade Eligibility | Chip | ✅ | Eligible / Hardware Limit / Enrolled Exempt |
| 10 | Compliance Status | Chip | ✅ | Compliant / At Risk / Non-Compliant |
| 11 | Actions | Buttons | — | Schedule Upgrade · Notify User |

#### Full Table Wireframe

```
┌──┬─────────────────┬──────────────┬────────────┬────────┬──────────────┬─────────────────┬──────────────┬──────────────────────┬────────────────────┬────────────────────────┐
│☐ │ Device Name     │ Assigned User│ Dept       │ Region │ Current OS   │ Latest Available│ Versions     │ Upgrade Eligibility  │ Compliance Status  │ Actions                │
│  │                 │              │            │        │              │                 │ Behind       │                      │                    │                        │
├──┼─────────────────┼──────────────┼────────────┼────────┼──────────────┼─────────────────┼──────────────┼──────────────────────┼────────────────────┼────────────────────────┤
│☐ │ MBP-RPatel-07   │ Rita Patel   │ Legal      │ AMER   │ 11.7.10 ↓↓↓ │ 15.5 Tahoe      │  4 behind    │ ● Hardware Limit     │ ● Non-Compliant    │ Schedule  Notify  ···  │
│☐ │ MBA-AJones-03   │ Alice Jones  │ Marketing  │ EMEA   │ 12.7.6 ↓↓↓  │ 15.5 Tahoe      │  3 behind    │ ● Eligible           │ ● Non-Compliant    │ Schedule  Notify  ···  │
│☐ │ MBP-MChen-18    │ Mike Chen    │ Sales      │ APAC   │ 13.7.1 ↓↓   │ 15.5 Tahoe      │  2 behind    │ ● Eligible           │ ● At Risk          │ Schedule  Notify  ···  │
│☐ │ MBP-JSmith-14   │ John Smith   │ Finance    │ AMER   │ 14.6.1 ↓    │ 15.5 Tahoe      │  1 behind    │ ● Eligible           │ ● At Risk          │ Schedule  Notify  ···  │
│☐ │ MBA-BKumar-01   │ Bob Kumar    │ Engineering│ APAC   │ 15.5  ✓     │ 15.5 Tahoe      │  Current     │ —                    │ ● Compliant        │ —                      │
└──┴─────────────────┴──────────────┴────────────┴────────┴──────────────┴─────────────────┴──────────────┴──────────────────────┴────────────────────┴────────────────────────┘
```

**Upgrade Eligibility values:**
- `● Eligible` — Device hardware supports latest macOS
- `● Hardware Limit` — Device's maximum supported macOS is older than latest
- `● Enrolled Exempt` — Device tagged as exempt (e.g., lab machine, kiosk)

---

### 5.4 End-of-Life (EOL) Device Report

**Navigation:** Mac Fleet Reports → EOL Devices tab

#### EOL Timeline Filter Tabs

```
All EOL   [Already EOL]   EOL in 30 Days   EOL in 90 Days   EOL in 180 Days   EOL in 1 Year
          ──────────────
Already EOL: 42 devices    30d: 23     90d: 89     180d: 156     1yr: 312
```

#### Summary Cards

| Card | Value |
|---|---|
| Already EOL | 42 devices — immediate replacement needed |
| EOL Within 90 Days | 89 devices |
| EOL Within 6 Months | 156 devices |
| Estimated Replacement Cost | $486,000 (based on avg MacBook Pro price) |
| Warranty Expired | 301 devices |

#### Table Columns

| # | Column | Type | Sortable | Notes |
|---|---|---|---|---|
| 1 | ☐ | Checkbox | — | |
| 2 | Device Name | Text link | ✅ | |
| 3 | Model | Text | ✅ | e.g., MacBook Pro 14" M1 |
| 4 | Assigned User | Text | ✅ | |
| 5 | Department | Pill | ✅ | |
| 6 | Region | Pill | ✅ | From Tags |
| 7 | Purchase Date | Date | ✅ | |
| 8 | Warranty Status | Chip | ✅ | Active / Expired / Unknown |
| 9 | Apple Support | Chip | ✅ | Supported / EOL Soon / EOL |
| 10 | EOL Date | Date | ✅ | Color: red if past, amber if <90d |
| 11 | Days Until EOL | Number | ✅ | Negative = already past EOL |
| 12 | Replacement Priority | Chip | ✅ | Immediate / High / Medium / Planned |
| 13 | Risk Level | Chip | ✅ | Critical / High / Medium |
| 14 | Actions | Buttons | — | Replacement Request · Budget Forecast |

#### Full Table Wireframe

```
┌──┬─────────────────┬──────────────────────┬──────────────┬────────────┬────────┬─────────────┬────────────────┬────────────────┬────────────┬──────────────┬───────────────────┬──────────────┬──────────────────────────────────────┐
│☐ │ Device Name     │ Model                │ Assigned User│ Dept       │ Region │ Purchase    │ Warranty       │ Apple Support  │ EOL Date   │ Days to EOL  │ Replacement       │ Risk         │ Actions                              │
│  │                 │                      │              │            │        │ Date        │ Status         │ Status         │            │              │ Priority          │ Level        │                                      │
├──┼─────────────────┼──────────────────────┼──────────────┼────────────┼────────┼─────────────┼────────────────┼────────────────┼────────────┼──────────────┼───────────────────┼──────────────┼──────────────────────────────────────┤
│☐ │ MBP-Legacy-001  │ MBP 2018 15" Intel  │ G. Williams  │ Finance    │ AMER   │ Jan 2019    │ ● Expired      │ ● EOL          │ Dec 2023   │ -548 days    │ ●● Immediate      │ ● Critical   │ Create Request  Budget Forecast  ··· │
│☐ │ MBA-Old-042     │ MBA 2019 13" Intel  │ D. Freeman   │ HR         │ EMEA   │ Mar 2019    │ ● Expired      │ ● EOL Soon     │ Aug 2026   │ 60 days      │ ●● High           │ ● High       │ Create Request  Budget Forecast  ··· │
│☐ │ MBP-Near-089    │ MBP 2020 13" M1    │ T. Brown     │ Sales      │ APAC   │ Jun 2020    │ ● Expired      │ ● Supported    │ Oct 2026   │ 122 days     │ ● Medium          │ ● Medium     │ Create Request  Budget Forecast  ··· │
│☐ │ MAC-Plan-156    │ iMac 2021 24" M1   │ S. White     │ Design     │ AMER   │ Sep 2021    │ ● Active       │ ● Supported    │ Mar 2027   │ 287 days     │ ● Planned         │ ● Low        │ Create Request  Budget Forecast  ··· │
└──┴─────────────────┴──────────────────────┴──────────────┴────────────┴────────┴─────────────┴────────────────┴────────────────┴────────────┴──────────────┴───────────────────┴──────────────┴──────────────────────────────────────┘
```

#### Budget Forecast Modal (from row action)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Budget Forecast — EOL Device Replacement                               [  ✕ Close ]  │
│ ─────────────────────────────────────────────────────────────────────────────────── │
│                                                                                      │
│ DEVICES SELECTED: 12  (Already EOL: 3, EOL in 90d: 9)                              │
│                                                                                      │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│ │ ESTIMATED REPLACEMENT COST                                                       │ │
│ │                                                                                  │ │
│ │  MacBook Pro 14" M4 (8 units)     8 × $1,999   =   $15,992                     │ │
│ │  MacBook Air 13" M4 (4 units)     4 × $1,299   =    $5,196                     │ │
│ │  ─────────────────────────────────────────────────────────                      │ │
│ │  Subtotal Hardware                              $21,188                          │ │
│ │  AppleCare+ (recommended)         12 × $299    =    $3,588                     │ │
│ │  Setup & Migration (IT time)      12 × $150    =    $1,800                     │ │
│ │  ─────────────────────────────────────────────────────────                      │ │
│ │  TOTAL ESTIMATED BUDGET                         $26,576                          │ │
│ └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
│ [Download PDF Forecast]   [Export to Excel]                    [  ✕ Close ]          │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 5.5 Executive Summary Report

**Navigation:** Mac Fleet Reports → Executive Summary tab

**Audience:** CIO, IT Director, VP IT, Compliance Officers

**Design intent:** Print-ready, chart-heavy, minimal table data, KPI-first.

#### Layout

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ Executive Summary — macOS Fleet Health                                               │
│ Generated: Jun 1, 2026 · Reporting Period: May 2026 · By: david@org.com            │
│ [Download PDF]  [Schedule Monthly]  [Share Link]                                    │
│ ─────────────────────────────────────────────────────────────────────────────────── │
│                                                                                      │
│ HEALTH SCORECARD                                                                     │
│ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐│
│ │ Fleet Health      │ │ Compliance Score  │ │ Patch Compliance  │ │ Security Risk     ││
│ │      72           │ │      71.7%        │ │      63.1%        │ │ Score: 68/100    ││
│ │  / 100  Fair      │ │  ▼ -2.1 pts       │ │  ▼ -1.8 pts       │ │  Moderate Risk    ││
│ └──────────────────┘ └──────────────────┘ └──────────────────┘ └──────────────────┘│
│                                                                                      │
│ ┌──────────────────┐ ┌──────────────────┐                                           │
│ │ Device Lifecycle  │ │ EOL Risk          │                                           │
│ │ Score:  88/100    │ │ Score:  43/100    │                                           │
│ │  Good             │ │  High Risk        │                                           │
│ └──────────────────┘ └──────────────────┘                                           │
│                                                                                      │
│ TOP 5 RISKS (requires immediate leadership attention)                                │
│ ─────────────────────────────────────────────────────────────────────────────────── │
│ ① 42 devices are past Apple End-of-Life — no security updates available             │
│ ② 247 devices are missing critical security patches — exploit exposure              │
│ ③ 2,776 devices are 2+ macOS versions behind — compliance gap                      │
│ ④ 89 devices haven't checked in for 60+ days — potential loss or abandonment       │
│ ⑤ Legal department has 44% compliance score — immediate remediation needed          │
│                                                                                      │
│ RECOMMENDED ACTIONS                                                                  │
│ ─────────────────────────────────────────────────────────────────────────────────── │
│ ✦ Approve $486K FY2027 budget for EOL device replacement (89 devices at risk)       │
│ ✦ Mandate OS upgrade campaign for 4,219 Sonoma-era devices by Q3 2026               │
│ ✦ Initiate stale device audit — retrieve or retire 89 inactive devices              │
│ ✦ Prioritize Finance and Legal departments for patch remediation sprint              │
│                                                                                      │
│ TREND OVERVIEW (6-month)                                                             │
│ ┌──────────────────────────────────┐  ┌──────────────────────────────────┐          │
│ │ Compliance Score (6mo trend)      │  │ Fleet Risk Score (6mo trend)      │          │
│ │ Line chart: 68→72→73→74→73→71.7 │  │ Line chart: 71→70→69→68→68→68    │          │
│ └──────────────────────────────────┘  └──────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Region View — Tag-Based Location Intelligence

**Navigation:** Mac Fleet Reports → Region View tab

### Tag Parsing Logic

Device tags in ManageEngine / MDM systems commonly use patterns like:

```
location:nyc          →  New York City
region:amer           →  North America
office:london-hq      →  London HQ
site:tokyo-branch     →  Tokyo Branch
country:us            →  United States
building:tower-b      →  Tower B
floor:3               →  Floor 3
timezone:pst          →  Pacific Time
```

**Tag Extraction Rules:**

| Tag Prefix | Maps To | Example |
|---|---|---|
| `region:` | Top-level region | `region:emea` → EMEA |
| `location:` | City/office | `location:nyc` → New York |
| `office:` | Office name | `office:london-hq` → London HQ |
| `country:` | Country | `country:uk` → United Kingdom |
| `site:` | Site name | `site:tokyo-branch` → Tokyo Branch |
| `building:` | Building | `building:tower-b` → Tower B |
| `floor:` | Floor | `floor:3` → Floor 3 |
| No matching prefix | Uncategorized | Tag shown as-is |

**Region Hierarchy (auto-generated from tags):**

```
World
├── AMER (North America)          6,214 devices
│   ├── United States             5,201
│   │   ├── New York                 912
│   │   │   ├── NYC HQ Tower A       441
│   │   │   └── NYC HQ Tower B       471
│   │   ├── San Francisco            784
│   │   ├── Chicago                  623
│   │   └── Other US               2,882
│   └── Canada                    1,013
├── EMEA                          3,891 devices
│   ├── United Kingdom            1,204
│   │   ├── London HQ               842
│   │   └── Manchester Office        362
│   ├── Germany                     891
│   ├── France                      612
│   └── Other EMEA               1,184
├── APAC                          2,737 devices
│   ├── Japan                       904
│   ├── Australia                   688
│   ├── Singapore                   512
│   └── Other APAC               1,633
└── Untagged / No Region             0 — configure tags to enable
```

### Region View Page Layout

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ Region View                                     [Configure Tag Mappings] [Export ▾] │
│ Fleet health by geographic region — extracted from device tags                      │
│ ─────────────────────────────────────────────────────────────────────────────────── │
│                                                                                      │
│ [Hierarchy ▾]  [AMER ▾] [All Departments ▾]  [All Metrics ▾]  [Clear filters]      │
│                                                                                      │
│ REGIONAL HEALTH SUMMARY                                                              │
│                                                                                      │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│ │         AMER              EMEA              APAC           Untagged             │ │
│ │       6,214 devices      3,891 devices    2,737 devices      0 devices          │ │
│ │                                                                                  │ │
│ │  Health:    74  Fair    Health:  68  Risk   Health:  71  Fair   Health:  —      │ │
│ │  Patch:    66%          Patch:  61%          Patch:  63%                         │ │
│ │  Stale:    3.8%         Stale:  5.1%         Stale:  4.2%                        │ │
│ │  Outdated: 19%          Outdated: 24%        Outdated: 22%                       │ │
│ │  EOL:      0.3%         EOL:    0.4%         EOL:    0.2%                        │ │
│ └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
│ REGION DETAIL TABLE                                                                  │
│                                                                                      │
│ ┌──────────────────┬────────┬──────────┬──────────┬─────────┬──────────┬──────────┐ │
│ │ Region/Office    │Devices │ Health   │ Patch    │ Stale   │ Outdated │ EOL      │ │
│ │                  │        │ Score    │ Compl.   │ Devices │ macOS    │ Devices  │ │
│ ├──────────────────┼────────┼──────────┼──────────┼─────────┼──────────┼──────────┤ │
│ │ AMER             │ 6,214  │  74 Fair │   66%    │  3.8%   │   19%    │   0.3%   │ │
│ │  └ United States │ 5,201  │  75 Fair │   67%    │  3.7%   │   18%    │   0.3%   │ │
│ │     ├ NYC HQ     │   912  │  71 Fair │   64%    │  4.1%   │   21%    │   0.4%   │ │
│ │     ├ SF Office  │   784  │  82 Good │   74%    │  2.8%   │   14%    │   0.1%   │ │
│ │     └ Chicago    │   623  │  68 Risk │   60%    │  5.2%   │   24%    │   0.5%   │ │
│ │  └ Canada        │ 1,013  │  72 Fair │   63%    │  4.1%   │   21%    │   0.3%   │ │
│ │ EMEA             │ 3,891  │  68 Risk │   61%    │  5.1%   │   24%    │   0.4%   │ │
│ │  └ UK            │ 1,204  │  66 Risk │   58%    │  5.8%   │   27%    │   0.5%   │ │
│ │     ├ London HQ  │   842  │  65 Risk │   57%    │  6.0%   │   28%    │   0.5%   │ │
│ │     └ Manchester │   362  │  69 Risk │   61%    │  5.2%   │   23%    │   0.3%   │ │
│ │  └ Germany       │   891  │  71 Fair │   63%    │  4.4%   │   21%    │   0.3%   │ │
│ │ APAC             │ 2,737  │  71 Fair │   63%    │  4.2%   │   22%    │   0.2%   │ │
│ │  └ Japan         │   904  │  74 Fair │   66%    │  3.8%   │   19%    │   0.2%   │ │
│ │  └ Singapore     │   512  │  68 Risk │   60%    │  4.9%   │   25%    │   0.3%   │ │
│ └──────────────────┴────────┴──────────┴──────────┴─────────┴──────────┴──────────┘ │
│                                                                                      │
│ 50 ▾ per page   1–12 of 24 regions/offices               |← ←  1 of 2  → →|        │
│                                                                                      │
│ [Export Region Report]   [Drill into Any Region → Shows filtered device table]      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Configure Tag Mappings Panel

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Configure Tag Mappings                                                  [  ✕ Close ] │
│ ─────────────────────────────────────────────────────────────────────────────────── │
│                                                                                      │
│ Tag Prefix Mappings                                                                  │
│ Define which tag prefixes to use for geographic hierarchy                           │
│                                                                                      │
│ Top-level Region   [region:]      ▾   (e.g., region:emea → EMEA)                   │
│ Country/Market     [country:]     ▾   (e.g., country:uk → United Kingdom)           │
│ City/Office        [location:]    ▾   (e.g., location:nyc → New York)              │
│ Building           [building:]    ▾   (e.g., building:tower-a → Tower A)           │
│ Site Name          [site:]        ▾   (e.g., site:london-hq → London HQ)           │
│                                                                                      │
│ Custom Aliases                                                                       │
│ Map raw tag values to display names:                                                 │
│  emea     →  [ EMEA - Europe, Middle East & Africa    ]  [Remove]                  │
│  amer     →  [ AMER - North America                   ]  [Remove]                  │
│  apac     →  [ APAC - Asia Pacific                    ]  [Remove]                  │
│             [+ Add Alias]                                                            │
│                                                                                      │
│ Preview: Tags on "MBP-JSmith-01"                                                    │
│  region:amer, location:nyc, building:tower-a, department:finance                   │
│  → Parsed as: AMER / New York / Tower A                                             │
│                                                                                      │
│ Devices with no location tags:  0  [View Untagged Devices]                          │
│                                                                                      │
│                                              [Save Mappings]  [  ✕ Close ]          │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Advanced Filtering Architecture

### Filter Panel Design

Available on all report tabs. Accessed via `[+ Add Filter]` button, which opens a persistent side panel.

```
┌──────────────────────────────────────────────────────────┐
│  Filters                          [Clear All]  [Save View]│
│  ──────────────────────────────────────────────────────  │
│                                                           │
│  DEVICE ATTRIBUTES                                        │
│  Device Name      [contains ▾] [                     ]   │
│  Device Type      [MacBook Pro ▾, MacBook Air, iMac…]    │
│  Device Model     [All Models ▾]                         │
│  Serial Number    [                     ]                 │
│                                                           │
│  USER ATTRIBUTES                                          │
│  User             [Select User ▾]                        │
│  Department       [☐ Finance ☐ HR ☐ Legal ☐ Marketing…] │
│  Manager          [Select Manager ▾]                     │
│  Group            [Select Group ▾]                       │
│                                                           │
│  GEOGRAPHIC (from Tags)                                   │
│  Region           [☐ AMER  ☐ EMEA  ☐ APAC  ☐ Other]    │
│  Country          [Select Country ▾]                     │
│  Office/Site      [Select Office ▾]                      │
│                                                           │
│  COMPLIANCE FILTERS                                       │
│  Patch Status     [☐ Fully Patched ☐ Missing Critical    │
│                    ☐ Missing Security ☐ Missing App]     │
│  Compliance Status[☐ Compliant ☐ At Risk ☐ Non-Compliant]│
│  Risk Level       [☐ Critical ☐ High ☐ Medium ☐ Low]    │
│                                                           │
│  LIFECYCLE FILTERS                                        │
│  Device Status    [☐ Active ☐ Stale ☐ Inactive ☐ EOL    │
│                    ☐ Near EOL]                           │
│  Days Since Check-In [0] to [365] days                   │
│                                                           │
│  OS FILTERS                                               │
│  macOS Version    [Select version(s) ▾]                  │
│  Versions Behind  [Any ▾]  Min [  ] Max [  ]            │
│  Upgrade Eligible [☐ Yes ☐ No ☐ Hardware Limited]       │
│                                                           │
│  TIME FILTERS                                             │
│  Last Check-In    [After ▾] [        📅 ]               │
│  Last Login       [After ▾] [        📅 ]               │
│  Last Patch Date  [Before ▾][        📅 ]               │
│  Purchase Date    [Before ▾][        📅 ]               │
│                                                           │
│  ──────────────────────────────────────────────────────  │
│  [Apply Filters]                              [Reset All] │
└──────────────────────────────────────────────────────────┘
```

### Active Filter Pills (shown above table when filters applied)

```
Department: Finance ×    Region: AMER ×    Risk: Critical, High ×    Status: Stale ×
[Clear All Filters]
```

### Saved Views

```
[Saved Views ▾]
  My Views
  ├── Critical Patch Gaps (Finance)
  ├── EMEA Stale Devices
  └── EOL Devices — Exec Report
  Team Views
  ├── Monthly Compliance Check
  └── Q3 EOL Refresh List
  [+ Save Current View]
```

**Save View modal:**

```
┌────────────────────────────────────────────────┐
│ Save View                             [✕]      │
│ ─────────────────────────────────────────────  │
│ View Name  [                              ]    │
│ Visibility ● My Views Only  ○ Team (Shared)   │
│ Tab        ● Current Tab    ○ All Tabs        │
│ Include Filters? ✅ Yes                        │
│                    [Cancel]  [Save View]        │
└────────────────────────────────────────────────┘
```

---

## 8. Export & Automation Workflow

### Export Button Dropdown

```
[Export ▾]
  ├── Export Current View to Excel (.xlsx)
  ├── Export to CSV
  ├── Export Summary to PDF
  ├── Export Executive Dashboard PDF
  ├── ─────────────────────────────────
  └── Configure Scheduled Export...
```

### Excel Export Modal

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Export to Excel — Mac Fleet Reports                             [  ✕ Close ]         │
│ ─────────────────────────────────────────────────────────────────────────────────── │
│                                                                                      │
│ EXPORT CONFIGURATION                                                                 │
│                                                                                      │
│ Report Name   [Mac Fleet Report — Jun 2026                     ]                    │
│ Date Range    [Last 30 days                                  ▾]                    │
│                                                                                      │
│ SHEETS TO INCLUDE                                                                    │
│ ✅ Sheet 1 — Executive Summary     (KPIs, scores, top risks)                        │
│ ✅ Sheet 2 — Patch Compliance       (full device list + patch data)                  │
│ ✅ Sheet 3 — Stale Devices          (using current threshold: 30d)                   │
│ ✅ Sheet 4 — Outdated macOS         (all non-current devices)                        │
│ ✅ Sheet 5 — EOL Devices            (all EOL + near-EOL)                             │
│ ✅ Sheet 6 — Region Summary         (by tag-extracted region)                        │
│ ✅ Sheet 7 — Raw Device Data        (all 12,842 devices, all fields)                 │
│                                                                                      │
│ INCLUDE IN EACH SHEET                                                                │
│ ✅ Applied filters (listed at top of each sheet)                                     │
│ ✅ Report date and time generated                                                    │
│ ✅ Generated by: david@org.com                                                       │
│ ✅ Charts (embedded in Executive Summary sheet)                                      │
│ ✅ Summary KPI section (top of each sheet)                                           │
│ ☐ Device photos                                                                     │
│                                                                                      │
│ CURRENT FILTERS APPLIED                                                              │
│ This export will include only: Department = Finance, Region = AMER                  │
│ ○ Export filtered data only (1,204 devices)                                         │
│ ● Export all data (12,842 devices) — ignore current filters                         │
│                                                                                      │
│ ─────────────────────────────────────────────────────────────────────────────────── │
│ ⓘ Large exports (>10,000 rows) will be processed in the background. You will        │
│   receive an email when the download is ready in the Download Center.               │
│                                                                                      │
│                                   [Cancel]  [Generate Excel Report →]               │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Executive PDF Export Modal

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Export Executive Dashboard PDF                                  [  ✕ Close ]         │
│ ─────────────────────────────────────────────────────────────────────────────────── │
│                                                                                      │
│ PDF CONTENT                                                                          │
│ ✅ Cover page (org name, date, preparer)                                             │
│ ✅ Executive Scorecard (6 KPIs with trend arrows)                                   │
│ ✅ Top 5 Risks                                                                       │
│ ✅ Recommended Actions                                                               │
│ ✅ Compliance Trend Chart (6 months)                                                 │
│ ✅ Lifecycle Distribution Chart                                                      │
│ ✅ Department Health Comparison                                                      │
│ ✅ Region Health Summary                                                             │
│ ☐ Full device tables (makes PDF very long)                                          │
│                                                                                      │
│ BRANDING                                                                             │
│ Logo  [Upload logo ▾]  [Current: org-logo.png]                                     │
│ Cover title  [macOS Fleet Health Report — June 2026     ]                            │
│ Prepared by  [IT Operations Team                        ]                            │
│                                                                                      │
│                                              [Cancel]  [Generate PDF →]             │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Excel Workbook Structure

### Workbook Metadata (all sheets, rows 1–4)

```
Row 1: [ORG LOGO]        Mac Fleet Health Report
Row 2: Generated:        Jun 1, 2026 09:42 AM UTC
Row 3: Generated by:     david@org.com
Row 4: Filters applied:  Department = Finance | Region = AMER
Row 5: [blank]
```

---

### Sheet 1 — Executive Summary

| Section | Content |
|---|---|
| Rows 6–12 | Fleet Health Scorecard — 6 KPI boxes |
| Rows 13–15 | Reporting period and comparison period |
| Rows 16–26 | 6-month Compliance Trend Chart (embedded) |
| Rows 27–32 | Top 5 Risks (bulleted, red highlight) |
| Rows 33–38 | Recommended Actions (bulleted, blue highlight) |
| Rows 39–45 | Department Health Comparison (bar chart) |
| Rows 46–52 | Region Health Summary table |

**Cell formatting:**
- KPI values: 28pt bold, center-aligned, color-coded (green/amber/red)
- Risk items: Red background `#FEE2E2`, bold text
- Recommended actions: Blue background `#EFF6FF`

---

### Sheet 2 — Patch Compliance

| Row | Content |
|---|---|
| 1–4 | Metadata block |
| 5 | Summary: Total devices, fully patched, missing critical |
| 6 | [blank] |
| 7 | Table header (bold, dark bg, white text) |
| 8+ | Data rows (alternating row shading) |
| Last | Totals row |

**Columns:** Device Name, Assigned User, Department, Region, OS Version, Missing Patches, Missing Critical, Last Patch Date, Patch Compliance %, Risk Level

**Conditional formatting:**
- Patch Compliance %: Color scale — red 0%, yellow 50%, green 100%
- Risk Level: "Critical" cells = red bg, "High" = orange bg, "Low" = green bg
- Missing Critical > 0: Cell highlighted red

---

### Sheet 3 — Stale Devices

**Columns:** Device Name, Assigned User, Department, Region, Office/Location, Last Check-In Date, Last Login Date, Device Status, Days Stale

**Conditional formatting:**
- Days Stale: Color scale — green 0, yellow 14, orange 30, red 60+
- Status: "Inactive" = red, "Stale" = orange

---

### Sheet 4 — Outdated macOS

**Columns:** Device Name, Assigned User, Department, Region, Current OS Version, Latest Available, Versions Behind, Upgrade Eligible, Compliance Status

**Conditional formatting:**
- Versions Behind: 0 = green, 1 = yellow, 2 = orange, 3+ = red
- Upgrade Eligible: "Hardware Limit" = orange bg

---

### Sheet 5 — EOL Devices

**Columns:** Device Name, Model, Assigned User, Department, Region, Purchase Date, Warranty Status, Apple Support Status, EOL Date, Days Until EOL, Replacement Priority, Risk Level

**Conditional formatting:**
- Days Until EOL: Negative (past EOL) = dark red bg, 0–30 = red, 31–90 = orange
- Warranty Status: "Expired" = orange bg
- Replacement Priority: "Immediate" = red, "High" = orange

---

### Sheet 6 — Region Summary

**Columns:** Region, Sub-Region, City/Office, Device Count, Health Score, Patch Compliance %, Stale %, Outdated macOS %, EOL Devices

**Chart:** Horizontal bar chart of Health Score by region (embedded, sortable).

---

### Sheet 7 — Raw Device Data

All enrolled macOS devices, all available fields. Used for custom analysis by data teams.

**Columns (40+ fields):**
Device Name, Serial Number, Model, Purchase Date, Assigned User, User Email, Department, Manager, Group, Region (from tag), Country (from tag), Office (from tag), OS Version, OS Build, Enrollment Date, Last Check-In, Last Login, Compliance State, Primary Issue, Patch Count Missing, Critical Patches Missing, Last Patch Date, FileVault Status, EDR Status, Firewall Status, Management Source, Blueprint, EOL Date, Warranty Status, Asset Tag, ...

---

## 10. Scheduled Reports

### Schedule Configuration Page

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ Scheduled Reports                                                    [+ New Schedule]│
│ Automatically generate and deliver fleet health reports on a recurring schedule     │
│ ─────────────────────────────────────────────────────────────────────────────────── │
│                                                                                      │
│ ACTIVE SCHEDULES                                                                     │
│ ┌──────────────────────────┬─────────────┬────────────┬────────────┬───────────────┐│
│ │ Report Name              │ Frequency   │ Recipients │ Format     │ Actions       ││
│ ├──────────────────────────┼─────────────┼────────────┼────────────┼───────────────┤│
│ │ Monthly Executive Report │ Monthly, 1st│ 4 people   │ PDF + Excel│ Edit Pause ···││
│ │ Weekly Patch Status      │ Weekly, Mon │ IT Team    │ Excel      │ Edit Pause ···││
│ │ Daily Stale Device Alert │ Daily, 8am  │ 2 people   │ Email      │ Edit Pause ···││
│ │ Quarterly EOL Forecast   │ Quarterly   │ CIO Office │ PDF        │ Edit Pause ···││
│ └──────────────────────────┴─────────────┴────────────┴────────────┴───────────────┘│
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### New Schedule Modal

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Schedule a Report                                               [  ✕ Close ]         │
│ ─────────────────────────────────────────────────────────────────────────────────── │
│                                                                                      │
│ REPORT DETAILS                                                                       │
│ Report Name    [Monthly Fleet Health Report                         ]                │
│ Report Type    [Executive Summary PDF ▾]                                            │
│ Saved View     [None — all devices ▾]                                               │
│                                                                                      │
│ SCHEDULE                                                                             │
│ Frequency      ○ Daily  ○ Weekly  ● Monthly  ○ Quarterly                            │
│ Day            [1st of the month ▾]                                                 │
│ Time           [09:00 AM ▾]   Timezone [UTC ▾]                                     │
│ Start Date     [Jun 1, 2026 📅]   End Date [No end date ▾]                         │
│                                                                                      │
│ DELIVERY                                                                             │
│ ✅ Email       Recipients: [david@org.com, cto@org.com            + Add]            │
│ ☐ Slack        Channel: [#it-reports ▾]                                            │
│ ☐ Teams        Channel: [Select channel ▾]                                         │
│ ✅ Download Center  (always saved here regardless of above)                         │
│                                                                                      │
│ EMAIL SUBJECT  [Mac Fleet Report — {Month} {Year}               ]                   │
│ EMAIL MESSAGE  [Please find the monthly macOS fleet health report attached.    ]    │
│                                                                                      │
│                                              [Cancel]  [Save Schedule]              │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Delivery Methods Summary

| Method | Notes |
|---|---|
| Email | PDF and/or Excel attachment. Supports multiple recipients. |
| Slack | Posts summary card to channel with download link. Requires Slack integration. |
| Microsoft Teams | Posts adaptive card to channel with download link. Requires Teams integration. |
| Download Center | Always stored — accessible at Platform → Downloads (30-day retention). |

---

## 11. AI Insights Panel

### Placement

The AI Insights panel appears as a collapsible section at the top of the Overview tab, and as a compact sidebar widget on other tabs.

### Overview Tab — AI Insights (expanded)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ ✦ AI Insights                                                   ● 4 new  [Collapse] │
│ Powered by Iru AI — analysis based on your fleet data as of Jun 1, 2026            │
│ ─────────────────────────────────────────────────────────────────────────────────── │
│                                                                                      │
│ CRITICAL                                                                             │
│ ① 247 devices are missing critical security patches — including 3 CVEs rated 9.8+  │
│   Affected departments: Finance (89), Legal (67), Marketing (91)                   │
│   ► Recommended: Run emergency patch campaign for top 3 CVEs. Est. 2h admin time.  │
│   [Schedule Patch Campaign]  [View Affected Devices]                                │
│                                                                                      │
│ HIGH                                                                                 │
│ ② 56 devices have not checked in for more than 30 days — possible abandonment      │
│   Highest concentration: EMEA - London HQ (19 devices), APAC - Singapore (12)     │
│   ► Recommended: Send check-in reminder to users. Mark 8 devices with 90d+ as lost.│
│   [Send Bulk Reminder]  [View Stale Devices]                                        │
│                                                                                      │
│ ③ 34 MacBooks will reach hardware End-of-Life within 90 days                       │
│   Estimated replacement budget required: $68,000 – $102,000                        │
│   ► Recommended: Generate budget request and submit to procurement by Jun 15.       │
│   [Generate Budget Forecast]  [View EOL Devices]                                    │
│                                                                                      │
│ OPPORTUNITY                                                                          │
│ ④ Upgrading 2,104 Ventura (macOS 13) devices to Sonoma would improve fleet         │
│   compliance score from 71.7% to approximately 81.4% (+13.5%).                     │
│   All 2,104 devices are hardware-eligible for the upgrade.                          │
│   ► Recommended: Schedule batch upgrade during low-usage windows (weekends).        │
│   [Schedule OS Upgrade Campaign]  [View Outdated Devices]                           │
│                                                                                      │
│ ─────────────────────────────────────────────────────────────────────────────────── │
│ ✦ Ask Iru AI: [What is causing the compliance score drop this month?       ] [Ask]  │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Compact AI Insights Widget (other tabs)

```
┌──────────────────────────────────────────────────────────┐
│ ✦ AI Insights for this report              ● 2 insights  │
│                                                          │
│ ① Finance dept. has 89 devices missing critical patches. │
│   This accounts for 36% of all critical patch gaps.      │
│   [Schedule Finance Patch Campaign]                      │
│                                                          │
│ ② EMEA region has the lowest patch compliance (61%).      │
│   London HQ is the primary driver (-8% below EMEA avg). │
│   [View London HQ Devices]                               │
│                                                          │
│ [See All Insights →]                                     │
└──────────────────────────────────────────────────────────┘
```

### AI Insight Types

| Type | Color | Priority |
|---|---|---|
| Critical | Red `#EF4444` | Immediate action required |
| High | Orange `#F59E0B` | Action required within 7 days |
| Medium | Amber `#D97706` | Action within 30 days |
| Opportunity | Blue `#3B82F6` | Proactive improvement available |

---

## 12. User Journeys

### Journey 1 — macOS Administrator: Morning Patch Review

```
PERSONA: macOS Admin — daily patch triage

STEP 1: Open platform
  └── AI Insights badge shows ● 4 new insights
  └── Admin clicks AI Insights → reads "247 critical patches missing"

STEP 2: Navigate to Patch Compliance tab
  └── Quick filter: [Missing Critical]
  └── Table shows 247 devices, sorted by Risk Level desc

STEP 3: Review Finance department (AI highlighted it)
  └── Add filter: Department = Finance
  └── 89 Finance devices, 7 with missing CVSS 9.8+ patches

STEP 4: Bulk action
  └── Sort by "Missing Critical" desc, select top 20
  └── [Schedule Update] → Modal: Schedule for tonight 11 PM, notify users

STEP 5: Export evidence
  └── [Export ▾] → CSV of current filtered view
  └── Sends to change management ticket

TOTAL TIME: ~8 minutes
```

### Journey 2 — IT Manager: Monthly Board Deck Preparation

```
PERSONA: IT Manager — monthly reporting to leadership

STEP 1: Navigate to Mac Fleet Reports → Executive Summary tab
  └── Reviews all 6 KPI scores
  └── Notes Compliance Score dropped 2.1 points

STEP 2: Investigate the drop
  └── AI Insights: "EOL devices increased 8 units this month"
  └── Clicks Region View → sees EMEA degraded most

STEP 3: Generate executive PDF
  └── [Export ▾] → Executive Dashboard PDF
  └── Selects: cover page + scorecard + charts + top risks + recommended actions
  └── Uploads org logo, sets title: "IT Fleet Health — Board Update Q2 2026"
  └── [Generate PDF →]

STEP 4: Schedule monthly automation
  └── [Schedule] → Monthly, 1st of month, 8 AM
  └── Recipients: CIO, VP IT, CFO (for budget section)
  └── Format: PDF → Email

TOTAL TIME: ~12 minutes
```

### Journey 3 — Compliance Officer: EOL Audit

```
PERSONA: Compliance Officer — quarterly device lifecycle audit

STEP 1: Navigate to EOL Devices tab
  └── Tab filter: [Already EOL] = 42 devices

STEP 2: Review Already-EOL devices
  └── Sorted by Risk Level: 8 Critical (no security updates for 1+ year)
  └── Notes: 3 in Legal, 3 in Finance — high-sensitivity departments

STEP 3: Generate budget forecast
  └── Select all 42 Already-EOL + 89 EOL-within-90-days = 131 devices
  └── Bulk action: [Budget Forecast]
  └── Modal shows: Estimated total $261,869 for replacement

STEP 4: Export and escalate
  └── [Download PDF Forecast] from modal
  └── [Export to Excel] for procurement team
  └── Creates replacement request for IT leadership

STEP 5: Schedule quarterly report
  └── Schedule: Quarterly (last week of each quarter)
  └── Recipients: CISO, CFO, Procurement
  └── Format: Excel workbook (all sheets)

TOTAL TIME: ~20 minutes
```

### Journey 4 — CIO: Regional Health Review

```
PERSONA: CIO — strategic fleet health overview by region

STEP 1: Open Executive Summary tab (pre-set as homepage for CIO persona)
  └── Sees 6 KPI scores immediately: Fleet Health 72, Compliance 71.7%...
  └── AI Insight: "EMEA has the lowest regional health score (68/100)"

STEP 2: Navigate to Region View tab
  └── Sees regional breakdown: AMER 74, EMEA 68, APAC 71
  └── Drills into EMEA → London HQ is the primary driver of EMEA's low score

STEP 3: Drill into London HQ
  └── Clicks "London HQ" row → filtered Patch Compliance table for London HQ
  └── 842 devices, 34% compliance score — well below 70% target

STEP 4: Delegate action
  └── [Schedule] → Schedules weekly EMEA fleet report
  └── Recipients: EMEA IT Lead
  └── [Export ▾] → Executive PDF of EMEA-only data

TOTAL TIME: ~6 minutes
```

---

## 13. Component Specifications

### Matching Enterprise MDM Products (ManageEngine, Jamf, Intune, NinjaOne)

| Component | Specification |
|---|---|
| KPI card | White bg, 1px border `#E5E7EB`, 8px radius, 28pt bold value, 12px label, color-coded accent left border (4px) |
| Table row height | 44px default, 36px compact mode |
| Table header | 11px uppercase, `#6B7280`, light gray bg `#F9FAFB` |
| Status chip / badge | Pill shape, 6px radius, 12px font, category-specific colors (see §5) |
| Severity bar | 8-segment horizontal bar, matching iru/ManageEngine pattern |
| Chart colors | Primary: `#7C5CFC` purple; Severity: red `#EF4444`, orange `#F59E0B`, amber `#D97706`, green `#10B981` |
| Filter panel | 280px wide, right-anchored slide-in, `z-index: 40` |
| Active filter pill | Outlined, close `×` icon, purple border when applied |
| Export button | Primary outlined button with caret `▾`, dropdown on click |
| AI Insights box | Subtle gradient bg `linear-gradient(135deg, #F5F3FF, #EFF6FF)`, purple icon `✦` |
| Pagination | `|← ←  N of N  → →|` footer, matches iru platform |

### Responsive Breakpoints

| Breakpoint | Layout Change |
|---|---|
| 1440px+ | Full layout — side panel + main content, 3-column KPI grid |
| 1280px | 2-column KPI grid, side panel collapses to icon |
| 1024px | Single column KPIs, table columns reduced (hide Region, hide Actions inline) |
| 768px | Mobile view — tabs hidden, menu replaces nav, table becomes cards |

### Performance Requirements (100,000+ device scale)

| Concern | Solution |
|---|---|
| Dashboard load time | Pre-aggregated metrics updated every 15 minutes; KPI cards load from cache |
| Table rendering | Virtual scrolling — only render visible rows (windowed list) |
| Filter performance | Server-side filtering with debounced API calls (300ms) |
| Export large datasets | Background job; email notification when ready; 5-minute timeout |
| Charts | Data sampled at 500 points max for display; full data in export |
| AI Insights | Computed nightly; cached; "Last analyzed: X hours ago" shown |

---

## 14. Implementation Notes

### Tag Parsing Service (Region Feature)

Backend service that processes device tags on each sync:

```
Input:  raw tags array from MDM/ManageEngine API
        e.g., ["region:emea", "location:london", "office:london-hq", "department:finance"]

Processing:
  1. Split each tag on first ":" delimiter
  2. Match prefix against configured mapping table
  3. Normalize value (lowercase, trim, replace hyphens with spaces)
  4. Apply alias lookups (e.g., "emea" → "EMEA - Europe, Middle East & Africa")
  5. Build geographic hierarchy: Region > Country > City > Office > Building

Output:  structured location object on each device record
  {
    region: "EMEA",
    country: "United Kingdom",
    city: "London",
    office: "London HQ",
    building: null,
    rawTags: ["region:emea", "location:london", "office:london-hq"]
  }
```

### EOL Date Data Source

Apple EOL dates sourced from:
1. Apple's Published Support pages
2. Internal database maintained and updated quarterly
3. Hardware model identifier → EOL date lookup table
4. Admin can override individual device EOL dates (for extended support contracts)

### Compliance Score Calculation

```
Compliance Score = weighted average of:
  Patch Compliance Score  (weight: 40%)
    = Devices with 0 missing patches / Total devices

  OS Currency Score       (weight: 30%)
    = Devices on current macOS / Total devices

  Lifecycle Score         (weight: 20%)
    = Active devices / Total devices (excludes Stale, Inactive, EOL)

  Security Score          (weight: 10%)
    = Devices with FileVault + EDR + Firewall / Total devices
```

### Excel Export Technical Spec

```
Library:        ExcelJS (Node.js) or openpyxl (Python)
Format:         .xlsx, Office Open XML
Sheet count:    7 sheets (configurable)
Max rows:       1,048,576 (Excel limit — handle with multiple files if exceeded)
Charts:         Embedded Chart XML in Executive Summary sheet
Metadata:       Custom document properties (author, created date, org, filters)
Conditional fmt: Applied server-side via ExcelJS API before export
File naming:    mac-fleet-report-{YYYY-MM-DD}-{org-slug}.xlsx
Compression:    gzip for files >5MB before email delivery
```

---

## Appendix A — Glossary

| Term | Definition |
|---|---|
| Active Device | Device that has checked in within the last 7 days |
| Stale Device | Device with no check-in for 8–30 days |
| Inactive Device | Device with no check-in for 31–90 days |
| EOL Device | Device for which Apple has ended security update support |
| Near EOL | Device reaching EOL within 90 days |
| Patch Compliance | % of devices with 0 missing security patches |
| Critical Patch | CVE patch with CVSS score ≥ 9.0, or Apple-rated Critical |
| Fleet Health Score | Composite score (0–100) across patch, OS, lifecycle, security |
| Fleet Risk Score | Inverse risk metric — higher = more risk |
| Compliance Score | Weighted average of 4 component scores (see §14) |
| MTTR | Mean Time To Remediate — avg time from detection to patch/fix |
| Device Tag | Metadata label attached to device in MDM (key:value format) |
| Region (from Tag) | Geographic attribute extracted from `region:` tag prefix |

---

## Appendix B — Changelog

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-06-01 | Product Design Team | Initial design — all 14 sections, 5 report types, region view, export workflow |

---

*End of Document. Contact the Product Design Team for questions.*
