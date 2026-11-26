import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { fetchAllDevices } from './devices.js'
import { requireCapability } from '../middleware/requireRole.js'
import { getBackend } from '../services/sync/backend.js'
import { loadCoverageHistory, recordCoverage } from '../store/postureCoverageHistory.js'
import { getDetailReadStats } from '../services/mdmDetailReader.js'
import { buildDiagnostics } from '../services/deviceReconciler.js'
import { getEndpointCentralDevices } from '../services/endpointCentralDevices.js'
import { isManageEngineConfigured } from '../services/manageEngine.js'
import { getPatchSystems, getFleetCriticalPatches, isPatchApiConfigured } from '../services/endpointCentralPatch.js'
import {
  buildPosture, listPillarDevices, type ListOptions,
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
// Endpoint Central agent rows: the second view of Windows devices that are also enrolled in Intune (best-effort).
async function loadEcDevices() {
  if (!isManageEngineConfigured()) return []
  return getEndpointCentralDevices().catch(e => { console.error('[security-posture] Endpoint Central devices unavailable:', e instanceof Error ? e.message : e); return [] })
}
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)
const CACHE_TTL_MS = 2 * 60 * 1000
// Keyed to the device-list instance too: a refresh of the fleet invalidates the summary, so a pillar's headline number
// and the device list behind it always come from the same snapshot.
const cache = new Map<PostureSource, { result: PostureResult; expiresAt: number; devicesRef: unknown }>()

/** The posture summary, from the 2-minute cache when still valid. Shared by the HTTP route and the Ocean assistant tools. */
export async function getPostureResult(source: PostureSource, force = false): Promise<PostureResult> {
  const { devices } = await fetchAllDevices()
  const hit = cache.get(source)
  if (!force && hit && Date.now() < hit.expiresAt && hit.devicesRef === devices) return hit.result

  const { systems, criticalPatches } = await loadPatchData(force)
  const ecDevices = await loadEcDevices()
  const result = buildPosture(devices, systems, source, Date.now(), criticalPatches, ecDevices)
  if (result.coverage) {
    // History is fleet-wide: only a full-fleet reading is recorded, but every view shows the same trend.
    const today = new Date().toISOString().slice(0, 10)
    const history = source === 'all' ? recordCoverage({ date: today, ...result.coverage }) : loadCoverageHistory()
    result.coverage.history = history
  }
  cache.set(source, { result, expiresAt: Date.now() + CACHE_TTL_MS, devicesRef: devices })
  return result
}

/** The devices behind a pillar number, with the same patch and Endpoint Central enrichment as the page. */
export async function getPillarDeviceList(opts: ListOptions) {
  const { devices } = await fetchAllDevices()
  const { systems, criticalPatches } = opts.pillarId === 'patching' || opts.pillarId === 'checkin' ? await loadPatchData(false) : { systems: null, criticalPatches: null }
  return listPillarDevices(devices, systems, criticalPatches, opts, Date.now(), await loadEcDevices())
}

/** How the sources were reconciled (match rates, ambiguous names, unmatched rows) plus the latest MDM detail-read stats. */
export async function getPostureDiagnostics() {
  const { devices } = await fetchAllDevices()
  const { systems } = await loadPatchData(false)
  const diag = buildDiagnostics(devices, systems, await loadEcDevices())
  return { diag, mdmDetailReads: getDetailReadStats() }
}

// GET /api/security-posture?source=all|intune|manageengine&refresh=1
router.get('/', asyncHandler(async (req, res) => {
  const source = (typeof req.query.source === 'string' ? req.query.source : 'all') as PostureSource
  if (!SOURCES.includes(source)) {
    res.status(400).json({ success: false, error: 'Invalid source' })
    return
  }
  res.json({ success: true, data: await getPostureResult(source, req.query.refresh === '1') })
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
  const data = await getPillarDeviceList({
    pillarId, source, status, sortKey,
    platform: str(req.query.platform), sourceKey: str(req.query.sourceKey), q: str(req.query.q),
    sortDir: req.query.sortDir === 'desc' ? 'desc' : 'asc',
    page: Number(req.query.page) || 1, pageSize: Number(req.query.pageSize) || 25,
  })
  res.json({ success: true, data })
}))

// GET /api/security-posture/diagnostics[?format=csv]
// How the sources were reconciled: per-key match counts, ambiguous host names, and Patch Manager / Endpoint Central
// rows that matched no device. Lists device names, so it is limited to roles with the Settings page.
// GET /api/security-posture/findings?status=open|resolved&pillar=encryption|patching|compliance|checkin&limit=200
// History of failing checks per device: when each was first seen, last seen and resolved (kept by the scheduled
// "Security findings history" sync, in local files or PostgreSQL).
router.get('/findings', requireCapability('pages.Security Posture'), asyncHandler(async (req, res) => {
  const status = req.query['status'] === 'open' || req.query['status'] === 'resolved' ? req.query['status'] : undefined
  const pillar = typeof req.query['pillar'] === 'string' && ['encryption', 'patching', 'compliance', 'checkin'].includes(req.query['pillar']) ? req.query['pillar'] : undefined
  const asked = Math.floor(Number(req.query['limit']))
  const limit = asked >= 1 ? Math.min(asked, 1000) : 200 // junk or non-positive falls back to the default
  const store = getBackend()
  const [rows, open, resolved] = await Promise.all([store.listFindings({ ...(status ? { status } : {}), ...(pillar ? { pillar } : {}), limit }), store.countFindings('open', pillar), store.countFindings('resolved', pillar)])
  res.json({ success: true, data: { counts: { open, resolved }, findings: rows } })
}))

router.get('/diagnostics', requireCapability('pages.Settings'), asyncHandler(async (req, res) => {
  const { diag, mdmDetailReads } = await getPostureDiagnostics()
  if (req.query.format === 'csv') {
    const q = (v: string) => `"${v.replace(/"/g, '""')}"`
    const rows = [
      ['issue', 'name', 'platform', 'source'],
      ...diag.samples.ambiguous.map(x => ['ambiguous-name', x.name, x.platform, x.source]),
      ...diag.samples.unmatchedPatchSystems.map(x => ['patch-system-unmatched', x.name, x.platform, 'Patch Manager']),
      ...diag.samples.unmatchedAgentRows.map(x => ['agent-row-unmatched', x.name, x.platform, 'Endpoint Central']),
    ]
    res.type('text/csv').attachment('security-posture-reconciliation.csv').send(rows.map(r => r.map(q).join(',')).join('\n'))
    return
  }
  res.json({ success: true, data: { ...diag, mdmDetailReads } })
}))

export default router
