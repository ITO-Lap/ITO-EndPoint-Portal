import { Router } from 'express'
import type { Request } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { requireCapability } from '../middleware/requireRole.js'
import { getStaleDevicesService, type StaleDevicesService } from '../services/staleDevices/service.js'
import {
  BUCKETS, MANAGED_BY, SORT_KEYS, STALE_VIEWS, STATUSES, filterDevices, paginate, safeTimezone, sortDevices, summarize, toCsv,
  type StaleFilters,
} from '../services/staleDevices/query.js'
import { STALE_DAYS } from '../services/staleDevices/types.js'
import type { StalePlatform } from '../services/staleDevices/types.js'

// Read-only Stale Devices API. Nothing here retires, wipes, deletes or remediates a device, and no provider
// credential or token is ever returned. Page loads read the cached snapshot; only POST /sync (and the
// background refresh below) touch Intune / Endpoint Central.

// Permission keys: staleDevices.read / staleDevices.export (see server/src/services/rolePermissions.ts).
// Exports carry usernames and email addresses, so export is narrower than read.
const SNAPSHOT_MAX_AGE_MS = 30 * 60 * 1000

const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | undefined =>
  (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : undefined)
const num = (v: unknown, d: number): number => { const n = Number(v); return Number.isFinite(n) ? n : d }

function parseFilters(req: Request): StaleFilters {
  const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 120) : undefined
  return {
    view: oneOf(req.query.view, STALE_VIEWS),
    platform: oneOf<StalePlatform>(req.query.platform, ['Windows', 'macOS']),
    managedBy: oneOf(req.query.managedBy, MANAGED_BY),
    bucket: oneOf(req.query.bucket, BUCKETS),
    status: oneOf(req.query.status, STATUSES),
    ...(q ? { q } : {}),
    sortKey: oneOf(req.query.sortKey, SORT_KEYS),
    sortDir: oneOf(req.query.sortDir, ['asc', 'desc'] as const),
  }
}

export function createStaleDevicesRouter(getService: () => StaleDevicesService = getStaleDevicesService): Router {
  const router = Router()
  router.use(requireCapability('staleDevices.read'))

  const ensureFresh = (svc: StaleDevicesService): void => {
    if (svc.getState().state !== 'syncing' && svc.isStaleSnapshot(SNAPSHOT_MAX_AGE_MS)) void svc.startSync()
  }
  const meta = (svc: StaleDevicesService) => ({ staleDays: STALE_DAYS, ...svc.getState() })

  router.get('/status', asyncHandler(async (_req, res) => {
    const svc = getService(); ensureFresh(svc)
    res.json({ success: true, data: meta(svc) })
  }))

  router.post('/sync', asyncHandler(async (_req, res) => {
    const svc = getService(); void svc.startSync()
    res.status(202).json({ success: true, data: meta(svc) })
  }))

  router.get('/devices', asyncHandler(async (req, res) => {
    const svc = getService(); ensureFresh(svc)
    const all = svc.devices()
    const filters = parseFilters(req)
    const filtered = sortDevices(filterDevices(all, filters), filters.sortKey, filters.sortDir)
    const page = paginate(filtered, num(req.query.page, 1), num(req.query.pageSize, 25))
    res.json({ success: true, data: { ...meta(svc), summary: summarize(all), ...page } })
  }))

  router.get('/devices/detail', asyncHandler(async (req, res) => {
    const id = typeof req.query.id === 'string' ? req.query.id : ''
    const device = id ? getService().devices().find(d => d.canonicalDeviceId === id) : undefined
    if (!device) { res.status(404).json({ success: false, error: 'Device not found in the current snapshot' }); return }
    res.json({ success: true, data: { ...meta(getService()), device } })
  }))

  router.get('/export', requireCapability('staleDevices.export'), asyncHandler(async (req, res) => {
    const svc = getService()
    const filters = parseFilters(req)
    const rows = sortDevices(filterDevices(svc.devices(), filters), filters.sortKey, filters.sortDir)
    const tz = safeTimezone(typeof req.query.tz === 'string' ? req.query.tz : undefined)
    console.info(`[staleDevices] CSV export by ${req.header('x-user-email') ?? 'unknown'} (${req.header('x-user-role')}): ${rows.length} row(s), view=${filters.view ?? 'stale'}`)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="stale-devices-${new Date().toISOString().slice(0, 10)}.csv"`)
    res.send('﻿' + toCsv(rows, tz))
  }))

  return router
}
