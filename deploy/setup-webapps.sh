#!/usr/bin/env bash
# One-time setup so releases publish the subdomains of Codeqlick's web apps by themselves
# (deploy/README.md, "Web app subdomains"). Run it from /srv/codeqlick as a user with sudo:
#
#   sudo ./deploy/setup-webapps.sh
#
#   1. Installs deploy/webapp-site.sh as root at /usr/local/sbin/codeqlick-webapp-site.
#   2. Lets the checkout's owner (the deploy user, cqadmin) run that file, and only that file,
#      with sudo and no password (/etc/sudoers.d/codeqlick-webapps, checked with visudo).
#   3. Publishes every app in WEBAPPS that still has no certificate.
# Run it again after changing deploy/webapp-site.sh: the installed copy is root's.
set -Eeuo pipefail
trap 'printf "\nError: the step on line %s failed\n" "$LINENO" >&2' ERR

cd "$(dirname "$0")/.."
[ "$(id -u)" -eq 0 ] || exec sudo "$0" "$@"
OWNER="$(stat -c %U .)"
HELPER=/usr/local/sbin/codeqlick-webapp-site
RULE=/etc/sudoers.d/codeqlick-webapps

log() { printf '\n==> %s\n' "$*"; }

log "Helper: $HELPER"
install -o root -g root -m 0755 deploy/webapp-site.sh "$HELPER"
echo "Installed."

log "Sudo rule for $OWNER: $RULE"
tmp="$(mktemp)"
printf '%s ALL=(root) NOPASSWD: %s\n' "$OWNER" "$HELPER" >"$tmp"
visudo -cf "$tmp" >/dev/null
install -o root -g root -m 0440 "$tmp" "$RULE"
rm -f "$tmp"
echo "$OWNER may run $HELPER with sudo."

log "Apps"
status=0
for app in $(./deploy/webapps.sh); do
  "$HELPER" "$app" || status=1
done
[ "$status" -eq 0 ] || { echo; echo "Some apps aren't published yet (above). Run this again in a few minutes."; exit 1; }
echo
echo "Done. From now on a release publishes the subdomain of any new app in WEBAPPS."
