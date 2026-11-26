// Windows Package Builder — frontend HTTP client for /api/win-packager/*.
// Mirrors server/src/services/winPackager/types.ts (kept in sync manually). No provider credentials ever reach the
// browser: the Windows worker URL/token live only on the server.

const SERVER = import.meta.env.VITE_API_URL ?? ''
const BASE = `${SERVER}/api/win-packager`

export type PackageJobState = 'processing' | 'review-required' | 'validation-failed' | 'unsupported' | 'api-unavailable' | 'ready'
export type CommandConfidence = 'verified' | 'likely' | 'unknown'
export type Architecture = 'x64' | 'x86' | 'arm64'

export interface SignatureInfo { status: 'unsigned' | 'present-unverified' | 'valid' | 'invalid'; signer?: string; note: string }
export interface DetectionRule { type: 'msi-product-code' | 'appx-package' | 'file-exists' | 'registry-uninstall' | 'custom-script'; value?: string; minVersion?: string; guidance?: string }
export interface ArchiveEntry { name: string; size: number; kind: 'msi' | 'exe' | 'msix' | 'appx' | null }

export interface PackageAnalysis {
  analyzedAt: string; installerFile: string; installerKind: 'msi' | 'exe' | 'msix' | 'appx' | null; tech: string
  appName?: string; publisher?: string; version?: string; architecture?: Architecture
  productCode?: string; upgradeCode?: string; packageIdentity?: string; packageFamilyName?: string; minOsVersion?: string
  signature: SignatureInfo
  commands: { install?: string; uninstall?: string; confidence: CommandConfidence; basis: string }
  detection: DetectionRule
  confidence: number
  warnings: string[]
  archiveEntries?: ArchiveEntry[]
  windowsValidationRequired: true
}

export interface PackageConfig {
  appName: string; publisher: string; version: string; description: string
  installCommand: string; uninstallCommand: string; detection: DetectionRule
  installBehavior: 'system' | 'user'; architecture: Architecture
  setupFile: string; acknowledgedUnverifiedCommands: boolean
}

export interface ValidationStep { name: 'install' | 'detect-after-install' | 'uninstall' | 'detect-after-uninstall'; status: 'pass' | 'fail' | 'skipped'; exitCode?: number; durationMs?: number; rebootIndicated?: boolean; stdout?: string; stderr?: string }
export interface ValidationResult { outcome: 'validated' | 'failed' | 'not-tested'; at: string; workerName?: string; steps: ValidationStep[]; message: string }
export interface PackageOutput { fileName: string; exportDir?: string; sizeBytes: number; sha256: string; createdAt: string; workerName?: string }
export interface JobEvent { at: string; actor: string; action: string; detail?: string }

export interface PackageJob {
  id: string; state: PackageJobState; stateReason?: string; createdAt: string; updatedAt: string; createdBy: string
  source: { fileName: string; storedName: string; type: 'msi' | 'exe' | 'msix' | 'appx' | 'zip'; sizeBytes: number; sha256: string }
  analysis?: PackageAnalysis; config?: PackageConfig
  validation?: ValidationResult; approval?: { by: string; at: string }; output?: PackageOutput
  events: JobEvent[]
}

export interface PackagerStatus {
  limits: { maxUploadBytes: number; maxIntuneBytes: number }
  windowsWorker: { configured: boolean; state: 'api-unavailable' | 'ready'; name?: string; canPackage?: boolean; reason?: string }
  workerLinksConfigured: boolean
}

export interface ArtifactFile { name: string; kind: string; available: boolean }

/** Thrown for non-2xx responses; carries the server's validation `problems` so the UI can list them. */
export class PackagerApiError extends Error {
  status: number
  problems: string[]
  constructor(message: string, status: number, problems: string[] = []) { super(message); this.status = status; this.problems = problems }
}

interface Envelope<T> { success?: boolean; data?: T; error?: string; problems?: string[]; issues?: string[] }

async function call<T>(path: string, init?: RequestInit): Promise<{ data: T; problems: string[] }> {
  const res = await fetch(`${BASE}${path}`, init)
  const body = await res.json().catch(() => null) as Envelope<T> | null
  if (!res.ok || !body?.success) {
    throw new PackagerApiError(body?.error ?? `Request failed (${res.status})`, res.status, body?.problems ?? body?.issues ?? [])
  }
  return { data: body.data as T, problems: body.problems ?? [] }
}

const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export const winPackagerApi = {
  status: async () => (await call<PackagerStatus>('/status')).data,
  jobs: async () => (await call<PackageJob[]>('/jobs')).data,
  job: async (id: string) => (await call<PackageJob>(`/jobs/${id}`)).data,
  upload: async (file: File) =>
    (await call<PackageJob>('/jobs', { method: 'POST', headers: { 'x-file-name': encodeURIComponent(file.name), 'Content-Type': 'application/octet-stream' }, body: file })).data,
  inspect: async (id: string) => (await call<PackageJob>(`/jobs/${id}/inspect`, jsonInit('POST', {}))).data,
  selectInstaller: async (id: string, entry: string) => (await call<PackageJob>(`/jobs/${id}/select-installer`, jsonInit('POST', { entry }))).data,
  saveConfig: async (id: string, patch: Partial<PackageConfig>) => call<PackageJob>(`/jobs/${id}/config`, jsonInit('PUT', patch)),
  validate: async (id: string) => (await call<PackageJob>(`/jobs/${id}/validate`, jsonInit('POST', {}))).data,
  approve: async (id: string, acceptUntested: boolean) => (await call<PackageJob>(`/jobs/${id}/approve`, jsonInit('POST', { acceptUntested }))).data,
  createPackage: async (id: string) => (await call<PackageJob>(`/jobs/${id}/package`, jsonInit('POST', {}))).data,
  artifacts: async (id: string) => (await call<{ files: ArtifactFile[]; output: PackageOutput | null; sourceSha256: string }>(`/jobs/${id}/artifacts`)).data,
  outputFolder: async (id: string) => (await call<{ path: string; fileName: string | null; canOpen: boolean }>(`/jobs/${id}/output-folder`)).data,
  openOutputFolder: async (id: string) => (await call<{ path: string }>(`/jobs/${id}/output-folder/open`, jsonInit('POST', {}))).data,
  remove: async (id: string) => (await call<{ jobRemoved: boolean; job?: PackageJob }>(`/jobs/${id}`, { method: 'DELETE' })).data,

  /** Downloads through fetch so the Bearer session token is attached (a plain link could not carry it). */
  async download(id: string, name: string, fileName: string): Promise<void> {
    const res = await fetch(`${BASE}/jobs/${id}/artifacts/${encodeURIComponent(name)}`)
    if (!res.ok) {
      const body = await res.json().catch(() => null) as Envelope<unknown> | null
      throw new PackagerApiError(body?.error ?? `Download failed (${res.status})`, res.status, body?.problems ?? [])
    }
    const url = URL.createObjectURL(await res.blob())
    const a = Object.assign(document.createElement('a'), { href: url, download: fileName })
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  },
}

export const STATE_LABEL: Record<PackageJobState, string> = {
  processing: 'Processing', 'review-required': 'Review Required', 'validation-failed': 'Validation Failed',
  unsupported: 'Unsupported', 'api-unavailable': 'API Unavailable', ready: 'Ready',
}
