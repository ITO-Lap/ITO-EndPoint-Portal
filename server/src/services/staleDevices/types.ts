// Stale Devices — shared types. Read-only: nothing here retires, wipes, deletes or remediates a device.

export const STALE_DAYS = 21

export type StalePlatform = 'Windows' | 'macOS'
export type StaleStatus = 'stale' | 'active' | 'source_drift' | 'no_checkin_data' | 'needs_review'
export type CorrelationConfidence = 'high' | 'manual' | 'unresolved'
export type ManagedBy = 'Intune' | 'Endpoint Central' | 'Intune + Endpoint Central'
export type StaleSourceId = 'intune' | 'endpoint-central'
/** ok = last read succeeded; not_configured = no credentials (not an error); error = last read failed. */
export type SourceState = 'ok' | 'not_configured' | 'error'

/**
 * One in-scope record from a single management source. Out-of-scope records (non-Windows Intune devices,
 * Windows Server, iOS/Android in Endpoint Central) are dropped before this type is ever created, so they
 * can never be cached, counted, rendered or exported.
 */
export interface SourceRecord {
  source: StaleSourceId
  sourceId: string
  deviceName: string
  platform: StalePlatform
  osVersion: string
  serialNumber: string | null
  username: string
  email: string
  /** Entra (Azure AD) device id — Intune only. Endpoint Central's MDM payload does not carry one. */
  entraDeviceId: string | null
  /** ISO-8601 UTC, or null when the source gave no usable timestamp. */
  lastCheckInAt: string | null
  /** Why lastCheckInAt is null, when it is. */
  checkInIssue?: 'missing' | 'invalid'
  /** `uncertain` = could not tell client from server (or not an MDM-managed record); needs a human. */
  classification: 'client' | 'uncertain'
  classificationReason?: string
  /** Source-specific evidence shown in the drawer (e.g. Intune managementAgent). */
  note?: string
}

export interface SourceMeta {
  state: SourceState
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  error: string | null
  /** In-scope records held for this source. */
  inScope: number
}

export interface SourceEvidence {
  source: StaleSourceId
  sourceId: string
  lastCheckInAt: string | null
  /** recent / stale are relative to the 21-day cutoff. */
  state: 'recent' | 'stale' | 'no_data'
  note: string | null
}

export interface StaleDevice {
  canonicalDeviceId: string
  deviceName: string
  username: string
  email: string
  platform: StalePlatform
  osVersion: string
  serialNumber: string | null
  managedBy: ManagedBy
  intuneDeviceId: string | null
  endpointCentralDeviceId: string | null
  intuneLastSyncAt: string | null
  endpointCentralLastCheckInAt: string | null
  effectiveLastCheckInAt: string | null
  effectiveSource: StaleSourceId | null
  inactiveDays: number | null
  staleStatus: StaleStatus
  correlationConfidence: CorrelationConfidence
  /** Human-readable reason for the status, shown in the drawer. */
  explanation: string
  reviewReasons: string[]
  sourceEvidence: SourceEvidence[]
  /** Names of possible same-name counterparts in the other source (never merged automatically). */
  possibleDuplicateOf: string[]
  sourceDataStatus: Record<StaleSourceId, SourceState>
  lastDataRefreshAt: string | null
}

export interface StaleSnapshot {
  intune: SourceRecord[]
  endpointCentral: SourceRecord[]
  meta: Record<StaleSourceId, SourceMeta>
  syncedAt: string | null
}
