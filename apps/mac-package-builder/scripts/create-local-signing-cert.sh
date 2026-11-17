#!/bin/zsh
# Creates a self-signed code-signing identity in a dedicated keychain under
# ./.signing (login keychain and trust settings are NOT modified). Signing with
# it gives the app a stable identity across upgrades, so Keychain access and
# privacy permissions are not re-prompted. It does NOT satisfy Gatekeeper —
# use Endpoint Central/MDM or a real Developer ID for that.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT_DIR/.signing"
KEYCHAIN="$DIR/local-signing.keychain-db"
NAME="App Package Builder Local Signing"
PASS_FILE="$DIR/keychain.pass"
mkdir -p "$DIR"
if [[ -f "$KEYCHAIN" ]]; then print "Already exists: $KEYCHAIN"; exit 0; fi

PASS="$(openssl rand -hex 16)"; print -n "$PASS" > "$PASS_FILE"; chmod 600 "$PASS_FILE"
cat > "$DIR/openssl.cnf" <<CNF
[req]
distinguished_name=dn
x509_extensions=ext
prompt=no
[dn]
CN=$NAME
[ext]
basicConstraints=critical,CA:false
keyUsage=critical,digitalSignature
extendedKeyUsage=critical,codeSigning
CNF
openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -config "$DIR/openssl.cnf" \
    -keyout "$DIR/key.pem" -out "$DIR/cert.pem" 2>/dev/null
openssl pkcs12 -export -inkey "$DIR/key.pem" -in "$DIR/cert.pem" -out "$DIR/id.p12" -passout "pass:$PASS" 2>/dev/null

security create-keychain -p "$PASS" "$KEYCHAIN"
security set-keychain-settings "$KEYCHAIN"
security unlock-keychain -p "$PASS" "$KEYCHAIN"
security import "$DIR/id.p12" -k "$KEYCHAIN" -P "$PASS" -T /usr/bin/codesign >/dev/null
security set-key-partition-list -S apple-tool:,apple: -s -k "$PASS" "$KEYCHAIN" >/dev/null
rm -f "$DIR/key.pem" "$DIR/cert.pem" "$DIR/id.p12" "$DIR/openssl.cnf"
print "Created identity \"$NAME\" in $KEYCHAIN"
