#!/bin/bash
# Generate Resources/supabase.json from the web app's .env.local.
#
# Both values are the public project URL and publishable/anon key — the
# same pair already shipped in the web bundle — so they are safe in a
# client. Row level security is what protects the data, not the secrecy
# of this key. The file is gitignored anyway, so the project stays
# portable and no credential is committed here.
set -euo pipefail
cd "$(dirname "$0")"
ENV_FILE="${1:-../.env.local}"

[ -f "$ENV_FILE" ] || { echo "no env file at $ENV_FILE"; exit 1; }

get() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'"' \r'; }
URL=$(get NEXT_PUBLIC_SUPABASE_URL)
KEY=$(get NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
[ -n "$KEY" ] || KEY=$(get NEXT_PUBLIC_SUPABASE_ANON_KEY)
[ -n "$URL" ] && [ -n "$KEY" ] || { echo "URL or key missing from $ENV_FILE"; exit 1; }

mkdir -p Resources
printf '{\n  "url": "%s",\n  "anonKey": "%s"\n}\n' "$URL" "$KEY" > Resources/supabase.json
echo "wrote Resources/supabase.json  (host: $(echo "$URL" | sed -E 's#https?://([^.]+).*#\1#'))"
