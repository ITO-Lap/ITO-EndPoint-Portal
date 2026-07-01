export interface Device {
  id: string
  deviceName: string
  user: string
  serialNumber: string
  platform: 'Windows' | 'macOS' | 'Linux' | 'Android' | 'iOS'
  osVersion: string
  managementSource: 'Microsoft Intune' | 'Kandji' | 'ManageEngine'
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

  // Hardware
  manufacturer?: string
  model?: string
  totalStorage?: string
  freeStorage?: string
  totalMemory?: string
  processor?: string
  architecture?: string

  // Network
  ipAddress?: string
  macAddress?: string
  wifiMacAddress?: string

  // Enrollment & Identity
  enrollmentDate?: string
  enrollmentType?: string
  ownership?: 'Corporate' | 'Personal'
  isAadRegistered?: boolean
  department?: string

  // OS Details
  osBuildNumber?: string

  // Security
  firewallStatus?: string
  antivirusStatus?: string
  secureBoot?: string
  tpmVersion?: string

  // Compliance
  lastComplianceCheck?: string
  appliedPolicies?: string[]

  // Applications
  apps?: AppStatus[]

  // LAPS
  laps?: LapsInfo
}

export interface AppStatus {
  name: string
  version: string
  publisher: string
  status: 'Installed' | 'Failed' | 'Pending' | 'NotApplicable'
  appType?: string      // e.g. "App Store", "System", "MDM Managed"
  installDate?: string
  size?: string
  errorCode?: string
  errorDescription?: string
  lastAttempt?: string
}

export interface LapsInfo {
  enabled: boolean
  source?: string          // "Microsoft LAPS (Entra)" | "Legacy LAPS" | "Kandji Managed" | "Not Configured"
  accountName?: string     // "LocalAdmin" | "Administrator"
  passwordLastRotated?: string
  passwordExpiresAt?: string
}

export interface Runbook {
  id: string
  name: string
  description: string
  steps: string[]
  prerequisites: string[]
  expectedResult: string
  automationAvailable: boolean
  escalationNeeded: boolean
}

export interface Notification {
  id: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  read: boolean
  createdAt: string
}

export interface AutomationJob {
  id: string
  deviceId: string
  runbookId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  startedAt: string
  completedAt?: string
  error?: string
}

export interface ActivityItem {
  id: string
  deviceName: string
  message: string
  status: 'Compliant' | 'Warning' | 'Non-Compliant'
  timestamp: string
}

export interface DashboardStats {
  total: number
  compliant: number
  nonCompliant: number
  warning: number
  windows: number
  mac: number
  sources: {
    intune: number
    kandji: number
    manageEngine: number
  }
  issueCategories: Array<{ label: string; value: number }>
  mock: boolean
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

// ── Automation Engine ─────────────────────────────────────────────────────────

export type AutomationCategory = 'compliance' | 'security' | 'patching' | 'reporting' | 'drift'

export type AutomationTriggerType =
  | 'device_non_compliant'
  | 'compliance_threshold'
  | 'device_offline'
  | 'new_enrollment'
  | 'scheduled'
  | 'risky_signin'
  | 'drift_detected'
  | 'encryption_off'
  | 'script_failure'
  | 'enrollment_failed'
  | 'sync_failure'
  | 'app_deploy_failed'
  | 'cert_expiring'
  | 'stale_device'

export type AutomationActionType =
  | 'slack_notify'
  | 'create_jira'
  | 'execute_runbook'
  | 'execute_script'
  | 'generate_report'
  | 'send_notification'
  | 'teams_notify'

export interface AutomationRule {
  id: string
  name: string
  description: string
  category: AutomationCategory
  enabled: boolean
  trigger: {
    type: AutomationTriggerType
    config: Record<string, string | number | boolean>
  }
  conditions: {
    platform: 'Windows' | 'macOS' | 'Linux' | 'all'
    source: 'intune' | 'kandji' | 'manageengine' | 'all'
    severity: 'Low' | 'Medium' | 'High' | 'Critical' | 'all'
    complianceState: 'Non-Compliant' | 'Warning' | 'all'
  }
  actions: Array<{
    type: AutomationActionType
    label: string
    config: Record<string, string>
  }>
  lastTriggered?: string
  triggerCount: number
  createdAt: string
  createdBy: string
}

export interface AutomationExecution {
  id: string
  ruleId: string
  ruleName: string
  category: AutomationCategory
  triggeredAt: string
  deviceId?: string
  deviceName?: string
  triggerReason: string
  status: 'success' | 'failed' | 'partial'
  actionsExecuted: Array<{
    type: AutomationActionType
    label: string
    status: 'success' | 'failed'
    result: string
    detail?: {
      runbookSteps?:   string[]
      script?:         string
      jiraKey?:        string
      jiraUrl?:        string
      slackTs?:        string
      slackChannel?:   string
      reportMarkdown?: string
      reportSummary?:  string
    }
  }>
  durationMs: number
  matchedDeviceCount?: number
}
