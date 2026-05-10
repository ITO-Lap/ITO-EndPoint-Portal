import {
  Activity,
  BarChart3,
  BookMarked,
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
  DeviceData,
  BadgeVariant,
  SecurityProfile,
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
  primaryIssue: 'BitLocker encryption not enabled',
  policyFailed: 'Encryption - BitLocker Policy',
  severity: 'Medium',
  confidence: '85%',
  firstDetected: 'Apr 24, 2026 04:30 PM',
  lastDetected: 'Apr 25, 2026 09:15 AM',
  issueSource: 'Microsoft Intune',
  recommendedRunbook: 'Enable BitLocker and Sync Device',
  nextSteps: [
    'Verify BitLocker encryption is disabled.',
    'Enable BitLocker via Intune policy.',
    'Ensure device is online and connected.',
    'Trigger device sync.',
    'Confirm compliance after next check-in.',
  ],
  issueCategory: 'BitLocker / Encryption',
  hasOpenIssue: true,
  badgeState: 'Non-Compliant',
}

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
  { label: 'Compliant', value: 9153, percent: '84.4%', color: '#22c55e' },
  { label: 'Warning', value: 361, percent: '3.3%', color: '#f59e0b' },
  { label: 'Non-Compliant', value: 1328, percent: '12.2%', color: '#ef4444' },
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
  { device: 'MAC-8K3M1N2', status: 'Compliant', message: 'Kandji sync completed', time: 'Yesterday', color: 'green' },
  { device: 'WIN-DESK-004', status: 'Warning', message: 'OS update required', time: 'Yesterday', color: 'yellow' },
]

// Mock devices database
const mockDevices: DeviceData[] = [
  {
    deviceName: 'LAPTOP-8F7G2Q1',
    user: 'john.doe@company.com',
    serialNumber: 'PF2X3B7',
    platform: 'Windows',
    osVersion: 'Windows 11 Pro 23H2',
    managementSource: 'Microsoft Intune',
    lastCheckIn: 'Apr 25, 2026 09:15 AM',
    complianceState: 'Non-Compliant',
    encryptionStatus: 'BitLocker Off',
    primaryIssue: 'BitLocker encryption not enabled',
    policyFailed: 'Encryption - BitLocker Policy',
    severity: 'Medium',
    confidence: '85%',
    firstDetected: 'Apr 24, 2026 04:30 PM',
    lastDetected: 'Apr 25, 2026 09:15 AM',
    issueSource: 'Microsoft Intune',
    recommendedRunbook: 'Enable BitLocker and Sync Device',
    nextSteps: [
      'Verify BitLocker encryption is disabled.',
      'Enable BitLocker via Intune policy.',
      'Ensure device is online and connected.',
      'Trigger device sync.',
      'Confirm compliance after next check-in.',
    ],
    issueCategory: 'BitLocker / Encryption',
    hasOpenIssue: true,
    security: {
      riskScore: 78,
      riskLevel: 'High',
      edrStatus: 'Active',
      edrProduct: 'Microsoft Defender for Endpoint',
      firewallEnabled: true,
      vpnCompliant: false,
      missingPatches: 4,
      lastSecurityScan: 'Apr 25, 2026 09:10 AM',
      vulnerabilities: { critical: 0, high: 2, medium: 5, low: 8 },
      unauthorizedApps: ['uTorrent 3.6.0', 'TeamViewer 15 (personal)'],
      recentEvents: [
        { time: 'Apr 25, 2026 09:15 AM', type: 'Alert', description: 'BitLocker encryption disabled — compliance policy violation' },
        { time: 'Apr 25, 2026 08:00 AM', type: 'Warning', description: 'VPN session expired, device operating off-network' },
        { time: 'Apr 24, 2026 11:30 AM', type: 'Alert', description: 'Unauthorized application detected: uTorrent 3.6.0' },
        { time: 'Apr 24, 2026 04:30 PM', type: 'Info', description: 'Compliance check failed — issue first detected' },
      ],
    } satisfies SecurityProfile,
  },
  {
    deviceName: 'MAC-9C2K7L3',
    user: 'jane.smith@company.com',
    serialNumber: 'C02XQ8N5L',
    platform: 'macOS',
    osVersion: 'macOS 14.4.1 Sonoma',
    managementSource: 'Kandji',
    lastCheckIn: 'Apr 25, 2026 08:47 AM',
    complianceState: 'Warning',
    encryptionStatus: 'FileVault Pending',
    primaryIssue: 'FileVault encryption pending review',
    policyFailed: 'Encryption - FileVault Policy',
    severity: 'Low',
    confidence: '72%',
    firstDetected: 'Apr 24, 2026 06:15 PM',
    lastDetected: 'Apr 25, 2026 08:47 AM',
    issueSource: 'Kandji',
    recommendedRunbook: 'Enable FileVault on macOS',
    nextSteps: ['Review FileVault settings', 'Enable encryption', 'Sync with Kandji'],
    issueCategory: 'Encryption / Compliance',
    hasOpenIssue: false,
    security: {
      riskScore: 45,
      riskLevel: 'Medium',
      edrStatus: 'Active',
      edrProduct: 'CrowdStrike Falcon',
      firewallEnabled: true,
      vpnCompliant: true,
      missingPatches: 1,
      lastSecurityScan: 'Apr 25, 2026 08:40 AM',
      vulnerabilities: { critical: 0, high: 0, medium: 2, low: 4 },
      unauthorizedApps: [],
      recentEvents: [
        { time: 'Apr 25, 2026 08:47 AM', type: 'Warning', description: 'FileVault encryption pending review — action required' },
        { time: 'Apr 24, 2026 06:15 PM', type: 'Info', description: 'Kandji MDM profile refreshed successfully' },
        { time: 'Apr 23, 2026 02:00 PM', type: 'Info', description: 'Scheduled security scan completed — 2 medium findings' },
      ],
    } satisfies SecurityProfile,
  },
  {
    deviceName: 'USER2-WIN-01',
    user: 'user2@company.com',
    serialNumber: 'WDX5M2F',
    platform: 'Windows',
    osVersion: 'Windows 10 Pro 22H2',
    managementSource: 'Microsoft Intune',
    lastCheckIn: 'Apr 25, 2026 08:30 AM',
    complianceState: 'Compliant',
    encryptionStatus: 'BitLocker On',
    primaryIssue: 'None',
    policyFailed: 'None',
    severity: 'Low',
    confidence: '100%',
    firstDetected: 'N/A',
    lastDetected: 'N/A',
    issueSource: 'N/A',
    recommendedRunbook: 'None',
    nextSteps: [],
    issueCategory: 'None',
    hasOpenIssue: false,
    security: {
      riskScore: 12,
      riskLevel: 'Low',
      edrStatus: 'Active',
      edrProduct: 'Microsoft Defender for Endpoint',
      firewallEnabled: true,
      vpnCompliant: true,
      missingPatches: 0,
      lastSecurityScan: 'Apr 25, 2026 08:25 AM',
      vulnerabilities: { critical: 0, high: 0, medium: 0, low: 1 },
      unauthorizedApps: [],
      recentEvents: [
        { time: 'Apr 25, 2026 08:30 AM', type: 'Info', description: 'All compliance checks passed — device fully healthy' },
        { time: 'Apr 24, 2026 07:00 AM', type: 'Info', description: 'Windows Update applied successfully (KB5036980)' },
        { time: 'Apr 23, 2026 09:00 AM', type: 'Info', description: 'Scheduled security scan completed — no findings' },
      ],
    } satisfies SecurityProfile,
  },
  {
    deviceName: 'LAPTOP-77H2KJ9',
    user: 'mike.johnson@company.com',
    serialNumber: 'GT8N5X2',
    platform: 'Windows',
    osVersion: 'Windows 11 Pro 23H2',
    managementSource: 'Microsoft Intune',
    lastCheckIn: 'Apr 24, 2026 03:42 PM',
    complianceState: 'Non-Compliant',
    encryptionStatus: 'BitLocker Off',
    primaryIssue: 'Compliance policy failure',
    policyFailed: 'Device Compliance Policy',
    severity: 'High',
    confidence: '91%',
    firstDetected: 'Apr 23, 2026 11:00 AM',
    lastDetected: 'Apr 24, 2026 03:42 PM',
    issueSource: 'Microsoft Intune',
    recommendedRunbook: 'Enable BitLocker and Sync Device',
    nextSteps: [
      'Review compliance policy settings.',
      'Check for conflicting policies.',
      'Force policy sync on device.',
      'Monitor compliance status after sync.',
    ],
    issueCategory: 'Compliance Policies',
    hasOpenIssue: true,
    security: {
      riskScore: 91,
      riskLevel: 'Critical',
      edrStatus: 'Inactive',
      edrProduct: 'Microsoft Defender for Endpoint',
      firewallEnabled: false,
      vpnCompliant: false,
      missingPatches: 9,
      lastSecurityScan: 'Apr 22, 2026 11:00 AM',
      vulnerabilities: { critical: 1, high: 3, medium: 7, low: 12 },
      unauthorizedApps: ['AnyDesk 7.0', 'BitTorrent 7.11', 'VLC 3.0.8 (EOL)'],
      recentEvents: [
        { time: 'Apr 24, 2026 03:42 PM', type: 'Critical', description: 'EDR agent stopped — endpoint no longer protected' },
        { time: 'Apr 24, 2026 03:40 PM', type: 'Critical', description: 'Windows Firewall disabled — immediate remediation required' },
        { time: 'Apr 24, 2026 02:00 PM', type: 'Alert', description: 'Critical vulnerability CVE-2024-21338 detected — patch missing' },
        { time: 'Apr 23, 2026 11:00 AM', type: 'Alert', description: 'Compliance policy failure — 9 missing security patches' },
        { time: 'Apr 23, 2026 09:30 AM', type: 'Alert', description: 'Unauthorized remote access tool detected: AnyDesk 7.0' },
      ],
    } satisfies SecurityProfile,
  },
  {
    deviceName: 'MAC-8K3M1N2',
    user: 'sarah.chen@company.com',
    serialNumber: 'C02ZR4M8M',
    platform: 'macOS',
    osVersion: 'macOS 14.4.1 Sonoma',
    managementSource: 'Kandji',
    lastCheckIn: 'Apr 24, 2026 02:15 PM',
    complianceState: 'Compliant',
    encryptionStatus: 'FileVault On',
    primaryIssue: 'None',
    policyFailed: 'None',
    severity: 'Low',
    confidence: '100%',
    firstDetected: 'N/A',
    lastDetected: 'N/A',
    issueSource: 'N/A',
    recommendedRunbook: 'None',
    nextSteps: [],
    issueCategory: 'None',
    hasOpenIssue: false,
    security: {
      riskScore: 8,
      riskLevel: 'Low',
      edrStatus: 'Active',
      edrProduct: 'CrowdStrike Falcon',
      firewallEnabled: true,
      vpnCompliant: true,
      missingPatches: 0,
      lastSecurityScan: 'Apr 24, 2026 02:10 PM',
      vulnerabilities: { critical: 0, high: 0, medium: 1, low: 2 },
      unauthorizedApps: [],
      recentEvents: [
        { time: 'Apr 24, 2026 02:15 PM', type: 'Info', description: 'Kandji sync completed — all policies enforced' },
        { time: 'Apr 23, 2026 09:00 AM', type: 'Info', description: 'Scheduled security scan completed — no findings' },
        { time: 'Apr 22, 2026 10:00 AM', type: 'Info', description: 'FileVault confirmed enabled — encryption key escrowed' },
      ],
    } satisfies SecurityProfile,
  },
  {
    deviceName: 'WIN-DESK-004',
    user: 'david.lee@company.com',
    serialNumber: 'WS7P9K3',
    platform: 'Windows',
    osVersion: 'Windows 10 Pro 21H2',
    managementSource: 'Microsoft Intune',
    lastCheckIn: 'Apr 24, 2026 01:30 PM',
    complianceState: 'Warning',
    encryptionStatus: 'BitLocker On',
    primaryIssue: 'OS update required',
    policyFailed: 'OS Version Compliance Policy',
    severity: 'Medium',
    confidence: '78%',
    firstDetected: 'Apr 22, 2026 09:00 AM',
    lastDetected: 'Apr 24, 2026 01:30 PM',
    issueSource: 'Microsoft Intune',
    recommendedRunbook: 'Force OS Update via Intune',
    nextSteps: [
      'Check Windows Update settings on the device.',
      'Push OS update policy via Intune.',
      'Verify device is connected to the network.',
      'Confirm update installation after restart.',
    ],
    issueCategory: 'Device Check-in',
    hasOpenIssue: true,
    security: {
      riskScore: 55,
      riskLevel: 'Medium',
      edrStatus: 'Active',
      edrProduct: 'Microsoft Defender for Endpoint',
      firewallEnabled: true,
      vpnCompliant: true,
      missingPatches: 3,
      lastSecurityScan: 'Apr 24, 2026 01:25 PM',
      vulnerabilities: { critical: 0, high: 1, medium: 3, low: 6 },
      unauthorizedApps: ['Dropbox 181.4 (personal account)'],
      recentEvents: [
        { time: 'Apr 24, 2026 01:30 PM', type: 'Warning', description: 'OS version out of compliance — Windows 10 21H2 end of support' },
        { time: 'Apr 23, 2026 11:00 AM', type: 'Warning', description: '3 security patches pending installation' },
        { time: 'Apr 22, 2026 09:00 AM', type: 'Alert', description: 'Personal cloud storage app detected: Dropbox (personal)' },
        { time: 'Apr 21, 2026 08:00 AM', type: 'Info', description: 'High vulnerability CVE-2024-30080 detected — patch available' },
      ],
    } satisfies SecurityProfile,
  },
]

// Return all mock devices
export function getAllDevices(): DeviceData[] {
  return [...mockDevices]
}

// Search for devices by name, user, or serial number
export function searchDevices(query: string): DeviceData | null {
  const lowerQuery = query.toLowerCase()
  const found = mockDevices.find(
    (device) =>
      device.deviceName.toLowerCase().includes(lowerQuery) ||
      device.user.toLowerCase().includes(lowerQuery) ||
      device.serialNumber.toLowerCase().includes(lowerQuery)
  )
  return found || null
}

// Get a single device by name
export function getDeviceByName(name: string): DeviceData | undefined {
  return mockDevices.find((d) => d.deviceName === name)
}

// Get runbook data appropriate for a specific device's state and platform
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
      steps: device.nextSteps.length > 0 ? device.nextSteps : runbookData.steps,
      escalation: 'No',
      automation: 'Yes (Intune)',
    }
  }
  return {
    ...runbookData,
    steps: device.nextSteps.length > 0 ? device.nextSteps : runbookData.steps,
  }
}

// Get compliance rows for a specific device
export function getComplianceRowsForDevice(device: DeviceData): ComplianceDetailRow[] {
  const getVariant = (state: string): BadgeVariant => {
    switch (state) {
      case 'Compliant':
        return 'green'
      case 'Non-Compliant':
        return 'red'
      case 'Warning':
        return 'yellow'
      default:
        return 'gray'
    }
  }

  const getSeverityVariant = (severity: string): BadgeVariant => {
    switch (severity) {
      case 'High':
        return 'red'
      case 'Medium':
        return 'orange'
      case 'Low':
        return 'green'
      default:
        return 'gray'
    }
  }

  return [
    {
      label: 'Overall Compliance',
      value: device.complianceState,
      badge: { label: device.complianceState, variant: getVariant(device.complianceState) },
    },
    { label: 'Primary Issue', value: device.primaryIssue },
    { label: 'Policy Failed', value: device.policyFailed },
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
    { label: 'First Detected', value: device.firstDetected },
    { label: 'Last Detected', value: device.lastDetected },
    { label: 'Issue Source', value: device.issueSource },
  ]
}
