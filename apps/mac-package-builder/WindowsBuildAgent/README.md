# App Package Builder — Windows Build Agent

This agent is deployed on a managed Windows host. It is part of Brew Package
Builder, not a general remote shell: its HTTPS API exposes only health, WinGet
catalog, typed download/package jobs, status, cancellation, and named artifact
download.

## Prerequisites

- Windows PowerShell 5.1 or PowerShell 7, running as a service account allowed
  to use WinGet and write to the configured workspace.
- WinGet, and `IntuneWinAppUtil.exe` when Intune output is required.
- An HTTPS certificate bound to the configured listener prefix. Do not bind an
  HTTP listener or expose this service to the public internet.
- A randomly generated bearer token. Store only its SHA-256 hash in config.

Copy `agent-config.example.json` to a protected location, populate it, create
the HTTPS certificate binding, then run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy AllSigned -File .\WindowsBuildAgent.ps1 -ConfigPath C:\ProgramData\AppPackageBuilder\agent-config.json
```

The Mac application stores the bearer token in Keychain and communicates only
over HTTPS. The agent validates it using a constant-time comparison to the
configured SHA-256 value.

## Agent response contract

The download job reports the expected/actual SHA-256, Authenticode outcome,
publisher, version, and MSI product code. A hash mismatch, invalid signature,
publisher mismatch, missing manifest data, or unsupported extension fails the
job. EXE/MSIX jobs without agent-verified silent switches return
`awaitingApproval` rather than guessing.

## ITO Windows Package Builder endpoints

In addition to the Brew Package Builder endpoints above, the agent serves the ITO Endpoint "Windows Package Builder"
contract: `POST /validate` (silent install → detection → uninstall → detection-gone) and `POST /package`
(`IntuneWinAppUtil.exe`). Set `Packager:AllowedServerHost` in `appsettings.json` to the ITO server's hostname — the only host the
agent will fetch sources from or upload packages to — and set `AgentAuth:ApiKeyHashHex` to the SHA-256 of the ITO server's
`WIN_PACKAGER_WORKER_TOKEN`. Commands are re-validated here (msiexec, the setup file, generated wrapper scripts, or an installed
uninstaller only). **Validation really installs the uploaded software: run the agent on a disposable VM that is reverted afterwards.**
See the ITO repo's `docs/07-features/WINDOWS-PACKAGE-BUILDER.md`.
