#!/bin/sh
# Lets Cruising's photo and video uploads through Nginx (architecture 4.15, phase 4): adds the
# 100 MB upload route to the installed api.codeqlick.com and cruising.codeqlick.com sites, which
# certbot edited (so they can't just be copied from deploy/nginx). Every other route keeps its limit.
#
#   sudo ./deploy/add-cruising-upload-limits.sh
#
# Safe to run again: a site that already has the route is left alone. Each file is backed up next
# to itself; when `nginx -t` fails, the backups are put back and nothing is reloaded.
set -eu

API_SITE="${API_SITE:-/etc/nginx/sites-available/api.codeqlick.com.conf}"
WEB_SITE="${WEB_SITE:-/etc/nginx/sites-available/cruising.codeqlick.com.conf}"
STAMP="$(date +%Y%m%d%H%M%S)"

[ "$(id -u)" = 0 ] || { echo "Run it with sudo." >&2; exit 1; }

# The proxy_pass of the site's `location / {` block: the upload route goes to the same place.
upstream_of() {
  awk '/^[[:space:]]*location \/ \{/ { inside = 1 }
       inside && /proxy_pass/ { sub(/^[[:space:]]*proxy_pass[[:space:]]+/, ""); sub(/;.*/, ""); print; exit }' "$1"
}

# Writes the block before the first `location / {` of the file (the TLS server's).
insert_before_root() {
  file="$1"
  block="$2"
  tmp="$(mktemp)"
  BLOCK="$block" awk 'done != 1 && /^[[:space:]]*location \/ \{/ { print ENVIRON["BLOCK"]; done = 1 } { print }' \
    "$file" >"$tmp"
  cat "$tmp" >"$file"
  rm -f "$tmp"
}

changed=""
for site in "$API_SITE" "$WEB_SITE"; do
  [ -f "$site" ] || { echo "Missing $site" >&2; exit 1; }
  if grep -q 'cruising/media\|cruising/api/media' "$site"; then
    echo "$site already has the upload route."
    continue
  fi
  upstream="$(upstream_of "$site")"
  [ -n "$upstream" ] || { echo "No proxy_pass in the location / block of $site" >&2; exit 1; }
  cp -p "$site" "$site.bak-$STAMP"
  if [ "$site" = "$API_SITE" ]; then
    insert_before_root "$site" "    # Cruising's photo and video uploads (phase 4): up to 100 MB, streamed to the API.
    location = /v1/cruising/media {
        client_max_body_size 101m;
        proxy_request_buffering off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_pass $upstream;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
"
  else
    insert_before_root "$site" "    # Cruising's photo and video uploads (phase 4): up to 100 MB, streamed to the website.
    location ~ ^/(en|es)/cruising/api/media\$ {
        client_max_body_size 101m;
        proxy_request_buffering off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_pass $upstream;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
"
  fi
  changed="$changed $site"
  echo "Added the upload route to $site (backup: $site.bak-$STAMP)."
done

[ -n "$changed" ] || { echo "Nothing to change."; exit 0; }

if nginx -t; then
  systemctl reload nginx
  echo "Nginx reloaded: Cruising uploads up to 100 MB work now."
else
  for site in $changed; do mv "$site.bak-$STAMP" "$site"; done
  echo "nginx -t failed: the sites were restored and nothing was reloaded." >&2
  exit 1
fi
