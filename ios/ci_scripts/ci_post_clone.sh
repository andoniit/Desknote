#!/bin/sh
# Xcode Cloud looks for `ci_scripts` either at the repository root or beside
# the Xcode project, depending on how the workflow was set up. This forwards
# to the one real script so that either location works and there is only ever
# one copy to maintain.
set -e
exec "${CI_PRIMARY_REPOSITORY_PATH:?CI_PRIMARY_REPOSITORY_PATH is not set}/ci_scripts/ci_post_clone.sh"
