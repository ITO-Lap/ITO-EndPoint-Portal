import {
  Activity,
  BarChart3,
  BookMarked,
  BookOpen,
  Clock3,
  Cloud,
  Cpu,
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
  MessageSquare,
  Zap,
  AlertTriangle,
  Monitor,
  GitBranch,
  Layers,
  Laptop2,
  FileBarChart,
  Network,
  Radar,
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
  { title: 'Dashboard',           icon: Home,         group: 'Overview',               active: true },

  // ── ENDPOINT MANAGEMENT ───────────────────────────────────────────────────────
  { title: 'Device Lookup',           icon: Search,       group: 'Endpoint Management' },
  { title: 'Mac Devices',             icon: Monitor,      group: 'Endpoint Management' },
  { title: 'Intune Devices',          icon: Server,       group: 'Endpoint Management' },
  { title: 'Windows Devices',         icon: Laptop2,      group: 'Endpoint Management' },
  { title: 'ManageEngine Devices',    icon: Layers,       group: 'Endpoint Management' },
  { title: 'Open Issues',             icon: AlertTriangle,  group: 'Endpoint Management' },

  // ── SECURITY & COMPLIANCE ─────────────────────────────────────────────────────
  { title: 'Security Posture',    icon: Shield,       group: 'Security & Compliance' },
  { title: 'Vulnerabilities',     icon: ShieldAlert,  group: 'Security & Compliance' },
  { title: 'EDR',                 icon: Radar,        group: 'Security & Compliance' },

  // ── USERS & IDENTITY ──────────────────────────────────────────────────────────
  { title: 'Users',               icon: Users,        group: 'Users & Identity' },

  // ── AUTOMATION ────────────────────────────────────────────────────────────────
  { title: 'Automation',          icon: Zap,          group: 'Automation' },
  { title: 'Runbooks',            icon: BookOpen,     group: 'Automation' },
  { title: 'Remote Scripts',      icon: Terminal,     group: 'Automation' },

  // ── ANALYTICS & REPORTS ───────────────────────────────────────────────────────
  { title: 'Reports & Analytics', icon: BarChart3,    group: 'Analytics & Reports' },
  { title: 'Activity Log',        icon: Clock3,       group: 'Analytics & Reports' },
  { title: 'Diagnostics',         icon: Activity,     group: 'Analytics & Reports' },

  // ── PLATFORM ──────────────────────────────────────────────────────────────────
  { title: 'Settings',            icon: Settings,     group: 'Platform' },
  { title: 'Documentation',       icon: BookMarked,   group: 'Platform' },
]

// ── Group order — controls render sequence in sidebar ─────────────────────────
export const NAV_GROUP_ORDER = [
  'Overview',
  'Endpoint Management',
  'Security & Compliance',
  'Users & Identity',
  'Automation',
  'Analytics & Reports',
  'Platform',
] as const

// ── Automation group gets a distinct accent treatment ─────────────────────────
export const AUTOMATION_GROUP = 'Automation'

// ── Connected integration sources ─────────────────────────────────────────────

export const connectedSources: ConnectedSource[] = [
  { name: 'Microsoft Intune',   label: 'Intune',       status: 'Connected', icon: Server,        integrationId: 'intune'        },
  { name: 'Microsoft Entra ID', label: 'Entra ID',     status: 'Connected', icon: ShieldCheck,   integrationId: 'entra'         },
  { name: 'Kandji',             label: 'Kandji',       status: 'Connected', icon: Cloud,         integrationId: 'kandji'        },
  { name: 'Manage Engine',      label: 'ManageEngine', status: 'Connected', icon: Settings,      integrationId: 'manageengine'  },
  { name: 'Jira',               label: 'Jira',         status: 'Connected', icon: Hash,          integrationId: 'jira'          },
  { name: 'Confluence',         label: 'Confluence',   status: 'Connected', icon: BookOpen,      integrationId: 'confluence'    },
  { name: 'Slack',              label: 'Slack',        status: 'Connected', icon: MessageSquare, integrationId: 'slack'         },
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
