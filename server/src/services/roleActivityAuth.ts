// Token acquisition for the O365 Management Activity API (manage.office.com),
// used only by the SharePoint role-activity puller. This is a genuinely
// different resource/audience than Microsoft Graph (https://graph.microsoft.com),
// so it needs its own token function — but it reuses the same Entra app
// registration credentials (ENTRA_TENANT_ID/CLIENT_ID/CLIENT_SECRET, sourced
// the same way entraIntelligence.ts does, via getEntraConfig()) rather than
// inventing a redundant set of env vars.
//
// Kept entirely separate from intuneAuditAuth.ts's cache/exports — this file
// does not import from or modify that module. Never logs tokens or secrets.

import { getEntraConfig } from '../store/integrationStore.js'

const MANAGEMENT_ACTIVITY_RESOURCE = 'https://manage.office.com'

interface CachedToken {
  token: string
  expiresAt: number
}

let cache: CachedToken | null = null

export class RoleActivityAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RoleActivityAuthError'
  }
}

/** Acquires an app-only OAuth token for the O365 Management Activity API.
 *  Uses the v1 token endpoint with `resource=` (not `scope=`) — the
 *  Management Activity API predates the v2.0/`.default` scope model and
 *  still expects the classic ADAL-style resource parameter. */
export async function getManagementActivityToken(): Promise<string> {
  if (cache && Date.now() < cache.expiresAt - 60_000) return cache.token

  const cfg = getEntraConfig()
  if (!cfg) {
    throw new RoleActivityAuthError(
      'Entra ID credentials not configured. Set ENTRA_TENANT_ID, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET (or INTUNE_TENANT_ID/CLIENT_ID/CLIENT_SECRET as a fallback).'
    )
  }

  const tokenEndpoint = `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/token`
  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      resource: MANAGEMENT_ACTIVITY_RESOURCE,
      grant_type: 'client_credentials',
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new RoleActivityAuthError(`Management Activity API token request failed (${res.status}): ${body.slice(0, 300)}`)
  }
  const data = (await res.json()) as { access_token: string; expires_in: string }
  cache = { token: data.access_token, expiresAt: Date.now() + Number(data.expires_in) * 1_000 }
  return cache.token
}

/** Test-only: reset the in-memory token cache between test cases. */
export function __resetRoleActivityAuthCacheForTests(): void {
  cache = null
}
