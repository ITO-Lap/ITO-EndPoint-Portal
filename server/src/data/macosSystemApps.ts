/**
 * Versioned baseline of Apple apps that ship as part of macOS itself.
 *
 * Each entry is a bundle id plus the macOS major version it first appeared in (`since`) and, if Apple removed or
 * replaced it, the first major it is gone from (`until`, exclusive). Majors are Apple's real numbers
 * (… 13 Ventura, 14 Sonoma, 15 Sequoia, 26 Tahoe), so plain numeric comparison works across the 15 → 26 jump.
 *
 * Only apps that are part of the OS belong here. Apple apps that people install later — Xcode, GarageBand, iMovie,
 * Pages, Numbers, Keynote, Final Cut Pro, Logic Pro, Apple Remote Desktop, TestFlight … — are deliberately absent.
 *
 * To support a new macOS release: bump BASELINE_VERSION, add apps with `since: <new major>`, and add any retired
 * app's `until`. Apps missing here are still recognised as system apps when they live on the sealed system volume
 * (see macAppClassification.ts), so an out-of-date baseline fails towards "visible", never towards hiding.
 */
export const BASELINE_VERSION = '2026.10'

export interface SystemAppEntry { bundleId: string; name: string; since: number; until?: number }

export const MACOS_SYSTEM_APPS: readonly SystemAppEntry[] = [
  // Core
  { bundleId: 'com.apple.finder', name: 'Finder', since: 11 },
  { bundleId: 'com.apple.Safari', name: 'Safari', since: 11 },
  { bundleId: 'com.apple.AppStore', name: 'App Store', since: 11 },
  { bundleId: 'com.apple.systempreferences', name: 'System Settings', since: 11 }, // "System Preferences" before 13
  { bundleId: 'com.apple.calculator', name: 'Calculator', since: 11 },
  { bundleId: 'com.apple.Preview', name: 'Preview', since: 11 },
  { bundleId: 'com.apple.TextEdit', name: 'TextEdit', since: 11 },
  { bundleId: 'com.apple.QuickTimePlayerX', name: 'QuickTime Player', since: 11 },
  { bundleId: 'com.apple.Dictionary', name: 'Dictionary', since: 11 },
  { bundleId: 'com.apple.stickies', name: 'Stickies', since: 11 },
  { bundleId: 'com.apple.Chess', name: 'Chess', since: 11 },
  { bundleId: 'com.apple.PhotoBooth', name: 'Photo Booth', since: 11 },
  { bundleId: 'com.apple.FontBook', name: 'Font Book', since: 11 },
  { bundleId: 'com.apple.Automator', name: 'Automator', since: 11 },
  { bundleId: 'com.apple.Image_Capture', name: 'Image Capture', since: 11 },
  { bundleId: 'com.apple.siri.launcher', name: 'Siri', since: 11 },
  { bundleId: 'com.apple.exposelauncher', name: 'Mission Control', since: 11 },
  { bundleId: 'com.apple.launchpad.launcher', name: 'Launchpad', since: 11, until: 26 },
  { bundleId: 'com.apple.apps.launcher', name: 'Apps', since: 26 },
  { bundleId: 'com.apple.games', name: 'Games', since: 26 },
  // Apple apps bundled with the OS
  { bundleId: 'com.apple.mail', name: 'Mail', since: 11 },
  { bundleId: 'com.apple.iCal', name: 'Calendar', since: 11 },
  { bundleId: 'com.apple.AddressBook', name: 'Contacts', since: 11 },
  { bundleId: 'com.apple.Notes', name: 'Notes', since: 11 },
  { bundleId: 'com.apple.reminders', name: 'Reminders', since: 11 },
  { bundleId: 'com.apple.Maps', name: 'Maps', since: 11 },
  { bundleId: 'com.apple.Photos', name: 'Photos', since: 11 },
  { bundleId: 'com.apple.MobileSMS', name: 'Messages', since: 11 },
  { bundleId: 'com.apple.FaceTime', name: 'FaceTime', since: 11 },
  { bundleId: 'com.apple.Music', name: 'Music', since: 11 },
  { bundleId: 'com.apple.TV', name: 'TV', since: 11 },
  { bundleId: 'com.apple.podcasts', name: 'Podcasts', since: 11 },
  { bundleId: 'com.apple.news', name: 'News', since: 11 },
  { bundleId: 'com.apple.stocks', name: 'Stocks', since: 11 },
  { bundleId: 'com.apple.VoiceMemos', name: 'Voice Memos', since: 11 },
  { bundleId: 'com.apple.Home', name: 'Home', since: 11 },
  { bundleId: 'com.apple.iBooksX', name: 'Books', since: 11 },
  { bundleId: 'com.apple.findmy', name: 'Find My', since: 11 },
  { bundleId: 'com.apple.shortcuts', name: 'Shortcuts', since: 12 },
  { bundleId: 'com.apple.clock', name: 'Clock', since: 13 },
  { bundleId: 'com.apple.weather', name: 'Weather', since: 13 },
  { bundleId: 'com.apple.freeform', name: 'Freeform', since: 13 },
  { bundleId: 'com.apple.Passwords', name: 'Passwords', since: 15 },
  { bundleId: 'com.apple.ScreenContinuity', name: 'iPhone Mirroring', since: 15 },
  // Utilities
  { bundleId: 'com.apple.Terminal', name: 'Terminal', since: 11 },
  { bundleId: 'com.apple.ActivityMonitor', name: 'Activity Monitor', since: 11 },
  { bundleId: 'com.apple.Console', name: 'Console', since: 11 },
  { bundleId: 'com.apple.DiskUtility', name: 'Disk Utility', since: 11 },
  { bundleId: 'com.apple.keychainaccess', name: 'Keychain Access', since: 11 },
  { bundleId: 'com.apple.ScriptEditor2', name: 'Script Editor', since: 11 },
  { bundleId: 'com.apple.SystemProfiler', name: 'System Information', since: 11 },
  { bundleId: 'com.apple.ColorSyncUtility', name: 'ColorSync Utility', since: 11 },
  { bundleId: 'com.apple.DigitalColorMeter', name: 'Digital Color Meter', since: 11 },
  { bundleId: 'com.apple.grapher', name: 'Grapher', since: 11 },
  { bundleId: 'com.apple.audio.AudioMIDISetup', name: 'Audio MIDI Setup', since: 11 },
  { bundleId: 'com.apple.BluetoothFileExchange', name: 'Bluetooth File Exchange', since: 11 },
  { bundleId: 'com.apple.MigrateAssistant', name: 'Migration Assistant', since: 11 },
  { bundleId: 'com.apple.ScreenSharing', name: 'Screen Sharing', since: 11 },
  { bundleId: 'com.apple.VoiceOverUtility', name: 'VoiceOver Utility', since: 11 },
  { bundleId: 'com.apple.screenshot.launcher', name: 'Screenshot', since: 11 },
  { bundleId: 'com.apple.bootcampassistant', name: 'Boot Camp Assistant', since: 11, until: 15 },
]

const BY_BUNDLE_ID = new Map<string, SystemAppEntry>(MACOS_SYSTEM_APPS.map(e => [e.bundleId.toLowerCase(), e]))

/** Macs enrolled today span several releases; unknown version → true if any release shipped the app. */
export function isInSystemBaseline(bundleId: string, macosMajor: number | null): boolean {
  const entry = BY_BUNDLE_ID.get(bundleId.toLowerCase())
  if (!entry) return false
  if (macosMajor === null) return true
  return macosMajor >= entry.since && (entry.until === undefined || macosMajor < entry.until)
}

/** Maps the OS marketing name Endpoint Central reports ("macOS - Tahoe") to a major version. */
const MARKETING_NAMES: Array<[RegExp, number]> = [
  [/tahoe/i, 26], [/sequoia/i, 15], [/sonoma/i, 14], [/ventura/i, 13], [/monterey/i, 12], [/big sur/i, 11],
]
export function macosMajorFromName(osName: string | undefined): number | null {
  if (!osName) return null
  for (const [re, major] of MARKETING_NAMES) if (re.test(osName)) return major
  return null
}
