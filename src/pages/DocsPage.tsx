import { useState } from 'react'
import {
  BookMarked, ShieldCheck, Zap, Users, Laptop2, Settings,
  CheckCircle2, XCircle, MinusCircle, ChevronRight, BookOpen,
  HelpCircle, AlertTriangle, Lock, Globe, LifeBuoy, FileText,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type DocSection = 'overview' | 'roles' | 'features' | 'onboarding' | 'faq'

const NAV: { key: DocSection; label: string; icon: React.ElementType }[] = [
  { key: 'overview',   label: 'Overview',          icon: BookMarked  },
  { key: 'roles',      label: 'Roles & Permissions',icon: Users       },
  { key: 'features',   label: 'Feature Guide',      icon: Zap         },
  { key: 'onboarding', label: 'Onboarding',         icon: CheckCircle2},
  { key: 'faq',        label: 'FAQ',                icon: HelpCircle  },
]

// ─── Shared primitives ────────────────────────────────────────────────────────

function SectionWrap({ title, description, children }: {
  title: string; description: string; children: React.ReactNode
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
      {children}
    </div>
  )
}

function DocCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[18px] border border-slate-200 bg-white shadow-sm shadow-slate-900/5 overflow-hidden ${className}`}>
      {children}
    </div>
  )
}

function CardHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="border-b border-slate-100 px-5 py-3.5">
      <p className="text-xs font-semibold text-slate-900">{title}</p>
      {description && <p className="text-[0.65rem] text-slate-500 mt-0.5">{description}</p>}
    </div>
  )
}

// Permission cell icons
function Allow() { return <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" /> }
function Deny()  { return <XCircle      className="h-4 w-4 text-red-400    mx-auto" /> }
function Limit() { return <MinusCircle  className="h-4 w-4 text-amber-400  mx-auto" aria-label="Limited" /> }

// ─── Section: Overview ────────────────────────────────────────────────────────

function OverviewSection() {
  const features = [
    { icon: Laptop2,    label: 'Device Management',    desc: 'Search and inspect managed endpoints across all connected MDM sources.' },
    { icon: ShieldCheck,label: 'Compliance Monitoring', desc: 'Real-time compliance status, policy failure details, and trend visualisation.' },
    { icon: BookOpen,   label: 'Runbooks',              desc: 'Step-by-step remediation guides with one-click automation.' },
    { icon: Zap,        label: 'AI Copilot',            desc: 'Intelligent root-cause analysis and recommended actions powered by OpenAI.' },
    { icon: Globe,      label: 'Integrations',          desc: 'Unified view across Microsoft Intune, Kandji, and ManageEngine.' },
    { icon: Settings,   label: 'Settings',              desc: 'Organisation-wide configuration for compliance, automation, and security.' },
  ]

  return (
    <SectionWrap title="ITO Endpoint Overview" description="What this tool does and who it's for">
      <DocCard>
        <div className="px-5 py-5 space-y-4">
          <p className="text-sm text-slate-700 leading-relaxed">
            <strong>ITO Endpoint</strong> is an AI-powered endpoint compliance dashboard that gives your IT team a single pane of glass across all managed devices. It aggregates data from Microsoft Intune, Kandji, and ManageEngine, surfaces compliance issues in real time, and provides actionable runbooks to resolve them — optionally with full automation.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {features.map(f => (
              <div key={f.label} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3">
                <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-sky-100 mt-0.5">
                  <f.icon className="h-4 w-4 text-sky-600" />
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
            { name: 'Microsoft Intune', color: 'bg-sky-100 text-sky-700',    desc: 'Windows device MDM' },
            { name: 'Kandji',           color: 'bg-violet-100 text-violet-700', desc: 'macOS MDM' },
            { name: 'ManageEngine',     color: 'bg-orange-100 text-orange-700', desc: 'Cross-platform UEM' },
            { name: 'OpenAI',           color: 'bg-emerald-100 text-emerald-700', desc: 'AI analysis engine' },
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
    color: 'from-sky-500 to-blue-600',
    badge: 'bg-sky-100 text-sky-700',
    icon: Lock,
    who: 'IT Operations leads, platform owners',
    summary: 'Unrestricted access to all features, settings, integrations, and user management.',
    count: '1–2 people',
  },
  {
    key: 'admin',
    name: 'IT Admin',
    color: 'from-violet-500 to-indigo-600',
    badge: 'bg-violet-100 text-violet-700',
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
    group: 'Runbooks & Automation',
    rows: [
      { label: 'View runbook steps',             global: 'allow', admin: 'allow', helpdesk: 'allow' },
      { label: 'Execute a runbook',              global: 'allow', admin: 'allow', helpdesk: 'deny'  },
      { label: 'Start automation',               global: 'allow', admin: 'allow', helpdesk: 'deny'  },
      { label: 'Create / edit runbooks',         global: 'allow', admin: 'deny',  helpdesk: 'deny'  },
      { label: 'Configure auto-remediation',     global: 'allow', admin: 'deny',  helpdesk: 'deny'  },
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

// ─── Section: Feature Guide ───────────────────────────────────────────────────

function FeaturesSection() {
  const features = [
    {
      icon: Laptop2,
      name: 'Device Summary',
      who: ['Global Admin', 'IT Admin', 'Helpdesk'],
      desc: 'Shows the full profile of a selected device: OS version, management source, compliance state, encryption status, last check-in, and the primary issue detected.',
      tips: [
        'Use the Sync Now button to force an immediate compliance check.',
        'Click any row in Compliance Details to open the Policy Details modal.',
        'Device is selected by typing into the search bar in the header.',
      ],
    },
    {
      icon: ShieldCheck,
      name: 'Compliance Details',
      who: ['Global Admin', 'IT Admin', 'Helpdesk'],
      desc: 'Breaks down a device\'s compliance state row by row: overall status, primary issue, failed policy, severity, confidence score, and detection timestamps.',
      tips: [
        'Click a "Policy Failed" row to open the full Policy Details modal.',
        'Severity is colour-coded: red = High, amber = Medium, green = Low.',
      ],
    },
    {
      icon: BookOpen,
      name: 'Runbook Card',
      who: ['Global Admin', 'IT Admin'],
      desc: 'Displays the AI-recommended runbook for the selected device, with the next steps and escalation/automation status. Changes dynamically based on the device\'s platform and compliance state.',
      tips: [
        'Click View Runbook to open the full modal with prerequisites and expected result.',
        'Start Automation triggers the remediation workflow (IT Admin and above only).',
        'Copy Steps copies the runbook to clipboard for sharing with the end user.',
      ],
    },
    {
      icon: Zap,
      name: 'Compliance Donut',
      who: ['Global Admin', 'IT Admin', 'Helpdesk'],
      desc: 'Visualises the fleet\'s compliance breakdown as an interactive donut chart. Click any segment to filter the Recent Activity list to that compliance state.',
      tips: [
        'Click a segment again to deselect and clear the filter.',
        'The filter chip appears above the activity list showing the active filter.',
      ],
    },
    {
      icon: FileText,
      name: 'Activity Log',
      who: ['Global Admin', 'IT Admin', 'Helpdesk (read-only)'],
      desc: 'Lists the most recent device events with status, message, and timestamp. Click View All to open the full activity modal. Click any row to jump to that device.',
      tips: [
        'Use the quick-filter pills (All / Non-Compliant / Warning / Compliant) to narrow the list.',
        'Clicking a device row in the full modal switches the dashboard to that device.',
      ],
    },
    {
      icon: Settings,
      name: 'Settings',
      who: ['Global Admin only (most sections)'],
      desc: 'Eight-section configuration hub. General, Integrations, Compliance, Automation, Security, Notifications, Data & Privacy, and Danger Zone. Each section has its own Save button.',
      tips: [
        'IT Admins can view (not modify) the Security section.',
        'Danger Zone actions require typed confirmation.',
        'Integration sync intervals are saved per-integration without a global Save.',
      ],
    },
  ]

  return (
    <SectionWrap title="Feature Guide" description="What each part of the dashboard does and how to use it">
      <div className="space-y-3">
        {features.map(f => (
          <DocCard key={f.name}>
            <div className="flex items-start gap-4 px-5 py-4">
              <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-sky-100 mt-0.5">
                <f.icon className="h-4.5 w-4.5 text-sky-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <p className="text-sm font-semibold text-slate-900">{f.name}</p>
                  {f.who.map(w => (
                    <span key={w} className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[0.6rem] font-semibold text-slate-600">{w}</span>
                  ))}
                </div>
                <p className="text-[0.72rem] text-slate-600 leading-relaxed">{f.desc}</p>
                {f.tips.length > 0 && (
                  <ul className="mt-2.5 space-y-1">
                    {f.tips.map(tip => (
                      <li key={tip} className="flex items-start gap-1.5 text-[0.68rem] text-slate-500">
                        <ChevronRight className="h-3 w-3 flex-shrink-0 mt-0.5 text-sky-400" />
                        {tip}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </DocCard>
        ))}
      </div>
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
          'Click a red device in Recent Activity to view its compliance details',
          'Use "View Runbook" to see the recommended fix for an issue',
          'Click "Start Automation" to trigger remediation (or copy steps for manual fix)',
          'Set your personal notification preferences in Profile → Notifications',
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
          'The Runbook card shows the steps needed to fix the issue — share these with the user or escalate to an IT Admin',
        ],
      },
      {
        title: 'Escalation Rules',
        items: [
          'If a device needs a runbook executed: escalate to an IT Admin',
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
            className={`rounded-lg border px-3.5 py-2 text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-sky-300 ${
              activeRole === r
                ? 'border-sky-300 bg-sky-50 text-sky-700'
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
            <span className="text-xs font-bold text-sky-700">{doneCount} / {allItems.length}</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-400 to-blue-500 transition-all duration-500"
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
                            ? 'border-sky-500 bg-sky-500'
                            : 'border-slate-300 bg-white group-hover:border-sky-400'
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
      a: 'Yes — IT Admins have full runbook execution and automation rights. Only Helpdesk users require escalation to an IT Admin before any runbook can be executed.',
    },
    {
      q: 'Can Helpdesk see the user email associated with a device?',
      a: 'Yes, the user email is visible in the Device Summary panel. However, Helpdesk users cannot copy it to the clipboard — that action is restricted to IT Admin and above.',
    },
    {
      q: 'Who can disconnect an integration (e.g. Intune or Kandji)?',
      a: 'Only Global Admins. Disconnecting stops all syncs for that platform immediately. IT Admins can view integration status and trigger a sync, but cannot modify or disconnect.',
    },
    {
      q: 'What should a Helpdesk agent do when a device needs a runbook?',
      a: 'View the Runbook steps in the Runbook Card (read-only) and share them with the end user, then escalate to an IT Admin to execute. The "Start Automation" button is not visible to Helpdesk users.',
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
                className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50 transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-300"
              >
                <p className="text-xs font-semibold text-slate-900 leading-snug">{faq.q}</p>
                <ChevronRight className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform mt-0.5 ${open === i ? 'rotate-90' : ''}`} />
              </button>
              {open === i && (
                <div className="px-5 pb-4">
                  <p className="text-[0.72rem] text-slate-600 leading-relaxed border-l-2 border-sky-200 pl-3">{faq.a}</p>
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
          <span className="font-semibold text-sky-600">it-support@zinnia.com</span>
          {' '}· Full reference: <span className="font-mono text-slate-700">docs/ROLES.md</span>
        </p>
      </div>
    </SectionWrap>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

const SECTION_MAP: Record<DocSection, React.ReactNode> = {
  overview:   <OverviewSection />,
  roles:      <RolesSection />,
  features:   <FeaturesSection />,
  onboarding: <OnboardingSection />,
  faq:        <FaqSection />,
}

export function DocsPage() {
  const [active, setActive] = useState<DocSection>('roles')

  return (
    <div className="flex flex-col lg:flex-row gap-5 w-full items-start">

      {/* Left nav */}
      <div className="w-full lg:w-52 flex-shrink-0">
        <div className="rounded-[18px] border border-slate-200 bg-white shadow-sm shadow-slate-900/5 p-2">
          <p className="px-3 pt-1.5 pb-2 text-[0.6rem] font-semibold uppercase tracking-widest text-slate-400">
            Documentation
          </p>
          <nav className="space-y-0.5" aria-label="Documentation navigation">
            {NAV.map(item => {
              const Icon = item.icon
              const isActive = active === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActive(item.key)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`group flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition focus-visible:ring-2 focus-visible:ring-sky-300 ${
                    isActive
                      ? 'bg-sky-50 text-sky-700 border-sky-200'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-transparent'
                  }`}
                >
                  <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-sky-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                  <span className="text-xs font-medium">{item.label}</span>
                </button>
              )
            })}
          </nav>
          <div className="mt-3 mx-2 rounded-xl bg-sky-50 border border-sky-100 px-3 py-2.5">
            <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-sky-600 mb-1">Source file</p>
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
