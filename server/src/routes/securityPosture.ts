import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { fetchAllDevices } from './devices.js'
import { getPatchSystems, getFleetCriticalPatches, isPatchApiConfigured } from '../services/endpointCentralPatch.js'
import {
  buildPosture, listPillarDevices,
  type PostureSource, type PostureResult, type PillarId, type DeviceStatusFilter, type DeviceSortKey,
} from '../services/securityPosture.js'

const router = Router()
const SOURCES: PostureSource[] = ['all', 'intune', 'manageengine']
const PILLAR_IDS: PillarId[] = ['encryption', 'patching', 'compliance', 'checkin']
const STATUSES: DeviceStatusFilter[] = ['pass', 'fail', 'unknown']
const SORT_KEYS: DeviceSortKey[] = ['deviceName', 'user', 'platform', 'source', 'detail']

// Patch data is best-effort: a Patch Manager outage must not take the whole page down.
async function loadPatchData(force: boolean) {
  if (!isPatchApiConfigured()) return { systems: null, criticalPatches: null }
  const [systems, criticalPatches] = await Promise.all([
    getPatchSystems(force).catch(e => { console.error('[security-posture] patch systems unavailable:', e instanceof Error ? e.message : e); return null }),
    getFleetCriticalPatches(force).catch(e => { console.error('[security-posture] critical patch names unavailable:', e instanceof Error ? e.message : e); return null }),
  ])
  return { systems, criticalPatches }
}
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)
const CACHE_TTL_MS = 2 * 60 * 1000
const cache = new Map<PostureSource, { result: PostureResult; expiresAt: number }>()

// GET /api/security-posture?source=all|intune|manageengine&refresh=1
router.get('/', asyncHandler(async (req, res) => {
  const source = (typeof req.query.source === 'string' ? req.query.source : 'all') as PostureSource
  if (!SOURCES.includes(source)) {
    res.status(400).json({ success: false, error: 'Invalid source' })
    return
  }
  const hit = cache.get(source)
  if (req.query.refresh !== '1' && hit && Date.now() < hit.expiresAt) {
    res.json({ success: true, data: hit.result })
    return
  }

  const { devices } = await fetchAllDevices()
  const { systems, criticalPatches } = await loadPatchData(req.query.refresh === '1')
  const result = buildPosture(devices, systems, source, Date.now(), criticalPatches)
  cache.set(source, { result, expiresAt: Date.now() + CACHE_TTL_MS })
  res.json({ success: true, data: result })
}))

// GET /api/security-posture/pillars/:id/devices
//   ?source=&platform=&sourceKey=&status=pass|fail|unknown&q=&sortKey=&sortDir=&page=&pageSize=
// Server-side filtered, sorted and paged device list behind a pillar number (including passing and not-reported).
router.get('/pillars/:id/devices', asyncHandler(async (req, res) => {
  const pillarId = String(req.params.id) as PillarId
  const source = (str(req.query.source) ?? 'all') as PostureSource
  const status = str(req.query.status) as DeviceStatusFilter | undefined
  const sortKey = str(req.query.sortKey) as DeviceSortKey | undefined
  if (!PILLAR_IDS.includes(pillarId) || !SOURCES.includes(source) || (status && !STATUSES.includes(status)) || (sortKey && !SORT_KEYS.includes(sortKey))) {
    res.status(400).json({ success: false, error: 'Invalid pillar, source, status or sort key' })
    return
  }
  const { devices } = await fetchAllDevices()
  const { systems, criticalPatches } = pillarId === 'patching' ? await loadPatchData(false) : { systems: null, criticalPatches: null }
  const data = listPillarDevices(devices, systems, criticalPatches, {
    pillarId, source, status, sortKey,
    platform: str(req.query.platform), sourceKey: str(req.query.sourceKey), q: str(req.query.q),
    sortDir: req.query.sortDir === 'desc' ? 'desc' : 'asc',
    page: Number(req.query.page) || 1, pageSize: Number(req.query.pageSize) || 25,
  })
  res.json({ success: true, data })
}))

export default router
