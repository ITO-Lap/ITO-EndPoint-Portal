// Scheduled report management routes.
// Persists via server/src/store/scheduledReportsStore.ts — PostgreSQL when
// DATABASE_URL is set, otherwise a JSON file, no database required.
// Execution is driven by server/src/services/scheduledReportRunner.ts.

import { Router } from 'express'
import { effectiveFormat } from '../services/reportFormats.js'
import { requireCapability } from '../middleware/requireRole.js'
import * as store from '../store/scheduledReportsStore.js'
import type { ReportFormat, ReportType } from '../store/scheduledReportsStore.js'
import { runScheduledReportNow } from '../services/scheduledReportRunner.js'
import { asyncHandler } from '../middleware/errorHandler.js'

const router = Router()
router.use(requireCapability('pages.Scheduled Reports'))

const SLACK_ONLY = new Set<string>(['fleet-digest', 'entra-duplicate-devices', 'windows-briefing'])
const VALID_TYPES: ReportType[] = ['critical-patching', 'stale-devices', 'compliance', 'inventory', 'app-updates', 'fleet-digest', 'entra-duplicate-devices', 'windows-updates', 'windows-briefing']
const VALID_FORMATS: ReportFormat[] = ['pdf', 'excel', 'csv', 'pptx']

// Validate a 5-field cron expression (lightweight — not a full parser)
function isValidCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/)
  return parts.length === 5
}

// GET /api/scheduled-reports
router.get('/', asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await store.listReports() })
}))

// GET /api/scheduled-reports/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const report = await store.getReport(req.params.id as string)
  if (!report) { res.status(404).json({ success: false, error: 'Schedule not found' }); return }
  res.json({ success: true, data: report })
}))

// POST /api/scheduled-reports
router.post('/', asyncHandler(async (req, res) => {
  const {
    name, report_type, schedule_cron,
    format = 'excel', recipients = ['ITO_Endpoint@zinnia.com'], filters = {}, created_by,
  } = req.body as {
    name: string; report_type: string; schedule_cron: string
    format?: string; recipients?: string[]; filters?: Record<string, unknown>; created_by?: string
  }

  if (!name || !report_type || !schedule_cron) {
    res.status(400).json({ success: false, error: 'name, report_type, schedule_cron are required' }); return
  }
  if (!isValidCron(schedule_cron)) {
    res.status(400).json({ success: false, error: 'schedule_cron must be a valid 5-field cron expression (e.g. "0 8 * * 1")' }); return
  }
  if (!VALID_TYPES.includes(report_type as ReportType)) {
    res.status(400).json({ success: false, error: `report_type must be one of: ${VALID_TYPES.join(', ')}` }); return
  }
  if (!VALID_FORMATS.includes(format as ReportFormat)) {
    res.status(400).json({ success: false, error: `format must be one of: ${VALID_FORMATS.join(', ')}` }); return
  }
  const slackChannelId = (filters as { slackChannelId?: unknown }).slackChannelId
  const hasSlack = typeof slackChannelId === 'string' && slackChannelId.trim().length > 0
  if (!hasSlack && recipients.length === 0) {
    res.status(400).json({ success: false, error: 'A Slack channel or at least one email recipient is required.' }); return
  }

  const report = await store.createReport({
    name, report_type: report_type as ReportType, schedule_cron, format: effectiveFormat(report_type, format) as ReportFormat,
    recipients, filters, created_by: created_by ?? null,
  })
  res.status(201).json({ success: true, data: report })
}))

// PUT /api/scheduled-reports/:id
router.put('/:id', asyncHandler(async (req, res) => {
  const { name, schedule_cron, format, recipients, filters, is_active } = req.body as {
    name?: string; schedule_cron?: string; format?: string; recipients?: string[]; filters?: Record<string, unknown>; is_active?: boolean
  }

  if (schedule_cron && !isValidCron(schedule_cron)) {
    res.status(400).json({ success: false, error: 'Invalid cron expression' }); return
  }

  if (format !== undefined && !VALID_FORMATS.includes(format as ReportFormat)) {
    res.status(400).json({ success: false, error: `format must be one of: ${VALID_FORMATS.join(', ')}` }); return
  }
  const existing = await store.getReport(req.params.id as string)
  if (!existing) { res.status(404).json({ success: false, error: 'Schedule not found' }); return }
  // Validate the delivery that will result from this update, not just the fields sent.
  const nextFilters = filters ?? existing.filters
  const nextRecipients = recipients ?? existing.recipients
  const slackId = (nextFilters as { slackChannelId?: unknown }).slackChannelId
  const nextHasSlack = typeof slackId === 'string' && slackId.trim().length > 0
  if (!nextHasSlack && nextRecipients.length === 0) {
    res.status(400).json({ success: false, error: 'A Slack channel or at least one email recipient is required.' }); return
  }
  if (!nextHasSlack && SLACK_ONLY.has(existing.report_type)) {
    res.status(400).json({ success: false, error: 'This report is delivered to Slack only; a Slack channel is required.' }); return
  }

  const patch: Record<string, unknown> = {}
  if (filters !== undefined) patch.filters = filters
  if (name !== undefined) patch.name = name
  if (schedule_cron !== undefined) patch.schedule_cron = schedule_cron
  if (format !== undefined) patch.format = effectiveFormat(existing.report_type, format) // Excel-only report types stay Excel
  if (recipients !== undefined) patch.recipients = recipients
  if (is_active !== undefined) patch.is_active = is_active

  const updated = await store.updateReport(req.params.id as string, patch)
  if (!updated) { res.status(404).json({ success: false, error: 'Schedule not found' }); return }
  res.json({ success: true })
}))

// DELETE /api/scheduled-reports/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  await store.deleteReport(req.params.id as string)
  res.json({ success: true })
}))

// POST /api/scheduled-reports/:id/run — generate and deliver the selected report now.
router.post('/:id/run', asyncHandler(async (req, res) => {
  const delivered = await runScheduledReportNow(req.params.id as string)
  res.json({ success: true, runId: delivered.runId, message: `Delivered ${delivered.filename} (${delivered.rows} rows).` })
}))

// GET /api/scheduled-reports/:id/runs — run history for a schedule
router.get('/:id/runs', asyncHandler(async (req, res) => {
  res.json({ success: true, data: await store.listReportRuns(req.params.id as string) })
}))

export default router
