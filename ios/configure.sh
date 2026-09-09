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

# A checkout on a build machine has no .env.local — Xcode Cloud passes the
# same two values as workflow environment variables instead. Same names, so
# the fallback is only about where they are read from.
if [ -f "$ENV_FILE" ]; then
  SOURCE="$ENV_FILE"
  get() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'"' \r'; }
else
  SOURCE="the environment"
  get() { printenv "$1" || true; }
fi

URL=$(get NEXT_PUBLIC_SUPABASE_URL)
KEY=$(get NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
[ -n "$KEY" ] || KEY=$(get NEXT_PUBLIC_SUPABASE_ANON_KEY)
[ -n "$URL" ] && [ -n "$KEY" ] || { echo "URL or key missing from $SOURCE"; exit 1; }

mkdir -p Resources
printf '{\n  "url": "%s",\n  "anonKey": "%s"\n}\n' "$URL" "$KEY" > Resources/supabase.json
echo "wrote Resources/supabase.json  (host: $(echo "$URL" | sed -E 's#https?://([^.]+).*#\1#'))"
