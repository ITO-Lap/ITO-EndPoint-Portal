// Audit log routes — full change and access trail.
// Requires DATABASE_URL; degrades gracefully without it.

import { Router } from 'express'
import { isDbAvailable, query } from '../db/index.js'

const router = Router()

// GET /api/audit?limit=100&offset=0&action=REPORT_EXPORTED&resource_type=device
router.get('/', async (req, res, next) => {
  try {
    if (!isDbAvailable()) {
      return res.json({ success: true, data: [], count: 0, message: 'Database not configured — audit log requires DATABASE_URL' })
    }

    const limit        = Math.min(parseInt(String(req.query.limit  ?? '100'), 10), 500)
    const offset       = Math.max(parseInt(String(req.query.offset  ?? '0'),  10), 0)
    const action       = req.query.action        as string | undefined
    const resourceType = req.query.resource_type as string | undefined
    const userEmail    = req.query.user_email    as string | undefined
    const since        = req.query.since         as string | undefined

    const clauses: string[] = ['1=1']
    const params: unknown[] = []

    if (action)       { clauses.push(`action = $${params.length + 1}`);       params.push(action) }
    if (resourceType) { clauses.push(`resource_type = $${params.length + 1}`); params.push(resourceType) }
    if (userEmail)    { clauses.push(`user_email = $${params.length + 1}`);    params.push(userEmail) }
    if (since)        { clauses.push(`created_at >= $${params.length + 1}`);   params.push(since) }

    const where = clauses.join(' AND ')

    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT id, user_email, action, resource_type, resource_id, ip_address, created_at
         FROM audit_logs WHERE ${where}
         ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      query(`SELECT COUNT(*) AS total FROM audit_logs WHERE ${where}`, params),
    ])

    res.json({
      success: true,
      data:    dataResult.rows,
      count:   parseInt(String(countResult.rows[0]?.total ?? '0'), 10),
    })
  } catch (err) { next(err) }
})

// POST /api/audit — create a log entry (called internally or by client-side actions)
router.post('/', async (req, res, next) => {
  try {
    if (!isDbAvailable()) {
      return res.json({ success: true, message: 'Audit log entry skipped — no database' })
    }

    const { user_email, action, resource_type, resource_id, old_value, new_value } = req.body as {
      user_email?: string; action: string; resource_type?: string
      resource_id?: string; old_value?: unknown; new_value?: unknown
    }

    if (!action) return res.status(400).json({ success: false, error: 'action is required' })

    const ip        = (req.headers['x-forwarded-for'] as string) ?? req.socket.remoteAddress
    const userAgent = req.headers['user-agent']

    await query(
      `INSERT INTO audit_logs
         (user_email, action, resource_type, resource_id, old_value, new_value, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        user_email    ?? null,
        action,
        resource_type ?? null,
        resource_id   ?? null,
        old_value     ? JSON.stringify(old_value) : null,
        new_value     ? JSON.stringify(new_value) : null,
        ip            ?? null,
        userAgent     ?? null,
      ]
    )

    res.status(201).json({ success: true })
  } catch (err) { next(err) }
})

// GET /api/audit/actions — distinct action types for filter UI
router.get('/actions', async (_req, res, next) => {
  try {
    if (!isDbAvailable()) return res.json({ success: true, data: [] })
    const result = await query('SELECT DISTINCT action FROM audit_logs ORDER BY action')
    res.json({ success: true, data: result.rows.map(r => r.action) })
  } catch (err) { next(err) }
})

export default router
