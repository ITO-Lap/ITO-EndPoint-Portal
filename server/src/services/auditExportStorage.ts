// Private Azure Blob Storage for completed Intune audit exports.
//
// Auth preference order: Managed Identity (INTUNE_AUDIT_STORAGE_ACCOUNT_URL +
// DefaultAzureCredential) > connection string (INTUNE_AUDIT_STORAGE_CONNECTION_STRING,
// for non-Azure hosting) > local-disk fallback (dev only, disabled when
// NODE_ENV=production — mirrors the rest of this app's "runs on mock data
// with no credentials" convention, but only outside production).
//
// The container is created private (no public access) if missing. Downloads
// never return a permanent blob URL — see getExportDownloadUrl(), which
// mints a short-lived user-delegation SAS (Managed Identity) or a
// service-level SAS (connection-string mode) scoped to that one blob.

import { createHash } from 'crypto'
import { mkdir, writeFile, readFile, stat } from 'fs/promises'
import { dirname, join } from 'path'
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  SASProtocol,
} from '@azure/storage-blob'
import { DefaultAzureCredential } from '@azure/identity'

export interface StoredArtifact {
  blobPath: string
  contentType: string
  sizeBytes: number
  sha256: string
}

export class AuditStorageError extends Error {}

function isProd(): boolean {
  return process.env.NODE_ENV === 'production'
}

function container(): string {
  return process.env.INTUNE_AUDIT_STORAGE_CONTAINER ?? 'intune-audit-exports'
}

let cachedClient: BlobServiceClient | null | undefined

function getBlobServiceClient(): BlobServiceClient | null {
  if (cachedClient !== undefined) return cachedClient

  const accountUrl = process.env.INTUNE_AUDIT_STORAGE_ACCOUNT_URL
  const connectionString = process.env.INTUNE_AUDIT_STORAGE_CONNECTION_STRING

  if (accountUrl) {
    cachedClient = new BlobServiceClient(accountUrl, new DefaultAzureCredential())
  } else if (connectionString) {
    cachedClient = BlobServiceClient.fromConnectionString(connectionString)
  } else {
    cachedClient = null
  }
  return cachedClient
}

function localFallbackDir(): string | null {
  if (isProd()) return null
  return process.env.INTUNE_AUDIT_LOCAL_STORAGE_DIR ?? './.intune-audit-exports-dev'
}

export function isAzureBlobConfigured(): boolean {
  return getBlobServiceClient() !== null
}

async function ensureContainer(): Promise<ReturnType<BlobServiceClient['getContainerClient']>> {
  const client = getBlobServiceClient()
  if (!client) throw new AuditStorageError('Azure Blob Storage is not configured')
  const containerClient = client.getContainerClient(container())
  // Private container — no `access` option means no anonymous read at any level.
  await containerClient.createIfNotExists()
  return containerClient
}

/** Uploads a locally-buffered/streamed file to blob storage (or the local-disk
 *  dev fallback) at the tenant/date/job path convention, idempotently: a
 *  retry with the same blobPath overwrites rather than duplicating. */
export async function uploadExportArtifact(
  blobPath: string,
  content: Buffer,
  contentType: string,
  metadata: Record<string, string>
): Promise<StoredArtifact> {
  const sha256 = createHash('sha256').update(content).digest('hex')

  if (isAzureBlobConfigured()) {
    const containerClient = await ensureContainer()
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath)
    await blockBlobClient.uploadData(content, {
      blobHTTPHeaders: { blobContentType: contentType },
      metadata: { ...metadata, sha256 },
    })
    return { blobPath, contentType, sizeBytes: content.byteLength, sha256 }
  }

  const localDir = localFallbackDir()
  if (!localDir) {
    throw new AuditStorageError(
      'Azure Blob Storage is not configured and the local-disk dev fallback is disabled in production. ' +
      'Set INTUNE_AUDIT_STORAGE_ACCOUNT_URL or INTUNE_AUDIT_STORAGE_CONNECTION_STRING.'
    )
  }
  console.warn('[auditExportStorage] Azure Blob Storage not configured — writing to local dev fallback directory. Do not use in production.')
  const fullPath = join(localDir, blobPath)
  await mkdir(dirname(fullPath), { recursive: true })
  await writeFile(fullPath, content)
  return { blobPath, contentType, sizeBytes: content.byteLength, sha256 }
}

export async function downloadExportArtifact(blobPath: string): Promise<Buffer> {
  if (isAzureBlobConfigured()) {
    const containerClient = await ensureContainer()
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath)
    const buf = await blockBlobClient.downloadToBuffer()
    return buf
  }
  const localDir = localFallbackDir()
  if (!localDir) throw new AuditStorageError('Azure Blob Storage is not configured')
  return readFile(join(localDir, blobPath))
}

export async function artifactExists(blobPath: string): Promise<boolean> {
  if (isAzureBlobConfigured()) {
    const containerClient = await ensureContainer()
    return containerClient.getBlockBlobClient(blobPath).exists()
  }
  const localDir = localFallbackDir()
  if (!localDir) return false
  try {
    await stat(join(localDir, blobPath))
    return true
  } catch {
    return false
  }
}

/** Mints a short-lived, scoped-to-one-blob download URL. Never returns a
 *  permanent/public blob URL. `ttlMinutes` is caller-configurable but capped
 *  server-side so a compromised link can't stay valid indefinitely. */
export async function getExportDownloadUrl(blobPath: string, ttlMinutes: number): Promise<string> {
  const cappedTtl = Math.min(Math.max(1, ttlMinutes), 24 * 60)
  const client = getBlobServiceClient()

  if (!client) {
    const localDir = localFallbackDir()
    if (!localDir) throw new AuditStorageError('Azure Blob Storage is not configured')
    // Dev fallback: served by the app's own authenticated download route,
    // which re-validates the requester on every call — no static file server
    // is exposed, so there is no equivalent of a real SAS to mint here.
    return `local-dev-fallback:${blobPath}`
  }

  const containerClient = client.getContainerClient(container())
  const blobClient = containerClient.getBlockBlobClient(blobPath)
  const expiresOn = new Date(Date.now() + cappedTtl * 60_000)

  if (client.credential instanceof StorageSharedKeyCredential) {
    const sas = generateBlobSASQueryParameters(
      {
        containerName: container(),
        blobName: blobPath,
        permissions: BlobSASPermissions.parse('r'),
        protocol: SASProtocol.Https,
        expiresOn,
      },
      client.credential
    ).toString()
    return `${blobClient.url}?${sas}`
  }

  // Managed Identity path: user-delegation SAS, scoped to the same window.
  const startsOn = new Date(Date.now() - 5 * 60_000)
  const userDelegationKey = await client.getUserDelegationKey(startsOn, expiresOn)
  const sas = generateBlobSASQueryParameters(
    {
      containerName: container(),
      blobName: blobPath,
      permissions: BlobSASPermissions.parse('r'),
      protocol: SASProtocol.Https,
      startsOn,
      expiresOn,
    },
    userDelegationKey,
    client.accountName
  ).toString()
  return `${blobClient.url}?${sas}`
}

export function buildExportBlobPath(tenantId: string, createdAtUtc: Date, exportRequestId: string, filename: string): string {
  const y = createdAtUtc.getUTCFullYear()
  const m = String(createdAtUtc.getUTCMonth() + 1).padStart(2, '0')
  const d = String(createdAtUtc.getUTCDate()).padStart(2, '0')
  const safeTenant = encodeURIComponent(tenantId)
  const safeId = encodeURIComponent(exportRequestId)
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `${safeTenant}/${y}/${m}/${d}/${safeId}/${safeFilename}`
}

/** Test-only: clear the cached BlobServiceClient so env changes take effect. */
export function __resetStorageClientForTests(): void {
  cachedClient = undefined
}
