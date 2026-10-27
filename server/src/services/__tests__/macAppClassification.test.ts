import { describe, it, expect } from 'vitest'
import { classifyMacApp, dedupeInventoryRecords, DeploymentIndex } from '../macAppClassification.js'
import type { MacAppSignals } from '../macAppClassification.js'
import { isInSystemBaseline, macosMajorFromName } from '../../data/macosSystemApps.js'

const app = (over: Partial<MacAppSignals>): MacAppSignals => ({
  name: 'App', reportedBy: 'endpoint_central', macosMajor: 26, vendor: 'Apple', ...over,
})

describe('system_preinstalled (hidden by default)', () => {
  const system: Array<[string, string, string]> = [
    ['Safari', 'com.apple.Safari', '/System/Cryptexes/App/System/Applications/Safari.app'],
    ['Finder', 'com.apple.finder', '/System/Library/CoreServices/Finder.app'],
    ['Calculator', 'com.apple.calculator', '/System/Applications/Calculator.app'],
    ['System Settings', 'com.apple.systempreferences', '/System/Applications/System Settings.app'],
    ['App Store', 'com.apple.AppStore', '/System/Applications/App Store.app'],
  ]
  it.each(system)('%s', (name, bundleId, path) => {
    const r = classifyMacApp(app({ name, bundleId, path, version: '1.0' }))
    expect(r.classification).toBe('system_preinstalled')
    expect(r.confidence).toBe('high')
    expect(r.reason).toMatch(/system volume|baseline/i)
  })
  it('classifies via the baseline plus an Apple bundle id when the path is not reported', () => {
    const r = classifyMacApp(app({ name: 'Safari', bundleId: 'com.apple.Safari', path: '/Applications/Safari.app' }))
    expect(r.classification).toBe('system_preinstalled')
    expect(r.reason).toMatch(/baseline/)
  })
})

describe('visible apps', () => {
  it('Google Chrome installed manually', () => {
    const r = classifyMacApp(app({ name: 'Google Chrome', bundleId: 'com.google.Chrome', path: '/Applications/Google Chrome.app', vendor: 'Google LLC' }))
    expect(r.classification).toBe('manual_or_user_installed')
    expect(r.installSource).toBe('manual')
  })
  it('Slack installed manually', () => {
    expect(classifyMacApp(app({ name: 'Slack', bundleId: 'com.tinyspeck.slackmacgap', path: '/Applications/Slack.app', vendor: 'Slack Technologies' })).classification)
      .toBe('manual_or_user_installed')
  })
  it('Zoom deployed through Endpoint Central Self Service is managed_self_service', () => {
    const index = new DeploymentIndex()
    index.add({ source: 'endpoint_central', kind: 'Self Service Portal' }, { bundleId: 'us.zoom.xos', name: 'zoom.us' })
    const r = classifyMacApp(app({ name: 'zoom.us', bundleId: 'us.zoom.xos', path: '/Applications/zoom.us.app', vendor: 'Zoom' }), index)
    expect(r.classification).toBe('managed_self_service')
    expect(r.installSource).toBe('self_service')
    expect(r.reason).toMatch(/Endpoint Central deployment: Self Service Portal/)
  })
  it('a managed Apple app stays visible even if it is on the baseline', () => {
    const index = new DeploymentIndex()
    index.add({ source: 'intune', kind: 'Company Portal (available)' }, { bundleId: 'com.apple.Safari' })
    expect(classifyMacApp(app({ name: 'Safari', bundleId: 'com.apple.Safari', path: '/System/Cryptexes/App/System/Applications/Safari.app' }), index).classification)
      .toBe('managed_self_service')
  })
  it('Xcode installed after setup', () => {
    const r = classifyMacApp(app({ name: 'Xcode', bundleId: 'com.apple.dt.Xcode', path: '/Applications/Xcode.app' }))
    expect(r.classification).toBe('manual_or_user_installed')
    expect(r.reason).toMatch(/not part of the macOS baseline/)
  })
  it.each([
    ['GarageBand', 'com.apple.garageband10'], ['Pages', 'com.apple.iWork.Pages'], ['Numbers', 'com.apple.iWork.Numbers'],
    ['Keynote', 'com.apple.iWork.Keynote'], ['Final Cut Pro', 'com.apple.FinalCut'],
  ])('%s from the App Store stays visible', (name, bundleId) => {
    expect(classifyMacApp(app({ name, bundleId, path: `/Applications/${name}.app` })).classification).not.toBe('system_preinstalled')
  })
  it('does not hide an app just because of its name, com.apple id, Apple vendor or /Applications', () => {
    expect(classifyMacApp(app({ name: 'Apple Configurator', bundleId: 'com.apple.configurator.ui', path: '/Applications/Apple Configurator.app' })).classification)
      .toBe('manual_or_user_installed')
  })
  it('incomplete inventory data is unknown_review_required', () => {
    const r = classifyMacApp(app({ name: 'Mystery Tool', vendor: '' }))
    expect(r.classification).toBe('unknown_review_required')
    expect(r.reason).toMatch(/No reliable installation source found/)
  })
  it('a non-Apple app in /Applications', () => {
    expect(classifyMacApp(app({ name: 'Notion', bundleId: 'notion.id', path: '/Applications/Notion.app', vendor: 'Notion Labs' })).classification)
      .toBe('manual_or_user_installed')
  })
})

describe('versioned baseline', () => {
  it('respects when an app appeared and was retired', () => {
    expect(isInSystemBaseline('com.apple.Passwords', 14)).toBe(false)
    expect(isInSystemBaseline('com.apple.Passwords', 15)).toBe(true)
    expect(isInSystemBaseline('com.apple.launchpad.launcher', 15)).toBe(true)
    expect(isInSystemBaseline('com.apple.launchpad.launcher', 26)).toBe(false)
    expect(isInSystemBaseline('com.apple.dt.Xcode', 26)).toBe(false)
    expect(isInSystemBaseline('com.apple.Safari', null)).toBe(true)
  })
  it('maps marketing names to majors', () => {
    expect(macosMajorFromName('macOS - Tahoe')).toBe(26)
    expect(macosMajorFromName('macOS - Sequoia')).toBe(15)
    expect(macosMajorFromName(undefined)).toBeNull()
  })
})

describe('dedupeInventoryRecords', () => {
  it('merges the same app from Intune and Endpoint Central on one device', () => {
    const rows = dedupeInventoryRecords([
      { deviceId: 'd1', name: 'Slack', bundleId: 'com.tinyspeck.slackmacgap', path: '', reportedBy: 'intune' as const },
      { deviceId: 'd1', name: 'Slack', bundleId: 'com.tinyspeck.slackmacgap', path: '/Applications/Slack.app', reportedBy: 'endpoint_central' as const },
      { deviceId: 'd2', name: 'Slack', bundleId: 'com.tinyspeck.slackmacgap', path: '/Applications/Slack.app', reportedBy: 'endpoint_central' as const },
    ])
    expect(rows).toHaveLength(2)
    const d1 = rows.find(r => r.deviceId === 'd1')!
    expect(d1.path).toBe('/Applications/Slack.app')
    expect([...d1.reportedByAll!].sort()).toEqual(['endpoint_central', 'intune'])
  })
  it('falls back to path, then normalized name and version', () => {
    const rows = dedupeInventoryRecords([
      { deviceId: 'd1', name: 'Tool', path: '/Applications/Tool.app', reportedBy: 'intune' as const },
      { deviceId: 'd1', name: 'TOOL', path: '/Applications/Tool.app', reportedBy: 'endpoint_central' as const },
      { deviceId: 'd1', name: 'Other', version: '1.0', reportedBy: 'intune' as const },
      { deviceId: 'd1', name: ' other ', version: '1.0', reportedBy: 'endpoint_central' as const },
    ])
    expect(rows).toHaveLength(2)
  })
})

describe('OS support components and agent apps', () => {
  it('Apple helper bundles in Apple support folders are system components', () => {
    const r = classifyMacApp(app({ name: 'MobileDeviceUpdater', bundleId: 'com.apple.MobileDeviceUpdater', path: '/Library/Apple/System/Library/PrivateFrameworks/MobileDevice.framework/MobileDeviceUpdater.app' }))
    expect(r.classification).toBe('system_preinstalled')
    expect(r.confidence).toBe('medium')
  })
  it('an Apple support folder alone is not enough (non-Apple vendor stays visible)', () => {
    expect(classifyMacApp(app({ name: 'Foo', bundleId: 'com.foo.bar', path: '/Library/Apple/Foo.app', vendor: 'Foo Inc' })).classification)
      .toBe('manual_or_user_installed')
  })
  it('com.manageengine.* apps are managed by Endpoint Central', () => {
    const index = new DeploymentIndex()
    index.addBundlePrefix('com.manageengine.', { source: 'endpoint_central', kind: 'Endpoint Central agent' })
    index.addBundlePrefix('com.manageengine.', { source: 'endpoint_central', kind: 'Endpoint Central agent' })
    expect(index.size).toBe(1)
    const r = classifyMacApp(app({ name: 'Self Service Portal', bundleId: 'com.manageengine.selfserviceportal', path: '/Applications/Self Service Portal.app', vendor: 'ManageEngine' }), index)
    expect(r.classification).toBe('managed_self_service')
    expect(r.installSource).toBe('endpoint_central')
  })
})

describe('placeholder values', () => {
  it('treats "Unknown" vendor as not reported', () => {
    const r = classifyMacApp(app({ name: 'Cocoa-AppleScript Applet', bundleId: 'com.apple.ScriptEditor.id.cocoa-applet-template', path: '/Library/Application Support/Script Editor/Templates/Cocoa-AppleScript Applet.app', vendor: 'Unknown' }))
    expect(r.classification).toBe('system_preinstalled')
  })
})
