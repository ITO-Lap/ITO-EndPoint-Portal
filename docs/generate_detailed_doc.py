from docx import Document
from docx.shared import Pt, RGBColor, Inches, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

OUTPUT = "docs/ITO-Endpoint-AI-Copilot-Full-Documentation.docx"

# ── Colours ───────────────────────────────────────────────────────────────────
NAVY   = (0x0F, 0x1B, 0x2D)
BLUE   = (0x1A, 0x4B, 0x8C)
ACCENT = (0x2E, 0x6B, 0xE6)
LIGHT  = (0xEE, 0xF3, 0xFB)
GREY   = (0x6B, 0x72, 0x80)
WHITE  = (0xFF, 0xFF, 0xFF)
GREEN  = (0x05, 0x96, 0x69)
PURPLE = (0x7C, 0x3A, 0xED)
TEAL   = (0x08, 0x91, 0xB2)
AMBER  = (0xD9, 0x77, 0x06)
RED    = (0xDC, 0x26, 0x26)
DARK   = (0x1F, 0x29, 0x37)

def rgb(t): return RGBColor(t[0], t[1], t[2])
def hex3(t): return f"{t[0]:02X}{t[1]:02X}{t[2]:02X}"

def set_cell_bg(cell, t):
    tc = cell._tc; tcPr = tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear'); shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hex3(t)); tcPr.append(shd)

def cell_margins(cell, top=80, bottom=80, left=120, right=120):
    tc = cell._tc; tcPr = tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for s, v in [('top',top),('bottom',bottom),('left',left),('right',right)]:
        n = OxmlElement(f'w:{s}'); n.set(qn('w:w'), str(v)); n.set(qn('w:type'), 'dxa')
        tcMar.append(n)
    tcPr.append(tcMar)

def remove_cell_border(cell):
    tc = cell._tc; tcPr = tc.get_or_add_tcPr()
    tcBorders = OxmlElement('w:tcBorders')
    for side in ['top','left','bottom','right','insideH','insideV']:
        b = OxmlElement(f'w:{side}')
        b.set(qn('w:val'), 'none'); b.set(qn('w:sz'), '0')
        b.set(qn('w:space'), '0'); b.set(qn('w:color'), 'auto')
        tcBorders.append(b)
    tcPr.append(tcBorders)

doc = Document()
# Page setup
for sec in doc.sections:
    sec.top_margin = Cm(1.8); sec.bottom_margin = Cm(1.8)
    sec.left_margin = Cm(2.0); sec.right_margin = Cm(2.0)

# ── Helpers ───────────────────────────────────────────────────────────────────
def para(text='', bold=False, size=10, colour=DARK, align=WD_ALIGN_PARAGRAPH.LEFT,
         space_before=0, space_after=4, italic=False):
    p = doc.add_paragraph()
    p.alignment = align
    p.paragraph_format.space_before = Pt(space_before)
    p.paragraph_format.space_after  = Pt(space_after)
    if text:
        r = p.add_run(text)
        r.bold = bold; r.italic = italic
        r.font.size = Pt(size); r.font.color.rgb = rgb(colour)
    return p

def cover_banner():
    t = doc.add_table(rows=1, cols=1); t.alignment = WD_TABLE_ALIGNMENT.LEFT
    c = t.rows[0].cells[0]
    set_cell_bg(c, NAVY); cell_margins(c, 200, 180, 220, 220)
    p1 = c.paragraphs[0]
    r1 = p1.add_run("EndPoint+")
    r1.font.size = Pt(26); r1.bold = True; r1.font.color.rgb = rgb(WHITE)
    p2 = c.add_paragraph("Full Product & Feature Documentation")
    p2.runs[0].font.size = Pt(13); p2.runs[0].font.color.rgb = RGBColor(0xA8,0xC4,0xF0)
    p3 = c.add_paragraph(
        "Comprehensive guide covering every module, connector, feature comparison, "
        "and advantage analysis — Intune · ManageEngine · Entra ID · IRU")
    p3.runs[0].font.size = Pt(10); p3.runs[0].font.color.rgb = RGBColor(0xA8,0xC4,0xF0)
    doc.add_paragraph()

def section_bar(title, colour=BLUE):
    doc.add_paragraph()
    t = doc.add_table(rows=1, cols=1); t.alignment = WD_TABLE_ALIGNMENT.LEFT
    c = t.rows[0].cells[0]; set_cell_bg(c, colour); cell_margins(c, 90, 90, 140, 140)
    p = c.paragraphs[0]
    r = p.add_run(title); r.font.size = Pt(14); r.bold = True; r.font.color.rgb = rgb(WHITE)
    doc.add_paragraph()

def sub_section(title, colour=BLUE):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(10); p.paragraph_format.space_after = Pt(3)
    r = p.add_run(title); r.bold = True; r.font.size = Pt(12); r.font.color.rgb = rgb(colour)

def h3(title, colour=DARK):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(7); p.paragraph_format.space_after = Pt(2)
    r = p.add_run(title); r.bold = True; r.font.size = Pt(10); r.font.color.rgb = rgb(colour)

def body(text, space_after=4):
    p = doc.add_paragraph(text)
    p.paragraph_format.space_before = Pt(1); p.paragraph_format.space_after = Pt(space_after)
    for r in p.runs: r.font.size = Pt(9.5); r.font.color.rgb = rgb(DARK)
    return p

def bullet(text, level=0):
    p = doc.add_paragraph(style='List Bullet')
    p.paragraph_format.space_before = Pt(1); p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.left_indent = Inches(0.2 + level * 0.2)
    r = p.add_run(text); r.font.size = Pt(9.5); r.font.color.rgb = rgb(DARK)

def divider():
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(4); p.paragraph_format.space_after = Pt(4)
    pPr = p._p.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'), 'single'); bottom.set(qn('w:sz'), '4')
    bottom.set(qn('w:space'), '1'); bottom.set(qn('w:color'), 'DBEAFE')
    pBdr.append(bottom); pPr.append(pBdr)

def comparison_table(headers, rows, col_widths=None):
    n = len(headers)
    t = doc.add_table(rows=1+len(rows), cols=n)
    t.style = 'Table Grid'; t.alignment = WD_TABLE_ALIGNMENT.LEFT
    if col_widths:
        for i, w in enumerate(col_widths):
            for cell in [t.rows[r].cells[i] for r in range(len(rows)+1)]:
                cell.width = Cm(w)
    # Header row
    for i, h in enumerate(headers):
        c = t.rows[0].cells[i]; set_cell_bg(c, NAVY); cell_margins(c)
        p = c.paragraphs[0]; r = p.add_run(h)
        r.bold = True; r.font.size = Pt(9); r.font.color.rgb = rgb(WHITE)
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    # Data rows
    for ri, row in enumerate(rows):
        bg = (0xF8,0xFB,0xFF) if ri % 2 == 0 else WHITE
        for ci, val in enumerate(row):
            c = t.rows[ri+1].cells[ci]; set_cell_bg(c, bg); cell_margins(c)
            p = c.paragraphs[0]
            is_first = (ci == 0)
            r = p.add_run(str(val)); r.bold = is_first; r.font.size = Pt(9)
            r.font.color.rgb = rgb(BLUE if is_first else DARK)
    doc.add_paragraph()

def feature_table(title_col, items_col, colour=BLUE):
    """Two-col mini table: Feature | Detail"""
    t = doc.add_table(rows=1, cols=2)
    t.style = 'Table Grid'; t.alignment = WD_TABLE_ALIGNMENT.LEFT
    t.columns[0].width = Cm(5); t.columns[1].width = Cm(12)
    hc0 = t.rows[0].cells[0]; hc1 = t.rows[0].cells[1]
    for hc, ht in [(hc0, title_col), (hc1, items_col)]:
        set_cell_bg(hc, colour); cell_margins(hc, 70, 70, 100, 100)
        r = hc.paragraphs[0].add_run(ht)
        r.bold = True; r.font.size = Pt(9); r.font.color.rgb = rgb(WHITE)
    return t

def feature_row(t, label, detail, row_idx):
    bg = (0xF0, 0xF7, 0xFF) if row_idx % 2 == 0 else WHITE
    row = t.add_row()
    c0 = row.cells[0]; c1 = row.cells[1]
    set_cell_bg(c0, bg); set_cell_bg(c1, bg)
    cell_margins(c0); cell_margins(c1)
    r0 = c0.paragraphs[0].add_run(label)
    r0.bold = True; r0.font.size = Pt(9); r0.font.color.rgb = rgb(BLUE)
    r1 = c1.paragraphs[0].add_run(detail)
    r1.font.size = Pt(9); r1.font.color.rgb = rgb(DARK)

def advantage_box(title, points, colour=GREEN):
    t = doc.add_table(rows=1, cols=1); t.alignment = WD_TABLE_ALIGNMENT.LEFT
    c = t.rows[0].cells[0]; set_cell_bg(c, (0xF0,0xFD,0xF4)); cell_margins(c, 100, 100, 120, 120)
    p0 = c.paragraphs[0]; r0 = p0.add_run(f"  {title}")
    r0.bold = True; r0.font.size = Pt(10); r0.font.color.rgb = rgb(colour)
    for pt in points:
        pp = c.add_paragraph(f"   ✓  {pt}")
        pp.paragraph_format.space_before = Pt(1); pp.paragraph_format.space_after = Pt(2)
        for r in pp.runs: r.font.size = Pt(9); r.font.color.rgb = rgb(DARK)
    doc.add_paragraph()

# ══════════════════════════════════════════════════════════════════════════════
# BUILD DOCUMENT
# ══════════════════════════════════════════════════════════════════════════════
cover_banner()

# ── SECTION 1: ENDPOINT MANAGEMENT ───────────────────────────────────────────
section_bar("Section 1 — Endpoint Management", BLUE)
body("The Endpoint Management section aggregates device data from all connected MDM sources "
     "(Microsoft Intune, ManageEngine). Each connector surfaces its own device inventory, "
     "compliance state, security controls, and automation rules — all accessible from a unified sidebar.", space_after=8)

# ── 1.1 Mac Devices (ManageEngine) ────────────────────────────────────────────
sub_section("1.1  Mac Devices — ManageEngine Connector", BLUE)
body("The Mac Devices page is powered by the ManageEngine MDM integration. It is the primary hub for "
     "managing all Apple macOS devices across the fleet — from device compliance and app inventory "
     "to configuration profiles and fleet-wide reporting.")

h3("Tabs & Features")

h3("Tab 1 — Devices", BLUE)
body("The Devices tab is the default landing view showing the full macOS inventory. "
     "Each row provides at-a-glance status with a real-time check-in indicator dot.")
t1 = feature_table("Column / Filter", "Detail", BLUE)
for i, (f, d) in enumerate([
    ("Device Name",       "Hostname of the Mac endpoint, linked to its detail panel"),
    ("User",              "Assigned user — name and email"),
    ("Model",             "Hardware model (MacBook Pro, MacBook Air, Mac mini, Mac Studio, iMac, Mac Pro)"),
    ("macOS Version",     "Current OS version installed on device"),
    ("Policy / Profile",  "ManageEngine configuration profile applied to the device"),
    ("Last Check-in",     "Relative timestamp with colour dot: green=today, lime=1-2d, amber=3-6d, red=7+d"),
    ("FileVault",         "Encryption status badge — Encrypted / Not Encrypted / Unknown"),
    ("Compliance",        "Compliant / Warning / Non-Compliant badge with source-specific logic"),
    ("Actions",           "Edit user/role, view detail panel, duplicate, delete"),
    ("Search",            "Full text search across device name, user, and OS version"),
    ("Model Filter",      "Chip filters: MacBook Pro · MacBook Air · Mac mini · Mac Studio · iMac · Mac Pro"),
    ("macOS Filter",      "Major.minor OS version chip filters for rapid fleet segmentation"),
    ("Compliance Filter", "One-click filter: Compliant · Warning · Non-Compliant"),
]): feature_row(t1, f, d, i)

doc.add_paragraph()
h3("Tab 2 — Applications", BLUE)
body("Shows the real per-device installed application inventory reported by ManageEngine "
     "(there is no separate app-library/blueprint catalog — ManageEngine exposes installed apps "
     "and policy/profile strings per device, not a central enforcement library).")
t2 = feature_table("Column / Filter", "Detail", BLUE)
for i, (f, d) in enumerate([
    ("App Name",          "Display name of the installed application"),
    ("Version",           "Installed version number"),
    ("Bundle ID",         "macOS bundle identifier"),
    ("Status",            "Installed / Failed / Pending deployment state"),
    ("Search",            "Full text search across app name"),
    ("Status Filter",     "Show All / Installed / Failed / Pending apps"),
    ("Export CSV",        "Download full app inventory as comma-separated file"),
]): feature_row(t2, f, d, i)

doc.add_paragraph()
h3("Tab 3 — Security", BLUE)
body("Per-device security posture showing the state of the four critical macOS security controls.")
t3 = feature_table("Column / Control", "Detail", BLUE)
for i, (f, d) in enumerate([
    ("FileVault",         "Full-disk encryption status — Encrypted / Not Encrypted"),
    ("EDR Agent",         "CrowdStrike Falcon agent presence and health"),
    ("Firewall",          "macOS Application Firewall enabled / disabled"),
    ("Applied Policies",  "Count of ManageEngine profiles applied to the device"),
    ("Risk Score",        "Aggregated risk level: Low / Medium / High / Critical"),
    ("Last Check-in",     "Time since last MDM contact — used to determine staleness"),
]): feature_row(t3, f, d, i)

doc.add_paragraph()
h3("Tab 4 — Automation", BLUE)
body("Mac fleet automation rules that trigger on device events and route actions to Jira, Slack, or runbooks.")
for rule, desc in [
    ("FileVault Off Alert",      "Triggers when FileVault encryption is disabled — sends Slack + creates Jira ticket"),
    ("Policy Drift Detection",   "Fires when a device's applied configuration profile diverges from its assigned policy"),
    ("Stale Device Quarantine",  "Quarantine alert after 30+ days without a ManageEngine check-in"),
    ("CrowdStrike Health Alert", "Notifies if EDR agent goes offline or reports reduced functionality"),
    ("Weekly Mac Fleet Report",  "Scheduled rule generating a patch & compliance summary each Monday"),
]: bullet(f"{rule} — {desc}")

doc.add_paragraph()
h3("Tab 5 — Reports", BLUE)
body("The Reports tab aggregates fleet metrics across six pre-built report cards, "
     "plus direct access to the IRU Patch Report.")
for report, desc in [
    ("Fleet Growth",          "Month-by-month device count trend (line chart)"),
    ("Patch Compliance",      "Distribution of devices by patch status tier (bar chart)"),
    ("macOS Version Mix",     "Version distribution with upgrade eligibility highlighted"),
    ("App Currency",          "App update state: Current / Update Available / Outdated / Failed"),
    ("Stale Devices",         "Devices by days-since-check-in bracket"),
    ("IRU Patch Report",      "Full Infrastructure & Remote Users patch report — see Section 1.3"),
    ("Fleet KPI Dashboard",   "18-metric KPI grid — see Mac Fleet Reports, Section 5.4"),
]: bullet(f"{report} — {desc}")

divider()

# ── 1.2 Intune Connector ──────────────────────────────────────────────────────
sub_section("1.2  Intune Connector — Windows, iOS & Android", TEAL)
body("The Intune page manages Microsoft-enrolled Windows, iOS, and Android endpoints "
     "via the Microsoft Graph / Intune API. It is the primary Windows MDM source in the platform.")

h3("Tabs & Features")
h3("Tab 1 — Devices", TEAL)
body("Multi-platform device inventory with sub-tabs: All · Windows · Android · iOS.")
t4 = feature_table("Column / Filter", "Detail", TEAL)
for i, (f, d) in enumerate([
    ("Device Name",       "Intune-registered hostname"),
    ("User",              "Primary user UPN"),
    ("Platform",          "Windows / Android / iOS with icon badge"),
    ("OS Version",        "Current OS build version"),
    ("Serial",            "Hardware serial number"),
    ("Encryption",        "BitLocker (Windows) or device encryption (mobile) status"),
    ("Compliance",        "Intune compliance policy result: Compliant / Non-Compliant / Warning"),
    ("Last Check-in",     "Last MDM sync timestamp"),
    ("Search",            "Search by device name, user, or serial number"),
    ("Compliance Filter", "All / Compliant / Warning / Non-Compliant"),
    ("Platform Filter",   "All / Windows / Android / iOS / macOS"),
]): feature_row(t4, f, d, i)

doc.add_paragraph()
h3("Tab 2 — Compliance", TEAL)
body("Shows compliance policy breakdown and a top-10 non-compliant device list with "
     "policy failure reasons for each device.")

h3("Tab 3 — Security", TEAL)
body("Security metrics dashboard showing:")
for m in ["BitLocker coverage % across Windows fleet",
          "Microsoft Defender active rate",
          "MFA enrollment rate (Azure AD)",
          "Compliance policy pass/fail breakdown by policy name"]:
    bullet(m)

doc.add_paragraph()
h3("Tab 4 — Automation (Intune-specific rules)", TEAL)
for rule, desc in [
    ("BitLocker Auto-Remediation",     "Triggers BitLocker enablement runbook when encryption is off on a Windows device"),
    ("Defender Health Alert",          "Slack/Jira alert when Defender real-time protection is disabled"),
    ("Non-Compliant Escalation",       "Creates Jira P2 ticket after device remains non-compliant for 48 hours"),
    ("Windows Update Enforcement",     "Forces Windows Update policy when a device is more than 30 days behind"),
    ("Stale Device Quarantine Alert",  "Flags devices with no Intune check-in in 30+ days for review or retirement"),
]: bullet(f"{rule} — {desc}")

doc.add_paragraph()
h3("Tab 5 — Reports", TEAL)
for r, d in [
    ("BitLocker Coverage",   "% of Windows devices with BitLocker enabled — drillable by OU/device"),
    ("Compliance Rate",      "Overall and per-policy compliance rate trend over time"),
    ("Defender Coverage",    "% of devices with Defender active and up to date"),
    ("Managed Device Count", "Total enrolled devices by platform over time"),
]: bullet(f"{r} — {d}")

doc.add_paragraph()
h3("Tab 6 — Entra ID (Live / Demo)", TEAL)
body("Embedded Entra ID intelligence directly in the Intune page. Pulls live data from "
     "Microsoft Graph API if credentials are configured, or shows curated demo data.")
for sub, cols in [
    ("Users sub-tab",   "Display Name · UPN · Department · Risk Level · Last Sign-In · MFA Status · Account Status"),
    ("Devices sub-tab", "Device Name · Primary User · OS · Join Type · Compliance · Encryption · Last Check-in · Open Issues"),
    ("Groups sub-tab",  "Group Name · Member count badge · Type: Security / Microsoft 365 / Distribution"),
]: bullet(f"{sub}: {cols}")

divider()

# ── 1.3 IRU Patch Report ──────────────────────────────────────────────────────
sub_section("1.3  IRU — Infrastructure & Remote Users Patch Report", PURPLE)
body("IRU (Infrastructure & Remote Users) is a specialised macOS patch-compliance and "
     "device-staleness reporting module built on ManageEngine data. It is not a separate connector — "
     "it is a dedicated analytical report accessible from the Mac Devices page → Reports tab, "
     "and as a standalone full-page view.")

h3("Purpose")
body("IRU gives IT administrators a structured, regionally-segmented view of patch currency "
     "and device staleness across the Mac fleet, with prioritised remediation recommendations "
     "and one-click CSV export for audit purposes.")

h3("Patch Tiers")
t5 = feature_table("Tier", "Description & Action", PURPLE)
for i, (tier, desc) in enumerate([
    ("Current (26.5)",          "Latest macOS Tahoe — no action required"),
    ("Minor Patch (26.4 / 26.4.1)", "One incremental patch behind — deploy a ManageEngine nudge to upgrade"),
    ("Update Required (26.x)",  "Multiple minor versions behind — investigate dev/beta channel membership"),
    ("Sequoia (15.x)",          "Outdated major release — enforce upgrade path to 26.x immediately"),
    ("Sonoma (14.x)",           "2–3 releases behind — direct outreach required, force upgrade policy"),
    ("Ventura (13.x)",          "End of Life — no Apple security patches, escalate to management for refresh"),
]): feature_row(t5, tier, desc, i)

doc.add_paragraph()
h3("Staleness Tiers")
t6 = feature_table("Tier", "Threshold & Risk", PURPLE)
for i, (tier, desc) in enumerate([
    ("Active",     "0–13 days since last check-in — normal operation"),
    ("Stale",      "14+ days — amber alert, investigate connectivity or user travel"),
    ("Critical",   "30+ days — red alert, device may be lost, reassigned, or offline indefinitely"),
    ("Abandoned",  "90+ days — black alert, cross-reference with HR offboarding records"),
]): feature_row(t6, tier, desc, i)

doc.add_paragraph()
h3("IRU Views / Tabs")
for tab, desc in [
    ("Full Report",      "Executive summary: OS patch compliance table, regional breakdown, stale device register preview, and 8 prioritised admin recommendations"),
    ("Device List",      "Paginated, sortable device table with all columns — search, region filter, stale filter, OS tier filter"),
    ("Outdated & EOL",   "Filtered view showing only Sequoia 15.x, Sonoma 14.x, and Ventura 13.x devices requiring urgent action"),
    ("Stale Register",   "Dedicated register of devices offline 14+ days with quick-filter buttons: Stale 14+d · Critical 30+d · Abandoned 90+d"),
    ("Regional Summary", "Patch compliance heatmap table broken down by office region (North/South/East/West/HQ/Remote) with compliance bar per region"),
]: bullet(f"{tab} — {desc}")

doc.add_paragraph()
h3("KPI Metrics (Overview Cards)")
for kpi in ["Total Devices", "On Target OS (26.5) with %", "Minor Patch Needed (26.4/26.4.1)",
            "Legacy OS (Sequoia + Sonoma + Ventura combined)", "Stale 14+ days with fleet %", "Abandoned 90+ days"]:
    bullet(kpi)

doc.add_paragraph()
h3("Prioritised Admin Recommendations (8 actions)")
for p, action in [
    ("P1", "Investigate abandoned devices against HR records — confirm offboarded vs lost"),
    ("P1", "Remediate EOL / severely outdated devices with direct user outreach and forced upgrade policy"),
    ("P2", "Push macOS Tahoe (26.x) upgrade to all Sequoia-era devices using region-aware rollout"),
    ("P2", "Drive minor-patch devices from 26.4 to 26.5 using ManageEngine managed software update"),
    ("P3", "Ensure all untagged devices receive a region label for accurate regional reporting"),
    ("P3", "Evaluate early-channel (26.0 / 26.2) devices — likely developer or beta testers"),
    ("P4", "Establish a 14-day stale check-in SLA enforced by the Automation Engine"),
    ("P4", "Plan hardware refresh for pre-M1 Intel Macs that cannot upgrade beyond Sonoma"),
]: bullet(f"[{p}] {action}")

doc.add_paragraph()
h3("IRU vs Standard ManageEngine Reports — Key Differences")
comparison_table(
    ["Aspect", "IRU Patch Report", "Standard ManageEngine Reports Tab"],
    [
        ["Scope",        "macOS patch currency + device staleness only", "Broad fleet health across all metric types"],
        ["Segmentation", "Regional breakdown (HQ / North / South / East / West / Remote)", "Model, OS version, policy-based"],
        ["Stale Tracking","4-tier staleness register (Active → Stale → Critical → Abandoned)", "Basic last-check-in column"],
        ["Patch Tiers",  "6 named tiers with explicit risk and action per tier", "Binary: patched / not patched"],
        ["Recommendations","8 prioritised (P1-P4) admin action items", "None — data only"],
        ["Export",       "CSV with Device, User, OS, Category, Action Required", "No dedicated CSV export"],
        ["Audience",     "IT managers, regional helpdesk leads, auditors", "Day-to-day IT administrators"],
    ],
    [5, 7.5, 7.5]
)

divider()

# ── 1.4 ManageEngine vs Intune ─────────────────────────────────────────────────
sub_section("1.4  ManageEngine vs Intune — Feature & Advantage Comparison", GREEN)
body("Both ManageEngine and Intune are MDM platforms, but they serve fundamentally different device "
     "ecosystems. Understanding where each excels helps IT teams decide policy priorities.")

comparison_table(
    ["Feature / Metric", "ManageEngine (Mac)", "Intune (Windows / Mobile)", "Winner"],
    [
        ["Primary Platform",       "macOS (M-series & Intel)",  "Windows 10/11, iOS, Android", "Platform-specific"],
        ["Disk Encryption",        "FileVault (94% pass rate)", "BitLocker (82% pass rate)",    "ManageEngine"],
        ["EDR / Antivirus",        "CrowdStrike Falcon (96%)",  "Microsoft Defender (91%)",     "ManageEngine"],
        ["Firewall Compliance",    "macOS Firewall (98%)",      "Windows Firewall (95%)",        "ManageEngine"],
        ["OS Patch Compliance",    "macOS (81%)",               "Windows Update (68%)",          "ManageEngine"],
        ["Identity / MFA",         "Okta MFA (92%)",            "Azure AD MFA (87%)",            "ManageEngine"],
        ["Overall Compliance",     "93% avg",                   "90% avg",                       "ManageEngine"],
        ["Policy Engine",          "Configuration profiles (per-device)", "Compliance Policies (per-user)","Comparable"],
        ["App Deployment",         "Per-device installed apps", "Win32 / LOB / Store apps",      "Comparable"],
        ["Patch Reporting",        "IRU (6-tier + regional)",   "Windows Update report (binary)","ManageEngine"],
        ["Mobile Device Support",  "None (Mac only)",           "iOS + Android full MDM",        "Intune"],
        ["Windows Management",     "None",                      "Full GPO + Intune policy stack","Intune"],
        ["Cost Model",             "Per-device (Apple-focused)","Per-user (cross-platform)",     "Context-dependent"],
        ["Graph API Integration",  "ManageEngine REST API",     "Microsoft Graph API (rich)",    "Intune"],
        ["Identity Provider",      "Okta / SAML",               "Azure AD / Entra ID",           "Context-dependent"],
    ],
    [5.5, 4, 4, 3]
)

advantage_box("ManageEngine Advantages over Intune", [
    "Higher compliance rates across all macOS security pillars (encryption, EDR, firewall, patch)",
    "Native Apple silicon optimisation — M1/M2/M3 support without legacy Windows agent overhead",
    "Per-device configuration profile model maps directly to Apple's MDM framework — fewer edge cases",
    "IRU Patch Report provides 6-tier patch segmentation vs Intune's binary compliant/non-compliant",
    "CrowdStrike Falcon integration beats Windows Defender on detection telemetry depth",
    "Okta MFA integration provides identity federation beyond Microsoft's ecosystem",
    "ManageEngine check-in frequency is more reliable on macOS than Intune's Windows MDM sync cycle",
], GREEN)

advantage_box("Intune Advantages over ManageEngine", [
    "Full Windows 10/11 management — GPO migration, software centre, Win32 app deployment",
    "iOS and Android MDM in one platform — eliminates need for a separate mobile MDM",
    "Microsoft Graph API is the richest identity + device data source in the ecosystem",
    "Azure AD / Entra ID native integration — Conditional Access, risk-based sign-in policies",
    "Built-in SIEM integration with Microsoft Sentinel for unified threat management",
    "Lower incremental cost for organisations already on Microsoft 365 E3/E5 licensing",
], TEAL)

divider()

# ── 1.5 Windows Devices ───────────────────────────────────────────────────────
sub_section("1.5  Windows Devices — Multi-Source View", TEAL)
body("The Windows Devices page aggregates Windows endpoints from both Intune and ManageEngine "
     "into a single unified inventory, eliminating the need to switch between connectors "
     "when managing a mixed Windows estate.")

h3("Tabs & Features")
for tab, desc in [
    ("Devices",      "Unified table: Device · User · OS Version · Source (Intune / ManageEngine) · Encryption · Compliance · Last Seen. Filter by source to isolate MDM origin."),
    ("Patch Status", "Categorises all Windows devices into 4 patch-age brackets: Up-to-Date (<7d), Slightly Behind (7-30d), At-Risk (30-60d), Critical (>60d). Shows % per bracket."),
    ("Security",     "Mirrors Patch Status layout with security-control overlay: Defender status, BitLocker coverage, Firewall state."),
    ("Automation",   "5 Windows-specific rules: Critical Patch Auto-Push · BitLocker Key Escrow · Stale Patch Alert (30d) · Defender Real-time Off Alert · Monthly Patch Summary Report."),
    ("Reports",      "Placeholder with export button — exports current device table as CSV."),
]: bullet(f"{tab} — {desc}")

doc.add_paragraph()
h3("Key Differentiators")
for d in [
    "Single pane of glass for Windows across two separate MDM sources",
    "'Source' column makes it immediately clear which tool manages which device",
    "Patch age visualisation (4 brackets) is more actionable than Intune's binary compliant/non-compliant",
    "Complements ManageEngine's patch data with Intune's compliance policy data in one row",
]: bullet(d)

divider()

# ── 1.6 ManageEngine ─────────────────────────────────────────────────────────
sub_section("1.6  ManageEngine Connector", AMBER)
body("ManageEngine Desktop Central is the on-premises or cloud UEM connector supporting "
     "Windows and Linux endpoints that are not enrolled in Intune. It brings software "
     "inventory and patch management data into the platform.")

h3("Tabs & Features")
t7 = feature_table("Tab", "Features", AMBER)
for i, (tab, desc) in enumerate([
    ("Devices",    "Device name · User · Platform (Windows/Linux) · OS Version · Compliance · Encryption · Last Scan. Filter by platform, compliance, encryption."),
    ("Patches",    "Patch status distribution: Fully Patched / Patches Available / Critical Missing / Severely Behind. Per-device patch list with KB number and severity."),
    ("Software",   "Software inventory per device — installed name, version, publisher, install date."),
    ("Automation", "5 ManageEngine-specific rules: Missing Critical Patches Alert · Auto-Deploy Security Patches · Unauthorized Software Alert · Offline Device Check-in · Weekly Patch Report."),
    ("Reports",    "Patch and software coverage metrics with export. Shows % fully patched, % with critical gaps, software currency."),
]): feature_row(t7, tab, desc, i)

doc.add_paragraph()
h3("Automation Rules — Detail")
for rule, cat, desc in [
    ("Missing Critical Patches Alert",  "Patching",    "Sends Slack + Jira alert when a device has unpatched critical CVEs for more than 7 days"),
    ("Auto-Deploy Security Patches",    "Patching",    "Triggers ManageEngine patch deployment task automatically for severity-critical patches"),
    ("Unauthorized Software Alert",     "Compliance",  "Fires when blacklisted software (e.g. Tor, unapproved VPN) is detected in the software inventory"),
    ("Offline Device Check-in",         "Compliance",  "Alerts helpdesk when a managed device hasn't scanned in 14 days"),
    ("Weekly Patch Report",             "Reporting",   "Scheduled report every Monday summarising patch coverage and critical gaps across ManageEngine estate"),
]: bullet(f"[{cat}] {rule} — {desc}")

doc.add_paragraph()
h3("ManageEngine vs Intune — Key Differences")
comparison_table(
    ["Feature", "ManageEngine", "Intune", "Advantage"],
    [
        ["Linux Support",          "Full Linux endpoint management", "Limited (preview only)",           "ManageEngine"],
        ["Software Inventory",     "Complete installed software list per device", "Win32 app inventory only", "ManageEngine"],
        ["On-Premises Deployment", "Supported (Desktop Central)",   "Cloud-only",                        "ManageEngine"],
        ["Patch Management",       "Granular — KB-level patch control", "Windows Update ring-based",     "ManageEngine"],
        ["Mobile Devices",         "MDM for mobile (separate module)", "Full iOS/Android MDM native",    "Intune"],
        ["Azure AD Integration",   "None",                          "Native Entra ID / Conditional Access", "Intune"],
        ["Microsoft 365 Licensing","Separate license",              "Included in M365 E3/E5",            "Intune"],
        ["Compliance Reporting",   "Patch-focused reports",         "Policy compliance + security reports", "Intune"],
        ["Scripting/Automation",   "Script deployment via DC",      "PowerShell via Intune Management Extension", "Comparable"],
    ],
    [5.5, 4, 4, 3]
)

advantage_box("ManageEngine Advantages over Intune for On-Premises/Linux Fleets", [
    "Full Linux endpoint management — Intune only has limited/preview Linux support",
    "Granular KB-level patch management vs Intune's Windows Update ring abstraction",
    "Complete software inventory (all installed software, not just managed apps)",
    "On-premises deployment option for organisations with strict data residency requirements",
    "Lower cost for organisations without Microsoft 365 E3/E5 — no Azure AD prerequisite",
    "Stronger patch compliance reporting — ManageEngine tracks exact KB numbers and CVE mapping",
], AMBER)

divider()

# ── 1.7 Device Lookup ─────────────────────────────────────────────────────────
sub_section("1.7  Device Lookup — Universal Search", BLUE)
body("Device Lookup provides a single search interface to find any device across all "
     "connected sources by name, serial number, or user email.")
for f, d in [
    ("Search Fields",      "Device name, serial number, user email — searches all sources simultaneously"),
    ("Result Detail",      "Policies applied, compliance state, last check-in, encryption status, assigned user, MDM source"),
    ("Device Panel",       "Opens right-side detail panel with runbook recommendations and quick actions"),
    ("Quick Actions",      "View in Dashboard · Open Device Panel · Sync Device · Create Jira Ticket"),
]: bullet(f"{f}: {d}")

divider()

# ── 1.8 Open Issues ────────────────────────────────────────────────────────────
sub_section("1.8  Open Issues — Non-Compliance Tracker", RED)
body("Open Issues consolidates all non-compliant devices across every connected source "
     "into a single prioritised issue queue.")
for f, d in [
    ("Severity Filter",   "Critical · High · Medium · Low — one-click filter to triage by urgency"),
    ("Issue Categories",  "Encryption missing · OS out of date · EDR offline · Stale check-in · Policy violation"),
    ("Device Count",      "Number of devices affected per issue type"),
    ("Quick Actions",     "Escalate to Jira · Send Slack notification · Open device detail panel"),
    ("Drill-Down",        "Click any issue to see the full list of affected devices with inline remediation steps"),
]: bullet(f"{f}: {d}")

doc.add_paragraph()

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 2: SECURITY & COMPLIANCE
# ══════════════════════════════════════════════════════════════════════════════
section_bar("Section 2 — Security & Compliance", PURPLE)

sub_section("2.1  Security Posture", PURPLE)
body("Organisation-wide security health dashboard with per-source pillar scoring, "
     "CIS Controls coverage, and risk item remediation guidance.")

h3("Source Tabs (Device Counts)")
for src, count in [("All Sources", "447 devices"), ("Intune", "212 Windows devices"),
                   ("ManageEngine", "235 mixed-OS devices (178 macOS + 57 other)")]:
    bullet(f"{src} — {count}")

doc.add_paragraph()
h3("Security Pillars per Source")
comparison_table(
    ["Pillar", "All Sources", "Intune (Windows)", "ManageEngine (macOS + cross-platform)"],
    [
        ["Encryption / BitLocker / FileVault", "87%", "82% BitLocker", "94% FileVault"],
        ["EDR / Antivirus",                    "93%", "91% Defender",  "96% CrowdStrike"],
        ["Firewall",                           "96%", "95% Win FW",    "98% macOS FW"],
        ["OS Patching",                        "74%", "68% Win Update","81% macOS Upd"],
        ["Identity / MFA",                     "89%", "87% Azure MFA", "92% Okta MFA"],
        ["MDM Compliance",                     "91%", "90% Intune",    "93% ManageEngine"],
    ],
    [5, 3, 4, 5]
)

h3("CIS Controls Coverage (Organisation-level)")
body("10 CIS Controls tracked with Implemented / Partial / Not Started status and a coverage %.")

h3("Top Risk Items")
body("6 risk items per source tab — each card shows: severity badge, affected device count, "
     "and a 4-step numbered remediation guide. Expandable inline for helpdesk use.")

divider()
sub_section("2.2  Vulnerabilities", PURPLE)
for f, d in [
    ("Severity Trend Chart",   "CVE severity distribution over time (Critical/High/Medium/Low)"),
    ("Affected Device Count",  "Number of devices exposed per vulnerability"),
    ("EDR Correlation",        "Links CVEs to active CrowdStrike / Defender detections"),
    ("Compliance Correlation", "Shows which non-compliant devices are also vulnerable"),
    ("Jira Integration",       "One-click Jira ticket creation per vulnerability for tracked remediation"),
    ("Runbook Link",           "Routes to the relevant remediation runbook for each CVE category"),
]: bullet(f"{f}: {d}")

divider()
sub_section("2.3  EDR — Endpoint Detection & Response", PURPLE)
body("Security operations integration for CrowdStrike Falcon and Microsoft Defender detections.")
comparison_table(
    ["Tab", "Content"],
    [
        ["Detections", "MITRE ATT&CK technique mapping · Process forensics · File hashes · IOCs · Detection timestamp"],
        ["Incidents",  "Grouped detections with investigation timeline and analyst notes"],
        ["Response Actions", "Containment actions (network isolate, process kill) and remediation with success/failure tracking"],
        ["Investigation", "Process tree · Network events · File events · Registry changes — full forensic timeline per device"],
    ],
    [4, 13.5]
)

doc.add_paragraph()

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 3: USERS & IDENTITY
# ══════════════════════════════════════════════════════════════════════════════
section_bar("Section 3 — Users & Identity", TEAL)

sub_section("3.1  Users Module", TEAL)
body("Comprehensive identity management with directory sync, role assignment, "
     "sign-in logs, licence tracking, and Jira ticket linking.")

h3("Header Stats Bar (6 KPIs)")
for kpi in ["Total Users", "Active Users", "IT Staff", "End Users", "MFA Disabled (amber if > 0)", "At Risk (red if > 0)"]:
    bullet(kpi)

doc.add_paragraph()
h3("Filters & Search")
for f, d in [
    ("Search",      "Email, name, department, or job title"),
    ("Role Filter", "All · Global Admin · IT Admin · Helpdesk · End User"),
    ("Status",      "All · Active · Inactive · Suspended"),
    ("Risk Level",  "All · Critical · High · Medium · Low"),
    ("Source",      "Filter by directory source (Entra / Okta / local)"),
    ("Sort By",     "First Name · Email · Tool Role · Department · Status · Last Active · Risk Level"),
]: bullet(f"{f} — {d}")

doc.add_paragraph()
h3("User Detail Drawer — 8 Tabs")
comparison_table(
    ["Tab", "Content"],
    [
        ["Profile",     "Identity card · Contact info · Employment info · Account security · Directory & MDM sources"],
        ["Sign-in Logs","Sign-in attempts with success/failure · App used · IP · Location · MFA method · Risk level · Error reason"],
        ["Assigned Roles","Entra ID directory role assignments"],
        ["Groups",      "Group membership: Microsoft 365 · Security · Distribution · Mail-enabled Security"],
        ["Applications","App role assignments with service names and access levels"],
        ["Licenses",    "M365 E3/E5 · Intune · Entra ID P1/P2 licence assignments with service plan status (enabled/disabled)"],
        ["Devices",     "Assigned devices: compliance · encryption · risk score · last check-in · sync button"],
        ["Jira",        "Open & resolved Jira tickets linked to this user: type · priority · status"],
    ],
    [4, 13.5]
)

doc.add_paragraph()
h3("Admin Actions (Global Admin role only)")
for a in ["Edit User — change tool role, status, MFA state",
          "Activate / Suspend — toggle account state with confirmation",
          "Reset MFA — forces re-enrolment at next sign-in",
          "Revoke All Sessions — immediate force sign-out across all active sessions"]:
    bullet(a)

divider()
sub_section("3.2  Entra Intelligence Dashboard", TEAL)
body("Full Microsoft Entra ID intelligence layer with live Microsoft Graph API data "
     "or curated demo mode. Goes far beyond the Entra tab inside IntuneDevicesPage "
     "to provide a dedicated analytical workspace.")

h3("7 Overview KPI Cards")
for kpi in ["Total Users", "High Risk Users", "Total Devices", "Compliant Devices",
            "Non-Compliant Devices", "Missing Encryption", "Groups Count"]:
    bullet(kpi)

doc.add_paragraph()
h3("Dashboard Sections")
for sec, desc in [
    ("Compliance Over Time",        "6-week stacked bar chart — Compliant (green) / Non-Compliant (red) / Grace Period (amber)"),
    ("Devices by Platform",         "Horizontal bars — Windows · macOS · iOS/iPadOS · Android · Linux with % and counts"),
    ("Top Compliance Issues",       "6 issues with severity badge (High/Medium/Low) and affected device count"),
    ("Recent Alerts",               "Alert list with title, timestamp, and severity dot"),
    ("Risky Users Table",           "User · Department · Risk Level · Last Sign-In · MFA · Active Sessions — expandable rows"),
    ("Stale Devices Table",         "Devices >7d offline — amber highlight >7d, red highlight >14d"),
    ("Device Inventory",            "Full device table up to 100 rows with compliance, encryption, and join type"),
    ("Relationship Intelligence",   "User → Device → Policy → App explorer for access path analysis"),
    ("Helpdesk Quick Lookup",       "Instant device/user search with device sync action button"),
    ("Entra AI Copilot",            "AI-powered insights and anomaly recommendations from Entra data"),
]: bullet(f"{sec} — {desc}")

doc.add_paragraph()

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 4: AUTOMATION
# ══════════════════════════════════════════════════════════════════════════════
section_bar("Section 4 — Automation", GREEN)

sub_section("4.1  Automation Engine", GREEN)
body("Visual trigger-condition-action rule builder with 5 categories, execution history, "
     "AI rule generation, and an inline workflow diagram.")

h3("Header KPI Stats")
for k in ["Total Rules", "Active (running)", "Inactive (paused)", "Triggered Today", "Overall Success Rate %"]:
    bullet(k)

doc.add_paragraph()
h3("Trigger Types (6)")
for t in ["Device Non-Compliant", "Encryption Off", "Device Offline",
          "Drift Detected", "Scheduled (cron expression)", "Script Failure"]:
    bullet(t)

doc.add_paragraph()
h3("Action Types (6)")
for a in ["Send in-app notification", "Send Slack message", "Create Jira ticket",
          "Trigger runbook", "Run remote script", "Generate report"]:
    bullet(a)

doc.add_paragraph()
h3("Rule Card Features")
for f in ["Status dot (green=enabled, grey=disabled)",
          "Category badge: Compliance · Security · Patching · Reporting · Drift",
          "Trigger chip + condition chips (platform, severity, source)",
          "Action chips with icons", "Enable/disable toggle",
          "Test Run button (disabled if rule is inactive)",
          "Last triggered timestamp · Total runs count · Created by"]:
    bullet(f)

doc.add_paragraph()
h3("AI Rule Builder")
body("Natural language rule creation — describe the rule in plain English and the AI "
     "generates the trigger, conditions, and actions automatically. "
     "4 preset example prompts help users get started.")

h3("Execution History Tab")
for f in ["Filter: All · Success · Partial · Failed",
          "Each execution shows: rule name, device/fleet scope, trigger reason, actions executed, duration (ms)",
          "Expandable drawer: action-by-action results, AI runbook steps, generated scripts, Jira ticket link, Slack message preview"]:
    bullet(f)

divider()
sub_section("4.2  Runbooks", GREEN)
body("AI-powered remediation playbooks that provide step-by-step fix instructions "
     "for each device's specific compliance failure.")
for f, d in [
    ("Per-Device Runbooks", "Each device gets a tailored runbook based on its compliance failure type"),
    ("AI Analysis",         "GPT-4o-mini generates device-specific analysis and remediation narrative"),
    ("Remediation Steps",   "Numbered step-by-step instructions — copy-to-clipboard button per step"),
    ("Jira Integration",    "Modal to create or link a Jira ticket directly from the runbook card"),
    ("Confluence Link",     "Links to the relevant Confluence KB article for this remediation type"),
    ("Manual Execution",    "Mark runbook steps as complete — tracks remediation progress"),
]: bullet(f"{f} — {d}")

divider()
sub_section("4.3  Remote Scripts", GREEN)
body("Full script library and execution console for PowerShell, Bash, Python, "
     "and Batch scripts across all managed platforms.")

h3("Script Library Filters")
for f in ["Search by script name", "OS: All · Windows · macOS · Linux · Cross-platform",
          "Type: All · PowerShell · Bash · Batch · Python", "Script count in footer"]:
    bullet(f)

doc.add_paragraph()
h3("Script Detail Panel — Tabs")
for tab, desc in [
    ("Script Content",    "Read-only syntax-highlighted code block"),
    ("Parameters",        "Input fields per parameter — string, number, boolean, select types"),
    ("Target Device",     "Autocomplete device picker across all sources"),
    ("Destructive Warning","Red alert banner if the script is flagged as destructive"),
]: bullet(f"{tab} — {desc}")

doc.add_paragraph()
h3("Execution Output")
for f in ["Status badge: Queued · Running · Completed · Failed · Timeout · Cancelled · Awaiting Approval",
          "Exit code (green if 0, red if nonzero)", "Runtime in milliseconds",
          "stdout (emerald on dark background)", "stderr (red on dark background)"]:
    bullet(f)

doc.add_paragraph()

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 5: ANALYTICS & REPORTS
# ══════════════════════════════════════════════════════════════════════════════
section_bar("Section 5 — Analytics & Reports", AMBER)

sub_section("5.1  Reports & Analytics", AMBER)
for f, d in [
    ("Pre-built Templates",  "Compliance trends · Device inventory · Patch status · Encryption coverage · Fleet health"),
    ("Custom Query Builder", "Build ad-hoc queries across any metric with date range and source filters"),
    ("Export Formats",       "PDF and CSV export with scheduled delivery options"),
    ("KPI Modal",            "Pin any KPI card to your dashboard for persistent at-a-glance monitoring"),
    ("Scheduling",           "Automated report delivery on daily / weekly / monthly cadence"),
]: bullet(f"{f} — {d}")

divider()
sub_section("5.2  Activity Log", AMBER)
body("Full audit trail covering every system event — device check-ins, policy changes, "
     "compliance transitions, automation triggers, and user actions.")
for f in ["Filter by: date range · device · user · action type · result",
          "Real-time updates — new events appear without page refresh",
          "CSV export for compliance audits and SIEM ingestion",
          "Expandable rows showing full event payload and context"]:
    bullet(f)

divider()
sub_section("5.3  Diagnostics", AMBER)
body("Health-check engine that validates integration connectivity and device-level control state.")
for tab, desc in [
    ("Infrastructure",  "Integration status per connector (Intune · ManageEngine · Entra ID · Slack · Jira): connectivity, API latency, last successful sync"),
    ("Device-level",    "Per-device diagnostic: disk encryption · OS patches · security controls (EDR, firewall) · network connectivity"),
    ("Fleet",           "Aggregated health: Healthy / Warning / Critical / Unknown counts per control category — confidence score per check"),
]: bullet(f"{tab} — {desc}")

divider()
sub_section("5.4  Mac Fleet Reports — 18+ KPI Dashboard", AMBER)
body("Dedicated macOS fleet health dashboard powered by ManageEngine data, with AI insights, "
     "drill-down modals, and Excel export per KPI.")

h3("AI Insights Feature")
body("Dropdown panel with four insight categories generated from live fleet data:")
for t, d in [
    ("Healthy",     "Overall compliance summary — 'X% of Y devices are fully compliant'"),
    ("High",        "Patch gaps, stale check-ins, EOL risks, macOS currency gaps"),
    ("Opportunity", "Near-EOL devices, minor version gaps — proactive actions"),
    ("Critical",    "Abandoned devices (90+d offline), missing critical patches — urgent escalations"),
]: bullet(f"{t}: {d}")

doc.add_paragraph()
h3("KPI Groups")
comparison_table(
    ["KPI Group", "Metrics Included"],
    [
        ["Fleet Health",       "Total Devices · Compliant · Non-Compliant · Devices at Risk"],
        ["Patch Compliance",   "Fully Patched (26.5) · Minor Patch Needed (26.4) · Update Required (26.x) · Critical Missing"],
        ["Device Lifecycle",   "Current macOS · Outdated (Sequoia/Sonoma/Ventura) · End of Life · Avg Days Since Check-in"],
        ["Stale Devices",      "Stale 14+d · Critical 30+d · Abandoned 90+d · Active (< 14d)"],
    ],
    [5, 12.5]
)

h3("KPI Card Interaction")
for f in ["Click any card to open drill-down modal showing all matching devices",
          "Modal includes filter options and device-level table",
          "Export individual KPI to Excel (.xlsx) with device-level rows",
          "Export All — full Excel workbook with all 18+ KPI summaries on separate sheets"]:
    bullet(f)

doc.add_paragraph()

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 6: PLATFORM
# ══════════════════════════════════════════════════════════════════════════════
section_bar("Section 6 — Platform", NAVY)

sub_section("6.1  Settings", NAVY)
comparison_table(
    ["Category", "What You Can Configure"],
    [
        ["Integrations",          "Intune · Entra ID · ManageEngine · Jira · Confluence · Slack — API credentials, connection status, test connection"],
        ["Notification Preferences","Alert thresholds by severity · Delivery channels (in-app / Slack / email) · Quiet hours"],
        ["Account Settings",      "User role assignment (Global Admin / IT Admin / Helpdesk / End User) · API key management · Session management"],
        ["Data & Privacy",        "Log retention policies · Data export · Compliance settings (GDPR / SOC 2 flags)"],
    ],
    [5, 12.5]
)

divider()
sub_section("6.2  Role-Based Access Control", NAVY)
comparison_table(
    ["Role", "Permissions"],
    [
        ["Global Admin",  "Full read/write access to all modules, settings, user management, and integration credentials"],
        ["IT Admin",      "Read/write on devices, runbooks, scripts, and automation. Cannot manage users or integration credentials"],
        ["Helpdesk",      "Read-only device lookup, runbook execution, and Jira ticket creation. No settings access"],
        ["End User",      "Limited view of their own assigned devices and compliance status only"],
    ],
    [4, 13.5]
)

divider()
sub_section("6.3  Documentation Portal", NAVY)
body("In-app documentation site covering architecture, integration setup guides, "
     "API reference, data models, and per-feature how-to guides. "
     "Mirrors the /docs folder in the codebase — always in sync with deployed features.")

doc.add_paragraph()

# ── Footer ────────────────────────────────────────────────────────────────────
divider()
fp = doc.add_paragraph("EndPoint+  •  Verma Technology Platform  •  Full Product Documentation  •  Confidential")
fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
for r in fp.runs:
    r.font.size = Pt(8); r.font.color.rgb = rgb(GREY)

doc.save(OUTPUT)
print(f"DOCX saved → {OUTPUT}")
