import type { LucideIcon } from 'lucide-react'

export type BadgeVariant = 'blue' | 'red' | 'green' | 'orange' | 'yellow' | 'gray'

export interface NavItem {
  id: string         // stable identifier used for visibility preference storage
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
  employeeId?: string
  company?: string
}

// ─── User Intelligence (per-user 360 page) ────────────────────────────────────

export interface UserSignIn {
  id: string
  createdDateTime: string
  appDisplayName: string
  ipAddress: string | null
  location: { city: string; countryOrRegion: string } | null
  status: { errorCode: number; failureReason: string | null }
  conditionalAccessStatus: string
  riskLevelDuringSignIn: string
  mfaDetail: { authMethod: string } | null
  clientAppUsed: string
}

export interface UserDeviceDetail {
  deviceName: string
  platform: string
  complianceState: 'Compliant' | 'Warning' | 'Non-Compliant'
  managementSource: string
  lastCheckIn: string
  encryptionStatus: string
  riskScore: number
  manufacturer?: string
  model?: string
  serialNumber?: string
  osVersion?: string
  ownership?: string
  joinType?: string
  deviceId?: string
}

export interface UserDetails {
  signIns:  UserSignIn[]
  roles:    Array<{ id: string; displayName: string }>
  groups:   Array<{ id: string; displayName: string; groupTypes: string[]; mailEnabled: boolean; securityEnabled: boolean }>
  apps:     Array<{ id: string; appDisplayName: string; resourceDisplayName: string; createdDateTime: string }>
  licenses: Array<{ id: string; skuPartNumber: string; servicePlans: Array<{ servicePlanName: string; provisioningStatus: string }> }>
  devices:  UserDeviceDetail[]
}

export interface UserHealthScore {
  score: number
  reasons: string[]
  warnings: string[]
}

export type UserIntelligenceTab =
  | 'overview' | 'devices' | 'signins' | 'groups-roles'
  | 'security' | 'intune' | 'ai-insights' | 'reports'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastItem {
  id: string
  type: ToastType
  title: string
  message: string
}

// ─── Smart Diagnostics ────────────────────────────────────────────────────────

export interface DiagnosticDevice {
  id: string
  deviceName: string
  user: string
  platform: 'Windows' | 'macOS' | 'Linux'
  osVersion: string
  managementSource: string
  uptime: string
  cpu: number
  memory: { usedGb: number; totalGb: number }
  disk: { usedGb: number; totalGb: number }
  battery?: { level: number; charging: boolean; health: 'Good' | 'Fair' | 'Poor' }
  network: { status: 'Connected' | 'Disconnected' | 'Limited'; ssid?: string; ip?: string }
  lastSync: string
  complianceState: 'Compliant' | 'Warning' | 'Non-Compliant'
  riskScore: number
}

export interface DiagnosticCategoryResult {
  name: string
  score: number
  status: 'Healthy' | 'Warning' | 'Critical' | 'Unknown'
  findings: string[]
  details: string
}

export interface DeviceHealthReport {
  deviceId: string
  generatedAt: string
  overallScore: number
  categories: DiagnosticCategoryResult[]
}

export interface ApplicationFailureReport {
  id: string
  appName: string
  crashTime: string
  faultingModule: string
  errorCode: string
  eventId: string
  affectedUser: string
  possibleReason: string
  recommendedFix: string
  severity: 'Critical' | 'High' | 'Medium' | 'Low'
}

export interface EventLogEntry {
  id: string
  timestamp: string
  source: string
  eventId: string
  level: 'Critical' | 'Error' | 'Warning' | 'Information'
  category: string
  description: string
}

export interface AIRecommendation {
  summary: string
  rootCause: string
  steps: string[]
  severity: 'Critical' | 'High' | 'Medium' | 'Low'
  helpdeskExplanation: string
  generatedAt: string
}

// ─── Enterprise Runbooks ──────────────────────────────────────────────────────

export type ExecMode   = 'normal' | 'safe' | 'dry-run'
export type ExecStatus = 'pending' | 'waiting_approval' | 'running' | 'completed' | 'failed' | 'cancelled'
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'retrying'
export type LogLevel   = 'info' | 'success' | 'warning' | 'error' | 'debug'

export interface EnterpriseRunbookStep {
  id: string
  name: string
  description: string
  estimatedMs: number
  safeMode: boolean
  dryRunSafe: boolean
  logTemplates: string[]
}

export interface EnterpriseRunbook {
  id: string
  name: string
  description: string
  category: string
  platform: string
  severity: string
  version: string
  author: string
  approvalRequired: boolean
  safeModeSupported: boolean
  estimatedMinutes: number
  tags: string[]
  steps: EnterpriseRunbookStep[]
  prerequisites: string[]
  expectedResult: string
  rollbackSteps: string[]
  isTemplate: boolean
  usageCount: number
  createdAt: string
  updatedAt: string
  versions: Array<{ version: string; author: string; date: string; notes: string }>
}

export interface ExecStep {
  id: string
  name: string
  description: string
  status: StepStatus
  startedAt?: string
  completedAt?: string
  output?: string
  error?: string
  retryCount: number
  durationMs?: number
}

export interface ExecLog {
  id: string
  timestamp: string
  level: LogLevel
  message: string
  stepId?: string
  stepName?: string
}

export interface HealthSnapshot {
  cpu: number
  memory: number
  disk: number
  compliance: string
  encryptionEnabled: boolean
  issues: string[]
  capturedAt: string
}

export interface RunbookExecution {
  id: string
  runbookId: string
  runbookName: string
  runbookVersion: string
  deviceId: string
  deviceName: string
  devicePlatform: string
  mode: ExecMode
  status: ExecStatus
  progress: number
  steps: ExecStep[]
  logs: ExecLog[]
  startedAt: string
  completedAt?: string
  durationMs?: number
  initiatedBy: string
  approvedBy?: string
  cancelledBy?: string
  beforeHealth?: HealthSnapshot
  afterHealth?: HealthSnapshot
  aiRootCause?: string
  aiResolution?: string
  error?: string
}
