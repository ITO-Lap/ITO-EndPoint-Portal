import { describe, it, expect } from 'vitest'
import { groupIntuneDetected, fromManageEngineMdm, normalizeMobileApps, attachPackages, storeAppReason, windowsInboxReason, appleSystemReason, normText, type IntuneDetectedRow, type MobileAppRaw } from '../normalize.js'

const row = (over: Partial<IntuneDetectedRow> = {}): IntuneDetectedRow => ({ id: 'r1', displayName: 'Google Chrome', version: '152.0.7977.76', publisher: 'Google LLC', deviceCount: 2, platform: 'windows', ...over })

describe('groupIntuneDetected', () => {
  it('groups version rows of one app and keeps per-version counts and record ids', () => {
    const [app] = groupIntuneDetected([row({ id: 'a', version: '152.0.7977.76', deviceCount: 2 }), row({ id: 'b', version: '148.0.7778.218', deviceCount: 1 }), row({ id: 'c', version: '152.0.7977.76', deviceCount: 3 })])
    expect(groupIntuneDetected([row(), row({ id: 'z', version: '1.0' })])).toHaveLength(1)
    expect(app!.installed.find(i => i.version === '152.0.7977.76')).toMatchObject({ deviceCount: 5, sourceRecordIds: ['a', 'c'], provider: 'intune' })
    expect(app!.installed).toHaveLength(2)
  })

  it('excludes mobile platforms', () => {
    expect(groupIntuneDetected([row({ platform: 'ios' }), row({ platform: 'androidWorkProfile' })])).toEqual([])
  })

  it('does not merge different apps that merely look alike', () => {
    const out = groupIntuneDetected([row({ displayName: 'Python 3.12.1 (64-bit)', publisher: 'Python Software Foundation' }), row({ displayName: 'Python 3.12.4 (64-bit)', publisher: 'Python Software Foundation' })])
    expect(out).toHaveLength(2)
  })

  it('merges catalog apps whose display name embeds the version (7-Zip 23.01 / 24.08) into one record', () => {
    const out = groupIntuneDetected([
      row({ id: '1', displayName: '7-Zip 23.01 (x64)', publisher: 'Igor Pavlov', version: '23.01', deviceCount: 4 }),
      row({ id: '2', displayName: '7-Zip 24.08 (x64)', publisher: 'Igor Pavlov', version: '24.08', deviceCount: 6 }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]!.identity).toMatchObject({ displayName: '7-Zip', wingetId: '7zip.7zip' })
    expect(out[0]!.installed.map(i => i.version).sort()).toEqual(['23.01', '24.08'])
  })

  it('catalog match (exact name AND publisher) is medium confidence and carries the winget id', () => {
    const [app] = groupIntuneDetected([row()])
    expect(app!.confidence).toBe('medium')
    expect(app!.identity.wingetId).toBe('Google.Chrome')
  })

  it('a name match with the wrong publisher is NOT mapped (name alone is never enough)', () => {
    const [app] = groupIntuneDetected([row({ publisher: 'Totally Different Corp' })])
    expect(app!.confidence).toBe('low')
    expect(app!.identity.wingetId).toBeNull()
  })

  it('unknown apps are low confidence with a reason', () => {
    const [app] = groupIntuneDetected([row({ displayName: 'Acme Inventory Tool', publisher: 'Acme' })])
    expect(app!.confidence).toBe('low')
    expect(app!.confidenceReason).toMatch(/Name-only/)
  })

  it('marks Store/MSIX apps as OS-native (excluded) and maps unreported versions to "Unknown"', () => {
    const [app] = groupIntuneDetected([row({ displayName: '05980FDA.ProjectPlan365', publisher: 'CN=9DAF8F87-8D52', version: null })])
    expect(app!.nativeReason).toMatch(/Microsoft Store/)
    expect(app!.installed[0]!.version).toBe('Unknown')
    expect(storeAppReason('Google LLC')).toBeNull()
  })

  it('marks Windows built-in components as OS-native, but not third-party apps from other publishers', () => {
    expect(windowsInboxReason('Microsoft Windows Desktop Runtime', 'Microsoft Corporation')).toBe('Windows built-in component')
    expect(windowsInboxReason('Windows Driver Package - Intel (e1d)', 'Microsoft Corporation')).toBe('Windows built-in component')
    expect(windowsInboxReason('Windows Subsystem for Linux', 'Contoso')).toBeNull()
    expect(windowsInboxReason('Google Chrome', 'Google LLC')).toBeNull()
    expect(groupIntuneDetected([row({ displayName: 'Google Chrome' })])[0]!.nativeReason).toBeNull()
  })

  it('marks vendor auto-updating Windows apps (Chrome) as native', () => {
    expect(groupIntuneDetected([row()])[0]!.nativeHint).toMatch(/updates itself/)
    expect(groupIntuneDetected([row()])[0]!.nativeReason).toBeNull() // vendor-updated apps are still scanned
  })
})

describe('fromManageEngineMdm', () => {
  it('uses the bundle id as a strong identifier and counts devices per version', () => {
    const [app] = fromManageEngineMdm([{ appId: 'us.zoom.xos', name: 'zoom.us', platform: 'macOS', logs: [
      { deviceId: '1', deviceName: 'a', version: '6.0.0' }, { deviceId: '2', deviceName: 'b', version: '6.0.0' }, { deviceId: '3', deviceName: 'c', version: '5.9.0' },
    ] }])
    expect(app!.confidence).toBe('high')
    expect(app!.identity).toMatchObject({ bundleId: 'us.zoom.xos', brewToken: 'zoom' })
    expect(app!.installed).toEqual(expect.arrayContaining([{ version: '6.0.0', deviceCount: 2, provider: 'manageengine-mdm' }, { version: '5.9.0', deviceCount: 1, provider: 'manageengine-mdm' }]))
    expect(app!.providers).toEqual(['manageengine-mdm'])
  })
  it('numeric/unknown ids are low confidence (no bundle id)', () => {
    const [app] = fromManageEngineMdm([{ appId: '12345', name: 'Some App', platform: 'macOS', logs: [] }])
    expect(app!.confidence).toBe('low')
    expect(app!.identity.bundleId).toBeNull()
  })
  it('Apple system apps are OS-native (excluded); other bundle ids are not', () => {
    expect(fromManageEngineMdm([{ appId: 'com.apple.Safari', name: 'Safari', platform: 'macOS', logs: [] }])[0]!.nativeReason).toBe('Apple system app')
    expect(fromManageEngineMdm([{ appId: 'com.google.Chrome', name: 'Chrome', platform: 'macOS', logs: [] }])[0]!.nativeReason).toBeNull()
    expect(appleSystemReason('com.applesauce.tool')).toBeNull()
  })
  it('a catalog bundle id outside the catalog gets no source mapping', () => {
    expect(fromManageEngineMdm([{ appId: 'com.acme.tool', name: 'Acme', platform: 'macOS', logs: [] }])[0]!.identity.brewToken).toBeNull()
  })
})

describe('normalizeMobileApps + attachPackages', () => {
  const dmg: MobileAppRaw = { '@odata.type': '#microsoft.graph.macOSDmgApp', id: 'pkg-chrome', displayName: 'Google Chrome', publisher: 'Google', primaryBundleId: 'com.google.Chrome', primaryBundleVersion: '106.0.5249.91' }
  const win32: MobileAppRaw = { '@odata.type': '#microsoft.graph.win32LobApp', id: 'w1', displayName: '1Password', publisher: 'AgileBits', msiInformation: { productCode: '{ABC}', productVersion: '8.11.23' } }
  const win32NoVer: MobileAppRaw = { '@odata.type': '#microsoft.graph.win32LobApp', id: 'w2', displayName: '.Net 3.5', publisher: 'Microsoft' }
  const wg: MobileAppRaw = { '@odata.type': '#microsoft.graph.winGetApp', id: 'wg1', displayName: 'Zoom', packageIdentifier: 'Zoom.Zoom' }
  const store: MobileAppRaw = { '@odata.type': '#microsoft.graph.iosStoreApp', id: 's1', displayName: 'Slack' }

  it('extracts versions only from fields Intune actually reports', () => {
    const pk = normalizeMobileApps([dmg, win32, win32NoVer, wg, store])
    expect(pk.find(p => p.packageId === 'pkg-chrome')).toMatchObject({ matchBasis: 'bundleId', bundleId: 'com.google.Chrome', version: '106.0.5249.91' })
    expect(pk.find(p => p.packageId === 'w1')).toMatchObject({ version: '8.11.23', versionSource: 'Intune msiInformation.productVersion', matchBasis: 'name' })
    expect(pk.find(p => p.packageId === 'w2')!.version).toBeNull()
    expect(pk.find(p => p.packageId === 'wg1')).toMatchObject({ matchBasis: 'wingetId', wingetId: 'Zoom.Zoom', version: null })
    expect(pk.find(p => p.packageId === 's1')).toBeUndefined() // store apps are not packages
  })

  it('macOS: matches by bundle id (strong); Windows: winget id is strong, name is low-confidence', () => {
    const [mac] = fromManageEngineMdm([{ appId: 'com.google.Chrome', name: 'Google Chrome', platform: 'macOS', logs: [] }])
    const [zoomWin, onePass] = groupIntuneDetected([row({ displayName: 'Zoom Workplace', publisher: 'Zoom Video Communications, Inc.' }), row({ id: 'x', displayName: '1Password', publisher: 'AgileBits Inc.' })])
    const pk = normalizeMobileApps([dmg, win32, wg])
    const [m, z, o] = attachPackages([mac!, zoomWin!, onePass!], pk)
    expect(m!.packages.map(p => p.matchBasis)).toEqual(['bundleId'])
    expect(z!.packages.map(p => p.matchBasis)).toEqual(['wingetId'])
    expect(o!.packages.map(p => p.matchBasis)).toEqual(['name'])
  })

  it('a package never attaches to a different bundle id or a differently named app', () => {
    const [other] = fromManageEngineMdm([{ appId: 'com.acme.tool', name: 'Google Chrome', platform: 'macOS', logs: [] }])
    expect(attachPackages([other!], normalizeMobileApps([dmg]))[0]!.packages).toEqual([])
  })

  it('normText collapses case and whitespace', () => expect(normText('  Google   Chrome ')).toBe('google chrome'))
})
