// Shared types for the Role Activity Backup module's live-browse pullers
// (entraRoleAuditPuller.ts, intuneRoleAuditPuller.ts,
// sharepointRoleActivityPuller.ts) and routes/roleActivity.ts.
//
// This module replaces the old roleActivityStore.ts, which held the same
// RoleActivityEvent/RoleActivitySource shapes alongside Postgres upsert/
// sync-state functions. The DB dependency for this feature has been removed
// entirely — pullers are now request-scoped live fetchers, not a
// watermark-driven background poller — so only the plain types remain here.

export type RoleActivitySource = 'entra_role_mgmt' | 'intune_rbac' | 'sharepoint_admin'

export interface RoleActivityEvent {
  source: RoleActivitySource
  sourceRecordId: string
  occurredAt: string // ISO-8601
  actor: string | null
  operation: string | null
  target: string | null
  rawJson: unknown
}

/** Explicit UTC range a live-browse request asks each puller to fetch. */
export interface RoleActivityRange {
  startUtc: string // ISO-8601
  endUtc: string // ISO-8601
}
