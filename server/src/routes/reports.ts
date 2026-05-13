import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import { fetchAllDevices } from './devices.js'
import { getKandjiLibraryApps, isKandjiConfigured } from '../services/kandji.js'
import { getEntraData, isEntraConfigured } from '../services/entra.js'
import {
  getReportDef,
  listReportMeta,
  runReport,
  toCSV,
  invalidateReportCache,
} from '../reporting/engine.js'
import '../reporting/definitions.js'

const router = Router()

const runSchema = z.object({
  limit:   z.coerce.number().int().min(1).max(5000).optional().default(500),
  offset:  z.coerce.number().int().min(0).optional().default(0),
  sortBy:  z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional().default('asc'),
})

router.get('/', (_req, res) => {
  res.json({ success: true, data: listReportMeta() })
})

router.post('/:id/run', asyncHandler(async (req, res) => {
  const { id } = req.params
  if (typeof id !== 'string') { res.status(400).json({ success: false, error: 'Invalid report id' }); return }

  const def = getReportDef(id)

  const parsed = runSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.issues.map((e: { message: string }) => e.message).join(', ') })
    return
  }

  const { devices, mock } = await fetchAllDevices()
  const kandjiApps = isKandjiConfigured() ? await getKandjiLibraryApps().catch(() => []) : []
  const entraData  = isEntraConfigured()  ? await getEntraData().catch(() => undefined) : undefined

  const { sortBy, ...rest } = parsed.data
  const params = sortBy !== undefined ? { ...rest, sortBy } : rest
  const result = runReport(def, { devices, kandjiApps, ...(entraData ? { entraData } : {}), isMock: mock }, params)
  res.json({ success: true, data: result })
}))

router.get('/:id/export/csv', asyncHandler(async (req, res) => {
  const { id } = req.params
  if (typeof id !== 'string') { res.status(400).json({ success: false, error: 'Invalid report id' }); return }

  const def = getReportDef(id)

  const parsed = runSchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.issues.map((e: { message: string }) => e.message).join(', ') })
    return
  }

  const { devices, mock } = await fetchAllDevices()
  const kandjiApps = isKandjiConfigured() ? await getKandjiLibraryApps().catch(() => []) : []
  const entraData  = isEntraConfigured()  ? await getEntraData().catch(() => undefined) : undefined

  // For CSV export, return all rows (no pagination limit from query)
  const { sortBy: csvSortBy, ...csvRest } = parsed.data
  const csvParams = csvSortBy !== undefined
    ? { ...csvRest, sortBy: csvSortBy, limit: 5000, offset: 0 }
    : { ...csvRest, limit: 5000, offset: 0 }
  const result = runReport(def, { devices, kandjiApps, ...(entraData ? { entraData } : {}), isMock: mock }, csvParams)
  const csv = toCSV(result)

  const filename = `${def.id}-${new Date().toISOString().slice(0, 10)}.csv`
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(csv)
}))

router.post('/:id/invalidate', asyncHandler(async (req, res) => {
  const { id } = req.params
  if (typeof id !== 'string') { res.status(400).json({ success: false, error: 'Invalid report id' }); return }
  invalidateReportCache(id)
  res.json({ success: true, data: { invalidated: id } })
}))

export default router
