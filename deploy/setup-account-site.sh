#!/usr/bin/env bash
# Publishes the account site, account.codeqlick.com (architecture 6.5, decision 108): where people
# sign in, sign up and change their account, and where every other host gets its session from by
# single sign-on. Run it once from /srv/codeqlick, as a user with sudo, after pulling the release
# that brings it (deploy/README.md, "Account site"):
#
#   sudo ./deploy/setup-account-site.sh
#
#   1. Reinstalls deploy/webapp-site.sh as root's helper (/usr/local/sbin/codeqlick-webapp-site),
#      which now writes the account site without the apps' /ws, and keeps the deploy user's sudo
#      rule for it (deploy/setup-webapps.sh does both).
#   2. Runs the helper for `account`: the DNS record (through OVH's API, unless it already points
#      here), the Nginx site (checked with `nginx -t`, removed again if Nginx refuses it; an existing
#      site is never changed) and the Let's Encrypt certificate.
# Safe to run again: every step checks first. Releases also publish it by themselves
# (deploy/deploy.sh) while the site has no certificate.
set -Eeuo pipefail
trap 'printf "\nError: the step on line %s failed\n" "$LINENO" >&2' ERR

cd "$(dirname "$0")/.."
[ "$(id -u)" -eq 0 ] || exec sudo "$0" "$@"
HELPER=/usr/local/sbin/codeqlick-webapp-site
SITE=/etc/nginx/sites-available/account.codeqlick.com.conf

log() { printf '\n==> %s\n' "$*"; }

if [ -e "$SITE" ]; then
  backup="$SITE.bak-$(date +%Y%m%d%H%M%S)"
  cp -p "$SITE" "$backup"
  log "Existing site kept; a copy is in $backup"
fi

log "Helper and sudo rule"
install -o root -g root -m 0755 deploy/webapp-site.sh "$HELPER"
owner="$(stat -c %U .)"
rule=/etc/sudoers.d/codeqlick-webapps
if [ ! -e "$rule" ]; then
  tmp="$(mktemp)"
  printf '%s ALL=(root) NOPASSWD: %s\n' "$owner" "$HELPER" >"$tmp"
  visudo -cf "$tmp" >/dev/null
  install -o root -g root -m 0440 "$tmp" "$rule"
  rm -f "$tmp"
fi
echo "Installed."

log "account.codeqlick.com"
"$HELPER" account
nginx -t
echo
echo "Done: https://account.codeqlick.com serves the account site."
