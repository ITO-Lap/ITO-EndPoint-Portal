#!/bin/zsh
# Keeps apps/mac-package-builder in sync with the original macOS "App Package Builder" project.
#
#   npm run sync:mac-builder          mirror the original into apps/mac-package-builder
#   npm run check:mac-builder         exit 1 if the copy has drifted from the original (use in CI / before commits)
#
# Options: --source <dir>   original project (default: ../Apps Package Builder, or $MAC_BUILDER_SOURCE)
#          --with-agent     accepted for compatibility (WindowsBuildAgent is now always included)
#          --check          report differences only; change nothing
#
# Only an allow-list of source paths is copied. Build output, signing material (.signing/, keychains, *.pass, *.p12, keys)
# and .env files are never copied, and the script aborts if any such file is found in the copy.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${MAC_BUILDER_SOURCE:-$REPO/../Apps Package Builder}"
DEST="$REPO/apps/mac-package-builder"
MODE=sync; WITH_AGENT=0

while (( $# > 0 )); do
  case "$1" in
    --check) MODE=check; shift ;;
    --with-agent) WITH_AGENT=1; shift ;;
    --source) SRC="$2"; shift 2 ;;
    -h|--help) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 64 ;;
  esac
done

[[ -f "$SRC/Package.swift" && -d "$SRC/Sources/AppPackageBuilder" ]] || { echo "Not the App Package Builder project: $SRC" >&2; exit 66; }
SRC="$(cd "$SRC" && pwd)"
# The destination must be exactly this folder inside the repo — rsync --delete runs against it.
[[ "$DEST" == "$REPO/apps/mac-package-builder" ]] || { echo "Refusing unexpected destination: $DEST" >&2; exit 70; }

EXCLUDES=(
  --exclude='.DS_Store' --exclude='.build/' --exclude='.swiftpm/' --exclude='dist/' --exclude='dist-*/' --exclude='node_modules/'
  --exclude='bin/' --exclude='obj/' --exclude='.signing/' --exclude='.vscode/' --exclude='*.keychain' --exclude='*.keychain-db'
  --exclude='keychain.pass' --exclude='*.p12' --exclude='*.pfx' --exclude='*.pem' --exclude='*.key' --exclude='*.mobileprovision'
  --exclude='.env' --exclude='.env.*' --exclude='*.dmg' --exclude='*.pkg' --exclude='*.app/' --exclude='*.tsbuildinfo'
)

# The complete project: the Swift app, the Windows build agent, and the App Guardian workspace (apps/, services/, api/, database/).
# Not copied: build output, signing material, editor settings, and stray local output such as the '~' folder.
DIRS=(Sources Tests scripts docs WindowsBuildAgent api apps database services)
FILES=(Package.swift Package.resolved package.json package-lock.json README.md README-INSTALL.md CHECKLIST.md)

scan_for_secrets() {
  local hits
  hits="$(find "$DEST" \( -iname '*.keychain*' -o -name 'keychain.pass' -o -name '*.p12' -o -name '*.pfx' -o -name '*.pem' -o -name '*.key' -o -name '.env' -o -name '.env.*' -o -path '*/.signing/*' \) 2>/dev/null || true)"
  if [[ -n "$hits" ]]; then echo "ABORT: signing material or secrets found in the copy:" >&2; echo "$hits" >&2; exit 2; fi
}

changes=""
run_rsync() { # $1 = source path, $2 = destination path, extra flags follow
  local s="$1" d="$2"; shift 2
  rsync -a --delete --itemize-changes "${EXCLUDES[@]}" "$@" "$s" "$d"
}
# Single files are compared byte-for-byte (rsync's single-file itemize output is unreliable on macOS's openrsync).
file_sync() { # $1 = relative file name; $2 = "check" to only report
  local f="$1"
  if [[ ! -f "$DEST/$f" ]] || ! cmp -s "$SRC/$f" "$DEST/$f"; then
    echo ">f $f"
    [[ "${2:-}" == check ]] || cp -p "$SRC/$f" "$DEST/$f"
  fi
}
# Prefix rsync's relative paths with the folder they came from so the report is readable.
prefixed() { local d="$1"; sed -e "s|^\([^ ]*\) |\1 $d/|" -e "\|/\./\$|d"; }

if [[ "$MODE" == check ]]; then
  [[ -d "$DEST" ]] || { echo "No copy yet: run npm run sync:mac-builder"; exit 1; }
  for d in $DIRS;  do [[ -d "$SRC/$d" ]] && changes+="$(run_rsync "$SRC/$d/" "$DEST/$d/" -n | prefixed "$d" || true)"$'\n'; done
  for f in $FILES; do [[ -f "$SRC/$f" ]] && changes+="$(file_sync "$f" check)"$'\n'; done
  changes="$(printf '%s' "$changes" | sed '/^$/d' | grep -v 'creating directory' | grep -v '^\.d\.\.t' || true)"
  scan_for_secrets
  if [[ -n "$changes" ]]; then echo "apps/mac-package-builder differs from the original:"; echo "$changes"; echo "Run: npm run sync:mac-builder"; exit 1; fi
  echo "apps/mac-package-builder is in sync with $SRC"; exit 0
fi

mkdir -p "$DEST"
for d in $DIRS;  do [[ -d "$SRC/$d" ]] && { mkdir -p "$DEST/$d"; changes+="$(run_rsync "$SRC/$d/" "$DEST/$d/" | prefixed "$d")"$'\n'; }; done
for f in $FILES; do [[ -f "$SRC/$f" ]] && changes+="$(file_sync "$f")"$'\n'; done
scan_for_secrets

# Keep build output out of git even if someone builds inside the copy (rewritten each sync; it is not part of the original).
printf '.build/\n.swiftpm/\ndist/\ndist-*/\nbin/\nobj/\nnode_modules/\n*.tsbuildinfo\n.signing/\n*.keychain*\nkeychain.pass\n.DS_Store\n' > "$DEST/.gitignore"
commit="$(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || echo none)"
{
  echo "Mirrored from: $SRC"
  echo "Original repo commit: $commit (the working tree may be newer; file contents are what was copied)"
  echo "Synced at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Do not edit files here — change the original and re-run: npm run sync:mac-builder"
} > "$DEST/.synced-from"

n="$(printf '%s' "$changes" | sed '/^$/d' | grep -vc 'creating directory' || true)"
echo "Synced $SRC -> $DEST ($n changed entries)"
