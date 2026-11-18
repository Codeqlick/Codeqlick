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
#
# A production release may get settings on its standard input, `NAME=value` lines from GitHub's
# Actions secrets (deploy.yml). Only the names in SETTINGS are taken, with plain values, and they
# are written to .env before the release, so the new containers start with them.
set -eu

SETTINGS="TURNSTILE_SITE_KEY TURNSTILE_SECRET_KEY"

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
    input="$(timeout 10 cat 2>/dev/null || true)"
    printf '%s\n' "$input" | while IFS= read -r line; do
      name="${line%%=*}"
      value="${line#*=}"
      case " $SETTINGS " in *" $name "*) ;; *) continue ;; esac
      [ -n "$value" ] || continue
      if ! printf '%s' "$value" | grep -Eq '^[A-Za-z0-9._-]{1,200}$'; then
        echo "Ignoring $name: unexpected characters" >&2
        continue
      fi
      [ "$(sed -n "s/^$name=//p" .env | tail -n 1)" = "$value" ] && continue
      sed -i "/^$name=/d" .env
      printf '%s=%s\n' "$name" "$value" >>.env
      echo "$name updated from GitHub."
    done
    exec flock --wait 1200 /tmp/codeqlick-deploy.lock ./deploy/deploy.sh
    ;;
esac
