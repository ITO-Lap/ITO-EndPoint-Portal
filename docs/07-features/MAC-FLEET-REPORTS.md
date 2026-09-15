# Mac Fleet Reports — Feature Guide

> **Location:** Mac Devices → Fleet Reports tab  
> **Audience:** macOS Admins · IT Managers · Compliance Officers · CIOs  
> **Data source:** Live ManageEngine API when configured; demo data otherwise

---

## What It Does

Mac Fleet Reports is an enterprise-grade reporting module inside the Mac Devices page. It gives macOS administrators and IT leadership a single view of fleet health across 18 key compliance, patch, lifecycle, and OS metrics — all clickable with drill-down data tables.

---

## Accessing It

1. Navigate to **Endpoint Management → Mac Devices** in the sidebar
2. Click the **Fleet Reports** tab (last tab, with orange BarChart icon)

---

## Architecture: 18 KPI Cards

Cards are grouped into 4 collapsible sections:

### Fleet Overview (5 cards)
| Card | What it measures |
|---|---|
| Total Devices | All enrolled macOS devices |
| Healthy Devices | Compliant + active + supported + on recent macOS |
| Requiring Action | Any device not meeting the Healthy criteria |
| Compliance Score | Weighted % across patch, OS, lifecycle, security |
| Fleet Risk Score | Composite risk metric (0–100, lower = safer) |

### Patch Health (4 cards)
| Card | What it measures |
|---|---|
| Fully Patched | Zero missing patches, severity = Low |
| Missing Critical Patches | Severity = Critical and non-compliant |
| Missing Security Updates | Severity = High and non-compliant |
| Missing App Updates | Severity = Medium and non-compliant |

### Device Lifecycle (5 cards)
| Card | Definition |
|---|---|
| Active | Checked in within 7 days |
| Stale | No check-in for 8 days to the configured stale threshold |
| Inactive | No check-in for 31–90 days |
| EOL Devices | macOS major version Apple no longer updates (10, 11) |
| Near EOL | macOS major version approaching EOL (12 / Monterey) |

### OS Health (4 cards)
| Card | Definition |
|---|---|
| On Current Version | Running macOS 15.x (Tahoe) |
| 1 Version Behind | Running macOS 14.x (Sonoma) |
| 2+ Versions Behind | Running macOS 13.x or older |
| Latest macOS Version | Informational: shows current macOS name + version |

---

## KPI Card Interaction

**Click any card** → opens a modal overlay with:

| Section | Description |
|---|---|
| KPI header | Name, live value, description, group label |
| Meta strip | Applied filters, generated timestamp, record count |
| Search bar | Client-side search across all device fields |
| Column toggle | Show/hide columns per preference |
| Device table | Sortable, paginated (20/page), color-coded cells |
| Export button | Download Excel with Summary, Device Details, Recommendations sheets |

**Modal is rendered via React Portal** — bypasses any stacking context issues from the parent tab.

---

## AI Insights Panel

The **AI Insights** button is always visible in the header. It analyses the live device data and produces:

1. **Fleet health summary** — always shown (e.g., "97% of 454 devices are compliant")
2. **Critical patch alerts** — if any Critical severity non-compliant devices exist
3. **High severity patches** — if any High severity gaps exist
4. **Stale check-in warning** — if any devices exceed the stale threshold
5. **EOL / Near EOL warning** — if any devices are past or approaching Apple EOL
6. **macOS currency opportunity** — if devices are 1+ versions behind current macOS

**States:**
- Green `All Clear` badge → fleet is healthy, no actionable issues
- Purple `N actions` badge → N items require attention

---

## Excel Export

Each KPI modal has an **Export Excel** button that generates a `.xls` file with 3 sheets:

| Sheet | Content |
|---|---|
| Summary | KPI name, value, generated date, user, filters, risk breakdown |
| Device Details | Full device table for that KPI with conditional formatting |
| Recommendations | Per-device recommended actions sorted by risk priority |

**File naming:** `KPI_Name_Report_YYYY-MM-DD.xls`

---

## Stale Threshold

The **Stale: [N]d** selector in the header controls the check-in threshold for the Stale Devices KPI card. Options: 7, 14, 30, 60, 90 days. Default: 30 days.

---

## Technical Architecture

```
MacFleetReportsPage (src/pages/MacFleetReportsPage.tsx)
  ├── AiInsightsButton          — dropdown panel with fleet analysis
  ├── SectionHeader             — collapsible KPI group header
  ├── KpiCard                   — individual clickable KPI card
  │     └── onClick → KpiModal  — portal-rendered drill-down modal
  │
  └── KpiModal (src/components/reports/KpiModal.tsx)
        ├── Search / Sort / Pagination
        ├── Column visibility toggle
        ├── CellValue (colored status chips)
        └── Export Excel → generateKpiExcel()

KPI Configuration (src/lib/kpiConfig.ts)
  └── KPI_CONFIGS[kpiId]
        ├── filterFn(devices, opts) → filtered dataset
        ├── getValue(devices, opts) → display value
        ├── columns[]             → table column definitions
        ├── getRecommendedAction(device) → Excel Recommendations sheet
        └── getRiskLevel(device) → conditional formatting color

Export Engine (src/lib/kpiExport.ts)
  └── generateKpiExcel(options)
        ├── buildSummarySheet()
        ├── buildDeviceDetailsSheet()  ← conditional cell formatting
        └── buildRecommendationsSheet()
```

---

## Adding a New KPI Card

1. Add a new `KpiId` to the union type in `src/lib/kpiConfig.ts`
2. Add the `KpiConfig` object to `KPI_CONFIGS` with `filterFn`, `getValue`, `columns`, `getRecommendedAction`, `getRiskLevel`
3. Add the ID to `KPI_IDS_BY_GROUP` under the correct group
4. The card, modal, and export all work automatically — no additional code needed

---

## Related Docs
- [Mac Fleet Reports Design Guide](../Mac-Fleet-Reports-Design-Guide.md) — full wireframe specification (1500+ lines)
- [Mac Devices Feature Guide](MAC-DEVICES.md) — parent page context
