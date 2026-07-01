# Endpoint Detection & Response (EDR) — Feature Guide

> **Status:** Design Specification — Ready for Engineering Implementation  
> **Full design doc:** [EDR-User-Guide.md](../EDR-User-Guide.md) (961 lines, wireframes + IA + user flows)  
> **Audience:** SOC Analysts · Security Engineers · IT Managers

---

## What It Is

The EDR module introduces a complete Endpoint Detection & Response capability into ITO Endpoint. It provides SOC analysts with a dedicated workspace for:

- Monitoring live threat detections in real time
- Managing security incidents across multiple endpoints
- Conducting forensic investigations (process tree, event timeline, threat intel)
- Executing containment and remediation response actions

---

## Navigation Placement

EDR lives in a dedicated **Detection & Response** navigation group — separate from Endpoint Management and Security & Compliance. This gives SOC analysts their own entry point.

```
DETECTION & RESPONSE
├── EDR Overview          (dashboard: incidents, detections, MTTR, MITRE coverage)
├── Detections            (live triage queue)
├── Incidents             (case management)
└── Response Center       (action execution + audit trail)
```

---

## Key Distinction from Existing Modules

| Module | Purpose | Audience |
|---|---|---|
| Threats (existing) | Passive threat intelligence feed | Security Engineers |
| Vulnerabilities (existing) | CVE tracking | Security Engineers |
| **EDR → Detections** | **Live operational detection queue** | **SOC Analysts** |
| **EDR → Incidents** | **Multi-device case management** | **SOC Analysts** |
| **EDR → Investigation** | **Forensic root-cause analysis** | **SOC Analysts** |
| **EDR → Response Center** | **Containment execution + audit** | **SOC Analysts** |

---

## Module Pages

### 1. EDR Overview Dashboard
- 6 KPI cards: Active Incidents · Endpoints Under Investigation · Active Detections · Isolated Devices · Automated Responses · MTTR
- Detection Trend chart (line, multi-severity)
- Incident Severity Distribution (donut)
- MITRE ATT&CK Coverage heatmap
- Response Actions Over Time (stacked bar)

### 2. Detections Page
- Sub-tabs: Detections | Rules
- Real-time detection stream (sortable, filterable, paginated)
- Columns: Detection ID · Name · Endpoint · User · MITRE Technique · Severity · Source · Timestamp · Status
- **Row click → Detection Detail Popup** (read-only, single `[✕ Close]` action)

### 3. Incidents Page
- Sub-tabs: Incidents | Detections
- Case management list
- Columns: Incident ID · Title · Affected Devices/Users · Severity · Status · Owner · Created · Updated
- **Row click → Incident Detail Popup** (read-only, `[✕ Close]` + text link → Investigation View)

### 4. Investigation View (full page)
Launched from "→ Open Full Investigation View" text link in Incident popup:
- **Event Timeline** — Process Execution · File Activity · Registry Changes · Network · User Actions
- **Process Tree** — Parent/child process relationships, color-coded by risk
- **Device Context** — Hostname, user, OS, risk score, last seen (per affected device)
- **Threat Intel** — File hash reputation, IP reputation, domain reputation, campaign attribution

### 5. Response Center
- Active Response Actions table (live queue)
- Response History table (audit trail)
- `[+ Manual Action]` → Response Action Palette (slide-in panel)
- Available actions: Isolate Device · Kill Process · Quarantine File · Block Hash · Block IP · Disable User Session · Restore Device
- **Row click → Response Action Detail Popup** (read-only, `[✕ Close]`)

---

## Popup Pattern (UX Rule)

Every table row in the EDR module opens a **read-only popup** with a single `[✕ Close]` button. No action buttons appear inside popups — actions live exclusively in Response Center.

**Exception:** Incident Detail popup contains a "→ Open Full Investigation View" text link (not a button).

---

## Threats Page Integration

The existing Threats page gains 3 hover-visible text links per row:
- **Create Incident** — opens pre-filled New Incident form
- **Open Investigation** — navigates to Investigation View for this device
- **Respond** — opens Response Action Palette pre-filled with device

No structural changes to the Threats page — these are entry points only.

---

## Device Detail Integration

Four new tabs added to existing Device Detail pages:
- **Detections** — scoped detections for this device
- **Incidents** — scoped incidents for this device
- **Timeline** — condensed 50-event timeline
- **Response Actions** — all actions taken against this device

All tabs follow the same popup pattern.

---

## User Flow: Detection → Resolution

```
1. Detection auto-created → appears in Detections table
2. Analyst clicks row → Detection Detail Popup (read-only)
3. Analyst creates incident (via Threats page or Incidents page)
4. Incident assigned to analyst
5. Analyst opens Incident Detail Popup → clicks "Open Full Investigation"
6. Investigation View: reviews Event Timeline, Process Tree, Threat Intel
7. Analyst navigates to Response Center → executes Isolate Device
8. Containment confirmed → additional actions as needed
9. Forensics complete → Restore Device → Incident closed
10. MTTR captured on EDR Overview dashboard
```

---

## Implementation Notes

- The EDR module is **design-approved but not yet implemented in code**
- All wireframes, page hierarchy, popup specs, and user flows are documented in [EDR-User-Guide.md](../EDR-User-Guide.md)
- The design matches the iru platform's visual language (matching Threats page patterns)
- Backend would require new routes: `server/src/routes/edr.ts` with detection, incident, investigation, and response endpoints
- MITRE ATT&CK heatmap requires no external library — CSS grid only

---

## Related Docs
- [EDR User Guide](../EDR-User-Guide.md) — complete wireframe specification (961 lines)
- [Threats Page](DASHBOARD.md) — existing threat intelligence feed
- [Automation Engine](AUTOMATION-ENGINE.md) — automated response rules
