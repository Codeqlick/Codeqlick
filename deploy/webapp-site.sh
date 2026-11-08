#!/usr/bin/env bash
# Publishes <app>.codeqlick.com for one of Codeqlick's own web apps (architecture 6.3): the DNS
# record, the Nginx site and its Let's Encrypt certificate. Safe to run again: each step checks
# first, and it never changes a DNS record or an Nginx site that already exists.
#
#   sudo codeqlick-webapp-site <app>
#
# deploy/setup-webapps.sh installs this file as root at /usr/local/sbin/codeqlick-webapp-site, with
# a sudo rule that lets the deploy user run that file and nothing else, so deploy/deploy.sh adds the
# subdomain of a new app by itself. The installed copy is root's: editing this one in the checkout
# changes nothing until setup-webapps.sh runs again.
set -Eeuo pipefail
trap 'printf "Error: the step on line %s failed\n" "$LINENO" >&2' ERR

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

APP="${1:-}"
[[ "$APP" =~ ^[a-z][a-z0-9-]{1,30}$ ]] || fail "usage: codeqlick-webapp-site <app> (lowercase letters, digits, dashes)"
case "$APP" in
  www | api | stats | staging | mail | smtp | ftp | admin) fail "$APP is not an app name" ;;
esac
[ "$(id -u)" -eq 0 ] || fail "run it with sudo"

ROOT="${CODEQLICK_DIR:-/srv/codeqlick}"
ENV_FILE="$ROOT/.env"
ZONE=codeqlick.com
HOST="$APP.$ZONE"
AVAILABLE="/etc/nginx/sites-available/$HOST.conf"
ENABLED="/etc/nginx/sites-enabled/$HOST.conf"

# Values from .env, read as plain text (never sourced).
setting() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1; }
[ -r "$ENV_FILE" ] || fail "$ENV_FILE not found"
IP="$(setting SITES_SERVER_IP)"
WEB_PORT="$(setting WEB_PORT)"
API_PORT="$(setting API_PORT)"
WEB_PORT="${WEB_PORT:-3010}"
API_PORT="${API_PORT:-4010}"
[[ "$IP" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || fail "SITES_SERVER_IP in .env isn't an IPv4 address"
[[ "$WEB_PORT" =~ ^[0-9]{2,5}$ && "$API_PORT" =~ ^[0-9]{2,5}$ ]] || fail "WEB_PORT/API_PORT in .env aren't ports"

resolved() { getent ahostsv4 "$HOST" | awk 'NR==1 { print $1 }'; }

# --- 1. DNS -------------------------------------------------------------------------------------
OVH_AK="$(setting OVH_APPLICATION_KEY)"
OVH_AS="$(setting OVH_APPLICATION_SECRET)"
OVH_CK="$(setting OVH_CONSUMER_KEY)"
OVH_API=https://eu.api.ovh.com/1.0

# A signed OVH request: "$1$" + SHA-1 of "secret+consumer+METHOD+URL+body+timestamp".
ovh() {
  local method="$1" path="$2" body="${3:-}"
  local url="$OVH_API$path" ts sig
  ts="$(curl -fsS "$OVH_API/auth/time")"
  sig="\$1\$$(printf '%s' "$OVH_AS+$OVH_CK+$method+$url+$body+$ts" | sha1sum | cut -d' ' -f1)"
  local args=(-fsS -X "$method" "$url"
    -H "X-Ovh-Application: $OVH_AK" -H "X-Ovh-Consumer: $OVH_CK"
    -H "X-Ovh-Timestamp: $ts" -H "X-Ovh-Signature: $sig" -H 'Content-Type: application/json')
  if [ -n "$body" ]; then args+=(--data "$body"); fi
  curl "${args[@]}"
}

echo "==> $HOST: DNS"
if [ "$(resolved)" = "$IP" ]; then
  echo "Already points to $IP."
elif [ -n "$OVH_AK" ] && [ -n "$OVH_AS" ] && [ -n "$OVH_CK" ]; then
  ids="$(ovh GET "/domain/zone/$ZONE/record?fieldType=A&subDomain=$APP")"
  [ "$ids" = "[]" ] ||
    fail "$HOST already has an A record that doesn't point to $IP: fix it in OVH's manager"
  ovh POST "/domain/zone/$ZONE/record" \
    "{\"fieldType\":\"A\",\"subDomain\":\"$APP\",\"target\":\"$IP\",\"ttl\":300}" >/dev/null
  ovh POST "/domain/zone/$ZONE/refresh" >/dev/null
  echo "A record $HOST -> $IP created."
else
  fail "no OVH keys in .env: add the A record $HOST -> $IP in OVH's manager"
fi

# --- 2. Nginx -----------------------------------------------------------------------------------
echo "==> $HOST: Nginx site"
if [ -e "$AVAILABLE" ]; then
  echo "Already there."
else
  upgrade="${APP//-/_}_connection_upgrade"
  # HTTP only on purpose: certbot adds the TLS listener and the redirect.
  cat >"$AVAILABLE" <<CONF
# $HOST: one of Codeqlick's web apps (architecture 6.3), written by codeqlick-webapp-site.
# The website serves its pages; /ws is the app's WebSocket in the API (/v1/$APP/ws).

map \$http_upgrade \$$upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    listen [::]:80;
    server_name $HOST;
    http2 on;

    client_max_body_size 1m;

    location = /ws {
        proxy_pass http://127.0.0.1:$API_PORT/v1/$APP/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$$upgrade;
        proxy_set_header Host \$host;
        proxy_set_header Origin \$http_origin;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    location / {
        proxy_pass http://127.0.0.1:$WEB_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
CONF
  ln -sf "$AVAILABLE" "$ENABLED"
  if ! nginx -t 2>/dev/null; then
    rm -f "$ENABLED" "$AVAILABLE"
    nginx -t || true
    fail "Nginx rejected the new site; it has been removed"
  fi
  systemctl reload nginx
  echo "Site added."
fi
[ -e "$ENABLED" ] || ln -s "$AVAILABLE" "$ENABLED"

# --- 3. Certificate -----------------------------------------------------------------------------
echo "==> $HOST: certificate"
if [ -d "/etc/letsencrypt/live/$HOST" ]; then
  echo "Already there."
  exit 0
fi
for _ in $(seq 1 60); do
  [ "$(resolved)" = "$IP" ] && break
  sleep 10
done
[ "$(resolved)" = "$IP" ] ||
  fail "$HOST doesn't point to $IP yet: the next release tries again"
certbot --nginx -d "$HOST" --non-interactive --redirect
echo "https://$HOST is ready."
