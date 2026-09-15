import { useState, useCallback, useEffect } from 'react'
import {
  Building2, Bell, Lock, ShieldCheck, AlertTriangle, Zap,
  Database, Server, Cloud, Cpu, Settings, RefreshCw, Plug,
  Download, Trash2, Plus, Link2, Copy, Check,
  Eye, EyeOff, WifiOff, Hash, LifeBuoy, FileText,
  ShieldAlert, RotateCcw, Info, Users, CheckCircle2, XCircle,
  MinusCircle, UserPlus, BookOpen,
  ChevronDown, ChevronRight, X, Key, Wifi, Edit2, Upload,
  LayoutDashboard,
} from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { useToast } from '../ui/ToastProvider'
import { api } from '../../api'
import type { IntegrationStatusItem } from '../../api'
import { useIntegrationStatus } from '../../hooks/useIntegrationStatus'
import { useNavVisibility, ALWAYS_VISIBLE_IDS } from '../../context/NavVisibilityContext'
import { navItems, NAV_GROUP_ORDER } from '../../data/dashboardData'
import { canAccess } from '../../lib/permissions'
import type { UserToolRole } from '../../types'

// ─── Nav sections ─────────────────────────────────────────────────────────────

const NAV = [
  { key: 'general',       label: 'General',            icon: Building2       },
  { key: 'navigation',    label: 'Navigation',         icon: LayoutDashboard },
  { key: 'integrations',  label: 'Integrations',       icon: Plug,        badge: '7' },
  { key: 'roles',         label: 'Roles & Permissions',icon: Users           },
  { key: 'compliance',    label: 'Compliance',          icon: ShieldCheck     },
  { key: 'automation',    label: 'Automation',          icon: Zap             },
  { key: 'security',      label: 'Security',            icon: Lock            },
  { key: 'notifications', label: 'Notifications',       icon: Bell            },
  { key: 'data',          label: 'Data & Privacy',      icon: Database        },
  { key: 'danger',        label: 'Danger Zone',         icon: AlertTriangle, danger: true },
] as const

type SectionKey = typeof NAV[number]['key']

// ─── Shared primitives ────────────────────────────────────────────────────────

function SectionWrap({ title, description, children }: {
  title: string; description: string; children: React.ReactNode
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
      {children}
    </div>
  )
}

function Card({ title, description, children }: {
  title?: string; description?: string; children: React.ReactNode
}) {
  return (
    <div className="rounded-[18px] border border-slate-200 bg-white shadow-sm shadow-slate-900/5 overflow-hidden">
      {title && (
        <div className="border-b border-slate-100 px-5 py-3.5">
          <p className="text-xs font-semibold text-slate-900">{title}</p>
          {description && <p className="text-[0.65rem] text-slate-500 mt-0.5">{description}</p>}
        </div>
      )}
      <div className="px-5 py-4 space-y-4">{children}</div>
    </div>
  )
}

function FieldRow({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-2 sm:gap-4 items-start">
      <div className="pt-0.5">
        <p className="text-xs font-medium text-slate-700">{label}</p>
        {hint && <p className="text-[0.62rem] text-slate-400 mt-0.5 leading-snug">{hint}</p>}
      </div>
      <div>{children}</div>
    </div>
  )
}

function Divider() {
  return <div className="border-t border-slate-100" />
}

function Input({ value, onChange, placeholder, disabled, type = 'text', className = '' }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  disabled?: boolean; type?: string; className?: string
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      className={`w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-300/40 transition disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    />
  )
}

function Select({ value, onChange, options, disabled }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; disabled?: boolean
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-300/40 transition disabled:opacity-50 disabled:cursor-not-allowed appearance-none cursor-pointer"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function Toggle({ enabled, onChange, label, description }: {
  enabled: boolean; onChange: (v: boolean) => void; label: string; description?: string
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-800">{label}</p>
        {description && <p className="text-[0.65rem] text-slate-500 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onChange(!enabled)}
        className={`relative flex-shrink-0 h-5 w-9 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-orange-300 ${enabled ? 'bg-orange-600' : 'bg-slate-200'}`}
      >
        <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
    </div>
  )
}

function RadioGroup({ options, value, onChange }: {
  options: string[]; value: string; onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-orange-300 ${
            value === o
              ? 'border-orange-300 bg-orange-50 text-orange-700'
              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

function SaveRow({ onSave, saving }: { onSave: () => void; saving: boolean }) {
  return (
    <div className="flex justify-end pt-1">
      <Button onClick={onSave} disabled={saving} className="min-w-[110px] gap-1.5">
        {saving && (
          <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {saving ? 'Saving…' : 'Save Changes'}
      </Button>
    </div>
  )
}

// ─── Section: General ─────────────────────────────────────────────────────────

function GeneralSection() {
  const { notify } = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    orgName: 'Zinnia Technologies',
    domain: 'zinnia.com',
    supportEmail: 'it-support@zinnia.com',
    timezone: 'America/Los_Angeles',
    dateFormat: 'MM/DD/YYYY',
    language: 'en-US',
    fiscalStart: 'January',
    logoUrl: '',
    environment: 'production' as 'production' | 'test',
  })

  const set = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    await new Promise(r => setTimeout(r, 800))
    setSaving(false)
    notify('success', 'Saved', 'General settings updated')
  }

  return (
    <SectionWrap title="General" description="Organization identity, locale, and display preferences">
      <Card title="Organization">
        <FieldRow label="Organization Name" hint="Displayed in reports and email footers">
          <Input value={form.orgName} onChange={set('orgName')} placeholder="Acme Corp" />
        </FieldRow>
        <Divider />
        <FieldRow label="Admin Email Domain" hint="Used for admin account validation">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 select-none">@</span>
            <Input value={form.domain} onChange={set('domain')} placeholder="company.com" />
          </div>
        </FieldRow>
        <Divider />
        <FieldRow label="IT Support Email" hint="Shown to end-users in remediation guides">
          <Input value={form.supportEmail} onChange={set('supportEmail')} type="email" />
        </FieldRow>
      </Card>

      <Card title="Locale & Display">
        <FieldRow label="Timezone">
          <Select value={form.timezone} onChange={set('timezone')} options={[
            { value: 'America/Los_Angeles', label: 'Pacific Time (UTC−8)' },
            { value: 'America/Denver',      label: 'Mountain Time (UTC−7)' },
            { value: 'America/Chicago',     label: 'Central Time (UTC−6)' },
            { value: 'America/New_York',    label: 'Eastern Time (UTC−5)' },
            { value: 'Europe/London',       label: 'GMT (UTC±0)' },
            { value: 'Europe/Berlin',       label: 'Central European (UTC+1)' },
            { value: 'Asia/Kolkata',        label: 'India Standard (UTC+5:30)' },
          ]} />
        </FieldRow>
        <Divider />
        <FieldRow label="Date Format">
          <RadioGroup
            options={['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD']}
            value={form.dateFormat}
            onChange={set('dateFormat')}
          />
        </FieldRow>
        <Divider />
        <FieldRow label="Language">
          <Select value={form.language} onChange={set('language')} options={[
            { value: 'en-US', label: 'English (US)' },
            { value: 'en-GB', label: 'English (UK)' },
            { value: 'fr-FR', label: 'Français' },
            { value: 'de-DE', label: 'Deutsch' },
            { value: 'es-ES', label: 'Español' },
          ]} />
        </FieldRow>
        <Divider />
        <FieldRow label="Fiscal Year Start">
          <Select value={form.fiscalStart} onChange={set('fiscalStart')} options={
            ['January','February','March','April','May','June',
             'July','August','September','October','November','December']
              .map(m => ({ value: m, label: m }))
          } />
        </FieldRow>
      </Card>

      <SaveRow saving={saving} onSave={handleSave} />
    </SectionWrap>
  )
}

// ─── Section: Integrations ────────────────────────────────────────────────────

interface IntegFieldDef {
  key: string
  label: string
  hint: string
  placeholder: string
  secret: boolean
}

interface IntegDef {
  id: string
  name: string
  icon: React.ElementType
  iconBg: string
  iconColor: string
  category: string
  categoryColor: string
  description: string
  docsHint: string
  defaultInterval: string
  defaultDevices: string
  defaultLastSync: string
  fields: IntegFieldDef[]
  defaults: Record<string, string>
}

interface FieldState {
  value: string
  editing: boolean
  draft: string
  saving: boolean
  visible: boolean
}

type TestStatus = 'idle' | 'testing' | 'ok' | 'error'

interface CardState {
  connected: boolean
  expanded: boolean
  syncing: boolean
  interval: string
  lastSync: string
  devices: string
  testStatus: TestStatus
  testMessage: string
  testLatency: number
  disconnectConfirm: boolean
  pushing: boolean
  pushed: boolean
  pushedAt: string | null
  fields: Record<string, FieldState>
}

const SYNC_INTERVALS = [
  { value: '5',        label: 'Every 5 min'   },
  { value: '15',       label: 'Every 15 min'  },
  { value: '30',       label: 'Every 30 min'  },
  { value: '60',       label: 'Every hour'    },
  { value: '240',      label: 'Every 4 hrs'   },
  { value: 'realtime', label: 'Real-time'     },
]

const INTEG_DEFS: IntegDef[] = [
  {
    id: 'intune',
    name: 'Microsoft Intune',
    icon: Server,
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
    category: 'MDM',
    categoryColor: 'text-orange-700 bg-orange-50 border-orange-200',
    description: 'Windows & mobile device management via Microsoft Endpoint Manager',
    docsHint: 'Requires an Azure App Registration with DeviceManagementApps.Read.All permission. Found in Azure Portal → App registrations → Certificates & secrets.',
    defaultInterval: 'realtime',
    defaultDevices: '9,841',
    defaultLastSync: '2 min ago',
    fields: [
      { key: 'tenantId',     label: 'Tenant ID',      hint: 'Azure AD Directory (tenant) ID',     placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', secret: false },
      { key: 'clientId',     label: 'Client ID',      hint: 'App registration Application ID',    placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', secret: false },
      { key: 'clientSecret', label: 'Client Secret',  hint: 'App registration secret value',      placeholder: '~Axxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',    secret: true  },
      { key: 'endpoint',     label: 'Tenant Domain',  hint: 'Your Microsoft 365 tenant domain',   placeholder: 'yourorg.onmicrosoft.com',               secret: false },
    ],
    defaults: {
      tenantId:     '',
      clientId:     '',
      clientSecret: '',
      endpoint:     '',
    },
  },
  {
    id: 'entra',
    name: 'Microsoft Entra ID',
    icon: ShieldCheck,
    iconBg: 'bg-lime-100',
    iconColor: 'text-lime-600',
    category: 'Identity',
    categoryColor: 'text-lime-700 bg-lime-50 border-lime-200',
    description: 'Azure Active Directory identity platform — sign-in logs, MFA registration, risky sign-ins, directory audits, and user lifecycle events',
    docsHint: 'Azure Portal → App registrations → your app → API permissions. Add: AuditLog.Read.All, Directory.Read.All, IdentityRiskyUser.Read.All, Reports.Read.All. If Intune credentials are set with these permissions, Entra ID is auto-configured.',
    defaultInterval: 'realtime',
    defaultDevices: 'N/A',
    defaultLastSync: 'On demand',
    fields: [
      { key: 'tenantId',     label: 'Tenant ID',     hint: 'Azure AD Directory (tenant) ID',  placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', secret: false },
      { key: 'clientId',     label: 'Client ID',     hint: 'App registration Application ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', secret: false },
      { key: 'clientSecret', label: 'Client Secret', hint: 'App registration secret value',   placeholder: '~Axxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',    secret: true  },
    ],
    defaults: {
      tenantId:     '',
      clientId:     '',
      clientSecret: '',
    },
  },
  {
    id: 'manageengine',
    name: 'ManageEngine',
    icon: Settings,
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
    category: 'MDM',
    categoryColor: 'text-orange-700 bg-orange-50 border-orange-200',
    description: 'ManageEngine MDM On-Demand (Endpoint Central Cloud) — cross-platform (Windows & macOS) device inventory, policies, apps',
    docsHint: 'Zoho API Console → Self Client → generate a refresh token with MDMOnDemand.MDMInventory.READ scope.',
    defaultInterval: 'realtime',
    defaultDevices: '640',
    defaultLastSync: '15 min ago',
    fields: [
      { key: 'clientId',     label: 'Client ID',     hint: 'Zoho API Console self-client',      placeholder: '1000.XXXXXXXXXX', secret: false },
      { key: 'clientSecret', label: 'Client Secret',  hint: 'Zoho API Console self-client',      placeholder: 'Enter client secret', secret: true },
      { key: 'refreshToken', label: 'Refresh Token',  hint: 'Generated with MDMInventory.READ scope', placeholder: '1000.XXXX...', secret: true },
      { key: 'apiDomain',    label: 'API Domain',     hint: 'MDM data-center base URL',          placeholder: 'https://mdm.manageengine.com', secret: false },
    ],
    defaults: {
      clientId:     '',
      clientSecret: '',
      refreshToken: '',
      apiDomain:    'https://mdm.manageengine.com',
    },
  },
  {
    id: 'jira',
    name: 'Jira',
    icon: Hash,
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
    category: 'ITSM',
    categoryColor: 'text-orange-700 bg-orange-50 border-orange-200',
    description: 'Auto-create and link Jira tickets from device runbooks and compliance failures',
    docsHint: 'Jira Cloud → Profile → Manage Account → Security → API Tokens. Use your Atlassian login email as the Jira Email. Server URL format: https://yourorg.atlassian.net',
    defaultInterval: 'realtime',
    defaultDevices: 'N/A',
    defaultLastSync: 'On demand',
    fields: [
      { key: 'baseUrl',    label: 'Server URL',  hint: 'Your Jira Cloud base URL',        placeholder: 'https://yourorg.atlassian.net', secret: false },
      { key: 'email',      label: 'Jira Email',  hint: 'Your Atlassian account email',    placeholder: 'you@company.com',               secret: false },
      { key: 'apiToken',   label: 'API Token',   hint: 'Profile → Manage Account → Security → API Tokens', placeholder: 'ATATT3xFfGF0…', secret: true },
      { key: 'projectKey', label: 'Project Key', hint: 'Default Jira project for tickets', placeholder: 'ITO',                          secret: false },
    ],
    defaults: {
      baseUrl:    'https://zinnia.atlassian.net',
      email:      'it-admin@zinnia.com',
      apiToken:   '',
      projectKey: 'ITO',
    },
  },
  {
    id: 'confluence',
    name: 'Confluence',
    icon: BookOpen,
    iconBg: 'bg-teal-100',
    iconColor: 'text-teal-600',
    category: 'ITSM',
    categoryColor: 'text-teal-700 bg-teal-50 border-teal-200',
    description: 'Search and link Confluence knowledge base articles to runbooks and device issues',
    docsHint: 'Uses the same Atlassian API token as Jira. Confluence Base URL defaults to your Jira URL if left blank. Set Confluence Space Key to scope article searches.',
    defaultInterval: 'realtime',
    defaultDevices: 'N/A',
    defaultLastSync: 'On demand',
    fields: [
      { key: 'baseUrl',    label: 'Confluence URL', hint: 'Optional: defaults to Jira base URL', placeholder: 'https://yourorg.atlassian.net', secret: false },
      { key: 'spaceKey',   label: 'Space Key',      hint: 'Confluence space to search by default',placeholder: 'IT',                           secret: false },
      { key: 'apiToken',   label: 'API Token',      hint: 'Same as your Jira API token',         placeholder: 'ATATT3xFfGF0…',                secret: true  },
    ],
    defaults: {
      baseUrl:  '',
      spaceKey: 'IT',
      apiToken: '',
    },
  },
  {
    id: 'slack',
    name: 'Slack',
    icon: Hash,
    iconBg: 'bg-teal-100',
    iconColor: 'text-teal-600',
    category: 'Collaboration',
    categoryColor: 'text-teal-700 bg-teal-50 border-teal-200',
    description: 'Slack workspace integration — Audit Logs, login events, channel activity, user management, and compliance data via Slack Audit Logs API',
    docsHint: 'Create a Slack App at api.slack.com/apps. Add scopes: auditlogs:read, channels:read, users:read. Install to workspace and copy the Bot OAuth Token. Signing Secret is found in App → Basic Information.',
    defaultInterval: 'realtime',
    defaultDevices: 'N/A',
    defaultLastSync: 'On demand',
    fields: [
      { key: 'botToken',      label: 'Bot OAuth Token',  hint: 'OAuth & Permissions → Bot Token Scopes',        placeholder: 'xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx', secret: true  },
      { key: 'signingSecret', label: 'Signing Secret',   hint: 'Basic Information → App Credentials',           placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',                          secret: true  },
      { key: 'workspaceId',   label: 'Workspace ID',     hint: 'Team ID — found in workspace URL or auth.test', placeholder: 'T0XXXXXXXXX',                                              secret: false },
    ],
    defaults: {
      botToken:      '',
      signingSecret: '',
      workspaceId:   '',
    },
  },
  {
    id: 'openai',
    name: 'OpenAI',
    icon: Cpu,
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-600',
    category: 'AI',
    categoryColor: 'text-violet-700 bg-violet-50 border-violet-200',
    description: 'Powers all AI features — device analysis, compliance summaries, risk scoring narratives, natural language remediation, automation rule builder, and fleet reports via GPT-4o-mini.',
    docsHint: 'Create a key at platform.openai.com/api-keys → Create new secret key. The key starts with sk-proj-… or sk-…. Organization ID is optional and only needed if your key belongs to a named OpenAI org.',
    defaultInterval: 'realtime',
    defaultDevices: 'N/A',
    defaultLastSync: 'On demand',
    fields: [
      { key: 'apiKey', label: 'API Key',          hint: 'platform.openai.com/api-keys — starts with sk-',   placeholder: 'sk-proj-…',       secret: true  },
      { key: 'orgId',  label: 'Organization ID',  hint: 'Optional — platform.openai.com/settings/organization', placeholder: 'org-…',        secret: false },
      { key: 'model',  label: 'Default Model',    hint: 'Model used for AI features. gpt-4o-mini is recommended', placeholder: 'gpt-4o-mini', secret: false },
    ],
    defaults: {
      apiKey: '',
      orgId:  '',
      model:  'gpt-4o-mini',
    },
  },
]

const CATALOG_ITEMS = [
  { id: 'jamf',        name: 'Jamf Pro',           icon: Cloud,       iconBg: 'bg-slate-100',   iconColor: 'text-slate-700',  category: 'MDM',  desc: 'Enterprise Apple lifecycle & compliance management' },
  { id: 'sccm',        name: 'Microsoft SCCM',     icon: Server,      iconBg: 'bg-orange-100',     iconColor: 'text-orange-600',    category: 'MDM',  desc: 'Windows Config Manager & WSUS patch management' },
  { id: 'crowdstrike', name: 'CrowdStrike Falcon', icon: ShieldCheck, iconBg: 'bg-red-100',     iconColor: 'text-red-600',    category: 'EDR',  desc: 'Endpoint detection, response & threat hunting' },
  { id: 'sentinelone', name: 'SentinelOne',        icon: ShieldAlert, iconBg: 'bg-lime-100',  iconColor: 'text-lime-600', category: 'EDR',  desc: 'AI-powered EPP, EDR & identity threat detection' },
  { id: 'qualys',      name: 'Qualys VMDR',        icon: AlertTriangle,iconBg:'bg-orange-100',  iconColor: 'text-orange-600', category: 'Vuln', desc: 'Cloud vulnerability management & patch compliance' },
  { id: 'servicenow',  name: 'ServiceNow',         icon: FileText,    iconBg: 'bg-teal-100',    iconColor: 'text-teal-700',   category: 'ITSM', desc: 'Auto-create incidents on compliance failures' },
]

function maskValue(v: string): string {
  if (!v || v.length <= 6) return '●'.repeat(Math.max(8, v.length))
  return v.slice(0, 4) + '●'.repeat(10) + v.slice(-4)
}

function initCardState(def: IntegDef): CardState {
  return {
    connected: true,
    expanded: false,
    syncing: false,
    interval: def.defaultInterval,
    lastSync: def.defaultLastSync,
    devices: def.defaultDevices,
    testStatus: 'idle',
    testMessage: '',
    testLatency: 0,
    disconnectConfirm: false,
    pushing: false,
    pushed: false,
    pushedAt: null,
    fields: Object.fromEntries(
      def.fields.map(f => [f.key, { value: def.defaults[f.key] ?? '', editing: false, draft: '', saving: false, visible: false }])
    ),
  }
}

function cardSubtitle(def: IntegDef, state: CardState): string {
  const f = state.fields
  switch (def.id) {
    case 'intune':       return f['endpoint']?.value || 'zinnia.onmicrosoft.com'
    case 'entra':        return `Tenant: ${(f['tenantId']?.value || '').slice(0, 8) || 'not set'}…`
    case 'manageengine': return f['apiDomain']?.value || 'mdm.manageengine.com'
    case 'slack':        return f['workspaceId']?.value ? `Workspace ${f['workspaceId'].value}` : 'auditlogs:read · channels:read'
    case 'openai':       return `Model: ${f['model']?.value || 'gpt-4o-mini'}${f['orgId']?.value ? ' · ' + f['orgId'].value : ''}`
    default:             return ''
  }
}

// ── Add Integration Modal ─────────────────────────────────────────────────────

function AddIntegrationModal({ open, onClose, onConnect }: {
  open: boolean
  onClose: () => void
  onConnect: (name: string) => void
}) {
  const { notify } = useToast()
  const [selected, setSelected] = useState<string | null>(null)
  const [setupKey, setSetupKey] = useState('')
  const [setupUrl, setSetupUrl] = useState('')
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    if (!open) { setSelected(null); setSetupKey(''); setSetupUrl(''); setConnecting(false) }
  }, [open])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const handleConnect = async () => {
    if (!setupKey.trim()) return
    setConnecting(true)
    await new Promise(r => setTimeout(r, 1500))
    setConnecting(false)
    const item = CATALOG_ITEMS.find(c => c.id === selected)
    if (item) {
      notify('success', 'Integration Connected', `${item.name} is now connected`)
      onConnect(item.name)
    }
    onClose()
  }

  if (!open) return null
  const selectedItem = CATALOG_ITEMS.find(c => c.id === selected)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] cursor-pointer" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal aria-label="Add Integration"
        className="relative z-10 w-full max-w-2xl bg-white rounded-2xl shadow-2xl shadow-slate-950/20 overflow-hidden max-h-[90vh] flex flex-col">

        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-[#141408] to-[#1e1e06] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/10 p-2"><Plus className="h-4 w-4 text-white" /></div>
            <div>
              <h2 className="text-sm font-bold text-white">Add Integration</h2>
              <p className="text-[0.65rem] text-slate-300">Connect a new data source to ITO Endpoint</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-slate-300 hover:bg-white/10 transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {!selected ? (
            <>
              <p className="text-xs font-semibold text-slate-500 mb-3">Available Integrations</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {CATALOG_ITEMS.map(item => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelected(item.id)}
                      className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left hover:border-orange-300 hover:bg-orange-50/40 transition focus-visible:ring-2 focus-visible:ring-orange-300 group"
                    >
                      <div className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl ${item.iconBg}`}>
                        <Icon className={`h-4 w-4 ${item.iconColor}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 group-hover:text-orange-700 transition leading-tight">{item.name}</p>
                        <span className="inline-block rounded-full bg-slate-200 px-1.5 py-0.5 text-[0.55rem] font-bold text-slate-600 mt-1">{item.category}</span>
                        <p className="text-[0.65rem] text-slate-500 mt-1 leading-snug">{item.desc}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          ) : selectedItem ? (
            <div className="space-y-4">
              <button type="button" onClick={() => setSelected(null)}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-orange-600 transition">
                <ChevronRight className="h-3 w-3 rotate-180" />Back to catalog
              </button>

              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                {(() => { const Icon = selectedItem.icon; return <div className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl ${selectedItem.iconBg}`}><Icon className={`h-5 w-5 ${selectedItem.iconColor}`} /></div> })()}
                <div>
                  <p className="text-sm font-bold text-slate-900">{selectedItem.name}</p>
                  <span className="inline-block rounded-full bg-slate-200 px-1.5 py-0.5 text-[0.55rem] font-bold text-slate-600">{selectedItem.category}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[0.68rem] font-semibold text-slate-700 mb-1">API Key / Token *</label>
                  <input
                    type="password"
                    value={setupKey}
                    onChange={e => setSetupKey(e.target.value)}
                    placeholder="Paste your API key or token here"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-300/40 transition"
                  />
                </div>
                <div>
                  <label className="block text-[0.68rem] font-semibold text-slate-700 mb-1">Base URL / Endpoint <span className="font-normal text-slate-400">(optional)</span></label>
                  <input
                    type="text"
                    value={setupUrl}
                    onChange={e => setSetupUrl(e.target.value)}
                    placeholder="https://yourorg.example.com"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-300/40 transition"
                  />
                </div>
                <div className="flex items-start gap-2 rounded-lg bg-orange-50 border border-orange-200 px-3 py-2.5">
                  <Info className="h-3.5 w-3.5 text-orange-500 flex-shrink-0 mt-0.5" />
                  <p className="text-[0.65rem] text-orange-700 leading-relaxed">
                    Additional settings (scopes, tenant IDs, custom fields) will be available in the Configure panel after connecting.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setSelected(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={!setupKey.trim() || connecting}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50 transition"
                >
                  {connecting
                    ? <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    : <Link2 className="h-3 w-3" />}
                  {connecting ? 'Connecting…' : 'Connect Integration'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ── Slack Health Panel ────────────────────────────────────────────────────────

type SlackHealth = {
  configured: boolean
  healthy: boolean | null
  lastCheckedAt: number | null
  lastSuccessAt: number | null
  consecutiveFails: number
  error: string | null
  workspace: string | null
  autoRetryCount: number
  nextCheckInMs: number | null
}

function SlackHealthPanel() {
  const { notify } = useToast()
  const [health, setHealth] = useState<SlackHealth | null>(null)
  const [reconnecting, setReconnecting] = useState(false)

  const fetchHealth = useCallback(async () => {
    try {
      const data = await api.slackHealth()
      setHealth(data)
    } catch {
      // silently ignore — panel will just stay stale
    }
  }, [])

  useEffect(() => {
    fetchHealth()
    const t = setInterval(fetchHealth, 30_000)
    return () => clearInterval(t)
  }, [fetchHealth])

  const handleReconnect = async () => {
    setReconnecting(true)
    try {
      const result = await api.reconnectSlack()
      if (result.reconnected) {
        notify('success', 'Slack Reconnected', `Connected to workspace ${result.workspace ?? ''}`)
      } else {
        notify('error', 'Reconnection Failed', result.error ?? 'Slack API unreachable — check your Bot Token')
      }
      await fetchHealth()
    } catch (err) {
      notify('error', 'Reconnection Failed', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setReconnecting(false)
    }
  }

  if (!health?.configured) return null

  const timeAgo = (ts: number | null) => {
    if (!ts) return 'Never'
    const s = Math.floor((Date.now() - ts) / 1000)
    if (s < 60) return `${s}s ago`
    if (s < 3600) return `${Math.floor(s / 60)}m ago`
    return `${Math.floor(s / 3600)}h ago`
  }

  const isHealthy   = health.healthy === true
  const isUnhealthy = health.healthy === false
  const isDegraded  = isUnhealthy && health.consecutiveFails >= 2

  return (
    <div className={`border-t px-5 py-3 ${isUnhealthy ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Health indicator */}
          <div className="flex items-center gap-2">
            {isHealthy ? (
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            ) : isUnhealthy ? (
              <span className="h-2 w-2 rounded-full bg-red-500" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-slate-300" />
            )}
            <span className={`text-[0.72rem] font-bold ${isHealthy ? 'text-emerald-700' : isUnhealthy ? 'text-red-700' : 'text-slate-500'}`}>
              {isHealthy ? 'Connected' : isUnhealthy ? (isDegraded ? 'Degraded' : 'Disconnected') : 'Checking…'}
            </span>
            {health.workspace && (
              <span className="text-[0.68rem] text-slate-500">· {health.workspace}</span>
            )}
          </div>

          {/* Last check */}
          <div className="text-[0.65rem] text-slate-500 flex items-center gap-1">
            <span className="uppercase tracking-wide font-semibold text-slate-400">Last check</span>
            <span>{timeAgo(health.lastCheckedAt)}</span>
          </div>

          {/* Monitor cadence */}
          <div className="text-[0.65rem] text-slate-500 flex items-center gap-1">
            <span className="uppercase tracking-wide font-semibold text-slate-400">Auto-monitor</span>
            <span className="text-emerald-600 font-semibold">Every 5 min</span>
          </div>

          {/* Consecutive failures */}
          {isUnhealthy && health.consecutiveFails > 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-red-100 border border-red-200 px-2 py-0.5">
              <AlertTriangle className="h-3 w-3 text-red-500" />
              <span className="text-[0.65rem] font-semibold text-red-700">
                {health.consecutiveFails} consecutive failure{health.consecutiveFails > 1 ? 's' : ''}
              </span>
            </div>
          )}

          {/* Error message */}
          {health.error && (
            <span className="text-[0.65rem] text-red-600 max-w-[280px] truncate" title={health.error}>
              {health.error}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchHealth}
            className="inline-flex items-center gap-1 h-7 rounded-full border border-slate-200 bg-white px-2.5 text-[0.68rem] font-semibold text-slate-600 hover:bg-slate-50 transition"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>

          {isUnhealthy && (
            <button
              type="button"
              onClick={handleReconnect}
              disabled={reconnecting}
              className="inline-flex items-center gap-1.5 h-7 rounded-full bg-[#F46C00] px-3 text-[0.68rem] font-bold text-white transition hover:bg-[#e06200] disabled:opacity-60"
            >
              {reconnecting ? (
                <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              ) : (
                <Wifi className="h-3 w-3" />
              )}
              {reconnecting ? 'Reconnecting…' : 'Reconnect Now'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Integration Card ──────────────────────────────────────────────────────────

function IntegrationCard({ def, state, onUpdate, liveStatus }: {
  def: IntegDef
  state: CardState
  onUpdate: (updater: (s: CardState) => CardState) => void
  liveStatus?: IntegrationStatusItem
}) {
  const { notify } = useToast()
  const Icon = def.icon

  // Server state wins over local UI state — if the server reports this integration
  // as configured and not erroring, show it as connected regardless of local state.
  const isConnected = liveStatus?.configured != null
    ? (liveStatus.configured && liveStatus.healthy !== false)
    : state.connected

  const setField = (key: string, updater: (f: FieldState) => FieldState) =>
    onUpdate(s => ({ ...s, fields: { ...s.fields, [key]: updater(s.fields[key]) } }))

  const handleSync = async () => {
    onUpdate(s => ({ ...s, syncing: true }))
    try {
      const result = await api.syncIntegration(def.id)
      onUpdate(s => ({
        ...s,
        syncing: false,
        lastSync: 'just now',
        devices: result.deviceCount > 0 ? result.deviceCount.toLocaleString() : s.devices,
      }))
      if (result.error) {
        notify('error', 'Sync Failed', result.error)
      } else {
        const msg = result.deviceCount > 0
          ? `${def.name} synced ${result.deviceCount.toLocaleString()} devices in ${(result.latencyMs / 1000).toFixed(1)}s`
          : `${def.name} connected successfully in ${(result.latencyMs / 1000).toFixed(1)}s`
        notify('success', 'Sync Complete', msg)
      }
    } catch (err) {
      onUpdate(s => ({ ...s, syncing: false }))
      const msg = err instanceof Error ? err.message : 'Unknown error'
      if (msg.includes('not configured') || msg.includes('credentials')) {
        notify('error', 'Sync Failed', 'Push valid credentials first, then sync')
      } else {
        notify('error', 'Sync Failed', `${def.name} API error — check your credentials and try again`)
      }
    }
  }

  const handlePush = async () => {
    const fields: Record<string, string> = {}
    for (const [key, fs] of Object.entries(state.fields)) {
      fields[key] = fs.value
    }

    // Reject placeholder/empty credentials — they would overwrite real env-var config
    const secretField = def.fields.find(f => f.secret)
    const secretVal = secretField ? (fields[secretField.key] ?? '') : ''
    const isPlaceholder = !secretVal || secretVal.includes('replace') || secretVal.includes('placeholder') || secretVal.length < 10
    if (isPlaceholder) {
      notify('error', 'Push Blocked', `Enter a real ${secretField?.label ?? 'API key'} before pushing — placeholder values would overwrite active credentials`)
      return
    }

    onUpdate(s => ({ ...s, pushing: true }))
    try {
      await api.pushCredentials(def.id, fields)
      onUpdate(s => ({ ...s, pushing: false, pushed: true, pushedAt: new Date().toLocaleTimeString() }))
      notify('success', 'Credentials Activated', `${def.name} credentials are now live on the server`)
    } catch {
      onUpdate(s => ({ ...s, pushing: false }))
      notify('error', 'Push Failed', 'Server is offline or unreachable')
    }
  }

  const handleTest = async () => {
    onUpdate(s => ({ ...s, testStatus: 'testing', testMessage: '', testLatency: 0 }))
    const t0 = Date.now()
    try {
      const result = await api.syncIntegration(def.id)
      const latency = Date.now() - t0
      if (result.error) {
        onUpdate(s => ({ ...s, testStatus: 'error', testMessage: result.error ?? 'Connection failed', testLatency: latency }))
      } else {
        onUpdate(s => ({ ...s, testStatus: 'ok', testMessage: `200 OK · Connected in ${result.latencyMs}ms`, testLatency: latency }))
      }
    } catch (err) {
      const latency = Date.now() - t0
      const msg = err instanceof Error ? err.message : 'Connection failed'
      onUpdate(s => ({ ...s, testStatus: 'error', testMessage: msg, testLatency: latency }))
    }
  }

  const handleSaveField = async (key: string) => {
    setField(key, f => ({ ...f, saving: true }))
    await new Promise(r => setTimeout(r, 700))
    setField(key, f => ({ ...f, value: f.draft, saving: false, editing: false, draft: '' }))
    const label = def.fields.find(f => f.key === key)?.label ?? key
    notify('success', 'Saved', `${label} updated successfully`)
  }

  const handleDisconnect = () => {
    onUpdate(s => ({ ...s, connected: false, expanded: false, disconnectConfirm: false }))
    notify('success', 'Disconnected', `${def.name} has been disconnected`)
  }

  return (
    <div className={`rounded-[18px] border bg-white shadow-sm shadow-slate-900/5 overflow-hidden transition-all ${
      isConnected ? 'border-slate-200' : 'border-dashed border-orange-200'
    }`}>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl ${def.iconBg}`}>
            <Icon className={`h-5 w-5 ${def.iconColor}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-slate-900">{def.name}</p>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.58rem] font-bold ${def.categoryColor}`}>
                {def.category}
              </span>
              {isConnected ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-[0.58rem] font-bold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 border border-red-200 px-2 py-0.5 text-[0.58rem] font-bold text-red-600">
                  <WifiOff className="h-2.5 w-2.5" />Disconnected
                </span>
              )}
            </div>
            <p className="text-[0.65rem] text-slate-500 mt-0.5 truncate">
              {cardSubtitle(def, state)} · Last sync {state.lastSync}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {isConnected && (
            <button
              type="button"
              onClick={handleSync}
              disabled={state.syncing}
              className={`inline-flex items-center gap-1.5 h-8 rounded-lg border px-3 text-xs font-semibold text-slate-700 disabled:opacity-60 transition ${state.syncing ? 'border-orange-300 bg-orange-50 animate-pulse' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
            >
              <RefreshCw className={`h-3 w-3 ${state.syncing ? 'animate-spin text-orange-500' : ''}`} />
              {state.syncing ? 'Syncing…' : 'Sync Now'}
            </button>
          )}
          <button
            type="button"
            onClick={() => onUpdate(s => ({ ...s, expanded: !s.expanded, disconnectConfirm: false }))}
            className={`inline-flex items-center gap-1.5 h-8 rounded-lg border px-3 text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-orange-300 ${
              state.expanded ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${state.expanded ? 'rotate-180' : ''}`} />
            Configure
          </button>
        </div>
      </div>

      {/* ── Stats bar ────────────────────────────────────────────────────── */}
      <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-2.5">
        <div className="flex flex-wrap gap-6 items-center">
          <div>
            <p className="text-[0.58rem] text-slate-400 uppercase tracking-wide">Devices Synced</p>
            <p className="text-xs font-bold text-slate-900 mt-0.5">
              {liveStatus?.deviceCount != null ? liveStatus.deviceCount.toLocaleString() : state.devices}
              {liveStatus?.deviceCount != null && (
                <span className="ml-1 text-[0.58rem] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5">live</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-[0.58rem] text-slate-400 uppercase tracking-wide mb-0.5">Sync Interval</p>
            <select
              value={state.interval}
              onChange={e => onUpdate(s => ({ ...s, interval: e.target.value }))}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[0.68rem] font-medium text-slate-800 focus:border-orange-400 focus:outline-none transition appearance-none cursor-pointer"
            >
              {SYNC_INTERVALS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[0.58rem] text-slate-400 uppercase tracking-wide">API Status</p>
            {liveStatus?.healthy === false ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 mt-0.5">
                <span className="h-2 w-2 rounded-full bg-red-500" />Error
              </span>
            ) : liveStatus?.healthy === true ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 mt-0.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />Healthy
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 mt-0.5">
                <span className="h-2 w-2 rounded-full bg-slate-300" />Not synced
              </span>
            )}
          </div>

          {/* Inline test result badge */}
          {state.testStatus !== 'idle' && (
            <div className="ml-auto">
              {state.testStatus === 'testing' && (
                <span className="inline-flex items-center gap-1.5 text-[0.68rem] text-slate-500">
                  <svg className="h-3 w-3 animate-spin text-orange-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Testing…
                </span>
              )}
              {state.testStatus === 'ok' && (
                <span className="inline-flex items-center gap-1.5 text-[0.68rem] font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />{state.testMessage} · {state.testLatency}ms
                </span>
              )}
              {state.testStatus === 'error' && (
                <span className="inline-flex items-center gap-1.5 text-[0.68rem] font-semibold text-red-600 max-w-[260px] truncate">
                  <XCircle className="h-3.5 w-3.5 flex-shrink-0" />{state.testMessage}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Slack auto-reconnect health panel ───────────────────────────── */}
      {def.id === 'slack' && <SlackHealthPanel />}

      {/* ── Expandable config panel ──────────────────────────────────────── */}
      {state.expanded && (
        <div className="border-t border-slate-100 px-5 py-5 space-y-6">

          {/* Info banner */}
          <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
            <Info className="h-3.5 w-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[0.72rem] text-slate-700 leading-relaxed">{def.description}</p>
              <p className="text-[0.65rem] text-orange-600 mt-1">{def.docsHint}</p>
            </div>
          </div>

          {/* Credentials & Config fields */}
          <div>
            <p className="text-[0.6rem] font-bold text-slate-400 uppercase tracking-widest mb-2">
              Credentials &amp; Configuration
            </p>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden">
              {def.fields.map(field => {
                const fs = state.fields[field.key]
                if (!fs) return null
                const display = field.secret && !fs.visible ? maskValue(fs.value) : fs.value

                return (
                  <div key={field.key} className="grid grid-cols-1 sm:grid-cols-[170px_1fr] gap-2 sm:gap-4 items-center px-4 py-3">
                    <div>
                      <div className="flex items-center gap-1.5">
                        {field.secret && <Key className="h-3 w-3 text-slate-400 flex-shrink-0" />}
                        <p className="text-xs font-medium text-slate-700">{field.label}</p>
                      </div>
                      <p className="text-[0.62rem] text-slate-400 mt-0.5 leading-snug">{field.hint}</p>
                    </div>
                    <div>
                      {fs.editing ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type={field.secret ? 'password' : 'text'}
                            value={fs.draft}
                            onChange={e => setField(field.key, f => ({ ...f, draft: e.target.value }))}
                            placeholder={field.placeholder}
                            autoFocus
                            className="flex-1 min-w-0 rounded-lg border border-orange-300 bg-orange-50/30 px-3 py-1.5 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-300/40 transition"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveField(field.key)}
                            disabled={!fs.draft.trim() || fs.saving}
                            className="flex-shrink-0 inline-flex items-center gap-1 h-7 rounded-lg bg-orange-600 px-2.5 text-[0.68rem] font-semibold text-white hover:bg-orange-700 disabled:opacity-50 transition"
                          >
                            {fs.saving
                              ? <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                              : <Check className="h-3 w-3" />}
                            {fs.saving ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setField(field.key, f => ({ ...f, editing: false, draft: '' }))}
                            className="flex-shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <code className={`flex-1 min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[0.72rem] font-mono text-slate-700 truncate ${field.secret && !fs.visible ? 'tracking-wider' : ''}`}>
                            {fs.value ? display : <span className="text-slate-400 not-italic font-sans text-[0.68rem]">Not set — click edit to add</span>}
                          </code>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {field.secret && (
                              <button
                                type="button"
                                onClick={() => setField(field.key, f => ({ ...f, visible: !f.visible }))}
                                className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition"
                                aria-label={fs.visible ? 'Hide' : 'Reveal'}
                                title={fs.visible ? 'Hide value' : 'Reveal value'}
                              >
                                {fs.visible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                              </button>
                            )}
                            {fs.value && !field.secret && (
                              <button
                                type="button"
                                onClick={() => { navigator.clipboard.writeText(fs.value); notify('success', 'Copied', `${field.label} copied`) }}
                                className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition"
                                title="Copy to clipboard"
                              >
                                <Copy className="h-3 w-3" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setField(field.key, f => ({ ...f, editing: true, draft: f.value }))}
                              className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-orange-600 hover:border-orange-300 hover:bg-orange-50 transition"
                              title="Edit value"
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Push to Server */}
          <div>
            <p className="text-[0.6rem] font-bold text-slate-400 uppercase tracking-widest mb-2">Server Activation</p>
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    {state.pushed && state.pushedAt ? (
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                        <div>
                          <p className="text-[0.72rem] font-semibold text-emerald-700">Credentials active on server</p>
                          <p className="text-[0.65rem] text-slate-400">Last pushed at {state.pushedAt} · Server will use these credentials for all syncs</p>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="text-[0.72rem] font-semibold text-slate-700">Push credentials to backend</p>
                        <p className="text-[0.65rem] text-slate-400 mt-0.5">Sends the saved credentials to the running server so real device data can be fetched. Credentials are stored in memory only and reset on server restart.</p>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handlePush}
                    disabled={state.pushing}
                    className="flex-shrink-0 inline-flex items-center gap-1.5 h-8 rounded-lg bg-lime-600 px-3 text-xs font-semibold text-white hover:bg-lime-700 disabled:opacity-60 transition focus-visible:ring-2 focus-visible:ring-lime-300"
                  >
                    {state.pushing ? (
                      <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <Upload className="h-3 w-3" />
                    )}
                    {state.pushing ? 'Pushing…' : state.pushed ? 'Re-push' : 'Push to Server'}
                  </button>
                </div>
              </div>
            </div>
          {/* Connection Test */}
          <div>
            <p className="text-[0.6rem] font-bold text-slate-400 uppercase tracking-widest mb-2">Connection Test</p>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  {state.testStatus === 'idle' && (
                    <p className="text-[0.72rem] text-slate-500">Verify your credentials are valid and the endpoint is reachable</p>
                  )}
                  {state.testStatus === 'testing' && (
                    <div className="flex items-center gap-2">
                      <svg className="h-3.5 w-3.5 animate-spin text-orange-500 flex-shrink-0" fill="none" viewBox="0 0 24 24"><circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      <p className="text-[0.72rem] text-slate-600 font-medium">Testing connection to {cardSubtitle(def, state)}…</p>
                    </div>
                  )}
                  {state.testStatus === 'ok' && (
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[0.72rem] font-semibold text-emerald-700">Connection verified</p>
                        <p className="text-[0.65rem] text-slate-500">{state.testMessage} · Latency {state.testLatency}ms</p>
                      </div>
                    </div>
                  )}
                  {state.testStatus === 'error' && (
                    <div className="flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[0.72rem] font-semibold text-red-700">Connection failed</p>
                        <p className="text-[0.65rem] text-slate-500">{state.testMessage}</p>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={state.testStatus === 'testing'}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 h-8 rounded-lg bg-orange-600 px-3 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-60 transition focus-visible:ring-2 focus-visible:ring-orange-300"
                >
                  <Wifi className="h-3 w-3" />
                  {state.testStatus === 'testing' ? 'Testing…' : state.testStatus === 'ok' ? 'Re-test' : 'Test Connection'}
                </button>
              </div>
            </div>
          </div>

          {/* Disconnect */}
          <div>
            <p className="text-[0.6rem] font-bold text-slate-400 uppercase tracking-widest mb-2">Danger</p>
            <div className="rounded-xl border border-red-200 bg-red-50/40 px-4 py-3.5">
              {!state.disconnectConfirm ? (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-800">Disconnect {def.name}</p>
                    <p className="text-[0.65rem] text-slate-500 mt-0.5">
                      Removes this integration. Previously synced device data is retained but no new syncs will run.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onUpdate(s => ({ ...s, disconnectConfirm: true }))}
                    className="flex-shrink-0 inline-flex items-center gap-1.5 h-8 rounded-lg border border-red-300 bg-white px-3 text-xs font-semibold text-red-600 hover:bg-red-50 transition"
                  >
                    <WifiOff className="h-3 w-3" />Disconnect
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700 font-medium">
                      Are you sure? All active syncs from {def.name} will stop immediately.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDisconnect}
                      className="inline-flex items-center gap-1.5 h-8 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700 transition"
                    >
                      <Trash2 className="h-3 w-3" />Yes, disconnect
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdate(s => ({ ...s, disconnectConfirm: false }))}
                      className="inline-flex items-center gap-1.5 h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}

function IntegrationsSection() {
  const { notify } = useToast()
  const [addOpen, setAddOpen] = useState(false)
  const [cardStates, setCardStates] = useState<Record<string, CardState>>(
    () => Object.fromEntries(INTEG_DEFS.map(d => [d.id, initCardState(d)]))
  )
  const { status: integrationStatus, loading: statusLoading, refresh: refreshStatus } = useIntegrationStatus()

  const updateCard = useCallback((id: string, updater: (s: CardState) => CardState) => {
    setCardStates(prev => ({ ...prev, [id]: updater(prev[id]) }))
  }, [])

  // Keep local connected state in sync with server reality
  useEffect(() => {
    if (integrationStatus.length === 0) return
    setCardStates(prev => {
      const next = { ...prev }
      for (const s of integrationStatus) {
        if (!next[s.id]) continue
        const serverConnected = s.configured && s.healthy !== false
        if (next[s.id].connected !== serverConnected) {
          next[s.id] = { ...next[s.id], connected: serverConnected }
        }
      }
      return next
    })
  }, [integrationStatus])

  const connectedCount = integrationStatus.length > 0
    ? integrationStatus.filter(s => s.configured && s.healthy !== false).length
    : Object.values(cardStates).filter(s => s.connected).length
  const pushedCount = integrationStatus.filter(s => s.configured).length
  const healthyCount = integrationStatus.filter(s => s.healthy === true).length

  return (
    <SectionWrap title="Integrations" description="Manage API credentials and connection settings for all connected services">

      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-4 rounded-[18px] border border-slate-200 bg-white px-5 py-4 shadow-sm shadow-slate-900/5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-100">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </span>
          <div>
            <p className="text-sm font-bold text-slate-900">{connectedCount} of {INTEG_DEFS.length} Connected</p>
            <p className="text-[0.65rem] text-slate-500">Click <strong>Configure</strong> → <strong>Push to Server</strong> to activate real data</p>
          </div>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-3 text-[0.68rem] text-slate-500 flex-wrap">
          {pushedCount > 0 ? (
            <span className="flex items-center gap-1 text-emerald-600 font-medium">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              {healthyCount} of {pushedCount} syncing live
            </span>
          ) : (
            <span className="flex items-center gap-1 text-amber-600 font-medium">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              No live syncs — push credentials to activate
            </span>
          )}
          <button
            type="button"
            onClick={refreshStatus}
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 transition text-[0.65rem] ${statusLoading ? 'border-orange-300 bg-orange-50 text-orange-500 animate-pulse' : 'border-transparent text-slate-400 hover:text-orange-600'}`}
          >
            <RefreshCw className={`h-2.5 w-2.5 ${statusLoading ? 'animate-spin text-orange-500' : ''}`} />Refresh
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {INTEG_DEFS.map(def => (
          <IntegrationCard
            key={def.id}
            def={def}
            state={cardStates[def.id]}
            onUpdate={updater => updateCard(def.id, updater)}
            liveStatus={integrationStatus.find(s => s.id === def.id)}
          />
        ))}

        {/* Add Integration */}
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="w-full rounded-[18px] border-2 border-dashed border-slate-200 bg-white py-5 flex flex-col items-center gap-2 text-slate-500 hover:border-orange-300 hover:text-orange-600 hover:bg-orange-50/30 transition focus-visible:ring-2 focus-visible:ring-orange-300"
        >
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 group-hover:bg-orange-100 transition">
            <Plus className="h-4 w-4" />
          </div>
          <p className="text-xs font-semibold">Add Integration</p>
          <p className="text-[0.65rem]">Connect Jamf, CrowdStrike, ServiceNow and 3 more</p>
        </button>
      </div>

      <AddIntegrationModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onConnect={name => notify('success', 'Integration Active', `${name} is now syncing`)}
      />
    </SectionWrap>
  )
}

// ─── Section: Compliance ──────────────────────────────────────────────────────

function ComplianceSection() {
  const { notify } = useToast()
  const [saving, setSaving] = useState(false)
  const [grace, setGrace] = useState(24)
  const [checkFreq, setCheckFreq] = useState('30')
  const [autoEscalate, setAutoEscalate] = useState(true)
  const [escalateAfter, setEscalateAfter] = useState('48')
  const [riskWeights, setRiskWeights] = useState({ encryption: 40, osVersion: 25, appCompliance: 20, checkIn: 15 })
  const [strictMode, setStrictMode] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await new Promise(r => setTimeout(r, 900))
    setSaving(false)
    notify('success', 'Saved', 'Compliance settings updated')
  }

  const weightKeys = [
    { key: 'encryption',    label: 'Encryption',        color: 'bg-orange-500' },
    { key: 'osVersion',     label: 'OS Version',         color: 'bg-lime-500' },
    { key: 'appCompliance', label: 'App Compliance',     color: 'bg-orange-400' },
    { key: 'checkIn',       label: 'Device Check-in',    color: 'bg-emerald-500' },
  ] as { key: keyof typeof riskWeights; label: string; color: string }[]

  const totalWeight = Object.values(riskWeights).reduce((a, b) => a + b, 0)

  return (
    <SectionWrap title="Compliance" description="Thresholds, check intervals, and risk scoring configuration">
      <Card title="Check Schedule">
        <FieldRow label="Check Frequency" hint="How often devices are evaluated for compliance">
          <Select value={checkFreq} onChange={setCheckFreq} options={[
            { value: '15',  label: 'Every 15 minutes' },
            { value: '30',  label: 'Every 30 minutes' },
            { value: '60',  label: 'Every hour' },
            { value: '240', label: 'Every 4 hours' },
            { value: '720', label: 'Twice daily' },
            { value: '1440',label: 'Daily' },
          ]} />
        </FieldRow>
        <Divider />
        <FieldRow label="Grace Period" hint={`${grace} hours before a non-compliant state triggers alerts`}>
          <div className="space-y-2">
            <input
              type="range" min={0} max={72} step={1} value={grace}
              onChange={e => setGrace(Number(e.target.value))}
              className="w-full accent-orange-600"
            />
            <div className="flex justify-between text-[0.62rem] text-slate-400">
              <span>0 h (immediate)</span>
              <span className="font-semibold text-orange-700">{grace} hours</span>
              <span>72 h</span>
            </div>
          </div>
        </FieldRow>
        <Divider />
        <FieldRow label="Strict Mode" hint="Immediately block non-compliant devices from resources">
          <Toggle enabled={strictMode} onChange={setStrictMode} label="" />
        </FieldRow>
      </Card>

      <Card title="Escalation">
        <FieldRow label="Auto-escalation" hint="Automatically escalate unresolved issues to senior admins">
          <Toggle enabled={autoEscalate} onChange={setAutoEscalate} label="" />
        </FieldRow>
        {autoEscalate && (
          <>
            <Divider />
            <FieldRow label="Escalate after" hint="Hours a device stays non-compliant before escalating">
              <Select value={escalateAfter} onChange={setEscalateAfter} options={[
                { value: '12', label: '12 hours' },
                { value: '24', label: '24 hours' },
                { value: '48', label: '48 hours' },
                { value: '72', label: '72 hours' },
              ]} />
            </FieldRow>
          </>
        )}
      </Card>

      <Card title="Risk Score Weights" description="Must total 100% — adjust how each factor contributes to the overall risk score">
        <div className="space-y-4">
          {weightKeys.map(({ key, label, color }) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${color}`} />
                  <span className="text-xs font-medium text-slate-700">{label}</span>
                </div>
                <span className="text-xs font-bold text-slate-900 w-8 text-right">{riskWeights[key]}%</span>
              </div>
              <input
                type="range" min={0} max={100} step={5} value={riskWeights[key]}
                onChange={e => setRiskWeights(w => ({ ...w, [key]: Number(e.target.value) }))}
                className="w-full accent-orange-600"
              />
            </div>
          ))}
          <div className={`rounded-lg px-3 py-2 flex items-center gap-2 ${totalWeight === 100 ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
            {totalWeight === 100
              ? <Check className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
              : <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />}
            <p className={`text-[0.68rem] font-medium ${totalWeight === 100 ? 'text-emerald-700' : 'text-amber-700'}`}>
              Total: {totalWeight}% {totalWeight !== 100 && `— must equal 100%`}
            </p>
          </div>
        </div>
      </Card>

      <SaveRow saving={saving} onSave={handleSave} />
    </SectionWrap>
  )
}

// ─── Section: Automation ──────────────────────────────────────────────────────

function AutomationSection() {
  const { notify } = useToast()
  const [saving, setSaving] = useState(false)
  const [autoRemediate, setAutoRemediate] = useState(false)
  const [notifyBefore, setNotifyBefore] = useState(true)
  const [notifyMinutes, setNotifyMinutes] = useState('15')
  const [maxPerDay, setMaxPerDay] = useState('10')
  const [logRetention, setLogRetention] = useState('90')
  const [dryRunFirst, setDryRunFirst] = useState(true)
  const [triggerHours, setTriggerHours] = useState('4')

  const handleSave = async () => {
    setSaving(true)
    await new Promise(r => setTimeout(r, 900))
    setSaving(false)
    notify('success', 'Saved', 'Automation settings updated')
  }

  return (
    <SectionWrap title="Automation" description="Configure auto-remediation triggers, limits, and logging">
      <Card title="Auto-Remediation">
        <div className={`rounded-xl border px-4 py-3.5 flex items-start justify-between gap-4 mb-2 ${autoRemediate ? 'border-orange-200 bg-orange-50' : 'border-amber-200 bg-amber-50'}`}>
          <div className="flex items-start gap-3 min-w-0">
            <div className={`mt-0.5 grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl ${autoRemediate ? 'bg-orange-100' : 'bg-amber-100'}`}>
              <Zap className={`h-4 w-4 ${autoRemediate ? 'text-orange-600' : 'text-amber-600'}`} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-900">Auto-Remediation {autoRemediate ? 'Enabled' : 'Disabled'}</p>
              <p className="text-[0.65rem] text-slate-600 mt-0.5 leading-snug">
                {autoRemediate
                  ? 'Runbooks trigger automatically when conditions are met.'
                  : 'All runbooks require manual approval before execution.'}
              </p>
            </div>
          </div>
          <button type="button" role="switch" aria-checked={autoRemediate}
            onClick={() => setAutoRemediate(v => !v)}
            className={`relative flex-shrink-0 h-5 w-9 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-orange-300 mt-0.5 ${autoRemediate ? 'bg-orange-600' : 'bg-slate-300'}`}
          >
            <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${autoRemediate ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        </div>

        {autoRemediate && (
          <>
            <Divider />
            <FieldRow label="Trigger after" hint="Hours a device is non-compliant before automation fires">
              <Select value={triggerHours} onChange={setTriggerHours} options={[
                { value: '1',  label: '1 hour' },
                { value: '2',  label: '2 hours' },
                { value: '4',  label: '4 hours' },
                { value: '8',  label: '8 hours' },
                { value: '24', label: '24 hours' },
              ]} />
            </FieldRow>
            <Divider />
            <FieldRow label="Dry run first" hint="Simulate the runbook before executing for real">
              <Toggle enabled={dryRunFirst} onChange={setDryRunFirst} label="" />
            </FieldRow>
            <Divider />
            <FieldRow label="Max automations/day" hint="Circuit-breaker to prevent runaway automation">
              <Select value={maxPerDay} onChange={setMaxPerDay} options={[
                { value: '5',  label: '5 per day' },
                { value: '10', label: '10 per day' },
                { value: '25', label: '25 per day' },
                { value: '50', label: '50 per day' },
                { value: '0',  label: 'Unlimited' },
              ]} />
            </FieldRow>
          </>
        )}
      </Card>

      <Card title="Pre-Execution Notifications">
        <Toggle enabled={notifyBefore} onChange={setNotifyBefore}
          label="Notify before automation runs"
          description="Send a heads-up to the device owner and admin before any runbook executes"
        />
        {notifyBefore && (
          <>
            <Divider />
            <FieldRow label="Lead time" hint="How far in advance to send the notification">
              <Select value={notifyMinutes} onChange={setNotifyMinutes} options={[
                { value: '5',  label: '5 minutes before' },
                { value: '15', label: '15 minutes before' },
                { value: '30', label: '30 minutes before' },
                { value: '60', label: '1 hour before' },
              ]} />
            </FieldRow>
          </>
        )}
      </Card>

      <Card title="Logging">
        <FieldRow label="Log retention" hint="How long automation execution logs are kept">
          <Select value={logRetention} onChange={setLogRetention} options={[
            { value: '30',  label: '30 days' },
            { value: '60',  label: '60 days' },
            { value: '90',  label: '90 days' },
            { value: '180', label: '180 days' },
            { value: '365', label: '1 year' },
          ]} />
        </FieldRow>
      </Card>

      <SaveRow saving={saving} onSave={handleSave} />
    </SectionWrap>
  )
}

// ─── Section: Security ────────────────────────────────────────────────────────

function SecuritySection() {
  const { notify } = useToast()
  const [saving, setSaving] = useState(false)
  const [sessionTimeout, setSessionTimeout] = useState('60')
  const [mfaRequired, setMfaRequired] = useState(true)
  const [loginAttempts, setLoginAttempts] = useState('5')
  const [auditRetention, setAuditRetention] = useState('365')
  const [ipAllowlist, setIpAllowlist] = useState('10.0.0.0/8\n172.16.0.0/12\n192.168.1.0/24')
  const [ipEnabled, setIpEnabled] = useState(false)
  const [ssoEnabled, setSsoEnabled] = useState(true)

  const handleSave = async () => {
    setSaving(true)
    await new Promise(r => setTimeout(r, 900))
    setSaving(false)
    notify('success', 'Saved', 'Security settings updated')
  }

  return (
    <SectionWrap title="Security" description="Session management, access controls, and audit configuration">
      <Card title="Session Management">
        <FieldRow label="Session timeout" hint="Auto-logout after this period of inactivity">
          <Select value={sessionTimeout} onChange={setSessionTimeout} options={[
            { value: '15',   label: '15 minutes' },
            { value: '30',   label: '30 minutes' },
            { value: '60',   label: '1 hour' },
            { value: '240',  label: '4 hours' },
            { value: '480',  label: '8 hours' },
            { value: '0',    label: 'Never (not recommended)' },
          ]} />
        </FieldRow>
        <Divider />
        <FieldRow label="Failed login lockout" hint="Lock account after N failed attempts">
          <Select value={loginAttempts} onChange={setLoginAttempts} options={[
            { value: '3',  label: 'After 3 attempts' },
            { value: '5',  label: 'After 5 attempts' },
            { value: '10', label: 'After 10 attempts' },
          ]} />
        </FieldRow>
      </Card>

      <Card title="Authentication">
        <Toggle enabled={mfaRequired} onChange={setMfaRequired}
          label="Require MFA for all admins"
          description="All administrator accounts must enrol a second factor before signing in"
        />
        <Divider />
        <Toggle enabled={ssoEnabled} onChange={setSsoEnabled}
          label="Single sign-on (SSO)"
          description="Allow sign-in via your organisation's identity provider (Microsoft Entra ID)"
        />
        {ssoEnabled && (
          <div className="mt-3 rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-800">Microsoft Entra ID</p>
                <p className="text-[0.65rem] text-slate-500 mt-0.5">zinnia.onmicrosoft.com · Tenant connected</p>
              </div>
              <Badge label="Active" variant="green" className="text-[0.6rem] px-2 py-0.5" />
            </div>
          </div>
        )}
      </Card>

      <Card title="IP Allowlist">
        <Toggle enabled={ipEnabled} onChange={setIpEnabled}
          label="Restrict by IP address"
          description="Only allow admin access from the listed CIDR ranges"
        />
        {ipEnabled && (
          <>
            <Divider />
            <FieldRow label="Allowed ranges" hint="One CIDR per line (e.g. 10.0.0.0/8)">
              <textarea
                value={ipAllowlist}
                onChange={e => setIpAllowlist(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-300/40 transition resize-none"
              />
            </FieldRow>
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
              <Info className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
              <p className="text-[0.65rem] text-amber-700">Your current IP will be added automatically to prevent lockout.</p>
            </div>
          </>
        )}
      </Card>

      <Card title="Audit Logging">
        <FieldRow label="Audit log retention" hint="Logs older than this are permanently deleted">
          <Select value={auditRetention} onChange={setAuditRetention} options={[
            { value: '30',  label: '30 days' },
            { value: '60',  label: '60 days' },
            { value: '90',  label: '90 days' },
            { value: '180', label: '6 months' },
            { value: '365', label: '1 year (recommended)' },
            { value: '730', label: '2 years' },
          ]} />
        </FieldRow>
        <Divider />
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-700">Export audit log</p>
            <p className="text-[0.65rem] text-slate-400 mt-0.5">Download all audit events as CSV</p>
          </div>
          <Button variant="outline" icon={Download} onClick={() => notify('info', 'Export', 'Audit log export started — check your email')}>
            Export
          </Button>
        </div>
      </Card>

      <SaveRow saving={saving} onSave={handleSave} />
    </SectionWrap>
  )
}

// ─── Section: Notifications ───────────────────────────────────────────────────

function NotificationsSection() {
  const { notify } = useToast()
  const [saving, setSaving] = useState(false)
  const [senderName, setSenderName] = useState('ITO Endpoint Alerts')
  const [replyTo, setReplyTo] = useState('no-reply@zinnia.com')
  const [slackWebhook, setSlackWebhook] = useState('')
  const [slackEnabled, setSlackEnabled] = useState(false)
  const [digestEnabled, setDigestEnabled] = useState(true)
  const [digestFreq, setDigestFreq] = useState('weekly')
  const [pagerEnabled, setPagerEnabled] = useState(false)
  const [pagerKey, setPagerKey] = useState('')
  const [testingSlack, setTestingSlack] = useState(false)

  const handleTestSlack = async () => {
    setTestingSlack(true)
    try {
      await api.testSlackConnection()
      notify('success', 'Slack Connected', 'Bot token verified — workspace reachable')
    } catch (err) {
      notify('error', 'Slack Test Failed', err instanceof Error ? err.message : 'Check your Bot Token in Integrations → Slack.')
    } finally {
      setTestingSlack(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    await new Promise(r => setTimeout(r, 900))
    setSaving(false)
    notify('success', 'Saved', 'Notification settings updated')
  }

  return (
    <SectionWrap title="Notifications" description="Global delivery settings, email templates, and third-party channels">
      <Card title="Email Delivery">
        <FieldRow label="Sender name" hint="Shown as the 'From' name in notification emails">
          <Input value={senderName} onChange={setSenderName} />
        </FieldRow>
        <Divider />
        <FieldRow label="Reply-to address" hint="Where replies to automated emails are directed">
          <Input value={replyTo} onChange={setReplyTo} type="email" />
        </FieldRow>
      </Card>

      <Card title="Digest">
        <Toggle enabled={digestEnabled} onChange={setDigestEnabled}
          label="Send compliance digest"
          description="Regular summary of compliance trends across your fleet"
        />
        {digestEnabled && (
          <>
            <Divider />
            <FieldRow label="Frequency">
              <RadioGroup
                options={['Daily', 'Weekly', 'Monthly']}
                value={digestFreq === 'daily' ? 'Daily' : digestFreq === 'monthly' ? 'Monthly' : 'Weekly'}
                onChange={v => setDigestFreq(v.toLowerCase())}
              />
            </FieldRow>
          </>
        )}
      </Card>

      <Card title="Slack" description="Send alerts to a Slack channel via incoming webhook">
        <Toggle enabled={slackEnabled} onChange={setSlackEnabled}
          label="Enable Slack notifications"
          description="Compliance alerts and digests are posted to your channel"
        />
        {slackEnabled && (
          <>
            <Divider />
            <FieldRow label="Webhook URL" hint="Found in your Slack app's Incoming Webhooks section">
              <div className="flex gap-2">
                <Input value={slackWebhook} onChange={setSlackWebhook} placeholder="https://hooks.slack.com/services/…" className="font-mono text-[0.65rem]" />
                <button
                  type="button"
                  onClick={handleTestSlack}
                  disabled={testingSlack}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition"
                >
                  {testingSlack
                    ? <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    : null}
                  {testingSlack ? 'Testing…' : 'Test'}
                </button>
              </div>
            </FieldRow>
          </>
        )}
      </Card>

      <Card title="PagerDuty" description="Route critical alerts to your on-call rotation">
        <Toggle enabled={pagerEnabled} onChange={setPagerEnabled}
          label="Enable PagerDuty integration"
          description="High-severity compliance failures create PagerDuty incidents"
        />
        {pagerEnabled && (
          <>
            <Divider />
            <FieldRow label="Integration key" hint="32-character key from your PagerDuty service">
              <Input value={pagerKey} onChange={setPagerKey} placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" className="font-mono" />
            </FieldRow>
          </>
        )}
      </Card>

      <SaveRow saving={saving} onSave={handleSave} />
    </SectionWrap>
  )
}

// ─── Section: Data & Privacy ──────────────────────────────────────────────────

function DataSection() {
  const { notify } = useToast()
  const [saving, setSaving] = useState(false)
  const [deviceRetention, setDeviceRetention] = useState('365')
  const [activityRetention, setActivityRetention] = useState('90')
  const [piiMasking, setPiiMasking] = useState(false)
  const [gdprMode, setGdprMode] = useState(true)
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    await new Promise(r => setTimeout(r, 1500))
    setExporting(false)
    notify('success', 'Export Ready', 'Your data export has been emailed to avinash.verma@zinnia.com')
  }

  const handleSave = async () => {
    setSaving(true)
    await new Promise(r => setTimeout(r, 900))
    setSaving(false)
    notify('success', 'Saved', 'Data & privacy settings updated')
  }

  return (
    <SectionWrap title="Data & Privacy" description="Data retention, PII handling, and compliance export controls">
      <Card title="Retention Policies">
        <FieldRow label="Device record retention" hint="How long historical device data is stored">
          <Select value={deviceRetention} onChange={setDeviceRetention} options={[
            { value: '90',  label: '90 days' },
            { value: '180', label: '6 months' },
            { value: '365', label: '1 year' },
            { value: '730', label: '2 years' },
            { value: '0',   label: 'Indefinitely' },
          ]} />
        </FieldRow>
        <Divider />
        <FieldRow label="Activity log retention" hint="Purge activity logs older than this">
          <Select value={activityRetention} onChange={setActivityRetention} options={[
            { value: '30',  label: '30 days' },
            { value: '60',  label: '60 days' },
            { value: '90',  label: '90 days' },
            { value: '180', label: '6 months' },
            { value: '365', label: '1 year' },
          ]} />
        </FieldRow>
      </Card>

      <Card title="Privacy Controls">
        <Toggle enabled={piiMasking} onChange={setPiiMasking}
          label="PII masking in exports"
          description="User emails and names are anonymised in all CSV and report exports"
        />
        <Divider />
        <Toggle enabled={gdprMode} onChange={setGdprMode}
          label="GDPR compliance mode"
          description="Enables right-to-erasure workflows and consent tracking"
        />
      </Card>

      <Card title="Export Data">
        <div className="space-y-3">
          {[
            { label: 'All device records',      desc: 'Full device inventory with compliance history',  icon: FileText },
            { label: 'Activity log',            desc: 'All admin and automation actions',                icon: Hash    },
            { label: 'Compliance reports',      desc: 'Historical compliance snapshots',                 icon: ShieldCheck },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between gap-4 py-1">
              <div className="flex items-center gap-3 min-w-0">
                <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-slate-100">
                  <item.icon className="h-3.5 w-3.5 text-slate-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-800">{item.label}</p>
                  <p className="text-[0.62rem] text-slate-500">{item.desc}</p>
                </div>
              </div>
              <Button variant="outline" icon={Download} onClick={() => notify('info', 'Export', `${item.label} export queued`)}>
                Export
              </Button>
            </div>
          ))}
        </div>
        <Divider />
        <div className="pt-1">
          <Button
            variant="outline"
            className="w-full gap-1.5"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting
              ? <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              : <Download className="h-3.5 w-3.5" />}
            {exporting ? 'Preparing export…' : 'Export everything (ZIP)'}
          </Button>
        </div>
      </Card>

      <SaveRow saving={saving} onSave={handleSave} />
    </SectionWrap>
  )
}

// ─── Section: Danger Zone ─────────────────────────────────────────────────────

function DangerSection() {
  const { notify } = useToast()
  const [confirmText, setConfirmText] = useState('')
  const [resetting, setResetting] = useState(false)
  const [purging, setPurging] = useState(false)

  const CONFIRM_PHRASE = 'RESET SETTINGS'

  const handleReset = async () => {
    if (confirmText !== CONFIRM_PHRASE) return
    setResetting(true)
    await new Promise(r => setTimeout(r, 1500))
    setResetting(false)
    setConfirmText('')
    notify('success', 'Settings Reset', 'All settings restored to factory defaults')
  }

  const handlePurge = async () => {
    setPurging(true)
    await new Promise(r => setTimeout(r, 1200))
    setPurging(false)
    notify('success', 'Activity Purged', 'Activity log has been cleared')
  }

  return (
    <SectionWrap title="Danger Zone" description="Irreversible actions — proceed with extreme caution">

      {/* Warning banner */}
      <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5">
        <ShieldAlert className="h-4 w-4 flex-shrink-0 text-red-500 mt-0.5" />
        <p className="text-xs text-red-700 leading-relaxed">
          Actions on this page are <strong>permanent and cannot be undone</strong>. They may affect all administrators and integrations in your organisation.
        </p>
      </div>

      {/* Individual danger actions */}
      <div className="space-y-3">
        {/* Purge activity log */}
        <div className="rounded-[18px] border border-red-200 bg-white overflow-hidden">
          <div className="flex items-start justify-between gap-4 px-5 py-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-red-100 mt-0.5">
                <Trash2 className="h-4 w-4 text-red-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Purge activity log</p>
                <p className="text-[0.68rem] text-slate-500 mt-0.5">Permanently delete all activity records. This cannot be recovered.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handlePurge}
              disabled={purging}
              className="flex-shrink-0 inline-flex items-center gap-1.5 h-8 rounded-lg border border-red-300 bg-red-50 px-3 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-60 transition"
            >
              {purging
                ? <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                : <Trash2 className="h-3 w-3" />}
              {purging ? 'Purging…' : 'Purge log'}
            </button>
          </div>
        </div>

        {/* Revoke all sessions */}
        <div className="rounded-[18px] border border-red-200 bg-white overflow-hidden">
          <div className="flex items-start justify-between gap-4 px-5 py-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-red-100 mt-0.5">
                <Lock className="h-4 w-4 text-red-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Revoke all admin sessions</p>
                <p className="text-[0.68rem] text-slate-500 mt-0.5">Force sign-out every administrator immediately across all devices.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => notify('success', 'Sessions Revoked', 'All admin sessions have been invalidated')}
              className="flex-shrink-0 inline-flex items-center gap-1.5 h-8 rounded-lg border border-red-300 bg-red-50 px-3 text-xs font-semibold text-red-600 hover:bg-red-100 transition"
            >
              <Lock className="h-3 w-3" />
              Revoke all
            </button>
          </div>
        </div>

        {/* Reset all settings — requires typed confirmation */}
        <div className="rounded-[18px] border-2 border-red-300 bg-white overflow-hidden">
          <div className="flex items-start gap-3 px-5 pt-5">
            <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-red-100 mt-0.5">
              <RotateCcw className="h-4 w-4 text-red-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Reset all settings to defaults</p>
              <p className="text-[0.68rem] text-slate-500 mt-0.5 leading-snug">
                Wipes every setting across General, Compliance, Automation, Security, and Notifications. Integration API keys are preserved.
              </p>
            </div>
          </div>
          <div className="px-5 pb-5 mt-4 space-y-3">
            <div>
              <label className="block text-[0.68rem] font-semibold text-slate-700 mb-1.5">
                Type <span className="font-mono text-red-600 bg-red-50 px-1.5 py-0.5 rounded">{CONFIRM_PHRASE}</span> to confirm
              </label>
              <input
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder={CONFIRM_PHRASE}
                className="w-full rounded-lg border border-red-200 bg-red-50/50 px-3 py-2 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-300/40 transition"
              />
            </div>
            <button
              type="button"
              onClick={handleReset}
              disabled={confirmText !== CONFIRM_PHRASE || resetting}
              className="w-full inline-flex items-center justify-center gap-2 h-9 rounded-lg bg-red-600 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {resetting
                ? <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                : <RotateCcw className="h-3.5 w-3.5" />}
              {resetting ? 'Resetting…' : 'Reset all settings'}
            </button>
          </div>
        </div>
      </div>

      {/* Support link */}
      <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3">
        <LifeBuoy className="h-4 w-4 text-orange-500 flex-shrink-0" />
        <p className="text-[0.68rem] text-slate-600">
          Need help?{' '}
          <a
            href="https://github.com/anthropics/claude-code/issues"
            target="_blank"
            rel="noreferrer"
            className="text-orange-600 font-semibold hover:underline focus-visible:ring-1 focus-visible:ring-orange-300 rounded"
          >
            Open a support ticket →
          </a>
        </p>
      </div>
    </SectionWrap>
  )
}

// ─── Section: Roles & Permissions ────────────────────────────────────────────

const ROLES_DEF = [
  {
    key: 'global',
    name: 'Global Admin',
    badge: 'bg-orange-100 text-orange-700 border-orange-200',
    icon: Lock,
    who: 'IT Operations leads, platform owners',
    summary: 'Unrestricted access to all features, settings, integrations, and user management.',
    capabilities: ['Full dashboard access', 'Run & configure automations', 'Manage integrations & API keys', 'Manage users & assign roles', 'Access all Settings sections', 'Danger Zone actions'],
  },
  {
    key: 'admin',
    name: 'IT Admin',
    badge: 'bg-lime-100 text-lime-700 border-lime-200',
    icon: ShieldCheck,
    who: 'Endpoint engineers, senior IT staff',
    summary: 'Full operational access — devices, runbooks, exports. No org-level configuration.',
    capabilities: ['Full dashboard access', 'Run runbooks & automations', 'View integration status & sync', 'Export device / compliance reports', 'View (not modify) security settings', 'Own notification preferences'],
  },
  {
    key: 'helpdesk',
    name: 'Helpdesk',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    icon: Users,
    who: 'Front-line support, service desk agents',
    summary: 'Read-only + device sync. Must escalate runbook execution to an IT Admin.',
    capabilities: ['View dashboard & device details', 'Search devices', 'Trigger device sync (safe)', 'View runbook steps (read-only)', 'View activity log (read-only)', 'Own notification preferences'],
  },
]

type PermLevel = 'allow' | 'deny' | 'limit'

const PERM_GROUPS: { group: string; rows: { label: string; global: PermLevel; admin: PermLevel; helpdesk: PermLevel }[] }[] = [
  { group: 'Dashboard & Devices', rows: [
    { label: 'View compliance dashboard',       global: 'allow', admin: 'allow', helpdesk: 'allow' },
    { label: 'Search & view device details',    global: 'allow', admin: 'allow', helpdesk: 'allow' },
    { label: 'Trigger device sync',             global: 'allow', admin: 'allow', helpdesk: 'allow' },
    { label: 'Copy serial / user email',        global: 'allow', admin: 'allow', helpdesk: 'deny'  },
  ]},
  { group: 'Runbooks & Automation', rows: [
    { label: 'View runbook steps',              global: 'allow', admin: 'allow', helpdesk: 'allow' },
    { label: 'Execute a runbook',               global: 'allow', admin: 'allow', helpdesk: 'deny'  },
    { label: 'Start automation',                global: 'allow', admin: 'allow', helpdesk: 'deny'  },
    { label: 'Create / edit runbooks',          global: 'allow', admin: 'deny',  helpdesk: 'deny'  },
    { label: 'Configure auto-remediation',      global: 'allow', admin: 'deny',  helpdesk: 'deny'  },
  ]},
  { group: 'Integrations', rows: [
    { label: 'View integration status',         global: 'allow', admin: 'allow', helpdesk: 'deny'  },
    { label: 'Trigger integration sync',        global: 'allow', admin: 'allow', helpdesk: 'deny'  },
    { label: 'View API keys',                   global: 'allow', admin: 'deny',  helpdesk: 'deny'  },
    { label: 'Modify / disconnect integration', global: 'allow', admin: 'deny',  helpdesk: 'deny'  },
  ]},
  { group: 'Reports & Exports', rows: [
    { label: 'View reports & analytics',        global: 'allow', admin: 'allow', helpdesk: 'deny'  },
    { label: 'Export device / compliance data', global: 'allow', admin: 'allow', helpdesk: 'deny'  },
    { label: 'Export audit log',                global: 'allow', admin: 'allow', helpdesk: 'deny'  },
    { label: 'View activity log',               global: 'allow', admin: 'allow', helpdesk: 'limit' },
  ]},
  { group: 'Settings', rows: [
    { label: 'General / Compliance / Automation', global: 'allow', admin: 'deny',  helpdesk: 'deny' },
    { label: 'Security settings',               global: 'allow', admin: 'limit', helpdesk: 'deny'  },
    { label: 'Notifications (org-wide)',        global: 'allow', admin: 'deny',  helpdesk: 'deny'  },
    { label: 'Notifications (own profile)',     global: 'allow', admin: 'allow', helpdesk: 'allow' },
    { label: 'Data & Privacy / Danger Zone',    global: 'allow', admin: 'deny',  helpdesk: 'deny'  },
  ]},
  { group: 'User Management', rows: [
    { label: 'View / manage users',             global: 'allow', admin: 'deny',  helpdesk: 'deny'  },
    { label: 'Assign / change roles',           global: 'allow', admin: 'deny',  helpdesk: 'deny'  },
    { label: 'Edit own profile',                global: 'allow', admin: 'allow', helpdesk: 'allow' },
  ]},
]

function PermCell({ level }: { level: PermLevel }) {
  if (level === 'allow') return <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
  if (level === 'deny')  return <XCircle      className="h-4 w-4 text-red-400    mx-auto" />
  return (
    <span className="flex flex-col items-center gap-0.5">
      <MinusCircle className="h-4 w-4 text-amber-400 mx-auto" />
      <span className="text-[0.5rem] text-amber-500 font-bold leading-none">View</span>
    </span>
  )
}

function RolesSection() {
  const { notify } = useToast()
  const [userRoles, setUserRoles] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const handleRoleChange = (email: string, role: string) => {
    setUserRoles(prev => ({ ...prev, [email]: role }))
    notify('info', 'Role Changed', `Role updated — click Save to apply`)
  }

  const handleSave = async () => {
    setSaving(true)
    await new Promise(r => setTimeout(r, 800))
    setSaving(false)
    notify('success', 'Roles Saved', 'Role assignments have been updated')
  }


  const roleLabel: Record<string, { label: string; badge: string }> = {
    global:   { label: 'Global Admin', badge: 'bg-orange-100 text-orange-700' },
    admin:    { label: 'IT Admin',     badge: 'bg-lime-100 text-lime-700' },
    helpdesk: { label: 'Helpdesk',     badge: 'bg-slate-100 text-slate-600' },
  }

  return (
    <SectionWrap title="Roles & Permissions" description="Three roles govern what each team member can see and do in ITO Endpoint">

      {/* Role definition cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {ROLES_DEF.map(role => {
          const Icon = role.icon
          return (
            <div key={role.key} className={`rounded-[18px] border bg-white shadow-sm shadow-slate-900/5 overflow-hidden`}>
              <div className={`flex items-center gap-2.5 border-b px-4 py-3 ${role.badge}`}>
                <Icon className="h-4 w-4 flex-shrink-0" />
                <p className="text-xs font-bold">{role.name}</p>
              </div>
              <div className="px-4 py-3 space-y-2.5">
                <p className="text-[0.65rem] text-slate-500 leading-relaxed">{role.summary}</p>
                <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-slate-400">Who it's for</p>
                <p className="text-[0.65rem] text-slate-700">{role.who}</p>
                <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-slate-400 mt-1">Capabilities</p>
                <ul className="space-y-1">
                  {role.capabilities.map(c => (
                    <li key={c} className="flex items-center gap-1.5 text-[0.65rem] text-slate-700">
                      <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-emerald-500" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-[0.68rem] text-slate-500">
        <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Full access</span>
        <span className="flex items-center gap-1.5"><MinusCircle  className="h-3.5 w-3.5 text-amber-400"  /> View only</span>
        <span className="flex items-center gap-1.5"><XCircle      className="h-3.5 w-3.5 text-red-400"    /> No access</span>
      </div>

      {/* Permissions matrix */}
      <div className="rounded-[18px] border border-slate-200 bg-white shadow-sm shadow-slate-900/5 overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3.5">
          <p className="text-xs font-semibold text-slate-900">Permissions Matrix</p>
          <p className="text-[0.65rem] text-slate-500 mt-0.5">Full breakdown of what each role can see and do</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="py-2.5 px-5 text-left text-[0.65rem] font-semibold text-slate-500">Action</th>
                {ROLES_DEF.map(r => (
                  <th key={r.key} className="py-2.5 px-4 text-center text-[0.65rem] font-semibold whitespace-nowrap min-w-[96px]">
                    <span className={`inline-block rounded-full border px-2 py-0.5 ${r.badge}`}>{r.name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERM_GROUPS.map(group => (
                <>
                  <tr key={group.group} className="bg-slate-50">
                    <td colSpan={4} className="px-5 py-1.5 text-[0.6rem] font-bold uppercase tracking-widest text-slate-400">
                      {group.group}
                    </td>
                  </tr>
                  {group.rows.map(row => (
                    <tr key={row.label} className="border-b border-slate-100/80 hover:bg-slate-50/60 transition-colors">
                      <td className="py-2 px-5 text-[0.72rem] text-slate-700">{row.label}</td>
                      <td className="py-2 px-4"><PermCell level={row.global} /></td>
                      <td className="py-2 px-4"><PermCell level={row.admin} /></td>
                      <td className="py-2 px-4"><PermCell level={row.helpdesk} /></td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Assignments — populated from live directory integration */}
      <div className="rounded-[18px] border border-slate-200 bg-white shadow-sm shadow-slate-900/5 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div>
            <p className="text-xs font-semibold text-slate-900">User Assignments</p>
            <p className="text-[0.65rem] text-slate-500 mt-0.5">Change a user's role — only Global Admins can do this</p>
          </div>
          <a
            href="#"
            onClick={e => { e.preventDefault(); notify('info', 'Manage Users', 'Go to the Users page to invite and manage user accounts') }}
            className="inline-flex items-center gap-1.5 h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Manage in Users page
          </a>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 px-5 py-10 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
            <UserPlus className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">No users synced yet</p>
            <p className="text-[0.72rem] text-slate-500 mt-1 max-w-xs leading-relaxed">
              Connect a directory service (Microsoft Entra ID, Okta) in{' '}
              <span className="font-semibold text-slate-700">Settings → Integrations</span>{' '}
              to sync users and assign roles here.
            </p>
          </div>
        </div>
      </div>

    </SectionWrap>
  )
}

// ─── Navigation Section ───────────────────────────────────────────────────────

function ToggleSwitch({ checked, onChange, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 ${
        disabled ? 'cursor-not-allowed opacity-40' : ''
      } ${checked ? 'bg-[#F46C00]' : 'bg-slate-200'}`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

function NavigationSection({ viewerRole }: { viewerRole: UserToolRole }) {
  const { prefs, setVisible, resetToDefaults, isAlwaysVisible } = useNavVisibility()
  const { showToast } = useToast()
  const [confirmReset, setConfirmReset] = useState(false)

  const hiddenCount = navItems.filter(item =>
    !isAlwaysVisible(item.id) && prefs[item.id] === false
  ).length

  const handleReset = () => {
    if (!confirmReset) { setConfirmReset(true); return }
    resetToDefaults()
    setConfirmReset(false)
    showToast('Navigation restored to defaults — all items are now visible', 'success')
  }

  const grouped = NAV_GROUP_ORDER.map(group => ({
    group,
    items: navItems.filter(i => i.group === group),
  })).filter(g => g.items.length > 0)

  const canEdit = viewerRole === 'Global Admin' || viewerRole === 'IT Admin'

  return (
    <SectionWrap
      title="Navigation Visibility"
      description="Control which items appear in the left sidebar. Pages remain fully accessible via direct navigation — only the menu entry is hidden."
    >
      {/* Info banner */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex gap-3">
        <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-700 space-y-1">
          <p className="font-semibold">How visibility works</p>
          <ul className="space-y-0.5 text-blue-600 list-disc list-inside">
            <li>Hiding a menu item only removes it from the sidebar — the page and its data are unaffected.</li>
            <li><strong>Settings</strong> is always visible and cannot be hidden.</li>
            <li>Items restricted by your role (shown with a lock) are always hidden regardless of this toggle.</li>
            <li>Changes take effect immediately and persist across sessions.</li>
          </ul>
        </div>
      </div>

      {/* Role & status row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.7rem] font-semibold text-slate-600">
            Role: {viewerRole}
          </span>
          {hiddenCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[0.7rem] font-semibold text-amber-700">
              {hiddenCount} item{hiddenCount !== 1 ? 's' : ''} hidden
            </span>
          )}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={handleReset}
            onBlur={() => setConfirmReset(false)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              confirmReset
                ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {confirmReset ? 'Click again to confirm reset' : 'Reset to Defaults'}
          </button>
        )}
      </div>

      {/* Groups */}
      <div className="space-y-4">
        {grouped.map(({ group, items }) => (
          <div key={group} className="rounded-[18px] border border-slate-200 bg-white shadow-sm overflow-hidden">
            {/* Group header */}
            <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-2.5">
              <p className="text-[0.65rem] font-black uppercase tracking-widest text-slate-400">{group}</p>
            </div>

            {/* Items */}
            <div className="divide-y divide-slate-100">
              {items.map(item => {
                const Icon = item.icon
                const alwaysOn = isAlwaysVisible(item.id)
                const roleBlocked = !canAccess(viewerRole, item.title)
                const isOn = !roleBlocked && (alwaysOn || prefs[item.id] !== false)
                const canToggle = canEdit && !alwaysOn && !roleBlocked

                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between px-5 py-3 transition-colors ${
                      roleBlocked || (!canEdit) ? 'opacity-60' : 'hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Icon */}
                      <div className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl ${
                        roleBlocked ? 'bg-slate-100' : isOn ? 'bg-orange-50 border border-orange-100' : 'bg-slate-100'
                      }`}>
                        <Icon className={`h-4 w-4 ${roleBlocked ? 'text-slate-300' : isOn ? 'text-[#F46C00]' : 'text-slate-400'}`} />
                      </div>

                      {/* Label + tags */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-semibold ${roleBlocked ? 'text-slate-400' : isOn ? 'text-slate-800' : 'text-slate-500'}`}>
                            {item.title}
                          </span>
                          {alwaysOn && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[0.6rem] font-bold text-slate-500">
                              <Lock className="h-2.5 w-2.5" />Always visible
                            </span>
                          )}
                          {roleBlocked && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[0.6rem] font-bold text-slate-400">
                              <Lock className="h-2.5 w-2.5" />Role restricted
                            </span>
                          )}
                          {!isOn && !roleBlocked && !alwaysOn && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.6rem] font-semibold text-slate-500">Hidden</span>
                          )}
                        </div>
                        <p className="text-[0.62rem] text-slate-400 mt-0.5">
                          {roleBlocked
                            ? 'Not available for your role'
                            : alwaysOn
                              ? 'This item cannot be hidden'
                              : isOn
                                ? 'Visible in sidebar'
                                : 'Hidden from sidebar — page still accessible'}
                        </p>
                      </div>
                    </div>

                    {/* Toggle */}
                    <div className="flex-shrink-0 ml-4">
                      <ToggleSwitch
                        checked={isOn}
                        onChange={v => {
                          setVisible(item.id, v)
                          showToast(
                            `${item.title} ${v ? 'shown in' : 'hidden from'} sidebar`,
                            v ? 'success' : 'info',
                          )
                        }}
                        disabled={!canToggle}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Helpdesk note */}
      {viewerRole === 'Helpdesk' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            <span className="font-semibold">Helpdesk role:</span> Navigation visibility is read-only for your role. Contact an IT Admin or Global Admin to adjust sidebar menu items.
          </p>
        </div>
      )}
    </SectionWrap>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function SettingsPage({ viewerRole = 'Global Admin' }: { viewerRole?: UserToolRole }) {
  const [active, setActive] = useState<SectionKey>('general')

  const sectionMap: Record<SectionKey, React.ReactNode> = {
    general:       <GeneralSection />,
    navigation:    <NavigationSection viewerRole={viewerRole} />,
    integrations:  <IntegrationsSection />,
    roles:         <RolesSection />,
    compliance:    <ComplianceSection />,
    automation:    <AutomationSection />,
    security:      <SecuritySection />,
    notifications: <NotificationsSection />,
    data:          <DataSection />,
    danger:        <DangerSection />,
  }

  return (
    <div className="flex flex-col lg:flex-row gap-5 w-full items-start">

      {/* ── Left nav ──────────────────────────────────────────────────────── */}
      <div className="w-full lg:w-52 flex-shrink-0">
        <div className="rounded-[18px] border border-slate-200 bg-white shadow-sm shadow-slate-900/5 p-2">
          <p className="px-3 pt-1.5 pb-2 text-[0.6rem] font-semibold uppercase tracking-widest text-slate-400">
            Settings
          </p>
          <nav className="space-y-0.5" aria-label="Settings navigation">
            {NAV.map(item => {
              const Icon = item.icon
              const isActive = active === item.key
              const isDanger = 'danger' in item && item.danger

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActive(item.key)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`group flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition focus-visible:ring-2 focus-visible:ring-orange-300 ${
                    isActive
                      ? isDanger
                        ? 'bg-red-50 text-red-600 border border-red-200'
                        : 'bg-orange-50 text-orange-700 border border-orange-200'
                      : isDanger
                        ? 'text-red-400 hover:bg-red-50 hover:text-red-600 border border-transparent'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                  }`}
                >
                  <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? (isDanger ? 'text-red-500' : 'text-orange-600') : isDanger ? 'text-red-400' : 'text-slate-400 group-hover:text-slate-600'}`} />
                  <span className="flex-1 text-xs font-medium">{item.label}</span>
                  {'badge' in item && item.badge && !isActive && (
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[0.55rem] font-bold text-slate-500">
                      {item.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        {sectionMap[active]}
      </div>

    </div>
  )
}
