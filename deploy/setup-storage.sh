#!/usr/bin/env bash
# Publishes Codeqlick Cloud's object storage at https://s3.<hosting domain> (architecture 4.13
# "Object storage", decision 48): installs the Nginx site in front of Garage (the cloud-storage
# service, which listens on 127.0.0.1:3900) and reloads Nginx. Idempotent.
# Usage: sudo ./deploy/setup-storage.sh [hosting domain, default CLOUD_HOSTING_DOMAIN in .env]
set -Eeuo pipefail
trap 'printf "\nError: the step on line %s failed\n" "$LINENO" >&2' ERR

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

cd "$(dirname "$0")/.."
[ "$(id -u)" -eq 0 ] || exec sudo "$0" "$@"

setting() { sed -n "s/^$1=//p" .env | tail -n 1; }
DOMAIN="${1:-$(setting CLOUD_HOSTING_DOMAIN)}"
[[ "$DOMAIN" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$ ]] ||
  fail "usage: sudo ./deploy/setup-storage.sh <hosting domain>"
[ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ] ||
  fail "no certificate for $DOMAIN: run deploy/setup-cloud.sh first"

SITE=/etc/nginx/sites-available/cloud-storage.conf
sed "s/__DOMAIN__/$DOMAIN/g" deploy/nginx/cloud-storage.conf.template >"$SITE"
ln -sf "$SITE" /etc/nginx/sites-enabled/cloud-storage.conf
nginx -t
systemctl reload nginx
echo "https://s3.$DOMAIN -> Garage (127.0.0.1:3900)."
