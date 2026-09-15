// Token acquisition for the Intune Audit Logs module — kept separate from the
// fetch/chunking logic in intuneAuditGraph.ts so auth mode can change without
// touching pagination/retry code.
//
// Three supported modes (INTUNE_AUDIT_AUTH_MODE):
//   client_secret     — default; reuses INTUNE_TENANT_ID/CLIENT_ID/CLIENT_SECRET
//   certificate       — app-only cert auth (JWT client assertion)
//   managed_identity  — Azure Managed Identity (only valid when hosted on Azure)
//
// Never logs tokens, secrets, or certificate material.

import { randomUUID } from 'crypto'
import jwt from 'jsonwebtoken'
import { ManagedIdentityCredential } from '@azure/identity'
import { getIntuneConfig } from '../store/integrationStore.js'

const GRAPH_SCOPE = 'https://graph.microsoft.com/.default'

interface CachedToken {
  token: string
  expiresAt: number
}

let cache: CachedToken | null = null
let managedIdentityCredential: ManagedIdentityCredential | null = null

export class AuditAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuditAuthError'
  }
}

function authMode(): 'client_secret' | 'certificate' | 'managed_identity' {
  const mode = (process.env.INTUNE_AUDIT_AUTH_MODE ?? 'client_secret').trim()
  if (mode === 'certificate' || mode === 'managed_identity') return mode
  return 'client_secret'
}

function requireTenantAndClientId(): { tenantId: string; clientId: string } {
  const cfg = getIntuneConfig()
  const tenantId = cfg?.tenantId ?? process.env.INTUNE_TENANT_ID
  const clientId = cfg?.clientId ?? process.env.INTUNE_CLIENT_ID
  if (!tenantId || !clientId) {
    throw new AuditAuthError(
      'Intune tenant/client ID not configured. Set INTUNE_TENANT_ID and INTUNE_CLIENT_ID.'
    )
  }
  return { tenantId, clientId }
}

async function acquireViaClientSecret(): Promise<{ token: string; expiresIn: number }> {
  const cfg = getIntuneConfig()
  const tenantId = cfg?.tenantId ?? process.env.INTUNE_TENANT_ID
  const clientId = cfg?.clientId ?? process.env.INTUNE_CLIENT_ID
  const clientSecret = cfg?.clientSecret ?? process.env.INTUNE_CLIENT_SECRET
  if (!tenantId || !clientId || !clientSecret) {
    throw new AuditAuthError(
      'Intune credentials not configured. Set INTUNE_TENANT_ID, INTUNE_CLIENT_ID, INTUNE_CLIENT_SECRET.'
    )
  }

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: GRAPH_SCOPE,
      grant_type: 'client_credentials',
    }),
  })
  if (!res.ok) {
    throw new AuditAuthError(`Graph token request failed (${res.status})`)
  }
  const data = (await res.json()) as { access_token: string; expires_in: number }
  return { token: data.access_token, expiresIn: data.expires_in }
}

// Builds a signed JWT client assertion per the app-only certificate auth flow:
// https://learn.microsoft.com/en-us/entra/identity-platform/certificate-credentials
async function acquireViaCertificate(): Promise<{ token: string; expiresIn: number }> {
  const { tenantId, clientId } = requireTenantAndClientId()
  const pem = process.env.INTUNE_AUDIT_CERT_PEM
  const thumbprint = process.env.INTUNE_AUDIT_CERT_THUMBPRINT
  if (!pem || !thumbprint) {
    throw new AuditAuthError(
      'Certificate auth selected but INTUNE_AUDIT_CERT_PEM / INTUNE_AUDIT_CERT_THUMBPRINT are not set.'
    )
  }

  const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
  const now = Math.floor(Date.now() / 1000)

  // x5t header expects the base64url-encoded SHA-1 certificate thumbprint.
  const x5t = Buffer.from(thumbprint, 'hex').toString('base64url')

  const clientAssertion = jwt.sign(
    {
      aud: tokenEndpoint,
      iss: clientId,
      sub: clientId,
      jti: randomUUID(),
      nbf: now,
      exp: now + 300,
    },
    pem,
    { algorithm: 'RS256', header: { x5t } as unknown as jwt.JwtHeader }
  )

  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: clientId,
      scope: GRAPH_SCOPE,
      grant_type: 'client_credentials',
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: clientAssertion,
    }),
  })
  if (!res.ok) {
    throw new AuditAuthError(`Graph token request failed (${res.status})`)
  }
  const data = (await res.json()) as { access_token: string; expires_in: number }
  return { token: data.access_token, expiresIn: data.expires_in }
}

async function acquireViaManagedIdentity(): Promise<{ token: string; expiresIn: number }> {
  if (!managedIdentityCredential) {
    const clientId = process.env.INTUNE_AUDIT_MANAGED_IDENTITY_CLIENT_ID
    managedIdentityCredential = clientId
      ? new ManagedIdentityCredential(clientId)
      : new ManagedIdentityCredential()
  }
  const result = await managedIdentityCredential.getToken(GRAPH_SCOPE)
  if (!result) {
    throw new AuditAuthError('Managed Identity token request returned no token — is this process running on Azure with an identity assigned?')
  }
  const expiresIn = Math.max(60, Math.floor((result.expiresOnTimestamp - Date.now()) / 1000))
  return { token: result.token, expiresIn }
}

export async function getAuditGraphToken(): Promise<string> {
  if (cache && Date.now() < cache.expiresAt - 60_000) return cache.token

  const mode = authMode()
  const { token, expiresIn } =
    mode === 'certificate' ? await acquireViaCertificate() :
    mode === 'managed_identity' ? await acquireViaManagedIdentity() :
    await acquireViaClientSecret()

  cache = { token, expiresAt: Date.now() + expiresIn * 1_000 }
  return token
}

/** Test-only: reset the in-memory token cache between test cases. */
export function __resetAuditAuthCacheForTests(): void {
  cache = null
  managedIdentityCredential = null
}
