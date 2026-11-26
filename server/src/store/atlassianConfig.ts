// Jira and Confluence connection settings: saved from Settings -> Integrations, else the environment
// (JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY, CONFLUENCE_BASE_URL).
// Kept in its own owner-only file under DATA_DIR and read on every call, so a push takes effect at once.
// Confluence reuses the Jira email and token unless it has its own. Tests ignore the file.

import { chmodSync } from 'node:fs'
import { dataFile, readJsonFile, writeJsonAtomic } from './dataDir.js'

interface Saved {
  jira?: { baseUrl: string; email: string; apiToken: string; projectKey?: string }
  confluence?: { baseUrl?: string; spaceKey?: string; apiToken?: string }
}

const file = (): string => dataFile('atlassian-config.json')
const isTest = (): boolean => process.env['NODE_ENV'] === 'test' || !!process.env['VITEST']
const load = (): Saved => (isTest() ? {} : readJsonFile<Saved>(file()) ?? {})

function save(next: Saved): void {
  writeJsonAtomic(file(), next)
  try { chmodSync(file(), 0o600) } catch { /* not supported on this filesystem */ }
}

export interface JiraConfig { baseUrl: string | undefined; email: string | undefined; apiToken: string | undefined; projectKey: string }
export interface ConfluenceConfig { baseUrl: string | undefined; email: string | undefined; apiToken: string | undefined; spaceKey: string | undefined }

export function getJiraConfig(): JiraConfig {
  const j = load().jira
  return {
    baseUrl: j?.baseUrl || process.env['JIRA_BASE_URL'],
    email: j?.email || process.env['JIRA_EMAIL'],
    apiToken: j?.apiToken || process.env['JIRA_API_TOKEN'],
    projectKey: j?.projectKey || process.env['JIRA_PROJECT_KEY'] || 'ITO',
  }
}

export function getConfluenceConfig(): ConfluenceConfig {
  const c = load().confluence
  const jira = getJiraConfig()
  return {
    baseUrl: c?.baseUrl || process.env['CONFLUENCE_BASE_URL'] || jira.baseUrl,
    email: jira.email,
    apiToken: c?.apiToken || jira.apiToken,
    spaceKey: c?.spaceKey,
  }
}

export function saveJiraConfig(cfg: NonNullable<Saved['jira']>): void { save({ ...load(), jira: cfg }) }
export function saveConfluenceConfig(cfg: NonNullable<Saved['confluence']>): void { save({ ...load(), confluence: cfg }) }
