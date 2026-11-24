import { useState } from 'react'
import { SectionWrap, DocCard, CardHeader } from '../components/docs/DocPrimitives'
import { SecuritySection, PatchingSection, RemoteActionsSection, AnalysisSection, OceanSection, PagesIndexSection } from '../components/docs/FeatureSections'
import {
  BookMarked, ShieldCheck, Zap, Users, Laptop2, Settings,
  CheckCircle2, XCircle, MinusCircle, ChevronRight,
  HelpCircle, AlertTriangle, Lock, Globe, LifeBuoy, FileText,
  Terminal, BarChart2, Wrench, Play, Bell, MessageSquare, Ticket,
  Clock, Package, Activity, Waves,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type DocSection =
  | 'overview' | 'quickstart' | 'onboarding'
  | 'dashboard' | 'automation' | 'reports' | 'security' | 'patching' | 'remote' | 'analysis' | 'ocean' | 'pages'
  | 'configuration' | 'roles'
  | 'troubleshooting' | 'faq'

interface NavItem { key: DocSection; label: string; icon: React.ElementType; badge?: string }
interface NavGroup { label: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Getting Started',
    items: [
      { key: 'overview',    label: 'Overview',    icon: BookMarked   },
      { key: 'quickstart',  label: 'Quick Start', icon: Zap,          badge: 'New' },
      { key: 'onboarding',  label: 'Onboarding',  icon: CheckCircle2 },
    ],
  },
  {
    label: 'User Guide',
    items: [
      { key: 'dashboard',   label: 'Dashboard & Devices',       icon: Laptop2     },
      { key: 'automation',  label: 'Automation Rules',          icon: Activity    },
      { key: 'reports',     label: 'Reports & Analytics',       icon: BarChart2   },
      { key: 'security',    label: 'Security Posture',          icon: ShieldCheck },
      { key: 'patching',    label: 'Patching',                  icon: Package, badge: 'New' },
      { key: 'remote',      label: 'Remote Action Center',      icon: Activity    },
      { key: 'analysis',    label: 'Security Analysis',         icon: Activity    },
      { key: 'ocean',       label: 'Ocean Assistant',           icon: Waves       },
      { key: 'pages',       label: 'Every Page (A–Z)',          icon: FileText    },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { key: 'configuration', label: 'Integration Setup',    icon: Globe   },
      { key: 'roles',         label: 'Roles & Permissions',  icon: Lock    },
    ],
  },
  {
    label: 'Reference',
    items: [
      { key: 'troubleshooting', label: 'Troubleshooting', icon: Wrench     },
      { key: 'faq',             label: 'FAQ',             icon: HelpCircle },
    ],
  },
]

// Permission cell icons
function Allow() { return <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" /> }
function Deny()  { return <XCircle      className="h-4 w-4 text-red-400    mx-auto" /> }
function Limit() { return <MinusCircle  className="h-4 w-4 text-amber-400  mx-auto" aria-label="Limited" /> }

// ─── Section: Overview ────────────────────────────────────────────────────────

function OverviewSection() {
  const features = [
    { icon: Laptop2,    label: 'Device Management',    desc: 'Search and inspect managed endpoints across all connected MDM sources.' },
    { icon: ShieldCheck,label: 'Compliance Monitoring', desc: 'Real-time compliance status, policy failure details, and trend visualisation.' },
    { icon: Waves,      label: 'Ocean', desc: 'AI endpoint operations assistant that answers questions and performs confirmed write actions (Jira tickets, automation test-runs) over live app data.' },
    { icon: Globe,      label: 'Integrations',          desc: 'Unified view across Microsoft Intune, Microsoft Entra ID, and ManageEngine (Windows, macOS, Linux).' },
    { icon: Settings,   label: 'Settings',              desc: 'Organisation-wide configuration for compliance, automation, and security.' },
  ]

  return (
    <SectionWrap title="ITO Endpoint Overview" description="What this tool does and who it's for">
      <DocCard>
        <div className="px-5 py-5 space-y-4">
          <p className="text-sm text-slate-700 leading-relaxed">
            <strong>ITO Endpoint</strong> is an endpoint compliance dashboard that gives your IT team a single pane of glass across all managed devices. It aggregates data from Microsoft Intune, Microsoft Entra ID, and ManageEngine, surfaces compliance and identity risk in real time, and includes Ocean, an AI operations assistant that can act on that data directly.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {features.map(f => (
              <div key={f.label} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3">
                <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-orange-100 mt-0.5">
                  <f.icon className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-900">{f.label}</p>
                  <p className="text-[0.65rem] text-slate-500 mt-0.5 leading-snug">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DocCard>

      <DocCard>
        <CardHeader title="Supported Integrations" />
        <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { name: 'Microsoft Intune', color: 'bg-orange-100 text-orange-700',    desc: 'Windows device MDM' },
            { name: 'ManageEngine',     color: 'bg-orange-100 text-orange-700', desc: 'Cross-platform UEM (Windows & macOS)' },
          ].map(itg => (
            <div key={itg.name} className={`rounded-xl px-3 py-2.5 ${itg.color}`}>
              <p className="text-xs font-bold leading-tight">{itg.name}</p>
              <p className="text-[0.62rem] mt-0.5 opacity-75">{itg.desc}</p>
            </div>
          ))}
        </div>
      </DocCard>
    </SectionWrap>
  )
}

// ─── Section: Roles ───────────────────────────────────────────────────────────

const ROLES = [
  {
    key: 'global',
    name: 'Global Admin',
    color: 'from-orange-500 to-orange-600',
    badge: 'bg-orange-100 text-orange-700',
    icon: Lock,
    who: 'IT Operations leads, platform owners',
    summary: 'Unrestricted access to all features, settings, integrations, and user management.',
    count: '1–2 people',
  },
  {
    key: 'admin',
    name: 'IT Admin',
    color: 'from-lime-500 to-lime-600',
    badge: 'bg-lime-100 text-lime-700',
    icon: ShieldCheck,
    who: 'Endpoint engineers, senior IT staff',
    summary: 'Full operational access — manage devices, run runbooks, export reports. No org-level configuration.',
    count: 'Typical team',
  },
  {
    key: 'helpdesk',
    name: 'Helpdesk',
    color: 'from-slate-400 to-slate-500',
    badge: 'bg-slate-100 text-slate-700',
    icon: LifeBuoy,
    who: 'Front-line support, service desk agents',
    summary: 'Read-only access plus device sync. Must escalate all runbook execution to an IT Admin.',
    count: 'Support team',
  },
]

const PERMISSION_GROUPS = [
  {
    group: 'Dashboard & Devices',
    rows: [
      { label: 'View compliance dashboard',      global: 'allow', admin: 'allow', helpdesk: 'allow' },
      { label: 'Search devices',                 global: 'allow', admin: 'allow', helpdesk: 'allow' },
      { label: 'View device details',            global: 'allow', admin: 'allow', helpdesk: 'allow' },
      { label: 'Trigger device sync',            global: 'allow', admin: 'allow', helpdesk: 'allow' },
      { label: 'Copy serial / user email',       global: 'allow', admin: 'allow', helpdesk: 'deny'  },
    ],
  },
  {
    group: 'Automation Rules',
    rows: [
      { label: 'View automation rules',          global: 'allow', admin: 'allow', helpdesk: 'allow' },
      { label: 'Trigger a Test Run',             global: 'allow', admin: 'allow', helpdesk: 'deny'  },
      { label: 'Create / edit / delete rules',   global: 'allow', admin: 'deny',  helpdesk: 'deny'  },
      { label: 'Confirm an Ocean write action',   global: 'allow', admin: 'allow', helpdesk: 'deny'  },
    ],
  },
  {
    group: 'Compliance Policies',
    rows: [
      { label: 'View compliance policies',       global: 'allow', admin: 'allow', helpdesk: 'allow' },
      { label: 'Modify compliance policies',     global: 'allow', admin: 'allow', helpdesk: 'deny'  },
      { label: 'Adjust risk score weights',      global: 'allow', admin: 'deny',  helpdesk: 'deny'  },
      { label: 'Set compliance grace period',    global: 'allow', admin: 'deny',  helpdesk: 'deny'  },
    ],
  },
  {
    group: 'Integrations',
    rows: [
      { label: 'View integration status',        global: 'allow', admin: 'allow', helpdesk: 'deny'  },
      { label: 'Trigger integration sync',       global: 'allow', admin: 'allow', helpdesk: 'deny'  },
      { label: 'View API keys',                  global: 'allow', admin: 'deny',  helpdesk: 'deny'  },
      { label: 'Modify / disconnect integration',global: 'allow', admin: 'deny',  helpdesk: 'deny'  },
    ],
  },
  {
    group: 'Reports & Exports',
    rows: [
      { label: 'View reports & analytics',       global: 'allow', admin: 'allow', helpdesk: 'deny'  },
      { label: 'Export device records',          global: 'allow', admin: 'allow', helpdesk: 'deny'  },
      { label: 'Export audit log',               global: 'allow', admin: 'allow', helpdesk: 'deny'  },
      { label: 'Export all data (ZIP)',           global: 'allow', admin: 'deny',  helpdesk: 'deny'  },
      { label: 'View activity log',              global: 'allow', admin: 'allow', helpdesk: 'limit' },
    ],
  },
  {
    group: 'Settings',
    rows: [
      { label: 'General settings',               global: 'allow', admin: 'deny',  helpdesk: 'deny'  },
      { label: 'Compliance settings',            global: 'allow', admin: 'deny',  helpdesk: 'deny'  },
      { label: 'Automation settings',            global: 'allow', admin: 'deny',  helpdesk: 'deny'  },
      { label: 'Security settings',              global: 'allow', admin: 'limit', helpdesk: 'deny'  },
      { label: 'Org notification settings',      global: 'allow', admin: 'deny',  helpdesk: 'deny'  },
      { label: 'Own notification preferences',   global: 'allow', admin: 'allow', helpdesk: 'allow' },
      { label: 'Data & Privacy',                 global: 'allow', admin: 'deny',  helpdesk: 'deny'  },
      { label: 'Danger Zone',                    global: 'allow', admin: 'deny',  helpdesk: 'deny'  },
    ],
  },
  {
    group: 'User Management',
    rows: [
      { label: 'View all users',                 global: 'allow', admin: 'deny',  helpdesk: 'deny'  },
      { label: 'Create / deactivate users',      global: 'allow', admin: 'deny',  helpdesk: 'deny'  },
      { label: 'Assign / change roles',          global: 'allow', admin: 'deny',  helpdesk: 'deny'  },
      { label: 'Edit own profile',               global: 'allow', admin: 'allow', helpdesk: 'allow' },
    ],
  },
]

type PermLevel = 'allow' | 'deny' | 'limit'

function PermCell({ level }: { level: PermLevel }) {
  if (level === 'allow') return <Allow />
  if (level === 'deny')  return <Deny />
  return (
    <span className="flex flex-col items-center gap-0.5">
      <Limit />
      <span className="text-[0.5rem] text-amber-500 font-semibold leading-none">Limited</span>
    </span>
  )
}

function RolesSection() {
  return (
    <SectionWrap title="Roles & Permissions" description="Three roles govern what each team member can see and do in ITO Endpoint">
      {/* Role cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {ROLES.map(role => (
          <DocCard key={role.key}>
            <div className={`h-1.5 bg-gradient-to-r ${role.color}`} />
            <div className="px-4 py-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl ${role.badge}`}>
                  <role.icon className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">{role.name}</p>
                  <p className="text-[0.62rem] text-slate-500 mt-0.5">{role.count}</p>
                </div>
              </div>
              <p className="text-[0.68rem] text-slate-500 leading-relaxed">{role.summary}</p>
              <div className="rounded-lg bg-slate-50 border border-slate-200/80 px-2.5 py-2">
                <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-slate-400 mb-1">Typical users</p>
                <p className="text-[0.68rem] text-slate-700">{role.who}</p>
              </div>
            </div>
          </DocCard>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-[0.68rem] text-slate-500">
        <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Full access</span>
        <span className="flex items-center gap-1.5"><MinusCircle  className="h-3.5 w-3.5 text-amber-400"   /> Limited / read-only</span>
        <span className="flex items-center gap-1.5"><XCircle      className="h-3.5 w-3.5 text-red-400"     /> No access</span>
      </div>

      {/* Permission matrix */}
      <DocCard>
        <CardHeader title="Permissions Matrix" description="Full breakdown of what each role can see and do" />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="py-2.5 px-5 text-left text-[0.65rem] font-semibold text-slate-500 w-full">Feature / Action</th>
                {ROLES.map(r => (
                  <th key={r.key} className="py-2.5 px-4 text-center text-[0.65rem] font-semibold whitespace-nowrap min-w-[90px]">
                    <span className={`inline-block rounded-full px-2 py-0.5 ${r.badge}`}>{r.name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_GROUPS.map(group => (
                <>
                  <tr key={group.group} className="bg-slate-50">
                    <td colSpan={4} className="px-5 py-1.5 text-[0.6rem] font-bold uppercase tracking-widest text-slate-400">
                      {group.group}
                    </td>
                  </tr>
                  {group.rows.map(row => (
                    <tr key={row.label} className="border-b border-slate-100/80 hover:bg-slate-50/60 transition-colors">
                      <td className="py-2 px-5 text-[0.72rem] text-slate-700">{row.label}</td>
                      <td className="py-2 px-4 text-center"><PermCell level={row.global   as PermLevel} /></td>
                      <td className="py-2 px-4 text-center"><PermCell level={row.admin    as PermLevel} /></td>
                      <td className="py-2 px-4 text-center"><PermCell level={row.helpdesk as PermLevel} /></td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </DocCard>
    </SectionWrap>
  )
}

// ─── Section: Onboarding ──────────────────────────────────────────────────────

function OnboardingSection() {
  const [activeRole, setActiveRole] = useState<'global' | 'admin' | 'helpdesk'>('global')
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  const toggle = (key: string) => setChecked(p => ({ ...p, [key]: !p[key] }))

  const checklists: Record<string, { title: string; items: string[] }[]> = {
    global: [
      {
        title: 'Initial Setup',
        items: [
          'Sign in via SSO (Microsoft Entra ID) or admin credentials',
          'Verify all 4 integrations show "Connected" in Settings → Integrations',
          'Confirm device counts match expected fleet size',
          'Set compliance grace period in Settings → Compliance',
          'Configure risk score weights to match your organisation\'s priorities',
          'Enable MFA enforcement for all admins in Settings → Security',
        ],
      },
      {
        title: 'Notifications & Automation',
        items: [
          'Configure org-wide notification settings in Settings → Notifications',
          'Set up Slack webhook for real-time alerts (optional)',
          'Review auto-remediation settings — enable with caution',
          'Configure quiet hours in your own Profile → Notifications',
        ],
      },
      {
        title: 'Team Access',
        items: [
          'Invite IT Admins and assign the IT Admin role',
          'Invite Helpdesk staff and assign the Helpdesk role',
          'Review and share this documentation with your team',
          'Schedule a walkthrough session for first-time IT Admins',
        ],
      },
    ],
    admin: [
      {
        title: 'Getting Started',
        items: [
          'Sign in via SSO or email credentials provided by your Global Admin',
          'Enrol MFA — your Global Admin has made this mandatory',
          'Explore the compliance dashboard to understand your fleet baseline',
          'Search for a device you manage to see the full device detail view',
        ],
      },
      {
        title: 'Daily Workflow',
        items: [
          'Check the Non-Compliant stat card each morning for new issues',
          'Use Risk Scoring to see which devices/users need the most urgent attention',
          'Ask Ocean for a summary of overnight compliance changes',
          'Escalate a device to Jira or link a Confluence article directly from its Risk Scoring row',
        ],
      },
    ],
    helpdesk: [
      {
        title: 'Getting Started',
        items: [
          'Sign in via SSO or credentials provided by your Global Admin',
          'Enrol MFA — required by org policy',
          'Understand the three compliance states: Compliant (green), Warning (amber), Non-Compliant (red)',
        ],
      },
      {
        title: 'Looking Up a Device',
        items: [
          'Use the search bar at the top — search by device name, user email, or serial number',
          'The Device Summary card shows the device\'s current state and primary issue',
          'The Compliance Details card shows which specific policy failed and why',
        ],
      },
      {
        title: 'Escalation Rules',
        items: [
          'If a device needs remediation triggered: escalate to an IT Admin',
          'If a device needs a policy change: escalate to an IT Admin',
          'You CAN click "Sync Now" on a device — this is safe and non-destructive',
          'Do not attempt to access Settings — it is not available to your role',
        ],
      },
    ],
  }

  const roleLabels = { global: 'Global Admin', admin: 'IT Admin', helpdesk: 'Helpdesk' }

  const currentChecklist = checklists[activeRole]
  const allItems = currentChecklist.flatMap(g => g.items)
  const doneCount = allItems.filter(item => checked[`${activeRole}-${item}`]).length

  return (
    <SectionWrap title="Onboarding Checklists" description="Step-by-step guide for each role's first day with ITO Endpoint">
      {/* Role tabs */}
      <div className="flex gap-2 flex-wrap">
        {(['global', 'admin', 'helpdesk'] as const).map(r => (
          <button
            key={r}
            type="button"
            onClick={() => setActiveRole(r)}
            className={`rounded-lg border px-3.5 py-2 text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-orange-300 ${
              activeRole === r
                ? 'is-selected'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            }`}
          >
            {roleLabels[r]}
          </button>
        ))}
      </div>

      {/* Progress */}
      <DocCard>
        <div className="px-5 py-3 border-b border-slate-100">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-semibold text-slate-800">{roleLabels[activeRole]} onboarding progress</p>
            <span className="text-xs font-bold text-orange-700">{doneCount} / {allItems.length}</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-500 transition-all duration-500"
              style={{ width: `${allItems.length ? (doneCount / allItems.length) * 100 : 0}%` }}
            />
          </div>
        </div>
        <div className="px-5 py-4 space-y-5">
          {currentChecklist.map(group => (
            <div key={group.title}>
              <p className="text-[0.62rem] font-bold uppercase tracking-widest text-slate-400 mb-2">{group.title}</p>
              <div className="space-y-2">
                {group.items.map(item => {
                  const key = `${activeRole}-${item}`
                  const done = !!checked[key]
                  return (
                    <label key={item} className="flex items-start gap-3 cursor-pointer group">
                      <div
                        onClick={() => toggle(key)}
                        className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition ${
                          done
                            ? 'border-orange-500 bg-orange-500'
                            : 'border-slate-300 bg-white group-hover:border-orange-400'
                        }`}
                      >
                        {done && <CheckCircle2 className="h-3 w-3 text-white" strokeWidth={3} />}
                      </div>
                      <span className={`text-[0.72rem] leading-snug ${done ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                        {item}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </DocCard>
    </SectionWrap>
  )
}

// ─── Section: FAQ ─────────────────────────────────────────────────────────────

function FaqSection() {
  const [open, setOpen] = useState<number | null>(null)

  const faqs = [
    {
      q: 'Can an IT Admin run an automation without approval?',
      a: 'Yes — IT Admins have full automation rights, including enabling/disabling rules and triggering a Test Run. Only Helpdesk users require escalation to an IT Admin before remediation is triggered.',
    },
    {
      q: 'Can Helpdesk see the user email associated with a device?',
      a: 'Yes, the user email is visible in the Device Summary panel. However, Helpdesk users cannot copy it to the clipboard — that action is restricted to IT Admin and above.',
    },
    {
      q: 'Who can disconnect an integration (e.g. Intune or ManageEngine)?',
      a: 'Only Global Admins. Disconnecting stops all syncs for that platform immediately. IT Admins can view integration status and trigger a sync, but cannot modify or disconnect.',
    },
    {
      q: 'What should a Helpdesk agent do when a device needs remediation?',
      a: 'Share the Compliance Details with the end user, then escalate to an IT Admin, who can trigger the relevant Automation Rule or create a Jira ticket directly from that device\'s Risk Scoring row.',
    },
    {
      q: 'How many Global Admins should we have?',
      a: 'The recommended setup is 1–2 Global Admins who own the platform. Having too many Global Admins increases the blast radius if credentials are compromised.',
    },
    {
      q: 'Can I have a user with both IT Admin and Helpdesk access?',
      a: 'No — roles are mutually exclusive. Each user is assigned exactly one role. If a Helpdesk agent needs more access temporarily, a Global Admin can change their role.',
    },
    {
      q: 'Where do I change a user\'s role?',
      a: 'Settings → Roles & Permissions → find the user → change their role. Only Global Admins can perform this action.',
    },
    {
      q: 'What happens if a Helpdesk user navigates to the Settings page?',
      a: 'The Settings item is hidden from the sidebar for Helpdesk users. If they navigate directly, an Access Denied message is shown.',
    },
    {
      q: 'Can IT Admins see API keys for integrations?',
      a: 'No. API keys are only visible (and copyable) by Global Admins in Settings → Integrations. IT Admins can see the connection status and trigger syncs, but the key is fully hidden.',
    },
  ]

  return (
    <SectionWrap title="Frequently Asked Questions" description="Common questions about roles, permissions, and day-to-day use">
      <DocCard>
        <div className="divide-y divide-slate-100">
          {faqs.map((faq, i) => (
            <div key={i}>
              <button
                type="button"
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50 transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-300"
              >
                <p className="text-xs font-semibold text-slate-900 leading-snug">{faq.q}</p>
                <ChevronRight className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform mt-0.5 ${open === i ? 'rotate-90' : ''}`} />
              </button>
              {open === i && (
                <div className="px-5 pb-4">
                  <p className="text-[0.72rem] text-slate-600 leading-relaxed border-l-2 border-orange-200 pl-3">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </DocCard>

      <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3.5">
        <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
        <p className="text-[0.68rem] text-slate-600">
          Can't find your answer?{' '}
          <span className="font-semibold text-orange-600">it-support@zinnia.com</span>
          {' '}· Full reference: <span className="font-mono text-slate-700">docs/ROLES.md</span>
        </p>
      </div>
    </SectionWrap>
  )
}

// ─── Section: Automation ──────────────────────────────────────────────────────

function AutomationSection() {
  const [open, setOpen] = useState<number | null>(0)

  const triggers = [
    { name: 'Device Non-Compliant',    desc: 'Fires when any device enters a Non-Compliant or Warning state.',     icon: ShieldCheck },
    { name: 'Encryption Off',          desc: 'Fires when a device reports its encryption (FileVault/BitLocker) as disabled.', icon: Lock },
    { name: 'Compliance Threshold',    desc: 'Fires when fleet-wide compliance % drops below (or rises above) a configured value.', icon: BarChart2 },
    { name: 'Device Offline',          desc: 'Fires when a device has not checked in with its MDM source for N days.', icon: Clock },
    { name: 'New Enrollment',          desc: 'Fires when a new device is enrolled in any connected MDM source.',   icon: Laptop2 },
    { name: 'Drift Detected',          desc: 'Fires when a device changes compliance state (e.g. Compliant → Non-Compliant).', icon: Activity },
    { name: 'Risky Sign-in',           desc: 'Fires when Microsoft Entra ID reports a high-risk sign-in for a user whose device is also non-compliant.', icon: Users },
    { name: 'Scheduled',               desc: 'Fires on a time-based schedule (every Monday, first of month, etc.).', icon: Clock },
    { name: 'Script Failure',          desc: 'Fires when a remote script execution exits with a non-zero exit code.', icon: Terminal },
  ]

  const actions = [
    { name: 'Send In-App Notification', desc: 'Posts a notification in the ITO Endpoint notification centre.', icon: Bell,           color: 'bg-orange-100 text-orange-700' },
    { name: 'Send Slack Message',        desc: 'Posts a message to the configured Slack bot channel.',           icon: MessageSquare,  color: 'bg-purple-100 text-purple-700' },
    { name: 'Create Jira Ticket',        desc: 'Creates an Incident, Task, Bug, or Story in your Jira project.',  icon: Ticket,         color: 'bg-blue-100 text-blue-700' },
    { name: 'Send Teams Message',        desc: 'Posts an alert to the configured Microsoft Teams webhook.',       icon: MessageSquare,  color: 'bg-indigo-100 text-indigo-700' },
    { name: 'Generate AI Runbook',       desc: 'Calls OpenAI to produce remediation steps tailored to the triggering device — informational output, not remote execution.', icon: Play, color: 'bg-emerald-100 text-emerald-700' },
    { name: 'Generate AI Script',        desc: 'Calls OpenAI to draft a remediation script for the device\'s platform — output only, the script is not run automatically.', icon: Terminal, color: 'bg-slate-100 text-slate-700' },
    { name: 'Generate Report',           desc: 'Runs a saved report and makes results available in Reports & Analytics.', icon: BarChart2, color: 'bg-violet-100 text-violet-700' },
  ]

  const categories = [
    { name: 'Compliance',      icon: ShieldCheck, color: 'bg-emerald-100 text-emerald-700', desc: 'Auto-remediate encryption, escalate critical issues, alert on fleet compliance drops, force MDM syncs.' },
    { name: 'Security',        icon: Lock,        color: 'bg-red-100 text-red-700',         desc: 'Detect AV/EDR gaps, firewall-disabled events, risky sign-ins, and stale offline devices.' },
    { name: 'Patching',        icon: Package,     color: 'bg-orange-100 text-orange-700',   desc: 'Alert on patch compliance drops, auto-generate patch reports, escalate unpatched critical devices.' },
    { name: 'Reporting',       icon: BarChart2,   color: 'bg-violet-100 text-violet-700',   desc: 'Schedule weekly compliance summaries, monthly posture reports, and non-compliant spike alerts.' },
    { name: 'Drift Detection', icon: Activity,    color: 'bg-amber-100 text-amber-700',     desc: 'Catch compliance regressions, flapping devices, and new enrollments without encryption.' },
  ]

  const steps = [
    { n: '1', title: 'Choose a Trigger', desc: 'Select the event or schedule that activates the rule. Each rule has exactly one trigger.' },
    { n: '2', title: 'Set Conditions',   desc: 'Filter by platform (Windows/macOS), MDM source, severity, or compliance state. Leave as "all" to match everything.' },
    { n: '3', title: 'Add Actions',      desc: 'Select one or more actions to execute when the trigger fires. Actions run in the order listed.' },
    { n: '4', title: 'Enable & Monitor', desc: 'Enable the rule. Every execution is recorded in the Execution Log with status and result for each action.' },
  ]

  const faqs = [
    { q: 'Can I test a rule without waiting for the trigger?', a: 'Yes — click the Test Run button on any rule card. A synthetic execution is created and recorded in the Execution Log, with all actions marked as [TEST].' },
    { q: 'What happens if an action fails mid-run?', a: 'The other actions in the rule still run. The execution is marked "partial" and the failed action\'s error is logged. Retries are queued automatically for transient failures (e.g. Jira 503 errors).' },
    { q: 'Can a rule trigger itself in a loop?', a: 'No. Rules are stateless event processors. A "generate_report" action does not re-trigger a compliance_threshold rule. Circular execution is not possible.' },
    { q: 'How many rules can I create?', a: 'There is no hard limit. Practically, 20–30 active rules covers most enterprise scenarios. Disable rules you\'re not using to keep the execution log readable.' },
    { q: 'Who can create or delete rules?', a: 'Only Global Admins can create, edit, enable/disable, or delete automation rules. IT Admins can view rules and trigger a Test Run.' },
  ]

  return (
    <SectionWrap title="Automation Rules" description="Build trigger-based workflows that detect issues and act automatically — no manual steps required">

      {/* How it works */}
      <DocCard>
        <CardHeader title="How Automation Works" description="A rule has three parts: a trigger, optional conditions, and one or more actions" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-slate-100">
          {steps.map(s => (
            <div key={s.n} className="bg-white px-4 py-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-orange-500 text-[0.65rem] font-extrabold text-white">{s.n}</span>
                <p className="text-xs font-bold text-slate-900">{s.title}</p>
              </div>
              <p className="text-[0.68rem] text-slate-500 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </DocCard>

      {/* Categories */}
      <DocCard>
        <CardHeader title="Rule Categories" description="All rules belong to one of five categories to keep your library organised" />
        <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {categories.map(c => (
            <div key={c.name} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3">
              <div className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg ${c.color} mt-0.5`}>
                <c.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">{c.name}</p>
                <p className="text-[0.65rem] text-slate-500 mt-0.5 leading-snug">{c.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </DocCard>

      {/* Triggers */}
      <DocCard>
        <CardHeader title="Available Triggers" description="What can fire a rule" />
        <div className="divide-y divide-slate-100">
          {triggers.map(t => (
            <div key={t.name} className="flex items-start gap-3 px-5 py-3">
              <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-orange-100 mt-0.5">
                <t.icon className="h-3.5 w-3.5 text-orange-600" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-900">{t.name}</p>
                <p className="text-[0.68rem] text-slate-500 mt-0.5">{t.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </DocCard>

      {/* Actions */}
      <DocCard>
        <CardHeader title="Available Actions" description="What a rule can do when triggered. Multiple actions can be combined per rule." />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-5 py-4">
          {actions.map(a => (
            <div key={a.name} className={`flex items-start gap-2.5 rounded-xl px-3.5 py-3 ${a.color}`}>
              <a.icon className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold">{a.name}</p>
                <p className="text-[0.65rem] mt-0.5 opacity-80 leading-snug">{a.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </DocCard>

      {/* FAQ */}
      <DocCard>
        <CardHeader title="Automation FAQ" />
        <div className="divide-y divide-slate-100">
          {faqs.map((item, i) => (
            <div key={i}>
              <button type="button" onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-start justify-between gap-4 px-5 py-3.5 text-left hover:bg-slate-50 transition">
                <p className="text-xs font-semibold text-slate-900 leading-snug">{item.q}</p>
                <ChevronRight className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform mt-0.5 ${open === i ? 'rotate-90' : ''}`} />
              </button>
              {open === i && (
                <div className="px-5 pb-4">
                  <p className="text-[0.72rem] text-slate-600 leading-relaxed border-l-2 border-orange-200 pl-3">{item.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </DocCard>
    </SectionWrap>
  )
}

// ─── Section: Reports ─────────────────────────────────────────────────────────

function ReportsSection() {
  const categories = [
    { label: 'Inventory',   desc: 'Full device inventory, hardware specs, ownership split, enrollment trends.' },
    { label: 'Compliance',  desc: 'Non-compliant devices, compliance by source, policy compliance.' },
    { label: 'Security',    desc: 'Encryption status, patch management, sign-in risk, security posture summary.' },
    { label: 'Users',       desc: 'MFA enrollment, user roles & permissions, user compliance.' },
    { label: 'Health',      desc: 'Device check-in, Windows / macOS fleet-specific health metrics.' },
    { label: 'Software',    desc: 'Application deployment status, license compliance.' },
  ]

  const reports = [
    { name: 'Full Device Inventory',        cat: 'Inventory',  desc: 'All devices across all sources with full hardware details.' },
    { name: 'Non-Compliant Devices',        cat: 'Compliance', desc: 'All devices in Non-Compliant or Warning state.' },
    { name: 'Compliance Summary by Source', cat: 'Compliance', desc: 'Aggregated compliance % per MDM source.' },
    { name: 'Patch Management Report',      cat: 'Security',   desc: 'OS update status and missing patches per device.' },
    { name: 'Encryption Status Report',     cat: 'Security',   desc: 'FileVault / BitLocker coverage across the fleet.' },
    { name: 'MFA Enrollment Report',        cat: 'Users',      desc: 'MFA status and enrolment trends from Entra ID.' },
    { name: 'Security Posture Summary',     cat: 'Security',   desc: 'Organisation-wide security metrics for reporting.' },
    { name: 'Device Check-in Report',       cat: 'Health',     desc: 'Last sync times and offline device counts.' },
    { name: 'Sign-in Risk Report',          cat: 'Users',      desc: 'Entra ID risky sign-ins (requires Entra integration).' },
    { name: 'Hardware Inventory Report',    cat: 'Inventory',  desc: 'CPU, RAM, disk, and firmware for each device.' },
    { name: 'License Compliance Report',    cat: 'Software',   desc: 'ManageEngine / Intune license utilisation.' },
    { name: 'User Roles & Permissions',     cat: 'Users',      desc: 'Audit of all user role assignments.' },
  ]

  return (
    <SectionWrap title="Reports & Analytics" description="Built-in reports across inventory, compliance, security, users, health, and Slack-access categories — all exportable to CSV. The catalog below is illustrative, not exhaustive — see the Reports & Analytics page for the full current list.">

      <DocCard>
        <CardHeader title="Report Categories" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-5 py-4">
          {categories.map(c => (
            <div key={c.label} className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3">
              <p className="text-xs font-bold text-slate-900">{c.label}</p>
              <p className="text-[0.65rem] text-slate-500 mt-0.5 leading-snug">{c.desc}</p>
            </div>
          ))}
        </div>
      </DocCard>

      <DocCard>
        <CardHeader title="Available Reports" description="Full list of reports — all support CSV export and server-side pagination" />
        <div className="divide-y divide-slate-100">
          {reports.map(r => (
            <div key={r.name} className="flex items-start gap-3 px-5 py-3">
              <BarChart2 className="h-4 w-4 flex-shrink-0 text-slate-400 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-slate-900">{r.name}</p>
                  <span className="inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[0.6rem] font-medium text-violet-700">{r.cat}</span>
                </div>
                <p className="text-[0.68rem] text-slate-500 mt-0.5">{r.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </DocCard>

      <DocCard>
        <CardHeader title="Using Reports" />
        <div className="px-5 py-4 space-y-3">
          {[
            { icon: Play,      tip: 'Click Run Report to generate fresh data. Reports are cached for 5 minutes — use the Invalidate Cache button to force a rebuild.' },
            { icon: FileText,  tip: 'Click Export CSV to download the full dataset as a spreadsheet-ready CSV file.' },
            { icon: BarChart2, tip: 'Use the column headers to sort the report in-place. Pagination controls appear for reports with more than 100 rows.' },
            { icon: Zap,       tip: 'Combine with Automation Rules to schedule reports automatically every week or month.' },
            { icon: Bell,      tip: 'The Sign-in Risk Report requires the Entra ID integration to be configured — without it, the report returns an explicit "not configured" result rather than sample data.' },
          ].map((t, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-violet-100">
                <t.icon className="h-3.5 w-3.5 text-violet-600" />
              </div>
              <p className="text-[0.72rem] text-slate-600 leading-relaxed">{t.tip}</p>
            </div>
          ))}
        </div>
      </DocCard>
    </SectionWrap>
  )
}

// ─── Section: Configuration ───────────────────────────────────────────────────

function ConfigurationSection() {
  const integrations = [
    {
      name: 'Microsoft Intune',
      fields: ['INTUNE_TENANT_ID', 'INTUNE_CLIENT_ID', 'INTUNE_CLIENT_SECRET'],
      steps: [
        'In Azure Portal, go to App Registrations → New Registration',
        'Grant: DeviceManagementManagedDevices.Read.All (Application)',
        'Copy the Tenant ID, Client ID, and Client Secret',
        'Paste all three in Settings → Integrations → Microsoft Intune',
      ],
    },
    {
      name: 'ManageEngine',
      fields: ['MANAGEENGINE_CLIENT_ID', 'MANAGEENGINE_CLIENT_SECRET', 'MANAGEENGINE_REFRESH_TOKEN', 'MANAGEENGINE_API_DOMAIN'],
      steps: [
        'In the Zoho API Console, create a Self Client for MDM On-Demand (Endpoint Central Cloud)',
        'Grant scope MDMOnDemand.MDMInventory.READ (and DesktopCentralCloud.PatchMgmt.READ for Patch Operations)',
        'Generate a grant token, then exchange it for a Client ID, Client Secret, and Refresh Token',
        'Paste all three plus your API domain (e.g. https://mdm.manageengine.com) in Settings → Integrations → ManageEngine',
        'ManageEngine supplies both Windows and macOS device inventory, plus Patch Manager data for Patch Operations',
      ],
    },
    {
      name: 'Microsoft Entra ID',
      fields: ['ENTRA_TENANT_ID', 'ENTRA_CLIENT_ID', 'ENTRA_CLIENT_SECRET'],
      steps: [
        'Reuse the same App Registration from Intune (or create a separate one)',
        'Grant: User.Read.All, AuditLog.Read.All, IdentityRiskyUser.Read.All (Application)',
        'Paste the Tenant ID, Client ID, and Secret in Settings → Integrations → Entra ID',
      ],
    },
    {
      name: 'Slack',
      fields: ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET'],
      steps: [
        'At api.slack.com, create a Slack App in your workspace',
        'Add OAuth scopes: chat:write, channels:read',
        'Install the app to your workspace and copy the Bot Token',
        'Paste the Bot Token in Settings → Integrations → Slack',
      ],
    },
    {
      name: 'Jira / Confluence',
      fields: ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN'],
      steps: [
        'At id.atlassian.com, create an API token for your account',
        'Your base URL is your Atlassian domain, e.g. https://yourorg.atlassian.net',
        'Paste the base URL, email, and API token in Settings → Integrations → Jira',
        'Confluence search uses the same credentials automatically',
      ],
    },
  ]

  const [open, setOpen] = useState<number | null>(null)

  return (
    <SectionWrap title="Configuration Guide" description="Step-by-step setup instructions for every integration and environment variable">

      <DocCard>
        <CardHeader title="Environment Variables" description="Set these in server/.env (or your deployment's secret manager)" />
        <div className="px-5 py-4">
          <div className="rounded-xl bg-slate-900 px-4 py-4 font-mono text-[0.65rem] text-slate-300 space-y-1 overflow-x-auto">
            <p className="text-slate-500"># MDM Sources</p>
            <p>INTUNE_TENANT_ID=<span className="text-amber-400">your-tenant-id</span></p>
            <p>INTUNE_CLIENT_ID=<span className="text-amber-400">your-client-id</span></p>
            <p>INTUNE_CLIENT_SECRET=<span className="text-amber-400">your-client-secret</span></p>
            <p className="mt-2">MANAGEENGINE_CLIENT_ID=<span className="text-amber-400">your-client-id</span></p>
            <p>MANAGEENGINE_CLIENT_SECRET=<span className="text-amber-400">your-client-secret</span></p>
            <p>MANAGEENGINE_REFRESH_TOKEN=<span className="text-amber-400">your-refresh-token</span></p>
            <p>MANAGEENGINE_API_DOMAIN=<span className="text-amber-400">https://mdm.manageengine.com</span></p>
            <p className="mt-2 text-slate-500"># Identity</p>
            <p>ENTRA_TENANT_ID=<span className="text-amber-400">your-tenant-id</span></p>
            <p>ENTRA_CLIENT_ID=<span className="text-amber-400">your-client-id</span></p>
            <p>ENTRA_CLIENT_SECRET=<span className="text-amber-400">your-client-secret</span></p>
            <p className="mt-2 text-slate-500"># AI + Integrations</p>
            <p>OPENAI_API_KEY=<span className="text-amber-400">sk-...</span></p>
            <p>SLACK_BOT_TOKEN=<span className="text-amber-400">xoxb-...</span></p>
            <p>SLACK_SIGNING_SECRET=<span className="text-amber-400">your-signing-secret</span></p>
            <p>JIRA_BASE_URL=<span className="text-amber-400">https://yourorg.atlassian.net</span></p>
            <p>JIRA_EMAIL=<span className="text-amber-400">admin@yourorg.com</span></p>
            <p>JIRA_API_TOKEN=<span className="text-amber-400">your-jira-token</span></p>
            <p className="mt-2 text-slate-500"># Server</p>
            <p>PORT=<span className="text-amber-400">4000</span></p>
          </div>
          <p className="mt-3 text-[0.65rem] text-slate-400">All variables are optional — missing integrations fall back to mock data automatically.</p>
        </div>
      </DocCard>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-700 px-1">Integration Setup Guides</p>
        {integrations.map((intg, i) => (
          <DocCard key={intg.name}>
            <button type="button" onClick={() => setOpen(open === i ? null : i)}
              className="flex w-full items-center justify-between px-5 py-4 hover:bg-slate-50 transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-300 rounded-[18px]">
              <div className="flex items-start gap-3 text-left">
                <Globe className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-slate-900">{intg.name}</p>
                  <p className="text-[0.62rem] text-slate-400 mt-0.5 font-mono">{intg.fields.join('  ·  ')}</p>
                </div>
              </div>
              <ChevronRight className={`h-4 w-4 text-slate-400 flex-shrink-0 transition-transform ${open === i ? 'rotate-90' : ''}`} />
            </button>
            {open === i && (
              <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/60 rounded-b-[18px]">
                <ol className="space-y-2">
                  {intg.steps.map((step, j) => (
                    <li key={j} className="flex items-start gap-2.5">
                      <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-orange-500 text-[0.6rem] font-bold text-white mt-0.5">{j + 1}</span>
                      <p className="text-[0.72rem] text-slate-700 leading-snug">{step}</p>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </DocCard>
        ))}
      </div>
    </SectionWrap>
  )
}

// ─── Section: Troubleshooting ─────────────────────────────────────────────────

function TroubleshootingSection() {
  const [open, setOpen] = useState<number | null>(null)

  const issues = [
    {
      problem: 'Dashboard shows "Server unreachable" banner',
      cause: 'The Express backend (port 4000) is not running or not reachable from the browser.',
      steps: [
        'Run npm run dev:server in a terminal and confirm it prints "Server listening on http://localhost:4000".',
        'Check for port conflicts: lsof -i :4000 (macOS/Linux) or netstat -ano | findstr :4000 (Windows).',
        'Confirm VITE_API_URL is not set to a wrong value in your .env or .env.local file.',
      ],
    },
    {
      problem: 'Integration shows "— mock data" even after saving credentials',
      cause: 'The credentials were saved correctly but the environment variable was not loaded, or the external API returned an error on first sync.',
      steps: [
        'Restart the server after saving credentials (server reads env on start).',
        'Check server logs for a specific error from the integration (auth failure, network timeout, etc.).',
        'Use the Sync Now button in Settings → Integrations to force a fresh attempt and observe the server log output.',
        'Verify the credential values have no leading/trailing whitespace.',
      ],
    },
    {
      problem: 'Jira or Confluence search returns no results',
      cause: 'The Jira integration is not configured, or the project/space contains no matching content.',
      steps: [
        'Go to Settings → Integrations → Jira and verify the status shows "Connected".',
        'Confirm JIRA_BASE_URL ends without a trailing slash.',
        'Try a broader search term — Confluence search is full-text, not fuzzy.',
        'Verify the Jira API token has Browse Projects and Browse Confluence permissions.',
      ],
    },
    {
      problem: 'An automation rule\'s "Generate AI Runbook" / "Generate AI Script" action returns generic, non-specific output',
      cause: 'OPENAI_API_KEY is not configured, so the action falls back to a deterministic generic template instead of calling GPT-4o-mini.',
      steps: [
        'Add OPENAI_API_KEY in server/.env and restart the server.',
        'Re-run the rule\'s Test Run — the result detail will include the AI-generated steps or script once configured.',
      ],
    },
    {
      problem: 'Automation rule test run fails with "Rule not found"',
      cause: 'The rule was deleted from another browser tab, or the rule ID in the request is stale.',
      steps: [
        'Refresh the Automation page to reload the current rule list.',
        'Rules and their run history are saved to disk (automations.json under DATA_DIR) after every change, so a server restart or redeploy does not lose them.',
      ],
    },
    {
      problem: 'Notifications not appearing after an automation rule runs',
      cause: 'The send_notification action posts to the server-side notification store, but the frontend polls every 30 seconds.',
      steps: [
        'Wait up to 30 seconds for the notification bell to update.',
        'Click the notification bell to force an immediate poll.',
        'Check the Execution Log in the Automation page to confirm the action shows status: success.',
      ],
    },
    {
      problem: 'Reports take a long time to generate',
      cause: 'The first run of a report fetches live data from all connected MDM sources. Subsequent runs use the 5-minute cache.',
      steps: [
        'Large fleets (500+ devices) may take 5–15 seconds on first load.',
        'Use the Invalidate Cache button only when you need truly fresh data.',
        'If a report times out, check the server log for which integration is slow and consider increasing its timeout in the service config.',
      ],
    },
  ]

  return (
    <SectionWrap title="Troubleshooting" description="Common problems and how to resolve them">
      <DocCard>
        <div className="divide-y divide-slate-100">
          {issues.map((issue, i) => (
            <div key={i}>
              <button type="button" onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50 transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-300">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-500 mt-0.5" />
                  <p className="text-xs font-semibold text-slate-900 leading-snug">{issue.problem}</p>
                </div>
                <ChevronRight className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform mt-0.5 ${open === i ? 'rotate-90' : ''}`} />
              </button>
              {open === i && (
                <div className="px-5 pb-5 space-y-3">
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3.5 py-2.5">
                    <p className="text-[0.68rem] text-amber-800 leading-relaxed"><strong>Cause:</strong> {issue.cause}</p>
                  </div>
                  <div className="space-y-2">
                    {issue.steps.map((step, j) => (
                      <div key={j} className="flex items-start gap-2.5">
                        <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-orange-100 text-[0.6rem] font-bold text-orange-700 mt-0.5">{j + 1}</span>
                        <p className="text-[0.72rem] text-slate-700 leading-snug">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </DocCard>

      <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3.5">
        <LifeBuoy className="h-4 w-4 text-orange-500 flex-shrink-0" />
        <p className="text-[0.68rem] text-slate-600">
          Still stuck?{' '}
          <span className="font-semibold text-orange-600">it-support@zinnia.com</span>
          {' '}or file an issue at{' '}
          <span className="font-mono text-slate-700">github.com/your-org/endpoint-ai-copilot</span>
        </p>
      </div>
    </SectionWrap>
  )
}

// ─── Section: Quick Start ─────────────────────────────────────────────────────

function QuickStartSection() {
  const steps = [
    {
      n: '1', title: 'Open the dashboard', color: 'bg-orange-500',
      desc: 'The app opens straight to the dashboard — there is no sign-in step in this deployment. The stat cards at the top show your fleet at a glance: total devices, compliant, non-compliant, warning, Windows, and Mac.',
      tips: ['Click any stat card number to drill into a filtered device list.', 'The donut chart and issue categories update in real time from your MDM sources.'],
    },
    {
      n: '2', title: 'Find a device', color: 'bg-orange-500',
      desc: 'Type a device name, user email, or serial number into the search bar at the top. The dashboard switches to show that device\'s full compliance detail.',
      tips: ['The app auto-selects the first non-compliant device on load so you always see a real example.'],
    },
    {
      n: '3', title: 'Check Risk Scoring', color: 'bg-orange-500',
      desc: 'Navigate to Risk Scoring in the sidebar to see devices/users ranked by combined compliance and identity risk. Expand a row to create a Jira ticket or link a Confluence article for that device.',
      tips: ['Jira and Confluence escalation are gated on those integrations actually being configured.'],
    },
    {
      n: '4', title: 'Try Ocean', color: 'bg-sky-500',
      desc: 'Open the Ocean panel from the header on any page. Ask it a question (e.g. "which devices are non-compliant and offline?") or ask it to create a Jira ticket or test-run an automation rule — write actions require your explicit confirmation.',
      tips: ['Ocean only reads and acts on modules already live in this app — it does not fabricate data.'],
    },
    {
      n: '5', title: 'Check automation rules', color: 'bg-orange-500',
      desc: 'Navigate to Automation in the sidebar to review trigger-based rules covering compliance, security, patching, reporting, and drift detection.',
      tips: ['Use the Test Run button on any rule to simulate a trigger without waiting for a real event.', 'Enable the rules relevant to your environment and leave the rest disabled.'],
    },
    {
      n: '6', title: 'Connect your MDM', color: 'bg-orange-500',
      desc: 'When you\'re ready for live data, go to Settings → Integrations. Add your Intune, Entra ID, or ManageEngine credentials. See Integration Setup in this docs for step-by-step instructions.',
      tips: ['Without credentials, unconfigured integrations show clearly as not-connected rather than mock data.', 'Each integration can be connected independently; you don\'t need all of them.'],
    },
  ]

  const nextByRole = [
    { role: 'Global Admin', badge: 'bg-orange-100 text-orange-700', next: ['Connect integrations in Settings → Integrations', 'Review and enable automation rules', 'Configure Slack, Teams, and Jira for alert routing'] },
    { role: 'IT Admin',     badge: 'bg-lime-100 text-lime-700',     next: ['Search for devices with active issues', 'Use Risk Scoring to prioritise remediation', 'Ask Ocean to trigger an automation Test Run', 'Check Reports & Analytics for fleet trends'] },
    { role: 'Helpdesk',     badge: 'bg-slate-100 text-slate-700',   next: ['Use the search bar to find a device by user email', 'Read the Compliance Details to understand the issue', 'Escalate to an IT Admin if remediation is needed'] },
  ]

  return (
    <SectionWrap title="Quick Start" description="From opening the dashboard to your first remediation escalation in under 10 minutes">

      <DocCard>
        <CardHeader title="Six Steps to Get Started" />
        <div className="divide-y divide-slate-100">
          {steps.map(s => (
            <div key={s.n} className="flex items-start gap-4 px-5 py-4">
              <span className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-full ${s.color} text-[0.7rem] font-extrabold text-white mt-0.5`}>{s.n}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 mb-1">{s.title}</p>
                <p className="text-[0.72rem] text-slate-600 leading-relaxed">{s.desc}</p>
                {s.tips.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {s.tips.map(tip => (
                      <li key={tip} className="flex items-start gap-1.5 text-[0.68rem] text-slate-500">
                        <ChevronRight className="h-3 w-3 flex-shrink-0 mt-0.5 text-orange-400" />
                        {tip}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>
      </DocCard>

      <DocCard>
        <CardHeader title="What to Do Next — by Role" description="Tailored starting points depending on your team's responsibilities" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-slate-100">
          {nextByRole.map(r => (
            <div key={r.role} className="bg-white px-4 py-4">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-[0.62rem] font-bold mb-3 ${r.badge}`}>{r.role}</span>
              <ul className="space-y-2">
                {r.next.map(item => (
                  <li key={item} className="flex items-start gap-1.5 text-[0.68rem] text-slate-600">
                    <ChevronRight className="h-3 w-3 flex-shrink-0 mt-0.5 text-orange-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DocCard>

      <div className="flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3.5">
        <Zap className="h-4 w-4 text-orange-500 flex-shrink-0" />
        <p className="text-[0.68rem] text-slate-700">
          Running without credentials? Automation rules and reports still operate against whatever devices are already synced — an unconfigured integration is shown as not-connected rather than backfilled with mock data. Add credentials when you're ready to go live.
        </p>
      </div>
    </SectionWrap>
  )
}

// ─── Section: Dashboard & Devices ────────────────────────────────────────────

function DashboardSection() {
  const statCards = [
    { title: 'Total Devices',    desc: 'All enrolled devices across every connected MDM source combined.',            color: 'bg-orange-100 text-orange-700' },
    { title: 'Compliant',        desc: 'Devices passing all compliance policies with no active issues.',              color: 'bg-emerald-100 text-emerald-700' },
    { title: 'Non-Compliant',    desc: 'Devices with one or more failed compliance policies. Requires action.',       color: 'bg-red-100 text-red-700' },
    { title: 'Warning',          desc: 'Devices with issues that haven\'t yet reached Non-Compliant threshold.',      color: 'bg-amber-100 text-amber-700' },
    { title: 'Open Issues',      desc: 'Sum of Non-Compliant + Warning devices — total devices needing attention.',   color: 'bg-orange-100 text-orange-700' },
    { title: 'Windows Devices',  desc: 'Count of Windows endpoints across all MDM sources.',                         color: 'bg-slate-100 text-slate-700' },
    { title: 'Mac Devices',      desc: 'Count of macOS endpoints across all MDM sources.',                           color: 'bg-slate-100 text-slate-700' },
  ]

  const panelTabs = [
    { tab: 'Device Summary',      desc: 'OS version, management source, compliance state, encryption status, last check-in, and primary issue. Use Sync Now to force an immediate MDM poll.' },
    { tab: 'Compliance Details',  desc: 'Row-by-row breakdown of failed policies, severity, confidence score, and detection timestamps. Click any row to open the Policy Details modal.' },
    { tab: 'Apps',                desc: 'Full list of managed applications on the device with install status, version, publisher, and any error codes. Loaded on demand from the MDM source.' },
    { tab: 'LAPS',                desc: 'Local Administrator Password Solution status — whether LAPS is enabled, which source manages it, account name, and password rotation schedule.' },
  ]

  return (
    <SectionWrap title="Dashboard & Devices" description="Understanding the main dashboard, device search, and the device detail panel">

      {/* Stat cards */}
      <DocCard>
        <CardHeader title="Stat Cards" description="The 7 metric cards at the top of the dashboard — click any to drill into a filtered list" />
        <div className="divide-y divide-slate-100">
          {statCards.map(c => (
            <div key={c.title} className="flex items-start gap-3 px-5 py-3">
              <span className={`inline-flex rounded-lg px-2 py-1 text-[0.62rem] font-bold min-w-[110px] text-center justify-center flex-shrink-0 mt-0.5 ${c.color}`}>{c.title}</span>
              <p className="text-[0.72rem] text-slate-600 leading-snug">{c.desc}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100 px-5 py-3 bg-slate-50/60 rounded-b-[18px]">
          <p className="text-[0.68rem] text-slate-500">
            <strong>Tip:</strong> Clicking a stat card number navigates to a filtered device list for that state. Click <strong>Back to Dashboard</strong> to return.
          </p>
        </div>
      </DocCard>

      {/* Charts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <DocCard>
          <CardHeader title="Compliance Donut" />
          <div className="px-5 py-4 space-y-2 text-[0.72rem] text-slate-600 leading-relaxed">
            <p>The donut chart visualises fleet compliance as three segments: <strong className="text-emerald-700">Compliant</strong>, <strong className="text-amber-600">Warning</strong>, and <strong className="text-red-600">Non-Compliant</strong>. Each segment shows its percentage.</p>
            <p>Click a segment to filter the Recent Activity list below to only show devices in that state. Click again to clear the filter.</p>
          </div>
        </DocCard>
        <DocCard>
          <CardHeader title="Issue Categories" />
          <div className="px-5 py-4 space-y-2 text-[0.72rem] text-slate-600 leading-relaxed">
            <p>A horizontal bar chart breaking down <em>why</em> devices are non-compliant: Encryption, Security / AV, OS / Patch, Device Check-in, Compliance Policies, Application Issues.</p>
            <p>Use this to prioritise — the longest bar is the most common issue across your fleet.</p>
          </div>
        </DocCard>
      </div>

      {/* Live data bar */}
      <DocCard>
        <CardHeader title="Live Data Bar" description="The status strip above the stat cards" />
        <div className="px-5 py-4 space-y-2 text-[0.72rem] text-slate-600 leading-relaxed">
          <p>Shows a live per-source device count (Intune / ManageEngine), a countdown to the next automatic refresh, and the timestamp of the last successful pull. Click <strong>Refresh</strong> to force an immediate re-fetch.</p>
        </div>
      </DocCard>

      {/* Device detail panel */}
      <DocCard>
        <CardHeader title="Device Detail Panel" description="Appears on the right side of the dashboard when a device is selected" />
        <div className="divide-y divide-slate-100">
          {panelTabs.map(t => (
            <div key={t.tab} className="flex items-start gap-3 px-5 py-3.5">
              <span className="inline-flex rounded-lg bg-orange-100 px-2 py-1 text-[0.62rem] font-bold text-orange-700 min-w-[110px] flex-shrink-0 mt-0.5 text-center justify-center">{t.tab}</span>
              <p className="text-[0.72rem] text-slate-600 leading-snug">{t.desc}</p>
            </div>
          ))}
        </div>
      </DocCard>

      {/* Runbook card */}
      <DocCard>
        <CardHeader title="Recommended Action / Runbook Card" description="The remediation panel next to the device detail section" />
        <div className="px-5 py-4 space-y-3 text-[0.72rem] text-slate-600 leading-relaxed">
          <p>When a device is selected, a rule-based lookup maps its platform and compliance state to a recommended runbook name, ordered remediation steps, an escalation flag, and an automation-availability note.</p>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {[
              { label: 'View Runbook', desc: 'Opens the full step list in a modal.' },
              { label: 'Copy Steps', desc: 'Copies all steps to clipboard for manual remediation.' },
            ].map(a => (
              <div key={a.label} className="rounded-xl bg-orange-50 border border-orange-100 px-3 py-2.5">
                <p className="text-[0.65rem] font-bold text-orange-800 mb-0.5">{a.label}</p>
                <p className="text-[0.62rem] text-orange-700/80">{a.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </DocCard>

      {/* Device search */}
      <DocCard>
        <CardHeader title="Searching for a Device" />
        <div className="px-5 py-4 space-y-2 text-[0.72rem] text-slate-600 leading-relaxed">
          <p>Use the <strong>search bar in the page header</strong> to find any device instantly. You can search by:</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-1">
            {[
              { label: 'Device name',   eg: 'CORP-WIN-0042' },
              { label: 'User email',    eg: 'john.doe@company.com' },
              { label: 'Serial number', eg: 'C02XJ0ABMJ' },
            ].map(s => (
              <div key={s.label} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                <p className="text-[0.65rem] font-bold text-slate-800">{s.label}</p>
                <p className="text-[0.62rem] font-mono text-slate-400 mt-0.5">{s.eg}</p>
              </div>
            ))}
          </div>
          <p className="mt-1">For a filterable full-fleet view, open <strong>Managed Devices</strong> in the sidebar and toggle between Mac and Intune — each has its own Devices tab with column filtering and sorting.</p>
        </div>
      </DocCard>
    </SectionWrap>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

const SECTION_MAP: Record<DocSection, React.ReactNode> = {
  overview:        <OverviewSection />,
  quickstart:      <QuickStartSection />,
  onboarding:      <OnboardingSection />,
  dashboard:       <DashboardSection />,
  automation:      <AutomationSection />,
  reports:         <ReportsSection />,
  security:        <SecuritySection />,
  patching:        <PatchingSection />,
  remote:          <RemoteActionsSection />,
  analysis:        <AnalysisSection />,
  ocean:           <OceanSection />,
  pages:           <PagesIndexSection />,
  configuration:   <ConfigurationSection />,
  roles:           <RolesSection />,
  troubleshooting: <TroubleshootingSection />,
  faq:             <FaqSection />,
}

export function DocsPage() {
  const [active, setActive] = useState<DocSection>('overview')

  return (
    <div className="flex flex-col lg:flex-row gap-5 w-full items-start">

      {/* Left nav — grouped */}
      <div className="w-full lg:w-56 flex-shrink-0">
        <div className="rounded-[18px] border border-slate-200 bg-white shadow-sm shadow-slate-900/5 p-2 sticky top-4">
          <p className="px-3 pt-2 pb-2 text-[0.58rem] font-bold uppercase tracking-widest text-slate-400">
            Documentation
          </p>
          <nav aria-label="Documentation navigation" className="space-y-3">
            {NAV_GROUPS.map(group => (
              <div key={group.label}>
                <p className="px-3 pb-1 text-[0.55rem] font-extrabold uppercase tracking-widest text-slate-300">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.items.map(item => {
                    const Icon = item.icon
                    const isActive = active === item.key
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setActive(item.key)}
                        aria-current={isActive ? 'page' : undefined}
                        className={`group flex w-full items-center gap-2 rounded-xl border px-3 py-1.5 text-left transition focus-visible:ring-2 focus-visible:ring-orange-300 ${
                          isActive
                            ? 'bg-orange-50 text-orange-700 border-orange-200'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-transparent'
                        }`}
                      >
                        <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${isActive ? 'text-orange-600' : 'text-slate-400 group-hover:text-slate-500'}`} />
                        <span className="flex-1 text-xs font-medium">{item.label}</span>
                        {item.badge && (
                          <span className="inline-flex rounded-full bg-orange-500 px-1.5 py-0.5 text-[0.5rem] font-extrabold text-white leading-none">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>
          <div className="mt-3 mx-1 rounded-xl bg-orange-50 border border-orange-100 px-3 py-2.5">
            <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-orange-600 mb-1">Source file</p>
            <p className="text-[0.62rem] font-mono text-slate-600 break-all">docs/ROLES.md</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {SECTION_MAP[active]}
      </div>

    </div>
  )
}
