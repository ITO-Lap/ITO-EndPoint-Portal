# Windows Package Builder

Upload an installer, inspect it, review/edit the configuration, validate it on Windows, build the `.intunewin`,
and open the output folder. **This module only packages applications — it does not publish, assign or deploy
anything to Intune or Endpoint Central.** The Swift Brew builder and the WinGet workflow are separate and unchanged.

Code: `server/src/routes/winPackager.ts`, `winPackagerWorker.ts`, `server/src/services/winPackager/*`,
`src/pages/WindowsPackageBuilderPage.tsx`, `src/api/winPackager.ts`.

## Workflow and states

1 Upload Source → 2 Inspect & Analyze → 3 Review Configuration → 4 Validate on Windows → 5 Create Package → 6 Output Folder (finished files are copied to `~/Desktop/win-packager/<Application name>/` — override with `WIN_PACKAGER_OUTPUT_DIR`; shows that path with a copy button; "Open output folder" opens it in the file manager, only when the server runs on your own computer — set `WIN_PACKAGER_ALLOW_OPEN_FOLDER=true` to allow it in production for a local-only deployment). Downloads (.intunewin, source, scripts, reports) are on step 5.

States: **Processing**, **Review Required**, **Validation Failed**, **Unsupported**, **API Unavailable**, **Ready**.
*Ready* is only reached when Windows validation passed (install, detection, uninstall, detection-after-uninstall) and,
after packaging, the `.intunewin` exists. A package made without a passed validation stays **Review Required** and shows
`Package Created / Windows Installation Not Tested`.

## What runs where

| Where | What |
|---|---|
| ITO server | Store + SHA-256 the upload (isolated `DATA_DIR/win-packager/<jobId>`), **read-only** inspection (MSI Property table, MSIX manifest, PE headers/version strings/installer markers, ZIP central directory), safe ZIP extraction, config validation, script/metadata generation, guides, audit. **Never executes an uploaded file.** |
| Windows worker | Silent install/detect/uninstall validation and Authenticode validity. Optional: without it, packages are built here but marked "Windows Installation Not Tested". |
| This server (built-in packager) | Creates the `.intunewin` natively (zip + AES-256-CBC + HMAC + `Detection.xml`); nothing from the source is executed. |

Server-side signature reporting is honest: a signature blob is reported as *present — not verified*; only the worker can prove validity.

## Command confidence

*Verified* (MSI: metadata + standard msiexec switches) · *Likely — test required* (recognised Inno Setup / NSIS / WiX Burn /
Advanced Installer / InstallShield / Squirrel / MSIX) · *Unknown — manual command required* (nothing is guessed). EXE uninstall
commands are never guessed. Unverified commands need an explicit acknowledgement before artifacts or packaging.

Command safety: only `msiexec`, the job's setup file, the generated PowerShell wrappers (MSIX/AppX only) or, for uninstall, an
absolute `unins*.exe`/`uninstall*.exe` are accepted; shell operators (`& | ; < > ^` backtick `$(`) and control characters are rejected.
Detection values are restricted to safe character sets and escaped again in generated scripts.

## API (`/api/win-packager`, all behind the session gate + `requireCapability`)

| Method & path | Permission | Purpose |
|---|---|---|
| `GET /status` | read | limits, worker state |
| `GET /jobs`, `GET /jobs/:id` | read | list / get |
| `POST /jobs` (raw body, `x-file-name`) | write | upload + auto-inspect |
| `POST /jobs/:id/inspect`, `/select-installer {entry}` | write | re-inspect; ZIP installer pick + safe extract |
| `DELETE /jobs/:id` | validate | with a package: removes its files from the output folder (`Desktop/win-packager/<app>`), keeps the uploaded job so it can be re-packaged; without one: removes the job |
| `PUT /jobs/:id/config` | write | edit configuration (zod-validated, unknown keys rejected) |
| `POST /jobs/:id/validate` | validate | async Windows validation (202) |
| `POST /jobs/:id/approve {acceptUntested?}` | validate | engineer approval for **packaging** |
| `POST /jobs/:id/package` | validate | async `.intunewin` creation (202) |
| `GET /jobs/:id/artifacts[/:name]` | read | install/uninstall/detection.ps1, package-info.json, README.md, validation-report.json, source, package, sha256.txt, package.log |
| `DELETE /jobs/:id` | validate | remove workspace |

Editing a command, detection rule, setup file, architecture, name or version after validation/approval/packaging clears all three.
Every upload, inspect, edit, validate, approve, package and download is an event on the job and an `audit_logs` row.

## Windows worker contract

Configure `WIN_PACKAGER_WORKER_URL` (HTTPS), `WIN_PACKAGER_WORKER_TOKEN`, `WIN_PACKAGER_PUBLIC_URL`. The server calls (bearer auth):

- `GET /health` → `{ name, intuneWinAppUtil: boolean }`
- `POST /validate` `{ jobId, setupFile, installCommand, uninstallCommand, detectionScript, source:{sha256,sizeBytes}, sourceUrl }` → `{ steps: [{name, status:"pass"|"fail"|"skipped", exitCode, durationMs, rebootIndicated, stdout, stderr}] }` for steps `install`, `detect-after-install`, `uninstall`, `detect-after-uninstall`.
- `POST /package` `{ jobId, setupFile, outputName, sourceUrl, uploadUrl }` → `{ fileName, sizeBytes, sha256 }`.

`sourceUrl` / `uploadUrl` are 30-minute HMAC links (job- and purpose-bound) to `/api/win-packager-worker/:jobId/source` (a zip of the
source folder) and `/output` (PUT of the `.intunewin`; zip magic and 30 GB checked, file name chosen by the server, hash re-verified).

Reference worker: the `WindowsBuildAgent` (.NET, in the Apps Package Builder repo) implements `/health`, `/validate` and `/package`
(`Endpoints/PackagerEndpoints.cs`, `Services/PackagerService.cs`, `PackagerCommandPolicy.cs`), additive to its Brew/WinGet endpoints.
It re-validates every command (msiexec / the setup file / generated scripts / absolute uninstaller only; no shell operators), restricts
transfers to `Packager:AllowedServerHost` over HTTPS, extracts sources with zip-slip checks into a unique workspace, runs only through
`IProcessRunner` with argument lists, and runs `IntuneWinAppUtil.exe` from its configured path outside the source folder. Its
`AgentAuth:ApiKeyHashHex` is the SHA-256 of `WIN_PACKAGER_WORKER_TOKEN`.

**Run the worker only on a disposable VM that is reverted after validation — validation really installs the uploaded software.**
Known limits: argument strings that need literal embedded quotes (e.g. InstallShield `/v"/qn"`) are not supported and fail visibly;
the worker has not been run on Windows with a real installer yet (the .NET tests use a fake process runner).

## Limits

Upload limit `WIN_PACKAGER_MAX_UPLOAD_MB` (≤ 30 GB); source/package > 30 GB is rejected (Unsupported). ZIP: no ZIP64, encryption, symlinks,
traversal/absolute paths, duplicates, over-declared sizes or extreme compression ratios. MSIX/AppX bundles are not supported.
Finished jobs are deleted after `WIN_PACKAGER_RETENTION_DAYS`.
