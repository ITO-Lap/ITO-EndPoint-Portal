import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getEntraData, getEntraUserDetails, isEntraConfigured } from '../services/entra.js'
import type { EntraSignIn, EntraUser } from '../services/entra.js'
import { getIntuneUserSummaries, isIntuneConfigured } from '../services/intune.js'
import { fetchAllDevices } from './devices.js'

const router = Router()

// 5-minute in-memory cache
const CACHE_TTL_MS = 5 * 60 * 1000
let usersCache: { data: unknown[]; expiresAt: number } | null = null

function splitName(displayName: string): { firstName: string; lastName: string } {
  const parts = displayName.trim().split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0] ?? '', lastName: '' }
  const lastName = parts.pop()!
  return { firstName: parts.join(' '), lastName }
}

function deriveRiskLevel(userSignIns: EntraSignIn[]): 'Low' | 'Medium' | 'High' | 'Critical' {
  const risks = userSignIns.map(s => (s.riskLevelDuringSignIn ?? '').toLowerCase())
  if (risks.includes('high')) return 'High'
  if (risks.includes('medium')) return 'Medium'
  return 'Low'
}

function toActivity(signIn: EntraSignIn) {
  const loc = signIn.location
    ? `${signIn.location.city}, ${signIn.location.countryOrRegion}`
    : undefined
  return {
    time: signIn.createdDateTime,
    type: 'Login' as const,
    description: `Signed in via ${signIn.clientAppUsed || 'browser'} to ${signIn.appDisplayName || 'Microsoft 365'}`,
    ip: signIn.ipAddress ?? undefined,
    location: loc,
  }
}

function buildEntraMaps(
  signIns: EntraSignIn[],
  mfaRegistrations: { userPrincipalName: string; isMfaRegistered: boolean }[],
  users: EntraUser[],
) {
  const mfaByUpn = new Map<string, boolean>()
  for (const m of mfaRegistrations) mfaByUpn.set(m.userPrincipalName.toLowerCase(), m.isMfaRegistered)

  const signInsByUpn = new Map<string, EntraSignIn[]>()
  for (const s of signIns) {
    const upn = s.userPrincipalName.toLowerCase()
    const arr = signInsByUpn.get(upn) ?? []
    if (arr.length < 5) arr.push(s)
    signInsByUpn.set(upn, arr)
  }

  const entraUserByUpn = new Map<string, EntraUser>()
  for (const u of users) entraUserByUpn.set(u.userPrincipalName.toLowerCase(), u)

  return { mfaByUpn, signInsByUpn, entraUserByUpn }
}

// GET /api/users
router.get('/', asyncHandler(async (_req, res) => {
  const intuneOk = isIntuneConfigured()
  const entraOk  = isEntraConfigured()

  if (!intuneOk && !entraOk) {
    res.json({ success: true, data: [] })
    return
  }

  if (usersCache && Date.now() < usersCache.expiresAt) {
    res.json({ success: true, data: usersCache.data })
    return
  }

  const now = new Date().toISOString()
  let users: unknown[] = []

  if (intuneOk) {
    // ── Primary: derive user list from Intune managed devices ─────────────
    const intuneUsers = await getIntuneUserSummaries()

    // Optional Entra enrichment: MFA status, sign-in history, department
    let mfaByUpn       = new Map<string, boolean>()
    let signInsByUpn   = new Map<string, EntraSignIn[]>()
    let entraUserByUpn = new Map<string, EntraUser>()

    if (entraOk) {
      const entraData = await getEntraData()
      const maps = buildEntraMaps(entraData.signIns, entraData.mfaRegistrations, entraData.users)
      mfaByUpn       = maps.mfaByUpn
      signInsByUpn   = maps.signInsByUpn
      entraUserByUpn = maps.entraUserByUpn
    }

    users = intuneUsers.map(u => {
      const { firstName, lastName } = splitName(u.displayName)
      const userSignIns      = signInsByUpn.get(u.upn) ?? []
      const entraUser        = entraUserByUpn.get(u.upn)
      const lastSignIn       = entraUser?.signInActivity?.lastSignInDateTime ?? null
      const lastSignInRecord = userSignIns[0]
      const loginLocation    = lastSignInRecord?.location
        ? `${lastSignInRecord.location.city}, ${lastSignInRecord.location.countryOrRegion}`
        : ''

      // Worst-case risk: device compliance + Entra sign-in signals
      let riskLevel: 'Low' | 'Medium' | 'High' | 'Critical' =
        u.complianceState === 'Non-Compliant' ? 'High' :
        u.complianceState === 'Warning'       ? 'Medium' : 'Low'
      if (userSignIns.length > 0) {
        const signInRisk = deriveRiskLevel(userSignIns)
        if (signInRisk === 'Critical' || signInRisk === 'High') riskLevel = signInRisk
      }

      const sources: { name: string; type: string; syncedAt: string; status: string; userId: string }[] = [
        { name: 'Microsoft Intune', type: 'mdm', syncedAt: now, status: 'Synced', userId: u.upn },
      ]
      if (entraOk) {
        sources.push({ name: 'Microsoft Entra ID', type: 'directory', syncedAt: now, status: 'Synced', userId: u.upn })
      }

      return {
        id:             u.upn,
        firstName,      lastName,
        email:          u.upn,
        phone:          '', title: '',
        department:     entraUser?.department ?? '',
        location:       loginLocation,
        timezone:       '',
        toolRole:       'End User',
        status:         entraUser ? (entraUser.accountEnabled ? 'Active' : 'Inactive') : 'Active',
        mfaEnabled:     mfaByUpn.get(u.upn) ?? false,
        lastActive:     lastSignIn ?? u.lastSyncDateTime,
        lastLogin:      lastSignIn ?? '',
        loginLocation,
        createdAt:      entraUser?.createdDateTime ?? '',
        riskLevel,
        isVip:          false,
        groups:         [],
        licenseStatus:  'Active',
        assignedDevices: u.devices,
        recentActivity: userSignIns.map(toActivity),
        sources,
        jiraTickets:    [],
      }
    })
  } else {
    // ── Entra-only fallback ────────────────────────────────────────────────
    const data = await getEntraData()
    const { mfaByUpn, signInsByUpn } = buildEntraMaps(
      data.signIns, data.mfaRegistrations, data.users,
    )

    users = data.users.map(u => {
      const upn           = u.userPrincipalName.toLowerCase()
      const userSignIns   = signInsByUpn.get(upn) ?? []
      const { firstName, lastName } = splitName(u.displayName)
      const lastSignIn    = u.signInActivity?.lastSignInDateTime ?? null
      const lastSignInRecord = userSignIns[0]
      const loginLocation = lastSignInRecord?.location
        ? `${lastSignInRecord.location.city}, ${lastSignInRecord.location.countryOrRegion}`
        : ''

      return {
        id:             u.id,
        firstName,      lastName,
        email:          u.userPrincipalName,
        phone:          '', title: '',
        department:     u.department ?? '',
        location:       loginLocation,
        timezone:       '',
        toolRole:       'End User',
        status:         u.accountEnabled ? 'Active' : 'Inactive',
        mfaEnabled:     mfaByUpn.get(upn) ?? false,
        lastActive:     lastSignIn ?? u.createdDateTime,
        lastLogin:      lastSignIn ?? '',
        loginLocation,
        createdAt:      u.createdDateTime,
        riskLevel:      deriveRiskLevel(userSignIns),
        isVip:          false,
        groups:         [],
        licenseStatus:  u.accountEnabled ? 'Active' : 'Disabled',
        assignedDevices: [],
        recentActivity: userSignIns.map(toActivity),
        sources: [{ name: 'Microsoft Entra ID', type: 'directory', syncedAt: now, status: 'Synced', userId: u.id }],
        jiraTickets:    [],
      }
    })
  }

  usersCache = { data: users, expiresAt: Date.now() + CACHE_TTL_MS }
  res.json({ success: true, data: users })
}))

/** Core "User Intelligence" correlation logic (Entra sign-in/MFA/risk +
 *  Intune/ManageEngine device compliance) for a single user — extracted so
 *  GET /:id and the Copilot's get_user_intelligence tool
 *  (server/src/services/copilotTools.ts) share one implementation instead of
 *  duplicating the UUID-vs-UPN dispatch and device-correlation logic. */
export async function getUserIntelligence(userId: string, email?: string) {
  const lookupEmailArg = email?.toLowerCase()

  // UUID = Entra object ID; anything else (e.g. UPN/email) = Intune-derived
  const isEntraObjectId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)

  const [entraDetails, deviceResult] = await Promise.allSettled([
    isEntraConfigured() && isEntraObjectId
      ? getEntraUserDetails(userId)
      : Promise.resolve({ signIns: [], roles: [], groups: [], apps: [], licenses: [] }),
    fetchAllDevices(),
  ])

  const details = entraDetails.status === 'fulfilled'
    ? entraDetails.value
    : { signIns: [], roles: [], groups: [], apps: [], licenses: [] }

  const allDevices  = deviceResult.status === 'fulfilled' ? deviceResult.value.devices : []
  const lookupEmail = lookupEmailArg ?? (!isEntraObjectId ? userId.toLowerCase() : undefined)
  const userDevices = lookupEmail
    ? allDevices.filter(d => d.user?.toLowerCase() === lookupEmail)
    : []

  const devices = userDevices.map(d => ({
    deviceName:       d.deviceName,
    platform:         d.platform,
    complianceState:  d.complianceState,
    managementSource: d.managementSource,
    lastCheckIn:      d.lastCheckIn,
    encryptionStatus: d.encryptionStatus,
    riskScore:        d.severity === 'Critical' ? 90 : d.severity === 'High' ? 70 : d.severity === 'Medium' ? 40 : 10,
    manufacturer:     d.manufacturer,
    model:            d.model,
    serialNumber:     d.serialNumber,
    osVersion:        d.osVersion,
    ownership:        d.ownership,
    joinType:         d.enrollmentType,
    deviceId:         d.id,
  }))

  return { ...details, devices }
}

// GET /api/users/:id — sign-ins, roles, groups, apps, licenses, devices for a single user
router.get('/:id', asyncHandler(async (req, res) => {
  const email  = req.query.email as string | undefined
  const userId = req.params.id as string
  const data = await getUserIntelligence(userId, email)
  res.json({ success: true, data })
}))

export default router
