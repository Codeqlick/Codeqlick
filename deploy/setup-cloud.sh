#!/usr/bin/env bash
# One-time setup of Codeqlick Cloud's hosting (architecture 8.3, deploy/README.md "Codeqlick
# Cloud"). Run it from /srv/codeqlick as a user with sudo, once the hosting domain is registered
# at OVH with the team's account:
#
#   sudo ./deploy/setup-cloud.sh codeqlick.app
#
#   1. DNS: `@` and `*` A records to SITES_SERVER_IP through OVH's API (OVH's parking records for
#      @ and www are pointed here too); MX, TXT and the rest are never touched.
#   2. The folders in /srv/codeqlick/cloud and its pages, owned by the API container's user
#      (node, 1000:1000), which writes the deployments; Nginx only reads them.
#   3. A wildcard certificate (<domain> and *.<domain>) through the DNS challenge with OVH's API
#      (certbot-dns-ovh; its credentials from .env in /etc/letsencrypt/ovh-cloud.ini, 600).
#   4. The Nginx site from deploy/nginx/cloud-hosting.conf.template, checked and reloaded.
#   5. CLOUD_HOSTING_DOMAIN in .env; the next release (or `docker compose up -d api`) uses it.
# Safe to run again. Reinstall cq-site afterwards if it is older than its `cloud` kind (README).
set -Eeuo pipefail
trap 'printf "\nError: the step on line %s failed\n" "$LINENO" >&2' ERR

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}
log() { printf '\n==> %s\n' "$*"; }

cd "$(dirname "$0")/.."
[ "$(id -u)" -eq 0 ] || exec sudo "$0" "$@"

DOMAIN="${1:-}"
[[ ${#DOMAIN} -le 253 && "$DOMAIN" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$ ]] ||
  fail "usage: sudo ./deploy/setup-cloud.sh <hosting domain>, e.g. codeqlick.app"
case "$DOMAIN" in
  codeqlick.com | *.codeqlick.com) fail "the hosting domain must not be codeqlick.com (decision 33)" ;;
esac

ROOT="$(pwd)"
OWNER="$(stat -c %U .)"
ENV_FILE="$ROOT/.env"
CLOUD="$ROOT/cloud"
SITE=/etc/nginx/sites-available/cloud-hosting.conf
CREDENTIALS=/etc/letsencrypt/ovh-cloud.ini

setting() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1; }
[ -r "$ENV_FILE" ] || fail "$ENV_FILE not found"
IP="$(setting SITES_SERVER_IP)"
OVH_AK="$(setting OVH_APPLICATION_KEY)"
OVH_AS="$(setting OVH_APPLICATION_SECRET)"
OVH_CK="$(setting OVH_CONSUMER_KEY)"
[[ "$IP" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || fail "SITES_SERVER_IP in .env isn't an IPv4 address"
[ -n "$OVH_AK" ] && [ -n "$OVH_AS" ] && [ -n "$OVH_CK" ] ||
  fail "OVH's keys aren't in .env (they need GET/POST/PUT/DELETE /domain/zone/*)"
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

# --- 1. DNS -------------------------------------------------------------------------------------
log "DNS: $DOMAIN and *.$DOMAIN -> $IP"
ovh GET "/domain/zone/$DOMAIN" >/dev/null || fail "OVH has no DNS zone $DOMAIN for these keys"
changed=0
# `www` too: a newly bought domain's parking records (@ and www) are replaced by the server's IP.
for sub in "" "*" "www"; do
  query="fieldType=A&subDomain=$(printf '%s' "$sub" | sed 's/\*/%2A/')"
  ids="$(ovh GET "/domain/zone/$DOMAIN/record?$query" | tr -d '[] ')"
  if [ -z "$ids" ]; then
    [ "$sub" = "www" ] && continue # the wildcard covers it
    ovh POST "/domain/zone/$DOMAIN/record" \
      "{\"fieldType\":\"A\",\"subDomain\":\"$sub\",\"target\":\"$IP\",\"ttl\":300}" >/dev/null
    changed=1
    echo "A ${sub:-@} -> $IP created."
  else
    for id in ${ids//,/ }; do
      target="$(ovh GET "/domain/zone/$DOMAIN/record/$id" | sed -n 's/.*"target":"\([^"]*\)".*/\1/p')"
      if [ "$target" = "$IP" ]; then
        echo "A ${sub:-@} already points to $IP."
      else
        ovh PUT "/domain/zone/$DOMAIN/record/$id" "{\"target\":\"$IP\",\"ttl\":300}" >/dev/null
        changed=1
        echo "A ${sub:-@}: $target -> $IP."
      fi
    done
  fi
done
[ "$changed" -eq 0 ] || ovh POST "/domain/zone/$DOMAIN/refresh" >/dev/null

# --- 2. Folders and pages -----------------------------------------------------------------------
log "Folders: $CLOUD"
API_USER=1000:1000
install -d -o "${API_USER%:*}" -g "${API_USER#*:}" -m 0755 "$CLOUD" "$CLOUD/deployments" "$CLOUD/hosts" "$CLOUD/domains" "$CLOUD/pages"
cp -R deploy/cloud/pages/. "$CLOUD/pages/"
chown -R "$API_USER" "$CLOUD/pages"
echo "Ready."

# --- 3. Wildcard certificate --------------------------------------------------------------------
log "Certificate for $DOMAIN and *.$DOMAIN"
if ! python3 -c 'import certbot_dns_ovh' 2>/dev/null; then
  apt-get install -y python3-certbot-dns-ovh >/dev/null
fi
umask 077
cat >"$CREDENTIALS" <<EOF
dns_ovh_endpoint = ovh-eu
dns_ovh_application_key = $OVH_AK
dns_ovh_application_secret = $OVH_AS
dns_ovh_consumer_key = $OVH_CK
EOF
chmod 600 "$CREDENTIALS"
umask 022
certbot certonly --non-interactive --agree-tos --keep-until-expiring \
  --register-unsafely-without-email \
  --dns-ovh --dns-ovh-credentials "$CREDENTIALS" --dns-ovh-propagation-seconds 60 \
  --cert-name "$DOMAIN" -d "$DOMAIN" -d "*.$DOMAIN" >/dev/null
echo "Certificate: /etc/letsencrypt/live/$DOMAIN/"

# --- 4. Nginx -----------------------------------------------------------------------------------
log "Nginx site: $SITE"
regex="$(printf '%s' "$DOMAIN" | sed 's/\./\\\\./g')"
sed -e "s/__DOMAIN_RE__/$regex/g" -e "s/__DOMAIN__/$DOMAIN/g" -e "s|/srv/codeqlick|$ROOT|g" \
  deploy/nginx/cloud-hosting.conf.template >"$SITE.new"
[ -f "$SITE" ] && cp "$SITE" "$SITE.bak"
mv "$SITE.new" "$SITE"
ln -sfn "$SITE" /etc/nginx/sites-enabled/cloud-hosting.conf
if ! nginx -t -q; then
  if [ -f "$SITE.bak" ]; then mv "$SITE.bak" "$SITE"; else rm -f "$SITE" /etc/nginx/sites-enabled/cloud-hosting.conf; fi
  fail "Nginx rejected the site; nothing changed"
fi
rm -f "$SITE.bak"
systemctl reload nginx
echo "Serving *.$DOMAIN."

# The API's site (copied once from deploy/nginx/, then changed by certbot) needs the larger body
# size for deployments: the same location block is added before each `location / {`.
API_SITE=/etc/nginx/sites-available/api.codeqlick.com.conf
if [ -f "$API_SITE" ] && ! grep -q 'v1/cloud/projects' "$API_SITE"; then
  log "API site: uploads of up to 50 MB for deployments"
  API_PORT="$(setting API_PORT)"
  API_PORT="${API_PORT:-4010}"
  cp "$API_SITE" "$API_SITE.bak"
  awk -v port="$API_PORT" '
    /^[[:space:]]*location \/ \{/ {
      print "    location ~ ^/v1/cloud/projects/[^/]+/deployments$ {"
      print "        client_max_body_size 55m;"
      print "        proxy_request_buffering off;"
      print "        proxy_read_timeout 300s;"
      print "        proxy_pass http://127.0.0.1:" port ";"
      print "        proxy_http_version 1.1;"
      print "        proxy_set_header Host $host;"
      print "        proxy_set_header X-Forwarded-Proto $scheme;"
      print "        proxy_set_header X-Real-IP $remote_addr;"
      print "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
      print "    }"
      print ""
    }
    { print }
  ' "$API_SITE.bak" >"$API_SITE"
  if nginx -t -q; then
    rm -f "$API_SITE.bak"
    systemctl reload nginx
    echo "Done."
  else
    mv "$API_SITE.bak" "$API_SITE"
    echo "Warning: Nginx rejected the change; add the block from deploy/nginx/api.codeqlick.com.conf by hand."
  fi
fi

# --- 5. .env ------------------------------------------------------------------------------------
log ".env"
sed -i '/^CLOUD_HOSTING_DOMAIN=/d' "$ENV_FILE"
echo "CLOUD_HOSTING_DOMAIN=$DOMAIN" >>"$ENV_FILE"
echo "CLOUD_HOSTING_DOMAIN=$DOMAIN saved. Recreate the API to use it:"
echo "  sudo -u $OWNER docker compose -f docker-compose.prod.yml up -d api"
