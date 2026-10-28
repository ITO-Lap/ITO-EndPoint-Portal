import { dataFile, legacyServerFile, readJsonFile, writeJsonAtomic } from '../store/dataDir.js'

export type PatchRemediationAction = {
  id: string
  type: 'scan' | 'deploy'
  status: 'pending' | 'executed' | 'failed' | 'expired'
  actorEmail: string
  actorRole: string
  createdAt: string
  expiresAt: string
  executedAt?: string
  error?: string
  resourceIds: string[]
  patchIds?: string[]
  deploymentPolicyTemplateId?: string
  deadlineTime?: number
}

const file = dataFile('patch-remediation-actions.json', [legacyServerFile('.patch-remediation-actions.json')])
let actions: PatchRemediationAction[] = load()

function load(): PatchRemediationAction[] {
  return readJsonFile<PatchRemediationAction[]>(file) ?? []
}
function persist() { writeJsonAtomic(file, actions.slice(-250)) }
function expire(action: PatchRemediationAction): PatchRemediationAction {
  if (action.status === 'pending' && new Date(action.expiresAt).getTime() <= Date.now()) action.status = 'expired'
  return action
}

export function createPatchRemediationAction(action: Omit<PatchRemediationAction, 'id' | 'status' | 'createdAt' | 'expiresAt'>): PatchRemediationAction {
  const createdAt = new Date().toISOString()
  const record: PatchRemediationAction = { ...action, id: `patch-action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, status: 'pending', createdAt, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() }
  actions.push(record); persist(); return record
}
export function getPatchRemediationAction(id: string): PatchRemediationAction | undefined {
  const action = actions.find(item => item.id === id)
  if (!action) return undefined
  expire(action); persist(); return action
}
export function completePatchRemediationAction(id: string, status: 'executed' | 'failed', error?: string): PatchRemediationAction | undefined {
  const action = getPatchRemediationAction(id)
  if (!action) return undefined
  action.status = status; action.executedAt = new Date().toISOString()
  if (error) action.error = error
  persist(); return action
}
