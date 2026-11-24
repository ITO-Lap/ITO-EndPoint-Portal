// Microsoft Graph API Runner — pure logic (no I/O): request validation, approved-endpoint catalogue, permission mapping,
// risk classification, output shaping and download builders.
//
// Safety model:
//   * ALLOWLIST. Only endpoint families in CATALOG can run. Anything else is "blocked" until security adds a row.
//   * The URL is always built as `https://graph.microsoft.com/{v1.0|beta}` + a validated path. A caller can never
//     supply a host, scheme, or full URL, and pagination links must point back at that same origin.
//   * Credential-bearing endpoints (LAPS passwords, BitLocker/FileVault keys, auth methods…) are blocked for every method.

import { redactJson } from './redaction.js'

export const GRAPH_ORIGIN = 'https://graph.microsoft.com'
export type GraphVersion = 'v1.0' | 'beta'
export type GraphMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
export type GraphClass = 'read_only' | 'change' | 'destructive' | 'blocked'

export const LIMITS = {
  maxEndpointLength: 1500, maxQueryValueLength: 2000, maxBodyBytes: 100 * 1024, maxTop: 999,
  timeoutMs: 30_000, maxResponseBytes: 5 * 1024 * 1024, maxPages: 10, maxRows: 5000, maxStoredOutputBytes: 1024 * 1024,
  /** A body listing more than this many array elements is treated as a bulk change. */
  bulkThreshold: 10,
} as const

const ALLOWED_QUERY = ['$filter', '$select', '$expand', '$top', '$orderby', '$count', '$search', '$skip', '$skiptoken'] as const

// ── Approved endpoint catalogue ────────────────────────────────────────────────

interface CatalogRow {
  /** Matches the path (without version, without query), case-insensitive. */
  pattern: RegExp
  label: string
  read: string[]
  write: string[]
}

/** Extend this table to approve more Graph surfaces. Permission lists are alternatives: ANY ONE satisfies the call. */
export const CATALOG: CatalogRow[] = [
  { pattern: /^\/deviceManagement\/(managedDevices|detectedApps|managedDeviceOverview|deviceCompliancePolicyDeviceStateSummary|deviceCompliancePolicySettingStateSummaries)(\/|\(|$)/i, label: 'Intune managed devices', read: ['DeviceManagementManagedDevices.Read.All'], write: ['DeviceManagementManagedDevices.ReadWrite.All'] },
  { pattern: /^\/deviceManagement\/managedDevices(\/[^/]+)?\/(wipe|retire|cleanWindowsDevice|remoteLock|resetPasscode|rebootNow|shutDown|syncDevice|bypassActivationLock|logoutSharedAppleDeviceActiveUser|windowsDefenderScan|windowsDefenderUpdateSignatures|setDeviceName|enableLostMode|disableLostMode|locateDevice|createDeviceLogCollectionRequest|triggerConfigurationManagerAction)$/i, label: 'Intune device remote action', read: [], write: ['DeviceManagementManagedDevices.PrivilegedOperations.All'] },
  { pattern: /^\/deviceManagement\/(deviceConfigurations|configurationPolicies|deviceCompliancePolicies|deviceConfigurationConflictSummary|groupPolicyConfigurations|intents|templates|windowsQualityUpdateProfiles|windowsFeatureUpdateProfiles|windowsDriverUpdateProfiles|assignmentFilters)(\/|\(|$)/i, label: 'Intune configuration & compliance', read: ['DeviceManagementConfiguration.Read.All'], write: ['DeviceManagementConfiguration.ReadWrite.All'] },
  { pattern: /^\/deviceManagement\/(deviceManagementScripts|deviceShellScripts|deviceHealthScripts|deviceCustomAttributeShellScripts)(\/|\(|$)/i, label: 'Intune scripts & remediations', read: ['DeviceManagementScripts.Read.All', 'DeviceManagementConfiguration.Read.All'], write: ['DeviceManagementScripts.ReadWrite.All', 'DeviceManagementConfiguration.ReadWrite.All'] },
  { pattern: /^\/deviceManagement\/(windowsAutopilotDeviceIdentities|windowsAutopilotDeploymentProfiles|importedWindowsAutopilotDeviceIdentities|depOnboardingSettings|appleUserInitiatedEnrollmentProfiles)(\/|\(|$)/i, label: 'Autopilot & enrollment', read: ['DeviceManagementServiceConfig.Read.All'], write: ['DeviceManagementServiceConfig.ReadWrite.All'] },
  { pattern: /^\/deviceManagement\/(roleDefinitions|roleAssignments|resourceOperations)(\/|\(|$)/i, label: 'Intune RBAC', read: ['DeviceManagementRBAC.Read.All'], write: ['DeviceManagementRBAC.ReadWrite.All'] },
  { pattern: /^\/deviceManagement\/(auditEvents|reports)(\/|\(|$)/i, label: 'Intune reports & audit', read: ['DeviceManagementApps.Read.All', 'DeviceManagementManagedDevices.Read.All', 'Reports.Read.All'], write: ['DeviceManagementManagedDevices.ReadWrite.All'] },
  { pattern: /^\/deviceAppManagement\/(mobileApps|mobileAppConfigurations|managedAppPolicies|iosManagedAppProtections|androidManagedAppProtections|targetedManagedAppConfigurations|vppTokens)(\/|\(|$)/i, label: 'Intune apps', read: ['DeviceManagementApps.Read.All'], write: ['DeviceManagementApps.ReadWrite.All'] },
  { pattern: /^\/users(\/|\(|$)/i, label: 'Users', read: ['User.Read.All', 'Directory.Read.All'], write: ['User.ReadWrite.All'] },
  { pattern: /^\/groups(\/|\(|$)/i, label: 'Groups', read: ['Group.Read.All', 'GroupMember.Read.All', 'Directory.Read.All'], write: ['Group.ReadWrite.All', 'GroupMember.ReadWrite.All'] },
  { pattern: /^\/devices(\/|\(|$)/i, label: 'Entra devices', read: ['Device.Read.All', 'Directory.Read.All'], write: ['Device.ReadWrite.All'] },
  { pattern: /^\/auditLogs\/(directoryAudits|provisioning)(\/|$)/i, label: 'Entra audit logs', read: ['AuditLog.Read.All'], write: [] },
  { pattern: /^\/auditLogs\/signIns(\/|$)/i, label: 'Entra sign-in logs', read: ['AuditLog.Read.All'], write: [] },
  { pattern: /^\/reports\//i, label: 'Usage reports', read: ['Reports.Read.All'], write: [] },
  { pattern: /^\/organization(\/|$)/i, label: 'Organization', read: ['Organization.Read.All', 'Directory.Read.All'], write: [] },
  { pattern: /^\/directoryObjects(\/|\(|$)/i, label: 'Directory objects', read: ['Directory.Read.All'], write: [] },
  { pattern: /^\/subscribedSkus(\/|$)/i, label: 'Licenses', read: ['Organization.Read.All', 'LicenseAssignment.Read.All', 'Directory.Read.All'], write: [] },
]

/** Blocked regardless of method: they return or create credentials, escalate privilege or bypass this tool's controls. */
const BLOCKED: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\/\$batch$/i, reason: '$batch can bundle calls and bypass per-request approval.' },
  { pattern: /deviceLocalCredentials/i, reason: 'Returns local administrator (LAPS) passwords.' },
  { pattern: /bitlockerKeys|getBitLockerRecoveryKey|getFileVaultKey|recoveryKeys/i, reason: 'Returns disk-encryption recovery keys.' },
  { pattern: /\/authentication(\/|$)|temporaryAccessPass|passwordMethods|resetPassword|\/revokeSignInSessions/i, reason: 'Touches user authentication methods or passwords.' },
  { pattern: /\/(addPassword|removePassword|addKey|removeKey|passwordCredentials|keyCredentials)(\/|$)/i, reason: 'Manages application credentials.' },
  { pattern: /^\/(applications|servicePrincipals|oauth2PermissionGrants|directoryRoles|roleManagement|policies|domains|identity|trustFramework|admin)(\/|\(|$)/i, reason: 'Identity-platform and privilege-management APIs are not approved for this runner.' },
  { pattern: /\/(appRoleAssignments|appRoleAssignedTo|memberOf\/\$ref|transitiveMemberOf\/\$ref|assignLicense)(\/|$)/i, reason: 'Role or license assignment changes are not approved for this runner.' },
  { pattern: /^\/(me|security|search|solutions|sites|drives|teams|chats|communications)(\/|\(|$)/i, reason: 'Not an approved endpoint family for this runner.' },
]

const DESTRUCTIVE_ACTION = /\/(wipe|retire|cleanWindowsDevice|remoteLock|resetPasscode|rebootNow|shutDown|bypassActivationLock|disable|delete|deleteUserFromSharedAppleDevice|enableLostMode|decommission)$/i

// ── Validation ─────────────────────────────────────────────────────────────────

export interface GraphRequestInput {
  version?: string | undefined
  method?: string | undefined
  endpoint?: string | undefined
  query?: Record<string, unknown> | undefined
  body?: unknown
}

export interface NormalizedRequest {
  version: GraphVersion
  method: GraphMethod
  path: string
  query: Record<string, string>
  body?: unknown
  url: string
}

export interface ValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  request?: NormalizedRequest
  classification: GraphClass
  /** Why it is blocked / destructive / bulk — shown on the confirmation screen. */
  reasons: string[]
  family?: string
  /** Alternatives per requirement: the app registration needs ONE of each inner list. */
  requiredPermissions: string[][]
  bulk: boolean
  expectedImpact: string
  requiresJustification: boolean
  requiresApproval: boolean
  requiresConfirmation: boolean
}

const METHODS: GraphMethod[] = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']
const PATH_CHARS = /^\/[A-Za-z0-9/_\-.$(),'=:@%~ ]*$/

function endpointErrors(path: string): string[] {
  const errors: string[] = []
  if (!path.startsWith('/')) errors.push('The endpoint must start with "/", for example /deviceManagement/managedDevices.')
  if (path.startsWith('//') || /^\/*[a-z][a-z0-9+.-]*:/i.test(path) || /^https?:/i.test(path)) errors.push('Only Microsoft Graph paths are allowed. External URLs and schemes are rejected.')
  if (path.length > LIMITS.maxEndpointLength) errors.push(`The endpoint is longer than ${LIMITS.maxEndpointLength} characters.`)
  if (/[?#]/.test(path)) errors.push('Put query options in the query parameter fields, not in the endpoint.')
  if (/\.\.|%2e|%2f|%5c|\\|%00|%0[adAD]/i.test(path)) errors.push('The endpoint contains path-traversal or encoded control characters.')
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(path)) errors.push('The endpoint contains control characters.')
  if (/[{}<>|^`]/.test(path)) errors.push('The endpoint contains unresolved placeholders or invalid characters. Replace {…} values with real ids.')
  else if (!errors.length && !PATH_CHARS.test(path)) errors.push('The endpoint contains characters that are not valid in a Graph path.')
  return errors
}

const emptyResult = (): ValidationResult => ({
  ok: false, errors: [], warnings: [], classification: 'read_only', reasons: [], requiredPermissions: [], bulk: false,
  expectedImpact: '', requiresJustification: false, requiresApproval: false, requiresConfirmation: false,
})

function arrayMax(v: unknown, depth = 0): number {
  if (depth > 6) return 0
  if (Array.isArray(v)) return Math.max(v.length, ...v.map(x => arrayMax(x, depth + 1)), 0)
  if (v && typeof v === 'object') return Math.max(0, ...Object.values(v as Record<string, unknown>).map(x => arrayMax(x, depth + 1)))
  return 0
}

export function validateGraphRequest(input: GraphRequestInput): ValidationResult {
  const r = emptyResult()
  const version = (input.version ?? 'v1.0') as string
  if (version !== 'v1.0' && version !== 'beta') r.errors.push('Graph version must be "v1.0" or "beta".')
  const method = String(input.method ?? 'GET').toUpperCase()
  if (!METHODS.includes(method as GraphMethod)) r.errors.push(`HTTP method "${input.method}" is not allowed. Use GET, POST, PATCH, PUT or DELETE.`)

  const rawPath = (input.endpoint ?? '').trim()
  if (!rawPath) r.errors.push('The endpoint is required.')
  else r.errors.push(...endpointErrors(rawPath))

  // Query options: allowlisted names, bounded values.
  const query: Record<string, string> = {}
  for (const [k, v] of Object.entries(input.query ?? {})) {
    if (v === undefined || v === null || String(v).trim() === '') continue
    const key = k.startsWith('$') ? k : `$${k}`
    if (!(ALLOWED_QUERY as readonly string[]).includes(key)) { r.errors.push(`Query option "${k}" is not allowed. Allowed: ${ALLOWED_QUERY.join(', ')}.`); continue }
    const value = String(v)
    if (value.length > LIMITS.maxQueryValueLength) { r.errors.push(`Query option ${key} is too long.`); continue }
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x1f\x7f]/.test(value)) { r.errors.push(`Query option ${key} contains control characters.`); continue }
    if (key === '$top') {
      const n = Number(value)
      if (!Number.isInteger(n) || n < 1) { r.errors.push('$top must be a positive whole number.'); continue }
      query[key] = String(Math.min(n, LIMITS.maxTop)); if (n > LIMITS.maxTop) r.warnings.push(`$top was reduced to ${LIMITS.maxTop}.`); continue
    }
    query[key] = value
  }

  const hasBody = input.body !== undefined && input.body !== null && input.body !== ''
  let body: unknown
  if (hasBody) {
    if (method === 'GET' || method === 'DELETE') r.errors.push(`${method} requests cannot have a request body.`)
    else {
      try {
        body = typeof input.body === 'string' ? JSON.parse(input.body) : input.body
        if (body === null || typeof body !== 'object') r.errors.push('The request body must be a JSON object or array.')
        else if (Buffer.byteLength(JSON.stringify(body), 'utf8') > LIMITS.maxBodyBytes) r.errors.push(`The request body is larger than ${LIMITS.maxBodyBytes / 1024} KB.`)
      } catch { r.errors.push('The request body is not valid JSON.') }
    }
  } else if (method === 'POST' || method === 'PUT') {
    // POST actions such as /syncDevice legitimately have no body; PUT without one is almost always a mistake.
    if (method === 'PUT') r.errors.push('PUT requests need a JSON body.')
  } else if (method === 'PATCH') r.errors.push('PATCH requests need a JSON body.')

  if (r.errors.length) { r.classification = r.errors.some(e => /external|traversal|control/i.test(e)) ? 'blocked' : r.classification; return finish(r) }

  const path = rawPath.replace(/\/+$/, '') || '/'
  const url = `${GRAPH_ORIGIN}/${version}${path}${Object.keys(query).length ? `?${new URLSearchParams(query).toString().replace(/\+/g, '%20')}` : ''}`
  // Belt and braces: whatever we built must still resolve to the Graph origin and the chosen version.
  try {
    const u = new URL(url)
    if (u.origin !== GRAPH_ORIGIN || !u.pathname.startsWith(`/${version}/`)) { r.errors.push('The request would leave Microsoft Graph and was rejected.'); r.classification = 'blocked'; return finish(r) }
  } catch { r.errors.push('The endpoint could not be turned into a valid URL.'); return finish(r) }
  r.request = { version: version as GraphVersion, method: method as GraphMethod, path, query, ...(body !== undefined ? { body } : {}), url }

  const blockedRow = BLOCKED.find(b => b.pattern.test(path))
  const family = CATALOG.find(c => c.pattern.test(path))
  if (blockedRow) { r.classification = 'blocked'; r.reasons.push(blockedRow.reason) }
  else if (!family) { r.classification = 'blocked'; r.reasons.push('This endpoint is not in the approved catalogue. Ask a Super Admin to approve the endpoint family before it can be run.') }
  else {
    r.family = family.label
    const isGet = method === 'GET'
    const privileged = /\/(wipe|retire|cleanWindowsDevice|remoteLock|resetPasscode|rebootNow|shutDown|syncDevice|bypassActivationLock|windowsDefenderScan|windowsDefenderUpdateSignatures|setDeviceName|enableLostMode|disableLostMode|locateDevice|createDeviceLogCollectionRequest|triggerConfigurationManagerAction|logoutSharedAppleDeviceActiveUser)$/i.test(path)
    r.requiredPermissions = [isGet ? family.read : privileged ? ['DeviceManagementManagedDevices.PrivilegedOperations.All'] : family.write]
    if (!r.requiredPermissions[0]!.length) { r.classification = 'blocked'; r.reasons.push(`${family.label} is read-only in this runner; ${method} is not supported.`); r.requiredPermissions = [] }
    else if (isGet) r.classification = 'read_only'
    else if (method === 'DELETE' || DESTRUCTIVE_ACTION.test(path)) { r.classification = 'destructive'; r.reasons.push(method === 'DELETE' ? 'DELETE permanently removes data.' : 'This action disrupts or erases the device or object.') }
    else r.classification = 'change'
    if (r.classification === 'change' || r.classification === 'destructive') {
      const bulk = arrayMax(body) > LIMITS.bulkThreshold
      r.bulk = bulk
      if (bulk) { r.reasons.push(`The request body lists more than ${LIMITS.bulkThreshold} items (bulk change).`); if (r.classification === 'change') r.classification = 'destructive' }
    }
  }
  if (version === 'beta') r.warnings.push('The beta endpoint is not supported for production use and can change or break without notice.')
  return finish(r)
}

function finish(r: ValidationResult): ValidationResult {
  r.ok = r.errors.length === 0 && r.classification !== 'blocked'
  const c = r.classification
  r.requiresJustification = c === 'change' || c === 'destructive'
  r.requiresApproval = c === 'destructive'
  r.requiresConfirmation = c === 'change' || c === 'destructive'
  if (r.request) {
    const m = r.request.method
    r.expectedImpact = c === 'read_only' ? 'Reads data only. Nothing is changed.'
      : c === 'blocked' ? 'This request will not be sent.'
      : c === 'destructive' ? `${m} ${r.request.path}: may permanently delete or disrupt data${r.bulk ? ' across many objects' : ''}. Requires approver authorization.`
      : `${m} ${r.request.path}: modifies ${r.family?.toLowerCase() ?? 'tenant'} data. Requires a business justification and confirmation.`
  }
  return r
}

// ── Permission check (against the app registration's real granted roles) ───────

export function checkPermissions(required: string[][], granted: string[]): { ok: boolean; missing: string[][] } {
  const g = new Set(granted)
  const satisfied = (options: string[]): boolean => options.some(o => g.has(o) || (o.endsWith('.Read.All') && g.has(o.replace('.Read.All', '.ReadWrite.All'))))
  const missing = required.filter(opts => opts.length && !satisfied(opts))
  return { ok: missing.length === 0, missing }
}

/** Smallest permission(s) for a request: the first alternative of each requirement (least privilege). */
export const minimumPermissions = (required: string[][]): string[] => required.map(o => o[0]!).filter(Boolean)

// ── Throttling / errors ────────────────────────────────────────────────────────

export function retryAfterSeconds(header: string | null | undefined, now = Date.now()): number | null {
  if (!header) return null
  const n = Number(header)
  if (Number.isFinite(n)) return Math.max(0, Math.ceil(n))
  const t = Date.parse(header)
  return Number.isFinite(t) ? Math.max(0, Math.ceil((t - now) / 1000)) : null
}

export function explainGraphError(status: number, graphCode?: string, message?: string, retryAfter?: number | null): string {
  switch (status) {
    case 400: return `Graph rejected the request as malformed${graphCode ? ` (${graphCode})` : ''}. Check the endpoint, the $filter syntax and the JSON body.${message ? ` Graph said: ${message.slice(0, 200)}` : ''}`
    case 401: return 'Graph rejected the credentials. The Intune/Graph app registration secret may have expired.'
    case 403: return 'The app registration does not have the Graph application permission this endpoint needs (admin consent required), or the tenant policy blocks it.'
    case 404: return 'Graph could not find that resource. Check the id, the endpoint spelling and the API version (some resources exist only in beta).'
    case 409: return 'The resource is in a state that conflicts with this request (it may already exist or be locked).'
    case 429: return `Graph is throttling this app. ${retryAfter ? `Wait ${retryAfter} seconds before retrying.` : 'Wait a minute before retrying.'} Reduce $top or add $select/$filter to lower the load.`
    case 503: case 504: return 'Microsoft Graph is temporarily unavailable. Retry shortly.'
    default: return status >= 500 ? 'Microsoft Graph returned a server error. Retry shortly.' : `Graph returned HTTP ${status}${message ? `: ${message.slice(0, 200)}` : ''}.`
  }
}

// ── Pagination ─────────────────────────────────────────────────────────────────

/** A next-page link is only followed when it points at the same Graph origin and version as the original request. */
export function isSafeNextLink(link: string | undefined | null, version: GraphVersion): boolean {
  if (!link) return false
  try { const u = new URL(link); return u.protocol === 'https:' && u.origin === GRAPH_ORIGIN && u.pathname.startsWith(`/${version}/`) } catch { return false }
}

export interface PageSummary { rows: unknown[] | null; nextLink: string | null; count: number | null }
export function summarizePage(json: unknown): PageSummary {
  if (json && typeof json === 'object' && Array.isArray((json as { value?: unknown }).value)) {
    const o = json as { value: unknown[]; '@odata.nextLink'?: string; '@odata.count'?: number }
    return { rows: o.value, nextLink: o['@odata.nextLink'] ?? null, count: typeof o['@odata.count'] === 'number' ? o['@odata.count'] : null }
  }
  return { rows: null, nextLink: null, count: null }
}

// ── Output shaping ─────────────────────────────────────────────────────────────

const MASKED = '[REDACTED]'

/** Redacts secrets and caps size, keeping list output usable (truncates rows, not structure). */
export function shapeOutput(json: unknown, maxBytes: number = LIMITS.maxStoredOutputBytes): { output: unknown; truncated: boolean } {
  const clean = redactJson(json)
  if (JSON.stringify(clean ?? null).length <= maxBytes) return { output: clean, truncated: false }
  const page = summarizePage(clean)
  if (page.rows) {
    const kept: unknown[] = []
    let size = 0
    for (const row of page.rows) { const n = JSON.stringify(row).length; if (size + n > maxBytes) break; kept.push(row); size += n }
    return { output: { ...(clean as object), value: kept }, truncated: true }
  }
  return { output: { note: 'Output was too large to store and was truncated.', preview: JSON.stringify(clean).slice(0, 2000) }, truncated: true }
}

/** Deep copy with every masked/sensitive field REMOVED, for downloads (nothing masked is shipped at all). */
export function stripMasked<T>(value: T, depth = 0): T {
  if (depth > 25) return value
  if (Array.isArray(value)) return value.map(v => stripMasked(v, depth + 1)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === MASKED || (typeof v === 'string' && v.includes(MASKED))) continue
      out[k] = stripMasked(v, depth + 1)
    }
    return out as T
  }
  return value
}

// ── Download builders ──────────────────────────────────────────────────────────

const flat = (v: unknown): string => v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
const csvCell = (v: unknown): string => {
  let s = flat(v).replace(/\r?\n/g, ' ')
  if (/^[=+\-@\t]/.test(s)) s = `'${s}` // spreadsheet formula injection guard
  return `"${s.replace(/"/g, '""')}"`
}

export function buildJson(output: unknown): string { return JSON.stringify(stripMasked(output), null, 2) }

/** CSV of list output (`value` array of objects). Returns null when the result is not a table. */
export function buildCsv(output: unknown): string | null {
  const { rows } = summarizePage(stripMasked(output))
  const list = rows ?? (Array.isArray(output) ? output : null)
  if (!list) return null
  const objects = list.filter((r): r is Record<string, unknown> => r !== null && typeof r === 'object' && !Array.isArray(r))
  if (objects.length === 0) return null
  const cols: string[] = []
  for (const o of objects) for (const k of Object.keys(o)) if (!cols.includes(k) && !k.startsWith('@odata.')) cols.push(k)
  return [cols.map(csvCell).join(','), ...objects.map(o => cols.map(c => csvCell(o[c])).join(','))].join('\r\n')
}

export interface SummaryInput {
  id: string; name: string; requestedBy: string; requestedAt: string; executedAt?: string; method: string; endpoint: string; version: string
  classification: string; status: string; httpStatus?: number; durationMs?: number; correlationId?: string; approvalStatus: string; resultSummary?: string
}
export function buildSummaryTxt(s: SummaryInput): string {
  return [
    'Microsoft Graph API Runner — request summary', '='.repeat(48),
    `Request ID:      ${s.id}`, `Name:            ${s.name}`, `Requested by:    ${s.requestedBy}`, `Requested at:    ${s.requestedAt}`,
    s.executedAt ? `Executed at:     ${s.executedAt}` : '', `Method:          ${s.method}`, `Endpoint:        ${s.endpoint}`, `Graph version:   ${s.version}`,
    `Classification:  ${s.classification}`, `Approval:        ${s.approvalStatus}`, `Status:          ${s.status}`,
    s.httpStatus !== undefined ? `HTTP status:     ${s.httpStatus}` : '', s.durationMs !== undefined ? `Duration:        ${s.durationMs} ms` : '',
    s.correlationId ? `Correlation ID:  ${s.correlationId}` : '', s.resultSummary ? `Result:          ${s.resultSummary}` : '',
    '', 'No tokens, secrets or authorization headers are included in this file.',
  ].filter(l => l !== '').join('\n')
}

// ── Built-in templates ─────────────────────────────────────────────────────────

export interface BuiltinTemplate { id: string; name: string; description: string; version: GraphVersion; method: 'GET'; endpoint: string; query: Record<string, string>; placeholders?: string[] }

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  { id: 'managed-devices', name: 'Get managed devices', description: 'First 25 Intune managed devices.', version: 'v1.0', method: 'GET', endpoint: '/deviceManagement/managedDevices', query: { $top: '25', $select: 'id,deviceName,operatingSystem,osVersion,complianceState,lastSyncDateTime' } },
  { id: 'device-by-serial', name: 'Search device by serial number', description: 'Replace SERIAL with the serial number.', version: 'v1.0', method: 'GET', endpoint: '/deviceManagement/managedDevices', query: { $filter: "serialNumber eq 'SERIAL'", $select: 'id,deviceName,serialNumber,operatingSystem,complianceState,lastSyncDateTime' }, placeholders: ['SERIAL'] },
  { id: 'compliance-state', name: 'Get device compliance state', description: 'Compliance state for managed devices.', version: 'v1.0', method: 'GET', endpoint: '/deviceManagement/managedDevices', query: { $top: '50', $select: 'id,deviceName,complianceState,complianceGracePeriodExpirationDateTime' } },
  { id: 'detected-apps', name: 'Get detected applications', description: 'Apps detected across managed devices.', version: 'v1.0', method: 'GET', endpoint: '/deviceManagement/detectedApps', query: { $top: '50' } },
  { id: 'user-details', name: 'Get user details', description: 'Replace USER with a user id or UPN.', version: 'v1.0', method: 'GET', endpoint: '/users/USER', query: { $select: 'id,displayName,userPrincipalName,department,accountEnabled' }, placeholders: ['USER'] },
  { id: 'config-profiles', name: 'Get Intune configuration profiles', description: 'Device configuration profiles.', version: 'v1.0', method: 'GET', endpoint: '/deviceManagement/deviceConfigurations', query: { $select: 'id,displayName,lastModifiedDateTime' } },
  { id: 'autopilot', name: 'Get Autopilot devices', description: 'Windows Autopilot device identities.', version: 'v1.0', method: 'GET', endpoint: '/deviceManagement/windowsAutopilotDeviceIdentities', query: { $top: '50' } },
  { id: 'windows-update', name: 'Get Windows update status', description: 'Windows quality update profiles (beta).', version: 'beta', method: 'GET', endpoint: '/deviceManagement/windowsQualityUpdateProfiles', query: {} },
  { id: 'mac-inventory', name: 'Get macOS device inventory', description: 'macOS managed devices.', version: 'v1.0', method: 'GET', endpoint: '/deviceManagement/managedDevices', query: { $filter: "operatingSystem eq 'macOS'", $top: '50', $select: 'id,deviceName,serialNumber,osVersion,lastSyncDateTime,complianceState' } },
]
