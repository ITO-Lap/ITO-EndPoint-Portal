#!/bin/sh
# Detection: prints the installed version and exits 0 if installed, else exits 1.
# Compare the output with the version you deployed.
APP="/Applications/App Package Builder.app"
[ -d "$APP" ] || { echo "NOT_INSTALLED"; exit 1; }
/usr/bin/defaults read "$APP/Contents/Info" CFBundleShortVersionString
