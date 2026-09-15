import { useState } from 'react'
import {
  Shield, HardDrive, Flame, Download, UserCheck, ClipboardCheck,
  AlertTriangle, CheckCircle, TrendingUp, TrendingDown, Minus,
  Clock, Target, Globe, Monitor, Apple, Server,
  X, Info, Wrench, ChevronDown,
} from 'lucide-react'
import { EndpointProtectionCoverage } from '../components/security/EndpointProtectionCoverage'

// ─── Remediation step library ──────────────────────────────────────────────────

const PILLAR_REMEDIATION: Record<string, string[]> = {
  encryption: [
    'Identify non-encrypted devices in your MDM console under Compliance → Encryption.',
    'Push a BitLocker (Windows) or FileVault (macOS) enforcement policy via Intune or Kandji.',
    'Set a compliance policy that marks devices without encryption as Non-Compliant.',
    'For Windows: Settings → Update & Security → Device Encryption → Turn On.',
    'For macOS: System Preferences → Privacy & Security → FileVault → Turn On.',
    'Monitor enrollment: re-scan after 48 hours and follow up with non-compliant users.',
  ],
  bitlocker: [
    'Open Intune → Devices → Configuration Policies and create a BitLocker policy.',
    'Assign the policy to the non-compliant device group.',
    'Force a device sync via Intune to apply immediately: Devices → [Device] → Sync.',
    'Verify encryption status: Get-BitLockerVolume in PowerShell on the target device.',
    'Store recovery keys in Entra ID — enable "Save BitLocker recovery key to Azure AD" in policy.',
  ],
  filevault: [
    'In Kandji, create or update a Filevault library item and enable enforcement.',
    'Assign the Blueprint containing the FileVault item to the device.',
    'The user will see a prompt on next login — they must enter their password to enable.',
    'Verify in Kandji: Devices → [Device] → Library → FileVault status.',
    'Escrow the recovery key: confirm personal recovery key is synced to Kandji.',
  ],
  edr: [
    'Open your EDR console (CrowdStrike Falcon / Microsoft Defender) and filter for inactive sensors.',
    'Re-deploy the agent via MDM push to devices with inactive status.',
    'Set a compliance policy that requires an active, up-to-date EDR agent.',
    'Review the quarantine queue for any flagged threats on recently re-activated agents.',
    'Enable real-time protection and tamper protection to prevent agent deactivation.',
  ],
  crowdstrike: [
    'In Falcon, go to Hosts → Host Management and filter Status = Reduced Functionality.',
    'Re-deploy Falcon sensor via Kandji (Library → Managed Software) or Intune (App deployment).',
    'Verify sensor version is current — update via Sensor Update policies in Falcon.',
    'Check prevention policy assignment — ensure devices are in an enforced policy group.',
  ],
  defender: [
    'In Intune, go to Endpoint Security → Microsoft Defender for Endpoint.',
    'Review the Defender health report and identify devices with inactive protection.',
    'Push a remediation script or compliance policy to re-enable Defender.',
    'Run: Start-Service -Name WinDefend in an elevated PowerShell session if Defender was manually disabled.',
  ],
  firewall: [
    'Create or update an Endpoint Security → Firewall policy in Intune (Windows) or Kandji (macOS).',
    'Assign the policy to non-compliant devices.',
    'For Windows: Configure Windows Defender Firewall via Group Policy or Intune → Domain/Private/Public profiles.',
    'For macOS: Set Application Firewall to On in the Kandji Firewall library item.',
    'Set compliance rule: Firewall must be enabled → mark devices without it as Non-Compliant.',
  ],
  patching: [
    'Open your MDM patch report and filter for devices with critical updates outstanding.',
    'Force-push critical patches immediately via Intune (Software Updates) or Kandji (Auto-update enforcement).',
    'For Intune (Windows): Configure Windows Update for Business → set deadline policies for critical updates.',
    'For Kandji (macOS): Enable macOS update enforcement in Blueprint settings.',
    'Notify device owners whose machines require a restart to complete patching.',
    'Re-run the patch compliance report in 24 hours to confirm coverage improvement.',
  ],
  identity: [
    'Run the MFA registration report from Entra ID: Security → Authentication Methods → User Registration Details.',
    'Export the list of users without MFA enrolled and contact them directly.',
    'Create a Conditional Access policy: Require MFA → assign to All Users → exclude break-glass accounts.',
    'Set a registration campaign in Entra ID: Security → Authentication Methods → Registration Campaign.',
    'After grace period, set CA policy to Block for non-MFA-enrolled users.',
  ],
  compliance: [
    'Review compliance policy failures in Intune: Devices → Monitor → Device Compliance or Kandji: Devices → Compliance.',
    'Identify the most common failing policies and prioritize those for remediation.',
    'Force MDM check-in for devices that haven\'t synced recently: Intune → [Device] → Sync.',
    'Re-assign failed policies to the affected device groups.',
    'Consider retiring or wiping devices that have been offline for more than 30 days.',
  ],
}

function getPillarSteps(pillarId: string): string[] {
  return PILLAR_REMEDIATION[pillarId]
    ?? PILLAR_REMEDIATION[pillarId.replace(/^me_|^win|^aad|^mac|^okta|^intune|^kandji/, '')]
    ?? PILLAR_REMEDIATION['compliance']
}

// ─── Types ─────────────────────────────────────────────────────────────────────

type MDMSource = 'all' | 'intune' | 'kandji' | 'manageengine'

interface Pillar {
  id: string
  label: string
  score: number
  passing: number
  failing: number
  trend: string
  positive: boolean
  color: string
  icon: typeof Shield
  description: string
  weight: number
}

interface RiskItem {
  severity: 'Critical' | 'High' | 'Medium' | 'Low'
  title: string
  pillar: string
  count: number
}

interface CisControl {
  number: number
  name: string
  coverage: number
  status: 'Implemented' | 'Partial' | 'Not Started'
}

interface SourceConfig {
  id: MDMSource
  label: string
  shortLabel: string
  icon: typeof Globe
  deviceCount: number
  platform: string
  pillars: Pillar[]
  risks: RiskItem[]
  lastAssessed: string
}

// ─── CIS Controls (org-level, shared) ─────────────────────────────────────────

const CIS_CONTROLS: CisControl[] = [
  { number: 1,  name: 'Inventory of Enterprise Assets',  coverage: 95, status: 'Implemented' },
  { number: 2,  name: 'Inventory of Software Assets',    coverage: 82, status: 'Implemented' },
  { number: 3,  name: 'Data Protection',                 coverage: 87, status: 'Implemented' },
  { number: 4,  name: 'Secure Configuration',            coverage: 79, status: 'Partial'     },
  { number: 5,  name: 'Account Management',              coverage: 89, status: 'Implemented' },
  { number: 6,  name: 'Access Control Management',       coverage: 84, status: 'Implemented' },
  { number: 7,  name: 'Continuous Vulnerability Mgmt',   coverage: 74, status: 'Partial'     },
  { number: 8,  name: 'Audit Log Management',            coverage: 96, status: 'Implemented' },
  { number: 9,  name: 'Malware Defenses',                coverage: 93, status: 'Implemented' },
  { number: 10, name: 'Security Awareness Training',     coverage: 61, status: 'Partial'     },
]

// ─── Source Configurations ─────────────────────────────────────────────────────

const SOURCE_CONFIGS: Record<MDMSource, SourceConfig> = {
  all: {
    id: 'all',
    label: 'All Sources',
    shortLabel: 'All',
    icon: Globe,
    deviceCount: 447,
    platform: 'All Platforms',
    lastAssessed: 'May 11, 2026 at 09:14 AM',
    pillars: [
      { id: 'encryption', label: 'Disk Encryption', score: 87, passing: 389, failing: 58,  trend: '+3%',  positive: true,  color: 'emerald', icon: HardDrive,      description: 'FileVault & BitLocker coverage',         weight: 0.20 },
      { id: 'edr',        label: 'EDR / Antivirus', score: 93, passing: 416, failing: 31,  trend: '+1%',  positive: true,  color: 'blue',    icon: Shield,         description: 'CrowdStrike & Defender active',           weight: 0.22 },
      { id: 'firewall',   label: 'Firewall',         score: 96, passing: 429, failing: 18,  trend: '→ 0%', positive: true,  color: 'sky',     icon: Flame,          description: 'Host-based firewall enabled',             weight: 0.15 },
      { id: 'patching',   label: 'OS Patching',      score: 74, passing: 331, failing: 116, trend: '-2%',  positive: false, color: 'amber',   icon: Download,       description: 'Critical patches applied',                weight: 0.22 },
      { id: 'identity',   label: 'Identity & MFA',   score: 89, passing: 398, failing: 49,  trend: '+5%',  positive: true,  color: 'violet',  icon: UserCheck,      description: 'MFA enrolled & active',                   weight: 0.11 },
      { id: 'compliance', label: 'MDM Compliance',   score: 91, passing: 407, failing: 40,  trend: '+2%',  positive: true,  color: 'green',   icon: ClipboardCheck, description: 'Policy & config compliance',               weight: 0.10 },
    ],
    risks: [
      { severity: 'Critical', title: '117 devices missing critical OS updates',          pillar: 'Patching',   count: 117 },
      { severity: 'High',     title: '58 devices without disk encryption enabled',       pillar: 'Encryption', count: 58  },
      { severity: 'High',     title: '49 users without MFA enrolled',                   pillar: 'Identity',   count: 49  },
      { severity: 'Medium',   title: '31 endpoints with inactive EDR agent',             pillar: 'EDR',        count: 31  },
      { severity: 'Medium',   title: '18 devices with firewall disabled',                pillar: 'Firewall',   count: 18  },
      { severity: 'Low',      title: '12 devices overdue for MDM check-in (>7 days)',    pillar: 'MDM',        count: 12  },
    ],
  },

  intune: {
    id: 'intune',
    label: 'Microsoft Intune',
    shortLabel: 'Intune',
    icon: Monitor,
    deviceCount: 212,
    platform: 'Windows',
    lastAssessed: 'May 12, 2026 at 07:22 AM',
    pillars: [
      { id: 'bitlocker',   label: 'BitLocker',         score: 82, passing: 174, failing: 38, trend: '+2%',  positive: true,  color: 'amber',  icon: HardDrive,      description: 'BitLocker encryption on Windows',        weight: 0.20 },
      { id: 'defender',    label: 'MS Defender',       score: 91, passing: 193, failing: 19, trend: '+1%',  positive: true,  color: 'blue',   icon: Shield,         description: 'Microsoft Defender active & updated',    weight: 0.22 },
      { id: 'winfirewall', label: 'Windows Firewall',  score: 95, passing: 201, failing: 11, trend: '→ 0%', positive: true,  color: 'sky',    icon: Flame,          description: 'Firewall enabled (all profiles)',        weight: 0.15 },
      { id: 'winupdate',   label: 'Windows Update',    score: 68, passing: 144, failing: 68, trend: '-2%',  positive: false, color: 'amber',  icon: Download,       description: 'Critical patches via WU / WSUS',        weight: 0.22 },
      { id: 'aadmfa',      label: 'Azure AD MFA',      score: 87, passing: 184, failing: 28, trend: '+4%',  positive: true,  color: 'violet', icon: UserCheck,      description: 'Entra ID MFA enrolled & enforced',      weight: 0.11 },
      { id: 'intunecomp',  label: 'Intune Compliance', score: 90, passing: 191, failing: 21, trend: '+2%',  positive: true,  color: 'green',  icon: ClipboardCheck, description: 'Intune compliance policies passing',     weight: 0.10 },
    ],
    risks: [
      { severity: 'Critical', title: '68 Windows devices missing critical OS patches',    pillar: 'Patching',   count: 68 },
      { severity: 'High',     title: '38 Windows devices without BitLocker enabled',      pillar: 'Encryption', count: 38 },
      { severity: 'High',     title: '28 users without Azure AD MFA enrolled',            pillar: 'Identity',   count: 28 },
      { severity: 'Medium',   title: '19 endpoints with Microsoft Defender inactive',     pillar: 'EDR',        count: 19 },
      { severity: 'Medium',   title: '11 devices with Windows Firewall disabled',         pillar: 'Firewall',   count: 11 },
      { severity: 'Low',      title: '8 devices overdue for Intune check-in (>7 days)',   pillar: 'MDM',        count: 8  },
    ],
  },

  kandji: {
    id: 'kandji',
    label: 'Kandji',
    shortLabel: 'Kandji',
    icon: Apple,
    deviceCount: 178,
    platform: 'macOS',
    lastAssessed: 'May 12, 2026 at 08:45 AM',
    pillars: [
      { id: 'filevault',   label: 'FileVault',          score: 94, passing: 167, failing: 11, trend: '+1%',  positive: true,  color: 'emerald', icon: HardDrive,      description: 'FileVault full-disk encryption',         weight: 0.20 },
      { id: 'crowdstrike', label: 'EDR / CrowdStrike',  score: 96, passing: 171, failing: 7,  trend: '+1%',  positive: true,  color: 'blue',    icon: Shield,         description: 'CrowdStrike Falcon agent active',        weight: 0.22 },
      { id: 'macfw',       label: 'macOS Firewall',     score: 98, passing: 174, failing: 4,  trend: '→ 0%', positive: true,  color: 'sky',     icon: Flame,          description: 'macOS Application Firewall enabled',    weight: 0.15 },
      { id: 'macupdate',   label: 'macOS Updates',      score: 81, passing: 144, failing: 34, trend: '-1%',  positive: false, color: 'amber',   icon: Download,       description: 'Critical macOS patches applied',         weight: 0.22 },
      { id: 'oktamfa',     label: 'Okta / MFA',        score: 92, passing: 164, failing: 14, trend: '+6%',  positive: true,  color: 'violet',  icon: UserCheck,      description: 'Okta MFA enrolled for all users',       weight: 0.11 },
      { id: 'kandjicomp',  label: 'Kandji Compliance',  score: 93, passing: 165, failing: 13, trend: '+3%',  positive: true,  color: 'green',   icon: ClipboardCheck, description: 'Blueprints & policies compliant',        weight: 0.10 },
    ],
    risks: [
      { severity: 'High',   title: '34 Macs pending critical macOS security update',      pillar: 'Patching',   count: 34 },
      { severity: 'High',   title: '14 users without Okta MFA enrolled',                  pillar: 'Identity',   count: 14 },
      { severity: 'Medium', title: '11 Macs with FileVault disabled (exceptions)',         pillar: 'Encryption', count: 11 },
      { severity: 'Medium', title: '7 endpoints with CrowdStrike agent offline',           pillar: 'EDR',        count: 7  },
      { severity: 'Low',    title: '4 Macs with macOS Application Firewall disabled',     pillar: 'Firewall',   count: 4  },
      { severity: 'Low',    title: '3 Macs not checked in to Kandji for >14 days',        pillar: 'MDM',        count: 3  },
    ],
  },

  manageengine: {
    id: 'manageengine',
    label: 'ManageEngine',
    shortLabel: 'ME',
    icon: Server,
    deviceCount: 57,
    platform: 'Mixed',
    lastAssessed: 'May 11, 2026 at 06:30 PM',
    pillars: [
      { id: 'me_encrypt', label: 'Disk Encryption', score: 78, passing: 44, failing: 13, trend: '+1%',  positive: true,  color: 'amber',  icon: HardDrive,      description: 'Full-disk encryption coverage',          weight: 0.20 },
      { id: 'me_av',      label: 'AV Protection',   score: 89, passing: 51, failing: 6,  trend: '+2%',  positive: true,  color: 'blue',   icon: Shield,         description: 'Antivirus & endpoint protection',        weight: 0.22 },
      { id: 'me_fw',      label: 'Host Firewall',   score: 91, passing: 52, failing: 5,  trend: '→ 0%', positive: true,  color: 'sky',    icon: Flame,          description: 'Host-based firewall enforcement',        weight: 0.15 },
      { id: 'me_patch',   label: 'OS Patching',     score: 71, passing: 41, failing: 16, trend: '-3%',  positive: false, color: 'amber',  icon: Download,       description: 'Patches via ManageEngine UEM',           weight: 0.22 },
      { id: 'me_mfa',     label: 'MFA Enrollment',  score: 84, passing: 48, failing: 9,  trend: '+3%',  positive: true,  color: 'violet', icon: UserCheck,      description: 'Multi-factor authentication enrolled',   weight: 0.11 },
      { id: 'me_comp',    label: 'MDM Compliance',  score: 88, passing: 50, failing: 7,  trend: '+1%',  positive: true,  color: 'green',  icon: ClipboardCheck, description: 'ManageEngine UEM policy compliance',     weight: 0.10 },
    ],
    risks: [
      { severity: 'Critical', title: '16 mixed-OS devices missing critical security patches', pillar: 'Patching',   count: 16 },
      { severity: 'High',     title: '13 devices without full-disk encryption enabled',       pillar: 'Encryption', count: 13 },
      { severity: 'High',     title: '9 users without MFA configured in directory',           pillar: 'Identity',   count: 9  },
      { severity: 'Medium',   title: '6 devices with antivirus protection inactive',          pillar: 'AV',         count: 6  },
      { severity: 'Medium',   title: '5 devices with host firewall disabled',                 pillar: 'Firewall',   count: 5  },
      { severity: 'Low',      title: '4 devices overdue for agent check-in (>10 days)',       pillar: 'MDM',        count: 4  },
    ],
  },
}

// ─── Source tab styling ────────────────────────────────────────────────────────

function sourceTabStyle(src: MDMSource, isActive: boolean): { tab: string; count: string; dot: string } {
  if (!isActive) {
    return {
      tab: 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700',
      count: 'bg-slate-100 text-slate-500',
      dot: 'bg-slate-300',
    }
  }
  switch (src) {
    case 'all':          return { tab: 'border-orange-400 bg-orange-50 text-orange-700 shadow-sm', count: 'bg-orange-100 text-orange-700', dot: 'bg-orange-400' }
    case 'intune':       return { tab: 'border-orange-400 bg-orange-50 text-orange-700 shadow-sm', count: 'bg-orange-100 text-orange-700', dot: 'bg-orange-400' }
    case 'kandji':       return { tab: 'border-slate-500 bg-slate-100 text-slate-800 shadow-sm',   count: 'bg-slate-200 text-slate-700',   dot: 'bg-slate-500' }
    case 'manageengine': return { tab: 'border-lime-500 bg-lime-50 text-lime-700 shadow-sm',       count: 'bg-lime-100 text-lime-700',     dot: 'bg-lime-500'   }
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function computeScore(pillars: Pillar[]): number {
  return Math.round(pillars.reduce((acc, p) => acc + p.score * p.weight, 0))
}

function scoreGrade(score: number): string {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  return 'D'
}

function scoreColor(score: number): { stroke: string; text: string; bg: string; border: string } {
  if (score >= 90) return { stroke: '#22c55e', text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' }
  if (score >= 70) return { stroke: '#f59e0b', text: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200'   }
  return               { stroke: '#ef4444', text: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-200'     }
}

function pillarColorClasses(color: string): { bar: string; icon: string; iconBg: string; badge: string } {
  const map: Record<string, { bar: string; icon: string; iconBg: string; badge: string }> = {
    emerald: { bar: 'bg-emerald-500', icon: 'text-emerald-600', iconBg: 'bg-emerald-100', badge: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
    blue:    { bar: 'bg-orange-500',  icon: 'text-orange-600',  iconBg: 'bg-orange-100',  badge: 'bg-orange-50 border-orange-200 text-orange-700'    },
    sky:     { bar: 'bg-orange-500',  icon: 'text-orange-600',  iconBg: 'bg-orange-100',  badge: 'bg-orange-50 border-orange-200 text-orange-700'    },
    amber:   { bar: 'bg-amber-500',   icon: 'text-amber-600',   iconBg: 'bg-amber-100',   badge: 'bg-amber-50 border-amber-200 text-amber-700'       },
    violet:  { bar: 'bg-lime-500',    icon: 'text-lime-600',    iconBg: 'bg-lime-100',    badge: 'bg-lime-50 border-lime-200 text-lime-700'          },
    green:   { bar: 'bg-green-500',   icon: 'text-green-600',   iconBg: 'bg-green-100',   badge: 'bg-green-50 border-green-200 text-green-700'       },
  }
  return map[color] ?? map['sky']
}

function severityCfg(severity: RiskItem['severity']): { badge: string; dot: string } {
  switch (severity) {
    case 'Critical': return { badge: 'bg-red-100 border-red-200 text-red-700',         dot: 'bg-red-500'    }
    case 'High':     return { badge: 'bg-orange-100 border-orange-200 text-orange-700', dot: 'bg-orange-500' }
    case 'Medium':   return { badge: 'bg-amber-100 border-amber-200 text-amber-600',   dot: 'bg-amber-500'  }
    case 'Low':      return { badge: 'bg-slate-100 border-slate-200 text-slate-600',   dot: 'bg-slate-400'  }
  }
}

function cisBadge(status: CisControl['status']): string {
  switch (status) {
    case 'Implemented': return 'bg-emerald-50 border-emerald-200 text-emerald-700'
    case 'Partial':     return 'bg-amber-50 border-amber-200 text-amber-600'
    case 'Not Started': return 'bg-slate-100 border-slate-200 text-slate-500'
  }
}

function cisCoverageColor(coverage: number): string {
  if (coverage >= 90) return 'bg-emerald-500'
  if (coverage >= 75) return 'bg-orange-500'
  if (coverage >= 60) return 'bg-amber-500'
  return 'bg-red-500'
}

// ─── SVG Gauge ─────────────────────────────────────────────────────────────────

function ScoreGauge({ score }: { score: number }) {
  const radius = 44
  const circumference = 2 * Math.PI * radius
  const { stroke, text } = scoreColor(score)
  const grade = scoreGrade(score)

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg width="120" height="120" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="10" />
          <circle
            cx="60" cy="60" r={radius} fill="none" stroke={stroke}
            strokeWidth="10" strokeLinecap="round"
            strokeDasharray={`${circumference * score / 100} ${circumference}`}
            strokeDashoffset={0}
            transform="rotate(-90 60 60)"
            style={{ transition: 'stroke-dasharray 0.8s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-black ${text}`}>{score}</span>
          <span className={`text-xs font-bold ${text} -mt-0.5`}>{grade}</span>
        </div>
      </div>
      <p className="text-xs font-semibold text-slate-700 mt-1">Security Score</p>
    </div>
  )
}

// ─── Pillar Card ───────────────────────────────────────────────────────────────

function PillarCard({ pillar, isSelected, onClick }: { pillar: Pillar; isSelected: boolean; onClick: () => void }) {
  const cls = pillarColorClasses(pillar.color)
  const PillarIcon = pillar.icon
  const TrendIcon = pillar.positive
    ? (pillar.trend.startsWith('→') ? Minus : TrendingUp)
    : TrendingDown

  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left bg-white rounded-2xl border shadow-sm px-4 py-4 flex flex-col gap-3 transition-all hover:shadow-md ${isSelected ? 'border-orange-400 ring-2 ring-orange-200' : 'border-slate-200 hover:border-orange-200'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className={`rounded-xl p-2 ${isSelected ? 'bg-orange-100' : cls.iconBg} flex-shrink-0 transition-colors`}>
            <PillarIcon className={`h-4 w-4 ${isSelected ? 'text-orange-600' : cls.icon}`} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-800">{pillar.label}</p>
            <p className="text-[0.65rem] text-slate-400 mt-0.5">{pillar.description}</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.62rem] font-bold flex-shrink-0 ${cls.badge}`}>
          <TrendIcon className="h-2.5 w-2.5" />
          {pillar.trend}
        </span>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[0.65rem] font-semibold text-slate-500">Coverage</span>
          <span className="text-sm font-black text-slate-800">{pillar.score}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
          <div className={`h-2 rounded-full ${cls.bar} transition-all duration-700`} style={{ width: `${pillar.score}%` }} />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-0.5">
        <div className="flex items-center gap-1">
          <CheckCircle className="h-3 w-3 text-emerald-500" />
          <span className="text-[0.68rem] font-semibold text-slate-700">{pillar.passing.toLocaleString()}</span>
          <span className="text-[0.62rem] text-slate-400">passing</span>
        </div>
        <div className="h-3 w-px bg-slate-200" />
        <div className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 text-red-400" />
          <span className="text-[0.68rem] font-semibold text-slate-700">{pillar.failing.toLocaleString()}</span>
          <span className="text-[0.62rem] text-slate-400">failing</span>
        </div>
        <div className="ml-auto flex items-center gap-1 text-[0.6rem] text-slate-400">
          <ChevronDown className={`h-3 w-3 transition-transform ${isSelected ? 'rotate-180 text-orange-500' : ''}`} />
          {isSelected ? 'close' : 'details'}
        </div>
      </div>
    </button>
  )
}

// ─── Pillar Detail Panel ────────────────────────────────────────────────────────

function PillarDetailPanel({ pillar, onClose }: { pillar: Pillar; onClose: () => void }) {
  const cls = pillarColorClasses(pillar.color)
  const PillarIcon = pillar.icon
  const steps = getPillarSteps(pillar.id)
  const failPct = Math.round((pillar.failing / (pillar.passing + pillar.failing)) * 100)

  return (
    <div className="bg-white rounded-2xl border border-orange-200 shadow-md overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 bg-orange-50 border-b border-orange-100">
        <div className="flex items-center gap-2.5">
          <div className={`rounded-xl p-2 ${cls.iconBg}`}>
            <PillarIcon className={`h-4 w-4 ${cls.icon}`} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">{pillar.label}</p>
            <p className="text-[0.62rem] text-slate-500">{pillar.description}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-orange-100 hover:text-slate-600 transition">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Stats */}
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-center">
              <p className="text-lg font-black text-slate-800">{pillar.score}%</p>
              <p className="text-[0.58rem] text-slate-400 font-medium">Coverage</p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-center">
              <p className="text-lg font-black text-emerald-600">{pillar.passing}</p>
              <p className="text-[0.58rem] text-emerald-600/70 font-medium">Passing</p>
            </div>
            <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-center">
              <p className="text-lg font-black text-red-600">{pillar.failing}</p>
              <p className="text-[0.58rem] text-red-500/70 font-medium">Failing</p>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-[0.62rem] text-slate-500 mb-1">
              <span>Devices meeting this control</span>
              <span className="font-bold">{100 - failPct}%</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div className={`h-2.5 rounded-full ${cls.bar} transition-all duration-700`} style={{ width: `${pillar.score}%` }} />
            </div>
          </div>
          <div className={`rounded-xl border px-3 py-2 flex items-center gap-2 ${pillar.positive ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
            {pillar.positive
              ? <TrendingUp className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
              : <TrendingDown className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
            }
            <p className="text-[0.68rem] font-semibold text-slate-700">
              Trend: <span className={pillar.positive ? 'text-emerald-600' : 'text-red-500'}>{pillar.trend}</span>
              {' '}{pillar.positive ? '— improving' : '— needs attention'}
            </p>
          </div>
        </div>

        {/* Remediation steps */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Wrench className="h-3.5 w-3.5 text-orange-500" />
            <p className="text-[0.65rem] font-bold text-slate-700 uppercase tracking-wide">Remediation Steps</p>
          </div>
          <ol className="space-y-1.5">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="flex-shrink-0 h-4 w-4 rounded-full bg-orange-100 text-orange-700 text-[0.55rem] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                <p className="text-[0.65rem] text-slate-600 leading-snug">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}

// ─── Source Tab Bar ─────────────────────────────────────────────────────────────

const SOURCES: MDMSource[] = ['all', 'intune', 'kandji', 'manageengine']

function SourceTabBar({ active, onChange }: { active: MDMSource; onChange: (s: MDMSource) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {SOURCES.map(src => {
        const cfg = SOURCE_CONFIGS[src]
        const SrcIcon = cfg.icon
        const isActive = active === src
        const style = sourceTabStyle(src, isActive)

        return (
          <button
            key={src}
            type="button"
            onClick={() => onChange(src)}
            className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all ${style.tab}`}
          >
            <SrcIcon className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="hidden sm:inline">{cfg.label}</span>
            <span className="sm:hidden">{cfg.shortLabel}</span>
            {cfg.platform !== 'All Platforms' && (
              <span className="hidden md:inline text-[0.58rem] font-medium opacity-60">· {cfg.platform}</span>
            )}
            <span className={`rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold ${style.count}`}>
              {cfg.deviceCount.toLocaleString()}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function SecurityPosturePage() {
  const [activeSource, setActiveSource] = useState<MDMSource>('all')
  const [selectedPillar, setSelectedPillar] = useState<Pillar | null>(null)
  const [expandedRisk, setExpandedRisk]   = useState<number | null>(null)

  const sourceCfg = SOURCE_CONFIGS[activeSource]
  const { pillars, risks } = sourceCfg

  const overallScore = computeScore(pillars)
  const { text: scoreText, bg: scoreBg, border: scoreBorder } = scoreColor(overallScore)
  const totalDevices = pillars[0].passing + pillars[0].failing
  const criticalCount = risks.filter(r => r.severity === 'Critical').length
  const atRiskCount = risks.reduce((acc, r) => Math.max(acc, r.count), 0)
  const passingControls = CIS_CONTROLS.filter(c => c.status === 'Implemented').length

  const handleSourceChange = (s: MDMSource) => {
    setActiveSource(s)
    setSelectedPillar(null)
    setExpandedRisk(null)
  }

  // Per-source accent for non-all sources
  const sourcePlatformBadge =
    activeSource === 'intune'       ? 'bg-orange-50 border-orange-200 text-orange-700' :
    activeSource === 'kandji'       ? 'bg-slate-100 border-slate-200 text-slate-700'   :
    activeSource === 'manageengine' ? 'bg-lime-50 border-lime-200 text-lime-700'       : ''

  return (
    <div className="flex flex-col gap-5 w-full">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-orange-100 p-2.5 flex-shrink-0">
            <Shield className="h-6 w-6 text-orange-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Security Posture</h1>
            <p className="mt-0.5 text-sm text-slate-500">Real-time security health across all managed endpoints</p>
          </div>
        </div>
        {activeSource !== 'all' && (
          <div className={`hidden sm:flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${sourcePlatformBadge}`}>
            {(() => { const I = SOURCE_CONFIGS[activeSource].icon; return <I className="h-3.5 w-3.5" /> })()}
            <span>{sourceCfg.label}</span>
            <span className="opacity-60">· {sourceCfg.platform}</span>
          </div>
        )}
      </div>

      {/* ── Mock data notice ── */}
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <Info className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-[0.68rem] text-amber-800 leading-snug">
          <span className="font-bold">Baseline estimates</span> — scores are derived from your fleet configuration. Kandji and Entra ID are connected for live data; Intune and ManageEngine figures are estimated from mock device data. Connect all integrations in Settings for fully live posture tracking.
        </p>
      </div>

      {/* ── Endpoint Protection Coverage (live — Falcon/Zscaler on physical Windows & macOS devices) ── */}
      <EndpointProtectionCoverage />

      {/* ── MDM Source Tabs ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3">
        <p className="text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide mb-2.5">Filter by MDM Source</p>
        <SourceTabBar active={activeSource} onChange={handleSourceChange} />
      </div>

      {/* ── Row 1: Score card + 3 mini stats ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Overall score card */}
        <div className={`bg-white rounded-2xl border ${scoreBorder} shadow-sm px-6 py-5 flex flex-col items-center gap-4`}>
          <ScoreGauge score={overallScore} />
          <div className={`w-full rounded-xl ${scoreBg} border ${scoreBorder} px-4 py-2.5 flex items-center gap-2`}>
            <Clock className={`h-3.5 w-3.5 ${scoreText} flex-shrink-0`} />
            <div>
              <p className="text-[0.6rem] font-semibold text-slate-500 uppercase tracking-wide">Last Assessed</p>
              <p className={`text-[0.72rem] font-bold ${scoreText}`}>{sourceCfg.lastAssessed}</p>
            </div>
          </div>
          <div className="w-full grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-center">
              <p className="text-xs font-black text-slate-800">{totalDevices.toLocaleString()}</p>
              <p className="text-[0.6rem] text-slate-400 font-medium">Total Devices</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-center">
              <p className="text-xs font-black text-slate-800">{scoreGrade(overallScore)}</p>
              <p className="text-[0.6rem] text-slate-400 font-medium">Letter Grade</p>
            </div>
          </div>
        </div>

        {/* 3 mini stat cards + pillar summary */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-red-200 shadow-sm px-4 py-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-red-100 p-2"><AlertTriangle className="h-4 w-4 text-red-600" /></div>
              <p className="text-xs font-semibold text-slate-600">Critical Issues</p>
            </div>
            <p className="text-3xl font-black text-red-600">{criticalCount}</p>
            <p className="text-[0.65rem] text-slate-400">Require immediate attention</p>
          </div>

          <div className="bg-white rounded-2xl border border-orange-200 shadow-sm px-4 py-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-orange-100 p-2"><Target className="h-4 w-4 text-orange-600" /></div>
              <p className="text-xs font-semibold text-slate-600">Devices at Risk</p>
            </div>
            <p className="text-3xl font-black text-orange-600">{atRiskCount}</p>
            <p className="text-[0.65rem] text-slate-400">Highest single risk count</p>
          </div>

          <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm px-4 py-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-emerald-100 p-2"><CheckCircle className="h-4 w-4 text-emerald-600" /></div>
              <p className="text-xs font-semibold text-slate-600">Controls Passing</p>
            </div>
            <p className="text-3xl font-black text-emerald-600">
              {passingControls}<span className="text-lg text-slate-400">/{CIS_CONTROLS.length}</span>
            </p>
            <p className="text-[0.65rem] text-slate-400">CIS controls implemented</p>
          </div>

          {/* Pillar health mini bars */}
          <div className="sm:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3">
            <p className="text-[0.65rem] font-semibold text-slate-500 uppercase tracking-wide mb-3">Pillar Health Overview</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
              {pillars.map(p => {
                const cls = pillarColorClasses(p.color)
                return (
                  <div key={p.id} className="flex items-center gap-2">
                    <span className="text-[0.62rem] font-semibold text-slate-500 w-24 shrink-0 truncate">{p.label}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-1.5 rounded-full ${cls.bar}`} style={{ width: `${p.score}%` }} />
                    </div>
                    <span className={`text-[0.62rem] font-bold w-8 text-right ${cls.icon}`}>{p.score}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 2: 6 pillar cards ── */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {pillars.map(pillar => (
            <PillarCard
              key={pillar.id}
              pillar={pillar}
              isSelected={selectedPillar?.id === pillar.id}
              onClick={() => setSelectedPillar(selectedPillar?.id === pillar.id ? null : pillar)}
            />
          ))}
        </div>
        {selectedPillar && (
          <PillarDetailPanel
            pillar={selectedPillar}
            onClose={() => setSelectedPillar(null)}
          />
        )}
      </div>

      {/* ── Row 3: Top Risks + CIS Controls ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

        {/* Top Risks */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Top Risks</h2>
              <p className="text-[0.65rem] text-slate-400 mt-0.5">
                {activeSource === 'all' ? 'Prioritized issues across all sources' : `Issues specific to ${sourceCfg.label}`}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2.5 py-1 text-[0.65rem] font-bold text-red-600">
              <AlertTriangle className="h-2.5 w-2.5" />
              {risks.length} active
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {risks.map((risk, i) => {
              const sc = severityCfg(risk.severity)
              const isExpanded = expandedRisk === i
              const steps = getPillarSteps(risk.pillar.toLowerCase())
              return (
                <div key={i}>
                  <button
                    type="button"
                    onClick={() => setExpandedRisk(isExpanded ? null : i)}
                    className={`w-full flex items-start gap-3 px-5 py-3.5 text-left transition ${isExpanded ? 'bg-orange-50/60' : 'hover:bg-slate-50/60'}`}
                  >
                    <span className={`flex-shrink-0 mt-1.5 h-2 w-2 rounded-full ${sc.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${sc.badge}`}>
                          {risk.severity}
                        </span>
                        <span className="text-[0.62rem] text-slate-400">{risk.pillar}</span>
                        <span className="text-[0.6rem] text-slate-400">· {risk.count} device{risk.count !== 1 ? 's' : ''}</span>
                      </div>
                      <p className="text-xs text-slate-700 font-medium leading-snug">{risk.title}</p>
                    </div>
                    <ChevronDown className={`flex-shrink-0 h-3.5 w-3.5 text-slate-400 mt-1 transition-transform ${isExpanded ? 'rotate-180 text-orange-500' : ''}`} />
                  </button>
                  {isExpanded && (
                    <div className="px-5 pb-4 bg-orange-50/40 border-t border-orange-100">
                      <div className="pt-3 flex items-center gap-1.5 mb-2">
                        <Wrench className="h-3 w-3 text-orange-500" />
                        <p className="text-[0.6rem] font-bold text-slate-600 uppercase tracking-wide">Recommended Remediation</p>
                      </div>
                      <ol className="space-y-1.5">
                        {steps.slice(0, 4).map((step, j) => (
                          <li key={j} className="flex items-start gap-2">
                            <span className="flex-shrink-0 h-4 w-4 rounded-full bg-orange-100 text-orange-700 text-[0.55rem] font-bold flex items-center justify-center mt-0.5">{j + 1}</span>
                            <p className="text-[0.65rem] text-slate-600 leading-snug">{step}</p>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* CIS Controls Coverage */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800">CIS Controls Coverage</h2>
              <p className="text-[0.65rem] text-slate-400 mt-0.5">CIS v8 implementation status — org-level</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Implemented
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[0.6rem] font-bold text-amber-600">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Partial
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-4 py-2.5 text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide w-10">#</th>
                  <th className="px-3 py-2.5 text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide">Control Name</th>
                  <th className="px-3 py-2.5 text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide w-28">Coverage</th>
                  <th className="px-4 py-2.5 text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {CIS_CONTROLS.map(ctrl => (
                  <tr key={ctrl.number} className="hover:bg-slate-50/60 transition">
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center justify-center h-5 w-5 rounded-lg bg-slate-100 text-[0.62rem] font-bold text-slate-600">
                        {ctrl.number}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs font-medium text-slate-700">{ctrl.name}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className={`h-1.5 rounded-full ${cisCoverageColor(ctrl.coverage)}`} style={{ width: `${ctrl.coverage}%` }} />
                        </div>
                        <span className="text-[0.65rem] font-bold text-slate-600 w-8 text-right">{ctrl.coverage}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${cisBadge(ctrl.status)}`}>
                        {ctrl.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  )
}
