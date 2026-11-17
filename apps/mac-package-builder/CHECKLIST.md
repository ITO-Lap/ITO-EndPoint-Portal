# Enterprise roadmap checklist

Status legend: ✅ done · 🟡 partial · ⬜ not started

## Phase 1 — Packaging foundation
- ✅ Homebrew cask/formula search (debounced, cancellable, no orphaned processes)
- ✅ Partial search, debounce, cancellation, keyboard navigation
- ✅ Install-or-upgrade version logic (postinstall script)
- ✅ Application version verification (Enterprise Payload: downloaded `.app`'s actual `CFBundleShortVersionString` compared against Homebrew's recorded version)
- 🟡 Detection-script generator (exact-version match only; no `>=`/combined-condition support yet)
- 🟡 Uninstall-script generator (Homebrew-command-based; no LaunchAgent/support-file/user-data cleanup yet)
- ✅ Package inspector (real `pkgutil --expand` + `lsbom` facts)
- ✅ Signing and notarization validation (verify signature, validate stapled ticket)
- ✅ Build manifest, logs, and HTML validation report
- ✅ Persistent build history
- ✅ Enterprise Payload: `.app` via `.zip`/`.dmg` cask
- ⬜ Enterprise Payload: `.pkg` cask (explicitly rejected, not silently ignored)
- ⬜ Enterprise Payload: offline formula builds (explicitly rejected)

## Phase 2 — Application importer
🟡 Partial: `.app` selection (via file picker, not yet drag-and-drop) with
real signature extraction (bundle ID, Team ID, designated code requirement,
executable path, notarization) and system-extension/LaunchAgent/LaunchDaemon/
privileged-helper/login-item detection — built as part of Managed Settings.
Not started: `.pkg`/`.dmg`/`.zip` container analysis, entitlement dump,
background-service inference, external URL/install-path extraction.

## Phase 3 — Package Readiness Analyzer
⬜ Not started (no dedicated Ready/Warning/Blocked scoring page yet)

## Phase 4 — MDM profile templates
✅ **Managed Settings** feature (Deployment → Managed Settings): generates
real, distinct payloads —
- PPPC (`com.apple.TCC.configuration-profile-policy`) for all 17 requested
  services, with Apple Events target support and conflict detection
- Notifications (`com.apple.notificationsettings`) with presets
- macOS Software Update (`com.apple.SoftwareUpdate`), kept separate from
  third-party app updates
- Third-party app auto-update via a small, hand-verified vendor catalog
  (`com.apple.ManagedClient.preferences`) — refuses to generate anything for
  an unlisted vendor
- System/Network Extensions (`com.apple.system-extension-policy`) — presented
  as two tabs, correctly generating the one real payload type both map to
- Managed Login Items (`com.apple.servicemanagement.managed-login-items`)
  for detected background items
- Custom Preferences (`com.apple.ManagedClient.preferences`) with typed,
  validated values
- Review & Export: per-payload XML preview, validation, conflict warnings,
  individual/combined `.mobileconfig` export

Known gap: no automatic filtering of *which* controls are shown based on a
selected target macOS version — compatibility is displayed per control as
static metadata, not used to hide unsupported options yet.

## Phase 5 — Detection and uninstall engine
🟡 Basic Endpoint Central detection/uninstall exist (Phase 1); multi-target
(Intune/Kandji/generic), version operators, combined conditions, and full
uninstall surface (LaunchAgents/Daemons/helpers/support files/user data) not
started.

## Phase 6 — Endpoint Central bundle
🟡 Manifest, HTML report, deployment guide, detect/uninstall scripts, and
the `.pkg` all exist and are written to the output directory today, but not
yet assembled into the specified `AppName-Version/` folder layout with
`Preflight.sh` or `Required-Profiles/`.

## Phase 7 — Package comparison
⬜ Not started

## Phase 8 — Update catalog
⬜ Not started

## Phase 9 — Testing
🟡 Unit/integration tests added for search, script generation, inspector,
report, comparators, validators (see Tests/). VM-based preflight testing:
not started, and not claimed to work.

## Phase 10 — AI assistant
⬜ Not started
