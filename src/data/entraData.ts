/**
 * Microsoft Entra / Intune Resource Intelligence — Mock Data
 * All data is synthetic. Real data comes from the Microsoft Graph API.
 */

export interface EntraDevice {
  id: string
  deviceName: string
  primaryUser: string
  upn: string
  os: 'Windows' | 'macOS' | 'iOS' | 'Android' | 'Linux'
  osVersion: string
  ownership: 'Corporate' | 'Personal' | 'Unknown'
  complianceState: 'Compliant' | 'Non-Compliant' | 'Unknown' | 'In Grace Period'
  managementState: 'Managed' | 'Unmanaged'
  lastCheckIn: string
  daysSinceCheckIn: number
  joinType: 'Azure AD Joined' | 'Hybrid Azure AD Joined' | 'Azure AD Registered'
  serialNumber: string
  manufacturer: string
  model: string
  encryptionState: 'Encrypted' | 'Not Encrypted' | 'Unknown'
  defenderState: 'Active' | 'Inactive' | 'Not Installed'
  pendingReboot: boolean
  assignedGroups: string[]
  assignedPolicies: string[]
  installedApps: string[]
  openIssues: string[]
}

export interface EntraUser {
  id: string
  displayName: string
  upn: string
  department: string
  jobTitle: string
  riskLevel: 'High' | 'Medium' | 'Low' | 'None'
  riskFactors: string[]
  assignedDevices: string[]
  groups: string[]
  mfaStatus: 'Enabled' | 'Disabled'
  lastSignIn: string
  accountStatus: 'Active' | 'Disabled'
}

export interface EntraGroup {
  id: string
  displayName: string
  description: string
  memberCount: number
  type: 'Security' | 'Microsoft 365' | 'Distribution'
  assignedPolicies: string[]
}

export interface EntraPolicy {
  id: string
  name: string
  type: 'Compliance' | 'Configuration' | 'App Protection' | 'Conditional Access'
  status: 'Active' | 'Inactive' | 'Error'
  platform: 'Windows' | 'macOS' | 'iOS' | 'Android' | 'All'
  applicableDevices: number
  failedDevices: number
  successDevices: number
}

export interface EntraApp {
  id: string
  name: string
  publisher: string
  platform: string
  version: string
  assignedDevices: number
  installSucceeded: number
  installFailed: number
  installPending: number
}

// ── Devices ───────────────────────────────────────────────────────────────────

export const ENTRA_DEVICES: EntraDevice[] = [
  {
    id: 'd-001', deviceName: 'LAPTOP-7XG3K2', primaryUser: 'John Doe',
    upn: 'john.doe@contoso.com', os: 'Windows', osVersion: 'Windows 11 23H2',
    ownership: 'Corporate', complianceState: 'Non-Compliant', managementState: 'Managed',
    lastCheckIn: 'May 28, 2025', daysSinceCheckIn: 10,
    joinType: 'Azure AD Joined', serialNumber: 'SN-A7X2-001', manufacturer: 'Dell',
    model: 'Latitude 5540', encryptionState: 'Not Encrypted', defenderState: 'Active',
    pendingReboot: false,
    assignedGroups: ['Finance Users', 'Windows Autopilot Devices'],
    assignedPolicies: ['BitLocker Baseline', 'Defender Security Baseline', 'Windows Update Ring'],
    installedApps: ['Microsoft 365 Apps', 'VPN Client', 'Teams'],
    openIssues: ['BitLocker not enabled', 'OS version outdated'],
  },
  {
    id: 'd-002', deviceName: 'SURFACE-PRO-9', primaryUser: 'Sarah Wilson',
    upn: 'sarah.wilson@contoso.com', os: 'Windows', osVersion: 'Windows 11 22H2',
    ownership: 'Corporate', complianceState: 'Non-Compliant', managementState: 'Managed',
    lastCheckIn: 'May 27, 2025', daysSinceCheckIn: 11,
    joinType: 'Hybrid Azure AD Joined', serialNumber: 'SN-B3X4-002', manufacturer: 'Microsoft',
    model: 'Surface Pro 9', encryptionState: 'Encrypted', defenderState: 'Inactive',
    pendingReboot: true,
    assignedGroups: ['Marketing Team', 'Surface Devices'],
    assignedPolicies: ['Defender Security Baseline', 'Conditional Access MFA'],
    installedApps: ['Microsoft 365 Apps', 'Adobe Creative Cloud', 'Slack'],
    openIssues: ['Defender not active', 'Pending OS update'],
  },
  {
    id: 'd-003', deviceName: 'DESKTOP-8JH2M1', primaryUser: 'Mike Johnson',
    upn: 'mike.johnson@contoso.com', os: 'Windows', osVersion: 'Windows 10 22H2',
    ownership: 'Corporate', complianceState: 'Non-Compliant', managementState: 'Managed',
    lastCheckIn: 'May 26, 2025', daysSinceCheckIn: 12,
    joinType: 'Azure AD Joined', serialNumber: 'SN-C8K1-003', manufacturer: 'HP',
    model: 'EliteDesk 800 G6', encryptionState: 'Not Encrypted', defenderState: 'Active',
    pendingReboot: true,
    assignedGroups: ['IT Ops', 'Desktop Devices'],
    assignedPolicies: ['BitLocker Baseline', 'Windows Update Ring'],
    installedApps: ['Microsoft 365 Apps', 'ServiceNow', 'Wireshark'],
    openIssues: ['BitLocker not enabled', 'Pending reboot', 'OS version outdated'],
  },
  {
    id: 'd-004', deviceName: 'IPAD-9TH-GEN', primaryUser: 'Emily Davis',
    upn: 'emily.davis@contoso.com', os: 'iOS', osVersion: 'iPadOS 17.4',
    ownership: 'Corporate', complianceState: 'Compliant', managementState: 'Managed',
    lastCheckIn: 'May 25, 2025', daysSinceCheckIn: 13,
    joinType: 'Azure AD Registered', serialNumber: 'SN-D2M5-004', manufacturer: 'Apple',
    model: 'iPad 9th Gen', encryptionState: 'Encrypted', defenderState: 'Not Installed',
    pendingReboot: false,
    assignedGroups: ['Mobile Devices', 'Sales Team'],
    assignedPolicies: ['iOS App Protection Policy', 'Conditional Access MFA'],
    installedApps: ['Outlook', 'Teams', 'Salesforce'],
    openIssues: [],
  },
  {
    id: 'd-005', deviceName: 'LAPTOP-KL9P2Q', primaryUser: 'David Brown',
    upn: 'david.brown@contoso.com', os: 'Windows', osVersion: 'Windows 11 23H2',
    ownership: 'Personal', complianceState: 'In Grace Period', managementState: 'Managed',
    lastCheckIn: 'May 24, 2025', daysSinceCheckIn: 14,
    joinType: 'Azure AD Registered', serialNumber: 'SN-E5P3-005', manufacturer: 'Lenovo',
    model: 'ThinkPad X1 Carbon', encryptionState: 'Encrypted', defenderState: 'Active',
    pendingReboot: false,
    assignedGroups: ['BYOD Users', 'Engineering'],
    assignedPolicies: ['BYOD Compliance Policy', 'App Protection Windows'],
    installedApps: ['Microsoft 365 Apps', 'GitHub Desktop', 'VS Code'],
    openIssues: ['Missing security baseline'],
  },
  {
    id: 'd-006', deviceName: 'MACBOOK-HR-01', primaryUser: 'Jessica Martinez',
    upn: 'jessica.martinez@contoso.com', os: 'macOS', osVersion: 'macOS 14.4 Sonoma',
    ownership: 'Corporate', complianceState: 'Compliant', managementState: 'Managed',
    lastCheckIn: 'Jun 2, 2026', daysSinceCheckIn: 1,
    joinType: 'Azure AD Registered', serialNumber: 'SN-F1R8-006', manufacturer: 'Apple',
    model: 'MacBook Pro 14"', encryptionState: 'Encrypted', defenderState: 'Active',
    pendingReboot: false,
    assignedGroups: ['HR Department', 'macOS Devices'],
    assignedPolicies: ['macOS Compliance Policy', 'macOS Security Baseline'],
    installedApps: ['Microsoft 365 Apps', 'Workday', 'Slack', 'Zoom'],
    openIssues: [],
  },
  {
    id: 'd-007', deviceName: 'PIXEL-7-CORP', primaryUser: 'Robert Chen',
    upn: 'robert.chen@contoso.com', os: 'Android', osVersion: 'Android 14',
    ownership: 'Corporate', complianceState: 'Compliant', managementState: 'Managed',
    lastCheckIn: 'Jun 1, 2026', daysSinceCheckIn: 2,
    joinType: 'Azure AD Registered', serialNumber: 'SN-G9Q7-007', manufacturer: 'Google',
    model: 'Pixel 7', encryptionState: 'Encrypted', defenderState: 'Active',
    pendingReboot: false,
    assignedGroups: ['Mobile Devices', 'Engineering'],
    assignedPolicies: ['Android Enterprise Policy', 'App Protection Android'],
    installedApps: ['Outlook', 'Teams', 'GitHub Mobile'],
    openIssues: [],
  },
  {
    id: 'd-008', deviceName: 'WIN-LEGAL-03', primaryUser: 'Amanda Foster',
    upn: 'amanda.foster@contoso.com', os: 'Windows', osVersion: 'Windows 11 22H2',
    ownership: 'Corporate', complianceState: 'Non-Compliant', managementState: 'Managed',
    lastCheckIn: 'May 20, 2025', daysSinceCheckIn: 18,
    joinType: 'Azure AD Joined', serialNumber: 'SN-H4W2-008', manufacturer: 'Dell',
    model: 'OptiPlex 7090', encryptionState: 'Not Encrypted', defenderState: 'Inactive',
    pendingReboot: true,
    assignedGroups: ['Legal Dept', 'Windows Devices'],
    assignedPolicies: ['BitLocker Baseline', 'Defender Security Baseline'],
    installedApps: ['Microsoft 365 Apps', 'iManage', 'DocuSign'],
    openIssues: ['BitLocker not enabled', 'Defender not active', 'Pending reboot'],
  },
]

// ── Users ─────────────────────────────────────────────────────────────────────

export const ENTRA_USERS: EntraUser[] = [
  {
    id: 'u-001', displayName: 'John Doe', upn: 'john.doe@contoso.com',
    department: 'Finance', jobTitle: 'Financial Analyst',
    riskLevel: 'High',
    riskFactors: ['Impossible travel', 'Atypical location', 'Suspicious app consent'],
    assignedDevices: ['LAPTOP-7XG3K2'], groups: ['Finance Users', 'Windows Autopilot Devices'],
    mfaStatus: 'Enabled', lastSignIn: '2025-05-28T09:14:00Z', accountStatus: 'Active',
  },
  {
    id: 'u-002', displayName: 'Sarah Wilson', upn: 'sarah.wilson@contoso.com',
    department: 'Marketing', jobTitle: 'Marketing Manager',
    riskLevel: 'High',
    riskFactors: ['Password spray attack', 'Multiple failed sign-ins'],
    assignedDevices: ['SURFACE-PRO-9'], groups: ['Marketing Team'],
    mfaStatus: 'Enabled', lastSignIn: '2025-05-27T14:22:00Z', accountStatus: 'Active',
  },
  {
    id: 'u-003', displayName: 'Mike Johnson', upn: 'mike.johnson@contoso.com',
    department: 'IT Operations', jobTitle: 'IT Administrator',
    riskLevel: 'Medium',
    riskFactors: ['Leaked credentials (dark web)', 'Unfamiliar sign-in location'],
    assignedDevices: ['DESKTOP-8JH2M1'], groups: ['IT Ops', 'Desktop Devices'],
    mfaStatus: 'Enabled', lastSignIn: '2025-05-26T11:05:00Z', accountStatus: 'Active',
  },
  {
    id: 'u-004', displayName: 'Emily Davis', upn: 'emily.davis@contoso.com',
    department: 'Sales', jobTitle: 'Account Executive',
    riskLevel: 'Medium',
    riskFactors: ['Sign-in from anonymous IP'],
    assignedDevices: ['IPAD-9TH-GEN'], groups: ['Mobile Devices', 'Sales Team'],
    mfaStatus: 'Disabled', lastSignIn: '2025-05-25T16:40:00Z', accountStatus: 'Active',
  },
  {
    id: 'u-005', displayName: 'David Brown', upn: 'david.brown@contoso.com',
    department: 'Engineering', jobTitle: 'Software Engineer',
    riskLevel: 'Low', riskFactors: [],
    assignedDevices: ['LAPTOP-KL9P2Q'], groups: ['BYOD Users', 'Engineering'],
    mfaStatus: 'Enabled', lastSignIn: '2026-06-01T08:30:00Z', accountStatus: 'Active',
  },
]

// ── Groups ────────────────────────────────────────────────────────────────────

export const ENTRA_GROUPS: EntraGroup[] = [
  { id: 'g-001', displayName: 'Finance Users', description: 'All finance department users', memberCount: 142, type: 'Security', assignedPolicies: ['BitLocker Baseline', 'Conditional Access MFA'] },
  { id: 'g-002', displayName: 'Windows Autopilot Devices', description: 'Autopilot registered Windows devices', memberCount: 1248, type: 'Security', assignedPolicies: ['Windows Update Ring', 'Defender Security Baseline'] },
  { id: 'g-003', displayName: 'Marketing Team', description: 'Marketing department members', memberCount: 89, type: 'Microsoft 365', assignedPolicies: ['App Protection Windows'] },
  { id: 'g-004', displayName: 'IT Ops', description: 'IT Operations staff', memberCount: 34, type: 'Security', assignedPolicies: ['Privileged Admin Policy', 'Defender Security Baseline'] },
  { id: 'g-005', displayName: 'Mobile Devices', description: 'All enrolled mobile devices', memberCount: 684, type: 'Security', assignedPolicies: ['iOS App Protection Policy', 'Android Enterprise Policy'] },
  { id: 'g-006', displayName: 'BYOD Users', description: 'Personal device users with corp access', memberCount: 217, type: 'Security', assignedPolicies: ['BYOD Compliance Policy'] },
]

// ── Policies ──────────────────────────────────────────────────────────────────

export const ENTRA_POLICIES: EntraPolicy[] = [
  { id: 'p-001', name: 'BitLocker Baseline', type: 'Compliance', status: 'Error', platform: 'Windows', applicableDevices: 1652, failedDevices: 145, successDevices: 1507 },
  { id: 'p-002', name: 'Defender Security Baseline', type: 'Configuration', status: 'Error', platform: 'Windows', applicableDevices: 1652, failedDevices: 102, successDevices: 1550 },
  { id: 'p-003', name: 'Windows Update Ring', type: 'Configuration', status: 'Active', platform: 'Windows', applicableDevices: 1652, failedDevices: 23, successDevices: 1629 },
  { id: 'p-004', name: 'iOS App Protection Policy', type: 'App Protection', status: 'Active', platform: 'iOS', applicableDevices: 436, failedDevices: 8, successDevices: 428 },
  { id: 'p-005', name: 'Conditional Access MFA', type: 'Conditional Access', status: 'Active', platform: 'All', applicableDevices: 1842, failedDevices: 0, successDevices: 1842 },
  { id: 'p-006', name: 'macOS Security Baseline', type: 'Compliance', status: 'Active', platform: 'macOS', applicableDevices: 145, failedDevices: 12, successDevices: 133 },
  { id: 'p-007', name: 'BYOD Compliance Policy', type: 'Compliance', status: 'Error', platform: 'Windows', applicableDevices: 217, failedDevices: 41, successDevices: 176 },
]

