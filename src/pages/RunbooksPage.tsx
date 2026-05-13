import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  BookOpen, RefreshCw, Sparkles, ChevronDown, ChevronUp,
  Apple, Monitor, Laptop2, Ticket, ExternalLink, Copy,
  AlertTriangle, ShieldAlert, Check, ClipboardList,
  Library, Search, Zap, FileText, Wrench,
  HardDrive, RotateCcw, Package, Upload, LifeBuoy, X,
} from 'lucide-react'
import { api } from '../api'
import type { ApiDevice, DeviceAnalysis, JiraIssue, ConfluencePage } from '../api'
import { JiraModal } from '../components/runbooks/JiraModal'
import { ConfluenceModal } from '../components/runbooks/ConfluenceModal'
import { useToast } from '../components/ui/ToastProvider'

const SEVERITY_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }

const SEVERITY_BADGE: Record<string, string> = {
  Critical: 'bg-red-100 text-red-700 border-red-200',
  High:     'bg-orange-100 text-orange-700 border-orange-200',
  Medium:   'bg-amber-100 text-amber-700 border-amber-200',
  Low:      'bg-slate-100 text-slate-600 border-slate-200',
}

const COMPLIANCE_BADGE: Record<string, string> = {
  'Non-Compliant': 'bg-red-100 text-red-700 border-red-200',
  'Warning':       'bg-amber-100 text-amber-700 border-amber-200',
}

const CATEGORY_COLORS: Record<string, string> = {
  'Encryption / FileVault': '#ef4444',
  'Security / AV':          '#f97316',
  'OS / Patch':             '#f59e0b',
  'Device Check-in':        '#22c55e',
  'Compliance Policies':    '#a855f7',
  'Application Issues':     '#6366f1',
  'Other':                  '#64748b',
}

const RISK_COLOR: Record<string, string> = {
  Critical: 'text-red-600',
  High:     'text-orange-600',
  Medium:   'text-amber-600',
  Low:      'text-emerald-600',
}

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === 'macOS')   return <Apple   className="h-3.5 w-3.5 text-slate-400" />
  if (platform === 'Windows') return <Monitor className="h-3.5 w-3.5 text-slate-400" />
  return <Laptop2 className="h-3.5 w-3.5 text-slate-400" />
}

// Per-device runbook card
function RunbookDeviceCard({
  device,
  ai,
  aiLoading,
  jiraTickets,
  confluenceLinks,
  onAnalyze,
  onOpenJira,
  onOpenConfluence,
  onDetachConfluence,
}: {
  device:            ApiDevice
  ai:                DeviceAnalysis | null
  aiLoading:         boolean
  jiraTickets:       JiraIssue[]
  confluenceLinks:   ConfluencePage[]
  onAnalyze:         () => void
  onOpenJira:        () => void
  onOpenConfluence:  () => void
  onDetachConfluence:(id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const { notify } = useToast()

  const copySteps = () => {
    const steps = ai?.steps ?? []
    if (!steps.length) return
    navigator.clipboard.writeText(steps.map((s, i) => `${i + 1}. ${s}`).join('\n')).then(() => {
      notify('success', 'Copied', 'Remediation steps copied to clipboard')
    })
  }

  const catColor = CATEGORY_COLORS[device.issueSource] ?? '#64748b'

  return (
    <div className={`rounded-2xl border bg-white shadow-sm transition ${expanded ? 'border-orange-300 shadow-md' : 'border-slate-200 hover:border-slate-300'}`}>
      {/* Card header row */}
      <button
        type="button"
        className="w-full text-left px-5 py-4 flex items-start gap-3"
        onClick={() => {
          setExpanded(e => !e)
          if (!ai && !aiLoading && !expanded) onAnalyze()
        }}
      >
        {/* Platform icon */}
        <div className="mt-0.5 flex-shrink-0">
          <PlatformIcon platform={device.platform} />
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-800 text-sm">{device.deviceName}</span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500">{device.user}</span>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold ${COMPLIANCE_BADGE[device.complianceState] ?? ''}`}>
              {device.complianceState}
            </span>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold ${SEVERITY_BADGE[device.severity] ?? SEVERITY_BADGE.Low}`}>
              {device.severity}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor }} />
            <span className="text-xs text-slate-500">{device.issueSource || 'Other'}</span>
            {device.primaryIssue && (
              <>
                <span className="text-xs text-slate-300">—</span>
                <span className="text-xs text-slate-600 truncate">{device.primaryIssue}</span>
              </>
            )}
          </div>
        </div>

        {/* Expand chevron */}
        <div className="flex-shrink-0 text-slate-400">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4 flex flex-col gap-4">

          {/* AI Analysis */}
          <div className="rounded-xl border border-orange-100 bg-orange-50 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-orange-600" />
                <span className="text-xs font-semibold text-orange-700 uppercase tracking-wider">AI Analysis</span>
              </div>
              {!ai && !aiLoading && (
                <button type="button" onClick={onAnalyze} className="flex items-center gap-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 text-xs font-medium transition">
                  <Sparkles className="h-3 w-3" />
                  Analyze
                </button>
              )}
              {ai && (
                <span className={`text-xs font-semibold ${RISK_COLOR[ai.riskLevel] ?? 'text-slate-500'}`}>
                  Risk: {ai.riskLevel}
                </span>
              )}
            </div>

            {aiLoading && (
              <div className="flex items-center gap-2 text-orange-600 text-xs py-2">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Generating AI analysis…
              </div>
            )}

            {ai && !aiLoading && (
              <div className="flex flex-col gap-3">
                {ai.summary && (
                  <div>
                    <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500 mb-1">Summary</p>
                    <p className="text-xs text-slate-700">{ai.summary}</p>
                  </div>
                )}
                {ai.rootCause && (
                  <div>
                    <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500 mb-1">Root Cause</p>
                    <p className="text-xs text-slate-700">{ai.rootCause}</p>
                  </div>
                )}
                {ai.recommendation && (
                  <div>
                    <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500 mb-1">Recommendation</p>
                    <p className="text-xs text-slate-700">{ai.recommendation}</p>
                  </div>
                )}
                {ai.steps.length > 0 && (
                  <div>
                    <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500 mb-2">Remediation Steps</p>
                    <ol className="flex flex-col gap-1.5">
                      {ai.steps.map((step, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                          <span className="flex-shrink-0 mt-0.5 grid h-4 w-4 place-items-center rounded-full bg-orange-200 text-orange-700 text-[0.6rem] font-bold">{i + 1}</span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {ai.suggestedRunbook && (
                  <div className="rounded-lg border border-orange-200 bg-white px-3 py-2 flex items-center gap-2">
                    <BookOpen className="h-3.5 w-3.5 text-orange-600 flex-shrink-0" />
                    <span className="text-xs text-slate-600"><span className="font-semibold">Suggested runbook:</span> {ai.suggestedRunbook}</span>
                  </div>
                )}
              </div>
            )}

            {!ai && !aiLoading && (
              <p className="text-xs text-slate-400 py-2">Click <span className="font-medium text-orange-600">Analyze</span> to generate AI-powered root cause analysis and remediation steps.</p>
            )}
          </div>

          {/* Linked Confluence articles */}
          {confluenceLinks.length > 0 && (
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500 mb-2">Linked Articles</p>
              <div className="flex flex-col gap-1.5">
                {confluenceLinks.map(page => (
                  <div key={page.id} className="flex items-center justify-between gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <BookOpen className="h-3.5 w-3.5 text-orange-600 flex-shrink-0" />
                      <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[0.6rem] font-bold text-orange-700 uppercase">{page.space}</span>
                      <span className="text-xs text-slate-700 truncate">{page.title}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <a href={page.url} target="_blank" rel="noreferrer" className="rounded p-1 hover:bg-orange-100 text-slate-400 hover:text-orange-600 transition">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      <button type="button" onClick={() => onDetachConfluence(page.id)} className="rounded p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 transition">
                        <span className="sr-only">Remove</span>
                        <span aria-hidden className="text-[0.65rem]">✕</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Linked Jira tickets */}
          {jiraTickets.length > 0 && (
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500 mb-2">Jira Tickets</p>
              <div className="flex flex-col gap-1.5">
                {jiraTickets.map(ticket => (
                  <div key={ticket.id} className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2">
                    <Ticket className="h-3.5 w-3.5 text-orange-600 flex-shrink-0" />
                    <a href={ticket.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-orange-700 hover:underline flex-shrink-0">{ticket.key}</a>
                    <span className="text-xs text-slate-600 truncate">{ticket.summary}</span>
                    <span className={`ml-auto flex-shrink-0 rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold ${SEVERITY_BADGE[ticket.priority] ?? SEVERITY_BADGE.Low}`}>{ticket.priority}</span>
                    <span className="text-[0.6rem] text-slate-400 flex-shrink-0">{ticket.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={onOpenJira}
              className="flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 hover:bg-orange-100 px-3 py-2 text-xs font-medium text-orange-700 transition"
            >
              <Ticket className="h-3.5 w-3.5" />
              Create Jira Ticket
            </button>
            <button
              type="button"
              onClick={onOpenConfluence}
              className="flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 hover:bg-orange-100 px-3 py-2 text-xs font-medium text-orange-700 transition"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Link Confluence Article
            </button>
            {ai && ai.steps.length > 0 && (
              <button
                type="button"
                onClick={copySteps}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 transition"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy Steps
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Static Runbook Library ──────────────────────────────────────────────────

interface StaticRunbook {
  id: string
  name: string
  description: string
  platform: 'Windows' | 'macOS' | 'Cross-platform'
  category: string
  severity: 'Critical' | 'High' | 'Medium' | 'Low'
  automationAvailable: boolean
  escalationRequired: boolean
  estimatedTime: string
  symptoms: string[]
  rootCause: string
  steps: string[]
  escalationPath: string
  icon: typeof HardDrive
}

const STATIC_RUNBOOKS: StaticRunbook[] = [
  {
    id: 'bitlocker',
    name: 'BitLocker Encryption Enforcement',
    description: 'Enable and enforce BitLocker disk encryption on Windows devices via Intune or Group Policy.',
    platform: 'Windows',
    category: 'Encryption / FileVault',
    severity: 'Critical',
    automationAvailable: true,
    escalationRequired: false,
    estimatedTime: '15–30 min',
    symptoms: ['Encryption status: Off', 'BitLocker not enabled', 'Compliance policy failed: Encryption'],
    rootCause: 'BitLocker not initialized on the device, or TPM chip not configured correctly.',
    steps: [
      'Verify device has TPM 2.0 chip enabled in BIOS/UEFI settings.',
      'In Intune, navigate to Endpoint Security → Disk Encryption → Create policy.',
      'Assign BitLocker policy to the target device group.',
      'Force device sync: Settings → Accounts → Access work or school → Sync.',
      'Verify BitLocker status via: manage-bde -status C: in Command Prompt.',
      'Confirm compliance in Intune Device Compliance report.',
    ],
    escalationPath: 'Escalate to L2 if TPM chip is missing or BIOS is locked by vendor.',
    icon: HardDrive,
  },
  {
    id: 'filevault',
    name: 'FileVault Activation (macOS)',
    description: 'Enable FileVault full-disk encryption on macOS via Kandji or Jamf MDM enforcement.',
    platform: 'macOS',
    category: 'Encryption / FileVault',
    severity: 'Critical',
    automationAvailable: true,
    escalationRequired: false,
    estimatedTime: '10–20 min',
    symptoms: ['FileVault: Off', 'macOS encryption not enabled', 'Compliance failure: FileVault'],
    rootCause: 'FileVault not enabled by user or deferred enrollment without enforcement.',
    steps: [
      'In Kandji, go to Library → FileVault → Enable enforcement.',
      'Assign the FileVault configuration to the device blueprint.',
      'Ask the user to log out and back in to trigger FileVault prompt.',
      'User clicks Enable FileVault and saves the recovery key.',
      'Escrow the recovery key to Kandji / Jamf.',
      'Verify via: fdesetup status in Terminal — should show "FileVault is On".',
      'Confirm compliance status in MDM after next device check-in.',
    ],
    escalationPath: 'Escalate if device is running macOS older than 10.15 or if recovery key cannot be escrowed.',
    icon: HardDrive,
  },
  {
    id: 'intune-sync',
    name: 'Intune Sync / MDM Re-enrollment',
    description: 'Force MDM synchronization or re-enroll a device that has lost its management profile.',
    platform: 'Windows',
    category: 'Device Check-in',
    severity: 'High',
    automationAvailable: true,
    escalationRequired: false,
    estimatedTime: '20–45 min',
    symptoms: ['Device not syncing', 'Last check-in >48h', 'MDM enrollment status: Unknown'],
    rootCause: 'MDM agent failure, enrollment certificate expired, or device left Azure AD.',
    steps: [
      'Ask user to open: Settings → Accounts → Access work or school.',
      'Click the connected work account → Info → Sync.',
      'If sync fails, remove the account and re-add it.',
      'If enrollment is broken, run: dsregcmd /leave then dsregcmd /join.',
      'Re-enroll via Company Portal: download and sign in.',
      'Confirm enrollment in Intune: Devices → All Devices → find device.',
      'Force re-push all policies from Intune console.',
    ],
    escalationPath: 'Escalate to L2 if re-enrollment fails due to Azure AD conditional access or licensing issues.',
    icon: RotateCcw,
  },
  {
    id: 'restart-agent',
    name: 'Restart MDM Agent',
    description: 'Restart the MDM management agent when the device stops checking in correctly.',
    platform: 'Cross-platform',
    category: 'Device Check-in',
    severity: 'Medium',
    automationAvailable: true,
    escalationRequired: false,
    estimatedTime: '5–10 min',
    symptoms: ['Agent unresponsive', 'Check-in timeout', 'MDM commands queued but not executed'],
    rootCause: 'MDM agent process crashed, hung, or was blocked by third-party security software.',
    steps: [
      'Windows: Open Services → find "IntuneManagementExtension" → Restart.',
      'Windows CMD (admin): net stop IntuneManagementExtension && net start IntuneManagementExtension',
      'macOS (Kandji): sudo launchctl kickstart -k system/com.kandji.agent',
      'macOS (Jamf): sudo jamf recon',
      'Force a device sync from the MDM console after restarting.',
      'Wait 5 minutes and verify check-in timestamp updated in MDM.',
    ],
    escalationPath: 'Escalate if agent repeatedly crashes — may indicate AV interference or corrupted installation.',
    icon: Zap,
  },
  {
    id: 'collect-logs',
    name: 'Collect Diagnostic Logs',
    description: 'Gather MDM, system, and application logs from the device for L2 troubleshooting.',
    platform: 'Cross-platform',
    category: 'Other',
    severity: 'Low',
    automationAvailable: true,
    escalationRequired: false,
    estimatedTime: '10–15 min',
    symptoms: ['Intermittent compliance failures', 'Unexplained policy failures', 'Repeated agent crashes'],
    rootCause: 'Root cause unknown — logs needed for diagnosis.',
    steps: [
      'Windows: Run "mdmdiagnosticstool.exe -area DeviceEnrollment;DeviceProvisioning;TPM" in admin CMD.',
      'Collect event logs: Event Viewer → Applications and Services → Microsoft → Windows → DeviceManagement.',
      'macOS: Use Console.app to filter by "com.kandji" or "com.microsoft".',
      'macOS: Run: sudo mdmclient QueryInstalledApps',
      'Package logs and upload to IT ticketing system for review.',
      'If Intune, use Intune Diagnostics: Devices → select device → Collect Diagnostics.',
    ],
    escalationPath: 'Pass collected logs to L2 with ticket number and device details.',
    icon: FileText,
  },
  {
    id: 'company-portal',
    name: 'Company Portal Reinstall',
    description: 'Reinstall the Microsoft Company Portal app when enrollment or app access is broken.',
    platform: 'Windows',
    category: 'Application Issues',
    severity: 'Medium',
    automationAvailable: true,
    escalationRequired: false,
    estimatedTime: '15–25 min',
    symptoms: ['Company Portal missing', 'Cannot access corporate apps', 'SSO failures after app removal'],
    rootCause: 'Company Portal was uninstalled, corrupted, or not automatically pushed by Intune.',
    steps: [
      'Check Intune: Apps → All Apps — verify Company Portal is assigned to device group.',
      'If missing from assignment, add device group and set install type to "Required".',
      'Force device sync to trigger app push.',
      'If assignment exists but app missing, manually install from Microsoft Store.',
      'After install, sign in with corporate credentials.',
      'Test access to corporate resources (email, SharePoint).',
      'Re-verify compliance state in Intune.',
    ],
    escalationPath: 'Escalate if Company Portal cannot be installed due to App Store restrictions or MDM app store policy.',
    icon: Package,
  },
  {
    id: 'enrollment-failure',
    name: 'Enrollment Failure Recovery',
    description: 'Recover a device that failed initial MDM enrollment or lost its enrollment state.',
    platform: 'Cross-platform',
    category: 'Device Check-in',
    severity: 'High',
    automationAvailable: false,
    escalationRequired: true,
    estimatedTime: '30–60 min',
    symptoms: ['Enrollment failed', 'Device shows as unmanaged', 'No management profile installed'],
    rootCause: 'Network failure during enrollment, expired token, user error, or quota limit reached.',
    steps: [
      'Confirm the user has a valid Intune/MDM license assigned in Azure AD.',
      'Check Intune enrollment restrictions — verify the device OS and type are allowed.',
      'Clear old enrollment: Windows — dsregcmd /leave; macOS — remove MDM profile in System Settings.',
      'For iOS/macOS: use Apple Configurator or Automated Device Enrollment (ADE) for corporate devices.',
      'Re-initiate enrollment from the MDM portal or email the user an enrollment link.',
      'Monitor enrollment events in Intune: Devices → Monitor → Enrollment Failures.',
      'After successful enrollment, verify all policies and apps are pushed.',
    ],
    escalationPath: 'Escalate to L2 if device block is due to Azure AD conditional access or corporate enrollment restrictions.',
    icon: Upload,
  },
  {
    id: 'app-deployment',
    name: 'App Deployment Failure',
    description: 'Troubleshoot and remediate failed application deployments from the MDM app catalog.',
    platform: 'Cross-platform',
    category: 'Application Issues',
    severity: 'Medium',
    automationAvailable: true,
    escalationRequired: false,
    estimatedTime: '15–30 min',
    symptoms: ['App shows as Failed in MDM', 'User cannot install required app', 'Error code in app deployment logs'],
    rootCause: 'Network issue, storage constraint, app configuration error, or policy conflict.',
    steps: [
      'Identify the failing app in MDM: Apps → All Apps → Monitor → App Install Status.',
      'Note the error code and look it up in Microsoft/Kandji documentation.',
      'Check device storage — ensure sufficient free space for installation.',
      'Verify the app configuration/package is valid and updated.',
      'Check for conflicting Group Policy objects that block app installations.',
      'Retry deployment: Remove and re-add the app assignment, force sync.',
      'If persistent, redeploy the app as a Win32 app with detection rules.',
      'Confirm installation via MDM compliance dashboard.',
    ],
    escalationPath: 'Escalate to L2 if error code indicates a licensing, MSI packaging, or dependency issue.',
    icon: Wrench,
  },
  {
    id: 'escalate-l2',
    name: 'Escalate to L2 Support',
    description: 'Standard escalation procedure when L1 remediation steps are exhausted.',
    platform: 'Cross-platform',
    category: 'Other',
    severity: 'High',
    automationAvailable: false,
    escalationRequired: true,
    estimatedTime: '5 min (handoff)',
    symptoms: ['All L1 remediation attempts failed', 'Issue requires admin-level access', 'Hardware fault suspected'],
    rootCause: 'Issue complexity exceeds L1 scope — requires elevated access, vendor engagement, or hardware intervention.',
    steps: [
      'Document all steps already attempted in the Jira ticket.',
      'Capture device serial number, OS version, management source, and error messages.',
      'Collect diagnostic logs (see Collect Diagnostic Logs runbook).',
      'Assign the Jira ticket to the L2 queue with "Escalated" label.',
      'Brief the L2 technician with a concise summary of the issue and attempted fixes.',
      'If SLA is at risk, notify the user and their manager via email.',
    ],
    escalationPath: 'L2 → L3 (Engineering) if issue requires code-level investigation or vendor support case.',
    icon: LifeBuoy,
  },
]

const LIBRARY_CATEGORIES = ['All', ...Array.from(new Set(STATIC_RUNBOOKS.map(r => r.category)))]
const LIBRARY_PLATFORMS  = ['All', 'Windows', 'macOS', 'Cross-platform']

function RunbookLibraryCard({ runbook }: { runbook: StaticRunbook }) {
  const [expanded, setExpanded] = useState(false)
  const { notify } = useToast()
  const Icon = runbook.icon

  const copySteps = () => {
    navigator.clipboard.writeText(runbook.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'))
      .then(() => notify('success', 'Copied', 'Runbook steps copied to clipboard'))
  }

  const severityColor: Record<string, string> = {
    Critical: 'bg-red-100 text-red-700 border-red-200',
    High:     'bg-orange-100 text-orange-700 border-orange-200',
    Medium:   'bg-amber-100 text-amber-700 border-amber-200',
    Low:      'bg-slate-100 text-slate-600 border-slate-200',
  }

  const platformColor = runbook.platform === 'Windows' ? 'bg-orange-100 text-orange-700 border-orange-200'
    : runbook.platform === 'macOS' ? 'bg-lime-100 text-lime-700 border-lime-200'
    : 'bg-slate-100 text-slate-600 border-slate-200'

  return (
    <div className={`rounded-2xl border bg-white shadow-sm transition-all ${expanded ? 'border-orange-300 shadow-md' : 'border-slate-200 hover:border-slate-300'}`}>
      {/* Header */}
      <button type="button" className="w-full text-left px-5 py-4" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-2 flex-shrink-0 mt-0.5">
            <Icon className="h-4 w-4 text-slate-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-sm font-semibold text-slate-800">{runbook.name}</span>
              <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[0.6rem] font-bold ${severityColor[runbook.severity]}`}>
                {runbook.severity}
              </span>
              <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[0.6rem] font-semibold ${platformColor}`}>
                {runbook.platform}
              </span>
              {runbook.automationAvailable && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[0.6rem] font-semibold text-emerald-700">
                  <Zap className="h-2.5 w-2.5" /> Automatable
                </span>
              )}
              {runbook.escalationRequired && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[0.6rem] font-semibold text-amber-700">
                  <LifeBuoy className="h-2.5 w-2.5" /> Needs Escalation
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 leading-snug">{runbook.description}</p>
            <div className="flex items-center gap-3 mt-1.5 text-[0.65rem] text-slate-400">
              <span className="flex items-center gap-1"><Search className="h-2.5 w-2.5" />{runbook.category}</span>
              <span className="flex items-center gap-1"><RefreshCw className="h-2.5 w-2.5" />{runbook.estimatedTime}</span>
            </div>
          </div>
          <div className="flex-shrink-0 text-slate-400 mt-0.5">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </button>

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-4">
          {/* Symptoms */}
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500 mb-2">Common Symptoms</p>
            <div className="flex flex-wrap gap-1.5">
              {runbook.symptoms.map(s => (
                <span key={s} className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[0.68rem] text-amber-700">
                  <AlertTriangle className="h-2.5 w-2.5" />{s}
                </span>
              ))}
            </div>
          </div>

          {/* Root cause */}
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500 mb-1">Root Cause</p>
            <p className="text-xs text-slate-700 bg-slate-50 rounded-xl border border-slate-200 px-3 py-2">{runbook.rootCause}</p>
          </div>

          {/* Steps */}
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500 mb-2">Remediation Steps</p>
            <ol className="flex flex-col gap-2">
              {runbook.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2.5 text-xs text-slate-700">
                  <span className="flex-shrink-0 mt-0.5 grid h-4 w-4 place-items-center rounded-full bg-orange-100 text-orange-700 text-[0.6rem] font-bold">{i + 1}</span>
                  <span className="font-mono text-[0.7rem] text-slate-700 leading-snug">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Escalation path */}
          <div className={`rounded-xl border px-3 py-2.5 flex items-start gap-2 ${runbook.escalationRequired ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
            <LifeBuoy className={`h-3.5 w-3.5 flex-shrink-0 mt-0.5 ${runbook.escalationRequired ? 'text-amber-600' : 'text-slate-400'}`} />
            <div>
              <p className={`text-[0.62rem] font-semibold uppercase tracking-wide mb-0.5 ${runbook.escalationRequired ? 'text-amber-700' : 'text-slate-500'}`}>Escalation Path</p>
              <p className="text-[0.72rem] text-slate-700">{runbook.escalationPath}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button type="button" onClick={copySteps}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 transition">
              <Copy className="h-3.5 w-3.5" /> Copy Steps
            </button>
            <span className={`ml-auto text-[0.65rem] font-medium ${runbook.automationAvailable ? 'text-emerald-600' : 'text-slate-400'}`}>
              {runbook.automationAvailable ? '⚡ Automation available' : '✋ Manual process'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function RunbookLibrary() {
  const [catFilter, setCatFilter] = useState('All')
  const [platFilter, setPlatFilter] = useState('All')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return STATIC_RUNBOOKS.filter(r => {
      if (catFilter !== 'All' && r.category !== catFilter) return false
      if (platFilter !== 'All' && r.platform !== platFilter) return false
      if (q && !r.name.toLowerCase().includes(q) && !r.description.toLowerCase().includes(q) && !r.category.toLowerCase().includes(q)) return false
      return true
    })
  }, [catFilter, platFilter, query])

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-orange-50 border border-orange-200">
          <Library className="h-5 w-5 text-orange-600" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-800">Runbook Library</h2>
          <p className="text-xs text-slate-500">{STATIC_RUNBOOKS.length} standard runbooks · Expand any to view steps</p>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-4 py-3 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search runbooks…"
            className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-8 text-xs text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20" />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        {/* Category + Platform */}
        <div className="flex gap-2 flex-wrap">
          {LIBRARY_CATEGORIES.map(c => (
            <button key={c} type="button" onClick={() => setCatFilter(c)}
              className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold transition ${catFilter === c ? 'bg-orange-600 border-orange-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
              {c}
            </button>
          ))}
          <div className="w-px h-6 bg-slate-200 self-center" />
          {LIBRARY_PLATFORMS.map(p => (
            <button key={p} type="button" onClick={() => setPlatFilter(p)}
              className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold transition ${platFilter === p ? 'bg-lime-600 border-lime-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
          <Library className="h-8 w-8 opacity-30" />
          <p className="text-sm">No runbooks match your filters</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(r => <RunbookLibraryCard key={r.id} runbook={r} />)}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type SeverityFilter = 'All' | 'Critical' | 'High' | 'Medium' | 'Low'
type ComplianceFilter = 'All' | 'Non-Compliant' | 'Warning'

export function RunbooksPage() {
  const [activeTab, setActiveTab]     = useState<'ai' | 'library'>('ai')
  const [devices, setDevices]         = useState<ApiDevice[]>([])
  const [loading, setLoading]         = useState(true)

  // AI results keyed by device.id
  const [aiMap, setAiMap]             = useState<Record<string, DeviceAnalysis>>({})
  const [aiLoadingIds, setAiLoadingIds] = useState<Set<string>>(new Set())

  // Per-device Jira tickets and Confluence links (local state, not persisted)
  const [jiraMap, setJiraMap]         = useState<Record<string, JiraIssue[]>>({})
  const [confMap, setConfMap]         = useState<Record<string, ConfluencePage[]>>({})

  // Modal state
  const [jiraTarget, setJiraTarget]   = useState<ApiDevice | null>(null)
  const [confTarget, setConfTarget]   = useState<ApiDevice | null>(null)

  // Filters
  const [severityFilter, setSeverityFilter]     = useState<SeverityFilter>('All')
  const [complianceFilter, setComplianceFilter] = useState<ComplianceFilter>('All')
  const [categoryFilter, setCategoryFilter]     = useState<string | null>(null)

  const { notify } = useToast()

  const fetchDevices = useCallback(async () => {
    setLoading(true)
    try {
      const [nc, warn] = await Promise.all([
        api.fetchAllDevicesRaw({ compliance: 'Non-Compliant', limit: 500 }),
        api.fetchAllDevicesRaw({ compliance: 'Warning', limit: 500 }),
      ])
      setDevices([...nc.devices, ...warn.devices])
    } catch {
      setDevices([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchDevices() }, [fetchDevices])

  const analyzeDevice = useCallback(async (device: ApiDevice) => {
    if (aiMap[device.id] || aiLoadingIds.has(device.id)) return
    setAiLoadingIds(prev => new Set([...prev, device.id]))
    try {
      const result = await api.analyzeDeviceFields({
        deviceName:       device.deviceName,
        user:             device.user,
        platform:         device.platform,
        osVersion:        device.osVersion,
        managementSource: device.managementSource,
        complianceState:  device.complianceState,
        encryptionStatus: device.encryptionStatus,
        primaryIssue:     device.primaryIssue,
        policyFailed:     device.policyFailed,
        severity:         device.severity,
      })
      setAiMap(prev => ({ ...prev, [device.id]: result }))
    } catch {
      notify('error', 'AI Error', `Could not analyze ${device.deviceName}`)
    } finally {
      setAiLoadingIds(prev => { const s = new Set(prev); s.delete(device.id); return s })
    }
  }, [aiMap, aiLoadingIds, notify])

  const analyzeAll = async () => {
    const unanalyzed = devices.filter(d => !aiMap[d.id] && !aiLoadingIds.has(d.id))
    // Queue in batches of 3 to avoid flooding
    for (let i = 0; i < unanalyzed.length; i += 3) {
      const batch = unanalyzed.slice(i, i + 3)
      await Promise.allSettled(batch.map(d => analyzeDevice(d)))
    }
  }

  // Derived breakdowns
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {}
    devices.forEach(d => { const c = d.issueSource || 'Other'; map[c] = (map[c] ?? 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }))
  }, [devices])

  const severityCounts = useMemo(() => ({
    Critical: devices.filter(d => d.severity === 'Critical').length,
    High:     devices.filter(d => d.severity === 'High').length,
    Medium:   devices.filter(d => d.severity === 'Medium').length,
    Low:      devices.filter(d => d.severity === 'Low').length,
  }), [devices])

  const filteredDevices = useMemo(() => {
    return devices
      .filter(d => severityFilter === 'All' || d.severity === severityFilter)
      .filter(d => complianceFilter === 'All' || d.complianceState === complianceFilter)
      .filter(d => !categoryFilter || (d.issueSource || 'Other') === categoryFilter)
      .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4))
  }, [devices, severityFilter, complianceFilter, categoryFilter])

  const analysedCount = Object.keys(aiMap).length

  return (
    <div className="flex flex-col gap-5">
      {/* ── Header + Tab bar ───────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-lime-50 border border-lime-200">
            <ClipboardList className="h-5 w-5 text-lime-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Runbooks</h1>
            <p className="text-xs text-slate-500">{activeTab === 'ai' ? `AI-generated remediation for all open issues · ${devices.length} devices` : `${STATIC_RUNBOOKS.length} standard runbooks across 9 categories`}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Tab switcher */}
          <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 gap-0.5">
            <button type="button" onClick={() => setActiveTab('ai')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${activeTab === 'ai' ? 'bg-white text-lime-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Sparkles className="h-3.5 w-3.5" /> AI Runbooks
            </button>
            <button type="button" onClick={() => setActiveTab('library')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${activeTab === 'library' ? 'bg-white text-orange-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Library className="h-3.5 w-3.5" /> Library
            </button>
          </div>
          {activeTab === 'ai' && (
            <>
              <button
                type="button"
                onClick={analyzeAll}
                disabled={loading || devices.length === 0}
                className="flex items-center gap-1.5 rounded-xl bg-lime-600 hover:bg-lime-700 text-white px-4 py-2 text-sm font-medium transition disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                Analyze All ({analysedCount}/{devices.length})
              </button>
              <button
                type="button"
                onClick={fetchDevices}
                disabled={loading}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium text-slate-500 transition disabled:opacity-50 ${loading ? 'border-orange-300 bg-orange-50 animate-pulse' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-orange-500' : ''}`} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Library tab ─────────────────────────────────────────────── */}
      {activeTab === 'library' && <RunbookLibrary />}

      {/* ── AI tab content ─────────────────────────────────────────── */}
      {activeTab === 'ai' && <>

      {/* ── Summary strip ──────────────────────────────────────────── */}
      <div className="rounded-2xl border border-lime-200 bg-lime-50 px-5 py-4 flex items-center gap-6 flex-wrap">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Open Issues</p>
          <p className="text-2xl font-bold text-lime-700">{loading ? '—' : devices.length}</p>
          <p className="text-xs text-slate-500 mt-0.5">{analysedCount} AI-analysed</p>
        </div>
        <div className="h-10 w-px bg-lime-200" />
        {(['Critical', 'High', 'Medium', 'Low'] as const).map(sev => severityCounts[sev] > 0 && (
          <div key={sev}>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{sev}</p>
            <p className={`text-xl font-bold ${RISK_COLOR[sev]}`}>{severityCounts[sev]}</p>
          </div>
        ))}
      </div>

      {/* ── Filters ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-5 py-4 flex flex-col gap-4">
        {/* Severity tabs */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">By Severity</p>
          <div className="flex flex-wrap gap-2">
            {(['All', 'Critical', 'High', 'Medium', 'Low'] as SeverityFilter[]).map(sev => {
              const count = sev === 'All' ? devices.length : severityCounts[sev]
              const isActive = severityFilter === sev
              return (
                <button
                  key={sev}
                  type="button"
                  onClick={() => setSeverityFilter(sev)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                    isActive ? 'border-orange-400 bg-orange-50 text-orange-700 ring-2 ring-orange-200' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {sev}
                  <span className={`rounded-full px-1.5 py-0.5 font-semibold ${isActive ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Compliance + Category row */}
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">By Status</p>
            <div className="flex flex-wrap gap-2">
              {(['All', 'Non-Compliant', 'Warning'] as ComplianceFilter[]).map(cf => {
                const count = cf === 'All' ? devices.length : devices.filter(d => d.complianceState === cf).length
                const isActive = complianceFilter === cf
                return (
                  <button
                    key={cf}
                    type="button"
                    onClick={() => setComplianceFilter(cf)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                      isActive ? 'border-orange-400 bg-orange-50 text-orange-700 ring-2 ring-orange-200' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {cf === 'Non-Compliant' && <ShieldAlert className="h-3 w-3 text-red-500" />}
                    {cf === 'Warning' && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                    {cf}
                    <span className={`rounded-full px-1.5 py-0.5 font-semibold ${isActive ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">By Issue Category</p>
            <div className="flex flex-wrap gap-2">
              {categoryBreakdown.map(({ key, count }) => {
                const isActive = categoryFilter === key
                const color = CATEGORY_COLORS[key] ?? '#64748b'
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCategoryFilter(isActive ? null : key)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                      isActive ? 'border-orange-400 bg-orange-50 text-orange-700 ring-2 ring-orange-200' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    {key}
                    <span className={`rounded-full px-1.5 py-0.5 font-semibold ${isActive ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
                  </button>
                )
              })}
              {categoryFilter && (
                <button type="button" onClick={() => setCategoryFilter(null)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50 transition">Clear ×</button>
              )}
            </div>
          </div>
        </div>

        {/* AI analysis progress */}
        {analysedCount > 0 && (
          <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
            <div className="flex-1 rounded-full bg-slate-200 h-1.5 overflow-hidden">
              <div className="h-full rounded-full bg-lime-500 transition-all" style={{ width: `${(analysedCount / devices.length) * 100}%` }} />
            </div>
            <span className="text-xs text-slate-500 flex-shrink-0">
              <Check className="inline h-3 w-3 text-emerald-500 mr-1" />
              {analysedCount} of {devices.length} AI-analysed
            </span>
          </div>
        )}
      </div>

      {/* ── Device cards ───────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 gap-2 text-sm">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading devices…
        </div>
      ) : filteredDevices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
          <ClipboardList className="h-8 w-8 opacity-30" />
          <p className="text-sm font-medium">No devices match your filters</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredDevices.map(device => (
            <RunbookDeviceCard
              key={device.id}
              device={device}
              ai={aiMap[device.id] ?? null}
              aiLoading={aiLoadingIds.has(device.id)}
              jiraTickets={jiraMap[device.id] ?? []}
              confluenceLinks={confMap[device.id] ?? []}
              onAnalyze={() => analyzeDevice(device)}
              onOpenJira={() => setJiraTarget(device)}
              onOpenConfluence={() => setConfTarget(device)}
              onDetachConfluence={pageId => setConfMap(prev => ({ ...prev, [device.id]: (prev[device.id] ?? []).filter(p => p.id !== pageId) }))}
            />
          ))}
        </div>
      )}

      {/* Jira modal */}
      {jiraTarget && (
        <JiraModal
          device={jiraTarget}
          ai={aiMap[jiraTarget.id] ?? null}
          onClose={() => setJiraTarget(null)}
          onCreated={ticket => {
            setJiraMap(prev => ({ ...prev, [jiraTarget.id]: [...(prev[jiraTarget.id] ?? []), ticket] }))
            notify('success', 'Ticket Created', `${ticket.key} created in Jira`)
            setJiraTarget(null)
          }}
        />
      )}

      {/* Confluence modal */}
      {confTarget && (
        <ConfluenceModal
          device={confTarget}
          attached={confMap[confTarget.id] ?? []}
          onClose={() => setConfTarget(null)}
          onAttach={page => setConfMap(prev => ({ ...prev, [confTarget.id]: [...(prev[confTarget.id] ?? []).filter(p => p.id !== page.id), page] }))}
          onDetach={pageId => setConfMap(prev => ({ ...prev, [confTarget.id]: (prev[confTarget.id] ?? []).filter(p => p.id !== pageId) }))}
        />
      )}

      </>}
    </div>
  )
}
