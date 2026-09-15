import OpenAI from 'openai'
import type { Device } from '../types.js'
import { getOpenAIConfig } from '../store/integrationStore.js'

function getClient(): OpenAI {
  const cfg = getOpenAIConfig()
  if (!cfg?.apiKey) throw new Error('OPENAI_API_KEY is not configured — add it to server/.env or set it in Settings → Integrations')
  return new OpenAI({
    apiKey: cfg.apiKey,
    ...(cfg.orgId ? { organization: cfg.orgId } : {}),
  })
}

export interface DeviceAnalysis {
  summary: string
  rootCause: string
  recommendation: string
  suggestedRunbook: string
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical'
  steps: string[]
}

// ─── Rule-based fallback (no OpenAI required) ─────────────────────────────────

function issueCategory(device: Device): string {
  const issue      = (device.primaryIssue   ?? '').toLowerCase()
  const policy     = (device.policyFailed   ?? '').toLowerCase()
  const encryption = (device.encryptionStatus ?? '').toLowerCase()

  if (encryption === 'off' || encryption === 'disabled' || encryption === 'pending' ||
      issue.includes('encrypt') || issue.includes('filevault') || issue.includes('bitlocker'))
    return 'encryption'

  if (issue.includes('os') || issue.includes('patch') || issue.includes('update') ||
      policy.includes('os') || policy.includes('update'))
    return 'os-patch'

  if (issue.includes('antivirus') || issue.includes('av') || issue.includes('firewall') ||
      issue.includes('security') || policy.includes('security') || policy.includes('firewall'))
    return 'security'

  if (issue.includes('check-in') || issue.includes('checkin') || issue.includes('offline') ||
      issue.includes('sync') || issue.includes('enroll'))
    return 'mdm-sync'

  if (issue.includes('app') || issue.includes('software') || issue.includes('install') ||
      policy.includes('app'))
    return 'application'

  return 'compliance'
}

export function generateFallbackAnalysis(device: Device): DeviceAnalysis {
  const category = issueCategory(device)
  const platform = device.platform
  const source   = device.managementSource
  const sev      = device.severity
  const riskLevel: DeviceAnalysis['riskLevel'] =
    sev === 'Critical' ? 'Critical' : sev === 'High' ? 'High' : sev === 'Medium' ? 'Medium' : 'Low'

  if (category === 'encryption') {
    if (platform === 'macOS') {
      return {
        summary:          `${device.deviceName} has disk encryption disabled — FileVault is not active, leaving data unprotected.`,
        rootCause:        `FileVault was not enabled during enrollment or was deferred by the user. The MDM enforcement policy has not been applied or the user dismissed the prompt.`,
        recommendation:   `Enable FileVault enforcement in ${source} and ask the user to log out and back in to trigger the activation prompt.`,
        suggestedRunbook: 'FileVault Activation (macOS)',
        riskLevel:        'Critical',
        steps: [
          `In ${source}, navigate to Library → FileVault and enable enforcement for this device's blueprint.`,
          'Assign the FileVault configuration profile to the affected device.',
          'Send the user an email instructing them to log out and log back in when prompted.',
          'User clicks "Enable FileVault" and saves the recovery key.',
          `Escrow the recovery key back to ${source} to ensure it is securely backed up.`,
          'Verify activation via Terminal: run `fdesetup status` — should return "FileVault is On".',
          `Confirm compliance status clears in ${source} after the next device check-in.`,
        ],
      }
    }
    return {
      summary:          `${device.deviceName} has BitLocker disk encryption disabled — device data is at risk of exposure.`,
      rootCause:        `BitLocker was never initialized. The TPM 2.0 chip may not be enabled in BIOS, or the Intune encryption compliance policy has not been assigned or synced to this device.`,
      recommendation:   'Create and assign a BitLocker policy in Intune Endpoint Security, then force a device sync.',
      suggestedRunbook: 'BitLocker Encryption Enforcement',
      riskLevel:        'Critical',
      steps: [
        'On the device, run `tpm.msc` to verify TPM 2.0 is present and enabled.',
        'In Intune, navigate to Endpoint Security → Disk Encryption → Create policy → BitLocker.',
        'Assign the policy to the device group that includes this device.',
        'Force a device sync: Settings → Accounts → Access work or school → Info → Sync.',
        'Run `manage-bde -status C:` in an admin Command Prompt to confirm encryption started.',
        'Monitor encryption progress in Intune: Devices → [Device] → Encryption report.',
        'Confirm compliance status updates in Intune once full disk encryption is complete.',
      ],
    }
  }

  if (category === 'os-patch') {
    if (platform === 'macOS') {
      return {
        summary:          `${device.deviceName} is running an outdated macOS version and is out of compliance with OS patch policy.`,
        rootCause:        `The device has deferred required OS updates. The user may have postponed restarts, the device was offline during the update window, or the enforcement deadline has not been set.`,
        recommendation:   `Set a hard enforcement deadline in ${source} and notify the user to update immediately.`,
        suggestedRunbook: 'OS Update Management',
        riskLevel,
        steps: [
          `In ${source}, navigate to Library → Operating System Updates and verify enforcement is enabled.`,
          `Confirm the required OS version target is set correctly for this device's blueprint.`,
          'Set a hard enforcement deadline of 24–48 hours if not already configured.',
          'Push an MDM command to trigger an immediate update check on the device.',
          'Notify the user via email to save their work and restart the device when prompted.',
          `Monitor update status in ${source}: Devices → [Device] → Activity.`,
          `Confirm the OS version has updated and compliance is cleared in ${source} after restart.`,
        ],
      }
    }
    return {
      summary:          `${device.deviceName} has pending Windows updates and is not meeting patch compliance requirements.`,
      rootCause:        `Windows Update was deferred by the user, blocked by local policy, or the device was offline during scheduled patch windows. The Intune update ring may not be enforcing deadlines.`,
      recommendation:   'Verify the Intune update ring assignment and create an expedited update if a critical patch is pending.',
      suggestedRunbook: 'Windows Update Enforcement via Intune',
      riskLevel,
      steps: [
        'In Intune, navigate to Devices → Update rings for Windows 10/11 and verify this device is in scope.',
        'Check for a pending critical or feature update under Windows Update for Business reports.',
        'If urgent, create an Expedited quality update policy and assign it to this device.',
        'Force a device sync: Settings → Accounts → Access work or school → Info → Sync.',
        'On the device, open Settings → Windows Update → Check for updates and install pending updates.',
        'Monitor update installation progress in Intune: Devices → [Device] → Update status.',
        'Confirm compliance once all required patches are installed and the device restarts.',
      ],
    }
  }

  if (category === 'security') {
    return {
      summary:          `${device.deviceName} has a critical security control failure — ${device.primaryIssue || 'a security policy is not applied'}.`,
      rootCause:        `Security policy ${device.policyFailed ? `"${device.policyFailed}"` : 'configuration'} has not been applied or has drifted from the required state. This may be caused by an agent failure, conflicting local settings, or a missed MDM sync.`,
      recommendation:   `Re-push the security policy from ${source} and verify the security agent is running on the device.`,
      suggestedRunbook: 'Security Policy Remediation',
      riskLevel:        'High',
      steps: [
        `In ${source}, locate the failed security policy and verify it is correctly assigned to this device.`,
        'Force a policy sync from the MDM console to re-push the configuration immediately.',
        'On the device, verify firewall status: Windows — check Windows Defender Firewall; macOS — System Settings → Network → Firewall.',
        'Verify the AV/EDR agent is running: Windows — Services → check Defender or third-party AV; macOS — Activity Monitor → search for the AV process.',
        'If the agent service is stopped, restart it: Windows — `net start [service-name]`; macOS — `sudo launchctl kickstart -k system/[service-name]`.',
        'Check for conflicting Group Policy objects or local security settings that may override the MDM policy.',
        `Confirm the security policy shows as "Succeeded" in ${source} after the next device check-in.`,
      ],
    }
  }

  if (category === 'mdm-sync') {
    if (platform === 'macOS') {
      return {
        summary:          `${device.deviceName} has missed scheduled MDM check-ins — the ManageEngine MDM profile may be unresponsive.`,
        rootCause:        `The device's MDM management profile has been removed, deregistered, or lost connectivity to ManageEngine endpoints. Extended offline periods can also cause missed check-ins.`,
        recommendation:   'Force a profile re-check-in and verify the device can reach ManageEngine MDM endpoints.',
        suggestedRunbook: 'Restart MDM Agent',
        riskLevel:        'High',
        steps: [
          'Confirm the device is powered on and connected to the internet.',
          'Force an MDM profile re-check-in: open Terminal and run `sudo profiles renew -type enrollment` (or `sudo profiles -N` on older macOS).',
          'Check for recent errors: open Console.app and filter by "mdmclient" to identify enrollment or check-in failures.',
          'Verify network access to the ManageEngine MDM server: run `curl -I <ManageEngine server URL>` from Terminal.',
          'If the enrollment profile is missing or corrupted, re-enroll the device using the ManageEngine enrollment link.',
          'Trigger a remote sync from the ManageEngine console: Devices → [Device] → Actions → Refresh/Sync.',
          'Confirm the check-in timestamp updates in ManageEngine within 15 minutes.',
        ],
      }
    }
    return {
      summary:          `${device.deviceName} is not syncing with Intune — the MDM enrollment may have been interrupted.`,
      rootCause:        `The Intune Management Extension has stopped, the MDM enrollment certificate may have expired, or the device has left Azure AD join. Conditional Access policies may also be blocking re-sync.`,
      recommendation:   'Force an Intune sync and re-enroll the device via Company Portal if sync fails.',
      suggestedRunbook: 'Intune Sync / MDM Re-enrollment',
      riskLevel:        'High',
      steps: [
        'Ask the user to open Settings → Accounts → Access work or school → Info → Sync.',
        'If sync fails, open an admin Command Prompt and run `dsregcmd /status` to check AzureAdJoined state.',
        'If not joined, run `dsregcmd /leave` then re-join via `dsregcmd /join` or re-enroll via Company Portal.',
        'Restart the Intune Management Extension: run `net stop IntuneManagementExtension && net start IntuneManagementExtension` in admin CMD.',
        'In Intune, navigate to Devices → [Device] → Sync to trigger a remote sync.',
        'Verify the Company Portal app is installed; if missing, deploy it via Microsoft Store.',
        'Confirm the device check-in timestamp updates in Intune within 15 minutes.',
      ],
    }
  }

  if (category === 'application') {
    return {
      summary:          `${device.deviceName} has one or more managed application failures — apps are not deploying correctly.`,
      rootCause:        `App deployment failed due to a network issue, insufficient disk space, corrupted package, or a conflicting policy preventing installation. The MDM agent may not have retried after the initial failure.`,
      recommendation:   `Retry the application deployment from ${source} and investigate the specific error code in the deployment logs.`,
      suggestedRunbook: 'App Deployment Failure',
      riskLevel,
      steps: [
        `In ${source}, navigate to Apps → All Apps and find the failing application.`,
        'Review the deployment error code in the app install status report.',
        'Verify the device has sufficient free disk space (minimum 5 GB recommended).',
        'Confirm the app package or MSI is valid and the version is current.',
        'Remove the app assignment, wait 5 minutes, then re-add it to force a fresh deployment.',
        'Force a device sync to trigger the re-installation attempt.',
        'If the error persists, check for conflicting GPO or local policies blocking app installation.',
      ],
    }
  }

  // Default: generic compliance
  return {
    summary:          `${device.deviceName} is ${device.complianceState} — ${device.primaryIssue || 'a compliance policy has not been met'}.`,
    rootCause:        `The device has drifted from the required compliance baseline. ${device.policyFailed ? `The failed policy is: "${device.policyFailed}". ` : ''}This is often caused by a missed MDM sync, user-applied changes, or a recently tightened policy definition.`,
    recommendation:   `Review the failed policy in ${source}, re-push the compliance configuration, and force a device sync.`,
    suggestedRunbook: 'Endpoint Compliance Remediation Playbook',
    riskLevel,
    steps: [
      `Open ${source} and locate the device: "${device.deviceName}".`,
      'Review the compliance status report and identify every failed policy or setting.',
      `${device.policyFailed ? `Re-check the policy "${device.policyFailed}" — verify its configuration and that it is assigned to this device.` : 'Verify all compliance policies are correctly assigned to this device group.'}`,
      'Force a device sync from the MDM console to re-apply all compliance policies.',
      'Ask the user to restart the device to apply any pending configuration changes.',
      `Re-check compliance status in ${source} after 15 minutes.`,
      'If the issue persists after two sync attempts, collect diagnostic logs and escalate to L2.',
    ],
  }
}

export async function analyzeDevice(device: Device): Promise<DeviceAnalysis> {
  const ai = getClient()

  const prompt = `You are an enterprise IT compliance analyst. Analyze this managed device and return a JSON response only.

Device: ${device.deviceName}
User: ${device.user}
Platform: ${device.platform} — ${device.osVersion}
Management Source: ${device.managementSource}
Compliance State: ${device.complianceState}
Encryption Status: ${device.encryptionStatus}
Primary Issue: ${device.primaryIssue}
Policy Failed: ${device.policyFailed}
Severity: ${device.severity}

Return ONLY valid JSON matching this shape exactly:
{
  "summary": "one-sentence status summary",
  "rootCause": "root cause of the compliance issue",
  "recommendation": "recommended remediation action",
  "suggestedRunbook": "runbook name to execute",
  "riskLevel": "Low" | "Medium" | "High" | "Critical",
  "steps": ["step 1", "step 2", "step 3", "step 4", "step 5"]
}`

  const response = await ai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    max_tokens: 600,
    temperature: 0.2,
  })

  const content = response.choices[0]?.message.content ?? '{}'
  return JSON.parse(content) as DeviceAnalysis
}

export async function chatWithAI(message: string, deviceContext?: Device): Promise<string> {
  const ai = getClient()

  const system = `You are an expert enterprise IT endpoint management assistant helping IT administrators.
You specialise in Microsoft Intune and ManageEngine environments.
Be concise, technical, and action-oriented. Prefer bullet points for steps.`

  const context = deviceContext
    ? `Active device context:\n- Name: ${deviceContext.deviceName}\n- Platform: ${deviceContext.platform} (${deviceContext.osVersion})\n- Compliance: ${deviceContext.complianceState}\n- Issue: ${deviceContext.primaryIssue}\n- Source: ${deviceContext.managementSource}\n\n`
    : ''

  const response = await ai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: context + message },
    ],
    max_tokens: 500,
    temperature: 0.3,
  })

  return response.choices[0]?.message.content ?? 'Unable to generate a response.'
}

export function isOpenAIConfigured(): boolean {
  return !!getOpenAIConfig()?.apiKey
}

// ── AI Automation Builder ────────────────────────────────────────────────────

export interface AutomationRuleBlueprint {
  name:        string
  description: string
  category:    'compliance' | 'security' | 'patching' | 'reporting' | 'drift'
  triggerType: 'device_non_compliant' | 'compliance_threshold' | 'device_offline' | 'new_enrollment' | 'scheduled' | 'risky_signin' | 'drift_detected' | 'encryption_off' | 'script_failure'
  platform:    'Windows' | 'macOS' | 'Linux' | 'all'
  source:      'intune' | 'manageengine' | 'all'
  severity:    'Low' | 'Medium' | 'High' | 'Critical' | 'all'
  actions:     Array<'slack_notify' | 'create_jira' | 'execute_runbook' | 'execute_script' | 'generate_report' | 'send_notification'>
  reasoning:   string
}

export async function buildAutomationRule(prompt: string): Promise<AutomationRuleBlueprint> {
  const ai = getClient()

  const systemPrompt = `You are an expert enterprise IT automation architect for an endpoint management platform.
Convert the user's natural language description into a structured automation rule configuration.

Available trigger types: device_non_compliant, compliance_threshold, device_offline, new_enrollment, scheduled, risky_signin, drift_detected, encryption_off, script_failure
Available action types: slack_notify, create_jira, execute_runbook, execute_script, generate_report, send_notification
Available categories: compliance, security, patching, reporting, drift
Available platforms: Windows, macOS, Linux, all
Available sources: intune, manageengine, all
Available severities: Low, Medium, High, Critical, all

Return ONLY valid JSON matching this exact shape:
{
  "name": "concise rule name (max 60 chars)",
  "description": "what this rule does and why (1-2 sentences)",
  "category": "one of the categories above",
  "triggerType": "one of the trigger types above",
  "platform": "platform filter",
  "source": "source filter",
  "severity": "severity filter",
  "actions": ["array of action types"],
  "reasoning": "brief explanation of your choices"
}`

  const response = await ai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 500,
    temperature: 0.2,
  })

  const content = response.choices[0]?.message.content ?? '{}'
  return JSON.parse(content) as AutomationRuleBlueprint
}

export function buildAutomationRuleFallback(prompt: string): AutomationRuleBlueprint {
  const lower = prompt.toLowerCase()

  const isSlack      = lower.includes('slack')
  const isJira       = lower.includes('jira') || lower.includes('ticket') || lower.includes('incident')
  const isScript     = lower.includes('script') || lower.includes('run') || lower.includes('fix') || lower.includes('remediat')
  const isRunbook    = lower.includes('runbook') || lower.includes('playbook')
  const isMac        = lower.includes('mac') || lower.includes('macos') || lower.includes('filevault')
  const isWindows    = lower.includes('windows') || lower.includes('bitlocker') || lower.includes('intune')
  const isEncrypt    = lower.includes('encrypt') || lower.includes('filevault') || lower.includes('bitlocker')
  const isPatch      = lower.includes('patch') || lower.includes('update') || lower.includes('os version')
  const isDrift      = lower.includes('drift') || lower.includes('config')
  const isOffline    = lower.includes('offline') || lower.includes('check-in') || lower.includes('checkin')
  const isCritical   = lower.includes('critical')
  const isHigh       = lower.includes('high')

  const actions: AutomationRuleBlueprint['actions'] = ['send_notification']
  if (isSlack) actions.push('slack_notify')
  if (isJira)  actions.push('create_jira')
  if (isScript) actions.push('execute_script')
  else if (isRunbook) actions.push('execute_runbook')

  let triggerType: AutomationRuleBlueprint['triggerType'] = 'device_non_compliant'
  let category: AutomationRuleBlueprint['category'] = 'compliance'
  if (isEncrypt) { triggerType = 'encryption_off'; category = 'security' }
  else if (isPatch) { triggerType = 'device_non_compliant'; category = 'patching' }
  else if (isDrift) { triggerType = 'drift_detected'; category = 'drift' }
  else if (isOffline) { triggerType = 'device_offline'; category = 'compliance' }

  const platform: AutomationRuleBlueprint['platform'] = isMac ? 'macOS' : isWindows ? 'Windows' : 'all'
  const severity: AutomationRuleBlueprint['severity'] = isCritical ? 'Critical' : isHigh ? 'High' : 'all'

  return {
    name:        `Auto-rule: ${prompt.slice(0, 50)}`,
    description: `Automated rule based on: "${prompt}"`,
    category,
    triggerType,
    platform,
    source:      isMac ? 'manageengine' : isWindows ? 'intune' : 'all',
    severity,
    actions,
    reasoning:   'Parsed from natural language (AI unavailable — rule-based fallback)',
  }
}

// ── Remediation Script Generator ─────────────────────────────────────────────

export async function generateRemediationScript(device: Device): Promise<string> {
  const ai = getClient()

  const prompt = `You are an expert macOS/Windows IT engineer. Generate a production-ready shell script to remediate the following endpoint compliance issue.

Device: ${device.deviceName}
Platform: ${device.platform} — ${device.osVersion}
Primary Issue: ${device.primaryIssue}
Policy Failed: ${device.policyFailed}
Encryption Status: ${device.encryptionStatus}
Management Source: ${device.managementSource}
Severity: ${device.severity}

Requirements:
- For macOS: write a zsh/bash script that runs as root via MDM (no interactive prompts)
- For Windows: write a PowerShell script that runs silently as SYSTEM
- Include safety checks (verify conditions before making changes)
- Include status output lines so logs show progress
- Script should be idempotent (safe to run multiple times)
- End with a success/failure exit code

Return ONLY the raw script content, no markdown fences, no explanation.`

  const response = await ai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 800,
    temperature: 0.1,
  })

  return response.choices[0]?.message.content?.trim() ?? generateFallbackScript(device)
}

function generateFallbackScript(device: Device): string {
  const platform = device.platform
  const issue = (device.primaryIssue ?? '').toLowerCase()
  const encryption = (device.encryptionStatus ?? '').toLowerCase()

  if (platform === 'macOS') {
    if (encryption === 'off' || issue.includes('encrypt') || issue.includes('filevault')) {
      return `#!/bin/zsh
# FileVault Remediation Script — generated by Endpoint AI Copilot
set -euo pipefail

echo "[INFO] Checking FileVault status on $(hostname)..."
STATUS=$(fdesetup status 2>/dev/null || echo "Unknown")
echo "[INFO] Current status: $STATUS"

if echo "$STATUS" | grep -q "FileVault is On"; then
  echo "[OK] FileVault is already enabled. No action needed."
  exit 0
fi

echo "[ACTION] FileVault is not enabled. Triggering MDM enforcement..."
# Signal the MDM agent to re-apply the FileVault configuration profile
/usr/bin/profiles -N 2>/dev/null || true

echo "[INFO] MDM enforcement triggered. FileVault activation will prompt user on next login."
echo "[DONE] Script completed successfully."
exit 0`
    }
    return `#!/bin/zsh
# Compliance Remediation — ${device.primaryIssue || 'general compliance'}
# Generated by Endpoint AI Copilot for ${device.deviceName}
set -euo pipefail

echo "[INFO] Starting compliance remediation on $(hostname)..."
echo "[INFO] Issue: ${device.primaryIssue || 'compliance policy failure'}"

echo "[ACTION] Triggering MDM profile refresh..."
/usr/bin/profiles -N

echo "[DONE] Remediation triggered. Check MDM console for updated status."
exit 0`
  }

  // Windows PowerShell
  return `# Compliance Remediation Script — generated by Endpoint AI Copilot
# Device: ${device.deviceName} | Issue: ${device.primaryIssue}
$ErrorActionPreference = "Stop"

Write-Output "[INFO] Starting compliance remediation on $env:COMPUTERNAME"
Write-Output "[INFO] Issue: ${device.primaryIssue || 'compliance policy failure'}"

try {
  # Force Intune sync
  Write-Output "[ACTION] Triggering Intune management sync..."
  $SyncPath = "C:\\Program Files (x86)\\Microsoft Intune Management Extension\\Microsoft.Management.Services.IntuneWindowsAgent.exe"
  if (Test-Path $SyncPath) {
    Start-Process -FilePath $SyncPath -ArgumentList "intuneManagementExtension://syncAppAndDeviceManagementClient" -Wait
    Write-Output "[OK] Intune sync triggered successfully."
  } else {
    Write-Output "[WARN] IME not found — using fallback sync via Settings API"
    Start-Process ms-settings:workplace
  }
  Write-Output "[DONE] Remediation completed."
  exit 0
} catch {
  Write-Output "[ERROR] Remediation failed: $_"
  exit 1
}`
}

// ── Fleet Report Generator ────────────────────────────────────────────────────

export interface FleetReportResult {
  summary:         string
  criticalFindings: string[]
  recommendations: string[]
  markdownReport:  string
}

export async function generateFleetReport(
  devices: Device[],
  ruleName: string,
  matchedCount: number,
): Promise<FleetReportResult> {
  const nonCompliant = devices.filter(d => d.complianceState !== 'Compliant')
  const critical     = devices.filter(d => d.severity === 'Critical')
  const noEncrypt    = devices.filter(d => ['off', 'disabled'].includes((d.encryptionStatus ?? '').toLowerCase()))

  if (!isOpenAIConfigured()) {
    return generateFallbackFleetReport(devices, ruleName, matchedCount, nonCompliant, critical, noEncrypt)
  }

  const ai = getClient()

  const prompt = `Generate a concise IT fleet compliance report in JSON.

Rule triggered: "${ruleName}"
Matched devices: ${matchedCount} of ${devices.length} total
Non-compliant: ${nonCompliant.length}
Critical severity: ${critical.length}
Encryption off: ${noEncrypt.length}
Platforms: ${[...new Set(devices.map(d => d.platform))].join(', ')}

Top issues: ${nonCompliant.slice(0, 5).map(d => `${d.deviceName}: ${d.primaryIssue}`).join('; ')}

Return JSON:
{
  "summary": "2-sentence executive summary",
  "criticalFindings": ["finding 1", "finding 2", "finding 3"],
  "recommendations": ["action 1", "action 2", "action 3"],
  "markdownReport": "full markdown report with ## sections"
}`

  const response = await ai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    max_tokens: 700,
    temperature: 0.2,
  })

  return JSON.parse(response.choices[0]?.message.content ?? '{}') as FleetReportResult
}

function generateFallbackFleetReport(
  devices: Device[],
  ruleName: string,
  matchedCount: number,
  nonCompliant: Device[],
  critical: Device[],
  noEncrypt: Device[],
): FleetReportResult {
  const summary = `Fleet scan triggered by "${ruleName}" matched ${matchedCount} device(s) across ${devices.length} total. ` +
    `${nonCompliant.length} device(s) are non-compliant, ${critical.length} at critical severity.`

  const criticalFindings: string[] = []
  if (critical.length > 0) criticalFindings.push(`${critical.length} device(s) at Critical severity requiring immediate attention`)
  if (noEncrypt.length > 0) criticalFindings.push(`${noEncrypt.length} device(s) with disk encryption disabled`)
  if (nonCompliant.length > 0) criticalFindings.push(`${nonCompliant.length} non-compliant device(s): ${nonCompliant.slice(0, 3).map(d => d.deviceName).join(', ')}`)

  const recommendations = [
    'Review and remediate all Critical and High severity devices within 24 hours',
    'Enable disk encryption enforcement in MDM for all affected devices',
    'Force MDM sync on offline or non-reporting devices',
  ]

  const markdownReport = [
    `## Fleet Compliance Report`,
    `**Rule:** ${ruleName}`,
    `**Scan time:** ${new Date().toISOString()}`,
    '',
    `### Summary`,
    summary,
    '',
    `### Device Status`,
    `| Metric | Count |`,
    `|---|---|`,
    `| Total devices | ${devices.length} |`,
    `| Matched (rule fired) | ${matchedCount} |`,
    `| Non-compliant | ${nonCompliant.length} |`,
    `| Critical severity | ${critical.length} |`,
    `| Encryption off | ${noEncrypt.length} |`,
    '',
    `### Top Issues`,
    ...nonCompliant.slice(0, 5).map(d => `- **${d.deviceName}**: ${d.primaryIssue || 'Policy failure'} (${d.severity})`),
    '',
    `### Recommendations`,
    ...recommendations.map(r => `1. ${r}`),
  ].join('\n')

  return { summary, criticalFindings, recommendations, markdownReport }
}
