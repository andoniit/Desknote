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

# Let this machine's own toolchain settle the graph, starting from the pins.
# Xcode Cloud resolves with automatic resolution disabled, so the file has to
# match the dependency graph exactly as *its* Swift sees it — and that can
# differ from the Mac that wrote the pins: xctest-dynamic-overlay 1.13.1 ships
# a Package@swift-6.0.swift with no dependencies and a Package.swift that pulls
# in swift-issue-reporting, and which one is read depends on the toolchain.
# Resolving here keeps every existing pin (versions only move if a pin no
# longer satisfies a requirement) and adds whatever this toolchain needs.
echo "▸ resolving package dependencies against the pins"
xcodebuild -resolvePackageDependencies -project DeskNote.xcodeproj -scheme DeskNote \
  | grep -E "error|Resolved source packages|: https" || true
if ! cmp -s Package.resolved "$SWIFTPM_DIR/Package.resolved"; then
  echo "▸ this toolchain changed the pins — refresh ios/Package.resolved from:"
  diff Package.resolved "$SWIFTPM_DIR/Package.resolved" || true
fi

echo "▸ post-clone complete"
