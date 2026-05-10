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
  Users,
} from 'lucide-react'
import type {
  ComplianceDetailRow,
  NavItem,
  RunbookData,
  ConnectedSource,
  DeviceData,
  BadgeVariant,
} from '../types'

export const navItems: NavItem[] = [
  { title: 'Dashboard', icon: Home, active: true },
  { title: 'Device Lookup', icon: Search },
  { title: 'Users', icon: Users },
  { title: 'Runbooks', icon: BookOpen },
  { title: 'Diagnostics', icon: Activity },
  { title: 'Reports & Analytics', icon: BarChart3 },
  { title: 'Activity Log', icon: Clock3 },
  { title: 'Settings', icon: Settings },
  { title: 'Documentation', icon: BookMarked },
]

export const connectedSources: ConnectedSource[] = [
  { name: 'Microsoft Intune', label: 'Intune', status: 'Connected', icon: Server },
  { name: 'Kandji', label: 'Kandji', status: 'Connected', icon: Cloud },
  { name: 'Manage Engine', label: 'Manage Engine', status: 'Connected', icon: Settings },
  { name: 'OpenAI', label: 'OpenAI', status: 'Connected', icon: Cpu },
]

// ── Device-state helpers (derive from real device data) ───────────────────────

// Get runbook appropriate for a specific device's state and platform
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

// Build compliance detail rows from a real device
export function getComplianceRowsForDevice(device: DeviceData): ComplianceDetailRow[] {
  const getSeverityVariant = (severity: string): BadgeVariant => {
    switch (severity) {
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
    {
      label: 'Confidence',
      value: device.confidence,
      badge: { label: 'High', variant: 'green' },
    },
    { label: 'First Detected',  value: device.firstDetected },
    { label: 'Last Detected',   value: device.lastDetected },
  ]
}
