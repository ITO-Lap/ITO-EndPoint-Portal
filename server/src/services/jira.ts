// Jira REST API v3 integration
// Needs a Jira URL, email and API token (Settings -> Integrations, or JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN)

import { getJiraConfig } from '../store/atlassianConfig.js'

// Read on every call (not once at start-up), so credentials pushed from Settings -> Integrations apply immediately.
export function isJiraConfigured(): boolean {
  const c = getJiraConfig()
  return !!(c.baseUrl && c.email && c.apiToken)
}

function authHeaders(): Record<string, string> {
  const c = getJiraConfig()
  const creds = Buffer.from(`${c.email}:${c.apiToken}`).toString('base64')
  return { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json', Accept: 'application/json' }
}

export interface JiraIssueInput {
  summary:    string
  description: string
  issueType:  'Incident' | 'Task' | 'Bug' | 'Story'
  priority:   'Critical' | 'High' | 'Medium' | 'Low'
  projectKey?: string
  labels?:    string[]
}

export interface JiraIssue {
  id:        string
  key:       string
  summary:   string
  status:    string
  priority:  string
  issueType: string
  url:       string
  created:   string
}

export async function createJiraIssue(input: JiraIssueInput): Promise<JiraIssue> {
  if (!isJiraConfigured()) throw new Error('Jira is not configured — add JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in Settings → Integrations')

  const projectKey = input.projectKey ?? getJiraConfig().projectKey
  const body = {
    fields: {
      project:     { key: projectKey },
      summary:     input.summary,
      description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: input.description }] }] },
      issuetype:   { name: input.issueType },
      priority:    { name: input.priority },
      labels:      input.labels ?? ['endpoint-compliance', 'ai-generated'],
    },
  }

  const res = await fetch(`${getJiraConfig().baseUrl}/rest/api/3/issue`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`Jira API error ${res.status}: ${await res.text()}`)

  const data = await res.json() as { id: string; key: string }
  return { id: data.id, key: data.key, summary: input.summary, status: 'Open', priority: input.priority, issueType: input.issueType, url: `${getJiraConfig().baseUrl}/browse/${data.key}`, created: new Date().toISOString() }
}

export async function searchJiraIssues(query: string): Promise<JiraIssue[]> {
  if (!isJiraConfigured()) return []

  const jql = `project = ${getJiraConfig().projectKey} AND text ~ "${query}" ORDER BY created DESC`
  const res = await fetch(`${getJiraConfig().baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=10`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Jira search error: ${res.status}`)

  const data = await res.json() as { issues: Array<{ id: string; key: string; fields: { summary: string; status: { name: string }; priority: { name: string }; issuetype: { name: string }; created: string } }> }
  return data.issues.map(i => ({ id: i.id, key: i.key, summary: i.fields.summary, status: i.fields.status.name, priority: i.fields.priority.name, issueType: i.fields.issuetype.name, url: `${getJiraConfig().baseUrl}/browse/${i.key}`, created: i.fields.created }))
}

