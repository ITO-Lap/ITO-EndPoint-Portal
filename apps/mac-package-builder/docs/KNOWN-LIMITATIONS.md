# Known limitations

## Test execution

`swift test` cannot run in a Command-Line-Tools-only environment — `XCTest`
and `Testing` ship with Xcode.app, not with the CLT package. All new tests in
this change were compile-checked (`swift build --build-tests`, ignoring only
the `no such module 'XCTest'` failures every pre-existing test file already
hits the same way) and, where they exercise real system tools (`pkgbuild`,
`pkgutil`, `lsbom`), independently verified by running those exact commands
by hand and confirming the output matches what the parsing code expects. Run
`swift test` on a machine with full Xcode installed to execute the suite.

## Phase 1 scope actually implemented this round

- Homebrew search: debounced, cancellable, stale-result-safe, keyboard nav.
- Install-or-upgrade logic in the generated postinstall script.
- Detection script: exact-version match only (no `>=` operator yet — see
  Phase 5 in the roadmap).
- Uninstall script: Homebrew-command-based; does not yet remove
  LaunchAgents/Daemons, privileged helpers, or user data.
- Package inspector: real `pkgutil --expand` + `lsbom` facts (identifier,
  version, install location, payload count/sample, scripts, signature).
- Signing/notarization: sign, verify signature, submit, staple, validate
  stapled ticket — all real `security`/`productsign`/`notarytool`/`stapler`
  calls, no simulated success.
- Build manifest (JSON), Endpoint Central deployment guide (txt), and a new
  HTML validation report combining all of the above.
- Persistent build history (pre-existing, unchanged).

## Explicitly not implemented (Phases 2–10 of the requested roadmap)

These require substantially more work than a single pass and are marked
unavailable rather than stubbed with fake success states:

- **Application importer** (drag-and-drop `.app`/`.pkg`/`.dmg`/`.zip`
  analysis: Team ID, entitlements, LaunchAgents, extensions, etc.)
- **Package Readiness Analyzer** page (PPPC/system-extension/network-extension
  inference, Ready/Warning/Blocked scoring)
- **MDM `.mobileconfig` template generation**
- **Dedicated multi-target Detection/Uninstall generator services** (Endpoint
  Central / Intune / Kandji / generic, with `>=` version operators and
  combined conditions) — today's `ScriptGeneratorService` only targets the
  shape Endpoint Central needs
- **Endpoint Central bundle folder layout** (`AppName-Version/` with
  `Required-Profiles/`, `Preflight.sh`, etc.) and any upload integration
- **Package comparison** between two builds
- **Update catalog** with an approval workflow
- **VM-based preflight testing**
- **AI assistant**

None of these are present as disabled buttons or placeholder text in the UI
— they simply don't exist yet, so there is nothing in the running app that
misrepresents what it can do.
