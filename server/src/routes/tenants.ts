// Multi-tenant management routes.
// Requires DATABASE_URL — responds with a graceful 503 when database is absent.

import { Router } from 'express'
import { isDbAvailable, query } from '../db/index.js'
import { credentialsFromEnv } from '../services/graphApi.js'
import { getManagedDevices } from '../services/graphApi.js'

const router = Router()

const NO_DB = { success: false, error: 'Database not configured. Set DATABASE_URL to enable multi-tenant features.' }

// GET /api/tenants
router.get('/', async (_req, res, next) => {
  try {
    if (!isDbAvailable()) return res.json({ success: true, data: [], message: NO_DB.error })

    const result = await query<{
      id: string; name: string; domain: string; ms_tenant_id: string
      plan: string; is_active: boolean; created_at: string
    }>('SELECT id, name, domain, ms_tenant_id, plan, is_active, created_at FROM tenants ORDER BY created_at DESC')

    res.json({ success: true, data: result.rows })
  } catch (err) { next(err) }
})

// GET /api/tenants/:id
router.get('/:id', async (req, res, next) => {
  try {
    if (!isDbAvailable()) return res.status(503).json(NO_DB)

    const result = await query(
      'SELECT id, name, domain, ms_tenant_id, plan, is_active, created_at, updated_at FROM tenants WHERE id=$1',
      [req.params.id]
    )
    if (!result.rows[0]) return res.status(404).json({ success: false, error: 'Tenant not found' })
    res.json({ success: true, data: result.rows[0] })
  } catch (err) { next(err) }
})

// POST /api/tenants
router.post('/', async (req, res, next) => {
  try {
    if (!isDbAvailable()) return res.status(503).json(NO_DB)

    const { name, domain, ms_tenant_id, client_id, client_secret, plan = 'free' } = req.body as {
      name: string; domain?: string; ms_tenant_id: string
      client_id: string; client_secret: string; plan?: string
    }

    if (!name || !ms_tenant_id || !client_id || !client_secret) {
      return res.status(400).json({ success: false, error: 'name, ms_tenant_id, client_id, client_secret are required' })
    }

    const result = await query(
      `INSERT INTO tenants (name, domain, ms_tenant_id, client_id, client_secret, plan)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, plan, created_at`,
      [name, domain ?? null, ms_tenant_id, client_id, client_secret, plan]
    )
    res.status(201).json({ success: true, data: result.rows[0] })
  } catch (err) { next(err) }
})

// PUT /api/tenants/:id
router.put('/:id', async (req, res, next) => {
  try {
    if (!isDbAvailable()) return res.status(503).json(NO_DB)

    const { name, domain, plan, is_active } = req.body as {
      name?: string; domain?: string; plan?: string; is_active?: boolean
    }

    await query(
      `UPDATE tenants SET
         name      = COALESCE($2, name),
         domain    = COALESCE($3, domain),
         plan      = COALESCE($4, plan),
         is_active = COALESCE($5, is_active),
         updated_at = NOW()
       WHERE id = $1`,
      [req.params.id, name ?? null, domain ?? null, plan ?? null, is_active ?? null]
    )
    res.json({ success: true })
  } catch (err) { next(err) }
})

// DELETE /api/tenants/:id
router.delete('/:id', async (req, res, next) => {
  try {
    if (!isDbAvailable()) return res.status(503).json(NO_DB)
    await query('DELETE FROM tenants WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (err) { next(err) }
})

// POST /api/tenants/:id/test — verify Graph API connection for a tenant
router.post('/:id/test', async (req, res, next) => {
  try {
    if (!isDbAvailable()) return res.status(503).json(NO_DB)

    const result = await query<{ ms_tenant_id: string; client_id: string; client_secret: string }>(
      'SELECT ms_tenant_id, client_id, client_secret FROM tenants WHERE id=$1',
      [req.params.id]
    )
    const tenant = result.rows[0]
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' })

    const start   = Date.now()
    const devices = await getManagedDevices({
      tenantId:     tenant.ms_tenant_id,
      clientId:     tenant.client_id,
      clientSecret: tenant.client_secret,
    })
    const ms = Date.now() - start

    res.json({
      success:       true,
      deviceCount:   devices.length,
      responseMs:    ms,
      message:       `Connected — ${devices.length} managed devices found`,
    })
  } catch (err) {
    res.json({ success: false, error: (err as Error).message })
  }
})

// POST /api/tenants/test-env — test credentials from .env (no DB needed)
router.post('/test-env', async (_req, res, next) => {
  try {
    const creds   = credentialsFromEnv()
    const start   = Date.now()
    const devices = await getManagedDevices(creds)
    res.json({
      success:     true,
      deviceCount: devices.length,
      responseMs:  Date.now() - start,
      tenantId:    creds.tenantId,
    })
  } catch (err) {
    res.json({ success: false, error: (err as Error).message })
  }
})

export default router
