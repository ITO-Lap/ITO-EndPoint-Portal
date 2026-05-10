import type { AppUser, UserSource, JiraTicket } from '../types'

// ─── shared source builders ───────────────────────────────────────────────────

function entra(userId: string, syncedAt = 'May 8, 2026 06:00 AM'): UserSource {
  return { name: 'Microsoft Entra ID', type: 'directory', syncedAt, status: 'Synced', userId }
}
function intune(userId: string, syncedAt = 'May 8, 2026 05:55 AM'): UserSource {
  return { name: 'Microsoft Intune', type: 'mdm', syncedAt, status: 'Synced', userId }
}
function kandji(userId: string, syncedAt = 'May 8, 2026 06:02 AM'): UserSource {
  return { name: 'Kandji', type: 'mdm', syncedAt, status: 'Synced', userId }
}
function manageEngine(userId: string, syncedAt = 'May 8, 2026 04:30 AM'): UserSource {
  return { name: 'ManageEngine', type: 'mdm', syncedAt, status: 'Synced', userId }
}
function entraPending(userId: string): UserSource {
  return { name: 'Microsoft Entra ID', type: 'directory', syncedAt: 'May 8, 2026 06:00 AM', status: 'Pending', userId }
}
function intuneError(userId: string): UserSource {
  return { name: 'Microsoft Intune', type: 'mdm', syncedAt: 'Apr 24, 2026 03:42 PM', status: 'Error', userId }
}

// ─── mock users ───────────────────────────────────────────────────────────────

export const mockUsers: AppUser[] = [

  // ── Global Admins ──────────────────────────────────────────────────────────
  {
    id: 'u1',
    firstName: 'Avinash',
    lastName: 'Verma',
    email: 'avinash.verma@zinnia.com',
    phone: '+1 (415) 555-0101',
    title: 'IT Manager',
    department: 'IT Management',
    location: 'San Francisco, CA',
    timezone: 'Pacific Time (UTC-8)',
    toolRole: 'Global Admin',
    status: 'Active',
    mfaEnabled: true,
    lastActive: '2 minutes ago',
    lastLogin: 'May 8, 2026 09:02 AM',
    loginLocation: 'San Francisco, CA',
    createdAt: 'Jan 15, 2026',
    riskLevel: 'Low',
    sources: [
      entra('AV-ENTRA-8821'),
      kandji('AV-KANDJI-441'),
    ],
    assignedDevices: [{
      deviceName: 'MBP-AVINASH-01', platform: 'macOS',
      complianceState: 'Compliant', managementSource: 'Kandji',
      lastCheckIn: 'May 8, 2026 09:00 AM', encryptionStatus: 'FileVault On', riskScore: 5,
    }],
    recentActivity: [
      { time: 'May 8, 2026 09:02 AM', type: 'Login', description: 'Successful login', ip: '192.168.1.45', location: 'San Francisco, CA' },
      { time: 'May 7, 2026 06:15 PM', type: 'PolicyChange', description: 'Updated Encryption — BitLocker Policy settings' },
      { time: 'May 7, 2026 05:30 PM', type: 'Logout', description: 'Session ended (idle timeout)' },
      { time: 'May 6, 2026 04:00 PM', type: 'RoleChange', description: 'Changed Marcus Johnson from End User to Helpdesk' },
    ],
    jiraTickets: [
      { id: 'ITO-2341', summary: 'Review and update BitLocker enforcement policy for Windows fleet', status: 'In Progress', priority: 'High', type: 'Task', project: 'ITO', created: 'May 5, 2026', updated: 'May 7, 2026' },
      { id: 'ITO-2318', summary: 'Q2 compliance audit preparation — gather device posture reports', status: 'Open', priority: 'Medium', type: 'Story', project: 'ITO', created: 'Apr 28, 2026', updated: 'May 3, 2026' },
      { id: 'SEC-445', summary: 'Update IP allowlist for corporate VPN access policy', status: 'Open', priority: 'Low', type: 'Task', project: 'SEC', created: 'Apr 22, 2026', updated: 'Apr 22, 2026' },
    ],
  },

  {
    id: 'u2',
    firstName: 'Priya',
    lastName: 'Mehta',
    email: 'priya.mehta@zinnia.com',
    phone: '+1 (415) 555-0202',
    title: 'IT Security Lead',
    department: 'IT Security',
    location: 'Austin, TX',
    timezone: 'Central Time (UTC-6)',
    toolRole: 'Global Admin',
    status: 'Active',
    mfaEnabled: true,
    lastActive: '34 minutes ago',
    lastLogin: 'May 8, 2026 08:28 AM',
    loginLocation: 'Austin, TX',
    createdAt: 'Jan 15, 2026',
    riskLevel: 'Low',
    sources: [
      entra('PM-ENTRA-8822'),
      kandji('PM-KANDJI-442'),
    ],
    assignedDevices: [{
      deviceName: 'MBP-PRIYA-01', platform: 'macOS',
      complianceState: 'Compliant', managementSource: 'Kandji',
      lastCheckIn: 'May 8, 2026 08:25 AM', encryptionStatus: 'FileVault On', riskScore: 5,
    }],
    recentActivity: [
      { time: 'May 8, 2026 08:28 AM', type: 'Login', description: 'Successful login', ip: '10.0.2.88', location: 'Austin, TX' },
      { time: 'May 7, 2026 09:10 AM', type: 'Login', description: 'Successful login', ip: '10.0.2.88', location: 'Austin, TX' },
      { time: 'May 6, 2026 03:00 PM', type: 'PolicyChange', description: 'Created new compliance rule: OS Version Enforcement v2' },
    ],
    jiraTickets: [
      { id: 'SEC-451', summary: 'CVE-2024-21338 patch deployment tracking — 9 devices pending', status: 'In Progress', priority: 'Critical', type: 'Incident', project: 'SEC', created: 'May 1, 2026', updated: 'May 8, 2026' },
      { id: 'SEC-447', summary: 'MFA enforcement rollout plan — target 100% by May 31', status: 'In Progress', priority: 'High', type: 'Story', project: 'SEC', created: 'Apr 25, 2026', updated: 'May 6, 2026' },
      { id: 'ITO-2350', summary: 'Security posture review for Q2 2026 board presentation', status: 'Open', priority: 'Medium', type: 'Task', project: 'ITO', created: 'May 4, 2026', updated: 'May 4, 2026' },
    ],
  },

  // ── IT Admins ──────────────────────────────────────────────────────────────
  {
    id: 'u3',
    firstName: 'Daniel',
    lastName: 'Torres',
    email: 'daniel.torres@zinnia.com',
    phone: '+1 (312) 555-0303',
    title: 'IT Operations Engineer',
    department: 'IT Operations',
    location: 'Chicago, IL',
    timezone: 'Central Time (UTC-6)',
    toolRole: 'IT Admin',
    status: 'Active',
    mfaEnabled: true,
    lastActive: '1 hour ago',
    lastLogin: 'May 8, 2026 07:55 AM',
    loginLocation: 'Chicago, IL',
    createdAt: 'Feb 3, 2026',
    riskLevel: 'Low',
    sources: [
      entra('DT-ENTRA-8823'),
      intune('DT-INTUNE-551'),
    ],
    assignedDevices: [{
      deviceName: 'HP-DANIEL-01', platform: 'Windows',
      complianceState: 'Compliant', managementSource: 'Microsoft Intune',
      lastCheckIn: 'May 8, 2026 07:50 AM', encryptionStatus: 'BitLocker On', riskScore: 10,
    }],
    recentActivity: [
      { time: 'May 8, 2026 07:55 AM', type: 'Login', description: 'Successful login', ip: '172.16.0.22', location: 'Chicago, IL' },
      { time: 'May 7, 2026 10:30 AM', type: 'DeviceSync', description: 'Triggered manual sync on LAPTOP-77H2KJ9' },
      { time: 'May 7, 2026 08:00 AM', type: 'Login', description: 'Successful login', ip: '172.16.0.22', location: 'Chicago, IL' },
    ],
    jiraTickets: [
      { id: 'ITO-2355', summary: 'Remediate LAPTOP-77H2KJ9 — EDR disabled, firewall off, 9 missing patches', status: 'In Progress', priority: 'Critical', type: 'Incident', project: 'ITO', created: 'Apr 24, 2026', updated: 'May 7, 2026' },
      { id: 'ITO-2344', summary: 'Intune policy sync failure investigation — 3 devices not receiving updates', status: 'In Progress', priority: 'High', type: 'Bug', project: 'ITO', created: 'Apr 30, 2026', updated: 'May 6, 2026' },
      { id: 'ITO-2330', summary: 'Deploy Windows 11 upgrade to legacy Windows 10 21H2 devices', status: 'Open', priority: 'Medium', type: 'Task', project: 'ITO', created: 'Apr 18, 2026', updated: 'Apr 28, 2026' },
    ],
  },

  {
    id: 'u4',
    firstName: 'Sophie',
    lastName: 'Williams',
    email: 'sophie.williams@zinnia.com',
    phone: '+1 (212) 555-0404',
    title: 'IT Support Engineer',
    department: 'IT Support',
    location: 'New York, NY',
    timezone: 'Eastern Time (UTC-5)',
    toolRole: 'IT Admin',
    status: 'Active',
    mfaEnabled: true,
    lastActive: '3 hours ago',
    lastLogin: 'May 8, 2026 06:10 AM',
    loginLocation: 'New York, NY',
    createdAt: 'Feb 10, 2026',
    riskLevel: 'Low',
    sources: [
      entra('SW-ENTRA-8824'),
      intune('SW-INTUNE-552'),
    ],
    assignedDevices: [{
      deviceName: 'DELL-SOPHIE-01', platform: 'Windows',
      complianceState: 'Compliant', managementSource: 'Microsoft Intune',
      lastCheckIn: 'May 8, 2026 06:05 AM', encryptionStatus: 'BitLocker On', riskScore: 8,
    }],
    recentActivity: [
      { time: 'May 8, 2026 06:10 AM', type: 'Login', description: 'Successful login', ip: '10.10.1.15', location: 'New York, NY' },
      { time: 'May 7, 2026 11:00 AM', type: 'DeviceSync', description: 'Triggered sync on MAC-9C2K7L3' },
      { time: 'May 7, 2026 08:05 AM', type: 'Login', description: 'Successful login', ip: '10.10.1.15', location: 'New York, NY' },
    ],
    jiraTickets: [
      { id: 'ITO-2360', summary: 'USER: jane.smith@company.com — FileVault pending, assist with enrollment', status: 'Open', priority: 'Medium', type: 'Request', project: 'ITO', created: 'May 6, 2026', updated: 'May 7, 2026' },
      { id: 'ITO-2358', summary: 'USER: david.lee — OS update fails, manual override required', status: 'In Progress', priority: 'Low', type: 'Task', project: 'ITO', created: 'May 5, 2026', updated: 'May 8, 2026' },
      { id: 'HD-890', summary: 'New device onboarding queue — 3 pending enrollments this week', status: 'Open', priority: 'Low', type: 'Task', project: 'HD', created: 'May 5, 2026', updated: 'May 5, 2026' },
    ],
  },

  {
    id: 'u5',
    firstName: 'Sarah',
    lastName: 'Chen',
    email: 'sarah.chen@company.com',
    phone: '+1 (415) 555-0505',
    title: 'DevOps Engineer',
    department: 'Engineering',
    location: 'Seattle, WA',
    timezone: 'Pacific Time (UTC-8)',
    toolRole: 'IT Admin',
    status: 'Active',
    mfaEnabled: true,
    lastActive: 'Yesterday',
    lastLogin: 'May 7, 2026 02:30 PM',
    loginLocation: 'Seattle, WA',
    createdAt: 'Mar 1, 2026',
    riskLevel: 'Low',
    sources: [
      entra('SC-ENTRA-8825'),
      kandji('SC-KANDJI-443'),
    ],
    assignedDevices: [{
      deviceName: 'MAC-8K3M1N2', platform: 'macOS',
      complianceState: 'Compliant', managementSource: 'Kandji',
      lastCheckIn: 'Apr 24, 2026 02:15 PM', encryptionStatus: 'FileVault On', riskScore: 8,
    }],
    recentActivity: [
      { time: 'May 7, 2026 02:30 PM', type: 'Login', description: 'Successful login', ip: '10.5.0.33', location: 'Seattle, WA' },
      { time: 'May 6, 2026 09:00 AM', type: 'Login', description: 'Successful login', ip: '10.5.0.33', location: 'Seattle, WA' },
    ],
    jiraTickets: [
      { id: 'INFRA-156', summary: 'Update Kandji blueprint for macOS Sonoma 14.5 compliance requirements', status: 'In Progress', priority: 'Medium', type: 'Task', project: 'INFRA', created: 'May 2, 2026', updated: 'May 7, 2026' },
      { id: 'INFRA-148', summary: 'DevOps toolchain compliance review — CI/CD pipeline security audit', status: 'Open', priority: 'Low', type: 'Story', project: 'INFRA', created: 'Apr 14, 2026', updated: 'Apr 22, 2026' },
    ],
  },

  // ── Helpdesk ───────────────────────────────────────────────────────────────
  {
    id: 'u6',
    firstName: 'Marcus',
    lastName: 'Johnson',
    email: 'marcus.johnson@zinnia.com',
    phone: '+1 (214) 555-0606',
    title: 'IT Support Specialist',
    department: 'Support',
    location: 'Dallas, TX',
    timezone: 'Central Time (UTC-6)',
    toolRole: 'Helpdesk',
    status: 'Active',
    mfaEnabled: false,
    lastActive: '2 days ago',
    lastLogin: 'May 6, 2026 10:15 AM',
    loginLocation: 'Dallas, TX',
    createdAt: 'Apr 1, 2026',
    riskLevel: 'Medium',
    sources: [
      entra('MJ-ENTRA-8826'),
      intune('MJ-INTUNE-553'),
    ],
    assignedDevices: [{
      deviceName: 'DELL-MARCUS-01', platform: 'Windows',
      complianceState: 'Warning', managementSource: 'Microsoft Intune',
      lastCheckIn: 'May 6, 2026 10:00 AM', encryptionStatus: 'BitLocker On', riskScore: 42,
    }],
    recentActivity: [
      { time: 'May 6, 2026 10:15 AM', type: 'Login', description: 'Successful login (no MFA)', ip: '192.168.5.70', location: 'Dallas, TX' },
      { time: 'May 5, 2026 12:00 PM', type: 'Alert', description: 'MFA enrollment reminder sent — 14 days remaining' },
    ],
    jiraTickets: [
      { id: 'HD-892', summary: 'USER: john.doe — BitLocker recovery key request, device locked', status: 'Open', priority: 'High', type: 'Request', project: 'HD', created: 'Apr 25, 2026', updated: 'May 1, 2026' },
      { id: 'HD-891', summary: 'USER: david.lee — Windows 10 manual update approval needed', status: 'In Progress', priority: 'Medium', type: 'Task', project: 'HD', created: 'Apr 24, 2026', updated: 'May 6, 2026' },
      { id: 'HD-885', summary: 'Complete MFA enrollment — self-service prompt pending (assigned to self)', status: 'Pending', priority: 'High', type: 'Task', project: 'HD', created: 'Apr 15, 2026', updated: 'May 6, 2026' },
    ],
  },

  // ── End Users ──────────────────────────────────────────────────────────────
  {
    id: 'u7',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@company.com',
    phone: '+1 (617) 555-0707',
    title: 'Sales Executive',
    department: 'Sales',
    location: 'Boston, MA',
    timezone: 'Eastern Time (UTC-5)',
    toolRole: 'End User',
    status: 'Active',
    mfaEnabled: false,
    lastActive: 'Apr 25, 2026',
    lastLogin: 'Apr 25, 2026 08:45 AM',
    loginLocation: 'Boston, MA',
    createdAt: 'Sep 12, 2025',
    riskLevel: 'High',
    sources: [
      entra('JD-ENTRA-7701'),
      intune('JD-INTUNE-661', 'Apr 25, 2026 09:15 AM'),
      manageEngine('JD-ME-221', 'Apr 25, 2026 08:00 AM'),
    ],
    assignedDevices: [{
      deviceName: 'LAPTOP-8F7G2Q1', platform: 'Windows',
      complianceState: 'Non-Compliant', managementSource: 'Microsoft Intune',
      lastCheckIn: 'Apr 25, 2026 09:15 AM', encryptionStatus: 'BitLocker Off', riskScore: 78,
    }],
    recentActivity: [
      { time: 'Apr 25, 2026 08:45 AM', type: 'Login', description: 'Successful login (no MFA)', ip: '98.234.12.66', location: 'Boston, MA' },
      { time: 'Apr 25, 2026 09:15 AM', type: 'Alert', description: 'Device LAPTOP-8F7G2Q1 flagged non-compliant — BitLocker off' },
      { time: 'Apr 24, 2026 08:30 AM', type: 'Login', description: 'Successful login (no MFA)', ip: '98.234.12.66', location: 'Boston, MA' },
    ],
    jiraTickets: [
      { id: 'HD-893', summary: 'Laptop BitLocker encryption disabled — device non-compliant, needs IT assistance', status: 'Open', priority: 'High', type: 'Incident', project: 'HD', created: 'Apr 25, 2026', updated: 'Apr 25, 2026' },
      { id: 'HD-876', summary: 'Software request: Adobe Creative Cloud license for marketing decks', status: 'Pending', priority: 'Low', type: 'Request', project: 'HD', created: 'Apr 18, 2026', updated: 'Apr 20, 2026' },
    ],
  },

  {
    id: 'u8',
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane.smith@company.com',
    phone: '+1 (503) 555-0808',
    title: 'Software Engineer',
    department: 'Engineering',
    location: 'Portland, OR',
    timezone: 'Pacific Time (UTC-8)',
    toolRole: 'End User',
    status: 'Active',
    mfaEnabled: true,
    lastActive: 'Apr 25, 2026',
    lastLogin: 'Apr 25, 2026 07:50 AM',
    loginLocation: 'Portland, OR',
    createdAt: 'Jul 20, 2025',
    riskLevel: 'Medium',
    sources: [
      entra('JS-ENTRA-7702'),
      kandji('JS-KANDJI-444', 'Apr 25, 2026 08:47 AM'),
    ],
    assignedDevices: [{
      deviceName: 'MAC-9C2K7L3', platform: 'macOS',
      complianceState: 'Warning', managementSource: 'Kandji',
      lastCheckIn: 'Apr 25, 2026 08:47 AM', encryptionStatus: 'FileVault Pending', riskScore: 45,
    }],
    recentActivity: [
      { time: 'Apr 25, 2026 07:50 AM', type: 'Login', description: 'MFA-verified login', ip: '73.162.5.44', location: 'Portland, OR' },
      { time: 'Apr 25, 2026 08:47 AM', type: 'Alert', description: 'Device MAC-9C2K7L3 — FileVault encryption pending review' },
    ],
    jiraTickets: [
      { id: 'HD-888', summary: 'MacBook FileVault encryption showing "pending" — need recovery key assistance', status: 'Open', priority: 'Medium', type: 'Incident', project: 'HD', created: 'Apr 25, 2026', updated: 'May 1, 2026' },
      { id: 'HD-880', summary: 'VPN connectivity intermittent when working from home', status: 'Resolved', priority: 'Medium', type: 'Bug', project: 'HD', created: 'Apr 14, 2026', updated: 'Apr 20, 2026' },
    ],
  },

  {
    id: 'u9',
    firstName: 'Tom',
    lastName: 'Chen',
    email: 'user2@company.com',
    phone: '+1 (702) 555-0909',
    title: 'Finance Analyst',
    department: 'Finance',
    location: 'Las Vegas, NV',
    timezone: 'Pacific Time (UTC-8)',
    toolRole: 'End User',
    status: 'Active',
    mfaEnabled: true,
    lastActive: 'Apr 25, 2026',
    lastLogin: 'Apr 25, 2026 08:15 AM',
    loginLocation: 'Las Vegas, NV',
    createdAt: 'Aug 5, 2025',
    riskLevel: 'Low',
    sources: [
      entra('TC-ENTRA-7703'),
      intune('TC-INTUNE-662', 'Apr 25, 2026 08:30 AM'),
    ],
    assignedDevices: [{
      deviceName: 'USER2-WIN-01', platform: 'Windows',
      complianceState: 'Compliant', managementSource: 'Microsoft Intune',
      lastCheckIn: 'Apr 25, 2026 08:30 AM', encryptionStatus: 'BitLocker On', riskScore: 12,
    }],
    recentActivity: [
      { time: 'Apr 25, 2026 08:15 AM', type: 'Login', description: 'MFA-verified login', ip: '67.183.90.12', location: 'Las Vegas, NV' },
      { time: 'Apr 24, 2026 08:00 AM', type: 'Login', description: 'MFA-verified login', ip: '67.183.90.12', location: 'Las Vegas, NV' },
    ],
    jiraTickets: [],
  },

  {
    id: 'u10',
    firstName: 'Mike',
    lastName: 'Johnson',
    email: 'mike.johnson@company.com',
    phone: '+1 (305) 555-1010',
    title: 'Marketing Manager',
    department: 'Marketing',
    location: 'Miami, FL',
    timezone: 'Eastern Time (UTC-5)',
    toolRole: 'End User',
    status: 'Suspended',
    mfaEnabled: false,
    lastActive: 'Apr 24, 2026',
    lastLogin: 'Apr 24, 2026 03:30 PM',
    loginLocation: 'Miami, FL',
    createdAt: 'Oct 3, 2025',
    riskLevel: 'Critical',
    sources: [
      entra('MJ2-ENTRA-7704'),
      intuneError('MJ2-INTUNE-663'),
      manageEngine('MJ2-ME-222', 'Apr 24, 2026 03:00 PM'),
    ],
    assignedDevices: [{
      deviceName: 'LAPTOP-77H2KJ9', platform: 'Windows',
      complianceState: 'Non-Compliant', managementSource: 'Microsoft Intune',
      lastCheckIn: 'Apr 24, 2026 03:42 PM', encryptionStatus: 'BitLocker Off', riskScore: 91,
    }],
    recentActivity: [
      { time: 'Apr 24, 2026 03:30 PM', type: 'Alert', description: 'Account suspended — critical security violations on endpoint' },
      { time: 'Apr 24, 2026 02:45 PM', type: 'Login', description: 'Login from unrecognized location', ip: '185.220.101.5', location: 'Unknown (TOR exit node)' },
      { time: 'Apr 23, 2026 09:00 AM', type: 'Alert', description: 'Unauthorized application detected: AnyDesk 7.0 + BitTorrent' },
    ],
    jiraTickets: [
      { id: 'SEC-450', summary: 'CRITICAL: Unauthorized remote access tools detected — AnyDesk, BitTorrent on endpoint', status: 'In Progress', priority: 'Critical', type: 'Incident', project: 'SEC', created: 'Apr 23, 2026', updated: 'May 2, 2026' },
      { id: 'SEC-448', summary: 'CRITICAL: EDR agent disabled on LAPTOP-77H2KJ9 — endpoint unprotected', status: 'In Progress', priority: 'Critical', type: 'Incident', project: 'SEC', created: 'Apr 24, 2026', updated: 'May 5, 2026' },
      { id: 'HD-887', summary: 'Account suspension review and reinstatement process', status: 'Pending', priority: 'Critical', type: 'Task', project: 'HD', created: 'Apr 24, 2026', updated: 'May 6, 2026' },
    ],
  },

  {
    id: 'u11',
    firstName: 'David',
    lastName: 'Lee',
    email: 'david.lee@company.com',
    phone: '+1 (512) 555-1111',
    title: 'IT Support Analyst',
    department: 'IT Support',
    location: 'Austin, TX',
    timezone: 'Central Time (UTC-6)',
    toolRole: 'End User',
    status: 'Active',
    mfaEnabled: false,
    lastActive: 'Apr 24, 2026',
    lastLogin: 'Apr 24, 2026 01:10 PM',
    loginLocation: 'Austin, TX',
    createdAt: 'Nov 18, 2025',
    riskLevel: 'Medium',
    sources: [
      entra('DL-ENTRA-7705'),
      intune('DL-INTUNE-664', 'Apr 24, 2026 01:30 PM'),
      manageEngine('DL-ME-223', 'Apr 24, 2026 12:00 PM'),
    ],
    assignedDevices: [{
      deviceName: 'WIN-DESK-004', platform: 'Windows',
      complianceState: 'Warning', managementSource: 'Microsoft Intune',
      lastCheckIn: 'Apr 24, 2026 01:30 PM', encryptionStatus: 'BitLocker On', riskScore: 55,
    }],
    recentActivity: [
      { time: 'Apr 24, 2026 01:10 PM', type: 'Login', description: 'Successful login (no MFA)', ip: '10.0.5.99', location: 'Austin, TX' },
      { time: 'Apr 22, 2026 11:00 AM', type: 'Alert', description: 'OS version out of compliance — Windows 10 21H2 end of support' },
    ],
    jiraTickets: [
      { id: 'HD-894', summary: 'OS update fails on WIN-DESK-004 — Windows 10 21H2 stuck, manual intervention needed', status: 'Open', priority: 'High', type: 'Incident', project: 'HD', created: 'Apr 24, 2026', updated: 'May 3, 2026' },
      { id: 'HD-881', summary: 'MFA enrollment assistance requested — needs walkthrough from IT', status: 'Pending', priority: 'Medium', type: 'Request', project: 'HD', created: 'Apr 20, 2026', updated: 'Apr 22, 2026' },
    ],
  },
]

export function getAllUsers(): AppUser[] { return [...mockUsers] }
export function getUserById(id: string): AppUser | undefined { return mockUsers.find(u => u.id === id) }
