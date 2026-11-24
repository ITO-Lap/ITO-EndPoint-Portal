// Remote Action Center — secure script execution on managed devices.
//
// Every route is behind the session gate mounted on /api (requireSession), then a permission key, then the
// server-side rules in remoteActions/service.ts. Script bodies are only returned to roles that may author or approve.

import { Router, type Request, type Response, type NextFunction } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { requireCapability } from '../middleware/requireRole.js'
import { permissionsForRole } from '../services/roleResolution.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import * as store from '../remoteActions/store.js'
import * as svc from '../remoteActions/service.js'
import { allProviders } from '../remoteActions/providers/registry.js'
import { runAssistant } from '../remoteActions/assistant.js'
import { countDevices } from '../remoteActions/jobLogic.js'
import { redactSecrets, sanitizeLog } from '../remoteActions/redaction.js'
import { DEFAULT_POLICY } from '../remoteActions/jobLogic.js'
import graphRunnerRouter from './graphRunner.js'

const router = Router()

// ── Request context ────────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { raActor?: svc.AuthedActor } }
}

/** Resolves the verified caller (requireSession already overwrote the headers) and their permissions once per request. */
export async function loadActor(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const role = req.header('x-user-role') ?? 'End User'
    req.raActor = { email: req.header('x-user-email') ?? 'unknown', role, perms: await permissionsForRole(role) }
    next()
  } catch (e) { next(e) }
}
router.use(loadActor)

const actorOf = (req: Request): svc.AuthedActor => req.raActor!
const can = (a: svc.AuthedActor, key: string): boolean => a.role === 'Global Admin' || a.perms[key] === true

const mutationLimiter = rateLimit({ windowMs: 60_000, max: 40, standardHeaders: true, legacyHeaders: false, message: { success: false, error: 'Too many requests. Slow down and try again shortly.' } })
const jobLimiter = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false, message: { success: false, error: 'Too many job requests. Wait a minute and try again.' } })
const assistantLimiter = rateLimit({ windowMs: 60_000, max: 12, standardHeaders: true, legacyHeaders: false, message: { success: false, error: 'Too many assistant requests. Wait a minute and try again.' } })

const READ = requireCapability('remoteActions.read')
const AUTHOR = requireCapability('remoteActions.author')
const EXECUTE = requireCapability('remoteActions.execute')
const APPROVE = requireCapability('remoteActions.approve')
const ADMIN = requireCapability('remoteActions.admin')

// ── Schemas ────────────────────────────────────────────────────────────────────

const scriptBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).optional(),
  content: z.string().min(1).max(250_000),
  fileName: z.string().max(200).optional(),
  language: z.enum(['powershell', 'shell']).optional(),
  owner: z.string().trim().max(200).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  timeoutSec: z.number().int().min(10).max(3600).optional(),
  runAs: z.enum(['system', 'user']).optional(),
  justification: z.string().max(2000).optional(),
  rollbackContent: z.string().max(250_000).optional(),
  source: z.enum(['manual', 'upload', 'ai_draft']).optional(),
}).strict()

const filterSchema = z.object({
  platform: z.enum(['Windows', 'macOS']).optional(), source: z.enum(['Microsoft Intune', 'ManageEngine']).optional(),
  nameContains: z.string().max(100).optional(), serialNumber: z.string().max(100).optional(),
  checkedInWithinHours: z.number().min(1).max(24 * 365).optional(), complianceState: z.enum(['Compliant', 'Warning', 'Non-Compliant']).optional(),
  department: z.string().max(100).optional(), owner: z.string().max(100).optional(), osVersionContains: z.string().max(100).optional(),
}).strict()

const targetSchema = z.object({ deviceIds: z.array(z.string().max(200)).max(2000).optional(), filter: filterSchema.optional() }).strict()

const preflightBody = z.object({
  scriptId: z.string().uuid(), version: z.number().int().positive().optional(), target: targetSchema,
  provider: z.enum(['intune', 'endpoint_central', 'mock']), mode: z.enum(['now', 'when_online', 'scheduled', 'pilot']),
  runAs: z.enum(['system', 'user']).optional(),
}).strict()

const jobBody = preflightBody.extend({
  justification: z.string().max(2000).optional(), scheduledFor: z.string().max(40).optional(), confirmDeviceCount: z.number().int().min(0).optional(),
}).strict()

const wrapService = (fn: (req: Request, res: Response) => Promise<void> | void) => asyncHandler(async (req, res) => {
  try { await fn(req, res) } catch (e) {
    if (e instanceof svc.ServiceError) { res.status(e.status).json({ success: false, error: e.message, ...(e.details !== undefined ? { details: e.details } : {}) }); return }
    if (e instanceof Error && typeof (e as unknown as { status?: number }).status === 'number') { res.status((e as unknown as { status: number }).status).json({ success: false, error: e.message }); return }
    throw e
  }
})

const idParam = (req: Request, name = 'id'): string => { const v = req.params[name]; return (Array.isArray(v) ? v[0] : v) ?? '' }

// ── Status / dashboard ─────────────────────────────────────────────────────────

router.get('/status', READ, wrapService(async (req, res) => {
  const a = actorOf(req)
  const providers = await Promise.all(allProviders().map(p => p.capabilities()))
  res.json({
    success: true,
    data: {
      providers, policy: store.getPolicy(), encryptionAtRest: store.encryptionEnabled(),
      permissions: {
        read: can(a, 'remoteActions.read'), author: can(a, 'remoteActions.author'), execute: can(a, 'remoteActions.execute'),
        approve: can(a, 'remoteActions.approve'), admin: can(a, 'remoteActions.admin'),
        graphRead: can(a, 'graphRunner.read'), graphRun: can(a, 'graphRunner.run'), graphChange: can(a, 'graphRunner.change'), graphApprove: can(a, 'graphRunner.approve'),
      },
      me: a.email,
    },
  })
}))

router.get('/dashboard', READ, wrapService((_req, res) => {
  const jobs = store.listJobs()
  const recent = jobs.filter(j => Date.parse(j.createdAt) > Date.now() - 30 * 86_400_000)
  const finished = recent.filter(j => ['completed', 'completed_with_failures', 'failed'].includes(j.status))
  const devs = finished.flatMap(j => j.devices)
  const ok = devs.filter(d => d.state === 'succeeded').length
  const attempted = devs.filter(d => ['succeeded', 'failed', 'timed_out'].includes(d.state)).length
  const scripts = store.listScripts()
  res.json({
    success: true,
    data: {
      scripts: { total: scripts.filter(s => !s.archived).length, pendingApproval: scripts.filter(s => !s.archived && s.versions[s.versions.length - 1]!.approvalStatus === 'pending_approval').length },
      pendingApprovals: { scripts: scripts.filter(s => !s.archived && s.versions[s.versions.length - 1]!.approvalStatus === 'pending_approval').map(svc.scriptSummary), jobs: jobs.filter(j => j.status === 'pending_approval').map(svc.jobView) },
      activeJobs: jobs.filter(j => ['queued', 'running', 'scheduled'].includes(j.status)).map(svc.jobView),
      recentFailures: jobs.filter(j => ['failed', 'completed_with_failures'].includes(j.status)).slice(-10).reverse().map(svc.jobView),
      waitingForOnline: jobs.filter(j => j.status === 'running').reduce((n, j) => n + countDevices(j.devices).waitingOnline, 0),
      successRate30d: attempted ? Math.round((ok / attempted) * 100) : null,
      attemptedDevices30d: attempted,
    },
  })
}))

// ── Scripts ────────────────────────────────────────────────────────────────────

router.get('/scripts', READ, wrapService((_req, res) => {
  res.json({ success: true, data: store.listScripts().map(svc.scriptSummary) })
}))

router.get('/scripts/:id', READ, wrapService((req, res) => {
  const s = store.getScript(idParam(req))
  if (!s) throw new svc.ServiceError('Script not found.', 404)
  const a = actorOf(req)
  const showBody = can(a, 'remoteActions.author') || can(a, 'remoteActions.approve') || can(a, 'remoteActions.admin')
  res.json({
    success: true,
    data: {
      ...svc.scriptSummary(s),
      versions: s.versions.map(v => ({ ...v, content: showBody ? v.content : undefined, rollbackContent: showBody ? v.rollbackContent : undefined, bodyHidden: !showBody })),
      audit: store.readAudit({ resourceType: 'script', resourceId: s.id, limit: 100 }),
    },
  })
}))

/** Validation + safety review without saving anything. */
router.post('/scripts/analyze', AUTHOR, mutationLimiter, wrapService((req, res) => {
  const body = z.object({ content: z.string().max(250_000), fileName: z.string().max(200).optional(), language: z.enum(['powershell', 'shell']).optional(), rollbackContent: z.string().max(250_000).optional() }).strict().parse(req.body)
  const { analysis, rollback } = svc.validateScriptInput({ name: 'x', content: body.content, ...(body.fileName ? { fileName: body.fileName } : {}), ...(body.language ? { language: body.language } : {}), ...(body.rollbackContent ? { rollbackContent: body.rollbackContent } : {}) })
  res.json({ success: true, data: { analysis, ...(rollback ? { rollback } : {}) } })
}))

router.post('/scripts', AUTHOR, mutationLimiter, wrapService((req, res) => {
  res.status(201).json({ success: true, data: svc.scriptSummary(svc.createScript(scriptBody.parse(req.body) as svc.ScriptInput, actorOf(req))) })
}))

router.put('/scripts/:id', AUTHOR, mutationLimiter, wrapService((req, res) => {
  res.json({ success: true, data: svc.scriptSummary(svc.updateScript(idParam(req), scriptBody.parse(req.body) as svc.ScriptInput, actorOf(req))) })
}))

router.post('/scripts/:id/versions/:version/decision', APPROVE, mutationLimiter, wrapService((req, res) => {
  const body = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().max(500).optional() }).strict().parse(req.body)
  res.json({ success: true, data: svc.scriptSummary(svc.decideScriptVersion(idParam(req), Number(idParam(req, 'version')), body.decision, body.note, actorOf(req))) })
}))

router.post('/scripts/:id/archive', AUTHOR, mutationLimiter, wrapService((req, res) => {
  const body = z.object({ archived: z.boolean() }).strict().parse(req.body)
  res.json({ success: true, data: svc.scriptSummary(svc.archiveScript(idParam(req), body.archived, actorOf(req))) })
}))

// ── Targets, pre-flight, jobs ──────────────────────────────────────────────────

router.get('/devices', EXECUTE, wrapService(async (req, res) => {
  const q = z.object({
    platform: z.enum(['Windows', 'macOS']).optional(), source: z.enum(['Microsoft Intune', 'ManageEngine']).optional(), q: z.string().max(100).optional(),
    checkedInWithinHours: z.coerce.number().min(1).max(8760).optional(), compliance: z.enum(['Compliant', 'Warning', 'Non-Compliant']).optional(),
    department: z.string().max(100).optional(), limit: z.coerce.number().int().min(1).max(500).default(100),
  }).parse(req.query)
  const { devices } = await svc.resolveTargets({
    filter: {
      ...(q.platform ? { platform: q.platform } : {}), ...(q.source ? { source: q.source } : {}), ...(q.q ? { nameContains: q.q } : {}),
      ...(q.checkedInWithinHours ? { checkedInWithinHours: q.checkedInWithinHours } : {}), ...(q.compliance ? { complianceState: q.compliance } : {}), ...(q.department ? { department: q.department } : {}),
    },
  })
  res.json({ success: true, data: { total: devices.length, devices: devices.slice(0, q.limit) } })
}))

router.post('/preflight', EXECUTE, mutationLimiter, wrapService(async (req, res) => {
  const body = preflightBody.parse(req.body)
  const { result, version } = await svc.preflight(body as svc.PreflightRequest)
  const { approvalRequirement } = await import('../remoteActions/jobLogic.js')
  res.json({ success: true, data: { ...result, risk: version.risk, versionApproval: version.approvalStatus, approval: approvalRequirement(version.risk, result.eligible.length, store.getPolicy()) } })
}))

router.get('/jobs', READ, wrapService((req, res) => {
  const status = typeof req.query['status'] === 'string' ? req.query['status'] : undefined
  const jobs = [...store.listJobs()].reverse().filter(j => !status || j.status === status).slice(0, 300)
  res.json({ success: true, data: jobs.map(j => ({ ...svc.jobView(j), devices: undefined })) })
}))

router.get('/jobs/:id', READ, wrapService((req, res) => {
  const job = store.getJob(idParam(req))
  if (!job) throw new svc.ServiceError('Job not found.', 404)
  res.json({ success: true, data: { ...svc.jobView(job), audit: store.readAudit({ resourceType: 'job', resourceId: job.id, limit: 100 }) } })
}))

router.post('/jobs', EXECUTE, jobLimiter, wrapService(async (req, res) => {
  const body = jobBody.parse(req.body)
  const { job, duplicate } = await svc.createJob(body as svc.CreateJobInput, actorOf(req))
  if (!duplicate && job.status === 'approved') void svc.dispatchJob(job.id, actorOf(req).email)
  res.status(duplicate ? 200 : 202).json({ success: true, duplicate, data: svc.jobView(job) })
}))

router.post('/jobs/:id/decision', APPROVE, mutationLimiter, wrapService(async (req, res) => {
  const body = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().max(500).optional() }).strict().parse(req.body)
  const job = svc.decideJob(idParam(req), body.decision, body.note, actorOf(req))
  if (body.decision === 'approve') void svc.dispatchJob(job.id, actorOf(req).email)
  res.json({ success: true, data: svc.jobView(job) })
}))

router.post('/jobs/:id/refresh', READ, mutationLimiter, wrapService(async (req, res) => {
  res.json({ success: true, data: svc.jobView(await svc.pollJob(idParam(req))) })
}))

router.post('/jobs/:id/cancel', EXECUTE, mutationLimiter, wrapService(async (req, res) => {
  res.json({ success: true, data: svc.jobView(await svc.cancelJob(idParam(req), actorOf(req))) })
}))

router.post('/jobs/:id/retry-failed', EXECUTE, jobLimiter, wrapService(async (req, res) => {
  const body = z.object({ confirmDeviceCount: z.number().int().min(0).optional() }).strict().parse(req.body ?? {})
  const { job, duplicate } = await svc.retryFailed(idParam(req), actorOf(req), body.confirmDeviceCount)
  if (!duplicate && job.status === 'approved') void svc.dispatchJob(job.id, actorOf(req).email)
  res.status(duplicate ? 200 : 202).json({ success: true, duplicate, data: svc.jobView(job) })
}))

const csvCell = (v: unknown): string => {
  let s = String(v ?? '').replace(/\r?\n/g, ' ')
  // Neutralise spreadsheet formula injection from device output.
  if (/^[=+\-@\t]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

router.get('/jobs/:id/export', READ, wrapService((req, res) => {
  const job = store.getJob(idParam(req))
  if (!job) throw new svc.ServiceError('Job not found.', 404)
  store.audit({ actor: actorOf(req).email, action: 'job.exported', resourceType: 'job', resourceId: job.id })
  const rows = [['Device', 'Platform', 'State', 'Provider state', 'Exit code', 'Progress %', 'Error', 'Output', 'Started', 'Finished']]
  for (const d of job.devices) rows.push([d.deviceName, d.platform, d.state, d.providerState ?? '', d.exitCode ?? '', d.progress?.percent ?? '', d.error ?? '', d.output ?? '', d.startedAt ?? '', d.finishedAt ?? ''].map(String))
  for (const x of job.excluded) rows.push([x.device.name, x.device.platform, 'excluded', '', '', '', x.reasons.join(' '), '', '', ''])
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="remote-action-${job.id.slice(0, 8)}.csv"`)
  res.send(rows.map(r => r.map(csvCell).join(',')).join('\r\n'))
}))

// ── Policy / audit / emergency stop ────────────────────────────────────────────

router.get('/audit', READ, wrapService((req, res) => {
  const limit = Math.min(Number(req.query['limit']) || 200, 1000)
  res.json({ success: true, data: store.readAudit({ limit, ...(typeof req.query['resourceType'] === 'string' ? { resourceType: req.query['resourceType'] } : {}) }) })
}))

router.put('/policy', ADMIN, mutationLimiter, wrapService((req, res) => {
  const body = z.object({
    maxDevicesPerJob: z.number().int().min(1).max(5000), mediumRiskApprovalAbove: z.number().int().min(0).max(5000), maxConcurrentJobs: z.number().int().min(1).max(50),
    maxJobsPerUserPerHour: z.number().int().min(1).max(500), maxCheckInAgeHours: z.number().int().min(1).max(24 * 90), pilotMaxDevices: z.number().int().min(1).max(100),
  }).strict().parse(req.body)
  const before = store.getPolicy()
  const next = store.savePolicy({ ...DEFAULT_POLICY, ...before, ...body })
  store.audit({ actor: actorOf(req).email, action: 'policy.updated', resourceType: 'policy', resourceId: 'execution', detail: { before, after: next } })
  res.json({ success: true, data: next })
}))

router.post('/emergency-stop', ADMIN, mutationLimiter, wrapService((req, res) => {
  const { paused } = z.object({ paused: z.boolean() }).strict().parse(req.body)
  const next = store.savePolicy({ ...store.getPolicy(), executionPaused: paused })
  store.audit({ actor: actorOf(req).email, action: paused ? 'policy.emergency_stop' : 'policy.resume', resourceType: 'policy', resourceId: 'execution' })
  res.json({ success: true, data: next })
}))

// ── Script Assistant (AI drafts only) ──────────────────────────────────────────

router.post('/assistant', AUTHOR, assistantLimiter, wrapService(async (req, res) => {
  const body = z.object({
    task: z.enum(['explain', 'risks', 'targeting', 'draft', 'rollback', 'analyze_logs']),
    content: z.string().max(60_000).optional(), language: z.enum(['powershell', 'shell']).optional(), request: z.string().max(4000).optional(), logs: z.string().max(60_000).optional(),
  }).strict().parse(req.body)
  const result = await runAssistant({ task: body.task, ...(body.content ? { content: body.content } : {}), ...(body.language ? { language: body.language } : {}), ...(body.request ? { request: body.request } : {}), ...(body.logs ? { logs: body.logs } : {}) })
  store.audit({ actor: actorOf(req).email, action: `assistant.${body.task}`, resourceType: 'script', resourceId: 'assistant', detail: { ai: result.ai } })
  res.json({ success: true, data: { ...result, text: sanitizeLog(redactSecrets(result.text), 12_000) } })
}))

// ── Microsoft Graph API Runner (separate router, same permission model) ────────
router.use('/graph', graphRunnerRouter)

export default router
