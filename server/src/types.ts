export interface Device {
  id: string
  deviceName: string
  user: string
  serialNumber: string
  platform: 'Windows' | 'macOS' | 'Linux'
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
  mock: boolean
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}
