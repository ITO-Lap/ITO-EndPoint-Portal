import { SectionWrap, DocCard, CardHeader, Prose, FactList, DocTable } from './DocPrimitives'
import { PAGES } from '../../lib/docsPageIndex'

// In-app Documentation sections for the security, patching and assistant features. The same facts live in
// docs/07-features/*.md (which Ocean searches): when one changes, change the other.

// ─── Security Posture ────────────────────────────────────────────────────────

export function SecuritySection() {
  return (
    <SectionWrap title="Security Posture" description="Fleet-wide score from four checks, built from Intune and Endpoint Central together">
      <DocCard>
        <CardHeader title="What the page answers" description="Sidebar → Security → Security Posture · docs/07-features/SECURITY-POSTURE.md" />
        <Prose>
          <p>Security Posture answers <em>"how secure is the whole fleet right now?"</em>. It scores Windows and macOS devices on four pillars, shows which devices pass, fail or are <strong>not reported</strong> for each, and lets you open any device to see exactly why.</p>
          <p>It is the team's source of truth: a device or a signal is never silently dropped. When a source is throttled, unmatched or stale, the page says so and shows the gap instead of hiding it.</p>
        </Prose>
      </DocCard>

      <DocCard>
        <CardHeader title="Where devices live" description="Why Windows is hybrid and macOS is Endpoint Central only" />
        <FactList rows={[
          ['Windows', 'In BOTH Microsoft Intune and Endpoint Central. Intune supplies compliance, BitLocker and Intune check-in; the Endpoint Central agent and Patch Manager supply missing patches and agent contact.'],
          ['macOS', 'ONLY in Endpoint Central. The MDM row supplies FileVault, compliance and check-in; Patch Manager supplies missing patches once the Mac has an agent.'],
          ['Agent-only machines', 'An Endpoint Central agent with no Intune or MDM device is not scored, but is counted and listed in diagnostics.'],
          ['Matching order', 'Endpoint Central resource id → serial number → MAC address → unique host name. A host name repeated inside one source is ambiguous and is never used to match.'],
        ]} />
      </DocCard>

      <DocCard>
        <CardHeader title="The four pillars" description="Score = passing ÷ assessed. Not-reported devices are never counted as passing or failing" />
        <DocTable
          head={['Pillar', 'Weight', 'Applies to', 'Passes when']}
          rows={[
            ['Disk Encryption', '35%', 'Windows and macOS', 'BitLocker or FileVault is on'],
            ['Critical Patching', '30%', 'Windows and macOS with a Patch Manager scan', 'No critical patches missing'],
            ['MDM Compliance', '20%', 'Intune Windows, Endpoint Central macOS', 'Compliance policy result is compliant'],
            ['MDM Check-in', '15%', 'All managed devices', 'Checked in within the window (7 days by default)'],
          ]}
        />
        <Prose>
          <p><strong>Overall score:</strong> the weighted average of the pillars that could be assessed; an unavailable data source is left out instead of pulling the score to zero. <strong>Grade:</strong> 90+ A, 80–89 B, 70–79 C, below 70 D.</p>
          <p>Every device detail names its source under <strong>Verdict based on</strong> (Intune compliance policy, Endpoint Central MDM, Endpoint Central Patch Manager, or both for check-in) and shows OS, IPs, patch counts, last scan and last agent contact.</p>
        </Prose>
      </DocCard>

      <DocCard>
        <CardHeader title="Findings and missing patches" description="Click a Finding to open its details" />
        <Prose>
          <p>Clicking any <strong>Finding</strong> opens a window with status, device, user, platform, source, serial, device details and recommended remediation.</p>
          <p>For a failing <strong>Critical Patching</strong> finding, click the line (for example "6 critical, 10 important patches missing") to open <strong>Missing patches</strong>. The device's full list is read from Endpoint Central and shown in tabs: <strong>Critical, Important, Moderate, Low</strong>. Each patch shows its KB number, description, category, vendor, release date, reboot requirement and deployment status. If the call is throttled the window says so and shows the critical names it already has; reopen it to retry.</p>
        </Prose>
      </DocCard>

      <DocCard>
        <CardHeader title="Data health and stale values" description="What the amber and blue notes mean" />
        <FactList rows={[
          ['Last-known values', 'Mac MDM details (FileVault, passcode, compliance) are read per device and the API can throttle (429). When a read fails, the last-known value is kept, marked stale with its age, for up to 7 days (MDM_DETAIL_MAX_STALE_DAYS). The amber banner counts them.'],
          ['Not reported', 'A signal that has never been read, or is older than the limit. It is shown as "not reported", never as a pass or fail.'],
          ['Agent coverage card', 'Windows and macOS devices with an Endpoint Central agent or Patch Manager row, with the change over the last 30 days. It updates by itself as agents roll out.'],
          ['Blue note', 'Agents or Patch Manager systems that matched no device (renamed, re-enrolled or agent-only).'],
          ['Patch Manager unavailable', 'The Patching pillar says so instead of failing devices; retries and last-known patch data are automatic.'],
        ]} />
      </DocCard>

      <DocCard>
        <CardHeader title="Endpoint Protection Coverage" description="CrowdStrike Falcon and Zscaler on physical Windows and macOS devices (VDI excluded)" />
        <Prose>
          <p>Shows the percentage with Falcon and with Zscaler, the number missing each (click to list and export to CSV) and a Healthy / Warning / Critical badge. It is computed from each device's installed apps.</p>
          <p>The first scan of a large fleet takes several minutes: the card shows live progress ("Scanning 1,200 of 4,800 devices") and fills in by itself. Later loads are instant; an expired result is shown as "Last scan … refreshing in the background". Devices whose inventory cannot be read are counted as "Inventory unavailable" and excluded, never counted as protected. <strong>Refresh Scan</strong> forces a new scan.</p>
        </Prose>
      </DocCard>

      <DocCard>
        <CardHeader title="Settings and diagnostics" description="Environment variables (server/.env) and the reconciliation report" />
        <DocTable
          head={['Variable', 'Default', 'Meaning']}
          rows={[
            ['POSTURE_CHECKIN_DAYS', '7', 'Check-in window in days (1–365)'],
            ['POSTURE_CHECKIN_RULE', 'either', 'either = fresh if MDM/Intune OR agent is fresh · both = both must be fresh · mdm-only = ignore the agent'],
            ['MDM_DETAIL_MAX_STALE_DAYS', '7', 'How long last-known MDM details may stand in (1–90)'],
            ['MANAGEENGINE_FETCH_CONCURRENCY', '8', 'Maximum parallel MDM detail reads'],
            ['MANAGEENGINE_DETAIL_BUDGET_MS', '35000', 'Time budget for one sync\'s detail reads'],
            ['MANAGEENGINE_DETAIL_TTL_MIN', '360', 'Minutes before a cached device detail is read again'],
          ]}
        />
        <Prose>
          <p><strong>Diagnostics</strong> (<code>GET /api/security-posture/diagnostics</code>, add <code>?format=csv</code> to download) shows how devices were matched, ambiguous names, unmatched rows and MDM read health. It lists device names, so it needs the Settings page permission. Ocean can answer the same questions without names through its Security Posture tools.</p>
        </Prose>
      </DocCard>

      <DocCard>
        <CardHeader title="LAPS (local admin password)" description="Per-device, in the Device Detail panel" />
        <Prose>
          <p><strong>LAPS</strong> rotates the local admin password so every device has a unique, time-limited credential. View status per device in <strong>Device Detail → LAPS</strong>: enabled, managing source, account name, last rotation and expiry.</p>
        </Prose>
      </DocCard>
    </SectionWrap>
  )
}

// ─── Patching ────────────────────────────────────────────────────────────────

export function PatchingSection() {
  return (
    <SectionWrap title="Patching" description="Patch Operations and Windows Updates (Patches group in the sidebar)">
      <DocCard>
        <CardHeader title="Patch Operations" description="docs/07-features/PATCH-OPERATIONS.md · permissions pages.Patch Operations and patchOps.scanRemediate" />
        <Prose>
          <p>Shows Endpoint Central Patch Manager health for Windows client and macOS endpoints: a connector status card, data coverage (assessed, unscanned, stale scans older than 7 days), a fleet health score out of 100 and a <strong>critical remediation queue</strong>. Windows Server and Linux are excluded. Only agent-managed devices appear; MDM-only Macs without an agent are "not reported".</p>
          <p><strong>Health score per device</strong> starts at 100 and subtracts: scan never succeeded 30; last scan older than 14 days 25 (older than 7 days 12); critical patches 20 each (max 45); important patches 6 each (max 20); other missing patches 2 each (max 15, only when there are no critical or important ones).</p>
          <p>Click a device's missing count to see its patches in views <strong>Critical, All missing, OS updates, App updates</strong>.</p>
        </Prose>
      </DocCard>
      <DocCard>
        <CardHeader title="Scan and Remediate" description="Always preview first, then confirm" />
        <FactList rows={[
          ['Who', 'Needs patchOps.scanRemediate (IT Admin and Helpdesk by default; every action still needs explicit confirmation).'],
          ['Scan', 'Click Scan on a device → "Confirmation required" panel → Confirm. Runs a Patch Manager scan on that endpoint.'],
          ['Remediate (deploy)', 'Enter an existing Endpoint Central deployment policy template id, Prepare deployment (uses the device\'s currently missing critical patches), then Confirm.'],
          ['Safety', 'Requests expire after 10 minutes; only the person who created a request can confirm it; deploy is limited to 1 device and 50 explicitly listed patches; every request is audited (last 250 kept).'],
        ]} />
      </DocCard>
      <DocCard>
        <CardHeader title="Rate limiting" description="Endpoint Central and ManageEngine MDM share one Zoho client" />
        <Prose>
          <p>Zoho rate-limits per OAuth client, so heavy MDM syncs can throttle patch calls (HTTP 429) and the reverse. Patch calls retry up to 4 times honouring Retry-After; if a refresh still fails, the last successful data is served and the server logs "serving last-known data".</p>
        </Prose>
      </DocCard>
      <DocCard>
        <CardHeader title="Windows Updates" description="docs/07-features/WINDOWS-UPDATES.md" />
        <Prose>
          <p>Windows exposure score, CISA Known Exploited Vulnerabilities deadline clock and the Patch Tuesday briefing, combining Endpoint Central missing OS patches with Intune Windows devices.</p>
        </Prose>
      </DocCard>
    </SectionWrap>
  )
}

// ─── Security analysis ───────────────────────────────────────────────────────

export function AnalysisSection() {
  return (
    <SectionWrap title="Security Analysis" description="Policy Conflicts, Risk Scoring and Role Activity Audit (Security group)">
      <DocCard>
        <CardHeader title="Risk Scoring" description="docs/07-features/RISK-SCORING.md · pages.Risk Scoring (Global Admin and IT Admin)" />
        <Prose>
          <p>Gives every Intune device a 0–100 risk score, highest first. The score is rule-based (an optional AI step only adds a short summary and actions; it never changes the score). Points: compliance up to 30, connectivity up to 25, encryption 20, OS version up to 15, storage up to 10.</p>
          <p><strong>Levels:</strong> critical 70–100, high 40–69, medium 20–39, low 0–19.</p>
        </Prose>
        <DocTable
          head={['Category', 'Rule']}
          rows={[
            ['Compliance (max 30)', 'noncompliant 30 · error 20 · conflict 18 · in grace period 10 · unknown 5'],
            ['Connectivity (max 25)', 'last sync over 30 days 25 · over 14 days 15 · over 7 days 6'],
            ['Encryption (20)', 'not encrypted 20'],
            ['OS version (max 15)', 'Windows below 10: 15 · macOS below 13: 10 · iOS below 16: 5 · Android below 11: 5'],
            ['Storage (max 10)', 'under 5% free 10 · under 15% free 4'],
          ]}
        />
      </DocCard>
      <DocCard>
        <CardHeader title="Policy Conflicts" description="docs/07-features/POLICY-CONFLICTS.md · pages.Policy Conflicts (Global Admin and IT Admin)" />
        <Prose>
          <p>Scans Intune compliance policies and configuration profiles for duplicates, stale items and name collisions. Names are normalised (lower-case, letters and digits only) before comparing. The page is read-only: it never changes Intune.</p>
        </Prose>
      </DocCard>
      <DocCard>
        <CardHeader title="Role Activity Audit" description="docs/07-features/ROLE-ACTIVITY-AUDIT.md · pages.Role Activity Audit, export needs roleActivity.export" />
        <Prose>
          <p>A live, merged view of admin role and permission changes from Microsoft Entra ID, Intune and SharePoint. Nothing is stored: each refresh queries the three sources. The default window is 24 hours and the maximum range is 31 days. Exports (CSV, JSON) are for roles with the export permission (IT Admin, Global Admin).</p>
        </Prose>
      </DocCard>
    </SectionWrap>
  )
}

// ─── Ocean ───────────────────────────────────────────────────────────────────

export function OceanSection() {
  return (
    <SectionWrap title="Ocean Assistant" description="The floating Ocean button answers questions about the tool and about live data">
      <DocCard>
        <CardHeader title="What Ocean knows" description="docs/07-features/OCEAN.md and AI-COPILOT.md" />
        <FactList rows={[
          ['Documentation', 'The indexed README, CLAUDE.md and everything in docs/ (plus documents an administrator uploads in Settings → Ocean Knowledge). Every documentation answer cites the document and section, with a View source documentation link. If nothing matches it says so and records a documentation gap.'],
          ['Live data tools', '17 role-filtered tools: risk scores, policy conflicts, security policy status, role activity, Falcon/Zscaler coverage, Security Posture summary, devices behind a pillar, one device\'s missing patches, posture diagnostics, scheduled reports, audit log, user intelligence, Intune scripts, device lookup, and three confirmed actions (Jira ticket, automation test run, Teams alert).'],
          ['Cannot read', 'Source code, secrets, non-text files, or any feature that has no document. Update the matching docs/07-features file when a feature changes, then re-index.'],
          ['Access', 'Chat: Global Admin, IT Admin, Helpdesk (copilot.access + copilot.read). Write actions: Global Admin and IT Admin, and only after the user confirms. Knowledge base admin: ocean.docs.manage.'],
        ]} />
      </DocCard>
      <DocCard>
        <CardHeader title="Things to ask" />
        <Prose>
          <p><strong>Live:</strong> "What is our security posture score?" · "Which Windows devices have encryption off?" · "Which Macs are missing critical patches?" · "What patches is WIN-123 missing?" · "How well did the sources match?"</p>
          <p><strong>How it works:</strong> "How is the posture score calculated?" · "What does Verdict based on mean?" · "Why do some Macs show not reported?" · "What is the Patch Operations health score?"</p>
        </Prose>
      </DocCard>
    </SectionWrap>
  )
}

// ─── Every page ──────────────────────────────────────────────────────────────

export function PagesIndexSection() {
  return (
    <SectionWrap title="Every Page (A–Z)" description="One line per page, with the document that explains it (docs/07-features/)">
      <DocCard>
        <CardHeader title="Page index" description="Page permission keys are pages.<Page title>; see Roles & Permissions" />
        <DocTable head={['Page', 'Sidebar group', 'What it does', 'Document']} rows={PAGES} />
      </DocCard>
    </SectionWrap>
  )
}

// ─── Remote Action Center ────────────────────────────────────────────────────

export function RemoteActionsSection() {
  return (
    <SectionWrap title="Remote Action Center" description="Run reviewed scripts on managed devices and query Microsoft Graph (Automations group)">
      <DocCard>
        <CardHeader title="Run a script in three steps" description="docs/07-features/REMOTE-ACTION-CENTER.md · permission pages.Remote Action Center" />
        <FactList rows={[
          ['1. Script', 'Pick a saved script, or paste/upload a .ps1 (Windows) or .sh (macOS) file and click Validate and review. The safety review is informational: any script can be saved, and flagged ones show why.'],
          ['2. Devices', 'Search and tick devices. Provider and timing (now, when online, scheduled, pilot) sit under "Delivery".'],
          ['3. Review and run', 'Pre-flight shows eligible and excluded devices with reasons. Add a justification for medium/high risk, type the device count for multi-device runs, then Run (or Request approval).'],
        ]} />
      </DocCard>
      <DocCard>
        <CardHeader title="Safety and approvals" description="Deterministic rules, no AI in the decision" />
        <Prose>
          <p><strong>Low</strong> risk needs no approval. <strong>Medium</strong> needs a justification and a one-time script approval (job approval only above 10 devices). <strong>High</strong> needs script approval and approval of every job. <strong>Blocked</strong> scripts (for example recursive delete of system paths, disk wipe, download-and-execute, hard-coded secrets) can be saved but never run. Nobody can approve their own request.</p>
        </Prose>
      </DocCard>
      <DocCard>
        <CardHeader title="Providers and status" />
        <Prose>
          <p>Only Microsoft Intune can execute scripts, and only when the Graph app registration has DeviceManagementScripts.ReadWrite.All and Group.ReadWrite.All (the Overview tab says Available or Unavailable and why). Endpoint Central execution is not available. Intune runs scripts at the device's next check-in, so results can take hours; progress is shown only when the script reports it.</p>
        </Prose>
      </DocCard>
      <DocCard>
        <CardHeader title="Graph API Runner" description="Allow-listed Microsoft Graph requests from the server" />
        <Prose>
          <p>Build or pick a template, Validate, then send. Reads run directly; changes need a justification and confirmation; destructive or bulk requests need an approver. Missing Graph permissions are listed and the request is not sent. Tokens never reach the browser, logs or downloads. Every request is kept in Graph API History.</p>
        </Prose>
      </DocCard>
    </SectionWrap>
  )
}
