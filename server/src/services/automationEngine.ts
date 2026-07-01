/**
 * Real automation execution engine.
 * Fetches live devices, matches them against rule conditions, and fires real actions:
 * Slack messages, Jira tickets, AI-generated runbooks & scripts, in-app notifications.
 */

import type { AutomationRule, AutomationExecution, Device } from '../types.js'
import { addExecution } from '../data/mockAutomations.js'
import { addNotification } from '../data/notificationStore.js'
import { getSlackConfig, isConfigured } from '../store/integrationStore.js'
import {
  analyzeDevice,
  generateFallbackAnalysis,
  generateRemediationScript,
  generateFleetReport,
  isOpenAIConfigured,
} from './openai.js'
import { createJiraIssue, isJiraConfigured } from './jira.js'
import { sendTeamsAlert, isTeamsConfigured } from './teams.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ActionResult {
  type:   string
  label:  string
  status: 'success' | 'failed'
  result: string
  detail?: {
    runbookSteps?:   string[]
    script?:         string
    jiraKey?:        string
    jiraUrl?:        string
    slackTs?:        string
    slackChannel?:   string
    reportMarkdown?: string
    reportSummary?:  string
  }
}

export interface EngineRunResult {
  execution:         AutomationExecution
  matchedDevices:    Device[]
  actionsExecuted:   ActionResult[]
}

// ── Device Condition Matching ─────────────────────────────────────────────────

function deviceMatchesTrigger(device: Device, trigger: AutomationRule['trigger']): boolean {
  const enc = (device.encryptionStatus ?? '').toLowerCase()
  switch (trigger.type) {
    case 'encryption_off':
      return enc === 'off' || enc === 'disabled' || enc === 'not encrypted' || enc === 'pending'
    case 'device_non_compliant':
      return device.complianceState === 'Non-Compliant'
    case 'drift_detected':
      return device.complianceState !== 'Compliant'
    case 'device_offline': {
      const daysThreshold = Number(trigger.config.days ?? 3)
      const lastSeen = new Date(device.lastCheckIn).getTime()
      const daysSince = (Date.now() - lastSeen) / 86_400_000
      return daysSince >= daysThreshold
    }
    case 'compliance_threshold':
      return device.complianceState !== 'Compliant'
    case 'script_failure':
      return device.complianceState === 'Non-Compliant' && (device.primaryIssue ?? '').toLowerCase().includes('script')
    case 'enrollment_failed':
      return (device.primaryIssue ?? '').toLowerCase().includes('enroll')
    case 'sync_failure': {
      const lastSeen = new Date(device.lastCheckIn).getTime()
      const hoursSince = (Date.now() - lastSeen) / 3_600_000
      return hoursSince >= 6
    }
    case 'app_deploy_failed':
      return (device.primaryIssue ?? '').toLowerCase().includes('app') || (device.primaryIssue ?? '').toLowerCase().includes('install')
    case 'cert_expiring':
      return device.complianceState !== 'Compliant' && (device.primaryIssue ?? '').toLowerCase().includes('cert')
    case 'stale_device': {
      const daysThreshold = Number(trigger.config.days ?? 30)
      const lastSeen = new Date(device.lastCheckIn).getTime()
      const daysSince = (Date.now() - lastSeen) / 86_400_000
      return daysSince >= daysThreshold
    }
    case 'risky_signin':
    case 'new_enrollment':
    case 'scheduled':
      // These triggers don't filter by device state — they match all applicable devices
      return true
    default:
      return false
  }
}

function deviceMatchesConditions(device: Device, conditions: AutomationRule['conditions']): boolean {
  if (conditions.platform !== 'all' && device.platform !== conditions.platform) return false

  if (conditions.source !== 'all') {
    const src = device.managementSource.toLowerCase()
    const want = conditions.source.toLowerCase()
    if (want === 'intune'        && !src.includes('intune'))        return false
    if (want === 'kandji'        && !src.includes('kandji'))        return false
    if (want === 'manageengine'  && !src.includes('manageengine'))  return false
  }

  if (conditions.severity !== 'all' && device.severity !== conditions.severity) return false

  if (conditions.complianceState !== 'all' && device.complianceState !== conditions.complianceState) return false

  return true
}

export function findMatchingDevices(rule: AutomationRule, devices: Device[]): Device[] {
  return devices.filter(d =>
    deviceMatchesTrigger(d, rule.trigger) && deviceMatchesConditions(d, rule.conditions),
  )
}

// ── Action Handlers ───────────────────────────────────────────────────────────

async function handleSendNotification(
  action: AutomationRule['actions'][0],
  rule: AutomationRule,
  device?: Device,
): Promise<ActionResult> {
  const msg = device
    ? `[${rule.category.toUpperCase()}] ${rule.name} triggered for ${device.deviceName}: ${device.primaryIssue || device.complianceState}`
    : `[${rule.category.toUpperCase()}] ${rule.name} triggered (${rule.trigger.type})`

  addNotification(msg, rule.category === 'security' ? 'error' : rule.category === 'compliance' ? 'warning' : 'info')
  return {
    type: action.type, label: action.label, status: 'success',
    result: msg,
  }
}

async function handleSlackNotify(
  action: AutomationRule['actions'][0],
  rule: AutomationRule,
  device?: Device,
): Promise<ActionResult> {
  if (!isConfigured('slack')) {
    return {
      type: action.type, label: action.label, status: 'failed',
      result: 'Slack not configured — add credentials in Settings → Integrations',
    }
  }

  const cfg = getSlackConfig()!
  const channel = action.config.channel ?? '#it-alerts'

  const deviceLine = device
    ? `*Device:* ${device.deviceName} (${device.platform}) — ${device.user}\n*Issue:* ${device.primaryIssue || device.complianceState}\n*Severity:* ${device.severity}`
    : `*Trigger:* ${rule.trigger.type}`

  const text = `:zap: *Automation Alert — ${rule.name}*\n${deviceLine}\n_Rule category: ${rule.category}_`

  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.botToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, text, unfurl_links: false }),
    })
    const data = await res.json() as { ok: boolean; ts?: string; error?: string }
    if (!data.ok) throw new Error(data.error ?? 'slack error')
    return {
      type: action.type, label: action.label, status: 'success',
      result: `Slack message sent to ${channel}`,
      detail: { ...(data.ts ? { slackTs: data.ts } : {}), slackChannel: channel },
    }
  } catch (err) {
    return {
      type: action.type, label: action.label, status: 'failed',
      result: `Slack send failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

async function handleCreateJira(
  action: AutomationRule['actions'][0],
  rule: AutomationRule,
  device?: Device,
): Promise<ActionResult> {
  if (!isJiraConfigured()) {
    return {
      type: action.type, label: action.label, status: 'failed',
      result: 'Jira not configured — add JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN in Settings → Integrations',
    }
  }

  const priority = (device?.severity === 'Critical' ? 'Critical' : device?.severity === 'High' ? 'High' : 'Medium') as 'Critical' | 'High' | 'Medium'
  const summary = device
    ? `[${rule.category.toUpperCase()}] ${device.deviceName}: ${device.primaryIssue || rule.name}`
    : `[${rule.category.toUpperCase()}] ${rule.name} — automation alert`

  const description = device
    ? `Automation rule "${rule.name}" detected an issue on ${device.deviceName}.\n\nDevice: ${device.deviceName}\nUser: ${device.user}\nPlatform: ${device.platform} (${device.osVersion})\nCompliance: ${device.complianceState}\nSeverity: ${device.severity}\nIssue: ${device.primaryIssue || 'Compliance policy failure'}\nPolicy failed: ${device.policyFailed || 'N/A'}\nLast check-in: ${device.lastCheckIn}\nManagement source: ${device.managementSource}\n\nAuto-generated by Endpoint AI Copilot.`
    : `Automation rule "${rule.name}" (${rule.trigger.type}) was triggered. No specific device context — review fleet compliance.\n\nAuto-generated by Endpoint AI Copilot.`

  try {
    const issue = await createJiraIssue({
      summary, description,
      issueType: 'Incident',
      priority,
      labels: ['endpoint-compliance', 'ai-automation', rule.category],
    })
    return {
      type: action.type, label: action.label, status: 'success',
      result: `Jira ticket created: ${issue.key}`,
      detail: { jiraKey: issue.key, jiraUrl: issue.url },
    }
  } catch (err) {
    return {
      type: action.type, label: action.label, status: 'failed',
      result: `Jira creation failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

async function handleExecuteRunbook(
  action: AutomationRule['actions'][0],
  rule: AutomationRule,
  device?: Device,
): Promise<ActionResult> {
  if (!device) {
    return {
      type: action.type, label: action.label, status: 'success',
      result: 'No device context — generated generic runbook',
      detail: {
        runbookSteps: [
          `Review ${rule.category} compliance status in your MDM console`,
          'Identify devices affected by this policy trigger',
          'Apply the relevant remediation policy from your MDM library',
          'Force a device sync to re-evaluate compliance',
          'Verify compliance status clears within 15 minutes',
        ],
      },
    }
  }

  try {
    const analysis = isOpenAIConfigured()
      ? await analyzeDevice(device)
      : generateFallbackAnalysis(device)

    return {
      type: action.type, label: action.label, status: 'success',
      result: `AI runbook generated for ${device.deviceName}: ${analysis.suggestedRunbook}`,
      detail: { runbookSteps: analysis.steps },
    }
  } catch (err) {
    const fallback = generateFallbackAnalysis(device)
    return {
      type: action.type, label: action.label, status: 'success',
      result: `Runbook generated (fallback): ${fallback.suggestedRunbook}`,
      detail: { runbookSteps: fallback.steps },
    }
  }
}

async function handleExecuteScript(
  action: AutomationRule['actions'][0],
  rule: AutomationRule,
  device?: Device,
): Promise<ActionResult> {
  if (!device) {
    return {
      type: action.type, label: action.label, status: 'failed',
      result: 'Script generation requires a device context',
    }
  }

  try {
    const script = isOpenAIConfigured()
      ? await generateRemediationScript(device)
      : generateFallbackScriptLocal(device)

    return {
      type: action.type, label: action.label, status: 'success',
      result: `Remediation script generated for ${device.deviceName} (${device.platform})`,
      detail: { script },
    }
  } catch (err) {
    return {
      type: action.type, label: action.label, status: 'failed',
      result: `Script generation failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

async function handleTeamsNotify(
  action: AutomationRule['actions'][0],
  rule: AutomationRule,
  device?: Device,
): Promise<ActionResult> {
  if (!isTeamsConfigured()) {
    return {
      type: action.type, label: action.label, status: 'failed',
      result: 'Teams not configured — add TEAMS_WEBHOOK_URL in Settings → Integrations',
    }
  }

  const result = await sendTeamsAlert({
    ruleName: rule.name,
    ruleCategory: rule.category,
    ...(device?.deviceName ? { deviceName: device.deviceName } : {}),
    ...(device?.user ? { deviceUser: device.user } : {}),
    ...(device?.primaryIssue || device?.complianceState ? { issue: device.primaryIssue || device.complianceState } : {}),
    ...(device?.severity ? { severity: device.severity } : {}),
  })

  if (result.success) {
    return {
      type: action.type, label: action.label, status: 'success',
      result: `Teams notification sent for rule "${rule.name}"`,
    }
  }
  return {
    type: action.type, label: action.label, status: 'failed',
    result: `Teams notification failed: ${result.error}`,
  }
}

async function handleGenerateReport(
  action: AutomationRule['actions'][0],
  rule: AutomationRule,
  matchedDevices: Device[],
  allDevices: Device[],
): Promise<ActionResult> {
  try {
    const report = await generateFleetReport(allDevices, rule.name, matchedDevices.length)
    addNotification(`Fleet report generated: ${report.summary.slice(0, 120)}`, 'info')
    return {
      type: action.type, label: action.label, status: 'success',
      result: `Fleet report generated — ${matchedDevices.length} matched devices`,
      detail: { reportMarkdown: report.markdownReport, reportSummary: report.summary },
    }
  } catch (err) {
    return {
      type: action.type, label: action.label, status: 'failed',
      result: `Report generation failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

function generateFallbackScriptLocal(device: Device): string {
  const enc = (device.encryptionStatus ?? '').toLowerCase()
  if (device.platform === 'macOS') {
    if (enc === 'off' || enc === 'disabled') {
      return `#!/bin/zsh\n# FileVault Remediation — ${device.deviceName}\nset -euo pipefail\necho "[INFO] Triggering FileVault enforcement..."\n/usr/bin/profiles -N 2>/dev/null || true\n/usr/local/bin/kandji run 2>/dev/null || true\necho "[DONE] MDM enforcement triggered."\nexit 0`
    }
    return `#!/bin/zsh\n# Compliance Remediation — ${device.deviceName}\nset -euo pipefail\necho "[INFO] Triggering Kandji compliance check..."\n/usr/local/bin/kandji run\necho "[DONE] Compliance check triggered."\nexit 0`
  }
  return `# Compliance Remediation — ${device.deviceName}\n$ErrorActionPreference = "Stop"\nWrite-Output "[INFO] Triggering Intune sync on $env:COMPUTERNAME"\nStart-Process "C:\\Program Files (x86)\\Microsoft Intune Management Extension\\Microsoft.Management.Services.IntuneWindowsAgent.exe"\nWrite-Output "[DONE] Sync triggered."\nexit 0`
}

// ── Main Orchestrator ─────────────────────────────────────────────────────────

export async function runAutomationRule(
  rule: AutomationRule,
  allDevices: Device[],
  options: { testMode?: boolean; maxDevices?: number } = {},
): Promise<EngineRunResult> {
  const start = Date.now()
  const { testMode = false, maxDevices = 10 } = options

  // For scheduled/reporting triggers that don't filter by device state, still run on all applicable
  const matchedDevices = findMatchingDevices(rule, allDevices)
  const devicesToProcess = matchedDevices.slice(0, maxDevices)

  // For 'generate_report' run once for the whole fleet; for others run per device (or once if no devices)
  const isReportRule = rule.actions.some(a => a.type === 'generate_report')
  const targetDevices = devicesToProcess.length > 0 ? devicesToProcess : [undefined as unknown as Device]

  const allResults: ActionResult[] = []

  for (const device of (isReportRule ? [devicesToProcess[0]] : targetDevices)) {
    for (const action of rule.actions) {
      let result: ActionResult

      if (testMode && !['execute_runbook', 'execute_script', 'generate_report', 'send_notification'].includes(action.type)) {
        // In test mode, simulate Slack/Jira but still run AI actions
        result = {
          type: action.type, label: action.label, status: 'success',
          result: `[TEST] ${action.label} — simulated (credentials not used in test mode)`,
        }
      } else {
        switch (action.type) {
          case 'send_notification': result = await handleSendNotification(action, rule, device); break
          case 'slack_notify':      result = await handleSlackNotify(action, rule, device); break
          case 'create_jira':       result = await handleCreateJira(action, rule, device); break
          case 'execute_runbook':   result = await handleExecuteRunbook(action, rule, device); break
          case 'execute_script':    result = await handleExecuteScript(action, rule, device); break
          case 'generate_report':   result = await handleGenerateReport(action, rule, devicesToProcess, allDevices); break
          case 'teams_notify':      result = await handleTeamsNotify(action, rule, device); break
          default:
            result = { type: action.type, label: action.label, status: 'success', result: `[${action.type}] executed` }
        }
      }

      allResults.push(result)
    }

    // Only process one iteration for report-type rules
    if (isReportRule) break
  }

  const overallStatus: AutomationExecution['status'] =
    allResults.every(r => r.status === 'success') ? 'success' :
    allResults.some(r => r.status === 'success')  ? 'partial'  : 'failed'

  const triggerDevice = devicesToProcess[0]
  const triggerReason = testMode
    ? `Manual test trigger from UI${triggerDevice ? ` — matched ${matchedDevices.length} device(s)` : ' — no matching devices found'}`
    : `${rule.trigger.type} — ${matchedDevices.length} device(s) matched rule conditions`

  const execution: AutomationExecution = {
    id:              `exec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ruleId:          rule.id,
    ruleName:        rule.name,
    category:        rule.category,
    triggeredAt:     new Date().toISOString(),
    ...(triggerDevice?.id        ? { deviceId:   triggerDevice.id }        : {}),
    ...(triggerDevice?.deviceName ? { deviceName: triggerDevice.deviceName } : {}),
    triggerReason,
    status:          overallStatus,
    actionsExecuted: allResults as AutomationExecution['actionsExecuted'],
    durationMs:      Date.now() - start,
    matchedDeviceCount: matchedDevices.length,
  }

  addExecution(execution)
  return { execution, matchedDevices: devicesToProcess, actionsExecuted: allResults }
}

// ── Scan All Enabled Rules ────────────────────────────────────────────────────

export interface ScanResult {
  rulesEvaluated: number
  rulesFired:     number
  totalMatches:   number
  executions:     AutomationExecution[]
}

export async function scanAllRules(
  rules: AutomationRule[],
  allDevices: Device[],
): Promise<ScanResult> {
  const enabledRules = rules.filter(r => r.enabled)
  const executions: AutomationExecution[] = []
  let totalMatches = 0
  let rulesFired = 0

  for (const rule of enabledRules) {
    const matched = findMatchingDevices(rule, allDevices)
    const hasReportAction = rule.actions.some(a => a.type === 'generate_report')
    if (matched.length === 0 && rule.trigger.type !== 'scheduled' && !hasReportAction) continue

    rulesFired++
    totalMatches += matched.length
    const result = await runAutomationRule(rule, allDevices)
    executions.push(result.execution)
  }

  return {
    rulesEvaluated: enabledRules.length,
    rulesFired,
    totalMatches,
    executions,
  }
}
