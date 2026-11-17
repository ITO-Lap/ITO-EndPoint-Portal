// Client for the Windows worker. The worker is a separate, locked-down Windows host: it is the ONLY place an
// uploaded installer is ever executed and the only place IntuneWinAppUtil.exe runs. This server never runs either.
//
// Configuration (server-side only; none of it is ever returned to the browser):
//   WIN_PACKAGER_WORKER_URL    https://host:port  (HTTPS required)
//   WIN_PACKAGER_WORKER_TOKEN  bearer token the worker validates
//
// Worker contract (all JSON, bearer auth). The worker MUST re-validate every field — see docs/win-packager-worker.md:
//   GET  /health                      -> { agentName, intuneWinAppUtilAvailable: boolean }  (WindowsBuildAgent)
//   POST /validate  {jobId, setupFile, installCommand, uninstallCommand, detectionScript, source:{sha256,sizeBytes}}
//        (source bytes are fetched by the worker from the short-lived signed `sourceUrl`, a zip of the source folder)
//                                     -> { steps: ValidationStep[] }
//   POST /package   {jobId, setupFile, outputName, sourceUrl, uploadUrl}
//        (worker PUTs the .intunewin to the signed `uploadUrl`)   -> { fileName, sizeBytes, sha256 }
// There is intentionally no endpoint that runs an arbitrary command.

import type { ValidationStep } from './types.js'

export type WorkerState = 'api-unavailable' | 'ready'

export interface WorkerStatus {
  configured: boolean
  state: WorkerState
  name?: string
  canPackage?: boolean
  reason?: string
}

export interface WorkerConfig { url: string; token: string }

export function workerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig | null {
  const url = env['WIN_PACKAGER_WORKER_URL']?.trim()
  const token = env['WIN_PACKAGER_WORKER_TOKEN']?.trim()
  if (!url || !token) return null
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return null
    return { url: u.origin, token }
  } catch { return null }
}

export class WorkerError extends Error {
  constructor(message: string, public readonly unavailable = false) { super(message) }
}

export interface ValidateRequest {
  jobId: string
  setupFile: string
  installCommand: string
  uninstallCommand: string
  detectionScript: string
  source: { sha256: string; sizeBytes: number }
  sourceUrl: string
}
export interface PackageRequest { jobId: string; setupFile: string; outputName: string; sourceUrl: string; uploadUrl: string }
export interface PackageResponse { fileName: string; sizeBytes: number; sha256: string; workerName?: string }

type Fetch = typeof fetch

export function createWorkerClient(cfg: WorkerConfig | null, fetchImpl: Fetch = fetch) {
  async function call<T>(path: string, init: { method: 'GET' | 'POST'; body?: unknown }, timeoutMs: number): Promise<T> {
    if (!cfg) throw new WorkerError('Windows worker is not configured.', true)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetchImpl(`${cfg.url}${path}`, {
        method: init.method,
        headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
        signal: ctrl.signal,
      })
      if (!res.ok) {
        // Never echo the worker's body or headers to callers: they could contain paths or tokens.
        throw new WorkerError(`Windows worker returned HTTP ${res.status}.`, res.status >= 500 || res.status === 401 || res.status === 403)
      }
      return await res.json() as T
    } catch (err) {
      if (err instanceof WorkerError) throw err
      throw new WorkerError('Windows worker is unreachable.', true)
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    configured: cfg !== null,
    async status(): Promise<WorkerStatus> {
      if (!cfg) return { configured: false, state: 'api-unavailable', reason: 'No Windows worker is configured.' }
      try {
        // The WindowsBuildAgent reports agentName / intuneWinAppUtilAvailable; the shorter names are accepted too.
        const h = await call<{ agentName?: string; name?: string; intuneWinAppUtilAvailable?: boolean; intuneWinAppUtil?: boolean }>('/health', { method: 'GET' }, 5000)
        const name = h.agentName ?? h.name
        return { configured: true, state: 'ready', ...(name ? { name } : {}), canPackage: (h.intuneWinAppUtilAvailable ?? h.intuneWinAppUtil) === true }
      } catch (err) {
        return { configured: true, state: 'api-unavailable', reason: err instanceof Error ? err.message : 'Windows worker unavailable.' }
      }
    },
    async validate(req: ValidateRequest): Promise<{ steps: ValidationStep[]; workerName?: string }> {
      return call('/validate', { method: 'POST', body: req }, 45 * 60 * 1000)
    },
    async createPackage(req: PackageRequest): Promise<PackageResponse> {
      return call('/package', { method: 'POST', body: req }, 30 * 60 * 1000)
    },
  }
}

export type WorkerClient = ReturnType<typeof createWorkerClient>

/** "validated" requires all four steps to pass, in order. Anything else is a failure — never a fake success. */
export function evaluateSteps(steps: ValidationStep[]): { outcome: 'validated' | 'failed'; message: string } {
  const order: ValidationStep['name'][] = ['install', 'detect-after-install', 'uninstall', 'detect-after-uninstall']
  for (const name of order) {
    const s = steps.find(x => x.name === name)
    if (!s) return { outcome: 'failed', message: `Worker did not report the "${name}" step.` }
    if (s.status !== 'pass') return { outcome: 'failed', message: `Step "${name}" ${s.status === 'fail' ? 'failed' : 'was skipped'}${s.exitCode !== undefined ? ` (exit code ${s.exitCode})` : ''}.` }
  }
  return { outcome: 'validated', message: 'Install, detection and uninstall all passed on the Windows worker.' }
}
