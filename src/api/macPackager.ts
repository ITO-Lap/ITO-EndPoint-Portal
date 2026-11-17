// Mac Package Builder page — frontend client for /api/mac-packager/* (read-only).
const SERVER = import.meta.env.VITE_API_URL ?? ''
const BASE = `${SERVER}/api/mac-packager`

export interface MacBuild { name: string; sizeBytes: number; modifiedAt: string; sha256: string; kind: 'dmg' | 'pkg' | 'zip' }
export interface MacPackagerInfo {
  source: { bundled: boolean; mirroredFrom?: string; originalCommit?: string; syncedAt?: string }
  downloads: { configured: boolean; builds: MacBuild[] }
  features: Array<{ title: string; detail: string }>
  requirements: string[]
  buildSteps: Array<{ label: string; command: string }>
  runsOn: string
}

interface Envelope<T> { success?: boolean; data?: T; error?: string }

export const macPackagerApi = {
  async info(): Promise<MacPackagerInfo> {
    const res = await fetch(`${BASE}/info`)
    const body = await res.json().catch(() => null) as Envelope<MacPackagerInfo> | null
    if (!res.ok || !body?.success || !body.data) throw new Error(body?.error ?? `Request failed (${res.status})`)
    return body.data
  },

  /** Downloads through fetch so the signed-in session is attached (a plain link could not carry it). */
  async download(name: string): Promise<void> {
    const res = await fetch(`${BASE}/download/${encodeURIComponent(name)}`)
    if (!res.ok) {
      const body = await res.json().catch(() => null) as Envelope<unknown> | null
      throw new Error(body?.error ?? `Download failed (${res.status})`)
    }
    const url = URL.createObjectURL(await res.blob())
    const a = Object.assign(document.createElement('a'), { href: url, download: name })
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  },
}
