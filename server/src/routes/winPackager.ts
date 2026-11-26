// Windows Package Builder API. Uploaded installers are stored, hashed and READ (never executed) on this server.
// Installing/validating happens only on the separate Windows worker; the .intunewin is built natively here (zip + encrypt, nothing executed).
// This module only PACKAGES applications. It has no publishing, assignment or deployment features.

import { Router } from 'express'
import type { Request, Response } from 'express'
import { createReadStream, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { requireCapability } from '../middleware/requireRole.js'
import { getJob, listJobs, recordJobEvent, saveJob, setJobState } from '../services/winPackager/jobStore.js'
import { storeUpload, UploadError } from '../services/winPackager/upload.js'
import {
  createContentDir, createJobWorkspace, jobDir, newJobId, packageSourceDir, packagerLimits, removeJobWorkspace,
  resolveInside, sanitizeFileName, sourceTypeFor,
} from '../services/winPackager/workspace.js'
import { analyzeArchive, analyzeInstaller } from '../services/winPackager/inspect.js'
import { extractZip } from '../services/winPackager/zipSafe.js'
import { applyPatch, configPatchSchema, configProblems, defaultConfig, outputFileName } from '../services/winPackager/config.js'
import { exportOutput, outputDirFor, removeOutput } from '../services/winPackager/outputDir.js'
import { buildIntuneWin } from '../services/winPackager/intunewin.js'
import { ARTIFACT_NAMES, detectionScript, generateArtifacts, installScript, uninstallScript, writeArtifacts } from '../services/winPackager/artifacts.js'
import type { ArtifactName } from '../services/winPackager/artifacts.js'
import { createWorkerClient, evaluateSteps, workerConfig, WorkerError } from '../services/winPackager/worker.js'
import { signedLink } from '../services/winPackager/signing.js'
import { running } from '../services/winPackager/running.js'
import type { PackageJob } from '../services/winPackager/types.js'

const router = Router()
const actorOf = (req: Request): string => req.header('x-user-email') ?? 'unknown@zinnia.com'
const fail = (res: Response, status: number, error: string, extra?: object): void => { res.status(status).json({ success: false, error, ...extra }) }
const workerClient = () => createWorkerClient(workerConfig())

const STALE_PROCESSING_MS = 60 * 60 * 1000

/** A job stuck in "processing" with no live task (e.g. the server restarted) must not look busy forever. */
async function reconcile(job: PackageJob): Promise<PackageJob> {
  if (job.state === 'processing' && !running.has(job.id) && Date.now() - Date.parse(job.updatedAt) > STALE_PROCESSING_MS) {
    await setJobState(job, 'api-unavailable', 'system', 'The operation was interrupted (server restart or timeout). Retry it.')
  }
  return job
}

function loadJob(req: Request, res: Response): PackageJob | undefined {
  const job = getJob(String(req.params['id']))
  if (!job) fail(res, 404, 'Package job not found.')
  return job
}

const publicBase = (): string | null => {
  const raw = process.env['WIN_PACKAGER_PUBLIC_URL']?.trim()
  if (!raw) return null
  try { const u = new URL(raw); return u.protocol === 'https:' ? u.origin : null } catch { return null }
}

const SAFE_ENTRY = /^(?:[A-Za-z0-9 _\-.()+]+\/)*[A-Za-z0-9 _\-.()+]+$/

// ── Status ─────────────────────────────────────────────────────────────────────

router.get('/status', requireCapability('winPackager.read'), async (_req, res, next) => {
  try {
    res.json({
      success: true,
      data: {
        limits: packagerLimits(),
        windowsWorker: await workerClient().status(),
        workerLinksConfigured: publicBase() !== null,
      },
    })
  } catch (err) { next(err) }
})

// ── Read ───────────────────────────────────────────────────────────────────────

router.get('/jobs', requireCapability('winPackager.read'), (_req, res) => {
  res.json({ success: true, data: listJobs() })
})

router.get('/jobs/:id', requireCapability('winPackager.read'), async (req, res, next) => {
  try {
    const job = loadJob(req, res)
    if (job) res.json({ success: true, data: await reconcile(job) })
  } catch (err) { next(err) }
})

// ── Upload + automatic inspection ──────────────────────────────────────────────

/** Inspection is read-only parsing. A failure marks the job Unsupported; it never throws away the upload. */
async function inspectJob(job: PackageJob, actor: string, installerRel?: string): Promise<void> {
  const dir = jobDir(job.id)
  try {
    if (job.source.type === 'zip' && !installerRel) {
      job.analysis = analyzeArchive(join(dir, 'source', job.source.storedName), job.source.fileName)
      const nested = job.analysis.archiveEntries?.filter(e => e.kind).length ?? 0
      await recordJobEvent(job, actor, 'inspect', `archive: ${job.analysis.archiveEntries?.length ?? 0} files, ${nested} installers`)
      const unsafe = job.analysis.warnings.find(w => /unsafe|zip bomb|symbolic|encrypted|ZIP64|limit|Duplicate|Unsupported compression/i.test(w))
      await setJobState(job, unsafe ? 'unsupported' : 'review-required', actor, unsafe ?? 'Select the installer inside the archive.')
      return
    }
    const rel = installerRel ?? job.source.storedName
    const file = resolveInside(packageSourceDir(job.id, job.source.type), rel)
    job.analysis = await analyzeInstaller(file, rel)
    job.config = defaultConfig(job.analysis, job.source.fileName)
    delete job.validation; delete job.approval
    await recordJobEvent(job, actor, 'inspect', `${job.analysis.tech}, command confidence ${job.analysis.commands.confidence}, score ${job.analysis.confidence}`)
    await setJobState(job, 'review-required', actor, 'Inspected. Review the configuration; Windows validation has not run.')
  } catch (err) {
    await setJobState(job, 'unsupported', actor, err instanceof Error ? err.message : 'Inspection failed.')
  }
}

// Raw upload: body is the file bytes; name in the x-file-name header (URI-encoded).
router.post('/jobs', requireCapability('winPackager.write'), async (req, res, next) => {
  const limits = packagerLimits()
  try {
    let rawName: string
    try { rawName = decodeURIComponent(req.header('x-file-name') ?? '') } catch { throw new UploadError(400, 'x-file-name is not valid URI encoding.') }
    if (!rawName) throw new UploadError(400, 'x-file-name header is required.')
    const fileName = sanitizeFileName(rawName)
    const type = sourceTypeFor(fileName)
    if (!type) throw new UploadError(415, 'Unsupported file type. Use .msi, .exe, .msix, .appx or .zip. (Upload a source folder as a .zip.)')
    const declared = Number(req.header('content-length'))
    if (Number.isFinite(declared) && declared > limits.maxUploadBytes) {
      throw new UploadError(413, `File exceeds the configured upload limit of ${limits.maxUploadBytes} bytes.`)
    }

    const id = newJobId()
    createJobWorkspace(id)
    const actor = actorOf(req)
    try {
      const stored = await storeUpload(req, jobDir(id), fileName, type, limits.maxUploadBytes)
      const now = new Date().toISOString()
      const job: PackageJob = {
        id, state: 'processing', createdAt: now, updatedAt: now, createdBy: actor,
        source: { fileName, storedName: fileName, type, sizeBytes: stored.sizeBytes, sha256: stored.sha256 },
        events: [],
      }
      saveJob(job)
      await recordJobEvent(job, actor, 'upload', `${fileName} (${stored.sizeBytes} bytes, sha256 ${stored.sha256})`)
      if (stored.sizeBytes > limits.maxIntuneBytes) {
        await setJobState(job, 'unsupported', actor, 'Source is larger than the 30 GB Intune Win32 package limit.')
      } else {
        await inspectJob(job, actor)
      }
      res.status(201).json({ success: true, data: job })
    } catch (err) {
      removeJobWorkspace(id)
      throw err
    }
  } catch (err) {
    if (err instanceof UploadError) { fail(res, err.status, err.message); return }
    next(err)
  }
})

router.post('/jobs/:id/inspect', requireCapability('winPackager.write'), async (req, res, next) => {
  try {
    const job = loadJob(req, res); if (!job) return
    if (running.has(job.id)) { fail(res, 409, 'A background operation is still running for this job.'); return }
    const installer = job.analysis?.installerKind && job.config ? job.config.setupFile : undefined
    await inspectJob(job, actorOf(req), installer)
    res.json({ success: true, data: job })
  } catch (err) { next(err) }
})

/** ZIP only: extract after safe validation, then inspect the installer the engineer picked. */
router.post('/jobs/:id/select-installer', requireCapability('winPackager.write'), async (req, res, next) => {
  try {
    const job = loadJob(req, res); if (!job) return
    if (job.source.type !== 'zip') { fail(res, 400, 'Only ZIP uploads need an installer selection.'); return }
    if (running.has(job.id)) { fail(res, 409, 'A background operation is still running for this job.'); return }
    const entry = typeof req.body?.entry === 'string' ? req.body.entry.replace(/\\/g, '/') : ''
    const known = job.analysis?.archiveEntries?.find(e => e.name === entry && e.kind)
    if (!known) { fail(res, 400, 'Choose one of the installers listed from the archive.'); return }
    if (!SAFE_ENTRY.test(entry)) { fail(res, 400, 'That installer path contains characters that are not allowed in a package. Rename it inside the archive.'); return }
    const actor = actorOf(req)
    running.add(job.id)
    try {
      createContentDir(job.id)
      await extractZip(join(jobDir(job.id), 'source', job.source.storedName), join(jobDir(job.id), 'content'))
      await recordJobEvent(job, actor, 'extract', `Safely extracted archive; installer ${entry}`)
      await inspectJob(job, actor, entry)
    } catch (err) {
      rmSync(join(jobDir(job.id), 'content'), { recursive: true, force: true })
      await setJobState(job, 'unsupported', actor, err instanceof Error ? err.message : 'Archive could not be extracted.')
    } finally { running.delete(job.id) }
    res.json({ success: true, data: job })
  } catch (err) { next(err) }
})

// ── Configuration ──────────────────────────────────────────────────────────────

const CRITICAL_FIELDS = ['installCommand', 'uninstallCommand', 'detection', 'setupFile', 'architecture', 'installBehavior', 'appName', 'version']

router.put('/jobs/:id/config', requireCapability('winPackager.write'), async (req, res, next) => {
  try {
    const job = loadJob(req, res); if (!job) return
    if (running.has(job.id)) { fail(res, 409, 'A background operation is running; wait for it to finish before editing.'); return }
    if (!job.config || !job.analysis) { fail(res, 409, 'Nothing to configure yet — select an installer first (ZIP uploads) or fix the inspection error.'); return }
    const parsed = configPatchSchema.safeParse(req.body)
    if (!parsed.success) { fail(res, 400, 'Invalid configuration.', { issues: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) }); return }
    const before = job.config as unknown as Record<string, unknown>
    const updated = applyPatch(job.config, parsed.data)
    const after = updated as unknown as Record<string, unknown>
    const changed = Object.keys(parsed.data).filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    job.config = updated
    // Anything that changes what was tested or packaged invalidates the validation, approval and package.
    if (changed.some(k => CRITICAL_FIELDS.includes(k)) && (job.validation || job.approval || job.output)) {
      if (job.output) rmSync(join(jobDir(job.id), 'artifacts', job.output.fileName), { force: true })
      delete job.validation; delete job.approval; delete job.output
      await recordJobEvent(job, actorOf(req), 'invalidate', 'Configuration changed: validation, approval and package were cleared and must be redone.')
    }
    await recordJobEvent(job, actorOf(req), 'edit', changed.length ? `Changed: ${changed.join(', ')}` : 'No changes')
    res.json({ success: true, data: job, problems: configProblems(job.config, job) })
  } catch (err) { next(err) }
})

// ── Validation (Windows worker) ────────────────────────────────────────────────

function workerRequestLinks(job: PackageJob): { sourceUrl: string; uploadUrl: string } | null {
  const cfg = workerConfig(); const base = publicBase()
  if (!cfg || !base) return null
  return { sourceUrl: signedLink(base, cfg.token, job.id, 'source'), uploadUrl: signedLink(base, cfg.token, job.id, 'output') }
}

const withWorker = (name: string | undefined) => (name ? { workerName: name } : {})

router.post('/jobs/:id/validate', requireCapability('winPackager.validate'), async (req, res, next) => {
  try {
    const job = loadJob(req, res); if (!job) return
    const actor = actorOf(req)
    if (running.has(job.id)) { fail(res, 409, 'A background operation is already running for this job.'); return }
    if (!job.config || !job.analysis) { fail(res, 409, 'Configure the package before validating.'); return }
    const problems = configProblems(job.config, job)
    if (problems.length) { fail(res, 422, 'Configuration is not valid for validation.', { problems }); return }

    const worker = workerClient()
    const status = await worker.status()
    const links = workerRequestLinks(job)
    if (status.state !== 'ready' || !links) {
      const reason = status.state !== 'ready' ? (status.reason ?? 'Windows worker unavailable.') : 'WIN_PACKAGER_PUBLIC_URL (https) is not configured, so the worker cannot fetch the source.'
      job.validation = { outcome: 'not-tested', at: new Date().toISOString(), steps: [], message: `Package Created / Windows Installation Not Tested. ${reason}` }
      await recordJobEvent(job, actor, 'validate-unavailable', reason)
      await setJobState(job, 'api-unavailable', actor, reason)
      res.status(200).json({ success: true, data: job })
      return
    }

    const cfg = job.config
    const request = {
      jobId: job.id, setupFile: cfg.setupFile, installCommand: cfg.installCommand, uninstallCommand: cfg.uninstallCommand,
      detectionScript: detectionScript(cfg), source: { sha256: job.source.sha256, sizeBytes: job.source.sizeBytes }, sourceUrl: links.sourceUrl,
    }
    delete job.validation
    await recordJobEvent(job, actor, 'validate-start', `worker ${status.name ?? 'unnamed'}`)
    await setJobState(job, 'processing', actor, 'Windows validation is running.')
    running.add(job.id)
    res.status(202).json({ success: true, data: job })

    void (async () => {
      try {
        const result = await worker.validate(request)
        const verdict = evaluateSteps(result.steps)
        job.validation = { outcome: verdict.outcome, at: new Date().toISOString(), steps: result.steps, message: verdict.message, ...withWorker(result.workerName ?? status.name) }
        await recordJobEvent(job, actor, 'validate-result', `${verdict.outcome}: ${verdict.message}`)
        await setJobState(job, verdict.outcome === 'validated' ? 'ready' : 'validation-failed', actor, verdict.message)
      } catch (err) {
        const message = err instanceof WorkerError ? err.message : 'Windows validation failed unexpectedly.'
        job.validation = { outcome: 'not-tested', at: new Date().toISOString(), steps: [], message: `Package Created / Windows Installation Not Tested. ${message}` }
        await recordJobEvent(job, actor, 'validate-error', message)
        await setJobState(job, err instanceof WorkerError && err.unavailable ? 'api-unavailable' : 'validation-failed', actor, message)
      } finally { running.delete(job.id) }
    })()
  } catch (err) { next(err) }
})

// ── Approval + package creation ────────────────────────────────────────────────

/** Engineer sign-off on the reviewed configuration. This approves PACKAGING only. */
router.post('/jobs/:id/approve', requireCapability('winPackager.validate'), async (req, res, next) => {
  try {
    const job = loadJob(req, res); if (!job) return
    if (!job.config) { fail(res, 409, 'Nothing to approve yet.'); return }
    const problems = configProblems(job.config, job)
    if (problems.length) { fail(res, 422, 'Configuration is not valid.', { problems }); return }
    const validated = job.validation?.outcome === 'validated'
    if (!validated && req.body?.acceptUntested !== true) {
      fail(res, 409, 'Windows validation has not passed. Package Created / Windows Installation Not Tested — send acceptUntested: true to approve anyway.')
      return
    }
    job.approval = { by: actorOf(req), at: new Date().toISOString() }
    await recordJobEvent(job, actorOf(req), 'approve', validated ? 'Approved for packaging (validated).' : 'Approved for packaging WITHOUT passed Windows validation.')
    res.json({ success: true, data: job })
  } catch (err) { next(err) }
})

function dirSize(dir: string): number {
  let total = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    total += e.isDirectory() ? dirSize(p) : statSync(p).size
  }
  return total
}

function hashFile(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256')
    createReadStream(file).on('data', c => h.update(c)).on('error', reject).on('end', () => resolve(h.digest('hex')))
  })
}

router.post('/jobs/:id/package', requireCapability('winPackager.validate'), async (req, res, next) => {
  try {
    const job = loadJob(req, res); if (!job) return
    const actor = actorOf(req)
    if (running.has(job.id)) { fail(res, 409, 'A background operation is already running for this job.'); return }
    if (!job.config || !job.approval) { fail(res, 409, 'Engineer approval is required before creating the package.'); return }
    const problems = configProblems(job.config, job)
    if (problems.length) { fail(res, 422, 'Configuration is not valid.', { problems }); return }

    const limits = packagerLimits()
    const sourceDir = packageSourceDir(job.id, job.source.type)
    if (!existsSync(sourceDir)) { fail(res, 409, 'Source folder is missing.'); return }
    if (dirSize(sourceDir) > limits.maxIntuneBytes) {
      const msg = 'Source content exceeds the 30 GB Intune Win32 package limit. Clean up the media and reduce its size.'
      await setJobState(job, 'unsupported', actor, msg)
      fail(res, 422, msg)
      return
    }
    if (!existsSync(resolveInside(sourceDir, job.config.setupFile))) { fail(res, 409, 'The setup file is not in the source folder.'); return }

    const outputName = outputFileName(job.config)
    const artifactsDir = join(jobDir(job.id), 'artifacts')
    rmSync(join(artifactsDir, outputName), { force: true })
    delete job.output
    await recordJobEvent(job, actor, 'package-start', outputName)
    await setJobState(job, 'processing', actor, 'Creating the .intunewin package.')
    running.add(job.id)
    res.status(202).json({ success: true, data: job })

    const setupFile = job.config.setupFile
    void (async () => {
      try {
        const file = join(artifactsDir, outputName)
        // Built natively here: zipping + encrypting only, nothing from the source is executed.
        const workDir = join(jobDir(job.id), 'tmp'); mkdirSync(workDir, { recursive: true })
        const extraFiles = /\.(msix|appx)$/i.test(setupFile) ? [{ name: 'install.ps1', content: installScript(job.config!) }, { name: 'uninstall.ps1', content: uninstallScript(job.config!) }] : []
        try { await buildIntuneWin({ sourceDir, setupFile, outputFile: file, workDir, extraFiles }) } finally { rmSync(workDir, { recursive: true, force: true }) }
        const size = statSync(file).size
        if (size > limits.maxIntuneBytes) { rmSync(file, { force: true }); throw new WorkerError('The created package exceeds the 30 GB Intune limit.') }
        const sha256 = await hashFile(file)
        job.output = { fileName: outputName, sizeBytes: size, sha256, createdAt: new Date().toISOString(), workerName: 'built-in packager' }
        writeArtifacts(job)
        writeFileSync(join(artifactsDir, 'sha256.txt'), `${sha256}  ${outputName}\n${job.source.sha256}  ${job.source.fileName}\n`, 'utf-8')
        await recordJobEvent(job, actor, 'package-created', `${outputName} (${size} bytes, sha256 ${sha256})`)
        writeFileSync(join(artifactsDir, 'package.log'), job.events.map(e => `${e.at} ${e.actor} ${e.action}${e.detail ? ` ${e.detail}` : ''}`).join('\n') + '\n', 'utf-8')
        try { job.output.exportDir = exportOutput(job) } catch (e) { await recordJobEvent(job, actor, 'export-failed', e instanceof Error ? e.message : 'unknown error') }
        const validated = job.validation?.outcome === 'validated'
        await setJobState(job, validated ? 'ready' : 'review-required', actor, validated ? 'Package created and validated.' : 'Package Created / Windows Installation Not Tested.')
      } catch (err) {
        const message = `Package creation failed: ${err instanceof Error ? err.message : 'unexpected error'}`
        await recordJobEvent(job, actor, 'package-error', message)
        await setJobState(job, 'validation-failed', actor, message)
      } finally { running.delete(job.id) }
    })()
  } catch (err) { next(err) }
})

// ── Artifacts & downloads ──────────────────────────────────────────────────────

router.get('/jobs/:id/artifacts', requireCapability('winPackager.read'), (req, res) => {
  const job = loadJob(req, res); if (!job) return
  const generated = job.config ? configProblems(job.config, job).length === 0 : false
  const files: Array<{ name: string; kind: string; available: boolean }> = [
    ...ARTIFACT_NAMES.map(name => ({ name, kind: 'generated', available: generated })),
    { name: 'source', kind: 'original', available: true },
    { name: 'package', kind: 'intunewin', available: !!job.output },
    { name: 'sha256.txt', kind: 'hashes', available: !!job.output },
    { name: 'package.log', kind: 'log', available: !!job.output },
  ]
  res.json({ success: true, data: { files, output: job.output ?? null, sourceSha256: job.source.sha256 } })
})

// ── Output folder ──────────────────────────────────────────────────────────────

/** Opening a folder only makes sense when the server runs on the engineer's own machine: loopback client, no proxy,
 *  and not production (unless explicitly allowed). The path is always the job's own artifacts dir — never user input. */
function canOpenFolder(req: Request): boolean {
  const addr = req.socket.remoteAddress ?? ''
  const loopback = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
  const allowed = process.env['NODE_ENV'] !== 'production' || process.env['WIN_PACKAGER_ALLOW_OPEN_FOLDER'] === 'true'
  return loopback && allowed && !req.header('x-forwarded-for')
}

/** Folder where the deliverables live for the engineer. Re-exports if it is missing (e.g. packages built earlier). */
function ensureExported(job: PackageJob): string {
  const dir = job.output?.exportDir ?? outputDirFor(job)
  if (job.output && !existsSync(join(dir, job.output.fileName))) {
    job.output.exportDir = exportOutput(job)
    saveJob(job)
    return job.output.exportDir
  }
  return dir
}

router.get('/jobs/:id/output-folder', requireCapability('winPackager.read'), (req, res, next) => {
  try {
    const job = loadJob(req, res); if (!job) return
    const path = job.output ? ensureExported(job) : outputDirFor(job)
    res.json({ success: true, data: { path, fileName: job.output?.fileName ?? null, canOpen: canOpenFolder(req) && !!job.output } })
  } catch (err) { next(err) }
})

router.post('/jobs/:id/output-folder/open', requireCapability('winPackager.read'), async (req, res, next) => {
  try {
    const job = loadJob(req, res); if (!job) return
    if (!job.output) { fail(res, 409, 'No package has been created yet.'); return }
    if (!canOpenFolder(req)) { fail(res, 403, 'The output folder can only be opened when the server runs on your own computer. Copy the path or download the files instead.'); return }
    const dir = ensureExported(job)
    if (!existsSync(dir)) { fail(res, 404, 'Output folder no longer exists.'); return }
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open'
    execFile(opener, [dir], err => { if (err && process.platform !== 'win32') console.error('[winPackager] open folder failed:', err.message) })
    await recordJobEvent(job, actorOf(req), 'open-output-folder')
    res.json({ success: true, data: { path: dir } })
  } catch (err) { next(err) }
})

router.get('/jobs/:id/artifacts/:name', requireCapability('winPackager.read'), async (req, res, next) => {
  try {
    const job = loadJob(req, res); if (!job) return
    const name = String(req.params['name'])
    const actor = actorOf(req)
    const send = async (file: string, downloadName: string): Promise<void> => {
      await recordJobEvent(job, actor, 'download', downloadName)
      res.download(file, downloadName)
    }
    if ((ARTIFACT_NAMES as readonly string[]).includes(name)) {
      if (!job.config) { fail(res, 409, 'Configure the package first.'); return }
      const problems = configProblems(job.config, job)
      if (problems.length) { fail(res, 422, 'Configuration is not valid; fix it before generating artifacts.', { problems }); return }
      const content = generateArtifacts(job)[name as ArtifactName]
      await recordJobEvent(job, actor, 'download', name)
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`)
      res.type(name.endsWith('.json') ? 'application/json' : 'text/plain').send(content)
      return
    }
    if (name === 'source') { await send(join(jobDir(job.id), 'source', job.source.storedName), job.source.fileName); return }
    if (name === 'package' && job.output) { await send(join(jobDir(job.id), 'artifacts', job.output.fileName), job.output.fileName); return }
    if ((name === 'sha256.txt' || name === 'package.log') && job.output) { await send(join(jobDir(job.id), 'artifacts', name), name); return }
    fail(res, 404, 'Artifact not available.')
  } catch (err) { next(err) }
})

// ── Delete / cleanup ───────────────────────────────────────────────────────────

/** Delete acts on the OUTPUT folder: a job with a finished package loses its package files there (the uploaded
 *  source and job stay, so it can be packaged again). A job that never produced a package is removed entirely. */
router.delete('/jobs/:id', requireCapability('winPackager.validate'), async (req, res, next) => {
  try {
    const job = loadJob(req, res); if (!job) return
    if (running.has(job.id)) { fail(res, 409, 'A background operation is running for this job.'); return }
    const actor = actorOf(req)
    if (job.output) {
      const { dir, removed } = removeOutput(job)
      rmSync(join(jobDir(job.id), 'artifacts', job.output.fileName), { force: true })
      delete job.output
      delete job.approval
      await recordJobEvent(job, actor, 'delete-output', `${removed} file(s) removed from ${dir}`)
      await setJobState(job, 'review-required', actor, 'Package deleted from the output folder. The uploaded source is kept.')
      res.json({ success: true, data: { jobRemoved: false, job } })
      return
    }
    await recordJobEvent(job, actor, 'delete', `${job.source.fileName} workspace removed`)
    removeJobWorkspace(job.id)
    res.json({ success: true, data: { jobRemoved: true } })
  } catch (err) { next(err) }
})

/** Removes finished jobs older than the retention window (default 14 days). Returns how many were removed. */
export function cleanupOldJobs(retentionDays = Number(process.env['WIN_PACKAGER_RETENTION_DAYS'] ?? 14), now = Date.now()): number {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return 0
  let removed = 0
  for (const job of listJobs()) {
    if (running.has(job.id) || job.state === 'processing') continue
    if (now - Date.parse(job.updatedAt) > retentionDays * 86_400_000) { removeJobWorkspace(job.id); removed++ }
  }
  return removed
}

export default router
