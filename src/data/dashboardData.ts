import {
  BarChart3,
  Home,
  Server,
  Settings,
  Shield,
  ShieldCheck,
  Hash,
  MessageSquare,
  Zap,
  Monitor,
  GitBranch,
  Layers,
  MonitorOff,
  CalendarClock,
  Activity,
  Wrench,
  BookOpen,
  RefreshCcw,
  Package,
  TerminalSquare,
} from 'lucide-react'
import type {
  ComplianceDetailRow,
  NavItem,
  RunbookData,
  ConnectedSource,
  DeviceData,
  BadgeVariant,
} from '../types'

// ── Navigation — grouped into enterprise architecture sections ─────────────────

export const navItems: NavItem[] = [
  // ── OVERVIEW ──────────────────────────────────────────────────────────────────
  { id: 'dashboard',            title: 'Dashboard',           icon: Home,          group: 'Overview',     active: true },

  // ── DEVICES ───────────────────────────────────────────────────────────────────
  { id: 'managed_devices',      title: 'Managed Devices',     icon: Monitor,       group: 'Devices' },
  { id: 'stale_devices',        title: 'Stale Devices',       icon: MonitorOff,    group: 'Devices' },

  // ── APPLICATIONS ──────────────────────────────────────────────────────────────
  { id: 'manageengine_apps',    title: 'ManageEngine App Inventory', icon: Layers, group: 'Applications' },
  { id: 'app_guardian',         title: 'App Guardian',        icon: ShieldCheck,   group: 'Applications' },
  { id: 'windows_package_builder', title: 'Windows Package Builder', icon: Package, group: 'Applications' },

  // ── PATCHES ───────────────────────────────────────────────────────────────────
  { id: 'patch_operations',     title: 'Patch Operations',    icon: Wrench,        group: 'Patches' },
  { id: 'windows_updates',      title: 'Windows Updates',     icon: RefreshCcw,    group: 'Patches' },

  // ── SECURITY ──────────────────────────────────────────────────────────────────
  { id: 'security_posture',     title: 'Security Posture',    icon: Shield,        group: 'Security' },
  { id: 'role_activity_audit',  title: 'Role Activity Audit', icon: ShieldCheck,   group: 'Security' },
  { id: 'policy_conflicts',     title: 'Policy Conflicts',    icon: GitBranch,     group: 'Security' },
  { id: 'risk_scoring',         title: 'Risk Scoring',        icon: Activity,      group: 'Security' },

  // ── AUTOMATIONS ───────────────────────────────────────────────────────────────
  { id: 'automation',           title: 'Automation',          icon: Zap,           group: 'Automations' },
  { id: 'remote_action_center', title: 'Remote Action Center', icon: TerminalSquare, group: 'Automations' },

  // ── REPORTS ───────────────────────────────────────────────────────────────────
  { id: 'reports_analytics',    title: 'Reports & Analytics', icon: BarChart3,     group: 'Reports' },
  { id: 'scheduled_reports',    title: 'Scheduled Reports',   icon: CalendarClock, group: 'Reports' },

  // ── SETTINGS ──────────────────────────────────────────────────────────────────
  { id: 'settings',             title: 'Settings',            icon: Settings,      group: 'Settings' },
  { id: 'documentation',        title: 'Documentation',       icon: BookOpen,      group: 'Settings' },
]

// ── Group order — controls render sequence in sidebar ─────────────────────────
export const NAV_GROUP_ORDER = [
  'Overview',
  'Devices',
  'Applications',
  'Patches',
  'Security',
  'Automations',
  'Reports',
  'Settings',
] as const

// ── Automations group gets a distinct accent treatment ─────────────────────────
export const AUTOMATION_GROUP = 'Automations'

// ── Connected integration sources ─────────────────────────────────────────────

export const connectedSources: ConnectedSource[] = [
  { name: 'Microsoft Intune',   label: 'Intune',       status: 'Connected', icon: Server,      integrationId: 'intune'       },
  { name: 'Microsoft Entra ID', label: 'Entra ID',     status: 'Connected', icon: ShieldCheck, integrationId: 'entra'        },
  { name: 'Manage Engine',      label: 'ManageEngine', status: 'Connected', icon: Settings,    integrationId: 'manageengine' },
  { name: 'Slack',              label: 'Slack alerts', status: 'Connected', icon: MessageSquare, integrationId: 'slack'        },
  { name: 'Jira',               label: 'Jira',         status: 'Connected', icon: Hash,        integrationId: 'jira'         },
]

// ── Device-state helpers ───────────────────────────────────────────────────────

export function getRunbookForDevice(device: DeviceData): RunbookData {
  if (device.complianceState === 'Compliant') {
    return {
      runbookName: 'No Action Required',
      runbookLink: '',
      steps: [
        'Device is fully compliant.',
        'Continue monitoring via scheduled check-ins.',
      ],
      escalation: 'No',
      automation: 'N/A',
    }
  }
  if (device.platform === 'macOS') {
    return {
      runbookName: 'Enable FileVault on macOS',
      runbookLink: 'View steps in runbook',
      steps: [
        'Open System Settings > Privacy & Security.',
        'Enable FileVault encryption.',
        'Save the recovery key securely.',
        'Sync device with ManageEngine.',
        'Verify compliance after next check-in.',
      ],
      escalation: 'No',
      automation: 'Partial (ManageEngine)',
    }
  }
  if (device.recommendedRunbook === 'Force OS Update via Intune') {
    return {
      runbookName: 'Force OS Update via Intune',
      runbookLink: 'View steps in runbook',
      steps: device.nextSteps.length > 0 ? device.nextSteps : [
        'Check current OS version in Intune.',
        'Create or assign an OS update policy.',
        'Force update on non-compliant devices.',
        'Monitor update status in Intune dashboard.',
        'Confirm compliance after update completes.',
      ],
      escalation: 'No',
      automation: 'Yes (Intune)',
    }
  }
  return {
    runbookName: device.recommendedRunbook || 'Resolve Compliance Issue',
    runbookLink: 'View steps in runbook',
    steps: device.nextSteps.length > 0 ? device.nextSteps : [
      'Review the compliance issue in your MDM console.',
      'Apply the remediation policy.',
      'Trigger a device sync.',
      'Confirm compliance after the next check-in.',
    ],
    escalation: 'No',
    automation: 'Yes (Future Phase)',
  }
}

export function getComplianceRowsForDevice(device: DeviceData): ComplianceDetailRow[] {
  const getSeverityVariant = (severity: string): BadgeVariant => {
    switch (severity) {
      case 'Critical': return 'red'
      case 'High':   return 'red'
      case 'Medium': return 'orange'
      case 'Low':    return 'green'
      default:       return 'gray'
    }
  }

  return [
    { label: 'Primary Issue',   value: device.primaryIssue },
    { label: 'Policy Failed',   value: device.policyFailed },
    {
      label: 'Severity',
      value: device.severity,
      badge: { label: device.severity, variant: getSeverityVariant(device.severity) },
    },
    { label: 'Issue Category',  value: device.issueCategory },
    { label: 'Issue Source',    value: device.issueSource },
    { label: 'First Detected',  value: device.firstDetected },
    { label: 'Last Detected',   value: device.lastDetected },
    { label: 'Confidence',      value: device.confidence },
  ]
}

// Suppress unused-import warnings for icons used only in JSX context via navItems
void GitBranch
void Layers
