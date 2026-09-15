<#
  Registers the built app (server/dist/index.js) as a Windows Service using NSSM,
  so it keeps running independently of any logged-in session and restarts on
  crash/reboot. IIS reverse-proxies to it — see web.config in this folder.

  Prerequisites:
    - Node.js LTS installed and on PATH
    - NSSM (https://nssm.cc/download) extracted somewhere, e.g. C:\nssm\nssm.exe
    - Project already built once: npm install && npm run build
      (produces server/dist/index.js and dist/ for the frontend)
    - server\.env configured (copy from server\.env.example)

  Run from an elevated (Administrator) PowerShell prompt:
    .\install-service.ps1 -RepoPath "C:\inetpub\ito-endpoint" -NssmPath "C:\nssm\nssm.exe"

  Re-running is safe: it stops/removes an existing service of the same name first.
#>

param(
  [Parameter(Mandatory = $true)][string]$RepoPath,
  [Parameter(Mandatory = $true)][string]$NssmPath,
  [string]$ServiceName = "ITOEndpointCopilot",
  [string]$NodeExe = (Get-Command node).Source,
  [string]$Port = "4000"
)

$ErrorActionPreference = "Stop"

$entry = Join-Path $RepoPath "server\dist\index.js"
if (-not (Test-Path $entry)) {
  throw "Can't find $entry — run 'npm install && npm run build' in $RepoPath first."
}
if (-not (Test-Path $NssmPath)) {
  throw "NSSM not found at $NssmPath — download from https://nssm.cc/download"
}

$existing = & $NssmPath status $ServiceName 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host "Service '$ServiceName' already exists — stopping and removing it first."
  & $NssmPath stop $ServiceName
  & $NssmPath remove $ServiceName confirm
}

& $NssmPath install $ServiceName $NodeExe $entry
& $NssmPath set $ServiceName AppDirectory $RepoPath
& $NssmPath set $ServiceName AppEnvironmentExtra "PORT=$Port" "NODE_ENV=production"
& $NssmPath set $ServiceName Start SERVICE_AUTO_START
& $NssmPath set $ServiceName AppStdout (Join-Path $RepoPath "logs\service.out.log")
& $NssmPath set $ServiceName AppStderr (Join-Path $RepoPath "logs\service.err.log")
& $NssmPath set $ServiceName AppRotateFiles 1
& $NssmPath set $ServiceName AppRotateBytes 10485760

New-Item -ItemType Directory -Force -Path (Join-Path $RepoPath "logs") | Out-Null

& $NssmPath start $ServiceName

Write-Host "`nService '$ServiceName' installed and started, listening on http://127.0.0.1:$Port"
Write-Host "Point IIS's reverse-proxy web.config at that same port (see web.config in this folder)."
Write-Host "Manage it with: nssm status/stop/start/restart $ServiceName, or via services.msc"
