import { useState } from 'react'
import { usePagination } from '../hooks/usePagination'
import { Pagination } from '../components/ui/Pagination'
import {
  X,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Activity,
  Radar,
  Clock,
  Search,
  Filter,
  ChevronDown,
  Cpu,
  Globe,
  Ban,
  Zap,
  Eye,
  FileWarning,
  Network,
  UserX,
  RefreshCw,
  CheckCircle2,
  XCircle,
  CircleDot,
  Flame,
  Bug,
  Terminal,
  Server,
  Laptop2,
} from 'lucide-react'

const PAGE_SIZE = 50

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity = 'Critical' | 'High' | 'Medium' | 'Low'
type DetectionStatus = 'New' | 'Investigating' | 'Contained' | 'Resolved' | 'False Positive'
type IncidentStatus = 'Open' | 'In Progress' | 'Pending' | 'Resolved' | 'Closed'
type ResponseStatus = 'Success' | 'Failed' | 'Pending' | 'In Progress'

interface Detection {
  id: string
  name: string
  endpoint: string
  user: string
  technique: string
  mitreTactic: string
  severity: Severity
  source: string
  timestamp: string
  status: DetectionStatus
  description: string
  indicators: string[]
  affectedProcess: string
  commandLine: string
  parentProcess: string
  filePath: string
  hash: string
  remoteIp?: string
}

interface Incident {
  id: string
  title: string
  severity: Severity
  assignedTo: string
  detectionCount: number
  endpointCount: number
  created: string
  updated: string
  status: IncidentStatus
  summary: string
  relatedDetections: string[]
  timeline: { time: string; event: string; actor: string }[]
  notes: string
  tags: string[]
}

interface ResponseAction {
  id: string
  action: string
  target: string
  endpoint: string
  initiatedBy: string
  timestamp: string
  status: ResponseStatus
  duration: string
  details: string
  justification: string
}

interface InvestigationEvent {
  time: string
  type: 'Process' | 'Network' | 'File' | 'Registry' | 'Auth' | 'Alert'
  description: string
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Info'
  process?: string
  details: string
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const DETECTIONS: Detection[] = [
  {
    id: 'DET-0091',
    name: 'Credential Dumping via LSASS',
    endpoint: 'WIN-CORP-0042',
    user: 'james.wong',
    technique: 'T1003.001',
    mitreTactic: 'Credential Access',
    severity: 'Critical',
    source: 'CrowdStrike',
    timestamp: '2026-06-06 09:14:22',
    status: 'Investigating',
    description: 'Detected attempt to dump LSASS memory using a known credential harvesting tool. Process injection was observed targeting lsass.exe.',
    indicators: ['mimikatz.exe detected in memory', 'OpenProcess(PROCESS_VM_READ) on lsass.exe', 'sekurlsa::logonpasswords command detected'],
    affectedProcess: 'mimikatz.exe (PID 4892)',
    commandLine: 'mimikatz.exe "sekurlsa::logonpasswords" exit',
    parentProcess: 'cmd.exe (PID 4880)',
    filePath: 'C:\\Users\\james.wong\\AppData\\Local\\Temp\\mimikatz.exe',
    hash: 'a3b7c9d1e5f2a8b4c6d0e3f1a9b5c7d2',
    remoteIp: undefined,
  },
  {
    id: 'DET-0090',
    name: 'Lateral Movement via SMB',
    endpoint: 'WIN-DEV-0019',
    user: 'sarah.chen',
    technique: 'T1021.002',
    mitreTactic: 'Lateral Movement',
    severity: 'High',
    source: 'Microsoft Defender',
    timestamp: '2026-06-06 08:47:05',
    status: 'New',
    description: 'Suspicious SMB connection attempts detected from workstation to multiple internal servers. Pattern consistent with lateral movement via admin shares.',
    indicators: ['net use \\\\server\\ADMIN$ with stolen credentials', 'PsExec execution on remote host', 'WMI remote execution detected'],
    affectedProcess: 'PsExec.exe (PID 3201)',
    commandLine: 'psexec \\\\10.0.1.45 -u admin -p [REDACTED] cmd.exe',
    parentProcess: 'explorer.exe (PID 1204)',
    filePath: 'C:\\Windows\\Temp\\PsExec.exe',
    hash: 'b4c8d2e6f3a1b5c9d0e4f2a8b6c1d5e3',
    remoteIp: '10.0.1.45',
  },
  {
    id: 'DET-0089',
    name: 'Persistence via Registry Run Key',
    endpoint: 'MAC-HR-0033',
    user: 'emily.foster',
    technique: 'T1547.001',
    mitreTactic: 'Persistence',
    severity: 'Medium',
    source: 'Kandji',
    timestamp: '2026-06-06 07:31:18',
    status: 'Contained',
    description: 'Modification of HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run detected. New registry key added pointing to a suspicious executable in temp directory.',
    indicators: ['Registry write to Run key', 'Unsigned executable in %TEMP%', 'Base64-encoded PowerShell in registry value'],
    affectedProcess: 'powershell.exe (PID 2891)',
    commandLine: 'powershell.exe -EncodedCommand JAB...',
    parentProcess: 'winword.exe (PID 2840)',
    filePath: 'C:\\Users\\emily.foster\\AppData\\Roaming\\svchost32.exe',
    hash: 'c5d9e3f7a2b6c0d4e8f1a3b7c2d6e0f4',
  },
  {
    id: 'DET-0088',
    name: 'Ransomware Behaviour Detected',
    endpoint: 'WIN-FIN-0007',
    user: 'david.kim',
    technique: 'T1486',
    mitreTactic: 'Impact',
    severity: 'Critical',
    source: 'CrowdStrike',
    timestamp: '2026-06-05 22:15:44',
    status: 'Resolved',
    description: 'Mass file encryption behaviour detected. Rapid creation of .encrypted extension files with shadow copy deletion commands observed.',
    indicators: ['vssadmin delete shadows /all', 'Mass file rename with .encrypted extension', 'ransom note dropped: README.txt'],
    affectedProcess: 'encrypt_srv.exe (PID 5102)',
    commandLine: 'encrypt_srv.exe --target C:\\ --ext .encrypted',
    parentProcess: 'explorer.exe (PID 1204)',
    filePath: 'C:\\Windows\\System32\\encrypt_srv.exe',
    hash: 'd6e0f4a8b3c7d1e5f9a2b4c8d3e7f0a5',
  },
  {
    id: 'DET-0087',
    name: 'Suspicious PowerShell Execution',
    endpoint: 'WIN-CORP-0055',
    user: 'lisa.patel',
    technique: 'T1059.001',
    mitreTactic: 'Execution',
    severity: 'High',
    source: 'Microsoft Defender',
    timestamp: '2026-06-05 18:03:27',
    status: 'False Positive',
    description: 'PowerShell script executed with bypass execution policy and encoded command. Script downloaded additional content from external URL.',
    indicators: ['PowerShell -ExecutionPolicy Bypass', 'Invoke-WebRequest to external IP', 'IEX (Invoke-Expression) usage'],
    affectedProcess: 'powershell.exe (PID 7203)',
    commandLine: 'powershell.exe -ExecutionPolicy Bypass -EncodedCommand JABj...',
    parentProcess: 'wmiprvse.exe (PID 980)',
    filePath: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    hash: 'e7f1a5b9c4d8e2f6a0b3c5d9e4f8a1b7',
    remoteIp: '185.220.101.47',
  },
  {
    id: 'DET-0086',
    name: 'DNS Tunneling Activity',
    endpoint: 'MAC-ENG-0011',
    user: 'ryan.o\'brien',
    technique: 'T1071.004',
    mitreTactic: 'Command and Control',
    severity: 'Medium',
    source: 'Kandji',
    timestamp: '2026-06-05 14:22:09',
    status: 'Investigating',
    description: 'Abnormally high volume of DNS TXT queries with unusually long subdomains detected. Pattern consistent with DNS tunneling C2 communication.',
    indicators: ['500+ DNS TXT queries in 1 hour', 'Subdomain length >60 chars', 'Queries to suspicious domain: update-svc.net'],
    affectedProcess: 'dnscat.exe (PID 3445)',
    commandLine: 'dnscat --dns server=update-svc.net',
    parentProcess: 'bash (PID 3440)',
    filePath: '/tmp/.dnscat',
    hash: 'f8a2b6c0d4e8f3a7b1c5d9e3f7a0b4c8',
    remoteIp: '92.118.160.11',
  },
]

const INCIDENTS: Incident[] = [
  {
    id: 'INC-0042',
    title: 'Active Ransomware Campaign — Finance Segment',
    severity: 'Critical',
    assignedTo: 'Security Team',
    detectionCount: 4,
    endpointCount: 3,
    created: '2026-06-05 22:18:00',
    updated: '2026-06-06 09:20:00',
    status: 'In Progress',
    summary: 'A ransomware campaign has been detected affecting the Finance network segment. Three endpoints have been isolated. Initial vector appears to be a phishing email with a malicious macro-enabled document.',
    relatedDetections: ['DET-0088', 'DET-0087', 'DET-0086', 'DET-0085'],
    timeline: [
      { time: '22:15', event: 'Initial detection: DET-0088 triggered on WIN-FIN-0007', actor: 'CrowdStrike' },
      { time: '22:18', event: 'Incident INC-0042 created and escalated to Security Team', actor: 'System' },
      { time: '22:21', event: 'Device WIN-FIN-0007 automatically isolated from network', actor: 'Automated Response' },
      { time: '22:35', event: 'Two additional endpoints identified in same subnet', actor: 'james.wong' },
      { time: '23:00', event: 'All three endpoints isolated; containment confirmed', actor: 'Security Team' },
    ],
    notes: 'Working with endpoint owners to recover data from backups. CISO notified. Forensic image taken of WIN-FIN-0007.',
    tags: ['ransomware', 'finance', 'isolated', 'high-priority'],
  },
  {
    id: 'INC-0041',
    title: 'Credential Harvesting — Engineering Workstations',
    severity: 'High',
    assignedTo: 'james.wong',
    detectionCount: 2,
    endpointCount: 2,
    created: '2026-06-06 09:15:00',
    updated: '2026-06-06 09:55:00',
    status: 'Open',
    summary: 'Credential dumping attempts detected on two engineering workstations. LSASS memory access observed along with lateral movement attempts using harvested credentials.',
    relatedDetections: ['DET-0091', 'DET-0090'],
    timeline: [
      { time: '09:14', event: 'DET-0091 triggered: LSASS dump on WIN-CORP-0042', actor: 'CrowdStrike' },
      { time: '09:15', event: 'Incident INC-0041 auto-created', actor: 'System' },
      { time: '09:47', event: 'DET-0090 correlated: lateral movement from WIN-DEV-0019', actor: 'System' },
      { time: '09:55', event: 'Assigned to james.wong for investigation', actor: 'Security Team' },
    ],
    notes: 'Possible insider threat or compromised developer account. AD password reset initiated for affected accounts.',
    tags: ['credential-theft', 'lateral-movement', 'engineering'],
  },
  {
    id: 'INC-0040',
    title: 'Persistence Mechanism — HR Department',
    severity: 'Medium',
    assignedTo: 'sarah.chen',
    detectionCount: 1,
    endpointCount: 1,
    created: '2026-06-06 07:32:00',
    updated: '2026-06-06 08:10:00',
    status: 'Pending',
    summary: 'A persistence mechanism via registry run key was detected on an HR workstation. The device has been contained and the registry key removed. Awaiting confirmation of clean state.',
    relatedDetections: ['DET-0089'],
    timeline: [
      { time: '07:31', event: 'DET-0089 triggered on MAC-HR-0033', actor: 'Kandji' },
      { time: '07:32', event: 'Incident INC-0040 created', actor: 'System' },
      { time: '07:45', event: 'Registry key removed, suspicious binary quarantined', actor: 'Automated Response' },
      { time: '08:10', event: 'Endpoint scan initiated, awaiting results', actor: 'sarah.chen' },
    ],
    notes: 'Initial vector appears to be malicious Word document from phishing email. User training recommended.',
    tags: ['persistence', 'phishing', 'hr'],
  },
]

const RESPONSE_HISTORY: ResponseAction[] = [
  {
    id: 'RSP-0201',
    action: 'Isolate Device',
    target: 'WIN-FIN-0007',
    endpoint: 'WIN-FIN-0007',
    initiatedBy: 'Automated Response',
    timestamp: '2026-06-05 22:21:00',
    status: 'Success',
    duration: '3s',
    details: 'Device fully isolated from all network segments. Management channel retained for investigation.',
    justification: 'Automatic response triggered by Critical ransomware detection DET-0088.',
  },
  {
    id: 'RSP-0200',
    action: 'Quarantine File',
    target: 'C:\\Windows\\System32\\encrypt_srv.exe',
    endpoint: 'WIN-FIN-0007',
    initiatedBy: 'james.wong',
    timestamp: '2026-06-05 22:22:00',
    status: 'Success',
    duration: '1s',
    details: 'File quarantined successfully. Hash: d6e0f4a8b3c7d1e5f9a2b4c8d3e7f0a5.',
    justification: 'Primary ransomware executable. Quarantined to halt encryption.',
  },
  {
    id: 'RSP-0199',
    action: 'Block Hash',
    target: 'd6e0f4a8b3c7d1e5f9a2b4c8d3e7f0a5',
    endpoint: 'All Endpoints',
    initiatedBy: 'james.wong',
    timestamp: '2026-06-05 22:25:00',
    status: 'Success',
    duration: '12s',
    details: 'Hash blocked across all 847 managed endpoints via CrowdStrike policy update.',
    justification: 'Prevent re-execution of ransomware binary on any other endpoint.',
  },
  {
    id: 'RSP-0198',
    action: 'Block IP',
    target: '185.220.101.47',
    endpoint: 'Perimeter Firewall',
    initiatedBy: 'Automated Response',
    timestamp: '2026-06-05 18:04:00',
    status: 'Success',
    duration: '5s',
    details: 'IP 185.220.101.47 blocked on perimeter firewall and all endpoint firewall policies.',
    justification: 'Malicious C2 IP identified in DET-0087 PowerShell execution.',
  },
  {
    id: 'RSP-0197',
    action: 'Kill Process',
    target: 'dnscat.exe (PID 3445)',
    endpoint: 'MAC-ENG-0011',
    initiatedBy: 'sarah.chen',
    timestamp: '2026-06-05 14:30:00',
    status: 'Success',
    duration: '1s',
    details: 'Process dnscat.exe (PID 3445) killed. C2 channel severed.',
    justification: 'DNS tunneling C2 communication active. Immediate termination required.',
  },
  {
    id: 'RSP-0196',
    action: 'Disable User Session',
    target: 'david.kim',
    endpoint: 'WIN-FIN-0007',
    initiatedBy: 'Security Team',
    timestamp: '2026-06-05 22:20:00',
    status: 'Success',
    duration: '2s',
    details: 'Active session terminated. Account temporarily suspended pending investigation.',
    justification: 'Ransomware behaviour originating from david.kim session.',
  },
  {
    id: 'RSP-0195',
    action: 'Restore Device',
    target: 'WIN-FIN-0008',
    endpoint: 'WIN-FIN-0008',
    initiatedBy: 'Security Team',
    timestamp: '2026-06-06 07:00:00',
    status: 'In Progress',
    duration: '—',
    details: 'Restoration from last clean backup (2026-06-04). Estimated completion: 30 minutes.',
    justification: 'Device confirmed clean after forensic analysis. Restoring to production.',
  },
]

const INVESTIGATION_TIMELINE: InvestigationEvent[] = [
  { time: '22:10:02', type: 'Auth', severity: 'Medium', description: 'User david.kim authenticated via RDP from unusual IP', process: 'svchost.exe', details: 'Source IP: 10.0.2.88 (not a known workstation). First login from this IP.' },
  { time: '22:11:15', type: 'Process', severity: 'High', description: 'cmd.exe spawned by winword.exe', process: 'winword.exe → cmd.exe', details: 'Suspicious parent-child relationship. Word document likely contained malicious macro.' },
  { time: '22:11:18', type: 'File', severity: 'High', description: 'Dropper written to temp directory', process: 'cmd.exe', details: 'File: C:\\Users\\david.kim\\AppData\\Local\\Temp\\encrypt_srv.exe. Unsigned binary.' },
  { time: '22:11:22', type: 'Process', severity: 'Critical', description: 'encrypt_srv.exe executed', process: 'cmd.exe → encrypt_srv.exe', details: 'Arguments: --target C:\\ --ext .encrypted. Process elevated to SYSTEM.' },
  { time: '22:12:01', type: 'Registry', severity: 'High', description: 'Shadow copy deletion command executed', process: 'encrypt_srv.exe', details: 'vssadmin delete shadows /all /quiet — prevents recovery via VSS.' },
  { time: '22:12:05', type: 'File', severity: 'Critical', description: 'Mass file encryption begun — 847 files in 12s', process: 'encrypt_srv.exe', details: 'Files renamed with .encrypted extension across Documents, Desktop, Downloads.' },
  { time: '22:14:55', type: 'Alert', severity: 'Critical', description: 'CrowdStrike detection DET-0088 triggered', process: 'CrowdStrike Falcon', details: 'Behaviour-based detection matched T1486 Impact/Ransomware pattern.' },
  { time: '22:15:44', type: 'Network', severity: 'High', description: 'Outbound connection attempt to C2 server', process: 'encrypt_srv.exe', details: 'TCP 443 to 185.220.101.47. Connection blocked by firewall policy.' },
  { time: '22:21:00', type: 'Alert', severity: 'Info', description: 'Device isolation enforced by automated response RSP-0201', process: 'CrowdStrike Falcon', details: 'All network interfaces blocked. Management channel retained.' },
]

// ─── Severity helpers ─────────────────────────────────────────────────────────

function severityBadge(s: Severity) {
  const map: Record<Severity, string> = {
    Critical: 'bg-red-100 text-red-700 border border-red-200',
    High:     'bg-orange-100 text-orange-700 border border-orange-200',
    Medium:   'bg-amber-100 text-amber-700 border border-amber-200',
    Low:      'bg-emerald-100 text-emerald-700 border border-emerald-200',
  }
  return map[s]
}

function detectionStatusBadge(s: DetectionStatus) {
  const map: Record<DetectionStatus, string> = {
    New:             'bg-blue-100 text-blue-700 border border-blue-200',
    Investigating:   'bg-purple-100 text-purple-700 border border-purple-200',
    Contained:       'bg-amber-100 text-amber-700 border border-amber-200',
    Resolved:        'bg-emerald-100 text-emerald-700 border border-emerald-200',
    'False Positive':'bg-slate-100 text-slate-600 border border-slate-200',
  }
  return map[s]
}

function incidentStatusBadge(s: IncidentStatus) {
  const map: Record<IncidentStatus, string> = {
    Open:        'bg-red-100 text-red-700 border border-red-200',
    'In Progress':'bg-purple-100 text-purple-700 border border-purple-200',
    Pending:     'bg-amber-100 text-amber-700 border border-amber-200',
    Resolved:    'bg-emerald-100 text-emerald-700 border border-emerald-200',
    Closed:      'bg-slate-100 text-slate-600 border border-slate-200',
  }
  return map[s]
}

function responseStatusBadge(s: ResponseStatus) {
  const map: Record<ResponseStatus, string> = {
    Success:    'bg-emerald-100 text-emerald-700 border border-emerald-200',
    Failed:     'bg-red-100 text-red-700 border border-red-200',
    Pending:    'bg-amber-100 text-amber-700 border border-amber-200',
    'In Progress':'bg-blue-100 text-blue-700 border border-blue-200',
  }
  return map[s]
}

// ─── Close-only detail modal ──────────────────────────────────────────────────

function DetailModal({ open, title, onClose, children }: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20 overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-4 flex-shrink-0">
          <h2 className="text-sm font-semibold text-slate-900 leading-tight truncate">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 text-sm text-slate-700">
          {children}
        </div>
      </div>
    </div>
  )
}

// ─── Detection detail content ─────────────────────────────────────────────────

function DetectionDetail({ d }: { d: Detection }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 items-center">
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${severityBadge(d.severity)}`}>{d.severity}</span>
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${detectionStatusBadge(d.status)}`}>{d.status}</span>
        <span className="text-xs text-slate-500">{d.source}</span>
        <span className="ml-auto text-xs text-slate-400 font-mono">{d.timestamp}</span>
      </div>

      <p className="text-sm text-slate-700 leading-relaxed">{d.description}</p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Endpoint</p>
          <p className="text-sm font-mono text-slate-900">{d.endpoint}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">User</p>
          <p className="text-sm font-mono text-slate-900">{d.user}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">MITRE Technique</p>
          <p className="text-sm font-mono text-slate-900">{d.technique}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Tactic</p>
          <p className="text-sm text-slate-900">{d.mitreTactic}</p>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Process Context</p>
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2 font-mono text-xs text-slate-800">
          <div><span className="text-slate-400">parent  </span>{d.parentProcess}</div>
          <div><span className="text-slate-400">process </span>{d.affectedProcess}</div>
          <div><span className="text-slate-400">cmdline </span><span className="text-red-600 break-all">{d.commandLine}</span></div>
          <div><span className="text-slate-400">path    </span>{d.filePath}</div>
          <div><span className="text-slate-400">hash    </span>{d.hash}</div>
          {d.remoteIp && <div><span className="text-slate-400">remote  </span>{d.remoteIp}</div>}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Indicators of Compromise</p>
        <ul className="space-y-1">
          {d.indicators.map((ind, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
              <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-red-400 flex-shrink-0" />
              {ind}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ─── Incident detail content ──────────────────────────────────────────────────

function IncidentDetail({ inc }: { inc: Incident }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 items-center">
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${severityBadge(inc.severity)}`}>{inc.severity}</span>
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${incidentStatusBadge(inc.status)}`}>{inc.status}</span>
        <div className="flex gap-1 flex-wrap">
          {inc.tags.map(t => <span key={t} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{t}</span>)}
        </div>
      </div>

      <p className="text-sm text-slate-700 leading-relaxed">{inc.summary}</p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Assigned To</p>
          <p className="text-sm text-slate-900">{inc.assignedTo}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Detections</p>
          <p className="text-sm text-slate-900">{inc.detectionCount} detection{inc.detectionCount !== 1 ? 's' : ''} · {inc.endpointCount} endpoint{inc.endpointCount !== 1 ? 's' : ''}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Created</p>
          <p className="text-sm font-mono text-slate-900">{inc.created}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Last Updated</p>
          <p className="text-sm font-mono text-slate-900">{inc.updated}</p>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Timeline</p>
        <div className="relative pl-4 space-y-3">
          <div className="absolute left-1.5 top-2 bottom-2 w-px bg-slate-200" />
          {inc.timeline.map((ev, i) => (
            <div key={i} className="flex gap-3 items-start">
              <span className="relative z-10 mt-1 h-2.5 w-2.5 rounded-full bg-orange-400 flex-shrink-0 ring-2 ring-white" />
              <div className="min-w-0">
                <p className="text-xs text-slate-700">{ev.event}</p>
                <p className="text-[0.65rem] text-slate-400 mt-0.5">{ev.time} · {ev.actor}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {inc.notes && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Notes</p>
          <p className="text-xs text-slate-700 leading-relaxed">{inc.notes}</p>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Related Detections</p>
        <div className="flex flex-wrap gap-1.5">
          {inc.relatedDetections.map(id => (
            <span key={id} className="text-xs font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded">{id}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Response action detail content ──────────────────────────────────────────

function ResponseDetail({ rsp }: { rsp: ResponseAction }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 items-center">
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${responseStatusBadge(rsp.status)}`}>{rsp.status}</span>
        <span className="text-xs text-slate-500">{rsp.timestamp}</span>
        <span className="ml-auto text-xs text-slate-400">Duration: {rsp.duration}</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Action</p>
          <p className="text-sm font-semibold text-slate-900">{rsp.action}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Target</p>
          <p className="text-sm font-mono text-slate-900 break-all">{rsp.target}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Endpoint</p>
          <p className="text-sm font-mono text-slate-900">{rsp.endpoint}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Initiated By</p>
          <p className="text-sm text-slate-900">{rsp.initiatedBy}</p>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Justification</p>
        <p className="text-xs text-slate-700 leading-relaxed">{rsp.justification}</p>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Execution Details</p>
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs text-slate-800 leading-relaxed">{rsp.details}</div>
      </div>
    </div>
  )
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, color }: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  color: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-slate-500 leading-snug">{label}</p>
        <div className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-900 leading-none">{value}</p>
      {sub && <p className="text-[0.65rem] text-slate-500">{sub}</p>}
    </div>
  )
}

// ─── Tab button ───────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'detections' | 'incidents' | 'investigation' | 'response'

function TabBtn({ tab, active, label, count, onClick }: {
  tab: Tab; active: Tab; label: string; count?: number; onClick: () => void
}) {
  const isActive = tab === active
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition whitespace-nowrap ${
        isActive
          ? 'bg-slate-900 text-white shadow-sm'
          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
      }`}
    >
      {label}
      {count !== undefined && (
        <span className={`rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold ${
          isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
        }`}>{count}</span>
      )}
    </button>
  )
}

// ─── Filter row helper ────────────────────────────────────────────────────────

function FilterSelect({ value, onChange, options, label }: {
  value: string; onChange: (v: string) => void; options: string[]; label: string
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-300 cursor-pointer"
      >
        <option value="">{label}: All</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
    </div>
  )
}

// ─── Dashboard tab ────────────────────────────────────────────────────────────

function EDRDashboard() {
  const activeCritical = DETECTIONS.filter(d => d.severity === 'Critical' && d.status !== 'Resolved' && d.status !== 'False Positive').length
  const isolated = RESPONSE_HISTORY.filter(r => r.action === 'Isolate Device' && r.status === 'Success').length
  const openIncidents = INCIDENTS.filter(i => i.status === 'Open' || i.status === 'In Progress').length

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard label="Active Incidents"           value={openIncidents}  sub="2 escalated"          icon={Flame}       color="bg-red-100 text-red-600" />
        <KpiCard label="Under Investigation"        value={2}              sub="endpoints"             icon={Eye}         color="bg-purple-100 text-purple-600" />
        <KpiCard label="Active Detections"          value={activeCritical} sub={`${activeCritical} critical`} icon={ShieldAlert} color="bg-orange-100 text-orange-600" />
        <KpiCard label="Isolated Devices"           value={isolated}       sub="network isolated"      icon={Ban}         color="bg-amber-100 text-amber-700" />
        <KpiCard label="Auto Responses"             value={4}              sub="last 24h"              icon={Zap}         color="bg-blue-100 text-blue-600" />
        <KpiCard label="MTTR"                       value="14m"            sub="mean time to respond"  icon={Clock}       color="bg-emerald-100 text-emerald-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Detections by Severity</h3>
          <div className="space-y-3">
            {(['Critical', 'High', 'Medium', 'Low'] as Severity[]).map(s => {
              const count = DETECTIONS.filter(d => d.severity === s).length
              const pct = Math.round((count / DETECTIONS.length) * 100)
              const barColor: Record<Severity, string> = {
                Critical: 'bg-red-500', High: 'bg-orange-500', Medium: 'bg-amber-500', Low: 'bg-emerald-500',
              }
              return (
                <div key={s} className="flex items-center gap-3">
                  <span className="w-16 text-xs font-semibold text-slate-700 flex-shrink-0">{s}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded-full ${barColor[s]} transition-all duration-500`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-4 text-xs text-slate-500 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Detection Status Overview</h3>
          <div className="space-y-3">
            {(['New', 'Investigating', 'Contained', 'Resolved', 'False Positive'] as DetectionStatus[]).map(s => {
              const count = DETECTIONS.filter(d => d.status === s).length
              const pct = Math.round((count / DETECTIONS.length) * 100)
              return (
                <div key={s} className="flex items-center gap-3">
                  <span className="w-28 text-xs font-semibold text-slate-700 flex-shrink-0">{s}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-slate-600 transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-4 text-xs text-slate-500 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Top MITRE Tactics</h3>
          <div className="space-y-2">
            {[
              { tactic: 'Credential Access', count: 1, color: 'bg-red-400' },
              { tactic: 'Lateral Movement',  count: 1, color: 'bg-orange-400' },
              { tactic: 'Impact',            count: 1, color: 'bg-red-500' },
              { tactic: 'Execution',         count: 1, color: 'bg-amber-500' },
              { tactic: 'Persistence',       count: 1, color: 'bg-purple-400' },
              { tactic: 'Command & Control', count: 1, color: 'bg-blue-400' },
            ].map(row => (
              <div key={row.tactic} className="flex items-center gap-3">
                <span className={`h-2 w-2 rounded-full flex-shrink-0 ${row.color}`} />
                <span className="flex-1 text-xs text-slate-700">{row.tactic}</span>
                <span className="text-xs font-semibold text-slate-900">{row.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Response Actions (Last 24h)</h3>
          <div className="space-y-2">
            {[
              { action: 'Isolate Device',       count: 2, icon: Ban },
              { action: 'Quarantine File',      count: 1, icon: FileWarning },
              { action: 'Block Hash',           count: 1, icon: Bug },
              { action: 'Block IP',             count: 1, icon: Globe },
              { action: 'Kill Process',         count: 1, icon: Terminal },
              { action: 'Disable User Session', count: 1, icon: UserX },
            ].map(row => (
              <div key={row.action} className="flex items-center gap-3">
                <row.icon className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                <span className="flex-1 text-xs text-slate-700">{row.action}</span>
                <span className="text-xs font-semibold text-slate-900">{row.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Detections tab ───────────────────────────────────────────────────────────

function DetectionsTab() {
  const [search, setSearch] = useState('')
  const [severity, setSeverity] = useState('')
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState<Detection | null>(null)

  const filtered = DETECTIONS.filter(d => {
    const q = search.toLowerCase()
    if (q && !d.name.toLowerCase().includes(q) && !d.endpoint.toLowerCase().includes(q) && !d.id.toLowerCase().includes(q)) return false
    if (severity && d.severity !== severity) return false
    if (status && d.status !== status) return false
    return true
  })

  const { page, setPage, totalPages, paginated } = usePagination(filtered, PAGE_SIZE)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search detections..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
        </div>
        <FilterSelect value={severity} onChange={setSeverity} options={['Critical','High','Medium','Low']} label="Severity" />
        <FilterSelect value={status} onChange={setStatus} options={['New','Investigating','Contained','Resolved','False Positive']} label="Status" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                {['ID', 'Detection', 'Endpoint', 'User', 'Technique', 'Severity', 'Source', 'Timestamp', 'Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map((d, i) => (
                <tr
                  key={d.id}
                  onClick={() => setSelected(d)}
                  className={`border-b border-slate-50 cursor-pointer hover:bg-slate-50 transition ${i % 2 === 0 ? '' : 'bg-slate-50/40'}`}
                >
                  <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">{d.id}</td>
                  <td className="px-4 py-3 font-medium text-slate-900 max-w-[180px] truncate">{d.name}</td>
                  <td className="px-4 py-3 font-mono text-slate-700 whitespace-nowrap">{d.endpoint}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{d.user}</td>
                  <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">{d.technique}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${severityBadge(d.severity)}`}>{d.severity}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{d.source}</td>
                  <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">{d.timestamp}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${detectionStatusBadge(d.status)}`}>{d.status}</span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No detections match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage}
          totalItems={filtered.length} pageSize={PAGE_SIZE} itemLabel="detection" />
      </div>

      <DetailModal open={!!selected} title={`Detection ${selected?.id}: ${selected?.name ?? ''}`} onClose={() => setSelected(null)}>
        {selected && <DetectionDetail d={selected} />}
      </DetailModal>
    </div>
  )
}

// ─── Incidents tab ────────────────────────────────────────────────────────────

function IncidentsTab() {
  const [search, setSearch] = useState('')
  const [severity, setSeverity] = useState('')
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState<Incident | null>(null)

  const filtered = INCIDENTS.filter(inc => {
    const q = search.toLowerCase()
    if (q && !inc.title.toLowerCase().includes(q) && !inc.id.toLowerCase().includes(q)) return false
    if (severity && inc.severity !== severity) return false
    if (status && inc.status !== status) return false
    return true
  })

  const { page, setPage, totalPages, paginated } = usePagination(filtered, PAGE_SIZE)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search incidents..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
        </div>
        <FilterSelect value={severity} onChange={setSeverity} options={['Critical','High','Medium','Low']} label="Severity" />
        <FilterSelect value={status} onChange={setStatus} options={['Open','In Progress','Pending','Resolved','Closed']} label="Status" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                {['ID', 'Title', 'Severity', 'Assigned To', 'Detections', 'Endpoints', 'Created', 'Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map((inc, i) => (
                <tr
                  key={inc.id}
                  onClick={() => setSelected(inc)}
                  className={`border-b border-slate-50 cursor-pointer hover:bg-slate-50 transition ${i % 2 === 0 ? '' : 'bg-slate-50/40'}`}
                >
                  <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">{inc.id}</td>
                  <td className="px-4 py-3 font-medium text-slate-900 max-w-[220px] truncate">{inc.title}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${severityBadge(inc.severity)}`}>{inc.severity}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{inc.assignedTo}</td>
                  <td className="px-4 py-3 text-slate-700 text-center">{inc.detectionCount}</td>
                  <td className="px-4 py-3 text-slate-700 text-center">{inc.endpointCount}</td>
                  <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">{inc.created}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${incidentStatusBadge(inc.status)}`}>{inc.status}</span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No incidents match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage}
          totalItems={filtered.length} pageSize={PAGE_SIZE} itemLabel="incident" />
      </div>

      <DetailModal open={!!selected} title={`Incident ${selected?.id}: ${selected?.title ?? ''}`} onClose={() => setSelected(null)}>
        {selected && <IncidentDetail inc={selected} />}
      </DetailModal>
    </div>
  )
}

// ─── Investigation tab ────────────────────────────────────────────────────────

function InvestigationTab() {
  const [selectedEvent, setSelectedEvent] = useState<InvestigationEvent | null>(null)

  const typeIcon: Record<InvestigationEvent['type'], React.ElementType> = {
    Process:  Cpu,
    Network:  Network,
    File:     FileWarning,
    Registry: Server,
    Auth:     ShieldCheck,
    Alert:    ShieldAlert,
  }

  const typeColor: Record<InvestigationEvent['type'], string> = {
    Process:  'bg-purple-100 text-purple-600',
    Network:  'bg-blue-100 text-blue-600',
    File:     'bg-amber-100 text-amber-700',
    Registry: 'bg-slate-100 text-slate-600',
    Auth:     'bg-emerald-100 text-emerald-600',
    Alert:    'bg-red-100 text-red-600',
  }

  const severityDot: Record<string, string> = {
    Critical: 'bg-red-500',
    High:     'bg-orange-500',
    Medium:   'bg-amber-500',
    Low:      'bg-emerald-500',
    Info:     'bg-slate-400',
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Attack Timeline — INC-0042</h3>
            <span className="text-xs text-slate-500">WIN-FIN-0007 · 2026-06-05</span>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-xs text-slate-500 mb-4">Click any event for full details.</p>
            {INVESTIGATION_TIMELINE.map((ev, i) => {
              const Icon = typeIcon[ev.type]
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedEvent(ev)}
                  className="w-full flex items-start gap-3 text-left rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 hover:bg-slate-100 hover:border-orange-200 transition"
                >
                  <div className={`mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-lg ${typeColor[ev.type]}`}>
                    <Icon className="h-3 w-3" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-slate-900 leading-snug">{ev.description}</p>
                      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${severityDot[ev.severity]}`} />
                    </div>
                    {ev.process && <p className="text-[0.65rem] font-mono text-slate-500 mt-0.5">{ev.process}</p>}
                  </div>
                  <span className="text-[0.65rem] font-mono text-slate-400 flex-shrink-0 mt-0.5">{ev.time}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Device Context</h3>
            <dl className="space-y-2 text-xs">
              {[
                { label: 'Endpoint',  value: 'WIN-FIN-0007' },
                { label: 'User',      value: 'david.kim' },
                { label: 'OS',        value: 'Windows 11 22H2' },
                { label: 'Source',    value: 'Microsoft Intune' },
                { label: 'Status',    value: 'Isolated' },
                { label: 'Incident',  value: 'INC-0042' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between gap-2">
                  <dt className="text-slate-500 flex-shrink-0">{label}</dt>
                  <dd className="font-mono text-slate-800 text-right truncate">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Threat Intelligence</h3>
            <div className="space-y-3 text-xs">
              <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                <p className="font-semibold text-red-700 mb-1">Hash — Known Malware</p>
                <p className="font-mono text-red-600 break-all">d6e0f4a8b3c7d1e5f9...</p>
                <p className="text-red-600 mt-1">LockBit 3.0 ransomware · 847 VirusTotal hits</p>
              </div>
              <div className="rounded-lg bg-orange-50 border border-orange-200 p-3">
                <p className="font-semibold text-orange-700 mb-1">IP — Malicious C2</p>
                <p className="font-mono text-orange-600">185.220.101.47</p>
                <p className="text-orange-600 mt-1">Tor exit node · Blocked by 12 threat feeds</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DetailModal
        open={!!selectedEvent}
        title={`Event Detail — ${selectedEvent?.time ?? ''}`}
        onClose={() => setSelectedEvent(null)}
      >
        {selectedEvent && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full font-semibold">{selectedEvent.type}</span>
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${severityBadge(selectedEvent.severity as Severity)}`}>{selectedEvent.severity}</span>
              <span className="text-xs font-mono text-slate-500">{selectedEvent.time}</span>
            </div>
            <p className="text-sm font-semibold text-slate-900">{selectedEvent.description}</p>
            {selectedEvent.process && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Process Chain</p>
                <p className="text-xs font-mono text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{selectedEvent.process}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Details</p>
              <p className="text-xs text-slate-700 leading-relaxed">{selectedEvent.details}</p>
            </div>
          </div>
        )}
      </DetailModal>
    </div>
  )
}

// ─── Response Center tab ──────────────────────────────────────────────────────

function ResponseCenterTab() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selected, setSelected] = useState<ResponseAction | null>(null)
  const [actionForm, setActionForm] = useState<string | null>(null)
  const [actionTarget, setActionTarget] = useState('')

  const filtered = RESPONSE_HISTORY.filter(r => {
    const q = search.toLowerCase()
    if (q && !r.action.toLowerCase().includes(q) && !r.target.toLowerCase().includes(q) && !r.endpoint.toLowerCase().includes(q)) return false
    if (statusFilter && r.status !== statusFilter) return false
    return true
  })

  const actions = [
    { label: 'Isolate Device',        icon: Ban,        color: 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100',           placeholder: 'Endpoint name' },
    { label: 'Kill Process',          icon: Terminal,   color: 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100', placeholder: 'Process name or PID' },
    { label: 'Quarantine File',       icon: FileWarning,color: 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100',    placeholder: 'Full file path' },
    { label: 'Block Hash',            icon: Bug,        color: 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100', placeholder: 'SHA-256 hash' },
    { label: 'Block IP',              icon: Globe,      color: 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100',        placeholder: 'IP address' },
    { label: 'Disable User Session',  icon: UserX,      color: 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100',    placeholder: 'Username' },
    { label: 'Restore Device',        icon: RefreshCw,  color: 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100', placeholder: 'Endpoint name' },
  ]

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Execute Response Action</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2">
          {actions.map(a => (
            <button
              key={a.label}
              type="button"
              onClick={() => setActionForm(actionForm === a.label ? null : a.label)}
              className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-xs font-semibold text-center transition ${a.color} ${actionForm === a.label ? 'ring-2 ring-offset-1 ring-current opacity-100' : 'opacity-80 hover:opacity-100'}`}
            >
              <a.icon className="h-5 w-5" />
              {a.label}
            </button>
          ))}
        </div>

        {actionForm && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-wrap items-center gap-3">
            <p className="text-xs font-semibold text-slate-700 flex-shrink-0">{actionForm}:</p>
            <input
              type="text"
              value={actionTarget}
              onChange={e => setActionTarget(e.target.value)}
              placeholder={actions.find(a => a.label === actionForm)?.placeholder ?? 'Target'}
              className="flex-1 min-w-[200px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
            <button
              type="button"
              onClick={() => { setActionForm(null); setActionTarget('') }}
              className="rounded-lg border border-emerald-300 bg-emerald-600 text-white px-4 py-2 text-xs font-semibold hover:bg-emerald-700 transition flex items-center gap-1.5"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Execute
            </button>
            <button
              type="button"
              onClick={() => { setActionForm(null); setActionTarget('') }}
              className="rounded-lg border border-slate-200 bg-white text-slate-600 px-3 py-2 text-xs font-semibold hover:bg-slate-100 transition flex items-center gap-1.5"
            >
              <XCircle className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>
        )}
      </div>

      <div>
        <div className="flex flex-wrap gap-2 items-center mb-4">
          <h3 className="text-sm font-semibold text-slate-900 flex-1">Response History</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search actions..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300 w-48"
            />
          </div>
          <FilterSelect value={statusFilter} onChange={setStatusFilter} options={['Success','Failed','Pending','In Progress']} label="Status" />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  {['ID', 'Action', 'Target', 'Endpoint', 'Initiated By', 'Timestamp', 'Duration', 'Status'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className={`border-b border-slate-50 cursor-pointer hover:bg-slate-50 transition ${i % 2 === 0 ? '' : 'bg-slate-50/40'}`}
                  >
                    <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">{r.id}</td>
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{r.action}</td>
                    <td className="px-4 py-3 font-mono text-slate-600 max-w-[160px] truncate">{r.target}</td>
                    <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">{r.endpoint}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.initiatedBy}</td>
                    <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">{r.timestamp}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.duration}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${responseStatusBadge(r.status)}`}>{r.status}</span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No response actions match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <DetailModal open={!!selected} title={`Response Action ${selected?.id}: ${selected?.action ?? ''}`} onClose={() => setSelected(null)}>
        {selected && <ResponseDetail rsp={selected} />}
      </DetailModal>
    </div>
  )
}

// ─── Page root ────────────────────────────────────────────────────────────────

export function EDRPage() {
  const [tab, setTab] = useState<Tab>('dashboard')

  const newDetections  = DETECTIONS.filter(d => d.status === 'New').length
  const openIncidents  = INCIDENTS.filter(i => i.status === 'Open' || i.status === 'In Progress').length
  const pendingActions = RESPONSE_HISTORY.filter(r => r.status === 'Pending' || r.status === 'In Progress').length

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-red-100">
              <Radar className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">Endpoint Detection & Response</h1>
              <p className="text-xs text-slate-500">Real-time threat detection, investigation, and automated response</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-700">
            <CircleDot className="h-3 w-3 animate-pulse" /> Live
          </span>
          <button type="button" className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button type="button" className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
            <Filter className="h-3.5 w-3.5" /> Filters
          </button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        <TabBtn tab="dashboard"    active={tab} label="Dashboard"       onClick={() => setTab('dashboard')} />
        <TabBtn tab="detections"   active={tab} label="Detections"   count={newDetections}  onClick={() => setTab('detections')} />
        <TabBtn tab="incidents"    active={tab} label="Incidents"     count={openIncidents}  onClick={() => setTab('incidents')} />
        <TabBtn tab="investigation"active={tab} label="Investigation"                         onClick={() => setTab('investigation')} />
        <TabBtn tab="response"     active={tab} label="Response Center" count={pendingActions} onClick={() => setTab('response')} />
      </div>

      {tab === 'dashboard'     && <EDRDashboard />}
      {tab === 'detections'    && <DetectionsTab />}
      {tab === 'incidents'     && <IncidentsTab />}
      {tab === 'investigation' && <InvestigationTab />}
      {tab === 'response'      && <ResponseCenterTab />}
    </div>
  )
}
