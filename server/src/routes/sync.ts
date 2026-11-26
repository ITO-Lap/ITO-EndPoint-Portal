// Sync status and control (docs/17-database-sync-architecture.md).
//   GET  /api/sync/status      any signed-in user  - what the dashboard's sync card shows
//   POST /api/sync/kick        any signed-in user  - start the syncs that are due, in the background (never blocks)
//   POST /api/sync/run         sync.manage         - "Sync now" for one source
//   PUT  /api/sync/schedule    sync.manage         - enable/disable and change the interval
//   GET  /api/sync/logs        sync.manage         - recent sync log lines (secrets already removed)

import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import { requireCapability } from '../middleware/requireRole.js'
import { activeConnectionString, configuredConnectionString } from '../db/index.js'
import { getSyncStatus, recentLogs, runSync, startDueSyncs, storageKind, updateSchedule } from '../services/sync/syncEngine.js'
import { recordAuditLog } from '../services/auditLog.js'

const router = Router()
const target = z.object({ source: z.enum(['intune', 'manageengine', 'portal']), module: z.enum(['devices', 'applications', 'patches', 'findings']).default('devices') })
const actorOf = (req: { header(n: string): string | undefined }): string => req.header('x-user-email') ?? 'unknown'

router.get('/status', asyncHandler(async (_req, res) => {
  // storage: where the synced data lives right now. postgresConfigured/restartRequired: a PostgreSQL setting exists
  // (or changed) but is not in use yet; it applies at the next server start.
  const configured = configuredConnectionString()
  res.json({ success: true, data: {
    storage: storageKind(),
    postgresConfigured: !!configured,
    restartRequired: configured !== activeConnectionString(),
    sources: await getSyncStatus(),
  } })
}))

router.post('/kick', asyncHandler(async (_req, res) => {
  const started = await startDueSyncs('dashboard')
  res.status(202).json({ success: true, data: { started } })
}))

router.post('/run', requireCapability('sync.manage'), asyncHandler(async (req, res) => {
  const { source, module } = target.parse(req.body)
  const actor = actorOf(req)
  // Respond at once; the sync runs in the background and the card shows its progress.
  const pending = runSync(source, module, { trigger: 'manual', actor })
  const early = await Promise.race([pending, new Promise<null>(r => setTimeout(() => r(null), 300))])
  if (early?.status === 'already_running') { res.status(409).json({ success: false, error: 'A sync for this source is already running.' }); return }
  if (early?.status === 'not_configured') { res.status(409).json({ success: false, error: 'This source is not configured in Settings -> Integrations.' }); return }
  void recordAuditLog({ userEmail: actor, action: 'SYNC_RUN_MANUAL', resourceType: 'sync_source', resourceId: `${source}/${module}` })
  res.status(202).json({ success: true, data: { started: true } })
}))

const scheduleBody = target.extend({ enabled: z.boolean().optional(), intervalMinutes: z.number().int().optional() })
router.put('/schedule', requireCapability('sync.manage'), asyncHandler(async (req, res) => {
  const { source, module, ...patch } = scheduleBody.parse(req.body)
  const clean = { ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}), ...(patch.intervalMinutes !== undefined ? { intervalMinutes: patch.intervalMinutes } : {}) }
  try {
    const status = await updateSchedule(source, module, clean, actorOf(req))
    void recordAuditLog({ userEmail: actorOf(req), action: 'SYNC_SCHEDULE_UPDATED', resourceType: 'sync_source', resourceId: `${source}/${module}`, newValue: clean })
    res.json({ success: true, data: status })
  } catch (e) {
    if (e instanceof RangeError) { res.status(400).json({ success: false, error: e.message }); return }
    throw e
  }
}))

router.get('/logs', requireCapability('sync.manage'), asyncHandler(async (req, res) => {
  const q = z.object({ source: z.string().optional(), module: z.string().optional(), limit: z.coerce.number().int().optional() }).parse(req.query)
  res.json({ success: true, data: await recentLogs(q.source, q.module, q.limit ?? 50) })
}))

export default router
