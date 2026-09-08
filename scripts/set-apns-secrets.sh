#!/bin/bash
# Push the APNs credentials into the DeskNote Supabase project's Edge
# Function secrets, so `push-notify` can sign its provider tokens.
#
#   ./scripts/set-apns-secrets.sh ~/Downloads/AuthKey_ABCD123456.p8
#
# The Key ID is read from the filename (Apple names the download
# AuthKey_<KEYID>.p8); pass it as the second argument if the file has been
# renamed. Nothing here prints the key, and the temporary env file it
# builds is created private and removed on exit — including on Ctrl-C.
#
# See docs/ios-push-notifications.md for the two Apple-side steps that have
# to happen before this is worth running.
set -euo pipefail

PROJECT_REF="lareedskrwqleutgyskf"
TEAM_ID="VG2N3XUNXB"
BUNDLE_ID="space.desknote.app"

KEY_FILE="${1:-}"
[ -n "$KEY_FILE" ] || { echo "usage: $0 <AuthKey_XXXXXXXXXX.p8> [key-id]"; exit 1; }
[ -f "$KEY_FILE" ] || { echo "no such file: $KEY_FILE"; exit 1; }

# Apple's download is named AuthKey_<KEYID>.p8; a renamed file needs the id.
KEY_ID="${2:-$(basename "$KEY_FILE" .p8 | sed -n 's/^AuthKey_//p')}"
case "$KEY_ID" in
  [A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9]) ;;
  *) echo "could not read a 10-character Key ID from the filename — pass it as the second argument"; exit 1 ;;
esac

grep -q "BEGIN PRIVATE KEY" "$KEY_FILE" \
  || { echo "$KEY_FILE does not look like a .p8 private key"; exit 1; }

ENV_FILE=$(mktemp -t desknote-apns)
chmod 600 "$ENV_FILE"
trap 'rm -f "$ENV_FILE"' EXIT INT TERM

{
  printf 'APNS_KEY_ID=%s\n' "$KEY_ID"
  printf 'APNS_TEAM_ID=%s\n' "$TEAM_ID"
  printf 'APNS_BUNDLE_ID=%s\n' "$BUNDLE_ID"
  # The key is multi-line; the env file wants it as one quoted value with
  # escaped newlines, which is also the shape the function's `pkcs8()` and
  # WebCrypto expect back.
  printf 'APNS_PRIVATE_KEY="'
  awk '{ printf "%s\\n", $0 }' "$KEY_FILE"
  printf '"\n'
} > "$ENV_FILE"

echo "Setting APNS_KEY_ID=$KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID and APNS_PRIVATE_KEY on $PROJECT_REF…"
supabase secrets set --project-ref "$PROJECT_REF" --env-file "$ENV_FILE"

echo
echo "Now in place (values are never shown back by Supabase):"
supabase secrets list --project-ref "$PROJECT_REF" | grep -E 'NAME|APNS|WEBHOOK' || true

cat <<'NEXT'

Still to do, once these are set:
  supabase functions deploy push-notify --no-verify-jwt
  …then the "messages-to-push" trigger in docs/ios-push-notifications.md
NEXT
