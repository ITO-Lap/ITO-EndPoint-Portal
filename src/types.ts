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

export interface DeviceSummaryData {
  deviceName: string
  user: string
  serialNumber: string
  platform: string
  osVersion: string
  managementSource: string
  lastCheckIn: string
  complianceState: string
  encryptionStatus: string
  badgeState: string
}

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
