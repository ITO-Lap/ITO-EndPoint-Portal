// Scheduled report management routes.
// Stores schedules in PostgreSQL; requires DATABASE_URL.
// Actual job execution is triggered by a scheduler (node-cron or external).

import { Router } from 'express'
import { isDbAvailable, query } from '../db/index.js'

const router = Router()

const NO_DB = { success: false, error: 'Database not configured. Set DATABASE_URL to enable scheduled reports.' }

// Validate a 5-field cron expression (lightweight — not a full parser)
function isValidCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/)
  return parts.length === 5
}

// GET /api/scheduled-reports
router.get('/', async (_req, res, next) => {
  try {
    if (!isDbAvailable()) return res.json({ success: true, data: [], message: NO_DB.error })

    const result = await query(
      `SELECT id, name, report_type, schedule_cron, format, recipients, is_active,
              last_run_at, next_run_at, created_by, created_at
       FROM scheduled_reports ORDER BY created_at DESC`
    )
    res.json({ success: true, data: result.rows })
  } catch (err) { next(err) }
})

// GET /api/scheduled-reports/:id
router.get('/:id', async (req, res, next) => {
  try {
    if (!isDbAvailable()) return res.status(503).json(NO_DB)

    const result = await query('SELECT * FROM scheduled_reports WHERE id=$1', [req.params.id])
    if (!result.rows[0]) return res.status(404).json({ success: false, error: 'Schedule not found' })
    res.json({ success: true, data: result.rows[0] })
  } catch (err) { next(err) }
})

// POST /api/scheduled-reports
router.post('/', async (req, res, next) => {
  try {
    if (!isDbAvailable()) return res.status(503).json(NO_DB)

    const {
      name, report_type, schedule_cron,
      format = 'pdf', recipients = [], filters = {}, created_by,
    } = req.body as {
      name: string; report_type: string; schedule_cron: string
      format?: string; recipients?: string[]; filters?: object; created_by?: string
    }

    if (!name || !report_type || !schedule_cron) {
      return res.status(400).json({ success: false, error: 'name, report_type, schedule_cron are required' })
    }
    if (!isValidCron(schedule_cron)) {
      return res.status(400).json({ success: false, error: 'schedule_cron must be a valid 5-field cron expression (e.g. "0 8 * * 1")' })
    }

    const validTypes    = ['compliance', 'inventory', 'app-deployment', 'risk', 'executive']
    const validFormats  = ['pdf', 'excel', 'csv', 'pptx']
    if (!validTypes.includes(report_type))  return res.status(400).json({ success: false, error: `report_type must be one of: ${validTypes.join(', ')}` })
    if (!validFormats.includes(format))     return res.status(400).json({ success: false, error: `format must be one of: ${validFormats.join(', ')}` })

    const result = await query(
      `INSERT INTO scheduled_reports (name, report_type, schedule_cron, format, recipients, filters, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, name, report_type, schedule_cron, format, created_at`,
      [name, report_type, schedule_cron, format, JSON.stringify(recipients), JSON.stringify(filters), created_by ?? null]
    )

    res.status(201).json({ success: true, data: result.rows[0] })
  } catch (err) { next(err) }
})

// PUT /api/scheduled-reports/:id
router.put('/:id', async (req, res, next) => {
  try {
    if (!isDbAvailable()) return res.status(503).json(NO_DB)

    const { name, schedule_cron, format, recipients, is_active } = req.body as {
      name?: string; schedule_cron?: string; format?: string; recipients?: string[]; is_active?: boolean
    }

    if (schedule_cron && !isValidCron(schedule_cron)) {
      return res.status(400).json({ success: false, error: 'Invalid cron expression' })
    }

    await query(
      `UPDATE scheduled_reports SET
         name          = COALESCE($2, name),
         schedule_cron = COALESCE($3, schedule_cron),
         format        = COALESCE($4, format),
         recipients    = COALESCE($5, recipients),
         is_active     = COALESCE($6, is_active),
         updated_at    = NOW()
       WHERE id = $1`,
      [req.params.id, name ?? null, schedule_cron ?? null, format ?? null,
       recipients ? JSON.stringify(recipients) : null, is_active ?? null]
    )

    res.json({ success: true })
  } catch (err) { next(err) }
})

// DELETE /api/scheduled-reports/:id
router.delete('/:id', async (req, res, next) => {
  try {
    if (!isDbAvailable()) return res.status(503).json(NO_DB)
    await query('DELETE FROM scheduled_reports WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (err) { next(err) }
})

// POST /api/scheduled-reports/:id/run — trigger immediately (records a manual run)
router.post('/:id/run', async (req, res, next) => {
  try {
    if (!isDbAvailable()) return res.status(503).json(NO_DB)

    const schedResult = await query('SELECT * FROM scheduled_reports WHERE id=$1', [req.params.id])
    const schedule    = schedResult.rows[0]
    if (!schedule) return res.status(404).json({ success: false, error: 'Schedule not found' })

    const runResult = await query(
      `INSERT INTO report_runs (scheduled_report_id, format, triggered_by)
       VALUES ($1,$2,'manual') RETURNING id`,
      [schedule.id, schedule.format]
    )

    await query('UPDATE scheduled_reports SET last_run_at=NOW() WHERE id=$1', [schedule.id])

    res.json({
      success:     true,
      runId:       runResult.rows[0]?.id,
      reportType:  schedule.report_type,
      format:      schedule.format,
      message:     'Report queued for immediate generation',
    })
  } catch (err) { next(err) }
})

// GET /api/scheduled-reports/:id/runs — run history for a schedule
router.get('/:id/runs', async (req, res, next) => {
  try {
    if (!isDbAvailable()) return res.json({ success: true, data: [] })

    const result = await query(
      `SELECT id, status, format, record_count, file_size_bytes, error_message, triggered_by, started_at, completed_at
       FROM report_runs WHERE scheduled_report_id=$1 ORDER BY started_at DESC LIMIT 50`,
      [req.params.id]
    )
    res.json({ success: true, data: result.rows })
  } catch (err) { next(err) }
})

export default router
