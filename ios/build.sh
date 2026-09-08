#!/bin/bash
# Build and run DeskNote on a booted simulator.
#
# Builds the TARGET rather than the scheme: XcodeGen's generated scheme
# makes Xcode report "supported platforms ... is empty" and find no
# simulator destinations, even though the simulators are there.
set -euo pipefail
cd "$(dirname "$0")"
[ -f Resources/supabase.json ] || { echo "run ./configure.sh first"; exit 1; }
UDID="${1:-$(xcrun simctl list devices -j | python3 -c "
import json,sys
for rt, ds in json.load(sys.stdin)['devices'].items():
    for d in ds:
        if d['state'] == 'Booted': print(d['udid']); break
")}"
xcodegen generate >/dev/null
xcodebuild -project DeskNote.xcodeproj -target DeskNote \
  -sdk iphonesimulator -configuration Debug -arch arm64 \
  CONFIGURATION_BUILD_DIR="$PWD/build/Products" build \
  | grep -E 'error:|BUILD SUCCEEDED|BUILD FAILED'
xcrun simctl install "$UDID" build/Products/DeskNote.app
xcrun simctl launch "$UDID" space.desknote.app
