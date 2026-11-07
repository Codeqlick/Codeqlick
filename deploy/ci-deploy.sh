#!/bin/sh
# Entry point for automatic deploys from GitHub Actions (.github/workflows/deploy.yml and
# staging.yml).
#
# The deploy key in the deploy user's ~/.ssh/authorized_keys is pinned to this script with
# `command="…"`, so whatever the client asks for, that key can only run a release. Its command
# (SSH_ORIGINAL_COMMAND) picks which one:
#
#   deploy                          release main to production
#   staging <branch> [--with-data]  put a branch on staging (/srv/codeqlick-staging)
#
# A lock per environment keeps releases one at a time (two CI workflows can finish at once).
set -eu

cd "$(dirname "$0")/.."

# Split the client's words, without expanding wildcards; staging.sh validates the branch name.
set -f
# shellcheck disable=SC2086
set -- ${SSH_ORIGINAL_COMMAND:-deploy}

case "$1" in
  staging)
    staging="${STAGING_DIR:-/srv/codeqlick-staging}"
    [ -x "$staging/deploy/staging.sh" ] || { echo "Staging is not set up in $staging" >&2; exit 1; }
    branch="${2:-main}"
    data="${3:-}"
    if [ -n "$data" ] && [ "$data" != "--with-data" ]; then
      echo "Unknown option: $data" >&2
      exit 2
    fi
    cd "$staging"
    # $data is empty or --with-data (checked above).
    exec flock --wait 1200 /tmp/codeqlick-staging.lock ./deploy/staging.sh "$branch" $data
    ;;
  *)
    exec flock --wait 1200 /tmp/codeqlick-deploy.lock ./deploy/deploy.sh
    ;;
esac
