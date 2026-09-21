#!/bin/sh
# Xcode Cloud: rebuild the two files that are generated rather than committed.
#
# `ios/DeskNote.xcodeproj` comes from XcodeGen and `ios/Resources/supabase.json`
# from `configure.sh`. Both are gitignored — the project so that `project.yml`
# stays the only place targets are described, the JSON because it is written
# from `.env.local`. A fresh clone therefore has neither, and the build stops
# at "Project DeskNote.xcodeproj does not exist at ios/DeskNote.xcodeproj"
# before it compiles a line.
#
# Two workflow environment variables are required (App Store Connect →
# Xcode Cloud → your workflow → Environment):
#
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
#
# They are the same publishable pair the web bundle already ships to every
# visitor, so they do not need to be marked secret — row level security is
# what guards the data, not the secrecy of this key.
set -e

echo "▸ installing XcodeGen"
brew install xcodegen

cd "${CI_PRIMARY_REPOSITORY_PATH:?CI_PRIMARY_REPOSITORY_PATH is not set}/ios"

echo "▸ writing Resources/supabase.json"
./configure.sh

echo "▸ generating DeskNote.xcodeproj"
xcodegen generate

# Xcode Cloud resolves packages with automatic resolution turned off, so it
# needs a Package.resolved and will not create one. That file normally lives
# inside the .xcodeproj, which is gitignored — and git cannot track a file
# under an ignored directory — so the pinned copy is kept beside the project
# and put into place here. Refresh it with the command in ios/README.md when
# a dependency version changes.
echo "▸ pinning package dependencies"
SWIFTPM_DIR="DeskNote.xcodeproj/project.xcworkspace/xcshareddata/swiftpm"
mkdir -p "$SWIFTPM_DIR"
cp Package.resolved "$SWIFTPM_DIR/Package.resolved"

# ios/Package.resolved pins the graph for BOTH sides of a manifest split:
# xctest-dynamic-overlay 1.13.1 has a Package.swift marked swift-tools 6.4
# that depends on swift-issue-reporting (and, through it, swift-docc-plugin
# and swift-docc-symbolkit), and a Package@swift-6.0.swift fallback with no
# dependencies. Swift 6.4+ (Xcode Cloud) reads the first, older Swift (a Mac
# on Xcode 26.6) the second. A locked-down resolve on the older toolchain
# ignores the extra three pins; the newer one needs them.
#
# Resolving here as well prints a diff if this toolchain ever wants pins the
# file lacks, which is how to find the next split like that one.
echo "▸ resolving package dependencies against the pins"
xcodebuild -resolvePackageDependencies -project DeskNote.xcodeproj -scheme DeskNote \
  | grep -E "error|Resolved source packages|: https" || true
if ! cmp -s Package.resolved "$SWIFTPM_DIR/Package.resolved"; then
  echo "▸ this toolchain changed the pins — refresh ios/Package.resolved from:"
  diff Package.resolved "$SWIFTPM_DIR/Package.resolved" || true
fi

echo "▸ post-clone complete"
