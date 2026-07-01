/**
 * Mac Device Log Viewer API
 * Generates realistic macOS unified log entries per device and provides
 * AI-powered log analysis using OpenAI.
 */

import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getKandjiDevices } from '../services/kandji.js'
import { isOpenAIConfigured } from '../services/openai.js'
import type { Device } from '../types.js'
import OpenAI from 'openai'

const router = Router()

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MacLogEntry {
  id: string
  timestamp: string
  level: 'default' | 'info' | 'debug' | 'error' | 'fault'
  subsystem: string
  category: string
  process: string
  pid: number
  message: string
  eventType: 'mdm' | 'security' | 'system' | 'app' | 'network' | 'kandji' | 'user'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

function ts(offsetMinutes: number): string {
  const d = new Date(Date.now() - offsetMinutes * 60_000)
  return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z/, `.${Math.floor(Math.random() * 999).toString().padStart(3, '0')}`)
}

function rndPid(): number {
  return Math.floor(Math.random() * 40000) + 100
}

// ── Log generation based on real device state ─────────────────────────────────

function generateLogs(device: Device, limit: number): MacLogEntry[] {
  const enc       = (device.encryptionStatus ?? '').toLowerCase()
  const fvEnabled = enc.includes('on') || enc.includes('enabled')
  const compliant = device.complianceState === 'Compliant'
  const hasEdr    = (device.antivirusStatus ?? '').toLowerCase().includes('crowd')
  const fwEnabled = device.firewallStatus === 'Enabled'

  const logs: MacLogEntry[] = []
  let offset = 0 // minutes ago

  // ── Boot / Login sequence ──────────────────────────────────────────────────
  logs.push({
    id: uid(), timestamp: ts(offset), level: 'info',
    subsystem: 'com.apple.kernel', category: 'boot', process: 'kernel', pid: 0,
    message: `macOS ${device.osVersion ?? 'Sequoia'} kernel started — boot-args: -v`,
    eventType: 'system',
  })
  offset += 0.5

  logs.push({
    id: uid(), timestamp: ts(offset), level: 'info',
    subsystem: 'com.apple.loginwindow', category: 'session', process: 'loginwindow', pid: rndPid(),
    message: `User session started for: ${device.user ?? 'local_user'}`,
    eventType: 'user',
  })
  offset += 1

  // ── MDM check-in ──────────────────────────────────────────────────────────
  logs.push({
    id: uid(), timestamp: ts(offset), level: 'info',
    subsystem: 'com.apple.mdm', category: 'checkin', process: 'mdmclient', pid: rndPid(),
    message: `MDM check-in successful. Server: ${device.managementSource} MDM`,
    eventType: 'mdm',
  })
  offset += 1.5

  if (!compliant) {
    logs.push({
      id: uid(), timestamp: ts(offset), level: 'error',
      subsystem: 'com.apple.mdm', category: 'compliance', process: 'mdmclient', pid: rndPid(),
      message: `Compliance check FAILED: ${device.primaryIssue ?? 'Policy requirement not met'}. Device marked Non-Compliant.`,
      eventType: 'mdm',
    })
    offset += 0.5
    logs.push({
      id: uid(), timestamp: ts(offset), level: 'fault',
      subsystem: 'com.apple.mdm', category: 'remediation', process: 'mdmclient', pid: rndPid(),
      message: `Remediation command queued: enforce_policies — will retry in 15m`,
      eventType: 'mdm',
    })
  } else {
    logs.push({
      id: uid(), timestamp: ts(offset), level: 'info',
      subsystem: 'com.apple.mdm', category: 'compliance', process: 'mdmclient', pid: rndPid(),
      message: `All compliance policies satisfied. Device state: Compliant`,
      eventType: 'mdm',
    })
  }
  offset += 2

  // ── Kandji agent ──────────────────────────────────────────────────────────
  logs.push({
    id: uid(), timestamp: ts(offset), level: 'info',
    subsystem: 'io.kandji.agent', category: 'sync', process: 'kandji_agent', pid: rndPid(),
    message: `Kandji agent sync started — blueprint: ${device.appliedPolicies?.[0] ?? 'Default'}`,
    eventType: 'kandji',
  })
  offset += 1

  logs.push({
    id: uid(), timestamp: ts(offset), level: 'info',
    subsystem: 'io.kandji.agent', category: 'library', process: 'kandji_agent', pid: rndPid(),
    message: `Library items evaluated: ${Math.floor(Math.random() * 15) + 5} configured, ${Math.floor(Math.random() * 3)} pending installation`,
    eventType: 'kandji',
  })
  offset += 2

  // ── FileVault ─────────────────────────────────────────────────────────────
  if (fvEnabled) {
    logs.push({
      id: uid(), timestamp: ts(offset), level: 'info',
      subsystem: 'com.apple.security.filevault', category: 'encryption', process: 'fdesetup', pid: rndPid(),
      message: `FileVault 2 encryption is active on volume "Macintosh HD". PRK escrowed: YES`,
      eventType: 'security',
    })
  } else {
    logs.push({
      id: uid(), timestamp: ts(offset), level: 'error',
      subsystem: 'com.apple.security.filevault', category: 'encryption', process: 'fdesetup', pid: rndPid(),
      message: `FileVault 2 is DISABLED on volume "Macintosh HD". MDM policy requires encryption. Enforcement pending.`,
      eventType: 'security',
    })
    offset += 0.5
    logs.push({
      id: uid(), timestamp: ts(offset), level: 'fault',
      subsystem: 'com.apple.mdm', category: 'enforcement', process: 'mdmclient', pid: rndPid(),
      message: `FileVault enforcement MDM command failed — user interaction required. Deferral count: ${Math.floor(Math.random() * 5) + 1}`,
      eventType: 'mdm',
    })
  }
  offset += 2

  // ── Firewall ──────────────────────────────────────────────────────────────
  if (fwEnabled) {
    logs.push({
      id: uid(), timestamp: ts(offset), level: 'info',
      subsystem: 'com.apple.alf', category: 'firewall', process: 'socketfilterfw', pid: rndPid(),
      message: `macOS Application Firewall is ENABLED. Stealth mode: active`,
      eventType: 'security',
    })
  } else {
    logs.push({
      id: uid(), timestamp: ts(offset), level: 'error',
      subsystem: 'com.apple.alf', category: 'firewall', process: 'socketfilterfw', pid: rndPid(),
      message: `macOS Application Firewall is DISABLED — corporate policy requires firewall enforcement`,
      eventType: 'security',
    })
  }
  offset += 1.5

  // ── SIP / Gatekeeper ──────────────────────────────────────────────────────
  logs.push({
    id: uid(), timestamp: ts(offset), level: 'info',
    subsystem: 'com.apple.security', category: 'sip', process: 'csrutil', pid: rndPid(),
    message: `System Integrity Protection: ENABLED. NVRAM protection: enabled`,
    eventType: 'security',
  })
  offset += 1

  logs.push({
    id: uid(), timestamp: ts(offset), level: 'info',
    subsystem: 'com.apple.security.assessment', category: 'gatekeeper', process: 'syspolicyd', pid: rndPid(),
    message: `Gatekeeper: enforcing app notarization check`,
    eventType: 'security',
  })
  offset += 2

  // ── EDR ───────────────────────────────────────────────────────────────────
  if (hasEdr) {
    logs.push({
      id: uid(), timestamp: ts(offset), level: 'info',
      subsystem: 'com.crowdstrike.falcon', category: 'sensor', process: 'falcond', pid: rndPid(),
      message: `CrowdStrike Falcon sensor running. AID: ${uid().toUpperCase()}. Policy: "${(device.appliedPolicies?.[0] ?? 'Corporate')}-macOS"`,
      eventType: 'security',
    })
    offset += 1
    logs.push({
      id: uid(), timestamp: ts(offset), level: 'debug',
      subsystem: 'com.crowdstrike.falcon', category: 'threat', process: 'falcond', pid: rndPid(),
      message: `Real-time protection active. No threats detected since last check`,
      eventType: 'security',
    })
  } else {
    logs.push({
      id: uid(), timestamp: ts(offset), level: 'error',
      subsystem: 'io.kandji.agent', category: 'edr', process: 'kandji_agent', pid: rndPid(),
      message: `EDR sensor (CrowdStrike Falcon) not installed or not responding. Security gap detected.`,
      eventType: 'security',
    })
  }
  offset += 2

  // ── Citrix Workspace — recent install sequence (most recent, near top) ───────
  // Appears as a fresh install that just completed (low offset = most recent)
  const citrixPid = rndPid()
  const appleInstallerPid = rndPid()
  ;[
    {
      level: 'info' as const, subsystem: 'io.kandji.agent', category: 'library_item',
      process: 'kandji_agent', pid: citrixPid,
      message: 'Library item "Citrix Workspace" queued for installation. Version target: 24.5.0. Assignment source: Blueprint "Corporate-Mac-Standard".',
      eventType: 'kandji' as const,
    },
    {
      level: 'info' as const, subsystem: 'io.kandji.agent', category: 'app_download',
      process: 'kandji_agent', pid: citrixPid,
      message: 'Downloading "CitrixWorkspaceApp.dmg" (164.3 MB) from Kandji CDN. SHA-256 verification enabled.',
      eventType: 'kandji' as const,
    },
    {
      level: 'info' as const, subsystem: 'io.kandji.agent', category: 'app_download',
      process: 'kandji_agent', pid: citrixPid,
      message: 'Download complete: CitrixWorkspaceApp.dmg — SHA-256 checksum verified OK.',
      eventType: 'kandji' as const,
    },
    {
      level: 'info' as const, subsystem: 'com.apple.installer', category: 'install',
      process: 'installer', pid: appleInstallerPid,
      message: 'Installing package "com.citrix.receiver.mac" (Citrix Workspace 24.5.0). Root volume: /.',
      eventType: 'app' as const,
    },
    {
      level: 'info' as const, subsystem: 'com.apple.installer', category: 'install',
      process: 'installer', pid: appleInstallerPid,
      message: 'Package install succeeded: com.citrix.receiver.mac. Payload written to /Applications/Citrix Workspace.app.',
      eventType: 'app' as const,
    },
    {
      level: 'info' as const, subsystem: 'com.citrix.receiver.mac', category: 'startup',
      process: 'Citrix Workspace', pid: rndPid(),
      message: 'Citrix Workspace 24.5.0 launched for first time post-install. Loading configuration store.',
      eventType: 'app' as const,
    },
    {
      level: 'info' as const, subsystem: 'com.citrix.receiver.mac', category: 'network',
      process: 'Citrix Workspace', pid: rndPid(),
      message: 'Contacting Citrix StoreFront gateway. Endpoint: storefront.corp.internal. TLS 1.3.',
      eventType: 'network' as const,
    },
    {
      level: 'info' as const, subsystem: 'io.kandji.agent', category: 'app_install',
      process: 'kandji_agent', pid: citrixPid,
      message: 'Library item "Citrix Workspace" — installation COMPLETED. App verified at /Applications/Citrix Workspace.app. Reported to Kandji console.',
      eventType: 'kandji' as const,
    },
  ].forEach((entry, i) => {
    logs.push({ id: uid(), timestamp: ts(offset + i * 0.4), ...entry })
  })
  offset += 4

  // ── Managed app status verification (Kandji periodic check) ───────────────
  const appEvents = [
    { app: 'Google Chrome', version: '124.0.6367.201', pkg: 'com.google.Chrome' },
    { app: 'Zoom',          version: '5.17.11',         pkg: 'us.zoom.xos' },
    { app: 'Slack',         version: '4.38.125',         pkg: 'com.tinyspeck.slackmacgap' },
    { app: 'Citrix Workspace', version: '24.5.0',       pkg: 'com.citrix.receiver.mac' },
  ]
  for (const ae of appEvents) {
    logs.push({
      id: uid(), timestamp: ts(offset), level: 'info',
      subsystem: 'io.kandji.agent', category: 'app_install', process: 'kandji_agent', pid: rndPid(),
      message: `Application "${ae.app}" v${ae.version} verified — ${ae.pkg}. Status: Installed`,
      eventType: 'app',
    })
    offset += Math.random() * 3 + 0.5
  }

  // ── Network ───────────────────────────────────────────────────────────────
  logs.push({
    id: uid(), timestamp: ts(offset), level: 'info',
    subsystem: 'com.apple.network', category: 'wifi', process: 'mDNSResponder', pid: rndPid(),
    message: `Wi-Fi connected: SSID "Corporate-WiFi" (802.11ax). Signal: -52 dBm. IP: ${device.ipAddress ?? '10.0.1.' + Math.floor(Math.random() * 254 + 1)}`,
    eventType: 'network',
  })
  offset += 2

  // ── System performance ────────────────────────────────────────────────────
  logs.push({
    id: uid(), timestamp: ts(offset), level: 'debug',
    subsystem: 'com.apple.kernel', category: 'memory', process: 'kernel', pid: 0,
    message: `Memory pressure: ${Math.floor(Math.random() * 40 + 30)}% — wired: ${Math.floor(Math.random() * 2 + 2)}GB, active: ${Math.floor(Math.random() * 4 + 4)}GB`,
    eventType: 'system',
  })
  offset += 1

  // ── XProtect / malware scan ───────────────────────────────────────────────
  logs.push({
    id: uid(), timestamp: ts(offset), level: 'info',
    subsystem: 'com.apple.xprotect', category: 'scan', process: 'XProtect', pid: rndPid(),
    message: `XProtect malware scan completed. Definitions version: ${Math.floor(Math.random() * 100) + 5200}. No threats found.`,
    eventType: 'security',
  })
  offset += 3

  // ── MDM profile installs ──────────────────────────────────────────────────
  const profiles = [
    'Corporate Wi-Fi Profile',
    'VPN Configuration Profile',
    'Security Baseline Profile',
    'Certificate Trust Profile',
  ]
  for (const pf of profiles.slice(0, Math.floor(Math.random() * 3) + 1)) {
    logs.push({
      id: uid(), timestamp: ts(offset), level: 'info',
      subsystem: 'com.apple.mdm', category: 'profile', process: 'mdmclient', pid: rndPid(),
      message: `MDM profile installed: "${pf}" — source: Kandji MDM`,
      eventType: 'mdm',
    })
    offset += Math.random() * 2 + 0.5
  }

  // ── Sudo / privilege escalation ───────────────────────────────────────────
  if (Math.random() > 0.5) {
    logs.push({
      id: uid(), timestamp: ts(offset), level: 'info',
      subsystem: 'com.apple.sudo', category: 'auth', process: 'sudo', pid: rndPid(),
      message: `${device.user ?? 'user'} : TTY=unknown ; PWD=/private/tmp ; USER=root ; COMMAND=/usr/bin/softwareupdate --install -r`,
      eventType: 'user',
    })
    offset += 1
  }

  // ── Software update ───────────────────────────────────────────────────────
  const updatePending = !compliant || Math.random() > 0.5
  if (updatePending) {
    logs.push({
      id: uid(), timestamp: ts(offset), level: 'info',
      subsystem: 'com.apple.softwareupdate', category: 'update', process: 'softwareupdated', pid: rndPid(),
      message: `Software update available: macOS Sequoia ${device.osVersion ?? '15.4'}. Download deferred by user (${Math.floor(Math.random() * 5) + 1} deferral remaining)`,
      eventType: 'system',
    })
  } else {
    logs.push({
      id: uid(), timestamp: ts(offset), level: 'info',
      subsystem: 'com.apple.softwareupdate', category: 'update', process: 'softwareupdated', pid: rndPid(),
      message: `macOS is up to date (${device.osVersion ?? '15.4.1'})`,
      eventType: 'system',
    })
  }
  offset += 2

  // ── Sleep/wake cycle ──────────────────────────────────────────────────────
  logs.push({
    id: uid(), timestamp: ts(offset), level: 'info',
    subsystem: 'com.apple.powerd', category: 'sleep', process: 'powerd', pid: rndPid(),
    message: `System entering safe sleep (S3). Reason: lid closed`,
    eventType: 'system',
  })
  offset += 8
  logs.push({
    id: uid(), timestamp: ts(offset), level: 'info',
    subsystem: 'com.apple.powerd', category: 'wake', process: 'powerd', pid: rndPid(),
    message: `System woke from sleep. Wake reason: User keypressed. Sleep duration: ${Math.floor(Math.random() * 6 + 1)}h ${Math.floor(Math.random() * 59)}m`,
    eventType: 'system',
  })
  offset += 2

  // ── MDM certificate / enrollment ──────────────────────────────────────────
  logs.push({
    id: uid(), timestamp: ts(offset), level: 'info',
    subsystem: 'com.apple.mdm', category: 'certificate', process: 'mdmclient', pid: rndPid(),
    message: `MDM enrollment certificate valid. Expires: ${new Date(Date.now() + 180 * 86_400_000).toISOString().split('T')[0]}`,
    eventType: 'mdm',
  })
  offset += 3

  // ── Disk check ───────────────────────────────────────────────────────────
  const freeGB = device.freeStorage ?? Math.floor(Math.random() * 80 + 20)
  const lowDisk = freeGB < 10
  logs.push({
    id: uid(), timestamp: ts(offset), level: lowDisk ? 'error' : 'info',
    subsystem: 'com.apple.diskmanagement', category: 'storage', process: 'diskmanagementd', pid: rndPid(),
    message: lowDisk
      ? `Low disk space warning: ${freeGB}GB free on "Macintosh HD". Minimum recommended: 15GB`
      : `Disk health OK. Free: ${freeGB}GB. SMART status: Verified`,
    eventType: 'system',
  })
  offset += 4

  // ── Kandji compliance report ──────────────────────────────────────────────
  logs.push({
    id: uid(), timestamp: ts(offset), level: 'info',
    subsystem: 'io.kandji.agent', category: 'report', process: 'kandji_agent', pid: rndPid(),
    message: `Compliance report submitted to Kandji cloud. Serial: ${device.serialNumber ?? 'N/A'}`,
    eventType: 'kandji',
  })

  // Sort by timestamp descending (newest first) then limit
  return logs
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit)
}

// ── GET /api/mac-logs/:deviceId ───────────────────────────────────────────────

router.get('/:deviceId', asyncHandler(async (req, res) => {
  const { deviceId } = req.params as { deviceId: string }
  const limit = Math.min(Number((req.query as Record<string, string>).limit ?? 100), 500)

  let device: Device | undefined

  try {
    const devices = await getKandjiDevices()
    device = devices.find(d => d.id === deviceId || d.serialNumber === deviceId || d.deviceName === deviceId)
  } catch {
    // Fall through to mock
  }

  if (!device) {
    // Generate mock device context for demo mode
    device = {
      id: deviceId,
      deviceName: 'CORP-MAC-DEMO',
      user: 'demo.user@company.com',
      serialNumber: deviceId,
      platform: 'macOS',
      osVersion: '15.4.1',
      managementSource: 'Kandji',
      lastCheckIn: new Date().toISOString(),
      complianceState: 'Compliant',
      encryptionStatus: 'FileVault On',
      severity: 'Low',
      firewallStatus: 'Enabled',
      antivirusStatus: 'CrowdStrike Active',
      model: 'MacBook Pro (14-inch, 2023)',
      appliedPolicies: ['Corporate Standard'],
      triggerCount: 0,
    } as unknown as Device
  }

  const logs = generateLogs(device, limit)

  res.json({
    success: true,
    data: {
      device: {
        id: device.id,
        deviceName: device.deviceName,
        serialNumber: device.serialNumber,
        user: device.user,
        osVersion: device.osVersion,
        model: device.model,
        managementSource: device.managementSource,
        complianceState: device.complianceState,
      },
      logs,
      total: logs.length,
      generatedAt: new Date().toISOString(),
    },
  })
}))

// ── POST /api/mac-logs/:deviceId/analyze ─────────────────────────────────────

router.post('/:deviceId/analyze', asyncHandler(async (req, res) => {
  const { deviceId } = req.params as { deviceId: string }
  const { logs, deviceContext } = req.body as {
    logs: MacLogEntry[]
    deviceContext: Record<string, string>
  }

  if (!logs?.length) {
    res.status(400).json({ success: false, error: 'logs array is required' })
    return
  }

  // Build log text sample (limit to first 80 entries to fit context)
  const sample = logs.slice(0, 80)
    .map(l => `[${l.timestamp}] [${l.level.toUpperCase().padEnd(7)}] [${l.subsystem}] [${l.category}] ${l.process}: ${l.message}`)
    .join('\n')

  const deviceSummary = Object.entries(deviceContext ?? {})
    .map(([k, v]) => `${k}: ${v}`).join('\n')

  if (!isOpenAIConfigured()) {
    // Return smart mock analysis based on actual log data
    const errors   = logs.filter(l => l.level === 'error' || l.level === 'fault').length
    const warnings  = logs.filter(l => l.level === 'info' && l.message.toLowerCase().includes('warn')).length
    const mdmFailed = logs.some(l => l.eventType === 'mdm' && l.level === 'error')
    const fvOff     = logs.some(l => l.subsystem.includes('filevault') && l.level === 'error')
    const fwOff     = logs.some(l => l.subsystem.includes('alf') && l.level === 'error')

    const issues = []
    if (fvOff) issues.push({
      severity: 'critical',
      title: 'FileVault Encryption Disabled',
      description: 'The macOS unified log shows FileVault 2 is disabled on the system volume "Macintosh HD". MDM enforcement commands have been queued but user interaction is required to complete encryption.',
      recommendation: 'Reach out to the device user and guide them through the FileVault activation wizard. Consider escalating to on-site support if deferral limit is reached.',
    })
    if (fwOff) issues.push({
      severity: 'high',
      title: 'Application Firewall Off',
      description: 'The macOS Application Firewall is disabled, leaving the device exposed to inbound network connections. This violates the corporate security baseline policy.',
      recommendation: 'Push a Kandji library item or MDM configuration profile to enforce the firewall. Verify the profile installs correctly on next device check-in.',
    })
    if (mdmFailed) issues.push({
      severity: 'high',
      title: 'MDM Compliance Failure',
      description: 'The device failed its MDM compliance check. Policy requirements were not met at the last check-in cycle.',
      recommendation: 'Review the applied blueprint policies in Kandji and verify all required library items are installed. Force a device sync from the Kandji admin portal.',
    })

    res.json({
      success: true,
      data: {
        deviceId,
        executiveSummary: errors > 0
          ? `This device has ${errors} error${errors > 1 ? 's' : ''} and ${warnings} warning${warnings !== 1 ? 's' : ''} in the log. ${issues.length > 0 ? `Key issues: ${issues.map(i => i.title).join(', ')}.` : ''} Immediate attention recommended.`
          : 'Device logs appear healthy overall. MDM check-in successful, Kandji agent sync completed, and no critical errors detected.',
        healthStatus: errors > 2 ? 'critical' : errors > 0 ? 'warning' : 'healthy',
        issues,
        keyEvents: sample.split('\n').filter(l => l.includes('ERROR') || l.includes('FAULT')).slice(0, 5),
        eventBreakdown: {
          mdm:      logs.filter(l => l.eventType === 'mdm').length,
          security: logs.filter(l => l.eventType === 'security').length,
          system:   logs.filter(l => l.eventType === 'system').length,
          app:      logs.filter(l => l.eventType === 'app').length,
          network:  logs.filter(l => l.eventType === 'network').length,
          kandji:   logs.filter(l => l.eventType === 'kandji').length,
          user:     logs.filter(l => l.eventType === 'user').length,
        },
        recommendations: [
          ...(fvOff ? ['Immediately enable FileVault on this device to protect corporate data.'] : []),
          ...(fwOff ? ['Enable the macOS Application Firewall via MDM policy.'] : []),
          ...(mdmFailed ? ['Investigate MDM compliance failure — review Kandji blueprint and remediate.'] : []),
          ...(!fvOff && !fwOff && !mdmFailed ? ['Schedule a routine compliance check in 30 days.', 'Ensure OS updates are applied promptly.'] : []),
        ],
        analyzedLogCount: logs.length,
        analyzedAt: new Date().toISOString(),
        aiPowered: false,
      },
    })
    return
  }

  // OpenAI-powered analysis
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are an expert macOS security and MDM log analyst. Analyze macOS unified logs and device context, then return a structured JSON analysis. Be specific about issues and actionable in recommendations. Focus on: MDM compliance, FileVault encryption, firewall, EDR/security gaps, app management, and system health.

Return JSON with this exact structure:
{
  "executiveSummary": "string — 2-3 sentences overview",
  "healthStatus": "healthy" | "warning" | "critical",
  "issues": [{ "severity": "critical"|"high"|"medium"|"low", "title": "string", "description": "string", "recommendation": "string" }],
  "keyEvents": ["string — notable log lines"],
  "eventBreakdown": { "mdm": number, "security": number, "system": number, "app": number, "network": number, "kandji": number, "user": number },
  "recommendations": ["string — prioritized action items"],
  "analyzedLogCount": number
}`,
        },
        {
          role: 'user',
          content: `Device Context:\n${deviceSummary}\n\nLog Sample (${logs.length} entries):\n${sample}`,
        },
      ],
      max_tokens: 1200,
    })

    const raw = completion.choices[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(raw) as Record<string, unknown>

    res.json({
      success: true,
      data: {
        deviceId,
        ...parsed,
        analyzedAt: new Date().toISOString(),
        aiPowered: true,
      },
    })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: `AI analysis failed: ${err instanceof Error ? err.message : String(err)}`,
    })
  }
}))

export default router
