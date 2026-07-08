import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getEntraUserProfile, getEntraUserDetails, isEntraConfigured, GraphRequestError } from '../services/entra.js'
import { fetchAllDevices } from './devices.js'

const router = Router()

// No per-user login exists in this app (deliberately removed) — every Graph
// call uses app-only client-credentials auth for one fixed tenant identity.
// This is the UPN whose real Entra ID + Intune data populates the Profile page.
const PROFILE_USER_UPN = process.env.PROFILE_USER_UPN || 'avinash.verma@zinnia.com'

function errorCodeFor(err: unknown): { code: string; message: string } {
  if (err instanceof GraphRequestError) {
    if (err.status === 404) return { code: 'user_not_found', message: `No Entra ID user found for ${PROFILE_USER_UPN}` }
    if (err.status === 401 || err.status === 403) return { code: 'insufficient_permissions', message: `Microsoft Graph denied this request (${err.status}). The app registration may be missing a required permission (e.g. User.Read.All) or an admin hasn't granted consent.` }
    return { code: 'graph_error', message: err.message }
  }
  const message = err instanceof Error ? err.message : String(err)
  if (/not configured/i.test(message)) return { code: 'not_configured', message: 'Microsoft Entra ID is not configured for this environment.' }
  return { code: 'graph_error', message }
}

// GET /api/profile — real Entra ID + Intune data for the app's fixed admin identity
router.get('/', asyncHandler(async (_req, res) => {
  if (!isEntraConfigured()) {
    res.status(503).json({ success: false, code: 'not_configured', error: 'Microsoft Entra ID is not configured. Connect it in Settings → Integrations.' })
    return
  }

  let profile
  try {
    profile = await getEntraUserProfile(PROFILE_USER_UPN)
  } catch (err) {
    const { code, message } = errorCodeFor(err)
    const status = code === 'user_not_found' ? 404 : code === 'insufficient_permissions' ? 403 : 502
    res.status(status).json({ success: false, code, error: message })
    return
  }

  const [detailsResult, deviceResult] = await Promise.allSettled([
    getEntraUserDetails(profile.id),
    fetchAllDevices(),
  ])

  const details = detailsResult.status === 'fulfilled'
    ? detailsResult.value
    : { signIns: [], roles: [], groups: [], apps: [], licenses: [] }

  const allDevices = deviceResult.status === 'fulfilled' ? deviceResult.value.devices : []
  const lookupEmail = PROFILE_USER_UPN.toLowerCase()
  const ownDevices = allDevices
    .filter(d => d.user?.toLowerCase() === lookupEmail)
    .map(d => ({
      deviceName:      d.deviceName,
      platform:        d.platform,
      complianceState: d.complianceState,
      lastCheckIn:     d.lastCheckIn,
      model:           d.model,
      osVersion:       d.osVersion,
    }))

  res.json({
    success: true,
    data: {
      ...profile,
      roles:  details.roles,
      groups: details.groups,
      apps:   details.apps,
      tenantDeviceTotal: allDevices.length,
      ownDevices,
    },
  })
}))

export default router
