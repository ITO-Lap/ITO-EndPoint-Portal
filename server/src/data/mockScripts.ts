// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScriptParameter {
  name: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'select'
  required: boolean
  defaultValue?: string | undefined
  options?: string[] | undefined
  placeholder?: string | undefined
}

export interface Script {
  id: string
  name: string
  description: string
  os: 'Windows' | 'macOS' | 'Linux' | 'Cross-platform'
  type: 'PowerShell' | 'Bash' | 'Batch' | 'Python'
  content: string
  version: number
  tags: string[]
  createdBy: string
  createdAt: string
  updatedAt: string
  isDestructive: boolean
  requiresApproval: boolean
  minRole: 'Helpdesk' | 'IT Admin' | 'Global Admin'
  parameters: ScriptParameter[]
  timeoutSeconds: number
  useCount: number
}

export interface ScriptExecution {
  id: string
  scriptId: string
  scriptName: string
  scriptVersion: number
  deviceId: string
  deviceName: string
  platform: string
  managementSource: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled' | 'pending_approval'
  exitCode?: number
  stdout?: string
  stderr?: string
  runtimeMs?: number
  startedAt: string
  completedAt?: string
  executedBy: string
  approvedBy?: string
  parameters?: Record<string, string>
}

// ── Mock Scripts ──────────────────────────────────────────────────────────────

export const MOCK_SCRIPTS: Script[] = [
  {
    id: 'filevault-check',
    name: 'FileVault Status Check',
    description: 'Checks FileVault disk encryption status and recovery key escrow state for compliance reporting.',
    os: 'macOS',
    type: 'Bash',
    content: `#!/bin/bash
# FileVault Status Check
# Returns encryption state and recovery key escrow info

set -euo pipefail

echo "=== FileVault Encryption Status ==="
echo ""

FV_STATUS=$(fdesetup status 2>&1)
echo "FileVault Status: $FV_STATUS"
echo ""

# Check if FileVault is enabled
if echo "$FV_STATUS" | grep -q "FileVault is On"; then
  echo "✔ Encryption: ENABLED"
  ENCRYPTED=true
else
  echo "✘ Encryption: DISABLED"
  ENCRYPTED=false
fi

echo ""
echo "=== Recovery Key Escrow ==="

# Check recovery key validity (non-destructive)
RK_STATUS=$(fdesetup hasinstitutionalrecoverykey 2>&1 || true)
PKG_STATUS=$(fdesetup haspersonalrecoverykey 2>&1 || true)

if echo "$RK_STATUS" | grep -qi "true"; then
  echo "✔ Institutional recovery key: PRESENT"
else
  echo "  Institutional recovery key: Not found"
fi

if echo "$PKG_STATUS" | grep -qi "true"; then
  echo "✔ Personal recovery key: ESCROWED"
else
  echo "  Personal recovery key: Not escrowed"
fi

echo ""
echo "=== User Accounts with FileVault Access ==="
if $ENCRYPTED; then
  fdesetup list 2>&1 | while IFS=',' read -r user uuid; do
    echo "  User: $user  UUID: $uuid"
  done
fi

echo ""
echo "=== Check Complete ==="
echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
`,
    version: 2,
    tags: ['encryption', 'compliance', 'macos'],
    createdBy: 'avinash.verma@zinnia.com',
    createdAt: '2026-03-10T09:00:00.000Z',
    updatedAt: '2026-04-15T14:22:00.000Z',
    isDestructive: false,
    requiresApproval: false,
    minRole: 'Helpdesk',
    parameters: [],
    timeoutSeconds: 30,
    useCount: 47,
  },

  {
    id: 'bitlocker-status',
    name: 'BitLocker Volume Status',
    description: 'Reports BitLocker encryption status, protection state, and key protectors for a specified drive volume.',
    os: 'Windows',
    type: 'PowerShell',
    content: `# BitLocker Volume Status
# Reports encryption state, protection status, and key protectors for a drive

param(
  [string]$DriveLetter = "C:"
)

Write-Output "=== BitLocker Volume Status ==="
Write-Output "Drive: $DriveLetter"
Write-Output "Timestamp: $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ' -AsUTC)"
Write-Output ""

try {
  $volume = Get-BitLockerVolume -MountPoint $DriveLetter -ErrorAction Stop

  $protectionStatusMap = @{
    "On"  = "✔ PROTECTED"
    "Off" = "✘ NOT PROTECTED"
    "Unknown" = "? UNKNOWN"
  }

  $encryptionStatusMap = @{
    "FullyEncrypted"        = "Fully Encrypted"
    "FullyDecrypted"        = "Fully Decrypted"
    "EncryptionInProgress"  = "Encryption In Progress"
    "DecryptionInProgress"  = "Decryption In Progress"
    "EncryptionPaused"      = "Encryption Paused"
    "DecryptionPaused"      = "Decryption Paused"
  }

  Write-Output "Protection Status : $($protectionStatusMap[$volume.ProtectionStatus.ToString()] ?? $volume.ProtectionStatus)"
  Write-Output "Encryption Status : $($encryptionStatusMap[$volume.VolumeStatus.ToString()] ?? $volume.VolumeStatus)"
  Write-Output "Encryption Method : $($volume.EncryptionMethod)"
  Write-Output "Encryption %      : $($volume.EncryptionPercentage)%"
  Write-Output "Lock Status       : $($volume.LockStatus)"
  Write-Output ""

  Write-Output "=== Key Protectors ==="
  if ($volume.KeyProtector.Count -eq 0) {
    Write-Output "  (none configured)"
  } else {
    foreach ($kp in $volume.KeyProtector) {
      Write-Output "  Type: $($kp.KeyProtectorType)  ID: $($kp.KeyProtectorId)"
    }
  }

  # Recovery key warning
  $hasRecoveryKey = $volume.KeyProtector | Where-Object { $_.KeyProtectorType -eq 'RecoveryPassword' }
  Write-Output ""
  if ($hasRecoveryKey) {
    Write-Output "✔ Recovery password protector is present."
  } else {
    Write-Output "⚠ WARNING: No recovery password protector found. Back up a recovery key."
  }

} catch {
  Write-Error "Failed to query BitLocker for drive '$DriveLetter': $_"
  exit 1
}

Write-Output ""
Write-Output "=== Check Complete ==="
`,
    version: 3,
    tags: ['encryption', 'compliance', 'windows'],
    createdBy: 'avinash.verma@zinnia.com',
    createdAt: '2026-03-10T09:15:00.000Z',
    updatedAt: '2026-05-01T11:00:00.000Z',
    isDestructive: false,
    requiresApproval: false,
    minRole: 'Helpdesk',
    parameters: [
      {
        name: 'driveLetter',
        label: 'Drive Letter',
        type: 'string',
        required: false,
        defaultValue: 'C:',
        placeholder: 'e.g. C:',
      },
    ],
    timeoutSeconds: 30,
    useCount: 83,
  },

  {
    id: 'mdm-force-sync',
    name: 'Force MDM Sync',
    description: 'Detects OS platform and triggers the appropriate MDM agent sync to pull the latest policies from the management server.',
    os: 'Cross-platform',
    type: 'Bash',
    content: `#!/bin/bash
# Force MDM Sync — Cross-platform
# Detects macOS vs. Linux-based Windows (via uname) and triggers MDM enrollment sync

set -uo pipefail

OS="$(uname -s)"
echo "=== Force MDM Sync ==="
echo "Detected OS: $OS"
echo "Timestamp : $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo ""

if [[ "$OS" == "Darwin" ]]; then
  # ── macOS: Kandji + native MDM trigger ──────────────────────────────────

  echo "--- Kandji Agent Sync ---"
  if command -v kandji &>/dev/null; then
    echo "Running: sudo kandji agent run"
    sudo kandji agent run 2>&1 && echo "✔ Kandji agent run completed." || echo "✘ Kandji agent run failed (exit $?)."
  else
    echo "  Kandji agent binary not found — skipping."
  fi

  echo ""
  echo "--- Native MDM ConnectTrigger ---"
  echo "Running: sudo mdmclient ConnectTrigger NetworkAvailable"
  sudo mdmclient ConnectTrigger NetworkAvailable 2>&1 && echo "✔ MDM connect trigger sent." || echo "✘ mdmclient trigger failed (exit $?)."

  echo ""
  echo "--- Profiles (MDM enrollment check) ---"
  profiles status -type enrollment 2>&1 || true

elif [[ "$OS" == "MINGW"* ]] || [[ "$OS" == "CYGWIN"* ]] || [[ -f /proc/version ]] && grep -qi microsoft /proc/version 2>/dev/null; then
  # ── Windows (Git Bash / WSL) ─────────────────────────────────────────────

  echo "--- Windows MDM Enrollment Trigger ---"
  echo "Running: deviceenroller.exe /c /AutoEnrollMDM"
  # In a real deployment this runs via PowerShell; here we use the path directly
  Start-Process "C:\\Windows\\System32\\deviceenroller.exe" /c /AutoEnrollMDM -Wait 2>&1 || \
    echo "Note: deviceenroller invocation needs PowerShell context on Windows."

  echo ""
  echo "--- Intune Management Extension sync ---"
  # Also trigger Intune management extension if present
  if [[ -f "/c/Program Files (x86)/Microsoft Intune Management Extension/Microsoft.Management.Services.IntuneWindowsAgent.exe" ]]; then
    echo "Intune extension found — requesting sync."
  else
    echo "Intune extension path not found; sync triggered via deviceenroller only."
  fi

else
  echo "Unsupported OS: $OS — cannot determine MDM sync command."
  exit 1
fi

echo ""
echo "=== Sync Trigger Complete ==="
echo "Allow 2-5 minutes for policies to be applied."
`,
    version: 1,
    tags: ['mdm', 'sync', 'troubleshooting'],
    createdBy: 'avinash.verma@zinnia.com',
    createdAt: '2026-03-12T10:30:00.000Z',
    updatedAt: '2026-03-12T10:30:00.000Z',
    isDestructive: false,
    requiresApproval: false,
    minRole: 'Helpdesk',
    parameters: [],
    timeoutSeconds: 60,
    useCount: 112,
  },

  {
    id: 'system-inventory',
    name: 'System Hardware Inventory',
    description: 'Collects a comprehensive hardware inventory snapshot including CPU, RAM, disks, model, serial number, and BIOS version.',
    os: 'Windows',
    type: 'PowerShell',
    content: `# System Hardware Inventory
# Comprehensive inventory: CPU, RAM, disk, model, serial, BIOS

Write-Output "=== System Hardware Inventory ==="
Write-Output "Timestamp : $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ' -AsUTC)"
Write-Output "Hostname  : $env:COMPUTERNAME"
Write-Output ""

# ── System / Model ────────────────────────────────────────────────────────────
$cs = Get-CimInstance Win32_ComputerSystem
Write-Output "=== System ==="
Write-Output "  Manufacturer : $($cs.Manufacturer)"
Write-Output "  Model        : $($cs.Model)"
Write-Output "  Serial Number: $(( Get-CimInstance Win32_BIOS ).SerialNumber)"
Write-Output "  Domain       : $($cs.Domain)"
Write-Output "  Total RAM    : $([math]::Round($cs.TotalPhysicalMemory / 1GB, 2)) GB"
Write-Output ""

# ── CPU ───────────────────────────────────────────────────────────────────────
Write-Output "=== CPU ==="
Get-CimInstance Win32_Processor | ForEach-Object {
  Write-Output "  Name         : $($_.Name.Trim())"
  Write-Output "  Cores        : $($_.NumberOfCores)"
  Write-Output "  Logical Procs: $($_.NumberOfLogicalProcessors)"
  Write-Output "  Max Speed    : $($_.MaxClockSpeed) MHz"
  Write-Output "  Architecture : $($_.Architecture)"
}
Write-Output ""

# ── Memory DIMMs ──────────────────────────────────────────────────────────────
Write-Output "=== Memory Modules ==="
$memSlots = Get-CimInstance Win32_PhysicalMemory
if ($memSlots) {
  foreach ($m in $memSlots) {
    Write-Output "  Slot: $($m.DeviceLocator)  Size: $([math]::Round($m.Capacity/1GB,0)) GB  Speed: $($m.Speed) MHz  Manufacturer: $($m.Manufacturer)"
  }
} else {
  Write-Output "  (No DIMM data available — may be virtual machine)"
}
Write-Output ""

# ── Disk Drives ───────────────────────────────────────────────────────────────
Write-Output "=== Disk Drives ==="
Get-CimInstance Win32_DiskDrive | ForEach-Object {
  $sizeGB = [math]::Round($_.Size / 1GB, 1)
  Write-Output "  Model       : $($_.Model)"
  Write-Output "  Interface   : $($_.InterfaceType)"
  Write-Output "  Size        : $sizeGB GB"
  Write-Output "  Serial      : $($_.SerialNumber.Trim())"
  Write-Output "  Firmware    : $($_.FirmwareRevision)"
  Write-Output ""
}

# ── Logical Volumes ───────────────────────────────────────────────────────────
Write-Output "=== Logical Volumes ==="
Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
  $freeGB  = [math]::Round($_.FreeSpace / 1GB, 1)
  $totalGB = [math]::Round($_.Size / 1GB, 1)
  $usedPct = if ($_.Size -gt 0) { [math]::Round(100 - ($_.FreeSpace / $_.Size * 100), 1) } else { 0 }
  Write-Output "  Drive: $($_.DeviceID)  Total: $totalGB GB  Free: $freeGB GB  Used: $usedPct%  FS: $($_.FileSystem)"
}
Write-Output ""

# ── BIOS ──────────────────────────────────────────────────────────────────────
Write-Output "=== BIOS ==="
$bios = Get-CimInstance Win32_BIOS
Write-Output "  Manufacturer : $($bios.Manufacturer)"
Write-Output "  Version      : $($bios.SMBIOSBIOSVersion)"
Write-Output "  Release Date : $($bios.ReleaseDate)"
Write-Output ""

# ── OS ────────────────────────────────────────────────────────────────────────
Write-Output "=== Operating System ==="
$os = Get-CimInstance Win32_OperatingSystem
Write-Output "  Caption      : $($os.Caption)"
Write-Output "  Version      : $($os.Version)"
Write-Output "  Build        : $($os.BuildNumber)"
Write-Output "  Architecture : $($os.OSArchitecture)"
Write-Output "  Install Date : $($os.InstallDate)"
Write-Output "  Last Boot    : $($os.LastBootUpTime)"
Write-Output ""

Write-Output "=== Inventory Complete ==="
`,
    version: 2,
    tags: ['inventory', 'hardware', 'windows'],
    createdBy: 'avinash.verma@zinnia.com',
    createdAt: '2026-03-14T08:00:00.000Z',
    updatedAt: '2026-04-20T09:45:00.000Z',
    isDestructive: false,
    requiresApproval: false,
    minRole: 'Helpdesk',
    parameters: [],
    timeoutSeconds: 45,
    useCount: 61,
  },

  {
    id: 'clear-temp-files',
    name: 'Clear Temporary Files',
    description: 'Removes user and system temporary files from %TEMP% and Windows\\Temp. Reports total megabytes freed. Requires explicit confirmation.',
    os: 'Windows',
    type: 'PowerShell',
    content: `# Clear Temporary Files
# Cleans user TEMP and Windows TEMP directories and reports disk space freed.
# DESTRUCTIVE: files are permanently deleted.

param(
  [string]$ConfirmDeletion = "false"
)

if ($ConfirmDeletion -ne "true") {
  Write-Error "ConfirmDeletion must be set to 'true' to proceed. Aborting."
  exit 2
}

Write-Output "=== Clear Temporary Files ==="
Write-Output "Timestamp : $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ' -AsUTC)"
Write-Output "Host      : $env:COMPUTERNAME"
Write-Output "User      : $env:USERNAME"
Write-Output ""

$targets = @(
  [System.Environment]::GetEnvironmentVariable("TEMP", "User"),
  [System.Environment]::GetEnvironmentVariable("TEMP", "Machine"),
  "$env:SystemRoot\\Temp"
) | Sort-Object -Unique

$totalBytesFreed = 0
$totalFilesDeleted = 0
$totalErrors = 0

foreach ($dir in $targets) {
  if (-not (Test-Path $dir)) {
    Write-Output "Skipping (not found): $dir"
    continue
  }

  Write-Output "--- Cleaning: $dir ---"
  $files = Get-ChildItem -Path $dir -Recurse -Force -ErrorAction SilentlyContinue |
           Where-Object { -not $_.PSIsContainer }

  $dirBytes = 0
  $dirDeleted = 0
  $dirErrors = 0

  foreach ($file in $files) {
    try {
      $size = $file.Length
      Remove-Item -Path $file.FullName -Force -ErrorAction Stop
      $dirBytes    += $size
      $dirDeleted  += 1
    } catch {
      $dirErrors++
    }
  }

  $dirMB = [math]::Round($dirBytes / 1MB, 2)
  Write-Output "  Deleted : $dirDeleted files ($dirMB MB)"
  Write-Output "  Errors  : $dirErrors files in use / access denied"

  $totalBytesFreed   += $dirBytes
  $totalFilesDeleted += $dirDeleted
  $totalErrors       += $dirErrors
}

$totalMB = [math]::Round($totalBytesFreed / 1MB, 2)

Write-Output ""
Write-Output "=== Summary ==="
Write-Output "  Total files deleted : $totalFilesDeleted"
Write-Output "  Total space freed   : $totalMB MB"
Write-Output "  Skipped (in use)    : $totalErrors"
Write-Output ""
Write-Output "=== Cleanup Complete ==="
`,
    version: 1,
    tags: ['cleanup', 'disk', 'windows'],
    createdBy: 'avinash.verma@zinnia.com',
    createdAt: '2026-04-01T13:00:00.000Z',
    updatedAt: '2026-04-01T13:00:00.000Z',
    isDestructive: true,
    requiresApproval: false,
    minRole: 'IT Admin',
    parameters: [
      {
        name: 'confirmDeletion',
        label: 'Confirm Deletion',
        type: 'boolean',
        required: true,
        defaultValue: 'false',
      },
    ],
    timeoutSeconds: 120,
    useCount: 28,
  },

  {
    id: 'network-connectivity',
    name: 'Network Connectivity Test',
    description: 'Pings a target host, tests DNS resolution, and checks reachability of common MDM and cloud endpoints.',
    os: 'Cross-platform',
    type: 'Bash',
    content: `#!/bin/bash
# Network Connectivity Test
# Pings target, tests DNS, checks MDM endpoint reachability

set -uo pipefail

TARGET_HOST="\${1:-8.8.8.8}"
PACKET_COUNT="\${2:-4}"
OS="$(uname -s)"

echo "=== Network Connectivity Test ==="
echo "Target Host  : $TARGET_HOST"
echo "Packet Count : $PACKET_COUNT"
echo "Timestamp    : $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo ""

# ── Ping ──────────────────────────────────────────────────────────────────────
echo "--- Ping Test: $TARGET_HOST ---"
if [[ "$OS" == "Darwin" ]]; then
  ping -c "$PACKET_COUNT" -W 2000 "$TARGET_HOST" 2>&1 && PING_OK=true || PING_OK=false
else
  ping -c "$PACKET_COUNT" -W 2 "$TARGET_HOST" 2>&1 && PING_OK=true || PING_OK=false
fi

if $PING_OK; then
  echo "✔ Ping: REACHABLE"
else
  echo "✘ Ping: UNREACHABLE or packet loss detected"
fi

echo ""

# ── DNS Resolution ────────────────────────────────────────────────────────────
echo "--- DNS Resolution ---"
DNS_HOSTS=("google.com" "microsoft.com" "apple.com")

for host in "\${DNS_HOSTS[@]}"; do
  if nslookup "$host" >/dev/null 2>&1 || host "$host" >/dev/null 2>&1; then
    echo "  ✔ $host — resolved"
  else
    echo "  ✘ $host — FAILED"
  fi
done

echo ""

# ── MDM Endpoint Reachability (curl / nc) ────────────────────────────────────
echo "--- MDM & Cloud Endpoint Reachability ---"

MDM_ENDPOINTS=(
  "manage.microsoft.com:443"
  "graph.microsoft.com:443"
  "appserver.kandji.io:443"
  "device.kandji.io:443"
  "accounts.google.com:443"
)

for ep in "\${MDM_ENDPOINTS[@]}"; do
  HOST_PART="\${ep%:*}"
  PORT_PART="\${ep#*:}"
  if curl --silent --connect-timeout 3 --max-time 5 -o /dev/null \
       "https://$HOST_PART" 2>/dev/null; then
    echo "  ✔ $ep — reachable"
  elif command -v nc &>/dev/null && nc -z -w 3 "$HOST_PART" "$PORT_PART" 2>/dev/null; then
    echo "  ✔ $ep — port open"
  else
    echo "  ✘ $ep — UNREACHABLE"
  fi
done

echo ""

# ── Default Route ─────────────────────────────────────────────────────────────
echo "--- Routing ---"
if [[ "$OS" == "Darwin" ]]; then
  netstat -rn 2>/dev/null | grep "^default" | head -3 || true
else
  ip route show default 2>/dev/null || route -n 2>/dev/null | grep "^0.0.0.0" | head -3 || true
fi

echo ""
echo "=== Test Complete ==="
`,
    version: 1,
    tags: ['network', 'troubleshooting'],
    createdBy: 'avinash.verma@zinnia.com',
    createdAt: '2026-03-20T11:00:00.000Z',
    updatedAt: '2026-03-20T11:00:00.000Z',
    isDestructive: false,
    requiresApproval: false,
    minRole: 'Helpdesk',
    parameters: [
      {
        name: 'targetHost',
        label: 'Target Host',
        type: 'string',
        required: false,
        defaultValue: '8.8.8.8',
        placeholder: 'IP address or hostname',
      },
      {
        name: 'packetCount',
        label: 'Packet Count',
        type: 'number',
        required: false,
        defaultValue: '4',
        placeholder: 'Number of ping packets',
      },
    ],
    timeoutSeconds: 30,
    useCount: 74,
  },

  {
    id: 'installed-apps',
    name: 'List Installed Applications',
    description: 'Queries both 32-bit and 64-bit registry hives for installed applications and outputs a formatted table with name, version, publisher, and install date.',
    os: 'Windows',
    type: 'PowerShell',
    content: `# List Installed Applications
# Reads both 64-bit and 32-bit registry uninstall keys and formats output as a table

Write-Output "=== Installed Applications ==="
Write-Output "Host      : $env:COMPUTERNAME"
Write-Output "Timestamp : $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ' -AsUTC)"
Write-Output ""

$regPaths = @(
  "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
  "HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
  "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*"
)

$apps = foreach ($path in $regPaths) {
  if (Test-Path $path) {
    Get-ItemProperty -Path $path -ErrorAction SilentlyContinue |
      Where-Object { $_.DisplayName -and $_.DisplayName.Trim() -ne "" } |
      Select-Object -Property DisplayName, DisplayVersion, Publisher, InstallDate
  }
}

# Deduplicate by DisplayName + DisplayVersion
$unique = $apps |
  Sort-Object DisplayName |
  Sort-Object -Property DisplayName, DisplayVersion -Unique

Write-Output ("  {0,-55} {1,-20} {2,-35} {3}" -f "Application", "Version", "Publisher", "Installed")
Write-Output ("  {0,-55} {1,-20} {2,-35} {3}" -f ("-" * 54), ("-" * 19), ("-" * 34), ("-" * 10))

foreach ($app in $unique) {
  $name      = if ($app.DisplayName.Length -gt 54)    { $app.DisplayName.Substring(0,51) + "..." }    else { $app.DisplayName }
  $version   = if ($app.DisplayVersion.Length -gt 19) { $app.DisplayVersion.Substring(0,16) + "..." } else { $app.DisplayVersion ?? "" }
  $publisher = if ($app.Publisher.Length -gt 34)      { $app.Publisher.Substring(0,31) + "..." }      else { $app.Publisher ?? "" }
  $installed = $app.InstallDate ?? ""
  Write-Output ("  {0,-55} {1,-20} {2,-35} {3}" -f $name, $version, $publisher, $installed)
}

Write-Output ""
Write-Output "Total applications found: $($unique.Count)"
Write-Output ""
Write-Output "=== Inventory Complete ==="
`,
    version: 2,
    tags: ['software', 'inventory', 'windows'],
    createdBy: 'avinash.verma@zinnia.com',
    createdAt: '2026-03-18T10:00:00.000Z',
    updatedAt: '2026-05-02T08:30:00.000Z',
    isDestructive: false,
    requiresApproval: false,
    minRole: 'Helpdesk',
    parameters: [],
    timeoutSeconds: 60,
    useCount: 55,
  },

  {
    id: 'macos-security-posture',
    name: 'macOS Security Posture Check',
    description: 'Audits macOS security controls: SIP, Gatekeeper, XProtect version, Application Firewall, and Secure Boot (Apple Silicon).',
    os: 'macOS',
    type: 'Bash',
    content: `#!/bin/bash
# macOS Security Posture Check
# Audits SIP, Gatekeeper, XProtect, Application Firewall, and Secure Boot

set -uo pipefail

echo "=== macOS Security Posture Check ==="
echo "Host      : $(hostname)"
echo "macOS     : $(sw_vers -productVersion) ($(sw_vers -buildVersion))"
echo "Timestamp : $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo ""

# ── System Integrity Protection (SIP) ────────────────────────────────────────
echo "--- System Integrity Protection (SIP) ---"
SIP_STATUS=$(csrutil status 2>&1)
echo "  $SIP_STATUS"
if echo "$SIP_STATUS" | grep -q "enabled"; then
  echo "  ✔ SIP: ENABLED"
else
  echo "  ✘ SIP: DISABLED — security risk"
fi
echo ""

# ── Gatekeeper ────────────────────────────────────────────────────────────────
echo "--- Gatekeeper ---"
GK_STATUS=$(spctl --status 2>&1)
echo "  $GK_STATUS"
if echo "$GK_STATUS" | grep -q "assessments enabled"; then
  echo "  ✔ Gatekeeper: ENABLED"
else
  echo "  ✘ Gatekeeper: DISABLED — untrusted apps may run"
fi
echo ""

# ── XProtect ─────────────────────────────────────────────────────────────────
echo "--- XProtect (Malware Definitions) ---"
XPROTECT_PLIST="/System/Library/CoreServices/XProtect.bundle/Contents/Resources/XProtect.meta.plist"
if [[ -f "$XPROTECT_PLIST" ]]; then
  XP_VERSION=$(defaults read "$XPROTECT_PLIST" Version 2>/dev/null || echo "Unknown")
  XP_DATE=$(defaults read "$XPROTECT_PLIST" LastModification 2>/dev/null || echo "Unknown")
  echo "  Version         : $XP_VERSION"
  echo "  Last Modified   : $XP_DATE"
  echo "  ✔ XProtect: INSTALLED"
else
  echo "  ✘ XProtect plist not found"
fi
echo ""

# ── Application Firewall ──────────────────────────────────────────────────────
echo "--- Application Firewall ---"
FW_STATUS=$(/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>&1)
echo "  $FW_STATUS"
if echo "$FW_STATUS" | grep -qi "enabled"; then
  echo "  ✔ Application Firewall: ENABLED"

  # Stealth mode
  STEALTH=$(/usr/libexec/ApplicationFirewall/socketfilterfw --getstealthmode 2>&1)
  if echo "$STEALTH" | grep -qi "enabled"; then
    echo "  ✔ Stealth Mode: ENABLED"
  else
    echo "  ⚠ Stealth Mode: DISABLED"
  fi
else
  echo "  ✘ Application Firewall: DISABLED"
fi
echo ""

# ── Secure Boot (Apple Silicon / T2 only) ────────────────────────────────────
echo "--- Secure Boot ---"
CHIP=$(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo "")
ARCH=$(uname -m)
if [[ "$ARCH" == "arm64" ]]; then
  echo "  Chip: Apple Silicon ($ARCH)"
  # bputil is available on Apple Silicon
  if command -v bputil &>/dev/null; then
    BOOT_INFO=$(bputil -d 2>&1 | grep -E "Secure Boot|LocalPolicy" | head -5 || true)
    echo "$BOOT_INFO" | while IFS= read -r line; do echo "  $line"; done
  else
    echo "  bputil not available in this context."
  fi
elif echo "$CHIP" | grep -qi "T2"; then
  echo "  Chip: Intel with T2 Security Chip"
  echo "  (Use Startup Security Utility to verify Secure Boot level)"
else
  echo "  Chip: Intel — no T2 / Apple Silicon; Secure Boot not applicable"
fi
echo ""

# ── Remote Login / SSH ────────────────────────────────────────────────────────
echo "--- Remote Services ---"
SSH_STATE=$(systemsetup -getremotelogin 2>/dev/null || launchctl list com.openssh.sshd 2>/dev/null && echo "On" || echo "Off")
echo "  Remote Login (SSH): $SSH_STATE"
echo ""

echo "=== Security Posture Check Complete ==="
`,
    version: 1,
    tags: ['security', 'compliance', 'macos'],
    createdBy: 'avinash.verma@zinnia.com',
    createdAt: '2026-04-05T09:00:00.000Z',
    updatedAt: '2026-04-05T09:00:00.000Z',
    isDestructive: false,
    requiresApproval: false,
    minRole: 'Helpdesk',
    parameters: [],
    timeoutSeconds: 30,
    useCount: 39,
  },

  {
    id: 'restart-mdm-agent',
    name: 'Restart MDM Agent',
    description: 'Stops and restarts the Kandji MDM agent via launchctl, logging status before and after the restart cycle.',
    os: 'macOS',
    type: 'Bash',
    content: `#!/bin/bash
# Restart MDM Agent (Kandji)
# Stops and restarts the Kandji agent daemon via launchctl

set -uo pipefail

KANDJI_DAEMON="io.kandji.KandjiAgent"
KANDJI_PLIST="/Library/LaunchDaemons/io.kandji.KandjiAgent.plist"

echo "=== Restart MDM Agent (Kandji) ==="
echo "Host      : $(hostname)"
echo "Timestamp : $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo ""

# ── Pre-restart status ────────────────────────────────────────────────────────
echo "--- Agent Status (Before) ---"
PRE_STATUS=$(launchctl list "$KANDJI_DAEMON" 2>&1 || echo "Not running / not found")
echo "$PRE_STATUS"
echo ""

# ── Verify plist exists ───────────────────────────────────────────────────────
if [[ ! -f "$KANDJI_PLIST" ]]; then
  echo "✘ Launch daemon plist not found at: $KANDJI_PLIST"
  echo "  Kandji may not be installed. Aborting."
  exit 1
fi

# ── Stop the agent ────────────────────────────────────────────────────────────
echo "--- Stopping Kandji Agent ---"
if sudo launchctl bootout system "$KANDJI_PLIST" 2>&1; then
  echo "✔ Agent stopped via launchctl bootout."
else
  # Fallback: try legacy unload
  echo "  bootout failed; trying launchctl unload..."
  sudo launchctl unload -w "$KANDJI_PLIST" 2>&1 || echo "  unload also failed — agent may not have been running."
fi
echo ""

# Brief pause to allow process to fully exit
sleep 2

# ── Verify stopped ────────────────────────────────────────────────────────────
STOPPED_CHECK=$(launchctl list "$KANDJI_DAEMON" 2>&1 || echo "not running")
if echo "$STOPPED_CHECK" | grep -q "not running\|Could not find"; then
  echo "✔ Confirmed: agent is stopped."
else
  echo "  Agent may still be present in launchctl list:"
  echo "  $STOPPED_CHECK"
fi
echo ""

# ── Start the agent ───────────────────────────────────────────────────────────
echo "--- Starting Kandji Agent ---"
if sudo launchctl bootstrap system "$KANDJI_PLIST" 2>&1; then
  echo "✔ Agent started via launchctl bootstrap."
else
  # Fallback: legacy load
  echo "  bootstrap failed; trying launchctl load..."
  sudo launchctl load -w "$KANDJI_PLIST" 2>&1 || { echo "✘ Failed to start agent. Manual intervention required."; exit 1; }
fi
echo ""

# Allow agent to initialise
sleep 3

# ── Post-restart status ───────────────────────────────────────────────────────
echo "--- Agent Status (After) ---"
POST_STATUS=$(launchctl list "$KANDJI_DAEMON" 2>&1 || echo "Not running / not found")
echo "$POST_STATUS"
echo ""

if launchctl list "$KANDJI_DAEMON" &>/dev/null; then
  echo "✔ Kandji MDM agent is running."
else
  echo "✘ Agent does not appear to be running after restart. Check system logs."
  exit 1
fi

echo ""
echo "=== Restart Complete ==="
echo "Allow 60-120 seconds for the agent to check in with Kandji."
`,
    version: 1,
    tags: ['mdm', 'troubleshooting', 'macos'],
    createdBy: 'avinash.verma@zinnia.com',
    createdAt: '2026-04-10T14:00:00.000Z',
    updatedAt: '2026-04-10T14:00:00.000Z',
    isDestructive: false,
    requiresApproval: false,
    minRole: 'IT Admin',
    parameters: [],
    timeoutSeconds: 30,
    useCount: 22,
  },
]

// ── Mock Executions ───────────────────────────────────────────────────────────

export const MOCK_EXECUTIONS: ScriptExecution[] = [
  {
    id: 'exec-001',
    scriptId: 'filevault-check',
    scriptName: 'FileVault Status Check',
    scriptVersion: 2,
    deviceId: 'kandji-mac-001',
    deviceName: 'MBP-JSMITH-001',
    platform: 'macOS',
    managementSource: 'Kandji',
    status: 'completed',
    exitCode: 0,
    stdout: `=== FileVault Encryption Status ===

FileVault Status: FileVault is On.

✔ Encryption: ENABLED

=== Recovery Key Escrow ===
✔ Institutional recovery key: PRESENT
✔ Personal recovery key: ESCROWED

=== User Accounts with FileVault Access ===
  User: jsmith  UUID: A3F92CB1-4D2E-4A91-BB3C-7E1F0A2D9C45
  User: localadmin  UUID: B7E14DC2-8A3F-4B12-CC9D-1F3E7B4A0D22

=== Check Complete ===
Timestamp: 2026-05-10T08:14:23Z`,
    runtimeMs: 2841,
    startedAt: '2026-05-10T08:14:20.000Z',
    completedAt: '2026-05-10T08:14:23.000Z',
    executedBy: 'avinash.verma@zinnia.com',
  },

  {
    id: 'exec-002',
    scriptId: 'bitlocker-status',
    scriptName: 'BitLocker Volume Status',
    scriptVersion: 3,
    deviceId: 'intune-win-042',
    deviceName: 'CORP-LAPTOP-042',
    platform: 'Windows',
    managementSource: 'Microsoft Intune',
    status: 'completed',
    exitCode: 0,
    stdout: `=== BitLocker Volume Status ===
Drive: C:
Timestamp: 2026-05-10T10:32:11Z

Protection Status : ✔ PROTECTED
Encryption Status : Fully Encrypted
Encryption Method : XtsAes256
Encryption %      : 100%
Lock Status       : Unlocked

=== Key Protectors ===
  Type: Tpm  ID: {A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
  Type: RecoveryPassword  ID: {09876543-21FE-DCBA-9876-543210FEDCBA}
  Type: TpmPin  ID: {11223344-5566-7788-99AA-BBCCDDEEFF00}

✔ Recovery password protector is present.

=== Check Complete ===`,
    runtimeMs: 3102,
    startedAt: '2026-05-10T10:32:08.000Z',
    completedAt: '2026-05-10T10:32:11.000Z',
    executedBy: 'avinash.verma@zinnia.com',
    parameters: { driveLetter: 'C:' },
  },

  {
    id: 'exec-003',
    scriptId: 'mdm-force-sync',
    scriptName: 'Force MDM Sync',
    scriptVersion: 1,
    deviceId: 'kandji-mac-007',
    deviceName: 'MBP-RLOPEZ-007',
    platform: 'macOS',
    managementSource: 'Kandji',
    status: 'completed',
    exitCode: 0,
    stdout: `=== Force MDM Sync ===
Detected OS: Darwin
Timestamp : 2026-05-10T13:45:00Z

--- Kandji Agent Sync ---
Running: sudo kandji agent run
2026-05-10 13:45:01 [INFO] Kandji agent starting run...
2026-05-10 13:45:02 [INFO] Checking in with Kandji cloud...
2026-05-10 13:45:04 [INFO] Retrieving blueprint assignments...
2026-05-10 13:45:05 [INFO] 3 library items up to date.
2026-05-10 13:45:06 [INFO] Run complete.
✔ Kandji agent run completed.

--- Native MDM ConnectTrigger ---
Running: sudo mdmclient ConnectTrigger NetworkAvailable
Daemon: com.apple.mdmclient
MDM connection trigger sent successfully.
✔ MDM connect trigger sent.

--- Profiles (MDM enrollment check) ---
Enrolled via DEP: Yes
MDM enrollment: Yes
MDM server URL: https://a.kandji.io/mdm

=== Sync Trigger Complete ===
Allow 2-5 minutes for policies to be applied.`,
    runtimeMs: 7214,
    startedAt: '2026-05-10T13:45:00.000Z',
    completedAt: '2026-05-10T13:45:07.000Z',
    executedBy: 'helpdesk.admin@zinnia.com',
  },

  {
    id: 'exec-004',
    scriptId: 'system-inventory',
    scriptName: 'System Hardware Inventory',
    scriptVersion: 2,
    deviceId: 'intune-win-019',
    deviceName: 'CORP-DESKTOP-019',
    platform: 'Windows',
    managementSource: 'Microsoft Intune',
    status: 'completed',
    exitCode: 0,
    stdout: `=== System Hardware Inventory ===
Timestamp : 2026-05-09T16:20:05Z
Hostname  : CORP-DESKTOP-019

=== System ===
  Manufacturer : Dell Inc.
  Model        : OptiPlex 7090
  Serial Number: 8XK2T4J
  Domain       : corp.zinnia.com
  Total RAM    : 16 GB

=== CPU ===
  Name         : Intel(R) Core(TM) i7-10700 CPU @ 2.90GHz
  Cores        : 8
  Logical Procs: 16
  Max Speed    : 2904 MHz
  Architecture : 9

=== Memory Modules ===
  Slot: DIMM A1  Size: 8 GB  Speed: 3200 MHz  Manufacturer: Samsung
  Slot: DIMM B1  Size: 8 GB  Speed: 3200 MHz  Manufacturer: Samsung

=== Disk Drives ===
  Model       : Samsung SSD 870 EVO 512GB
  Interface   : SCSI
  Size        : 512.1 GB
  Serial      : S59BNXAK123456
  Firmware    : SVT01B6Q

=== Logical Volumes ===
  Drive: C:  Total: 476.8 GB  Free: 201.4 GB  Used: 57.8%  FS: NTFS

=== BIOS ===
  Manufacturer : Dell Inc.
  Version      : 1.14.0
  Release Date : 2024-11-12T00:00:00Z

=== Operating System ===
  Caption      : Microsoft Windows 11 Pro
  Version      : 10.0.22631
  Build        : 22631
  Architecture : 64-bit
  Install Date : 2025-01-15T09:22:00Z
  Last Boot    : 2026-05-09T07:05:11Z

=== Inventory Complete ===`,
    runtimeMs: 11450,
    startedAt: '2026-05-09T16:19:54.000Z',
    completedAt: '2026-05-09T16:20:05.000Z',
    executedBy: 'avinash.verma@zinnia.com',
  },

  {
    id: 'exec-005',
    scriptId: 'network-connectivity',
    scriptName: 'Network Connectivity Test',
    scriptVersion: 1,
    deviceId: 'kandji-mac-003',
    deviceName: 'MBP-KPATEL-003',
    platform: 'macOS',
    managementSource: 'Kandji',
    status: 'failed',
    exitCode: 1,
    stdout: `=== Network Connectivity Test ===
Target Host  : 8.8.8.8
Packet Count : 4
Timestamp    : 2026-05-10T07:02:44Z

--- Ping Test: 8.8.8.8 ---
PING 8.8.8.8 (8.8.8.8): 56 data bytes
Request timeout for icmp_seq 0
Request timeout for icmp_seq 1
Request timeout for icmp_seq 2
Request timeout for icmp_seq 3

--- 8.8.8.8 ping statistics ---
4 packets transmitted, 0 packets received, 100.0% packet loss
✘ Ping: UNREACHABLE or packet loss detected`,
    stderr: `ping: connect: Network is unreachable
MDM endpoint reachability check skipped due to connectivity failure.
DNS resolution also failed — device appears to have no network access.`,
    runtimeMs: 14032,
    startedAt: '2026-05-10T07:02:44.000Z',
    completedAt: '2026-05-10T07:02:58.000Z',
    executedBy: 'helpdesk.admin@zinnia.com',
    parameters: { targetHost: '8.8.8.8', packetCount: '4' },
  },

  {
    id: 'exec-006',
    scriptId: 'macos-security-posture',
    scriptName: 'macOS Security Posture Check',
    scriptVersion: 1,
    deviceId: 'kandji-mac-011',
    deviceName: 'MBP-DCHEN-011',
    platform: 'macOS',
    managementSource: 'Kandji',
    status: 'completed',
    exitCode: 0,
    stdout: `=== macOS Security Posture Check ===
Host      : MBP-DCHEN-011.local
macOS     : 14.4.1 (23E224)
Timestamp : 2026-05-09T22:10:33Z

--- System Integrity Protection (SIP) ---
  System Integrity Protection status: enabled.
  ✔ SIP: ENABLED

--- Gatekeeper ---
  assessments enabled
  ✔ Gatekeeper: ENABLED

--- XProtect (Malware Definitions) ---
  Version         : 2194
  Last Modified   : 2026-04-28 03:14:09 +0000
  ✔ XProtect: INSTALLED

--- Application Firewall ---
  Firewall is enabled. (State = 1)
  ✔ Application Firewall: ENABLED
  ✔ Stealth Mode: ENABLED

--- Secure Boot ---
  Chip: Apple Silicon (arm64)
  LocalPolicy: present
  Secure Boot: Full Security

--- Remote Services ---
  Remote Login (SSH): Off

=== Security Posture Check Complete ===`,
    runtimeMs: 4876,
    startedAt: '2026-05-09T22:10:28.000Z',
    completedAt: '2026-05-09T22:10:33.000Z',
    executedBy: 'avinash.verma@zinnia.com',
  },

  {
    id: 'exec-007',
    scriptId: 'restart-mdm-agent',
    scriptName: 'Restart MDM Agent',
    scriptVersion: 1,
    deviceId: 'kandji-mac-005',
    deviceName: 'MBP-AWILSON-005',
    platform: 'macOS',
    managementSource: 'Kandji',
    status: 'completed',
    exitCode: 0,
    stdout: `=== Restart MDM Agent (Kandji) ===
Host      : MBP-AWILSON-005.local
Timestamp : 2026-05-10T15:30:00Z

--- Agent Status (Before) ---
PID   Status   Label
723   0        io.kandji.KandjiAgent

--- Stopping Kandji Agent ---
✔ Agent stopped via launchctl bootout.

✔ Confirmed: agent is stopped.

--- Starting Kandji Agent ---
✔ Agent started via launchctl bootstrap.

--- Agent Status (After) ---
PID    Status   Label
1204   0        io.kandji.KandjiAgent

✔ Kandji MDM agent is running.

=== Restart Complete ===
Allow 60-120 seconds for the agent to check in with Kandji.`,
    runtimeMs: 8523,
    startedAt: '2026-05-10T15:30:00.000Z',
    completedAt: '2026-05-10T15:30:08.000Z',
    executedBy: 'avinash.verma@zinnia.com',
  },

  {
    id: 'exec-008',
    scriptId: 'installed-apps',
    scriptName: 'List Installed Applications',
    scriptVersion: 2,
    deviceId: 'intune-win-055',
    deviceName: 'CORP-LAPTOP-055',
    platform: 'Windows',
    managementSource: 'Microsoft Intune',
    status: 'failed',
    exitCode: 1,
    stdout: `=== Installed Applications ===
Host      : CORP-LAPTOP-055
Timestamp : 2026-05-10T09:45:02Z

Querying registry hive: HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*`,
    stderr: `Get-ItemProperty: Access to the registry key 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall' is denied.
At line:12 char:3
+ Get-ItemProperty -Path $path -ErrorAction Stop |
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : PermissionDenied: (HKEY_LOCAL_MACHINE\\...Uninstall:String) [Get-ItemProperty], SecurityException
    + FullyQualifiedErrorId : System.Security.SecurityException,Microsoft.PowerShell.Commands.GetItemPropertyCommand

Script failed: Insufficient permissions. Run under SYSTEM or local admin context.`,
    runtimeMs: 1240,
    startedAt: '2026-05-10T09:45:01.000Z',
    completedAt: '2026-05-10T09:45:02.000Z',
    executedBy: 'helpdesk.admin@zinnia.com',
  },
]

// ── Mutable In-Memory Stores ──────────────────────────────────────────────────

export let scriptStore: Script[] = [...MOCK_SCRIPTS]
export let executionStore: ScriptExecution[] = [...MOCK_EXECUTIONS]

// ── Store Functions ───────────────────────────────────────────────────────────

export function getScripts(): Script[] {
  return scriptStore
}

export function getScriptById(id: string): Script | undefined {
  return scriptStore.find(s => s.id === id)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createScript(data: Record<string, any>): Script {
  const now = new Date().toISOString()
  const script: Script = {
    ...(data as Omit<Script, 'id' | 'createdAt' | 'updatedAt' | 'useCount'>),
    id: `script-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
    useCount: 0,
  }
  scriptStore.push(script)
  return script
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function updateScript(id: string, data: Record<string, any>): Script | undefined {
  const idx = scriptStore.findIndex(s => s.id === id)
  if (idx === -1) return undefined
  const updated: Script = {
    ...scriptStore[idx]!,
    ...(data as Partial<Script>),
    id,
    updatedAt: new Date().toISOString(),
  }
  scriptStore[idx] = updated
  return updated
}

export function deleteScript(id: string): boolean {
  const before = scriptStore.length
  scriptStore = scriptStore.filter(s => s.id !== id)
  return scriptStore.length < before
}

export interface ExecutionFilters {
  deviceId?: string | undefined
  scriptId?: string | undefined
  status?: ScriptExecution['status'] | undefined
  limit?: number | undefined
}

export function getExecutions(filters?: ExecutionFilters): ScriptExecution[] {
  let results = executionStore
  if (filters?.deviceId) results = results.filter(e => e.deviceId === filters.deviceId)
  if (filters?.scriptId) results = results.filter(e => e.scriptId === filters.scriptId)
  if (filters?.status)   results = results.filter(e => e.status === filters.status)
  const limit = filters?.limit ?? 100
  return results.slice(-limit).reverse()
}

export function getExecutionById(id: string): ScriptExecution | undefined {
  return executionStore.find(e => e.id === id)
}

export function createExecution(data: Omit<ScriptExecution, 'id'>): ScriptExecution {
  const execution: ScriptExecution = {
    ...data,
    id: `exec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  }
  executionStore.push(execution)
  return execution
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function updateExecution(id: string, data: Record<string, any>): ScriptExecution | undefined {
  const idx = executionStore.findIndex(e => e.id === id)
  if (idx === -1) return undefined
  const updated: ScriptExecution = { ...executionStore[idx]!, ...(data as Partial<ScriptExecution>), id }
  executionStore[idx] = updated
  return updated
}
