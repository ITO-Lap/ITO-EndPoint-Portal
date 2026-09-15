from docx import Document
from docx.shared import Pt, RGBColor, Inches, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import copy

OUTPUT = "docs/ITO-Endpoint-AI-Copilot-Showcase.docx"

# ── Colours ───────────────────────────────────────────────────────────────────
NAVY   = RGBColor(0x0F, 0x1B, 0x2D)
BLUE   = RGBColor(0x1A, 0x4B, 0x8C)
ACCENT = RGBColor(0x2E, 0x6B, 0xE6)
LIGHT  = RGBColor(0xEE, 0xF3, 0xFB)
GREY   = RGBColor(0x6B, 0x72, 0x80)
WHITE  = RGBColor(0xFF, 0xFF, 0xFF)
GREEN  = RGBColor(0x05, 0x96, 0x69)
PURPLE = RGBColor(0x7C, 0x3A, 0xED)
TEAL   = RGBColor(0x08, 0x91, 0xB2)
AMBER  = RGBColor(0xD9, 0x77, 0x06)

def hex_to_str(rgb): return f"{rgb[0]:02X}{rgb[1]:02X}{rgb[2]:02X}"

def set_cell_bg(cell, rgb):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), f"{rgb[0]:02X}{rgb[1]:02X}{rgb[2]:02X}")
    tcPr.append(shd)

def set_cell_margins(cell, top=60, bottom=60, left=100, right=100):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for side, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{side}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def set_row_height(row, height_cm):
    tr = row._tr
    trPr = tr.get_or_add_trPr()
    trHeight = OxmlElement('w:trHeight')
    trHeight.set(qn('w:val'), str(int(height_cm * 567)))
    trPr.append(trHeight)

def add_colored_heading(doc, text, rgb, font_size=13):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after  = Pt(4)
    run = p.add_run(text)
    run.bold = True
    run.font.size = Pt(font_size)
    run.font.color.rgb = rgb
    return p

def add_module_table(doc, items, accent_rgb):
    for badge, name, desc in items:
        tbl = doc.add_table(rows=1, cols=2)
        tbl.style = 'Table Grid'
        tbl.alignment = WD_TABLE_ALIGNMENT.LEFT
        tbl.columns[0].width = Cm(1.5)
        tbl.columns[1].width = Cm(15.5)

        # Badge cell
        bc = tbl.rows[0].cells[0]
        set_cell_bg(bc, accent_rgb)
        set_cell_margins(bc, 60, 60, 60, 60)
        bp = bc.paragraphs[0]
        bp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        br = bp.add_run(badge)
        br.font.color.rgb = WHITE
        br.font.bold = True
        br.font.size = Pt(8)
        bc.vertical_alignment = WD_ALIGN_VERTICAL.CENTER

        # Content cell
        cc = tbl.rows[0].cells[1]
        set_cell_bg(cc, (0xEE, 0xF3, 0xFB))
        set_cell_margins(cc, 80, 80, 120, 80)

        # Module name
        np_ = cc.paragraphs[0]
        nr = np_.add_run(name)
        nr.bold = True
        nr.font.size = Pt(10)
        nr.font.color.rgb = NAVY

        # Description
        dp = cc.add_paragraph(desc)
        dp.paragraph_format.space_before = Pt(2)
        for r in dp.runs:
            r.font.size = Pt(9)
            r.font.color.rgb = RGBColor(0x37, 0x41, 0x51)

        doc.add_paragraph()  # spacer

# ── Module data ───────────────────────────────────────────────────────────────
MODULES = [
    ("Endpoint Management", BLUE, [
        ("MAC", "Mac Devices (ManageEngine)",
         "Full Mac fleet manager with five tabs — Devices, Applications, Security, Automation, and Reports. Searchable device table with configuration profile assignments, FileVault status, macOS version, and per-device compliance. Applications tab tracks per-device installed apps; reports cover fleet growth, patch compliance, and stale devices."),
        ("WIN", "Intune Devices",
         "Microsoft Intune console with Devices, Compliance, Security, Automation, Reports, and Entra ID tabs. Filter Windows / Android / iOS endpoints by encryption state and compliance policy; monitor BitLocker, Defender, and MFA coverage. Built-in automation rules and PDF/CSV report export with live Graph API integration."),
        ("WIN", "Windows Devices",
         "Consolidated Windows view pulling data from both Intune and ManageEngine into one searchable table. Patch Status tab categorises devices as Up-to-Date, Slightly Behind, At-Risk, or Critical by patch age. Includes Windows-specific automation (Critical Patch Auto-Push, BitLocker Key Escrow) and exportable patch reports."),
        ("ME",  "ManageEngine Devices",
         "Cross-platform (Windows / Linux) endpoint view powered by ManageEngine Desktop Central. Tabs for Devices, Patches, Software inventory, ManageEngine-specific automations, and coverage reports. Live device detail panel shows installed software, patch history, and quick remediation actions."),
        ("SRC", "Device Lookup",
         "Universal search across all connected sources by device name, serial number, or user email. Returns full device details — policies, compliance state, last check-in, encryption status, and assigned user. Opens device detail panel with runbook recommendations and quick-action buttons."),
        ("ALT", "Open Issues",
         "Consolidated tracker of non-compliant devices across every source, sorted by severity. Filter by Critical / High / Medium / Low, issue category, or compliance state with direct drill-down to the device. Provides affected device counts and escalation shortcuts to Jira or Slack."),
    ]),
    ("Security & Compliance", PURPLE, [
        ("SEC", "Security Posture",
         "Organisation-wide security health dashboard assessing six pillars: encryption, EDR, firewall, patching, identity, and compliance. CIS Controls coverage matrix shows Implemented / Partial / Not Started status per control with trend indicators. Risk item breakdown and platform-specific step-by-step remediation guides."),
        ("VUL", "Vulnerabilities",
         "Vulnerability and threat management module with severity-trend charts and affected device counts. Correlates CVE findings with compliance failures and EDR alerts for a unified risk view. Direct links to remediation runbooks and Jira ticket creation for tracked vulnerabilities."),
        ("EDR", "EDR (Endpoint Detection & Response)",
         "Security operations integration surfacing live threat detections from CrowdStrike / Microsoft Defender. Four tabs: Detections (MITRE ATT&CK mapping, IOCs), Incidents (grouped timeline), Response Actions (containment & remediation), Investigation (process/network/file events). Track containment actions and remediation success/failure rates per incident."),
    ]),
    ("Users & Identity", TEAL, [
        ("USR", "Users",
         "Full identity directory with stats strip — total users, active, IT staff, MFA coverage, and at-risk count. Sortable table with role badges, MFA status, per-user device compliance dots, and last activity timestamp. Expandable detail drawers show sign-in history, group membership, app licences, devices, and linked Jira tickets."),
        ("ENT", "Entra Intelligence",
         "Microsoft Entra ID / Azure AD dashboard with live Microsoft Graph API data or built-in demo mode. Sections: Overview KPIs, Users & Identity (sign-in history, risk levels, MFA), Device Directory (enrollment, encryption, check-in age), and Groups breakdown. Requires Graph API scopes: User.Read.All, DeviceManagementManagedDevices.Read.All, Group.Read.All."),
    ]),
    ("Automation", GREEN, [
        ("AUT", "Automation Engine",
         "Trigger-condition-action rule builder covering five categories: Compliance, Security, Patching, Reporting, and Drift. Rules tab shows live pipelines (e.g. Device Non-Compliant → Create Jira + Slack Notify) with enable/disable toggles and test-run capability. History tab logs every execution with success/failure rates and timestamps."),
        ("RUN", "Runbooks",
         "AI-powered remediation playbooks indexed by device issue category, with step-by-step instructions per device. Each card shows GPT-generated analysis, remediation steps, linked Jira tickets, and Confluence documentation links. Supports copy-to-clipboard steps, Jira issue creation modal, and manual execution tracking."),
        ("SCR", "Remote Scripts",
         "Two-pane script library and execution console supporting PowerShell, Bash, and Python across all platforms. Left pane: searchable library filterable by OS (Windows / macOS / Linux / Cross-platform) and script type. Right pane: script editor, parameter inputs, target device selector, and execution history with status badges."),
    ]),
    ("Analytics & Reports", AMBER, [
        ("RPT", "Reports & Analytics",
         "Pre-built report templates and custom query builder for compliance trends, inventory, patch status, and encryption coverage. Generates PDF and CSV exports with scheduling options for automated delivery to stakeholders. KPI modal lets users pin key metrics to their dashboard for at-a-glance monitoring."),
        ("LOG", "Activity Log",
         "Complete audit trail of device check-ins, policy changes, compliance transitions, automation triggers, and user actions. Filterable by date, device, user, action type, and result with real-time updates. CSV export for compliance audits and SIEM ingestion."),
        ("DIA", "Diagnostics",
         "Health-check engine with three tabs: Infrastructure (integration connectivity, latency, last sync), Device-level (per-device encryption, OS patches, security controls), and Fleet (aggregated Healthy / Warning / Critical / Unknown counts). Confidence scores and recommended actions guide triage for each check. Identifies integration issues before they affect device data freshness."),
    ]),
    ("Platform", NAVY, [
        ("SET", "Settings",
         "Central configuration hub for Integrations (Intune, Entra, ManageEngine, Jira, Confluence, Slack), notification preferences, and account management. Manage API credentials, connection status, alert thresholds, quiet hours, and data-retention policies from one place. Role-based access lets Global Admin / IT Admin / Helpdesk roles control what each user can view and action."),
        ("DOC", "Documentation",
         "In-app docs portal covering architecture, integration setup, API reference, data models, and per-feature guides. Searchable and structured by section; includes interactive examples and configuration snippets. Mirrors the /docs folder so content stays in sync with the codebase."),
    ]),
]

# ── Build ─────────────────────────────────────────────────────────────────────
doc = Document()

# Page margins
for section in doc.sections:
    section.top_margin    = Cm(1.8)
    section.bottom_margin = Cm(1.8)
    section.left_margin   = Cm(2.0)
    section.right_margin  = Cm(2.0)

# ── Cover banner ──────────────────────────────────────────────────────────────
banner = doc.add_table(rows=1, cols=1)
banner.alignment = WD_TABLE_ALIGNMENT.LEFT
cell = banner.rows[0].cells[0]
set_cell_bg(cell, NAVY)
set_cell_margins(cell, 200, 160, 200, 200)

title_p = cell.paragraphs[0]
title_r = title_p.add_run("ITO Endpoint AI Copilot")
title_r.font.size = Pt(24)
title_r.font.bold = True
title_r.font.color.rgb = WHITE

sub_p = cell.add_paragraph("Product Feature Showcase")
sub_r = sub_p.runs[0]
sub_r.font.size = Pt(13)
sub_r.font.color.rgb = RGBColor(0xA8, 0xC4, 0xF0)

desc_p = cell.add_paragraph(
    "Enterprise IT endpoint management — connect Intune & ManageEngine; "
    "surface compliance, threats, and AI-powered remediation in one platform."
)
desc_r = desc_p.runs[0]
desc_r.font.size = Pt(10)
desc_r.font.color.rgb = RGBColor(0xA8, 0xC4, 0xF0)

doc.add_paragraph()

# ── Sections ──────────────────────────────────────────────────────────────────
for group_title, group_colour, items in MODULES:
    add_colored_heading(doc, group_title, group_colour, font_size=13)
    add_module_table(doc, items, group_colour)

# ── Integrations strip ────────────────────────────────────────────────────────
p = doc.add_paragraph()
r = p.add_run("Key Integrations")
r.bold = True
r.font.size = Pt(10)
r.font.color.rgb = GREY
p.paragraph_format.space_before = Pt(6)
p.paragraph_format.space_after  = Pt(4)

integrations = ["Microsoft Intune", "ManageEngine", "Entra ID / Azure AD",
                "Jira", "Confluence", "Slack", "CrowdStrike / Defender"]
int_tbl = doc.add_table(rows=1, cols=len(integrations))
int_tbl.alignment = WD_TABLE_ALIGNMENT.LEFT
for i, label in enumerate(integrations):
    c = int_tbl.rows[0].cells[i]
    set_cell_bg(c, (0xF0, 0xF7, 0xFF))
    set_cell_margins(c, 80, 80, 80, 80)
    cp = c.paragraphs[0]
    cp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cr = cp.add_run(label)
    cr.font.size = Pt(8)
    cr.font.color.rgb = BLUE

# ── Footer ────────────────────────────────────────────────────────────────────
fp = doc.add_paragraph("\nITO Endpoint AI Copilot  •  Zinnia Technology Platform  •  Confidential")
fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
for r in fp.runs:
    r.font.size = Pt(8)
    r.font.color.rgb = GREY

doc.save(OUTPUT)
print(f"DOCX saved → {OUTPUT}")
