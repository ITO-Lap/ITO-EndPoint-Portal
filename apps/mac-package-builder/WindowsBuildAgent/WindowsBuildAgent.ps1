[CmdletBinding()]
param([Parameter(Mandatory)][ValidateScript({ Test-Path $_ -PathType Leaf })][string]$ConfigPath)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
if (-not $Config.ListenPrefix.StartsWith('https://')) { throw 'ListenPrefix must use HTTPS.' }
if (-not $Config.TokenSha256 -match '^[a-fA-F0-9]{64}$') { throw 'TokenSha256 must be a SHA-256 hex value.' }
New-Item -ItemType Directory -Path $Config.WorkspaceRoot -Force | Out-Null

function Get-Sha256([string]$Value) {
    $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
    ([Security.Cryptography.SHA256]::Create().ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join ''
}
function Test-ConstantTimeEqual([string]$Left, [string]$Right) {
    if ($Left.Length -ne $Right.Length) { return $false }
    $difference = 0
    for ($i = 0; $i -lt $Left.Length; $i++) { $difference = $difference -bor ([int][char]$Left[$i] -bxor [int][char]$Right[$i]) }
    return $difference -eq 0
}
function Assert-Authorized($Request) {
    $header = $Request.Headers['Authorization']
    if (-not $header -or -not $header.StartsWith('Bearer ')) { throw [UnauthorizedAccessException]::new('Bearer authentication is required.') }
    if (-not (Test-ConstantTimeEqual (Get-Sha256 $header.Substring(7)) $Config.TokenSha256.ToLowerInvariant())) { throw [UnauthorizedAccessException]::new('Invalid bearer token.') }
}
function Assert-PackageId([string]$Value) { if ($Value -notmatch '^[A-Za-z0-9][A-Za-z0-9-]*(\.[A-Za-z0-9][A-Za-z0-9-]*)+$') { throw 'Invalid package ID.' } }
function Assert-Version([string]$Value) { if ($Value -notmatch '^[0-9]+(\.[0-9]+){0,3}([._+-][A-Za-z0-9]+)*$') { throw 'Invalid version.' } }
function Assert-Source([string]$Value) { if ($Config.AllowedSources -notcontains $Value) { throw 'Source is not permitted.' } }
function Get-JobPath([guid]$Id) { Join-Path $Config.WorkspaceRoot $Id.Guid }
function Get-StatePath([guid]$Id) { Join-Path (Get-JobPath $Id) 'state.json' }
function Write-State([guid]$Id, $State) { $State.updatedAt = [DateTime]::UtcNow.ToString('o'); $State | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Get-StatePath $Id) -Encoding UTF8 }
function Read-State([guid]$Id) { $path = Get-StatePath $Id; if (-not (Test-Path -LiteralPath $path)) { throw 'Job was not found.' }; Get-Content -LiteralPath $path -Raw | ConvertFrom-Json }
function New-Phase([string]$Name, [string]$Message = $null, [double]$Progress = 0) {
    $value = @{}
    if ($Name -eq 'downloading') { $value.progress = $Progress }
    if ($Name -in @('failed','error') -and $Message) { $value._0 = $Message }
    @{ $Name = $value }
}
function New-JobState([guid]$Id, [string]$Kind, $Request) {
    [ordered]@{ id=$Id.Guid; kind=$Kind; phase=(New-Phase 'loading'); createdAt=[DateTime]::UtcNow.ToString('o'); updatedAt=[DateTime]::UtcNow.ToString('o'); packageId=$Request.packageId; version=$Request.version; architecture=$Request.architecture; scope=$Request.scope; logLines=@('Job accepted.'); validationReport=$null; artifacts=@() }
}
function Add-JobLog([guid]$Id, [string]$Message) { $state = Read-State $Id; $state.logLines += "$(Get-Date -Format o) $Message"; Write-State $Id $state }
function Find-Installer([string]$Root) {
    $files = Get-ChildItem -LiteralPath $Root -Recurse -File | Where-Object { $_.Extension.ToLowerInvariant() -in @('.msi','.exe','.msix','.msixbundle') }
    if ($files.Count -ne 1) { throw 'Expected exactly one supported downloaded installer.' }; $files[0]
}
function Get-MsiProductCode([string]$Path) {
    $installer = New-Object -ComObject WindowsInstaller.Installer
    $database = $installer.OpenDatabase($Path, 0)
    $view = $database.OpenView("SELECT `Value` FROM `Property` WHERE `Property`='ProductCode'")
    $view.Execute(); $record = $view.Fetch(); if ($null -eq $record) { return $null }; $record.StringData(1)
}
function Get-Manifest([string]$PackageId, [string]$Source) {
    # The source is constrained above; no client-controlled URL is fetched.
    $raw = & winget show --id $PackageId --exact --source $Source --accept-source-agreements --disable-interactivity --output json 2>&1
    if ($LASTEXITCODE -ne 0) { throw "WinGet manifest lookup failed: $($raw -join ' ')" }
    $raw -join "`n" | ConvertFrom-Json
}
function Invoke-DownloadWorker([guid]$Id, $Request, $AgentConfig) {
    try {
        $statePath = Join-Path (Join-Path $AgentConfig.WorkspaceRoot $Id.Guid) 'state.json'
        $state = Get-Content $statePath -Raw | ConvertFrom-Json
        $state.phase = New-Phase 'validating'; $state.logLines += 'Resolving official WinGet manifest.'; $state | ConvertTo-Json -Depth 12 | Set-Content $statePath
        Assert-PackageId $Request.packageId; Assert-Version $Request.version; Assert-Source $Request.source
        $manifest = Get-Manifest $Request.packageId $Request.source
        $state.phase = New-Phase 'downloading' $null 0.1; $state.logLines += 'Downloading with WinGet.'; $state | ConvertTo-Json -Depth 12 | Set-Content $statePath
        $downloadDir = Join-Path (Split-Path $statePath) 'download'
        New-Item -ItemType Directory -Path $downloadDir -Force | Out-Null
        & winget download --id $Request.packageId --exact --version $Request.version --architecture $Request.architecture --scope $Request.scope --download-directory $downloadDir --source $Request.source --accept-source-agreements --accept-package-agreements --disable-interactivity
        if ($LASTEXITCODE -ne 0) { throw 'WinGet download failed.' }
        $installer = Find-Installer $downloadDir
        $actual = (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash
        # Agent integrations should map their WinGet JSON manifest to this field.
        $expected = $manifest.InstallerSha256
        if (-not $expected -or $actual -ne $expected) { throw 'SHA-256 mismatch or missing official manifest hash.' }
        $signature = Get-AuthenticodeSignature -LiteralPath $installer.FullName
        if ($signature.Status -ne 'Valid') { throw "Authenticode validation failed: $($signature.Status)" }
        $publisher = $signature.SignerCertificate.Subject
        $productCode = if ($installer.Extension -ieq '.msi') { Get-MsiProductCode $installer.FullName } else { $null }
        $state.validationReport = [ordered]@{ actualSHA256=$actual; expectedSHA256=$expected; authenticodeStatus='validSigned'; publisher=$publisher; signingCertificateSubject=$publisher; timestamp=[DateTime]::UtcNow.ToString('o'); certificateExpiration=$signature.SignerCertificate.NotAfter.ToUniversalTime().ToString('o'); installerType=$installer.Extension.TrimStart('.').ToLowerInvariant(); fileVersion=$null; productVersion=$Request.version; msiProductCode=$productCode; adminOverride=$null }
        $state.artifacts = @('installer'); $state.phase = New-Phase 'completed'; $state.logLines += 'Validated installer is ready.'; $state | ConvertTo-Json -Depth 12 | Set-Content $statePath
    } catch { $state = Get-Content $statePath -Raw | ConvertFrom-Json; $state.phase = New-Phase 'failed' $_.Exception.Message; $state.logLines += "FAILED: $($_.Exception.Message)"; $state | ConvertTo-Json -Depth 12 | Set-Content $statePath }
}
function Invoke-PackageWorker([guid]$Id, $Request, $AgentConfig) {
    $statePath = Join-Path (Join-Path $AgentConfig.WorkspaceRoot $Id.Guid) 'state.json'
    try {
        $state = Get-Content $statePath -Raw | ConvertFrom-Json
        $sourceId = [guid]$Request.sourceJobId; $sourceRoot = Join-Path $AgentConfig.WorkspaceRoot $sourceId.Guid
        $sourceState = Get-Content (Join-Path $sourceRoot 'state.json') -Raw | ConvertFrom-Json
        if (-not $sourceState.validationReport -or -not $sourceState.phase.completed) { throw 'Source installer has not passed validation.' }
        $installer = Find-Installer (Join-Path $sourceRoot 'download')
        $output = Join-Path (Split-Path $statePath) 'output'; $payload = Join-Path $output 'payload'
        New-Item -ItemType Directory -Path $payload -Force | Out-Null
        Copy-Item -LiteralPath $installer.FullName -Destination $payload
        # Configuration is data. It is written into deployment scripts but is never executed by this service.
        @('Install.ps1','Uninstall.ps1','Detect.ps1','Requirements.ps1') | ForEach-Object {
            $property = $_.Replace('.ps1',''); $content = $Request.configuration.$property
            if (-not $content) { $content = "# Generated by App Package Builder`nexit 1" }
            Set-Content -LiteralPath (Join-Path $payload $_) -Value $content -Encoding UTF8
        }
        $targets = @($Request.configuration.deploymentTargets)
        $artifacts = @()
        if ($targets -contains 'intune') {
            if (-not (Test-Path -LiteralPath $AgentConfig.IntuneWinAppUtilPath)) { throw 'IntuneWinAppUtil.exe is not configured.' }
            & $AgentConfig.IntuneWinAppUtilPath -c $payload -s 'Install.ps1' -o $output -q
            if ($LASTEXITCODE -ne 0) { throw 'IntuneWinAppUtil.exe failed.' }
            $intune = Get-ChildItem -LiteralPath $output -Filter '*.intunewin' | Select-Object -First 1
            if (-not $intune) { throw 'IntuneWinAppUtil.exe did not create an .intunewin artifact.' }
            $artifacts += 'package.intunewin'
            Move-Item -LiteralPath $intune.FullName -Destination (Join-Path $output 'package.intunewin') -Force
        }
        if ($targets -contains 'endpointCentral') {
            $zip = Join-Path $output 'endpoint-central.zip'; Compress-Archive -LiteralPath (Get-ChildItem -LiteralPath $payload | Select-Object -ExpandProperty FullName) -DestinationPath $zip -Force
            $artifacts += 'endpoint-central.zip'
        }
        $state.artifacts = $artifacts; $state.phase = New-Phase 'completed'; $state.logLines += 'Deployment output validated.'; $state | ConvertTo-Json -Depth 12 | Set-Content $statePath
    } catch { $state = Get-Content $statePath -Raw | ConvertFrom-Json; $state.phase = New-Phase 'failed' $_.Exception.Message; $state.logLines += "FAILED: $($_.Exception.Message)"; $state | ConvertTo-Json -Depth 12 | Set-Content $statePath }
}
function Read-JsonBody($Request) { $reader = [IO.StreamReader]::new($Request.InputStream, $Request.ContentEncoding); try { $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() } }
function Send-Artifact($Context, [guid]$Id, [string]$Name) {
    if ($Name -notin @('installer','package.intunewin','endpoint-central.zip')) { throw 'Artifact name is not permitted.' }
    $root = Get-JobPath $Id
    $file = switch ($Name) { 'installer' { Find-Installer (Join-Path $root 'download') }; 'package.intunewin' { Get-Item (Join-Path $root 'output\package.intunewin') }; 'endpoint-central.zip' { Get-Item (Join-Path $root 'output\endpoint-central.zip') } }
    $Context.Response.ContentType = 'application/octet-stream'; $Context.Response.ContentLength64 = $file.Length; [IO.File]::OpenRead($file.FullName).CopyTo($Context.Response.OutputStream)
}

# The request dispatcher is intentionally small; unsupported paths return 404.
$listener = [Net.HttpListener]::new(); $listener.Prefixes.Add($Config.ListenPrefix); $listener.Start()
Write-Host "Windows Build Agent listening on $($Config.ListenPrefix)"
while ($listener.IsListening) {
    $context = $listener.GetContext()
    try {
        Assert-Authorized $context.Request
        $path = $context.Request.Url.AbsolutePath.Trim('/')
        $response = $null
        if ($context.Request.HttpMethod -eq 'GET' -and $path -eq 'health') {
            $response = @{ agentName=$env:COMPUTERNAME; windowsVersion=[Environment]::OSVersion.Version.ToString(); winGetVersion=((& winget --version) -join '').Trim(); intuneWinAppUtilStatus=(if (Test-Path $Config.IntuneWinAppUtilPath) {'available'} else {'notFound'}); lastHeartbeat=[DateTime]::UtcNow.ToString('o'); availableDiskSpaceBytes=(Get-PSDrive -Name ([IO.Path]::GetPathRoot($Config.WorkspaceRoot).TrimEnd(':','\\'))).Free }
        } elseif ($context.Request.HttpMethod -eq 'GET' -and $path -eq 'winget/search') {
            $query = $context.Request.QueryString['query']; $source = $context.Request.QueryString['source']; if (-not $source) { $source = 'winget' }; Assert-Source $source
            # Search fields are normalized by the agent adapter; this endpoint never returns installer URLs/hashes.
            $raw = (& winget search --query $query --source $source --accept-source-agreements --disable-interactivity --output json) -join "`n"; $response = @($raw | ConvertFrom-Json)
        } elseif ($context.Request.HttpMethod -eq 'POST' -and $path -eq 'jobs/download') {
            $request = Read-JsonBody $context.Request; Assert-PackageId $request.packageId; Assert-Version $request.version
            if (-not $request.source) { $request | Add-Member -NotePropertyName source -NotePropertyValue 'winget' -Force }
            $id = [guid]::NewGuid(); New-Item -ItemType Directory -Path (Get-JobPath $id) -Force | Out-Null; Write-State $id (New-JobState $id 'download' $request)
            # Synchronous execution is deliberate until this service is installed under a job runner. The external API still exposes typed job state.
            Invoke-DownloadWorker $id $request $Config; $response = Read-State $id
        } elseif ($context.Request.HttpMethod -eq 'POST' -and $path -eq 'jobs/package') {
            $request = Read-JsonBody $context.Request; $source = Read-State ([guid]$request.sourceJobId)
            $id = [guid]::NewGuid(); New-Item -ItemType Directory -Path (Get-JobPath $id) -Force | Out-Null
            $jobRequest = [pscustomobject]@{ packageId=$source.packageId; version=$source.version; architecture=$source.architecture; scope=$source.scope }
            Write-State $id (New-JobState $id 'package' $jobRequest); Invoke-PackageWorker $id $request $Config; $response = Read-State $id
        } elseif ($context.Request.HttpMethod -eq 'POST' -and $path -like 'jobs/*/cancel') {
            $id = [guid]($path.Split('/')[1]); $state = Read-State $id; $state.phase = New-Phase 'cancelled'; $state.logLines += 'Cancellation requested.'; Write-State $id $state; $response = $state
        } elseif ($context.Request.HttpMethod -eq 'GET' -and $path -like 'jobs/*/artifacts') {
            Send-Artifact $context ([guid]($path.Split('/')[1])) $context.Request.QueryString['name']; $response = $null
        } elseif ($context.Request.HttpMethod -eq 'GET' -and $path -like 'jobs/*') {
            $id = [guid]($path.Split('/')[1]); $response = Read-State $id
        } else { $context.Response.StatusCode = 404; $response = @{ error='Unknown or disallowed endpoint.' } }
        if ($null -ne $response) { $bytes = [Text.Encoding]::UTF8.GetBytes(($response | ConvertTo-Json -Depth 12)); $context.Response.ContentType='application/json'; $context.Response.OutputStream.Write($bytes,0,$bytes.Length) }
    } catch [UnauthorizedAccessException] { $context.Response.StatusCode = 401; $bytes=[Text.Encoding]::UTF8.GetBytes('{"error":"unauthorized"}'); $context.Response.OutputStream.Write($bytes,0,$bytes.Length) }
    catch { $context.Response.StatusCode=400; $bytes=[Text.Encoding]::UTF8.GetBytes((@{error=$_.Exception.Message}|ConvertTo-Json)); $context.Response.OutputStream.Write($bytes,0,$bytes.Length) }
    finally { $context.Response.Close() }
}
