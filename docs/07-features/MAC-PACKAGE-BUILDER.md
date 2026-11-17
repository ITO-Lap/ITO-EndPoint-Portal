# macOS App Package Builder (mirrored copy)

`apps/mac-package-builder/` is a **mirror** of the native macOS *App Package Builder* (SwiftUI, macOS 14+): Homebrew →
signed `.pkg`, WinGet/WinTuner local packaging, and the **Local Installer** packager (browse an `.msi`/`.exe` →
`.intunewin`, with MSI ProductCode/uninstall/detection read from the MSI itself). It is not part of the web app's
build and does not run in the browser — build it on a Mac.

## Keeping it in sync

The original lives at `../Apps Package Builder` (override with `MAC_BUILDER_SOURCE` or `--source`). **Never edit the
copy** — change the original, then:

```bash
npm run sync:mac-builder     # mirror the original into apps/mac-package-builder (adds, updates and deletes)
npm run check:mac-builder    # exit 1 if the copy differs from the original (use before committing / in CI)
```

`apps/mac-package-builder/.synced-from` records where and when it was last mirrored.

## What is and is not copied

The whole project is mirrored: `Sources`, `Tests`, `scripts`, `docs`, `WindowsBuildAgent` (the .NET Windows worker), the App Guardian workspace (`apps/`, `services/`, `api/`, `database/`, `package.json`, `package-lock.json`), `Package.swift`, `Package.resolved`, `README*.md`, `CHECKLIST.md`. Only an allow-list of top-level paths is read, so stray local output (such as the original's `~` folder) is never copied.
Never copied: `.build`, `dist*`, `node_modules`, `bin/obj`, `.signing/`, keychains, `keychain.pass`, `*.p12/.pfx/.pem/.key`,
`.env*`, `*.dmg/.pkg/.app`. The script aborts (exit 2) if any signing material or secret is found in the copy.

## Build (on a Mac)

```bash
cd apps/mac-package-builder
swift test                    # 217 tests
scripts/build-release.sh      # -> dist/App Package Builder.app (unsigned unless --sign is given)
```

## Why a script and not a git subtree/submodule

The original is not its own git repository (it sits inside a larger one and its sources are untracked), so there is
nothing for a subtree or submodule to point at. If it is moved into its own repository later, replace the script with
`git subtree add --prefix=apps/mac-package-builder <repo> main --squash`.

## Portal page — Package Builder → Mac Package Builder

The portal lists **Mac Package Builder** under the **Package Builder** menu (next to Windows Package Builder). The page is
read-only: it explains the tool, shows the bundled source's sync status, gives copyable build commands, and offers published
builds for download. It cannot run the macOS app — that is a native app.

| API (`/api/mac-packager`) | Permission | Purpose |
|---|---|---|
| `GET /info` | `macPackager.read` | features, requirements, build steps, source/sync info, published builds (name, size, date, SHA-256) |
| `GET /download/:name` | `macPackager.read` | stream one published `.dmg` / `.pkg` / `.zip` (audited as `macPackager.download`) |

**Publishing a build for download:** set `MAC_PACKAGE_BUILDER_DIST_DIR` in `server/.env` to a folder and copy the finished
installer into it (e.g. zip or `.dmg` of `App Package Builder.app`). Only top-level regular files named `*.dmg|*.pkg|*.zip` are
listed; symlinks, directories, dotfiles and any other file type are ignored and can never be downloaded. Publish only builds you
trust — the page shows each file's SHA-256 so users can verify it. Unsigned builds need right-click → Open (Gatekeeper); sign and
notarize with `scripts/build-release.sh --sign … --notary-profile …` for wider distribution.

Access: page permission `Mac Package Builder` plus capability `macPackager.read` (IT Admin by default; Helpdesk has neither).
