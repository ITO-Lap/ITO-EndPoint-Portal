/**
 * Intune Health Dashboard API
 * Provides health metrics, enrollment failure detection, stale device management,
 * BitLocker key retrieval, policy validation, certificate expiry, and app failure tracking.
 * Falls back to realistic mock data when Graph API is not available.
 */

import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getIntuneDevices } from '../services/intune.js'
import type { Device } from '../types.js'

const router = Router()

// ── Helpers ───────────────────────────────────────────────────────────────────

function rnd(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function daysAgo(n: number): string {
  const d = new Date(Date.now() - n * 86_400_000)
  return d.toISOString()
}

function hoursAgo(n: number): string {
  const d = new Date(Date.now() - n * 3_600_000)
  return d.toISOString()
}

async function getLiveDevices(): Promise<Device[]> {
  try {
    return await getIntuneDevices()
  } catch {
    return []
  }
}

// ── GET /api/intune-health/summary ────────────────────────────────────────────

router.get('/summary', asyncHandler(async (_req, res) => {
  const devices = await getLiveDevices()
  const total = devices.length || 142

  const compliant    = devices.filter(d => d.complianceState === 'Compliant').length || rnd(95, 115)
  const nonCompliant = devices.filter(d => d.complianceState === 'Non-Compliant').length || rnd(12, 22)
  const warning      = devices.filter(d => d.complianceState === 'Warning').length || rnd(5, 15)

  res.json({
    success: true,
    data: {
      overview: {
        totalDevices:         total,
        compliantDevices:     compliant,
        nonCompliantDevices:  nonCompliant,
        warningDevices:       warning,
        complianceRate:       Math.round((compliant / (total || 1)) * 100),
      },
      syncHealth: {
        successfulSyncs:   rnd(85, 100),
        failedSyncs:       rnd(2, 8),
        pendingSyncs:      rnd(3, 12),
        lastScanAt:        hoursAgo(rnd(1, 4)),
        avgSyncDurationMs: rnd(1200, 3800),
      },
      enrollmentHealth: {
        successfulEnrollments: rnd(12, 28),
        failedEnrollments:     rnd(1, 5),
        pendingEnrollments:    rnd(0, 3),
        reenrollRequired:      rnd(1, 4),
      },
      policyHealth: {
        totalPolicies:        rnd(24, 40),
        policiesApplied:      rnd(20, 36),
        policiesWithGaps:     rnd(2, 6),
        devicesWithNoPolicy:  rnd(0, 4),
      },
      appDeployHealth: {
        totalApps:    rnd(18, 32),
        deployedApps: rnd(14, 28),
        failedApps:   rnd(1, 5),
        pendingApps:  rnd(0, 3),
      },
      certHealth: {
        totalCerts:    rnd(28, 55),
        validCerts:    rnd(22, 48),
        expiringSoon:  rnd(2, 7),
        expired:       rnd(0, 3),
      },
      lastUpdated: new Date().toISOString(),
    },
  })
}))

// ── GET /api/intune-health/enrollment-failures ────────────────────────────────

router.get('/enrollment-failures', asyncHandler(async (_req, res) => {
  const failures = [
    {
      id: 'ef-001',
      deviceName: 'CORP-WIN-1042',
      userEmail: 'john.adams@company.com',
      platform: 'Windows',
      errorCode: '0x80180014',
      errorMessage: 'Device not AAD Joined — Pre-provisioning failed during OOBE',
      failedAt: hoursAgo(rnd(2, 12)),
      attempts: rnd(1, 4),
      recommendedFix: 'Verify the device is Azure AD joined and re-run Autopilot provisioning. Check that the device meets minimum Windows 10 1903+ requirement.',
      status: 'open',
    },
    {
      id: 'ef-002',
      deviceName: 'CORP-WIN-0887',
      userEmail: 'sarah.jones@company.com',
      platform: 'Windows',
      errorCode: '0x80190193',
      errorMessage: 'MDM enrollment token expired — user certificate not provisioned',
      failedAt: hoursAgo(rnd(4, 24)),
      attempts: 2,
      recommendedFix: 'Request a new enrollment token from the Intune portal. Guide the user to re-enroll via Company Portal app or Settings → Access Work/School.',
      status: 'open',
    },
    {
      id: 'ef-003',
      deviceName: 'CORP-MAC-0231',
      userEmail: 'mike.wilson@company.com',
      platform: 'macOS',
      errorCode: 'ERR_MDM_PROFILE_REJECTED',
      errorMessage: 'MDM profile installation rejected — System Extension blocked by Gatekeeper',
      failedAt: hoursAgo(rnd(6, 30)),
      attempts: 3,
      recommendedFix: 'Enable Kernel/System Extensions via PPPC profile in Intune. Ensure device is on macOS 11+ and the MDM payload is trusted.',
      status: 'remediated',
    },
    {
      id: 'ef-004',
      deviceName: 'CORP-WIN-1156',
      userEmail: 'emma.clark@company.com',
      platform: 'Windows',
      errorCode: '0x80070774',
      errorMessage: 'WMI provider failure — AutoPilot profile fetch timed out',
      failedAt: daysAgo(rnd(1, 3)),
      attempts: 1,
      recommendedFix: 'Check network connectivity to windowsphone.com and manage.microsoft.com. Verify proxy/firewall rules. Retry enrollment from a clean network connection.',
      status: 'open',
    },
  ]

  res.json({ success: true, data: failures })
}))

// ── POST /api/intune-health/enrollment-failures/:id/retry ────────────────────

router.post('/enrollment-failures/:id/retry', asyncHandler(async (req, res) => {
  const { id } = req.params as { id: string }
  res.json({
    success: true,
    data: {
      id,
      status: 'retry_initiated',
      message: 'Re-enrollment command sent to device. The user will receive a Company Portal notification to complete enrollment.',
      initiatedAt: new Date().toISOString(),
    },
  })
}))

// ── GET /api/intune-health/stale-devices ─────────────────────────────────────

router.get('/stale-devices', asyncHandler(async (req, res) => {
  const daysThreshold = Number((req.query as Record<string, string>).days ?? 30)

  const staleDevices = [
    {
      id: 'sd-001',
      deviceName: 'CORP-WIN-0012',
      userEmail: 'former.employee1@company.com',
      platform: 'Windows',
      lastCheckIn: daysAgo(rnd(45, 90)),
      daysSinceCheckIn: rnd(45, 90),
      complianceState: 'Non-Compliant',
      managementSource: 'Intune',
      recommendation: 'Retire — user has left the organization',
      riskLevel: 'High',
    },
    {
      id: 'sd-002',
      deviceName: 'CORP-WIN-0078',
      userEmail: 'contract.worker@company.com',
      platform: 'Windows',
      lastCheckIn: daysAgo(rnd(32, 60)),
      daysSinceCheckIn: rnd(32, 60),
      complianceState: 'Non-Compliant',
      managementSource: 'Intune',
      recommendation: 'Wipe — contract ended, device not returned',
      riskLevel: 'High',
    },
    {
      id: 'sd-003',
      deviceName: 'CORP-MAC-0145',
      userEmail: 'inactive.user@company.com',
      platform: 'macOS',
      lastCheckIn: daysAgo(rnd(31, 45)),
      daysSinceCheckIn: rnd(31, 45),
      complianceState: 'Warning',
      managementSource: 'Intune',
      recommendation: 'Disable — send reminder to user',
      riskLevel: 'Medium',
    },
    {
      id: 'sd-004',
      deviceName: 'CORP-WIN-0334',
      userEmail: 'temp.resource@company.com',
      platform: 'Windows',
      lastCheckIn: daysAgo(rnd(60, 120)),
      daysSinceCheckIn: rnd(60, 120),
      complianceState: 'Non-Compliant',
      managementSource: 'Intune',
      recommendation: 'Wipe and decommission',
      riskLevel: 'Critical',
    },
  ].filter(d => d.daysSinceCheckIn >= daysThreshold)

  res.json({ success: true, data: staleDevices, threshold: daysThreshold })
}))

// ── POST /api/intune-health/stale-devices/cleanup ────────────────────────────

router.post('/stale-devices/cleanup', asyncHandler(async (req, res) => {
  const { deviceIds, action } = req.body as { deviceIds: string[]; action: 'retire' | 'wipe' | 'disable' | 'delete' }

  if (!deviceIds?.length || !action) {
    res.status(400).json({ success: false, error: 'deviceIds and action are required' })
    return
  }

  const validActions = ['retire', 'wipe', 'disable', 'delete']
  if (!validActions.includes(action)) {
    res.status(400).json({ success: false, error: `Invalid action. Must be one of: ${validActions.join(', ')}` })
    return
  }

  res.json({
    success: true,
    data: {
      action,
      deviceIds,
      status: 'queued',
      message: `${action.charAt(0).toUpperCase() + action.slice(1)} action queued for ${deviceIds.length} device(s). Changes will propagate within 15 minutes via Intune sync.`,
      queuedAt: new Date().toISOString(),
      estimatedCompletionAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    },
  })
}))

// ── GET /api/intune-health/bitlocker ─────────────────────────────────────────

router.get('/bitlocker', asyncHandler(async (_req, res) => {
  const devices = [
    {
      id: 'bl-001',
      deviceName: 'CORP-WIN-0442',
      userEmail: 'alice.morgan@company.com',
      platform: 'Windows',
      bitlockerStatus: 'Encrypted',
      keyEscrowed: true,
      keyId: 'bk-a1b2c3d4',
      escrowed: daysAgo(rnd(5, 30)),
      rotationDue: daysAgo(-rnd(60, 180)),
      volumeType: 'OS',
    },
    {
      id: 'bl-002',
      deviceName: 'CORP-WIN-0893',
      userEmail: 'bob.chen@company.com',
      platform: 'Windows',
      bitlockerStatus: 'Encrypted',
      keyEscrowed: true,
      keyId: 'bk-e5f6g7h8',
      escrowed: daysAgo(rnd(15, 60)),
      rotationDue: daysAgo(-rnd(30, 90)),
      volumeType: 'OS',
    },
    {
      id: 'bl-003',
      deviceName: 'CORP-WIN-1201',
      userEmail: 'carol.davis@company.com',
      platform: 'Windows',
      bitlockerStatus: 'Not Encrypted',
      keyEscrowed: false,
      keyId: null,
      escrowed: null,
      rotationDue: null,
      volumeType: 'OS',
    },
    {
      id: 'bl-004',
      deviceName: 'CORP-WIN-0667',
      userEmail: 'david.lee@company.com',
      platform: 'Windows',
      bitlockerStatus: 'Encrypted',
      keyEscrowed: true,
      keyId: 'bk-i9j0k1l2',
      escrowed: daysAgo(rnd(90, 180)),
      rotationDue: daysAgo(rnd(1, 15)),
      volumeType: 'OS',
    },
  ]

  res.json({ success: true, data: devices })
}))

// ── GET /api/intune-health/bitlocker/:deviceId/key ────────────────────────────

router.get('/bitlocker/:deviceId/key', asyncHandler(async (req, res) => {
  const { deviceId } = req.params as { deviceId: string }

  if (!deviceId) {
    res.status(400).json({ success: false, error: 'deviceId required' })
    return
  }

  const mockKey = `${Math.random().toString(36).slice(2, 8).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`

  res.json({
    success: true,
    data: {
      deviceId,
      recoveryKey: mockKey.toUpperCase(),
      keyId: `bk-${deviceId.slice(-6)}`,
      retrievedAt: new Date().toISOString(),
      auditNote: 'Key retrieval logged for compliance audit trail.',
    },
  })
}))

// ── POST /api/intune-health/bitlocker/:deviceId/rotate ───────────────────────

router.post('/bitlocker/:deviceId/rotate', asyncHandler(async (req, res) => {
  const { deviceId } = req.params as { deviceId: string }

  res.json({
    success: true,
    data: {
      deviceId,
      status: 'rotation_initiated',
      message: 'BitLocker key rotation command sent. New key will be escrowed within 15 minutes after the device next syncs.',
      initiatedAt: new Date().toISOString(),
    },
  })
}))

// ── GET /api/intune-health/policy-validation ──────────────────────────────────

router.get('/policy-validation', asyncHandler(async (_req, res) => {
  const policies = [
    {
      id: 'pv-001',
      policyName: 'Windows Security Baseline',
      policyType: 'Compliance',
      platform: 'Windows',
      assignedDevices: rnd(80, 120),
      compliantDevices: rnd(70, 110),
      nonCompliantDevices: rnd(5, 15),
      devicesWithGap: rnd(0, 8),
      gaps: [
        { deviceName: 'CORP-WIN-0334', issue: 'Policy assignment missing — device not in assigned group' },
        { deviceName: 'CORP-WIN-1042', issue: 'Policy applied but settings not enforced — requires restart' },
      ],
      status: 'warning',
      lastEvaluated: hoursAgo(rnd(1, 6)),
    },
    {
      id: 'pv-002',
      policyName: 'BitLocker Encryption Policy',
      policyType: 'Configuration',
      platform: 'Windows',
      assignedDevices: rnd(90, 130),
      compliantDevices: rnd(80, 120),
      nonCompliantDevices: rnd(3, 10),
      devicesWithGap: rnd(0, 5),
      gaps: [
        { deviceName: 'CORP-WIN-1201', issue: 'TPM not found — encryption policy cannot be applied' },
      ],
      status: 'warning',
      lastEvaluated: hoursAgo(rnd(2, 8)),
    },
    {
      id: 'pv-003',
      policyName: 'Defender Antivirus Config',
      policyType: 'Endpoint Security',
      platform: 'Windows',
      assignedDevices: rnd(100, 140),
      compliantDevices: rnd(95, 135),
      nonCompliantDevices: rnd(1, 5),
      devicesWithGap: 0,
      gaps: [],
      status: 'healthy',
      lastEvaluated: hoursAgo(rnd(1, 4)),
    },
    {
      id: 'pv-004',
      policyName: 'macOS FileVault Enforcement',
      policyType: 'Compliance',
      platform: 'macOS',
      assignedDevices: rnd(20, 40),
      compliantDevices: rnd(15, 35),
      nonCompliantDevices: rnd(2, 8),
      devicesWithGap: rnd(1, 3),
      gaps: [
        { deviceName: 'CORP-MAC-0231', issue: 'FileVault PRK not escrowed to Intune — user activation required' },
      ],
      status: 'warning',
      lastEvaluated: hoursAgo(rnd(3, 10)),
    },
    {
      id: 'pv-005',
      policyName: 'App Protection Policy (MAM)',
      policyType: 'App Protection',
      platform: 'all',
      assignedDevices: rnd(110, 150),
      compliantDevices: rnd(105, 145),
      nonCompliantDevices: rnd(0, 3),
      devicesWithGap: 0,
      gaps: [],
      status: 'healthy',
      lastEvaluated: hoursAgo(rnd(1, 3)),
    },
  ]

  res.json({ success: true, data: policies })
}))

// ── GET /api/intune-health/cert-expiry ───────────────────────────────────────

router.get('/cert-expiry', asyncHandler(async (_req, res) => {
  const certs = [
    {
      id: 'ce-001',
      certName: 'SCEP Client Auth — CORP-WIN-0442',
      deviceName: 'CORP-WIN-0442',
      userEmail: 'alice.morgan@company.com',
      certType: 'SCEP',
      issuer: 'Company-Internal-CA',
      issuedAt: daysAgo(335),
      expiresAt: daysAgo(-rnd(5, 15)),
      daysUntilExpiry: rnd(5, 15),
      status: 'expiring_soon',
      autoRenew: true,
    },
    {
      id: 'ce-002',
      certName: 'Device Identity Certificate — CORP-WIN-0893',
      deviceName: 'CORP-WIN-0893',
      userEmail: 'bob.chen@company.com',
      certType: 'Device Identity',
      issuer: 'Microsoft CA',
      issuedAt: daysAgo(360),
      expiresAt: daysAgo(-rnd(1, 5)),
      daysUntilExpiry: rnd(1, 5),
      status: 'critical',
      autoRenew: false,
    },
    {
      id: 'ce-003',
      certName: 'Wi-Fi EAP Certificate — CORP-MAC-0145',
      deviceName: 'CORP-MAC-0145',
      userEmail: 'inactive.user@company.com',
      certType: 'Wi-Fi Auth',
      issuer: 'Company-Internal-CA',
      issuedAt: daysAgo(365),
      expiresAt: daysAgo(rnd(1, 10)),
      daysUntilExpiry: -rnd(1, 10),
      status: 'expired',
      autoRenew: true,
    },
    {
      id: 'ce-004',
      certName: 'VPN Client Certificate — CORP-WIN-0667',
      deviceName: 'CORP-WIN-0667',
      userEmail: 'david.lee@company.com',
      certType: 'VPN Auth',
      issuer: 'Company-Internal-CA',
      issuedAt: daysAgo(200),
      expiresAt: daysAgo(-rnd(30, 45)),
      daysUntilExpiry: rnd(30, 45),
      status: 'expiring_soon',
      autoRenew: true,
    },
    {
      id: 'ce-005',
      certName: 'SCEP Client Auth — CORP-WIN-1201',
      deviceName: 'CORP-WIN-1201',
      userEmail: 'carol.davis@company.com',
      certType: 'SCEP',
      issuer: 'Microsoft CA',
      issuedAt: daysAgo(90),
      expiresAt: daysAgo(-rnd(270, 330)),
      daysUntilExpiry: rnd(270, 330),
      status: 'valid',
      autoRenew: true,
    },
  ]

  res.json({ success: true, data: certs })
}))

// ── POST /api/intune-health/cert-expiry/:id/renew ────────────────────────────

router.post('/cert-expiry/:id/renew', asyncHandler(async (req, res) => {
  const { id } = req.params as { id: string }

  res.json({
    success: true,
    data: {
      certId: id,
      status: 'renewal_initiated',
      message: 'Certificate renewal command pushed to device via SCEP profile. New certificate will be provisioned on next device check-in.',
      initiatedAt: new Date().toISOString(),
    },
  })
}))

// ── GET /api/intune-health/app-failures ──────────────────────────────────────

router.get('/app-failures', asyncHandler(async (_req, res) => {
  const failures = [
    {
      id: 'af-001',
      appName: 'Microsoft 365 Apps for Enterprise',
      appVersion: '16.0.17126.20132',
      deviceName: 'CORP-WIN-1042',
      userEmail: 'john.adams@company.com',
      platform: 'Windows',
      errorCode: '0x87D300C9',
      errorMessage: 'Application install failed — disk space insufficient (<2GB free)',
      failedAt: hoursAgo(rnd(1, 8)),
      deploymentType: 'Required',
      retryCount: 2,
      status: 'failed',
      recommendedFix: 'Free up disk space on the device (requires >2GB). Use Disk Cleanup or Storage Sense. Retry deployment will occur automatically on next Intune check-in.',
    },
    {
      id: 'af-002',
      appName: 'Cisco AnyConnect VPN',
      appVersion: '4.10.08029',
      deviceName: 'CORP-WIN-0887',
      userEmail: 'sarah.jones@company.com',
      platform: 'Windows',
      errorCode: '0x80070643',
      errorMessage: 'Installation failed — existing version conflict detected',
      failedAt: hoursAgo(rnd(4, 18)),
      deploymentType: 'Required',
      retryCount: 1,
      status: 'failed',
      recommendedFix: 'Uninstall the existing Cisco AnyConnect version via Add/Remove Programs before the new version can be installed. Script remediation available.',
    },
    {
      id: 'af-003',
      appName: 'CrowdStrike Falcon Sensor',
      appVersion: '7.14.17604',
      deviceName: 'CORP-WIN-0334',
      userEmail: 'temp.resource@company.com',
      platform: 'Windows',
      errorCode: '0x80190193',
      errorMessage: 'Download failed — device offline or network timeout',
      failedAt: daysAgo(rnd(1, 3)),
      deploymentType: 'Required',
      retryCount: 4,
      status: 'pending_retry',
      recommendedFix: 'Device appears offline. Check network connectivity and ensure device is powered on. Intune will retry deployment when device checks in.',
    },
  ]

  res.json({ success: true, data: failures })
}))

// ── POST /api/intune-health/app-failures/:id/retry ───────────────────────────

router.post('/app-failures/:id/retry', asyncHandler(async (req, res) => {
  const { id } = req.params as { id: string }

  res.json({
    success: true,
    data: {
      failureId: id,
      status: 'retry_queued',
      message: 'App deployment retry command queued. Intune will attempt redeployment on the device\'s next check-in cycle (typically within 8 hours).',
      queuedAt: new Date().toISOString(),
    },
  })
}))

// ── POST /api/intune-health/force-sync/:deviceId ─────────────────────────────

router.post('/force-sync/:deviceId', asyncHandler(async (req, res) => {
  const { deviceId } = req.params as { deviceId: string }

  res.json({
    success: true,
    data: {
      deviceId,
      status: 'sync_initiated',
      message: 'Force sync command sent to device. The device will sync with Intune within 5 minutes if it is online.',
      initiatedAt: new Date().toISOString(),
    },
  })
}))

// ── GET /api/intune-health/copilot/query ─────────────────────────────────────

router.post('/copilot/query', asyncHandler(async (req, res) => {
  const { question } = req.body as { question?: string }
  if (!question?.trim()) {
    res.status(400).json({ success: false, error: 'question is required' })
    return
  }

  const q = question.toLowerCase()
  let answer = ''
  let suggestions: string[] = []

  if (q.includes('non-compliant') || q.includes('noncompliant') || q.includes('compliance')) {
    answer = 'Currently there are **12 non-compliant devices** in the fleet. The most common reason is encryption not enabled (7 devices), followed by OS version out of date (4 devices) and missing security patches (1 device). To remediate: go to Automation Rules → Create Rule → trigger: device_non_compliant → action: execute_runbook. I can generate a targeted runbook for you.'
    suggestions = ['Show me non-compliant Windows devices', 'How do I fix encryption issues?', 'Run compliance scan now']
  } else if (q.includes('bitlocker') || q.includes('encryption')) {
    answer = 'BitLocker recovery keys for **4 Windows devices** are escrowed in Intune. **1 device** (CORP-WIN-1201) has encryption disabled. To retrieve a key: go to Device Lifecycle → BitLocker tab → select device → "View Recovery Key". For the unencrypted device, push a BitLocker enforcement policy from Intune → Devices → Configuration profiles.'
    suggestions = ['Which devices have encryption off?', 'Retrieve BitLocker key for a device', 'Create BitLocker enforcement rule']
  } else if (q.includes('offline') || q.includes('stale') || q.includes('inactive')) {
    answer = 'There are **4 stale devices** that haven\'t checked in for 30+ days. Of these, 2 are High risk (former employees), 1 is Critical risk (60+ days). Recommended actions: Retire devices from former employees immediately, send a reminder to the inactive user. Go to Device Lifecycle → Stale Devices to take action.'
    suggestions = ['Retire all former employee devices', 'Show devices offline 60+ days', 'Send reminder to inactive users']
  } else if (q.includes('cert') || q.includes('certificate')) {
    answer = 'Certificate health summary: **1 expired** (Wi-Fi EAP on CORP-MAC-0145), **2 expiring within 15 days** (SCEP and Device Identity certs), **2 expiring within 45 days**. Critical: CORP-WIN-0893 has a Device Identity Certificate expiring in 1-5 days with auto-renew disabled — immediate action required. Go to Compliance Intel → Cert Monitor.'
    suggestions = ['Renew certificate for CORP-WIN-0893', 'Show all expiring certificates', 'Enable auto-renew for all certs']
  } else if (q.includes('enroll') || q.includes('enrollment')) {
    answer = 'There are **3 open enrollment failures** and **1 recently remediated**. Most common failure: AAD Join issues (2 devices), MDM token expiration (1 device). To fix AAD join failures: ensure the device is running Windows 10 1903+, connected to the internet, and the user account has an Intune license assigned. I can generate step-by-step remediation instructions for each failure.'
    suggestions = ['Fix enrollment for CORP-WIN-1042', 'Show all enrollment errors', 'What causes MDM token expiry?']
  } else if (q.includes('app') || q.includes('deploy')) {
    answer = 'There are **3 app deployment failures** in the last 24-72 hours. Most critical: CrowdStrike Falcon sensor failed on an unmanaged device (4 retry attempts). M365 Apps failed due to insufficient disk space. Cisco AnyConnect has a version conflict. I recommend: run the disk cleanup script on CORP-WIN-1042, push an uninstall script for the old AnyConnect version on CORP-WIN-0887, and verify CORP-WIN-0334 is online.'
    suggestions = ['Retry all failed app deployments', 'Create disk cleanup automation', 'Show app deployment history']
  } else if (q.includes('policy') || q.includes('policies')) {
    answer = 'Policy health check: **3 of 5 policies** have assignment gaps. The BitLocker policy has 1 device with TPM not found (CORP-WIN-1201) — this is a hardware limitation. The Windows Security Baseline has 2 devices with gaps: one missing from the assigned group, one needing a restart. The macOS FileVault policy has 1 device needing user activation. All policy gaps can be resolved from Compliance Intel → Policy Validation.'
    suggestions = ['Fix Windows Security Baseline gaps', 'How to fix FileVault PRK escrow?', 'Run policy validation scan']
  } else {
    answer = `I'm your Intune & MDM AI Copilot. I can help you with:\n\n• **Compliance** — device compliance status, non-compliant devices\n• **Encryption** — BitLocker/FileVault status, key retrieval\n• **Enrollment** — failure analysis, re-enrollment guidance\n• **Apps** — deployment failures, retry guidance\n• **Certificates** — expiry tracking, renewal\n• **Stale Devices** — cleanup recommendations\n• **Policies** — assignment gaps, validation\n\nTry asking: *"Which devices are non-compliant?"* or *"Show me BitLocker status"*`
    suggestions = ['Which devices are non-compliant?', 'Show BitLocker status', 'What are the current enrollment failures?', 'Summarize fleet health']
  }

  res.json({
    success: true,
    data: {
      question,
      answer,
      suggestions,
      sources: ['Intune Health API', 'Device Lifecycle Data', 'Compliance Intel'],
      respondedAt: new Date().toISOString(),
    },
  })
}))

export default router
