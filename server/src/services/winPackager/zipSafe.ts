// Safe ZIP handling for uploaded archives. The central directory is validated BEFORE anything is written, and
// extraction re-checks every destination path. Nothing extracted here is ever executed on this server.

import { closeSync, createWriteStream, mkdirSync, openSync, readSync, fstatSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { createInflateRaw } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { Readable, Transform } from 'node:stream'
import { open } from 'node:fs/promises'

export interface ZipEntry {
  name: string
  compressedSize: number
  size: number
  method: number
  localHeaderOffset: number
  isDirectory: boolean
}

export class ZipError extends Error {}

export interface ZipLimits {
  maxEntries: number
  maxTotalBytes: number
  /** Uncompressed:compressed ratio above which an entry looks like a zip bomb. */
  maxRatio: number
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = { maxEntries: 20000, maxTotalBytes: 30 * 1024 ** 3, maxRatio: 200 }

function readAt(fd: number, position: number, length: number): Buffer {
  const buf = Buffer.alloc(length)
  let read = 0
  while (read < length) {
    const n = readSync(fd, buf, read, length - read, position + read)
    if (n === 0) break
    read += n
  }
  return buf.subarray(0, read)
}

/** Lists entries from the central directory. Throws ZipError on anything malformed or unsupported. */
export function listZipEntries(file: string, limits: ZipLimits = DEFAULT_ZIP_LIMITS): ZipEntry[] {
  const fd = openSync(file, 'r')
  try {
    const fileSize = fstatSync(fd).size
    if (fileSize < 22) throw new ZipError('Not a valid ZIP archive.')
    const tailLen = Math.min(fileSize, 22 + 0xffff)
    const tail = readAt(fd, fileSize - tailLen, tailLen)
    let eocd = -1
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
    }
    if (eocd < 0) throw new ZipError('ZIP end-of-central-directory record not found.')
    const total = tail.readUInt16LE(eocd + 10)
    const cdSize = tail.readUInt32LE(eocd + 12)
    const cdOffset = tail.readUInt32LE(eocd + 16)
    if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
      throw new ZipError('ZIP64 archives are not supported. Extract the installer and upload it directly.')
    }
    if (total > limits.maxEntries) throw new ZipError(`Archive has ${total} entries; the limit is ${limits.maxEntries}.`)
    if (cdOffset + cdSize > fileSize) throw new ZipError('ZIP central directory is out of range.')

    const cd = readAt(fd, cdOffset, cdSize)
    const entries: ZipEntry[] = []
    let p = 0
    for (let i = 0; i < total; i++) {
      if (p + 46 > cd.length || cd.readUInt32LE(p) !== 0x02014b50) throw new ZipError('ZIP central directory is corrupt.')
      const flags = cd.readUInt16LE(p + 8)
      const method = cd.readUInt16LE(p + 10)
      const compressedSize = cd.readUInt32LE(p + 20)
      const size = cd.readUInt32LE(p + 24)
      const nameLen = cd.readUInt16LE(p + 28)
      const extraLen = cd.readUInt16LE(p + 30)
      const commentLen = cd.readUInt16LE(p + 32)
      const externalAttrs = cd.readUInt32LE(p + 38)
      const localHeaderOffset = cd.readUInt32LE(p + 42)
      const name = cd.subarray(p + 46, p + 46 + nameLen).toString('utf-8')
      if (flags & 0x1) throw new ZipError(`Encrypted ZIP entries are not supported (${name}).`)
      // Unix mode in the high 16 bits: reject symlinks (0o120000) so an entry can never point outside the workspace.
      const unixMode = externalAttrs >>> 16
      if ((unixMode & 0o170000) === 0o120000) throw new ZipError(`Archive contains a symbolic link (${name}).`)
      entries.push({ name, compressedSize, size, method, localHeaderOffset, isDirectory: name.endsWith('/') })
      p += 46 + nameLen + extraLen + commentLen
    }
    return entries
  } finally {
    closeSync(fd)
  }
}

/** True when `name` is a relative path that cannot climb out of its parent folder. */
export function isSafeEntryName(name: string): boolean {
  if (!name || name.includes('\0')) return false
  if (isAbsolute(name) || name.startsWith('/') || name.startsWith('\\') || /^[A-Za-z]:/.test(name)) return false
  const parts = name.replace(/\\/g, '/').split('/')
  return !parts.some(part => part === '..')
}

/** Validates every entry up front. Returns the list of problems (empty = safe to extract). */
export function validateZipEntries(entries: ZipEntry[], limits: ZipLimits = DEFAULT_ZIP_LIMITS): string[] {
  const problems: string[] = []
  let totalBytes = 0
  const seen = new Set<string>()
  for (const e of entries) {
    if (!isSafeEntryName(e.name)) { problems.push(`Unsafe path in archive: ${e.name}`); continue }
    if (e.method !== 0 && e.method !== 8) problems.push(`Unsupported compression method ${e.method}: ${e.name}`)
    const key = e.name.replace(/\\/g, '/').toLowerCase()
    if (seen.has(key)) problems.push(`Duplicate entry in archive: ${e.name}`)
    seen.add(key)
    totalBytes += e.size
    if (e.compressedSize > 0 && e.size / e.compressedSize > limits.maxRatio && e.size > 10 * 1024 * 1024) {
      problems.push(`Entry compresses suspiciously well (possible zip bomb): ${e.name}`)
    }
  }
  if (totalBytes > limits.maxTotalBytes) problems.push(`Archive expands to ${totalBytes} bytes; the limit is ${limits.maxTotalBytes}.`)
  return problems
}

/** Extracts into `destDir` after validation. Every output path is re-resolved and must stay inside destDir. */
export async function extractZip(file: string, destDir: string, limits: ZipLimits = DEFAULT_ZIP_LIMITS): Promise<string[]> {
  const entries = listZipEntries(file, limits)
  const problems = validateZipEntries(entries, limits)
  if (problems.length) throw new ZipError(problems.slice(0, 5).join(' '))

  const root = resolve(destDir)
  mkdirSync(root, { recursive: true })
  const handle = await open(file, 'r')
  const written: string[] = []
  try {
    for (const e of entries) {
      const target = resolve(root, e.name.replace(/\\/g, '/'))
      if (target !== root && !target.startsWith(root + sep)) throw new ZipError(`Entry escapes the workspace: ${e.name}`)
      if (e.isDirectory) { mkdirSync(target, { recursive: true }); continue }
      mkdirSync(dirname(target), { recursive: true })

      const local = Buffer.alloc(30)
      await handle.read(local, 0, 30, e.localHeaderOffset)
      if (local.readUInt32LE(0) !== 0x04034b50) throw new ZipError(`Corrupt local header: ${e.name}`)
      const dataStart = e.localHeaderOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28)

      const raw = Readable.from((async function* () {
        let remaining = e.compressedSize
        let pos = dataStart
        while (remaining > 0) {
          const chunk = Buffer.alloc(Math.min(remaining, 1024 * 1024))
          const { bytesRead } = await handle.read(chunk, 0, chunk.length, pos)
          if (bytesRead === 0) throw new ZipError(`Archive truncated: ${e.name}`)
          pos += bytesRead; remaining -= bytesRead
          yield chunk.subarray(0, bytesRead)
        }
      })())

      // Enforce the declared size while streaming, so a lying header cannot expand past it.
      let produced = 0
      const limiter = new Transform({
        transform(chunk: Buffer, _enc, cb) {
          produced += chunk.length
          if (produced > e.size) return cb(new ZipError(`Entry exceeds its declared size: ${e.name}`))
          cb(null, chunk)
        },
      })
      const out = createWriteStream(target, { flags: 'wx', mode: 0o600 })
      await (e.method === 8 ? pipeline(raw, createInflateRaw(), limiter, out) : pipeline(raw, limiter, out))
      written.push(join(e.name))
    }
  } finally {
    await handle.close()
  }
  return written
}

/** Reads one small entry (e.g. AppxManifest.xml) fully into memory, with a hard size cap. */
export async function readZipEntry(file: string, name: string, maxBytes = 2 * 1024 * 1024): Promise<Buffer | null> {
  const entries = listZipEntries(file)
  const e = entries.find(x => x.name === name)
  if (!e || e.isDirectory) return null
  if (e.size > maxBytes) throw new ZipError(`${name} is larger than ${maxBytes} bytes.`)
  const handle = await open(file, 'r')
  try {
    const local = Buffer.alloc(30)
    await handle.read(local, 0, 30, e.localHeaderOffset)
    if (local.readUInt32LE(0) !== 0x04034b50) throw new ZipError(`Corrupt local header: ${name}`)
    const dataStart = e.localHeaderOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28)
    const data = Buffer.alloc(e.compressedSize)
    await handle.read(data, 0, data.length, dataStart)
    if (e.method === 0) return data
    const { inflateRawSync } = await import('node:zlib')
    return inflateRawSync(data, { maxOutputLength: maxBytes })
  } finally {
    await handle.close()
  }
}
