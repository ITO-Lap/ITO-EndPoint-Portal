import type { LucideIcon } from 'lucide-react'

export type BadgeVariant = 'blue' | 'red' | 'green' | 'orange' | 'yellow' | 'gray'

export interface NavItem {
  title: string
  icon: LucideIcon
  active?: boolean
  group: string      // navigation section group label
  badge?: string     // optional chip (e.g. "New", count string)
}

export interface StatCardData {
  title: string
  value: string
  trend: string
  trendChange: string
  icon: LucideIcon
  accent: string
  iconBg: string
  iconText: string
}

export interface ConnectedSource {
  name: string
  label: string
  status: string
  icon: LucideIcon
  integrationId: string  // matches id from /api/integrations/status
}

export interface DeviceData {
  id?: string          // set when device comes from a live integration
  deviceName: string
  user: string
  serialNumber: string
  platform: string
  osVersion: string
  managementSource: string
  lastCheckIn: string
  complianceState: 'Compliant' | 'Warning' | 'Non-Compliant'
  encryptionStatus: string
  primaryIssue: string
  policyFailed: string
  severity: 'Low' | 'Medium' | 'High' | 'Critical'
  confidence: string
  firstDetected: string
  lastDetected: string
  issueSource: string
  recommendedRunbook: string
  nextSteps: string[]
  issueCategory: string
  hasOpenIssue: boolean
  badgeState?: string
  security?: SecurityProfile
}

export type DeviceSummaryData = DeviceData

export interface ComplianceDetailRow {
  label: string
  value: string
  badge?: {
    label: string
    variant: BadgeVariant
  }
}

export interface RunbookData {
  runbookName: string
  runbookLink: string
  steps: string[]
  escalation: string
  automation: string
}

export interface ComplianceSegment {
  label: string
  value: number
  percent: string
  color: string
}

export interface IssueCategory {
  label: string
  value: number
  color: string
}

export interface ActivityItem {
  device: string
  status: 'Compliant' | 'Warning' | 'Non-Compliant'
  message: string
  time: string
  color: 'green' | 'yellow' | 'red'
}

export interface NotificationItem {
  id: string
  message: string
  read: boolean
}

export interface SecurityEvent {
  time: string
  type: 'Critical' | 'Alert' | 'Warning' | 'Info'
  description: string
}

export interface SecurityProfile {
  riskScore: number
  riskLevel: 'Critical' | 'High' | 'Medium' | 'Low'
  edrStatus: 'Active' | 'Inactive' | 'Not Installed'
  edrProduct: string
  firewallEnabled: boolean
  vpnCompliant: boolean
  missingPatches: number
  lastSecurityScan: string
  vulnerabilities: { critical: number; high: number; medium: number; low: number }
  unauthorizedApps: string[]
  recentEvents: SecurityEvent[]
}

export interface UserSource {
  name: string
  type: 'directory' | 'mdm' | 'itsm'
  syncedAt: string
  status: 'Synced' | 'Error' | 'Pending'
  userId: string
}

export interface JiraTicket {
  id: string
  summary: string
  status: 'Open' | 'In Progress' | 'Pending' | 'Resolved'
  priority: 'Critical' | 'High' | 'Medium' | 'Low'
  type: 'Incident' | 'Task' | 'Request' | 'Bug' | 'Story'
  project: string
  created: string
  updated: string
}

export type UserToolRole = 'Global Admin' | 'IT Admin' | 'Helpdesk' | 'End User'
export type UserStatus = 'Active' | 'Inactive' | 'Suspended'
export type UserRiskLevel = 'Low' | 'Medium' | 'High' | 'Critical'

export interface UserDeviceRef {
  deviceName: string
  platform: string
  complianceState: 'Compliant' | 'Warning' | 'Non-Compliant'
  managementSource: string
  lastCheckIn: string
  encryptionStatus: string
  riskScore: number
}

export interface UserActivityEvent {
  time: string
  type: 'Login' | 'Logout' | 'MFA' | 'DeviceSync' | 'PolicyChange' | 'Alert' | 'RoleChange'
  description: string
  ip?: string
  location?: string
}

export interface AppUser {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  title: string
  department: string
  location: string
  timezone: string
  toolRole: UserToolRole
  status: UserStatus
  mfaEnabled: boolean
  lastActive: string
  lastLogin: string
  loginLocation: string
  createdAt: string
  riskLevel: UserRiskLevel
  isVip?: boolean
  groups?: string[]
  licenseStatus?: string
  assignedDevices: UserDeviceRef[]
  recentActivity: UserActivityEvent[]
  sources: UserSource[]
  jiraTickets: JiraTicket[]
}

export type ToastType = 'success' | 'error' | 'info'

export interface ToastItem {
  id: string
  type: ToastType
  title: string
  message: string
}
