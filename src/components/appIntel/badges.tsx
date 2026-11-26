import type { AppRow, AppStatus, Confidence, CveSeverity, InstallSource, PackagingState, ProviderId } from '../../api/appIntel'
import { INSTALL_SOURCE_LABEL, PROVIDER_LABEL } from '../../api/appIntel'

const STATUS_STYLE: Record<AppStatus, string> = {
  'Up to date':                          'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Update available — existing package': 'bg-sky-50 text-sky-700 border-sky-200',
  'Package required':                    'bg-red-50 text-red-700 border-red-200',
  'Repackage required':                  'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Native update':                       'bg-violet-50 text-violet-700 border-violet-200',
  'Review required':                     'bg-amber-50 text-amber-700 border-amber-200',
  'Data unavailable':                    'bg-slate-50 text-slate-500 border-slate-200',
}

export function StatusBadge({ status }: { status: AppStatus }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.62rem] font-bold ${STATUS_STYLE[status]}`}>{status}</span>
}

const CONF_STYLE: Record<Confidence, string> = {
  high:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low:    'bg-slate-50 text-slate-500 border-slate-200',
}
export const ConfidenceBadge = ({ confidence }: { confidence: Confidence }) =>
  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.6rem] font-bold capitalize ${CONF_STYLE[confidence]}`}>{confidence}</span>

export const ProviderBadge = ({ provider }: { provider: ProviderId }) =>
  <span className="inline-flex rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[0.58rem] font-semibold text-slate-600">{PROVIDER_LABEL[provider]}</span>

const SOURCE_STYLE: Record<InstallSource, string> = {
  custom:         'bg-indigo-50 text-indigo-700 border-indigo-200',
  'self-service': 'bg-teal-50 text-teal-700 border-teal-200',
  manual:         'bg-slate-50 text-slate-600 border-slate-200',
}
export const InstallSourceBadge = ({ source, basis }: { source: InstallSource; basis: 'bundleId' | 'wingetId' | 'name' | 'none' }) => (
  <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.62rem] font-bold ${SOURCE_STYLE[source]}`}
    title={basis === 'name' ? 'Matched to the Intune package by name only (low confidence)' : undefined}>
    {INSTALL_SOURCE_LABEL[source]}{basis === 'name' ? ' · name match' : ''}
  </span>
)

// ── Lifecycle badges ────────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<CveSeverity, string> = {
  CRITICAL: 'bg-red-50 text-red-700 border-red-200', HIGH: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200', LOW: 'bg-sky-50 text-sky-700 border-sky-200',
  NONE: 'bg-slate-50 text-slate-500 border-slate-200', UNKNOWN: 'bg-slate-50 text-slate-500 border-slate-200',
}
export const SeverityBadge = ({ severity, kev }: { severity: CveSeverity; kev?: boolean }) => (
  <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${SEVERITY_STYLE[severity]}`}>
    {severity === 'UNKNOWN' ? 'Unscored' : severity.charAt(0) + severity.slice(1).toLowerCase()}{kev ? ' · exploited' : ''}
  </span>
)

/** Compact CVE state for a table cell. "Not checked" is deliberately distinct from "None found". */
export function CveCell({ cve }: { cve: AppRow['cve'] }) {
  if (!cve || cve.state === 'unmapped') return <span className="text-slate-400" title="No verified NVD product mapping for this app, so CVEs are not checked">Not checked</span>
  if (cve.state === 'pending') return <span className="text-slate-400">Checking…</span>
  if (cve.state === 'unavailable') return <span className="text-amber-700" title="NVD could not be reached or rate-limited the lookup">Unavailable</span>
  if (cve.total === 0) return <span className="text-slate-500" title="None found in NVD for the installed versions (NVD can lag disclosure)">None found</span>
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="font-semibold tabular-nums text-slate-700">{cve.total} CVE{cve.total === 1 ? '' : 's'}</span>
      {cve.highestSeverity && <SeverityBadge severity={cve.highestSeverity} kev={cve.knownExploited > 0} />}
    </div>
  )
}

const PACKAGING_LABEL: Record<PackagingState, [string, string]> = {
  current: ['Package current', 'bg-emerald-50 text-emerald-700 border-emerald-200'],
  behind: ['Package behind', 'bg-indigo-50 text-indigo-700 border-indigo-200'],
  'no-package': ['No package', 'bg-red-50 text-red-700 border-red-200'],
  unknown: ['Unknown', 'bg-slate-50 text-slate-500 border-slate-200'],
  'not-applicable': ['Vendor updates', 'bg-violet-50 text-violet-700 border-violet-200'],
}
export const PackagingBadge = ({ state }: { state: PackagingState }) => (
  <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${PACKAGING_LABEL[state][1]}`}>{PACKAGING_LABEL[state][0]}</span>
)
