# App Guardian macOS Agent

This independent Swift package provides a SwiftUI desktop agent and a read-only application inventory library. It scans `/Applications` and the current user's `~/Applications` for `.app` bundles and collects the bundle identifier, display name, short and bundle versions, install path/source, last-modified date, signing Team ID, and code-signature validity.

The scanner does not install, update, delete, or change application files. The app can test an API health endpoint and submit scanned inventory using a short-lived access token stored in Keychain. It does not use a privileged helper, XPC, subprocesses, or broad filesystem permissions. Missing roots and malformed bundles are returned as per-path issues so a scan can report partial results.

## Build and test

```bash
swift run --package-path apps/mac-agent AppGuardianAgent
swift test --package-path apps/mac-agent
swift build --package-path apps/mac-agent
bash apps/mac-agent/scripts/build-app.sh --install
```

The package requires macOS 14+ because code-signature inspection uses Apple's Security framework. Unit tests use temporary synthetic bundles and an injected signature inspector; they do not depend on the machine's installed apps.

For browser launch integration, install the `.app` bundle with `bash apps/mac-agent/scripts/build-app.sh --install`. It installs to `~/Applications/App Guardian.app`, registers the `appguardian://open` URL scheme, and launches the app. Clicking the AKV Studio workspace control in the portal invokes this scheme; the browser may ask permission before opening the local app. `swift run` is useful for development but does not register a URL scheme.

In the agent's **Settings**, set the App Guardian API base URL (for example `https://api.example.com/api/v1`) and use **Test connection** to call `GET /health`. Save a short-lived access token to the macOS Keychain, scan the device, then use **Upload inventory** to call `POST /agent/inventory`. Remote API URLs must use HTTPS; HTTP is accepted only for localhost development. The API runtime, device enrollment flow, and automatic Entra token renewal are not implemented yet, so inventory upload requires a separately deployed API and a valid device-scoped token.

## Next boundaries

- Add menu-bar integration and release packaging for the current SwiftUI desktop app.
- Complete the API runtime, device enrollment flow, and automatic Entra token renewal for authenticated reporting.
- Design the separate signed helper and typed XPC interface only when implementing policy-gated installation. The helper must independently validate every update and must never accept shell text or arbitrary commands.

See `../../docs/APP-GUARDIAN-ARCHITECTURE.md` and `../../docs/ENDPOINT-CENTRAL.md`. No installer, LaunchDaemon, XPC service, signing identity, or notarization is implemented or claimed yet.