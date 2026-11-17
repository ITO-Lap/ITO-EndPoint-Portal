# App Package Builder

A native macOS SwiftUI app (SwiftPM executable, macOS 14+) that turns a
Homebrew cask or formula into a signed, notarizable `.pkg` installer for
enterprise deployment via Endpoint Central, plus the detection/uninstall
scripts and audit artifacts that deployment requires.

## Run

```bash
swift run AppPackageBuilder
```

Or open `Package.swift` in Xcode and run. Launch it from your own interactive
terminal/Xcode session — a backgrounded launch (e.g. `&` from a script) can
come up without proper window-server focus.

## Build A Distributable App

The release script creates a macOS `.app` bundle containing the compiled
SwiftPM executable and resources. The `Yams` dependency is compiled into the
app; users do not need Swift, SwiftPM, or Xcode installed to launch it.

```bash
scripts/build-release.sh
scripts/build-release.sh --arch universal
```

For distribution, sign the app with a Developer ID certificate. To notarize
it, configure a `notarytool` Keychain profile first and pass both options:

```bash
scripts/build-release.sh \
	--sign "Developer ID Application: Your Company (TEAMID)" \
	--notary-profile release
```

The app still requires macOS 14 or newer. Homebrew remains an optional
external runtime requirement for the package search and installation workflow;
the app's Requirements checks report when it is missing.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the service breakdown,
[docs/SECURITY.md](docs/SECURITY.md) for the security model, and
[docs/KNOWN-LIMITATIONS.md](docs/KNOWN-LIMITATIONS.md) for what's stubbed,
partial, or intentionally unimplemented. [CHECKLIST.md](CHECKLIST.md) tracks
feature completion against the full 10-phase enterprise roadmap.

## App Guardian Platform (Initial Slice)

This repository also contains the separate App Guardian enterprise update platform foundation. The existing Swift package-builder remains unchanged.

```bash
npm install
npm run dev:web
npm run build:web
npm run typecheck
```

The portal has no demo mode or seeded inventory. It requests `/api/v1/apps` and `/api/v1/dashboard/summary` on startup and refreshes live data periodically; failed requests show an explicit error and never fall back to local examples. Configure the API URL in Settings or use `VITE_API_BASE_URL` as the initial value. The macOS package includes a launchable SwiftUI inventory agent, API client, and read-only scanner. The API server runtime, device enrollment flow, XPC helper, and update/install workflow are not implemented yet.

Launch the macOS agent during development with `swift run --package-path apps/mac-agent AppGuardianAgent`. For browser-to-agent launching, install the URL-registered app bundle with `bash apps/mac-agent/scripts/build-app.sh --install`; the AKV Studio workspace card opens it through `appguardian://open`. Configure the endpoint under agent Settings; its health check and inventory routes are defined in [api/openapi.yaml](api/openapi.yaml). Run `swift test --package-path apps/mac-agent` for scanner and API client tests. It scans `/Applications` and the current user's `~/Applications` only and never performs install or update actions.

See [docs/APP-GUARDIAN-ARCHITECTURE.md](docs/APP-GUARDIAN-ARCHITECTURE.md), [docs/ENDPOINT-CENTRAL.md](docs/ENDPOINT-CENTRAL.md), [database/migrations/001_initial_schema.sql](database/migrations/001_initial_schema.sql), and [api/openapi.yaml](api/openapi.yaml). Signing and notarization values are placeholders; no production identity, update source, or credential is included.

## Test

```bash
swift test
```

Requires a full Xcode install (`XCTest`/`Testing` ship with Xcode, not with
Command Line Tools alone — `xcode-select -p` must point at `Xcode.app`).
