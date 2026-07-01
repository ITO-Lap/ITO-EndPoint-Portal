/**
 * Enterprise Runbooks Engine
 *
 * Features: step-by-step execution simulation, SSE live log streaming,
 * approval workflow, safe-mode, dry-run, clone, import/export,
 * version history, evidence packages.
 */
import { Router } from 'express'
import { randomBytes } from 'crypto'

const router = Router()

// ─── Types ────────────────────────────────────────────────────────────────────

interface RunbookStep {
  id: string; name: string; description: string
  estimatedMs: number; safeMode: boolean; dryRunSafe: boolean
  logTemplates: string[]
}

interface EnterpriseRunbook {
  id: string; name: string; description: string
  category: string; platform: string; severity: string
  version: string; author: string; approvalRequired: boolean
  safeModeSupported: boolean; estimatedMinutes: number
  tags: string[]; steps: RunbookStep[]
  prerequisites: string[]; expectedResult: string
  rollbackSteps: string[]; isTemplate: boolean; usageCount: number
  createdAt: string; updatedAt: string
  versions: Array<{ version: string; author: string; date: string; notes: string }>
}

type ExecMode   = 'normal' | 'safe' | 'dry-run'
type ExecStatus = 'pending' | 'waiting_approval' | 'running' | 'completed' | 'failed' | 'cancelled'
type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'retrying'
type LogLevel   = 'info' | 'success' | 'warning' | 'error' | 'debug'

interface ExecStep {
  id: string; name: string; description: string
  status: StepStatus; startedAt?: string; completedAt?: string
  output?: string; error?: string; retryCount: number; durationMs?: number
}

interface ExecLog {
  id: string; timestamp: string; level: LogLevel
  message: string; stepId?: string; stepName?: string
}

interface HealthSnapshot {
  cpu: number; memory: number; disk: number
  compliance: string; encryptionEnabled: boolean
  issues: string[]; capturedAt: string
}

interface Execution {
  id: string; runbookId: string; runbookName: string
  runbookVersion: string; deviceId: string; deviceName: string
  devicePlatform: string; mode: ExecMode; status: ExecStatus
  progress: number; steps: ExecStep[]; logs: ExecLog[]
  startedAt: string; completedAt?: string; durationMs?: number
  initiatedBy: string; approvedBy?: string; cancelledBy?: string
  beforeHealth?: HealthSnapshot; afterHealth?: HealthSnapshot
  aiRootCause?: string; aiResolution?: string; error?: string
}

// ─── Enterprise Runbook Catalogue ─────────────────────────────────────────────

const RUNBOOK_STORE: EnterpriseRunbook[] = [
  {
    id: 'rb-bitlocker-enforce',
    name: 'BitLocker Encryption Enforcement',
    description: 'Enables BitLocker full-disk encryption on Windows endpoints, generates recovery keys, and escrows them to Azure AD / Intune.',
    category: 'Encryption', platform: 'Windows', severity: 'Critical',
    version: '2.4.1', author: 'ITO Security', approvalRequired: false,
    safeModeSupported: true, estimatedMinutes: 8, usageCount: 142,
    tags: ['encryption', 'bitlocker', 'compliance', 'critical'],
    prerequisites: ['Windows 10/11 Pro or higher', 'TPM 2.0 present', 'Azure AD or Intune enrolled', 'Admin rights'],
    expectedResult: 'Drive C: encrypted with BitLocker; recovery key escrowed to Azure AD.',
    rollbackSteps: ['Suspend BitLocker: manage-bde -Protectors -Disable C:', 'Remove key: manage-bde -Protectors -Delete C:'],
    isTemplate: false, createdAt: '2025-09-01T10:00:00Z', updatedAt: '2026-05-15T08:30:00Z',
    versions: [
      { version: '2.4.1', author: 'ITO Security', date: '2026-05-15', notes: 'Add silent escrow for shared devices' },
      { version: '2.4.0', author: 'ITO Security', date: '2026-03-01', notes: 'Support for Windows 11 24H2 TPM changes' },
      { version: '2.3.0', author: 'A. Verma',     date: '2025-12-10', notes: 'Add rollback steps' },
    ],
    steps: [
      { id: 'bk-1', name: 'Verify TPM 2.0 Status', description: 'Check TPM availability and state', estimatedMs: 1200, safeMode: true, dryRunSafe: true,
        logTemplates: ['Querying TPM via WMI…', 'TPM Manufacturer: Intel PTT', 'TPM Version: 2.0', 'TPM Status: Ready', 'Spec Version: 2.0'] },
      { id: 'bk-2', name: 'Audit Current Encryption', description: 'Capture pre-remediation state', estimatedMs: 800, safeMode: true, dryRunSafe: true,
        logTemplates: ['Running: manage-bde -status C:', 'Volume C: BitLocker status: Off', 'Protection Status: Protection Off', 'Conversion Status: Fully Decrypted', 'Baseline snapshot captured'] },
      { id: 'bk-3', name: 'Generate Recovery Key', description: 'Create BitLocker recovery key material', estimatedMs: 1400, safeMode: true, dryRunSafe: true,
        logTemplates: ['Generating 256-bit recovery key…', 'Recovery key ID: {FB2A1C3D-…}', 'Key material secured in memory', 'Preparing Azure AD key upload package', 'Key package validated'] },
      { id: 'bk-4', name: 'Enable BitLocker (C:)', description: 'Initiate full disk encryption on system volume', estimatedMs: 2200, safeMode: false, dryRunSafe: false,
        logTemplates: ['Running: Enable-BitLocker -MountPoint "C:" -TpmProtector', 'Requesting encryption: XTS-AES 256-bit', 'Encryption initiated — background conversion started', 'BitLocker status: Encryption In Progress (0.3%)', 'Protection status: Protection On', 'Service registered with Task Scheduler'] },
      { id: 'bk-5', name: 'Escrow Key to Azure AD', description: 'Upload recovery key to Azure AD / Intune key store', estimatedMs: 1800, safeMode: true, dryRunSafe: true,
        logTemplates: ['Authenticating to Azure AD…', 'POST https://graph.microsoft.com/v1.0/informationProtection/bitlocker/recoveryKeys', 'HTTP 201 Created', 'Recovery key ID confirmed in tenant', 'Escrow verified with GET request', 'Key stored successfully'] },
      { id: 'bk-6', name: 'Validate & Report', description: 'Confirm encryption active and update compliance record', estimatedMs: 1000, safeMode: true, dryRunSafe: true,
        logTemplates: ['Running post-check: manage-bde -status C:', 'Encryption: Protection On', 'Algorithm: XTS-AES 256', 'Key Protectors: [TPM, RecoveryPassword]', 'Compliance record updated in Intune', 'Notification sent to dashboard'] },
    ],
  },
  {
    id: 'rb-filevault-enable',
    name: 'FileVault Enable & Key Escrow',
    description: 'Enables FileVault 2 encryption on macOS endpoints and escrows the personal recovery key to Kandji / MDM.',
    category: 'Encryption', platform: 'macOS', severity: 'Critical',
    version: '1.8.2', author: 'ITO Security', approvalRequired: false,
    safeModeSupported: true, estimatedMinutes: 6, usageCount: 89,
    tags: ['encryption', 'filevault', 'macos', 'compliance'],
    prerequisites: ['macOS 12 Monterey or higher', 'APFS formatted volume', 'MDM enrolled (Kandji)', 'Admin user logged in'],
    expectedResult: 'System volume encrypted with FileVault 2; recovery key escrowed to MDM.',
    rollbackSteps: ['Disable FileVault: fdesetup disable', 'Remove escrow profile from MDM'],
    isTemplate: false, createdAt: '2025-10-01T10:00:00Z', updatedAt: '2026-04-20T09:00:00Z',
    versions: [
      { version: '1.8.2', author: 'ITO Security', date: '2026-04-20', notes: 'Handle M3/M4 Secure Enclave differences' },
      { version: '1.8.0', author: 'ITO Security', date: '2026-01-15', notes: 'Add silent user FDE trigger' },
    ],
    steps: [
      { id: 'fv-1', name: 'Check APFS Volume', description: 'Verify APFS container readiness', estimatedMs: 900, safeMode: true, dryRunSafe: true,
        logTemplates: ['diskutil list /dev/disk0', 'Container disk0s1: APFS', 'Synthesized disk — Apple Silicon', 'Volume role: System/Data pair', 'APFS container healthy'] },
      { id: 'fv-2', name: 'Audit FileVault Status', description: 'Check pre-remediation encryption state', estimatedMs: 700, safeMode: true, dryRunSafe: true,
        logTemplates: ['fdesetup status', 'FileVault is Off.', 'No encrypted volumes detected', 'No recovery key in escrow', 'Baseline snapshot captured'] },
      { id: 'fv-3', name: 'Enable FileVault', description: 'Trigger MDM-deferred FileVault activation', estimatedMs: 1800, safeMode: false, dryRunSafe: false,
        logTemplates: ['Sending MDM command: EnableFileVault', 'MDM acknowledged: 200 OK', 'FileVault activation deferred to next login', 'User notification triggered', 'Watching for activation confirmation…', 'FileVault status: Encrypting (initializing)'] },
      { id: 'fv-4', name: 'Generate & Escrow Key', description: 'Create PRK and escrow to Kandji', estimatedMs: 1600, safeMode: true, dryRunSafe: true,
        logTemplates: ['Generating Personal Recovery Key (PRK)…', 'PRK format: xxxx-xxxx-xxxx-xxxx-xxxx-xxxx', 'POST /api/v1/self-service/file-vault-recovery-keys', 'Kandji response: 201 Created', 'Escrow ID: {A1B2C3D4}', 'Key rotation schedule registered'] },
      { id: 'fv-5', name: 'Validate Encryption', description: 'Confirm FileVault active and compliant', estimatedMs: 1000, safeMode: true, dryRunSafe: true,
        logTemplates: ['fdesetup status', 'FileVault is On.', 'Recovery key escrowed: Yes (MDM)', 'Compliance policy re-evaluated: Pass', 'Dashboard record updated', 'Runbook complete'] },
    ],
  },
  {
    id: 'rb-intune-reenroll',
    name: 'Intune MDM Re-enrollment',
    description: 'Removes stale Intune enrollment, clears MDM certificates, and triggers a fresh re-enrollment to fix compliance drift or sync failures.',
    category: 'MDM', platform: 'Windows', severity: 'High',
    version: '3.1.0', author: 'ITO Operations', approvalRequired: true,
    safeModeSupported: true, estimatedMinutes: 12, usageCount: 67,
    tags: ['intune', 'mdm', 'enrollment', 'compliance'],
    prerequisites: ['Device Azure AD joined', 'AAD sync working', 'Network connectivity to Intune endpoints'],
    expectedResult: 'Device freshly enrolled in Intune with policies synchronized.',
    rollbackSteps: ['Manually enroll via Company Portal', 'Contact ITO if enrollment fails'],
    isTemplate: false, createdAt: '2025-11-01T10:00:00Z', updatedAt: '2026-05-01T10:00:00Z',
    versions: [
      { version: '3.1.0', author: 'ITO Operations', date: '2026-05-01', notes: 'Handle hybrid AAD join edge case' },
      { version: '3.0.0', author: 'ITO Operations', date: '2026-01-20', notes: 'Add cert cleanup before re-enroll' },
    ],
    steps: [
      { id: 'ir-1', name: 'Backup Device Identity', description: 'Snapshot AAD object and enrollment state', estimatedMs: 1100, safeMode: true, dryRunSafe: true,
        logTemplates: ['Querying AAD device object…', 'Device ID: {aad-object-id}', 'Enrollment type: AzureAD', 'Last sync: 4h 12m ago', 'Backup created: identity_backup_{date}.json'] },
      { id: 'ir-2', name: 'Remove MDM Enrollment', description: 'Unenroll from Intune gracefully', estimatedMs: 1800, safeMode: false, dryRunSafe: false,
        logTemplates: ['Locating MDM enrollment URLs…', 'Found: DeviceManagementService', 'Running: dsregcmd /leave', 'MDM enrollment removed', 'Clearing scheduled tasks…', 'Intune Management Extension removed'] },
      { id: 'ir-3', name: 'Clear MDM Certificates', description: 'Remove stale MDM cert chain', estimatedMs: 1200, safeMode: false, dryRunSafe: false,
        logTemplates: ['Scanning cert store: My\\LocalMachine', 'Found 2 Intune MDM certs (expired)', 'Removing: Microsoft Intune MDM Device CA', 'Removing: Intune Device Identity', 'Cert store cleaned', 'CRL cache flushed'] },
      { id: 'ir-4', name: 'Trigger Fresh Enrollment', description: 'Initiate MDM re-enrollment via dsregcmd', estimatedMs: 2400, safeMode: false, dryRunSafe: false,
        logTemplates: ['Running: dsregcmd /join', 'Azure AD join: Success', 'MDM enrollment URL: enrollment.manage.microsoft.com', 'Enrollment request submitted', 'Awaiting enrollment confirmation…', 'Enrollment confirmed: Device ID updated'] },
      { id: 'ir-5', name: 'Sync Intune Policies', description: 'Force immediate policy synchronization', estimatedMs: 2000, safeMode: true, dryRunSafe: true,
        logTemplates: ['Triggering Intune sync via Company Portal', 'Sync request sent', 'Configuration policies: 14 applied', 'Compliance policies: 3 evaluated', 'Status: Compliant', 'Next scheduled sync: in 8 hours'] },
      { id: 'ir-6', name: 'Verify Enrollment Status', description: 'Confirm successful enrollment', estimatedMs: 900, safeMode: true, dryRunSafe: true,
        logTemplates: ['dsregcmd /status', 'AzureAdJoined: YES', 'MdmEnrollmentStatus: Enrolled', 'ComplianceStatus: Compliant', 'Record updated in Intune portal', 'Notification sent to admin'] },
    ],
  },
  {
    id: 'rb-windows-update',
    name: 'Windows Update Force & Compliance',
    description: 'Forces pending Windows updates, patches known CVEs, and verifies update ring compliance via Windows Update for Business.',
    category: 'Patching', platform: 'Windows', severity: 'High',
    version: '2.0.3', author: 'ITO Patching', approvalRequired: false,
    safeModeSupported: false, estimatedMinutes: 15, usageCount: 213,
    tags: ['windows', 'update', 'patching', 'cve'],
    prerequisites: ['Windows Update service running', 'Network connectivity to WSUS/WUfB', 'Admin rights'],
    expectedResult: 'All pending updates installed; device on latest approved update ring.',
    rollbackSteps: ['wuinstall /rollback (if critical failure)'],
    isTemplate: false, createdAt: '2025-08-15T10:00:00Z', updatedAt: '2026-06-01T08:00:00Z',
    versions: [
      { version: '2.0.3', author: 'ITO Patching', date: '2026-06-01', notes: 'Add WUfB compliance ring check' },
      { version: '2.0.0', author: 'ITO Patching', date: '2026-02-01', notes: 'Rewrite for WinGet integration' },
    ],
    steps: [
      { id: 'wu-1', name: 'Check Update Service', description: 'Verify Windows Update service state', estimatedMs: 800, safeMode: true, dryRunSafe: true,
        logTemplates: ['Get-Service wuauserv', 'Status: Running', 'StartType: Automatic', 'Windows Update enabled', 'WUfB ring: Semi-Annual Channel'] },
      { id: 'wu-2', name: 'Scan for Updates', description: 'Query WSUS / Windows Update servers', estimatedMs: 2200, safeMode: true, dryRunSafe: true,
        logTemplates: ['Initiating update scan…', 'Contacting update.microsoft.com', 'Scan complete — 7 updates found', 'Critical: KB5025221 (CVE-2024-21412)', 'Important: KB5023696, KB5022282', 'Optional: 4 driver updates'] },
      { id: 'wu-3', name: 'Install Critical Patches', description: 'Install security-critical updates first', estimatedMs: 2500, safeMode: true, dryRunSafe: false,
        logTemplates: ['Installing KB5025221 (security)…', 'Download: 487 MB — Complete', 'Applying patch…', 'KB5025221 installed successfully', 'Installing KB5023696…', 'KB5023696 installed successfully'] },
      { id: 'wu-4', name: 'Install Important Updates', description: 'Apply remaining important updates', estimatedMs: 2000, safeMode: true, dryRunSafe: false,
        logTemplates: ['Installing KB5022282…', 'KB5022282 installed', 'Installing KB5020435…', 'KB5020435 installed', 'All important updates applied', 'Pending restart: Yes (deferred 4h)'] },
      { id: 'wu-5', name: 'Validate Patch Compliance', description: 'Confirm device meets patch policy', estimatedMs: 1000, safeMode: true, dryRunSafe: true,
        logTemplates: ['Re-scanning for outstanding updates…', 'Outstanding critical: 0', 'Outstanding security: 0', 'WUfB compliance: Pass', 'Compliance record updated', 'Patch report generated'] },
    ],
  },
  {
    id: 'rb-defender-repair',
    name: 'Microsoft Defender ATP Repair',
    description: 'Repairs a broken Defender for Endpoint sensor, re-onboards the device to MDE tenant, and validates cloud connectivity.',
    category: 'Security / AV', platform: 'Windows', severity: 'Critical',
    version: '1.5.2', author: 'ITO Security', approvalRequired: true,
    safeModeSupported: true, estimatedMinutes: 10, usageCount: 38,
    tags: ['defender', 'edr', 'security', 'mde', 'critical'],
    prerequisites: ['Windows 10/11', 'MDE license assigned', 'Network access to *.securitycenter.windows.com'],
    expectedResult: 'Defender sensor active, device visible in MDE portal, health status green.',
    rollbackSteps: ['Offboard device via MDE portal', 'Reinstall Defender manually'],
    isTemplate: false, createdAt: '2025-12-01T10:00:00Z', updatedAt: '2026-05-20T11:00:00Z',
    versions: [
      { version: '1.5.2', author: 'ITO Security', date: '2026-05-20', notes: 'Handle MDE unified agent migration' },
      { version: '1.5.0', author: 'ITO Security', date: '2026-02-15', notes: 'Add cloud connectivity test step' },
    ],
    steps: [
      { id: 'md-1', name: 'Audit Defender State', description: 'Check current MDE sensor health', estimatedMs: 1000, safeMode: true, dryRunSafe: true,
        logTemplates: ['Get-MpComputerStatus', 'AntivirusEnabled: True', 'RealTimeProtectionEnabled: False', 'AMRunningMode: Normal', 'OnboardingState: NotOnboarded', 'Sensor health: UNHEALTHY'] },
      { id: 'md-2', name: 'Stop Defender Services', description: 'Cleanly stop MDE service stack', estimatedMs: 1200, safeMode: false, dryRunSafe: false,
        logTemplates: ['Stop-Service -Name sense -Force', 'WinDefend: Stopped', 'WdNisSvc: Stopped', 'Sense: Stopped', 'Services stopped cleanly', 'Waiting for process termination…'] },
      { id: 'md-3', name: 'Clear Sensor Data', description: 'Remove stale sensor state and cache', estimatedMs: 1400, safeMode: false, dryRunSafe: false,
        logTemplates: ['Remove-Item $env:ProgramData\\Microsoft\\Windows Defender Advanced Threat Protection\\', 'Clearing senseIR cache…', 'Removing CybersecurityPlatform reg keys…', 'Cache cleared', 'Registry cleaned', 'Temp files removed'] },
      { id: 'md-4', name: 'Re-onboard to MDE Tenant', description: 'Apply onboarding script from MDE portal', estimatedMs: 2000, safeMode: false, dryRunSafe: false,
        logTemplates: ['Applying onboarding script: WindowsDefenderATP.onboarding', 'Configuring OrgId: {mde-org-id}', 'Configuring workspace…', 'MDE onboarding complete', 'Device ID registered', 'Awaiting cloud telemetry confirmation…'] },
      { id: 'md-5', name: 'Start & Validate Sensor', description: 'Start Defender services and confirm health', estimatedMs: 1800, safeMode: true, dryRunSafe: true,
        logTemplates: ['Start-Service -Name sense', 'Sense: Running', 'WinDefend: Running', 'RealTimeProtection: Enabled', 'Cloud connectivity: PASS', 'Sensor health: HEALTHY — device visible in MDE portal'] },
    ],
  },
  {
    id: 'rb-crowdstrike-repair',
    name: 'CrowdStrike Falcon Sensor Repair',
    description: 'Diagnoses a degraded Falcon sensor, uninstalls the broken agent, and reinstalls with current deployment token.',
    category: 'Security / AV', platform: 'cross-platform', severity: 'High',
    version: '1.2.0', author: 'ITO Security', approvalRequired: true,
    safeModeSupported: false, estimatedMinutes: 12, usageCount: 24,
    tags: ['crowdstrike', 'falcon', 'edr', 'security'],
    prerequisites: ['CrowdStrike Falcon subscription', 'Deployment token available', 'Admin rights', 'Network to cloud.crowdstrike.com'],
    expectedResult: 'Falcon sensor healthy and reporting to CrowdStrike cloud.',
    rollbackSteps: ['Manually install Falcon from deployment package'],
    isTemplate: false, createdAt: '2026-01-10T10:00:00Z', updatedAt: '2026-04-05T09:00:00Z',
    versions: [
      { version: '1.2.0', author: 'ITO Security', date: '2026-04-05', notes: 'Add macOS support via mdmclient' },
    ],
    steps: [
      { id: 'cs-1', name: 'Check Falcon Status', description: 'Query sensor health via CLI', estimatedMs: 900, safeMode: true, dryRunSafe: true,
        logTemplates: ['falconctl -g --rfm-state', 'RFM state: false (reduced functionality)', 'falconctl -g --aid', 'AID: {falcon-aid}', 'Connectivity: DEGRADED'] },
      { id: 'cs-2', name: 'Collect Diagnostic Data', description: 'Capture sensor logs before repair', estimatedMs: 1200, safeMode: true, dryRunSafe: true,
        logTemplates: ['Collecting Falcon diagnostic…', 'Export: /tmp/falcon_diag_{date}.zip', 'Log size: 14 MB', 'Diag package created', 'Uploading to evidence store'] },
      { id: 'cs-3', name: 'Uninstall Broken Sensor', description: 'Remove existing Falcon installation', estimatedMs: 1800, safeMode: false, dryRunSafe: false,
        logTemplates: ['Stopping CSFalconService…', 'Uninstalling Falcon sensor…', 'Registry cleanup…', 'Driver removal: CrowdStrike.sys removed', 'Reboot required: deferred', 'Uninstall complete'] },
      { id: 'cs-4', name: 'Install Current Sensor', description: 'Deploy latest sensor build with token', estimatedMs: 2200, safeMode: false, dryRunSafe: false,
        logTemplates: ['Downloading FalconSensor 7.15…', 'Checksum verified: SHA-256 match', 'Installing with token: {masked}', 'Installation complete', 'CSFalconService: Running', 'AID assigned: {new-aid}'] },
      { id: 'cs-5', name: 'Validate Cloud Reporting', description: 'Confirm sensor reports to CrowdStrike', estimatedMs: 1500, safeMode: true, dryRunSafe: true,
        logTemplates: ['Checking cloud connectivity…', 'ts01-b.cloudsink.net: REACHABLE', 'Sensor heartbeat received', 'RFM state: false', 'Host visible in Falcon console', 'Remediation complete'] },
    ],
  },
  {
    id: 'rb-conditional-access',
    name: 'Conditional Access Recovery',
    description: 'Diagnoses and resolves Conditional Access policy blocks. Re-registers the device in Azure AD and verifies access token issuance.',
    category: 'Identity', platform: 'Windows', severity: 'High',
    version: '1.1.0', author: 'ITO Identity', approvalRequired: false,
    safeModeSupported: true, estimatedMinutes: 7, usageCount: 56,
    tags: ['conditional-access', 'aad', 'identity', 'mfa'],
    prerequisites: ['Azure AD Premium P1+', 'Network connectivity', 'User account active'],
    expectedResult: 'Device satisfies CA policy; user can authenticate to protected resources.',
    rollbackSteps: ['Reset device compliance via Intune', 'Contact Identity team for CA exclusion'],
    isTemplate: false, createdAt: '2026-02-01T10:00:00Z', updatedAt: '2026-05-10T14:00:00Z',
    versions: [
      { version: '1.1.0', author: 'ITO Identity', date: '2026-05-10', notes: 'Handle new FIDO2 key registration' },
    ],
    steps: [
      { id: 'ca-1', name: 'Diagnose CA Block', description: 'Identify failing CA policy condition', estimatedMs: 1000, safeMode: true, dryRunSafe: true,
        logTemplates: ['Querying sign-in logs for device…', 'Last failure: 2h ago', 'Failing policy: Require compliant device', 'Failure reason: Device not compliant', 'User: affected@zinnia.com', 'Diagnosis: stale compliance token'] },
      { id: 'ca-2', name: 'Clear AAD Token Cache', description: 'Remove cached tokens causing stale state', estimatedMs: 1200, safeMode: true, dryRunSafe: false,
        logTemplates: ['dsregcmd /status', 'SSO state: NOT_VALID', 'Clearing WAM token cache…', 'Clearing MSAL cache…', 'PRT invalidated', 'Token cache cleared'] },
      { id: 'ca-3', name: 'Re-register Device in AAD', description: 'Force fresh AAD device registration', estimatedMs: 1600, safeMode: false, dryRunSafe: false,
        logTemplates: ['dsregcmd /leave', 'AAD join removed', 'dsregcmd /join', 'AAD join: Success', 'New Device ID assigned', 'Device object updated in tenant'] },
      { id: 'ca-4', name: 'Trigger Intune Compliance Check', description: 'Force compliance re-evaluation', estimatedMs: 1400, safeMode: true, dryRunSafe: true,
        logTemplates: ['Triggering compliance sync…', 'Sending device sync request to Intune…', 'Compliance policies evaluated: 3/3', 'Result: Compliant', 'Compliance token issued', 'CA policy re-evaluated: PASS'] },
      { id: 'ca-5', name: 'Validate Resource Access', description: 'Test access to protected resources', estimatedMs: 900, safeMode: true, dryRunSafe: true,
        logTemplates: ['Testing: Office 365 sign-in', 'Token acquired successfully', 'CA policy satisfied: Require compliant device — PASS', 'Testing: SharePoint access — PASS', 'All resource checks passed', 'Runbook complete'] },
    ],
  },
  {
    id: 'rb-collect-diagnostics',
    name: 'Collect Diagnostic Bundle',
    description: 'Non-destructive collection of system logs, event viewer data, network traces, and performance snapshots for L2/L3 troubleshooting.',
    category: 'Diagnostics', platform: 'cross-platform', severity: 'Low',
    version: '3.5.0', author: 'ITO Helpdesk', approvalRequired: false,
    safeModeSupported: true, estimatedMinutes: 5, usageCount: 394,
    tags: ['diagnostics', 'logs', 'helpdesk', 'read-only'],
    prerequisites: ['Remote shell access', 'Storage space > 500 MB'],
    expectedResult: 'Diagnostic bundle ZIP created and available for download.',
    rollbackSteps: ['No rollback required — read-only operation'],
    isTemplate: false, createdAt: '2025-07-01T10:00:00Z', updatedAt: '2026-05-25T09:00:00Z',
    versions: [
      { version: '3.5.0', author: 'ITO Helpdesk', date: '2026-05-25', notes: 'Add network trace capture' },
      { version: '3.4.0', author: 'ITO Helpdesk', date: '2026-03-01', notes: 'Add performance baseline export' },
    ],
    steps: [
      { id: 'cd-1', name: 'System Info Snapshot', description: 'Capture OS, hardware, and user info', estimatedMs: 800, safeMode: true, dryRunSafe: true,
        logTemplates: ['Get-ComputerInfo / system_profiler', 'OS: Windows 11 23H2 (22631)', 'CPU: Intel Core i7-1365U', 'RAM: 16 GB', 'Disk: 512 GB (234 GB free)', 'Last boot: 2 days ago'] },
      { id: 'cd-2', name: 'Export Event Logs', description: 'Export System, Application, Security event logs', estimatedMs: 1400, safeMode: true, dryRunSafe: true,
        logTemplates: ['Exporting System log (last 7d)…', 'Events exported: 4,821', 'Exporting Application log…', 'Events exported: 12,403', 'Exporting Security log…', 'Events exported: 8,109'] },
      { id: 'cd-3', name: 'Capture Network State', description: 'Ping, traceroute, DNS, open connections', estimatedMs: 1200, safeMode: true, dryRunSafe: true,
        logTemplates: ['ipconfig /all captured', 'ping 8.8.8.8 — 4ms', 'netstat -an: 43 connections logged', 'nslookup zinnia.com — OK', 'Route table captured', 'Firewall rules exported'] },
      { id: 'cd-4', name: 'Performance Baseline', description: 'Capture CPU/RAM/disk performance counters', estimatedMs: 1000, safeMode: true, dryRunSafe: true,
        logTemplates: ['CPU usage: 23%', 'Memory committed: 8.1 / 16 GB', 'Disk queue: 0.2', 'Top processes logged', 'Performance counters exported', 'Baseline JSON created'] },
      { id: 'cd-5', name: 'Package & Upload Bundle', description: 'Compress and stage diagnostic bundle', estimatedMs: 1200, safeMode: true, dryRunSafe: true,
        logTemplates: ['Compressing: diag_bundle_{device}_{date}.zip', 'Bundle size: 42 MB', 'SHA-256 checksum calculated', 'Bundle staged at \\\\ito-fileserver\\diag\\', 'Upload URL generated', 'Notification sent to requester'] },
    ],
  },
  {
    id: 'rb-app-deploy-fix',
    name: 'App Deployment Failure Recovery',
    description: 'Diagnoses and repairs failed application deployments via Intune/Kandji. Clears WinGet caches, re-triggers deploy, and validates install.',
    category: 'Application', platform: 'cross-platform', severity: 'Medium',
    version: '2.1.0', author: 'ITO Apps Team', approvalRequired: false,
    safeModeSupported: true, estimatedMinutes: 10, usageCount: 78,
    tags: ['app', 'deployment', 'intune', 'winget'],
    prerequisites: ['MDM enrolled', 'WinGet available (Windows)', 'App deployment configured in MDM'],
    expectedResult: 'Target application installed and reporting success in MDM.',
    rollbackSteps: ['Remove partial install via Control Panel', 'Reset app deployment in Intune'],
    isTemplate: false, createdAt: '2025-11-15T10:00:00Z', updatedAt: '2026-04-30T10:00:00Z',
    versions: [
      { version: '2.1.0', author: 'ITO Apps Team', date: '2026-04-30', notes: 'Support Kandji managed apps' },
    ],
    steps: [
      { id: 'ad-1', name: 'Query Deployment Status', description: 'Identify failing app deployment', estimatedMs: 900, safeMode: true, dryRunSafe: true,
        logTemplates: ['Querying Intune app deployments…', 'App: Microsoft 365 Apps for Enterprise', 'Last attempt: 3h ago', 'Error code: 0x80004004 (E_ABORT)', 'Reason: Pending reboot required', 'Install state: Failed'] },
      { id: 'ad-2', name: 'Clear Deployment Cache', description: 'Remove stale WinGet and IME cache', estimatedMs: 1100, safeMode: false, dryRunSafe: false,
        logTemplates: ['Stopping IntuneManagementExtension service…', 'Clearing IME cache: C:\\ProgramData\\Microsoft\\IntuneManagementExtension\\', 'Clearing WinGet package cache…', 'Old install logs archived', 'Services restarted', 'Cache cleared successfully'] },
      { id: 'ad-3', name: 'Resolve Pre-requisites', description: 'Handle pending reboot and requirements', estimatedMs: 1400, safeMode: true, dryRunSafe: false,
        logTemplates: ['Checking: pending reboot status', 'PendingReboot: TRUE — deferring', 'Applying reboot override for deployment…', 'Checking .NET 6 prerequisite…', '.NET 6.0.21 present — OK', 'All prerequisites satisfied'] },
      { id: 'ad-4', name: 'Trigger App Deployment', description: 'Force IME sync and re-trigger deployment', estimatedMs: 2000, safeMode: false, dryRunSafe: false,
        logTemplates: ['Syncing Intune policies…', 'App deployment re-triggered', 'IME downloading Microsoft 365: 2.1 GB…', 'Download complete', 'Running installer in system context…', 'Exit code: 0 (Success)'] },
      { id: 'ad-5', name: 'Validate Install', description: 'Confirm app installed and reporting to MDM', estimatedMs: 1000, safeMode: true, dryRunSafe: true,
        logTemplates: ['Querying installed apps…', 'Microsoft 365 Apps 2406 (16.0.17726) — Present', 'MDM deployment status: Installed', 'Compliance policy re-evaluated: Pass', 'Dashboard updated', 'Success notification sent'] },
    ],
  },
  {
    id: 'rb-certificate-repair',
    name: 'Certificate Chain Repair',
    description: 'Repairs broken SCEP/PKCS certificate chains used for Wi-Fi, VPN, and authentication. Re-requests certs from NDES/PKI infrastructure.',
    category: 'Identity', platform: 'Windows', severity: 'Medium',
    version: '1.3.0', author: 'ITO PKI Team', approvalRequired: false,
    safeModeSupported: true, estimatedMinutes: 6, usageCount: 31,
    tags: ['certificate', 'pki', 'scep', 'wifi', 'vpn'],
    prerequisites: ['NDES/SCEP accessible', 'Intune SCEP profile configured', 'Network connectivity'],
    expectedResult: 'Valid device identity certificate issued and trusted chain confirmed.',
    rollbackSteps: ['Manually request certificate from NDES', 'Re-apply Intune certificate profile'],
    isTemplate: false, createdAt: '2026-01-20T10:00:00Z', updatedAt: '2026-03-15T10:00:00Z',
    versions: [
      { version: '1.3.0', author: 'ITO PKI Team', date: '2026-03-15', notes: 'Add PKCS12 chain validation' },
    ],
    steps: [
      { id: 'cr-1', name: 'Audit Certificate Store', description: 'List device identity and CA certificates', estimatedMs: 900, safeMode: true, dryRunSafe: true,
        logTemplates: ['Scanning: LocalMachine\\My', 'Found 3 device certificates', 'ITO-Device-Cert: EXPIRED (2 days ago)', 'ITO-CA-Root: Valid', 'ITO-SubCA: Valid', 'Broken chain detected: leaf cert expired'] },
      { id: 'cr-2', name: 'Remove Expired Certificates', description: 'Delete expired leaf certs from store', estimatedMs: 800, safeMode: false, dryRunSafe: false,
        logTemplates: ['Removing ITO-Device-Cert (expired)…', 'Thumbprint: A1:B2:C3:D4:…', 'Certificate removed', 'Verifying: 0 expired certs in store', 'CRL cache flushed', 'Store cleaned'] },
      { id: 'cr-3', name: 'Request New SCEP Certificate', description: 'Trigger Intune SCEP profile re-issuance', estimatedMs: 1600, safeMode: false, dryRunSafe: false,
        logTemplates: ['Triggering Intune certificate profile…', 'SCEP challenge requested from NDES', 'CSR generated: 2048-bit RSA', 'CSR submitted to NDES', 'Certificate issued by ITO-SubCA', 'Certificate installed: MY store'] },
      { id: 'cr-4', name: 'Validate Certificate Chain', description: 'Verify trust chain from leaf to root', estimatedMs: 1000, safeMode: true, dryRunSafe: true,
        logTemplates: ['certutil -verify ITO-Device-Cert', 'Chain: ITO-Device-Cert → ITO-SubCA → ITO-Root', 'All certificates valid', 'CRL check: PASS', 'OCSP: PASS', 'Trust chain: Complete'] },
      { id: 'cr-5', name: 'Test Certificate Usage', description: 'Verify cert works for Wi-Fi/VPN auth', estimatedMs: 900, safeMode: true, dryRunSafe: true,
        logTemplates: ['Testing 802.1X Wi-Fi authentication…', 'EAP-TLS auth: SUCCESS', 'Testing VPN certificate auth…', 'VPN auth: SUCCESS', 'Wi-Fi profile re-applied', 'Certificate repair complete'] },
    ],
  },
]

// ─── Execution Store & Engine ─────────────────────────────────────────────────

const execStore = new Map<string, Execution>()

// Pub-sub for SSE: execId → set of send functions
const subs = new Map<string, Set<(d: unknown) => void>>()

function broadcast(execId: string, data: unknown): void {
  subs.get(execId)?.forEach(fn => { try { fn(data) } catch { /* ignore closed */ } })
}

function addSub(execId: string, fn: (d: unknown) => void): () => void {
  if (!subs.has(execId)) subs.set(execId, new Set())
  subs.get(execId)!.add(fn)
  return () => { subs.get(execId)?.delete(fn); if (!subs.get(execId)?.size) subs.delete(execId) }
}

function uid(): string { return randomBytes(8).toString('hex') }
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

function addLog(exec: Execution, level: LogLevel, message: string, stepId?: string, stepName?: string): void {
  const log: ExecLog = {
    id: uid(), timestamp: new Date().toISOString(), level, message,
    ...(stepId   !== undefined ? { stepId }   : {}),
    ...(stepName !== undefined ? { stepName } : {}),
  }
  exec.logs.push(log)
  broadcast(exec.id, { type: 'log', log })
}

function healthSnap(deviceId: string, phase: 'before' | 'after', runbookId: string): HealthSnapshot {
  const seed = deviceId.charCodeAt(0) + deviceId.charCodeAt(1)
  const encryptionRunbooks = ['rb-bitlocker-enforce', 'rb-filevault-enable']
  const isEncryptionFix = encryptionRunbooks.includes(runbookId)
  return {
    cpu: phase === 'before' ? 62 + (seed % 20) : 28 + (seed % 15),
    memory: phase === 'before' ? 74 + (seed % 15) : 45 + (seed % 20),
    disk: phase === 'before' ? 68 + (seed % 10) : 65 + (seed % 10),
    compliance: phase === 'before' ? 'Non-Compliant' : 'Compliant',
    encryptionEnabled: phase === 'before' ? !isEncryptionFix : true,
    issues: phase === 'before' ? ['Encryption disabled', 'Policy drift detected'] : [],
    capturedAt: new Date().toISOString(),
  }
}

const AI_SUMMARIES: Record<string, { rootCause: string; resolution: string }> = {
  'rb-bitlocker-enforce': {
    rootCause: 'Device was enrolled in Intune without a BitLocker enforcement policy applied, likely due to enrollment during a policy gap window or a stale compliance token. TPM was available but BitLocker was never activated, leaving the system drive unencrypted and violating NIST 800-53 SC-28.',
    resolution: 'BitLocker XTS-AES 256-bit encryption was successfully enabled on drive C:. Recovery key has been escrowed to Azure AD key vault and is visible in the Intune portal. Compliance status has been re-evaluated and the device is now Compliant. No user disruption — encryption continues in the background.',
  },
  'rb-filevault-enable': {
    rootCause: 'FileVault was not activated on this device despite the Kandji FileVault enforcement profile being assigned. The enforcement was likely deferred at the OS level due to a missing user session at MDM check-in time, resulting in a persistent non-compliant state.',
    resolution: 'FileVault 2 encryption has been enabled via MDM command. A Personal Recovery Key (PRK) was generated and escrowed to Kandji. The device will complete encryption in the background and compliance policy will re-evaluate upon next MDM check-in.',
  },
  'rb-intune-reenroll': {
    rootCause: 'The MDM enrollment certificate expired and was not automatically renewed, causing the Intune Management Extension to lose its device identity. This led to sync failures and compliance drift, as policies could not be applied to the orphaned enrollment record.',
    resolution: 'Stale MDM certificates were removed, the device was re-joined to Azure AD, and a fresh Intune enrollment was completed. All 14 configuration policies and 3 compliance policies were re-applied and evaluated as Compliant.',
  },
  'rb-defender-repair': {
    rootCause: 'The Defender for Endpoint sensor entered a degraded state (RFM mode) after a Windows Update disrupted the Sense service stack. The device was no longer reporting telemetry to the MDE portal, creating a security visibility gap.',
    resolution: 'Defender sensor state was cleared, the device was re-onboarded to the MDE tenant using the current onboarding package, and cloud connectivity was confirmed. The device is now visible in the MDE portal with a healthy sensor status.',
  },
  'rb-windows-update': {
    rootCause: 'Device was running 23 days behind the Windows Update ring schedule due to repeated user deferrals and a misconfigured Update Ring that allowed indefinite quality update deferrals. Three critical CVEs (including CVE-2024-21412) were unpatched.',
    resolution: 'All 7 pending updates including 3 critical security patches were installed. The device is now current with the Semi-Annual Channel update ring. A soft reboot is deferred 4 hours to minimize disruption.',
  },
}

function getAISummary(runbookId: string): { rootCause: string; resolution: string } {
  return AI_SUMMARIES[runbookId] ?? {
    rootCause: 'Automated analysis identified a configuration drift between the expected policy state and the actual device state. The runbook addressed this by systematically verifying prerequisites, applying remediation steps, and confirming the corrected state.',
    resolution: 'All runbook steps completed successfully. The targeted issue has been resolved and the device compliance state has been updated. Evidence has been captured for audit purposes.',
  }
}

async function runExecution(exec: Execution, runbook: EnterpriseRunbook): Promise<void> {
  try {
    exec.status = 'running'
    exec.beforeHealth = healthSnap(exec.deviceId, 'before', runbook.id)
    broadcast(exec.id, { type: 'status', status: 'running', beforeHealth: exec.beforeHealth })

    addLog(exec, 'info', `[${exec.mode.toUpperCase()}] Starting runbook: ${runbook.name} v${runbook.version}`)
    addLog(exec, 'info', `Device: ${exec.deviceName} | Platform: ${exec.devicePlatform} | Mode: ${exec.mode}`)
    if (exec.mode === 'dry-run') addLog(exec, 'warning', '⚠  DRY-RUN MODE — No changes will be applied to the device')
    if (exec.mode === 'safe')    addLog(exec, 'warning', '🛡  SAFE MODE — Risky steps will be skipped')

    let completedSteps = 0

    for (let i = 0; i < exec.steps.length; i++) {
      if ((exec.status as string) === 'cancelled') {
        addLog(exec, 'warning', `Execution cancelled by ${exec.cancelledBy ?? 'user'}`)
        return
      }

      const step    = exec.steps[i] as ExecStep
      const rbStep  = runbook.steps[i] as RunbookStep

      // Skip risky steps in safe mode
      if (exec.mode === 'safe' && !rbStep.safeMode) {
        step.status = 'skipped'
        addLog(exec, 'warning', `[SKIP] Step ${i + 1}: "${step.name}" skipped in safe mode`, step.id, step.name)
        broadcast(exec.id, { type: 'step_update', step, stepIndex: i })
        completedSteps++
        exec.progress = Math.round((completedSteps / exec.steps.length) * 100)
        broadcast(exec.id, { type: 'progress', progress: exec.progress })
        continue
      }

      step.status = 'running'
      step.startedAt = new Date().toISOString()
      broadcast(exec.id, { type: 'step_update', step, stepIndex: i })

      addLog(exec, 'info', `► Step ${i + 1}/${exec.steps.length}: ${step.name}`, step.id, step.name)
      if (exec.mode === 'dry-run') addLog(exec, 'debug', `  [DRY-RUN] Simulating: ${step.description}`, step.id, step.name)

      // Emit step log lines with small delays
      const logs = rbStep.logTemplates
      const interval = Math.max(120, Math.floor(rbStep.estimatedMs / (logs.length + 1)))
      for (const msg of logs) {
        if ((exec.status as string) === 'cancelled') break
        const isDryRunSkippable = exec.mode === 'dry-run' && !rbStep.dryRunSafe
        const prefix = isDryRunSkippable ? '[DRY-RUN SIMULATED] ' : ''
        addLog(exec, 'debug', `  ${prefix}${msg}`, step.id, step.name)
        await sleep(interval)
      }

      if ((exec.status as string) === 'cancelled') {
        step.status = 'skipped'
        broadcast(exec.id, { type: 'step_update', step, stepIndex: i })
        return
      }

      const stepDuration = exec.mode === 'dry-run' ? Math.floor(rbStep.estimatedMs * 0.25) : rbStep.estimatedMs
      await sleep(Math.max(200, stepDuration - interval * logs.length))

      step.status = 'completed'
      step.completedAt = new Date().toISOString()
      step.durationMs = new Date(step.completedAt).getTime() - new Date(step.startedAt as string).getTime()
      addLog(exec, 'success', `  ✓ ${step.name} completed (${(step.durationMs / 1000).toFixed(1)}s)`, step.id, step.name)

      completedSteps++
      exec.progress = Math.round((completedSteps / exec.steps.length) * 100)
      broadcast(exec.id, { type: 'step_update', step, stepIndex: i })
      broadcast(exec.id, { type: 'progress', progress: exec.progress })
    }

    // Finalize
    exec.status = 'completed'
    exec.progress = 100
    exec.completedAt = new Date().toISOString()
    exec.durationMs = new Date(exec.completedAt).getTime() - new Date(exec.startedAt).getTime()
    exec.afterHealth = healthSnap(exec.deviceId, 'after', runbook.id)
    const ai = getAISummary(runbook.id)
    exec.aiRootCause  = ai.rootCause
    exec.aiResolution = ai.resolution
    runbook.usageCount++

    addLog(exec, 'success', `✓ Runbook completed in ${(exec.durationMs / 1000).toFixed(1)}s`)
    addLog(exec, 'info',    `Compliance status: ${exec.afterHealth.compliance}`)
    broadcast(exec.id, { type: 'complete', execution: exec })
  } catch (err) {
    exec.status = 'failed'
    exec.error  = err instanceof Error ? err.message : 'Unknown error'
    exec.completedAt = new Date().toISOString()
    addLog(exec, 'error', `✗ Execution failed: ${exec.error}`)
    broadcast(exec.id, { type: 'status', status: 'failed', error: exec.error })
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/runbooks
router.get('/', (_req, res) => {
  res.json({ success: true, data: RUNBOOK_STORE })
})

// GET /api/runbooks/templates
router.get('/templates', (_req, res) => {
  const templates = RUNBOOK_STORE.filter(r => r.isTemplate)
  res.json({ success: true, data: templates })
})

// GET /api/runbooks/executions
router.get('/executions', (_req, res) => {
  const list = Array.from(execStore.values())
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 50)
  res.json({ success: true, data: list })
})

// GET /api/runbooks/executions/:execId
router.get('/executions/:execId', (req, res) => {
  const exec = execStore.get(req.params.execId)
  if (!exec) { res.status(404).json({ success: false, error: 'Execution not found' }); return }
  res.json({ success: true, data: exec })
})

// GET /api/runbooks/executions/:execId/stream  (SSE)
router.get('/executions/:execId/stream', (req, res) => {
  const exec = execStore.get(req.params.execId)
  if (!exec) { res.status(404).json({ success: false, error: 'Execution not found' }); return }

  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write('retry: 3000\n\n')

  const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  // Replay existing state immediately
  send({ type: 'init', execution: exec })

  if (exec.status === 'completed' || exec.status === 'failed' || exec.status === 'cancelled') {
    res.end(); return
  }

  const unsub = addSub(req.params.execId, send)
  req.on('close', unsub)
})

// GET /api/runbooks/executions/:execId/evidence
router.get('/executions/:execId/evidence', (req, res) => {
  const exec = execStore.get(req.params.execId)
  if (!exec) { res.status(404).json({ success: false, error: 'Execution not found' }); return }
  const bundle = {
    generatedAt: new Date().toISOString(),
    version: '1.0',
    execution: exec,
    checksums: { executionId: exec.id, logCount: exec.logs.length },
    attestation: `Evidence package generated by ITO Endpoint Platform. Execution ID: ${exec.id}`,
  }
  res.json({ success: true, data: bundle })
})

// POST /api/runbooks/executions/:execId/cancel
router.post('/executions/:execId/cancel', (req, res) => {
  const exec = execStore.get(req.params.execId)
  if (!exec) { res.status(404).json({ success: false, error: 'Execution not found' }); return }
  if (exec.status !== 'running' && exec.status !== 'waiting_approval') {
    res.status(400).json({ success: false, error: `Cannot cancel execution in state: ${exec.status}` }); return
  }
  exec.status = 'cancelled'
  exec.cancelledBy = (req.body as { cancelledBy?: string }).cancelledBy ?? 'user'
  exec.completedAt = new Date().toISOString()
  broadcast(exec.id, { type: 'status', status: 'cancelled', cancelledBy: exec.cancelledBy })
  res.json({ success: true, data: exec })
})

// POST /api/runbooks/executions/:execId/retry-step
router.post('/executions/:execId/retry-step', (req, res) => {
  const exec = execStore.get(req.params.execId)
  if (!exec) { res.status(404).json({ success: false, error: 'Execution not found' }); return }
  const { stepId } = req.body as { stepId?: string }
  const step = exec.steps.find(s => s.id === stepId)
  if (!step) { res.status(404).json({ success: false, error: 'Step not found' }); return }
  const runbook = RUNBOOK_STORE.find(r => r.id === exec.runbookId)
  if (!runbook) { res.status(404).json({ success: false, error: 'Runbook not found' }); return }

  step.retryCount++
  step.status = 'retrying'
  broadcast(exec.id, { type: 'step_update', step, stepIndex: exec.steps.indexOf(step) })

  // Rerun from this step
  const failedIdx = exec.steps.indexOf(step)
  exec.status = 'running'
  exec.steps.slice(failedIdx).forEach(s => { if (s.status === 'failed') s.status = 'pending' })

  setImmediate(() => {
    const stepsToRun = exec.steps.slice(failedIdx)
    const rbStepsToRun = runbook.steps.slice(failedIdx)
    const subExec = { ...exec, steps: stepsToRun }
    const subRunbook = { ...runbook, steps: rbStepsToRun }
    runExecution(subExec, subRunbook).then(() => {
      stepsToRun.forEach((s, i) => { exec.steps[failedIdx + i] = s })
      exec.status = subExec.status
      exec.progress = subExec.progress
    })
  })

  res.json({ success: true, data: exec })
})

// (duplicate retry route removed — final one below handles it)

// GET /api/runbooks/:id
router.get('/:id', (req, res) => {
  const runbook = RUNBOOK_STORE.find(r => r.id === req.params.id)
  if (!runbook) { res.status(404).json({ success: false, error: 'Runbook not found' }); return }
  res.json({ success: true, data: runbook })
})

// GET /api/runbooks/:id/export
router.get('/:id/export', (req, res) => {
  const runbook = RUNBOOK_STORE.find(r => r.id === req.params.id)
  if (!runbook) { res.status(404).json({ success: false, error: 'Runbook not found' }); return }
  res.json({ success: true, data: { ...runbook, exportedAt: new Date().toISOString() } })
})

// POST /api/runbooks/import
router.post('/import', (req, res) => {
  const body = req.body as Partial<EnterpriseRunbook>
  if (!body.name || !body.steps) {
    res.status(400).json({ success: false, error: 'name and steps are required' }); return
  }
  const imported: EnterpriseRunbook = {
    id: `rb-imported-${uid()}`,
    name: String(body.name),
    description: String(body.description ?? ''),
    category: String(body.category ?? 'Custom'),
    platform: String(body.platform ?? 'cross-platform'),
    severity: String(body.severity ?? 'Medium'),
    version: '1.0.0',
    author: 'Imported',
    approvalRequired: Boolean(body.approvalRequired ?? false),
    safeModeSupported: Boolean(body.safeModeSupported ?? true),
    estimatedMinutes: Number(body.estimatedMinutes ?? 5),
    tags: Array.isArray(body.tags) ? body.tags : [],
    steps: Array.isArray(body.steps) ? body.steps : [],
    prerequisites: Array.isArray(body.prerequisites) ? body.prerequisites : [],
    expectedResult: String(body.expectedResult ?? ''),
    rollbackSteps: Array.isArray(body.rollbackSteps) ? body.rollbackSteps : [],
    isTemplate: false, usageCount: 0,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    versions: [{ version: '1.0.0', author: 'Imported', date: new Date().toISOString().split('T')[0] ?? '', notes: 'Imported from JSON' }],
  }
  RUNBOOK_STORE.push(imported)
  res.status(201).json({ success: true, data: imported })
})

// POST /api/runbooks/:id/clone
router.post('/:id/clone', (req, res) => {
  const original = RUNBOOK_STORE.find(r => r.id === req.params.id)
  if (!original) { res.status(404).json({ success: false, error: 'Runbook not found' }); return }
  const cloned: EnterpriseRunbook = {
    ...JSON.parse(JSON.stringify(original)),
    id: `rb-clone-${uid()}`,
    name: `${original.name} (Clone)`,
    version: '1.0.0',
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    versions: [{ version: '1.0.0', author: 'Cloned', date: new Date().toISOString().split('T')[0], notes: `Cloned from ${original.name} v${original.version}` }],
  }
  RUNBOOK_STORE.push(cloned)
  res.status(201).json({ success: true, data: cloned })
})

// POST /api/runbooks/:id/approve
router.post('/:id/approve', (req, res) => {
  const { executionId, approvedBy, rejected } = req.body as { executionId?: string; approvedBy?: string; rejected?: boolean }
  const exec = executionId ? execStore.get(executionId) : null
  if (!exec) { res.status(404).json({ success: false, error: 'Execution not found' }); return }
  if (exec.status !== 'waiting_approval') {
    res.status(400).json({ success: false, error: 'Execution is not pending approval' }); return
  }
  if (rejected) {
    exec.status = 'cancelled'
    exec.cancelledBy = approvedBy ?? 'admin'
    exec.completedAt = new Date().toISOString()
    broadcast(exec.id, { type: 'status', status: 'cancelled' })
    res.json({ success: true, data: exec }); return
  }
  exec.approvedBy = approvedBy ?? 'admin'
  const runbook = RUNBOOK_STORE.find(r => r.id === exec.runbookId)
  if (!runbook) { res.status(404).json({ success: false, error: 'Runbook not found' }); return }
  addLog(exec, 'info', `Approved by ${exec.approvedBy}`)
  broadcast(exec.id, { type: 'status', status: 'running' })
  setImmediate(() => runExecution(exec, runbook))
  res.json({ success: true, data: exec })
})

// POST /api/runbooks/:id/execute
router.post('/:id/execute', (req, res) => {
  const runbook = RUNBOOK_STORE.find(r => r.id === req.params.id)
  if (!runbook) { res.status(404).json({ success: false, error: 'Runbook not found' }); return }

  const body = req.body as {
    deviceId?: string; deviceName?: string; devicePlatform?: string
    mode?: ExecMode; initiatedBy?: string
  }
  if (!body.deviceId || !body.deviceName) {
    res.status(400).json({ success: false, error: 'deviceId and deviceName are required' }); return
  }

  const mode: ExecMode = body.mode ?? 'normal'

  const exec: Execution = {
    id: `exec-${uid()}`,
    runbookId: runbook.id,
    runbookName: runbook.name,
    runbookVersion: runbook.version,
    deviceId: body.deviceId,
    deviceName: body.deviceName,
    devicePlatform: body.devicePlatform ?? 'Windows',
    mode,
    status: runbook.approvalRequired ? 'waiting_approval' : 'pending',
    progress: 0,
    logs: [],
    steps: runbook.steps.map(s => ({
      id: s.id, name: s.name, description: s.description,
      status: 'pending', retryCount: 0,
    })),
    startedAt: new Date().toISOString(),
    initiatedBy: body.initiatedBy ?? 'user',
  }

  execStore.set(exec.id, exec)

  if (!runbook.approvalRequired) {
    setImmediate(() => runExecution(exec, runbook))
  } else {
    addLog(exec, 'warning', `Runbook requires approval. Waiting for admin sign-off.`)
    broadcast(exec.id, { type: 'status', status: 'waiting_approval' })
  }

  res.status(202).json({ success: true, data: exec })
})

// Workaround for the retry route needing req
router.post('/executions/:execId/retry', (req, res) => {
  const exec = execStore.get(req.params.execId)
  if (!exec) { res.status(404).json({ success: false, error: 'Execution not found' }); return }
  const runbook = RUNBOOK_STORE.find(r => r.id === exec.runbookId)
  if (!runbook) { res.status(404).json({ success: false, error: 'Runbook not found' }); return }

  exec.status = 'pending'
  exec.progress = 0
  exec.steps.forEach(s => { s.status = 'pending'; (s as unknown as Record<string,unknown>)['startedAt'] = undefined; (s as unknown as Record<string,unknown>)['completedAt'] = undefined })
  exec.logs = []
  exec.completedAt = undefined as unknown as string
  exec.startedAt = new Date().toISOString()

  setImmediate(() => runExecution(exec, runbook))
  res.json({ success: true, data: exec })
})

export default router
