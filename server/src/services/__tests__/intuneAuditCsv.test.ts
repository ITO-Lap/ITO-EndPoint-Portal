import { describe, it, expect } from 'vitest'
import { escapeCsvCell, csvRowLine, csvHeaderLine } from '../intuneAuditCsv.js'
import type { GraphAuditEvent } from '../intuneAuditGraph.js'

function fakeEvent(overrides: Partial<GraphAuditEvent> = {}): GraphAuditEvent {
  return {
    id: 'evt-1', displayName: 'Update policy', componentName: 'DeviceConfiguration',
    category: 'DeviceConfiguration', activity: 'Update', activityDateTime: '2026-03-01T12:00:00Z',
    activityType: 'Update', activityOperationType: 'Patch', activityResult: 'Success',
    correlationId: 'corr-1',
    actor: { type: 'ItPro', userPermissions: null, applicationId: null, applicationDisplayName: null, userPrincipalName: 'admin@zinnia.com', servicePrincipalName: null, ipAddress: '10.0.0.1', userId: 'u1' },
    resources: [{ displayName: 'Baseline Policy', type: 'DeviceConfiguration', resourceId: 'res-1', modifiedProperties: [{ displayName: 'complianceGracePeriod', oldValue: '1', newValue: '2' }] }],
    ...overrides,
  }
}

// Cells containing a comma/CR also get RFC-4180 quote-wrapped, so the raw
// escaped string may start with `"` rather than `'` — unwrap first to check
// the underlying content, which is what a spreadsheet app actually reads.
function unwrapCsvCell(escaped: string): string {
  if (escaped.startsWith('"') && escaped.endsWith('"')) {
    return escaped.slice(1, -1).replace(/""/g, '"')
  }
  return escaped
}

describe('escapeCsvCell — formula injection protection', () => {
  it.each(['=SUM(A1:A9)', '+1+1', '-1+1', '@SUM(1,2)', '\tcmd', '\rcmd'])(
    'prefixes a leading %s with an apostrophe',
    (dangerous) => {
      expect(unwrapCsvCell(escapeCsvCell(dangerous)).startsWith("'")).toBe(true)
    }
  )

  it('does not alter a normal string', () => {
    expect(escapeCsvCell('Baseline Policy')).toBe('Baseline Policy')
  })

  it('quotes and escapes embedded quotes/commas/newlines per RFC 4180', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"')
    expect(escapeCsvCell('a"b')).toBe('"a""b"')
    expect(escapeCsvCell('a\nb')).toBe('"a\nb"')
  })

  it('neutralizes a formula even after quoting is otherwise unnecessary', () => {
    const escaped = escapeCsvCell('=cmd|/c calc')
    expect(escaped.startsWith("'")).toBe(true)
  })
})

describe('csvRowLine / csvHeaderLine', () => {
  it('produces a header with the documented column set', () => {
    const header = csvHeaderLine()
    expect(header).toContain('eventId')
    expect(header).toContain('modifiedPropertiesSummary')
    expect(header.endsWith('\r\n')).toBe(true)
  })

  it('flattens resources and modified properties into summary columns', () => {
    const line = csvRowLine(fakeEvent())
    expect(line).toContain('Baseline Policy')
    expect(line).toContain('complianceGracePeriod')
    expect(line).toContain('1 → 2')
  })

  it('preserves full resource detail as JSON in the last column', () => {
    const line = csvRowLine(fakeEvent())
    expect(line).toContain('"resourceId"')
  })

  it('escapes a malicious actor UPN so it cannot execute as a formula when opened in Excel', () => {
    const line = csvRowLine(fakeEvent({
      actor: { type: 'ItPro', userPermissions: null, applicationId: null, applicationDisplayName: null, userPrincipalName: '=HYPERLINK("http://evil")', servicePrincipalName: null, ipAddress: null, userId: null },
    }))
    expect(line).toContain("'=HYPERLINK")
  })
})
