// Ocean knowledge base — frontend HTTP client (document viewer + administrator management).
// Contract: server/src/routes/ocean.ts. Never carries credentials; the server redacts documents before storing them.

const BASE_URL = import.meta.env.VITE_API_URL ?? ''
const BASE = `${BASE_URL}/api/ocean`

export type AccessClass = 'general' | 'admin'

export interface OceanDocSummary {
  id: string; source: 'repo' | 'uploaded'; path: string; title: string; enabled: boolean; classification: AccessClass
  status: 'indexed' | 'excluded' | 'error'; statusReason: string | null; bytes: number; sections: number
  lastIndexedAt: string | null; fileModifiedAt: string | null; addedBy: string | null; updatedBy: string | null
}
export interface OceanDocSection { id: string; idx: number; heading: string; text: string }
export interface OceanDocView extends OceanDocSummary { chunks: OceanDocSection[] }

export interface OceanStatus {
  documents: { total: number; enabled: number; disabled: number; excluded: number; errors: number; adminOnly: number }
  sections: number
  lastIndexedAt: string | null
  indexing: boolean
  repoDocsFolderFound: boolean
  provider: { aiConfigured: boolean }
  search: { mode: 'local'; description: string }
  web: { fallbackEnabled: boolean; provider: string; ready: boolean; reason?: string }
  usage: { queries: number; documentationAnswers: number; noDocumentation: number; webFallbacks: number; blockedRequests: number; rateLimited: number; errors: number; avgRetrievalMs: number; since: string }
}
export interface OceanGap { question: string; count: number; lastAt: string; page: string | null }
export interface OceanSettings { webFallback: boolean; webProvider: { name: string; ready: boolean; reason?: string } }
export interface OceanEvent { at: string; type: string; actor: string; role: string; detail: string }
export interface OceanReindexReport { scanned: number; indexed: number; unchanged: number; excluded: number; errors: number; removed: number; durationMs: number; repoDocsFound: boolean }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const body = await res.json().catch(() => null) as { success?: boolean; data?: T; error?: string } | null
  if (!res.ok || !body?.success) throw new Error(body?.error ?? `Request failed (${res.status})`)
  return body.data as T
}

export const oceanApi = {
  viewDoc: (id: string) => call<OceanDocView>(`/docs/${encodeURIComponent(id)}`),
  listDocs: () => call<OceanDocSummary[]>('/admin/documents'),
  status: () => call<OceanStatus>('/admin/status'),
  events: () => call<OceanEvent[]>('/admin/events'),
  settings: () => call<OceanSettings>('/admin/settings'),
  setWebFallback: (webFallback: boolean) => call<{ webFallback: boolean }>('/admin/settings', { method: 'PUT', body: JSON.stringify({ webFallback }) }),
  gaps: () => call<OceanGap[]>('/admin/gaps'),
  clearGaps: () => call<undefined>('/admin/gaps', { method: 'DELETE' }),
  reindexAll: (force = false) => call<OceanReindexReport>(`/admin/reindex${force ? '?force=1' : ''}`, { method: 'POST' }),
  reindexDoc: (id: string) => call<OceanDocSummary>(`/admin/documents/${encodeURIComponent(id)}/reindex`, { method: 'POST' }),
  patchDoc: (id: string, patch: { enabled?: boolean; classification?: AccessClass }) => call<OceanDocSummary>(`/admin/documents/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteDoc: (id: string) => call<undefined>(`/admin/documents/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  upload: (input: { filename: string; content: string; title?: string; classification?: AccessClass }) => call<OceanDocSummary>('/admin/documents', { method: 'POST', body: JSON.stringify(input) }),
}
