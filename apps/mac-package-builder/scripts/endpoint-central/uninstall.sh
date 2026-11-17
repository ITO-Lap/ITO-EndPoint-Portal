#!/bin/sh
# Removes the app only. Per-user data (history, templates, logs, Keychain items)
# is deliberately kept so a reinstall/upgrade loses nothing.
/usr/bin/pkill -x AppPackageBuilder 2>/dev/null
/bin/rm -rf "/Applications/App Package Builder.app"
/usr/sbin/pkgutil --forget com.AKVERMA.AppPackageBuilder.pkg >/dev/null 2>&1
exit 0
