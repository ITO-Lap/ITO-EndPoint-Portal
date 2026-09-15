import {
  BarChart3,
  BookOpen,
  Clock3,
  Cloud,
  Home,
  Search,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Users,
  Hash,
  Zap,
  AlertTriangle,
  Monitor,
  GitBranch,
  Layers,
  Radar,
  Stethoscope,
  Brain,
  FileText,
  ClipboardList,
  Package,
  Activity,
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
  { id: 'dashboard',            title: 'Dashboard',           icon: Home,          group: 'Overview',               active: true },

  // ── ENDPOINT MANAGEMENT ───────────────────────────────────────────────────────
  { id: 'device_lookup',        title: 'Device Lookup',           icon: Search,        group: 'Endpoint Management' },
  { id: 'mac_devices',          title: 'Mac Devices',             icon: Monitor,       group: 'Endpoint Management' },
  { id: 'intune_devices',       title: 'Intune Devices',          icon: Server,        group: 'Endpoint Management' },
  { id: 'manageengine_devices', title: 'ManageEngine Devices',    icon: Layers,        group: 'Endpoint Management' },
  { id: 'open_issues',          title: 'Open Issues',             icon: AlertTriangle, group: 'Endpoint Management' },
  { id: 'smart_diagnostics',    title: 'Diagnostics',             icon: Stethoscope,   group: 'Endpoint Management' },

  // ── SECURITY & COMPLIANCE ─────────────────────────────────────────────────────
  { id: 'security_posture',     title: 'Security Posture',    icon: Shield,        group: 'Security & Compliance' },
  { id: 'vulnerabilities',      title: 'Vulnerabilities',     icon: ShieldAlert,   group: 'Security & Compliance' },
  { id: 'edr',                  title: 'EDR',                 icon: Radar,         group: 'Security & Compliance' },
  { id: 'role_activity_audit',  title: 'Role Activity Audit', icon: ShieldCheck,   group: 'Security & Compliance' },
  { id: 'security_policies',    title: 'Security Policies',   icon: ShieldCheck,   group: 'Security & Compliance' },

  // ── USERS & IDENTITY ──────────────────────────────────────────────────────────
  { id: 'users',                title: 'Users',               icon: Users,         group: 'Users & Identity' },

  // ── AUTOMATION ────────────────────────────────────────────────────────────────
  { id: 'automation',           title: 'Automation',          icon: Zap,           group: 'Automation' },
  { id: 'runbooks',             title: 'Runbooks',            icon: BookOpen,      group: 'Automation' },
  { id: 'remote_scripts',       title: 'Remote Scripts',      icon: Terminal,      group: 'Automation' },

  // ── ANALYTICS & REPORTS ───────────────────────────────────────────────────────
  { id: 'reports_analytics',    title: 'Reports & Analytics', icon: BarChart3,     group: 'Analytics & Reports' },
  { id: 'activity_log',         title: 'Activity Log',        icon: Clock3,        group: 'Analytics & Reports' },

  // ── INTELLIGENCE PLATFORM ─────────────────────────────────────────────────────
  { id: 'intelligence_dashboard', title: 'Intelligence Hub',        icon: Brain,          group: 'Intelligence Platform' },
  { id: 'compliance_intel',       title: 'Compliance Intelligence', icon: ShieldCheck,    group: 'Intelligence Platform' },
  { id: 'app_deployment',         title: 'App Deployment',          icon: Package,        group: 'Intelligence Platform' },
  { id: 'policy_conflicts',       title: 'Policy Conflicts',        icon: GitBranch,      group: 'Intelligence Platform' },
  { id: 'risk_scoring',           title: 'Risk Scoring',            icon: Activity,       group: 'Intelligence Platform' },
  { id: 'report_builder',         title: 'Report Builder',          icon: FileText,       group: 'Intelligence Platform' },
  { id: 'audit_log',              title: 'Audit Log',               icon: ClipboardList,  group: 'Intelligence Platform' },

  // ── PLATFORM ──────────────────────────────────────────────────────────────────
  { id: 'settings',             title: 'Settings',            icon: Settings,      group: 'Platform' },
]

// ── Group order — controls render sequence in sidebar ─────────────────────────
export const NAV_GROUP_ORDER = [
  'Overview',
  'Endpoint Management',
  'Security & Compliance',
  'Users & Identity',
  'Automation',
  'Analytics & Reports',
  'Intelligence Platform',
  'Platform',
] as const

// ── Automation group gets a distinct accent treatment ─────────────────────────
export const AUTOMATION_GROUP = 'Automation'

// ── Connected integration sources ─────────────────────────────────────────────

export const connectedSources: ConnectedSource[] = [
  { name: 'Microsoft Intune',   label: 'Intune',       status: 'Connected', icon: Server,      integrationId: 'intune'       },
  { name: 'Microsoft Entra ID', label: 'Entra ID',     status: 'Connected', icon: ShieldCheck, integrationId: 'entra'        },
  { name: 'Kandji',             label: 'Kandji',       status: 'Connected', icon: Cloud,       integrationId: 'kandji'       },
  { name: 'Manage Engine',      label: 'ManageEngine', status: 'Connected', icon: Settings,    integrationId: 'manageengine' },
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
        'Sync device with Kandji.',
        'Verify compliance after next check-in.',
      ],
      escalation: 'No',
      automation: 'Partial (Kandji)',
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
