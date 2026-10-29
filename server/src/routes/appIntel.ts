import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { requireCapability } from '../middleware/requireRole.js'
import { getAppIntelService, type AppIntelService } from '../services/appIntel/service.js'
import {
  filterApps, sortApps, summarize, toRow, packagingIntentFor, syncStateOf,
  type AppFilters, type AppSortKey, type SyncFilter,
} from '../services/appIntel/query.js'
import type { AppPlatform, AppStatus, Confidence, InstallSource, ProviderId } from '../services/appIntel/types.js'
import { getCveStore, type CveStore } from '../services/appIntel/cve.js'
import { buildAppExport } from '../services/appIntel/exportReport.js'
import { sendUpdateReportToSlack } from '../services/appIntel/updateReport.js'
import { getRequestService, REQUEST_KINDS, RequestError, type RequestService } from '../services/appIntel/requests.js'

// Read-only App Intelligence API. Nothing here installs, publishes, approves or deploys anything, and
// no provider credential or token is ever returned.

// Permission keys: appIntel.read / appIntel.write (see server/src/services/rolePermissions.ts).
// Creating a Jira request or posting to Slack is outward-facing, so write is narrower than read.
const PLATFORMS: AppPlatform[] = ['windows', 'macOS']
const STATUSES: AppStatus[] = ['Up to date', 'Update available — existing package', 'Package required', 'Repackage required', 'Native update', 'Review required', 'Data unavailable']
const PROVIDERS: ProviderId[] = ['intune', 'manageengine-mdm', 'endpoint-central']
const CONFIDENCES: Confidence[] = ['high', 'medium', 'low']
const INSTALL_SOURCES: InstallSource[] = ['custom', 'self-service', 'manual']
const SYNC_FILTERS: SyncFilter[] = ['checked', 'stale', 'never']
const SORT_KEYS: AppSortKey[] = ['app', 'publisher', 'affected', 'devices', 'status', 'lastChecked']
const STALE_SNAPSHOT_MS = 30 * 60 * 1000

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | undefined => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : undefined)

type ListQuery = { ok: true; filters: AppFilters; sortKey: AppSortKey | undefined; sortDir: 'asc' | 'desc' } | { ok: false; error: string }
/** Filter/sort parsing shared by the inventory list and its export, so the file matches the screen. */
function parseListQuery(query: Record<string, unknown>): ListQuery {
  const platform = oneOf(query.platform, PLATFORMS)
  if (!platform) return { ok: false, error: 'platform must be windows or macOS' }
  const rawStatus = str(query.status), rawProv = str(query.provider), rawConf = str(query.confidence), rawSync = str(query.syncState), rawSort = str(query.sortKey), rawSrc = str(query.installSource)
  const status = oneOf(rawStatus, STATUSES), provider = oneOf(rawProv, PROVIDERS), confidence = oneOf(rawConf, CONFIDENCES), syncState = oneOf(rawSync, SYNC_FILTERS), sortKey = oneOf(rawSort, SORT_KEYS), installSource = oneOf(rawSrc, INSTALL_SOURCES)
  if ((rawStatus && !status) || (rawProv && !provider) || (rawConf && !confidence) || (rawSync && !syncState) || (rawSort && !sortKey) || (rawSrc && !installSource)) return { ok: false, error: 'Invalid filter or sort value' }
  return { ok: true, sortKey, sortDir: query.sortDir === 'desc' ? 'desc' : 'asc', filters: { platform, provider, status, publisher: str(query.publisher), syncState, confidence, installSource, updateAvailable: query.updateAvailable === '1', q: str(query.q) } }
}

export interface AppIntelRouterDeps { cve?: () => CveStore; requests?: () => RequestService }

export function createAppIntelRouter(getService: () => AppIntelService = getAppIntelService, now: () => number = Date.now, deps: AppIntelRouterDeps = {}): Router {
  const cveStore = deps.cve ?? getCveStore
  const requestService = deps.requests ?? getRequestService
  const router = Router()
  router.use(requireCapability('appIntel.read'))

  // Kick off a background sync the first time data is requested, and when the snapshot is stale.
  const ensureFresh = (svc: AppIntelService): void => {
    const st = svc.getState()
    const snap = svc.getSnapshot()
    const stale = !snap || now() - Date.parse(snap.syncedAt) > STALE_SNAPSHOT_MS
    if (st.state !== 'syncing' && stale && st.state !== 'error') void svc.startSync()
  }

  router.get('/status', asyncHandler(async (_req, res) => {
    const svc = getService()
    ensureFresh(svc)
    res.json({ success: true, data: { ...svc.getState(), capabilities: await svc.capabilities() } })
  }))

  router.post('/sync', asyncHandler(async (_req, res) => {
    const svc = getService()
    void svc.startSync()
    res.status(202).json({ success: true, data: svc.getState() })
  }))

  router.get('/summary', asyncHandler(async (req, res) => {
    const platform = oneOf(req.query.platform, PLATFORMS)
    if (!platform) { res.status(400).json({ success: false, error: 'platform must be windows or macOS' }); return }
    const svc = getService(); ensureFresh(svc)
    const snap = svc.getSnapshot()
    res.json({ success: true, data: { state: svc.getState(), summary: snap ? summarize(snap.apps, platform) : null } })
  }))

  router.get('/apps', asyncHandler(async (req, res) => {
    const parsed = parseListQuery(req.query)
    if (!parsed.ok) { res.status(400).json({ success: false, error: parsed.error }); return }
    const { filters, sortKey, sortDir } = parsed
    const svc = getService(); ensureFresh(svc)
    const snap = svc.getSnapshot()
    if (!snap) { res.json({ success: true, data: { state: svc.getState(), total: 0, page: 1, pageSize: 25, totalPages: 1, rows: [] } }); return }

    const sorted = sortApps(filterApps(snap.apps, filters, now()), sortKey, sortDir)
    const pageSize = Math.min(200, Math.max(1, Math.floor(Number(req.query.pageSize)) || 25))
    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
    const page = Math.min(Math.max(1, Math.floor(Number(req.query.page)) || 1), totalPages)
    res.json({ success: true, data: { state: svc.getState(), total: sorted.length, page, pageSize, totalPages, rows: sorted.slice((page - 1) * pageSize, page * pageSize).map(a => toRow(a, { cve: cveStore().forApp(a), requests: requestService().listFor(a.key) })) } })
  }))

  // Export of the filtered inventory (same filters as /apps) or, with ?key=, of one app's devices and users.
  router.get('/export', asyncHandler(async (req, res) => {
    const parsed = parseListQuery(req.query)
    if (!parsed.ok) { res.status(400).json({ success: false, error: parsed.error }); return }
    const format = oneOf(req.query.format, ['csv', 'xlsx'] as const)
    if (!format) { res.status(400).json({ success: false, error: 'format must be csv or xlsx' }); return }
    const svc = getService()
    const snap = svc.getSnapshot()
    if (!snap) { res.status(409).json({ success: false, error: 'No inventory has been synced yet. Run a sync first.' }); return }
    const { filters, sortKey, sortDir } = parsed
    const applied = Object.entries(filters).filter(([, v]) => v !== undefined && v !== false && v !== '').map(([k, v]) => `${k}: ${String(v)}`)
    const meta = { generatedAt: new Date(now()).toISOString(), filters: applied, syncedAt: snap.syncedAt, providerAsOf: snap.providerAsOf as Record<string, string | null> }
    const key = str(req.query.key)
    let built
    if (key) {
      const app = snap.apps.find(a => a.key === key)
      if (!app) { res.status(404).json({ success: false, error: 'App not found in the latest sync' }); return }
      const { devices, note } = await svc.devicesFor(app)
      built = await buildAppExport({ kind: 'devices', app, devices }, format, { ...meta, filters: [`Application: ${app.identity.displayName}`], syncNote: note })
    } else {
      built = await buildAppExport({ kind: 'inventory', apps: sortApps(filterApps(snap.apps, filters, now()), sortKey, sortDir) }, format, meta)
    }
    console.info(`[app-intel] export ${format} ${key ? 'devices' : 'inventory'} by ${req.header('x-user-email') ?? 'unknown'}: ${built.rowCount} row(s)`)
    res.setHeader('Content-Type', built.contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${built.filename}"`)
    res.send(built.content)
  }))

  router.get('/apps/detail', asyncHandler(async (req, res) => {
    const key = str(req.query.key)
    const svc = getService()
    const app = key ? svc.getSnapshot()?.apps.find(a => a.key === key) : undefined
    if (!app) { res.status(404).json({ success: false, error: 'App not found in the latest sync' }); return }
    const [devices, assignments] = await Promise.all([svc.devicesFor(app), svc.assignmentsFor(app.packages)])
    const snap = svc.getSnapshot()!
    res.json({ success: true, data: {
      app, row: toRow(app, { cve: cveStore().forApp(app), requests: requestService().listFor(app.key) }), syncState: syncStateOf(app, now()),
      lifecycle: app.lifecycle ?? null, cve: cveStore().forApp(app), requests: requestService().listFor(app.key),
      providerAsOf: snap.providerAsOf, syncedAt: snap.syncedAt,
      devices: devices.devices, devicesNote: devices.note, assignments,
      packagingIntent: packagingIntentFor(app),
    } })
  }))

  // Posts the full verified-updates report to Slack now (the same report the weekly job sends).
  router.post('/report/slack', requireCapability('appIntel.write'), asyncHandler(async (_req, res) => {
    const snap = getService().getSnapshot()
    if (!snap) { res.status(409).json({ success: false, error: 'No verified inventory yet — wait for the sync to finish.' }); return }
    const result = await sendUpdateReportToSlack(snap.apps, { syncedAt: snap.syncedAt, errors: snap.errors })
    if (!result.ok) { res.status(502).json({ success: false, error: result.error ?? 'Slack delivery failed' }); return }
    res.json({ success: true, data: { updatesAvailable: result.updatesAvailable, devicesBehind: result.devicesBehind } })
  }))

  const actorOf = (req: { header(n: string): string | undefined }) => ({ email: req.header('x-user-email') ?? 'unknown@zinnia.com', role: req.header('x-user-role') ?? 'End User' })
  const target = (key: unknown, kind: unknown) => {
    const k = oneOf(kind, REQUEST_KINDS)
    const snap = getService().getSnapshot()
    const app = typeof key === 'string' && snap ? snap.apps.find(a => a.key === key) : undefined
    return { kind: k, app, syncedAt: snap?.syncedAt ?? null }
  }

  // Preview exactly what would be sent (and where) before anything leaves the system.
  router.get('/requests/preview', asyncHandler(async (req, res) => {
    const { kind, app, syncedAt } = target(req.query.key, req.query.kind)
    if (!kind) { res.status(400).json({ success: false, error: 'kind must be jira or slack' }); return }
    if (!app) { res.status(404).json({ success: false, error: 'App not found in the latest sync' }); return }
    res.json({ success: true, data: requestService().preview(app, cveStore().forApp(app), kind, actorOf(req), syncedAt) })
  }))

  router.post('/requests', requireCapability('appIntel.write'), asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as { key?: unknown; kind?: unknown }
    const { kind, app, syncedAt } = target(body.key, body.kind)
    if (!kind) { res.status(400).json({ success: false, error: 'kind must be jira or slack' }); return }
    if (!app) { res.status(404).json({ success: false, error: 'App not found in the latest sync' }); return }
    try {
      const record = await requestService().create(app, cveStore().forApp(app), kind, actorOf(req), syncedAt)
      res.status(201).json({ success: true, data: record })
    } catch (e) {
      if (!(e instanceof RequestError)) throw e
      const status = e.code === 'not_eligible' ? 400 : e.code === 'delivery_failed' ? 502 : 409
      res.status(status).json({ success: false, error: e.message, code: e.code, ...(e.existing ? { existing: e.existing } : {}) })
    }
  }))

  return router
}

export default createAppIntelRouter()
