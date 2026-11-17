// Mac Package Builder API (read-only). The macOS app cannot run on this server; this exposes what it is, how it was built
// and the installers an administrator has published for download.

import { Router } from 'express'
import type { Request } from 'express'
import { requireCapability } from '../middleware/requireRole.js'
import { recordAuditLog } from '../services/auditLog.js'
import { BUILD_STEPS, FEATURES, REQUIREMENTS, distDir, listBuilds, readSyncInfo, resolveBuild } from '../services/macPackager.js'

const router = Router()
const actorOf = (req: Request): string => req.header('x-user-email') ?? 'unknown@zinnia.com'

router.get('/info', requireCapability('macPackager.read'), (_req, res, next) => {
  try {
    const dir = distDir()
    const { bundled, sync } = readSyncInfo()
    res.json({
      success: true,
      data: {
        source: { bundled, ...sync },
        downloads: { configured: dir !== null, builds: listBuilds(dir) },
        features: FEATURES, requirements: REQUIREMENTS, buildSteps: BUILD_STEPS,
        runsOn: 'macOS only — this is a native app and does not run in the browser or on this server.',
      },
    })
  } catch (err) { next(err) }
})

router.get('/download/:name', requireCapability('macPackager.read'), async (req, res, next) => {
  try {
    const name = String(req.params['name'])
    const file = resolveBuild(distDir(), name)
    if (!file) { res.status(404).json({ success: false, error: 'That build is not available.' }); return }
    await recordAuditLog({ userEmail: actorOf(req), action: 'macPackager.download', resourceType: 'mac-package-builder', resourceId: name })
    res.download(file, name)
  } catch (err) { next(err) }
})

export default router
