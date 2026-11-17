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
npm run sync:mac-builder -- --with-agent   # also mirror WindowsBuildAgent (the .NET Windows worker)
```

`apps/mac-package-builder/.synced-from` records where and when it was last mirrored.

## What is and is not copied

Allow-listed only: `Sources`, `Tests`, `scripts`, `docs`, `Package.swift`, `Package.resolved`, `README*.md`, `CHECKLIST.md`.
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
