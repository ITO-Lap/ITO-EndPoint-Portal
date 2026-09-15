# Confluence Integration

Connects to **Confluence Cloud REST API** to search knowledge-base articles and attach them to
compliance issues. Shares credentials with Jira (same Atlassian site) — falls back to a small set of
mock KB articles when unconfigured, so the search UI always has something to show in demo mode.

---

## Prerequisites

- The same Jira Cloud site and API token described in [JIRA.md](JIRA.md) (Confluence lives on the
  same Atlassian instance as Jira for most orgs)

---

## Configuration

### Via environment variables (`server/.env`)

```env
# Optional — defaults to JIRA_BASE_URL if the same Atlassian instance
CONFLUENCE_BASE_URL=https://yourorg.atlassian.net
JIRA_EMAIL=you@yourorg.com
JIRA_API_TOKEN=your-api-token
```

`server/src/services/confluence.ts` reads `CONFLUENCE_BASE_URL ?? JIRA_BASE_URL` for the base URL,
and reuses `JIRA_EMAIL`/`JIRA_API_TOKEN` for auth — there are no separate Confluence credentials.
`isConfluenceConfigured()` returns `true` only when a base URL, email, and API token are all present.

### Auth scheme

Basic auth over HTTPS: `Authorization: Basic base64(JIRA_EMAIL:JIRA_API_TOKEN)` — identical scheme to
Jira, built in `authHeaders()` in `server/src/services/confluence.ts`.

---

## What the integration does

`searchConfluencePages(query)` queries `GET /wiki/rest/api/content/search` with a CQL filter
(`type = page AND text ~ "<query>"`, ordered by last modified) and returns page id, title, space key,
URL, excerpt, and last-modified date.

When Confluence isn't configured, the same function filters a hardcoded list of 8 mock IT/security
KB articles (`MOCK_ARTICLES`) client-side by title/excerpt/space instead of calling out to Atlassian —
callers don't need to branch on configuration state.

### Where it's used

**Risk Scoring page — Link Confluence Article**
`src/pages/RiskScoringPage.tsx` opens `src/components/runbooks/ConfluenceModal.tsx` from an expanded
device row, letting an admin search and attach relevant KB articles (e.g. "BitLocker Deployment via
Intune") to that device's compliance issue as reference material. This is read-only against
Confluence — the modal only searches and attaches existing pages; it does not create or edit
Confluence content.

---

## When Confluence is not configured

- `isConfluenceConfigured()` returns `false`
- `searchConfluencePages()` still returns results — the 8 mock articles, filtered by query — rather
  than an empty list or an error
- There is no separate "Confluence not configured" banner in the UI, since search always returns
  something

---

## Related Docs
- [Jira](JIRA.md) — shares credentials and auth scheme with Confluence
