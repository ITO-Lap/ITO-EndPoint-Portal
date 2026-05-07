import type { LucideIcon } from 'lucide-react'

export type BadgeVariant = 'blue' | 'red' | 'green' | 'orange' | 'yellow' | 'gray'

export interface NavItem {
  title: string
  icon: LucideIcon
  active?: boolean
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
}

export interface DeviceData {
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
  severity: 'Low' | 'Medium' | 'High'
  confidence: string
  firstDetected: string
  lastDetected: string
  issueSource: string
  recommendedRunbook: string
  nextSteps: string[]
  issueCategory: string
  hasOpenIssue: boolean
  badgeState?: string
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

export type ToastType = 'success' | 'error' | 'info'

export interface ToastItem {
  id: string
  type: ToastType
  title: string
  message: string
}
