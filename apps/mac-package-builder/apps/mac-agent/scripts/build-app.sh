#!/bin/sh
set -eu

PACKAGE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
INSTALL=false
if [ "${1:-}" = "--install" ]; then
    INSTALL=true
elif [ "$#" -gt 0 ]; then
    printf 'Usage: %s [--install]\n' "$0" >&2
    exit 2
fi

swift build --configuration release --package-path "$PACKAGE_DIR" --product AppGuardianAgent
BIN_DIR=$(swift build --configuration release --show-bin-path --package-path "$PACKAGE_DIR")

if [ "$INSTALL" = true ]; then
    APP_PATH="$HOME/Applications/App Guardian.app"
else
    APP_PATH="$PACKAGE_DIR/.build/App Guardian.app"
fi

CONTENTS="$APP_PATH/Contents"
MACOS="$CONTENTS/MacOS"
RESOURCES="$CONTENTS/Resources"
PLIST="$CONTENTS/Info.plist"
mkdir -p "$MACOS" "$RESOURCES"
cp "$BIN_DIR/AppGuardianAgent" "$MACOS/AppGuardianAgent"

if [ ! -f "$PLIST" ]; then
    plutil -create xml1 "$PLIST"
fi

set_plist_string() {
    key=$1
    value=$2
    if ! /usr/libexec/PlistBuddy -c "Set $key $value" "$PLIST" >/dev/null 2>&1; then
        /usr/libexec/PlistBuddy -c "Add $key string $value" "$PLIST"
    fi
}

set_plist_string :CFBundleName "App Guardian"
set_plist_string :CFBundleDisplayName "App Guardian"
set_plist_string :CFBundleExecutable AppGuardianAgent
set_plist_string :CFBundleIdentifier com.akvstudio.appguardian.agent
set_plist_string :CFBundlePackageType APPL
set_plist_string :CFBundleShortVersionString 0.1.0
set_plist_string :CFBundleVersion 1
set_plist_string :LSMinimumSystemVersion 14.0
set_plist_string :NSPrincipalClass NSApplication

/usr/libexec/PlistBuddy -c 'Delete :CFBundleURLTypes' "$PLIST" >/dev/null 2>&1 || true
/usr/libexec/PlistBuddy -c 'Add :CFBundleURLTypes array' "$PLIST"
/usr/libexec/PlistBuddy -c 'Add :CFBundleURLTypes:0 dict' "$PLIST"
/usr/libexec/PlistBuddy -c 'Add :CFBundleURLTypes:0:CFBundleURLName string com.akvstudio.appguardian.agent' "$PLIST"
/usr/libexec/PlistBuddy -c 'Add :CFBundleURLTypes:0:CFBundleURLSchemes array' "$PLIST"
/usr/libexec/PlistBuddy -c 'Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string appguardian' "$PLIST"

if [ "$INSTALL" = true ]; then
    open -a "$APP_PATH"
    printf 'Installed and launched %s\n' "$APP_PATH"
else
    printf 'Built %s\nRun the script with --install to install it in ~/Applications and launch it.\n' "$APP_PATH"
fi