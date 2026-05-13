import { useState, useMemo } from 'react'
import {
  ShieldAlert, Search, Filter, X, CheckCircle, XCircle,
  AlertTriangle, Clock, ChevronUp, ChevronDown, ChevronsUpDown,
  Shield, Package, Monitor, Globe, Apple, Server,
} from 'lucide-react'
import { useColumnResize } from '../hooks/useColumnResize'

// ─── Types ─────────────────────────────────────────────────────────────────────

type MDMSource = 'all' | 'intune' | 'kandji' | 'manageengine'

interface CVE {
  id: string
  cvss: number
  severity: 'Critical' | 'High' | 'Medium' | 'Low'
  software: string
  platform: 'Windows' | 'macOS' | 'Cross-platform'
  mdmSource: MDMSource
  affectedDevices: number
  published: string
  patchAvailable: boolean
  patchDeadline: string | null
  description: string
  remediationSteps: string[]
  cweId: string
  references: string[]
}

type SortField = 'cvss' | 'affectedDevices' | 'published' | 'patchDeadline'
type SortDir = 'asc' | 'desc'

// ─── Mock Data ─────────────────────────────────────────────────────────────────

export const MOCK_CVES: CVE[] = [
  {
    id: 'CVE-2024-38080',
    cvss: 9.8,
    severity: 'Critical',
    software: 'Windows Hyper-V',
    platform: 'Windows',
    mdmSource: 'intune',
    affectedDevices: 23,
    published: '2024-07-09',
    patchAvailable: true,
    patchDeadline: '2024-07-23',
    description: 'A use-after-free vulnerability in Windows Hyper-V allows a local authenticated attacker to gain SYSTEM-level privileges through a specially crafted program, bypassing security restrictions on the host hypervisor.',
    remediationSteps: [
      'Apply Microsoft security update KB5040442 via Windows Update or WSUS.',
      'Restart affected Hyper-V host systems to complete patch application.',
      'Verify patch installation using: Get-HotFix -Id KB5040442.',
      'Review Hyper-V event logs for any exploitation indicators before patching.',
    ],
    cweId: 'CWE-416',
    references: [
      'https://msrc.microsoft.com/update-guide/vulnerability/CVE-2024-38080',
      'https://nvd.nist.gov/vuln/detail/CVE-2024-38080',
      'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
    ],
  },
  {
    id: 'CVE-2024-21412',
    cvss: 8.1,
    severity: 'High',
    software: 'Windows SmartScreen',
    platform: 'Windows',
    mdmSource: 'intune',
    affectedDevices: 45,
    published: '2024-02-13',
    patchAvailable: true,
    patchDeadline: '2024-02-27',
    description: 'An Internet Shortcut files security feature bypass vulnerability in Windows SmartScreen allows an unauthenticated attacker to bypass SmartScreen protection by convincing a user to open a specially crafted .url file.',
    remediationSteps: [
      'Deploy Microsoft Patch Tuesday update KB5034763 via Intune or WSUS.',
      'Enable SmartScreen enforcement via Group Policy: Computer Configuration > Windows Settings > Security Settings.',
      'Review email gateway rules to block .url file attachments from external senders.',
      'Audit recent .url file execution events in Windows Defender for Endpoint telemetry.',
    ],
    cweId: 'CWE-693',
    references: [
      'https://msrc.microsoft.com/update-guide/vulnerability/CVE-2024-21412',
      'https://nvd.nist.gov/vuln/detail/CVE-2024-21412',
    ],
  },
  {
    id: 'CVE-2024-6387',
    cvss: 8.1,
    severity: 'High',
    software: 'OpenSSH (regreSSHion)',
    platform: 'Cross-platform',
    mdmSource: 'all',
    affectedDevices: 12,
    published: '2024-07-01',
    patchAvailable: true,
    patchDeadline: '2024-07-15',
    description: 'A signal handler race condition in OpenSSH\'s server (sshd) allows unauthenticated remote code execution as root on glibc-based Linux systems. This is a regression of CVE-2006-5051, reintroduced in OpenSSH 8.5p1.',
    remediationSteps: [
      'Upgrade OpenSSH to version 9.8p1 or later on all affected Linux hosts.',
      'Set LoginGraceTime to 0 in /etc/ssh/sshd_config as a temporary mitigation.',
      'Restrict SSH access to trusted IP ranges using firewall rules and TCP wrappers.',
      'Monitor SSH daemon logs for repeated authentication failures indicating exploitation attempts.',
    ],
    cweId: 'CWE-362',
    references: [
      'https://www.openssh.com/security.html',
      'https://nvd.nist.gov/vuln/detail/CVE-2024-6387',
      'https://www.qualys.com/2024/07/01/cve-2024-6387/regresshion.txt',
    ],
  },
  {
    id: 'CVE-2024-30051',
    cvss: 7.8,
    severity: 'High',
    software: 'Windows DWM Core Library',
    platform: 'Windows',
    mdmSource: 'intune',
    affectedDevices: 31,
    published: '2024-05-14',
    patchAvailable: true,
    patchDeadline: '2024-05-28',
    description: 'A heap-based buffer overflow in the Windows Desktop Window Manager (DWM) Core Library allows a local attacker to escalate privileges to SYSTEM. This vulnerability has been observed in the wild linked to QakBot malware campaigns.',
    remediationSteps: [
      'Apply May 2024 Patch Tuesday security update KB5037771.',
      'Enable Windows Defender Exploit Guard to reduce attack surface.',
      'Review endpoint detection logs for QakBot indicators of compromise.',
      'Ensure all endpoints have EDR agents reporting to the central console.',
    ],
    cweId: 'CWE-122',
    references: [
      'https://msrc.microsoft.com/update-guide/vulnerability/CVE-2024-30051',
      'https://nvd.nist.gov/vuln/detail/CVE-2024-30051',
    ],
  },
  {
    id: 'CVE-2024-23222',
    cvss: 8.8,
    severity: 'High',
    software: 'Apple WebKit',
    platform: 'macOS',
    mdmSource: 'kandji',
    affectedDevices: 67,
    published: '2024-01-23',
    patchAvailable: true,
    patchDeadline: '2024-02-06',
    description: 'A type confusion vulnerability in Apple WebKit allows processing maliciously crafted web content to achieve arbitrary code execution. This issue was actively exploited against versions prior to iOS 17.3 and macOS Sonoma 14.3.',
    remediationSteps: [
      'Update macOS to Sonoma 14.3 or later via System Settings > Software Update.',
      'Deploy macOS update enforcement policy via Kandji or Jamf.',
      'Enable Lockdown Mode for high-risk users if immediate update is not feasible.',
      'Review browser security settings and disable JavaScript on untrusted sites temporarily.',
    ],
    cweId: 'CWE-843',
    references: [
      'https://support.apple.com/en-us/HT214059',
      'https://nvd.nist.gov/vuln/detail/CVE-2024-23222',
    ],
  },
  {
    id: 'CVE-2024-44308',
    cvss: 8.8,
    severity: 'High',
    software: 'Apple JavaScriptCore',
    platform: 'macOS',
    mdmSource: 'kandji',
    affectedDevices: 89,
    published: '2024-11-01',
    patchAvailable: true,
    patchDeadline: '2024-11-15',
    description: 'Processing maliciously crafted web content in Apple JavaScriptCore may lead to arbitrary code execution. Apple is aware of a report that this issue may have been actively exploited on Intel-based Mac systems.',
    remediationSteps: [
      'Update macOS to Sequoia 15.1.1, Ventura 13.7.2, or Sonoma 14.7.2 immediately.',
      'Push emergency software update enforcement via Kandji Enforcement policy.',
      'Temporarily restrict web browsing on Intel Mac endpoints until patched.',
      'Check Apple Security Advisories for YARA rules to detect potential exploitation artifacts.',
    ],
    cweId: 'CWE-119',
    references: [
      'https://support.apple.com/en-us/121564',
      'https://nvd.nist.gov/vuln/detail/CVE-2024-44308',
    ],
  },
  {
    id: 'CVE-2024-49039',
    cvss: 8.8,
    severity: 'High',
    software: 'Windows Task Scheduler',
    platform: 'Windows',
    mdmSource: 'intune',
    affectedDevices: 18,
    published: '2024-11-12',
    patchAvailable: true,
    patchDeadline: '2024-11-26',
    description: 'An improper access control vulnerability in Windows Task Scheduler allows a local attacker to elevate privileges from a low-privileged AppContainer to SYSTEM by calling privileged RPC functions, exploiting a boundary crossing weakness.',
    remediationSteps: [
      'Apply November 2024 Patch Tuesday cumulative update KB5046617.',
      'Audit scheduled tasks for unauthorized entries using: schtasks /query /fo LIST /v.',
      'Restrict Task Scheduler access via AppLocker or Windows Defender Application Control.',
      'Enable detailed Windows Security audit logging for scheduled task creation events.',
    ],
    cweId: 'CWE-269',
    references: [
      'https://msrc.microsoft.com/update-guide/vulnerability/CVE-2024-49039',
      'https://nvd.nist.gov/vuln/detail/CVE-2024-49039',
    ],
  },
  {
    id: 'CVE-2024-38193',
    cvss: 7.8,
    severity: 'High',
    software: 'Windows AFD Driver',
    platform: 'Windows',
    mdmSource: 'intune',
    affectedDevices: 14,
    published: '2024-08-13',
    patchAvailable: true,
    patchDeadline: '2024-08-27',
    description: 'A use-after-free vulnerability in the Windows Ancillary Function Driver for WinSock (afd.sys) allows a local attacker to escalate privileges to SYSTEM. This vulnerability has been linked to Lazarus Group exploit-as-a-service operations.',
    remediationSteps: [
      'Apply August 2024 Patch Tuesday security update KB5041585.',
      'Verify afd.sys version is 10.0.22621.4037 or later on patched systems.',
      'Enable kernel patch protection (KPP/PatchGuard) to detect unauthorized kernel modifications.',
      'Review endpoint telemetry for lateral movement indicators associated with APT activity.',
    ],
    cweId: 'CWE-416',
    references: [
      'https://msrc.microsoft.com/update-guide/vulnerability/CVE-2024-38193',
      'https://nvd.nist.gov/vuln/detail/CVE-2024-38193',
    ],
  },
  {
    id: 'CVE-2024-26234',
    cvss: 6.7,
    severity: 'Medium',
    software: 'Microsoft Proxy Driver',
    platform: 'Windows',
    mdmSource: 'intune',
    affectedDevices: 8,
    published: '2024-04-09',
    patchAvailable: true,
    patchDeadline: '2024-04-23',
    description: 'A spoofing vulnerability in the Microsoft Proxy Driver allows a local attacker with administrator privileges to deploy a malicious driver signed by a valid Microsoft Hardware Compatibility Program certificate, bypassing driver signing requirements.',
    remediationSteps: [
      'Apply April 2024 Patch Tuesday security update KB5036893.',
      'Enable Windows Defender Credential Guard to protect sensitive credentials.',
      'Audit installed drivers using: Get-WindowsDriver -Online and review for anomalies.',
      'Enforce strict driver signing policy via Windows Defender Application Control WDAC policies.',
    ],
    cweId: 'CWE-290',
    references: [
      'https://msrc.microsoft.com/update-guide/vulnerability/CVE-2024-26234',
      'https://nvd.nist.gov/vuln/detail/CVE-2024-26234',
    ],
  },
  {
    id: 'CVE-2024-20017',
    cvss: 9.8,
    severity: 'Critical',
    software: 'Qualcomm WLAN Firmware',
    platform: 'Cross-platform',
    mdmSource: 'manageengine',
    affectedDevices: 6,
    published: '2024-03-05',
    patchAvailable: true,
    patchDeadline: '2024-03-19',
    description: 'An out-of-bounds write vulnerability in Qualcomm WLAN firmware allows an unauthenticated attacker within Wi-Fi range to achieve arbitrary code execution in the modem processor without any user interaction, potentially leading to full device compromise.',
    remediationSteps: [
      'Apply firmware update provided by device OEM that includes Qualcomm\'s March 2024 security bulletin fixes.',
      'Disable Wi-Fi on affected devices until firmware update is confirmed applied.',
      'Verify Qualcomm chipset model (Snapdragon 865/870/888) and check OEM patch availability.',
      'Enable network segmentation to isolate potentially vulnerable devices from critical infrastructure.',
    ],
    cweId: 'CWE-787',
    references: [
      'https://www.qualcomm.com/company/product-security/bulletins/march-2024-bulletin',
      'https://nvd.nist.gov/vuln/detail/CVE-2024-20017',
    ],
  },
  {
    id: 'CVE-2024-27198',
    cvss: 9.8,
    severity: 'Critical',
    software: 'JetBrains TeamCity',
    platform: 'Cross-platform',
    mdmSource: 'manageengine',
    affectedDevices: 3,
    published: '2024-03-04',
    patchAvailable: true,
    patchDeadline: '2024-03-18',
    description: 'An authentication bypass vulnerability in JetBrains TeamCity allows an unauthenticated remote attacker to execute arbitrary code on the server by bypassing authentication through alternative paths, leading to full server takeover.',
    remediationSteps: [
      'Upgrade TeamCity to version 2023.11.4 or later immediately.',
      'Apply JetBrains security patch plugin as temporary mitigation if upgrade is not immediately possible.',
      'Block external access to TeamCity ports (8111/8543) at the network perimeter.',
      'Audit TeamCity server for unauthorized administrator accounts and recent configuration changes.',
    ],
    cweId: 'CWE-288',
    references: [
      'https://www.jetbrains.com/privacy-security/issues-fixed/CVE-2024-27198/',
      'https://nvd.nist.gov/vuln/detail/CVE-2024-27198',
      'https://www.cisa.gov/news-events/alerts/2024/03/07/cisa-fbi-release-advisory-teamcity',
    ],
  },
  {
    id: 'CVE-2024-3094',
    cvss: 10.0,
    severity: 'Critical',
    software: 'XZ Utils (liblzma)',
    platform: 'Cross-platform',
    mdmSource: 'manageengine',
    affectedDevices: 2,
    published: '2024-03-29',
    patchAvailable: true,
    patchDeadline: '2024-04-05',
    description: 'A supply chain compromise in XZ Utils versions 5.6.0 and 5.6.1 introduced a backdoor in liblzma that allows an attacker to bypass SSH authentication. The backdoor was embedded through obfuscated build scripts in the official upstream repository.',
    remediationSteps: [
      'Downgrade xz-utils to version 5.4.6 immediately: apt-get install xz-utils=5.4.1-0.2.',
      'Verify xz version on all Linux systems: xz --version and strings $(which xz) | grep "^5\\.".',
      'Audit systemd and sshd configurations for signs of compromise on affected systems.',
      'Run the detection script provided by Openwall to identify backdoored binaries in memory.',
    ],
    cweId: 'CWE-506',
    references: [
      'https://www.openwall.com/lists/oss-security/2024/03/29/4',
      'https://nvd.nist.gov/vuln/detail/CVE-2024-3094',
      'https://www.cisa.gov/news-events/alerts/2024/03/29/reported-supply-chain-compromise-affecting-xz-utils',
    ],
  },
  {
    id: 'CVE-2024-4577',
    cvss: 9.8,
    severity: 'Critical',
    software: 'PHP-CGI',
    platform: 'Cross-platform',
    mdmSource: 'manageengine',
    affectedDevices: 1,
    published: '2024-06-09',
    patchAvailable: true,
    patchDeadline: '2024-06-16',
    description: 'An argument injection vulnerability in PHP-CGI for Windows allows a remote unauthenticated attacker to execute arbitrary PHP code by exploiting Unicode best-fit character conversion in the Windows code page. This bypasses a previous fix for CVE-2012-1823.',
    remediationSteps: [
      'Upgrade PHP to versions 8.3.8, 8.2.20, or 8.1.29 on all affected servers.',
      'If immediate upgrade is not possible, add rewrite rules in Apache/IIS to block malicious requests.',
      'Switch from PHP-CGI to PHP-FPM as a more secure alternative execution model.',
      'Monitor web server access logs for exploitation attempts: patterns matching %ADd, %ADR, %ADZ parameters.',
    ],
    cweId: 'CWE-88',
    references: [
      'https://www.php.net/ChangeLog-8.php#8.3.8',
      'https://nvd.nist.gov/vuln/detail/CVE-2024-4577',
    ],
  },
  {
    id: 'CVE-2024-29988',
    cvss: 8.8,
    severity: 'High',
    software: 'Windows SmartScreen',
    platform: 'Windows',
    mdmSource: 'intune',
    affectedDevices: 27,
    published: '2024-04-09',
    patchAvailable: false,
    patchDeadline: null,
    description: 'A security feature bypass in Windows SmartScreen allows an attacker to circumvent Mark-of-the-Web (MOTW) protections when opening a specifically crafted file. This is used in combination with other vulnerabilities in DarkGate malware campaigns.',
    remediationSteps: [
      'Apply compensating controls: enable Protected View in Microsoft Office for all downloaded files.',
      'Configure Advanced Threat Protection policies in Microsoft 365 Defender.',
      'Deploy Application Guard for Microsoft Edge to sandbox web browsing.',
    ],
    cweId: 'CWE-693',
    references: [
      'https://msrc.microsoft.com/update-guide/vulnerability/CVE-2024-29988',
      'https://nvd.nist.gov/vuln/detail/CVE-2024-29988',
    ],
  },
  {
    id: 'CVE-2024-37985',
    cvss: 5.9,
    severity: 'Medium',
    software: 'Windows Kernel',
    platform: 'Windows',
    mdmSource: 'intune',
    affectedDevices: 19,
    published: '2024-07-09',
    patchAvailable: true,
    patchDeadline: '2024-07-30',
    description: 'A side-channel information disclosure vulnerability in the Windows Kernel allows an attacker with local access to infer the contents of privileged memory through timing analysis of certain kernel operations on ARM-based Windows devices.',
    remediationSteps: [
      'Apply July 2024 Patch Tuesday cumulative update KB5040442.',
      'Enable kernel shadow stack protections if supported by hardware.',
      'Restrict physical access to ARM-based Windows devices in sensitive environments.',
    ],
    cweId: 'CWE-203',
    references: [
      'https://msrc.microsoft.com/update-guide/vulnerability/CVE-2024-37985',
      'https://nvd.nist.gov/vuln/detail/CVE-2024-37985',
    ],
  },
  {
    id: 'CVE-2024-43461',
    cvss: 8.8,
    severity: 'High',
    software: 'Windows MSHTML',
    platform: 'Windows',
    mdmSource: 'intune',
    affectedDevices: 22,
    published: '2024-09-10',
    patchAvailable: true,
    patchDeadline: '2024-09-24',
    description: 'A spoofing vulnerability in Windows MSHTML Platform allows an attacker to deceive users into believing they are viewing a trusted file by exploiting the rendering of encoded Braille Pattern Blank characters in file name displays within browser download prompts.',
    remediationSteps: [
      'Apply September 2024 Patch Tuesday cumulative update KB5043076.',
      'Enable Microsoft Defender SmartScreen for Microsoft Edge and Internet Explorer Mode.',
      'Train users to verify file extensions through Explorer properties rather than open dialogs.',
      'Block downloads of .hta, .vbs, and .js file types at the email and web gateway.',
    ],
    cweId: 'CWE-116',
    references: [
      'https://msrc.microsoft.com/update-guide/vulnerability/CVE-2024-43461',
      'https://nvd.nist.gov/vuln/detail/CVE-2024-43461',
    ],
  },
  {
    id: 'CVE-2024-9680',
    cvss: 9.8,
    severity: 'Critical',
    software: 'Mozilla Firefox',
    platform: 'Cross-platform',
    mdmSource: 'all',
    affectedDevices: 41,
    published: '2024-10-09',
    patchAvailable: true,
    patchDeadline: '2024-10-16',
    description: 'A use-after-free vulnerability in Mozilla Firefox\'s Animation timelines component allows an attacker to achieve code execution in a sandboxed content process by manipulating CSS animation objects. This vulnerability was exploited in the wild before disclosure.',
    remediationSteps: [
      'Update Firefox to version 131.0.2 or later immediately via the browser or software management tool.',
      'Push Firefox update via Intune Win32 app deployment or Kandji managed software.',
      'Verify Firefox version across all managed endpoints using software inventory reports.',
      'Enable automatic browser updates policy via GPO: Computer Configuration > Administrative Templates > Mozilla > Firefox.',
    ],
    cweId: 'CWE-416',
    references: [
      'https://www.mozilla.org/en-US/security/advisories/mfsa2024-51/',
      'https://nvd.nist.gov/vuln/detail/CVE-2024-9680',
    ],
  },
  {
    id: 'CVE-2024-38178',
    cvss: 7.5,
    severity: 'High',
    software: 'Windows Scripting Engine',
    platform: 'Windows',
    mdmSource: 'intune',
    affectedDevices: 11,
    published: '2024-08-13',
    patchAvailable: true,
    patchDeadline: '2024-08-27',
    description: 'A memory corruption vulnerability in the Windows Scripting Engine allows a remote attacker to execute arbitrary code when a user clicks a specially crafted link while using Microsoft Edge in Internet Explorer Mode. Requires user interaction.',
    remediationSteps: [
      'Apply August 2024 Patch Tuesday cumulative update KB5041585.',
      'Disable Internet Explorer Mode in Microsoft Edge if not required by legacy applications.',
      'Configure Enhanced Protected Mode in Internet Explorer settings.',
      'Deploy SmartScreen URL reputation scanning for all inbound email links.',
    ],
    cweId: 'CWE-787',
    references: [
      'https://msrc.microsoft.com/update-guide/vulnerability/CVE-2024-38178',
      'https://nvd.nist.gov/vuln/detail/CVE-2024-38178',
    ],
  },
  {
    id: 'CVE-2024-35250',
    cvss: 7.8,
    severity: 'High',
    software: 'Windows Kernel-Mode Driver',
    platform: 'Windows',
    mdmSource: 'intune',
    affectedDevices: 16,
    published: '2024-06-11',
    patchAvailable: true,
    patchDeadline: '2024-06-25',
    description: 'An untrusted pointer dereference vulnerability in the Windows Kernel-Mode Driver allows a local attacker to escalate privileges to SYSTEM level. The vulnerability exists in how the kernel processes certain I/O control codes sent from user mode.',
    remediationSteps: [
      'Apply June 2024 Patch Tuesday cumulative update KB5039212.',
      'Enable Driver Signature Enforcement to prevent loading of unsigned drivers.',
      'Audit third-party kernel drivers using sigcheck -vt to identify unsigned or anomalous drivers.',
      'Restrict local administrator accounts on endpoints following least-privilege principles.',
    ],
    cweId: 'CWE-822',
    references: [
      'https://msrc.microsoft.com/update-guide/vulnerability/CVE-2024-35250',
      'https://nvd.nist.gov/vuln/detail/CVE-2024-35250',
    ],
  },
  {
    id: 'CVE-2024-30090',
    cvss: 6.8,
    severity: 'Medium',
    software: 'Windows Kernel',
    platform: 'Windows',
    mdmSource: 'intune',
    affectedDevices: 9,
    published: '2024-06-11',
    patchAvailable: false,
    patchDeadline: null,
    description: 'A privilege escalation vulnerability in the Windows Kernel allows a local attacker with SeImpersonatePrivilege to elevate to SYSTEM through manipulation of token objects. No official patch is available; Microsoft is investigating the reported behavior.',
    remediationSteps: [
      'Restrict SeImpersonatePrivilege to only necessary service accounts via Group Policy.',
      'Enable Windows Defender Credential Guard to protect token objects from manipulation.',
      'Monitor for unusual process token manipulation using Sysmon Event ID 10 (ProcessAccess) with SYSTEM token targets.',
    ],
    cweId: 'CWE-269',
    references: [
      'https://msrc.microsoft.com/update-guide/vulnerability/CVE-2024-30090',
      'https://nvd.nist.gov/vuln/detail/CVE-2024-30090',
    ],
  },
]

// ─── Helpers ───────────────────────────────────────────────────────────────────

function cvssColorClasses(cvss: number): { badge: string; text: string } {
  if (cvss >= 9)   return { badge: 'bg-red-100 text-red-700',     text: 'text-red-700'     }
  if (cvss >= 7)   return { badge: 'bg-orange-100 text-orange-700', text: 'text-orange-700' }
  if (cvss >= 4)   return { badge: 'bg-amber-100 text-amber-600',  text: 'text-amber-600'   }
  return             { badge: 'bg-slate-100 text-slate-600',    text: 'text-slate-600'   }
}

function severityClasses(severity: CVE['severity']): string {
  switch (severity) {
    case 'Critical': return 'bg-red-100 text-red-700 border-red-200'
    case 'High':     return 'bg-orange-100 text-orange-700 border-orange-200'
    case 'Medium':   return 'bg-amber-100 text-amber-600 border-amber-200'
    case 'Low':      return 'bg-slate-100 text-slate-600 border-slate-200'
  }
}

function PlatformIcon({ platform }: { platform: CVE['platform'] }) {
  if (platform === 'Windows')      return <Monitor className="h-3.5 w-3.5 text-orange-500" />
  if (platform === 'macOS')        return <Shield className="h-3.5 w-3.5 text-slate-500" />
  return <Globe className="h-3.5 w-3.5 text-lime-500" />
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr)
  const now = new Date()
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Detail Panel ──────────────────────────────────────────────────────────────

function DetailPanel({ cve, onClose }: { cve: CVE; onClose: () => void }) {
  const { badge, text } = cvssColorClasses(cve.cvss)
  const days = cve.patchDeadline ? daysUntil(cve.patchDeadline) : null

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-[400px] flex flex-col bg-white border-l border-slate-200 shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 flex-shrink-0">
        <div>
          <p className="text-[0.65rem] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Vulnerability Detail</p>
          <h2 className="text-sm font-black text-slate-900 font-mono">{cve.id}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-100 transition"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

        {/* CVSS + Severity */}
        <div className="flex items-center gap-3">
          <div className={`rounded-2xl px-4 py-2 text-center ${badge}`}>
            <p className="text-2xl font-black">{cve.cvss.toFixed(1)}</p>
            <p className="text-[0.6rem] font-bold uppercase tracking-wide opacity-70">CVSS v3</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${severityClasses(cve.severity)}`}>
              {cve.severity}
            </span>
            <div className="flex items-center gap-1.5">
              <PlatformIcon platform={cve.platform} />
              <span className="text-xs text-slate-500 font-medium">{cve.platform}</span>
            </div>
          </div>
        </div>

        {/* Software */}
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 flex items-center gap-2">
          <Package className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          <div>
            <p className="text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide">Affected Software</p>
            <p className="text-xs font-semibold text-slate-800">{cve.software}</p>
          </div>
        </div>

        {/* Description */}
        <div>
          <p className="text-[0.65rem] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Description</p>
          <p className="text-xs text-slate-600 leading-relaxed">{cve.description}</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
            <p className="text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide">Affected Devices</p>
            <p className="text-lg font-black text-slate-800">{cve.affectedDevices}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
            <p className="text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide">Published</p>
            <p className="text-xs font-bold text-slate-800">{formatDate(cve.published)}</p>
          </div>
        </div>

        {/* Patch info */}
        <div className={`rounded-xl border px-3 py-2.5 flex items-center gap-2.5 ${
          cve.patchAvailable ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
        }`}>
          {cve.patchAvailable
            ? <CheckCircle className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            : <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
          }
          <div>
            <p className={`text-xs font-bold ${cve.patchAvailable ? 'text-emerald-700' : 'text-red-700'}`}>
              {cve.patchAvailable ? 'Patch Available' : 'No Patch Available'}
            </p>
            {cve.patchDeadline && (
              <p className={`text-[0.65rem] font-medium mt-0.5 ${
                days !== null && days < 0 ? 'text-red-600' : days !== null && days < 7 ? 'text-amber-600' : 'text-slate-500'
              }`}>
                Deadline: {formatDate(cve.patchDeadline)}
                {days !== null && (
                  <span className="ml-1 font-bold">
                    ({days < 0 ? `${Math.abs(days)}d overdue` : `${days}d remaining`})
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Remediation steps */}
        <div>
          <p className="text-[0.65rem] font-semibold text-slate-500 uppercase tracking-wide mb-2">Remediation Steps</p>
          <ol className="space-y-2">
            {cve.remediationSteps.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="flex-shrink-0 h-5 w-5 rounded-lg bg-orange-100 text-orange-700 text-[0.62rem] font-black flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <p className="text-xs text-slate-600 leading-snug">{step}</p>
              </li>
            ))}
          </ol>
        </div>

        {/* CWE */}
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          <div>
            <p className="text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide">Weakness Type</p>
            <p className="text-xs font-semibold text-slate-700 font-mono">{cve.cweId}</p>
          </div>
        </div>

        {/* References */}
        <div>
          <p className="text-[0.65rem] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">References</p>
          <div className="space-y-1">
            {cve.references.map((ref, i) => (
              <a key={i} href={ref} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5 hover:bg-orange-50 hover:border-orange-200 transition-colors group">
                <Globe className="h-3 w-3 text-orange-500 flex-shrink-0" />
                <span className="text-[0.65rem] text-orange-700 font-mono truncate group-hover:underline">{ref}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── MDM Source config (mirrors SecurityPosturePage tabs) ──────────────────────

const MDM_SOURCES: { id: MDMSource; label: string; shortLabel: string; icon: typeof Globe; platform: string }[] = [
  { id: 'all',          label: 'All Sources',      shortLabel: 'All',  icon: Globe,    platform: 'All Platforms' },
  { id: 'intune',       label: 'Microsoft Intune', shortLabel: 'Intune', icon: Monitor,  platform: 'Windows'       },
  { id: 'kandji',       label: 'Kandji',           shortLabel: 'Kandji', icon: Apple,    platform: 'macOS'         },
  { id: 'manageengine', label: 'ManageEngine',     shortLabel: 'ME',     icon: Server,   platform: 'Mixed'         },
]

function sourceTabStyle(src: MDMSource, isActive: boolean): { tab: string; count: string } {
  if (!isActive) return { tab: 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700', count: 'bg-slate-100 text-slate-500' }
  switch (src) {
    case 'all':          return { tab: 'border-orange-400 bg-orange-50 text-orange-700 shadow-sm', count: 'bg-orange-100 text-orange-700' }
    case 'intune':       return { tab: 'border-orange-400 bg-orange-50 text-orange-700 shadow-sm', count: 'bg-orange-100 text-orange-700' }
    case 'kandji':       return { tab: 'border-slate-500 bg-slate-100 text-slate-800 shadow-sm',   count: 'bg-slate-200 text-slate-700'   }
    case 'manageengine': return { tab: 'border-lime-500 bg-lime-50 text-lime-700 shadow-sm',       count: 'bg-lime-100 text-lime-700'     }
  }
}

function cveMatchesSource(cve: CVE, src: MDMSource): boolean {
  if (src === 'all') return true
  return cve.mdmSource === 'all' || cve.mdmSource === src
}

// ─── Sort Icon ─────────────────────────────────────────────────────────────────

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) return <ChevronsUpDown className="h-3 w-3 text-slate-300" />
  return sortDir === 'desc'
    ? <ChevronDown className="h-3 w-3 text-orange-600" />
    : <ChevronUp className="h-3 w-3 text-orange-600" />
}

// ─── Column definitions ────────────────────────────────────────────────────────

const VULN_COLS = [
  { key: 'cveId',           label: 'CVE ID',    min:  100, default: 140 },
  { key: 'cvss',            label: 'CVSS',      min:   50, default:  70 },
  { key: 'severity',        label: 'Severity',  min:   70, default:  90 },
  { key: 'software',        label: 'Software',  min:  100, default: 160 },
  { key: 'platform',        label: 'Platform',  min:   70, default:  90 },
  { key: 'affectedDevices', label: 'Devices',   min:   60, default:  80 },
  { key: 'published',       label: 'Published', min:   90, default: 110 },
  { key: 'patch',           label: 'Patch',     min:   70, default:  90 },
  { key: 'patchDeadline',   label: 'Deadline',  min:   90, default: 110 },
] as const
type VColKey = typeof VULN_COLS[number]['key']

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function VulnerabilitiesPage() {
  const [selectedCve, setSelectedCve] = useState<CVE | null>(null)
  const [activeSource, setActiveSource] = useState<MDMSource>('all')
  const [severityFilter, setSeverityFilter] = useState<CVE['severity'] | 'All'>('All')
  const [patchFilter, setPatchFilter] = useState<'All' | 'Patch Available' | 'No Patch'>('All')
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('cvss')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const { widths: vw, startResize: vResize, totalWidth: vTotal } = useColumnResize<VColKey>(VULN_COLS, 'vulnerabilities')

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  // Source-scoped base set
  const sourceCves = useMemo(
    () => MOCK_CVES.filter(c => cveMatchesSource(c, activeSource)),
    [activeSource]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let result = sourceCves.filter(cve => {
      if (severityFilter !== 'All' && cve.severity !== severityFilter) return false
      if (patchFilter === 'Patch Available' && !cve.patchAvailable) return false
      if (patchFilter === 'No Patch' && cve.patchAvailable) return false
      if (q && !cve.id.toLowerCase().includes(q) && !cve.software.toLowerCase().includes(q) && !cve.description.toLowerCase().includes(q)) return false
      return true
    })

    result = [...result].sort((a, b) => {
      let aVal: number | string
      let bVal: number | string
      switch (sortField) {
        case 'cvss':           aVal = a.cvss;            bVal = b.cvss;            break
        case 'affectedDevices':aVal = a.affectedDevices; bVal = b.affectedDevices; break
        case 'published':      aVal = a.published;       bVal = b.published;       break
        case 'patchDeadline':
          aVal = a.patchDeadline ?? '9999'
          bVal = b.patchDeadline ?? '9999'
          break
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return result
  }, [search, severityFilter, patchFilter, sortField, sortDir, sourceCves])

  // Stats derive from source-scoped set for accurate per-source numbers
  const stats = useMemo(() => ({
    critical:      sourceCves.filter(c => c.severity === 'Critical').length,
    high:          sourceCves.filter(c => c.severity === 'High').length,
    totalAffected: sourceCves.reduce((acc, c) => acc + c.affectedDevices, 0),
    patchCoverage: sourceCves.length > 0
      ? Math.round((sourceCves.filter(c => c.patchAvailable).length / sourceCves.length) * 100)
      : 0,
  }), [sourceCves])

  const thClass = "px-3 py-2.5 text-left text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide relative overflow-hidden"
  const sortableThClass = `${thClass} cursor-pointer select-none hover:text-slate-600 transition`

  return (
    <div className="flex flex-col gap-5 w-full">

      {/* ── Page header ── */}
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-red-100 p-2.5 flex-shrink-0">
          <ShieldAlert className="h-6 w-6 text-red-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Vulnerability Management</h1>
          <p className="mt-0.5 text-sm text-slate-500">CVE tracking and patch compliance across all managed endpoints</p>
        </div>
      </div>

      {/* ── MDM Source Tabs ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3">
        <p className="text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide mb-2.5">Filter by MDM Source</p>
        <div className="flex flex-wrap gap-2">
          {MDM_SOURCES.map(src => {
            const isActive = activeSource === src.id
            const style = sourceTabStyle(src.id, isActive)
            const SrcIcon = src.icon
            const count = MOCK_CVES.filter(c => cveMatchesSource(c, src.id)).length
            return (
              <button
                key={src.id}
                type="button"
                onClick={() => {
                  setActiveSource(src.id)
                  setSelectedCve(null)
                  setSeverityFilter('All')
                  setPatchFilter('All')
                  setSearch('')
                }}
                className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all ${style.tab}`}
              >
                <SrcIcon className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="hidden sm:inline">{src.label}</span>
                <span className="sm:hidden">{src.shortLabel}</span>
                {src.platform !== 'All Platforms' && (
                  <span className="hidden md:inline text-[0.58rem] font-medium opacity-60">· {src.platform}</span>
                )}
                <span className={`rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold ${style.count}`}>{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Row 1: 4 stat cards ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-red-200 shadow-sm px-4 py-3 flex items-center gap-3">
          <div className="rounded-xl bg-red-100 p-2 flex-shrink-0">
            <ShieldAlert className="h-4 w-4 text-red-600" />
          </div>
          <div>
            <p className="text-2xl font-black text-red-600">{stats.critical}</p>
            <p className="text-[0.65rem] font-semibold text-slate-500">Critical CVEs</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-orange-200 shadow-sm px-4 py-3 flex items-center gap-3">
          <div className="rounded-xl bg-orange-100 p-2 flex-shrink-0">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
          </div>
          <div>
            <p className="text-2xl font-black text-orange-600">{stats.high}</p>
            <p className="text-[0.65rem] font-semibold text-slate-500">High CVEs</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 flex items-center gap-3">
          <div className="rounded-xl bg-slate-100 p-2 flex-shrink-0">
            <Monitor className="h-4 w-4 text-slate-600" />
          </div>
          <div>
            <p className="text-2xl font-black text-slate-800">{stats.totalAffected}</p>
            <p className="text-[0.65rem] font-semibold text-slate-500">Total Affected Devices</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm px-4 py-3 flex items-center gap-3">
          <div className="rounded-xl bg-emerald-100 p-2 flex-shrink-0">
            <CheckCircle className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-2xl font-black text-emerald-600">{stats.patchCoverage}%</p>
            <p className="text-[0.65rem] font-semibold text-slate-500">Patch Coverage</p>
          </div>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search CVE ID, software, description…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-8 text-xs text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Severity filter */}
        <div className="relative">
          <Filter className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
          <select
            value={severityFilter}
            onChange={e => setSeverityFilter(e.target.value as typeof severityFilter)}
            className="h-8 appearance-none rounded-lg border border-slate-200 bg-slate-50 pl-7 pr-6 text-xs text-slate-700 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20 cursor-pointer"
          >
            <option value="All">All Severities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
        </div>

        {/* Patch filter */}
        <div className="relative">
          <Filter className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
          <select
            value={patchFilter}
            onChange={e => setPatchFilter(e.target.value as typeof patchFilter)}
            className="h-8 appearance-none rounded-lg border border-slate-200 bg-slate-50 pl-7 pr-6 text-xs text-slate-700 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20 cursor-pointer"
          >
            <option value="All">All Patch Status</option>
            <option value="Patch Available">Patch Available</option>
            <option value="No Patch">No Patch</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {activeSource !== 'all' && (
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${
              activeSource === 'kandji'       ? 'bg-slate-100 border-slate-200 text-slate-700' :
              activeSource === 'manageengine' ? 'bg-lime-50 border-lime-200 text-lime-700' :
              'bg-orange-50 border-orange-200 text-orange-700'
            }`}>
              {MDM_SOURCES.find(s => s.id === activeSource)?.label}
            </span>
          )}
          <span className="text-[0.68rem] font-semibold text-slate-400">
            {filtered.length} CVE{filtered.length !== 1 ? 's' : ''} found
          </span>
        </div>
      </div>

      {/* ── CVE Table ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="text-left border-collapse" style={{ tableLayout: 'fixed', width: vTotal }}>
            <colgroup>
              {VULN_COLS.map(col => (
                <col key={col.key} style={{ width: vw[col.key] }} />
              ))}
            </colgroup>
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className={thClass} style={{ width: vw['cveId'] }}>
                  CVE ID
                  <span
                    className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                    onMouseDown={e => vResize('cveId', e)}
                    onClick={e => e.stopPropagation()}
                  />
                </th>
                <th
                  className={sortableThClass}
                  style={{ width: vw['cvss'] }}
                  onClick={() => handleSort('cvss')}
                >
                  <div className="flex items-center gap-1">
                    CVSS
                    <SortIcon field="cvss" sortField={sortField} sortDir={sortDir} />
                  </div>
                  <span
                    className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                    onMouseDown={e => vResize('cvss', e)}
                    onClick={e => e.stopPropagation()}
                  />
                </th>
                <th className={thClass} style={{ width: vw['severity'] }}>
                  Severity
                  <span
                    className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                    onMouseDown={e => vResize('severity', e)}
                    onClick={e => e.stopPropagation()}
                  />
                </th>
                <th className={thClass} style={{ width: vw['software'] }}>
                  Software
                  <span
                    className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                    onMouseDown={e => vResize('software', e)}
                    onClick={e => e.stopPropagation()}
                  />
                </th>
                <th className={thClass} style={{ width: vw['platform'] }}>
                  Platform
                  <span
                    className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                    onMouseDown={e => vResize('platform', e)}
                    onClick={e => e.stopPropagation()}
                  />
                </th>
                <th
                  className={sortableThClass}
                  style={{ width: vw['affectedDevices'] }}
                  onClick={() => handleSort('affectedDevices')}
                >
                  <div className="flex items-center gap-1">
                    Devices
                    <SortIcon field="affectedDevices" sortField={sortField} sortDir={sortDir} />
                  </div>
                  <span
                    className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                    onMouseDown={e => vResize('affectedDevices', e)}
                    onClick={e => e.stopPropagation()}
                  />
                </th>
                <th
                  className={sortableThClass}
                  style={{ width: vw['published'] }}
                  onClick={() => handleSort('published')}
                >
                  <div className="flex items-center gap-1">
                    Published
                    <SortIcon field="published" sortField={sortField} sortDir={sortDir} />
                  </div>
                  <span
                    className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                    onMouseDown={e => vResize('published', e)}
                    onClick={e => e.stopPropagation()}
                  />
                </th>
                <th className={thClass} style={{ width: vw['patch'] }}>
                  Patch
                  <span
                    className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                    onMouseDown={e => vResize('patch', e)}
                    onClick={e => e.stopPropagation()}
                  />
                </th>
                <th
                  className={sortableThClass}
                  style={{ width: vw['patchDeadline'] }}
                  onClick={() => handleSort('patchDeadline')}
                >
                  <div className="flex items-center gap-1">
                    Deadline
                    <SortIcon field="patchDeadline" sortField={sortField} sortDir={sortDir} />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="rounded-full bg-slate-100 p-4">
                        <ShieldAlert className="h-6 w-6 text-slate-400" />
                      </div>
                      <p className="text-sm font-semibold text-slate-600">No CVEs match your filters</p>
                      <button
                        type="button"
                        onClick={() => { setSearch(''); setSeverityFilter('All'); setPatchFilter('All'); setActiveSource('all') }}
                        className="text-xs text-orange-600 hover:text-orange-700 font-medium underline underline-offset-2"
                      >
                        Clear filters
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map(cve => {
                  const { badge } = cvssColorClasses(cve.cvss)
                  const days = cve.patchDeadline ? daysUntil(cve.patchDeadline) : null
                  const isSelected = selectedCve?.id === cve.id

                  return (
                    <tr
                      key={cve.id}
                      onClick={() => setSelectedCve(isSelected ? null : cve)}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-orange-50' : 'hover:bg-slate-50/70'}`}
                    >
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          className="text-xs font-bold text-orange-700 hover:text-orange-900 font-mono underline underline-offset-2"
                        >
                          {cve.id}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-black ${badge}`}>
                          {cve.cvss.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.62rem] font-bold ${severityClasses(cve.severity)}`}>
                          {cve.severity}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-xs font-medium text-slate-700">{cve.software}</span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <PlatformIcon platform={cve.platform} />
                            <span className="text-xs text-slate-500">{cve.platform}</span>
                          </div>
                          {activeSource === 'all' && (
                            <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[0.55rem] font-bold w-fit ${
                              cve.mdmSource === 'intune'       ? 'bg-orange-50 text-orange-600' :
                              cve.mdmSource === 'kandji'       ? 'bg-slate-100 text-slate-600'  :
                              cve.mdmSource === 'manageengine' ? 'bg-lime-50 text-lime-700'     :
                              'bg-slate-50 text-slate-400'
                            }`}>
                              {cve.mdmSource === 'intune' ? 'Intune' : cve.mdmSource === 'kandji' ? 'Kandji' : cve.mdmSource === 'manageengine' ? 'ManageEngine' : 'All Sources'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-xs font-bold ${cve.affectedDevices >= 50 ? 'text-red-600' : cve.affectedDevices >= 20 ? 'text-amber-600' : 'text-slate-700'}`}>
                          {cve.affectedDevices}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-xs text-slate-500">{formatDate(cve.published)}</span>
                      </td>
                      <td className="px-3 py-3">
                        {cve.patchAvailable
                          ? <div className="flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5 text-emerald-500" /><span className="text-[0.65rem] font-medium text-emerald-700">Available</span></div>
                          : <div className="flex items-center gap-1"><XCircle className="h-3.5 w-3.5 text-red-400" /><span className="text-[0.65rem] font-medium text-red-600">No Patch</span></div>
                        }
                      </td>
                      <td className="px-3 py-3">
                        {cve.patchDeadline ? (
                          <div className="flex items-center gap-1">
                            <Clock className={`h-3 w-3 flex-shrink-0 ${days !== null && days < 0 ? 'text-red-500' : days !== null && days < 7 ? 'text-amber-500' : 'text-slate-400'}`} />
                            <span className={`text-[0.65rem] font-semibold ${days !== null && days < 0 ? 'text-red-600' : days !== null && days < 7 ? 'text-amber-600' : 'text-slate-500'}`}>
                              {days !== null && days < 0 ? `${Math.abs(days)}d overdue` : days !== null ? `${days}d` : formatDate(cve.patchDeadline)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[0.65rem] text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Detail Panel overlay backdrop ── */}
      {selectedCve && (
        <>
          <div
            className="fixed inset-0 z-30 bg-slate-900/20 backdrop-blur-[1px]"
            onClick={() => setSelectedCve(null)}
          />
          <DetailPanel cve={selectedCve} onClose={() => setSelectedCve(null)} />
        </>
      )}
    </div>
  )
}
