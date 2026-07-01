import { Router } from 'express'

const router = Router()

// ── Generic Homebrew cask lookup ──────────────────────────────────────────────

// Maps common display names → Homebrew cask identifiers
const CASK_OVERRIDES: Record<string, string> = {
  // Browsers
  'google chrome': 'google-chrome',
  'chrome': 'google-chrome',
  'microsoft edge': 'microsoft-edge',
  'edge': 'microsoft-edge',
  'brave browser': 'brave-browser',
  'brave': 'brave-browser',
  'arc': 'arc',
  'opera': 'opera',
  // Dev tools
  'visual studio code': 'visual-studio-code',
  'vs code': 'visual-studio-code',
  'vscode': 'visual-studio-code',
  'docker desktop': 'docker-desktop',
  'iterm2': 'iterm2',
  'iterm': 'iterm2',
  'postman': 'postman',
  'github desktop': 'github',
  'sourcetree': 'sourcetree',
  'android studio': 'android-studio',
  'jetbrains toolbox': 'jetbrains-toolbox',
  'intellij idea': 'intellij-idea',
  'intellij idea ultimate': 'intellij-idea',
  'intellij idea community': 'intellij-idea-ce',
  'pycharm': 'pycharm',
  'pycharm professional': 'pycharm',
  'pycharm community': 'pycharm-ce',
  'webstorm': 'webstorm',
  'datagrip': 'datagrip',
  'goland': 'goland',
  'clion': 'clion',
  'tableplus': 'tableplus',
  'dbeaver': 'dbeaver-community',
  'dbeaver community': 'dbeaver-community',
  'sequel pro': 'sequel-pro',
  'fork': 'fork',
  'tower': 'tower',
  'sublime text': 'sublime-text',
  'sublime text 4': 'sublime-text',
  'cursor': 'cursor',
  'warp': 'warp',
  'hyper': 'hyper',
  'nova': 'nova',
  'bbedit': 'bbedit',
  'textmate': 'textmate',
  // Communication & Collaboration
  'slack': 'slack',
  'microsoft teams': 'microsoft-teams',
  'teams': 'microsoft-teams',
  'zoom': 'zoom',
  'zoom.us': 'zoom',
  'zoom video communications': 'zoom',
  'webex': 'webex',
  'webex meetings': 'webex',
  'cisco webex meetings': 'webex',
  'skype': 'skype',
  'discord': 'discord',
  'notion': 'notion',
  'miro': 'miro',
  'figma': 'figma',
  'loom': 'loom',
  'linear': 'linear-linear',
  // Microsoft 365
  'microsoft word': 'microsoft-word',
  'microsoft excel': 'microsoft-excel',
  'microsoft powerpoint': 'microsoft-powerpoint',
  'microsoft outlook': 'microsoft-outlook',
  'microsoft onenote': 'microsoft-onenote',
  'microsoft onedrive': 'onedrive',
  'onedrive': 'onedrive',
  'microsoft remote desktop': 'microsoft-remote-desktop',
  // Security & VPN
  'citrix workspace': 'citrix-workspace',
  'citrix workspace app': 'citrix-workspace',
  '1password': '1password',
  '1password 7': '1password7',
  'lastpass': 'lastpass',
  'dashlane': 'dashlane',
  'nordvpn': 'nordvpn',
  'expressvpn': 'expressvpn',
  'tunnelblick': 'tunnelblick',
  'crowdstrike falcon': 'crowdstrike-falcon',
  'crowdstrike': 'crowdstrike-falcon',
  'jamf connect': 'jamf-connect',
  // Storage & Utilities
  'dropbox': 'dropbox',
  'google drive': 'google-drive',
  'google drive for desktop': 'google-drive',
  'the unarchiver': 'the-unarchiver',
  'rectangle': 'rectangle',
  'alfred': 'alfred',
  'bartender': 'bartender',
  'bettertouchtool': 'bettertouchtool',
  'vlc media player': 'vlc',
  'vlc': 'vlc',
  'handbrake': 'handbrake',
  'spotify': 'spotify',
  'teamviewer': 'teamviewer',
  'anydesk': 'anydesk',
  'obs studio': 'obs',
  'obs': 'obs',
  'adobe acrobat reader': 'adobe-acrobat-reader',
  'adobe acrobat reader dc': 'adobe-acrobat-reader',
  'adobe acrobat': 'adobe-acrobat-reader',
  'cyberduck': 'cyberduck',
  'transmit': 'transmit',
  'transmit 5': 'transmit',
  'sketch': 'sketch',
  'affinity photo': 'affinity-photo',
  'affinity photo 2': 'affinity-photo2',
  'affinity designer': 'affinity-designer',
  'affinity designer 2': 'affinity-designer2',
  'affinity publisher': 'affinity-publisher',
  'affinity publisher 2': 'affinity-publisher2',
  'pixelmator pro': 'pixelmator-pro',
  'cleanmymac x': 'cleanmymac',
  'cleanmymac': 'cleanmymac',
  'setapp': 'setapp',
  'pdf expert': 'pdf-expert',
  'proxyman': 'proxyman',
  'charles': 'charles',
  'wireshark': 'wireshark',
  'drawio': 'drawio',
  'xmind': 'xmind',
  'microsoft auto update': 'microsoft-auto-update',
  'company portal': 'microsoft-intune-company-portal',
  'microsoft intune company portal': 'microsoft-intune-company-portal',
  'zoom rooms': 'zoomrooms',
  'google earth pro': 'google-earth-pro',
  'balenaetcher': 'balenaetcher',
  '7zip': 'sevenzip',
  '7-zip': 'sevenzip',
  'microsoft visual studio code': 'visual-studio-code',
  'google chrome browser': 'google-chrome',
  'amazon chime': 'amazon-chime',
  'slack for desktop': 'slack',
  'beyondtrust': 'beyondtrust-remote-support-jump-client-installer',
  'crowdstrike falcon sensor': 'crowdstrike-falcon',
  'vmware fusion': 'vmware-fusion',
  'vmware horizon client': 'vmware-horizon-client',
  'parallels desktop': 'parallels',
  'virtualbox': 'virtualbox',
  'utm': 'utm',
  'tor browser': 'tor-browser',
  'microsoft intune': 'microsoft-intune-company-portal',
  'jamf': 'jamf-connect',
  'jamf pro': 'jamf-remote',
  'beyond compare': 'beyond-compare',
  'azure data studio': 'azure-data-studio',
  'anaconda': 'anaconda',
  'anaconda navigator': 'anaconda',
  'miniconda': 'miniconda',
  'zotero': 'zotero',
  'mendeley': 'mendeley-reference-manager',
  'microsoft defender': 'microsoft-defender',
  'microsoft defender for endpoint': 'microsoft-defender',
}

function toCaskName(name: string): string {
  const lower = name.toLowerCase().trim()
  if (CASK_OVERRIDES[lower]) return CASK_OVERRIDES[lower]
  return lower.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

interface CaskInfo { version: string; downloadUrl: string }

async function fetchAnyCask(caskName: string): Promise<CaskInfo> {
  const r = await fetch(`https://formulae.brew.sh/api/cask/${caskName}.json`, {
    signal: AbortSignal.timeout(8000),
  })
  if (!r.ok) throw new Error(`Cask '${caskName}' not found (${r.status})`)
  const data = (await r.json()) as { version?: string; url?: string }
  const raw = data.version
  if (!raw) throw new Error('No version field in cask response')
  return {
    version: (raw.split(',')[0] ?? raw).trim(),
    downloadUrl: data.url ?? '',
  }
}

// ── Per-app version fetchers ─────────────────────────────────────────────────
// All run server-side — no CORS constraints.

async function fetchChromeVersion(): Promise<string> {
  // Official Google Version History API — stable channel, Mac platform
  const r = await fetch(
    'https://versionhistory.googleapis.com/v1/chrome/platforms/mac/channels/stable/versions?' +
    'filter=endtime%3Dnone&orderBy=version%20desc&pageSize=1',
    { signal: AbortSignal.timeout(8000) },
  )
  if (!r.ok) throw new Error(`Chrome API ${r.status}`)
  const data = (await r.json()) as { versions?: Array<{ version: string }> }
  const v = data.versions?.[0]?.version
  if (!v) throw new Error('No Chrome version in response')
  return v
}

async function fetchVSCodeVersion(): Promise<string> {
  // Official Microsoft VS Code releases endpoint — returns stable version array
  const r = await fetch(
    'https://update.code.visualstudio.com/api/releases/stable',
    { signal: AbortSignal.timeout(8000) },
  )
  if (!r.ok) throw new Error(`VS Code API ${r.status}`)
  const data = (await r.json()) as string[]
  const v = Array.isArray(data) ? data[0] : null
  if (!v) throw new Error('No VS Code version in response')
  return v
}

async function fetchFirefoxVersion(): Promise<string> {
  // Official Mozilla product-details JSON — CORS-friendly
  const r = await fetch(
    'https://product-details.mozilla.org/1.0/firefox_versions.json',
    { signal: AbortSignal.timeout(8000) },
  )
  if (!r.ok) throw new Error(`Firefox API ${r.status}`)
  const data = (await r.json()) as { LATEST_FIREFOX_VERSION?: string }
  const v = data.LATEST_FIREFOX_VERSION
  if (!v) throw new Error('No Firefox version in response')
  return v
}

interface VersionInfo { version: string; downloadUrl: string }

async function fetchDockerVersion(): Promise<VersionInfo> {
  const r = await fetch('https://formulae.brew.sh/api/cask/docker-desktop.json', { signal: AbortSignal.timeout(8000) })
  if (!r.ok) throw new Error(`Docker (Homebrew) API ${r.status}`)
  const data = (await r.json()) as { version?: string; url?: string }
  const raw = data.version
  if (!raw) throw new Error('No Docker version in response')
  return {
    version: (raw.split(',')[0] ?? raw).trim(),
    downloadUrl: data.url ?? 'https://www.docker.com/products/docker-desktop/',
  }
}

async function fetchSlackVersion(): Promise<VersionInfo> {
  const r = await fetch('https://formulae.brew.sh/api/cask/slack.json', { signal: AbortSignal.timeout(8000) })
  if (!r.ok) throw new Error(`Slack (Homebrew) API ${r.status}`)
  const data = (await r.json()) as { version?: string; url?: string }
  const raw = data.version
  if (!raw) throw new Error('No Slack version in response')
  return {
    version: (raw.split(',')[0] ?? raw).trim(),
    downloadUrl: data.url ?? 'https://slack.com/downloads/mac',
  }
}

async function fetchCitrixVersion(): Promise<VersionInfo> {
  const r = await fetch('https://formulae.brew.sh/api/cask/citrix-workspace.json', { signal: AbortSignal.timeout(8000) })
  if (!r.ok) throw new Error(`Citrix (Homebrew) API ${r.status}`)
  const data = (await r.json()) as { version?: string; url?: string }
  const raw = data.version
  if (!raw) throw new Error('No Citrix version in response')
  return {
    version: (raw.split(',')[0] ?? raw).trim(),
    downloadUrl: data.url ?? 'https://www.citrix.com/downloads/workspace-app/mac/',
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

interface AppVersionResult {
  id: string
  latestVersion: string | null
  directDownloadUrl: string | null  // actual installer file URL
  source: string
  error: string | null
  fetchedAt: string
}

// Direct installer URLs for non-Homebrew apps — always serve the latest build
const DIRECT_URLS: Record<string, string> = {
  chrome:  'https://dl.google.com/chrome/mac/universal/stable/googlechrome.dmg',
  vscode:  'https://update.code.visualstudio.com/latest/darwin-universal/stable',
  firefox: 'https://download.mozilla.org/?product=firefox-latest&os=osx&lang=en-US',
}

type SimpleVersionFn = () => Promise<string>
type InfoVersionFn   = () => Promise<VersionInfo>

const FETCHERS: Array<{ id: string; source: string; fn: SimpleVersionFn | InfoVersionFn }> = [
  { id: 'chrome',  source: 'versionhistory.googleapis.com',   fn: fetchChromeVersion  },
  { id: 'vscode',  source: 'update.code.visualstudio.com',     fn: fetchVSCodeVersion  },
  { id: 'firefox', source: 'product-details.mozilla.org',      fn: fetchFirefoxVersion },
  { id: 'docker',  source: 'formulae.brew.sh (Homebrew cask)', fn: fetchDockerVersion  },
  { id: 'slack',   source: 'formulae.brew.sh (Homebrew cask)', fn: fetchSlackVersion   },
  { id: 'citrix',  source: 'formulae.brew.sh (Homebrew cask)', fn: fetchCitrixVersion  },
]

router.get('/', async (_req, res) => {
  const now = new Date().toISOString()

  const results: AppVersionResult[] = await Promise.all(
    FETCHERS.map(async ({ id, source, fn }) => {
      try {
        const raw = await fn()
        const isInfo = typeof raw === 'object'
        const latestVersion    = isInfo ? (raw as VersionInfo).version     : (raw as string)
        const directDownloadUrl = isInfo ? (raw as VersionInfo).downloadUrl : (DIRECT_URLS[id] ?? null)
        return { id, latestVersion, directDownloadUrl, source, error: null, fetchedAt: now }
      } catch (err) {
        return {
          id, latestVersion: null, directDownloadUrl: null, source,
          error: err instanceof Error ? err.message : 'Unknown error',
          fetchedAt: now,
        }
      }
    }),
  )

  res.json({ success: true, versions: results, checkedAt: now })
})

// ── Batch lookup via Homebrew cask API ────────────────────────────────────────

interface BatchVersionResult {
  name: string
  caskName: string
  latestVersion: string | null
  directDownloadUrl: string | null
  source: string
  error: string | null
  fetchedAt: string
}

router.post('/batch', async (req, res) => {
  const body = req.body as { apps?: unknown }
  const appNames: string[] = Array.isArray(body.apps)
    ? (body.apps as unknown[]).filter((n): n is string => typeof n === 'string').slice(0, 150)
    : []

  if (appNames.length === 0) {
    return res.status(400).json({ success: false, error: 'apps array is required' })
  }

  const now = new Date().toISOString()

  const results: BatchVersionResult[] = await Promise.all(
    appNames.map(async (name) => {
      const caskName = toCaskName(name)
      try {
        const info = await fetchAnyCask(caskName)
        return {
          name, caskName,
          latestVersion: info.version,
          directDownloadUrl: info.downloadUrl || null,
          source: 'formulae.brew.sh',
          error: null, fetchedAt: now,
        }
      } catch (err) {
        return {
          name, caskName,
          latestVersion: null, directDownloadUrl: null,
          source: 'formulae.brew.sh',
          error: err instanceof Error ? err.message : 'Lookup failed',
          fetchedAt: now,
        }
      }
    }),
  )

  res.json({ success: true, results, checkedAt: now })
})

export default router
