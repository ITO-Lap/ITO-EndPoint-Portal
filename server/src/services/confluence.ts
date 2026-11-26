// Confluence REST API integration
// Shares credentials with Jira (same Atlassian org). Returns an empty result
// when unconfigured — never substitutes mock articles for real search results.

import { getConfluenceConfig } from '../store/atlassianConfig.js'

// Read on every call, so credentials pushed from Settings -> Integrations apply immediately.
export function isConfluenceConfigured(): boolean {
  const c = getConfluenceConfig()
  return !!(c.baseUrl && c.email && c.apiToken)
}

function authHeaders(): Record<string, string> {
  const c = getConfluenceConfig()
  const creds = Buffer.from(`${c.email}:${c.apiToken}`).toString('base64')
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
  const res = await fetch(`${getConfluenceConfig().baseUrl}/wiki/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=10&expand=body.excerpt,space,history.lastUpdated`, { headers: authHeaders() })
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
