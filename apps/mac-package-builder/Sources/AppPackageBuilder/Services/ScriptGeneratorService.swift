import Foundation

protocol ScriptGeneratorServicing {
    func generatePostinstallScript(configuration: PackageConfiguration, packageInfo: BrewPackageInfo) throws -> String
    func generateDetectionScript(configuration: PackageConfiguration, packageInfo: BrewPackageInfo) throws -> String
    func generateUninstallScript(configuration: PackageConfiguration, packageInfo: BrewPackageInfo) throws -> String
}

/// Generates postinstall/detection/uninstall shell scripts. Unlike the
/// `brew2pkg.sh` prototype (which builds a script by string-replacing tokens
/// into a bash heredoc template — fragile against literal `&` and, if ever
/// fed an unsanitized value, injectable), this service:
///   1. Requires every dynamic value to already have passed `Validators`
///      (enforced by `PackageConfiguration.validateStrictFields()` before
///      any generator method is called).
///   2. Still defensively wraps every interpolated value with
///      `ShellEscaping.shellSingleQuoted` so quoting is correct even if a
///      future caller forgets step 1.
///   3. Never uses `bash -c "<interpolated string>"` — the console user is
///      captured into a shell variable via `stat`, then referenced by name,
///      so `sudo -u "$CONSOLE_USER"` never re-interprets attacker content.
final class ScriptGeneratorService: ScriptGeneratorServicing {

    func generatePostinstallScript(configuration: PackageConfiguration, packageInfo: BrewPackageInfo) throws -> String {
        try configuration.validateStrictFields()
        let token = ShellEscaping.shellSingleQuoted(configuration.homebrewToken)
        let listArg = configuration.packageKind == .cask ? "--cask" : ""
        let installArg = configuration.packageKind == .cask ? "install --cask" : "install"
        let logDir = "/Library/Logs/AppPackageBuilder"
        let logFile = "\(logDir)/\(safeLogName(configuration.homebrewToken)).log"

        var lines: [String] = []
        lines.append("#!/bin/bash")
        lines.append("set -uo pipefail")
        lines.append("")
        lines.append("PKG_TOKEN=\(token)")
        lines.append("LOG_DIR=\(ShellEscaping.shellSingleQuoted(logDir))")
        lines.append("LOG_FILE=\(ShellEscaping.shellSingleQuoted(logFile))")
        lines.append(#"mkdir -p "$LOG_DIR""#)
        lines.append(#"log()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }"#)
        lines.append(#"err()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" | tee -a "$LOG_FILE" >&2; }"#)
        lines.append("")
        lines.append(#"CONSOLE_USER="$(stat -f%Su /dev/console 2>/dev/null || true)""#)
        lines.append(#"if [[ -z "$CONSOLE_USER" || "$CONSOLE_USER" == "root" || "$CONSOLE_USER" == "loginwindow" ]]; then"#)
        lines.append(#"    err "No user is logged into the console; cannot install per-user Homebrew formula/cask.""#)
        lines.append(#"    exit 1"#)
        lines.append(#"fi"#)
        lines.append(#"log "Console user: $CONSOLE_USER""#)
        lines.append("")
        lines.append(#"run_as_user() { sudo -u "$CONSOLE_USER" -H "$@"; }"#)
        lines.append("")
        lines.append(#"BREW_BIN="""#)
        lines.append(#"for candidate in /opt/homebrew/bin/brew /usr/local/bin/brew; do"#)
        lines.append(#"    if [[ -x "$candidate" ]]; then BREW_BIN="$candidate"; break; fi"#)
        lines.append(#"done"#)
        lines.append("")
        lines.append(#"if [[ -z "$BREW_BIN" ]]; then"#)
        lines.append(#"    err "Homebrew is not installed for $CONSOLE_USER. Online Installer mode requires Homebrew already present, or installed separately with administrator approval.""#)
        lines.append(#"    exit 2"#)
        lines.append(#"fi"#)
        lines.append(#"log "Using Homebrew at $BREW_BIN""#)
        lines.append("")
        lines.append(#"if run_as_user "$BREW_BIN" list \#(listArg) "$PKG_TOKEN" &>/dev/null; then"#)
        if configuration.upgradeExisting {
            lines.append(#"    log "$PKG_TOKEN already installed. Attempting upgrade if a newer version is available.""#)
            lines.append(#"    if ! run_as_user "$BREW_BIN" upgrade \#(listArg) "$PKG_TOKEN"; then"#)
            lines.append(#"        log "$PKG_TOKEN is already at the latest version, or upgrade skipped.""#)
            lines.append(#"    fi"#)
        } else {
            lines.append(#"    log "$PKG_TOKEN already installed and upgrades are disabled. Nothing to do.""#)
        }
        lines.append(#"else"#)
        lines.append(#"    log "Installing $PKG_TOKEN...""#)
        lines.append(#"    if ! run_as_user "$BREW_BIN" \#(installArg) "$PKG_TOKEN"; then"#)
        lines.append(#"        err "Installation of $PKG_TOKEN failed. Check network access and the Homebrew tap.""#)
        lines.append(#"        exit 3"#)
        lines.append(#"    fi"#)
        lines.append(#"fi"#)
        lines.append("")

        if configuration.startHomebrewService && packageInfo.declaresService {
            lines.append(#"log "Starting $PKG_TOKEN as a background service...""#)
            lines.append(#"if ! run_as_user "$BREW_BIN" services start "$PKG_TOKEN"; then"#)
            lines.append(#"    err "Failed to start $PKG_TOKEN as a service.""#)
            lines.append(#"    exit 4"#)
            lines.append(#"fi"#)
            lines.append(#"sleep 2"#)
            lines.append(#"if ! run_as_user "$BREW_BIN" services list | grep -qi "^$PKG_TOKEN *started"; then"#)
            lines.append(#"    err "$PKG_TOKEN does not show as started in 'brew services list'.""#)
            lines.append(#"    exit 5"#)
            lines.append(#"fi"#)
            lines.append("")
        }

        lines.append(#"if run_as_user "$BREW_BIN" list \#(listArg) "$PKG_TOKEN" &>/dev/null; then"#)
        lines.append(#"    log "SUCCESS: $PKG_TOKEN is installed.""#)
        lines.append(#"    exit 0"#)
        lines.append(#"else"#)
        lines.append(#"    err "$PKG_TOKEN does not appear installed after the install step completed. Not reporting success.""#)
        lines.append(#"    exit 6"#)
        lines.append(#"fi"#)

        return lines.joined(separator: "\n") + "\n"
    }

    func generateDetectionScript(configuration: PackageConfiguration, packageInfo: BrewPackageInfo) throws -> String {
        try configuration.validateStrictFields()
        let token = ShellEscaping.shellSingleQuoted(configuration.homebrewToken)
        let requiredVersion = ShellEscaping.shellSingleQuoted(configuration.requiredVersion)

        var lines: [String] = []
        lines.append("#!/bin/bash")
        lines.append("# Detection script for Endpoint Central. Exit 0 = installed at/above required version.")
        lines.append("set -uo pipefail")
        lines.append("")
        lines.append("PKG_TOKEN=\(token)")
        lines.append("REQUIRED_VERSION=\(requiredVersion)")
        lines.append("")

        if configuration.packageKind == .cask, let appName = packageInfo.artifactAppNames.first {
            let appPath = "/Applications/\(appName)"
            lines.append(#"APP_PATH=\#(ShellEscaping.shellSingleQuoted(appPath))"#)
            lines.append(#"if [[ ! -d "$APP_PATH" ]]; then"#)
            lines.append(#"    echo "NOT_INSTALLED: $APP_PATH not found""#)
            lines.append(#"    exit 1"#)
            lines.append(#"fi"#)
            lines.append("")
            lines.append(#"INSTALLED_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP_PATH/Contents/Info.plist" 2>/dev/null || true)""#)
            lines.append(#"if [[ -z "$INSTALLED_VERSION" ]]; then"#)
            lines.append(#"    INSTALLED_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP_PATH/Contents/Info.plist" 2>/dev/null || true)""#)
            lines.append(#"fi"#)
            lines.append(#"if [[ -z "$INSTALLED_VERSION" ]]; then"#)
            lines.append(#"    echo "NOT_INSTALLED: could not read version from $APP_PATH""#)
            lines.append(#"    exit 1"#)
            lines.append(#"fi"#)
        } else {
            lines.append(#"BREW_BIN="""#)
            lines.append(#"for candidate in /opt/homebrew/bin/brew /usr/local/bin/brew; do"#)
            lines.append(#"    [[ -x "$candidate" ]] && BREW_BIN="$candidate" && break"#)
            lines.append(#"done"#)
            lines.append(#"if [[ -z "$BREW_BIN" ]]; then"#)
            lines.append(#"    echo "NOT_INSTALLED: Homebrew not present""#)
            lines.append(#"    exit 1"#)
            lines.append(#"fi"#)
            lines.append(#"INSTALLED_VERSION="$("$BREW_BIN" list --versions "$PKG_TOKEN" 2>/dev/null | awk '{print $2}')""#)
            lines.append(#"if [[ -z "$INSTALLED_VERSION" ]]; then"#)
            lines.append(#"    echo "NOT_INSTALLED: $PKG_TOKEN not found via brew list""#)
            lines.append(#"    exit 1"#)
            lines.append(#"fi"#)
        }

        lines.append("")
        lines.append(#"echo "INSTALLED_VERSION=$INSTALLED_VERSION""#)
        lines.append(#"if [[ "$REQUIRED_VERSION" == "latest" ]]; then"#)
        lines.append(#"    echo "DETECTED: installed ($INSTALLED_VERSION)""#)
        lines.append(#"    exit 0"#)
        lines.append(#"fi"#)
        lines.append(#"if [[ "$INSTALLED_VERSION" == "$REQUIRED_VERSION" ]]; then"#)
        lines.append(#"    echo "DETECTED: version matches""#)
        lines.append(#"    exit 0"#)
        lines.append(#"fi"#)
        lines.append(#"echo "VERSION_MISMATCH: installed=$INSTALLED_VERSION required=$REQUIRED_VERSION""#)
        lines.append(#"exit 2"#)

        return lines.joined(separator: "\n") + "\n"
    }

    func generateUninstallScript(configuration: PackageConfiguration, packageInfo: BrewPackageInfo) throws -> String {
        try configuration.validateStrictFields()
        let token = ShellEscaping.shellSingleQuoted(configuration.homebrewToken)
        let listArg = configuration.packageKind == .cask ? "--cask" : ""
        let uninstallArg = configuration.packageKind == .cask ? "uninstall --cask" : "uninstall"

        var lines: [String] = []
        lines.append("#!/bin/bash")
        lines.append("set -uo pipefail")
        lines.append("")
        lines.append("PKG_TOKEN=\(token)")
        lines.append(#"CONSOLE_USER="$(stat -f%Su /dev/console 2>/dev/null || true)""#)
        lines.append(#"if [[ -z "$CONSOLE_USER" || "$CONSOLE_USER" == "root" || "$CONSOLE_USER" == "loginwindow" ]]; then"#)
        lines.append(#"    echo "ERROR: no console user; cannot locate a per-user Homebrew install." >&2"#)
        lines.append(#"    exit 1"#)
        lines.append(#"fi"#)
        lines.append(#"run_as_user() { sudo -u "$CONSOLE_USER" -H "$@"; }"#)
        lines.append("")
        lines.append(#"BREW_BIN="""#)
        lines.append(#"for candidate in /opt/homebrew/bin/brew /usr/local/bin/brew; do"#)
        lines.append(#"    [[ -x "$candidate" ]] && BREW_BIN="$candidate" && break"#)
        lines.append(#"done"#)
        lines.append("")

        if configuration.packageKind == .formula && packageInfo.declaresService {
            lines.append(#"if [[ -n "$BREW_BIN" ]]; then run_as_user "$BREW_BIN" services stop "$PKG_TOKEN" 2>/dev/null || true; fi"#)
        }

        lines.append(#"if [[ -z "$BREW_BIN" ]]; then"#)
        lines.append(#"    echo "Homebrew not found; nothing to uninstall via brew.""#)
        lines.append(#"    exit 0"#)
        lines.append(#"fi"#)
        lines.append("")
        lines.append(#"if run_as_user "$BREW_BIN" list \#(listArg) "$PKG_TOKEN" &>/dev/null; then"#)
        lines.append(#"    run_as_user "$BREW_BIN" \#(uninstallArg) --force "$PKG_TOKEN" || { echo "ERROR: uninstall failed" >&2; exit 1; }"#)
        lines.append(#"    echo "SUCCESS: $PKG_TOKEN removed.""#)
        lines.append(#"else"#)
        lines.append(#"    echo "$PKG_TOKEN was not installed via Homebrew. Nothing to do.""#)
        lines.append(#"fi"#)
        lines.append(#"exit 0"#)

        return lines.joined(separator: "\n") + "\n"
    }

    private func safeLogName(_ token: String) -> String {
        token.replacingOccurrences(of: "@", with: "-at-")
    }
}
