// File-backed job store: one atomic job.json per workspace (same pattern as the other app stores). Every state
// change appends an event, and is mirrored to the application audit log.

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readJsonFile, writeJsonAtomic } from '../../store/dataDir.js'
import { recordAuditLog } from '../auditLog.js'
import { isValidJobId, jobDir, workspaceRoot } from './workspace.js'
import type { PackageJob, PackageJobState } from './types.js'

const jobFile = (id: string): string => join(jobDir(id), 'job.json')

export function saveJob(job: PackageJob): void {
  job.updatedAt = new Date().toISOString()
  writeJsonAtomic(jobFile(job.id), job)
}

export function getJob(id: string): PackageJob | undefined {
  if (!isValidJobId(id)) return undefined
  return readJsonFile<PackageJob>(jobFile(id))
}

export function listJobs(): PackageJob[] {
  const root = workspaceRoot()
  if (!existsSync(root)) return []
  return readdirSync(root)
    .filter(isValidJobId)
    .map(id => getJob(id))
    .filter((j): j is PackageJob => !!j)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function recordJobEvent(job: PackageJob, actor: string, action: string, detail?: string): Promise<void> {
  job.events.push({ at: new Date().toISOString(), actor, action, ...(detail ? { detail } : {}) })
  saveJob(job)
  await recordAuditLog({ userEmail: actor, action: `winPackager.${action}`, resourceType: 'package-job', resourceId: job.id, newValue: detail ? { detail } : undefined })
}

export async function setJobState(job: PackageJob, state: PackageJobState, actor: string, reason?: string): Promise<void> {
  job.state = state
  if (reason) job.stateReason = reason; else delete job.stateReason
  await recordJobEvent(job, actor, 'state', `${state}${reason ? `: ${reason}` : ''}`)
}
