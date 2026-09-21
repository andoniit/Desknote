#!/bin/bash
# Build, sign and publish a DeskNote firmware release for over-the-air update.
#
#   ./scripts/release-firmware.sh main-5.1 "Faster typing intro"   # publish
#   ./scripts/release-firmware.sh main-5.1 --dry-run               # build + sign only
#
# Publishing makes the release available; it does not push it anywhere. A
# desk only installs it when its owner presses Update in the app.
#
# What it checks before anything leaves this Mac:
#   - the version matches kFirmwareVersion in the sketch exactly. If they
#     differed, the desk would report one string, the server would expect
#     the other, and it would be offered the same update forever;
#   - the firmware tree is committed, so every published build can be rebuilt
#     from git (override with --allow-dirty);
#   - the public key compiled into the sketch is the one this signature
#     verifies against — a mismatch would ship an update no desk accepts.
#
# Needs: arduino-cli with esp32 core 3.x, TFT_eSPI, PubSubClient; openssl;
# the private key from scripts/firmware-keygen.sh; NEXT_PUBLIC_SUPABASE_URL
# and SUPABASE_SERVICE_ROLE_KEY in .env.local (upload only — the key is read
# from the file and never printed).
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${1:-}"
shift || true
NOTES=""
DRY_RUN=no
ALLOW_DIRTY=no
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=yes ;;
    --allow-dirty) ALLOW_DIRTY=yes ;;
    *) NOTES="$arg" ;;
  esac
done

[ -n "$VERSION" ] || { echo "usage: $0 <version> [notes] [--dry-run] [--allow-dirty]"; exit 1; }
[[ "$VERSION" =~ ^[A-Za-z0-9._-]{1,32}$ ]] || { echo "version must be 1-32 of [A-Za-z0-9._-]"; exit 1; }

SKETCH_DIR="firmware/desknote_main"
SKETCH="$SKETCH_DIR/desknote_main.ino"
FQBN="esp32:esp32:esp32:PartitionScheme=min_spiffs"
PRIVATE_KEY="$HOME/.desknote/firmware-signing-key.pem"
PUBLIC_KEY="firmware/firmware-signing.pub.pem"
KEY_HEADER="$SKETCH_DIR/firmware_signing_key.h"
OUT="build/firmware/$VERSION"

# --- preflight ---------------------------------------------------------------

SKETCH_VERSION=$(sed -nE 's/^const char\* kFirmwareVersion = "([^"]*)";/\1/p' "$SKETCH")
if [ "$SKETCH_VERSION" != "$VERSION" ]; then
  echo "The sketch says kFirmwareVersion = \"$SKETCH_VERSION\", not \"$VERSION\"."
  echo "Bump it in $SKETCH (and commit) first."
  exit 1
fi

if [ "$ALLOW_DIRTY" = no ] && [ -n "$(git status --porcelain -- firmware)" ]; then
  echo "firmware/ has uncommitted changes — commit them so this build can be"
  echo "reproduced from git, or pass --allow-dirty."
  git status --short -- firmware
  exit 1
fi

[ -f "$PRIVATE_KEY" ] || { echo "no signing key at $PRIVATE_KEY — run scripts/firmware-keygen.sh"; exit 1; }
[ -f "$SKETCH_DIR/secrets.h" ] || { echo "no $SKETCH_DIR/secrets.h — copy secrets.example.h and fill it in"; exit 1; }

# The key the desk will check against is the one in the header, so that is
# the one the signature has to verify with.
HEADER_KEY=$(sed -nE 's/^ *"(.*)\\n"$/\1/p' "$KEY_HEADER")
if [ "$HEADER_KEY" != "$(cat "$PUBLIC_KEY")" ]; then
  echo "$KEY_HEADER and $PUBLIC_KEY disagree — rerun scripts/firmware-keygen.sh."
  exit 1
fi

# --- build -------------------------------------------------------------------

rm -rf "$OUT"
mkdir -p "$OUT"
echo "Building $VERSION ($FQBN)…"
arduino-cli compile --fqbn "$FQBN" --build-path "$OUT/build" "$SKETCH_DIR" \
  | grep -E "Sketch uses|Global variables"
BIN="$OUT/$VERSION.bin"
cp "$OUT/build/desknote_main.ino.bin" "$BIN"

SIZE=$(stat -f%z "$BIN")
SHA256=$(shasum -a 256 "$BIN" | cut -d' ' -f1)

# --- sign, then prove the signature the way the desk will -------------------

openssl dgst -sha256 -sign "$PRIVATE_KEY" -out "$OUT/signature.der" "$BIN"
openssl dgst -sha256 -verify "$PUBLIC_KEY" -signature "$OUT/signature.der" "$BIN" >/dev/null \
  || { echo "signature does not verify against $PUBLIC_KEY — refusing to publish"; exit 1; }
SIGNATURE=$(base64 -i "$OUT/signature.der" | tr -d '\n')

echo
echo "  version    $VERSION"
echo "  size       $SIZE bytes"
echo "  sha256     $SHA256"
echo "  signature  verified against $PUBLIC_KEY"
echo "  image      $BIN"

if [ "$DRY_RUN" = yes ]; then
  echo
  echo "Dry run — nothing uploaded."
  exit 0
fi

# --- publish -----------------------------------------------------------------

get() { grep -E "^$1=" .env.local | head -1 | cut -d= -f2- | tr -d '"'"'"' \r'; }
SUPABASE_URL=$(get NEXT_PUBLIC_SUPABASE_URL)
SERVICE_KEY=$(get SUPABASE_SERVICE_ROLE_KEY)
[ -n "$SUPABASE_URL" ] && [ -n "$SERVICE_KEY" ] \
  || { echo "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env.local"; exit 1; }

# Headers go through a private temp file so the key never appears in `ps`.
AUTH=$(mktemp -t desknote-release)
chmod 600 "$AUTH"
trap 'rm -f "$AUTH"' EXIT INT TERM
printf 'Authorization: Bearer %s\napikey: %s\n' "$SERVICE_KEY" "$SERVICE_KEY" > "$AUTH"

OBJECT="$VERSION.bin"
echo
echo "Uploading $OBJECT to the private firmware bucket…"
# No x-upsert: a published version is immutable. Re-releasing means a new
# version string.
HTTP=$(curl -sS -o "$OUT/upload.json" -w '%{http_code}' -X POST \
  -H @"$AUTH" -H "Content-Type: application/octet-stream" \
  --data-binary @"$BIN" \
  "$SUPABASE_URL/storage/v1/object/firmware/$OBJECT")
if [ "$HTTP" != "200" ]; then
  echo "upload failed (HTTP $HTTP): $(cat "$OUT/upload.json")"
  exit 1
fi

ROW=$(python3 -c 'import json,sys; print(json.dumps({"version":sys.argv[1],"storage_path":sys.argv[2],"size_bytes":int(sys.argv[3]),"sha256":sys.argv[4],"signature":sys.argv[5],"notes":sys.argv[6] or None}))' \
  "$VERSION" "$OBJECT" "$SIZE" "$SHA256" "$SIGNATURE" "$NOTES")
HTTP=$(curl -sS -o "$OUT/release.json" -w '%{http_code}' -X POST \
  -H @"$AUTH" -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  --data "$ROW" \
  "$SUPABASE_URL/rest/v1/firmware_releases")
if [ "$HTTP" != "201" ]; then
  echo "recording the release failed (HTTP $HTTP): $(cat "$OUT/release.json")"
  echo "Removing the uploaded image so the version can be published again."
  curl -sS -o /dev/null -X DELETE -H @"$AUTH" "$SUPABASE_URL/storage/v1/object/firmware/$OBJECT" || true
  exit 1
fi

echo "Published $VERSION. Owners will see \"Update available\" on OTA-capable desks."
