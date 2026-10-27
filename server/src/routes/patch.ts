import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getPatchSystems, isPatchApiConfigured } from '../services/endpointCentralPatch.js'
import { getPatchPrioritySummary } from '../services/patchPrioritySummary.js'

const router = Router()

// GET /api/patch/systems?platform=Mac&refresh=1
router.get('/systems', asyncHandler(async (req, res) => {
  if (!isPatchApiConfigured()) {
    res.json({ success: true, data: { configured: false, systems: [] } })
    return
  }
  const platform = typeof req.query.platform === 'string' ? req.query.platform : undefined
  try {
    const all = await getPatchSystems(req.query.refresh === '1')
    const systems = platform ? all.filter(s => s.platform === platform) : all
    res.json({ success: true, data: { configured: true, systems } })
  } catch (e) {
    res.json({ success: true, data: { configured: true, systems: [], error: e instanceof Error ? e.message : 'Patch API request failed' } })
  }
}))

// GET /api/patch/priority-summary — Windows/macOS severity counts + top missing Critical patches, for the Dashboard's Patch priority panel.
router.get('/priority-summary', asyncHandler(async (req, res) => {
  if (!isPatchApiConfigured()) {
    res.json({ success: true, data: { configured: false, windows: { critical: 0, high: 0, other: 0 }, macos: { critical: 0, high: 0, other: 0 }, topPatches: { windows: [], macos: [] } } })
    return
  }
  try {
    const summary = await getPatchPrioritySummary(req.query.refresh === '1')
    res.json({ success: true, data: { configured: true, ...summary } })
  } catch (e) {
    res.json({ success: true, data: { configured: true, windows: { critical: 0, high: 0, other: 0 }, macos: { critical: 0, high: 0, other: 0 }, topPatches: { windows: [], macos: [] }, error: e instanceof Error ? e.message : 'Patch API request failed' } })
  }
}))

export default router
