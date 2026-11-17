# Architecture

MVVM, `async/await` throughout, no Combine beyond `@Published`. Every
external command runs through `ProcessRunner` (protocol `ProcessRunning`),
never through a shell string — this is the seam every other service is
tested against via a mock.

## Services (current)

| Service | Responsibility |
|---|---|
| `HomebrewService` | `brew search` / `brew info --json=v2`, cask+formula metadata |
| `ValidationService` | Requirements panel checks (tool presence, certs, arch support) |
| `ScriptGeneratorService` | postinstall / detection / uninstall shell script generation |
| `SigningService` | `security find-identity`, `productsign`, `pkgutil --check-signature` |
| `NotarizationService` | `notarytool submit --wait`, `stapler staple`, `stapler validate` |
| `PackageInspectorService` | Expands a built `.pkg` (`pkgutil --expand` + `lsbom`) and reports real identifier/version/payload/scripts/signature — facts about the artifact, not the config |
| `ReportService` | Renders `Validation-Report.html` from the manifest + validation summary + inspection |
| `PackageBuilderService` | Orchestrates one end-to-end build: scripts → `pkgbuild` → sign → notarize → inspect → manifest → guide → HTML report |
| `BuildHistoryService` | Persists build history as JSON under Application Support |
| `TemplateService` | Reusable package configuration templates |
| `BuildLogService` | In-memory build console log buffer |

## Data flow (one build)

```
NewPackageViewModel.startBuild()
  → PackageBuilderService.build(configuration, packageInfo, signingIdentity, validation, log, isCancelled)
      → ScriptGeneratorService (postinstall/detect/uninstall)
      → pkgbuild (Online Installer: --nopayload | Enterprise Payload: --root <payload>)
      → SigningService.sign()            (if signPackage)
      → NotarizationService.submitAndWait/staple/validateStapledTicket()  (if notarizePackage)
      → SigningService.verifySignature()  (if signed)
      → PackageInspectorService.inspect(builtPkg)
      → BuildManifest (JSON) + EndpointCentralGuideGenerator (txt) + ReportService (HTML)
  → BuildHistoryService.save(record)
```

## Enterprise Payload support matrix (Phase 1 scope)

| Artifact | Support |
|---|---|
| Cask shipping `.app` in a `.zip` | Supported (`ditto -x -k`) |
| Cask shipping `.app` in a `.dmg` | Supported (`hdiutil attach`) |
| Cask shipping a vendor `.pkg` | Explicitly rejected — re-wrapping a signed vendor installer is not attempted |
| Homebrew formula (Enterprise Payload) | Explicitly rejected — formulas may have multiple bottles/dependencies; only Online Installer mode is supported for formulas |

Rejections throw `PackageBuilderError.unsupportedEnterprisePayload(reason:)`
with the specific reason surfaced to the build log — never a silent fallback.

## Not yet implemented (see docs/KNOWN-LIMITATIONS.md)

Application importer, Package Readiness Analyzer, MDM `.mobileconfig`
generation, dedicated Detection/Uninstall generator services beyond the
current script generator, Endpoint Central bundle folder layout, package
comparison, update catalog, VM-based preflight testing, AI assistant.
