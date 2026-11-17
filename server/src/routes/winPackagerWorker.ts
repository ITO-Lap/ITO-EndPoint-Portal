// Endpoints the Windows worker calls with short-lived HMAC links (no user session): pull the source folder as a
// zip, push the finished .intunewin. Each link is bound to one job and one purpose and expires in 30 minutes.
// The server chooses every file name; the worker only supplies bytes.

import { Router } from 'express'
import { createWriteStream, existsSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { ZipArchive } from 'archiver'
import { getJob } from '../services/winPackager/jobStore.js'
import { jobDir, packageSourceDir, packagerLimits } from '../services/winPackager/workspace.js'
import { outputFileName } from '../services/winPackager/config.js'
import { verifyLink } from '../services/winPackager/signing.js'
import { workerConfig } from '../services/winPackager/worker.js'
import { installScript, uninstallScript } from '../services/winPackager/artifacts.js'

const router = Router()

function authorize(req: import('express').Request, purpose: 'source' | 'output') {
  const cfg = workerConfig()
  const jobId = String(req.params['jobId'])
  if (!cfg || !verifyLink(cfg.token, jobId, purpose, req.query['exp'], req.query['sig'])) return null
  return getJob(jobId) ?? null
}

router.get('/:jobId/source', (req, res) => {
  const job = authorize(req, 'source')
  if (!job) { res.status(403).json({ success: false, error: 'Link is invalid or expired.' }); return }
  const dir = packageSourceDir(job.id, job.source.type)
  if (!existsSync(dir)) { res.status(404).json({ success: false, error: 'Source not found.' }); return }
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="${job.id}.zip"`)
  const zip = new ZipArchive({ zlib: { level: 1 } })
  zip.on('error', () => res.destroy())
  zip.pipe(res)
  zip.directory(dir, false)
  // MSIX/AppX commands call the generated wrapper scripts, so they must be in the folder that gets validated and packaged.
  if (job.config && /\.(msix|appx)$/i.test(job.config.setupFile)) {
    zip.append(installScript(job.config), { name: 'install.ps1' })
    zip.append(uninstallScript(job.config), { name: 'uninstall.ps1' })
  }
  void zip.finalize()
})

router.put('/:jobId/output', (req, res) => {
  const job = authorize(req, 'output')
  if (!job || !job.config) { res.status(403).json({ success: false, error: 'Link is invalid or expired.' }); return }
  const max = packagerLimits().maxIntuneBytes
  const target = join(jobDir(job.id), 'artifacts', outputFileName(job.config))
  const part = `${target}.part`
  const out = createWriteStream(part, { flags: 'w', mode: 0o600 })
  let size = 0
  let head = Buffer.alloc(0)
  let aborted = false
  const abort = (status: number, error: string): void => {
    if (aborted) return
    aborted = true
    req.unpipe(out); out.destroy(); rmSync(part, { force: true })
    res.status(status).json({ success: false, error }); req.resume()
  }
  req.on('data', (chunk: Buffer) => {
    size += chunk.length
    if (head.length < 4) head = Buffer.concat([head, chunk]).subarray(0, 4)
    if (size > max) abort(413, 'Package exceeds the 30 GB Intune limit.')
  })
  req.on('error', () => abort(400, 'Upload failed.'))
  out.on('error', () => abort(500, 'Could not store the package.'))
  out.on('finish', () => {
    if (aborted) return
    // A .intunewin is a zip container; reject anything else so a bad worker cannot plant arbitrary bytes.
    if (size === 0 || !head.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) { rmSync(part, { force: true }); res.status(415).json({ success: false, error: 'Not a .intunewin package.' }); return }
    renameSync(part, target)
    res.json({ success: true, data: { sizeBytes: size } })
  })
  req.pipe(out)
})

export default router
