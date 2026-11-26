import type { ReactNode } from 'react'
import type { RoleActivityEvent } from '../../api/roleActivity'
import { SOURCE_LABELS } from '../../api/roleActivity'
import { formatInTimezone, formatUtc } from '../../lib/timezone'

export interface ColumnDef {
  key: string
  label: string
  sortable?: boolean
  render: (event: RoleActivityEvent, timezone: string) => ReactNode
}

// One distinct badge color per source, following the same
// bg-*-50/text-*-700 pattern the old Result badge used.
const SOURCE_BADGE_STYLE: Record<RoleActivityEvent['source'], string> = {
  entra_role_mgmt: 'bg-sky-50 text-sky-700',
  intune_rbac: 'bg-indigo-50 text-indigo-700',
  sharepoint_admin: 'bg-emerald-50 text-emerald-700',
}

// Column keys for the sortable columns match the server's sortField enum
// exactly (occurredAt|source|actor|operation|target) — see listQuerySchema
// in server/src/routes/roleActivity.ts.
export const ALL_COLUMNS: ColumnDef[] = [
  { key: 'occurredAt', label: 'Time (UTC)', sortable: true, render: e => <span className="whitespace-nowrap font-mono text-[0.68rem]">{formatUtc(new Date(e.occurredAt))}</span> },
  { key: 'occurredAtLocal', label: 'Time (local)', render: (e, tz) => <span className="whitespace-nowrap text-[0.68rem] text-slate-500">{formatInTimezone(new Date(e.occurredAt), tz)}</span> },
  { key: 'source', label: 'Source', sortable: true, render: e => (
    <span className={`rounded px-1.5 py-0.5 text-[0.65rem] font-semibold ${SOURCE_BADGE_STYLE[e.source]}`}>
      {SOURCE_LABELS[e.source]}
    </span>
  ) },
  { key: 'operation', label: 'Operation', sortable: true, render: e => e.operation ?? '—' },
  { key: 'actor', label: 'Actor', sortable: true, render: e => e.actor ?? '—' },
  { key: 'target', label: 'Target', sortable: true, render: e => e.target ?? '—' },
  { key: 'sourceRecordId', label: 'Source Record ID', render: e => <span className="font-mono text-[0.65rem] text-slate-400">{e.sourceRecordId.slice(0, 20)}</span> },
]

export const DEFAULT_VISIBLE_COLUMNS = ['occurredAt', 'source', 'operation', 'actor', 'target']
