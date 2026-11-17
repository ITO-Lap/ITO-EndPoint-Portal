# App Package Builder — Installation Guide

Requires macOS 14 (Sonoma) or newer, Apple Silicon or Intel. No Node.js,
Python, Xcode or project dependencies are needed to run the app.

## Install

**DMG:** open `AppPackageBuilder.dmg`, drag *App Package Builder* onto
*Applications*, then launch it from Applications or Launchpad.

**PKG:** double-click `AppPackageBuilder-Installer.pkg` (or deploy it through
MDM/Endpoint Central). It installs to `/Applications`.

### Two ways to install — both supported

The builds are signed with a local certificate, not an Apple Developer ID, so
macOS treats them as "unidentified developer". How you install decides whether
you ever see that warning.

**A. Managed install with Endpoint Central (or any MDM) — no warning**
Software pushed by MDM is not quarantined, so Gatekeeper never prompts.

1. Upload `AppPackageBuilder-Installer.pkg` as a macOS package.
2. Install command: `installer -pkg "AppPackageBuilder-Installer.pkg" -target /`
3. Detection: `endpoint-central/detect.sh` (prints the installed version, exits 1
   if absent), or check bundle ID `com.AKVERMA.AppPackageBuilder`.
4. Uninstall: `endpoint-central/uninstall.sh` (removes the app, keeps user data).
5. Upgrade: deploy the newer `.pkg`; it replaces the app in place.

**B. Manual install, no Endpoint Central**
1. Double-click the `.pkg`. If macOS says it "cannot be opened", right-click the
   `.pkg` → **Open** → **Open** (once). Or use the `.dmg` and drag the app to
   Applications, then right-click the app → **Open** → **Open** (once).
2. The `.pkg` removes the quarantine flag from the installed app, so after a
   `.pkg` install the app opens normally. After a `.dmg` drag-install, if macOS
   still blocks it, run:
   `xattr -dr com.apple.quarantine "/Applications/App Package Builder.app"`

A Developer ID–signed and notarized build removes the warning in every case;
see *Building the installers*.

## Where data lives

| What | Location |
|---|---|
| Build history, templates, catalog | `~/Library/Application Support/AppPackageBuilder/` |
| Logs (`app.log`, rotated at 1 MB) | `~/Library/Logs/AppPackageBuilder/` |
| Windows agent token, signing credentials | macOS Keychain |

Nothing is written inside the `.app`.

## Configuration

The app works offline for local packaging. Some features need extra setup:

- **Cask search and packaging** needs only internet access. Homebrew is
  *not* required: if it isn't installed, the app uses Homebrew's public
  catalog (formulae.brew.sh) and downloads installers directly with SHA-256
  verification. The first search downloads a ~4 MB index, cached for 24 hours in
  `~/Library/Application Support/AppPackageBuilder/cache/`. If Homebrew is
  installed, the app uses it as before. Formula search also works: its ~30 MB index downloads in the
  background on the first search, and formula results appear on later searches.
  Third-party taps are unavailable without Homebrew. Packages generated in "Online Installer" mode still need Homebrew on
  the *target* Macs; use Offline mode to avoid that.
- **Windows packaging** needs a reachable Windows Build Agent. Enter its URL
  and API token under *Windows Packaging → Agent Connection*. The token is
  stored only in Keychain. Internet access is required for WinGet lookups.
- **Signing / notarization of the packages you build** needs a Developer ID
  Installer certificate in Keychain and a `notarytool` profile name (Settings).

## Upgrade

Install the new `.pkg` or drag the new app over the old one (quit it first).
User data is stored outside the app and is kept.

## Uninstall

Delete `/Applications/App Package Builder.app`. To also remove data:

```bash
rm -rf ~/Library/Application\ Support/AppPackageBuilder ~/Library/Logs/AppPackageBuilder
```

Saved Keychain items can be removed in Keychain Access.

## Troubleshooting

- **Startup alert "can't start correctly":** reinstall; check
  `~/Library/Logs/AppPackageBuilder/app.log`.
- **Search says the Homebrew catalog couldn't be reached:** check internet/VPN/proxy access to formulae.brew.sh.
- **Windows agent unreachable:** verify URL, token, network/VPN, and that the
  agent service is running on the Windows host.
- **App won't open (Gatekeeper):** see the warning section above.

## Building the installers (maintainers)

```bash
scripts/package-distribution.sh                 # unsigned, universal
VERSION=1.2.0 \
APP_SIGN_IDENTITY="Developer ID Application: Your Company (TEAMID)" \
PKG_SIGN_IDENTITY="Developer ID Installer: Your Company (TEAMID)" \
NOTARY_PROFILE=release \
scripts/package-distribution.sh                 # signed + notarized
```

Without a Developer ID, run `scripts/create-local-signing-cert.sh` once. Builds
are then signed with a stable local identity (kept in `.signing/`, git-ignored),
so Keychain access and privacy permissions persist across upgrades. The
script uses it automatically and never notarizes with it.

One-time notarization setup:
`xcrun notarytool store-credentials release --apple-id <id> --team-id <TEAMID> --password <app-specific-password>`.
Outputs land in `dist/`.
