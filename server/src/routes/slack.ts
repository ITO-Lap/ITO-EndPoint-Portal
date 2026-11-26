import { Router } from 'express'
import { requireCapability } from '../middleware/requireRole.js'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getSlackConfig, isConfigured } from '../store/integrationStore.js'
import { testSlackConnection, fetchSlackAuditLogs } from '../services/slack.js'
import { getSlackHealthStatus, forceSlackHealthCheck } from '../services/slackHealth.js'

const router = Router()

// GET /api/slack/status — lightweight status from the health monitor cache
// (does NOT make a live Slack API call on every request)
router.get('/status', asyncHandler(async (_req, res) => {
  if (!isConfigured('slack')) {
    res.json({ success: true, data: { configured: false } })
  } else {
    const health = getSlackHealthStatus()
    res.json({
      success: true,
      data: {
        configured:         true,
        connected:          health.healthy,
        workspace:          health.workspace ? { teamName: health.workspace } : null,
        error:              health.error ?? null,
        lastCheckedAt:      health.lastCheckedAt,
        lastSuccessAt:      health.lastSuccessAt,
        consecutiveFails:   health.consecutiveFails,
        nextCheckInMs:      health.nextCheckInMs,
      },
    })
  }
}))

// GET /api/slack/health — detailed health state for the diagnostics / settings UI
router.get('/health', asyncHandler(async (_req, res) => {
  const health = getSlackHealthStatus()
  res.json({ success: true, data: { configured: isConfigured('slack'), ...health } })
}))

// POST /api/slack/test — explicit connection test triggered by the user
// Forces an immediate health check and returns the result.
router.post('/test', requireCapability('pages.Settings'), asyncHandler(async (_req, res) => {
  const cfg = getSlackConfig()
  if (!cfg) {
    res.status(400).json({ success: false, error: 'Slack is not configured. Add credentials in Settings → Integrations.' })
  } else {
    const result = await testSlackConnection(cfg)
    if (!result.ok) {
      res.status(400).json({ success: false, error: result.error ?? 'Connection failed' })
    } else {
      res.json({ success: true, data: { workspace: result.workspace } })
    }
  }
}))

// POST /api/slack/reconnect — force an immediate health re-check outside the
// normal 5-minute poll window.  Returns the updated health status.
router.post('/reconnect', requireCapability('pages.Settings'), asyncHandler(async (_req, res) => {
  if (!isConfigured('slack')) {
    res.status(400).json({ success: false, error: 'Slack is not configured.' })
  } else {
    const health = await forceSlackHealthCheck()
    if (health.healthy) {
      res.json({ success: true, data: { reconnected: true, ...health } })
    } else {
      res.status(502).json({ success: false, error: health.error ?? 'Reconnection failed', data: health })
    }
  }
}))

// GET /api/slack/audit-logs?limit=
router.get('/audit-logs', requireCapability('pages.Settings'), asyncHandler(async (req, res) => {
  const schema = z.object({
    limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  })
  const { limit } = schema.parse(req.query)

  const cfg = getSlackConfig()
  if (!cfg) {
    res.json({ success: true, data: { entries: [], configured: false } })
  } else {
    const result = await fetchSlackAuditLogs(cfg, limit)
    if (!result.ok) {
      res.status(502).json({ success: false, error: result.error ?? 'Failed to fetch audit logs' })
    } else {
      res.json({ success: true, data: { entries: result.entries, configured: true } })
    }
  }
}))

export default router
