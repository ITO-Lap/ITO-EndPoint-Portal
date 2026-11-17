#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="App Package Builder"
PRODUCT_NAME="AppPackageBuilder"
VERSION="${VERSION:-1.0.0}"
BUILD_NUMBER="${BUILD_NUMBER:-$(date +%Y%m%d%H%M)}"
ARCH="${ARCH:-$(uname -m)}"
OUTPUT_DIR="${OUTPUT_DIR:-$ROOT_DIR/dist}"
SIGNING_IDENTITY="${SIGNING_IDENTITY:-}"
NOTARY_PROFILE="${NOTARY_PROFILE:-}"

usage() {
    cat <<'EOF'
Usage: scripts/build-release.sh [options]

Builds a distributable macOS .app bundle. SwiftPM dependencies are compiled
into the executable; Homebrew and Apple's packaging tools remain host tools.

Options:
  --arch ARCH              arm64, x86_64, or universal (default: host arch)
  --version VERSION        App version (default: VERSION or 1.0.0)
  --output-dir PATH        Output directory (default: ./dist)
  --sign IDENTITY          Code-sign the app with this identity
  --notary-profile NAME    Zip, submit, and staple using this notarytool profile
  -h, --help               Show this help

Examples:
  scripts/build-release.sh
  scripts/build-release.sh --arch universal --sign "Developer ID Application: ..."
  scripts/build-release.sh --sign "Developer ID Application: ..." --notary-profile release
EOF
}

while (( $# > 0 )); do
    case "$1" in
        --arch)
            ARCH="$2"
            shift 2
            ;;
        --version)
            VERSION="$2"
            shift 2
            ;;
        --output-dir)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --sign)
            SIGNING_IDENTITY="$2"
            shift 2
            ;;
        --notary-profile)
            NOTARY_PROFILE="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            print -u2 "Unknown option: $1"
            usage >&2
            exit 2
            ;;
    esac
done

case "$ARCH" in
    arm64|x86_64|universal) ;;
    *)
        print -u2 "Unsupported architecture: $ARCH"
        exit 2
        ;;
esac

if [[ -n "$NOTARY_PROFILE" && -z "$SIGNING_IDENTITY" ]]; then
    print -u2 -- "--notary-profile requires --sign so the submitted app is signed."
    exit 2
fi

cd "$ROOT_DIR"
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

build_binary() {
    local target_arch="$1"
    local scratch_path="$ROOT_DIR/.build/release-$target_arch"
    print "Building $target_arch release..." >&2
    swift build -c release --arch "$target_arch" --scratch-path "$scratch_path" >&2
    find "$scratch_path" -type f -name "$PRODUCT_NAME" -perm -111 -print -quit
}

if [[ "$ARCH" == "universal" ]]; then
    ARM_BINARY="$(build_binary arm64)"
    INTEL_BINARY="$(build_binary x86_64)"
    BINARY_PATH="$OUTPUT_DIR/$PRODUCT_NAME"
    lipo -create "$ARM_BINARY" "$INTEL_BINARY" -output "$BINARY_PATH"
else
    BINARY_PATH="$OUTPUT_DIR/$PRODUCT_NAME"
    SOURCE_BINARY="$(build_binary "$ARCH")"
    cp "$SOURCE_BINARY" "$BINARY_PATH"
fi

APP_PATH="$OUTPUT_DIR/$APP_NAME.app"
CONTENTS_PATH="$APP_PATH/Contents"
MACOS_PATH="$CONTENTS_PATH/MacOS"
RESOURCES_PATH="$CONTENTS_PATH/Resources"
mkdir -p "$MACOS_PATH" "$RESOURCES_PATH"
mv "$BINARY_PATH" "$MACOS_PATH/$PRODUCT_NAME"

cat > "$CONTENTS_PATH/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleExecutable</key>
    <string>$PRODUCT_NAME</string>
    <key>CFBundleIdentifier</key>
    <string>com.AKVERMA.AppPackageBuilder</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>$APP_NAME</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>$VERSION</string>
    <key>CFBundleVersion</key>
    <string>$BUILD_NUMBER</string>
    <key>CFBundleDisplayName</key>
    <string>$APP_NAME</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>LSApplicationCategoryType</key>
    <string>public.app-category.developer-tools</string>
    <key>NSHumanReadableCopyright</key>
    <string>Copyright © AKVERMA. All rights reserved.</string>
    <key>LSMinimumSystemVersion</key>
    <string>14.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
EOF

swift "$ROOT_DIR/scripts/make-icon.swift" "$RESOURCES_PATH/AppIcon.icns"

RESOURCE_BUNDLE="$(find "$ROOT_DIR/.build"/release-* -type d -name "${PRODUCT_NAME}_${PRODUCT_NAME}.bundle" -print -quit)"
if [[ -n "$RESOURCE_BUNDLE" ]]; then
    cp -R "$RESOURCE_BUNDLE" "$RESOURCES_PATH/"
fi

KEYCHAIN_ARGS=()
[[ -n "${SIGN_KEYCHAIN:-}" ]] && KEYCHAIN_ARGS=(--keychain "$SIGN_KEYCHAIN")

if [[ -n "$SIGNING_IDENTITY" ]]; then
    print "Signing app..."
    codesign --force --deep --options runtime --entitlements \
        "$ROOT_DIR/Sources/AppPackageBuilder/Resources/AppPackageBuilder.entitlements" \
        "${KEYCHAIN_ARGS[@]}" \
        --sign "$SIGNING_IDENTITY" "$APP_PATH"
else
    print "Warning: app is unsigned. Use --sign for distribution."
fi

if [[ -n "$NOTARY_PROFILE" ]]; then
    ZIP_PATH="$OUTPUT_DIR/$APP_NAME.zip"
    print "Submitting app for notarization..."
    ditto -c -k --keepParent "$APP_PATH" "$ZIP_PATH"
    xcrun notarytool submit "$ZIP_PATH" --keychain-profile "$NOTARY_PROFILE" --wait
    xcrun stapler staple "$APP_PATH"
    xcrun stapler validate "$APP_PATH"
fi

print "Created: $APP_PATH"