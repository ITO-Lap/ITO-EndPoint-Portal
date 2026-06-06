from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER

OUTPUT = "docs/ITO-Endpoint-AI-Copilot-Showcase.pdf"

# ── Colours ──────────────────────────────────────────────────────────────────
NAVY   = colors.HexColor("#0F1B2D")
BLUE   = colors.HexColor("#1A4B8C")
ACCENT = colors.HexColor("#2E6BE6")
LIGHT  = colors.HexColor("#EEF3FB")
GREY   = colors.HexColor("#6B7280")
WHITE  = colors.white

# ── Styles ────────────────────────────────────────────────────────────────────
styles = getSampleStyleSheet()

H_TITLE = ParagraphStyle("htitle", fontSize=26, textColor=WHITE,
                          fontName="Helvetica-Bold", leading=32, spaceAfter=4)
H_SUB   = ParagraphStyle("hsub",   fontSize=11, textColor=colors.HexColor("#A8C4F0"),
                          fontName="Helvetica", leading=14)
H1      = ParagraphStyle("h1",     fontSize=13, textColor=BLUE,
                          fontName="Helvetica-Bold", leading=17, spaceBefore=14, spaceAfter=4)
H2      = ParagraphStyle("h2",     fontSize=10, textColor=NAVY,
                          fontName="Helvetica-Bold", leading=14, spaceBefore=6, spaceAfter=2)
BODY    = ParagraphStyle("body",   fontSize=9,  textColor=colors.HexColor("#374151"),
                          fontName="Helvetica",   leading=14)
TAG     = ParagraphStyle("tag",    fontSize=8,  textColor=ACCENT,
                          fontName="Helvetica-Bold", leading=11)
FOOTER  = ParagraphStyle("footer", fontSize=8,  textColor=GREY,
                          fontName="Helvetica", leading=10, alignment=TA_CENTER)

# ── Module data ───────────────────────────────────────────────────────────────
MODULES = [
    # (group_title, colour, [ (icon_label, name, 3-line description) ])
    ("Endpoint Management", BLUE, [
        ("MAC", "Mac Devices (Kandji)",
         "Full Mac fleet manager with five tabs — Devices, Applications, Security, Automation, and Reports. "
         "Searchable device table with blueprint assignments, FileVault status, macOS version, and per-device compliance. "
         "App library tracks Auto App / VPP / Profile enforcements; reports cover fleet growth, patch compliance, and stale devices."),
        ("WIN", "Intune Devices",
         "Microsoft Intune console with Devices, Compliance, Security, Automation, Reports, and Entra ID tabs. "
         "Filter Windows / Android / iOS endpoints by encryption state and compliance policy; monitor BitLocker, Defender, and MFA coverage. "
         "Built-in automation rules and PDF/CSV report export with live Graph API integration."),
        ("WIN", "Windows Devices",
         "Consolidated Windows view pulling data from both Intune and ManageEngine into one searchable table. "
         "Patch Status tab categorises devices as Up-to-Date, Slightly Behind, At-Risk, or Critical by patch age. "
         "Includes Windows-specific automation (Critical Patch Auto-Push, BitLocker Key Escrow) and exportable patch reports."),
        ("ME", "ManageEngine Devices",
         "Cross-platform (Windows / Linux) endpoint view powered by ManageEngine Desktop Central. "
         "Tabs for Devices, Patches, Software inventory, ManageEngine-specific automations, and coverage reports. "
         "Live device detail panel shows installed software, patch history, and quick remediation actions."),
        ("SRC", "Device Lookup",
         "Universal search across all connected sources by device name, serial number, or user email. "
         "Returns full device details — policies, compliance state, last check-in, encryption status, and assigned user. "
         "Opens device detail panel with runbook recommendations and quick-action buttons."),
        ("ALT", "Open Issues",
         "Consolidated tracker of non-compliant devices across every source, sorted by severity. "
         "Filter by Critical / High / Medium / Low, issue category, or compliance state with direct drill-down to the device. "
         "Provides affected device counts and escalation shortcuts to Jira or Slack."),
    ]),
    ("Security & Compliance", colors.HexColor("#7C3AED"), [
        ("SEC", "Security Posture",
         "Organisation-wide security health dashboard assessing six pillars: encryption, EDR, firewall, patching, identity, and compliance. "
         "CIS Controls coverage matrix shows Implemented / Partial / Not Started status per control with trend indicators. "
         "Risk item breakdown and platform-specific step-by-step remediation guides."),
        ("VUL", "Vulnerabilities",
         "Vulnerability and threat management module with severity-trend charts and affected device counts. "
         "Correlates CVE findings with compliance failures and EDR alerts for a unified risk view. "
         "Direct links to remediation runbooks and Jira ticket creation for tracked vulnerabilities."),
        ("EDR", "EDR (Endpoint Detection & Response)",
         "Security operations integration surfacing live threat detections from CrowdStrike / Microsoft Defender. "
         "Four tabs: Detections (MITRE ATT&CK mapping, IOCs), Incidents (grouped timeline), Response Actions (containment & remediation), Investigation (process/network/file events). "
         "Track containment actions and remediation success/failure rates per incident."),
    ]),
    ("Users & Identity", colors.HexColor("#0891B2"), [
        ("USR", "Users",
         "Full identity directory with stats strip — total users, active, IT staff, MFA coverage, and at-risk count. "
         "Sortable table with role badges, MFA status, per-user device compliance dots, and last activity timestamp. "
         "Expandable detail drawers show sign-in history, group membership, app licences, devices, and linked Jira tickets."),
        ("ENT", "Entra Intelligence",
         "Microsoft Entra ID / Azure AD dashboard with live Microsoft Graph API data or built-in demo mode. "
         "Sections: Overview KPIs, Users & Identity (sign-in history, risk levels, MFA), Device Directory (enrollment, encryption, check-in age), and Groups breakdown. "
         "Requires Graph API scopes: User.Read.All, DeviceManagementManagedDevices.Read.All, Group.Read.All."),
    ]),
    ("Automation", colors.HexColor("#059669"), [
        ("AUT", "Automation Engine",
         "Trigger-condition-action rule builder covering five categories: Compliance, Security, Patching, Reporting, and Drift. "
         "Rules tab shows live pipelines (e.g. Device Non-Compliant → Create Jira + Slack Notify) with enable/disable toggles and test-run capability. "
         "History tab logs every execution with success/failure rates and timestamps."),
        ("RUN", "Runbooks",
         "AI-powered remediation playbooks indexed by device issue category, with step-by-step instructions per device. "
         "Each card shows GPT-generated analysis, remediation steps, linked Jira tickets, and Confluence documentation links. "
         "Supports copy-to-clipboard steps, Jira issue creation modal, and manual execution tracking."),
        ("SCR", "Remote Scripts",
         "Two-pane script library and execution console supporting PowerShell, Bash, and Python across all platforms. "
         "Left pane: searchable library filterable by OS (Windows / macOS / Linux / Cross-platform) and script type. "
         "Right pane: script editor, parameter inputs, target device selector, and execution history with status badges."),
    ]),
    ("Analytics & Reports", colors.HexColor("#D97706"), [
        ("RPT", "Reports & Analytics",
         "Pre-built report templates and custom query builder for compliance trends, inventory, patch status, and encryption coverage. "
         "Generates PDF and CSV exports with scheduling options for automated delivery to stakeholders. "
         "KPI modal lets users pin key metrics to their dashboard for at-a-glance monitoring."),
        ("LOG", "Activity Log",
         "Complete audit trail of device check-ins, policy changes, compliance transitions, automation triggers, and user actions. "
         "Filterable by date, device, user, action type, and result with real-time updates. "
         "CSV export for compliance audits and SIEM ingestion."),
        ("DIA", "Diagnostics",
         "Health-check engine with three tabs: Infrastructure (integration connectivity, latency, last sync), Device-level (per-device encryption, OS patches, security controls), and Fleet (aggregated Healthy / Warning / Critical / Unknown counts). "
         "Confidence scores and recommended actions guide triage for each diagnostic check. "
         "Identifies integration issues before they impact device data freshness."),
    ]),
    ("Platform", NAVY, [
        ("SET", "Settings",
         "Central configuration hub for Integrations (Intune, Entra, Kandji, ManageEngine, Jira, Confluence, Slack), notification preferences, and account management. "
         "Manage API credentials, connection status, alert thresholds, quiet hours, and data-retention policies from one place. "
         "Role-based access lets Global Admin / IT Admin / Helpdesk roles control what each user can view and action."),
        ("DOC", "Documentation",
         "In-app docs portal covering architecture, integration setup, API reference, data models, and per-feature guides. "
         "Searchable and structured by section; includes interactive examples and configuration snippets. "
         "Mirrors the /docs folder so everything stays in sync with the codebase."),
    ]),
]

# ── Build PDF ─────────────────────────────────────────────────────────────────
def build():
    doc = SimpleDocTemplate(
        OUTPUT,
        pagesize=A4,
        leftMargin=18*mm, rightMargin=18*mm,
        topMargin=16*mm, bottomMargin=16*mm,
    )
    W = A4[0] - 36*mm
    story = []

    # ── Cover banner ─────────────────────────────────────────────────────────
    banner_data = [[
        Paragraph("ITO Endpoint AI Copilot", H_TITLE),
        Paragraph("Product Feature Showcase", H_SUB),
        Paragraph("Enterprise IT endpoint management — connect Intune, Kandji &amp; ManageEngine; "
                  "surface compliance, threats, and AI-powered remediation in one platform.", H_SUB),
    ]]
    banner = Table(banner_data, colWidths=[W])
    banner.setStyle(TableStyle([
        ("BACKGROUND",  (0,0), (-1,-1), NAVY),
        ("TOPPADDING",  (0,0), (-1,-1), 18),
        ("BOTTOMPADDING",(0,0),(-1,-1), 18),
        ("LEFTPADDING", (0,0), (-1,-1), 20),
        ("RIGHTPADDING",(0,0), (-1,-1), 20),
        ("ROWBACKGROUNDS",(0,0),(-1,-1),[NAVY]),
    ]))
    story.append(banner)
    story.append(Spacer(1, 10))

    # ── Modules ───────────────────────────────────────────────────────────────
    for group_title, group_colour, items in MODULES:
        # Group header
        group_bar = Table([[Paragraph(group_title, ParagraphStyle(
            "gh", fontSize=11, textColor=WHITE, fontName="Helvetica-Bold", leading=14
        ))]], colWidths=[W])
        group_bar.setStyle(TableStyle([
            ("BACKGROUND",   (0,0),(-1,-1), group_colour),
            ("TOPPADDING",   (0,0),(-1,-1), 7),
            ("BOTTOMPADDING",(0,0),(-1,-1), 7),
            ("LEFTPADDING",  (0,0),(-1,-1), 12),
        ]))
        story.append(Spacer(1, 6))
        story.append(group_bar)
        story.append(Spacer(1, 4))

        # Item cards (2-column grid)
        cards = []
        row = []
        for i, (badge, name, desc) in enumerate(items):
            badge_p = Paragraph(badge, ParagraphStyle(
                "badge", fontSize=7, textColor=WHITE, fontName="Helvetica-Bold",
                leading=9, alignment=TA_CENTER
            ))
            badge_cell = Table([[badge_p]], colWidths=[9*mm])
            badge_cell.setStyle(TableStyle([
                ("BACKGROUND",   (0,0),(-1,-1), group_colour),
                ("TOPPADDING",   (0,0),(-1,-1), 3),
                ("BOTTOMPADDING",(0,0),(-1,-1), 3),
                ("LEFTPADDING",  (0,0),(-1,-1), 1),
                ("RIGHTPADDING", (0,0),(-1,-1), 1),
                ("ALIGN",        (0,0),(-1,-1), "CENTER"),
                ("VALIGN",       (0,0),(-1,-1), "MIDDLE"),
            ]))

            name_p = Paragraph(name, H2)
            desc_p = Paragraph(desc, BODY)

            card_inner = Table(
                [[badge_cell, [name_p, desc_p]]],
                colWidths=[11*mm, (W/2) - 19*mm],
            )
            card_inner.setStyle(TableStyle([
                ("VALIGN",       (0,0),(-1,-1), "TOP"),
                ("LEFTPADDING",  (0,0),(-1,-1), 0),
                ("RIGHTPADDING", (0,0),(-1,-1), 0),
                ("TOPPADDING",   (0,0),(-1,-1), 0),
                ("BOTTOMPADDING",(0,0),(-1,-1), 0),
            ]))

            card = Table([[card_inner]], colWidths=[(W/2) - 5*mm])
            card.setStyle(TableStyle([
                ("BACKGROUND",   (0,0),(-1,-1), LIGHT),
                ("TOPPADDING",   (0,0),(-1,-1), 8),
                ("BOTTOMPADDING",(0,0),(-1,-1), 8),
                ("LEFTPADDING",  (0,0),(-1,-1), 8),
                ("RIGHTPADDING", (0,0),(-1,-1), 8),
                ("BOX",          (0,0),(-1,-1), 0.5, colors.HexColor("#DBEAFE")),
            ]))

            row.append(card)
            if len(row) == 2 or i == len(items) - 1:
                if len(row) == 1:
                    row.append("")  # filler
                grid = Table([row], colWidths=[(W/2)-3*mm, (W/2)-3*mm], hAlign="LEFT")
                grid.setStyle(TableStyle([
                    ("VALIGN",       (0,0),(-1,-1), "TOP"),
                    ("LEFTPADDING",  (0,0),(-1,-1), 0),
                    ("RIGHTPADDING", (0,0),(-1,-1), 0),
                    ("TOPPADDING",   (0,0),(-1,-1), 0),
                    ("BOTTOMPADDING",(0,0),(-1,-1), 4),
                    ("COLPADDING",   (0,0),(-1,-1), 3),
                ]))
                story.append(KeepTogether(grid))
                row = []

    # ── Key integrations strip ─────────────────────────────────────────────
    story.append(Spacer(1, 8))
    HRFlowable(width=W, thickness=0.5, color=colors.HexColor("#DBEAFE"))
    integrations = [
        ["Microsoft Intune", "Kandji", "ManageEngine", "Entra ID / Azure AD",
         "Jira", "Confluence", "Slack", "CrowdStrike / Defender"],
    ]
    int_table = Table(integrations, colWidths=[W/8]*8)
    int_table.setStyle(TableStyle([
        ("BACKGROUND",   (0,0),(-1,-1), colors.HexColor("#F0F7FF")),
        ("FONTNAME",     (0,0),(-1,-1), "Helvetica"),
        ("FONTSIZE",     (0,0),(-1,-1), 7.5),
        ("TEXTCOLOR",    (0,0),(-1,-1), BLUE),
        ("ALIGN",        (0,0),(-1,-1), "CENTER"),
        ("TOPPADDING",   (0,0),(-1,-1), 6),
        ("BOTTOMPADDING",(0,0),(-1,-1), 6),
        ("BOX",          (0,0),(-1,-1), 0.5, colors.HexColor("#BFDBFE")),
        ("INNERGRID",    (0,0),(-1,-1), 0.3, colors.HexColor("#DBEAFE")),
    ]))
    story.append(Paragraph("Key Integrations", ParagraphStyle(
        "ki", fontSize=9, textColor=GREY, fontName="Helvetica-Bold",
        leading=12, spaceBefore=8, spaceAfter=4
    )))
    story.append(int_table)

    # ── Footer ────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 10))
    story.append(Paragraph(
        "ITO Endpoint AI Copilot  •  Zinnia Technology Platform  •  Confidential",
        FOOTER
    ))

    doc.build(story)
    print(f"PDF saved → {OUTPUT}")

build()
