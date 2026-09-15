// CSV serialization for Intune audit events — flattens nested actor/resource/
// modified-property data into a human-readable row while keeping a machine-
// readable JSON summary column for anything that doesn't fit a flat cell.
//
// Every cell is passed through escapeCsvCell(), which both quotes per RFC
// 4180 and neutralizes CSV/formula injection (OWASP: a cell whose first
// character is =, +, -, @, tab, or CR can be interpreted as a formula by
// Excel/Sheets when the file is opened — we prefix those with a single quote
// so they render as literal text).

import type { GraphAuditEvent } from './intuneAuditGraph.js'

export const CSV_COLUMNS = [
  'eventId', 'activityDateTimeUtc', 'category', 'displayName', 'activity',
  'activityType', 'activityOperationType', 'activityResult', 'componentName',
  'actorType', 'actorUserPrincipalName', 'actorUserId', 'actorApplicationName',
  'actorApplicationId', 'servicePrincipalName', 'ipAddress', 'correlationId',
  'resourceCount', 'resourceSummary', 'modifiedPropertiesSummary', 'resourcesJson',
] as const

const FORMULA_TRIGGER_CHARS = new Set(['=', '+', '-', '@', '\t', '\r'])

export function escapeCsvCell(value: string): string {
  let v = value
  if (v.length > 0 && FORMULA_TRIGGER_CHARS.has(v.charAt(0))) {
    v = `'${v}`
  }
  const needsQuoting = /[",\n\r]/.test(v)
  if (!needsQuoting) return v
  return `"${v.replace(/"/g, '""')}"`
}

function summarizeResources(event: GraphAuditEvent): string {
  return (event.resources ?? [])
    .map(r => `${r.displayName ?? r.resourceId ?? 'unknown'}${r.type ? ` (${r.type})` : ''}`)
    .join('; ')
}

function summarizeModifiedProperties(event: GraphAuditEvent): string {
  const props = (event.resources ?? []).flatMap(r => r.modifiedProperties ?? [])
  if (props.length === 0) return ''
  return props
    .map(p => `${p.displayName ?? 'property'}: ${p.oldValue ?? '(none)'} → ${p.newValue ?? '(none)'}`)
    .join('; ')
}

export function auditEventToCsvRow(event: GraphAuditEvent): string[] {
  return [
    event.id,
    event.activityDateTime,
    event.category ?? '',
    event.displayName ?? '',
    event.activity ?? '',
    event.activityType ?? '',
    event.activityOperationType ?? '',
    event.activityResult ?? '',
    event.componentName ?? '',
    event.actor?.type ?? '',
    event.actor?.userPrincipalName ?? '',
    event.actor?.userId ?? '',
    event.actor?.applicationDisplayName ?? '',
    event.actor?.applicationId ?? '',
    event.actor?.servicePrincipalName ?? '',
    event.actor?.ipAddress ?? '',
    event.correlationId ?? '',
    String((event.resources ?? []).length),
    summarizeResources(event),
    summarizeModifiedProperties(event),
    JSON.stringify(event.resources ?? []),
  ]
}

export function csvHeaderLine(): string {
  return CSV_COLUMNS.map(escapeCsvCell).join(',') + '\r\n'
}

export function csvRowLine(event: GraphAuditEvent): string {
  return auditEventToCsvRow(event).map(escapeCsvCell).join(',') + '\r\n'
}
