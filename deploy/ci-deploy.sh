#!/bin/sh
# Entry point for automatic deploys from GitHub Actions (.github/workflows/deploy.yml).
#
# The deploy key in the deploy user's ~/.ssh/authorized_keys is pinned to this script with
# `command="…"`, so whatever the client asks for, that key can only run a release. A lock keeps
# releases one at a time (two CI workflows can finish at once).
set -eu

cd "$(dirname "$0")/.."
exec flock --wait 1200 /tmp/codeqlick-deploy.lock ./deploy/deploy.sh
