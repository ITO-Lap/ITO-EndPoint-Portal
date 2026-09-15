/**
 * Microsoft Entra / Intune Resource Intelligence — Type Definitions
 *
 * No mock/demo data lives here. Real data comes from the Microsoft Graph
 * API via /api/entra/* (see server/src/services/entraIntelligence.ts).
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
  defenderState: 'Active' | 'Inactive' | 'Not Installed' | 'Unknown'
  pendingReboot: boolean
  assignedGroups: string[]
  assignedPolicies: string[]
  installedApps: string[]
  openIssues: string[]
}
