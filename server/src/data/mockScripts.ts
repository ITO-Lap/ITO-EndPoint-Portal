// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScriptParameter {
  name: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'select'
  required: boolean
  defaultValue?: string | undefined
  options?: string[] | undefined
  placeholder?: string | undefined
}

export interface Script {
  id: string
  name: string
  description: string
  os: 'Windows' | 'macOS' | 'Linux' | 'Cross-platform'
  type: 'PowerShell' | 'Bash' | 'Batch' | 'Python'
  content: string
  version: number
  tags: string[]
  createdBy: string
  createdAt: string
  updatedAt: string
  isDestructive: boolean
  requiresApproval: boolean
  minRole: 'Helpdesk' | 'IT Admin' | 'Global Admin'
  parameters: ScriptParameter[]
  timeoutSeconds: number
  useCount: number
}

export interface ScriptExecution {
  id: string
  scriptId: string
  scriptName: string
  scriptVersion: number
  deviceId: string
  deviceName: string
  platform: string
  managementSource: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled' | 'pending_approval'
  exitCode?: number
  stdout?: string
  stderr?: string
  runtimeMs?: number
  startedAt: string
  completedAt?: string
  executedBy: string
  approvedBy?: string
  parameters?: Record<string, string>
}

// ── In-memory stores (start empty — scripts are created via the UI) ───────────

export const MOCK_SCRIPTS: Script[] = []
export const MOCK_EXECUTIONS: ScriptExecution[] = []

export let scriptStore: Script[] = [...MOCK_SCRIPTS]
export let executionStore: ScriptExecution[] = [...MOCK_EXECUTIONS]

// ── Store Functions ───────────────────────────────────────────────────────────

export function getScripts(): Script[] {
  return scriptStore
}

export function getScriptById(id: string): Script | undefined {
  return scriptStore.find(s => s.id === id)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createScript(data: Record<string, any>): Script {
  const now = new Date().toISOString()
  const script: Script = {
    ...(data as Omit<Script, 'id' | 'createdAt' | 'updatedAt' | 'useCount'>),
    id: `script-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
    useCount: 0,
  }
  scriptStore.push(script)
  return script
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function updateScript(id: string, data: Record<string, any>): Script | undefined {
  const idx = scriptStore.findIndex(s => s.id === id)
  if (idx === -1) return undefined
  const updated: Script = {
    ...scriptStore[idx]!,
    ...(data as Partial<Script>),
    id,
    updatedAt: new Date().toISOString(),
  }
  scriptStore[idx] = updated
  return updated
}

export function deleteScript(id: string): boolean {
  const before = scriptStore.length
  scriptStore = scriptStore.filter(s => s.id !== id)
  return scriptStore.length < before
}

export interface ExecutionFilters {
  deviceId?: string | undefined
  scriptId?: string | undefined
  status?: ScriptExecution['status'] | undefined
  limit?: number | undefined
}

export function getExecutions(filters?: ExecutionFilters): ScriptExecution[] {
  let results = executionStore
  if (filters?.deviceId) results = results.filter(e => e.deviceId === filters.deviceId)
  if (filters?.scriptId) results = results.filter(e => e.scriptId === filters.scriptId)
  if (filters?.status)   results = results.filter(e => e.status === filters.status)
  const limit = filters?.limit ?? 100
  return results.slice(-limit).reverse()
}

export function getExecutionById(id: string): ScriptExecution | undefined {
  return executionStore.find(e => e.id === id)
}

export function createExecution(data: Omit<ScriptExecution, 'id'>): ScriptExecution {
  const execution: ScriptExecution = {
    ...data,
    id: `exec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  }
  executionStore.push(execution)
  return execution
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function updateExecution(id: string, data: Record<string, any>): ScriptExecution | undefined {
  const idx = executionStore.findIndex(e => e.id === id)
  if (idx === -1) return undefined
  const updated: ScriptExecution = { ...executionStore[idx]!, ...(data as Partial<ScriptExecution>), id }
  executionStore[idx] = updated
  return updated
}
