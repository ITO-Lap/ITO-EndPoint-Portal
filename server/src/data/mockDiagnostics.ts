// Mock data + deterministic generators for Smart Diagnostics
import type { Device } from '../types.js'

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

// ─── Devices ──────────────────────────────────────────────────────────────────

export const MOCK_DIAGNOSTIC_DEVICES: DiagnosticDevice[] = [
  {
    id: 'diag-001',
    deviceName: 'WIN-CORP-0042',
    user: 'james.wong',
    platform: 'Windows',
    osVersion: 'Windows 11 22H2 (22621.3296)',
    managementSource: 'Microsoft Intune',
    uptime: '14d 6h 22m',
    cpu: 78,
    memory: { usedGb: 11.4, totalGb: 16 },
    disk: { usedGb: 287, totalGb: 512 },
    battery: { level: 42, charging: false, health: 'Fair' },
    network: { status: 'Connected', ssid: 'CORP-WIFI-5G', ip: '10.0.1.42' },
    lastSync: '2026-06-06 08:14:22',
    complianceState: 'Non-Compliant',
    riskScore: 72,
  },
  {
    id: 'diag-002',
    deviceName: 'MAC-ENG-0011',
    user: 'sarah.chen',
    platform: 'macOS',
    osVersion: 'macOS Sonoma 14.4.1',
    managementSource: 'Kandji',
    uptime: '3d 1h 10m',
    cpu: 34,
    memory: { usedGb: 9.1, totalGb: 32 },
    disk: { usedGb: 198, totalGb: 1000 },
    battery: { level: 88, charging: true, health: 'Good' },
    network: { status: 'Connected', ssid: 'CORP-WIFI-5G', ip: '10.0.2.11' },
    lastSync: '2026-06-06 09:01:05',
    complianceState: 'Compliant',
    riskScore: 18,
  },
  {
    id: 'diag-003',
    deviceName: 'WIN-FIN-0007',
    user: 'david.kim',
    platform: 'Windows',
    osVersion: 'Windows 10 21H2 (19044.2846)',
    managementSource: 'Microsoft Intune',
    uptime: '0d 0h 45m',
    cpu: 91,
    memory: { usedGb: 15.2, totalGb: 16 },
    disk: { usedGb: 451, totalGb: 512 },
    network: { status: 'Disconnected' },
    lastSync: '2026-06-05 22:20:00',
    complianceState: 'Non-Compliant',
    riskScore: 96,
  },
  {
    id: 'diag-004',
    deviceName: 'MAC-HR-0033',
    user: 'emily.foster',
    platform: 'macOS',
    osVersion: 'macOS Ventura 13.6.5',
    managementSource: 'Kandji',
    uptime: '7d 4h 55m',
    cpu: 22,
    memory: { usedGb: 5.8, totalGb: 8 },
    disk: { usedGb: 121, totalGb: 256 },
    battery: { level: 100, charging: true, health: 'Good' },
    network: { status: 'Connected', ssid: 'HR-DEPT-WIFI', ip: '10.0.3.33' },
    lastSync: '2026-06-06 07:31:18',
    complianceState: 'Warning',
    riskScore: 44,
  },
  {
    id: 'diag-005',
    deviceName: 'WIN-CORP-0055',
    user: 'lisa.patel',
    platform: 'Windows',
    osVersion: 'Windows 11 23H2 (22631.3447)',
    managementSource: 'ManageEngine',
    uptime: '2d 8h 30m',
    cpu: 45,
    memory: { usedGb: 7.3, totalGb: 16 },
    disk: { usedGb: 155, totalGb: 512 },
    battery: { level: 67, charging: false, health: 'Good' },
    network: { status: 'Limited', ssid: 'CORP-GUEST', ip: '192.168.1.55' },
    lastSync: '2026-06-06 06:45:00',
    complianceState: 'Warning',
    riskScore: 58,
  },
  {
    id: 'diag-006',
    deviceName: 'WIN-DEV-0019',
    user: 'ryan.obrien',
    platform: 'Windows',
    osVersion: 'Windows 11 22H2 (22621.3296)',
    managementSource: 'Microsoft Intune',
    uptime: '5d 12h 04m',
    cpu: 62,
    memory: { usedGb: 22.1, totalGb: 32 },
    disk: { usedGb: 380, totalGb: 1000 },
    battery: { level: 55, charging: false, health: 'Good' },
    network: { status: 'Connected', ssid: 'DEV-WIFI-5G', ip: '10.0.4.19' },
    lastSync: '2026-06-06 09:47:05',
    complianceState: 'Warning',
    riskScore: 51,
  },
]

// ─── Health reports ───────────────────────────────────────────────────────────

const ALL_CATEGORIES = [
  'System Health',
  'Application Failures',
  'Windows Event Logs',
  'Intune Sync Issues',
  'Patch Status',
  'Disk and Storage',
  'Network Connectivity',
  'Security / Defender',
  'Startup Performance',
]

const HEALTH_REPORTS: Record<string, DeviceHealthReport> = {
  'diag-001': {
    deviceId: 'diag-001',
    generatedAt: '2026-06-06 09:00:00',
    overallScore: 34,
    categories: [
      { name: 'System Health',        score: 40, status: 'Warning',  findings: ['CPU averaging 78% over 24h', 'Memory pressure detected', '14-day uptime without restart'], details: 'Device is under sustained CPU and memory load. Extended uptime without restart may cause instability.' },
      { name: 'Application Failures', score: 15, status: 'Critical', findings: ['3 application crashes in last 24h', 'Microsoft Outlook crash loop detected', 'Teams memory leak'], details: 'Multiple critical application failures are impacting productivity. Immediate remediation required.' },
      { name: 'Windows Event Logs',   score: 30, status: 'Critical', findings: ['Event 4625: 12 failed login attempts', 'Event 7034: Service crash (Windows Update)', 'Event 41: Kernel power failure'], details: 'Critical Windows events indicate security concern (failed logins) and system instability (kernel power event).' },
      { name: 'Intune Sync Issues',   score: 55, status: 'Warning',  findings: ['Last policy sync 6h ago (expected: <2h)', '2 policies pending application'], details: 'Device is behind on policy sync. May not have latest security baselines applied.' },
      { name: 'Patch Status',         score: 20, status: 'Critical', findings: ['14 security patches missing', '3 critical CVE patches pending', 'OS is 4 months behind'], details: 'Device is critically under-patched. Several known CVEs are unaddressed.' },
      { name: 'Disk and Storage',     score: 56, status: 'Warning',  findings: ['287 GB used of 512 GB (56%)', 'No disk errors detected', 'Temp files >8 GB'], details: 'Disk usage is at moderate levels. Large temp file accumulation should be cleaned.' },
      { name: 'Network Connectivity', score: 80, status: 'Healthy',  findings: ['Connected to CORP-WIFI-5G', 'DNS resolving correctly', 'Latency 12ms'], details: 'Network connection is stable and performant.' },
      { name: 'Security / Defender',  score: 25, status: 'Critical', findings: ['Defender definitions 5 days out of date', 'Real-time protection disabled', 'Last full scan: 11 days ago'], details: 'Microsoft Defender is not functioning correctly. Real-time protection is disabled, leaving device exposed.' },
      { name: 'Startup Performance',  score: 60, status: 'Warning',  findings: ['Boot time: 48s (target: <30s)', '12 startup programs detected', 'Delay caused by antivirus init'], details: 'Startup time exceeds target. High number of startup programs is impacting user experience.' },
    ],
  },
  'diag-002': {
    deviceId: 'diag-002',
    generatedAt: '2026-06-06 09:01:00',
    overallScore: 91,
    categories: ALL_CATEGORIES.map(name => ({
      name,
      score: name === 'Startup Performance' ? 78 : 90 + Math.floor(Math.random() * 10),
      status: 'Healthy' as const,
      findings: ['No issues detected'],
      details: 'All checks passed within acceptable thresholds.',
    })),
  },
  'diag-003': {
    deviceId: 'diag-003',
    generatedAt: '2026-06-06 09:02:00',
    overallScore: 8,
    categories: [
      { name: 'System Health',        score: 5,  status: 'Critical', findings: ['CPU at 91% — likely malware/ransomware activity', 'Memory at 95% — near exhaustion', 'Device recently isolated from network'], details: 'Device is experiencing extreme resource exhaustion consistent with active ransomware. Incident INC-0042 open.' },
      { name: 'Application Failures', score: 5,  status: 'Critical', findings: ['Ransomware process encrypt_srv.exe detected', '847 files encrypted in 12 seconds', 'Shadow copies deleted'], details: 'Active ransomware confirmed. Files have been encrypted. Device is isolated.' },
      { name: 'Windows Event Logs',   score: 5,  status: 'Critical', findings: ['Event 4663: Mass file access', 'Event 524: System restore deleted', 'Event 7036: Multiple critical services stopped'], details: 'Event logs confirm ransomware activity across all log categories.' },
      { name: 'Intune Sync Issues',   score: 10, status: 'Critical', findings: ['Device offline — no Intune connectivity', 'Last sync: 11 hours ago', 'Policies cannot be applied'], details: 'Device is network-isolated for containment. MDM connectivity intentionally severed.' },
      { name: 'Patch Status',         score: 8,  status: 'Critical', findings: ['OS 8 months out of date', 'Exploit CVE-2023-36884 present', '22 critical patches missing'], details: 'Critical vulnerability CVE-2023-36884 (MSHTML) was likely initial attack vector.' },
      { name: 'Disk and Storage',     score: 10, status: 'Critical', findings: ['451 of 512 GB used (88%)', '847 files encrypted (.encrypted extension)', 'VSS snapshots deleted'], details: 'Ransomware has encrypted user data. Recovery from backup required.' },
      { name: 'Network Connectivity', score: 5,  status: 'Critical', findings: ['Device intentionally isolated', 'No network connectivity', 'Management channel only'], details: 'Network isolation enforced by CrowdStrike automated response RSP-0201.' },
      { name: 'Security / Defender',  score: 5,  status: 'Critical', findings: ['Defender disabled by malware', 'Real-time protection OFF', 'Malware detected: LockBit 3.0'], details: 'Defender was disabled by the ransomware payload prior to encryption beginning.' },
      { name: 'Startup Performance',  score: 15, status: 'Critical', findings: ['Boot blocked — OS corruption', 'Startup repair loop detected'], details: 'System files may be corrupted. Full re-image required.' },
    ],
  },
  'diag-004': {
    deviceId: 'diag-004',
    generatedAt: '2026-06-06 09:03:00',
    overallScore: 62,
    categories: [
      { name: 'System Health',        score: 82, status: 'Healthy',  findings: ['CPU at 22% — healthy', 'Memory 72% used (5.8/8 GB)', '7-day uptime normal'], details: 'System resources are within normal thresholds.' },
      { name: 'Application Failures', score: 70, status: 'Warning',  findings: ['1 crash in last 7 days (Word)', 'Crash related to malicious macro'], details: 'Single application crash tied to the phishing incident. Macro execution has been blocked.' },
      { name: 'Windows Event Logs',   score: 55, status: 'Warning',  findings: ['Event 4688: Suspicious process creation', 'Event 7045: New service installed', 'PowerShell script block logging: encoded command'], details: 'Persistence mechanism artefacts found in event logs. Registry key removed.' },
      { name: 'Intune Sync Issues',   score: 75, status: 'Healthy',  findings: ['Last sync 31 minutes ago', 'All policies applied'], details: 'Kandji MDM sync is current.' },
      { name: 'Patch Status',         score: 60, status: 'Warning',  findings: ['macOS 13.6.5 — 1 minor update available', 'No critical CVEs unpatched'], details: 'A minor macOS update is available but not blocking compliance.' },
      { name: 'Disk and Storage',     score: 85, status: 'Healthy',  findings: ['121 of 256 GB used (47%)', 'No disk errors', 'FileVault enabled'], details: 'Disk is healthy with FileVault encryption active.' },
      { name: 'Network Connectivity', score: 90, status: 'Healthy',  findings: ['Connected to HR-DEPT-WIFI', 'All DNS resolving', 'Low latency'], details: 'Network connectivity is excellent.' },
      { name: 'Security / Defender',  score: 35, status: 'Critical', findings: ['XProtect definitions out of date', 'Suspicious binary quarantined', 'Gatekeeper bypassed by macro'], details: 'Security tool found and quarantined suspicious binary from phishing email.' },
      { name: 'Startup Performance',  score: 88, status: 'Healthy',  findings: ['Boot time: 18s', '4 login items — within normal range'], details: 'Startup performance is excellent.' },
    ],
  },
  'diag-005': {
    deviceId: 'diag-005',
    generatedAt: '2026-06-06 09:04:00',
    overallScore: 55,
    categories: [
      { name: 'System Health',        score: 72, status: 'Healthy',  findings: ['CPU at 45%', 'Memory 46% used'], details: 'System resources are healthy.' },
      { name: 'Application Failures', score: 60, status: 'Warning',  findings: ['Chrome crashed once (tab memory)', 'VPN client disconnect detected'], details: 'Minor application stability issues.' },
      { name: 'Windows Event Logs',   score: 65, status: 'Warning',  findings: ['Event 1001: Unexpected shutdown', 'Event 6013: Uptime reset after crash'], details: 'Evidence of previous unexpected shutdown. No current active issues.' },
      { name: 'Intune Sync Issues',   score: 50, status: 'Warning',  findings: ['Device reporting via Guest SSID', 'Some policies blocked by network', 'Last full sync: 9h ago'], details: 'Guest WiFi does not allow full MDM communication. Policy gap possible.' },
      { name: 'Patch Status',         score: 70, status: 'Warning',  findings: ['5 optional patches available', 'All critical patches applied'], details: 'No critical gaps, but optional patches are pending.' },
      { name: 'Disk and Storage',     score: 70, status: 'Warning',  findings: ['155 of 512 GB used (30%)', 'No errors', 'Recycle bin not emptied in 30 days'], details: 'Disk usage is fine. Minor housekeeping recommended.' },
      { name: 'Network Connectivity', score: 30, status: 'Critical', findings: ['Connected to CORP-GUEST (limited)', 'Cannot reach internal MDM endpoints', 'DNS partially resolving'], details: 'Device is on guest WiFi. Internal services are unreachable. MDM sync impaired.' },
      { name: 'Security / Defender',  score: 75, status: 'Healthy',  findings: ['Defender up to date', 'Real-time protection ON', 'Last scan: 2 days ago'], details: 'Security status is healthy.' },
      { name: 'Startup Performance',  score: 68, status: 'Warning',  findings: ['Boot time: 35s (target: <30s)', '8 startup programs'], details: 'Startup slightly above target. Some startup programs can be disabled.' },
    ],
  },
  'diag-006': {
    deviceId: 'diag-006',
    generatedAt: '2026-06-06 09:05:00',
    overallScore: 58,
    categories: [
      { name: 'System Health',        score: 55, status: 'Warning',  findings: ['CPU at 62% — elevated', 'Memory 69% used (22/32 GB)', 'Dev build processes consuming resources'], details: 'Development workloads are pushing resource usage above comfortable thresholds.' },
      { name: 'Application Failures', score: 70, status: 'Warning',  findings: ['Node.js OOM crash (build process)', '1 VS Code extension crash'], details: 'Out-of-memory crash during large build. Expected for dev workloads but worth monitoring.' },
      { name: 'Windows Event Logs',   score: 75, status: 'Healthy',  findings: ['No critical events', '2 warning events (disk IO spike during build)'], details: 'Event logs are clean. Build-related IO spikes are expected.' },
      { name: 'Intune Sync Issues',   score: 80, status: 'Healthy',  findings: ['Last sync 40 minutes ago', 'All policies applied'], details: 'MDM sync is current.' },
      { name: 'Patch Status',         score: 60, status: 'Warning',  findings: ['3 cumulative updates pending', 'No critical CVEs'], details: 'Pending cumulative updates should be installed during next maintenance window.' },
      { name: 'Disk and Storage',     score: 38, status: 'Critical', findings: ['380 of 1000 GB used (38%)', 'Docker images consuming 95 GB', 'Node_modules cache: 42 GB', 'Growth rate: 8 GB/day'], details: 'Developer disk usage is growing rapidly. At current rate, disk will fill in 78 days without cleanup.' },
      { name: 'Network Connectivity', score: 85, status: 'Healthy',  findings: ['Connected to DEV-WIFI-5G', 'GitHub reachable', 'Internal DNS resolving'], details: 'Network connectivity is good.' },
      { name: 'Security / Defender',  score: 70, status: 'Warning',  findings: ['Defender exclusions set for dev paths', 'Real-time protection ON', '2 PUA detections suppressed'], details: 'Dev tool exclusions are set in Defender. Some PUA detections for dev utilities were suppressed.' },
      { name: 'Startup Performance',  score: 45, status: 'Warning',  findings: ['Boot time: 52s (target: <30s)', 'Docker auto-start adding 18s', '14 startup items'], details: 'Developer startup apps (Docker, dev tools) are significantly impacting boot time.' },
    ],
  },
}

// ─── Application failures ─────────────────────────────────────────────────────

const APP_FAILURES: Record<string, ApplicationFailureReport[]> = {
  'diag-001': [
    {
      id: 'af-001-1',
      appName: 'Microsoft Outlook',
      crashTime: '2026-06-06 07:42:11',
      faultingModule: 'mso.dll',
      errorCode: '0xc0000005',
      eventId: '1000',
      affectedUser: 'james.wong',
      possibleReason: 'Memory access violation in mso.dll caused by corrupted Outlook profile or PST file. High system memory pressure (78%) may have contributed.',
      recommendedFix: 'Run Outlook /cleanprofile switch. If issue persists, recreate Outlook profile. Check PST file integrity with scanpst.exe.',
      severity: 'High',
    },
    {
      id: 'af-001-2',
      appName: 'Microsoft Teams',
      crashTime: '2026-06-06 08:15:33',
      faultingModule: 'Teams.exe',
      errorCode: '0x8007000e',
      eventId: '1000',
      affectedUser: 'james.wong',
      possibleReason: 'Out of memory error (0x8007000e = ERROR_OUTOFMEMORY). Teams memory leak combined with high system memory usage caused process termination.',
      recommendedFix: 'Restart Teams. Disable GPU hardware acceleration in Teams settings. If recurring, clear Teams cache at %appdata%\\Microsoft\\Teams.',
      severity: 'Medium',
    },
    {
      id: 'af-001-3',
      appName: 'Windows Update Service',
      crashTime: '2026-06-06 04:01:00',
      faultingModule: 'wuauserv',
      errorCode: '0x80070422',
      eventId: '7034',
      affectedUser: 'SYSTEM',
      possibleReason: 'Windows Update service terminated unexpectedly. Service dependency failure or corrupted update cache.',
      recommendedFix: 'Run Windows Update troubleshooter. Reset Windows Update components: net stop wuauserv && rd /s /q C:\\Windows\\SoftwareDistribution && net start wuauserv.',
      severity: 'Critical',
    },
  ],
  'diag-002': [],
  'diag-003': [
    {
      id: 'af-003-1',
      appName: 'encrypt_srv.exe (Ransomware)',
      crashTime: '2026-06-05 22:11:22',
      faultingModule: 'encrypt_srv.exe',
      errorCode: '0x00000000',
      eventId: '4688',
      affectedUser: 'david.kim',
      possibleReason: 'Malicious ransomware executable ran successfully. This is not a crash — it is a successful execution of a malware payload.',
      recommendedFix: 'Device is isolated. Restore from last clean backup (2026-06-04). Forensic analysis in progress. Do not re-image until forensics complete.',
      severity: 'Critical',
    },
    {
      id: 'af-003-2',
      appName: 'Windows Explorer',
      crashTime: '2026-06-05 22:13:00',
      faultingModule: 'ntdll.dll',
      errorCode: '0xc0000374',
      eventId: '1000',
      affectedUser: 'david.kim',
      possibleReason: 'Heap corruption detected in ntdll.dll. Caused by ransomware process interfering with system heap allocations.',
      recommendedFix: 'System requires full re-image. Heap corruption at OS level is unrecoverable without reinstallation.',
      severity: 'Critical',
    },
  ],
  'diag-004': [
    {
      id: 'af-004-1',
      appName: 'Microsoft Word',
      crashTime: '2026-06-06 07:28:45',
      faultingModule: 'VBE7.DLL',
      errorCode: '0xc0000409',
      eventId: '1000',
      affectedUser: 'emily.foster',
      possibleReason: 'Stack overflow in VBE7.DLL (VBA engine). Caused by malicious macro embedded in phishing email document.',
      recommendedFix: 'Malicious document has been quarantined. Disable VBA macros via Group Policy: Set Trust Center macro settings to "Disable all macros without notification". User training recommended.',
      severity: 'High',
    },
  ],
  'diag-005': [
    {
      id: 'af-005-1',
      appName: 'Google Chrome',
      crashTime: '2026-06-06 05:12:00',
      faultingModule: 'chrome.dll',
      errorCode: '0x8007000e',
      eventId: '1000',
      affectedUser: 'lisa.patel',
      possibleReason: 'Chrome tab process ran out of memory. Tab had large web app open (likely internal dashboard with many widgets).',
      recommendedFix: 'Enable Chrome memory saver feature. Add more RAM or close unused tabs. If recurring, check for memory-leaking browser extensions.',
      severity: 'Low',
    },
    {
      id: 'af-005-2',
      appName: 'Cisco AnyConnect VPN',
      crashTime: '2026-06-06 06:30:00',
      faultingModule: 'vpnagent.exe',
      errorCode: '0x00000001',
      eventId: '7031',
      affectedUser: 'lisa.patel',
      possibleReason: 'VPN agent crashed when connecting from guest WiFi. Guest network may be blocking VPN protocol (UDP 443/4500).',
      recommendedFix: 'Switch to corporate WiFi for VPN access. Contact network team to allow VPN protocols on guest SSID, or use split-tunnel configuration.',
      severity: 'Medium',
    },
  ],
  'diag-006': [
    {
      id: 'af-006-1',
      appName: 'Node.js (npm run build)',
      crashTime: '2026-06-06 08:05:11',
      faultingModule: 'node.exe',
      errorCode: '0x8007000e',
      eventId: '1000',
      affectedUser: 'ryan.obrien',
      possibleReason: 'Node.js build process exceeded available memory during bundling. Memory at 69% before process started, leaving insufficient headroom for large build.',
      recommendedFix: 'Set NODE_OPTIONS=--max-old-space-size=8192 to allow Node more heap. Alternatively close other applications before running build, or add --max-old-space-size flag to npm script.',
      severity: 'Medium',
    },
  ],
}

// ─── Event logs ───────────────────────────────────────────────────────────────

const EVENT_LOGS: Record<string, EventLogEntry[]> = {
  'diag-001': [
    { id: 'el-001-1', timestamp: '2026-06-06 09:14:22', source: 'Microsoft-Windows-Security-Auditing', eventId: '4625', level: 'Error',   category: 'Account Logon', description: 'An account failed to log on. Account: james.wong. Failure reason: Unknown user name or bad password. Source: 10.0.5.201 (12th attempt).' },
    { id: 'el-001-2', timestamp: '2026-06-06 07:42:11', source: 'Application Error',                   eventId: '1000', level: 'Error',   category: 'Application Failures', description: 'Faulting application: OUTLOOK.EXE. Faulting module: mso.dll. Exception code: 0xc0000005.' },
    { id: 'el-001-3', timestamp: '2026-06-06 04:01:00', source: 'Service Control Manager',             eventId: '7034', level: 'Error',   category: 'System', description: 'The Windows Update service terminated unexpectedly. It has done this 1 time(s).' },
    { id: 'el-001-4', timestamp: '2026-06-05 23:30:00', source: 'Microsoft-Windows-Kernel-Power',      eventId: '41',   level: 'Critical','category': 'System', description: 'The system has rebooted without cleanly shutting down first. Error code: 0x0.' },
    { id: 'el-001-5', timestamp: '2026-06-06 08:15:33', source: 'Application Error',                   eventId: '1000', level: 'Error',   category: 'Application Failures', description: 'Faulting application: Teams.exe. Exception code: 0x8007000e (Out of memory).' },
    { id: 'el-001-6', timestamp: '2026-06-06 06:00:00', source: 'Microsoft-Windows-WindowsUpdateClient', eventId: '20', level: 'Error',  category: 'Windows Update', description: 'Installation failure: Windows failed to install update KB5034441 with error 0x80070643.' },
    { id: 'el-001-7', timestamp: '2026-06-06 02:00:00', source: 'Microsoft-Windows-Defrag',            eventId: '258', level: 'Information', category: 'Disk', description: 'Optimization of volume C: completed. Action: Analysis only. Result: 0% fragmented.' },
    { id: 'el-001-8', timestamp: '2026-06-06 01:30:00', source: 'Microsoft-Windows-Security-Auditing', eventId: '4634', level: 'Information', category: 'Account Logon', description: 'An account was logged off. Subject: james.wong.' },
  ],
  'diag-002': [
    { id: 'el-002-1', timestamp: '2026-06-06 09:01:05', source: 'com.apple.mdmclient',    eventId: 'MDM-Sync', level: 'Information', category: 'MDM', description: 'MDM check-in completed successfully. All Kandji blueprints are current.' },
    { id: 'el-002-2', timestamp: '2026-06-06 08:00:00', source: 'com.apple.softwareupdate', eventId: 'SUUpdate', level: 'Information', category: 'Software Update', description: 'macOS is up to date. No updates required.' },
    { id: 'el-002-3', timestamp: '2026-06-06 07:00:00', source: 'com.apple.securityd',   eventId: 'Keychain', level: 'Information', category: 'Security', description: 'FileVault encryption status: ENABLED. Recovery key escrowed to Kandji.' },
  ],
  'diag-003': [
    { id: 'el-003-1', timestamp: '2026-06-05 22:15:44', source: 'CrowdStrike Falcon',    eventId: 'DET-0088', level: 'Critical', category: 'Security', description: 'CRITICAL DETECTION: Ransomware behavior detected. Process: encrypt_srv.exe. Action: Device isolation initiated.' },
    { id: 'el-003-2', timestamp: '2026-06-05 22:12:01', source: 'Microsoft-Windows-VSS', eventId: '8194',     level: 'Error',    category: 'System', description: 'Volume Shadow Copy Service error: vssadmin delete shadows /all executed. All restore points deleted.' },
    { id: 'el-003-3', timestamp: '2026-06-05 22:11:22', source: 'Microsoft-Windows-Security-Auditing', eventId: '4688', level: 'Warning', category: 'Process', description: 'A new process was created: encrypt_srv.exe. Subject: david.kim. Parent: cmd.exe.' },
    { id: 'el-003-4', timestamp: '2026-06-05 22:10:02', source: 'Microsoft-Windows-Security-Auditing', eventId: '4624', level: 'Warning', category: 'Account Logon', description: 'An account successfully logged on via RDP from 10.0.2.88. Account: david.kim. First login from this IP.' },
    { id: 'el-003-5', timestamp: '2026-06-05 22:09:00', source: 'Application Error',     eventId: '1000',     level: 'Error',    category: 'Application', description: 'Faulting application: winword.exe. Faulting module: VBE7.DLL. Macro execution triggered dropper.' },
  ],
  'diag-004': [
    { id: 'el-004-1', timestamp: '2026-06-06 07:31:18', source: 'Kandji Agent',       eventId: 'KANCheck', level: 'Information', category: 'MDM', description: 'Kandji check-in completed. Blueprint applied: HR-Standard-v3.' },
    { id: 'el-004-2', timestamp: '2026-06-06 07:28:45', source: 'Application Error', eventId: '1000',     level: 'Error',       category: 'Application', description: 'Faulting application: Microsoft Word. Faulting module: VBE7.DLL. Exception: Stack overflow caused by macro execution.' },
    { id: 'el-004-3', timestamp: '2026-06-06 07:45:00', source: 'Kandji Threat',     eventId: 'THREAT',   level: 'Warning',     category: 'Security', description: 'Threat detected and quarantined: svchost32.exe (PUA:Dropper). File quarantined to /Library/Application Support/Kandji/Quarantine.' },
    { id: 'el-004-4', timestamp: '2026-06-06 07:50:00', source: 'com.apple.XProtect', eventId: 'XPR',     level: 'Warning',     category: 'Security', description: 'XProtect definitions are 4 days out of date. Update pending.' },
  ],
  'diag-005': [
    { id: 'el-005-1', timestamp: '2026-06-06 05:12:00', source: 'Application Error',   eventId: '1000',    level: 'Error',       category: 'Application', description: 'Faulting application: chrome.exe. Exception: 0x8007000e. Tab process OOM.' },
    { id: 'el-005-2', timestamp: '2026-06-06 06:30:00', source: 'Service Control Manager', eventId: '7031', level: 'Error',      category: 'System', description: 'The Cisco AnyConnect VPN Agent service terminated unexpectedly.' },
    { id: 'el-005-3', timestamp: '2026-06-06 06:44:00', source: 'Microsoft-Windows-NetworkProfile', eventId: '10000', level: 'Information', category: 'Network', description: 'Network connected: CORP-GUEST (Public profile).' },
    { id: 'el-005-4', timestamp: '2026-06-06 04:30:00', source: 'Microsoft-Windows-WindowsUpdateClient', eventId: '19', level: 'Information', category: 'Windows Update', description: 'Installation successful: Windows applied update KB5034203.' },
  ],
  'diag-006': [
    { id: 'el-006-1', timestamp: '2026-06-06 08:05:11', source: 'Application Error',   eventId: '1000',    level: 'Error',    category: 'Application', description: 'Faulting application: node.exe. Exception code: 0x8007000e. OOM during webpack build.' },
    { id: 'el-006-2', timestamp: '2026-06-06 07:30:00', source: 'Service Control Manager', eventId: '7036', level: 'Information', category: 'System', description: 'The Docker Desktop Service entered the running state.' },
    { id: 'el-006-3', timestamp: '2026-06-06 05:00:00', source: 'Microsoft-Windows-Disk', eventId: '51',  level: 'Warning',  category: 'Disk', description: 'An error was detected on device \\Device\\Harddisk0\\DR0 during a paging operation. (IO spike during build).' },
    { id: 'el-006-4', timestamp: '2026-06-06 09:47:05', source: 'Microsoft Intune',    eventId: 'SYNC',    level: 'Information', category: 'MDM', description: 'Intune device check-in completed. 0 policies pending.' },
  ],
}

// ─── AI Recommendations ───────────────────────────────────────────────────────

const AI_RECOMMENDATIONS: Record<string, AIRecommendation> = {
  'diag-001': {
    summary: '3 critical issues detected on WIN-CORP-0042: Microsoft Defender real-time protection is disabled, 14 security patches are missing (including 3 critical CVEs), and multiple application crashes indicate system instability. Immediate action required.',
    rootCause: 'The root cause chain appears to be: (1) Missing OS patches left CVE-2023-36884 and similar vulnerabilities unaddressed. (2) A third-party tool disabled Defender real-time protection, possibly as a workaround for a false positive. (3) Combined with 14-day uptime and memory pressure, system instability resulted in application crashes. The failed login attempts (Event 4625) from IP 10.0.5.201 suggest an external actor may have already discovered the unpatched system.',
    steps: [
      'IMMEDIATE: Re-enable Microsoft Defender real-time protection via PowerShell: Set-MpPreference -DisableRealtimeMonitoring $false',
      'IMMEDIATE: Investigate 12 failed login attempts from 10.0.5.201 — block IP at firewall if unauthorized',
      'URGENT: Apply all 14 pending security patches — schedule emergency patch deployment via Intune',
      'Restart device to resolve 14-day uptime and apply pending patches',
      'Repair Microsoft Outlook profile: Close Outlook → run OUTLOOK.EXE /cleanprofile',
      'Reset Windows Update components to resolve service crash: Run Windows Update Troubleshooter',
      'Clear Teams cache to resolve memory leak: %appdata%\\Microsoft\\Teams → delete all contents',
      'Schedule weekly restarts via Intune policy to prevent extended uptime',
      'Review and remove third-party tools that disable security features',
    ],
    severity: 'Critical',
    helpdeskExplanation: 'This laptop is in a critical security state. The antivirus is turned off and important Windows security updates haven\'t been installed in months, which means the computer could be easily attacked. Someone has also been trying to break into the account (12 failed login attempts). The user james.wong is also seeing their Outlook and Teams crash frequently because the computer is under heavy load and running out of memory. Please escalate to the security team immediately and do not allow this device on the corporate network until Defender is re-enabled and patches are applied.',
    generatedAt: '2026-06-06 09:00:00',
  },
  'diag-002': {
    summary: 'MAC-ENG-0011 is in excellent health. All diagnostic categories pass. No immediate action required.',
    rootCause: 'No root cause analysis required. Device is fully patched, Defender/XProtect is current, Kandji sync is up to date, and all applications are stable.',
    steps: ['No action required', 'Continue standard monthly maintenance schedule', 'Monitor memory usage — at 9.1/32 GB it is well within limits'],
    severity: 'Low',
    helpdeskExplanation: 'This Mac is healthy and working well. Everything is up to date and running normally. No action needed from the helpdesk.',
    generatedAt: '2026-06-06 09:01:00',
  },
  'diag-003': {
    summary: 'WIN-FIN-0007 is CRITICALLY COMPROMISED by ransomware (LockBit 3.0). Device is network-isolated. 847 files encrypted. Full re-image from backup required. Active security incident INC-0042.',
    rootCause: 'Attack chain: Phishing email with malicious Word document → Macro executed VBA dropper → encrypt_srv.exe deployed → Defender disabled → VSS snapshots deleted → Mass file encryption. Initial access via RDP from unusual IP (10.0.2.88) using david.kim\'s credentials (possibly harvested earlier). Critical vulnerability CVE-2023-36884 (8 months unpatched) may have been exploited as alternative or primary vector.',
    steps: [
      'DO NOT re-enable network — device must remain isolated until forensics complete',
      'Preserve forensic image — CrowdStrike has already captured memory dump',
      'Restore data from last clean backup (2026-06-04) to a clean device',
      'Reset david.kim Active Directory password immediately',
      'Enable MFA for all RDP access company-wide',
      'Block IP 10.0.2.88 at perimeter firewall',
      'After forensics sign-off: full re-image from OEM media (not backup — backup may be infected)',
      'Verify all other devices in Finance segment are clean',
      'Apply missing patches (esp. CVE-2023-36884) across all Windows devices as emergency action',
    ],
    severity: 'Critical',
    helpdeskExplanation: 'CRITICAL INCIDENT — DO NOT ATTEMPT NORMAL HELPDESK RESOLUTION. This computer has been attacked by ransomware and is locked down by the security team. Files on the computer have been encrypted and cannot be opened. The security team is investigating. The user david.kim should NOT use this computer. A replacement device will need to be set up from backup once the security investigation is complete. Escalate to Security Team Lead and CISO immediately.',
    generatedAt: '2026-06-06 09:02:00',
  },
  'diag-004': {
    summary: 'MAC-HR-0033 shows elevated risk following a phishing attack. The malicious macro and dropper binary have been contained by Kandji. XProtect definitions are out of date. User awareness training is recommended.',
    rootCause: 'User emily.foster received a phishing email with a Word document containing a malicious VBA macro. The macro executed a dropper (svchost32.exe) which added a registry persistence key. Kandji threat detection identified and quarantined the binary before it could execute further payload. XProtect definitions being 4 days out of date may have allowed initial execution.',
    steps: [
      'Confirm Kandji quarantine was successful — verify no remaining traces of svchost32.exe',
      'Update XProtect definitions immediately: softwareupdate --install --all',
      'Enforce macro blocking policy via Kandji for all Office apps',
      'Review email security gateway — phishing email should have been blocked',
      'Schedule user security awareness training for emily.foster',
      'Monitor for 7 days for any signs of lateral movement or persistence re-establishment',
      'Review all outbound connections from this device over the past 48h',
    ],
    severity: 'High',
    helpdeskExplanation: 'This Mac was targeted by a phishing attack. The user emily.foster accidentally opened a malicious email attachment that tried to install malware. The security software (Kandji) caught and removed it. The computer appears to be safe now, but it needs some security updates and the user should receive training on how to spot phishing emails. A security engineer should verify the device is fully clean before marking it as resolved.',
    generatedAt: '2026-06-06 09:03:00',
  },
  'diag-005': {
    summary: 'WIN-CORP-0055 has 2 moderate issues: device is on guest WiFi causing MDM sync gaps, and a VPN client crash is preventing secure remote connectivity. No security threats detected.',
    rootCause: 'The device is connected to CORP-GUEST WiFi, which blocks MDM communication ports and VPN protocols. This has created a 9-hour MDM sync gap and caused the VPN agent to crash when it could not establish UDP connections (required for AnyConnect). The Chrome OOM crash was a one-time event related to a memory-heavy browser session and is not a recurring concern.',
    steps: [
      'Connect device to CORP-WIFI-5G or plug into wired network to restore MDM sync',
      'Once on corporate network, manually trigger Intune sync: Company Portal → Sync',
      'If VPN is required, use corporate WiFi as the base connection before connecting VPN',
      'Consider implementing split-tunnel VPN to allow VPN over guest WiFi for approved users',
      'Enable Chrome memory saver: Settings → Performance → Memory Saver',
      'Clean up Recycle Bin and run Disk Cleanup for housekeeping',
    ],
    severity: 'Medium',
    helpdeskExplanation: 'This laptop is connected to the guest WiFi instead of the main corporate WiFi, which is causing two problems: (1) Security updates and settings can\'t sync to the computer properly, and (2) The VPN app is crashing. The fix is straightforward — the user lisa.patel should connect to CORP-WIFI-5G instead of the guest network. Once connected, ask them to open the Company Portal app and click Sync. The Chrome crash was a one-time issue and doesn\'t need action.',
    generatedAt: '2026-06-06 09:04:00',
  },
  'diag-006': {
    summary: 'WIN-DEV-0019 has 2 notable issues: disk storage is growing rapidly due to developer artifacts (Docker, node_modules), and startup time is significantly above target. No security threats detected.',
    rootCause: 'Developer workloads are the primary cause of both issues. Docker images (95 GB) and node_modules cache (42 GB) are the main disk consumers. The build OOM crash is expected given 69% memory baseline — large webpack builds require up to 8 GB of additional heap. Docker Desktop auto-starting at boot adds 18 seconds to startup time.',
    steps: [
      'Run docker system prune -a to remove unused Docker images and containers (will free ~60 GB)',
      'Clear npm cache: npm cache clean --force (will free ~42 GB from node_modules cache)',
      'Set NODE_OPTIONS=--max-old-space-size=8192 in system environment variables for build memory',
      'Move Docker Desktop from startup to manual launch (Task Manager → Startup tab → Disable Docker Desktop)',
      'Consider upgrading RAM from 32 GB to 64 GB for sustained dev workload performance',
      'Set up disk quota alerts via Intune when drive exceeds 700 GB',
    ],
    severity: 'Medium',
    helpdeskExplanation: 'This developer laptop is running low on some key resources. The main problems are: (1) The hard drive is filling up with development files — mainly Docker software images and programming packages. The fix is to run some cleanup commands that will free up a lot of space. (2) The computer is slow to start up because several developer tools start automatically. These can be adjusted to start only when needed. There are no security concerns. This is normal developer workload management.',
    generatedAt: '2026-06-06 09:05:00',
  },
}

// ─── Accessor functions ───────────────────────────────────────────────────────

export function getAllDiagnosticDevices(): DiagnosticDevice[] {
  return MOCK_DIAGNOSTIC_DEVICES
}

export function getDiagnosticDevice(id: string): DiagnosticDevice | undefined {
  return MOCK_DIAGNOSTIC_DEVICES.find(d => d.id === id)
}

export function getDeviceHealthReport(deviceId: string): DeviceHealthReport | undefined {
  return HEALTH_REPORTS[deviceId]
}

export function getAppFailures(deviceId: string): ApplicationFailureReport[] {
  return APP_FAILURES[deviceId] ?? []
}

export function getEventLogs(deviceId: string): EventLogEntry[] {
  return EVENT_LOGS[deviceId] ?? []
}

export function getAIRecommendation(deviceId: string): AIRecommendation | undefined {
  return AI_RECOMMENDATIONS[deviceId]
}

// ─── Deterministic generators for connector-sourced devices ───────────────────

/** Simple seeded pseudo-random: always returns same float [0,1) for same seed+index */
function sr(seed: string, idx: number): number {
  let h = (idx + 1) * 0x9e3779b9
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x6b43a9b5) >>> 0
  return (h >>> 0) / 0x100000000
}

function parseGb(s?: string): number {
  if (!s) return 0
  const n = parseFloat(s)
  if (!n) return 0
  return /tb/i.test(s) ? Math.round(n * 1000) : Math.round(n)
}

/** Map a connector Device to the DiagnosticDevice shape with synthesised telemetry */
export function deviceToDiagnosticDevice(d: Device): DiagnosticDevice {
  const rng = (i: number) => sr(d.id, i)
  const plat: DiagnosticDevice['platform'] =
    d.platform === 'Windows' ? 'Windows' : d.platform === 'macOS' ? 'macOS' : 'Linux'

  const totalRam  = parseGb(d.totalMemory)  || (plat === 'macOS' ? 16 : 8)
  const totalDisk = parseGb(d.totalStorage) || 256
  const freeDisk  = parseGb(d.freeStorage)  || Math.round(totalDisk * (0.2 + rng(0) * 0.5))
  const usedDisk  = Math.max(1, totalDisk - freeDisk)

  const riskBase  = d.complianceState === 'Non-Compliant' ? 60
    : d.complianceState === 'Warning' ? 35 : 10
  const riskScore = Math.min(100, Math.round(riskBase + rng(1) * 30))

  const netOpts: DiagnosticDevice['network']['status'][] = ['Connected', 'Connected', 'Connected', 'Limited', 'Disconnected']
  const netStatus: DiagnosticDevice['network']['status'] = netOpts[Math.floor(rng(2) * 5)] ?? 'Connected'
  const ip = d.ipAddress || `10.${Math.floor(rng(3) * 3)}.${Math.floor(rng(4) * 254)}.${Math.floor(rng(5) * 253) + 1}`

  const cpuBase = riskScore > 60 ? 55 : riskScore > 30 ? 25 : 8
  const cpu     = Math.min(98, Math.round(cpuBase + rng(6) * 35))
  const memUsed = parseFloat((totalRam * (0.3 + rng(7) * 0.6)).toFixed(1))

  const battLevel  = Math.round(15 + rng(11) * 85)
  const battHealth: 'Good' | 'Fair' | 'Poor' = rng(13) > 0.8 ? 'Poor' : rng(13) > 0.5 ? 'Fair' : 'Good'

  return {
    id: d.id,
    deviceName: d.deviceName,
    user: d.user,
    platform: plat,
    osVersion: d.osVersion,
    managementSource: d.managementSource,
    uptime: `${Math.floor(rng(8) * 30)}d ${Math.floor(rng(9) * 24)}h`,
    cpu,
    memory: { usedGb: memUsed, totalGb: totalRam },
    disk: { usedGb: usedDisk, totalGb: totalDisk },
    ...(plat !== 'Linux' && {
      battery: { level: battLevel, charging: rng(12) > 0.6, health: battHealth },
    }),
    network: {
      status: netStatus,
      ...(netStatus !== 'Disconnected' && { ssid: 'CORP-WIFI-5G', ip }),
    },
    lastSync: d.lastCheckIn,
    complianceState: d.complianceState,
    riskScore,
  }
}

export function generateHealthReport(d: DiagnosticDevice): DeviceHealthReport {
  const rng = (i: number) => sr(d.id, i + 20)
  const diskPct  = d.disk.usedGb / d.disk.totalGb
  const memPct   = d.memory.usedGb / d.memory.totalGb
  const compliant = d.complianceState === 'Compliant'
  const warning   = d.complianceState === 'Warning'

  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)))
  const jitter = (base: number, range = 15, idx = 0) => clamp(base + (rng(idx) - 0.5) * range)

  const sysBase  = clamp(100 - d.cpu * 0.8 - memPct * 20)
  const diskBase = clamp(100 - diskPct * 120)
  const netBase  = d.network.status === 'Connected' ? 90 : d.network.status === 'Limited' ? 55 : 20
  const secBase  = compliant ? 88 : warning ? 60 : 35
  const patchBase = compliant ? 85 : warning ? 55 : 30
  const syncBase  = d.network.status === 'Disconnected' ? 40 : compliant ? 88 : warning ? 65 : 45
  const startBase = clamp(100 - d.cpu * 0.5 - memPct * 30)
  const appBase   = compliant ? 85 : warning ? 65 : 45
  const logBase   = clamp(100 - d.riskScore * 0.5)

  const categories: DiagnosticCategoryResult[] = [
    {
      name: 'System Health',
      score: jitter(sysBase, 12, 0),
      status: '' as DiagnosticCategoryResult['status'],
      findings: d.cpu > 80
        ? [`CPU sustained at ${d.cpu}% — above healthy threshold`, 'Memory pressure elevated']
        : d.cpu > 60
        ? [`CPU averaging ${d.cpu}% — moderate load`, 'System performance acceptable']
        : ['CPU and memory within normal operating range', 'No thermal or load anomalies detected'],
      details: `CPU: ${d.cpu}%  Memory: ${d.memory.usedGb}/${d.memory.totalGb} GB`,
    },
    {
      name: 'Application Failures',
      score: jitter(appBase, 10, 1),
      status: '' as DiagnosticCategoryResult['status'],
      findings: compliant
        ? ['No application crashes in the past 7 days', 'All monitored services running normally']
        : warning
        ? ['1-2 non-critical app crashes detected', 'Some services restarted unexpectedly']
        : ['Multiple application crashes recorded', 'Critical service restarts observed'],
      details: `Compliance: ${d.complianceState}`,
    },
    {
      name: 'Windows Event Logs',
      score: jitter(logBase, 12, 2),
      status: '' as DiagnosticCategoryResult['status'],
      findings: d.riskScore < 30
        ? ['Event log clean — no critical or error events', 'System and application logs healthy']
        : d.riskScore < 60
        ? ['Moderate warning events in system log', 'Some recurring errors in application log']
        : ['Multiple critical events in system log', 'Error flood detected in application log'],
      details: `Risk score: ${d.riskScore}/100`,
    },
    {
      name: 'Intune Sync Issues',
      score: jitter(syncBase, 10, 3),
      status: '' as DiagnosticCategoryResult['status'],
      findings: d.network.status === 'Disconnected'
        ? ['Device offline — MDM sync blocked', 'Last sync gap may affect policy compliance']
        : compliant
        ? ['MDM sync up to date', 'All policies applied successfully']
        : ['MDM sync delayed', 'One or more policies pending application'],
      details: `Last sync: ${d.lastSync}  Network: ${d.network.status}`,
    },
    {
      name: 'Patch Status',
      score: jitter(patchBase, 12, 4),
      status: '' as DiagnosticCategoryResult['status'],
      findings: compliant
        ? ['OS and application patches current', 'No critical CVEs outstanding']
        : warning
        ? ['2-5 pending OS patches', 'At least one medium-severity CVE unpatched']
        : ['Critical patches missing (30+ days)', 'High/Critical CVEs outstanding — immediate action required'],
      details: `Compliance: ${d.complianceState}`,
    },
    {
      name: 'Disk and Storage',
      score: jitter(diskBase, 10, 5),
      status: '' as DiagnosticCategoryResult['status'],
      findings: diskPct > 0.85
        ? [`Disk critically full: ${d.disk.usedGb}/${d.disk.totalGb} GB used`, 'Immediate cleanup required']
        : diskPct > 0.70
        ? [`Disk usage elevated: ${d.disk.usedGb}/${d.disk.totalGb} GB used`, 'Cleanup recommended within 7 days']
        : [`Disk healthy: ${d.disk.usedGb}/${d.disk.totalGb} GB used`, 'Adequate free space available'],
      details: `${d.disk.usedGb} GB used of ${d.disk.totalGb} GB (${Math.round(diskPct * 100)}%)`,
    },
    {
      name: 'Network Connectivity',
      score: jitter(netBase, 8, 6),
      status: '' as DiagnosticCategoryResult['status'],
      findings: d.network.status === 'Connected'
        ? ['Network connectivity stable', d.network.ssid ? `Connected to ${d.network.ssid}` : 'Wired connection active']
        : d.network.status === 'Limited'
        ? ['Limited connectivity — some services may be unreachable', 'MDM and VPN traffic may be blocked']
        : ['Device offline — no network connectivity', 'All cloud-dependent services unavailable'],
      details: `Status: ${d.network.status}${d.network.ssid ? `  SSID: ${d.network.ssid}` : ''}${d.network.ip ? `  IP: ${d.network.ip}` : ''}`,
    },
    {
      name: 'Security / Defender',
      score: jitter(secBase, 10, 7),
      status: '' as DiagnosticCategoryResult['status'],
      findings: compliant
        ? ['Endpoint protection active and up to date', 'No threats detected in last 30 days']
        : warning
        ? ['Endpoint protection definitions slightly outdated', 'Low-severity threat events logged']
        : ['Security policy violations detected', 'Endpoint protection requires immediate attention'],
      details: `Risk score: ${d.riskScore}/100  Compliance: ${d.complianceState}`,
    },
    {
      name: 'Startup Performance',
      score: jitter(startBase, 12, 8),
      status: '' as DiagnosticCategoryResult['status'],
      findings: d.cpu > 70 || memPct > 0.8
        ? ['Startup time above target — high baseline resource usage', 'Multiple heavy startup processes detected']
        : d.cpu > 45 || memPct > 0.6
        ? ['Startup time slightly elevated', 'Some non-essential startup items detected']
        : ['Startup time within acceptable range', 'No performance-impacting startup programs detected'],
      details: `CPU: ${d.cpu}%  Memory: ${Math.round(memPct * 100)}%`,
    },
  ]

  // Backfill status from score
  for (const c of categories) {
    c.status = c.score >= 75 ? 'Healthy' : c.score >= 50 ? 'Warning' : 'Critical'
  }

  const overallScore = Math.round(categories.reduce((s, c) => s + c.score, 0) / categories.length)

  return {
    deviceId: d.id,
    generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    overallScore,
    categories,
  }
}

export function generateAppFailures(d: DiagnosticDevice): ApplicationFailureReport[] {
  const rng = (i: number) => sr(d.id, i + 50)
  const count = d.complianceState === 'Compliant' ? Math.floor(rng(0) * 2)
    : d.complianceState === 'Warning' ? Math.floor(rng(0) * 3) + 1
    : Math.floor(rng(0) * 4) + 2

  const winApps  = ['Microsoft Teams', 'Microsoft Edge', 'Outlook', 'OneDrive', 'Adobe Acrobat', 'Zoom', 'Chrome', 'Slack']
  const macApps  = ['Safari', 'Microsoft Teams', 'Zoom', 'Finder', 'Mail', 'Slack', 'Chrome', 'Microsoft Word']
  const modules  = d.platform === 'macOS'
    ? ['libsystem_c.dylib', 'Foundation', 'AppKit', 'JavaScriptCore', 'libdispatch.dylib']
    : ['ntdll.dll', 'kernel32.dll', 'msvcrt.dll', 'clr.dll', 'user32.dll']
  const errCodes = d.platform === 'macOS'
    ? ['0x0000DEAD', 'SIGSEGV', 'SIGABRT', 'EXC_BAD_ACCESS', '0xDEAD10CC']
    : ['0xC0000005', '0xC000001D', '0x80070005', '0xC0000374', '0x80070057']
  const sevs: ApplicationFailureReport['severity'][] = ['Critical', 'High', 'Medium', 'Low']
  const apps = d.platform === 'macOS' ? macApps : winApps

  return Array.from({ length: count }, (_, i) => {
    const app: string = apps[Math.floor(rng(i * 5 + 1) * apps.length)] as string
    const sev: ApplicationFailureReport['severity'] = (sevs[Math.floor(rng(i * 5 + 2) * (d.riskScore > 60 ? 2 : sevs.length))] ?? 'Medium') as ApplicationFailureReport['severity']
    const mod: string = modules[Math.floor(rng(i * 5 + 3) * modules.length)] as string
    const err: string = errCodes[Math.floor(rng(i * 5 + 4) * errCodes.length)] as string
    const hoursAgo = Math.floor(rng(i * 5 + 5) * 72)
    const crashDate = new Date(Date.now() - hoursAgo * 3_600_000)
    const crashTime = crashDate.toISOString().replace('T', ' ').slice(0, 19)

    return {
      id: `${d.id}-failure-${i}`,
      appName: app,
      crashTime,
      faultingModule: mod,
      errorCode: err,
      eventId: `${1000 + Math.floor(rng(i * 5) * 8000)}`,
      affectedUser: d.user,
      severity: sev,
      possibleReason: sev === 'Critical' || sev === 'High'
        ? `${app} encountered a fatal exception in ${mod}. Memory corruption or a missing dependency is likely.`
        : `${app} terminated unexpectedly. A conflicting background process or memory pressure may be the cause.`,
      recommendedFix: sev === 'Critical'
        ? `Immediately reinstall ${app}. Run sfc /scannow (Windows) or Disk Utility Repair (macOS). Collect crash dump and escalate to application team.`
        : sev === 'High'
        ? `Reinstall ${app} with the latest version. Check for pending OS updates that may include a fix. Review application event log for additional context.`
        : `Restart ${app}. If the issue recurs, reinstall. Ensure OS is fully patched.`,
    }
  })
}

export function generateEventLogs(d: DiagnosticDevice): EventLogEntry[] {
  const rng  = (i: number) => sr(d.id, i + 80)
  const count = Math.floor(5 + rng(0) * 10)

  const levels: EventLogEntry['level'][] = d.complianceState === 'Non-Compliant'
    ? ['Critical', 'Error', 'Error', 'Warning', 'Warning', 'Information']
    : d.complianceState === 'Warning'
    ? ['Error', 'Warning', 'Warning', 'Information', 'Information']
    : ['Warning', 'Information', 'Information', 'Information', 'Information']

  const winSources = ['System', 'Application', 'Security', 'Microsoft-Windows-Kernel-Power', 'Microsoft-Windows-WindowsUpdateClient', 'Microsoft-Windows-Bits-Client', 'Service Control Manager', 'DCOM']
  const macSources = ['kernel', 'com.apple.security', 'WindowServer', 'loginwindow', 'mdmclient', 'softwareupdated', 'Finder']
  const sources    = d.platform === 'macOS' ? macSources : winSources

  const templates: Record<EventLogEntry['level'], string[]> = {
    Critical:    ['System experienced a critical failure and was restarted', 'Kernel panic detected — unrecoverable hardware fault', 'BitLocker encryption key retrieval failed'],
    Error:       ['Service terminated unexpectedly and did not restart', 'Application pool crash — process exited with code 1', 'Failed to apply group policy — network path unavailable', 'MDM enrollment certificate renewal failed'],
    Warning:     ['Disk free space below 15% threshold', 'NTP time sync drifted by more than 5 seconds', 'VPN client unable to reach server — retrying', 'User account lock threshold approaching'],
    Information: ['Device successfully enrolled with MDM', 'Windows Update completed successfully', 'Antivirus definitions updated to latest version', 'System backup completed', 'User logged in successfully'],
  }

  return Array.from({ length: count }, (_, i) => {
    const level: EventLogEntry['level']   = (levels[Math.floor(rng(i * 4 + 1) * levels.length)] ?? 'Information') as EventLogEntry['level']
    const source: string                  = sources[Math.floor(rng(i * 4 + 2) * sources.length)] as string
    const msgs    = templates[level]
    const desc: string                    = msgs[Math.floor(rng(i * 4 + 3) * msgs.length)] as string
    const hoursAgo = Math.floor(rng(i * 4 + 4) * 168)
    const ts      = new Date(Date.now() - hoursAgo * 3_600_000)
    return {
      id: `${d.id}-log-${i}`,
      timestamp: ts.toISOString().replace('T', ' ').slice(0, 19),
      source,
      eventId: `${Math.floor(rng(i * 4) * 9000) + 1000}`,
      level,
      category: level === 'Critical' || level === 'Error' ? 'Failure' : level === 'Warning' ? 'Performance' : 'Operational',
      description: desc,
    }
  }).sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

export function generateAIRecommendation(d: DiagnosticDevice): AIRecommendation {
  const sev: AIRecommendation['severity'] = d.riskScore >= 80 ? 'Critical'
    : d.riskScore >= 55 ? 'High'
    : d.riskScore >= 30 ? 'Medium' : 'Low'

  const diskPct = Math.round((d.disk.usedGb / d.disk.totalGb) * 100)
  const memPct  = Math.round((d.memory.usedGb / d.memory.totalGb) * 100)

  const topIssues: string[] = []
  if (d.complianceState === 'Non-Compliant') topIssues.push('compliance violations detected by MDM policy')
  if (d.cpu > 80) topIssues.push(`CPU running at ${d.cpu}% — above healthy threshold`)
  if (memPct > 80) topIssues.push(`memory usage at ${memPct}% — risk of out-of-memory crashes`)
  if (diskPct > 80) topIssues.push(`disk at ${diskPct}% capacity — performance and logging may be affected`)
  if (d.network.status !== 'Connected') topIssues.push(`network status: ${d.network.status} — MDM sync and cloud services impacted`)
  if (topIssues.length === 0) topIssues.push('no critical issues — minor optimisation opportunities identified')

  const steps: string[] = []
  if (d.complianceState !== 'Compliant') {
    steps.push(`Open ${d.managementSource} portal and review outstanding policy violations for ${d.deviceName}`)
    steps.push('Force a manual MDM sync: Company Portal → Sync (Windows) or System Preferences → Profiles (macOS)')
  }
  if (d.cpu > 70) steps.push('Identify high-CPU processes via Task Manager / Activity Monitor and terminate non-essential ones')
  if (memPct > 70) steps.push('Close unused applications. Consider upgrading RAM if usage consistently exceeds 80%')
  if (diskPct > 75) steps.push('Run Disk Cleanup (Windows) or Storage Management (macOS). Archive or delete large files in Downloads and temp folders')
  if (d.network.status !== 'Connected') steps.push('Connect device to corporate WiFi (CORP-WIFI-5G) or plug in via Ethernet to restore MDM sync')
  if (steps.length < 3) {
    steps.push('Review and apply any pending OS and application updates')
    steps.push('Run a full antivirus/endpoint protection scan')
  }
  steps.push(`Document any changes made and update the ${d.user} device record in ${d.managementSource}`)

  return {
    summary: `${d.deviceName} (${d.user}) has a risk score of ${d.riskScore}/100 with ${topIssues.length} issue(s): ${topIssues.slice(0, 2).join('; ')}.`,
    rootCause: `Primary driver of the ${sev.toLowerCase()} risk score: ${topIssues[0]}. The device is managed via ${d.managementSource} and currently shows ${d.complianceState} compliance. ${d.network.status !== 'Connected' ? 'Network issues are preventing timely policy enforcement and patch deployment.' : 'Network connectivity is available, allowing remote remediation.'}`,
    steps,
    severity: sev,
    helpdeskExplanation: sev === 'Critical'
      ? `URGENT: ${d.deviceName} used by ${d.user} needs immediate attention. Risk score is ${d.riskScore}/100. Please escalate to an IT engineer — do not attempt standard helpdesk resolution.`
      : sev === 'High'
      ? `${d.deviceName} (${d.user}) has significant issues that need resolution within 24 hours. The main problem is: ${topIssues[0]}. Follow the remediation steps and verify completion.`
      : `${d.deviceName} (${d.user}) has some issues to address at the next opportunity. Risk level is moderate. Main concern: ${topIssues[0]}. No emergency action required.`,
    generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
  }
}
