import { describe, it, expect } from 'vitest'
import {
  BUILTIN_TEMPLATES, buildCsv, buildJson, buildSummaryTxt, checkPermissions, explainGraphError, isSafeNextLink, minimumPermissions, retryAfterSeconds,
  shapeOutput, stripMasked, summarizePage, validateGraphRequest,
} from '../graphRunnerLib.js'
import { redactJson } from '../redaction.js'

const v = (over: Record<string, unknown>) => validateGraphRequest({ version: 'v1.0', method: 'GET', endpoint: '/deviceManagement/managedDevices', ...over })

describe('endpoint validation', () => {
  it('accepts a normal Graph path and builds a url on the Graph origin only', () => {
    const r = v({ query: { $top: '25', $select: 'id,deviceName' } })
    expect(r.ok).toBe(true)
    expect(r.request!.url).toBe('https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?%24top=25&%24select=id%2CdeviceName')
  })
  it('rejects external URLs, schemes, host tricks, traversal, encoded slashes, control chars and query in the path', () => {
    for (const endpoint of ['https://evil.example/x', '//evil.example/x', 'deviceManagement/managedDevices', '/deviceManagement/../users', '/users/%2e%2e/x', '/users/a%2fb', '/users\\x', '/deviceManagement/managedDevices?$top=1', '/users/{id}', 'javascript:alert(1)', '/users/\n1', '/users#frag']) {
      const r = v({ endpoint }); expect(r.ok, endpoint).toBe(false); expect(r.errors.length + r.reasons.length, endpoint).toBeGreaterThan(0)
    }
    expect(v({ endpoint: 'https://evil.example/x' }).errors.join()).toMatch(/External URLs|start with/)
    expect(v({ endpoint: '//evil.example/x' }).classification).toBe('blocked')
  })
  it('never lets the resolved URL leave graph.microsoft.com', () => {
    for (const endpoint of ['/users/a@evil.example', '/users/x:80', '/users/graph.microsoft.com@evil.example']) {
      const r = v({ endpoint }); if (r.request) expect(new URL(r.request.url).origin).toBe('https://graph.microsoft.com')
    }
  })
  it('validates version, empty endpoint, query options and limits', () => {
    expect(v({ version: 'v2' }).errors.join()).toMatch(/v1\.0/)
    expect(v({ endpoint: '' }).errors.join()).toMatch(/required/)
    expect(v({ query: { $evil: '1' } }).errors.join()).toMatch(/not allowed/)
    expect(v({ query: { $top: '0' } }).errors.join()).toMatch(/positive/)
    const big = v({ query: { $top: '5000' } }); expect(big.request!.query['$top']).toBe('999'); expect(big.warnings.join()).toMatch(/reduced/)
    expect(v({ query: { $filter: 'x'.repeat(2500) } }).errors.join()).toMatch(/too long/)
    expect(v({ endpoint: '/users/' + 'a'.repeat(1600) }).errors.join()).toMatch(/longer than/)
  })
  it('warns on beta', () => { expect(v({ version: 'beta' }).warnings.join()).toMatch(/beta/i) })
})

describe('HTTP method restrictions and body validation', () => {
  it('only allows the five methods', () => {
    for (const m of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']) expect(v({ method: m, body: m === 'POST' || m === 'PATCH' || m === 'PUT' ? { a: 1 } : undefined, endpoint: '/devices/abc' }).errors.filter(e => /method/i.test(e))).toEqual([])
    for (const m of ['TRACE', 'CONNECT', 'OPTIONS', 'HEAD', 'FOO']) expect(v({ method: m }).errors.join()).toMatch(/not allowed/)
  })
  it('GET/DELETE cannot carry a body; PATCH/PUT need one; JSON must parse and be bounded', () => {
    expect(v({ method: 'GET', body: { a: 1 } }).errors.join()).toMatch(/cannot have a request body/)
    expect(v({ method: 'DELETE', endpoint: '/devices/abc', body: { a: 1 } }).errors.join()).toMatch(/cannot have a request body/)
    expect(v({ method: 'PATCH', endpoint: '/devices/abc' }).errors.join()).toMatch(/need a JSON body/)
    expect(v({ method: 'POST', endpoint: '/devices/abc', body: '{not json' }).errors.join()).toMatch(/not valid JSON/)
    expect(v({ method: 'POST', endpoint: '/devices/abc', body: '"str"' }).errors.join()).toMatch(/object or array/)
    expect(v({ method: 'POST', endpoint: '/devices/abc', body: { a: 'x'.repeat(120 * 1024) } }).errors.join()).toMatch(/larger than/)
    expect(v({ method: 'POST', endpoint: '/devices/abc', body: '{"displayName":"x"}' }).ok).toBe(true)
  })
})

describe('risk classification', () => {
  it('GET is read-only; no approval, justification or confirmation', () => {
    const r = v({}); expect(r).toMatchObject({ classification: 'read_only', requiresApproval: false, requiresJustification: false, requiresConfirmation: false })
  })
  it('POST/PATCH/PUT are change requests needing justification + confirmation, not approval', () => {
    for (const method of ['POST', 'PATCH', 'PUT'])
      expect(v({ method, endpoint: '/devices/abc', body: { displayName: 'x' } })).toMatchObject({ classification: 'change', requiresJustification: true, requiresConfirmation: true, requiresApproval: false })
  })
  it('DELETE and destructive device actions need approval', () => {
    expect(v({ method: 'DELETE', endpoint: '/devices/abc' })).toMatchObject({ classification: 'destructive', requiresApproval: true, requiresJustification: true })
    expect(v({ method: 'POST', endpoint: '/deviceManagement/managedDevices/abc/wipe', body: { keepEnrollmentData: false } })).toMatchObject({ classification: 'destructive', requiresApproval: true })
    expect(v({ method: 'POST', endpoint: '/deviceManagement/managedDevices/abc/retire' })).toMatchObject({ classification: 'destructive' })
  })
  it('treats a bulk change as high-impact (approval required)', () => {
    const r = v({ method: 'PATCH', endpoint: '/groups/abc', body: { members: Array.from({ length: 25 }, (_, i) => `id${i}`) } })
    expect(r).toMatchObject({ classification: 'destructive', bulk: true, requiresApproval: true }); expect(r.reasons.join()).toMatch(/bulk/)
  })
  it('blocks everything outside the approved catalogue and credential/privilege surfaces for every method', () => {
    for (const endpoint of ['/me', '/security/alerts', '/applications', '/servicePrincipals/x/addPassword', '/directoryRoles', '/roleManagement/directory/roleAssignments', '/policies/conditionalAccessPolicies',
      '/directory/deviceLocalCredentials/abc', '/informationProtection/bitlockerKeys', '/users/abc/authentication/methods', '/$batch', '/deviceManagement/managedDevices/abc/getFileVaultKey', '/sites/root', '/unknownThing']) {
      const r = v({ endpoint }); expect(r.classification, endpoint).toBe('blocked'); expect(r.ok, endpoint).toBe(false)
    }
    expect(v({ method: 'PATCH', endpoint: '/organization/abc', body: { a: 1 } }).classification).toBe('blocked')   // read-only family
  })
  it('catalogue templates are all valid read-only requests', () => {
    for (const t of BUILTIN_TEMPLATES) {
      const endpoint = t.endpoint.replace('/USER', '/abc')
      const r = validateGraphRequest({ version: t.version, method: t.method, endpoint, query: t.query })
      expect(r.ok, t.id).toBe(true); expect(r.classification, t.id).toBe('read_only')
    }
  })
})

describe('permission validation', () => {
  it('maps endpoints to minimum permissions', () => {
    expect(minimumPermissions(v({}).requiredPermissions)).toEqual(['DeviceManagementManagedDevices.Read.All'])
    expect(minimumPermissions(v({ endpoint: '/users/abc' }).requiredPermissions)).toEqual(['User.Read.All'])
    expect(minimumPermissions(v({ method: 'POST', endpoint: '/deviceManagement/managedDevices/abc/syncDevice' }).requiredPermissions)).toEqual(['DeviceManagementManagedDevices.PrivilegedOperations.All'])
    expect(minimumPermissions(v({ method: 'PATCH', endpoint: '/devices/abc', body: { a: 1 } }).requiredPermissions)).toEqual(['Device.ReadWrite.All'])
  })
  it('checks against the granted roles; ReadWrite satisfies Read; shows what is missing', () => {
    const req = v({}).requiredPermissions
    expect(checkPermissions(req, []).missing).toEqual([['DeviceManagementManagedDevices.Read.All']])
    expect(checkPermissions(req, ['DeviceManagementManagedDevices.Read.All']).ok).toBe(true)
    expect(checkPermissions(req, ['DeviceManagementManagedDevices.ReadWrite.All']).ok).toBe(true)
    expect(checkPermissions(req, ['User.Read.All']).ok).toBe(false)
    expect(checkPermissions(v({ endpoint: '/users/abc' }).requiredPermissions, ['Directory.Read.All']).ok).toBe(true)   // any-of alternative
  })
})

describe('Graph errors and throttling', () => {
  it('parses Retry-After in seconds and as a date', () => {
    expect(retryAfterSeconds('7')).toBe(7)
    expect(retryAfterSeconds('Wed, 24 Nov 2026 12:00:30 GMT', Date.parse('Wed, 24 Nov 2026 12:00:00 GMT'))).toBe(30)
    expect(retryAfterSeconds(null)).toBeNull(); expect(retryAfterSeconds('soon')).toBeNull()
  })
  it('explains common statuses with retry guidance', () => {
    expect(explainGraphError(429, undefined, undefined, 42)).toMatch(/Wait 42 seconds/)
    expect(explainGraphError(403)).toMatch(/permission/)
    expect(explainGraphError(404)).toMatch(/could not find/)
    expect(explainGraphError(400, 'Request_BadRequest', 'Invalid filter clause')).toMatch(/Invalid filter clause/)
  })
})

describe('pagination', () => {
  it('summarises list pages and only follows same-origin same-version links', () => {
    const p = summarizePage({ value: [{ id: 1 }, { id: 2 }], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?$skiptoken=abc', '@odata.count': 10 })
    expect(p).toMatchObject({ rows: [{ id: 1 }, { id: 2 }], count: 10 }); expect(p.nextLink).toContain('skiptoken')
    expect(summarizePage({ id: 'x' }).rows).toBeNull()
    expect(isSafeNextLink(p.nextLink, 'v1.0')).toBe(true)
    expect(isSafeNextLink(p.nextLink, 'beta')).toBe(false)
    for (const bad of ['https://evil.example/v1.0/x', 'http://graph.microsoft.com/v1.0/x', 'https://graph.microsoft.com.evil.example/v1.0/x', 'https://graph.microsoft.com@evil.example/v1.0/x', '', undefined, null]) expect(isSafeNextLink(bad as string, 'v1.0')).toBe(false)
  })
})

describe('redaction and download generation', () => {
  const output = { value: [{ id: '1', displayName: 'Mac, "A"', note: '=HYPERLINK("x")', meta: { a: 1 }, access_token: 'abcdefghijklmnop', secretText: 'Password=hunter22;' }, { id: '2', displayName: 'B' }], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/x?$skiptoken=1' }

  it('masks tokens/secrets when output is stored and truncates oversized lists by rows', () => {
    const { output: shaped, truncated } = shapeOutput(output)
    expect(truncated).toBe(false); expect(JSON.stringify(shaped)).not.toMatch(/abcdefghijklmnop|hunter22/)
    const big = { value: Array.from({ length: 200 }, (_, i) => ({ id: i, pad: 'x'.repeat(100) })) }
    const t = shapeOutput(big, 5000); expect(t.truncated).toBe(true); expect((t.output as { value: unknown[] }).value.length).toBeLessThan(200)
  })
  it('JSON download contains no tokens, secrets, authorization headers or masked placeholders', () => {
    const stored = redactJson({ ...output, headers: { Authorization: 'Bearer abcdefghijklmnopqrst' } })
    const json = buildJson(stored)
    expect(json).not.toMatch(/abcdefghijklmnop|hunter22|Authorization|REDACTED/); expect(JSON.parse(json).value[0].displayName).toBe('Mac, "A"')
  })
  it('CSV download: proper quoting, union of columns, nested values as JSON, formula injection neutralised, no secrets', () => {
    const csv = buildCsv(redactJson(output))!
    const [header, row1] = csv.split('\r\n')
    expect(header).toBe('"id","displayName","note","meta"'); expect(row1).toContain('"Mac, ""A"""'); expect(row1).toContain(`"'=HYPERLINK(""x"")"`); expect(row1).toContain('"{""a"":1}"')
    expect(csv).not.toMatch(/abcdefghijklmnop|hunter22|REDACTED|odata/)
    expect(buildCsv({ id: 'x' })).toBeNull()
  })
  it('summary text includes request metadata and states that no secrets are present', () => {
    const t = buildSummaryTxt({ id: 'r1', name: 'N', requestedBy: 'a@x.com', requestedAt: '2026-11-24T00:00:00Z', method: 'GET', endpoint: '/users', version: 'v1.0', classification: 'read_only', status: 'executed', httpStatus: 200, durationMs: 120, correlationId: 'cid', approvalStatus: 'not_required' })
    expect(t).toMatch(/HTTP status:\s+200/); expect(t).toMatch(/Correlation ID:\s+cid/); expect(t).toMatch(/No tokens, secrets/); expect(t).not.toMatch(/Bearer/)
  })
  it('stripMasked removes masked keys entirely', () => { expect(stripMasked({ a: '[REDACTED]', b: { c: 'x', d: 'Password=[REDACTED]' } })).toEqual({ b: { c: 'x' } }) })
})
