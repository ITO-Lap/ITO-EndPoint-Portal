#!/bin/zsh
# Builds the universal .app, a .pkg installer and a .dmg into ./dist.
#
# Signing/notarization are optional and driven by environment variables:
#   APP_SIGN_IDENTITY   "Developer ID Application: Name (TEAMID)"
#   PKG_SIGN_IDENTITY   "Developer ID Installer: Name (TEAMID)"
#   NOTARY_PROFILE      notarytool keychain profile (xcrun notarytool store-credentials)
#   VERSION             default 1.0.0
# Without them, unsigned artifacts are produced.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="App Package Builder"
FILE_STEM="AppPackageBuilder"
BUNDLE_ID="com.AKVERMA.AppPackageBuilder"
VERSION="${VERSION:-1.0.0}"
OUTPUT_DIR="${OUTPUT_DIR:-$ROOT_DIR/dist}"
APP_SIGN_IDENTITY="${APP_SIGN_IDENTITY:-}"
PKG_SIGN_IDENTITY="${PKG_SIGN_IDENTITY:-}"
NOTARY_PROFILE="${NOTARY_PROFILE:-}"

# Auto-detect Developer ID certificates in the keychain when not given explicitly.
if [[ -z "$APP_SIGN_IDENTITY" ]]; then
    APP_SIGN_IDENTITY="$(security find-identity -v -p codesigning | sed -n 's/.*"\(Developer ID Application:[^"]*\)".*/\1/p' | head -1)"
fi
if [[ -z "$PKG_SIGN_IDENTITY" ]]; then
    PKG_SIGN_IDENTITY="$(security find-identity -v | sed -n 's/.*"\(Developer ID Installer:[^"]*\)".*/\1/p' | head -1)"
fi
# No Developer ID? Fall back to the local self-signed identity (stable across
# upgrades; not Gatekeeper-trusted, so never notarized). Created by
# scripts/create-local-signing-cert.sh.
LOCAL_KEYCHAIN="$ROOT_DIR/.signing/local-signing.keychain-db"
USING_LOCAL_IDENTITY=0
if [[ -z "$APP_SIGN_IDENTITY" && -f "$LOCAL_KEYCHAIN" && -f "$ROOT_DIR/.signing/keychain.pass" ]]; then
    security unlock-keychain -p "$(cat "$ROOT_DIR/.signing/keychain.pass")" "$LOCAL_KEYCHAIN"
    APP_SIGN_IDENTITY="App Package Builder Local Signing"
    export SIGN_KEYCHAIN="$LOCAL_KEYCHAIN"
    USING_LOCAL_IDENTITY=1
fi
KEYCHAIN_ARGS=()
[[ -n "${SIGN_KEYCHAIN:-}" ]] && KEYCHAIN_ARGS=(--keychain "$SIGN_KEYCHAIN")
print "App signing identity: ${APP_SIGN_IDENTITY:-none (ad-hoc)}"
print "Pkg signing identity: ${PKG_SIGN_IDENTITY:-none (unsigned)}"
print "Notary profile:       ${NOTARY_PROFILE:-none (not notarized)}"

APP_PATH="$OUTPUT_DIR/$APP_NAME.app"
PKG_PATH="$OUTPUT_DIR/$FILE_STEM-Installer.pkg"
DMG_PATH="$OUTPUT_DIR/$FILE_STEM.dmg"

args=(--arch universal --version "$VERSION" --output-dir "$OUTPUT_DIR")
[[ -n "$APP_SIGN_IDENTITY" ]] && args+=(--sign "$APP_SIGN_IDENTITY")
"$ROOT_DIR/scripts/build-release.sh" "${args[@]}"

if [[ -z "$APP_SIGN_IDENTITY" ]]; then
    # Ad-hoc sign so the bundle is internally consistent (required on Apple Silicon).
    codesign --force --deep --sign - "$APP_PATH"
fi
codesign --verify --deep --strict "$APP_PATH"

# ---- .pkg (installs to /Applications; never touches user data) ----
COMPONENT_PKG="$OUTPUT_DIR/component.pkg"
PKG_ROOT="$(mktemp -d)"
ditto "$APP_PATH" "$PKG_ROOT/$APP_NAME.app"
pkgbuild --root "$PKG_ROOT" \
    --scripts "$ROOT_DIR/scripts/pkg/scripts" \
    --component-plist "$ROOT_DIR/scripts/pkg/component.plist" \
    --install-location /Applications \
    --identifier "$BUNDLE_ID.pkg" --version "$VERSION" \
    "$COMPONENT_PKG"
productbuild_args=(--package "$COMPONENT_PKG" --identifier "$BUNDLE_ID.installer" --version "$VERSION")
[[ -n "$PKG_SIGN_IDENTITY" ]] && productbuild_args+=(--sign "$PKG_SIGN_IDENTITY")
productbuild "${productbuild_args[@]}" "$PKG_PATH"
rm -rf "$COMPONENT_PKG" "$PKG_ROOT"

# ---- .dmg (drag-to-Applications) ----
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
ditto "$APP_PATH" "$STAGE/$APP_NAME.app"
ln -s /Applications "$STAGE/Applications"
cp "$ROOT_DIR/README-INSTALL.md" "$STAGE/README-INSTALL.md"
rm -f "$DMG_PATH"
hdiutil create -volname "$APP_NAME" -srcfolder "$STAGE" -ov -format UDZO "$DMG_PATH" >/dev/null
[[ -n "$APP_SIGN_IDENTITY" ]] && codesign --force "${KEYCHAIN_ARGS[@]}" --sign "$APP_SIGN_IDENTITY" "$DMG_PATH"

# ---- notarization (only with credentials) ----
if [[ -n "$NOTARY_PROFILE" && -n "$APP_SIGN_IDENTITY" && -n "$PKG_SIGN_IDENTITY" && $USING_LOCAL_IDENTITY -eq 0 ]]; then
    for artifact in "$PKG_PATH" "$DMG_PATH"; do
        xcrun notarytool submit "$artifact" --keychain-profile "$NOTARY_PROFILE" --wait
        xcrun stapler staple "$artifact"
    done
else
    print "NOTE: unsigned/un-notarized build. See README-INSTALL.md (Signing) for the steps."
fi

cp "$ROOT_DIR/README-INSTALL.md" "$OUTPUT_DIR/"
mkdir -p "$OUTPUT_DIR/endpoint-central"
cp "$ROOT_DIR"/scripts/endpoint-central/*.sh "$OUTPUT_DIR/endpoint-central/"
print "\nOutputs in $OUTPUT_DIR:"
ls -1 "$OUTPUT_DIR"
