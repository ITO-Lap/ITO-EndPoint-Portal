// Jira REST API v3 integration
// Falls back to mock data when JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN are not set

const JIRA_BASE_URL   = process.env.JIRA_BASE_URL
const JIRA_EMAIL      = process.env.JIRA_EMAIL
const JIRA_API_TOKEN  = process.env.JIRA_API_TOKEN
const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY ?? 'ITO'

export function isJiraConfigured(): boolean {
  return !!(JIRA_BASE_URL && JIRA_EMAIL && JIRA_API_TOKEN)
}

function authHeaders(): Record<string, string> {
  const creds = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64')
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

const MOCK_ISSUES: JiraIssue[] = [
  { id: 'mock-1', key: 'ITO-2341', summary: 'BitLocker compliance failure – DEVICE-003', status: 'In Progress', priority: 'High',   issueType: 'Incident', url: '#', created: '2026-05-01' },
  { id: 'mock-2', key: 'ITO-2318', summary: 'FileVault not enabled on macOS fleet',       status: 'Open',       priority: 'Medium', issueType: 'Task',     url: '#', created: '2026-04-28' },
  { id: 'mock-3', key: 'SEC-445',  summary: 'AV agent missing on 3 endpoints',            status: 'Open',       priority: 'High',   issueType: 'Incident', url: '#', created: '2026-04-20' },
]

export async function createJiraIssue(input: JiraIssueInput): Promise<JiraIssue> {
  if (!isJiraConfigured()) {
    const key = `${JIRA_PROJECT_KEY}-${Math.floor(Math.random() * 9000 + 1000)}`
    return { id: `mock-${Date.now()}`, key, summary: input.summary, status: 'Open', priority: input.priority, issueType: input.issueType, url: `https://your-org.atlassian.net/browse/${key}`, created: new Date().toISOString() }
  }

  const projectKey = input.projectKey ?? JIRA_PROJECT_KEY
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

  const res = await fetch(`${JIRA_BASE_URL}/rest/api/3/issue`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`Jira API error ${res.status}: ${await res.text()}`)

  const data = await res.json() as { id: string; key: string }
  return { id: data.id, key: data.key, summary: input.summary, status: 'Open', priority: input.priority, issueType: input.issueType, url: `${JIRA_BASE_URL}/browse/${data.key}`, created: new Date().toISOString() }
}

export async function searchJiraIssues(query: string): Promise<JiraIssue[]> {
  if (!isJiraConfigured()) {
    const q = query.toLowerCase()
    return q ? MOCK_ISSUES.filter(i => i.summary.toLowerCase().includes(q) || i.key.toLowerCase().includes(q)) : MOCK_ISSUES
  }

  const jql = `project = ${JIRA_PROJECT_KEY} AND text ~ "${query}" ORDER BY created DESC`
  const res = await fetch(`${JIRA_BASE_URL}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=10`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Jira search error: ${res.status}`)

  const data = await res.json() as { issues: Array<{ id: string; key: string; fields: { summary: string; status: { name: string }; priority: { name: string }; issuetype: { name: string }; created: string } }> }
  return data.issues.map(i => ({ id: i.id, key: i.key, summary: i.fields.summary, status: i.fields.status.name, priority: i.fields.priority.name, issueType: i.fields.issuetype.name, url: `${JIRA_BASE_URL}/browse/${i.key}`, created: i.fields.created }))
}
