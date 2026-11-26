// Saved values for the Settings page sections (General, Compliance, Automation, Security, Notifications, Data & Privacy).
//   GET /api/settings            every saved section                       (pages.Settings)
//   PUT /api/settings/:section   { values } replaces one section           (pages.Settings)
// Auto sign-out and the Data Sync schedules have their own live endpoints and are not part of this.

import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { requireCapability } from '../middleware/requireRole.js'
import { SECTION_SCHEMAS, isSettingsSection } from '../services/settingsSchemas.js'
import { getAllSettings, saveSection } from '../store/appSettings.js'
import { recordAuditLog } from '../services/auditLog.js'

const router = Router()
router.use(requireCapability('pages.Settings'))

router.get('/', asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await getAllSettings() })
}))

router.put('/:section', asyncHandler(async (req, res) => {
  const section = String(req.params['section'])
  if (!isSettingsSection(section)) { res.status(404).json({ success: false, error: `Unknown settings section: ${section}` }); return }
  const parsed = SECTION_SCHEMAS[section].safeParse((req.body as { values?: unknown } | undefined)?.values)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    res.status(400).json({ success: false, error: `${first?.path.join('.') || 'values'}: ${first?.message ?? 'invalid'}` })
    return
  }
  const actor = req.header('x-user-email') ?? 'unknown'
  const { before, saved } = await saveSection(section, parsed.data as Record<string, unknown>, actor)
  void recordAuditLog({ userEmail: actor, action: 'SETTINGS_UPDATED', resourceType: 'settings', resourceId: section, oldValue: before, newValue: saved.values })
  res.json({ success: true, data: saved })
}))

export default router
