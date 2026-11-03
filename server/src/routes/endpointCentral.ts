import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import {
  getMissingPatches, isPatchApiConfigured, PatchApiError,
  type MissingPatchView,
} from '../services/endpointCentralPatch.js'
import { getPatchOperationsDashboard, scanPatchDevices, deployPatches } from '../services/patchOperations.js'
import { createPatchRemediationAction, getPatchRemediationAction, completePatchRemediationAction } from '../services/patchRemediationStore.js'
import { requireCapability } from '../middleware/requireRole.js'
import { z } from 'zod'

const router = Router()
const VIEWS: MissingPatchView[] = ['critical', 'all', 'os', 'app']
// Permission key: patchOps.scanRemediate (see server/src/services/rolePermissions.ts) — critical
// patching (scan / deploy, each behind a confirmation step) is open to the Desktop team (Helpdesk) too.
const idList = z.array(z.string().regex(/^\d{1,30}$/)).min(1).max(100)
const remediationPreviewSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('scan'), resourceIds: idList }),
  z.object({
    type: z.literal('deploy'), resourceIds: idList.length(1), patchIds: idList.max(50),
    deploymentPolicyTemplateId: z.string().regex(/^\d{1,30}$/),
    deadlineTime: z.number().int().positive().optional(),
  }),
])

// GET /api/endpoint-central/operations?refresh=1 — client OS only, with
// explainable health and coverage. This route never performs a write action.
router.get('/operations', asyncHandler(async (req, res) => {
  res.json({ success: true, data: await getPatchOperationsDashboard(req.query.refresh === '1') })
}))

// POST /api/endpoint-central/remediation/preview — creates a 10-minute,
// auditable pending request. Confirmation is deliberately a separate request.
router.post('/remediation/preview', requireCapability('patchOps.scanRemediate'), asyncHandler(async (req, res) => {
  const input = remediationPreviewSchema.parse(req.body)
  const dashboard = await getPatchOperationsDashboard(true)
  if (!dashboard.connector.healthy) {
    res.status(503).json({ success: false, error: 'Endpoint Central health data is unavailable. Refresh the connector before preparing remediation.' })
    return
  }
  const targetDevices = input.resourceIds.map(resourceId => dashboard.devices.find(device => device.resourceId === resourceId))
  if (targetDevices.some(device => !device)) {
    res.status(400).json({ success: false, error: 'Remediation targets must be current Windows client or macOS Endpoint Central devices.' })
    return
  }
  if (input.type === 'deploy') {
    const target = targetDevices[0]!
    const current = await getMissingPatches(target.detailResourceId, 'critical', true)
    const currentIds = new Set(current.patches.map(patch => patch.patchId))
    if (input.patchIds.some(patchId => !currentIds.has(patchId))) {
      res.status(400).json({ success: false, error: 'Every patch in a deployment request must be currently reported as missing and critical for the selected endpoint.' })
      return
    }
  }
  const action = createPatchRemediationAction({
    ...(input.type === 'scan'
      ? { type: input.type, resourceIds: input.resourceIds }
      : {
          type: input.type, resourceIds: input.resourceIds, patchIds: input.patchIds,
          deploymentPolicyTemplateId: input.deploymentPolicyTemplateId,
          ...(input.deadlineTime !== undefined ? { deadlineTime: input.deadlineTime } : {}),
        }),
    actorEmail: req.header('x-user-email') ?? 'unknown@zinnia.com',
    actorRole: req.header('x-user-role') ?? 'End User',
  })
  res.status(201).json({ success: true, data: action })
}))

// POST /api/endpoint-central/remediation/:id/confirm — the only route that
// calls Endpoint Central PatchMgmt.UPDATE. Rechecks role and action ownership.
router.post('/remediation/:id/confirm', requireCapability('patchOps.scanRemediate'), asyncHandler(async (req, res) => {
  const action = getPatchRemediationAction(String(req.params.id ?? ''))
  if (!action) { res.status(404).json({ success: false, error: 'Remediation request not found.' }); return }
  if (action.status !== 'pending') { res.status(409).json({ success: false, error: `This remediation request is ${action.status}.` }); return }
  const actorEmail = req.header('x-user-email') ?? 'unknown@zinnia.com'
  if (action.actorEmail !== actorEmail) { res.status(403).json({ success: false, error: 'Only the administrator who created this request can confirm it.' }); return }
  try {
    if (action.type === 'scan') await scanPatchDevices(action.resourceIds)
    else await deployPatches({
      patchIds: action.patchIds ?? [], resourceIds: action.resourceIds,
      deploymentPolicyTemplateId: action.deploymentPolicyTemplateId ?? '',
      ...(action.deadlineTime ? { deadlineTime: action.deadlineTime } : {}),
    })
    const result = completePatchRemediationAction(action.id, 'executed')!
    res.json({ success: true, data: result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Endpoint Central remediation failed.'
    completePatchRemediationAction(action.id, 'failed', message)
    res.status(502).json({ success: false, error: message })
  }
}))

// GET /api/endpoint-central/devices/:resourceId/missing-patches?view=critical|all|os|app&refresh=1
// :resourceId is the Endpoint Central id stored on the device (PatchSystemStatus.detailResourceId).
// Always answers 200 with a status so the client can render a specific state; technical
// details are logged here and never returned.
router.get('/devices/:resourceId/missing-patches', asyncHandler(async (req, res) => {
  const resourceId = String(req.params.resourceId ?? '')
  const view = (typeof req.query.view === 'string' ? req.query.view : 'all') as MissingPatchView
  if (!/^\d{6,30}$/.test(resourceId) || !VIEWS.includes(view)) {
    res.status(400).json({ success: false, error: 'Invalid resource id or view' })
    return
  }
  if (!isPatchApiConfigured()) {
    res.json({ success: true, data: { status: 'not_configured', patches: [] } })
    return
  }
  try {
    const result = await getMissingPatches(resourceId, view, req.query.refresh === '1')
    res.json({ success: true, data: { status: 'ok', ...result } })
  } catch (e) {
    console.error('[endpoint-central] missing-patches failed:', e instanceof Error ? e.message : e)
    const scope = e instanceof PatchApiError && e.kind === 'scope_required'
    res.json({ success: true, data: { status: scope ? 'scope_required' : 'error', patches: [] } })
  }
}))

export default router
