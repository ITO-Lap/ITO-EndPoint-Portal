#!/bin/bash

# macOS bootstrap and command bridge for a SwiftUI WinGet Packager module.
#
# This script does not run winget.exe. It uses PowerShell and the cross-platform
# WinTuner module to resolve a WinGet package and create Intune content on macOS.
# Official Microsoft WinGet manifests remain the authoritative metadata source.
# A package created on macOS must still be installation-tested on Windows.

set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
ACTION="${1:-help}"
if [ "$#" -gt 0 ]; then
  shift
fi

ASSUME_YES=0
JSON_OUTPUT=0
PACKAGE_ID=""
OUTPUT_DIR="${HOME}/Desktop/Packages/Windows"
VERSION=""
ARCHITECTURE="x64"
INSTALLER_CONTEXT="System"
INSTALLER_TYPE=""
LOCALE=""
INSTALLER_ARGUMENTS=""
PACKAGE_TEMP_DIR=""

log() {
  printf '%s\n' "$*"
}

warn() {
  printf 'WARNING: %s\n' "$*" >&2
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage:
  setup-winget-packager-macos.sh check [--json]
  setup-winget-packager-macos.sh install [--yes]
  setup-winget-packager-macos.sh update [--yes]
  setup-winget-packager-macos.sh package --package-id ID [options]
  setup-winget-packager-macos.sh test [--output DIR] [--yes]

Actions:
  check      Read-only environment and dependency diagnostics.
  install    Install PowerShell with Homebrew and WinTuner from PSGallery.
  update     Update the installed WinTuner PowerShell module.
  package    Create an Intune package using New-WtWingetPackage.
  test       Package 7zip.7zip as an explicit proof-of-concept.

Package options:
  --package-id ID             Exact WinGet identifier, e.g. 7zip.7zip.
  --output DIR                Destination directory (default: ~/WinGetPackages).
  --version VERSION           Optional exact package version.
  --architecture ARCH         x64, x86, arm64, or neutral (default: x64).
  --context CONTEXT           System or User (default: System).
  --installer-type TYPE       Optional preferred installer: Msi, Exe, Msix,
                              MsixBundle, Appx, or AppxBundle.
  --locale LOCALE             Optional locale, e.g. en-US.
  --installer-arguments TEXT  Optional silent installer arguments.
  --yes                       Confirm a mutating install/update/test action.
  --json                      Machine-readable output for the check action.
  -h, --help                  Show this help.

Examples:
  ./setup-winget-packager-macos.sh check
  ./setup-winget-packager-macos.sh install --yes
  ./setup-winget-packager-macos.sh package --package-id 7zip.7zip \
    --output "$HOME/WinGetPackages" --architecture x64 \
    --context System --installer-type Msi

Exit codes:
  0  Success / packaging environment ready
  1  Invalid input or command failure
  2  Diagnostics completed but the packaging environment is not ready
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --yes)
      ASSUME_YES=1
      shift
      ;;
    --json)
      JSON_OUTPUT=1
      shift
      ;;
    --package-id)
      [ "$#" -ge 2 ] || fail "--package-id requires a value."
      PACKAGE_ID="$2"
      shift 2
      ;;
    --output)
      [ "$#" -ge 2 ] || fail "--output requires a value."
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --version)
      [ "$#" -ge 2 ] || fail "--version requires a value."
      VERSION="$2"
      shift 2
      ;;
    --architecture)
      [ "$#" -ge 2 ] || fail "--architecture requires a value."
      ARCHITECTURE="$2"
      shift 2
      ;;
    --context)
      [ "$#" -ge 2 ] || fail "--context requires a value."
      INSTALLER_CONTEXT="$2"
      shift 2
      ;;
    --installer-type)
      [ "$#" -ge 2 ] || fail "--installer-type requires a value."
      INSTALLER_TYPE="$2"
      shift 2
      ;;
    --locale)
      [ "$#" -ge 2 ] || fail "--locale requires a value."
      LOCALE="$2"
      shift 2
      ;;
    --installer-arguments)
      [ "$#" -ge 2 ] || fail "--installer-arguments requires a value."
      INSTALLER_ARGUMENTS="$2"
      shift 2
      ;;
    -h|--help)
      ACTION="help"
      shift
      ;;
    *)
      fail "Unknown option: $1"
      ;;
  esac
done

require_macos() {
  [ "$(uname -s)" = "Darwin" ] || fail "This workflow is intended for macOS."
}

find_brew() {
  if command -v brew >/dev/null 2>&1; then
    command -v brew
  elif [ -x /opt/homebrew/bin/brew ]; then
    printf '%s\n' /opt/homebrew/bin/brew
  elif [ -x /usr/local/bin/brew ]; then
    printf '%s\n' /usr/local/bin/brew
  else
    return 1
  fi
}

find_pwsh() {
  if command -v pwsh >/dev/null 2>&1; then
    command -v pwsh
  elif [ -x /opt/homebrew/bin/pwsh ]; then
    printf '%s\n' /opt/homebrew/bin/pwsh
  elif [ -x /usr/local/bin/pwsh ]; then
    printf '%s\n' /usr/local/bin/pwsh
  else
    return 1
  fi
}

has_wintuner() {
  local pwsh_bin="$1"
  "$pwsh_bin" -NoLogo -NoProfile -NonInteractive -Command \
    'if (Get-Module -ListAvailable -Name WinTuner) { exit 0 } else { exit 1 }' \
    >/dev/null 2>&1
}

confirm_mutation() {
  local description="$1"
  if [ "$ASSUME_YES" -eq 1 ]; then
    return 0
  fi
  if [ ! -t 0 ]; then
    fail "$description requires --yes in non-interactive mode."
  fi
  printf '%s [y/N] ' "$description"
  read -r answer
  case "$answer" in
    y|Y|yes|YES|Yes) ;;
    *) fail "Cancelled." ;;
  esac
}

validate_package_inputs() {
  [ -n "$PACKAGE_ID" ] || fail "package requires --package-id."
  case "$PACKAGE_ID" in
    *[!A-Za-z0-9._+-]*|'') fail "Invalid WinGet package ID: $PACKAGE_ID" ;;
  esac
  case "$ARCHITECTURE" in
    x64|x86|arm64|neutral) ;;
    *) fail "Invalid architecture. Use x64, x86, arm64, or neutral." ;;
  esac
  case "$INSTALLER_CONTEXT" in
    System|User) ;;
    *) fail "Invalid context. Use System or User." ;;
  esac
  case "$INSTALLER_TYPE" in
    ''|Msi|Exe|Msix|MsixBundle|Appx|AppxBundle) ;;
    *) fail "Invalid installer type." ;;
  esac
  [ -n "$OUTPUT_DIR" ] || fail "Output directory cannot be empty."
}

check_environment() {
  local os_ok=false
  local brew_ok=false
  local pwsh_ok=false
  local wintuner_ok=false
  local brew_bin=""
  local pwsh_bin=""
  local pwsh_version=""
  local wintuner_version=""

  if [ "$(uname -s)" = "Darwin" ]; then os_ok=true; fi
  if brew_bin="$(find_brew 2>/dev/null)"; then brew_ok=true; fi
  if pwsh_bin="$(find_pwsh 2>/dev/null)"; then
    pwsh_ok=true
    pwsh_version="$($pwsh_bin -NoLogo -NoProfile -NonInteractive -Command '$PSVersionTable.PSVersion.ToString()' 2>/dev/null || true)"
    if has_wintuner "$pwsh_bin"; then
      wintuner_ok=true
      wintuner_version="$($pwsh_bin -NoLogo -NoProfile -NonInteractive -Command '(Get-Module -ListAvailable WinTuner | Sort-Object Version -Descending | Select-Object -First 1).Version.ToString()' 2>/dev/null || true)"
    fi
  fi

  if [ "$JSON_OUTPUT" -eq 1 ]; then
    printf '{"macOS":%s,"homebrew":%s,"powershell":%s,"winTuner":%s,"powershellVersion":"%s","winTunerVersion":"%s","ready":%s}\n' \
      "$os_ok" "$brew_ok" "$pwsh_ok" "$wintuner_ok" \
      "$pwsh_version" "$wintuner_version" \
      "$([ "$os_ok" = true ] && [ "$pwsh_ok" = true ] && [ "$wintuner_ok" = true ] && printf true || printf false)"
  else
    log "macOS:       $os_ok"
    log "Homebrew:    $brew_ok${brew_bin:+ ($brew_bin)}"
    log "PowerShell:  $pwsh_ok${pwsh_version:+ (v$pwsh_version)}"
    log "WinTuner:    $wintuner_ok${wintuner_version:+ (v$wintuner_version)}"
    if [ "$brew_ok" != true ]; then
      warn "Homebrew is only required to install PowerShell; packaging can work without it when pwsh is already available."
    fi
  fi

  if [ "$os_ok" = true ] && [ "$pwsh_ok" = true ] && [ "$wintuner_ok" = true ]; then
    return 0
  fi
  return 2
}

install_dependencies() {
  local brew_bin=""
  local pwsh_bin=""
  require_macos
  confirm_mutation "Install missing packaging dependencies?"

  brew_bin="$(find_brew 2>/dev/null || true)"
  [ -n "$brew_bin" ] || fail "Homebrew is missing. Install it from https://brew.sh, then run this command again."

  pwsh_bin="$(find_pwsh 2>/dev/null || true)"
  if [ -z "$pwsh_bin" ]; then
    log "[1/2] Installing PowerShell with Homebrew..."
    "$brew_bin" install powershell
    pwsh_bin="$(find_pwsh 2>/dev/null || true)"
    [ -n "$pwsh_bin" ] || fail "PowerShell installation completed but pwsh was not found."
  else
    log "[1/2] PowerShell is already installed."
  fi

  if has_wintuner "$pwsh_bin"; then
    log "[2/2] WinTuner is already installed."
  else
    log "[2/2] Installing WinTuner from PowerShell Gallery..."
    "$pwsh_bin" -NoLogo -NoProfile -NonInteractive -Command \
      'Install-Module -Name WinTuner -Repository PSGallery -Scope CurrentUser -Force -AllowClobber -AcceptLicense -ErrorAction Stop'
  fi

  log "Dependencies are ready."
  "$0" check
}

update_wintuner() {
  local pwsh_bin=""
  require_macos
  confirm_mutation "Update the WinTuner PowerShell module?"
  pwsh_bin="$(find_pwsh 2>/dev/null || true)"
  [ -n "$pwsh_bin" ] || fail "PowerShell is missing. Run '$SCRIPT_NAME install --yes' first."
  has_wintuner "$pwsh_bin" || fail "WinTuner is missing. Run '$SCRIPT_NAME install --yes' first."
  "$pwsh_bin" -NoLogo -NoProfile -NonInteractive -Command \
    'Update-Module -Name WinTuner -Force -ErrorAction Stop'
  log "WinTuner updated successfully."
}

package_application() {
  local pwsh_bin=""
  local ps_script=""
  require_macos
  validate_package_inputs
  pwsh_bin="$(find_pwsh 2>/dev/null || true)"
  [ -n "$pwsh_bin" ] || fail "PowerShell is missing. Run '$SCRIPT_NAME install --yes' first."
  has_wintuner "$pwsh_bin" || fail "WinTuner is missing. Run '$SCRIPT_NAME install --yes' first."

  mkdir -p "$OUTPUT_DIR"
  OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd -P)"
  PACKAGE_TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/brew-packager-winget.XXXXXX")"
  ps_script="$PACKAGE_TEMP_DIR/package.ps1"
  trap 'rm -rf "$PACKAGE_TEMP_DIR"' EXIT HUP INT TERM

  cat >"$ps_script" <<'POWERSHELL'
$ErrorActionPreference = 'Stop'
# Plain text output: no ANSI color codes in logs or error messages.
if ($PSStyle) { $PSStyle.OutputRendering = 'PlainText' }
Import-Module WinTuner -ErrorAction Stop

$command = Get-Command New-WtWingetPackage -ErrorAction Stop
$params = @{
    PackageId       = $env:BPB_PACKAGE_ID
    PackageFolder   = $env:BPB_OUTPUT_DIR
    Architecture    = $env:BPB_ARCHITECTURE
    InstallerContext = $env:BPB_CONTEXT
}

if ($env:BPB_VERSION) { $params['Version'] = $env:BPB_VERSION }
if ($env:BPB_LOCALE) { $params['Locale'] = $env:BPB_LOCALE }

if ($env:BPB_INSTALLER_TYPE) {
    if ($command.Parameters.ContainsKey('PreferedInstaller')) {
        $params['PreferedInstaller'] = $env:BPB_INSTALLER_TYPE
    } elseif ($command.Parameters.ContainsKey('PreferredInstaller')) {
        $params['PreferredInstaller'] = $env:BPB_INSTALLER_TYPE
    } else {
        throw 'This WinTuner version does not expose a preferred-installer parameter.'
    }
}

if ($env:BPB_INSTALLER_ARGUMENTS) {
    if ($command.Parameters.ContainsKey('InstallerArguments')) {
        $params['InstallerArguments'] = $env:BPB_INSTALLER_ARGUMENTS
    } else {
        throw 'This WinTuner version does not expose InstallerArguments.'
    }
}

Write-Host "Resolving $($env:BPB_PACKAGE_ID) from WinGet..."
try {
    New-WtWingetPackage @params
} catch {
    # winget-pkgs prunes old versions of fast-moving apps (e.g. Chrome Dev), so a
    # version from a stale index can 404. Retry once with the latest published one.
    if ($params.ContainsKey('Version') -and "$($_.Exception.Message)" -match '404|Not Found') {
        Write-Host "NOTICE: Version $($params['Version']) of $($env:BPB_PACKAGE_ID) is no longer published in WinGet (404). Retrying with the latest available version."
        Write-Host 'BPB_VERSION_FALLBACK=1'
        $params.Remove('Version')
        New-WtWingetPackage @params
    } else {
        throw
    }
}

$packages = Get-ChildItem -Path $env:BPB_OUTPUT_DIR -Filter '*.intunewin' -Recurse |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 5 FullName, Length, LastWriteTime

Write-Host 'Recent .intunewin output:'
$packages | Format-Table -AutoSize
POWERSHELL

  export BPB_PACKAGE_ID="$PACKAGE_ID"
  export BPB_OUTPUT_DIR="$OUTPUT_DIR"
  export BPB_VERSION="$VERSION"
  export BPB_ARCHITECTURE="$ARCHITECTURE"
  export BPB_CONTEXT="$INSTALLER_CONTEXT"
  export BPB_INSTALLER_TYPE="$INSTALLER_TYPE"
  export BPB_LOCALE="$LOCALE"
  export BPB_INSTALLER_ARGUMENTS="$INSTALLER_ARGUMENTS"

  log "Creating package for $PACKAGE_ID..."
  "$pwsh_bin" -NoLogo -NoProfile -NonInteractive -File "$ps_script"
  log "Package workflow completed: $OUTPUT_DIR"
  warn "The package was created on macOS. Validate install, uninstall, and detection behavior on Windows before production deployment."
}

run_test() {
  confirm_mutation "Download and package 7zip.7zip as a test?"
  PACKAGE_ID="7zip.7zip"
  INSTALLER_TYPE="Msi"
  package_application
}

case "$ACTION" in
  help|-h|--help) usage ;;
  check) check_environment ;;
  install) install_dependencies ;;
  update) update_wintuner ;;
  package) package_application ;;
  test) run_test ;;
  *) usage >&2; fail "Unknown action: $ACTION" ;;
esac
