// Confluence REST API integration
// Shares credentials with Jira (same Atlassian org) — falls back to mock data when unconfigured

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

const MOCK_ARTICLES: ConfluencePage[] = [
  { id: '1', title: 'FileVault Setup Guide for macOS',            space: 'IT',  url: '#', excerpt: 'Step-by-step guide to enable FileVault encryption on managed macOS devices using ManageEngine.', lastModified: '2026-04-01' },
  { id: '2', title: 'BitLocker Deployment via Intune',            space: 'IT',  url: '#', excerpt: 'How to enforce BitLocker encryption on Windows devices using Microsoft Intune compliance policies.', lastModified: '2026-03-20' },
  { id: '3', title: 'Endpoint Compliance Remediation Playbook',   space: 'SEC', url: '#', excerpt: 'Comprehensive guide for IT teams to remediate common compliance issues across managed endpoints.', lastModified: '2026-04-15' },
  { id: '4', title: 'macOS Security Hardening Checklist',         space: 'SEC', url: '#', excerpt: 'Security hardening steps for corporate macOS devices: firewall, SIP, Gatekeeper, and XProtect.', lastModified: '2026-03-10' },
  { id: '5', title: 'OS Update Management Best Practices',        space: 'IT',  url: '#', excerpt: 'Guidance on enforcing and monitoring OS updates across Windows and macOS device fleets.', lastModified: '2026-04-22' },
  { id: '6', title: 'Device Check-In Troubleshooting',            space: 'IT',  url: '#', excerpt: 'Diagnosing and resolving devices that fail to check in with MDM after enrollment.', lastModified: '2026-02-28' },
  { id: '7', title: 'Antivirus Deployment and Verification',      space: 'SEC', url: '#', excerpt: 'Deploying, verifying, and remediating missing AV agents across Intune and ManageEngine managed devices.', lastModified: '2026-04-10' },
  { id: '8', title: 'Compliance Policy Configuration Reference',   space: 'IT',  url: '#', excerpt: 'Reference guide for configuring compliance policies in Intune and ManageEngine.', lastModified: '2026-03-30' },
]

export async function searchConfluencePages(query: string): Promise<ConfluencePage[]> {
  if (!isConfluenceConfigured()) {
    const q = query.toLowerCase()
    return q
      ? MOCK_ARTICLES.filter(a => a.title.toLowerCase().includes(q) || a.excerpt.toLowerCase().includes(q) || a.space.toLowerCase().includes(q))
      : MOCK_ARTICLES
  }

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
