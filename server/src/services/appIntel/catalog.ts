// Curated, reviewed app identity catalog. This is the ONLY place an app is tied to a latest-version
// source. Entries use identifiers the upstream catalogs publish (winget PackageIdentifier, Homebrew
// cask token, macOS bundle id). An app not listed here is never given a guessed source — it reports
// "Data unavailable". Add entries only after checking the winget-pkgs manifest / Homebrew cask exists.

export interface CatalogEntry {
  /** macOS: exact bundle identifier reported by MDM inventory (strong identifier). */
  bundleId?: string
  /** Windows: both patterns must match the inventory name AND publisher (name alone is never enough). */
  windows?: { name: RegExp; publisher: RegExp }
  wingetId?: string
  brewToken?: string
  /** Windows vendor auto-updater (Homebrew reports this for macOS itself via cask `auto_updates`). */
  windowsVendorAutoUpdate?: boolean
  /**
   * NVD CPE vendor/product (cpe:2.3:a:<vendor>:<product>), used ONLY for CVE lookups. Add one only after confirming
   * the product exists in the NVD CPE dictionary — an unknown CPE returns zero CVEs, which would read as a false "clean".
   * Apps without a verified mapping (e.g. Slack has none; Zoom's NVD product naming is ambiguous) report CVEs as unavailable.
   */
  cpe?: { vendor: string; product: string }
  displayName: string
}

export const APP_CATALOG: readonly CatalogEntry[] = [
  { displayName: 'Google Chrome', cpe: { vendor: 'google', product: 'chrome' }, bundleId: 'com.google.Chrome', brewToken: 'google-chrome', wingetId: 'Google.Chrome', windowsVendorAutoUpdate: true,
    windows: { name: /^google chrome$/i, publisher: /google/i } },
  { displayName: 'Mozilla Firefox', cpe: { vendor: 'mozilla', product: 'firefox' }, bundleId: 'org.mozilla.firefox', brewToken: 'firefox', wingetId: 'Mozilla.Firefox', windowsVendorAutoUpdate: true,
    windows: { name: /^mozilla firefox\b/i, publisher: /mozilla/i } },
  { displayName: 'Microsoft Edge', cpe: { vendor: 'microsoft', product: 'edge_chromium' }, bundleId: 'com.microsoft.edgemac', brewToken: 'microsoft-edge', wingetId: 'Microsoft.Edge', windowsVendorAutoUpdate: true,
    windows: { name: /^microsoft edge$/i, publisher: /microsoft/i } },
  { displayName: 'Zoom Workplace', bundleId: 'us.zoom.xos', brewToken: 'zoom', wingetId: 'Zoom.Zoom',
    windows: { name: /^zoom( workplace)?( \((64|32)-bit\))?$/i, publisher: /zoom/i } },
  { displayName: 'Slack', bundleId: 'com.tinyspeck.slackmacgap', brewToken: 'slack', wingetId: 'SlackTechnologies.Slack', windowsVendorAutoUpdate: true,
    windows: { name: /^slack$/i, publisher: /slack/i } },
  { displayName: 'Visual Studio Code', cpe: { vendor: 'microsoft', product: 'visual_studio_code' }, bundleId: 'com.microsoft.VSCode', brewToken: 'visual-studio-code', wingetId: 'Microsoft.VisualStudioCode',
    windows: { name: /^microsoft visual studio code\b/i, publisher: /microsoft/i } },
  { displayName: 'VLC media player', cpe: { vendor: 'videolan', product: 'vlc_media_player' }, bundleId: 'org.videolan.vlc', brewToken: 'vlc', wingetId: 'VideoLAN.VLC',
    windows: { name: /^vlc media player$/i, publisher: /videolan/i } },
  { displayName: 'Wireshark', cpe: { vendor: 'wireshark', product: 'wireshark' }, bundleId: 'org.wireshark.Wireshark', brewToken: 'wireshark', wingetId: 'WiresharkFoundation.Wireshark',
    windows: { name: /^wireshark\b/i, publisher: /wireshark/i } },
  { displayName: '1Password', cpe: { vendor: '1password', product: '1password' }, bundleId: 'com.1password.1password', brewToken: '1password', wingetId: 'AgileBits.1Password',
    windows: { name: /^1password$/i, publisher: /agilebits|1password/i } },
  { displayName: 'Notepad++', cpe: { vendor: 'notepad-plus-plus', product: 'notepad\\+\\+' }, wingetId: 'Notepad++.Notepad++', windows: { name: /^notepad\+\+/i, publisher: /notepad\+\+|don ho/i } },
  { displayName: '7-Zip', cpe: { vendor: '7-zip', product: '7-zip' }, wingetId: '7zip.7zip', windows: { name: /^7-zip\b/i, publisher: /igor pavlov/i } },
  { displayName: 'Git', cpe: { vendor: 'git-scm', product: 'git' }, wingetId: 'Git.Git', windows: { name: /^git$/i, publisher: /git development community/i } },
]

export function catalogForBundleId(bundleId: string | null | undefined): CatalogEntry | null {
  if (!bundleId) return null
  return APP_CATALOG.find(e => e.bundleId === bundleId) ?? null
}

export function catalogForWindows(name: string, publisher: string | null): CatalogEntry | null {
  if (!publisher) return null
  return APP_CATALOG.find(e => e.windows && e.windows.name.test(name.trim()) && e.windows.publisher.test(publisher)) ?? null
}

export function catalogForWingetId(id: string | null | undefined): CatalogEntry | null {
  return id ? APP_CATALOG.find(e => e.wingetId?.toLowerCase() === id.toLowerCase()) ?? null : null
}
