import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getMacAdminAccess, parseReport, reportKeyValid, reportingEnabled, saveReport } from '../services/macAdminAccess.js'

// Two routers: the ingest endpoint is reachable by the Macs without a user session (shared-secret protected),
// the read endpoint sits behind the normal session gate.
export const macAdminIngestRouter = Router()
export const macAdminReadRouter = Router()

const ingestLimiter = rateLimit({
  windowMs: 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false,
  message: { success: false, error: 'Too many requests.' },
})

macAdminIngestRouter.post('/report', ingestLimiter, limitBody(), asyncHandler(async (req, res) => {
  if (!reportingEnabled()) { res.status(404).json({ success: false, error: 'Not found' }); return }
  if (!reportKeyValid(req.header('x-report-key'))) {
    console.warn(`[macAdminAccess] rejected report: bad key from ${req.ip}`)
    res.status(401).json({ success: false, error: 'Unauthorized' }); return
  }
  const report = parseReport(req.body)
  if (!report) { res.status(400).json({ success: false, error: 'Invalid report' }); return }
  saveReport(report)
  res.status(204).end()
}))

macAdminReadRouter.get('/', asyncHandler(async (_req, res) => {
  res.json({ success: true, data: getMacAdminAccess() })
}))

function limitBody() {
  // Body parsing is already global (express.json, 100kb default); this guards against oversized reports.
  return (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) =>
    JSON.stringify(req.body ?? {}).length > 2048 ? void res.status(413).json({ success: false, error: 'Payload too large' }) : next()
}
