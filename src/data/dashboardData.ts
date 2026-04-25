import {
  Activity,
  BarChart3,
  BookOpen,
  Clock3,
  Cloud,
  Cpu,
  Home,
  Laptop2,
  Monitor,
  Search,
  Server,
  ShieldCheck,
  ShieldAlert,
  Settings,
  Users,
  ClipboardList,
} from 'lucide-react'
import type {
  ActivityItem,
  ComplianceDetailRow,
  ComplianceSegment,
  IssueCategory,
  NavItem,
  RunbookData,
  StatCardData,
  ConnectedSource,
  DeviceSummaryData,
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
]

export const connectedSources: ConnectedSource[] = [
  { name: 'Microsoft Intune', label: 'Intune', status: 'Connected', icon: Server },
  { name: 'Kandji', label: 'Kandji', status: 'Connected', icon: Cloud },
  { name: 'OpenAI', label: 'OpenAI', status: 'Connected', icon: Cpu },
]

export const statCards: StatCardData[] = [
  {
    title: 'Total Devices',
    value: '12,842',
    trend: '↑ 5.6%',
    trendChange: 'vs last 7 days',
    icon: Laptop2,
    accent: 'text-sky-700',
    iconBg: 'bg-sky-100',
    iconText: 'text-sky-600',
  },
  {
    title: 'Compliant Devices',
    value: '9,153',
    trend: '↑ 4.3%',
    trendChange: 'vs last 7 days',
    icon: ShieldCheck,
    accent: 'text-emerald-700',
    iconBg: 'bg-emerald-100',
    iconText: 'text-emerald-600',
  },
  {
    title: 'Non-Compliant',
    value: '1,328',
    trend: '↓ 2.1%',
    trendChange: 'vs last 7 days',
    icon: ShieldAlert,
    accent: 'text-red-700',
    iconBg: 'bg-red-100',
    iconText: 'text-red-600',
  },
  {
    title: 'Mac Devices (Kandji)',
    value: '2,361',
    trend: '↑ 6.7%',
    trendChange: 'vs last 7 days',
    icon: Monitor,
    accent: 'text-violet-700',
    iconBg: 'bg-violet-100',
    iconText: 'text-violet-600',
  },
  {
    title: 'Open Issues',
    value: '237',
    trend: '↓ 3.4%',
    trendChange: 'vs last 7 days',
    icon: ClipboardList,
    accent: 'text-orange-700',
    iconBg: 'bg-orange-100',
    iconText: 'text-orange-600',
  },
]

export const deviceSummary: DeviceSummaryData = {
  deviceName: 'LAPTOP-8F7G2Q1',
  user: 'john.doe@company.com',
  serialNumber: 'PF2X3B7',
  platform: 'Windows',
  osVersion: 'Windows 11 Pro 23H2',
  managementSource: 'Microsoft Intune',
  lastCheckIn: 'Apr 25, 2026 09:15 AM',
  complianceState: 'Non-Compliant',
  encryptionStatus: 'BitLocker Off',
  badgeState: 'Non-Compliant',
}

export const complianceDetailRows: ComplianceDetailRow[] = [
  { label: 'Overall Compliance', value: 'Non-Compliant', badge: { label: 'Non-Compliant', variant: 'red' } },
  { label: 'Primary Issue', value: 'BitLocker encryption not enabled' },
  { label: 'Policy Failed', value: 'Encryption - BitLocker Policy' },
  { label: 'Severity', value: 'Medium', badge: { label: 'Medium', variant: 'orange' } },
  { label: 'Confidence', value: '85%', badge: { label: 'High', variant: 'green' } },
  { label: 'First Detected', value: 'Apr 24, 2026 04:30 PM' },
  { label: 'Last Detected', value: 'Apr 25, 2026 09:15 AM' },
  { label: 'Issue Source', value: 'Microsoft Intune' },
]

export const runbookData: RunbookData = {
  runbookName: 'Enable BitLocker and Sync Device',
  runbookLink: 'View steps in runbook',
  steps: [
    'Verify BitLocker encryption is disabled.',
    'Enable BitLocker via Intune policy.',
    'Ensure device is online and connected.',
    'Trigger device sync.',
    'Confirm compliance after next check-in.',
  ],
  escalation: 'No',
  automation: 'Yes (Future Phase)',
}

export const complianceSegments: ComplianceSegment[] = [
  { label: 'Compliant', value: 9153, percent: '71.2%', color: '#22c55e' },
  { label: 'Warning', value: 361, percent: '2.8%', color: '#f59e0b' },
  { label: 'Non-Compliant', value: 1328, percent: '10.3%', color: '#ef4444' },
]

export const issueCategories: IssueCategory[] = [
  { label: 'BitLocker / Encryption', value: 542, color: '#ef4444' },
  { label: 'Compliance Policies', value: 321, color: '#f59e0b' },
  { label: 'Application Issues', value: 213, color: '#f97316' },
  { label: 'Device Check-in', value: 142, color: '#22c55e' },
  { label: 'Other', value: 67, color: '#64748b' },
]

export const recentActivity: ActivityItem[] = [
  { device: 'LAPTOP-8F7G2Q1', status: 'Non-Compliant', message: 'BitLocker issue', time: '9:15 AM', color: 'red' },
  { device: 'MAC-9C2K7L3', status: 'Warning', message: 'FileVault pending', time: '8:47 AM', color: 'yellow' },
  { device: 'USER2-WIN-01', status: 'Compliant', message: 'All good', time: '8:30 AM', color: 'green' },
  { device: 'LAPTOP-77H2KJ9', status: 'Non-Compliant', message: 'Policy failure', time: 'Yesterday', color: 'red' },
  { device: 'MAC-8K3M1N2', status: 'Compliant', message: 'All good', time: 'Yesterday', color: 'green' },
]

export const dashboardMeta = {
  title: 'Endpoint AI Copilot',
  subtitle: 'Smart. Fast. Reliable.',
}
