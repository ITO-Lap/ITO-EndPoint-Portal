/** Mock Microsoft Entra / Intune data for backend API endpoints. */

export const mockEntraOverview = {
  totalDevices: 2541, compliantDevices: 1892, nonCompliantDevices: 312,
  inactiveDevices: 337, totalUsers: 1842, totalGroups: 256,
  failedPolicies: 34, appInstallFailures: 56, devicesMissingEncryption: 145,
  devicesMissingDefender: 102, pendingReboot: 187, highRiskUsers: 18, openTickets: 28,
}

export const mockEntraDevices = [
  { id: 'd-001', deviceName: 'LAPTOP-7XG3K2', upn: 'john.doe@contoso.com', os: 'Windows', complianceState: 'Non-Compliant', daysSinceCheckIn: 10, encryptionState: 'Not Encrypted', defenderState: 'Active' },
  { id: 'd-002', deviceName: 'SURFACE-PRO-9',  upn: 'sarah.wilson@contoso.com', os: 'Windows', complianceState: 'Non-Compliant', daysSinceCheckIn: 11, encryptionState: 'Encrypted', defenderState: 'Inactive' },
  { id: 'd-003', deviceName: 'DESKTOP-8JH2M1', upn: 'mike.johnson@contoso.com', os: 'Windows', complianceState: 'Non-Compliant', daysSinceCheckIn: 12, encryptionState: 'Not Encrypted', defenderState: 'Active' },
  { id: 'd-004', deviceName: 'IPAD-9TH-GEN',   upn: 'emily.davis@contoso.com',  os: 'iOS',     complianceState: 'Compliant',     daysSinceCheckIn: 13, encryptionState: 'Encrypted', defenderState: 'Not Installed' },
  { id: 'd-005', deviceName: 'LAPTOP-KL9P2Q',  upn: 'david.brown@contoso.com',  os: 'Windows', complianceState: 'In Grace Period', daysSinceCheckIn: 14, encryptionState: 'Encrypted', defenderState: 'Active' },
]

export const mockEntraUsers = [
  { id: 'u-001', displayName: 'John Doe',      upn: 'john.doe@contoso.com',      riskLevel: 'High',   department: 'Finance',    mfaStatus: 'Enabled' },
  { id: 'u-002', displayName: 'Sarah Wilson',  upn: 'sarah.wilson@contoso.com',  riskLevel: 'High',   department: 'Marketing',  mfaStatus: 'Enabled' },
  { id: 'u-003', displayName: 'Mike Johnson',  upn: 'mike.johnson@contoso.com',  riskLevel: 'Medium', department: 'IT Ops',     mfaStatus: 'Enabled' },
  { id: 'u-004', displayName: 'Emily Davis',   upn: 'emily.davis@contoso.com',   riskLevel: 'Medium', department: 'Sales',      mfaStatus: 'Disabled' },
  { id: 'u-005', displayName: 'David Brown',   upn: 'david.brown@contoso.com',   riskLevel: 'Low',    department: 'Engineering',mfaStatus: 'Enabled' },
]

export const mockEntraGroups = [
  { id: 'g-001', displayName: 'Finance Users',              memberCount: 142, type: 'Security' },
  { id: 'g-002', displayName: 'Windows Autopilot Devices',  memberCount: 1248, type: 'Security' },
  { id: 'g-003', displayName: 'Marketing Team',             memberCount: 89,  type: 'Microsoft 365' },
]

export const mockEntraRelationships = [
  {
    userId: 'u-001', userName: 'John Doe', userUpn: 'john.doe@contoso.com',
    devices: [{ id: 'd-001', name: 'LAPTOP-7XG3K2', compliance: 'Non-Compliant', os: 'Windows' }],
    groups: ['Finance Users', 'Windows Autopilot Devices'],
    policies: ['BitLocker Baseline', 'Defender Security Baseline'],
    apps: ['Microsoft 365 Apps', 'VPN Client'],
    tickets: ['INC-1042'],
    issues: ['BitLocker not enabled', 'OS version outdated'],
  },
]

export const mockEntraSecurity = {
  highRiskUsers: 18, mfaNotEnabled: 24, conditionalAccessBlocked: 7,
  staleDevicesOverThreshold: 337, devicesWithoutDefender: 102,
}
