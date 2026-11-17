// Streams an uploaded installer to disk inside the job workspace, hashing as it goes and enforcing the size limit
// mid-stream (a client cannot bypass it by lying about Content-Length). Nothing here ever executes the file.

import { createHash } from 'node:crypto'
import { createWriteStream, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import type { PackageSourceType } from './types.js'
import { magicMatches } from './workspace.js'

export class UploadError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export interface StoredUpload { sizeBytes: number; sha256: string }

export function storeUpload(
  req: Readable,
  dir: string,
  storedName: string,
  type: PackageSourceType,
  maxBytes: number,
): Promise<StoredUpload> {
  const target = join(dir, 'source', storedName)
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const out = createWriteStream(target, { flags: 'wx', mode: 0o600 })
    let size = 0
    let head = Buffer.alloc(0)
    let failed = false

    const fail = (err: UploadError | Error): void => {
      if (failed) return
      failed = true
      req.unpipe(out)
      out.destroy()
      rmSync(target, { force: true })
      reject(err)
      req.resume()
    }

    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBytes) return fail(new UploadError(413, `File exceeds the configured upload limit of ${maxBytes} bytes.`))
      if (head.length < 16) head = Buffer.concat([head, chunk]).subarray(0, 16)
      hash.update(chunk)
    })
    req.on('error', fail)
    req.on('aborted', () => fail(new UploadError(400, 'Upload aborted.')))
    out.on('error', fail)
    out.on('finish', () => {
      if (failed) return
      if (size === 0) return fail(new UploadError(400, 'Uploaded file is empty.'))
      if (!magicMatches(type, head)) return fail(new UploadError(415, `File content does not look like a .${type} file.`))
      resolve({ sizeBytes: size, sha256: hash.digest('hex') })
    })
    req.pipe(out)
  })
}
