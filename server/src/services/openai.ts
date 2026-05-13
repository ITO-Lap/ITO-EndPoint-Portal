import OpenAI from 'openai'
import type { Device } from '../types.js'

let client: OpenAI | null = null

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')
    client = new OpenAI({ apiKey })
  }
  return client
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
        summary:          `${device.deviceName} has missed scheduled MDM check-ins — the Kandji agent may be unresponsive.`,
        rootCause:        `The Kandji agent process has stopped, crashed, or the device has lost connectivity to Kandji endpoints. Extended offline periods can also cause missed check-ins.`,
        recommendation:   'Restart the Kandji agent and verify the device can reach Kandji API endpoints.',
        suggestedRunbook: 'Restart MDM Agent',
        riskLevel:        'High',
        steps: [
          'Confirm the device is powered on and connected to the internet.',
          'Restart the Kandji agent: open Terminal and run `sudo launchctl kickstart -k system/com.kandji.agent`.',
          'Check agent logs: open Console.app and filter by "com.kandji" to identify recent errors.',
          'Verify network access to Kandji: run `curl -I https://subdomain.api.kandji.io` from Terminal.',
          'If the agent is missing or corrupted, re-enroll the device using the Kandji enrollment link.',
          'Trigger a remote sync from Kandji Admin: Devices → [Device] → Actions → Send MDM Command.',
          'Confirm the check-in timestamp updates in Kandji within 15 minutes.',
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
You specialise in Microsoft Intune, Kandji, and ManageEngine environments.
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
  return !!process.env.OPENAI_API_KEY
}
