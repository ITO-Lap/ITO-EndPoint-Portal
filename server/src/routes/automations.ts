import { Router } from 'express'
import { requireCapability } from '../middleware/requireRole.js'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import {
  getRules, getRuleById, createRule, updateRule, deleteRule, toggleRule,
  getExecutions, getStats,
} from '../data/mockAutomations.js'
import { runAutomationRule, scanAllRules } from '../services/automationEngine.js'
import {
  buildAutomationRule,
  buildAutomationRuleFallback,
  isOpenAIConfigured,
} from '../services/openai.js'
import { getManageEngineDevices } from '../services/manageEngine.js'
import { getIntuneDevices } from '../services/intune.js'
import type { AutomationRule, Device } from '../types.js'

const router = Router()

// ── Validation schemas ────────────────────────────────────────────────────────

const triggerSchema = z.object({
  type: z.enum([
    'device_non_compliant', 'compliance_threshold', 'device_offline',
    'new_enrollment', 'scheduled', 'risky_signin', 'drift_detected',
    'encryption_off', 'script_failure',
    'enrollment_failed', 'sync_failure', 'app_deploy_failed', 'cert_expiring', 'stale_device',
    'agent_missing', 'agent_stale',
  ]),
  config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
})

const conditionsSchema = z.object({
  platform:       z.enum(['Windows', 'macOS', 'Linux', 'all']).default('all'),
  source:         z.enum(['intune', 'manageengine', 'all']).default('all'),
  severity:       z.enum(['Low', 'Medium', 'High', 'Critical', 'all']).default('all'),
  complianceState: z.enum(['Non-Compliant', 'Warning', 'all']).default('all'),
})

const actionSchema = z.object({
  type:   z.enum(['slack_notify', 'create_jira', 'execute_runbook', 'execute_script', 'generate_report', 'send_notification', 'teams_notify']),
  label:  z.string().min(1),
  config: z.record(z.string(), z.string()).default({}),
})

const createRuleSchema = z.object({
  name:        z.string().min(1, 'name is required').max(120),
  description: z.string().min(1, 'description is required').max(500),
  category:    z.enum(['compliance', 'security', 'patching', 'reporting', 'drift']),
  enabled:     z.boolean().default(true),
  trigger:     triggerSchema,
  conditions:  conditionsSchema.default({ platform: 'all', source: 'all', severity: 'all', complianceState: 'all' }),
  actions:     z.array(actionSchema).min(1, 'at least one action is required').max(5),
  createdBy:   z.string().default('Global Admin'),
})

const listQuerySchema = z.object({
  category: z.enum(['compliance', 'security', 'patching', 'reporting', 'drift', 'all']).optional(),
})

const executionsQuerySchema = z.object({
  ruleId: z.string().optional(),
  limit:  z.coerce.number().int().min(1).max(200).default(50),
})

// ── Helpers ───────────────────────────────────────────────────────────────────

export async function fetchLiveDevices(): Promise<Device[]> {
  const results = await Promise.allSettled([
    getManageEngineDevices().catch(() => [] as Device[]),
    getIntuneDevices().catch(() => [] as Device[]),
  ])
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : [])
}

// ── GET /api/automations ──────────────────────────────────────────────────────

router.get('/', asyncHandler(async (req, res) => {
  const { category } = listQuerySchema.parse(req.query)
  const rules = getRules(category)
  res.json({ success: true, data: rules })
}))

// ── GET /api/automations/stats ────────────────────────────────────────────────

router.get('/stats', asyncHandler(async (_req, res) => {
  res.json({ success: true, data: getStats() })
}))

// ── GET /api/automations/executions ──────────────────────────────────────────

router.get('/executions', asyncHandler(async (req, res) => {
  const { ruleId, limit } = executionsQuerySchema.parse(req.query)
  const executions = getExecutions(ruleId, limit)
  res.json({ success: true, data: executions })
}))

// ── GET /api/automations/:id ──────────────────────────────────────────────────

router.get('/:id', asyncHandler(async (req, res) => {
  const rule = getRuleById(req.params.id as string)
  if (!rule) { res.status(404).json({ success: false, error: 'Rule not found' }); return }
  res.json({ success: true, data: rule })
}))

// ── POST /api/automations ─────────────────────────────────────────────────────

router.post('/', requireCapability('pages.Automation'), asyncHandler(async (req, res) => {
  const parsed = createRuleSchema.parse(req.body)
  const now = new Date().toISOString()
  const rule: AutomationRule = {
    id:           `rule-${Date.now()}`,
    name:         parsed.name,
    description:  parsed.description,
    category:     parsed.category,
    enabled:      parsed.enabled,
    trigger:      parsed.trigger as AutomationRule['trigger'],
    conditions:   parsed.conditions as AutomationRule['conditions'],
    actions:      parsed.actions as AutomationRule['actions'],
    triggerCount: 0,
    createdAt:    now,
    createdBy:    parsed.createdBy,
  }
  res.status(201).json({ success: true, data: createRule(rule) })
}))

// ── PUT /api/automations/:id ──────────────────────────────────────────────────

router.put('/:id', requireCapability('pages.Automation'), asyncHandler(async (req, res) => {
  const id = req.params.id as string
  const existing = getRuleById(id)
  if (!existing) { res.status(404).json({ success: false, error: 'Rule not found' }); return }
  const parsed = createRuleSchema.partial().parse(req.body)
  const updated = updateRule(id, parsed as Partial<AutomationRule>)
  res.json({ success: true, data: updated })
}))

// ── PATCH /api/automations/:id/toggle ────────────────────────────────────────

router.patch('/:id/toggle', requireCapability('pages.Automation'), asyncHandler(async (req, res) => {
  const rule = toggleRule(req.params.id as string)
  if (!rule) { res.status(404).json({ success: false, error: 'Rule not found' }); return }
  res.json({ success: true, data: rule })
}))

// ── DELETE /api/automations/:id ───────────────────────────────────────────────

router.delete('/:id', requireCapability('pages.Automation'), asyncHandler(async (req, res) => {
  const id = req.params.id as string
  const deleted = deleteRule(id)
  if (!deleted) { res.status(404).json({ success: false, error: 'Rule not found' }); return }
  res.json({ success: true, data: { id } })
}))

// ── POST /api/automations/:id/test ───────────────────────────────────────────
// Fetches live devices, evaluates conditions, executes real actions (AI runbooks
// and scripts run for real; Slack/Jira are simulated in test mode to avoid spam)

router.post('/:id/test', requireCapability('pages.Automation'), asyncHandler(async (req, res) => {
  const rule = getRuleById(req.params.id as string)
  if (!rule) { res.status(404).json({ success: false, error: 'Rule not found' }); return }

  const devices = await fetchLiveDevices()
  const result = await runAutomationRule(rule, devices, { testMode: true, maxDevices: 5 })

  res.json({
    success: true,
    data: result.execution,
    meta: {
      liveDevicesScanned: devices.length,
      matchedDevices:     result.matchedDevices.map(d => ({ id: d.id, name: d.deviceName, platform: d.platform })),
    },
  })
}))

// ── POST /api/automations/scan ────────────────────────────────────────────────
// Scans ALL enabled rules against live devices and fires real actions

router.post('/scan', requireCapability('pages.Automation'), asyncHandler(async (_req, res) => {
  const rules   = getRules()
  const devices = await fetchLiveDevices()
  const result  = await scanAllRules(rules, devices)

  res.json({
    success: true,
    data: result,
    meta: { liveDevicesScanned: devices.length },
  })
}))

// ── POST /api/automations/ai-build ───────────────────────────────────────────
// Natural language → pre-filled rule configuration

router.post('/ai-build', requireCapability('pages.Automation'), asyncHandler(async (req, res) => {
  const { prompt } = z.object({ prompt: z.string().min(5).max(500) }).parse(req.body)

  const blueprint = isOpenAIConfigured()
    ? await buildAutomationRule(prompt)
    : buildAutomationRuleFallback(prompt)

  const ACTION_LABELS: Record<string, string> = {
    slack_notify:      'Send Slack message',
    create_jira:       'Create Jira ticket',
    execute_runbook:   'Trigger remediation runbook',
    execute_script:    'Run remote script',
    generate_report:   'Generate report',
    send_notification: 'Send in-app notification',
  }

  // Return as a CreateAutomationRuleInput-compatible shape ready to POST
  const ruleInput = {
    name:        blueprint.name,
    description: blueprint.description,
    category:    blueprint.category,
    enabled:     true,
    trigger:     { type: blueprint.triggerType, config: {} },
    conditions:  {
      platform:        blueprint.platform,
      source:          blueprint.source,
      severity:        blueprint.severity,
      complianceState: 'all' as const,
    },
    actions: blueprint.actions.map(type => ({
      type,
      label:  ACTION_LABELS[type] ?? type,
      config: {},
    })),
    createdBy: 'Global Admin',
    _meta: {
      aiGenerated: true,
      reasoning:   blueprint.reasoning,
      usedOpenAI:  isOpenAIConfigured(),
    },
  }

  res.json({ success: true, data: ruleInput })
}))

export default router
