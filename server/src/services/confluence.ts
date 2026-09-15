// Confluence REST API integration
// Shares credentials with Jira (same Atlassian org). Returns an empty result
// when unconfigured — never substitutes mock articles for real search results.

const BASE_URL  = process.env.CONFLUENCE_BASE_URL ?? process.env.JIRA_BASE_URL
const EMAIL     = process.env.JIRA_EMAIL
const API_TOKEN = process.env.JIRA_API_TOKEN

export function isConfluenceConfigured(): boolean {
  return !!(BASE_URL && EMAIL && API_TOKEN)
}

function authHeaders(): Record<string, string> {
  const creds = Buffer.from(`${EMAIL}:${API_TOKEN}`).toString('base64')
  return { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json', Accept: 'application/json' }
}

export interface ConfluencePage {
  id:           string
  title:        string
  space:        string
  url:          string
  excerpt:      string
  lastModified: string
}

export async function searchConfluencePages(query: string): Promise<ConfluencePage[]> {
  if (!isConfluenceConfigured()) return []

  const cql = `type = page AND text ~ "${query}" ORDER BY lastmodified DESC`
  const res = await fetch(`${BASE_URL}/wiki/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=10&expand=body.excerpt,space,history.lastUpdated`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Confluence search error: ${res.status}`)

  const data = await res.json() as {
    results: Array<{ id: string; title: string; space: { key: string }; _links: { webui: string; base: string }; body?: { excerpt?: { value: string } }; history?: { lastUpdated?: { when: string } } }>
  }

  return data.results.map(p => ({
    id:           p.id,
    title:        p.title,
    space:        p.space.key,
    url:          `${p._links.base}${p._links.webui}`,
    excerpt:      p.body?.excerpt?.value ?? '',
    lastModified: p.history?.lastUpdated?.when ?? '',
  }))
}
