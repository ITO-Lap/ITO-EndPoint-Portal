import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CALC_PUBLISHER, makeMsi, makeMsix, makePe, makeZip } from './fixtures.js'
import { decodeMsiStreamName, encodeMsiStreamName, inspectMsi, architectureFromTemplate } from '../msiInspect.js'
import { inspectMsix, publisherId } from '../msixInspect.js'
import { inspectPe } from '../peInspect.js'
import { extractZip, isSafeEntryName, listZipEntries, validateZipEntries, ZipError } from '../zipSafe.js'
import { analyzeArchive, analyzeInstaller, architectureFromFileName } from '../inspect.js'
import { commonName, pickSigner } from '../signature.js'
import { checkCommand, suggestCommands, tokenize } from '../commands.js'
import { applyPatch, configPatchSchema, configProblems, defaultConfig, outputFileName } from '../config.js'
import { detectionScript, installScript, psq, splitCommand, uninstallScript } from '../artifacts.js'
import { createWorkerClient, evaluateSteps, workerConfig } from '../worker.js'
import { signedLink, verifyLink } from '../signing.js'
import type { PackageConfig } from '../types.js'

const GUID = '{12345678-ABCD-4EF0-9876-0123456789AB}'
let dir: string
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'wp-svc-')) })
afterAll(() => { rmSync(dir, { recursive: true, force: true }) })
const put = (name: string, data: Buffer): string => { const p = join(dir, name); writeFileSync(p, data); return p }

describe('MSI inspection (real compound-file layout)', () => {
  it('round-trips the stream-name encoding', () => {
    for (const n of ['Property', '_StringPool', '_StringData']) expect(decodeMsiStreamName(encodeMsiStreamName(n))).toBe(`!${n}`)
  })
  it('reads ProductCode, version, publisher and architecture', () => {
    const file = put('a.msi', makeMsi({ properties: { ProductCode: GUID, ProductVersion: '2.4.6', Manufacturer: 'Contoso', ProductName: 'Contoso Tool', UpgradeCode: '{AAAAAAAA-0000-0000-0000-000000000000}' } }))
    const info = inspectMsi(file)
    expect(info.properties['ProductCode']).toBe(GUID)
    expect(info.properties['ProductVersion']).toBe('2.4.6')
    expect(info.architecture).toBe('x64')
    expect(info.signature.status).toBe('unsigned')
  })
  it('maps templates to architectures', () => {
    expect(architectureFromTemplate('Intel;1033')).toBe('x86')
    expect(architectureFromTemplate('Arm64;1033')).toBe('arm64')
    expect(architectureFromTemplate('Intel64;1033')).toBeUndefined()
  })
  it('rejects a non-MSI file', () => {
    expect(() => inspectMsi(put('bad.msi', Buffer.from('not an msi')))).toThrow()
  })
  it('suggests verified msiexec commands and an MSI product-code detection with minimum version', async () => {
    const file = put('b.msi', makeMsi({ properties: { ProductCode: GUID, ProductVersion: '2.4.6', Manufacturer: 'Contoso', ProductName: 'Contoso Tool' } }))
    const a = await analyzeInstaller(file, 'b.msi')
    expect(a.commands).toMatchObject({ install: 'msiexec /i "b.msi" /qn /norestart', uninstall: `msiexec /x "${GUID}" /qn /norestart`, confidence: 'verified' })
    expect(a.detection).toEqual({ type: 'msi-product-code', value: GUID, minVersion: '2.4.6' })
    expect(a.windowsValidationRequired).toBe(true)
  })
  it('does not call commands verified when the ProductCode is missing', async () => {
    const file = put('c.msi', makeMsi({ properties: { ProductVersion: '1.0' } }))
    const a = await analyzeInstaller(file, 'c.msi')
    expect(a.commands.confidence).toBe('likely')
    expect(a.commands.uninstall).toBeUndefined()
    expect(a.warnings.join(' ')).toMatch(/ProductCode not found/)
  })
})

describe('MSIX / AppX inspection', () => {
  it('derives the documented package family name', () => {
    expect(publisherId(CALC_PUBLISHER)).toBe('8wekyb3d8bbwe')
  })
  it('reads identity, version, architecture and minimum OS', async () => {
    const info = await inspectMsix(put('t.msix', makeMsix({ publisher: CALC_PUBLISHER, name: 'Microsoft.WindowsCalculator' })))
    expect(info).toMatchObject({ identityName: 'Microsoft.WindowsCalculator', version: '1.2.3.0', architecture: 'x64', packageFamilyName: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe', minOsVersion: '10.0.17763.0' })
    expect(info.signature.status).toBe('unsigned')
  })
  it('rejects a zip with no manifest', async () => {
    await expect(inspectMsix(put('n.msix', makeZip([{ name: 'x.txt', data: 'x' }])))).rejects.toThrow(/AppxManifest/)
  })
  it('produces likely (not verified) commands with AppX detection', async () => {
    const a = await analyzeInstaller(put('u.msix', makeMsix()), 'u.msix')
    expect(a.commands.confidence).toBe('likely')
    expect(a.detection).toMatchObject({ type: 'appx-package', value: 'Contoso.Tool' })
  })
})

describe('EXE inspection', () => {
  it('reads architecture and version strings', () => {
    const info = inspectPe(put('p1.exe', makePe({ machine: 0xaa64, version: { ProductName: 'Widget', CompanyName: 'Acme Inc', FileVersion: '3.1.4.0' } })))
    expect(info.architecture).toBe('arm64')
    expect(info.versionStrings).toMatchObject({ ProductName: 'Widget', CompanyName: 'Acme Inc', FileVersion: '3.1.4.0' })
    expect(info.tech).toBe('unknown')
    expect(info.signature.status).toBe('unsigned')
  })
  it.each([
    ['Inno Setup Setup Data (6.2.0)', 'inno-setup', '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-'],
    ['xx Nullsoft Install System v3 xx', 'nsis', '/S'],
  ])('recognises %s', async (marker, tech, switches) => {
    const file = put(`${tech}.exe`, makePe({ marker, version: { ProductName: 'Widget', FileVersion: '1.0' } }))
    const a = await analyzeInstaller(file, `${tech}.exe`)
    expect(a.tech).toBe(tech)
    expect(a.commands.confidence).toBe('likely')
    expect(a.commands.install).toContain(switches)
    expect(a.commands.uninstall).toBeUndefined() // never guessed for EXE installers
  })
  it('recognises a WiX Burn bundle by its section', async () => {
    const a = await analyzeInstaller(put('burn.exe', makePe({ sectionNames: ['.text', '.wixburn', '.rsrc'] })), 'burn.exe')
    expect(a.tech).toBe('wix-burn')
    expect(a.commands.install).toContain('/quiet /norestart')
  })
  it('does not guess for an unknown installer', async () => {
    const a = await analyzeInstaller(put('unk.exe', makePe({})), 'unk.exe')
    expect(a.tech).toBe('unknown')
    expect(a.commands).toMatchObject({ confidence: 'unknown' })
    expect(a.commands.install).toBeUndefined()
    expect(a.confidence).toBeLessThan(40)
  })
  it('reports a signature blob as present but unverified', () => {
    const info = inspectPe(put('signed.exe', makePe({ signed: true })))
    expect(info.signature.status).toBe('present-unverified')
    expect(info.signature.note).toMatch(/not cryptographically verified/)
  })
  it('rejects non-PE content', () => {
    expect(() => inspectPe(put('x.exe', Buffer.from('#!/bin/sh\n')))).toThrow()
  })
})

describe('safe ZIP handling', () => {
  it('flags traversal, absolute, drive and backslash-traversal names', () => {
    for (const n of ['../evil.exe', '/etc/passwd', 'C:\\x.exe', 'a/../../b', '..\\b']) expect(isSafeEntryName(n)).toBe(false)
    expect(isSafeEntryName('sub/setup.exe')).toBe(true)
  })
  it('validateZipEntries reports unsafe archives and extraction refuses them', async () => {
    const zip = put('evil.zip', makeZip([{ name: '../escape.exe', data: 'x' }]))
    expect(validateZipEntries(listZipEntries(zip)).join()).toMatch(/Unsafe path/)
    await expect(extractZip(zip, join(dir, 'out-evil'))).rejects.toBeInstanceOf(ZipError)
    expect(() => readdirSync(join(dir, 'out-evil'))).toThrow()
  })
  it('rejects symlink entries', () => {
    expect(() => listZipEntries(put('sym.zip', makeZip([{ name: 'link', data: '/etc/passwd', unixMode: 0o120777 }])))).toThrow(/symbolic link/)
  })
  it('rejects duplicate entries', () => {
    const entries = listZipEntries(put('dup.zip', makeZip([{ name: 'a.exe', data: '1' }, { name: 'A.exe', data: '2' }])))
    expect(validateZipEntries(entries).join()).toMatch(/Duplicate/)
  })
  it('extracts stored and deflated entries and lists nested installers', async () => {
    const zip = put('good.zip', makeZip([
      { name: 'setup/', data: '' }, { name: 'setup/app.msi', data: 'MSI-BYTES', deflate: true }, { name: 'readme.txt', data: 'hello' },
    ]))
    const a = analyzeArchive(zip, 'good.zip')
    expect(a.archiveEntries?.filter(e => e.kind)).toEqual([{ name: 'setup/app.msi', size: 9, kind: 'msi' }])
    await extractZip(zip, join(dir, 'out-good'))
    expect(readFileSync(join(dir, 'out-good', 'setup', 'app.msi'), 'utf-8')).toBe('MSI-BYTES')
  })
  it('stops an entry that expands past its declared size', async () => {
    const zip = put('lie.zip', makeZip([{ name: 'big.bin', data: Buffer.alloc(5000, 1), deflate: true, declaredSize: 10 }]))
    await expect(extractZip(zip, join(dir, 'out-lie'))).rejects.toThrow()
  })
  it('warns when no installer is inside', () => {
    expect(analyzeArchive(put('none.zip', makeZip([{ name: 'a.txt', data: 'x' }])), 'none.zip').warnings.join()).toMatch(/No .msi/)
  })
})

describe('command safety', () => {
  const setup = 'app.exe'
  it('accepts the documented forms', () => {
    expect(checkCommand('msiexec /i "app.msi" /qn /norestart', 'app.msi', 'install').ok).toBe(true)
    expect(checkCommand('"app.exe" /S', setup, 'install').ok).toBe(true)
    expect(checkCommand('.\\app.exe /S', setup, 'install').ok).toBe(true)
    expect(checkCommand('powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\install.ps1', 'a.msix', 'install').ok).toBe(true)
    expect(checkCommand('"C:\\Program Files\\App\\unins000.exe" /VERYSILENT', setup, 'uninstall').ok).toBe(true)
  })
  it.each([
    'app.exe /S & calc.exe', 'app.exe /S | more', 'app.exe; whoami', 'app.exe `id`', 'app.exe $(id)', 'app.exe > out.txt',
    'cmd /c app.exe', 'powershell -Command "iwr evil"', 'C:\\Windows\\System32\\calc.exe', 'app.exe\r\ncalc', 'msiexec.exe',
  ])('rejects %j', cmd => {
    const verdict = checkCommand(cmd, setup, 'install')
    // `msiexec.exe` alone is allowed (it is msiexec); every other string must be refused.
    expect(verdict.ok).toBe(cmd === 'msiexec.exe')
  })
  it('only allows an arbitrary absolute exe for uninstall, and only uninstallers', () => {
    expect(checkCommand('"C:\\Program Files\\App\\unins000.exe" /S', setup, 'install').ok).toBe(false)
    expect(checkCommand('"C:\\Tools\\mimikatz.exe"', setup, 'uninstall').ok).toBe(false)
  })
  it('tokenizes quoted paths', () => {
    expect(tokenize('"C:\\Program Files\\a b.exe" /x "y z"')).toEqual(['C:\\Program Files\\a b.exe', '/x', 'y z'])
    expect(tokenize('"unterminated')).toBeNull()
  })
  it('never marks unknown installers as verified', () => {
    expect(suggestCommands({ tech: 'unknown', installerFile: 'x.exe' }).confidence).toBe('unknown')
    expect(suggestCommands({ tech: 'nsis', installerFile: 'x.exe' }).confidence).toBe('likely')
  })
})

describe('configuration', () => {
  const analysis = async () => analyzeInstaller(put('cfg.msi', makeMsi({ properties: { ProductCode: GUID, ProductVersion: '1.0.0', Manufacturer: 'Contoso', ProductName: 'Contoso Tool' } })), 'cfg.msi')
  it('builds defaults from the analysis and validates clean for a verified MSI', async () => {
    const a = await analysis()
    const c = defaultConfig(a, 'cfg.msi')
    expect(c).toMatchObject({ appName: 'Contoso Tool', publisher: 'Contoso', version: '1.0.0', architecture: 'x64', installBehavior: 'system', setupFile: 'cfg.msi' })
    expect(configProblems(c, { analysis: a })).toEqual([])
    expect(outputFileName(c)).toBe('Contoso-Tool-1.0.0-x64.intunewin')
  })
  it('requires acknowledgement for unverified commands, and clears it when commands change', async () => {
    const a = await analyzeInstaller(put('n.exe', makePe({ marker: 'Nullsoft Install System', version: { ProductName: 'W', CompanyName: 'C', FileVersion: '1.0' } })), 'n.exe')
    let c = defaultConfig(a, 'n.exe')
    c.uninstallCommand = '"C:\\Program Files\\W\\uninstall.exe" /S'
    expect(configProblems(c, { analysis: a }).join()).toMatch(/not verified/)
    c = applyPatch(c, { acknowledgedUnverifiedCommands: true })
    expect(configProblems(c, { analysis: a })).toEqual([])
    c = applyPatch(c, { installCommand: '"n.exe" /S /D=C:\\W' })
    expect(c.acknowledgedUnverifiedCommands).toBe(false)
  })
  it('blocks injection through commands and detection values', async () => {
    const a = await analysis()
    const c = defaultConfig(a, 'cfg.msi')
    expect(configProblems({ ...c, installCommand: 'msiexec /i "cfg.msi" & del C:\\*' }, { analysis: a }).join()).toMatch(/shell operators/)
    expect(configProblems({ ...c, detection: { type: 'file-exists', value: "C:\\x'; Remove-Item *; '" } }, { analysis: a }).join()).toMatch(/plain path/)
    expect(configProblems({ ...c, detection: { type: 'msi-product-code', value: 'not-a-guid' } }, { analysis: a }).join()).toMatch(/ProductCode/)
    expect(configProblems({ ...c, setupFile: '../x.exe' }, { analysis: a }).join()).toMatch(/Setup file/)
    expect(configProblems({ ...c, detection: { type: 'custom-script' } }, { analysis: a }).join()).toMatch(/detection method/)
  })
  it('rejects the generated PowerShell wrapper for non-AppX packages', async () => {
    const a = await analysis()
    const c = { ...defaultConfig(a, 'cfg.msi'), installCommand: 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\install.ps1' }
    expect(configProblems(c, { analysis: a }).join()).toMatch(/only valid for MSIX/)
  })
  it('rejects unknown patch keys', () => {
    expect(configPatchSchema.safeParse({ appName: 'x', evil: 1 }).success).toBe(false)
    expect(configPatchSchema.safeParse({ architecture: 'mips' }).success).toBe(false)
  })
})

describe('generated artifacts', () => {
  const cfg = (over: Partial<PackageConfig> = {}): PackageConfig => ({
    appName: "O'Neil Tool", publisher: 'C', version: '1.2', description: '', installCommand: 'msiexec /i "a.msi" /qn /norestart', uninstallCommand: `msiexec /x "${GUID}" /qn /norestart`,
    detection: { type: 'msi-product-code', value: GUID, minVersion: '1.2' }, installBehavior: 'system', architecture: 'x64',
    setupFile: 'a.msi', acknowledgedUnverifiedCommands: true, ...over,
  })
  it('escapes PowerShell literals', () => { expect(psq("it's")).toBe("'it''s'") })
  it('splits commands into program and raw arguments', () => {
    expect(splitCommand('msiexec /i "a b.msi" /qn')).toEqual({ file: 'msiexec', args: '/i "a b.msi" /qn' })
    expect(splitCommand('"C:\\P F\\u.exe" /S')).toEqual({ file: 'C:\\P F\\u.exe', args: '/S' })
  })
  it('builds MSI detection with the product code and minimum-version check, exiting 0 only on detection', () => {
    const s = detectionScript(cfg())
    expect(s).toContain(`'${GUID}'`)
    expect(s).toContain("$min = '1.2'")
    expect(s).toContain("Write-Output 'Detected'")
    expect(s.trimEnd().endsWith('exit 1')).toBe(true)
  })
  it('uses Start-Process with the setup file from the package folder', () => {
    const s = installScript(cfg({ installCommand: '"app.exe" /S', setupFile: 'app.exe' }))
    expect(s).toContain("Join-Path $PSScriptRoot 'app.exe'")
    expect(s).toContain("$arguments = '/S'")
    expect(s).toContain('exit $proc.ExitCode')
  })
  it('generates AppX scripts for MSIX', () => {
    const c = cfg({ setupFile: 'a.msix', detection: { type: 'appx-package', value: 'Contoso.Tool' } })
    expect(installScript(c)).toContain('Add-AppxPackage')
    expect(uninstallScript(c)).toContain("Get-AppxPackage -AllUsers -Name 'Contoso.Tool'")
  })
  it('escapes quotes in detection values defensively', () => {
    expect(detectionScript(cfg({ detection: { type: 'registry-uninstall', value: "A'B" } }))).toContain("'A''B'")
  })
})

describe('Windows worker client', () => {
  it('requires HTTPS and a token', () => {
    expect(workerConfig({})).toBeNull()
    expect(workerConfig({ WIN_PACKAGER_WORKER_URL: 'http://w:1', WIN_PACKAGER_WORKER_TOKEN: 't' })).toBeNull()
    expect(workerConfig({ WIN_PACKAGER_WORKER_URL: 'https://w:8443/x', WIN_PACKAGER_WORKER_TOKEN: 't' })).toEqual({ url: 'https://w:8443', token: 't' })
  })
  it('reports API Unavailable when unconfigured', async () => {
    expect(await createWorkerClient(null).status()).toMatchObject({ configured: false, state: 'api-unavailable' })
  })
  it('reports API Unavailable when the worker is unreachable or rejects the token, without leaking the token', async () => {
    const down = createWorkerClient({ url: 'https://w', token: 'SECRET' }, (async () => { throw new Error('ECONNREFUSED SECRET') }) as unknown as typeof fetch)
    const s = await down.status()
    expect(s.state).toBe('api-unavailable')
    expect(JSON.stringify(s)).not.toContain('SECRET')
    const denied = createWorkerClient({ url: 'https://w', token: 'SECRET' }, (async () => new Response('{"x":"SECRET"}', { status: 401 })) as unknown as typeof fetch)
    expect(JSON.stringify(await denied.status())).not.toContain('SECRET')
  })
  it('sends the bearer token and reports readiness', async () => {
    let auth = ''
    const ok = createWorkerClient({ url: 'https://w', token: 'tok' }, (async (_u: string, init: RequestInit) => { auth = String((init.headers as Record<string, string>)['authorization']); return Response.json({ name: 'WIN-01', intuneWinAppUtil: true }) }) as unknown as typeof fetch)
    expect(await ok.status()).toEqual({ configured: true, state: 'ready', name: 'WIN-01', canPackage: true })
    expect(auth).toBe('Bearer tok')
  })
  it('understands the WindowsBuildAgent health shape', async () => {
    const agent = createWorkerClient({ url: 'https://w', token: 't' }, (async () => Response.json({ agentName: 'WINDOWS-BUILD-01', intuneWinAppUtilAvailable: false, ready: true })) as unknown as typeof fetch)
    expect(await agent.status()).toEqual({ configured: true, state: 'ready', name: 'WINDOWS-BUILD-01', canPackage: false })
  })
  it('only validates when install, detection, uninstall and post-uninstall detection all pass', () => {
    const pass = (name: 'install' | 'detect-after-install' | 'uninstall' | 'detect-after-uninstall') => ({ name, status: 'pass' as const })
    const all = [pass('install'), pass('detect-after-install'), pass('uninstall'), pass('detect-after-uninstall')]
    expect(evaluateSteps(all).outcome).toBe('validated')
    expect(evaluateSteps(all.slice(0, 3)).outcome).toBe('failed')
    expect(evaluateSteps(all.map(s => (s.name === 'uninstall' ? { ...s, status: 'fail' as const, exitCode: 1603 } : s))).message).toMatch(/uninstall.*1603/)
    expect(evaluateSteps(all.map(s => (s.name === 'detect-after-uninstall' ? { ...s, status: 'skipped' as const } : s))).outcome).toBe('failed')
    expect(evaluateSteps([]).outcome).toBe('failed')
  })
})

describe('signed worker links', () => {
  const now = 1_700_000_000_000
  const url = new URL(signedLink('https://ito.example', 'secret', 'job-1', 'source', 60_000, now))
  const exp = url.searchParams.get('exp'); const sig = url.searchParams.get('sig')
  it('verifies for the same job, purpose and time', () => { expect(verifyLink('secret', 'job-1', 'source', exp, sig, now + 1000)).toBe(true) })
  it('rejects expiry, other jobs, other purposes, other secrets and tampering', () => {
    expect(verifyLink('secret', 'job-1', 'source', exp, sig, now + 61_000)).toBe(false)
    expect(verifyLink('secret', 'job-2', 'source', exp, sig, now)).toBe(false)
    expect(verifyLink('secret', 'job-1', 'output', exp, sig, now)).toBe(false)
    expect(verifyLink('other', 'job-1', 'source', exp, sig, now)).toBe(false)
    expect(verifyLink('secret', 'job-1', 'source', String(Number(exp) + 1e9), sig, now)).toBe(false)
    expect(verifyLink('secret', 'job-1', 'source', exp, 'zz', now)).toBe(false)
  })
})

// Regressions found by running the analyzer on real installers (Chrome/MongoDB MSIs, Notepad++ NSIS).
describe('real-world regressions', () => {
  it('picks the code-signing certificate, not the timestamp responder or a CA', () => {
    const ts = { subject: 'CN=DigiCert Timestamp Responder', issuer: 'CN=DigiCert CA', ca: false, keyUsage: ['1.3.6.1.5.5.7.3.8'] }
    const ca = { subject: 'CN=DigiCert CA', issuer: 'CN=Root', ca: true, keyUsage: [] as string[] }
    const publisher = { subject: 'CN=Google LLC', issuer: 'CN=DigiCert CA', ca: false, keyUsage: ['1.3.6.1.5.5.7.3.3'] }
    expect(pickSigner([ts, ca, publisher])?.subject).toBe('CN=Google LLC')
    expect(pickSigner([publisher, ts])?.subject).toBe('CN=Google LLC')
    expect(pickSigner([ca])).toBeUndefined()
  })
  it('unescapes RFC 2253 characters in the signer name', () => {
    expect(commonName('C=US\nCN=NOTEPAD\\+\\+')).toBe('NOTEPAD++')
  })
  it('reads architecture hints from file names', () => {
    expect(architectureFromFileName('npp.8.9.8.1.Installer.x64.exe')).toBe('x64')
    expect(architectureFromFileName('app-win32-x64.msi')).toBe('x64')
    expect(architectureFromFileName('tool_arm64_setup.exe')).toBe('arm64')
    expect(architectureFromFileName('tool-x86.exe')).toBe('x86')
    expect(architectureFromFileName('setup.exe')).toBeUndefined()
  })
  it('prefers the file-name architecture over a 32-bit installer stub, and warns', async () => {
    const a = await analyzeInstaller(put('Tool.Installer.x64.exe', makePe({ machine: 0x14c, marker: 'Nullsoft Install System', version: { ProductName: 'Tool', FileVersion: '1.0' } })), 'Tool.Installer.x64.exe')
    expect(a.architecture).toBe('x64')
    expect(a.warnings.join()).toMatch(/32-bit.*confirm/)
  })
  it('flags an architecture taken only from the installer stub', async () => {
    const a = await analyzeInstaller(put('plain.exe', makePe({ machine: 0x8664, version: { ProductName: 'T' } })), 'plain.exe')
    expect(a.architecture).toBe('x64')
    expect(a.warnings.join()).toMatch(/comes from the installer executable/)
  })
  it('trims MSI property values', async () => {
    const a = await analyzeInstaller(put('trim.msi', makeMsi({ properties: { ProductCode: GUID, ProductVersion: '1.0', ProductName: 'Langflow ' } })), 'trim.msi')
    expect(a.appName).toBe('Langflow')
  })
})
