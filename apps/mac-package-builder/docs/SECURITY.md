# Security model

- **No shell interpolation.** Every external command runs via `Process` with
  an argument array through `ProcessRunner` — never `bash -c "<string>"`,
  never `eval`. `ScriptGeneratorService` additionally wraps every dynamic
  value with `ShellEscaping.shellSingleQuoted` before it's written into a
  generated script, even though every value has already passed
  `PackageConfiguration.validateStrictFields()`.
- **Input validation.** `Validators` enforces regex-anchored formats for
  Homebrew tokens, reverse-DNS package identifiers, and version strings
  before any of them reach a script, plist, or filesystem path.
  `PathValidator.canonicalize`/`removeContentsSafely` reject paths that
  resolve outside an expected root, preventing traversal.
- **Temp directories.** Builds and package inspection use per-operation
  UUID-named subdirectories under `FileManager.default.temporaryDirectory`,
  removed via `PathValidator.removeContentsSafely(_:mustBeWithin:)` in a
  `defer` block — never a bare `rm -rf` of a user-supplied path.
- **Checksum verification.** Enterprise Payload downloads are SHA-256
  verified against Homebrew's recorded checksum before extraction; a mismatch
  aborts the build (`PackageBuilderError.checksumMismatch`) rather than
  packaging unverified content.
- **Signature/notarization are checked, not assumed.** After signing,
  `SigningService.verifySignature` (`pkgutil --check-signature`) is called
  and the result recorded in the manifest/report. After stapling,
  `NotarizationService.validateStapledTicket` (`stapler validate`) confirms
  the ticket, rather than trusting a zero exit code from `staple` alone.
- **No Gatekeeper/SIP/signature bypass.** Unsigned artifacts are packaged
  with a warning logged, never with signature checks disabled or skipped.
- **Credentials never touch source or preferences.** Signing uses a Keychain
  identity reference (SHA-1 + common name only); notarization uses a
  `notarytool` Keychain profile *name* — the app never asks for, stores, or
  transmits an Apple ID password or API key itself.
- **Overwrite protection.** `PackageBuilderError.outputExists` blocks a build
  from silently overwriting an existing `.pkg` unless `overwriteExisting` is
  explicitly set.
- **Cancellation actually stops child processes.** `ProcessRunner.run` uses
  `withTaskCancellationHandler` to call `Process.terminate()` on the real
  child process when the Swift `Task` is cancelled — cancelling a build or a
  Homebrew search does not leave an orphaned process running.
- **Auditable log.** `BuildLogService` captures every step of a build; the
  generated `Validation-Report.html` and `Build-Manifest.json` are written
  alongside the package so a build is reviewable after the fact.

## Known gaps against the security checklist

- Uninstall generation is currently Homebrew-command-based only; it does not
  yet enumerate/remove LaunchAgents, LaunchDaemons, privileged helpers, or
  user data (Phase 5 scope) — nothing destructive beyond `brew uninstall` is
  attempted today.
- AI assistant (Phase 10) is not implemented — no credentials, no execution
  path, no log redaction concern yet exists in the running code.
