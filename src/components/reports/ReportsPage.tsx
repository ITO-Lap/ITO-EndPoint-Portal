import { useState, useEffect, useCallback } from 'react'
import { api } from '../../api'
import type { ReportMeta, ReportResult, ReportColumn, ReportSummaryCard, IntegrationStatusItem } from '../../api'

// ── Source tab config ──────────────────────────────────────────────────────────

type SourceKey = 'all' | 'intune' | 'manageengine' | 'graph' | 'slack'

const SOURCE_TABS: { key: SourceKey; label: string; logo: string; badge?: string }[] = [
  { key: 'all',         label: 'All Sources',    logo: 'M4 6h16M4 12h16M4 18h16' },
  { key: 'intune',      label: 'Intune',         logo: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  { key: 'manageengine',label: 'ManageEngine',   logo: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  { key: 'graph',       label: 'Microsoft Graph',logo: 'M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z', badge: 'API' },
  { key: 'slack',       label: 'Slack Audit',    logo: 'M14.5 10c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5zm-5 0c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5zM14.5 21c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5zm-5 0c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5zM4.5 14c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5h5c.83 0 1.5.67 1.5 1.5S10.33 14 9.5 14h-5zm10 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5h5c.83 0 1.5.67 1.5 1.5S20.33 14 19.5 14h-5z', badge: 'Logs' },
]

const GRAPH_CATEGORIES = new Set(['endpoint', 'threat', 'identity', 'audit'])
const SLACK_CATEGORIES = new Set(['slack-access', 'slack-channel', 'slack-users', 'slack-files', 'slack-compliance'])

// ── Graph domain definitions ───────────────────────────────────────────────────

const GRAPH_DOMAINS = [
  {
    category: 'endpoint',
    label: 'Endpoint Management',
    description: 'Device inventory, compliance policies, app deployment, OS patching, configuration profiles, and enrollment health via Microsoft Intune.',
    source: 'Microsoft Intune',
    iconPath: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
    bg:     'bg-orange-500',
    light:  'bg-orange-50',
    text:   'text-orange-700',
    border: 'border-orange-500',
    ring:   'ring-orange-200',
    pill:   'bg-orange-100 text-orange-700',
    selBorder: 'border-orange-500',
    selRing:   'ring-2 ring-orange-200',
    selHeader: 'bg-orange-500',
  },
  {
    category: 'threat',
    label: 'Security & Threat',
    description: 'Security alerts, CVE exposure, antivirus health, risky sign-ins, conditional access failures, and PIM role activations from Microsoft Defender.',
    source: 'Microsoft Defender',
    iconPath: 'M9 12l2 2 4-4m-4-3a9 9 0 110 18 9 9 0 010-18z M12 8v4l3 3',
    bg:     'bg-red-500',
    light:  'bg-red-50',
    text:   'text-red-700',
    border: 'border-red-500',
    ring:   'ring-red-200',
    pill:   'bg-red-100 text-red-700',
    selBorder: 'border-red-500',
    selRing:   'ring-2 ring-red-200',
    selHeader: 'bg-red-500',
  },
  {
    category: 'identity',
    label: 'Identity & Users',
    description: 'Sign-in activity, MFA registration status, and inactive user accounts from Microsoft Entra ID (formerly Azure Active Directory).',
    source: 'Microsoft Entra ID',
    iconPath: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
    bg:     'bg-emerald-500',
    light:  'bg-emerald-50',
    text:   'text-emerald-700',
    border: 'border-emerald-500',
    ring:   'ring-emerald-200',
    pill:   'bg-emerald-100 text-emerald-700',
    selBorder: 'border-emerald-500',
    selRing:   'ring-2 ring-emerald-200',
    selHeader: 'bg-emerald-500',
  },
  {
    category: 'audit',
    label: 'Compliance & Audit',
    description: 'Directory audit log events and DLP policy match incidents from Microsoft Purview for governance, risk, and compliance.',
    source: 'Microsoft Purview',
    iconPath: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
    bg:     'bg-amber-500',
    light:  'bg-amber-50',
    text:   'text-amber-700',
    border: 'border-amber-500',
    ring:   'ring-amber-200',
    pill:   'bg-amber-100 text-amber-700',
    selBorder: 'border-amber-500',
    selRing:   'ring-2 ring-amber-200',
    selHeader: 'bg-amber-500',
  },
] as const

// ── Slack domain definitions ───────────────────────────────────────────────────

const SLACK_DOMAINS = [
  {
    category:    'slack-access',
    label:       'Access & Auth',
    description: 'Login events, SSO/SAML flows, failed authentications, and two-factor authentication enrollment status across all workspace members.',
    source:      'Slack Audit Logs',
    iconPath:    'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z',
    bg:      'bg-lime-500',
    light:   'bg-lime-50',
    text:    'text-lime-700',
    border:  'border-lime-500',
    pill:    'bg-lime-100 text-lime-700',
    selBorder:'border-lime-500',
    selRing: 'ring-2 ring-lime-200',
  },
  {
    category:    'slack-channel',
    label:       'Messages & Channels',
    description: 'Channel activity metrics, message retention exceptions, and external Slack Connect shared channels with partner workspaces.',
    source:      'Slack Audit Logs',
    iconPath:    'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
    bg:      'bg-lime-500',
    light:   'bg-lime-50',
    text:    'text-lime-700',
    border:  'border-lime-500',
    pill:    'bg-lime-100 text-lime-700',
    selBorder:'border-lime-500',
    selRing: 'ring-2 ring-lime-200',
  },
  {
    category:    'slack-users',
    label:       'User Management',
    description: 'User provisioning lifecycle, guest and external collaborator access, and workspace role and permission change audit trail.',
    source:      'Slack Audit Logs',
    iconPath:    'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
    bg:      'bg-lime-500',
    light:   'bg-lime-50',
    text:    'text-lime-700',
    border:  'border-lime-500',
    pill:    'bg-lime-100 text-lime-700',
    selBorder:'border-lime-500',
    selRing: 'ring-2 ring-lime-200',
  },
  {
    category:    'slack-files',
    label:       'Files & Apps',
    description: 'File sharing audit, public link creation and revocation, OAuth app installations with scope analysis, and DLP-flagged file events.',
    source:      'Slack Audit Logs',
    iconPath:    'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z',
    bg:      'bg-teal-500',
    light:   'bg-teal-50',
    text:    'text-teal-700',
    border:  'border-teal-500',
    pill:    'bg-teal-100 text-teal-700',
    selBorder:'border-teal-500',
    selRing: 'ring-2 ring-teal-200',
  },
  {
    category:    'slack-compliance',
    label:       'Compliance & Retention',
    description: 'DLP policy violation alerts, eDiscovery export request log, and data retention policy configuration compliance across all channels.',
    source:      'Slack Audit Logs',
    iconPath:    'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
    bg:      'bg-rose-500',
    light:   'bg-rose-50',
    text:    'text-rose-700',
    border:  'border-rose-500',
    pill:    'bg-rose-100 text-rose-700',
    selBorder:'border-rose-500',
    selRing: 'ring-2 ring-rose-200',
  },
] as const

// ── Category metadata ──────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  inventory:          { label: 'Inventory',          color: 'bg-orange-50 text-orange-700 border-orange-200' },
  compliance:         { label: 'Compliance',         color: 'bg-green-50 text-green-700 border-green-200' },
  security:           { label: 'Security',           color: 'bg-red-50 text-red-700 border-red-200' },
  software:           { label: 'Software',           color: 'bg-lime-50 text-lime-700 border-lime-200' },
  health:             { label: 'Health',             color: 'bg-amber-50 text-amber-700 border-amber-200' },
  users:              { label: 'Users',              color: 'bg-slate-50 text-slate-700 border-slate-200' },
  endpoint:           { label: 'Endpoint Mgmt',      color: 'bg-orange-50 text-orange-700 border-orange-200' },
  threat:             { label: 'Security & Threat',  color: 'bg-red-50 text-red-800 border-red-300' },
  identity:           { label: 'Identity & Users',   color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  audit:              { label: 'Compliance & Audit', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  'slack-access':     { label: 'Access & Auth',      color: 'bg-lime-50 text-lime-700 border-lime-200' },
  'slack-channel':    { label: 'Messages & Channels',color: 'bg-lime-50 text-lime-700 border-lime-200' },
  'slack-users':      { label: 'User Management',    color: 'bg-lime-50 text-lime-700 border-lime-200' },
  'slack-files':      { label: 'Files & Apps',       color: 'bg-teal-50 text-teal-700 border-teal-200' },
  'slack-compliance': { label: 'Compliance & Retention', color: 'bg-rose-50 text-rose-700 border-rose-200' },
}

const SUMMARY_COLORS: Record<ReportSummaryCard['color'], string> = {
  green:  'bg-green-50 border-green-200 text-green-800',
  red:    'bg-red-50 border-red-200 text-red-800',
  amber:  'bg-amber-50 border-amber-200 text-amber-800',
  sky:    'bg-orange-50 border-orange-200 text-orange-800',
  slate:  'bg-slate-50 border-slate-200 text-slate-800',
  violet: 'bg-lime-50 border-lime-200 text-lime-800',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return '1d ago'
  if (diffDays < 30) return `${diffDays}d ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
  return `${Math.floor(diffDays / 365)}y ago`
}

function reportMatchesSource(report: ReportMeta, source: SourceKey): boolean {
  if (source === 'all') return true
  if (source === 'graph') return GRAPH_CATEGORIES.has(report.category)
  if (source === 'slack') return SLACK_CATEGORIES.has(report.category)
  return report.sources.includes(source)
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function CategoryPill({ category }: { category: string }) {
  const meta = CATEGORY_META[category] ?? { label: category, color: 'bg-slate-50 text-slate-600 border-slate-200' }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${meta.color}`}>
      {meta.label}
    </span>
  )
}

function CellValue({ col, value }: { col: ReportColumn; value: unknown }) {
  const str = value == null ? '—' : String(value)

  if (col.type === 'badge') {
    const lc = str.toLowerCase()
    const color =
      lc === 'compliant'           ? 'bg-green-100 text-green-800' :
      lc === 'non-compliant'       ? 'bg-red-100 text-red-800' :
      lc === 'warning'             ? 'bg-amber-100 text-amber-800' :
      lc === 'enabled'             ? 'bg-green-100 text-green-800' :
      lc === 'disabled'            ? 'bg-red-100 text-red-800' :
      lc === 'windows'             ? 'bg-orange-100 text-orange-800' :
      lc === 'macos'               ? 'bg-slate-100 text-slate-800' :
      lc === 'linux'               ? 'bg-orange-100 text-orange-800' :
      lc === 'active'              ? 'bg-teal-100 text-teal-800' :
      lc === 'inactive'            ? 'bg-slate-100 text-slate-600' :
      lc === 'critical'            ? 'bg-red-100 text-red-900 font-bold' :
      lc === 'high'                ? 'bg-orange-100 text-orange-800' :
      lc === 'medium'              ? 'bg-amber-100 text-amber-800' :
      lc === 'low'                 ? 'bg-green-100 text-green-700' :
      lc === 'new'                 ? 'bg-orange-100 text-orange-800' :
      lc === 'in progress'         ? 'bg-amber-100 text-amber-800' :
      lc === 'resolved'            ? 'bg-green-100 text-green-800' :
      lc === 'dismissed'           ? 'bg-slate-100 text-slate-500' :
      lc === 'blocked'             ? 'bg-red-100 text-red-800' :
      lc === 'enrolled'            ? 'bg-green-100 text-green-800' :
      lc === 'pending'             ? 'bg-amber-100 text-amber-800' :
      lc === 'up to date'          ? 'bg-green-100 text-green-800' :
      lc === 'overdue'             ? 'bg-red-100 text-red-800' :
      lc === 'pending restart'     ? 'bg-amber-100 text-amber-800' :
      lc === 'update available'    ? 'bg-orange-100 text-orange-800' :
      lc === 'registered'          ? 'bg-green-100 text-green-800' :
      lc === 'not registered'      ? 'bg-red-100 text-red-800' :
      lc === 'capable'             ? 'bg-teal-100 text-teal-800' :
      lc === 'not capable'         ? 'bg-slate-100 text-slate-500' :
      lc === 'success'             ? 'bg-green-100 text-green-800' :
      lc === 'failure'             ? 'bg-red-100 text-red-800' :
      lc === 'approved'            ? 'bg-green-100 text-green-800' :
      lc === 'denied'              ? 'bg-red-100 text-red-800' :
      lc === 'clean'               ? 'bg-green-100 text-green-800' :
      lc === 'threat found'        ? 'bg-red-100 text-red-900' :
      lc === 'quarantined'         ? 'bg-orange-100 text-orange-800' :
      lc === 'yes'                 ? 'bg-red-100 text-red-800' :
      lc === 'no'                  ? 'bg-green-100 text-green-700' :
      'bg-slate-100 text-slate-700'
    return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{str}</span>
  }

  if (col.type === 'percent') {
    const num = parseFloat(str)
    const pct = isNaN(num) ? str : `${num.toFixed(1)}%`
    const color = num >= 90 ? 'text-green-700' : num >= 70 ? 'text-amber-700' : 'text-red-700'
    return <span className={`font-mono text-sm font-medium ${color}`}>{pct}</span>
  }

  if (col.type === 'date') {
    if (!value) return <span className="text-slate-400">—</span>
    try {
      const d = new Date(str)
      const formatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      const ago = getRelativeTime(d)
      return (
        <span className="text-slate-600 text-sm" title={str}>
          {formatted} <span className="text-slate-400 text-xs">({ago})</span>
        </span>
      )
    } catch { return <span className="text-slate-600 text-sm">{str}</span> }
  }

  if (col.type === 'number') {
    const num = typeof value === 'number' ? value : parseFloat(str)
    return <span className="font-mono text-sm">{isNaN(num) ? str : num.toLocaleString()}</span>
  }

  return <span className="text-sm text-slate-700">{str || '—'}</span>
}

function SummaryCards({ cards }: { cards: ReportSummaryCard[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 mb-5">
      {cards.map(card => (
        <div key={card.label} className={`rounded-xl border p-3 ${SUMMARY_COLORS[card.color]}`}>
          <p className="text-xs font-medium opacity-75 mb-1 truncate">{card.label}</p>
          <p className="text-xl font-bold">
            {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
          </p>
        </div>
      ))}
    </div>
  )
}

// ── Source tabs ────────────────────────────────────────────────────────────────

function SourceTabs({
  active, onChange, reports, integrations,
}: {
  active: SourceKey
  onChange: (key: SourceKey) => void
  reports: ReportMeta[]
  integrations: IntegrationStatusItem[]
}) {
  function countFor(key: SourceKey) {
    if (key === 'all') return reports.length
    if (key === 'graph') return reports.filter(r => GRAPH_CATEGORIES.has(r.category)).length
    if (key === 'slack') return reports.filter(r => SLACK_CATEGORIES.has(r.category)).length
    return reports.filter(r => r.sources.includes(key)).length
  }
  function statusFor(key: SourceKey): 'connected' | 'disconnected' | null {
    if (key === 'all' || key === 'graph' || key === 'slack') return null
    const item = integrations.find(i => i.id === key)
    if (!item) return null
    return item.configured && item.healthy !== false ? 'connected' : 'disconnected'
  }

  return (
    <div className="mb-5 flex items-center gap-1 rounded-2xl bg-white border border-slate-200 shadow-sm p-1.5 overflow-x-auto">
      {SOURCE_TABS.map(tab => {
        const isActive = active === tab.key
        const status = statusFor(tab.key)
        const count = countFor(tab.key)
        return (
          <button key={tab.key} onClick={() => onChange(tab.key)}
            className={`relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all flex-shrink-0 ${
              isActive ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d={tab.logo} />
            </svg>
            <span>{tab.label}</span>
            {tab.badge && (
              <span className={`rounded px-1 py-px text-[10px] font-bold tracking-wide ${
                isActive ? 'bg-orange-400/30 text-orange-100' : 'bg-orange-100 text-orange-600'
              }`}>{tab.badge}</span>
            )}
            {status && (
              <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                status === 'connected'
                  ? isActive ? 'bg-green-400' : 'bg-green-500'
                  : isActive ? 'bg-slate-400' : 'bg-slate-300'
              }`} />
            )}
            <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
              isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
            }`}>{count}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Result table ───────────────────────────────────────────────────────────────

function ResultTable({ result, onSort, sortBy, sortDir }: {
  result: ReportResult; onSort: (field: string) => void
  sortBy?: string; sortDir: 'asc' | 'desc'
}) {
  const widthClass: Record<string, string> = { sm: 'w-20', md: 'w-32', lg: 'w-44', xl: 'w-60' }
  if (result.rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <svg className="h-10 w-10 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm font-medium">No data for this report</p>
        <p className="text-xs mt-1">Connect an MDM source or check configuration</p>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-100 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {result.columns.map(col => (
              <th key={col.key} onClick={() => onSort(col.key)}
                className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 cursor-pointer select-none hover:text-slate-800 transition-colors ${col.align === 'right' ? 'text-right' : 'text-left'} ${col.width ? widthClass[col.width] : ''}`}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {sortBy === col.key
                    ? <span className="text-slate-800">{sortDir === 'asc' ? '↑' : '↓'}</span>
                    : <span className="opacity-20">↕</span>}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 bg-white">
          {result.rows.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50 transition-colors">
              {result.columns.map(col => (
                <td key={col.key} className={`px-4 py-2.5 ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                  <CellValue col={col} value={row[col.key]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Pagination ─────────────────────────────────────────────────────────────────

function Pagination({ total, offset, limit, onPage }: {
  total: number; offset: number; limit: number; onPage: (offset: number) => void
}) {
  const totalPages = Math.ceil(total / limit)
  const currentPage = Math.floor(offset / limit) + 1
  if (totalPages <= 1) return null
  const pages: (number | '...')[] = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    if (currentPage > 3) pages.push('...')
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i)
    if (currentPage < totalPages - 2) pages.push('...')
    pages.push(totalPages)
  }
  return (
    <div className="flex items-center justify-between mt-4 text-sm text-slate-600">
      <span>Showing {offset + 1}–{Math.min(offset + limit, total)} of {total.toLocaleString()} rows</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(Math.max(0, offset - limit))} disabled={offset === 0}
          className="rounded px-2.5 py-1 border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition">←</button>
        {pages.map((p, i) =>
          p === '...' ? <span key={`e-${i}`} className="px-1">…</span> : (
            <button key={p} onClick={() => onPage((p - 1) * limit)}
              className={`rounded px-2.5 py-1 border transition ${p === currentPage ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200 hover:bg-slate-100'}`}>
              {p}
            </button>
          )
        )}
        <button onClick={() => onPage(offset + limit)} disabled={offset + limit >= total}
          className="rounded px-2.5 py-1 border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition">→</button>
      </div>
    </div>
  )
}

// ── Report runner panel (shared) ───────────────────────────────────────────────

function ReportRunner({
  report, result, running, error,
  sortBy, sortDir, offset,
  onSort, onPage, onExport, onRefresh,
  sourceLabel,
}: {
  report: ReportMeta
  result: ReportResult | null
  running: boolean
  error: string | null
  sortBy?: string
  sortDir: 'asc' | 'desc'
  offset: number
  onSort: (f: string) => void
  onPage: (o: number) => void
  onExport: () => void
  onRefresh: () => void
  sourceLabel: string
}) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h2 className="text-base font-semibold text-slate-900">{report.name}</h2>
            <CategoryPill category={report.category} />
            {result?.cached && (
              <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs text-amber-700 font-medium">Cached</span>
            )}
          </div>
          <p className="text-sm text-slate-500">{report.description}</p>
          {report.apiEndpoint && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-mono text-slate-200">
                <svg className="h-3 w-3 flex-shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
                {report.apiEndpoint}
              </span>
              {report.graphSource && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-orange-50 border border-orange-200 px-2.5 py-1 text-xs font-medium text-orange-700">
                  <svg className="h-3 w-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/>
                  </svg>
                  {report.graphSource}
                </span>
              )}
            </div>
          )}
          {result && (
            <p className="text-xs text-slate-400 mt-1.5">
              {result.totalRows.toLocaleString()} rows · generated {new Date(result.generatedAt).toLocaleTimeString()}
              {' · '}<span className="text-slate-500 font-medium">{sourceLabel}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={onRefresh} disabled={running}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition">
            <svg className={`h-3.5 w-3.5 ${running ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {running ? 'Running…' : 'Refresh'}
          </button>
          <button onClick={onExport} disabled={!result || running}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {running && !result && (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-9 rounded-lg bg-slate-100 animate-pulse" style={{ opacity: 1 - i * 0.1 }} />
          ))}
        </div>
      )}
      {result?.summary && result.summary.length > 0 && <SummaryCards cards={result.summary} />}
      {result && (
        <>
          <ResultTable result={result} onSort={onSort} sortBy={sortBy} sortDir={sortDir} />
          <Pagination total={result.totalRows} offset={offset} limit={PAGE_SIZE} onPage={onPage} />
        </>
      )}
    </div>
  )
}

// ── Graph domain view ──────────────────────────────────────────────────────────

function GraphDomainView({
  reports, loadingMeta,
  selectedCategory, onSelectCategory,
  selectedReport, onSelectReport,
  result, running, error,
  sortBy, sortDir, offset,
  onSort, onPage, onExport, onRefresh,
}: {
  reports: ReportMeta[]
  loadingMeta: boolean
  selectedCategory: string
  onSelectCategory: (cat: string) => void
  selectedReport: ReportMeta | null
  onSelectReport: (r: ReportMeta) => void
  result: ReportResult | null
  running: boolean
  error: string | null
  sortBy?: string
  sortDir: 'asc' | 'desc'
  offset: number
  onSort: (f: string) => void
  onPage: (o: number) => void
  onExport: () => void
  onRefresh: () => void
}) {
  const byCategory = Object.fromEntries(
    GRAPH_DOMAINS.map(d => [d.category, reports.filter(r => r.category === d.category)])
  )
  const activeDomain = GRAPH_DOMAINS.find(d => d.category === selectedCategory) ?? null
  const domainReports = activeDomain ? (byCategory[activeDomain.category] ?? []) : []

  return (
    <div className="space-y-5">

      {/* ── Header banner ── */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-5 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <svg className="h-5 w-5 text-orange-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/>
            </svg>
            <h2 className="text-base font-semibold text-white">Microsoft Graph API Reports</h2>
            <span className="rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider bg-orange-500/30 text-orange-300">17 REPORTS</span>
          </div>
          <p className="text-sm text-slate-400">
            Select a domain below to explore reports powered by the Microsoft Graph API across Intune, Defender, Entra ID, and Purview.
          </p>
        </div>
        <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
          {GRAPH_DOMAINS.map(d => (
            <span key={d.category} className={`rounded-full px-2.5 py-1 text-xs font-medium ${d.pill}`}>
              {d.source.replace('Microsoft ', '')}
            </span>
          ))}
        </div>
      </div>

      {/* ── 4 Domain cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loadingMeta
          ? [...Array(4)].map((_, i) => (
              <div key={i} className="h-52 rounded-2xl bg-slate-100 animate-pulse" />
            ))
          : GRAPH_DOMAINS.map(domain => {
              const isSelected = selectedCategory === domain.category
              const count = byCategory[domain.category]?.length ?? 0
              const domainRpts = byCategory[domain.category] ?? []
              return (
                <button
                  key={domain.category}
                  onClick={() => onSelectCategory(isSelected ? 'all' : domain.category)}
                  className={`group relative text-left rounded-2xl border-2 bg-white transition-all duration-200 overflow-hidden
                    ${isSelected
                      ? `${domain.selBorder} ${domain.selRing} shadow-md -translate-y-0.5`
                      : 'border-slate-200 hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5'
                    }`}
                >
                  {/* Colored top bar */}
                  <div className={`h-1.5 w-full ${domain.bg}`} />

                  <div className="p-5">
                    {/* Icon + title row */}
                    <div className="flex items-start gap-3 mb-4">
                      <div className={`h-10 w-10 flex-shrink-0 rounded-xl ${domain.light} flex items-center justify-center`}>
                        <svg className={`h-5 w-5 ${domain.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={domain.iconPath} />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 leading-snug">{domain.label}</p>
                        <p className={`text-xs font-medium mt-0.5 ${domain.text}`}>{domain.source}</p>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-slate-500 leading-relaxed mb-4 line-clamp-3">{domain.description}</p>

                    {/* Report name chips */}
                    <div className="flex flex-wrap gap-1 mb-4">
                      {domainRpts.slice(0, 3).map(r => (
                        <span key={r.id} className={`rounded-full px-2 py-0.5 text-[10px] font-medium truncate max-w-[120px] ${domain.pill}`}>
                          {r.name.replace(/\(Graph\)/, '').trim()}
                        </span>
                      ))}
                      {count > 3 && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-500">
                          +{count - 3} more
                        </span>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">
                        <span className="font-semibold text-slate-700 text-sm">{count}</span>
                        {' '}report{count !== 1 ? 's' : ''}
                      </span>
                      <span className={`text-xs font-semibold flex items-center gap-1 transition-all ${
                        isSelected ? domain.text : 'text-slate-400 group-hover:text-slate-600'
                      }`}>
                        {isSelected ? 'Hide ↑' : 'Explore →'}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })
        }
      </div>

      {/* ── Report cards for selected domain ── */}
      {activeDomain && (
        <div className="space-y-4">
          {/* Section header */}
          <div className={`flex items-center gap-3 rounded-xl border-l-4 ${activeDomain.selBorder} bg-white border border-slate-200 shadow-sm px-5 py-3`}>
            <div className={`h-8 w-8 flex-shrink-0 rounded-lg ${activeDomain.light} flex items-center justify-center`}>
              <svg className={`h-4 w-4 ${activeDomain.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d={activeDomain.iconPath} />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900">{activeDomain.label} Reports</p>
              <p className="text-xs text-slate-500">{activeDomain.source} · {domainReports.length} reports available</p>
            </div>
            {selectedReport && GRAPH_CATEGORIES.has(selectedReport.category) && selectedReport.category === activeDomain.category && (
              <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${activeDomain.pill}`}>
                Viewing: {selectedReport.name}
              </span>
            )}
          </div>

          {/* Report cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {domainReports.map(report => {
              const isSelected = selectedReport?.id === report.id
              return (
                <button
                  key={report.id}
                  onClick={() => onSelectReport(report)}
                  className={`group text-left rounded-xl border-2 bg-white p-4 transition-all duration-150 hover:-translate-y-0.5
                    ${isSelected
                      ? `${activeDomain.selBorder} ${activeDomain.selRing} shadow-md`
                      : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
                    }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className={`text-sm font-semibold leading-snug ${isSelected ? 'text-slate-900' : 'text-slate-800'}`}>
                      {report.name}
                    </p>
                    {isSelected && (
                      <span className={`flex-shrink-0 h-4 w-4 rounded-full ${activeDomain.bg} flex items-center justify-center`}>
                        <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                        </svg>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed mb-3 line-clamp-2">{report.description}</p>
                  {report.apiEndpoint && (
                    <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5">
                      <svg className="h-3 w-3 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                      </svg>
                      <code className="text-[10px] font-mono text-slate-500 truncate">{report.apiEndpoint}</code>
                    </div>
                  )}
                  <div className={`mt-3 text-xs font-semibold flex items-center gap-1 transition-colors ${
                    isSelected ? activeDomain.text : `text-slate-400 group-hover:${activeDomain.text}`
                  }`}>
                    {isSelected ? (
                      <>
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6"/></svg>
                        Report loaded below
                      </>
                    ) : (
                      <>
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        Run Report
                      </>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Report runner ── */}
      {selectedReport && activeDomain && selectedReport.category === activeDomain.category && (
        <ReportRunner
          report={selectedReport}
          result={result}
          running={running}
          error={error}
          sortBy={sortBy}
          sortDir={sortDir}
          offset={offset}
          onSort={onSort}
          onPage={onPage}
          onExport={onExport}
          onRefresh={onRefresh}
          sourceLabel="Microsoft Graph API"
        />
      )}

      {/* Empty state when no domain selected */}
      {!activeDomain && !loadingMeta && (
        <div className="flex items-center justify-center py-10 rounded-2xl border border-dashed border-slate-300 bg-white text-slate-400">
          <div className="text-center px-6">
            <svg className="h-10 w-10 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/>
            </svg>
            <p className="text-sm font-medium text-slate-500">Select a domain above</p>
            <p className="text-xs mt-1">Click any of the 4 cards to explore reports in that category</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Slack domain view ──────────────────────────────────────────────────────────

function SlackDomainView({
  reports, loadingMeta,
  selectedCategory, onSelectCategory,
  selectedReport, onSelectReport,
  result, running, error,
  sortBy, sortDir, offset,
  onSort, onPage, onExport, onRefresh,
}: {
  reports: ReportMeta[]
  loadingMeta: boolean
  selectedCategory: string
  onSelectCategory: (cat: string) => void
  selectedReport: ReportMeta | null
  onSelectReport: (r: ReportMeta) => void
  result: ReportResult | null
  running: boolean
  error: string | null
  sortBy?: string
  sortDir: 'asc' | 'desc'
  offset: number
  onSort: (f: string) => void
  onPage: (o: number) => void
  onExport: () => void
  onRefresh: () => void
}) {
  const byCategory = Object.fromEntries(
    SLACK_DOMAINS.map(d => [d.category, reports.filter(r => r.category === d.category)])
  )
  const activeDomain = SLACK_DOMAINS.find(d => d.category === selectedCategory) ?? null
  const domainReports = activeDomain ? (byCategory[activeDomain.category] ?? []) : []
  const totalSlack = reports.filter(r => SLACK_CATEGORIES.has(r.category)).length

  return (
    <div className="space-y-5">
      {/* ── Header banner ── */}
      <div className="rounded-2xl p-5 flex items-center justify-between gap-4"
        style={{ background: 'linear-gradient(135deg, #4A154B 0%, #611f69 60%, #7c3085 100%)' }}>
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <svg className="h-5 w-5 text-lime-200 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 10c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5zm-5 0c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5zM14.5 21c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5zm-5 0c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5zM4.5 14c-.83 0-1.5-.67-1.5-1.5S3.67 11 4.5 11h5c.83 0 1.5.67 1.5 1.5S10.33 14 9.5 14h-5zm10 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5h5c.83 0 1.5.67 1.5 1.5S20.33 14 19.5 14h-5z"/>
            </svg>
            <h2 className="text-base font-semibold text-white">Slack Audit Log Reports</h2>
            <span className="rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider bg-white/20 text-lime-100">{totalSlack} REPORTS</span>
          </div>
          <p className="text-sm text-lime-200">
            Select a domain below to explore Slack Audit Logs — access, channels, users, files, and compliance across your workspace.
          </p>
        </div>
        <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
          {SLACK_DOMAINS.map(d => (
            <span key={d.category} className="rounded-full px-2.5 py-1 text-xs font-medium bg-white/15 text-lime-100">
              {d.label}
            </span>
          ))}
        </div>
      </div>

      {/* ── 5 Domain cards in one row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {loadingMeta
          ? [...Array(5)].map((_, i) => <div key={i} className="h-48 rounded-2xl bg-slate-100 animate-pulse" />)
          : SLACK_DOMAINS.map(domain => {
              const isSelected = selectedCategory === domain.category
              const count = byCategory[domain.category]?.length ?? 0
              const domainRpts = byCategory[domain.category] ?? []
              return (
                <button
                  key={domain.category}
                  onClick={() => onSelectCategory(isSelected ? 'all' : domain.category)}
                  className={`group relative text-left rounded-2xl border-2 bg-white transition-all duration-200 overflow-hidden
                    ${isSelected
                      ? `${domain.selBorder} ${domain.selRing} shadow-md -translate-y-0.5`
                      : 'border-slate-200 hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5'
                    }`}
                >
                  <div className={`h-1.5 w-full ${domain.bg}`} />
                  <div className="p-4">
                    <div className="flex items-start gap-2.5 mb-3">
                      <div className={`h-9 w-9 flex-shrink-0 rounded-xl ${domain.light} flex items-center justify-center`}>
                        <svg className={`h-4.5 w-4.5 ${domain.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={domain.iconPath} />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 leading-snug">{domain.label}</p>
                        <p className={`text-[10px] font-medium mt-0.5 ${domain.text}`}>{domain.source}</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed mb-3 line-clamp-3">{domain.description}</p>
                    <div className="flex flex-wrap gap-1 mb-3">
                      {domainRpts.slice(0, 2).map(r => (
                        <span key={r.id} className={`rounded-full px-2 py-0.5 text-[9px] font-medium truncate max-w-full ${domain.pill}`}>
                          {r.name}
                        </span>
                      ))}
                      {count > 2 && (
                        <span className="rounded-full px-2 py-0.5 text-[9px] font-medium bg-slate-100 text-slate-500">
                          +{count - 2} more
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">
                        <span className="font-semibold text-slate-700">{count}</span> report{count !== 1 ? 's' : ''}
                      </span>
                      <span className={`text-[10px] font-semibold transition-all ${
                        isSelected ? domain.text : 'text-slate-400 group-hover:text-slate-600'
                      }`}>
                        {isSelected ? 'Hide ↑' : 'Explore →'}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })
        }
      </div>

      {/* ── Report cards for selected domain ── */}
      {activeDomain && (
        <div className="space-y-4">
          <div className={`flex items-center gap-3 rounded-xl border-l-4 ${activeDomain.selBorder} bg-white border border-slate-200 shadow-sm px-5 py-3`}>
            <div className={`h-8 w-8 flex-shrink-0 rounded-lg ${activeDomain.light} flex items-center justify-center`}>
              <svg className={`h-4 w-4 ${activeDomain.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d={activeDomain.iconPath} />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900">{activeDomain.label} Reports</p>
              <p className="text-xs text-slate-500">{activeDomain.source} · {domainReports.length} reports available</p>
            </div>
            {selectedReport && SLACK_CATEGORIES.has(selectedReport.category) && selectedReport.category === activeDomain.category && (
              <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${activeDomain.pill}`}>
                Viewing: {selectedReport.name}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {domainReports.map(report => {
              const isSelected = selectedReport?.id === report.id
              return (
                <button
                  key={report.id}
                  onClick={() => onSelectReport(report)}
                  className={`group text-left rounded-xl border-2 bg-white p-4 transition-all duration-150 hover:-translate-y-0.5
                    ${isSelected
                      ? `${activeDomain.selBorder} ${activeDomain.selRing} shadow-md`
                      : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
                    }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className={`text-sm font-semibold leading-snug ${isSelected ? 'text-slate-900' : 'text-slate-800'}`}>
                      {report.name}
                    </p>
                    {isSelected && (
                      <span className={`flex-shrink-0 h-4 w-4 rounded-full ${activeDomain.bg} flex items-center justify-center`}>
                        <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                        </svg>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed mb-3 line-clamp-2">{report.description}</p>
                  {report.apiEndpoint && (
                    <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5">
                      <svg className="h-3 w-3 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                      </svg>
                      <code className="text-[10px] font-mono text-slate-500 truncate">{report.apiEndpoint}</code>
                    </div>
                  )}
                  <div className={`mt-3 text-xs font-semibold flex items-center gap-1 transition-colors ${
                    isSelected ? activeDomain.text : 'text-slate-400 group-hover:text-slate-600'
                  }`}>
                    {isSelected ? (
                      <><svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6"/></svg>Report loaded below</>
                    ) : (
                      <><svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>Run Report</>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Report runner ── */}
      {selectedReport && activeDomain && selectedReport.category === activeDomain.category && (
        <ReportRunner
          report={selectedReport}
          result={result}
          running={running}
          error={error}
          sortBy={sortBy}
          sortDir={sortDir}
          offset={offset}
          onSort={onSort}
          onPage={onPage}
          onExport={onExport}
          onRefresh={onRefresh}
          sourceLabel="Slack Audit Logs"
        />
      )}

      {!activeDomain && !loadingMeta && (
        <div className="flex items-center justify-center py-10 rounded-2xl border border-dashed border-slate-300 bg-white text-slate-400">
          <div className="text-center px-6">
            <svg className="h-10 w-10 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.5 10c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5zm-5 0c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5zM14.5 21c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5zm-5 0c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5z"/>
            </svg>
            <p className="text-sm font-medium text-slate-500">Select a domain above</p>
            <p className="text-xs mt-1">Click any of the 5 cards to explore Slack audit reports</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 100

export function ReportsPage() {
  const [reports, setReports] = useState<ReportMeta[]>([])
  const [integrations, setIntegrations] = useState<IntegrationStatusItem[]>([])
  const [loadingMeta, setLoadingMeta] = useState(true)

  const [activeSource, setActiveSource] = useState<SourceKey>('all')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  const [selectedReport, setSelectedReport] = useState<ReportMeta | null>(null)
  const [result, setResult] = useState<ReportResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<string | undefined>(undefined)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    Promise.all([
      api.listReports(),
      api.fetchIntegrationStatus().catch(() => [] as IntegrationStatusItem[]),
    ]).then(([rpts, ints]) => {
      setReports(rpts)
      setIntegrations(ints)
    }).catch(() => setError('Failed to load report catalog'))
      .finally(() => setLoadingMeta(false))
  }, [])

  const handleSourceChange = useCallback((key: SourceKey) => {
    setActiveSource(key)
    setSelectedCategory('all')
    setSelectedReport(null)
    setResult(null)
    setError(null)
  }, [])

  const runSelected = useCallback(async (
    report: ReportMeta,
    newOffset = 0,
    newSortBy?: string,
    newSortDir?: 'asc' | 'desc',
  ) => {
    setRunning(true)
    setError(null)
    try {
      const res = await api.runReport(report.id, {
        limit:   PAGE_SIZE,
        offset:  newOffset,
        sortBy:  newSortBy,
        sortDir: newSortDir,
      })
      setResult(res)
      setOffset(newOffset)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to run report')
    } finally {
      setRunning(false)
    }
  }, [])

  const handleSelectReport = useCallback((report: ReportMeta) => {
    setSelectedReport(report)
    setResult(null)
    setSortBy(undefined)
    setSortDir('asc')
    setOffset(0)
    runSelected(report, 0, undefined, 'asc')
  }, [runSelected])

  const handleSelectCategory = useCallback((cat: string) => {
    setSelectedCategory(cat)
    if (selectedReport && cat !== 'all' && selectedReport.category !== cat) {
      setSelectedReport(null)
      setResult(null)
    }
  }, [selectedReport])

  const handleSort = useCallback((field: string) => {
    if (!selectedReport) return
    const newDir = sortBy === field && sortDir === 'asc' ? 'desc' : 'asc'
    setSortBy(field)
    setSortDir(newDir)
    runSelected(selectedReport, 0, field, newDir)
  }, [selectedReport, sortBy, sortDir, runSelected])

  const handlePage = useCallback((newOffset: number) => {
    if (!selectedReport) return
    runSelected(selectedReport, newOffset, sortBy, sortDir)
  }, [selectedReport, sortBy, sortDir, runSelected])

  const handleExport = useCallback(() => {
    if (!selectedReport) return
    const url = api.exportReportCsvUrl(selectedReport.id)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedReport.id}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [selectedReport])

  const sourceFiltered = reports.filter(r => reportMatchesSource(r, activeSource))
  const categories = ['all', ...Array.from(new Set(sourceFiltered.map(r => r.category)))]
  const visibleReports = selectedCategory === 'all'
    ? sourceFiltered
    : sourceFiltered.filter(r => r.category === selectedCategory)
  const activeSourceLabel = SOURCE_TABS.find(t => t.key === activeSource)?.label ?? 'All Sources'

  return (
    <div className="space-y-0">
      <SourceTabs
        active={activeSource}
        onChange={handleSourceChange}
        reports={reports}
        integrations={integrations}
      />

      {/* Microsoft Graph: domain-card layout */}
      {activeSource === 'graph' ? (
        <GraphDomainView
          reports={reports}
          loadingMeta={loadingMeta}
          selectedCategory={selectedCategory}
          onSelectCategory={handleSelectCategory}
          selectedReport={selectedReport}
          onSelectReport={handleSelectReport}
          result={result}
          running={running}
          error={error}
          sortBy={sortBy}
          sortDir={sortDir}
          offset={offset}
          onSort={handleSort}
          onPage={handlePage}
          onExport={handleExport}
          onRefresh={() => selectedReport && runSelected(selectedReport, 0, sortBy, sortDir)}
        />
      ) : activeSource === 'slack' ? (
        <SlackDomainView
          reports={reports}
          loadingMeta={loadingMeta}
          selectedCategory={selectedCategory}
          onSelectCategory={handleSelectCategory}
          selectedReport={selectedReport}
          onSelectReport={handleSelectReport}
          result={result}
          running={running}
          error={error}
          sortBy={sortBy}
          sortDir={sortDir}
          offset={offset}
          onSort={handleSort}
          onPage={handlePage}
          onExport={handleExport}
          onRefresh={() => selectedReport && runSelected(selectedReport, 0, sortBy, sortDir)}
        />
      ) : (
        /* Other sources: classic sidebar + runner layout */
        <div className="flex gap-5 min-h-0">
          <aside className="w-60 flex-shrink-0">
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Reports</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">{activeSourceLabel}</p>
              </div>

              <div className="px-3 py-2 border-b border-slate-100 flex flex-wrap gap-1">
                {categories.map(cat => (
                  <button key={cat}
                    onClick={() => handleSelectCategory(cat)}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                      selectedCategory === cat ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat === 'all' ? 'All' : CATEGORY_META[cat]?.label ?? cat}
                  </button>
                ))}
              </div>

              <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 320px)' }}>
                {loadingMeta ? (
                  <div className="space-y-2 p-3">
                    {[...Array(6)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-slate-100 animate-pulse" />)}
                  </div>
                ) : visibleReports.length === 0 ? (
                  <div className="py-10 px-4 text-center text-slate-400">
                    <p className="text-sm font-medium">No reports</p>
                    <p className="text-xs mt-1">Try a different source or category</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-50">
                    {visibleReports.map(report => {
                      const isSelected = selectedReport?.id === report.id
                      return (
                        <li key={report.id}>
                          <button
                            onClick={() => handleSelectReport(report)}
                            className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${
                              isSelected ? 'bg-slate-50 border-l-2 border-slate-800' : 'border-l-2 border-transparent'
                            }`}
                          >
                            <p className={`text-sm font-medium leading-snug ${isSelected ? 'text-slate-900' : 'text-slate-700'}`}>
                              {report.name}
                            </p>
                            <div className="mt-1">
                              <CategoryPill category={report.category} />
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          </aside>

          <div className="flex-1 min-w-0">
            {!selectedReport ? (
              <div className="flex h-72 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-slate-400">
                <div className="text-center px-6">
                  <svg className="h-10 w-10 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-sm font-medium">Select a report</p>
                  <p className="text-xs mt-1">
                    {visibleReports.length > 0
                      ? `${visibleReports.length} report${visibleReports.length !== 1 ? 's' : ''} available for ${activeSourceLabel}`
                      : 'No reports match the current filter'}
                  </p>
                </div>
              </div>
            ) : (
              <ReportRunner
                report={selectedReport}
                result={result}
                running={running}
                error={error}
                sortBy={sortBy}
                sortDir={sortDir}
                offset={offset}
                onSort={handleSort}
                onPage={handlePage}
                onExport={handleExport}
                onRefresh={() => runSelected(selectedReport, 0, sortBy, sortDir)}
                sourceLabel={activeSourceLabel}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
