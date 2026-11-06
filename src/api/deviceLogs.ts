// Managed Devices — device log API (/api/devices/:id/logs, /export, /diagnostics).

const SERVER = import.meta.env.VITE_API_URL ?? ''

export type LogCategory = 'Device' | 'Compliance' | 'Policy' | 'Profile' | 'Action' | 'Remote action' | 'App'
export interface DeviceLogEntry { time: string; category: LogCategory; event: string; status: string; detail: string; source: string }
export interface DeviceLogSection { name: string; ok: boolean; count: number; error?: string }
export interface DeviceLog {
  device: { id: string; name: string; platform: string; source: string; user: string; serialNumber: string; osVersion: string }
  generatedAt: string; entries: DeviceLogEntry[]; sections: DeviceLogSection[]
}
export interface DiagnosticsStatus { requestId: string; status: string; requestedAt: string; expiresAt: string; downloadUrl?: string }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SERVER}${path}`, init)
  const body = await res.json().catch(() => null) as { success?: boolean; data?: T; error?: string } | null
  if (!res.ok || !body?.success) throw new Error(body?.error ?? `${path}: ${res.status}`)
  return body.data as T
}

const base = (id: string) => `/api/devices/${encodeURIComponent(id)}`

export const deviceLogsApi = {
  get: (id: string) => request<DeviceLog>(`${base(id)}/logs`),
  requestDiagnostics: (id: string) => request<DiagnosticsStatus>(`${base(id)}/diagnostics`, { method: 'POST' }),
  diagnosticsStatus: (id: string, requestId: string) => request<DiagnosticsStatus>(`${base(id)}/diagnostics/${encodeURIComponent(requestId)}`),
  async download(id: string, format: 'csv' | 'excel'): Promise<void> {
    const res = await fetch(`${SERVER}${base(id)}/logs/export?format=${format}`)
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: string } | null
      throw new Error(body?.error ?? `Export failed (${res.status})`)
    }
    const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? `device-log.${format === 'csv' ? 'csv' : 'xlsx'}`
    const url = URL.createObjectURL(await res.blob())
    const a = Object.assign(document.createElement('a'), { href: url, download: name })
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  },
}
