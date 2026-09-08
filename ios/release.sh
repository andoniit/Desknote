#!/bin/bash
# Archive and export a TestFlight-ready DeskNote.ipa.
#
#   ./release.sh                  # archive + export to build/export/DeskNote.ipa
#   ./release.sh --upload         # ...and send it to TestFlight
#   BUILD_NUMBER=2 ./release.sh   # override the build number for this run
#
# App Store Connect rejects any build whose CURRENT_PROJECT_VERSION it has
# already seen, so every upload needs a fresh one: bump it in project.yml or
# pass BUILD_NUMBER. MARKETING_VERSION ("1.0") may stay put across builds.
#
# --upload needs an App Store Connect API key, which keeps the Apple ID
# password out of this entirely. Create one under App Store Connect >
# Users and Access > Integrations, save the .p8 into
# ~/.appstoreconnect/private_keys/, then export ASC_KEY_ID and ASC_ISSUER_ID.
set -euo pipefail
cd "$(dirname "$0")"

[ -f Resources/supabase.json ] || { echo "run ./configure.sh first"; exit 1; }

UPLOAD=no
[ "${1:-}" = "--upload" ] && UPLOAD=yes

ARCHIVE=build/DeskNote.xcarchive
EXPORT=build/export
IPA="$EXPORT/DeskNote.ipa"

xcodegen generate >/dev/null
rm -rf "$ARCHIVE" "$EXPORT"

# -allowProvisioningUpdates lets Xcode mint the Apple Distribution cert and
# the store profiles for the app and the widget on first run.
OVERRIDE=()
[ -n "${BUILD_NUMBER:-}" ] && OVERRIDE+=("CURRENT_PROJECT_VERSION=$BUILD_NUMBER")

xcodebuild -project DeskNote.xcodeproj -scheme DeskNote \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" -allowProvisioningUpdates ${OVERRIDE[@]+"${OVERRIDE[@]}"} archive \
  | grep -E 'error:|ARCHIVE SUCCEEDED|ARCHIVE FAILED'

xcodebuild -exportArchive -archivePath "$ARCHIVE" \
  -exportOptionsPlist ExportOptions.plist -exportPath "$EXPORT" \
  -allowProvisioningUpdates \
  | grep -E 'error:|EXPORT SUCCEEDED|EXPORT FAILED'

echo "built $IPA"

if [ "$UPLOAD" = yes ]; then
  : "${ASC_KEY_ID:?set ASC_KEY_ID (App Store Connect API key id)}"
  : "${ASC_ISSUER_ID:?set ASC_ISSUER_ID (App Store Connect issuer id)}"
  xcrun altool --upload-app -f "$IPA" -t ios \
    --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
  echo "uploaded — it appears in TestFlight after Apple finishes processing"
fi
